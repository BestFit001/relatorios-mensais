// Contas do monitor (sem rede nem banco, para poder testar).

/** vendas_no_dia = total de hoje − total anterior. Sem base não há como saber (null); nunca negativo. */
export function calcularVendasNoDia(totalHoje: number | null, totalAnterior: number | null): number | null {
  if (totalHoje == null || totalAnterior == null) return null;
  return Math.max(0, totalHoje - totalAnterior);
}

export interface UltimaCaptura {
  ultima_captura: string | null;
  ultimo_total_vendas: number | null;
  ultimas_vendas_dia: number | null;
}

/**
 * Total de vendas "de ontem" (a captura anterior a hoje).
 * Se o anúncio já foi capturado HOJE (cron rodado de novo / botão "Atualizar agora"), a base é o total de hoje
 * menos o que já tinha sido contado hoje — assim repetir a captura não zera as vendas do dia.
 */
export function totalBase(a: UltimaCaptura, hoje: string): number | null {
  if (!a.ultima_captura) return null;
  if (a.ultima_captura < hoje) return a.ultimo_total_vendas;
  if (a.ultima_captura === hoje && a.ultimo_total_vendas != null && a.ultimas_vendas_dia != null) {
    return a.ultimo_total_vendas - a.ultimas_vendas_dia;
  }
  return null;
}

/** "AAAA-MM-DD" no fuso de São Paulo (o dia da captura é o dia do negócio, não o do servidor em UTC). */
export function hojeSP(agora: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
  return p; // en-CA já formata como AAAA-MM-DD
}

/**
 * "235 vendidos", "+500 vendidos", "+5 mil vendidos", "+1 milhão vendidos", "1 vendido" -> total e se é faixa.
 * Devolve null quando o texto não fala de vendas.
 */
export function parseVendidos(texto: string | null | undefined): { total: number; aproximado: boolean } | null {
  if (!texto) return null;
  const t = texto.replace(/ /g, " ");
  const m = /(\+)?\s*(\d[\d.,]*)\s*(mil|k|milh(?:ão|ao|ões|oes))?\s*vendid[oa]s?/i.exec(t)
    // Shopee também mostra "Vendidos 1,2mil" (o número depois)
    || /vendid[oa]s?\s*:?\s*()(\d[\d.,]*)\s*(mil|k|milh(?:ão|ao|ões|oes))?(?![\d\p{L}])/iu.exec(t);
  if (!m) return null;
  return numeroDeFaixa(m[1], m[2], m[3]);
}

function numeroDeFaixa(mais: string | undefined, digitos: string, mult: string | undefined): { total: number; aproximado: boolean } | null {
  let n = Number(digitos.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const x = mult?.toLowerCase();
  if (x === "mil" || x === "k") n *= 1000;
  else if (x) n *= 1_000_000;
  return { total: Math.round(n), aproximado: Boolean(mais) || Boolean(x) };
}

/**
 * Amazon: "100+ compras no mês passado", "Mais de 1 mil compras no mês passado", "+300 comprados no mês passado".
 * É a venda dos últimos 30 dias em faixas (nunca exata), então `aproximado` é sempre true.
 */
export function parseComprasNoMes(texto: string | null | undefined): { total: number; aproximado: true } | null {
  if (!texto) return null;
  const t = texto.replace(/ /g, " ");
  const m = /(?:mais\s+de\s+)?\+?\s*(\d[\d.,]*)\s*(mil|milh(?:ão|ao|ões|oes))?\s*\+?\s*(?:compra(?:s|dos?)|vendid[oa]s?)\s+(?:no|nos|em)\s+(?:[úu]ltimos?\s+30\s+dias|(?:[úu]ltimo\s+)?m[eê]s(?:\s+passado)?)/i.exec(t);
  if (!m) return null;
  const r = numeroDeFaixa(undefined, m[1], m[2]);
  return r ? { total: r.total, aproximado: true } : null;
}

/** "1.234,56" / "1234.56" / 49.9 -> número (ou null). */
export function parsePreco(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Roda `fn` sobre a lista com no máximo `limite` chamadas ao mesmo tempo. */
export async function comLimite<T, R>(lista: T[], limite: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(lista.length);
  let prox = 0;
  const operarios = Array.from({ length: Math.max(1, Math.min(limite, lista.length)) }, async () => {
    for (;;) {
      const i = prox++;
      if (i >= lista.length) return;
      out[i] = await fn(lista[i], i);
    }
  });
  await Promise.all(operarios);
  return out;
}
