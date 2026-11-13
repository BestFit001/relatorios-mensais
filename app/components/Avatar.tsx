"use client";
// Avatar redondo de uma pessoa (personagem, foto ou iniciais). Atualiza sozinho quando alguém troca o avatar.
import React, { useEffect, useState } from "react";
import { carregarAvatares, avatarEmCache, corPadrao, iniciais, personagemPorId, EVENTO_AVATAR } from "../../lib/avatar";

export default function Avatar({ email, tamanho = 32, className = "" }: { email: string; tamanho?: number; className?: string }) {
  const chave = String(email || "").trim().toLowerCase();
  const [cfg, setCfg] = useState(() => avatarEmCache(chave));
  const [fotoQuebrada, setFotoQuebrada] = useState(false);
  useEffect(() => {
    let vivo = true;
    const atualizar = () => { if (vivo) { setCfg(avatarEmCache(chave)); setFotoQuebrada(false); } };
    carregarAvatares().then(atualizar);
    window.addEventListener(EVENTO_AVATAR, atualizar);
    return () => { vivo = false; window.removeEventListener(EVENTO_AVATAR, atualizar); };
  }, [chave]);

  const base = { width: tamanho, height: tamanho, fontSize: tamanho * 0.5 } as React.CSSProperties;
  if (cfg?.tipo === "foto" && !fotoQuebrada) {
    return <img src={cfg.url} alt="" data-avatar="foto" onError={() => setFotoQuebrada(true)} style={base} className={`rounded-full object-cover shrink-0 bg-slate-700 ${className}`} />;
  }
  if (cfg?.tipo === "personagem") {
    const p = personagemPorId(cfg.id);
    if (p) return <span data-avatar="personagem" title={p.nome} style={{ ...base, background: p.fundo }} className={`rounded-full inline-flex items-center justify-center shrink-0 leading-none ${className}`}>{p.emoji}</span>;
  }
  return <span data-avatar="iniciais" style={{ ...base, fontSize: tamanho * 0.38, background: corPadrao(chave) }} className={`rounded-full inline-flex items-center justify-center shrink-0 font-black text-white ${className}`}>{iniciais(chave)}</span>;
}
