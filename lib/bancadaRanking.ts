// Bancada de Vendas do Ranking: contas puras (quantos clientes cada analista atende, onde cada cliente está na fila, fase da entrega
// da caixinha e dos balões de "cliente feliz"). Sem React, para poder testar.

/** Clientes atendidos por quem lidera; os outros atendem na proporção do resultado. (Ilustrativo: não são clientes reais.) */
export const CLIENTES_MAX = 24;

export interface EntradaBancada { id: string; valor: number }

/**
 * Quanto cada analista avança, de 0 a 1. Quem lidera chega a 1 e os outros ficam na proporção do seu valor.
 * `menorEMelhor`: o menor valor lidera (ex.: investimento em Ads). `referencia`: valor que equivale a 1 (ex.: 100% da meta);
 * sem ela, o 1 é o valor do líder.
 */
export function posicoesFinais(entradas: EntradaBancada[], menorEMelhor = false, referencia?: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!entradas.length) return out;
  const valores = entradas.map((e) => (isFinite(e.valor) ? e.valor : 0));
  if (menorEMelhor) {
    const melhor = Math.max(0, Math.min(...valores));
    entradas.forEach((e, i) => {
      const v = Math.max(0, valores[i]);
      out[e.id] = v <= melhor ? 1 : melhor > 0 ? melhor / v : 0;     // melhor = 0: só quem também zerou fica com 1
    });
    return out;
  }
  const ref = referencia && referencia > 0 ? referencia : Math.max(...valores, 0);
  entradas.forEach((e, i) => { out[e.id] = ref > 0 ? Math.min(1, Math.max(0, valores[i]) / ref) : 0; });
  return out;
}

/** Número inteiro de clientes que cada analista atende. Quem tem resultado, mesmo pequeno, atende pelo menos um. */
export function clientesAtendidos(entradas: EntradaBancada[], menorEMelhor = false, referencia?: number, maximo = CLIENTES_MAX): Record<string, number> {
  const pos = posicoesFinais(entradas, menorEMelhor, referencia);
  const out: Record<string, number> = {};
  for (const e of entradas) { const p = pos[e.id] || 0; out[e.id] = p <= 0 ? 0 : Math.max(1, Math.round(p * maximo)); }
  return out;
}

/** Andamento do atendimento (0 a 1) em função do tempo (0 a 1): ritmo quase constante, desacelerando um pouco no fim. */
export const andamento = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 1.25);

const limitar = (x: number) => Math.min(1, Math.max(0, x));
const suave = (x: number) => { const t = limitar(x); return t * t * (3 - 2 * t); };

/**
 * Fase do atendimento quando já foram atendidos `s` clientes (pode ser fracionário: a parte decimal é o ciclo em andamento).
 *  k = cliente que está sendo atendido; alcance = braço do analista (0 repouso, 1 esticado); entrega = caminho da caixinha até o cliente;
 *  saida = cliente atendido indo embora; desloc = a fila andando para ocupar o lugar dele.
 */
export interface Ciclo { k: number; f: number; alcance: number; entrega: number; saida: number; desloc: number }
export function ciclo(s: number): Ciclo {
  const k = Math.floor(Math.max(0, s)), f = Math.max(0, s) - k;
  const alcance = f < 0.5 ? suave(f / 0.45) : 1 - limitar((f - 0.5) / 0.35);
  const saida = limitar((f - 0.5) / 0.5);
  return { k, f, alcance, entrega: suave(f / 0.45), saida, desloc: suave(saida) };
}

export interface ClienteNaFila { j: number; /** 0 = no balcão; 1, 2... = esperando atrás (pode ser fracionário enquanto a fila anda) */ lugar: number; /** 0..1, só para o cliente atendido */ saida: number; atendido: boolean }

/** Clientes que aparecem na cena: o que está sendo atendido (ou saindo) e os `quantos` seguintes da fila. */
export function filaVisivel(s: number, quantos = 16): ClienteNaFila[] {
  const c = ciclo(s);
  const lista: ClienteNaFila[] = [];
  const emAtendimento = c.f >= 0.5;               // depois de receber a caixinha o cliente sai e a fila anda
  if (emAtendimento) lista.push({ j: c.k, lugar: 0, saida: c.saida, atendido: true });
  for (let i = 0; i < quantos; i++) {
    const j = c.k + i + (emAtendimento ? 1 : 0);
    lista.push({ j, lugar: i + (emAtendimento ? 1 - c.desloc : 0), saida: 0, atendido: false });
  }
  return lista;
}

export interface Balao { j: number; /** quanto tempo (em ciclos) desde a entrega: 0 = acabou de entregar */ idade: number; opacidade: number; sobe: number }
/** Balões de "cliente feliz": nascem quando o cliente recebe a caixinha, sobem e somem. */
export function baloes(s: number, duracao = 1.7): Balao[] {
  const out: Balao[] = [];
  const topo = Math.floor(Math.max(0, s) - 0.5);
  for (let j = topo; j > topo - Math.ceil(duracao) - 1 && j >= 0; j--) {
    const idade = s - (j + 0.5);
    if (idade < 0 || idade > duracao) continue;
    const entra = limitar(idade / 0.18), sai = limitar((duracao - idade) / 0.4);
    out.push({ j, idade, opacidade: Math.min(entra, sai), sobe: Math.min(1, idade / duracao) });
  }
  return out;
}

/** Ângulos (graus) da pose do cliente andando, para um leve balanço enquanto a fila anda. */
export const balanco = (desloc: number) => Math.sin(desloc * Math.PI * 4) * (desloc > 0 && desloc < 1 ? 1 : 0);
