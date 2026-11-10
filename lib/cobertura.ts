// Curva ABC > Cobertura de Estoque: mesma lógica da planilha "Relatório Curva ABC" (aba "Curva ABC GERAL").
//   Média Diária = Vendas ÷ dias do período
//   Cobertura (dias) = Estoque ÷ Média Diária        Cobertura (meses) = dias ÷ 30
//   STATUS: Roupão precisa de 2,5 meses de cobertura; os demais, 2 meses. Abaixo disso: curva A => "Sugestão de Compra",
//           senão => "Validar pois não é curva A".
// Este arquivo não acessa rede nem tela: só cálculo, leitura da planilha de estoque e as listas fixas.

export const META_MESES = 2;
export const META_MESES_ROUPAO = 2.5;
export const DIAS_POR_MES = 30;

export const STATUS_SUGESTAO = "Sugestão de Compra";
export const STATUS_VALIDAR = "Validar pois não é curva A";
export const STATUS_OK = "Cobertura Igual ou Maior 2 Meses";
export const STATUS_OK_ROUPAO = "Cobertura suficiente (Roupão)";
export const TODOS_STATUS = [STATUS_SUGESTAO, STATUS_VALIDAR, STATUS_OK, STATUS_OK_ROUPAO];

/** Retorno de compras: lista fixa (o "+" da tela deixa escrever outro texto). */
export const OPCOES_RETORNO = [
  "Não será reposto.",
  "Compra efetuada.",
  "Reposição em rota de entrega.",
  "Reposição realizada.",
];

/** Colunas da tabela, na ordem da planilha. `ocultavel` = pode ser escolhida em Configurações. */
export const COLUNAS_COBERTURA: { id: string; nome: string }[] = [
  { id: "codigo", nome: "Código" },
  { id: "produto", nome: "Produto" },
  { id: "vendas", nome: "Vendas (unidades)" },
  { id: "valor", nome: "Valor" },
  { id: "pct_individual", nome: "% Individual" },
  { id: "pct_acumulado", nome: "% Acumulado" },
  { id: "classificacao", nome: "Classificação" },
  { id: "margem", nome: "Margem média vendida" },
  { id: "media_diaria", nome: "Média Diária Vendas" },
  { id: "estoque", nome: "Estoque Atual Total - GERAL" },
  { id: "cobertura_dias", nome: "Cobertura (dias)" },
  { id: "cobertura_meses", nome: "Cobertura (meses)" },
  { id: "status", nome: "Status" },
  { id: "retorno", nome: "Retorno Compras" },
  { id: "marca", nome: "Marca" },
];

const semAcento = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Mesma normalização usada em todo o app para casar SKUs (a base do Tiny guarda assim). */
export function normalizarSkuEstoque(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** "Roupão" em qualquer grafia (maiúsculas, acento): a regra especial vale para todos os roupões. */
export function ehRoupao(titulo: string): boolean {
  return semAcento(titulo).includes("roupao");
}

export interface EntradaCobertura { vendas: number; dias: number; estoque: number; curva: string; titulo: string }
export interface SaidaCobertura {
  mediaDiaria: number;
  /** Infinity quando não há venda no período */
  coberturaDias: number;
  coberturaMeses: number;
  status: string;
}

export function calcularCobertura(e: EntradaCobertura): SaidaCobertura {
  const dias = e.dias >= 1 ? e.dias : 1;
  const mediaDiaria = (Number(e.vendas) || 0) / dias;
  const estoque = Math.max(0, Number(e.estoque) || 0);   // saldo negativo no Tiny não vira cobertura negativa
  const coberturaDias = mediaDiaria > 0 ? estoque / mediaDiaria : Infinity;
  const coberturaMeses = coberturaDias / DIAS_POR_MES;
  const roupao = ehRoupao(e.titulo);
  const meta = roupao ? META_MESES_ROUPAO : META_MESES;
  const status = coberturaMeses >= meta
    ? (roupao ? STATUS_OK_ROUPAO : STATUS_OK)
    : (e.curva === "A" ? STATUS_SUGESTAO : STATUS_VALIDAR);
  return { mediaDiaria, coberturaDias, coberturaMeses, status };
}

/**
 * Margem média efetivamente vendida de um SKU no período: lucro real ÷ faturamento (média ponderada, não média de percentuais).
 * Lucro real = repasse − custo (CMV) − extras − devoluções. Sem custo cadastrado a margem ficaria inflada: devolve null.
 */
export function margemPercentual(lucro: number, receita: number, semCusto: boolean): number | null {
  if (semCusto || !(receita > 0)) return null;
  return (lucro / receita) * 100;
}

/** Semáforo de "Cobertura (dias)" da planilha: <30 vermelho, 30–59 amarelo, ≥60 verde. */
export const corCoberturaDias = (d: number) => (d >= 60 ? "verde" : d >= 30 ? "amarelo" : "vermelho");
/** Semáforo de "Cobertura (meses)": <1 vermelho, 1–1,99 amarelo, ≥2 verde. */
export const corCoberturaMeses = (m: number) => (m >= 2 ? "verde" : m >= 1 ? "amarelo" : "vermelho");

// ---------------------------------------------------------------------------------------------------------------
// Planilha de estoque do Tiny: o USUÁRIO escolhe a coluna do SKU e a da quantidade (nada é adivinhado).
// ---------------------------------------------------------------------------------------------------------------

/** 0 -> A, 25 -> Z, 26 -> AA ... */
export function letraDaColuna(i: number): string {
  let n = i + 1, s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** A -> 0, Z -> 25, AA -> 26. Devolve -1 se não for uma letra de coluna válida. */
export function indiceDaLetra(letra: string): number {
  const t = String(letra ?? "").trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(t)) return -1;
  let n = 0;
  for (const ch of t) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Número em formato brasileiro ou americano; null = não é número. */
export function paraNumero(v: any): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").trim();
  if (!s) return null;
  if (!/^[-+]?[\d.,\s]+$/.test(s)) return null;
  s = s.replace(/\s/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface RegistroEstoque { sku: string; estoque: number }
export interface ResultadoLeitura {
  registros: RegistroEstoque[];
  /** linhas lidas (já sem cabeçalho/linhas sem SKU) */
  linhasLidas: number;
  /** SKUs que apareciam em mais de uma linha: as quantidades foram somadas */
  repetidos: string[];
  /** linhas ignoradas por não terem SKU */
  semSku: number;
  /** linhas ignoradas porque a "quantidade" era um texto (ex.: o cabeçalho) */
  semQuantidade: number;
}

/**
 * Lê as linhas da planilha usando SOMENTE as colunas indicadas (índices a partir de 0).
 * - SKU é normalizado como no resto do app.
 * - Quantidade vazia vira 0; quantidade em texto (cabeçalho) faz a linha ser ignorada.
 * - SKU repetido (ex.: o mesmo produto em duas localizações): as quantidades são somadas.
 */
export function lerEstoque(linhas: any[][], idxSku: number, idxQtd: number): ResultadoLeitura {
  const mapa = new Map<string, number>();
  const repetidos = new Set<string>();
  let semSku = 0, semQuantidade = 0, lidas = 0;
  for (const row of linhas) {
    if (!row || row.length === 0) continue;
    const sku = normalizarSkuEstoque(row[idxSku]);
    const bruto = row[idxQtd];
    if (!sku) { if (String(bruto ?? "").trim() !== "") semSku++; continue; }
    const vazio = bruto === null || bruto === undefined || String(bruto).trim() === "";
    const qtd = vazio ? 0 : paraNumero(bruto);
    if (qtd === null) { semQuantidade++; continue; }
    lidas++;
    if (mapa.has(sku)) { repetidos.add(sku); mapa.set(sku, (mapa.get(sku) || 0) + qtd); }
    else mapa.set(sku, qtd);
  }
  return {
    registros: Array.from(mapa, ([sku, estoque]) => ({ sku, estoque })),
    linhasLidas: lidas, repetidos: Array.from(repetidos), semSku, semQuantidade,
  };
}

/** Rótulos "A — Código (SKU)" para os seletores de coluna, a partir da primeira linha da planilha. */
export function rotulosDasColunas(linhas: any[][]): { indice: number; letra: string; rotulo: string }[] {
  const largura = linhas.slice(0, 50).reduce((m, r) => Math.max(m, r?.length || 0), 0);
  const cab = linhas[0] || [];
  return Array.from({ length: largura }, (_, i) => {
    const t = String(cab[i] ?? "").trim();
    return { indice: i, letra: letraDaColuna(i), rotulo: t ? `${letraDaColuna(i)} — ${t.slice(0, 40)}` : `${letraDaColuna(i)}` };
  });
}

/**
 * Quantos dias vale o período para a média diária. Períodos que terminam no futuro (mês em andamento) contam só até hoje.
 * `intervalo` = [início, fim] em ms; null = sem período (usa do primeiro ao último dia com venda).
 */
export function diasDoPeriodo(intervalo: [number, number] | null, agora: number, primeiraVenda?: number, ultimaVenda?: number): number {
  const DIA = 24 * 60 * 60 * 1000;
  if (intervalo) {
    const fim = Math.min(intervalo[1], agora);
    return Math.max(1, Math.ceil((fim - intervalo[0]) / DIA - 0.001));
  }
  if (primeiraVenda !== undefined && ultimaVenda !== undefined && ultimaVenda >= primeiraVenda) {
    return Math.floor((ultimaVenda - primeiraVenda) / DIA) + 1;
  }
  return 1;
}
