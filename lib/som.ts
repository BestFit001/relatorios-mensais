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

/** Toca "bi-bip" `vezes` vezes. */
export function tocarAlerta(vezes = 3) {
  try {
    prepararSom();
    if (!ctx || ctx.state !== "running") return;
    const c = ctx;
    const inicio = c.currentTime + 0.05;
    for (let i = 0; i < vezes; i++) {
      [880, 1175].forEach((freq, j) => {
        const t0 = inicio + i * 0.9 + j * 0.28;
        const osc = c.createOscillator();
        const ganho = c.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        ganho.gain.setValueAtTime(0.0001, t0);
        ganho.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
        ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
        osc.connect(ganho).connect(c.destination);
        osc.start(t0);
        osc.stop(t0 + 0.27);
      });
    }
  } catch { /* ignora */ }
}
