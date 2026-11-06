// Métricas de reputação dos canais: define se o valor lançado tem um TETO (passou = vermelho)
// ou um PISO (ficou abaixo = vermelho). Só lógica (sem tela nem rede).
//
//   teto        -> "Reclamações": meta 3 => 3% ok, 4% vermelho
//   piso        -> "Nível de serviço": meta 95 => 95% ok, 94% vermelho
//   complemento -> "Envios no prazo": o teto de atrasos é 3%, mas o lançamento é o % de envios feitos no prazo.
//                  meta 3 => 97% ou mais ok; 96% (= 4% de atraso) vermelho

export type RegraMetrica = "teto" | "piso" | "complemento";

export interface MetricaComMeta {
  meta: number;
  /** campo antigo: menor_melhor = teto, maior_melhor = piso */
  sentido?: "menor_melhor" | "maior_melhor" | string;
  regra?: RegraMetrica | string;
}

export function regraDaMetrica(m: MetricaComMeta): RegraMetrica {
  if (m.regra === "teto" || m.regra === "piso" || m.regra === "complemento") return m.regra;
  return m.sentido === "maior_melhor" ? "piso" : "teto";
}

/** Valor a partir do qual (inclusive) o indicador ainda é considerado bom / limite aceito para o valor lançado. */
export function limiteDoValor(m: MetricaComMeta): number {
  const meta = Number(m.meta) || 0;
  return regraDaMetrica(m) === "complemento" ? Math.round((100 - meta) * 1e6) / 1e6 : meta;
}

/** true = dentro da meta (verde); false = estourou (vermelho). */
export function dentroDaMeta(m: MetricaComMeta, valor: number): boolean {
  const lim = limiteDoValor(m);
  return regraDaMetrica(m) === "teto" ? valor <= lim : valor >= lim;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Texto curto da meta, ex.: "máx. 3%", "mín. 95%", "mín. 97% (máx. 3% de falha)". */
export function descreverMeta(m: MetricaComMeta, percentual: boolean): string {
  const u = percentual ? "%" : "";
  const regra = regraDaMetrica(m);
  if (regra === "teto") return `máx. ${fmt(m.meta)}${u}`;
  if (regra === "piso") return `mín. ${fmt(m.meta)}${u}`;
  return `mín. ${fmt(limiteDoValor(m))}${u} (máx. ${fmt(m.meta)}${u} de falha)`;
}

/** Campos a gravar na métrica para a regra escolhida (mantém `sentido` compatível com o que já existe no banco). */
export function camposDaRegra(regra: RegraMetrica): { regra: RegraMetrica; sentido: "menor_melhor" | "maior_melhor" } {
  return { regra, sentido: regra === "teto" ? "menor_melhor" : "maior_melhor" };
}
