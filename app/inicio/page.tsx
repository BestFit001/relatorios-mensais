"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";
import Avatar from "../components/Avatar";
import { calcularResumoCanais, TABELAS_RESUMO, type ResumoCanal } from "../../lib/resumoCanais";
import {
  agoraSP, concluiu, statusPorResponsavel, vencimento, estaAtrasada, ehCiclica, textoCiclo,
  textoAntecedencia, hhmm, diferencaDias, DIAS_SEMANA, inicioCiclo, ocorreNoDia, addDias, diaDaSemana, type Conclusao,
} from "../../lib/tarefas";
import { compartilharNoChat } from "../../lib/chatCliente";
import { registrarPush, temAssinaturaAtiva, suportaPush } from "../../lib/push";
import { correcoesVisiveis, correcaoConcluida, podeMarcarCanal, type Correcao, type CorrecaoCanal } from "../../lib/videoCorrecoes";
import { foraDePromocao, type PromoValidade, type MarcaPromovido } from "../../lib/foraPromocao";

// ---------------------------------------------------------------------------------------------
// Tela inicial: canais de cada analista (números do Dashboard), notificações e tarefas do administrador
// ---------------------------------------------------------------------------------------------

const POR_PAGINA = 10;
const DEV_ATENCAO = 5;     // % de devolução que gera aviso (mesmo padrão da aba Full)
const DEV_CRITICO = 10;    // % a partir da qual o envio ao Full não é recomendado
const DEV_AMOSTRA_MIN = 5; // vendas mínimas para a taxa ser considerada

const norm = (v: any) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
const moeda = (v: number) => "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number) => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const dataBR = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const nomeDoEmail = (email: string) =>
  String(email || "").split("@")[0].split(/[._-]/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");

async function buscarTudo(tabela: string): Promise<any[]> {
  const todas: any[] = [];
  const passo = 1000;
  for (let de = 0; ; de += passo) {
    const { data, error } = await supabase.from(tabela).select("*").range(de, de + passo - 1);
    if (error || !data) break;
    todas.push(...data);
    if (data.length < passo) break;
  }
  return todas;
}

type Notificacao = { id: string; tipo: "full" | "devolucao" | "tarefa" | "promocao" | "correcao"; nivel: "critico" | "atencao" | "info"; titulo: string; detalhe: string; canal?: string };

export default function InicioPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<{ email: string; perfil: string } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [db, setDb] = useState<Record<string, any[]>>({});
  const [mapeamentos, setMapeamentos] = useState<any[]>([]);
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [conclusoes, setConclusoes] = useState<Conclusao[]>([]);
  const [anexos, setAnexos] = useState<any[]>([]);
  const [usuariosLista, setUsuariosLista] = useState<any[]>([]);
  const [saldoFull, setSaldoFull] = useState<any[]>([]);
  const [lancFull, setLancFull] = useState<any[]>([]);
  const [lancPropria, setLancPropria] = useState<any[]>([]);
  const [faltaMigration, setFaltaMigration] = useState(false);

  const [mesModo, setMesModo] = useState<"atual" | "anterior">("atual");
  const [analistaFiltro, setAnalistaFiltro] = useState("TODOS");
  const [painelAdmin, setPainelAdmin] = useState(false);
  // Olhinho "Ocultar informações": esconde faturamento, metas, % líquido e os cards dos canais (sobram só notificações e tarefas)
  const [ocultarInfo, setOcultarInfo] = useState(false);
  useEffect(() => { try { setOcultarInfo(localStorage.getItem("inicio_ocultar_info") === "1"); } catch { /* sem armazenamento */ } }, []);
  const alternarOcultar = () => setOcultarInfo((v) => { const n = !v; try { localStorage.setItem("inicio_ocultar_info", n ? "1" : "0"); } catch { /* ignora */ } return n; });

  // Tarefas
  const [aba, setAba] = useState<"andamento" | "concluidas" | "todos">("andamento");
  const [pagina, setPagina] = useState(1);
  const [filtroResp, setFiltroResp] = useState("TODOS");
  const [filtroNotif, setFiltroNotif] = useState<"todas" | "full" | "devolucao" | "tarefa" | "promocao" | "correcao">("todas");
  // Correções de vídeo: produtos marcados "Com problemas" na aba Vídeos, por canal (cada analista marca o(s) canal(is) dele)
  const [correcoes, setCorrecoes] = useState<Correcao[]>([]);
  const [correcoesCanais, setCorrecoesCanais] = useState<CorrecaoCanal[]>([]);
  const [erroCorrecao, setErroCorrecao] = useState("");
  // Itens fora de promoção (Mercado Livre): validade das promoções registrada ao salvar as campanhas + marcações "já promovi"
  const [validadesMl, setValidadesMl] = useState<PromoValidade[]>([]);
  const [marcasMl, setMarcasMl] = useState<(MarcaPromovido & { id?: number })[]>([]);
  const [buscaPromo, setBuscaPromo] = useState("");
  const [qtdPromoVisivel, setQtdPromoVisivel] = useState(100);
  const [verMarcados, setVerMarcados] = useState(false);
  const [erroPromo, setErroPromo] = useState("");
  const tarefaVazia = {
    titulo: "", descricao: "", prioridade: "Média",
    tipo: "prazo" as "prazo" | "ciclica",
    data_entrega: "", hora_entrega: "",
    ciclo: "diaria" as "diaria" | "semanal", ciclo_dia_semana: 1,
    responsaveis: [] as string[],
    avisoValor: "5", avisoUnidade: "1" as "1" | "60" | "1440",   // minutos / horas / dias
  };
  const [novaTarefa, setNovaTarefa] = useState(tarefaVazia);
  const [arquivosNovos, setArquivosNovos] = useState<File[]>([]);
  const [editandoId, setEditandoId] = useState<number | string | null>(null);
  const [subAbaTarefas, setSubAbaTarefas] = useState<"lista" | "calendario">("lista");
  const [mesCal, setMesCal] = useState(() => agoraSP().data.slice(0, 7));   // YYYY-MM exibido no calendário
  const [diaSel, setDiaSel] = useState<string | null>(null);                  // dia aberto (lista completa)
  const [temPush, setTemPush] = useState(false);                              // este navegador recebe alertas com o sistema fechado
  const [msgPush, setMsgPush] = useState("");
  const [salvando, setSalvando] = useState(false);
  // "Agora" renovado a cada 30 s: faz a tarefa virar "atrasada" e dispara os alertas sem precisar recarregar
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setAgora(new Date()), 30000); return () => clearInterval(i); }, []);
  const [permissaoNotif, setPermissaoNotif] = useState<"indisponivel" | "default" | "granted" | "denied">("indisponivel");
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) setPermissaoNotif(Notification.permission as any);
  }, []);

  useEffect(() => {
    const salvo = localStorage.getItem("usuario_logado");
    if (!salvo) { router.push("/login"); return; }
    try {
      const u = JSON.parse(salvo);
      setUsuario({ email: String(u.email || "").trim().toLowerCase(), perfil: String(u.perfil || "") });
    } catch { router.push("/login"); return; }
    carregarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregarPromoMl = async () => {
    const vs: any[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from("promocoes_validade_ml").select("id, conta, mlb, sku, promocao, data_inicio, data_fim").order("id").range(de, de + 999);
      if (error || !data) { if (error) setErroPromo(error.message); break; }
      vs.push(...data);
      if (data.length < 1000) break;
    }
    setValidadesMl(vs as PromoValidade[]);
    const { data: m } = await supabase.from("promocoes_ml_marcados").select("id, mlb, conta, marcado_em");
    setMarcasMl((m || []) as any[]);
  };
  useEffect(() => { carregarPromoMl(); }, []);

  const carregarCorrecoes = async () => {
    const [c, k] = await Promise.all([
      supabase.from("video_correcoes").select("*").eq("status", "aberta").order("id", { ascending: false }),
      supabase.from("video_correcoes_canais").select("*").order("id"),
    ]);
    if (c.error || k.error) { setErroCorrecao((c.error || k.error)!.message); return; }
    setErroCorrecao("");
    setCorrecoes((c.data || []) as Correcao[]);
    setCorrecoesCanais((k.data || []) as CorrecaoCanal[]);
  };
  useEffect(() => { carregarCorrecoes(); }, []);

  // Marca/desmarca "feito" em UM canal. Quando todos os canais da correção estão feitos, ela fecha e o produto volta para a aba Vídeos.
  const alternarCorrecao = async (linha: CorrecaoCanal) => {
    if (!usuario || !podeMarcarCanal(usuario, mapeamentos, linha.canal)) return;
    const feito = !linha.feito;
    const campos = { feito, feito_por: feito ? usuario.email : null, feito_em: feito ? new Date().toISOString() : null };
    const { error } = await supabase.from("video_correcoes_canais").update(campos).eq("id", linha.id);
    if (error) return alert("Erro ao atualizar a correção: " + error.message);
    const novos = correcoesCanais.map((x) => (x.id === linha.id ? { ...x, ...campos } : x));
    setCorrecoesCanais(novos);
    if (feito && correcaoConcluida(novos.filter((x) => x.correcao_id === linha.correcao_id))) {
      const { error: e2 } = await supabase.from("video_correcoes").update({ status: "concluida", concluido_em: new Date().toISOString() }).eq("id", linha.correcao_id);
      if (e2) return alert("Erro ao concluir a correção: " + e2.message);
      setCorrecoes((prev) => prev.filter((c) => c.id !== linha.correcao_id));
    }
  };

  const carregarTudo = async () => {
    setCarregando(true);
    const [tabelas, usuarios] = await Promise.all([
      Promise.all(TABELAS_RESUMO.map(async (t) => [t, await buscarTudo(t)] as const)),
      buscarTudo("usuarios_permissoes"),
    ]);
    const resultado: Record<string, any[]> = {};
    tabelas.forEach(([t, linhas]) => { resultado[t] = linhas; });
    setDb(resultado);
    setUsuariosLista(usuarios);
    await carregarHome();

    const [saldo, lf, lp] = await Promise.all([
      supabase.from("vw_fulfillment_saldo_sku").select("*"),
      supabase.from("full_lancamentos").select("canal, mes_referencia, sku, produto, qtd_vendida, taxa_devolucao, qtd_devolucoes"),
      supabase.from("vendas_padrao_lancamentos").select("canal, mes_referencia, sku, produto, qtd_vendida, taxa_devolucao, qtd_devolucoes"),
    ]);
    setSaldoFull(saldo.data || []);
    setLancFull(lf.data || []);
    setLancPropria(lp.data || []);
    setCarregando(false);
  };

  const carregarHome = async () => {
    const [m, t, c, a] = await Promise.all([
      supabase.from("home_responsaveis_canais").select("*"),
      supabase.from("home_tarefas").select("*").order("id", { ascending: false }),
      supabase.from("home_tarefas_conclusoes").select("*"),
      supabase.from("home_tarefas_anexos").select("*").order("id"),
    ]);
    if (m.error || t.error || c.error || a.error) { setFaltaMigration(true); return; }
    setFaltaMigration(false);
    setMapeamentos(m.data || []);
    // linhas antigas repetidas (uma por analista) ficam escondidas: a tarefa agora é uma só, com vários responsáveis
    setTarefas((t.data || []).filter((x: any) => !x.legado).map((x: any) => ({ ...x, responsaveis: (x.responsaveis || []).map((e: string) => String(e).trim().toLowerCase()) })));
    setConclusoes(c.data || []);
    setAnexos(a.data || []);
  };

  const isAdmin = usuario?.perfil === "admin";
  const hoje = agoraSP(agora).data;

  // ---- Mês (mesma regra do Dashboard)
  const mesIso = useMemo(() => {
    if (mesModo === "atual") return new Date().toISOString().slice(0, 7);
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  }, [mesModo]);
  const mesBarra = `${mesIso.slice(5, 7)}/${mesIso.slice(0, 4)}`;

  // ---- Resumo por canal (mesmos números do Dashboard)
  const resumo: ResumoCanal[] = useMemo(() => {
    if (!db.vendas_canais) return [];
    try { return calcularResumoCanais(db, mesIso); } catch (e) { console.error("Erro no resumo dos canais:", e); return []; }
  }, [db, mesIso]);

  // ---- Analistas disponíveis (e-mails únicos)
  const analistas = useMemo(() => {
    const mapa = new Map<string, { email: string; perfil: string }>();
    usuariosLista.forEach((u: any) => {
      const email = String(u.email || "").trim().toLowerCase();
      if (!email) return;
      const atual = mapa.get(email);
      if (!atual || (u.perfil === "admin" && atual.perfil !== "admin")) mapa.set(email, { email, perfil: String(u.perfil || "") });
    });
    return Array.from(mapa.values()).sort((a, b) => nomeDoEmail(a.email).localeCompare(nomeDoEmail(b.email)));
  }, [usuariosLista]);
  const analistasNaoAdmin = analistas.filter((a) => a.perfil !== "admin");

  const canaisDoEmail = (email: string) => new Set(mapeamentos.filter((m: any) => String(m.email).trim().toLowerCase() === email).map((m: any) => norm(m.canal)));

  const emailAlvo = isAdmin ? (analistaFiltro === "TODOS" ? "" : analistaFiltro) : (usuario?.email || "");
  const canaisVisiveis: ResumoCanal[] = useMemo(() => {
    if (!usuario) return [];
    if (isAdmin && analistaFiltro === "TODOS") return resumo;
    const meus = canaisDoEmail(emailAlvo);
    return resumo.filter((c) => meus.has(norm(c.canal)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumo, mapeamentos, usuario, isAdmin, analistaFiltro, emailAlvo]);
  const nomesVisiveis = useMemo(() => new Set(canaisVisiveis.map((c) => norm(c.canal))), [canaisVisiveis]);

  const totais = useMemo(() => {
    const fat = canaisVisiveis.reduce((a, c) => a + c.faturadoComRedutor, 0);
    const meta = canaisVisiveis.reduce((a, c) => a + c.metaValor, 0);
    const lucro = canaisVisiveis.reduce((a, c) => a + c.lucroLiquidoReal, 0);
    const bruto = canaisVisiveis.reduce((a, c) => a + c.faturadoBruto, 0);
    return { fat, meta, lucro, margem: bruto > 0 ? (lucro / bruto) * 100 : 0, progresso: meta > 0 ? (fat / meta) * 100 : 0 };
  }, [canaisVisiveis]);

  const analistasDoCanal = (canal: string) =>
    mapeamentos.filter((m: any) => norm(m.canal) === norm(canal)).map((m: any) => nomeDoEmail(m.email).split(" ")[0]);

  // ---- Tarefas
  // Cada tarefa é UMA só, com vários responsáveis; cada um tem o próprio status (por ciclo, nas cíclicas).
  const hojeInfo = agoraSP(agora);
  const hojeData = hojeInfo.data;
  const emailRef = isAdmin ? (filtroResp === "TODOS" ? "" : filtroResp) : (usuario?.email || "");

  const minhasTarefas = useMemo(() => {
    if (!usuario) return [];
    return tarefas.filter((t: any) => (emailRef ? (t.responsaveis || []).includes(emailRef) : isAdmin));
  }, [tarefas, usuario, isAdmin, emailRef]);

  // "feita": para o analista (ou admin filtrando alguém) vale o status dele; para o admin sem filtro, só quando TODOS concluíram
  const tarefaFeita = (t: any) => {
    if (emailRef) return concluiu(t, emailRef, conclusoes, hojeData);
    const st = statusPorResponsavel(t, conclusoes, hojeData);
    return st.length > 0 && st.every((s) => s.concluida);
  };

  const qtdAndamento = minhasTarefas.filter((t: any) => !tarefaFeita(t)).length;
  const qtdConcluidas = minhasTarefas.filter((t: any) => tarefaFeita(t)).length;
  const chaveVenc = (t: any) => {
    const v = vencimento(t, hojeData);
    return v.data ? `${v.data} ${v.hora || "23:59"}` : "9999-12-31 23:59";
  };
  const tarefasFiltradas = useMemo(() => {
    const base = minhasTarefas.filter((t: any) => (aba === "andamento" ? !tarefaFeita(t) : aba === "concluidas" ? tarefaFeita(t) : true));
    return base.slice().sort((a: any, b: any) => {
      const fa = tarefaFeita(a), fb = tarefaFeita(b);
      if (fa !== fb) return fa ? 1 : -1;
      return chaveVenc(a).localeCompare(chaveVenc(b)) || Number(a.id) - Number(b.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minhasTarefas, aba, conclusoes, hojeData, emailRef]);
  const totalPaginas = Math.max(1, Math.ceil(tarefasFiltradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const tarefasPagina = tarefasFiltradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  // Marca/desmarca a conclusão de UM responsável na ocorrência vigente. O analista só mexe na própria; o admin em qualquer uma.
  const alternarConclusao = async (t: any, email: string) => {
    if (!usuario || (!isAdmin && email !== usuario.email)) return;
    const ciclo = inicioCiclo(t, hojeData);
    const jaFeita = concluiu(t, email, conclusoes, hojeData);
    if (jaFeita) {
      const { error } = await supabase.from("home_tarefas_conclusoes").delete().eq("tarefa_id", t.id).eq("email", email).eq("ciclo", ciclo);
      if (error) return alert("Erro ao reabrir a tarefa: " + error.message);
      setConclusoes((prev) => prev.filter((c) => !(String(c.tarefa_id) === String(t.id) && c.email === email && String(c.ciclo).slice(0, 10) === ciclo)));
    } else {
      const nova = { tarefa_id: t.id, email, ciclo, concluida_em: new Date().toISOString(), concluida_por: usuario.email };
      const { error } = await supabase.from("home_tarefas_conclusoes").upsert(nova, { onConflict: "tarefa_id,email,ciclo" });
      if (error) return alert("Erro ao concluir a tarefa: " + error.message);
      setConclusoes((prev) => [...prev, nova]);
    }
  };

  const excluirTarefa = async (t: any) => {
    if (!confirm(`Excluir a tarefa "${t.titulo}" para ${(t.responsaveis || []).map(nomeDoEmail).join(", ")}?`)) return;
    const arquivos = anexos.filter((a: any) => String(a.tarefa_id) === String(t.id)).map((a: any) => a.caminho);
    if (arquivos.length) await supabase.storage.from("anexos").remove(arquivos);
    const { error } = await supabase.from("home_tarefas").delete().eq("id", t.id);
    if (error) return alert("Erro ao excluir: " + error.message);
    setTarefas((prev) => prev.filter((x) => x.id !== t.id));
    setAnexos((prev) => prev.filter((a: any) => String(a.tarefa_id) !== String(t.id)));
    setConclusoes((prev) => prev.filter((c) => String(c.tarefa_id) !== String(t.id)));
  };

  const alternarResponsavelNovo = (email: string) =>
    setNovaTarefa((n) => ({ ...n, responsaveis: n.responsaveis.includes(email) ? n.responsaveis.filter((e) => e !== email) : [...n.responsaveis, email] }));
  const selecionarTodosAnalistas = () => {
    const comCanais = new Set(mapeamentos.map((m: any) => String(m.email).trim().toLowerCase()));
    const alvo = analistasNaoAdmin.filter((a) => comCanais.has(a.email));
    setNovaTarefa((n) => ({ ...n, responsaveis: (alvo.length ? alvo : analistasNaoAdmin).map((a) => a.email) }));
  };

  const TIPOS_ANEXO = ".xlsx,.xls,.csv,.txt,.pdf,.doc,.docx,.png,.jpg,.jpeg";
  const LIMITE_ANEXO_MB = 10;
  const escolherArquivos = (lista: FileList | null) => {
    if (!lista) return;
    const novos: File[] = [];
    for (const f of Array.from(lista)) {
      if (f.size > LIMITE_ANEXO_MB * 1024 * 1024) { alert(`"${f.name}" passa de ${LIMITE_ANEXO_MB} MB e não foi adicionado.`); continue; }
      novos.push(f);
    }
    setArquivosNovos((prev) => [...prev, ...novos]);
  };

  const iniciarEdicao = (t: any) => {
    const m = Number(t.aviso_minutos) || 0;
    const unidade: "1" | "60" | "1440" = m > 0 && m % 1440 === 0 ? "1440" : m > 0 && m % 60 === 0 ? "60" : "1";
    setNovaTarefa({
      titulo: t.titulo || "", descricao: t.descricao || "", prioridade: t.prioridade || "Média",
      tipo: ehCiclica(t) ? "ciclica" : "prazo",
      data_entrega: t.data_entrega ? String(t.data_entrega).slice(0, 10) : "", hora_entrega: hhmm(t.hora_entrega),
      ciclo: t.ciclo === "semanal" ? "semanal" : "diaria", ciclo_dia_semana: Number.isInteger(t.ciclo_dia_semana) ? Number(t.ciclo_dia_semana) : 1,
      responsaveis: [...(t.responsaveis || [])],
      avisoValor: m > 0 ? String(m / Number(unidade)) : "", avisoUnidade: unidade,
    });
    setArquivosNovos([]);
    setEditandoId(t.id);
    setPainelAdmin(true);
    if (typeof window !== "undefined") setTimeout(() => document.querySelector("[data-form-tarefa]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const cancelarEdicao = () => { setEditandoId(null); setNovaTarefa(tarefaVazia); setArquivosNovos([]); };

  const removerAnexo = async (a: any) => {
    if (!confirm(`Remover o anexo "${a.nome}"?`)) return;
    await supabase.storage.from("anexos").remove([a.caminho]);
    const { error } = await supabase.from("home_tarefas_anexos").delete().eq("id", a.id);
    if (error) return alert("Erro ao remover o anexo: " + error.message);
    setAnexos((prev) => prev.filter((x: any) => x.id !== a.id));
  };

  const criarTarefa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const n = novaTarefa;
    const titulo = n.titulo.trim();
    if (!titulo) return;
    if (n.responsaveis.length === 0) return alert("Escolha pelo menos um responsável.");
    if (n.tipo === "prazo" && !n.data_entrega) return alert("Informe a data de entrega ou escolha “Cíclica”.");
    const avisoNum = Number(String(n.avisoValor).replace(",", "."));
    const temAviso = n.hora_entrega && n.avisoValor !== "" && avisoNum > 0;
    const aviso = temAviso ? Math.round(avisoNum * Number(n.avisoUnidade)) : null;

    setSalvando(true);
    const linha: any = {
      titulo, descricao: n.descricao.trim(), prioridade: n.prioridade, tipo: n.tipo,
      ciclo: n.tipo === "ciclica" ? n.ciclo : null,
      ciclo_dia_semana: n.tipo === "ciclica" && n.ciclo === "semanal" ? n.ciclo_dia_semana : null,
      data_entrega: n.tipo === "prazo" ? n.data_entrega : null,
      hora_entrega: n.hora_entrega || null, aviso_minutos: aviso,
      responsaveis: n.responsaveis, responsavel_email: n.responsaveis[0],
    };
    let tarefaId: number | string;
    if (editandoId !== null) {
      const { error } = await supabase.from("home_tarefas").update(linha).eq("id", editandoId);
      if (error) { setSalvando(false); return alert("Erro ao salvar a tarefa: " + error.message); }
      tarefaId = editandoId;
    } else {
      const { data: criada, error } = await supabase.from("home_tarefas").insert({ ...linha, criado_por: usuario?.email, concluida: false }).select().single();
      if (error || !criada) { setSalvando(false); return alert("Erro ao criar a tarefa (a migração 20261104170000 já foi executada?): " + (error?.message || "")); }
      tarefaId = criada.id;
    }

    // anexos: sobe cada arquivo para o bucket "anexos" (pasta tarefas/<id>/) e registra na tabela
    const falhas: string[] = [];
    for (const f of arquivosNovos) {
      const seguro = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
      const caminho = `tarefas/${tarefaId}/${Date.now()}_${seguro}`;
      const up = await supabase.storage.from("anexos").upload(caminho, f, { upsert: false, contentType: f.type || undefined });
      if (up.error) { falhas.push(`${f.name}: ${up.error.message}`); continue; }
      const { error: eAnexo } = await supabase.from("home_tarefas_anexos").insert({ tarefa_id: tarefaId, nome: f.name, caminho, tamanho: f.size, mime: f.type || null, enviado_por: usuario?.email });
      if (eAnexo) falhas.push(`${f.name}: ${eAnexo.message}`);
    }
    setSalvando(false);
    if (falhas.length) alert("A tarefa foi salva, mas houve problema com o(s) anexo(s):\n" + falhas.join("\n"));
    if (editandoId !== null) { setEditandoId(null); setNovaTarefa(tarefaVazia); }
    else setNovaTarefa({ ...tarefaVazia, responsaveis: n.responsaveis, tipo: n.tipo });
    setArquivosNovos([]);
    await carregarHome();
    setAba("andamento"); setPagina(1);
  };

  const urlAnexo = (a: any) => supabase.storage.from("anexos").getPublicUrl(a.caminho, { download: a.nome }).data.publicUrl;
  const tamanhoLegivel = (b?: number | null) => (!b ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

  // ---- Alertas no Windows
  // 1) Web Push: o servidor avisa mesmo com o sistema FECHADO (o navegador só precisa estar em execução).
  // 2) Plano B (Notification API): se o push não estiver ativo neste navegador, avisa enquanto a aba estiver aberta.
  const ativarAlertas = async () => {
    if (!("Notification" in window)) return;
    const r = await Notification.requestPermission();
    setPermissaoNotif(r as any);
    if (r !== "granted" || !usuario) return;
    const reg = await registrarPush(usuario.email);
    setTemPush(reg.ok);
    setMsgPush(reg.ok ? "Alertas ativos: você será avisado mesmo com o sistema fechado." : "Alertas ativos só com o sistema aberto. " + (reg.motivo || ""));
    if (reg.ok) await enviarTeste(); else { try { new Notification("Alertas ativados", { body: "Você será avisado enquanto o sistema estiver aberto." }); } catch { /* ignora */ } }
  };
  const enviarTeste = async () => {
    if (!usuario) return;
    try {
      const r = await fetch("/api/tarefas/alertas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ teste: usuario.email }) });
      const j = await r.json().catch(() => ({}));
      setMsgPush(r.ok && j.ok ? "Teste enviado: a notificação deve aparecer em instantes." : "Não consegui enviar o teste: " + (j.erro || r.status));
    } catch (e: any) { setMsgPush("Não consegui enviar o teste: " + (e?.message || e)); }
  };

  // Navegador que já tem permissão: garante a assinatura (renova se mudou) e descobre se o push está ativo
  useEffect(() => {
    if (!usuario || permissaoNotif !== "granted" || !suportaPush()) return;
    registrarPush(usuario.email).then(async (r) => setTemPush(r.ok || (await temAssinaturaAtiva())));
  }, [usuario, permissaoNotif]);

  // Pop-up + som + notificação do Windows ao chegar no horário de aviso: ver app/components/AlertaTarefasGlobal.tsx (vale em todas as páginas e abas)
  const testarPopup = () => window.dispatchEvent(new Event("bestfit-testar-alerta"));

  const alternarCanalDoAnalista = async (email: string, canal: string, ativo: boolean) => {
    if (!isAdmin) return;
    if (ativo) {
      const { error } = await supabase.from("home_responsaveis_canais").delete().eq("email", email).eq("canal", canal);
      if (error) return alert("Erro: " + error.message);
    } else {
      const { error } = await supabase.from("home_responsaveis_canais").insert({ email, canal });
      if (error) return alert("Erro: " + error.message);
    }
    await carregarHome();
  };

  // ---- Itens fora de promoção: promoção vencida e sem outra campanha (só das contas que o usuário enxerga)
  const foraPromo = useMemo(
    () => foraDePromocao(validadesMl.filter((v) => nomesVisiveis.has(norm(v.conta))), marcasMl, hoje),
    [validadesMl, marcasMl, nomesVisiveis, hoje],
  );
  const foraPromoFiltrado = useMemo(() => {
    const t = norm(buscaPromo);
    return t ? foraPromo.filter((i) => norm(i.mlb).includes(t) || norm(i.sku).includes(t) || norm(i.ultimaPromocao).includes(t)) : foraPromo;
  }, [foraPromo, buscaPromo]);
  const marcadosVisiveis = useMemo(() => marcasMl.filter((m) => !m.conta || nomesVisiveis.has(norm(m.conta))), [marcasMl, nomesVisiveis]);

  const marcarPromovido = async (item: { mlb: string; conta: string }) => {
    const { error } = await supabase.from("promocoes_ml_marcados").upsert({ mlb: item.mlb, conta: item.conta, marcado_em: new Date().toISOString(), marcado_por: usuario?.email || null }, { onConflict: "mlb" });
    if (error) { setErroPromo("Não consegui marcar: " + error.message); return; }
    await carregarPromoMl();
  };
  const desmarcarPromovido = async (mlb: string) => {
    const { error } = await supabase.from("promocoes_ml_marcados").delete().eq("mlb", mlb);
    if (error) { setErroPromo("Não consegui desfazer: " + error.message); return; }
    await carregarPromoMl();
  };

  // ---- Notificações
  const notificacoes: Notificacao[] = useMemo(() => {
    const lista: Notificacao[] = [];

    // Anúncios do Mercado Livre fora de promoção: um aviso-resumo (a lista por MLB fica na aba "Itens fora de promoção")
    if (foraPromo.length > 0) {
      lista.push({ id: "promo-fora", tipo: "promocao", nivel: "atencao", titulo: `${foraPromo.length} anúncio(s) do Mercado Livre fora de promoção`, detalhe: "A promoção venceu e eles não estão em outra campanha. Veja a lista na aba “Itens fora de promoção”." });
    }

    // Vídeos com problema: um aviso por produto, com os canais que ainda faltam corrigir
    correcoesVisiveis(correcoes, correcoesCanais, mapeamentos, { admin: isAdmin, email: emailAlvo }).forEach(({ correcao, canais }) => {
      const faltam = canais.filter((c) => !c.feito).map((c) => c.canal);
      if (faltam.length === 0) return;
      lista.push({ id: `correcao-${correcao.id}`, tipo: "correcao", nivel: "atencao", titulo: `Pai ${correcao.sku_pai}${correcao.produto ? " · " + correcao.produto : ""} — corrigir anúncio`, detalhe: `Corrigir em: ${faltam.join(", ")}. Depois de corrigir, marque como feito na aba “Correções”.` });
    });

    // Estoque no Full (armazenagem): do mais urgente para o menos
    saldoFull
      .filter((s: any) => (s.nivel === "ALERTA" || s.nivel === "COBRANDO") && nomesVisiveis.has(norm(s.canal)))
      .sort((a: any, b: any) => (a.nivel === b.nivel ? Number(a.dias_para_cobranca) - Number(b.dias_para_cobranca) : a.nivel === "COBRANDO" ? -1 : 1))
      .forEach((s: any) => {
        const qtd = Number(s.nivel === "COBRANDO" ? s.qtd_cobrando : s.qtd_em_alerta) || Number(s.saldo_lotes) || 0;
        const dias = Number(s.dias_para_cobranca);
        lista.push(s.nivel === "COBRANDO"
          ? { id: `full-${s.canal}-${s.sku}`, tipo: "full", nivel: "critico", canal: s.canal, titulo: `${s.sku} — armazenagem em cobrança`, detalhe: `${s.canal}: ${qtd} un. no Full passaram do prazo (lote mais antigo com ${s.lote_mais_antigo_dias} dias).` }
          : { id: `full-${s.canal}-${s.sku}`, tipo: "full", nivel: "atencao", canal: s.canal, titulo: `${s.sku} — ${dias <= 1 ? "falta 1 dia" : `faltam ${dias} dias`} para cobrar armazenagem`, detalhe: `${s.canal}: ${qtd} un. com ${s.lote_mais_antigo_dias} dias no Full.` });
      });

    // Devoluções altas (análises salvas da aba Full e da Logística Própria, no mês selecionado)
    const melhor = new Map<string, any>();
    [...lancFull, ...lancPropria].forEach((l: any) => {
      if (String(l.mes_referencia) !== mesBarra || !nomesVisiveis.has(norm(l.canal))) return;
      const taxa = Number(l.taxa_devolucao) || 0, dev = Number(l.qtd_devolucoes) || 0, vend = Number(l.qtd_vendida) || 0;
      if (dev <= 0 || taxa < DEV_ATENCAO || vend < DEV_AMOSTRA_MIN) return;
      const k = `${norm(l.canal)}|${l.sku}`;
      if (!melhor.has(k) || taxa > Number(melhor.get(k).taxa_devolucao)) melhor.set(k, l);
    });
    Array.from(melhor.values()).sort((a, b) => Number(b.taxa_devolucao) - Number(a.taxa_devolucao)).forEach((l: any) => {
      const taxa = Number(l.taxa_devolucao);
      lista.push({
        id: `dev-${l.canal}-${l.sku}`, tipo: "devolucao", nivel: taxa >= DEV_CRITICO ? "critico" : "atencao", canal: l.canal,
        titulo: `${l.sku}${l.produto && l.produto !== "Produto Desconhecido" ? " · " + l.produto : ""} — ${pct(taxa)} de devolução`,
        detalhe: `${l.canal}: ${l.qtd_devolucoes} devolvida(s) em ${l.qtd_vendida} vendida(s) em ${mesBarra}.${taxa >= DEV_CRITICO ? " Envio ao Full não recomendado." : ""}`,
      });
    });

    // Tarefas pendentes que estão atrasadas ou vencem nos próximos 2 dias (cíclicas pendentes aparecem no dia do vencimento)
    minhasTarefas.filter((t: any) => !tarefaFeita(t)).forEach((t: any) => {
      const v = vencimento(t, hoje);
      if (!v.data) return;
      let dias = diferencaDias(hoje, v.data);
      const atrasadaHoje = dias === 0 && estaAtrasada(t, hoje, hojeInfo.hora);
      if (dias > 2) return;
      const quem = isAdmin && !emailRef ? ` · ${statusPorResponsavel(t, conclusoes, hoje).filter((s) => !s.concluida).map((s) => nomeDoEmail(s.email).split(" ")[0]).join(", ")} pendente(s)` : "";
      lista.push({
        id: `tarefa-${t.id}`, tipo: "tarefa", nivel: dias < 0 || atrasadaHoje ? "critico" : "atencao",
        titulo: `${t.titulo} — ${dias < 0 ? `atrasada há ${-dias} dia(s)` : atrasadaHoje ? `venceu às ${v.hora}` : dias === 0 ? `vence hoje${v.hora ? " às " + v.hora : ""}` : `vence em ${dias} dia(s)`}`,
        detalhe: `${ehCiclica(t) ? textoCiclo(t) : `Prazo ${dataBR(v.data)}${v.hora ? " às " + v.hora : ""}`}${quem}`,
      });
    });
    return lista;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saldoFull, lancFull, lancPropria, nomesVisiveis, mesBarra, minhasTarefas, conclusoes, hoje, hojeInfo.hora, isAdmin, emailRef, foraPromo, correcoes, correcoesCanais, mapeamentos, emailAlvo]);

  const notifFiltradas = notificacoes.filter((n) => filtroNotif === "todas" || n.tipo === filtroNotif);
  const contar = (tipo: string) => notificacoes.filter((n) => n.tipo === tipo).length;
  const listaCorrecoes = useMemo(() => correcoesVisiveis(correcoes, correcoesCanais, mapeamentos, { admin: isAdmin, email: emailAlvo }), [correcoes, correcoesCanais, mapeamentos, isAdmin, emailAlvo]);

  // ---------------------------------------------------------------------------------------------
  const corNivel = (nivel: string) => (nivel === "critico" ? "border-rose-800/60 bg-rose-950/30 text-rose-200" : nivel === "atencao" ? "border-amber-800/60 bg-amber-950/20 text-amber-200" : "border-slate-700 bg-slate-900 text-slate-200");
  const iconeTipo = (tipo: string) => (tipo === "full" ? "📦" : tipo === "devolucao" ? "↩️" : tipo === "promocao" ? "🏷️" : tipo === "correcao" ? "🛠️" : "📝");
  const corPrioridade = (p: string) => (p === "Alta" ? "bg-rose-950/60 text-rose-300 border-rose-800/50" : p === "Baixa" ? "bg-slate-800 text-slate-300 border-slate-700" : "bg-amber-950/50 text-amber-300 border-amber-800/50");

  // ---- Calendário do mês: resumo em cada dia; clicando no dia abre a lista completa
  const tarefaFeitaEm = (t: any, dia: string) => {
    if (emailRef) return concluiu(t, emailRef, conclusoes, dia);
    const st = statusPorResponsavel(t, conclusoes, dia);
    return st.length > 0 && st.every((x) => x.concluida);
  };
  const tarefasDoDia = (dia: string) =>
    minhasTarefas
      .map((t: any) => ({ t, o: ocorreNoDia(t, dia) }))
      .filter((x) => x.o.ocorre)
      .sort((a, b) => (hhmm(a.t.hora_entrega) || "99:99").localeCompare(hhmm(b.t.hora_entrega) || "99:99") || String(a.t.titulo).localeCompare(String(b.t.titulo)));
  const NOMES_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const mudarMes = (delta: number) => {
    const [a, m] = mesCal.split("-").map(Number);
    const d = new Date(Date.UTC(a, m - 1 + delta, 1));
    setMesCal(d.toISOString().slice(0, 7)); setDiaSel(null);
  };
  const rotuloPapel = (papel: string | null) => (papel === "renova" ? "renova hoje" : papel === "vence" ? "vence hoje" : papel === "diaria" ? "diária" : "entrega");

  const renderCalendario = () => {
    const [ano, mes] = mesCal.split("-").map(Number);
    const primeiro = `${mesCal}-01`;
    const qtdDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const inicioGrade = addDias(primeiro, -diaDaSemana(primeiro));
    const semanas = Math.ceil((diaDaSemana(primeiro) + qtdDias) / 7);
    const dias = Array.from({ length: semanas * 7 }, (_, i) => addDias(inicioGrade, i));
    const doDiaSel = diaSel ? tarefasDoDia(diaSel) : [];
    return (
      <div data-calendario>
        <div className="flex items-center justify-between mb-3">
          <button type="button" data-cal-anterior onClick={() => mudarMes(-1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 cursor-pointer">‹</button>
          <div className="text-sm font-black text-white capitalize" data-cal-titulo>{NOMES_MESES[mes - 1]} de {ano}</div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setMesCal(hojeData.slice(0, 7)); setDiaSel(hojeData); }} className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-slate-700 bg-slate-950 text-slate-300 cursor-pointer">Hoje</button>
            <button type="button" data-cal-proximo onClick={() => mudarMes(1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 cursor-pointer">›</button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => <div key={d} className="text-center text-[10px] font-bold uppercase text-slate-500">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dias.map((dia) => {
            const lista = tarefasDoDia(dia);
            const foraDoMes = dia.slice(0, 7) !== mesCal;
            const ehHoje = dia === hojeData;
            const sel = dia === diaSel;
            const pendentes = lista.filter((x) => !tarefaFeitaEm(x.t, dia)).length;
            return (
              <button key={dia} type="button" data-dia={dia} onClick={() => setDiaSel(sel ? null : dia)}
                className={`text-left min-h-[5.5rem] rounded-lg border p-1.5 cursor-pointer transition-all overflow-hidden ${sel ? "border-indigo-400 bg-indigo-950/40" : ehHoje ? "border-cyan-600 bg-cyan-950/20" : "border-slate-800 bg-slate-950/60 hover:border-slate-600"} ${foraDoMes ? "opacity-40" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-black ${ehHoje ? "text-cyan-300" : "text-slate-300"}`}>{Number(dia.slice(8))}</span>
                  {lista.length > 0 && <span data-dia-total className={`text-[9px] font-bold px-1.5 rounded ${pendentes === 0 ? "bg-emerald-900/50 text-emerald-300" : dia < hojeData ? "bg-rose-900/50 text-rose-300" : "bg-amber-900/40 text-amber-300"}`}>{pendentes === 0 ? "✔" : pendentes}</span>}
                </div>
                <div className="mt-1 space-y-0.5">
                  {lista.slice(0, 2).map(({ t }) => {
                    const feita = tarefaFeitaEm(t, dia);
                    return (
                      <div key={t.id} data-dia-item className={`truncate text-[9px] leading-tight ${feita ? "text-emerald-400/80 line-through" : dia < hojeData ? "text-rose-300" : "text-slate-300"}`} title={t.titulo}>
                        {hhmm(t.hora_entrega) ? hhmm(t.hora_entrega) + " " : ""}{t.titulo}
                      </div>
                    );
                  })}
                  {lista.length > 2 && <div className="text-[9px] text-slate-500 font-bold">+{lista.length - 2} mais</div>}
                </div>
              </button>
            );
          })}
        </div>

        {diaSel ? (
          <div data-dia-detalhe className="mt-4 border border-indigo-900/50 bg-slate-950/70 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black text-indigo-300 uppercase tracking-wider">
                {DIAS_SEMANA[diaDaSemana(diaSel)]}, {dataBR(diaSel)} — {doDiaSel.length} tarefa(s)
              </h3>
              <button type="button" onClick={() => setDiaSel(null)} className="text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer">✕ Fechar</button>
            </div>
            {doDiaSel.length === 0 && <p className="text-xs text-slate-500">Nenhuma tarefa neste dia.</p>}
            <div className="space-y-2">
              {doDiaSel.map(({ t, o }) => {
                const feita = tarefaFeitaEm(t, diaSel);
                const resp = statusPorResponsavel(t, conclusoes, diaSel);
                const anexosT = anexos.filter((a: any) => String(a.tarefa_id) === String(t.id));
                return (
                  <div key={t.id} data-dia-tarefa className={`rounded-lg border p-3 ${feita ? "border-emerald-900/40 bg-emerald-950/10" : "border-slate-800 bg-slate-900/60"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className={`text-sm font-bold ${feita ? "text-slate-500 line-through" : "text-white"}`}>{ehCiclica(t) && "🔁 "}{t.titulo}</div>
                      {isAdmin && <button data-editar-cal onClick={() => iniciarEdicao(t)} title="Editar tarefa" className="text-slate-500 hover:text-cyan-300 text-sm cursor-pointer">✏️</button>}
                    </div>
                    {t.descricao && <div className="text-[11px] text-slate-400 mt-0.5 whitespace-pre-line">{t.descricao}</div>}
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px]">
                      <span className={`px-2 py-0.5 rounded border font-bold ${corPrioridade(t.prioridade)}`}>{t.prioridade}</span>
                      <span className="text-slate-400">{rotuloPapel(o.papel)}{hhmm(t.hora_entrega) ? ` · até ${hhmm(t.hora_entrega)}` : ""}{ehCiclica(t) ? ` · ${textoCiclo(t)}` : ""}</span>
                      {resp.map((r) => (
                        <span key={r.email} className={`px-2 py-0.5 rounded-lg font-bold border ${r.concluida ? "bg-emerald-950/50 text-emerald-300 border-emerald-800/60" : "bg-amber-950/40 text-amber-300 border-amber-800/50"}`}>
                          {r.concluida ? "✔" : "⏳"} {nomeDoEmail(r.email).split(" ")[0]} {r.concluida ? "concluiu" : "pendente"}
                        </span>
                      ))}
                    </div>
                    {anexosT.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {anexosT.map((a: any) => (
                          <a key={a.id} href={urlAnexo(a)} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-cyan-900/60 bg-cyan-950/30 text-cyan-300 hover:text-white">⬇ {a.nome}</a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-500 mt-3">Para marcar como concluída, use a aba “Lista”.</p>
          </div>
        ) : (
          <p className="text-[10px] text-slate-500 mt-3">Clique em um dia para ver todas as tarefas dele por extenso.</p>
        )}
      </div>
    );
  };

  if (!usuario) return null;

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3"><Avatar email={usuario.email} tamanho={40} />Olá, {nomeDoEmail(usuario.email).split(" ")[0] || "bem-vindo"} 👋</h1>
            <p className="text-sm font-medium text-slate-400">
              {isAdmin ? "Visão do administrador — todos os canais, notificações e tarefas." : "Seus canais, avisos e tarefas."}
            </p>
          </div>
          <Navbar />
        </div>

        {faltaMigration && (
          <div className="mb-6 bg-amber-950/30 border border-amber-800/50 text-amber-200 text-xs rounded-xl p-4">
            ⚠️ As tabelas da tela inicial ainda não existem no banco. Execute o SQL <strong>20261104150000_tela_inicial.sql</strong> no Supabase para liberar tarefas e a divisão de canais por analista.
          </div>
        )}

        {/* FILTROS */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1">
            {(["atual", "anterior"] as const).map((m) => (
              <button key={m} onClick={() => setMesModo(m)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-all ${mesModo === m ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}>
                {m === "atual" ? "Mês atual" : "Mês anterior"}
              </button>
            ))}
          </div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Competência {mesBarra}</span>
          <button onClick={alternarOcultar} title={ocultarInfo ? "Mostrar faturamento, metas e canais" : "Esconder faturamento, metas e canais"}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer border transition-all flex items-center gap-2 ${ocultarInfo ? "bg-slate-700 border-slate-500 text-white" : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"}`}>
            <span aria-hidden>{ocultarInfo ? "🙈" : "👁️"}</span>{ocultarInfo ? "Mostrar informações" : "Ocultar informações"}
          </button>
          {isAdmin && (
            <>
              <select value={analistaFiltro} onChange={(e) => { setAnalistaFiltro(e.target.value); setFiltroNotif("todas"); }} className="bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none cursor-pointer">
                <option value="TODOS">Canais de: todos os analistas</option>
                {analistas.map((a) => <option key={a.email} value={a.email}>Canais de: {nomeDoEmail(a.email)}</option>)}
              </select>
              <button onClick={() => setPainelAdmin((v) => !v)} className={`ml-auto px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer border transition-all ${painelAdmin ? "bg-cyan-600 border-cyan-400 text-white" : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"}`}>
                ⚙️ Configuração do administrador
              </button>
            </>
          )}
        </div>

        {/* PAINEL DO ADMINISTRADOR */}
        {isAdmin && painelAdmin && (
          <div className="mb-8 grid grid-cols-1 xl:grid-cols-2 gap-6">
            <form onSubmit={criarTarefa} data-form-tarefa className="bg-slate-900/90 p-6 rounded-2xl border border-cyan-900/40 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-cyan-300 uppercase tracking-wider">{editandoId !== null ? "✏️ Editando tarefa" : "➕ Nova tarefa"}</h2>
                {editandoId !== null && <button type="button" data-cancelar-edicao onClick={cancelarEdicao} className="text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer">✕ Cancelar edição</button>}
              </div>
              <input value={novaTarefa.titulo} onChange={(e) => setNovaTarefa({ ...novaTarefa, titulo: e.target.value })} placeholder="Título da tarefa" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-cyan-500" />
              <textarea value={novaTarefa.descricao} onChange={(e) => setNovaTarefa({ ...novaTarefa, descricao: e.target.value })} placeholder="Descrição / instruções (opcional)" rows={3} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-cyan-500" />

              {/* Responsáveis: uma tarefa só, com o status de cada pessoa */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Responsáveis</label>
                  <div className="flex gap-3 text-[10px] font-bold">
                    <button type="button" data-todos-analistas onClick={selecionarTodosAnalistas} className="text-cyan-400 hover:text-cyan-300 cursor-pointer">Todos os analistas</button>
                    <button type="button" onClick={() => setNovaTarefa({ ...novaTarefa, responsaveis: [] })} className="text-slate-500 hover:text-slate-300 cursor-pointer">Limpar</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {analistas.map((a) => {
                    const on = novaTarefa.responsaveis.includes(a.email);
                    return (
                      <button key={a.email} type="button" data-resp={a.email} onClick={() => alternarResponsavelNovo(a.email)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer transition-all ${on ? "bg-cyan-600 border-cyan-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white"}`}>
                        {on ? "✓ " : ""}{nomeDoEmail(a.email)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Prazo x cíclica */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tipo da tarefa</label>
                <div className="flex bg-slate-950 border border-slate-700 rounded-lg p-1 w-fit">
                  {([["prazo", "📅 Com data de finalização"], ["ciclica", "🔁 Cíclica (renova sozinha)"]] as const).map(([k, nome]) => (
                    <button key={k} type="button" data-tipo={k} onClick={() => setNovaTarefa({ ...novaTarefa, tipo: k })}
                      className={`px-4 py-2 rounded-md text-[11px] font-bold cursor-pointer transition-all ${novaTarefa.tipo === k ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white"}`}>{nome}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Prioridade</label>
                  <select value={novaTarefa.prioridade} onChange={(e) => setNovaTarefa({ ...novaTarefa, prioridade: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none cursor-pointer">
                    <option>Alta</option><option>Média</option><option>Baixa</option>
                  </select>
                </div>
                {novaTarefa.tipo === "prazo" ? (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data de entrega</label>
                    <input type="date" data-data-entrega value={novaTarefa.data_entrega} onChange={(e) => setNovaTarefa({ ...novaTarefa, data_entrega: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none" />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Repetir</label>
                      <select data-ciclo value={novaTarefa.ciclo} onChange={(e) => setNovaTarefa({ ...novaTarefa, ciclo: e.target.value as "diaria" | "semanal" })} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none cursor-pointer">
                        <option value="diaria">Todo dia</option>
                        <option value="semanal">Toda semana</option>
                      </select>
                    </div>
                    {novaTarefa.ciclo === "semanal" && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Renova toda</label>
                        <select data-dia-semana value={novaTarefa.ciclo_dia_semana} onChange={(e) => setNovaTarefa({ ...novaTarefa, ciclo_dia_semana: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none cursor-pointer">
                          {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{DIAS_SEMANA[d]}</option>)}
                        </select>
                      </div>
                    )}
                  </>
                )}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Horário limite (opcional)</label>
                  <input type="time" data-hora value={novaTarefa.hora_entrega} onChange={(e) => setNovaTarefa({ ...novaTarefa, hora_entrega: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none" />
                </div>
              </div>
              {novaTarefa.tipo === "ciclica" && (
                <p className="text-[10px] text-slate-500">
                  {novaTarefa.ciclo === "diaria"
                    ? "Volta como pendente todo dia e vence no próprio dia."
                    : `Volta como pendente toda ${DIAS_SEMANA[novaTarefa.ciclo_dia_semana]} e vence no último dia da semana (${DIAS_SEMANA[(novaTarefa.ciclo_dia_semana + 6) % 7]}).`}
                </p>
              )}

              {/* Alerta */}
              <div className={novaTarefa.hora_entrega ? "" : "opacity-40"}>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">🔔 Avisar na tela do Windows antes do vencimento</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="1" data-aviso-valor disabled={!novaTarefa.hora_entrega} value={novaTarefa.avisoValor} onChange={(e) => setNovaTarefa({ ...novaTarefa, avisoValor: e.target.value })} className="w-20 bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none" />
                  <select data-aviso-unidade disabled={!novaTarefa.hora_entrega} value={novaTarefa.avisoUnidade} onChange={(e) => setNovaTarefa({ ...novaTarefa, avisoUnidade: e.target.value as "1" | "60" | "1440" })} className="bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none cursor-pointer">
                    <option value="1">minutos</option><option value="60">horas</option><option value="1440">dias</option>
                  </select>
                  <span className="text-[10px] text-slate-500">{novaTarefa.hora_entrega ? "antes do horário limite (deixe vazio para não avisar)" : "defina o horário limite para ativar o aviso"}</span>
                </div>
              </div>

              {/* Anexos */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">📎 Anexos (planilhas, txt, pdf… até {LIMITE_ANEXO_MB} MB cada)</label>
                <input type="file" multiple data-anexo-input accept={TIPOS_ANEXO} onChange={(e) => { escolherArquivos(e.target.files); e.target.value = ""; }}
                  className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyan-700 file:text-white file:font-bold cursor-pointer" />
                {editandoId !== null && anexos.filter((a: any) => String(a.tarefa_id) === String(editandoId)).length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {anexos.filter((a: any) => String(a.tarefa_id) === String(editandoId)).map((a: any) => (
                      <li key={a.id} className="flex items-center justify-between bg-slate-950 border border-cyan-900/40 rounded-lg px-3 py-1.5 text-[11px] text-cyan-200">
                        <span className="truncate">📎 {a.nome} <span className="text-slate-500">{tamanhoLegivel(a.tamanho)} · já anexado</span></span>
                        <button type="button" data-remover-anexo onClick={() => removerAnexo(a)} className="text-slate-500 hover:text-rose-400 cursor-pointer ml-3" title="Remover anexo">🗑️</button>
                      </li>
                    ))}
                  </ul>
                )}
                {arquivosNovos.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {arquivosNovos.map((f, i) => (
                      <li key={i} className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] text-slate-300">
                        <span className="truncate">{f.name} <span className="text-slate-500">{tamanhoLegivel(f.size)}</span></span>
                        <button type="button" onClick={() => setArquivosNovos((prev) => prev.filter((_, j) => j !== i))} className="text-slate-500 hover:text-rose-400 cursor-pointer ml-3">✕</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button type="submit" disabled={salvando || faltaMigration} className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-bold py-2.5 px-6 rounded-lg text-xs uppercase tracking-wider cursor-pointer shadow-lg">
                {salvando ? "Salvando..." : editandoId !== null ? "Salvar alterações" : "Adicionar tarefa"}
              </button>
              <p className="text-[10px] text-slate-500">A tarefa é uma só: cada responsável conclui a sua parte e o status de todos aparece no cartão.</p>
            </form>

            <div className="bg-slate-900/90 p-6 rounded-2xl border border-cyan-900/40 shadow-xl">
              <h2 className="text-sm font-black text-cyan-300 uppercase tracking-wider mb-1">🧭 Canais de cada analista</h2>
              <p className="text-[10px] text-slate-500 mb-4">Marque os canais pelos quais cada pessoa é responsável. Cada analista vê só os próprios canais na tela inicial.</p>
              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                {analistasNaoAdmin.length === 0 && <p className="text-xs text-slate-500">Nenhum analista cadastrado em Admin.</p>}
                {analistasNaoAdmin.map((a) => {
                  const meus = canaisDoEmail(a.email);
                  return (
                    <div key={a.email}>
                      <div className="text-xs font-bold text-white mb-1.5">{nomeDoEmail(a.email)} <span className="text-slate-500 font-normal">{a.email}</span></div>
                      <div className="flex flex-wrap gap-1.5">
                        {resumo.map((c) => {
                          const ativo = meus.has(norm(c.canal));
                          return (
                            <button key={c.canal} type="button" onClick={() => alternarCanalDoAnalista(a.email, c.canal, ativo)} disabled={faltaMigration}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer transition-all ${ativo ? "bg-indigo-600 border-indigo-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white"}`}>
                              {ativo ? "✓ " : ""}{c.canal}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!ocultarInfo && (
        <>
        {/* RESUMO */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Faturamento total</div>
            <div className="text-xl font-black text-white mt-1">{carregando ? "…" : moeda(totais.fat)}</div>
          </div>
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Meta (objetivo)</div>
            <div className="text-xl font-black text-indigo-300 mt-1">{carregando ? "…" : moeda(totais.meta)}</div>
            <div className="text-[10px] text-slate-500 mt-1">{carregando ? "" : `${pct(totais.progresso)} atingido`}</div>
          </div>
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">% Líquido</div>
            <div className={`text-xl font-black mt-1 ${totais.margem < 0 ? "text-rose-400" : "text-emerald-400"}`}>{carregando ? "…" : pct(totais.margem)}</div>
            <div className="text-[10px] text-slate-500 mt-1">{carregando ? "" : `Lucro ${moeda(totais.lucro)}`}</div>
          </div>
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avisos ativos</div>
            <div className={`text-xl font-black mt-1 ${notificacoes.length ? "text-amber-300" : "text-emerald-400"}`}>{carregando ? "…" : notificacoes.length}</div>
            <div className="text-[10px] text-slate-500 mt-1">{qtdAndamento} tarefa(s) em andamento</div>
          </div>
        </div>

        {/* CANAIS */}
        <h2 className="text-sm font-black text-slate-300 uppercase tracking-wider mb-3">📊 {isAdmin && analistaFiltro === "TODOS" ? "Todos os canais" : isAdmin ? `Canais de ${nomeDoEmail(analistaFiltro)}` : "Meus canais"}</h2>
        {carregando ? (
          <div className="text-xs text-slate-500 mb-8">Calculando os números do Dashboard…</div>
        ) : canaisVisiveis.length === 0 ? (
          <div className="mb-8 bg-slate-900/60 border border-dashed border-slate-700 rounded-2xl p-6 text-xs text-slate-400">
            {isAdmin ? "Esse analista ainda não tem canais atribuídos. Use “Configuração do administrador” para marcar os canais dele." : "Você ainda não tem canais atribuídos. Peça ao administrador para marcar os seus canais."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            {canaisVisiveis.map((c) => {
              const prog = Math.min(100, Math.max(0, c.progressoMetaPct));
              return (
                <div key={c.canal} className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-lg" data-canal={c.canal}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-slate-800 overflow-hidden flex items-center justify-center text-xs font-black text-white border border-slate-700 flex-shrink-0">
                      {c.logoUrl ? <img src={c.logoUrl} alt="" className="w-full h-full object-cover" /> : c.canal.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white truncate">{c.canal}</div>
                      {isAdmin && analistaFiltro === "TODOS" && <div className="text-[10px] text-slate-500 truncate">{analistasDoCanal(c.canal).join(", ") || "sem analista"}</div>}
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-baseline"><span className="text-[10px] font-bold text-slate-400 uppercase">Faturamento</span><span className="text-sm font-black text-white">{moeda(c.faturadoComRedutor)}</span></div>
                    <div className="flex justify-between items-baseline"><span className="text-[10px] font-bold text-slate-400 uppercase">Meta</span><span className="text-sm font-bold text-indigo-300">{moeda(c.metaValor)}</span></div>
                    <div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className={`h-full ${c.progressoMetaPct >= 100 ? "bg-emerald-500" : c.progressoMetaPct >= 60 ? "bg-indigo-500" : "bg-amber-500"}`} style={{ width: `${prog}%` }} /></div>
                      <div className="text-[10px] text-slate-500 mt-1">{pct(c.progressoMetaPct)} da meta</div>
                    </div>
                    <div className="flex justify-between items-baseline pt-1 border-t border-slate-800"><span className="text-[10px] font-bold text-slate-400 uppercase">% Líquido</span><span className={`text-sm font-black ${c.margemLiquidaPct < 0 ? "text-rose-400" : "text-emerald-400"}`}>{pct(c.margemLiquidaPct)}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        </>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* NOTIFICAÇÕES */}
          <div className="xl:col-span-2 bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
            <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-3">🔔 Notificações</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {([["todas", "Todas", notificacoes.length], ["full", "📦 Full", contar("full")], ["devolucao", "↩️ Devoluções", contar("devolucao")], ["tarefa", "📝 Tarefas", contar("tarefa")], ["promocao", "🏷️ Itens fora de promoção", foraPromo.length], ["correcao", "🛠️ Correções", listaCorrecoes.length]] as const).map(([k, nome, n]) => (
                <button key={k} data-notif-aba={k} onClick={() => setFiltroNotif(k)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${filtroNotif === k ? "bg-indigo-600 border-indigo-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white"}`}>{nome} ({n})</button>
              ))}
            </div>
            {filtroNotif === "correcao" ? (
              <div data-painel-correcoes className="space-y-3">
                {erroCorrecao && <p className="text-[11px] text-rose-400 font-bold">⚠️ Não consegui ler as correções: {erroCorrecao}</p>}
                {listaCorrecoes.length === 0 && !erroCorrecao && <p className="text-xs text-emerald-400 font-bold">✅ Nenhuma correção pendente.</p>}
                <div className="space-y-2 max-h-[30rem] overflow-y-auto pr-1">
                  {listaCorrecoes.map(({ correcao, canais }) => {
                    const todos = correcoesCanais.filter((x) => x.correcao_id === correcao.id);
                    const feitos = todos.filter((x) => x.feito).length;
                    return (
                      <div key={correcao.id} data-correcao={correcao.sku_pai} className="border border-amber-800/50 bg-amber-950/20 rounded-xl p-3 space-y-2">
                        <div>
                          <div className="text-xs font-bold text-amber-200"><span className="font-mono text-indigo-300">Pai: {correcao.sku_pai}</span>{correcao.produto ? <> — {correcao.produto}</> : null}</div>
                          <div className="text-[11px] text-slate-400">Enviado da aba Vídeos em {dataBR(correcao.criado_em)}{correcao.criado_por ? ` por ${nomeDoEmail(correcao.criado_por).split(" ")[0]}` : ""} · {feitos}/{todos.length} canal(is) feito(s)</div>
                        </div>
                        <div className="space-y-1">
                          {canais.map((c) => {
                            const pode = podeMarcarCanal(usuario, mapeamentos, c.canal);
                            return (
                              <label key={c.id} className={`flex items-center gap-3 text-xs ${pode ? "cursor-pointer" : "opacity-60"}`}>
                                <input type="checkbox" data-correcao-canal={c.canal} checked={c.feito} disabled={!pode} onChange={() => alternarCorrecao(c)} className="accent-emerald-500 w-4 h-4" title={pode ? "Marque quando corrigir este canal" : "Só o responsável por este canal marca"} />
                                <span className={c.feito ? "line-through text-slate-500" : "text-slate-200 font-bold"}>{c.canal}</span>
                                {c.feito && <span className="text-[10px] text-emerald-400">✔ {c.feito_por ? nomeDoEmail(c.feito_por).split(" ")[0] : ""} {dataBR(c.feito_em)}</span>}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-500">Quando todos os canais do produto forem marcados como feitos, ele volta para a aba Vídeos para a responsável marcar. O analista vê e marca só os canais dele; o administrador, todos.</p>
              </div>
            ) : filtroNotif === "promocao" ? (
              <div data-painel-fora-promocao className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input value={buscaPromo} onChange={(e) => { setBuscaPromo(e.target.value); setQtdPromoVisivel(100); }} placeholder="Buscar MLB, SKU ou promoção…" className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none w-64" />
                  <span className="text-[11px] text-slate-400">{foraPromoFiltrado.length} anúncio(s) fora de promoção</span>
                  {marcadosVisiveis.length > 0 && (
                    <button type="button" data-ver-marcados onClick={() => setVerMarcados((v) => !v)} className="text-[11px] text-slate-400 underline hover:text-white cursor-pointer">{verMarcados ? "ocultar marcados" : `ver ${marcadosVisiveis.length} marcado(s) como promovido`}</button>
                  )}
                </div>
                {erroPromo && <p className="text-[11px] text-rose-400 font-bold">⚠️ {erroPromo}</p>}
                <div className="space-y-1.5 max-h-[30rem] overflow-y-auto pr-1">
                  {foraPromoFiltrado.length === 0 && <p className="text-xs text-emerald-400 font-bold">✅ Nenhum anúncio fora de promoção.</p>}
                  {foraPromoFiltrado.slice(0, qtdPromoVisivel).map((i) => (
                    <label key={i.mlb} data-item-fora={i.mlb} className="flex items-start gap-3 border border-amber-800/50 bg-amber-950/20 rounded-xl p-3 cursor-pointer hover:bg-amber-950/30">
                      <input type="checkbox" data-marcar-promovido={i.mlb} checked={false} onChange={() => marcarPromovido(i)} className="mt-0.5 accent-emerald-500 w-4 h-4 cursor-pointer" title="Marque se já colocou este anúncio em promoção fora da planilha" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-amber-200"><span className="font-mono text-indigo-300">{i.mlb}</span>{i.sku ? <> · <span className="font-mono text-slate-200">{i.sku}</span></> : null}</div>
                        <div className="text-[11px] text-slate-400">{i.conta} · “{i.ultimaPromocao || "sem nome"}” terminou em {dataBR(i.fimEm)} ({i.diasFora === 1 ? "há 1 dia" : `há ${i.diasFora} dias`})</div>
                      </div>
                    </label>
                  ))}
                  {foraPromoFiltrado.length > qtdPromoVisivel && (
                    <button type="button" onClick={() => setQtdPromoVisivel((q) => q + 100)} className="w-full text-[11px] font-bold text-slate-300 border border-slate-700 rounded-lg py-2 hover:text-white cursor-pointer">Mostrar mais ({foraPromoFiltrado.length - qtdPromoVisivel} restantes)</button>
                  )}
                </div>
                {verMarcados && (
                  <div data-lista-marcados className="space-y-1 border-t border-slate-800 pt-3">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Marcados como “já promovi”</p>
                    {marcadosVisiveis.map((m) => (
                      <div key={m.mlb} className="flex items-center justify-between text-[11px] text-slate-400">
                        <span><span className="font-mono text-indigo-300">{m.mlb}</span> · {dataBR(m.marcado_em)}</span>
                        <button type="button" onClick={() => desmarcarPromovido(m.mlb)} className="underline hover:text-white cursor-pointer">desfazer</button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-slate-500">O anúncio entra aqui quando a última promoção registrada vence e ele não está em outra campanha. Sai sozinho quando você salva uma nova promoção dele no módulo Promoções, ou ao marcar a caixinha (promovido fora da planilha).</p>
              </div>
            ) : (
            <div className="space-y-2 max-h-[34rem] overflow-y-auto pr-1">
              {carregando ? <p className="text-xs text-slate-500">Carregando…</p> : notifFiltradas.length === 0 ? (
                <p className="text-xs text-emerald-400 font-bold">✅ Nada pendente por aqui.</p>
              ) : notifFiltradas.map((n) => (
                <div key={n.id} className={`border rounded-xl p-3 ${corNivel(n.nivel)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold">{iconeTipo(n.tipo)} {n.titulo}</div>
                      <div className="text-[11px] opacity-80 mt-0.5">{n.detalhe}</div>
                    </div>
                    <button type="button" data-enviar-chat-notif title="Enviar esta notificação no chat" onClick={() => compartilharNoChat({ tipo: "notificacao", payload: { tipo: n.tipo, nivel: n.nivel, titulo: n.titulo, detalhe: n.detalhe, canal: n.canal } })} className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-600/60 bg-slate-900/50 text-slate-200 hover:text-white cursor-pointer">💬 Enviar no chat</button>
                  </div>
                </div>
              ))}
            </div>
            )}
            <p className="text-[10px] text-slate-500 mt-3">Devolução: avisa a partir de {DEV_ATENCAO}% (crítico a partir de {DEV_CRITICO}%), com no mínimo {DEV_AMOSTRA_MIN} vendas, usando as análises salvas na aba Fulfillment. Full: prazos configurados por canal na aba Regras.</p>
          </div>

          {/* TAREFAS */}
          <div className="xl:col-span-3 bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider">📝 Tarefas</h2>
              <div className="flex flex-wrap items-center gap-2">
              {permissaoNotif === "default" && (
                <button type="button" data-ativar-alertas onClick={ativarAlertas} className="px-3 py-2 rounded-lg text-[11px] font-bold border border-cyan-700 bg-cyan-950/40 text-cyan-300 hover:text-white cursor-pointer">🔔 Ativar alertas no Windows</button>
              )}
              {permissaoNotif === "granted" && (
                <span data-status-alertas className={`text-[10px] font-bold flex items-center gap-2 ${temPush ? "text-emerald-400" : "text-amber-300"}`}>
                  🔔 {temPush ? "Alertas ativos (funcionam com o sistema fechado)" : "Alertas só com o sistema aberto"}
                  <button type="button" data-testar-alerta onClick={temPush ? enviarTeste : ativarAlertas} className="underline text-slate-400 hover:text-white cursor-pointer">{temPush ? "enviar teste" : "ativar com o sistema fechado"}</button>
                </span>
              )}
              <button type="button" data-testar-popup onClick={testarPopup} className="px-3 py-2 rounded-lg text-[11px] font-bold border border-amber-700 bg-amber-950/30 text-amber-300 hover:text-white cursor-pointer">🔊 Testar pop-up e som</button>
              {permissaoNotif === "denied" && (
                <span className="text-[10px] text-amber-300" title="Clique no cadeado ao lado do endereço do site e libere as Notificações">🔕 Alertas bloqueados no navegador</span>
              )}
              {isAdmin && (
                <select value={filtroResp} onChange={(e) => { setFiltroResp(e.target.value); setPagina(1); }} className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer">
                  <option value="TODOS">Todos os responsáveis</option>
                  {analistas.map((a) => <option key={a.email} value={a.email}>{nomeDoEmail(a.email)}</option>)}
                </select>
              )}
              </div>
            </div>
            {msgPush && <p data-msg-push className="text-[10px] text-slate-400 mb-3">{msgPush}</p>}
            <div className="flex gap-1 mb-4 border-b border-slate-800">
              {([["lista", "📋 Lista"], ["calendario", "🗓️ Calendário"]] as const).map(([k, nome]) => (
                <button key={k} data-subaba-tarefas={k} onClick={() => setSubAbaTarefas(k)} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer border-b-2 -mb-px ${subAbaTarefas === k ? "border-indigo-400 text-white" : "border-transparent text-slate-500 hover:text-slate-300"}`}>{nome}</button>
              ))}
            </div>
            {subAbaTarefas === "calendario" && renderCalendario()}
            {subAbaTarefas === "lista" && (<>
            <div className="flex flex-wrap gap-2 mb-4">
              {([["andamento", "Em andamento", qtdAndamento], ["concluidas", "Concluído", qtdConcluidas], ["todos", "Todos", minhasTarefas.length]] as const).map(([k, nome, n]) => (
                <button key={k} onClick={() => { setAba(k); setPagina(1); }} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border cursor-pointer transition-all ${aba === k ? (k === "concluidas" ? "bg-emerald-600 border-emerald-400 text-white" : "bg-indigo-600 border-indigo-400 text-white") : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white"}`}>{nome} ({n})</button>
              ))}
            </div>

            <div className="space-y-2">
              {tarefasPagina.length === 0 && <p className="text-xs text-slate-500 py-6 text-center">{aba === "andamento" ? "Nenhuma tarefa em andamento." : aba === "concluidas" ? "Nenhuma tarefa concluída." : "Nenhuma tarefa."}</p>}
              {tarefasPagina.map((t: any) => {
                const v = vencimento(t, hoje);
                const cicl = ehCiclica(t);
                const feita = tarefaFeita(t);
                const atrasada = !feita && estaAtrasada(t, hoje, hojeInfo.hora);
                const resp = statusPorResponsavel(t, conclusoes, hoje);
                const meuEmail = usuario.email;
                const souResp = (t.responsaveis || []).includes(meuEmail);
                const minhaFeita = souResp && concluiu(t, meuEmail, conclusoes, hoje);
                const anexosDaTarefa = anexos.filter((a: any) => String(a.tarefa_id) === String(t.id));
                return (
                  <div key={t.id} data-tarefa={t.id} className={`flex items-start gap-3 border rounded-xl p-3 ${feita ? "border-emerald-900/40 bg-emerald-950/10" : atrasada ? "border-rose-800/60 bg-rose-950/20" : "border-slate-800 bg-slate-950/60"}`}>
                    {souResp && (
                      <input type="checkbox" data-minha-conclusao checked={minhaFeita} onChange={() => alternarConclusao(t, meuEmail)} title={minhaFeita ? "Reabrir a minha parte" : "Marcar a minha parte como concluída"} className="mt-1 w-4 h-4 accent-emerald-500 cursor-pointer flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className={`text-sm font-bold ${feita ? "text-slate-500 line-through" : "text-white"}`}>{cicl && <span title={textoCiclo(t)}>🔁 </span>}{t.titulo}</div>
                        <button type="button" data-enviar-chat-tarefa title="Enviar esta tarefa no chat" onClick={() => compartilharNoChat({ tipo: "tarefa", tarefa_id: t.id })} className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:text-white cursor-pointer">💬 Enviar no chat</button>
                      </div>
                      {t.descricao && <div className="text-[11px] text-slate-400 mt-0.5 whitespace-pre-line">{t.descricao}</div>}

                      {/* status de cada responsável */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {resp.map((r) => {
                          const podeMexer = isAdmin || r.email === meuEmail;
                          const nome = nomeDoEmail(r.email).split(" ")[0];
                          return (
                            <button key={r.email} type="button" data-status={`${r.email}:${r.concluida ? "concluida" : "pendente"}`} disabled={!podeMexer}
                              onClick={() => alternarConclusao(t, r.email)}
                              title={podeMexer ? (r.concluida ? "Clique para reabrir" : "Clique para marcar como concluída") : undefined}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${podeMexer ? "cursor-pointer" : "cursor-default"} ${r.concluida ? "bg-emerald-950/50 text-emerald-300 border-emerald-800/60" : "bg-amber-950/40 text-amber-300 border-amber-800/50"}`}>
                              {r.concluida ? "✔" : "⏳"} {nome} {r.concluida ? "concluiu" : "pendente"}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px]">
                        <span className={`px-2 py-0.5 rounded border font-bold ${corPrioridade(t.prioridade)}`}>{t.prioridade}</span>
                        {cicl ? (
                          <span className={atrasada ? "text-rose-300 font-bold" : "text-slate-400"}>{textoCiclo(t)} · vence {v.data === hoje ? "hoje" : dataBR(v.data)}{v.hora ? ` às ${v.hora}` : ""}{atrasada ? " (atrasada)" : ""}</span>
                        ) : (
                          <span className={atrasada ? "text-rose-300 font-bold" : "text-slate-400"}>Entrega: {v.data ? dataBR(v.data) : "sem prazo"}{v.hora ? ` às ${v.hora}` : ""}{atrasada ? " (atrasada)" : ""}</span>
                        )}
                        {t.aviso_minutos ? <span className="text-slate-500" title="Aviso na tela do Windows">🔔 {textoAntecedencia(Number(t.aviso_minutos))} antes</span> : null}
                      </div>

                      {anexosDaTarefa.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {anexosDaTarefa.map((a: any) => (
                            <a key={a.id} data-anexo href={urlAnexo(a)} target="_blank" rel="noopener noreferrer" title="Baixar"
                              className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-cyan-900/60 bg-cyan-950/30 text-cyan-300 hover:text-white">
                              ⬇ {a.nome} <span className="text-cyan-500 font-normal">{tamanhoLegivel(a.tamanho)}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex flex-col items-center gap-2 flex-shrink-0">
                        <button data-editar onClick={() => iniciarEdicao(t)} title="Editar tarefa" className="text-slate-500 hover:text-cyan-300 text-sm cursor-pointer">✏️</button>
                        <button onClick={() => excluirTarefa(t)} title="Excluir tarefa" className="text-slate-500 hover:text-rose-400 text-sm cursor-pointer">🗑️</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {tarefasFiltradas.length > POR_PAGINA && (
              <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-800">
                <span className="text-[11px] text-slate-500">{(paginaAtual - 1) * POR_PAGINA + 1}–{Math.min(paginaAtual * POR_PAGINA, tarefasFiltradas.length)} de {tarefasFiltradas.length}</span>
                <div className="flex items-center gap-1">
                  <button disabled={paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">‹ Anterior</button>
                  {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
                    <button key={n} onClick={() => setPagina(n)} className={`w-8 h-8 rounded-lg text-xs font-bold border cursor-pointer ${n === paginaAtual ? "bg-indigo-600 border-indigo-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400"}`}>{n}</button>
                  ))}
                  <button disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(paginaAtual + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">Próxima ›</button>
                </div>
              </div>
            )}
            </>)}
          </div>
        </div>
      </div>
    </div>
  );
}
