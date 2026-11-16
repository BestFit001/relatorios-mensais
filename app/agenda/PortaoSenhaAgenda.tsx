"use client";
// Tela de senha da Agenda: no primeiro acesso a pessoa cria a senha; depois ela é pedida de novo a cada 30 dias.
import React, { useEffect, useState } from "react";
import { DIAS_VALIDADE, conferirSenha, definirSenha, registrarLiberacao, temSenha, validarNovaSenha } from "../../lib/agendaAcesso";

export default function PortaoSenhaAgenda({ email, onLiberado }: { email: string; onLiberado: () => void }) {
  const [existe, setExiste] = useState<boolean | null>(null);
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { temSenha(email).then(setExiste); }, [email]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(""); setOcupado(true);
    try {
      if (!existe) {
        const inv = validarNovaSenha(senha, confirmar);
        if (inv) { setErro(inv); return; }
        const falha = await definirSenha(email, senha);
        if (falha) { setErro(falha); return; }
      } else if (!(await conferirSenha(email, senha))) { setErro("Senha incorreta."); return; }
      registrarLiberacao(email);
      onLiberado();
    } finally { setOcupado(false); }
  };

  const campo = "w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white outline-none focus:border-indigo-500";
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100">
      <form onSubmit={enviar} data-portao-agenda className="w-full max-w-sm bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <div>
          <h1 className="text-xl font-black text-white">🔒 Agenda de Ações</h1>
          <p className="text-xs text-slate-400 mt-1">
            {existe === null ? "Verificando…" : existe
              ? `Digite a senha da sua agenda. Ela é pedida de novo a cada ${DIAS_VALIDADE} dias.`
              : `Primeiro acesso: crie a senha da sua agenda. Depois dela, a senha é pedida só 1 vez a cada ${DIAS_VALIDADE} dias.`}
          </p>
        </div>
        {existe !== null && (
          <>
            <input type="password" data-senha autoFocus autoComplete={existe ? "current-password" : "new-password"} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder={existe ? "Senha" : "Nova senha (mín. 6 caracteres)"} className={campo} required />
            {!existe && <input type="password" data-senha-confirmar autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} placeholder="Repita a senha" className={campo} required />}
            {erro && <p data-erro-senha className="text-xs font-bold text-rose-400">{erro}</p>}
            <button type="submit" disabled={ocupado} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-lg text-xs uppercase tracking-wider cursor-pointer">{ocupado ? "Aguarde…" : existe ? "Entrar" : "Criar senha e entrar"}</button>
            {existe && <p className="text-[10px] text-slate-500">Esqueceu a senha? Peça para a Gisele redefinir: você cria outra no próximo acesso.</p>}
          </>
        )}
      </form>
    </div>
  );
}
