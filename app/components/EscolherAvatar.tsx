"use client";
// Janela para a pessoa escolher o próprio avatar (personagem ou foto). Abre com o evento "avatar:escolher" de qualquer tela.
import React, { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import { PERSONAGENS, carregarAvatares, avatarEmCache, salvarAvatar, prepararFoto, enviarFoto, type AvatarConfig } from "../../lib/avatar";

export const abrirEscolhaDeAvatar = () => window.dispatchEvent(new CustomEvent("avatar:escolher"));

export default function EscolherAvatar() {
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState("");
  const [aba, setAba] = useState<"personagem" | "foto">("personagem");
  const [previa, setPrevia] = useState<{ blob: Blob; url: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [atual, setAtual] = useState<AvatarConfig | null>(null);
  const arq = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const abrir = async () => {
      let e = ""; try { e = String(JSON.parse(localStorage.getItem("usuario_logado") || "null")?.email || "").trim().toLowerCase(); } catch { /* sem login */ }
      if (!e) return;
      setEmail(e); setMsg(""); setPrevia(null);
      await carregarAvatares(); const c = avatarEmCache(e); setAtual(c); setAba(c?.tipo === "foto" ? "foto" : "personagem"); setAberto(true);
    };
    window.addEventListener("avatar:escolher", abrir);
    return () => window.removeEventListener("avatar:escolher", abrir);
  }, []);
  useEffect(() => { if (!aberto) return; const f = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); }; window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [aberto]);

  if (!aberto) return null;
  const gravar = async (cfg: AvatarConfig | null) => {
    setOcupado(true); setMsg("");
    const e = await salvarAvatar(email, cfg);
    setOcupado(false);
    if (e) return setMsg("Não consegui salvar: " + e);
    setAtual(cfg); setAberto(false);
  };
  const escolherArquivo = async (f?: File | null) => {
    if (!f) return; setMsg("");
    const r = await prepararFoto(f);
    if ("erro" in r) return setMsg(r.erro);
    if (previa) URL.revokeObjectURL(previa.url);
    setPrevia({ blob: r, url: URL.createObjectURL(r) });
  };
  const salvarFoto = async () => {
    if (!previa) return;
    setOcupado(true); setMsg("");
    const up = await enviarFoto(email, previa.blob);
    if ("erro" in up) { setOcupado(false); return setMsg(up.erro); }
    setOcupado(false); await gravar({ tipo: "foto", url: up.url });
  };

  return (
    <div className="fixed inset-0 z-[9600] bg-black/70 flex items-center justify-center p-4" onClick={() => setAberto(false)} data-avatar-modal>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <Avatar email={email} tamanho={56} />
          <div className="flex-1"><h3 className="text-sm font-black text-white">Meu avatar</h3><p className="text-[11px] text-slate-400">Aparece no chat, no menu e nas telas do sistema.</p></div>
          <button type="button" onClick={() => setAberto(false)} className="text-slate-400 hover:text-white text-lg cursor-pointer" aria-label="Fechar">✕</button>
        </div>
        <div className="flex gap-2">
          {(["personagem", "foto"] as const).map((a) => (
            <button key={a} type="button" data-avatar-aba={a} onClick={() => setAba(a)} className={`flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer ${aba === a ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{a === "personagem" ? "🎭 Personagens" : "📷 Minha foto"}</button>
          ))}
        </div>
        {aba === "personagem" ? (
          <div className="grid grid-cols-5 gap-2">
            {PERSONAGENS.map((p) => (
              <button key={p.id} type="button" title={p.nome} disabled={ocupado} data-personagem={p.id} onClick={() => gravar({ tipo: "personagem", id: p.id })}
                className={`aspect-square rounded-xl text-2xl flex items-center justify-center cursor-pointer border-2 transition hover:scale-105 ${atual?.tipo === "personagem" && atual.id === p.id ? "border-white" : "border-transparent"}`} style={{ background: p.fundo }}>{p.emoji}</button>
            ))}
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <div className="mx-auto w-32 h-32 rounded-full overflow-hidden bg-slate-800 flex items-center justify-center border border-slate-700">
              {previa ? <img src={previa.url} alt="prévia" className="w-full h-full object-cover" data-avatar-previa /> : <Avatar email={email} tamanho={128} />}
            </div>
            <input ref={arq} type="file" accept="image/*" hidden data-avatar-arquivo onChange={(e) => { escolherArquivo(e.target.files?.[0]); e.target.value = ""; }} />
            <div className="flex gap-2 justify-center">
              <button type="button" onClick={() => arq.current?.click()} className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer">Escolher foto…</button>
              <button type="button" onClick={salvarFoto} disabled={!previa || ocupado} data-avatar-salvar-foto className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer">{ocupado ? "Salvando…" : "Usar esta foto"}</button>
            </div>
            <p className="text-[10px] text-slate-500">A foto é recortada em quadrado e reduzida automaticamente.</p>
          </div>
        )}
        {msg && <p className="text-[11px] text-rose-400">{msg}</p>}
        {atual && <button type="button" onClick={() => gravar(null)} disabled={ocupado} data-avatar-remover className="text-[11px] text-slate-400 hover:text-rose-300 underline cursor-pointer">Remover meu avatar (voltar às iniciais)</button>}
      </div>
    </div>
  );
}
