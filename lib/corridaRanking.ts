// Corrida do Ranking: contas puras (posição na pista, salto dos obstáculos, pose do corredor). Sem React, para poder testar.

/** Onde ficam os obstáculos, em fração da pista (0 = largada, 1 = chegada do 1º colocado). */
export const OBSTACULOS = [0.14, 0.27, 0.4, 0.53, 0.66, 0.79];
/** Meia largura da zona de salto, em fração da pista. */
export const JANELA_SALTO = 0.035;

export interface EntradaCorrida { id: string; valor: number }

/**
 * Posição final de cada corredor (0 a 1). Quem lidera cruza a chegada e os outros ficam na proporção do seu valor.
 * `menorEMelhor`: o menor valor lidera (ex.: investimento em Ads). `referencia`: valor que equivale à chegada (ex.: 100% da meta);
 * sem ela, a chegada é o valor do líder.
 */
export function posicoesFinais(entradas: EntradaCorrida[], menorEMelhor = false, referencia?: number): Record<string, number> {
  const out: Record<string, number> = {};
  const valores = entradas.map((e) => (isFinite(e.valor) ? e.valor : 0));
  if (!entradas.length) return out;
  if (menorEMelhor) {
    const melhor = Math.max(0, Math.min(...valores));
    entradas.forEach((e, i) => {
      const v = Math.max(0, valores[i]);
      out[e.id] = v <= melhor ? 1 : melhor > 0 ? melhor / v : 0;     // melhor = 0: só quem também zerou chega junto
    });
    return out;
  }
  const ref = referencia && referencia > 0 ? referencia : Math.max(...valores, 0);
  entradas.forEach((e, i) => { out[e.id] = ref > 0 ? Math.min(1, Math.max(0, valores[i]) / ref) : 0; });
  return out;
}

/** Distância (em fração da pista) até o obstáculo mais próximo cuja zona de salto contém `x`; null se `x` está fora de todas. */
function obstaculoEm(x: number, obstaculos = OBSTACULOS, janela = JANELA_SALTO): number | null {
  for (const o of obstaculos) if (Math.abs(x - o) < janela) return o;
  return null;
}

/** 0 a 1: quanto do salto já foi feito em `x` (0 e 1 = no chão); null fora da zona de salto. */
export function fasePulo(x: number, obstaculos = OBSTACULOS, janela = JANELA_SALTO): number | null {
  const o = obstaculoEm(x, obstaculos, janela);
  return o === null ? null : (x - (o - janela)) / (2 * janela);
}

/** Altura do pé em relação ao chão (px) para a posição `x`: um arco que passa por cima do obstáculo. */
export function alturaSalto(x: number, alturaMax: number, obstaculos = OBSTACULOS, janela = JANELA_SALTO): number {
  const f = fasePulo(x, obstaculos, janela);
  return f === null ? 0 : Math.sin(Math.PI * Math.min(1, Math.max(0, f))) * alturaMax;
}

/**
 * Corredor que terminaria parado no meio de um salto é empurrado para a borda mais próxima da zona (no máximo `janela` de diferença),
 * mantendo a ordem da classificação (`ordem` = ids do 1º ao último).
 */
export function pousarForaDosObstaculos(finais: Record<string, number>, ordem: string[], obstaculos = OBSTACULOS, janela = JANELA_SALTO): Record<string, number> {
  const out = { ...finais };
  let anterior: number | null = null;
  for (const id of ordem) {
    let x = out[id] ?? 0;
    const o = obstaculoEm(x, obstaculos, janela);
    if (o !== null) x = x >= o ? o + janela : o - janela;
    if (anterior !== null && x > anterior) x = anterior;                     // nunca passa quem está na frente
    // se o ajuste de ordem caiu de novo num salto, recua para antes do obstáculo
    const o2 = obstaculoEm(x, obstaculos, janela);
    if (o2 !== null) x = o2 - janela;
    out[id] = Math.max(0, x);
    anterior = out[id];
  }
  return out;
}

/** Andamento da prova (0 a 1) em função do tempo (0 a 1): arranca rápido e desacelera no fim. */
export const andamento = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 1.6);

/** Ângulos (graus) do corredor: coxas, canelas e braços, a partir da fase da passada e do salto. */
export interface Pose { tronco: number; coxaF: number; canelaF: number; coxaT: number; canelaT: number; bracoF: number; bracoT: number; dobraBraco: number; dobraBracoT: number; alcance?: number }

export function poseCorredor(fase: number, correndo: boolean, pulo: number | null, vitoria = false): Pose {
  if (pulo !== null) {
    // passagem pelo obstáculo: perna da frente esticada, perna de trás dobrada, tronco inclinado
    const s = Math.sin(Math.PI * Math.min(1, Math.max(0, pulo)));
    return { tronco: 8 + 22 * s, coxaF: 30 + 60 * s, canelaF: 10 - 8 * s, coxaT: -20 - 25 * s, canelaT: -60 - 60 * s, bracoF: 40 + 60 * s, bracoT: -50 - 40 * s, dobraBraco: 40, dobraBracoT: 40 };
  }
  if (vitoria) return { tronco: -4, coxaF: 8, canelaF: 0, coxaT: -8, canelaT: 0, bracoF: 115, bracoT: -115, dobraBraco: 45, dobraBracoT: -45, alcance: 1.55 };
  if (!correndo) return { tronco: 0, coxaF: 8, canelaF: 0, coxaT: -8, canelaT: 0, bracoF: 10, bracoT: -10, dobraBraco: 20, dobraBracoT: 20 };
  const a = Math.sin(fase), b = Math.sin(fase + Math.PI);
  const dobra = (x: number) => -(35 + 55 * Math.max(0, Math.cos(x)));        // canela dobra quando a perna volta
  return { tronco: 12, coxaF: 42 * a, canelaF: dobra(fase), coxaT: 42 * b, canelaT: dobra(fase + Math.PI), bracoF: -55 * a, bracoT: -55 * b, dobraBraco: 75, dobraBracoT: 75 };
}

/** Posição do ombro no desenho do corredor (viewBox 80x84, quadril em (40, 50), pés no chão em y = 84), para prender a cabeça (avatar) ao corpo. */
export function ombroDe(pose: Pose): { x: number; y: number } {
  const r = (pose.tronco * Math.PI) / 180;
  return { x: 40 + Math.sin(r) * 20, y: 50 - Math.cos(r) * 20 };
}
