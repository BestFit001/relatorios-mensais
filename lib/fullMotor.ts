// Motor do Full (e da análise fora do Full): transforma as linhas do relatório de vendas do canal em linhas por SKU
// (receita, líquido, lucro, cobertura, ritmo, diagnóstico). Usado pela tela Full e pelo upload de vendas do Mercado Livre,
// que alimenta o Full sozinho. As funções puras não dependem de React; as que gravam recebem o cliente do Supabase.
import {
  normTexto, statusCancelado, removerSufixoFba, avaliarFormulaCanal, parseDiaVenda, classificarRitmo, diasDoMesRef,
  REGRAS_RITMO_PADRAO, aplicarFiltroFull, detectarColunasML, type RegraRitmo,
} from "./fulfillment";
import { formulaUsaQuantidade } from "./formulaRepasse";
import { ehMercadoLivre } from "./tarifacao";

export type ModoFull = "full" | "padrao";

/* ------------------------------------------------------------------ */
/* Utilitários                                                          */
/* ------------------------------------------------------------------ */

const matrizFretes = [
  { atePeso: 0.3, faixas: { "78.99": 8.15, "99.99": 12.95, "119.99": 14.95, "149.99": 16.95, "199.99": 19.05, "200": 21.65 } },
  { atePeso: 0.5, faixas: { "78.99": 8.25, "99.99": 13.85, "119.99": 16.15, "149.99": 18.15, "199.99": 20.45, "200": 23.25 } },
  { atePeso: 1.0, faixas: { "78.99": 8.45, "99.99": 14.45, "119.99": 16.85, "149.99": 19.05, "199.99": 21.35, "200": 24.45 } },
  { atePeso: 1.5, faixas: { "78.99": 8.65, "99.99": 14.75, "119.99": 17.15, "149.99": 19.45, "199.99": 21.75, "200": 25.45 } },
  { atePeso: 2.0, faixas: { "78.99": 8.75, "99.99": 15.05, "119.99": 17.65, "149.99": 19.85, "199.99": 22.25, "200": 25.55 } },
  { atePeso: 3.0, faixas: { "78.99": 9.15, "99.99": 16.45, "119.99": 19.15, "149.99": 21.65, "199.99": 24.35, "200": 27.05 } },
  { atePeso: 4.0, faixas: { "78.99": 9.75, "99.99": 17.85, "119.99": 20.75, "149.99": 23.35, "199.99": 26.35, "200": 29.25 } },
  { atePeso: 5.0, faixas: { "78.99": 10.25, "99.99": 19.75, "119.99": 22.85, "149.99": 26.05, "199.99": 29.25, "200": 32.45 } },
  { atePeso: 6.0, faixas: { "78.99": 10.35, "99.99": 25.95, "119.99": 29.15, "149.99": 33.35, "199.99": 36.45, "200": 40.85 } },
  { atePeso: 7.0, faixas: { "78.99": 10.45, "99.99": 27.55, "119.99": 31.65, "149.99": 36.75, "199.99": 40.85, "200": 45.25 } },
];

export function calcularFreteML(pdv: number, pesoReal: number, altura: number, largura: number, comprimento: number): number {
  if (pdv < 79.00) return 0.00;
  const pesoVolumetrico = (altura * largura * comprimento) / 6000;
  const pesoConsiderado = Math.max(pesoReal, pesoVolumetrico);
  let linhaFrete = matrizFretes.find(m => pesoConsiderado <= m.atePeso);
  if (!linhaFrete) linhaFrete = matrizFretes[matrizFretes.length - 1];
  let valorFrete = 0;
  if (pdv < 79) valorFrete = linhaFrete.faixas["78.99"];
  else if (pdv < 100) valorFrete = linhaFrete.faixas["99.99"];
  else if (pdv < 120) valorFrete = linhaFrete.faixas["119.99"];
  else if (pdv < 150) valorFrete = linhaFrete.faixas["149.99"];
  else if (pdv < 200) valorFrete = linhaFrete.faixas["199.99"];
  else valorFrete = linhaFrete.faixas["200"];
  return valorFrete || 0;
}

export function normalizarSku(valor: any) {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/^["']|["']$/g, "").trim();
  // Full/FBA: o sufixo "-F" / "-FBA" (e tudo à direita do "-") é sempre desconsiderado ao validar o produto
  return removerSufixoFba(s.toLowerCase());
}

export function parseNumero(valor: any): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;
  let s = String(valor).replace(/R\$/g, "").replace(/\s/g, "").trim();
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

export function verificarDataNoPeriodo(dataStr: any, periodoCompetencia: string): boolean {
  if (periodoCompetencia === "TODOS") return true;
  if (!dataStr) return false;
  const [mesAlvo, anoAlvo] = periodoCompetencia.split("/");
  const str = String(dataStr).trim();
  if (str.includes("-")) {
    const partes = str.split("-");
    if (partes.length >= 3) {
      const a = partes[0]; const m = partes[1].padStart(2, "0");
      return a === anoAlvo && m === mesAlvo.padStart(2, "0");
    }
  }
  if (str.includes("/")) {
    const partes = str.split("/");
    if (partes.length === 3) {
      const m = partes[1].padStart(2, "0"); const a = partes[2];
      return a === anoAlvo && m === mesAlvo.padStart(2, "0");
    }
  }
  return false;
}

/** Termos separados por vírgula (ou ; |), sem acento e em minúsculas. */
export function termosDaLista(texto: string): string[] {
  return String(texto || "").split(/[,;|]/).map((t) => normTexto(t)).filter(Boolean);
}

/** O status do pedido é descartado pela configuração do canal? (lista de "ignorar" e, se houver, lista de "considerar") */
export function statusDescartadoPorRegra(status: any, considerar: string[], ignorar: string[]): boolean {
  const s = normTexto(status);
  if (!s) return false;   // sem status na linha: não descarta
  if (ignorar.some((t) => s.includes(t))) return true;
  if (considerar.length > 0 && !considerar.some((t) => s.includes(t))) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Configuração do canal                                                */
/* ------------------------------------------------------------------ */

export interface ConfigFull {
  linha: string; colPedido: string; colCarrinho: string; colSku: string; colMlb: string; colQtd: string; colPdv: string;
  colLiquido: string; colPacoteRec: string; colEntrega: string; textoEntrega: string; taxaFlex: string;
  comissao: string; imposto: string; metaDias: string; embalagem: string;
  formula: "ml_recalculo" | "formula_regras"; formulaVendas: string;
  margemMin: string; vendasMin: string; tetoDev: string; colData: string;
  regrasRitmo: RegraRitmo[]; pctDevAtencao: string; minVendasDev: string;
  colIdFull: string; textoIdFull: string; pdvTotalLinha: boolean;
  statusConsiderar: string;   // status que valem (vírgula); vazio = todos
  statusIgnorar: string;      // status descartados (vírgula)
}

export const STATUS_IGNORAR_PADRAO_ML = "cancelada, vamos te devolver";
export const TEXTO_FULL_PADRAO_ML = "mercado envios full";

/** Configuração inicial do canal (o que a tela já usava) com o que foi salvo por cima. `salvo` é o JSON guardado antes. */
export function resolverConfigFull(canal: string, regra: any, salvo: any): ConfigFull {
  const ml = ehMercadoLivre(canal);
  const tipoSalvo = salvo && (salvo.formula === "ml_recalculo" || salvo.formula === "formula_regras") ? salvo.formula : null;
  const tipo: "ml_recalculo" | "formula_regras" = tipoSalvo || (ml ? "ml_recalculo" : "formula_regras");
  const c: ConfigFull = {
    linha: "7", colPedido: "A", colCarrinho: "D", colSku: "X", colMlb: "Y", colQtd: "H", colPdv: "AC", colLiquido: "T",
    colPacoteRec: "I", colEntrega: "AS", textoEntrega: "flex", taxaFlex: "12.99",
    comissao: "19", imposto: "9", metaDias: "45", embalagem: "0.70",
    formula: tipo, formulaVendas: "", margemMin: "12", vendasMin: "3", tetoDev: "10", colData: "B",
    regrasRitmo: REGRAS_RITMO_PADRAO, pctDevAtencao: "5", minVendasDev: "5",
    colIdFull: "", textoIdFull: "", pdvTotalLinha: normTexto(canal).includes("amazon"),
    statusConsiderar: "", statusIgnorar: "",
  };
  if (tipo === "formula_regras") {
    // Canais fora do ML: colunas e fórmula vêm da aba Regras; entrega com taxa, data e status são opcionais
    c.formulaVendas = String(regra?.formula_excel || "PDV - (PDV * 12%)");
    c.colSku = String(regra?.col_sku || "B").toUpperCase();
    c.colPdv = String(regra?.col_pdv || regra?.col_preco_venda || "P").toUpperCase();
    c.colQtd = String(regra?.col_quantidade || "O").toUpperCase();
    c.colPedido = String(regra?.col_id_pedido || "A").toUpperCase();
    c.colCarrinho = ""; c.linha = "2"; c.colEntrega = ""; c.textoEntrega = ""; c.taxaFlex = "0"; c.colData = "";
  } else if (ml) {
    c.colIdFull = "AR"; c.textoIdFull = TEXTO_FULL_PADRAO_ML; c.statusIgnorar = STATUS_IGNORAR_PADRAO_ML;
  }
  if (salvo && tipoSalvo) {
    const set = (k: keyof ConfigFull, v: any) => { if (v !== undefined && v !== null) (c as any)[k] = v; };
    if (salvo.linha) c.linha = salvo.linha;
    set("colPedido", salvo.colPedido); set("colCarrinho", salvo.colCarrinho);
    if (salvo.colSku) c.colSku = salvo.colSku; if (salvo.colMlb) c.colMlb = salvo.colMlb; if (salvo.colQtd) c.colQtd = salvo.colQtd;
    if (salvo.colPdv) c.colPdv = salvo.colPdv; if (salvo.colLiquido) c.colLiquido = salvo.colLiquido;
    if (salvo.colPacoteRec) c.colPacoteRec = salvo.colPacoteRec;
    set("colEntrega", salvo.colEntrega); set("textoEntrega", salvo.textoEntrega); set("taxaFlex", salvo.taxaFlex); set("colData", salvo.colData);
    set("colIdFull", salvo.colIdFull); set("textoIdFull", salvo.textoIdFull);
    set("statusConsiderar", salvo.statusConsiderar); set("statusIgnorar", salvo.statusIgnorar);
    if (salvo.formulaVendas !== undefined && tipo === "formula_regras") c.formulaVendas = salvo.formulaVendas;
    if (salvo.pdvTotalLinha !== undefined) c.pdvTotalLinha = !!salvo.pdvTotalLinha;
  }
  if (salvo) {
    if (salvo.comissao) c.comissao = salvo.comissao; if (salvo.imposto) c.imposto = salvo.imposto; if (salvo.metaDias) c.metaDias = salvo.metaDias;
    if (salvo.embalagem) c.embalagem = salvo.embalagem; if (salvo.margemMin) c.margemMin = salvo.margemMin; if (salvo.vendasMin) c.vendasMin = salvo.vendasMin;
    if (salvo.tetoDev) c.tetoDev = salvo.tetoDev;
    if (salvo.pctDevAtencao !== undefined) c.pctDevAtencao = salvo.pctDevAtencao;
    if (salvo.minVendasDev !== undefined) c.minVendasDev = salvo.minVendasDev;
    if (Array.isArray(salvo.regrasRitmo)) c.regrasRitmo = salvo.regrasRitmo;
  }
  return c;
}

/** Relatório do ML tem 66 ou 67 colunas (as letras deslocam): lê as letras pelo cabeçalho e ajusta a configuração. */
export function aplicarLayoutML(cfg: ConfigFull, matriz: any[]): { cfg: ConfigFull; layout: string | null } {
  const det = detectarColunasML(matriz as any[]);
  if (!det) return { cfg, layout: null };
  const c: ConfigFull = {
    ...cfg, linha: String(det.linhaInicial), colPedido: det.pedido, colCarrinho: det.status, colSku: det.sku, colMlb: det.mlb,
    colQtd: det.unidades, colPdv: det.pdv, colLiquido: det.total, colPacoteRec: det.receita, colEntrega: det.formaEntrega, colData: det.data,
  };
  return { cfg: c, layout: `${det.layout}: SKU ${det.sku} · PDV ${det.pdv} · Qtd ${det.unidades} · Status ${det.status} · Forma de entrega ${det.formaEntrega}` };
}

/* ------------------------------------------------------------------ */
/* Bases usadas pelo motor                                              */
/* ------------------------------------------------------------------ */

export interface BasesFull {
  custosMap: Map<string, any>; regrasMlSkuMap: Map<string, any>; regrasMlMlbMap: Map<string, any>; tinyMap: Map<string, number>;
  devContagem: Map<string, number>; vendasAbc: Map<string, number>; estoqueCD: Map<string, number>;
}

async function lerTudo(db: any, tabela: string, colunas: string, filtro?: (q: any) => any): Promise<any[]> {
  const todos: any[] = []; const passo = 1000; let de = 0;
  for (;;) {
    let q = db.from(tabela).select(colunas).range(de, de + passo - 1);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    todos.push(...data); de += passo;
    if (data.length < passo) break;
  }
  return todos;
}

export async function carregarBasesFull(
  db: any, canal: string, mes: string,
  prontas?: Partial<Pick<BasesFull, "custosMap" | "regrasMlSkuMap" | "regrasMlMlbMap" | "tinyMap">>,
): Promise<BasesFull> {
  // A tela já tem custos, regras de MLB e estoque Sede carregados: reaproveita. O upload carrega do banco.
  let custosMap = prontas?.custosMap;
  if (!custosMap || custosMap.size === 0) {
    custosMap = new Map<string, any>();
    (await lerTudo(db, "tabela_custos_skus", "*")).forEach((c) => custosMap!.set(normalizarSku(c.sku), c));
  }
  let regrasMlSkuMap = prontas?.regrasMlSkuMap; let regrasMlMlbMap = prontas?.regrasMlMlbMap;
  if (!regrasMlSkuMap || !regrasMlMlbMap) {
    regrasMlSkuMap = new Map<string, any>(); regrasMlMlbMap = new Map<string, any>();
    (await lerTudo(db, "ml_anuncios_regras", "*")).forEach((m) => {
      if (m.sku) regrasMlSkuMap!.set(normalizarSku(m.sku), m);
      if (m.mlb) regrasMlMlbMap!.set(String(m.mlb).trim().toUpperCase(), m);
      if (m.anuncio) regrasMlMlbMap!.set(String(m.anuncio).trim().toUpperCase(), m);
    });
  }
  let tinyMap = prontas?.tinyMap;
  if (!tinyMap || tinyMap.size === 0) {
    tinyMap = new Map<string, number>();
    (await lerTudo(db, "cadastros_base_tiny", "sku, estoque")).forEach((t) => tinyMap!.set(normalizarSku(t.sku), Number(t.estoque || 0)));
  }

  // Aba Devoluções: unidades devolvidas do SKU, neste canal, no mês de competência
  let dev: any[] = [];
  const d1 = await db.from("devolucoes").select("sku, data_retorno, canal, quantidade");
  if (d1.error) { const d2 = await db.from("devolucoes").select("sku, data_retorno, canal"); dev = d2.data || []; } else dev = d1.data || [];
  const devContagem = new Map<string, number>();
  dev.forEach((d: any) => {
    if (verificarDataNoPeriodo(d.data_retorno, mes) && normTexto(d.canal) === normTexto(canal)) {
      const k = normalizarSku(d.sku); const unid = Math.max(1, Number(d.quantidade) || 1);
      if (k) devContagem.set(k, (devContagem.get(k) || 0) + unid);
    }
  });
  const { data: abc } = await db.from("curva_abc").select("codigo, quantidade").eq("mes_referencia", mes);
  const vendasAbc = new Map<string, number>();
  (abc || []).forEach((a: any) => { const k = normalizarSku(a.codigo); if (k) vendasAbc.set(k, (vendasAbc.get(k) || 0) + Number(a.quantidade || 0)); });
  const { data: est } = await db.from("estoque_cd_mensal").select("sku, estoque").eq("canal", canal).eq("mes_referencia", mes);
  const estoqueCD = new Map<string, number>();
  (est || []).forEach((e: any) => { const k = normalizarSku(e.sku); estoqueCD.set(k, (estoqueCD.get(k) || 0) + Number(e.estoque || 0)); });
  return { custosMap, regrasMlSkuMap, regrasMlMlbMap, tinyMap, devContagem, vendasAbc, estoqueCD };
}

/* ------------------------------------------------------------------ */
/* Motor                                                                */
/* ------------------------------------------------------------------ */

export interface ResultadoMotor {
  resultados: any[];
  filtro: { ativo: boolean; mantidas: number; ignoradas: number };
  erro?: { tipo: "formula" | "full_vazio"; texto: string };
}

export function calcularFull(p: { cfg: ConfigFull; modo: ModoFull; matriz: any[]; canal: string; mes: string; bases: BasesFull }): ResultadoMotor {
  const { cfg, modo, matriz, canal, mes, bases } = p;
  const { custosMap, regrasMlSkuMap, regrasMlMlbMap, tinyMap } = bases;
  const colPedido = cfg.colPedido.trim().toUpperCase();
  const colPacote = cfg.colCarrinho.trim().toUpperCase();
  const temColunaPacote = colPacote !== "" && colPacote !== "ZZZ";
  const colSku = cfg.colSku.trim().toUpperCase();
  const colMlb = cfg.colMlb.trim().toUpperCase();
  const colQtd = cfg.colQtd.trim().toUpperCase();
  const colPdv = cfg.colPdv.trim().toUpperCase();
  const colLiquido = cfg.colLiquido.trim().toUpperCase();
  const colRecPacote = cfg.colPacoteRec.trim().toUpperCase();
  const colEntrega = cfg.colEntrega.trim().toUpperCase();
  const modoFormulaRegras = cfg.formula === "formula_regras";
  const palavraEntrega = normTexto(cfg.textoEntrega);
  const temColunaEntrega = modo === "padrao" && colEntrega !== "" && colEntrega !== "ZZZ" && palavraEntrega !== "";   // Flex só existe na Logística Própria
  const ehEnvioComTaxa = (valor: any) => temColunaEntrega && normTexto(valor).includes(palavraEntrega);
  const considerarStatus = termosDaLista(cfg.statusConsiderar);
  const ignorarStatus = termosDaLista(cfg.statusIgnorar);
  const descartaStatus = (s: any) => statusDescartadoPorRegra(s, considerarStatus, ignorarStatus);

  if (modoFormulaRegras && (!cfg.formulaVendas.trim() || avaliarFormulaCanal(cfg.formulaVendas, 100, 1, colPdv, colQtd) === null)) {
    return { resultados: [], filtro: { ativo: false, mantidas: 0, ignoradas: 0 }, erro: { tipo: "formula", texto: "A fórmula de vendas do canal está vazia ou inválida. Ajuste em Configuração do Canal (ex.: PDV - (PDV * 12%)), como na aba Regras." } };
  }

  const impostoPct = Number(cfg.imposto.replace(",", ".")) || 0;
  const embalagemUnit = Number(cfg.embalagem.replace(",", ".")) || 0;
  const taxaFlexNum = Number(String(cfg.taxaFlex).replace(",", "."));
  const taxaFlexUnit = isNaN(taxaFlexNum) ? 0 : taxaFlexNum;
  const metaDias = Number(cfg.metaDias) || 45;
  const metaMargemPromissora = Number(cfg.margemMin.replace(",", ".")) || 12;
  const metaVendasMin = Number(cfg.vendasMin) || 3;
  const limiteDevolucao = Number(String(cfg.tetoDev).replace(",", ".")) || 10;
  const limiteAtencaoDev = Number(String(cfg.pctDevAtencao).replace(",", ".")) || 5;
  const amostraMinDev = Number(cfg.minVendasDev) || 0;
  const startRow = Math.max(0, parseInt(cfg.linha, 10) - 1 || 0);

  // Identificação do Full: coluna + texto. Em branco = tudo o que foi enviado é Full.
  // Preenchido: o Full usa só as linhas que casam; a análise fora do Full descarta as que casam.
  const filtroFull = aplicarFiltroFull(matriz, startRow, colPacote, cfg.colIdFull, cfg.textoIdFull, modo === "full" ? "incluir" : "excluir");
  const matrizUsada = filtroFull.matriz;
  const filtroFullAtivo = cfg.colIdFull.trim() !== "" && cfg.textoIdFull.trim() !== "";
  if (filtroFullAtivo && filtroFull.mantidas === 0) {
    return {
      resultados: [], filtro: { ativo: true, mantidas: 0, ignoradas: filtroFull.ignoradas },
      erro: { tipo: "full_vazio", texto: modo === "full"
        ? `Nenhuma linha da planilha tem "${cfg.textoIdFull}" na coluna ${cfg.colIdFull.toUpperCase()}. Confira a "Identificação do Full" em Configuração do Canal (ou deixe em branco para considerar tudo como Full).`
        : `Todas as linhas da planilha foram identificadas como Full ("${cfg.textoIdFull}" na coluna ${cfg.colIdFull.toUpperCase()}), então não sobrou nada fora do Full.` },
    };
  }

  // 1. Mapeia ordens de alteração (para capturar valor financeiro em caso de troca)
  const pedidosAlteracaoMap = new Map<string, { receita: number; liquido: number; isFlex: boolean }>();
  for (let r = startRow; r < matrizUsada.length; r++) {
    const row = matrizUsada[r];
    if (!row) continue;
    const idPed = String(row[colPedido] || "").trim();
    const status = String(row[colPacote] || "").toLowerCase();
    if (idPed && status.includes("solicitação de alteração")) {
      const rec = parseNumero(row[colRecPacote]);
      let liq = parseNumero(row[colLiquido]);
      const forma = temColunaEntrega ? String(row[colEntrega] || "") : "";
      const isFlex = ehEnvioComTaxa(forma);
      if (isFlex) liq -= taxaFlexUnit;
      pedidosAlteracaoMap.set(idPed, { receita: rec, liquido: liq, isFlex });
    }
  }

  const { devContagem: mapaDevContagem, vendasAbc: mapaVendasAbc, estoqueCD: mapaEstoqueCD } = bases;
  const mapaAgrupado = new Map<string, any>();
  const trocasJaProcessadas = new Set<string>();

  // Datas das vendas válidas por SKU (para o ritmo "N vendas em D dias")
  const colData = cfg.colData.trim().toUpperCase();
  const mapaDias = new Map<string, Map<number, number>>();
  const registrarDia = (skuKey: string, qtd: number, linha: any, linhaPai?: any) => {
    if (!colData) return;
    let dia = parseDiaVenda(linha?.[colData]);
    if (dia === null && linhaPai) dia = parseDiaVenda(linhaPai?.[colData]);
    if (dia === null) return;
    const m = mapaDias.get(skuKey) || new Map<number, number>();
    m.set(dia, (m.get(dia) || 0) + qtd);
    mapaDias.set(skuKey, m);
  };

  let r = startRow;
  while (r < matrizUsada.length) {
    const row = matrizUsada[r];
    if (!row) { r++; continue; }

    const idPedido = String(row[colPedido] || "").trim();
    const textoStatus = temColunaPacote ? String(row[colPacote] || "").trim() : "";
    const statusLower = textoStatus.toLowerCase();

    // Pula linha-mãe de alteração original (o valor foi associado à troca)
    if (statusLower.includes("solicitação de alteração")) { r++; continue; }

    const isTroca = statusLower.includes("troca");
    const matchPacote = temColunaPacote ? textoStatus.match(/^pacote\s*(?:de)?\s*(\d+)/i) : null;

    const formaEntregaTexto = temColunaEntrega ? String(row[colEntrega] || "") : "";
    const isFlex = ehEnvioComTaxa(formaEntregaTexto);

    // CANCELADO: a informação está no próprio status. Linha cancelada não é venda: não entra PDV nem custo do SKU.
    // Também sai o que a configuração do canal manda descartar (ex.: "Vamos te devolver…") ou não manda considerar.
    // A linha-mãe de um carrinho ("Pacote de N produtos") não tem status próprio: cada item é avaliado abaixo.
    const isCanceladaOuDevolvida = !isTroca && !matchPacote && (statusCancelado(textoStatus) || descartaStatus(textoStatus));
    if (isCanceladaOuDevolvida) { r++; continue; }

    // CASO 1: TROCA DE PRODUTO (Custo e faturamento computados 1x)
    if (isTroca) {
      const skuOrig = String(row[colSku] || "").trim();
      const skuKey = normalizarSku(skuOrig);
      if (skuKey) {
        const chaveTroca = `${idPedido}_${skuKey}`;
        if (!trocasJaProcessadas.has(chaveTroca)) {
          trocasJaProcessadas.add(chaveTroca);
          const infoOrig = pedidosAlteracaoMap.get(idPedido);
          if (infoOrig) {
            let receitaTroca = parseNumero(row[colPdv]);
            if (receitaTroca === 0) receitaTroca = infoOrig.receita;
            let liquidoTroca = infoOrig.liquido;
            if (isFlex && !infoOrig.isFlex) liquidoTroca -= taxaFlexUnit;
            registrarDia(skuKey, 1, row);
            if (mapaAgrupado.has(skuKey)) {
              const exist = mapaAgrupado.get(skuKey);
              exist.receitaBruta += receitaTroca; exist.liquidoML += liquidoTroca; exist.qtdVendida += 1;
            } else {
              mapaAgrupado.set(skuKey, { sku: skuOrig, skuKey, receitaBruta: receitaTroca, liquidoML: liquidoTroca, qtdVendida: 1 });
            }
          }
        }
      }
      r++;
      continue;
    }

    // CASO 2: PRODUTO EM CARRINHO (DESCONSIDERA A LINHA DO PACOTE E RECALCULA TAXAS VIA MLB)
    if (matchPacote) {
      const qtdItensPacote = parseInt(matchPacote[1], 10);
      for (let k = 1; k <= qtdItensPacote; k++) {
        if (r + k < matrizUsada.length) {
          const chRow = matrizUsada[r + k];
          // Cada item do carrinho tem o seu próprio status: item cancelado (ou descartado pela configuração) sai
          const stItem = temColunaPacote ? chRow?.[colPacote] : "";
          if (!chRow || statusCancelado(stItem) || descartaStatus(stItem)) continue;
          const chSkuOrig = String(chRow[colSku] || "").trim();
          const chSkuKey = normalizarSku(chSkuOrig);
          const chMlbCod = String(chRow[colMlb] || "").trim().toUpperCase();
          const chQtd = Math.max(1, parseNumero(chRow[colQtd]) || 1);
          const chPdvUnit = parseNumero(chRow[colPdv]);
          const chReceitaTotalItem = chPdvUnit * chQtd;

          if (chSkuKey) {
            const mlRegra = regrasMlMlbMap.get(chMlbCod) || regrasMlSkuMap.get(chSkuKey);
            const comissaoPct = mlRegra && Number(mlRegra.comissao) > 0 ? Number(mlRegra.comissao) : (Number(cfg.comissao) || 19);
            let tarifaFixaItem = 0;
            let freteTotalItem = 0;
            if (chPdvUnit < 79.00) {
              tarifaFixaItem = 6.50 * chQtd;   // abaixo de R$ 79: tarifa fixa do ML
            } else {
              // A partir de R$ 79: peso real e dimensões cadastradas no MLB e frete da matriz
              const pesoReal = mlRegra && Number(mlRegra.peso_real) > 0 ? Number(mlRegra.peso_real) : (Number(mlRegra?.peso) || 2.0);
              const altura = mlRegra && Number(mlRegra.altura) > 0 ? Number(mlRegra.altura) : 10;
              const largura = mlRegra && Number(mlRegra.largura) > 0 ? Number(mlRegra.largura) : 10;
              const comprimento = mlRegra && Number(mlRegra.comprimento) > 0 ? Number(mlRegra.comprimento) : 10;
              freteTotalItem = calcularFreteML(chPdvUnit, pesoReal, altura, largura, comprimento) * chQtd;
            }
            const comissaoTotalItem = (chReceitaTotalItem * (comissaoPct / 100)) + tarifaFixaItem;
            let liquidoCalculadoItem = chReceitaTotalItem - comissaoTotalItem - freteTotalItem;
            if (isFlex) liquidoCalculadoItem -= taxaFlexUnit;

            registrarDia(chSkuKey, chQtd, chRow, row);
            if (mapaAgrupado.has(chSkuKey)) {
              const exist = mapaAgrupado.get(chSkuKey);
              exist.receitaBruta += chReceitaTotalItem; exist.liquidoML += liquidoCalculadoItem; exist.qtdVendida += chQtd;
            } else {
              mapaAgrupado.set(chSkuKey, { sku: chSkuOrig, skuKey: chSkuKey, receitaBruta: chReceitaTotalItem, liquidoML: liquidoCalculadoItem, qtdVendida: chQtd });
            }
          }
        }
      }
      r += (qtdItensPacote + 1);
    } else {
      // CASO 3: VENDA AVULSA PADRÃO
      const skuOriginal = String(row[colSku] || "").trim();
      const skuKey = normalizarSku(skuOriginal);
      if (!skuKey || skuKey === "sku" || skuKey === "total") { r++; continue; }

      const qtdLinha = Math.max(1, parseNumero(row[colQtd]) || 1);
      const pdvCelula = parseNumero(row[colPdv]);
      // Coluna PDV com o valor total da linha: o preço da unidade é a linha ÷ quantidade
      const pdvUnit = modoFormulaRegras && cfg.pdvTotalLinha ? pdvCelula / qtdLinha : pdvCelula;
      let receitaBrutaLinha = pdvUnit * qtdLinha;
      if (receitaBrutaLinha === 0 && colRecPacote && !modoFormulaRegras) receitaBrutaLinha = parseNumero(row[colRecPacote]);

      let liquidoLinha = 0;
      if (modoFormulaRegras) {
        // CANAIS FORA DO ML: PDV, SKU e Qtd nas colunas informadas + fórmula de vendas (igual à aba Regras)
        // Faixas de preço, tarifa fixa e frete valem para UMA unidade. Fórmula sem QTD: líquido de 1 unidade × quantidade.
        const calc = formulaUsaQuantidade(cfg.formulaVendas, colQtd)
          ? avaliarFormulaCanal(cfg.formulaVendas, pdvUnit, qtdLinha, colPdv, colQtd)
          : (() => { const u = avaliarFormulaCanal(cfg.formulaVendas, pdvUnit, 1, colPdv, colQtd); return u === null ? null : u * qtdLinha; })();
        liquidoLinha = calc !== null ? calc : Math.max(0, receitaBrutaLinha * 0.84);
        if (isFlex) liquidoLinha -= taxaFlexUnit;
      } else {
        // MERCADO LIVRE: coluna Total com abatimento de Flex
        liquidoLinha = parseNumero(row[colLiquido]);
        if (isFlex) liquidoLinha -= taxaFlexUnit;
      }

      registrarDia(skuKey, qtdLinha, row);
      if (mapaAgrupado.has(skuKey)) {
        const exist = mapaAgrupado.get(skuKey);
        exist.receitaBruta += receitaBrutaLinha; exist.liquidoML += liquidoLinha; exist.qtdVendida += qtdLinha;
      } else {
        mapaAgrupado.set(skuKey, { sku: skuOriginal, skuKey, receitaBruta: receitaBrutaLinha, liquidoML: liquidoLinha, qtdVendida: qtdLinha });
      }
      r++;
    }
  }

  // Consolidação Financeira Final
  const resultados = Array.from(mapaAgrupado.values()).map((item: any) => {
    const skuKey = item.skuKey;
    const custoData = custosMap.get(skuKey);
    const custoUnitario = Number(custoData?.custo_unitario || 0);
    const produtoNome = custoData?.produto || "Produto Desconhecido";
    const estoqueCD = mapaEstoqueCD.get(skuKey) || 0;
    const estoqueCentral = tinyMap.get(skuKey) || 0;
    const devolucoesTotais = mapaDevContagem.get(skuKey) || 0;
    const vendasTotais = Math.max(mapaVendasAbc.get(skuKey) || 0, item.qtdVendida);
    const taxaDevolucao = vendasTotais > 0 ? (devolucoesTotais / vendasTotais) * 100 : 0;

    let lucroRs = 0;
    let margemPct = 0;
    if (item.qtdVendida > 0) {
      const custoProdutoTotal = custoUnitario * item.qtdVendida;
      const impostoTotal = item.receitaBruta * (impostoPct / 100);
      const embalagemTotal = modo === "padrao" ? (embalagemUnit * item.qtdVendida) : 0;
      // FÓRMULA FINAL: LÍQUIDO RECALCULADO - CUSTO - IMPOSTO - EMBALAGEM
      lucroRs = item.liquidoML - custoProdutoTotal - impostoTotal - embalagemTotal;
      margemPct = item.receitaBruta > 0 ? (lucroRs / item.receitaBruta) * 100 : 0;
    }
    const tarifaFreteSoma = item.receitaBruta - item.liquidoML;

    // Indicadores Logísticos
    const vmd = item.qtdVendida / 30;
    const coberturaAtual = vmd > 0 ? (estoqueCD / vmd) : (estoqueCD > 0 ? 999 : 0);
    let sugestaoEnvioBruta = Math.ceil((vmd * metaDias) - estoqueCD);
    if (sugestaoEnvioBruta < 0) sugestaoEnvioBruta = 0;

    let statusEstoque = "";
    if (coberturaAtual <= 10 && vmd > 0) statusEstoque = "Ruptura Iminente";
    else if (coberturaAtual > 60 && estoqueCD > 5) statusEstoque = "Risco de Aging";
    else if (vmd === 0 && estoqueCD > 0) statusEstoque = "Estoque Parado";
    else statusEstoque = "Saudável";

    // Devolução alta: não recomenda o envio (só com amostra mínima de vendas)
    const devAlta = devolucoesTotais > 0 && vendasTotais >= amostraMinDev && taxaDevolucao >= limiteDevolucao;
    const ritmo = classificarRitmo(cfg.regrasRitmo, item.qtdVendida, mapaDias.get(skuKey) || null, diasDoMesRef(mes));

    let statusEnvio = "";
    let qtdEnviar = sugestaoEnvioBruta;
    if (sugestaoEnvioBruta > 0 && devAlta) {
      statusEnvio = `🚫 Não Enviar (Devolução ${taxaDevolucao.toFixed(1)}%)`;
      qtdEnviar = 0;
    } else if (sugestaoEnvioBruta > 0) {
      if (estoqueCentral >= sugestaoEnvioBruta) statusEnvio = "✅ Enviar Agora";
      else if (estoqueCentral > 0 && estoqueCentral < sugestaoEnvioBruta) { statusEnvio = "⚠️ Enviar Parcial"; qtdEnviar = estoqueCentral; }
      else { statusEnvio = "❌ Falta no Central"; qtdEnviar = 0; }
    } else {
      statusEnvio = "⏸️ Não Enviar";
    }

    let diagnostico = "";
    if (margemPct <= 0) diagnostico = "❌ Prejuízo (Sem Futuro)";
    else if (taxaDevolucao >= limiteDevolucao && devolucoesTotais > 0) diagnostico = "⛔ Alta Devolução (Sem Futuro)";
    else if (margemPct >= metaMargemPromissora && item.qtdVendida >= metaVendasMin && taxaDevolucao < limiteDevolucao) diagnostico = "🌟 Promissor (Escalar)";
    else if (margemPct < 10) diagnostico = "⚠️ Margem Baixa (Atenção)";
    else diagnostico = "✅ Regular (Manter)";

    return {
      canal, mes_referencia: mes, sku: removerSufixoFba(item.sku), produto: produtoNome,
      qtd_vendida: item.qtdVendida, receita_bruta: item.receitaBruta, estoque_cd: estoqueCD, armazenagem: 0,
      estoque_central: estoqueCentral, custo_produto: custoUnitario * item.qtdVendida, imposto: item.receitaBruta * (impostoPct / 100),
      tarifa_frete: tarifaFreteSoma, embalagem: modo === "padrao" ? (embalagemUnit * item.qtdVendida) : 0,
      lucro_liquido: lucroRs, margem_pct: margemPct,
      vmd: Number(vmd.toFixed(2)), cobertura_dias: Number(coberturaAtual.toFixed(1)), sugestao_envio: qtdEnviar,
      status_estoque: statusEstoque, status_envio: statusEnvio, taxa_devolucao: taxaDevolucao,
      qtd_devolucoes: devolucoesTotais, diagnostico,
      ritmo_vendas: ritmo.status, ritmo_nivel: ritmo.nivel, ritmo_por_data: ritmo.porData, dev_atencao: taxaDevolucao >= limiteAtencaoDev && devolucoesTotais > 0,
    };
  });

  return { resultados: resultados.sort((a: any, b: any) => b.receita_bruta - a.receita_bruta), filtro: { ativo: filtroFullAtivo, mantidas: filtroFull.mantidas, ignoradas: filtroFull.ignoradas } };
}

/* ------------------------------------------------------------------ */
/* Gravação                                                             */
/* ------------------------------------------------------------------ */

export function tabelaDoModo(modo: ModoFull): string { return modo === "full" ? "full_lancamentos" : "vendas_padrao_lancamentos"; }

/** Grava a análise do canal/mês (substitui o que havia). No Full também refaz as vendas do mês usadas na baixa FIFO. */
export async function gravarAnaliseFull(db: any, modo: ModoFull, canal: string, mes: string, resultados: any[]): Promise<{ erro?: string; aviso?: string }> {
  const tabela = tabelaDoModo(modo);
  const del = await db.from(tabela).delete().eq("canal", canal).eq("mes_referencia", mes);
  if (del.error) return { erro: `${tabela}: ${del.error.message}` };
  let payload: any[];
  if (modo === "padrao") {
    payload = resultados.map((i: any) => ({
      canal: i.canal, mes_referencia: i.mes_referencia, sku: i.sku, produto: i.produto, qtd_vendida: i.qtd_vendida, receita_bruta: i.receita_bruta,
      custo_produto: i.custo_produto, imposto: i.imposto, tarifa_frete: i.tarifa_frete, embalagem: i.embalagem || 0, lucro_liquido: i.lucro_liquido,
      margem_pct: i.margem_pct, taxa_devolucao: i.taxa_devolucao || 0, qtd_devolucoes: i.qtd_devolucoes || 0, diagnostico: i.diagnostico || "", ritmo_vendas: i.ritmo_vendas || "",
    }));
  } else {
    payload = resultados.map((i: any) => ({
      canal: i.canal, mes_referencia: i.mes_referencia, sku: i.sku, produto: i.produto, qtd_vendida: i.qtd_vendida, receita_bruta: i.receita_bruta,
      estoque_cd: i.estoque_cd || 0, armazenagem: i.armazenagem || 0, estoque_central: i.estoque_central || 0, custo_produto: i.custo_produto, imposto: i.imposto,
      tarifa_frete: i.tarifa_frete, lucro_liquido: i.lucro_liquido, margem_pct: i.margem_pct, vmd: i.vmd || 0, cobertura_dias: i.cobertura_dias || 0,
      sugestao_envio: i.sugestao_envio || 0, status_estoque: i.status_estoque || "", status_envio: i.status_envio || "",
      taxa_devolucao: i.taxa_devolucao || 0, qtd_devolucoes: i.qtd_devolucoes || 0, ritmo_vendas: i.ritmo_vendas || "",
    }));
  }
  let aviso: string | undefined;
  const gravar = async (linhas: any[]) => { for (let k = 0; k < linhas.length; k += 500) { const r = await db.from(tabela).insert(linhas.slice(k, k + 500)); if (r.error) return r.error; } return null; };
  let erro = payload.length ? await gravar(payload) : null;
  if (erro && /taxa_devolucao|qtd_devolucoes|ritmo_vendas/i.test(erro.message)) {
    // Migrations das colunas de devolução/ritmo ainda não executadas: grava o restante e avisa
    const semNovas = payload.map((linha: any) => { const c = { ...linha }; delete c.ritmo_vendas; if (modo === "full") { delete c.taxa_devolucao; delete c.qtd_devolucoes; } return c; });
    erro = await gravar(semNovas);
    if (!erro) aviso = "Gravado sem o campo de ritmo/devolução: execute no Supabase as migrations 20261104090000_full_lancamentos_devolucao_ritmo.sql e 20261104120000_prazos_armazenagem_por_canal.sql.";
  }
  if (erro) return { erro: erro.message };

  if (modo === "full") {
    // Vendas válidas do mês (cancelados já ficaram de fora) dão baixa nos lotes enviados ao Full, do mais antigo ao mais novo (FIFO)
    const vendasMes = resultados.filter((i: any) => Number(i.qtd_vendida) > 0)
      .map((i: any) => ({ canal, mes_referencia: mes, sku: normalizarSku(i.sku), qtd: Math.round(Number(i.qtd_vendida)) }));
    const d2 = await db.from("fulfillment_vendas_mes").delete().eq("canal", canal).eq("mes_referencia", mes);
    if (!d2.error && vendasMes.length > 0) {
      for (let k = 0; k < vendasMes.length; k += 500) await db.from("fulfillment_vendas_mes").insert(vendasMes.slice(k, k + 500));
    }
    const f = await db.rpc("fulfillment_recalcular_fifo", { p_canal: canal });
    if (f.error) aviso = (aviso ? aviso + " " : "") + `FIFO: ${f.error.message}`;
  }
  return { aviso };
}

/* ------------------------------------------------------------------ */
/* Configuração guardada no banco (vale para quem sobe a planilha)       */
/* ------------------------------------------------------------------ */

export async function lerConfigFullDb(db: any, canal: string, modo: ModoFull): Promise<any | null> {
  try {
    const { data, error } = await db.from("full_config_canal").select("config").eq("canal", canal).eq("modo", modo).maybeSingle();
    if (error) return null;
    return data?.config || null;
  } catch { return null; }
}

export async function salvarConfigFullDb(db: any, canal: string, modo: ModoFull, config: any): Promise<void> {
  try { await db.from("full_config_canal").upsert({ canal, modo, config, atualizado_em: new Date().toISOString() }, { onConflict: "canal,modo" }); } catch { /* sem a tabela: segue só com o navegador */ }
}

/* ------------------------------------------------------------------ */
/* Alimentação pelo upload de vendas do Mercado Livre                    */
/* ------------------------------------------------------------------ */

export interface ResumoAlimentacaoFull {
  ok: boolean; texto: string;
  full?: { skus: number; unidades: number; linhasFull: number; descartadas: number };
  fora?: { skus: number };
}

/** Mês da tela de upload (mês "11" + ano "2026") no formato do Full ("11/2026"). */
export function mesDoFull(mes: string, ano: string): string { return `${String(mes).padStart(2, "0")}/${ano}`; }

/**
 * O relatório de vendas do ML tem os pedidos de todas as modalidades. Os de Full (coluna "Forma de entrega" com o texto da configuração)
 * viram o relatório do Full; os demais, a análise fora do Full (base das recomendações). Status descartados (ex.: cancelada) ficam de fora.
 * Os Full não dependem de nota fiscal faturada na planilha: entram todos os que têm um status válido.
 */
export async function alimentarFullPeloUpload(db: any, p: { canal: string; mes: string; matriz: any[] }): Promise<ResumoAlimentacaoFull> {
  const { canal, mes, matriz } = p;
  const { data: regras } = await db.from("config_regras_canais").select("*");
  const regra = (regras || []).find((r: any) => normTexto(r.canal) === normTexto(canal));
  const salvoFull = await lerConfigFullDb(db, canal, "full");
  const salvoPad = await lerConfigFullDb(db, canal, "padrao");
  let cfgFull = resolverConfigFull(canal, regra, salvoFull);
  let cfgPad = resolverConfigFull(canal, regra, salvoPad);
  if (cfgFull.formula !== "ml_recalculo") return { ok: false, texto: "" };   // só o relatório do ML traz a modalidade de entrega

  const lay = aplicarLayoutML(cfgFull, matriz);
  if (!lay.layout) return { ok: false, texto: "Full: o arquivo não parece o relatório de vendas do Mercado Livre (cabeçalho não reconhecido); o Full não foi atualizado." };
  cfgFull = lay.cfg;
  cfgPad = aplicarLayoutML(cfgPad, matriz).cfg;
  // A identificação do Full e os status valem para os dois lados (o que não é Full vai para a análise fora do Full)
  const ident = { colIdFull: cfgFull.colIdFull, textoIdFull: cfgFull.textoIdFull, statusConsiderar: cfgFull.statusConsiderar, statusIgnorar: cfgFull.statusIgnorar };
  // A coluna da modalidade é lida pelo cabeçalho "Forma de entrega" (as letras deslocam entre exportações de 66 e 67 colunas)
  if (!ident.textoIdFull.trim()) ident.textoIdFull = TEXTO_FULL_PADRAO_ML;
  ident.colIdFull = cfgFull.colEntrega;
  cfgFull = { ...cfgFull, ...ident }; cfgPad = { ...cfgPad, ...ident };

  const bases = await carregarBasesFull(db, canal, mes);
  const f = calcularFull({ cfg: cfgFull, modo: "full", matriz, canal, mes, bases });
  if (f.erro && f.erro.tipo === "formula") return { ok: false, texto: `Full: ${f.erro.texto}` };
  if (f.erro && f.erro.tipo === "full_vazio") {
    return { ok: false, texto: `Full: nenhuma venda "${ident.textoIdFull}" na coluna ${ident.colIdFull} (Forma de entrega) desta planilha; o relatório do Full ficou como estava.` };
  }
  const g1 = await gravarAnaliseFull(db, "full", canal, mes, f.resultados);
  if (g1.erro) return { ok: false, texto: `Full: não consegui gravar (${g1.erro}).` };

  const fora = calcularFull({ cfg: cfgPad, modo: "padrao", matriz, canal, mes, bases });
  let foraSkus = 0; let avisoFora = "";
  if (!fora.erro) {
    const g2 = await gravarAnaliseFull(db, "padrao", canal, mes, fora.resultados);
    if (g2.erro) avisoFora = ` A análise fora do Full não foi gravada (${g2.erro}).`; else foraSkus = fora.resultados.length;
  }
  const unidades = f.resultados.reduce((t: number, i: any) => t + (Number(i.qtd_vendida) || 0), 0);
  const usouPadrao = !salvoFull ? " (configuração padrão; ajuste em Full > Configuração do Canal)" : "";
  return {
    ok: true,
    texto: `Full ${canal} ${mes}: ${f.resultados.length} SKUs e ${unidades} un. vendidas em ${f.filtro.mantidas} linhas "${ident.textoIdFull}"; ${foraSkus} SKUs fora do Full para as recomendações${g1.aviso ? ` — ${g1.aviso}` : ""}${avisoFora}${usouPadrao}.`,
    full: { skus: f.resultados.length, unidades, linhasFull: f.filtro.mantidas, descartadas: f.filtro.ignoradas },
    fora: { skus: foraSkus },
  };
}
