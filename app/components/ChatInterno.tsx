"use client";
// Chat interno em tempo real: sala Geral + conversas diretas entre os usuários do sistema.
// Mensagens chegam na hora (Supabase Realtime, com consulta de reserva a cada 20 s) e ficam 7 dias: depois disso o banco apaga
// (tarefa agendada de hora em hora) e a tela já deixa de mostrar.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { tocarAlerta } from "../../lib/som";
import {
  SALA_GERAL, MAX_TEXTO, type MensagemChat, salaDireta, nomeDoEmail, limiteHistorico, aindaVale, mensagemRelevante, horaSP, rotuloDia, chaveDia,
} from "../../lib/chat";

const lerEmail = (): string => {
  try { return String(JSON.parse(localStorage.getItem("usuario_logado") || "null")?.email || "").trim().toLowerCase(); } catch { return ""; }
};
const chaveLido = (email: string) => `chat_lido_v1_${email}`;

export default function ChatInterno() {
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [aberto, setAberto] = useState(false);
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [sala, setSala] = useState<string>(SALA_GERAL);      // 'geral' ou o e-mail da outra pessoa
  const [msgs, setMsgs] = useState<MensagemChat[]>([]);
  const [lidos, setLidos] = useState<Record<string, number>>({});   // sala -> instante da última leitura
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const fimRef = useRef<HTMLDivElement>(null);
  const estado = useRef({ email: "", aberto: false, sala: SALA_GERAL as string, msgs: [] as MensagemChat[] });
  estado.current = { email, aberto, sala, msgs };

  // quem está logado (muda com o login/logout e a navegação)
  useEffect(() => { setEmail(lerEmail()); }, [pathname]);

  const salaDaConversa = useCallback((alvo: string) => (alvo === SALA_GERAL ? SALA_GERAL : salaDireta(estado.current.email, alvo)), []);
  const alvoDaMsg = (m: MensagemChat, meu: string) => (m.sala === SALA_GERAL ? SALA_GERAL : String(m.de_email).toLowerCase() === meu ? String(m.para_email || "") : m.de_email);

  const marcarLido = useCallback((alvo: string) => {
    const e = estado.current.email; if (!e) return;
    setLidos((l) => {
      const novo = { ...l, [alvo]: Date.now() };
      try { localStorage.setItem(chaveLido(e), JSON.stringify(novo)); } catch { /* sem armazenamento */ }
      return novo;
    });
  }, []);

  // chegou mensagem (tempo real, consulta de reserva ou envio próprio)
  const receber = useCallback((m: MensagemChat, tocar = true) => {
    const e = estado.current.email;
    if (!e || !mensagemRelevante(m, e) || !aindaVale(m)) return;
    if (estado.current.msgs.some((x) => x.id === m.id)) return;
    setMsgs((lista) => (lista.some((x) => x.id === m.id) ? lista : [...lista, m].sort((a, b) => a.criado_em.localeCompare(b.criado_em))));
    const minha = String(m.de_email).toLowerCase() === e;
    if (minha) return;
    const alvo = alvoDaMsg(m, e);
    const vendo = estado.current.aberto && estado.current.sala === alvo && !document.hidden;
    if (vendo) { marcarLido(alvo); return; }
    if (tocar) {
      tocarAlerta(1);
      try {
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          const n = new Notification(`${nomeDoEmail(m.de_email)}${m.sala === SALA_GERAL ? " (Geral)" : ""}`, { body: m.texto.slice(0, 140), tag: "chat-" + m.sala, icon: "/favicon.ico" });
          n.onclick = () => { window.focus(); n.close(); };
        }
      } catch { /* notificação é só um extra */ }
    }
  }, [marcarLido]);

  // ao logar: histórico dos últimos 7 dias, lista de pessoas e leituras guardadas
  useEffect(() => {
    if (!email) { setMsgs([]); setUsuarios([]); return; }
    let vivo = true;
    try { setLidos(JSON.parse(localStorage.getItem(chaveLido(email)) || "{}")); } catch { setLidos({}); }
    (async () => {
      try {
        const desde = new Date(limiteHistorico()).toISOString();
        const { data } = await supabase.from("chat_mensagens").select("*").gte("criado_em", desde)
          .or(`sala.eq.${SALA_GERAL},de_email.eq.${email},para_email.eq.${email}`).order("criado_em", { ascending: false }).limit(1000);
        if (vivo && data) setMsgs((data as MensagemChat[]).reverse());
        const { data: us } = await supabase.from("usuarios_permissoes").select("email");
        if (vivo && us) setUsuarios((us as any[]).map((u) => String(u.email).toLowerCase()).filter((x) => x && x !== email).sort());
      } catch { /* sem a tabela ou sem rede: o chat abre vazio */ }
    })();
    return () => { vivo = false; };
  }, [email]);

  // tempo real + consulta de reserva
  useEffect(() => {
    if (!email) return;
    const canal = supabase.channel("chat-interno")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_mensagens" }, (p: any) => receber(p.new as MensagemChat))
      .subscribe();
    const reserva = setInterval(async () => {
      try {
        const ultimo = estado.current.msgs.reduce((mx, m) => (m.criado_em > mx ? m.criado_em : mx), new Date(limiteHistorico()).toISOString());
        const { data } = await supabase.from("chat_mensagens").select("*").gt("criado_em", ultimo)
          .or(`sala.eq.${SALA_GERAL},de_email.eq.${email},para_email.eq.${email}`).order("criado_em", { ascending: true }).limit(200);
        (data as MensagemChat[] | null)?.forEach((m) => receber(m));
        setMsgs((l) => l.filter((m) => aindaVale(m)));   // o que passou de 7 dias some da tela
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 20000);
    return () => { clearInterval(reserva); supabase.removeChannel(canal); };
  }, [email, receber]);

  const msgsDaSala = useMemo(() => {
    if (!email) return [];
    const s = salaDaConversa(sala);
    return msgs.filter((m) => m.sala === s && aindaVale(m));
  }, [msgs, sala, email, salaDaConversa]);

  const naoLidos = useMemo(() => {
    const out: Record<string, number> = {};
    if (!email) return out;
    for (const m of msgs) {
      if (String(m.de_email).toLowerCase() === email) continue;
      const alvo = alvoDaMsg(m, email);
      if (new Date(m.criado_em).getTime() > (lidos[alvo] || 0)) out[alvo] = (out[alvo] || 0) + 1;
    }
    return out;
  }, [msgs, lidos, email]);
  const totalNaoLidos = Object.values(naoLidos).reduce((a, b) => a + b, 0);

  // abrir a conversa marca como lida; rolar para a última mensagem
  useEffect(() => { if (aberto) marcarLido(sala); }, [aberto, sala, msgsDaSala.length, marcarLido]);
  useEffect(() => { if (aberto) fimRef.current?.scrollIntoView({ block: "end" }); }, [aberto, sala, msgsDaSala.length]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando || !email) return;
    setEnviando(true); setErro("");
    const nova = { sala: salaDaConversa(sala), de_email: email, para_email: sala === SALA_GERAL ? null : sala, texto: t.slice(0, MAX_TEXTO) };
    const { data, error } = await supabase.from("chat_mensagens").insert(nova).select("*").single();
    setEnviando(false);
    if (error || !data) { setErro("Não consegui enviar: " + (error?.message || "tente de novo")); return; }
    setTexto("");
    receber(data as MensagemChat, false);
  };

  if (!email || pathname === "/login") return null;

  const pessoas = usuarios.filter((u) => !busca.trim() || u.includes(busca.trim().toLowerCase()) || nomeDoEmail(u).toLowerCase().includes(busca.trim().toLowerCase()));
  const titulo = sala === SALA_GERAL ? "Geral" : nomeDoEmail(sala);
  const itemCls = (ativo: boolean) => `w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 cursor-pointer transition ${ativo ? "bg-indigo-600/25 text-white" : "text-slate-300 hover:bg-slate-800/70"}`;
  const Badge = ({ n }: { n: number }) => (n > 0 ? <span data-chat-badge className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">{n > 99 ? "99+" : n}</span> : null);

  return (
    <div className="fixed bottom-5 right-5 z-[9000] flex flex-col items-end gap-3 print:hidden" data-chat>
      {aberto && (
        <div className="w-[min(94vw,580px)] h-[min(78vh,560px)] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden" data-chat-painel>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950">
            <div>
              <p className="text-sm font-black text-white">💬 Chat interno</p>
              <p className="text-[10px] text-slate-500">As mensagens ficam por 7 dias e depois são apagadas.</p>
            </div>
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar chat" className="text-slate-400 hover:text-white text-lg px-2 cursor-pointer">✕</button>
          </div>
          <div className="flex flex-1 min-h-0">
            <div className="w-36 sm:w-44 border-r border-slate-800 flex flex-col bg-slate-950/50">
              <button type="button" data-chat-sala="geral" onClick={() => setSala(SALA_GERAL)} className={itemCls(sala === SALA_GERAL)}>
                <span className="font-bold">📢 Geral</span><Badge n={naoLidos[SALA_GERAL] || 0} />
              </button>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa..." data-chat-busca
                className="mx-2 my-2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none focus:border-indigo-500" />
              <div className="flex-1 overflow-y-auto">
                {pessoas.map((u) => (
                  <button key={u} type="button" data-chat-sala={u} onClick={() => setSala(u)} className={itemCls(sala === u)} title={u}>
                    <span className="truncate">{nomeDoEmail(u)}</span><Badge n={naoLidos[u] || 0} />
                  </button>
                ))}
                {pessoas.length === 0 && <p className="px-3 py-2 text-[11px] text-slate-500">Ninguém encontrado.</p>}
              </div>
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="px-4 py-2 border-b border-slate-800 text-xs font-bold text-slate-200 truncate">{titulo}{sala !== SALA_GERAL && <span className="ml-2 font-normal text-slate-500">{sala}</span>}</div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5" data-chat-mensagens>
                {msgsDaSala.length === 0 && <p className="text-center text-[11px] text-slate-500 mt-6">Nenhuma mensagem ainda. Comece a conversa!</p>}
                {msgsDaSala.map((m, i) => {
                  const minha = String(m.de_email).toLowerCase() === email;
                  const novoDia = i === 0 || chaveDia(msgsDaSala[i - 1].criado_em) !== chaveDia(m.criado_em);
                  return (
                    <React.Fragment key={m.id}>
                      {novoDia && <p className="text-center text-[10px] font-bold text-slate-500 uppercase py-1">{rotuloDia(m.criado_em)}</p>}
                      <div className={`flex ${minha ? "justify-end" : "justify-start"}`} data-chat-msg>
                        <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-xs ${minha ? "bg-indigo-600 text-white rounded-br-sm" : "bg-slate-800 text-slate-100 rounded-bl-sm"}`}>
                          {!minha && sala === SALA_GERAL && <p className="text-[10px] font-bold text-indigo-300">{nomeDoEmail(m.de_email)}</p>}
                          <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                          <p className={`text-[9px] mt-0.5 text-right ${minha ? "text-indigo-200" : "text-slate-500"}`}>{horaSP(m.criado_em)}</p>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={fimRef} />
              </div>
              {erro && <p className="px-3 text-[11px] text-rose-400" data-chat-erro>{erro}</p>}
              <form onSubmit={(e) => { e.preventDefault(); enviar(); }} className="p-3 border-t border-slate-800 flex items-end gap-2">
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={1} maxLength={MAX_TEXTO} placeholder={`Mensagem para ${titulo}...`} data-chat-texto
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                  className="flex-1 resize-none max-h-24 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500" />
                <button type="submit" disabled={enviando || !texto.trim()} data-chat-enviar className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer">Enviar</button>
              </form>
            </div>
          </div>
        </div>
      )}
      <button type="button" onClick={() => setAberto((a) => !a)} data-chat-botao aria-label="Abrir chat interno"
        className="relative w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-2xl shadow-xl shadow-indigo-900/50 cursor-pointer flex items-center justify-center">
        💬
        {totalNaoLidos > 0 && <span data-chat-total className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center">{totalNaoLidos > 99 ? "99+" : totalNaoLidos}</span>}
      </button>
    </div>
  );
}
