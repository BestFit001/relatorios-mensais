// Compras > Upload: leitura dos 4 relatórios que alimentam o controle de estoque/compras.
//   • Estoque Shop9 (Super Gerador, "Estoque de todas as filiais - Atual") ........ lojas físicas + cadastro/custo/preços
//   • Vendas Shop9 ("Vendas de todas as filiais", do mês) ......................... lojas físicas
//   • Saldos em estoque do Tiny (depósito GERAL = filial 8; FBA = filial 10) ...... e-commerce
//   • Relatório de vendas do Tiny (agrupado por e-commerce) ....................... filial 8 (e 10 se o canal for FBA)
// Tudo aqui é função pura (recebe as linhas da planilha, devolve dados prontos para gravar).
// A chave de cada item é sempre "grade-filial" (ex.: 10002003007-3), igual à da planilha atual.

export const FILIAL_ECOMMERCE = 8;
export const FILIAL_FBA = 10;

export interface ProdutoCat {
  grade: string; codigo: string; produto: string;
  cod_cor: string; cor: string; cod_tamanho: string; tamanho: string;
  genero: string; marca: string; ean: string; classe: string; familia: string; fornecedor: string;
  custo: number | null; pdv_loja: number | null; pdv_ec: number | null;
  origem: "shop9" | "tiny" | "vendas";
}
export interface LinhaEstoque { grade: string; filial: number; estoque: number; reservado: number }
export interface LinhaVenda { grade: string; filial: number; periodo: number; fonte: "shop9" | "tiny"; canal: string; qtd: number; valor: number }

export interface ResumoArquivo {
  linhas: number;                 // linhas de dados lidas
  unidades: number;               // estoque total ou quantidade vendida
  valor: number;                  // custo do estoque (R$) ou valor vendido (R$)
  detalhe: { rotulo: string; linhas: number; unidades: number; valor: number }[];   // por filial ou por canal
  avisos: string[];
}

// ---------- utilidades ----------
const norm = (s: unknown) =>
  String(s ?? "").replace(/Ã³/g, "o").replace(/Ã©/g, "e").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const texto = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : String(v)) : "";
  return String(v).replace(/\s+/g, " ").trim();
};

export function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  let s = String(v).replace(/R\$|\s/g, "").trim();
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const n0 = (v: unknown) => numero(v) ?? 0;
const arred = (n: number) => Math.round(n * 100) / 100;

/** Procura a linha de cabeçalho (nas 15 primeiras) que contenha todos os nomes obrigatórios e devolve o índice de cada coluna. */
function acharCabecalho(linhas: any[][], mapa: Record<string, string[]>, obrigatorias: string[]): { linha: number; col: Record<string, number> } | null {
  for (let i = 0; i < Math.min(15, linhas.length); i++) {
    const nomes = (linhas[i] || []).map(norm);
    const col: Record<string, number> = {};
    for (const [campo, apelidos] of Object.entries(mapa)) {
      col[campo] = nomes.findIndex((n) => apelidos.includes(n));
    }
    if (obrigatorias.every((c) => col[c] >= 0)) return { linha: i, col };
  }
  return null;
}
const faltou = (arquivo: string, obrig: string[]) =>
  new Error(`Não encontrei o cabeçalho do ${arquivo}. Colunas esperadas: ${obrig.join(", ")}.`);
const celula = (row: any[], i: number) => (i >= 0 ? row[i] : "");

// ---------- Estoque Shop9 ----------
export interface ResultadoEstoqueShop9 { produtos: ProdutoCat[]; estoque: LinhaEstoque[]; resumo: ResumoArquivo }

/**
 * Estoque de todas as filiais (Shop9). Devolve: o cadastro de TODAS as grades (marca, classe, custo, preços...)
 * e o estoque (só linhas com saldo diferente de zero) das filiais físicas. As filiais 8 e 10 vêm do Tiny e são ignoradas aqui.
 */
export function lerEstoqueShop9(linhas: any[][]): ResultadoEstoqueShop9 {
  const mapa = {
    grade: ["grade"], codigo: ["codigo"], produto: ["produto"], filial: ["filial"],
    codCor: ["codcor"], cor: ["cor"], codTam: ["codtamanho"], tamanho: ["tamanho"],
    genero: ["genero"], marca: ["marca"], ean: ["codigobarras"], classe: ["classe"], familia: ["familia"], fornecedor: ["fornecedor"],
    estoque: ["estoque"], custo: ["preco"], varejo: ["preco1"], varejoEc: ["preco2"],
  };
  const obrig = ["grade", "filial", "estoque"];
  const cab = acharCabecalho(linhas, mapa, obrig);
  if (!cab) throw faltou("estoque do Shop9", ["Grade", "Filial", "Estoque", "Preco (custo)", "Preco1 (varejo)"]);
  const c = cab.col;

  const produtos = new Map<string, ProdutoCat>();
  const estoque = new Map<string, LinhaEstoque>();
  const porFilial = new Map<number, { linhas: number; unidades: number; valor: number }>();
  const avisos: string[] = [];
  let lidas = 0, ignoradas = 0, semGrade = 0, negativos = 0, semCusto = 0;
  let unidades = 0, valor = 0;

  for (let i = cab.linha + 1; i < linhas.length; i++) {
    const r = linhas[i];
    if (!r) continue;
    const grade = texto(r[c.grade]);
    if (!grade) { if (r.some((x: any) => texto(x) !== "")) semGrade++; continue; }
    const filial = Math.trunc(n0(r[c.filial]));
    lidas++;
    const custo = numero(celula(r, c.custo));
    if (!produtos.has(grade)) {
      produtos.set(grade, {
        grade, codigo: texto(celula(r, c.codigo)), produto: texto(celula(r, c.produto)),
        cod_cor: texto(celula(r, c.codCor)), cor: texto(celula(r, c.cor)),
        cod_tamanho: texto(celula(r, c.codTam)), tamanho: texto(celula(r, c.tamanho)),
        genero: texto(celula(r, c.genero)), marca: texto(celula(r, c.marca)), ean: texto(celula(r, c.ean)),
        classe: texto(celula(r, c.classe)), familia: texto(celula(r, c.familia)), fornecedor: texto(celula(r, c.fornecedor)),
        custo, pdv_loja: numero(celula(r, c.varejo)), pdv_ec: numero(celula(r, c.varejoEc)), origem: "shop9",
      });
    }
    if (filial === FILIAL_ECOMMERCE || filial === FILIAL_FBA) { ignoradas++; continue; }
    const saldo = n0(celula(r, c.estoque));
    if (saldo === 0) continue;
    if (saldo < 0) negativos++;
    if (!custo) semCusto++;
    const chave = `${grade}|${filial}`;
    const ex = estoque.get(chave);
    if (ex) ex.estoque += saldo; else estoque.set(chave, { grade, filial, estoque: saldo, reservado: 0 });
    unidades += saldo; valor += saldo * (custo ?? 0);
    const pf = porFilial.get(filial) || { linhas: 0, unidades: 0, valor: 0 };
    pf.linhas++; pf.unidades += saldo; pf.valor += saldo * (custo ?? 0);
    porFilial.set(filial, pf);
  }

  if (lidas === 0) avisos.push("Nenhuma linha de dados foi lida (conferir se o arquivo é o “Estoque de todas as filiais - Atual”).");
  if (ignoradas) avisos.push(`${ignoradas} linha(s) das filiais 8/10 foram ignoradas (o e-commerce vem dos arquivos do Tiny).`);
  if (negativos) avisos.push(`${negativos} linha(s) com estoque negativo (mantidas).`);
  if (semCusto) avisos.push(`${semCusto} linha(s) com saldo e custo zerado/vazio.`);
  if (semGrade) avisos.push(`${semGrade} linha(s) sem grade foram descartadas.`);

  return {
    produtos: Array.from(produtos.values()),
    estoque: Array.from(estoque.values()),
    resumo: {
      linhas: lidas, unidades, valor: arred(valor),
      detalhe: Array.from(porFilial.entries()).sort((a, b) => a[0] - b[0]).map(([f, v]) => ({ rotulo: `Filial ${f}`, linhas: v.linhas, unidades: v.unidades, valor: arred(v.valor) })),
      avisos,
    },
  };
}

// ---------- Vendas Shop9 ----------
export interface ResultadoVendas { vendas: LinhaVenda[]; produtosNovos: ProdutoCat[]; resumo: ResumoArquivo }

const produtoMinimo = (grade: string, origem: ProdutoCat["origem"], extra: Partial<ProdutoCat> = {}): ProdutoCat => ({
  grade, codigo: "", produto: "", cod_cor: "", cor: "", cod_tamanho: "", tamanho: "", genero: "", marca: "", ean: "", classe: "", familia: "", fornecedor: "",
  custo: null, pdv_loja: null, pdv_ec: null, origem, ...extra,
});

/** Vendas de todas as filiais (Shop9) de UM mês. `periodo` = AAAAMM. */
export function lerVendasShop9(linhas: any[][], periodo: number, opcoes: { manter8e10?: boolean } = {}): ResultadoVendas {
  const mapa = {
    filial: ["filial"], codigo: ["codigoproduto"], grade: ["codigodagrade", "codigograde", "grade"],
    codCor: ["codigocor"], cor: ["nomecor"], codTam: ["codigotamanho"], tamanho: ["nometamanho"], produto: ["nomeproduto"],
    qtd: ["qtdevendida", "quantidadevendida"], total: ["precototal", "valortotal"],
  };
  const cab = acharCabecalho(linhas, mapa, ["filial", "grade", "qtd", "total"]);
  if (!cab) throw faltou("relatório de vendas do Shop9", ["Filial", "Codigo_da_Grade", "Qtde_Vendida", "Preco_Total"]);
  const c = cab.col;

  const acum = new Map<string, LinhaVenda>();
  const novos = new Map<string, ProdutoCat>();
  const porFilial = new Map<number, { linhas: number; unidades: number; valor: number }>();
  let lidas = 0, ignoradas = 0, semGrade = 0, negativas = 0, unidades = 0, valor = 0;

  for (let i = cab.linha + 1; i < linhas.length; i++) {
    const r = linhas[i];
    if (!r) continue;
    const grade = texto(r[c.grade]);
    if (!grade) { if (r.some((x: any) => texto(x) !== "")) semGrade++; continue; }
    const filial = Math.trunc(n0(r[c.filial]));
    const qtd = n0(r[c.qtd]), total = n0(r[c.total]);
    if (qtd === 0 && total === 0) continue;
    lidas++;
    if (!opcoes.manter8e10 && (filial === FILIAL_ECOMMERCE || filial === FILIAL_FBA)) { ignoradas++; continue; }
    if (qtd < 0) negativas++;
    const chave = `${grade}|${filial}`;
    const ex = acum.get(chave);
    if (ex) { ex.qtd += qtd; ex.valor += total; } else acum.set(chave, { grade, filial, periodo, fonte: "shop9", canal: "", qtd, valor: total });
    unidades += qtd; valor += total;
    const pf = porFilial.get(filial) || { linhas: 0, unidades: 0, valor: 0 };
    pf.linhas++; pf.unidades += qtd; pf.valor += total;
    porFilial.set(filial, pf);
    if (!novos.has(grade)) novos.set(grade, produtoMinimo(grade, "vendas", {
      codigo: texto(celula(r, c.codigo)), produto: texto(celula(r, c.produto)),
      cod_cor: texto(celula(r, c.codCor)), cor: texto(celula(r, c.cor)), cod_tamanho: texto(celula(r, c.codTam)), tamanho: texto(celula(r, c.tamanho)),
    }));
  }

  const avisos: string[] = [];
  if (lidas === 0) avisos.push("Nenhuma linha de venda foi lida (conferir se o arquivo é o “Vendas de todas as filiais”).");
  if (ignoradas) avisos.push(`${ignoradas} linha(s) das filiais 8/10 foram ignoradas (e-commerce vem do Tiny).`);
  if (negativas) avisos.push(`${negativas} linha(s) com quantidade negativa (devoluções) mantidas.`);
  if (semGrade) avisos.push(`${semGrade} linha(s) sem grade foram descartadas.`);
  return {
    vendas: Array.from(acum.values()).map((v) => ({ ...v, valor: arred(v.valor) })),
    produtosNovos: Array.from(novos.values()),
    resumo: {
      linhas: lidas - ignoradas, unidades, valor: arred(valor),
      detalhe: Array.from(porFilial.entries()).sort((a, b) => a[0] - b[0]).map(([f, v]) => ({ rotulo: `Filial ${f}`, linhas: v.linhas, unidades: v.unidades, valor: arred(v.valor) })),
      avisos,
    },
  };
}

// ---------- Saldos Tiny ----------
export interface ResultadoSaldosTiny { estoque: LinhaEstoque[]; produtosNovos: ProdutoCat[]; resumo: ResumoArquivo }

/** Saldos em estoque do Tiny de um depósito: todas as linhas viram a `filial` indicada (8 = GERAL/e-commerce, 10 = FBA). */
export function lerSaldosTiny(linhas: any[][], filial: number): ResultadoSaldosTiny {
  const mapa = { sku: ["codigosku", "sku", "codigo"], produto: ["produto"], fisico: ["estoquefisico", "fisico", "saldo"], reservado: ["estoquereservado", "reservado"] };
  const cab = acharCabecalho(linhas, mapa, ["sku", "fisico"]);
  if (!cab) throw faltou("saldos em estoque do Tiny", ["Código (SKU)", "Produto", "Estoque físico"]);
  const c = cab.col;

  const est = new Map<string, LinhaEstoque>();
  const novos = new Map<string, ProdutoCat>();
  let lidas = 0, negativos = 0, unidades = 0;
  for (let i = cab.linha + 1; i < linhas.length; i++) {
    const r = linhas[i];
    if (!r) continue;
    const grade = texto(r[c.sku]);
    if (!grade) continue;
    lidas++;
    const fisico = n0(r[c.fisico]), reservado = n0(celula(r, c.reservado));
    if (!novos.has(grade)) novos.set(grade, produtoMinimo(grade, "tiny", { produto: texto(celula(r, c.produto)) }));
    if (fisico === 0) continue;
    if (fisico < 0) negativos++;
    const ex = est.get(grade);
    if (ex) { ex.estoque += fisico; ex.reservado += reservado; } else est.set(grade, { grade, filial, estoque: fisico, reservado });
    unidades += fisico;
  }
  const avisos: string[] = [];
  if (lidas === 0) avisos.push("Nenhuma linha de saldo foi lida (conferir se é o relatório “Saldo em estoque” do Tiny).");
  if (negativos) avisos.push(`${negativos} SKU(s) com saldo negativo (mantidos).`);
  return {
    estoque: Array.from(est.values()),
    produtosNovos: Array.from(novos.values()),
    resumo: { linhas: lidas, unidades, valor: 0, detalhe: [{ rotulo: `Filial ${filial}`, linhas: est.size, unidades, valor: 0 }], avisos },
  };
}

// ---------- Vendas Tiny ----------
export interface OpcoesVendasTiny { usarTotal: boolean; padraoFba?: RegExp }

/**
 * Relatório de vendas do Tiny agrupado por e-commerce. Cada grupo (Amazon, Shopee, ML...) vira linhas com o canal;
 * canal que casa com FBA → filial 10, todos os demais → filial 8. `usarTotal`: coluna "Total" (valor + frete) ou só "Valor".
 */
export function lerVendasTiny(linhas: any[][], periodo: number, opcoes: OpcoesVendasTiny): ResultadoVendas {
  const mapa = { canal: ["ecommerce"], produto: ["produto"], sku: ["codigosku", "sku"], qtd: ["quantidade"], valor: ["valor"], frete: ["frete"], total: ["total"] };
  const cab = acharCabecalho(linhas, mapa, ["canal", "sku", "qtd", "valor"]);
  if (!cab) throw faltou("relatório de vendas do Tiny", ["E-commerce", "Produto", "Código (SKU)", "Quantidade", "Valor", "Frete", "Total"]);
  const c = cab.col;
  const fba = opcoes.padraoFba ?? /fba/i;
  const usarTotal = opcoes.usarTotal && c.total >= 0;

  const acum = new Map<string, LinhaVenda>();
  const novos = new Map<string, ProdutoCat>();
  const porCanal = new Map<string, { filial: number; linhas: number; unidades: number; valor: number }>();
  let canal = "", lidas = 0, unidades = 0, valor = 0, negativas = 0;

  for (let i = cab.linha + 1; i < linhas.length; i++) {
    const r = linhas[i];
    if (!r) continue;
    const nome = texto(r[c.canal]);
    if (nome) canal = nome;
    const grade = texto(r[c.sku]);
    if (!grade) continue;
    const qtd = n0(r[c.qtd]);
    const v = usarTotal ? n0(r[c.total]) : n0(r[c.valor]);
    if (qtd === 0 && v === 0) continue;
    lidas++;
    const filial = fba.test(canal) ? FILIAL_FBA : FILIAL_ECOMMERCE;
    if (qtd < 0) negativas++;
    const chave = `${grade}|${filial}|${canal}`;
    const ex = acum.get(chave);
    if (ex) { ex.qtd += qtd; ex.valor += v; } else acum.set(chave, { grade, filial, periodo, fonte: "tiny", canal, qtd, valor: v });
    unidades += qtd; valor += v;
    const pc = porCanal.get(canal) || { filial, linhas: 0, unidades: 0, valor: 0 };
    pc.linhas++; pc.unidades += qtd; pc.valor += v;
    porCanal.set(canal, pc);
    if (!novos.has(grade)) novos.set(grade, produtoMinimo(grade, "tiny", { produto: texto(celula(r, c.produto)) }));
  }

  const avisos: string[] = [];
  if (lidas === 0) avisos.push("Nenhuma venda foi lida (conferir se é o relatório de vendas do Tiny agrupado por e-commerce).");
  if (negativas) avisos.push(`${negativas} linha(s) com quantidade negativa mantidas.`);
  if (!Array.from(porCanal.values()).some((p) => p.filial === FILIAL_FBA)) avisos.push("Nenhum canal com “FBA” no nome: tudo foi para a filial 8 (nenhuma venda para a filial 10).");
  return {
    vendas: Array.from(acum.values()).map((x) => ({ ...x, valor: arred(x.valor) })),
    produtosNovos: Array.from(novos.values()),
    resumo: {
      linhas: lidas, unidades, valor: arred(valor),
      detalhe: Array.from(porCanal.entries()).sort((a, b) => b[1].valor - a[1].valor).map(([k, v]) => ({ rotulo: `${k} → filial ${v.filial}`, linhas: v.linhas, unidades: v.unidades, valor: arred(v.valor) })),
      avisos,
    },
  };
}

// ---------- período ----------
export const periodoDe = (ano: number, mes: number) => ano * 100 + mes;
export const anoDoPeriodo = (p: number) => Math.floor(p / 100);
export const mesDoPeriodo = (p: number) => p % 100;
const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
export const rotuloPeriodo = (p: number) => `${MESES[mesDoPeriodo(p) - 1] ?? "?"}/${String(anoDoPeriodo(p)).slice(2)}`;
/** Os `n` últimos períodos terminando em `fim` (AAAAMM), do mais antigo ao mais recente. */
export function ultimosPeriodos(fim: number, n: number): number[] {
  const r: number[] = [];
  let a = anoDoPeriodo(fim), m = mesDoPeriodo(fim);
  for (let i = 0; i < n; i++) { r.unshift(periodoDe(a, m)); m--; if (m === 0) { m = 12; a--; } }
  return r;
}
