// Som do alerta de tarefa (gerado no navegador, sem arquivo de áudio).
// Os navegadores só liberam som depois de o usuário clicar/digitar na página; por isso "prepararSom" é chamado no primeiro clique.
let ctx: AudioContext | null = null;

export function prepararSom() {
  try {
    if (typeof window === "undefined") return;
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx && ctx.state === "suspended") ctx.resume();
  } catch { /* sem áudio: segue só com o pop-up */ }
}

/** Roda `tocar` assim que o áudio estiver liberado (depois de um clique na página). Se o navegador suspendeu o áudio, tenta retomar antes. */
function quandoPronto(tocar: (c: AudioContext) => void) {
  try {
    prepararSom();
    if (!ctx) return;
    if (ctx.state === "running") { tocar(ctx); return; }
    if (ctx.state === "suspended") ctx.resume().then(() => { if (ctx && ctx.state === "running") tocar(ctx); }).catch(() => { /* sem clique ainda: fica sem som */ });
  } catch { /* ignora */ }
}

function nota(c: AudioContext, freq: number, t0: number, dur: number, volume: number) {
  const osc = c.createOscillator();
  const ganho = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  ganho.gain.setValueAtTime(0.0001, t0);
  ganho.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
  ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(ganho).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Toca "bi-bip" `vezes` vezes (alerta de tarefa). */
export function tocarAlerta(vezes = 3) {
  quandoPronto((c) => {
    const inicio = c.currentTime + 0.05;
    for (let i = 0; i < vezes; i++) [880, 1175].forEach((freq, j) => nota(c, freq, inicio + i * 0.9 + j * 0.28, 0.25, 0.35));
  });
}

/** Aviso de mensagem do chat: um "ding-dong" curto e suave, uma vez só (diferente do bi-bip das tarefas). */
export function tocarMensagem() {
  quandoPronto((c) => {
    const inicio = c.currentTime + 0.03;
    nota(c, 659, inicio, 0.32, 0.3);
    nota(c, 988, inicio + 0.16, 0.45, 0.3);
  });
}
