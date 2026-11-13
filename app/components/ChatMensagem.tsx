"use client";
// Balão de uma mensagem do chat: texto, imagem e os cartões (produto, pai, tarefa, notificação).
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";
import { type MensagemChat, horaSP, nomeDoEmail, rotaDaNotificacao, rotuloDoLink, URL_NO_TEXTO } from "../../lib/chat";

const chip = "px-1.5 py-0.5 rounded text-[10px] font-bold border";

function CartaoLink({ p }: { p: any }) {
  const [semFoto, setSemFoto] = useState(false);
  const preco = typeof p.preco === "number" ? p.preco.toLocaleString("pt-BR", { style: "currency", currency: p.moeda && /^[A-Z]{3}$/.test(p.moeda) ? p.moeda : "BRL" }) : null;
  return (
    <a href={p.url} target="_blank" rel="noopener noreferrer" data-card-link title={p.url} className="block w-56 rounded-xl overflow-hidden bg-slate-950/60 border border-slate-700 hover:border-indigo-400 transition no-underline">
      {p.imagem && !semFoto ? (
        <div className="aspect-square bg-white flex items-center justify-center">
          <img src={p.imagem} alt={p.titulo || "anúncio"} referrerPolicy="no-referrer" loading="lazy" onError={() => setSemFoto(true)} className="w-full h-full object-contain" />
        </div>
      ) : (
        <div className="h-16 bg-slate-800 flex items-center justify-center text-3xl opacity-60">🛍️</div>
      )}
      <div className="p-2.5 space-y-1">
        <p className="text-[10px] font-bold uppercase text-slate-400">🔗 {p.site}</p>
        <p className="text-xs font-bold text-white leading-snug line-clamp-3">{p.titulo}</p>
        {preco && <p className="text-sm font-black text-emerald-400">{preco}</p>}
        <p className="text-[11px] font-bold text-indigo-300">Abrir anúncio ↗</p>
      </div>
    </a>
  );
}

/** Texto com os links compridos trocados por um rótulo curto e clicável. */
function TextoComLinks({ texto }: { texto: string }) {
  const partes: React.ReactNode[] = [];
  let ultimo = 0, k = 0;
  for (const m of texto.matchAll(URL_NO_TEXTO)) {
    const bruto = m[0], url = bruto.replace(/[.,;:!?)\]}]+$/, "");
    const ini = m.index || 0;
    partes.push(texto.slice(ultimo, ini));
    partes.push(<a key={k++} href={url} target="_blank" rel="noopener noreferrer" className="underline font-bold" title={url}>{rotuloDoLink(url)}</a>);
    ultimo = ini + url.length;
  }
  partes.push(texto.slice(ultimo));
  return <p className="whitespace-pre-wrap break-words">{partes}</p>;
}

function CartaoProduto({ p }: { p: any }) {
  if (p.naoEncontrado) return <div className="text-xs text-amber-300">🔎 SKU <span className="font-mono font-bold">{p.sku}</span> não encontrado na base.</div>;
  return (
    <div className="w-60 sm:w-64 space-y-1.5" data-card-produto>
      <p className="text-[10px] font-bold uppercase text-slate-400">🔎 Produto</p>
      <p className="font-mono text-xs font-bold text-indigo-300">{p.sku}</p>
      {p.produto && <p className="text-xs font-bold text-white leading-snug">{p.produto}</p>}
      <div className="flex flex-wrap gap-1">
        {p.marca && <span className={`${chip} bg-slate-800 text-slate-300 border-slate-700`}>{p.marca}</span>}
        <span className={`${chip} ${p.status === "Obsoleto" ? "bg-rose-950/60 text-rose-400 border-rose-900/50" : "bg-emerald-950/60 text-emerald-400 border-emerald-900/50"}`}>{p.status}</span>
        {p.exclusao && <span className={`${chip} bg-amber-950/60 text-amber-300 border-amber-800/60`}>Para exclusão</span>}
        {p.estoque !== null && p.estoque !== undefined && <span className={`${chip} ${p.estoque > 0 ? "bg-emerald-950/60 text-emerald-400 border-emerald-900/50" : "bg-rose-950/60 text-rose-400 border-rose-900/50"}`}>Estoque {p.estoque}</span>}
        <span className={`${chip} bg-slate-800 text-slate-300 border-slate-700`}>Pai {p.pai}</span>
      </div>
      <p className="text-[11px] text-slate-300">Cadastrado em <b>{(p.canais || []).length}</b> canal(is){(p.canais || []).length ? `: ${(p.canais as string[]).join(", ")}` : ""}</p>
      {(p.faltam || []).length > 0 && <p className="text-[11px] text-amber-300">Falta em: {(p.faltam as string[]).join(", ")}</p>}
    </div>
  );
}

function CartaoPai({ p }: { p: any }) {
  return (
    <div className="w-60 sm:w-64 space-y-1.5" data-card-pai>
      <p className="text-[10px] font-bold uppercase text-slate-400">🔎 SKU pai</p>
      <p className="font-mono text-sm font-bold text-indigo-300">{p.pai}</p>
      {p.produto && <p className="text-xs font-bold text-white leading-snug">{p.produto}</p>}
      <div className="flex flex-wrap gap-1">
        {p.marca && <span className={`${chip} bg-slate-800 text-slate-300 border-slate-700`}>{p.marca}</span>}
        <span className={`${chip} bg-slate-800 text-slate-300 border-slate-700`}>{p.filhos} filho(s)</span>
        <span className={`${chip} ${p.estoque_total > 0 ? "bg-emerald-950/60 text-emerald-400 border-emerald-900/50" : "bg-rose-950/60 text-rose-400 border-rose-900/50"}`}>Estoque total {p.estoque_total}</span>
      </div>
    </div>
  );
}

function CartaoTarefa({ p, abrir }: { p: any; abrir: () => void }) {
  const prazo = p.ciclica ? `Repete: ${p.ciclica}` : p.data_entrega ? `Prazo ${String(p.data_entrega).split("-").reverse().join("/")}${p.hora_entrega ? " às " + p.hora_entrega : ""}` : "";
  return (
    <div className="w-60 sm:w-64 space-y-1.5" data-card-tarefa>
      <p className="text-[10px] font-bold uppercase text-slate-400">📝 Tarefa</p>
      <p className={`text-xs font-bold leading-snug ${p.concluida ? "line-through text-slate-400" : "text-white"}`}>{p.titulo}</p>
      {p.descricao && <p className="text-[11px] text-slate-300 line-clamp-3">{p.descricao}</p>}
      <div className="flex flex-wrap gap-1">
        {prazo && <span className={`${chip} bg-slate-800 text-slate-300 border-slate-700`}>{prazo}</span>}
        {p.prioridade && <span className={`${chip} bg-amber-950/60 text-amber-300 border-amber-800/60`}>{p.prioridade}</span>}
        {p.concluida && <span className={`${chip} bg-emerald-950/60 text-emerald-400 border-emerald-900/50`}>Concluída</span>}
      </div>
      {(p.responsaveis || []).length > 0 && <p className="text-[11px] text-slate-400">Responsável: {(p.responsaveis as string[]).map((e) => nomeDoEmail(e).split(" ")[0]).join(", ")}</p>}
      <button type="button" onClick={abrir} className="text-[11px] font-bold text-indigo-300 hover:text-indigo-200 cursor-pointer">Abrir tarefas →</button>
    </div>
  );
}

function CartaoNotificacao({ p, abrir }: { p: any; abrir: () => void }) {
  const cor = p.nivel === "critico" ? "text-rose-300" : p.nivel === "atencao" ? "text-amber-300" : "text-sky-300";
  return (
    <div className="w-60 sm:w-64 space-y-1.5" data-card-notificacao>
      <p className={`text-[10px] font-bold uppercase ${cor}`}>🔔 Notificação{p.nivel === "critico" ? " · crítica" : ""}</p>
      <p className="text-xs font-bold text-white leading-snug">{p.titulo}</p>
      {p.detalhe && <p className="text-[11px] text-slate-300 line-clamp-4">{p.detalhe}</p>}
      {p.canal && <span className={`${chip} bg-slate-800 text-slate-300 border-slate-700 inline-block`}>{p.canal}</span>}
      <div><button type="button" onClick={abrir} className="text-[11px] font-bold text-indigo-300 hover:text-indigo-200 cursor-pointer">Abrir no sistema →</button></div>
    </div>
  );
}

export default function ChatMensagem({ m, minha, mostrarNome, onImagem, onImagemErro, onExcluir }: {
  m: MensagemChat; minha: boolean; mostrarNome: boolean; onImagem: (url: string) => void; onImagemErro: () => void; onExcluir: (id: string) => void;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const p = m.payload;
  if (p?.excluida) {
    return (
      <div className={`flex items-end gap-1.5 ${minha ? "justify-end" : "justify-start"}`} data-chat-msg data-tipo="excluida">
        {!minha && <Avatar email={m.de_email} tamanho={28} />}
        <div className="max-w-[88%] rounded-2xl px-3 py-1.5 text-xs border border-slate-700/70 bg-slate-900/60 text-slate-500 italic">
          {mostrarNome && !minha && <p className="text-[10px] font-bold not-italic text-slate-500">{nomeDoEmail(m.de_email)}</p>}
          <p>🚫 Mensagem excluída</p>
          <p className="text-[9px] mt-0.5 text-right not-italic">{horaSP(m.criado_em)}</p>
        </div>
      </div>
    );
  }
  const card = m.tipo === "produto" || m.tipo === "tarefa" || m.tipo === "notificacao";
  const ehLink = m.tipo === "produto" && p?.tipo === "link";
  const links: any[] = m.tipo === "texto" && Array.isArray(p?.links) ? p.links : [];
  return (
    <div className={`flex items-end gap-1.5 ${minha ? "justify-end" : "justify-start"}`} data-chat-msg data-tipo={m.tipo}>
      {!minha && <Avatar email={m.de_email} tamanho={28} />}
      <div className={`max-w-[88%] rounded-2xl px-3 py-1.5 text-xs ${minha ? "bg-indigo-600 text-white rounded-br-sm" : "bg-slate-800 text-slate-100 rounded-bl-sm"}`}>
        {mostrarNome && !minha && <p className="text-[10px] font-bold text-indigo-300">{nomeDoEmail(m.de_email)}</p>}
        {m.tipo === "imagem" && (
          m.anexo_url
            ? <img src={m.anexo_url} alt={m.texto || "imagem enviada"} onClick={() => onImagem(m.anexo_url!)} onError={onImagemErro} data-chat-imagem className="max-h-56 max-w-full rounded-lg cursor-zoom-in my-1" />
            : <p className="text-[11px] opacity-70 italic">📷 imagem indisponível</p>
        )}
        {ehLink && <div className="my-1"><CartaoLink p={p} /></div>}
        {card && !ehLink && (
          <div className={`rounded-xl p-2.5 my-1 ${minha ? "bg-indigo-950/50 border border-indigo-400/40" : "bg-slate-900/70 border border-slate-700"}`}>
            {m.tipo === "produto" && (p?.tipo === "pai" ? <CartaoPai p={p} /> : <CartaoProduto p={p || {}} />)}
            {m.tipo === "tarefa" && <CartaoTarefa p={p || {}} abrir={() => router.push("/inicio")} />}
            {m.tipo === "notificacao" && <CartaoNotificacao p={p || {}} abrir={() => router.push(rotaDaNotificacao(p?.tipo))} />}
          </div>
        )}
        {m.texto && m.tipo !== "produto" && <TextoComLinks texto={m.texto} />}
        {links.length > 0 && <div className="flex flex-wrap gap-2 my-1">{links.map((l, i) => <CartaoLink key={i} p={l} />)}</div>}
        <div className={`flex items-center justify-end gap-2 mt-0.5 text-[9px] ${minha ? "text-indigo-200" : "text-slate-500"}`}>
          {minha && !confirmando && <button type="button" onClick={() => setConfirmando(true)} data-chat-excluir title="Excluir mensagem" className="opacity-60 hover:opacity-100 cursor-pointer">🗑 excluir</button>}
          {minha && confirmando && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold">
              Excluir?
              <button type="button" onClick={() => { setConfirmando(false); onExcluir(m.id); }} data-chat-excluir-sim className="underline cursor-pointer">sim</button>
              <button type="button" onClick={() => setConfirmando(false)} data-chat-excluir-nao className="underline cursor-pointer">não</button>
            </span>
          )}
          <span>{horaSP(m.criado_em)}</span>
        </div>
      </div>
    </div>
  );
}
