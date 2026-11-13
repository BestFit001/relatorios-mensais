"use client";
// Chat interno PRIVADO e em tempo real, em qualquer página: botão flutuante que abre um painel com
// sala Geral, conversas diretas e grupos; imagens; tarefas e notificações compartilhadas; card automático ao mandar só um SKU.
// Tudo passa pela API do servidor (lib/chatServidor.ts), que confere quem é a pessoa e se ela participa da conversa.
// "Tempo real": aviso instantâneo por broadcast do Supabase (só um "tem novidade", sem conteúdo) + consulta de reserva a cada poucos segundos.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNomes } from "../../lib/nomes";
import { usePathname } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { tocarAlerta } from "../../lib/som";
import { SALA_GERAL_ID, MAX_TEXTO, type MensagemChat, type SalaChat, nomeDoEmail, nomeDaSala, rotuloDia, chaveDia } from "../../lib/chat";
import { chatApi, emailLogado, perfilLogado, tokenDoChat, sairDoChat, prepararImagem, type ItemCompartilhado } from "../../lib/chatCliente";
import ChatMensagem from "./ChatMensagem";
import ChatPin from "./ChatPin";
import Avatar from "./Avatar";
import { abrirEscolhaDeAvatar } from "./EscolherAvatar";
import { carregarAvatares, EVENTO_AVATAR } from "../../lib/avatar";

type Fase = "verificando" | "pin" | "ok";
type Modal = null | "grupo" | "membros" | "tarefa" | "compartilhar" | "config";
type Tarefa = { id: number | string; titulo: string; prazo?: string };

export default function ChatInterno() {
  useNomes();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [aberto, setAberto] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);
  const [fase, setFase] = useState<Fase>("verificando");
  const [temSenha, setTemSenha] = useState<boolean | null>(null);
  const [salas, setSalas] = useState<SalaChat[]>([]);
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [souAdmin, setSouAdmin] = useState(false);
  const [salaId, setSalaId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [menuAnexo, setMenuAnexo] = useState(false);
  const [anexo, setAnexo] = useState<{ blob: Blob; mime: string; url: string } | null>(null);
  const [imagemGrande, setImagemGrande] = useState<string | null>(null);
  const [pendente, setPendente] = useState<ItemCompartilhado | null>(null);   // tarefa/notificação esperando a pessoa escolher a conversa
  const [nomeGrupo, setNomeGrupo] = useState("");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [tarefas, setTarefas] = useState<any[] | null>(null);
  const [alvoReset, setAlvoReset] = useState("");
  const fimRef = useRef<HTMLDivElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const canalRef = useRef<any>(null);
  const prevNaoLidas = useRef<Record<string, number> | null>(null);
  const vivo = useRef({ email: "", aberto: false, salaId: null as string | null, fase: "verificando" as Fase, msgs: [] as MensagemChat[], lightbox: false });
  vivo.current = { email, aberto, salaId, fase, msgs, lightbox: !!imagemGrande };

  const sala = useMemo(() => salas.find((s) => s.id === salaId) || null, [salas, salaId]);
  const totalNaoLidas = salas.reduce((a, s) => a + (s.nao_lidas || 0), 0);

  useEffect(() => { setEmail(emailLogado()); }, [pathname]);
  useEffect(() => { try { setTelaCheia(localStorage.getItem("chat_tela_cheia") === "1"); } catch { /* sem armazenamento */ } }, []);
  const alternarTela = () => setTelaCheia((v) => { const n = !v; try { localStorage.setItem("chat_tela_cheia", n ? "1" : "0"); } catch { /* ignora */ } return n; });
  useEffect(() => {
    if (!aberto || !telaCheia) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !vivo.current.lightbox) setTelaCheia(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto, telaCheia]);

  // ---------- sessão
  const aoExpirar = useCallback(() => { setFase("pin"); setSalas([]); setMsgs([]); setSalaId(null); prevNaoLidas.current = null; }, []);
  useEffect(() => { window.addEventListener("chat:sessao-expirada", aoExpirar); return () => window.removeEventListener("chat:sessao-expirada", aoExpirar); }, [aoExpirar]);

  useEffect(() => {
    if (!email) { setFase("verificando"); setSalas([]); setMsgs([]); setSalaId(null); return; }
    setFase(tokenDoChat(email) ? "ok" : "pin");
    prevNaoLidas.current = null;
  }, [email]);

  // abriu o painel sem sessão: descobre se já tem senha do chat (criar x entrar)
  useEffect(() => {
    if (!aberto || fase !== "pin" || !email) return;
    let ativo = true;
    setTemSenha(null);
    chatApi<{ tem_senha?: boolean }>("estado", { email }, false).then((r) => { if (ativo) setTemSenha(r.ok ? !!r.dados.tem_senha : true); });
    return () => { ativo = false; };
  }, [aberto, fase, email]);

  // ---------- conversas
  const avisarNovas = useCallback((lista: SalaChat[]) => {
    const prev = prevNaoLidas.current;
    const agora: Record<string, number> = {};
    lista.forEach((s) => { agora[s.id] = s.nao_lidas; });
    prevNaoLidas.current = agora;
    if (!prev) return;
    const vendo = vivo.current.aberto && !document.hidden ? vivo.current.salaId : null;
    const novas = lista.filter((s) => s.nao_lidas > (prev[s.id] || 0) && s.id !== vendo);
    if (novas.length === 0) return;
    tocarAlerta(1);
    try {
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        const s = novas[0];
        const n = new Notification(`${nomeDaSala(s, vivo.current.email)}${s.ultima ? " · " + nomeDoEmail(s.ultima.de) : ""}`, { body: s.ultima?.texto || "Nova mensagem", tag: "chat-" + s.id, icon: "/favicon.ico" });
        n.onclick = () => { window.focus(); n.close(); };
      }
    } catch { /* notificação é só um extra */ }
  }, []);

  const carregarSalas = useCallback(async () => {
    if (vivo.current.fase !== "ok" || !vivo.current.email) return;
    const r = await chatApi<{ salas: SalaChat[]; usuarios: string[]; sou_admin: boolean }>("salas");
    if (!r.ok) return;
    const lista = r.dados.salas || [];
    setSalas(lista); setUsuarios((r.dados.usuarios || []).filter((u) => u !== vivo.current.email)); setSouAdmin(!!r.dados.sou_admin);
    avisarNovas(lista);
  }, [avisarNovas]);

  // completo: busca a conversa toda e mescla (mantém o que já está na tela e atualiza o que foi excluído); trocar: substitui tudo (links de imagem renovados)
  const carregarMsgs = useCallback(async (completo = false, trocar = false) => {
    const id = vivo.current.salaId;
    if (!id || vivo.current.fase !== "ok") return;
    const atual = vivo.current.msgs;
    const depois = !completo && atual.length ? atual[atual.length - 1].criado_em : undefined;
    const r = await chatApi<{ mensagens: MensagemChat[] }>("mensagens", { sala_id: id, depois });
    if (!r.ok || vivo.current.salaId !== id) return;
    const novas = r.dados.mensagens || [];
    if (!depois) {
      setMsgs((prev) => {
        if (trocar || prev.length === 0) return novas;
        const antigas = new Map(prev.map((x) => [x.id, x]));
        let mudou = prev.length !== novas.length;
        const lista = novas.map((n) => { const p = antigas.get(n.id); if (p && !!p.payload?.excluida === !!n.payload?.excluida) return p; mudou = true; return n; });
        return mudou ? lista : prev;
      });
      return;
    }
    if (novas.length) setMsgs((l) => [...l, ...novas.filter((n) => !l.some((x) => x.id === n.id))]);
  }, []);

  // ao ficar "ok": carrega conversas e mantém a consulta de reserva (aviso instantâneo vem pelo broadcast)
  useEffect(() => {
    if (fase !== "ok") return;
    carregarSalas();
    let ciclo = 0;
    const t = setInterval(() => {
      carregarSalas(); if (vivo.current.aberto && !document.hidden) carregarMsgs(++ciclo % 3 === 0);
      if (ciclo % 12 === 0 && vivo.current.aberto) carregarAvatares(true).then(() => window.dispatchEvent(new CustomEvent(EVENTO_AVATAR))).catch(() => {});   // pega avatares trocados por outras pessoas
    }, 5000);
    return () => clearInterval(t);
  }, [fase, carregarSalas, carregarMsgs]);

  // aviso instantâneo: alguém mandou algo -> busca já (o aviso não leva conteúdo; a busca passa pela API com a sessão)
  useEffect(() => {
    if (fase !== "ok") return;
    try {
      const canal = supabase.channel("chat-aviso", { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "novo" }, (p: any) => { carregarSalas(); if (p?.payload?.sala_id && p.payload.sala_id === vivo.current.salaId) carregarMsgs(!!p.payload.excluiu); })
        .subscribe();
      canalRef.current = canal;
      return () => { canalRef.current = null; try { supabase.removeChannel(canal); } catch { /* ignora */ } };
    } catch { /* sem tempo real: segue a consulta de reserva */ }
  }, [fase, carregarSalas, carregarMsgs]);
  const avisarOutros = (id: string, excluiu = false) => { try { canalRef.current?.send({ type: "broadcast", event: "novo", payload: { sala_id: id, excluiu } }); } catch { /* ignora */ } };

  // escolher a conversa
  const abrirSala = useCallback((id: string) => {
    setSalaId(id); setMsgs([]); setErro(""); setMenuAnexo(false);
    vivo.current.salaId = id; vivo.current.msgs = [];
    carregarMsgs(true);
  }, [carregarMsgs]);
  useEffect(() => { if (aberto && fase === "ok" && !salaId && salas.length) abrirSala(salas.find((s) => s.tipo === "geral")?.id || salas[0].id); }, [aberto, fase, salaId, salas, abrirSala]);

  // lida: abriu a conversa com mensagens novas
  useEffect(() => {
    if (!aberto || !salaId || !sala || sala.nao_lidas === 0 || document.hidden) return;
    chatApi("ler", { sala_id: salaId });
    setSalas((l) => l.map((s) => (s.id === salaId ? { ...s, nao_lidas: 0 } : s)));
    if (prevNaoLidas.current) prevNaoLidas.current[salaId] = 0;
  }, [aberto, salaId, sala, msgs.length]);
  useEffect(() => { if (aberto) fimRef.current?.scrollIntoView({ block: "end" }); }, [aberto, salaId, msgs.length]);

  // ---------- compartilhar tarefa / notificação vindo de outras telas
  useEffect(() => {
    const ouvir = (e: Event) => { const item = (e as CustomEvent).detail as ItemCompartilhado; if (!item) return; setPendente(item); setAberto(true); setModal("compartilhar"); };
    window.addEventListener("chat:compartilhar", ouvir);
    return () => window.removeEventListener("chat:compartilhar", ouvir);
  }, []);

  const mostrarAviso = (t: string) => { setAviso(t); setTimeout(() => setAviso(""), 3500); };

  // ---------- enviar
  const enviarMsg = async (idSala: string, corpo: any): Promise<boolean> => {
    const r = await chatApi<{ mensagem: MensagemChat }>("enviar", { sala_id: idSala, ...corpo });
    if (!r.ok) { setErro("Não consegui enviar: " + (r.erro || "")); return false; }
    if (idSala === vivo.current.salaId) setMsgs((l) => (l.some((x) => x.id === r.dados.mensagem.id) ? l : [...l, r.dados.mensagem]));
    avisarOutros(idSala); carregarSalas();
    return true;
  };

  const enviar = async () => {
    if (!salaId || enviando) return;
    const t = texto.trim();
    if (!t && !anexo) return;
    setEnviando(true); setErro("");
    let ok = false;
    if (anexo) {
      const up = await chatApi<{ path: string; token: string }>("upload_url", { sala_id: salaId, mime: anexo.mime });
      if (!up.ok) { setErro(up.erro || "Não consegui enviar a imagem."); setEnviando(false); return; }
      const { error } = await supabase.storage.from("chat-anexos").uploadToSignedUrl(up.dados.path, up.dados.token, anexo.blob, { contentType: anexo.mime });
      if (error) { setErro("Não consegui enviar a imagem: " + error.message); setEnviando(false); return; }
      ok = await enviarMsg(salaId, { tipo: "imagem", anexo_path: up.dados.path, texto: t || undefined });
      if (ok) { URL.revokeObjectURL(anexo.url); setAnexo(null); }
    } else {
      ok = await enviarMsg(salaId, { tipo: "texto", texto: t });
    }
    if (ok) setTexto("");
    setEnviando(false);
  };

  const excluirMsg = async (id: string) => {
    const r = await chatApi<{ mensagem: MensagemChat }>("excluir", { id });
    if (!r.ok) return setErro("Não consegui excluir: " + (r.erro || ""));
    setMsgs((l) => l.map((x) => (x.id === id ? r.dados.mensagem : x)));
    if (vivo.current.salaId) avisarOutros(vivo.current.salaId, true);
    carregarSalas();
  };

  const escolherImagem = async (f: File | undefined | null) => {
    if (!f) return;
    setErro(""); setMenuAnexo(false);
    const r = await prepararImagem(f);
    if ("erro" in r) return setErro(r.erro);
    if (anexo) URL.revokeObjectURL(anexo.url);
    setAnexo({ blob: r.blob, mime: r.mime, url: URL.createObjectURL(r.blob) });
  };

  // ---------- conversas diretas, grupos, compartilhar
  const abrirDm = async (com: string): Promise<string | null> => {
    const r = await chatApi<{ sala_id: string }>("criar_dm", { com });
    if (!r.ok) { setErro(r.erro || "Não consegui abrir a conversa."); return null; }
    await carregarSalas();
    return r.dados.sala_id;
  };
  const clicarPessoa = async (com: string) => { const id = await abrirDm(com); if (id) abrirSala(id); };

  const criarGrupo = async () => {
    const r = await chatApi<{ sala_id: string }>("criar_grupo", { nome: nomeGrupo, membros: Array.from(escolhidos) });
    if (!r.ok) return setErro(r.erro || "Não consegui criar o grupo.");
    setModal(null); setNomeGrupo(""); setEscolhidos(new Set());
    await carregarSalas(); avisarOutros(r.dados.sala_id); abrirSala(r.dados.sala_id);
  };

  const editarGrupo = async (corpo: any) => {
    if (!salaId) return;
    const r = await chatApi("grupo_editar", { sala_id: salaId, ...corpo });
    if (!r.ok) return setErro(r.erro || "Não consegui salvar.");
    await carregarSalas(); avisarOutros(salaId);
    if (corpo.sair) { setModal(null); setSalaId(null); setMsgs([]); }
  };

  const enviarCompartilhado = async (idSala: string) => {
    if (!pendente) return;
    const ok = await enviarMsg(idSala, pendente.tipo === "tarefa" ? { tipo: "tarefa", tarefa_id: pendente.tarefa_id } : { tipo: "notificacao", payload: pendente.payload });
    if (ok) { setPendente(null); setModal(null); abrirSala(idSala); mostrarAviso("Enviado no chat ✔"); }
  };
  const compartilharComPessoa = async (com: string) => { const id = await abrirDm(com); if (id) await enviarCompartilhado(id); };

  const abrirTarefas = async () => {
    setMenuAnexo(false); setModal("tarefa"); setTarefas(null);
    const r = await chatApi<{ tarefas: any[] }>("tarefas");
    setTarefas(r.ok ? r.dados.tarefas : []);
  };
  const enviarTarefa = async (t: Tarefa) => { if (!salaId) return; if (await enviarMsg(salaId, { tipo: "tarefa", tarefa_id: t.id })) setModal(null); };

  const resetarSenha = async () => {
    if (!alvoReset) return;
    const r = await chatApi("resetar_senha", { alvo: alvoReset });
    if (!r.ok) return setErro(r.erro || "Não consegui redefinir.");
    mostrarAviso(`Senha do chat de ${nomeDoEmail(alvoReset)} redefinida: ela cria uma nova no próximo acesso.`); setAlvoReset("");
  };

  // ---------- visual
  const conversasFiltradas = salas.filter((s) => !busca.trim() || nomeDaSala(s, email).toLowerCase().includes(busca.trim().toLowerCase()));
  const comDm = new Set(salas.filter((s) => s.tipo === "dm").flatMap((s) => s.membros.map((m) => m.email)));
  const pessoasSemDm = usuarios.filter((u) => !comDm.has(u) && (!busca.trim() || u.includes(busca.trim().toLowerCase()) || nomeDoEmail(u).toLowerCase().includes(busca.trim().toLowerCase())));

  if (!email || pathname === "/login") return null;

  const Badge = ({ n }: { n: number }) => (n > 0 ? <span data-chat-badge className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">{n > 99 ? "99+" : n}</span> : null);
  const iconeSala = (s: SalaChat) => (s.tipo === "geral" ? "📢" : s.tipo === "grupo" ? "👥" : "👤");
  const itemCls = (ativo: boolean) => `w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 cursor-pointer transition ${ativo ? "bg-indigo-600/25 text-white" : "text-slate-300 hover:bg-slate-800/70"}`;
  const modalCls = "absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4";
  const caixaCls = "w-full max-w-sm max-h-full overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3 shadow-2xl";
  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500";
  const souAdminDoGrupo = sala?.tipo === "grupo" && sala.membros.some((m) => m.email === email && m.papel === "admin");
  const ehAdminApp = souAdmin || perfilLogado() === "admin";

  const listaPessoas = (aoEscolher: (e: string) => void, marcados?: Set<string>) => (
    <div className="max-h-56 overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-800/70">
      {usuarios.map((u) => (
        <button key={u} type="button" onClick={() => aoEscolher(u)} data-chat-pessoa={u} className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 cursor-pointer hover:bg-slate-800/70 ${marcados?.has(u) ? "bg-indigo-600/25 text-white" : "text-slate-300"}`}>
          {marcados && <span>{marcados.has(u) ? "☑" : "☐"}</span>}<Avatar email={u} tamanho={22} /><span className="truncate">{nomeDoEmail(u)}</span><span className="text-[10px] text-slate-500 truncate">{u}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed bottom-5 right-5 z-[9000] flex flex-col items-end gap-3 print:hidden" data-chat>
      {aberto && (
        <div className={telaCheia ? "fixed inset-0 z-[9100] bg-slate-900 flex flex-col overflow-hidden" : "relative w-[min(96vw,820px)] h-[min(84vh,680px)] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden"} data-chat-painel data-chat-tela={telaCheia ? "cheia" : "janela"}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950 shrink-0">
            <div>
              <p className="text-sm font-black text-white">💬 Chat interno</p>
              <p className="text-[10px] text-slate-500">Conversas privadas · as mensagens ficam por 7 dias e depois são apagadas.</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={alternarTela} data-chat-expandir aria-label={telaCheia ? "Voltar para janela" : "Expandir para tela cheia"} title={telaCheia ? "Voltar para janela (Esc)" : "Expandir para tela cheia"} className="text-slate-400 hover:text-white text-base px-2 cursor-pointer">{telaCheia ? "🗗" : "⛶"}</button>
              {fase === "ok" && <button type="button" onClick={() => setModal("config")} data-chat-config aria-label="Configurações do chat" className="text-slate-400 hover:text-white text-base px-2 cursor-pointer">⚙️</button>}
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar chat" className="text-slate-400 hover:text-white text-lg px-2 cursor-pointer">✕</button>
            </div>
          </div>

          {fase !== "ok" ? (
            <ChatPin email={email} temSenha={temSenha} onPronto={() => { setFase("ok"); }} />
          ) : (
            <div className="flex flex-1 min-h-0">
              {/* lista de conversas */}
              <div className={`${salaId ? "hidden sm:flex" : "flex"} w-full ${telaCheia ? "sm:w-80" : "sm:w-60"} shrink-0 border-r border-slate-800 flex-col bg-slate-950/50`}>
                <div className="p-2 flex gap-2">
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conversa ou pessoa..." data-chat-busca className={inputCls + " !py-1.5 !text-[11px]"} />
                  <button type="button" onClick={() => { setModal("grupo"); setErro(""); }} data-chat-novo-grupo title="Novo grupo" className="shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-2.5 rounded-xl cursor-pointer">👥+</button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {conversasFiltradas.map((s) => (
                    <button key={s.id} type="button" data-chat-sala={s.tipo === "geral" ? "geral" : s.id} data-chat-nome={nomeDaSala(s, email)} onClick={() => abrirSala(s.id)} className={itemCls(salaId === s.id)}>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-bold truncate">{s.tipo === "dm" ? <Avatar email={s.membros.find((x) => x.email !== email)?.email || ""} tamanho={22} /> : <span>{iconeSala(s)}</span>}<span className="truncate">{nomeDaSala(s, email)}</span></span>
                        {s.ultima && <span className="block text-[10px] text-slate-500 truncate">{s.ultima.de === email ? "Você: " : s.tipo !== "dm" ? nomeDoEmail(s.ultima.de).split(" ")[0] + ": " : ""}{s.ultima.texto}</span>}
                      </span>
                      <Badge n={s.nao_lidas} />
                    </button>
                  ))}
                  {pessoasSemDm.length > 0 && <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase text-slate-500">Iniciar conversa</p>}
                  {pessoasSemDm.map((u) => (
                    <button key={u} type="button" data-chat-pessoa-nova={u} onClick={() => clicarPessoa(u)} className={itemCls(false)} title={u}>
                      <span className="flex items-center gap-1.5 truncate"><Avatar email={u} tamanho={22} /><span className="truncate">{nomeDoEmail(u)}</span></span>
                    </button>
                  ))}
                </div>
              </div>

              {/* conversa */}
              <div className={`${salaId ? "flex" : "hidden sm:flex"} flex-1 min-w-0 flex-col`}>
                {!sala ? (
                  <div className="flex-1 flex items-center justify-center text-[11px] text-slate-500">Escolha uma conversa.</div>
                ) : (
                  <>
                    <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <button type="button" onClick={() => { setSalaId(null); setMsgs([]); }} className="sm:hidden text-slate-400 text-sm cursor-pointer" aria-label="Voltar">←</button>
                        {sala.tipo === "dm" && <Avatar email={sala.membros.find((x) => x.email !== email)?.email || ""} tamanho={26} />}
                        <p className="text-xs font-bold text-slate-100 truncate" data-chat-titulo>{iconeSala(sala)} {nomeDaSala(sala, email)}</p>
                        {sala.tipo === "grupo" && <span className="text-[10px] text-slate-500">{sala.membros.length} membros</span>}
                        {sala.tipo === "geral" && <span className="text-[10px] text-slate-500">todos do sistema</span>}
                      </div>
                      {sala.tipo === "grupo" && <button type="button" onClick={() => setModal("membros")} data-chat-membros className="text-[11px] font-bold text-indigo-300 hover:text-indigo-200 cursor-pointer shrink-0">Membros</button>}
                    </div>
                    <div className={`flex-1 overflow-y-auto py-3 space-y-1.5 ${telaCheia ? "px-[max(1rem,8%)]" : "px-3"}`} data-chat-mensagens>
                      {msgs.length === 0 && <p className="text-center text-[11px] text-slate-500 mt-6">Nenhuma mensagem ainda. Comece a conversa!</p>}
                      {msgs.map((m, i) => (
                        <React.Fragment key={m.id}>
                          {(i === 0 || chaveDia(msgs[i - 1].criado_em) !== chaveDia(m.criado_em)) && <p className="text-center text-[10px] font-bold text-slate-500 uppercase py-1">{rotuloDia(m.criado_em)}</p>}
                          <ChatMensagem m={m} minha={m.de_email === email} mostrarNome={sala.tipo !== "dm"} onImagem={setImagemGrande} onImagemErro={() => carregarMsgs(true, true)} onExcluir={excluirMsg} />
                        </React.Fragment>
                      ))}
                      <div ref={fimRef} />
                    </div>
                    {erro && <p className="px-3 pb-1 text-[11px] text-rose-400" data-chat-erro>{erro}</p>}
                    {aviso && <p className="px-3 pb-1 text-[11px] text-emerald-400">{aviso}</p>}
                    {anexo && (
                      <div className="mx-3 mb-2 flex items-center gap-3 bg-slate-950 border border-slate-700 rounded-xl p-2" data-chat-previa>
                        <img src={anexo.url} alt="prévia" className="h-14 w-14 object-cover rounded-lg" />
                        <p className="flex-1 text-[11px] text-slate-300">Imagem pronta para enviar. Se quiser, escreva uma legenda.</p>
                        <button type="button" onClick={() => { URL.revokeObjectURL(anexo.url); setAnexo(null); }} className="text-slate-400 hover:text-white cursor-pointer px-2">✕</button>
                      </div>
                    )}
                    <form onSubmit={(e) => { e.preventDefault(); enviar(); }} className="p-3 border-t border-slate-800 flex items-end gap-2 shrink-0">
                      <div className="relative">
                        <button type="button" onClick={() => setMenuAnexo((v) => !v)} data-chat-anexar aria-label="Anexar" className="h-9 w-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-base cursor-pointer">📎</button>
                        {menuAnexo && (
                          <div className="absolute bottom-11 left-0 w-44 bg-slate-950 border border-slate-700 rounded-xl overflow-hidden shadow-xl z-10">
                            <button type="button" onClick={() => arquivoRef.current?.click()} data-chat-anexar-imagem className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer">🖼️ Imagem</button>
                            <button type="button" onClick={abrirTarefas} data-chat-anexar-tarefa className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer">📝 Tarefa</button>
                            <p className="px-3 py-2 text-[10px] text-slate-500 border-t border-slate-800">Notificações: use 💬 nos cartões da tela Início.</p>
                          </div>
                        )}
                        <input ref={arquivoRef} type="file" accept="image/*" hidden data-chat-arquivo onChange={(e) => { escolherImagem(e.target.files?.[0]); e.target.value = ""; }} />
                      </div>
                      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={1} maxLength={MAX_TEXTO} data-chat-texto
                        placeholder={anexo ? "Legenda (opcional)..." : `Mensagem para ${nomeDaSala(sala, email)}... (SKU ou link vira card)`}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                        onPaste={(e) => { const f = Array.from(e.clipboardData.files || []).find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); escolherImagem(f); } }}
                        className="flex-1 resize-none max-h-24 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500" />
                      <button type="submit" disabled={enviando || (!texto.trim() && !anexo)} data-chat-enviar className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold px-4 h-9 rounded-xl cursor-pointer">{enviando ? "…" : "Enviar"}</button>
                    </form>
                  </>
                )}
              </div>
            </div>
          )}

          {/* janelas por cima do painel */}
          {modal === "grupo" && (
            <div className={modalCls} data-chat-modal="grupo"><div className={caixaCls}>
              <h3 className="text-sm font-black text-white">👥 Novo grupo</h3>
              <input value={nomeGrupo} onChange={(e) => setNomeGrupo(e.target.value)} maxLength={40} placeholder="Nome do grupo" data-chat-grupo-nome className={inputCls} />
              <p className="text-[10px] font-bold uppercase text-slate-500">Quem participa ({escolhidos.size})</p>
              {listaPessoas((u) => setEscolhidos((s) => { const n = new Set(s); if (n.has(u)) n.delete(u); else n.add(u); return n; }), escolhidos)}
              {erro && <p className="text-[11px] text-rose-400">{erro}</p>}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setModal(null); setErro(""); }} className="px-3 py-2 text-xs text-slate-300 cursor-pointer">Cancelar</button>
                <button type="button" onClick={criarGrupo} disabled={!nomeGrupo.trim() || escolhidos.size === 0} data-chat-grupo-criar className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer">Criar grupo</button>
              </div>
            </div></div>
          )}

          {modal === "membros" && sala?.tipo === "grupo" && (
            <div className={modalCls} data-chat-modal="membros"><div className={caixaCls}>
              <h3 className="text-sm font-black text-white">👥 {sala.nome}</h3>
              <div className="border border-slate-800 rounded-xl divide-y divide-slate-800/70">
                {sala.membros.map((m) => (
                  <div key={m.email} className="px-3 py-2 text-xs flex items-center justify-between gap-2 text-slate-200">
                    <span className="flex items-center gap-2 truncate"><Avatar email={m.email} tamanho={24} /><span className="truncate">{nomeDoEmail(m.email)}</span>{m.papel === "admin" && <span className="ml-2 text-[10px] text-amber-300">admin</span>}</span>
                    {souAdminDoGrupo && m.email !== email && <button type="button" onClick={() => editarGrupo({ remover: m.email })} className="text-[10px] text-rose-400 hover:text-rose-300 cursor-pointer">remover</button>}
                  </div>
                ))}
              </div>
              {souAdminDoGrupo && usuarios.some((u) => !sala.membros.some((m) => m.email === u)) && (
                <label className="block text-[10px] font-bold uppercase text-slate-500">Adicionar pessoa
                  <select defaultValue="" data-chat-adicionar onChange={(e) => { if (e.target.value) editarGrupo({ adicionar: [e.target.value] }); e.target.value = ""; }} className={inputCls + " mt-1 normal-case"}>
                    <option value="">Escolha…</option>
                    {usuarios.filter((u) => !sala.membros.some((m) => m.email === u)).map((u) => <option key={u} value={u}>{nomeDoEmail(u)}</option>)}
                  </select>
                </label>
              )}
              {erro && <p className="text-[11px] text-rose-400">{erro}</p>}
              <div className="flex gap-2 justify-between">
                <button type="button" onClick={() => { if (confirm("Sair deste grupo?")) editarGrupo({ sair: true }); }} data-chat-sair className="px-3 py-2 text-xs text-rose-400 cursor-pointer">Sair do grupo</button>
                <button type="button" onClick={() => setModal(null)} className="bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer">Fechar</button>
              </div>
            </div></div>
          )}

          {modal === "tarefa" && (
            <div className={modalCls} data-chat-modal="tarefa"><div className={caixaCls}>
              <h3 className="text-sm font-black text-white">📝 Enviar uma tarefa</h3>
              {tarefas === null && <p className="text-xs text-slate-400">Carregando…</p>}
              {tarefas && tarefas.length === 0 && <p className="text-xs text-slate-400">Nenhuma tarefa em aberto para você.</p>}
              <div className="max-h-64 overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-800/70">
                {(tarefas || []).map((t) => (
                  <button key={t.id} type="button" onClick={() => enviarTarefa(t)} data-chat-tarefa={t.id} className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800/70 cursor-pointer">
                    <span className="block font-bold truncate">{t.titulo}</span>
                    <span className="block text-[10px] text-slate-500">{t.ciclica ? `Repete: ${t.ciclica}` : t.data_entrega ? `Prazo ${String(t.data_entrega).split("-").reverse().join("/")}` : "Sem prazo"}</span>
                  </button>
                ))}
              </div>
              <div className="text-right"><button type="button" onClick={() => setModal(null)} className="px-3 py-2 text-xs text-slate-300 cursor-pointer">Cancelar</button></div>
            </div></div>
          )}

          {modal === "compartilhar" && (
            <div className={modalCls} data-chat-modal="compartilhar"><div className={caixaCls}>
              <h3 className="text-sm font-black text-white">Enviar {pendente?.tipo === "tarefa" ? "a tarefa" : "a notificação"} para…</h3>
              {fase !== "ok" ? <p className="text-xs text-amber-300">Entre no chat com a sua senha para escolher a conversa.</p> : (
                <>
                  <div className="max-h-52 overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-800/70">
                    {salas.map((s) => <button key={s.id} type="button" onClick={() => enviarCompartilhado(s.id)} data-chat-destino={s.tipo === "geral" ? "geral" : s.id} className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800/70 cursor-pointer">{iconeSala(s)} {nomeDaSala(s, email)}</button>)}
                  </div>
                  {usuarios.some((u) => !comDm.has(u)) && <p className="text-[10px] font-bold uppercase text-slate-500">Ou uma pessoa nova</p>}
                  <div className="max-h-32 overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-800/70">
                    {usuarios.filter((u) => !comDm.has(u)).map((u) => <button key={u} type="button" onClick={() => compartilharComPessoa(u)} className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800/70 cursor-pointer">👤 {nomeDoEmail(u)}</button>)}
                  </div>
                </>
              )}
              {erro && <p className="text-[11px] text-rose-400">{erro}</p>}
              <div className="text-right"><button type="button" onClick={() => { setModal(null); setPendente(null); }} className="px-3 py-2 text-xs text-slate-300 cursor-pointer">Cancelar</button></div>
            </div></div>
          )}

          {modal === "config" && (
            <div className={modalCls} data-chat-modal="config"><div className={caixaCls}>
              <h3 className="text-sm font-black text-white">⚙️ Configurações do chat</h3>
              <button type="button" onClick={() => { setModal(null); abrirEscolhaDeAvatar(); }} data-chat-avatar className="w-full text-left bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 px-3 py-2 rounded-xl cursor-pointer flex items-center gap-2"><Avatar email={email} tamanho={22} /> Meu avatar (personagem ou foto)</button>
              <button type="button" onClick={() => { sairDoChat(); setModal(null); setFase("pin"); setSalas([]); setSalaId(null); }} data-chat-bloquear className="w-full text-left bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 px-3 py-2 rounded-xl cursor-pointer">🔒 Bloquear o chat neste navegador</button>
              {ehAdminApp && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Administrador: redefinir senha do chat de…</p>
                  <select value={alvoReset} onChange={(e) => setAlvoReset(e.target.value)} data-chat-reset-alvo className={inputCls}>
                    <option value="">Escolha…</option>
                    {usuarios.map((u) => <option key={u} value={u}>{nomeDoEmail(u)}</option>)}
                  </select>
                  <button type="button" onClick={resetarSenha} disabled={!alvoReset} data-chat-reset className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-bold px-3 py-2 rounded-xl cursor-pointer">Redefinir</button>
                </div>
              )}
              {erro && <p className="text-[11px] text-rose-400">{erro}</p>}
              {aviso && <p className="text-[11px] text-emerald-400">{aviso}</p>}
              <div className="text-right"><button type="button" onClick={() => setModal(null)} className="bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer">Fechar</button></div>
            </div></div>
          )}
        </div>
      )}

      {imagemGrande && (
        <div className="fixed inset-0 z-[9500] bg-black/85 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setImagemGrande(null)} data-chat-lightbox>
          <img src={imagemGrande} alt="imagem ampliada" className="max-h-[92vh] max-w-[94vw] rounded-lg" />
        </div>
      )}

      <button type="button" onClick={() => setAberto((a) => !a)} data-chat-botao style={aberto && telaCheia ? { display: "none" } : undefined} aria-label="Abrir chat interno"
        className="relative w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-2xl shadow-xl shadow-indigo-900/50 cursor-pointer flex items-center justify-center">
        💬
        {totalNaoLidas > 0 && <span data-chat-total className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center">{totalNaoLidas > 99 ? "99+" : totalNaoLidas}</span>}
      </button>
    </div>
  );
}
