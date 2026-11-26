// Ponto de equilíbrio dia a dia das lives: a cada dia do calendário entra a liquidez das vendas e sai o custo da colaboradora
// (e, se quiser, o custo de lives/Ads), e o acumulado do mês mostra a partir de que dia as lives passaram a dar lucro.
// Sábado e domingo são folga: o custo é dividido só entre os dias trabalhados (segunda a sexta, mais qualquer fim de semana em que
// houve venda), então folga nunca aparece como dia de prejuízo nem como "dia sem venda".

const pad = (n: number) => String(n).padStart(2, "0");
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES_OK = /^\d{4}-\d{2}$/;
const DATA_OK = /^\d{4}-\d{2}-\d{2}$/;

/** Dias do mês no calendário (28, 29 em ano bissexto, 30 ou 31). */
export function diasDoMes(mes: string): number {
  if (!MESES_OK.test(mes)) return 0;
  return new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
}

export const diaSemana = (iso: string) => SEMANA[new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))).getDay()];

export interface Vinculo {
  diasMes: number;
  /** dias do mês em que ela já estava registrada (conta o dia do registro) */
  diasVinculo: number;
  /** diasVinculo ÷ diasMes */
  fator: number;
  /** primeiro dia de vínculo dentro do mês (AAAA-MM-DD); null se ainda não estava registrada no mês */
  inicio: string | null;
  /** não há data de registro informada: o mês todo é considerado */
  semData: boolean;
}

export function vinculoNoMes(mes: string, admissao: string | null | undefined): Vinculo {
  const diasMes = diasDoMes(mes);
  const primeiro = `${mes}-01`;
  if (!diasMes) return { diasMes: 0, diasVinculo: 0, fator: 0, inicio: null, semData: false };
  if (!admissao || !DATA_OK.test(admissao)) return { diasMes, diasVinculo: diasMes, fator: 1, inicio: primeiro, semData: true };
  const ultimo = `${mes}-${pad(diasMes)}`;
  if (admissao > ultimo) return { diasMes, diasVinculo: 0, fator: 0, inicio: null, semData: false };
  const inicio = admissao > primeiro ? admissao : primeiro;
  const diasVinculo = diasMes - Number(inicio.slice(8, 10)) + 1;
  return { diasMes, diasVinculo, fator: diasVinculo / diasMes, inicio, semData: false };
}

/** sábado ou domingo */
export const ehFimDeSemana = (iso: string) => { const d = diaSemana(iso); return d === "sáb" || d === "dom"; };

export interface VendaDia { vendas: number; liquidez: number; pedidos: number }

export interface DiaSerie {
  data: string; dia: number; diaSemana: string;
  vendas: number; pedidos: number;
  /** liquidez das vendas do dia (repasse − CMV − impostos − comissão) */
  liquidez: number;
  custoColab: number; custoAds: number;
  resultado: number; acumulado: number;
  temVenda: boolean; vinculada: boolean;
  /** dia de trabalho: segunda a sexta, ou fim de semana com venda. Folga tem custo e resultado zerados */
  trabalhado: boolean;
}

export interface SerieEquilibrio {
  dias: DiaSerie[];
  /** último dia contado (hoje, no mês corrente; o último dia, nos meses fechados) */
  ultimoDia: string | null;
  /** 1º dia a partir do qual o acumulado ficou em zero ou mais e assim continuou até o último dia contado; null se o acumulado ainda é negativo */
  equilibrio: { data: string; dia: number; desdeOInicio: boolean } | null;
  acumuladoFinal: number;
  liquidezAcumulada: number; custoColabAcumulado: number; custoAdsAcumulado: number;
  /** contados só entre os dias trabalhados (folga não entra) */
  diasLucro: number; diasPrejuizo: number; diasSemVenda: number;
  /** sábados/domingos sem venda até o último dia contado */
  diasDeFolga: number;
  /** dias trabalhados do vínculo no mês inteiro (segunda a sexta + fim de semana com venda) e o custo da colaboradora por dia trabalhado */
  diasTrabalhadosVinculo: number; custoColabPorDia: number;
  melhorDia: DiaSerie | null; piorDia: DiaSerie | null;
  /** quanto falta de liquidez para o acumulado chegar a zero (0 se já chegou) */
  faltaParaEquilibrar: number;
  /** no ritmo médio do mês até agora: dia em que o acumulado chega a zero; "fora_do_mes" se não chega até o fim do mês; null se não se aplica */
  previsao: { data: string; dia: number } | "fora_do_mes" | null;
  /** só no mês corrente: resultado do mês inteiro se o ritmo médio de liquidez continuar */
  projecaoFechamento: number | null;
}

const centavos = (v: number) => Math.round(v * 100);

export function serieEquilibrio(o: {
  mes: string;
  /** hoje, AAAA-MM-DD (fuso de São Paulo) */
  hoje: string;
  vinculo: Vinculo;
  /** custo da colaboradora do mês, já proporcional ao vínculo (CustoColaboradora.total) */
  custoColabMes: number;
  /** custo de lives (Ads) do relatório */
  custoLivesMes: number;
  incluirAds: boolean;
  porDia: Map<string, VendaDia>;
}): SerieEquilibrio {
  const { mes, hoje, vinculo, porDia } = o;
  const vazio: SerieEquilibrio = { dias: [], ultimoDia: null, equilibrio: null, acumuladoFinal: 0, liquidezAcumulada: 0, custoColabAcumulado: 0, custoAdsAcumulado: 0, diasLucro: 0, diasPrejuizo: 0, diasSemVenda: 0, melhorDia: null, piorDia: null, faltaParaEquilibrar: 0, previsao: null, projecaoFechamento: null, diasDeFolga: 0, diasTrabalhadosVinculo: 0, custoColabPorDia: 0 };
  const total = vinculo.diasMes;
  if (!total) return vazio;
  const primeiro = `${mes}-01`, fim = `${mes}-${pad(total)}`;
  if (hoje < primeiro) return vazio;   // mês que ainda não começou
  const ultimo = hoje < fim ? hoje : fim;
  const nUltimo = Number(ultimo.slice(8, 10));

  // dia trabalhado = segunda a sexta, ou sábado/domingo em que houve venda
  const trabalha = (data: string) => !ehFimDeSemana(data) || (porDia.get(data)?.pedidos ?? 0) > 0;
  let trabMes = 0, trabVinculo = 0;
  for (let d = 1; d <= total; d++) {
    const data = `${mes}-${pad(d)}`;
    if (!trabalha(data)) continue;
    trabMes++;
    if (vinculo.inicio && data >= vinculo.inicio) trabVinculo++;
  }
  // mês/vínculo sem nenhum dia trabalhado (ex.: registrada só no fim de semana): volta a dividir pelos dias do calendário
  const custoColabDia = vinculo.diasVinculo > 0 ? o.custoColabMes / (trabVinculo || vinculo.diasVinculo) : 0;
  const custoAdsDia = o.incluirAds ? o.custoLivesMes / (trabMes || total) : 0;

  const dias: DiaSerie[] = [];
  let acum = 0;
  for (let d = 1; d <= nUltimo; d++) {
    const data = `${mes}-${pad(d)}`;
    const v = porDia.get(data);
    const trabalhado = trabalha(data);
    const vinculada = !!vinculo.inicio && data >= vinculo.inicio;
    const custoColab = vinculada && trabalhado ? custoColabDia : 0;
    const custoAds = trabalhado ? custoAdsDia : 0;
    const liquidez = v?.liquidez ?? 0;
    const resultado = liquidez - custoColab - custoAds;
    acum += resultado;
    dias.push({ data, dia: d, diaSemana: diaSemana(data), vendas: v?.vendas ?? 0, pedidos: v?.pedidos ?? 0, liquidez, custoColab, custoAds, resultado, acumulado: acum, temVenda: !!v && v.pedidos > 0, vinculada, trabalhado });
  }

  const acumuladoFinal = acum;
  const positivo = (x: number) => centavos(x) >= 0;
  let equilibrio: SerieEquilibrio["equilibrio"] = null;
  if (dias.length && positivo(acumuladoFinal)) {
    let i = dias.length - 1;
    while (i > 0 && positivo(dias[i - 1].acumulado)) i--;
    equilibrio = { data: dias[i].data, dia: dias[i].dia, desdeOInicio: i === 0 };
  }
  const liquidezAcumulada = dias.reduce((a, d) => a + d.liquidez, 0);
  const custoColabAcumulado = dias.reduce((a, d) => a + d.custoColab, 0);
  const custoAdsAcumulado = dias.reduce((a, d) => a + d.custoAds, 0);
  const ordenados = dias.filter((d) => d.trabalhado).sort((a, b) => a.resultado - b.resultado);

  // previsão: ritmo médio de liquidez por DIA TRABALHADO até agora contra o custo diário que continua correndo (folga não conta)
  let previsao: SerieEquilibrio["previsao"] = null;
  let projecaoFechamento: number | null = null;
  const trabalhadosAteAgora = dias.filter((d) => d.trabalhado).length;
  const futuros: string[] = [];   // dias úteis que ainda faltam no mês
  for (let d = nUltimo + 1; d <= total; d++) { const data = `${mes}-${pad(d)}`; if (!ehFimDeSemana(data)) futuros.push(data); }
  if (dias.length && futuros.length > 0 && trabalhadosAteAgora > 0) {
    const ritmo = liquidezAcumulada / trabalhadosAteAgora;
    projecaoFechamento = ritmo * (trabalhadosAteAgora + futuros.length) - (vinculo.diasVinculo > 0 ? o.custoColabMes : 0) - (o.incluirAds ? o.custoLivesMes : 0);
    if (!positivo(acumuladoFinal)) {
      const liquidoPorDia = ritmo - custoColabDia - custoAdsDia;   // supõe o vínculo já em curso
      if (liquidoPorDia > 0) {
        const n = Math.ceil(-acumuladoFinal / liquidoPorDia);
        previsao = n <= futuros.length ? { data: futuros[n - 1], dia: Number(futuros[n - 1].slice(8, 10)) } : "fora_do_mes";
      } else previsao = "fora_do_mes";
    }
  }

  return {
    dias, ultimoDia: ultimo, equilibrio,
    acumuladoFinal, liquidezAcumulada, custoColabAcumulado, custoAdsAcumulado,
    diasLucro: dias.filter((d) => d.trabalhado && centavos(d.resultado) > 0).length, diasPrejuizo: dias.filter((d) => d.trabalhado && centavos(d.resultado) < 0).length,
    diasSemVenda: dias.filter((d) => d.trabalhado && !d.temVenda).length, diasDeFolga: dias.filter((d) => !d.trabalhado).length,
    diasTrabalhadosVinculo: trabVinculo || vinculo.diasVinculo, custoColabPorDia: custoColabDia,
    melhorDia: ordenados.length ? ordenados[ordenados.length - 1] : null, piorDia: ordenados.length ? ordenados[0] : null,
    faltaParaEquilibrar: positivo(acumuladoFinal) ? 0 : -acumuladoFinal,
    previsao, projecaoFechamento,
  };
}
