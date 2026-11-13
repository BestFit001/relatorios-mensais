"use client";
// Tela de acesso do chat: cada pessoa cria a própria senha do chat (1º uso) e depois só digita para entrar.
import React, { useState } from "react";
import { chatApi, guardarToken } from "../../lib/chatCliente";

export default function ChatPin({ email, temSenha, onPronto }: { email: string; temSenha: boolean | null; onPronto: () => void }) {
  const [senha, setSenha] = useState("");
  const [conf, setConf] = useState("");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const criando = temSenha === false;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    if (criando && senha !== conf) return setMsg("As duas senhas não são iguais.");
    setOcupado(true);
    const r = await chatApi<{ token?: string }>(criando ? "criar_senha" : "entrar", { email, pin: senha }, false);
    setOcupado(false);
    if (!r.ok || !r.dados.token) return setMsg(r.erro === "sem_senha" ? "Este usuário ainda não criou a senha do chat. Recarregue e crie a sua." : r.erro || "Não consegui entrar.");
    guardarToken(email, r.dados.token);
    onPronto();
  };

  const campo = "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500";
  return (
    <div className="flex-1 flex items-center justify-center p-6" data-chat-pin>
      <form onSubmit={enviar} className="w-full max-w-xs space-y-3 text-center">
        <div className="text-3xl">🔒</div>
        <h3 className="text-sm font-black text-white">{temSenha === null ? "Verificando…" : criando ? "Crie a senha do seu chat" : "Digite a senha do chat"}</h3>
        <p className="text-[11px] text-slate-400">
          {criando
            ? "Ela protege as suas conversas privadas: só quem souber essa senha vê as suas mensagens. É diferente da senha do sistema."
            : "Suas conversas são privadas. Esqueceu a senha? Peça ao administrador para redefinir."}
        </p>
        {temSenha !== null && (
          <>
            <input type="password" autoFocus value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha do chat (mín. 4 caracteres)" data-chat-senha className={campo} />
            {criando && <input type="password" value={conf} onChange={(e) => setConf(e.target.value)} placeholder="Repita a senha" data-chat-senha2 className={campo} />}
            {msg && <p className="text-[11px] font-bold text-rose-400" data-chat-pin-erro>{msg}</p>}
            <button type="submit" disabled={ocupado || senha.length < 4} data-chat-pin-ok className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold py-2.5 rounded-xl cursor-pointer">
              {ocupado ? "Aguarde…" : criando ? "Criar senha e entrar" : "Entrar"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
