"use client";
// Alerta de tarefas em QUALQUER página/aba do sistema:
// - pop-up no centro da tela + som (todas as abas abertas do sistema, via BroadcastChannel)
// - notificação do Windows (canto da tela) mesmo que a pessoa esteja em outra aba ou outro site, enquanto o navegador estiver aberto
// - o título da aba pisca quando a aba está em segundo plano
import React, { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { buscarTudo } from "../../lib/buscarTudo";
import { concluiu, deveAlertar, chaveAlerta, hhmm, agoraSP, type Conclusao } from "../../lib/tarefas";
import { prepararSom, tocarAlerta } from "../../lib/som";
import { registrarPush, temAssinaturaAtiva, suportaPush } from "../../lib/push";

type Alerta = { id: string; titulo: string; corpo: string };
const CANAL = "bestfit-alertas-tarefas";
const INTERVALO_MS = 30000;

const lerUsuario = (): { email: string } | null => {
  try {
    const u = JSON.parse(localStorage.getItem("usuario_logado") || "null");
    return u && u.email ? u : null;
  } catch { return null; }
};

/** Notificação do Windows (canto da tela / central de notificações, como a de e-mail recebido). */
function toastWindows(titulo: string, corpo: string, tag: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    const n = new Notification(titulo, { body: corpo, tag, requireInteraction: true, silent: false, icon: "/favicon.ico" });
    n.onclick = () => { window.focus(); n.close(); };
    return true;
  } catch { return false; }
}

export default function AlertaTarefasGlobal() {
  const router = useRouter();
  const pathname = usePathname();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [permissao, setPermissao] = useState<"indisponivel" | "default" | "granted" | "denied">("indisponivel");
  const [logado, setLogado] = useState(false);
  const [bannerFechado, setBannerFechado] = useState(false);
  const [mudo, setMudo] = useState(false);
  const alertasRef = useRef<Alerta[]>([]);
  alertasRef.current = alertas;
  const somEmRef = useRef(0);
  const temPushRef = useRef(false);
  const canalRef = useRef<BroadcastChannel | null>(null);
  const tituloOriginal = useRef<string>("");

  const tocar = (vezes: number) => { somEmRef.current = Date.now(); tocarAlerta(vezes); };

  const mostrar = (novos: Alerta[]) => {
    if (!novos.length) return;
    setAlertas((a) => [...a, ...novos.filter((n) => !a.some((x) => x.id === n.id))]);
    if (Date.now() - somEmRef.current > 3000) tocar(3);
  };

  // canal entre abas + liberar o som no primeiro clique + botão "testar" da tela Início
  useEffect(() => {
    if ("Notification" in window) setPermissao(Notification.permission as any);
    const liberar = () => {
      prepararSom();
      // primeiro clique da sessão: pede a permissão das notificações do Windows (o navegador só deixa pedir com um clique)
      try {
        if ("Notification" in window && Notification.permission === "default" && !sessionStorage.getItem("alerta_pediu_permissao")) {
          sessionStorage.setItem("alerta_pediu_permissao", "1");
          Notification.requestPermission().then((r) => {
            setPermissao(r as any);
            const u = lerUsuario();
            if (r === "granted" && u) registrarPush(u.email).then((reg) => { temPushRef.current = reg.ok; });
          });
        }
      } catch { /* ignora */ }
    };
    window.addEventListener("pointerdown", liberar);
    window.addEventListener("keydown", liberar);

    let canal: BroadcastChannel | null = null;
    try {
      canal = new BroadcastChannel(CANAL);
      canal.onmessage = (ev) => {
        if (ev.data?.tipo === "mostrar") mostrar(ev.data.alertas || []);
        if (ev.data?.tipo === "fechar") setAlertas([]);
      };
    } catch { /* navegador sem BroadcastChannel: cada aba avisa por conta própria */ }
    canalRef.current = canal;

    const testar = async () => {
      let corpo = "Se você viu este pop-up e ouviu o som, os avisos de tarefa vão funcionar assim em todas as abas.";
      if (!("Notification" in window)) {
        corpo += " ATENÇÃO: este navegador não suporta notificações do Windows.";
      } else {
        if (Notification.permission === "default") {
          const r = await Notification.requestPermission();   // chamado direto do clique no botão
          setPermissao(r as any);
          const u = lerUsuario();
          if (r === "granted" && u) registrarPush(u.email).then((reg) => { temPushRef.current = reg.ok; });
        }
        if (Notification.permission === "granted") {
          toastWindows("📝 Teste de alerta", "Esta é a notificação lateral do Windows. Se ela não apareceu: Windows > Configurações > Sistema > Notificações (ligue o Chrome/Edge e desative o Foco/Não perturbar).", "teste-alerta");
          corpo += " A notificação lateral do Windows também foi enviada agora.";
        } else {
          corpo += " ATENÇÃO: as notificações do Windows estão BLOQUEADAS neste navegador. Clique no cadeado ao lado do endereço do site, abra Notificações e escolha Permitir.";
        }
      }
      const t: Alerta = { id: "teste-" + Date.now(), titulo: "Teste de alerta", corpo };
      try { canalRef.current?.postMessage({ tipo: "mostrar", alertas: [t] }); } catch { /* ignora */ }
      mostrar([t]);
    };
    window.addEventListener("bestfit-testar-alerta", testar);
    return () => {
      window.removeEventListener("pointerdown", liberar);
      window.removeEventListener("keydown", liberar);
      window.removeEventListener("bestfit-testar-alerta", testar);
      canal?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // verificação periódica das tarefas do usuário logado
  useEffect(() => {
    let vivo = true;
    let ocupado = false;
    const verificar = async () => {
      const usuario = lerUsuario();
      setLogado(!!usuario);
      if (!usuario) return;

      if (ocupado) return;
      ocupado = true;
      try {
        const [tarefas, conclusoes] = await Promise.all([buscarTudo("home_tarefas", "*"), buscarTudo("home_tarefas_conclusoes", "*")]);
        if (!vivo) return;
        if (suportaPush() && Notification.permission === "granted") temPushRef.current = await temAssinaturaAtiva();
        const agora = new Date();
        const hoje = agoraSP(agora).data;
        const eu = String(usuario.email).trim().toLowerCase();
        const novos: Alerta[] = [];
        tarefas.forEach((t: any) => {
          if (t.legado || !(t.responsaveis || []).some((r: string) => String(r).trim().toLowerCase() === eu)) return;
          const alerta = deveAlertar(t, concluiu(t, usuario.email, conclusoes as Conclusao[], hoje), agora);
          if (!alerta) return;
          const chave = chaveAlerta(t, usuario.email, hoje) + "_tela";
          try { if (localStorage.getItem(chave)) return; localStorage.setItem(chave, String(Date.now())); } catch { /* sem armazenamento: avisa mesmo assim */ }
          const corpo = alerta.quando === "antes"
            ? `Vence em ${alerta.minutosRestantes <= 1 ? "1 minuto" : alerta.minutosRestantes + " minutos"} (${hhmm(t.hora_entrega)}).`
            : `Venceu às ${hhmm(t.hora_entrega)} e ainda não foi concluída.`;
          novos.push({ id: chave, titulo: t.titulo, corpo });
          // notificação do Windows feita aqui (uma só, pela aba que "pegou" o alerta) quando o servidor ainda não está avisando por push
          if (!temPushRef.current) toastWindows(`📝 ${t.titulo}`, corpo, chave);
        });
        if (novos.length) {
          try { canalRef.current?.postMessage({ tipo: "mostrar", alertas: novos }); } catch { /* ignora */ }
          mostrar(novos);
        }
      } catch { /* sem rede: tenta no próximo ciclo */ }
      ocupado = false;
    };
    verificar();
    const i = setInterval(verificar, INTERVALO_MS);
    const aoVoltar = () => { if (document.visibilityState === "visible") verificar(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { vivo = false; clearInterval(i); document.removeEventListener("visibilitychange", aoVoltar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // garante a assinatura do push neste navegador (renova se mudou)
  useEffect(() => {
    const u = lerUsuario();
    if (!u || permissao !== "granted" || !suportaPush()) return;
    registrarPush(u.email).then(async (r) => { temPushRef.current = r.ok || (await temAssinaturaAtiva()); });
  }, [permissao, logado]);

  // som intermitente: bi-bip a cada 3 s enquanto o pop-up estiver aberto (até clicar em "Entendi" ou "Silenciar")
  useEffect(() => {
    if (!alertas.length) { setMudo(false); return; }
    if (mudo) return;
    const i = setInterval(() => tocar(1), 3000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertas.length, mudo]);

  // título da aba piscando enquanto o pop-up está aberto
  useEffect(() => {
    if (!alertas.length) return;
    if (!tituloOriginal.current) tituloOriginal.current = document.title;
    let alterna = false;
    const i = setInterval(() => { alterna = !alterna; document.title = alterna ? "🔔 TAREFA NO PRAZO!" : tituloOriginal.current; }, 1000);
    return () => { clearInterval(i); document.title = tituloOriginal.current; tituloOriginal.current = ""; };
  }, [alertas.length]);

  const fechar = () => {
    setAlertas([]);
    try { canalRef.current?.postMessage({ tipo: "fechar" }); } catch { /* ignora */ }
  };

  const ativarNotificacoes = async () => {
    if (!("Notification" in window)) return;
    const r = await Notification.requestPermission();
    setPermissao(r as any);
    const u = lerUsuario();
    if (r === "granted" && u) { const reg = await registrarPush(u.email); temPushRef.current = reg.ok; }
  };

  return (
    <>
      {alertas.length > 0 && (
        <div data-popup-alerta role="alertdialog" className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border-2 border-amber-400 bg-slate-900 p-6 shadow-2xl">
            <div className="text-center text-5xl mb-2 animate-bounce">🔔</div>
            <h3 className="text-center text-lg font-black text-amber-300 mb-4 uppercase tracking-wider">Tarefa chegando no prazo</h3>
            <div className="space-y-2 max-h-64 overflow-auto mb-5">
              {alertas.map((a) => (
                <div key={a.id} data-popup-item className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-3">
                  <div className="text-sm font-bold text-white">📝 {a.titulo}</div>
                  <div className="text-xs text-amber-200 mt-0.5">{a.corpo}</div>
                </div>
              ))}
            </div>
            <button type="button" data-popup-mudo onClick={() => setMudo((m) => !m)} className="w-full mb-3 rounded-lg border border-slate-700 text-slate-300 hover:text-white text-[11px] font-bold py-2 cursor-pointer">{mudo ? "🔊 Voltar o som" : "🔇 Silenciar o som (mantém o aviso na tela)"}</button>
            <div className="flex gap-2">
              <button type="button" data-popup-ver onClick={() => { fechar(); router.push("/inicio"); }} className="flex-1 rounded-xl border border-amber-500 text-amber-300 hover:text-white font-bold py-3 text-xs uppercase tracking-wider cursor-pointer">Ver tarefas</button>
              <button type="button" data-popup-fechar onClick={fechar} className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 text-sm uppercase tracking-wider cursor-pointer">Entendi</button>
            </div>
          </div>
        </div>
      )}
      {logado && permissao === "default" && !bannerFechado && pathname !== "/inicio" && (
        <div data-banner-alertas className="fixed bottom-4 right-4 z-[9000] max-w-xs rounded-xl border border-cyan-700 bg-slate-900 p-4 shadow-2xl">
          <div className="text-xs font-bold text-cyan-300 mb-1">🔔 Alertas de tarefa no Windows</div>
          <p className="text-[11px] text-slate-400 mb-3">Ative para ser avisado no canto da tela, mesmo estando em outra aba ou outro site.</p>
          <div className="flex gap-2">
            <button type="button" data-banner-ativar onClick={ativarNotificacoes} className="flex-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold py-2 cursor-pointer">Ativar</button>
            <button type="button" onClick={() => setBannerFechado(true)} className="rounded-lg border border-slate-700 text-slate-400 text-[11px] px-3 py-2 cursor-pointer">Depois</button>
          </div>
        </div>
      )}
    </>
  );
}
