// Custo mensal da colaboradora de lives (aba oculta do Relatório de Lives, só para o Admin Geral).
//
// Onde fica salvo: config_regras_tiny, campo "rh_lives:AAAA-MM" (um por mês), com o JSON dos valores.
// O prefixo NÃO pode começar com "live_": a tela de Configurações Live carrega e apaga tudo que casa com "live_%".
import { ehAdminGeral } from "./perfis";

export const PREFIXO_RH = "rh_lives:";
export const campoRh = (mes: string) => PREFIXO_RH + mes;
/** Data de registro (admissão) da colaboradora: vale para todos os meses. Guarda só a data (AAAA-MM-DD). */
export const CAMPO_ADMISSAO = "rh_lives_admissao";

/** Salário e encargos são sensíveis: só o Admin Geral enxerga. (Para liberar também o Admin de Área, troque por acessoTotal.) */
export const podeVerCustoColaboradora = (perfil?: string | null) => ehAdminGeral(perfil);

export interface OutroCusto { nome: string; valor: number }
export type RegimeEncargos = "presumido_real" | "simples" | "personalizado";

export interface ParamsColaboradora {
  /** salário base do mês (R$) */
  salario: number;
  /** vale-transporte do mês, digitado à mão (R$): valor TOTAL do VT, antes do desconto da funcionária */
  valeTransporte: number;
  /** % do salário que a funcionária paga do próprio VT (6% é o limite legal); a empresa arca com o resto */
  descontoVtPct: number;
  /** outros custos do mês: vale-refeição, plano de saúde, bonificação... */
  outros: OutroCusto[];
  regime: RegimeEncargos;
  /** % sobre a base de encargos (salário + 13º + férias + 1/3) */
  pInss: number; pRat: number; pTerceiros: number; pFgts: number;
  /** provisiona a multa de 40% do FGTS (para o caso de demissão sem justa causa) */
  multaFgts: boolean;
}

export const REGIMES: { valor: RegimeEncargos; nome: string; dica: string; pInss: number; pRat: number; pTerceiros: number; pFgts: number }[] = [
  { valor: "presumido_real", nome: "Lucro Presumido ou Real", dica: "INSS patronal 20% + RAT 2% + Terceiros 5,8% + FGTS 8%", pInss: 20, pRat: 2, pTerceiros: 5.8, pFgts: 8 },
  { valor: "simples", nome: "Simples Nacional (Anexos I a III)", dica: "só o FGTS 8%: o INSS patronal já está dentro do imposto do Simples", pInss: 0, pRat: 0, pTerceiros: 0, pFgts: 8 },
  { valor: "personalizado", nome: "Personalizado", dica: "você define cada percentual", pInss: 20, pRat: 2, pTerceiros: 5.8, pFgts: 8 },
];

export const PARAMS_PADRAO: ParamsColaboradora = {
  salario: 0, valeTransporte: 0, descontoVtPct: 6, outros: [], regime: "presumido_real", pInss: 20, pRat: 2, pTerceiros: 5.8, pFgts: 8, multaFgts: false,
};

/** Troca o regime e, se não for o personalizado, preenche os percentuais dele. */
export function aplicarRegime(p: ParamsColaboradora, regime: RegimeEncargos): ParamsColaboradora {
  const r = REGIMES.find((x) => x.valor === regime);
  if (!r || regime === "personalizado") return { ...p, regime };
  return { ...p, regime, pInss: r.pInss, pRat: r.pRat, pTerceiros: r.pTerceiros, pFgts: r.pFgts };
}

const num = (v: any) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const arred = (v: number) => Math.round(v * 100) / 100;

export interface CustoColaboradora {
  salario: number;
  /** 1/12 do salário por mês */
  decimoTerceiro: number;
  /** 1/12 do salário por mês */
  ferias: number;
  /** 1/3 constitucional sobre as férias */
  tercoFerias: number;
  /** salário + 13º + férias + 1/3: base dos encargos */
  baseEncargos: number;
  inss: number; rat: number; terceiros: number; fgts: number; multaFgts: number;
  encargos: number;
  /** VT que a EMPRESA paga: VT do mês − desconto da funcionária */
  valeTransporte: number;
  /** VT total do mês (antes do desconto) */
  valeTransporteBruto: number;
  /** parte do VT paga pela funcionária (% do salário do mês, nunca mais que o próprio VT) */
  descontoVt: number;
  outros: number;
  total: number;
  /** quanto o custo total passa do salário, em % */
  acimaDoSalarioPct: number;
}

/**
 * `fator` é a parte do mês em que a colaboradora estava registrada (dias de vínculo ÷ dias do mês): salário, 13º, férias, 1/3 e encargos
 * são proporcionais a ele. O vale-transporte e os outros custos são o que foi digitado para o mês e não mudam com o fator; o desconto do VT na funcionária é % do salário já proporcional.
 */
export function calcularCustoColaboradora(p: ParamsColaboradora, fator = 1): CustoColaboradora {
  const f = Math.min(1, Math.max(0, Number.isFinite(fator) ? fator : 1));
  const salario = Math.max(0, num(p.salario)) * f;
  const decimoTerceiro = salario / 12;
  const ferias = salario / 12;
  const tercoFerias = ferias / 3;
  const baseEncargos = salario + decimoTerceiro + ferias + tercoFerias;
  const inss = (baseEncargos * Math.max(0, num(p.pInss))) / 100;
  const rat = (baseEncargos * Math.max(0, num(p.pRat))) / 100;
  const terceiros = (baseEncargos * Math.max(0, num(p.pTerceiros))) / 100;
  const fgts = (baseEncargos * Math.max(0, num(p.pFgts))) / 100;
  const multaFgts = p.multaFgts ? fgts * 0.4 : 0;
  const encargos = inss + rat + terceiros + fgts + multaFgts;
  const valeTransporteBruto = Math.max(0, num(p.valeTransporte));
  // desconto em folha: % do salário (proporcional ao vínculo), limitado ao próprio valor do VT
  const descontoVt = Math.min(valeTransporteBruto, (salario * Math.max(0, Math.min(100, num(p.descontoVtPct)))) / 100);
  const valeTransporte = valeTransporteBruto - descontoVt;
  const outros = (p.outros || []).reduce((a, o) => a + Math.max(0, num(o.valor)), 0);
  const total = salario + decimoTerceiro + ferias + tercoFerias + encargos + valeTransporte + outros;
  return {
    salario: arred(salario), decimoTerceiro: arred(decimoTerceiro), ferias: arred(ferias), tercoFerias: arred(tercoFerias), baseEncargos: arred(baseEncargos),
    inss: arred(inss), rat: arred(rat), terceiros: arred(terceiros), fgts: arred(fgts), multaFgts: arred(multaFgts), encargos: arred(encargos),
    valeTransporte: arred(valeTransporte), valeTransporteBruto: arred(valeTransporteBruto), descontoVt: arred(descontoVt), outros: arred(outros), total: arred(total),
    acimaDoSalarioPct: salario > 0 ? (total / salario - 1) * 100 : 0,
  };
}

export const serializarParams = (p: ParamsColaboradora) => JSON.stringify(p);

/** Lê o JSON salvo, com valores seguros (nunca estoura se o texto estiver quebrado). */
export function lerParams(texto: any): ParamsColaboradora | null {
  try {
    const j = typeof texto === "string" ? JSON.parse(texto) : texto;
    if (!j || typeof j !== "object") return null;
    const regime: RegimeEncargos = ["presumido_real", "simples", "personalizado"].includes(j.regime) ? j.regime : "presumido_real";
    return {
      salario: num(j.salario), valeTransporte: num(j.valeTransporte),
      // meses salvos antes deste campo existir: 6% (padrão legal)
      descontoVtPct: j.descontoVtPct === undefined || j.descontoVtPct === null ? 6 : num(j.descontoVtPct),
      outros: Array.isArray(j.outros) ? j.outros.map((o: any) => ({ nome: String(o?.nome ?? ""), valor: num(o?.valor) })) : [],
      regime, pInss: num(j.pInss), pRat: num(j.pRat), pTerceiros: num(j.pTerceiros), pFgts: num(j.pFgts), multaFgts: !!j.multaFgts,
    };
  } catch { return null; }
}

/** Linhas de config_regras_tiny → mapa "AAAA-MM" → parâmetros. */
export function lerTodosRh(linhas: any[] | null | undefined): Map<string, ParamsColaboradora> {
  const mapa = new Map<string, ParamsColaboradora>();
  for (const l of linhas || []) {
    const campo = String(l?.campo ?? "");
    if (!campo.startsWith(PREFIXO_RH)) continue;
    const p = lerParams(l?.coluna);
    if (p) mapa.set(campo.slice(PREFIXO_RH.length), p);
  }
  return mapa;
}

/** Parâmetros a usar num mês: os salvos nele; senão os do mês salvo mais recente antes dele (marcado como herdado); senão o padrão. */
export function parametrosDoMes(mapa: Map<string, ParamsColaboradora>, mes: string): { params: ParamsColaboradora; origem: "salvo" | "herdado" | "padrao"; deMes?: string } {
  const exato = mapa.get(mes);
  if (exato) return { params: exato, origem: "salvo" };
  const anteriores = Array.from(mapa.keys()).filter((m) => m < mes).sort();
  const ult = anteriores[anteriores.length - 1];
  if (ult) return { params: mapa.get(ult)!, origem: "herdado", deMes: ult };
  return { params: PARAMS_PADRAO, origem: "padrao" };
}

export interface ResultadoComColaboradora {
  /** liquidez do Relatório (depois do custo das lives) */
  liquidezRelatorio: number;
  custoColaboradora: number;
  liquidezFinal: number;
  /** liquidez final ÷ PDV, em % (mesma base do card "% Lucro sobre PDV") */
  margemSobrePdv: number;
  /** liquidez final ÷ valor das vendas, em % */
  margemSobreVendas: number;
  /** venda mínima do mês para cobrir o custo das lives e da colaboradora, com a margem de contribuição do mês; null se a margem for ≤ 0 */
  vendaMinima: number | null;
}

export function resultadoComColaboradora(o: { liquidezDasVendas: number; custoLives: number; totalVenda: number; totalPdv: number; custoColaboradora: number }): ResultadoComColaboradora {
  const liquidezRelatorio = o.liquidezDasVendas - o.custoLives;
  const liquidezFinal = liquidezRelatorio - o.custoColaboradora;
  const margemContribuicao = o.totalVenda > 0 ? o.liquidezDasVendas / o.totalVenda : 0;
  return {
    liquidezRelatorio, custoColaboradora: o.custoColaboradora, liquidezFinal,
    margemSobrePdv: o.totalPdv > 0 ? (liquidezFinal / o.totalPdv) * 100 : 0,
    margemSobreVendas: o.totalVenda > 0 ? (liquidezFinal / o.totalVenda) * 100 : 0,
    vendaMinima: margemContribuicao > 0 ? (o.custoLives + o.custoColaboradora) / margemContribuicao : null,
  };
}
