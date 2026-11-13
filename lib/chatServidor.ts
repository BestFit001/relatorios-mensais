// Chat interno PRIVADO — lado do servidor. Tudo passa por aqui (as tabelas chat_* são fechadas para o navegador):
// 1) quem é a pessoa: e-mail + senha do chat -> token assinado (HMAC) com validade de 30 dias;
// 2) se ela participa da conversa: conferido em TODA leitura e gravação;
// 3) mensagens, imagens (bucket privado, links temporários), grupos, cartões (tarefa, notificação, produto) e limpeza de 7 dias.
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServidor } from "./concorrentes/servidor";
import { normalizarSkuPai } from "./skuPai";
import { encurtarUrls } from "./chat";
import { extrairUrls, montarCartaoLink } from "./linkPreview";
import { canalTemCadastro, normalizarNomeCanal } from "./vendasCanaisLogica";

export const SALA_GERAL_ID = "00000000-0000-4000-8000-000000000001";
const BUCKET = "chat-anexos";
const DIAS = 7;
const MAX_TEXTO = 2000;
const MIMES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

class ErroChat extends Error { constructor(public status: number, msg: string) { super(msg); } }
const erro = (status: number, msg: string): never => { throw new ErroChat(status, msg); };

const limpoEmail = (v: any) => String(v ?? "").trim().toLowerCase();
const corteISO = () => new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString();
const texto = (v: any, max: number) => String(v ?? "").replace(/\u0000/g, "").trim().slice(0, max);

// ---------------------------------------------------------------- identidade
const segredo = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || "") + "|chat-v1";

export function criarToken(email: string, dias = 30): string {
  const corpo = Buffer.from(JSON.stringify({ e: email, x: Date.now() + dias * 24 * 60 * 60 * 1000 })).toString("base64url");
  return `${corpo}.${createHmac("sha256", segredo()).update(corpo).digest("base64url")}`;
}

export function lerToken(token: string | null | undefined): string | null {
  if (!token || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const [corpo, ass] = token.split(".");
  if (!corpo || !ass) return null;
  const esperado = createHmac("sha256", segredo()).update(corpo).digest("base64url");
  const a = Buffer.from(ass), b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
    return d && d.e && d.x > Date.now() ? String(d.e) : null;
  } catch { return null; }
}

const hashPin = (pin: string, salt: string) => scryptSync(pin, salt, 32).toString("hex");

async function usuarioDoApp(sb: SupabaseClient, email: string): Promise<{ email: string; perfil: string } | null> {
  const { data } = await sb.from("usuarios_permissoes").select("email, perfil").eq("email", email).limit(1);
  const u = (data as any[] | null)?.[0];
  return u ? { email: limpoEmail(u.email), perfil: String(u.perfil || "") } : null;
}

async function todosUsuarios(sb: SupabaseClient): Promise<string[]> {
  const { data } = await sb.from("usuarios_permissoes").select("email");
  return Array.from(new Set(((data as any[]) || []).map((u) => limpoEmail(u.email)).filter(Boolean))).sort();
}

const validarPin = (pin: any): string => {
  const p = String(pin ?? "");
  if (p.length < 4 || p.length > 40) erro(400, "A senha do chat precisa ter de 4 a 40 caracteres.");
  return p;
};

async function criarPin(sb: SupabaseClient, d: any) {
  const email = limpoEmail(d.email), pin = validarPin(d.pin);
  if (!(await usuarioDoApp(sb, email))) erro(404, "E-mail não encontrado no sistema.");
  const { data: ja } = await sb.from("chat_usuarios").select("email").eq("email", email).limit(1);
  if ((ja as any[])?.length) erro(409, "Este usuário já tem senha do chat. Use “Entrar” (ou peça ao administrador para redefinir).");
  const salt = randomBytes(16).toString("hex");
  const { error } = await sb.from("chat_usuarios").insert({ email, pin_salt: salt, pin_hash: hashPin(pin, salt) });
  if (error) erro(500, "Não consegui salvar a senha: " + error.message);
  return { token: criarToken(email), email };
}

async function entrar(sb: SupabaseClient, d: any) {
  const email = limpoEmail(d.email), pin = String(d.pin ?? "");
  const { data } = await sb.from("chat_usuarios").select("*").eq("email", email).limit(1);
  const u = (data as any[] | null)?.[0];
  if (!u) erro(404, "sem_senha");
  if (u.bloqueado_ate && new Date(u.bloqueado_ate).getTime() > Date.now()) erro(429, "Muitas tentativas erradas. Tente de novo em alguns minutos.");
  const certo = Buffer.from(hashPin(pin, u.pin_salt)), tentado = Buffer.from(u.pin_hash);
  if (certo.length !== tentado.length || !timingSafeEqual(certo, tentado)) {
    const t = (Number(u.tentativas) || 0) + 1;
    await sb.from("chat_usuarios").update(t >= 5 ? { tentativas: 0, bloqueado_ate: new Date(Date.now() + 10 * 60 * 1000).toISOString() } : { tentativas: t }).eq("email", email);
    erro(401, t >= 5 ? "Muitas tentativas erradas. Tente de novo em 10 minutos." : "Senha do chat incorreta.");
  }
  if (u.tentativas || u.bloqueado_ate) await sb.from("chat_usuarios").update({ tentativas: 0, bloqueado_ate: null }).eq("email", email);
  return { token: criarToken(email), email };
}

// ---------------------------------------------------------------- salas
async function garantirGeral(sb: SupabaseClient, email: string) {
  await sb.from("chat_membros").upsert({ sala_id: SALA_GERAL_ID, email }, { onConflict: "sala_id,email", ignoreDuplicates: true });
}

async function papelNaSala(sb: SupabaseClient, salaId: string, email: string): Promise<string | null> {
  if (salaId === SALA_GERAL_ID) await garantirGeral(sb, email);
  const { data } = await sb.from("chat_membros").select("papel").eq("sala_id", salaId).eq("email", email).limit(1);
  return (data as any[] | null)?.[0]?.papel ?? null;
}
async function exigirMembro(sb: SupabaseClient, salaId: any, email: string): Promise<string> {
  const id = String(salaId || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) erro(400, "Conversa inválida.");
  if (!(await papelNaSala(sb, id, email))) erro(403, "Você não participa desta conversa.");
  return id;
}

const resumoDoTipo = (m: any): string =>
  m.payload?.excluida ? "🚫 Mensagem excluída" : m.tipo === "produto" && m.payload?.tipo === "link" ? `🔗 ${m.payload.titulo || m.payload.site || "Link"}` : m.tipo === "imagem" ? "📷 Foto" : m.tipo === "produto" ? `🔎 ${m.payload?.produto || m.payload?.sku || "Produto"}` : m.tipo === "tarefa" ? "📝 Tarefa" : m.tipo === "notificacao" ? "🔔 Notificação" : encurtarUrls(String(m.texto || "")).slice(0, 80);

async function listarSalas(sb: SupabaseClient, email: string) {
  await garantirGeral(sb, email);
  const { data: mem } = await sb.from("chat_membros").select("sala_id, lido_ate, papel").eq("email", email);
  const meus = (mem as any[]) || [];
  const ids = meus.map((m) => m.sala_id);
  const [{ data: salas }, { data: msgs }, { data: membros }, usuarios, u] = await Promise.all([
    ids.length ? sb.from("chat_salas").select("*").in("id", ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? sb.from("chat_mensagens").select("sala_id, de_email, tipo, texto, payload, criado_em").in("sala_id", ids).gt("criado_em", corteISO()).order("criado_em", { ascending: false }).limit(3000) : Promise.resolve({ data: [] as any[] }),
    ids.length ? sb.from("chat_membros").select("sala_id, email, papel").in("sala_id", ids.filter((i) => i !== SALA_GERAL_ID)) : Promise.resolve({ data: [] as any[] }),
    todosUsuarios(sb),
    usuarioDoApp(sb, email),
  ]);
  const lido = new Map(meus.map((m) => [m.sala_id, new Date(m.lido_ate).getTime()]));
  const porSala = new Map<string, any[]>();
  ((msgs as any[]) || []).forEach((m) => { const l = porSala.get(m.sala_id); if (l) l.push(m); else porSala.set(m.sala_id, [m]); });
  const lista = ((salas as any[]) || []).map((s) => {
    const ms = porSala.get(s.id) || [];   // mais novas primeiro
    const ultima = ms[0];
    return {
      id: s.id, tipo: s.tipo, nome: s.nome, criado_em: s.criado_em,
      membros: ((membros as any[]) || []).filter((x) => x.sala_id === s.id).map((x) => ({ email: x.email, papel: x.papel })),
      nao_lidas: ms.filter((m) => m.de_email !== email && new Date(m.criado_em).getTime() > (lido.get(s.id) || 0)).length,
      ultima: ultima ? { texto: resumoDoTipo(ultima), de: ultima.de_email, em: ultima.criado_em } : null,
      ordem: ultima ? ultima.criado_em : s.criado_em,
    };
  }).sort((a, b) => String(b.ordem).localeCompare(String(a.ordem)));
  return { salas: lista, usuarios, sou_admin: u?.perfil === "admin" };
}

async function criarDm(sb: SupabaseClient, email: string, d: any) {
  const com = limpoEmail(d.com);
  if (!com || com === email) erro(400, "Escolha outra pessoa.");
  if (!(await usuarioDoApp(sb, com))) erro(404, "Usuário não encontrado.");
  const chave = [email, com].sort().join("|");
  const achar = async () => ((await sb.from("chat_salas").select("id").eq("dm_chave", chave).limit(1)).data as any[] | null)?.[0]?.id as string | undefined;
  let id = await achar();
  if (!id) {
    await sb.from("chat_salas").insert({ tipo: "dm", dm_chave: chave, criado_por: email });
    id = await achar();
  }
  if (!id) erro(500, "Não consegui abrir a conversa.");
  await sb.from("chat_membros").upsert([{ sala_id: id, email }, { sala_id: id, email: com }], { onConflict: "sala_id,email", ignoreDuplicates: true });
  return { sala_id: id };
}

async function criarGrupo(sb: SupabaseClient, email: string, d: any) {
  const nome = texto(d.nome, 40);
  if (!nome) erro(400, "Dê um nome ao grupo.");
  const validos = new Set(await todosUsuarios(sb));
  const membros = Array.from(new Set((Array.isArray(d.membros) ? d.membros : []).map(limpoEmail))).filter((m) => m && m !== email && validos.has(m as string)) as string[];
  if (membros.length === 0) erro(400, "Escolha pelo menos uma pessoa para o grupo.");
  const { data, error } = await sb.from("chat_salas").insert({ tipo: "grupo", nome, criado_por: email }).select("id").single();
  if (error || !data) return erro(500, "Não consegui criar o grupo: " + (error?.message || ""));
  const id = (data as any).id as string;
  await sb.from("chat_membros").insert([{ sala_id: id, email, papel: "admin" }, ...membros.map((m) => ({ sala_id: id, email: m, papel: "membro" }))]);
  return { sala_id: id };
}

async function editarGrupo(sb: SupabaseClient, email: string, d: any) {
  const id = await exigirMembro(sb, d.sala_id, email);
  const { data: s } = await sb.from("chat_salas").select("tipo").eq("id", id).limit(1);
  if ((s as any[])?.[0]?.tipo !== "grupo") erro(400, "Só dá para editar grupos.");
  if (d.sair) {
    await sb.from("chat_membros").delete().eq("sala_id", id).eq("email", email);
    const { data: resto } = await sb.from("chat_membros").select("email, papel, entrou_em").eq("sala_id", id).order("entrou_em", { ascending: true });
    const r = (resto as any[]) || [];
    if (r.length === 0) { await apagarSala(sb, id); return { saiu: true, apagado: true }; }
    if (!r.some((x) => x.papel === "admin")) await sb.from("chat_membros").update({ papel: "admin" }).eq("sala_id", id).eq("email", r[0].email);
    return { saiu: true };
  }
  if ((await papelNaSala(sb, id, email)) !== "admin") erro(403, "Só quem administra o grupo pode fazer isso.");
  if (d.nome !== undefined) { const nome = texto(d.nome, 40); if (!nome) erro(400, "O nome não pode ficar vazio."); await sb.from("chat_salas").update({ nome }).eq("id", id); }
  if (Array.isArray(d.adicionar) && d.adicionar.length) {
    const validos = new Set(await todosUsuarios(sb));
    const novos = Array.from(new Set(d.adicionar.map(limpoEmail))).filter((m) => m && validos.has(m as string)) as string[];
    if (novos.length) await sb.from("chat_membros").upsert(novos.map((m) => ({ sala_id: id, email: m })), { onConflict: "sala_id,email", ignoreDuplicates: true });
  }
  if (d.remover) {
    const alvo = limpoEmail(d.remover);
    if (alvo === email) erro(400, "Para você sair, use “Sair do grupo”.");
    await sb.from("chat_membros").delete().eq("sala_id", id).eq("email", alvo);
  }
  return { ok: true };
}

async function apagarSala(sb: SupabaseClient, id: string) {
  const { data } = await sb.from("chat_mensagens").select("anexo_path").eq("sala_id", id).not("anexo_path", "is", null);
  const paths = ((data as any[]) || []).map((x) => x.anexo_path);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
  await sb.from("chat_salas").delete().eq("id", id);
}

// ---------------------------------------------------------------- mensagens
async function comLinks(sb: SupabaseClient, msgs: any[]) {
  const paths = msgs.map((m) => m.anexo_path).filter(Boolean);
  const mapa = new Map<string, string>();
  if (paths.length) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 12 * 60 * 60);
    ((data as any[]) || []).forEach((x) => { if (x?.signedUrl) mapa.set(x.path, x.signedUrl); });
  }
  return msgs.map((m) => ({ id: m.id, sala_id: m.sala_id, de_email: m.de_email, tipo: m.tipo, texto: m.texto, payload: m.payload, criado_em: m.criado_em, anexo_url: m.anexo_path ? mapa.get(m.anexo_path) || null : null }));
}

async function lerMensagens(sb: SupabaseClient, email: string, d: any) {
  const id = await exigirMembro(sb, d.sala_id, email);
  const corte = corteISO();
  const depois = typeof d.depois === "string" && d.depois > corte ? d.depois : null;
  let q = sb.from("chat_mensagens").select("*").eq("sala_id", id).gt("criado_em", depois || corte);
  const { data } = depois ? await q.order("criado_em", { ascending: true }).limit(300) : await q.order("criado_em", { ascending: false }).limit(300);
  const lista = ((data as any[]) || []);
  if (!depois) lista.reverse();
  return { mensagens: await comLinks(sb, lista) };
}

async function marcarLido(sb: SupabaseClient, email: string, d: any) {
  const id = await exigirMembro(sb, d.sala_id, email);
  await sb.from("chat_membros").update({ lido_ate: new Date().toISOString() }).eq("sala_id", id).eq("email", email);
  return { ok: true };
}

async function urlDeUpload(sb: SupabaseClient, email: string, d: any) {
  const id = await exigirMembro(sb, d.sala_id, email);
  const ext = MIMES[String(d.mime || "")];
  if (!ext) erro(400, "Só imagens JPG, PNG, WEBP ou GIF.");
  const path = `${id}/${randomUUID()}.${ext}`;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return erro(500, "Não consegui preparar o envio da imagem: " + (error?.message || ""));
  return { path, token: (data as any).token };
}

const limiteTexto = (v: any, n: number) => texto(v, n);
function limparNotificacao(p: any) {
  return {
    tipo: limiteTexto(p?.tipo, 20), nivel: ["critico", "atencao", "info"].includes(p?.nivel) ? p.nivel : "info",
    titulo: limiteTexto(p?.titulo, 240), detalhe: limiteTexto(p?.detalhe, 600), canal: limiteTexto(p?.canal, 60) || null,
  };
}

const visivelParaMim = (t: any, email: string, admin: boolean) =>
  admin || limpoEmail(t.criado_por) === email || limpoEmail(t.responsavel_email) === email || ((t.responsaveis as string[] | null) || []).map(limpoEmail).includes(email);
const cartaoTarefa = (t: any) => ({
  id: t.id, titulo: limiteTexto(t.titulo, 200), descricao: limiteTexto(t.descricao, 400) || null, prioridade: t.prioridade || null,
  data_entrega: t.data_entrega || null, hora_entrega: t.hora_entrega ? String(t.hora_entrega).slice(0, 5) : null, ciclica: t.tipo === "ciclica" ? t.ciclo || "ciclica" : null,
  responsaveis: ((t.responsaveis as string[] | null)?.length ? t.responsaveis : t.responsavel_email ? [t.responsavel_email] : []).map(limpoEmail), concluida: !!t.concluida,
});

async function listarTarefas(sb: SupabaseClient, email: string) {
  const u = await usuarioDoApp(sb, email);
  const { data } = await sb.from("home_tarefas").select("id, titulo, descricao, prioridade, data_entrega, hora_entrega, responsavel_email, responsaveis, tipo, ciclo, concluida, criado_por").eq("concluida", false).order("id", { ascending: false }).limit(200);
  return { tarefas: ((data as any[]) || []).filter((t) => visivelParaMim(t, email, u?.perfil === "admin")).slice(0, 60).map(cartaoTarefa) };
}

// cartão de produto: mensagem só com o SKU (10+ caracteres) ou só com o código pai (4–5 dígitos)
async function cartaoProduto(sb: SupabaseClient, t: string): Promise<any | null> {
  const bruto = t.trim();
  const ehSku = /^[0-9a-zA-Z]{10,13}$/.test(bruto) && (bruto.match(/\d/g) || []).length >= 6;
  const ehPai = /^\d{4,5}$/.test(bruto);
  if (!ehSku && !ehPai) return null;
  const key = normalizarSkuPai(bruto);
  if (ehSku) {
    const [custo, tiny, status, mapa, cfg, excl, pai] = await Promise.all([
      sb.from("tabela_custos_skus").select("sku, produto, marca").ilike("sku", key).limit(1),
      sb.from("cadastros_base_tiny").select("sku, estoque").ilike("sku", key).limit(1),
      sb.from("status_skus_catalogo").select("status").ilike("sku", key).limit(1),
      sb.from("mapeamento_canais_skus").select("canal").ilike("sku", key).eq("presente", true),
      sb.from("config_regras_canais").select("canal"),
      sb.from("skus_para_exclusao").select("sku").eq("sku", key).limit(1),
      sb.from("sku_pai_manual").select("pai").eq("sku", key).limit(1),
    ]);
    const c = (custo.data as any[] | null)?.[0], ti = (tiny.data as any[] | null)?.[0];
    if (!c && !ti) return { tipo: "sku", sku: key, naoEncontrado: true };
    const cadastrados = Array.from(new Set(((mapa.data as any[]) || []).map((x) => String(x.canal))));
    const todos = ((cfg.data as any[]) || []).map((x) => String(x.canal)).filter(canalTemCadastro);
    const tem = new Set(cadastrados.map(normalizarNomeCanal));
    return {
      tipo: "sku", sku: String(c?.sku || ti?.sku || key), produto: limiteTexto(c?.produto, 200) || null, marca: c?.marca || null,
      estoque: ti ? Number(ti.estoque) || 0 : null, status: (status.data as any[] | null)?.[0]?.status || "Normal",
      canais: cadastrados, faltam: todos.filter((n) => !tem.has(normalizarNomeCanal(n))), exclusao: !!(excl.data as any[] | null)?.length,
      pai: String(((pai.data as any[] | null)?.[0]?.pai || key.slice(0, 5))).toUpperCase(),
    };
  }
  const [tiny, manual, custo] = await Promise.all([
    sb.from("cadastros_base_tiny").select("sku, estoque").ilike("sku", key + "%").limit(1000),
    sb.from("sku_pai_manual").select("sku").eq("pai", key).limit(1000),
    sb.from("tabela_custos_skus").select("produto, marca").ilike("sku", key + "%").limit(1),
  ]);
  const filhos = new Set<string>(((tiny.data as any[]) || []).map((x) => normalizarSkuPai(x.sku)));
  ((manual.data as any[]) || []).forEach((x) => filhos.add(normalizarSkuPai(x.sku)));
  if (filhos.size === 0) return null;
  const estoque = ((tiny.data as any[]) || []).reduce((a, x) => a + (Number(x.estoque) || 0), 0);
  const c = (custo.data as any[] | null)?.[0];
  return { tipo: "pai", pai: key.toUpperCase(), filhos: filhos.size, estoque_total: estoque, produto: limiteTexto(c?.produto, 200) || null, marca: c?.marca || null };
}

async function enviar(sb: SupabaseClient, email: string, d: any) {
  const id = await exigirMembro(sb, d.sala_id, email);
  let tipo = ["texto", "imagem", "tarefa", "notificacao"].includes(d.tipo) ? String(d.tipo) : "texto";
  let msg: string | null = limiteTexto(d.texto, MAX_TEXTO) || null;
  let payload: any = null, anexo: string | null = null;
  if (tipo === "texto") {
    if (!msg) erro(400, "Mensagem vazia.");
    const urls = extrairUrls(msg as string);
    if (urls.length) {
      // só um link na mensagem: vira o cartão; link no meio de um texto: o texto fica e os cartões aparecem embaixo
      const sobra = (msg as string).replace(urls[0], "").trim();
      const cartoes = (await Promise.all(Array.from(new Set(urls)).slice(0, 3).map((u) => montarCartaoLink(u)))).filter(Boolean);
      if (urls.length === 1 && !sobra && cartoes[0]) { tipo = "produto"; payload = cartoes[0]; msg = null; }
      else if (cartoes.length) payload = { links: cartoes };
    } else {
      const cartao = await cartaoProduto(sb, msg as string);
      if (cartao) { tipo = "produto"; payload = cartao; }
    }
  } else if (tipo === "imagem") {
    anexo = String(d.anexo_path || "");
    if (!anexo.startsWith(id + "/") || anexo.includes("..")) erro(400, "Imagem inválida.");
  } else if (tipo === "tarefa") {
    const { data } = await sb.from("home_tarefas").select("*").eq("id", d.tarefa_id).limit(1);
    const t = (data as any[] | null)?.[0];
    if (!t) erro(404, "Tarefa não encontrada.");
    const u = await usuarioDoApp(sb, email);
    if (!visivelParaMim(t, email, u?.perfil === "admin")) erro(403, "Você não tem acesso a esta tarefa.");
    payload = cartaoTarefa(t);
  } else {
    payload = limparNotificacao(d.payload);
    if (!payload.titulo) erro(400, "Notificação vazia.");
  }
  const { data, error } = await sb.from("chat_mensagens").insert({ sala_id: id, de_email: email, tipo, texto: msg, anexo_path: anexo, payload }).select("*").single();
  if (error || !data) return erro(500, "Não consegui enviar: " + (error?.message || ""));
  const agora = new Date().toISOString();
  await Promise.all([
    sb.from("chat_salas").update({ ultima_msg_em: agora }).eq("id", id),
    sb.from("chat_membros").update({ lido_ate: agora }).eq("sala_id", id).eq("email", email),
  ]);
  return { mensagem: (await comLinks(sb, [data]))[0] };
}

/** Apaga uma mensagem sua: o conteúdo some (e a imagem também) e fica no lugar "Mensagem excluída". */
async function excluirMensagem(sb: SupabaseClient, email: string, d: any) {
  const idMsg = String(d.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(idMsg)) erro(400, "Mensagem inválida.");
  const { data } = await sb.from("chat_mensagens").select("*").eq("id", idMsg).limit(1);
  const m = (data as any[] | null)?.[0];
  if (!m) erro(404, "Mensagem não encontrada.");
  await exigirMembro(sb, m.sala_id, email);
  if (limpoEmail(m.de_email) !== email) erro(403, "Só quem enviou pode excluir a mensagem.");
  if (m.payload?.excluida) return { mensagem: (await comLinks(sb, [m]))[0] };
  const nova = { tipo: "texto", texto: null, anexo_path: null, payload: { excluida: true, em: new Date().toISOString() } };
  const { error } = await sb.from("chat_mensagens").update(nova).eq("id", idMsg);
  if (error) return erro(500, "Não consegui excluir: " + error.message);
  if (m.anexo_path) await sb.storage.from(BUCKET).remove([m.anexo_path]);
  return { mensagem: (await comLinks(sb, [{ ...m, ...nova }]))[0] };
}

// ---------------------------------------------------------------- limpeza (7 dias)
let ultimaLimpeza = 0;
/** Apaga o que passou de 7 dias, inclusive os arquivos das imagens. Roda no máximo a cada 30 min (a menos que forçado). */
export async function limparExpirados(sb: SupabaseClient, forcar = false): Promise<{ imagens: number }> {
  if (!forcar && Date.now() - ultimaLimpeza < 30 * 60 * 1000) return { imagens: 0 };
  ultimaLimpeza = Date.now();
  const corte = corteISO();
  let imagens = 0;
  for (let i = 0; i < 50; i++) {
    const { data } = await sb.from("chat_mensagens").select("id, anexo_path").lt("criado_em", corte).not("anexo_path", "is", null).limit(200);
    const l = (data as any[]) || [];
    if (l.length === 0) break;
    await sb.storage.from(BUCKET).remove(l.map((x) => x.anexo_path));
    await sb.from("chat_mensagens").delete().in("id", l.map((x) => x.id));
    imagens += l.length;
    if (l.length < 200) break;
  }
  await sb.from("chat_mensagens").delete().lt("criado_em", corte);
  return { imagens };
}

// ---------------------------------------------------------------- porta de entrada
export async function tratarChat(acao: string, d: any, token: string | null): Promise<{ status: number; corpo: any }> {
  try {
    const sb = supabaseServidor();
    d = d && typeof d === "object" ? d : {};
    if (acao === "estado") {
      const email = limpoEmail(d.email);
      if (!(await usuarioDoApp(sb, email))) return { status: 404, corpo: { erro: "E-mail não encontrado no sistema." } };
      const { data } = await sb.from("chat_usuarios").select("email").eq("email", email).limit(1);
      return { status: 200, corpo: { tem_senha: !!(data as any[])?.length } };
    }
    if (acao === "criar_senha") return { status: 200, corpo: await criarPin(sb, d) };
    if (acao === "entrar") return { status: 200, corpo: await entrar(sb, d) };

    const email = lerToken(token);
    if (!email) return { status: 401, corpo: { erro: "sessao_expirada" } };
    if (!(await usuarioDoApp(sb, email))) return { status: 401, corpo: { erro: "sessao_expirada" } };
    await limparExpirados(sb).catch(() => {});

    let corpo: any;
    switch (acao) {
      case "salas": corpo = await listarSalas(sb, email); break;
      case "mensagens": corpo = await lerMensagens(sb, email, d); break;
      case "ler": corpo = await marcarLido(sb, email, d); break;
      case "enviar": corpo = await enviar(sb, email, d); break;
      case "excluir": corpo = await excluirMensagem(sb, email, d); break;
      case "upload_url": corpo = await urlDeUpload(sb, email, d); break;
      case "criar_dm": corpo = await criarDm(sb, email, d); break;
      case "criar_grupo": corpo = await criarGrupo(sb, email, d); break;
      case "grupo_editar": corpo = await editarGrupo(sb, email, d); break;
      case "tarefas": corpo = await listarTarefas(sb, email); break;
      case "resetar_senha": {
        if ((await usuarioDoApp(sb, email))?.perfil !== "admin") return { status: 403, corpo: { erro: "Só o administrador pode redefinir a senha do chat." } };
        await sb.from("chat_usuarios").delete().eq("email", limpoEmail(d.alvo));
        corpo = { ok: true };
        break;
      }
      default: return { status: 400, corpo: { erro: "Ação desconhecida." } };
    }
    return { status: 200, corpo };
  } catch (e: any) {
    if (e instanceof ErroChat) return { status: e.status, corpo: { erro: e.message } };
    return { status: 500, corpo: { erro: String(e?.message || e) } };
  }
}
