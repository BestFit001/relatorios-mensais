// Identificação da ESTAMPA no título de um produto (Novos Cadastros), sem IA e sem rede.
//
// Um título da Best Fit/Farm segue o desenho:  [Tipo] [Marca] [Linha] [ESTAMPA] [Formato] [Estampa/Original] [Capacidade]
//   "Bolsa Farm Fervo Bahia Floral Shoulder Bag Estampa Original"
//     tipo = Bolsa · marca = Farm · linha = Fervo · ESTAMPA = Bahia Floral · formato = Shoulder Bag · marcadores = Estampa Original
// Ao cadastrar um produto novo a partir de um modelo (exemplo da Padronização), só a ESTAMPA muda; tipo, marca, linha,
// formato, marcadores e capacidade do modelo ficam exatamente como estão.

const nrm = (v: any) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const chaveDe = (v: string) => nrm(v).replace(/[^a-z0-9]/g, "");

export type Papel = "tipo" | "marca" | "linha" | "estampa" | "marcador" | "capacidade" | "tamanho" | "formato" | "conector";
export interface Tok { texto: string; chave: string; papel: Papel; /** marcador que fala de estampa ("Estampada"), diferente de "Original" */ deEstampa?: boolean }

// ---------- vocabulário (quanto mais completo, mais certeiro; palavras fora daqui são tratadas como estampa) ----------
/** o que o produto É */
const TIPOS = new Set([
  "bolsa", "bolsinha", "sacola", "sacolinha", "mochila", "mochilinha", "necessaire", "estojo", "cooler", "pochete", "lancheira", "mini", "maxi",
  "termico", "termica", "kit", "conjunto", "carteira", "mala", "frasqueira", "squeeze", "garrafa", "copo", "porta", "necessaires",
]);
/** formato/modelagem da peça: faz parte do modelo, não da estampa */
const FORMATOS = new Set(["transversal", "shoulder", "bag", "tiracolo", "universitaria", "universitario", "tote", "baguete", "shopper", "bucket", "clutch", "cintura", "pequena", "pequeno", "media", "medio", "grande", "infantil", "feminina", "masculina"]);
/** palavras que acompanham o título sem ser a estampa em si */
const MARCADORES_ESTAMPA = new Set(["estampa", "estampas", "estampada", "estampadas", "estampado", "estampados", "decorada", "decorado", "decoradas", "decorados"]);
const MARCADORES_OUTROS = new Set(["original", "oficial", "exclusivo", "exclusiva", "novo", "nova"]);
const CONECTORES = new Set(["de", "do", "da", "dos", "das", "e", "em", "com", "para", "por", "a", "o"]);
const TAMANHOS = new Set(["p", "m", "g", "pp", "gg", "xg"]);
const CORES = new Set([
  "azul", "branco", "branca", "preto", "preta", "vermelho", "vermelha", "verde", "amarelo", "amarela", "rosa", "roxo", "roxa", "lilas", "laranja", "cinza",
  "marrom", "bege", "off", "white", "marinho", "dourado", "dourada", "prata", "nude", "coral", "colorido", "colorida", "caramelo", "estampado",
]);
/** linhas (nomes de modelo) da Farm/Best Fit já conhecidas; linhas novas são descobertas por descobrirLinhas() */
const LINHAS_BASE = ["me leva", "ora bolas", "que sede ri", "fervo", "chuchu", "chamego", "ziriguidum", "viva", "carioca", "farofa", "astral", "xodo", "pipoquinha", "glub"];

const SINONIMOS: Record<string, string> = { bolsinha: "bolsa", sacolinha: "sacola", mochilinha: "mochila", termica: "termico", necessaires: "necessaire" };

interface Linha { chaves: string[]; }
const linhasDe = (extras: string[] = []): Linha[] =>
  [...LINHAS_BASE, ...extras]
    .map((l) => ({ chaves: nrm(l).split(/[^a-z0-9]+/).filter(Boolean) }))
    .filter((l) => l.chaves.length)
    .sort((a, b) => b.chaves.length - a.chaves.length);

const ehNumero = (s: string) => /^\d+([.,]\d+)?$/.test(s);
const UNIDADES = /^(litros?|l|ml|g|kg|cm|mm)$/;

export interface TituloAnalisado {
  toks: Tok[];
  /** palavras da estampa (todas as faixas, na ordem) */
  estampa: string;
  linha: string;
  capacidade: string;
  tamanho: string;
  tipo: string[];
}

/** Separa o título em papéis (tipo, marca, linha, estampa…). `linhasExtras` são linhas descobertas no lote (ver descobrirLinhas). */
export function analisarTitulo(titulo: string, marca = "", linhasExtras: string[] = []): TituloAnalisado {
  const marcas = new Set(nrm(marca).split(/[^a-z0-9]+/).filter(Boolean));
  const crus = String(titulo ?? "").replace(/\s+/g, " ").trim().split(" ").filter((w) => w && !/^[-–—|]+$/.test(w));
  const toks: Tok[] = [];
  const linhas = linhasDe(linhasExtras);

  // 1) capacidade ("3 Litros", "350ml") vira uma palavra só
  const pre: { texto: string; chave: string; capacidade?: boolean }[] = [];
  for (let i = 0; i < crus.length; i++) {
    const w = crus[i], k = chaveDe(w);
    if (!k) continue;
    const prox = crus[i + 1] ? chaveDe(crus[i + 1]) : "";
    if (ehNumero(w) && UNIDADES.test(prox)) { pre.push({ texto: `${w} ${crus[i + 1]}`, chave: `${k}${/^litros?$/.test(prox) ? "l" : prox}`, capacidade: true }); i++; continue; }
    const m = k.match(/^(\d+)(litros?|l|ml|g|kg|cm|mm)$/);
    if (m) { pre.push({ texto: w, chave: `${m[1]}${/^litros?$/.test(m[2]) ? "l" : m[2]}`, capacidade: true }); continue; }
    pre.push({ texto: w, chave: k });
  }

  // 2) papéis palavra a palavra (linhas de várias palavras primeiro)
  for (let i = 0; i < pre.length; i++) {
    const p = pre[i];
    if (p.capacidade) { toks.push({ texto: p.texto, chave: p.chave, papel: "capacidade" }); continue; }
    const ln = linhas.find((l) => l.chaves.every((c, j) => pre[i + j] && !pre[i + j].capacidade && pre[i + j].chave === c));
    if (ln) {
      const n = ln.chaves.length;
      toks.push({ texto: pre.slice(i, i + n).map((x) => x.texto).join(" "), chave: ln.chaves.join(""), papel: "linha" });
      i += n - 1;
      continue;
    }
    const k = p.chave;
    if (marcas.has(k)) toks.push({ texto: p.texto, chave: k, papel: "marca" });
    else if (MARCADORES_ESTAMPA.has(k)) toks.push({ texto: p.texto, chave: k, papel: "marcador", deEstampa: true });
    else if (MARCADORES_OUTROS.has(k)) toks.push({ texto: p.texto, chave: k, papel: "marcador" });
    else if (TIPOS.has(k)) toks.push({ texto: p.texto, chave: k, papel: "tipo" });
    else if (FORMATOS.has(k)) toks.push({ texto: p.texto, chave: k, papel: "formato" });
    else if (TAMANHOS.has(k)) toks.push({ texto: p.texto, chave: k, papel: "tamanho" });
    else if (CONECTORES.has(k)) toks.push({ texto: p.texto, chave: k, papel: "conector" });
    else toks.push({ texto: p.texto, chave: k, papel: "estampa" });
  }

  // 3) conector entre duas palavras de estampa ("Selva DE Arara", "Azul E Branca") é da estampa
  for (let i = 1; i < toks.length - 1; i++) {
    if (toks[i].papel === "conector" && toks[i - 1].papel === "estampa" && toks[i + 1].papel === "estampa") toks[i].papel = "estampa";
  }

  const txt = (papel: Papel) => toks.filter((t) => t.papel === papel).map((t) => t.texto).join(" ");
  return {
    toks, estampa: txt("estampa"), linha: txt("linha"), capacidade: txt("capacidade"), tamanho: txt("tamanho"),
    tipo: toks.filter((t) => t.papel === "tipo").map((t) => t.chave),
  };
}

/** Linhas novas do lote: palavra que abre o nome (depois do tipo) em 2 ou mais produtos que não têm linha conhecida (ex.: "Xodo" em 5 mochilas). */
export function descobrirLinhas(nomes: string[], marca = ""): string[] {
  const cont = new Map<string, { texto: string; n: number }>();
  for (const nome of nomes) {
    const a = analisarTitulo(nome, marca);
    if (a.linha) continue;
    const primeira = a.toks.find((t) => t.papel === "estampa");
    if (!primeira || primeira.chave.length < 3 || CORES.has(primeira.chave)) continue;
    const c = cont.get(primeira.chave) || { texto: primeira.texto, n: 0 };
    c.n++; cont.set(primeira.chave, c);
  }
  return Array.from(cont.values()).filter((c) => c.n >= 2).map((c) => c.texto);
}

// ---------- parentesco de TIPO entre dois produtos ----------
/** Conjunto de palavras de tipo (com sinônimos: Sacolinha = Sacola, Bolsinha = Bolsa). */
export function conjuntoTipo(a: TituloAnalisado): Set<string> {
  return new Set(a.tipo.map((t) => SINONIMOS[t] || t));
}
/** 0..1: quanto o tipo do produto é o mesmo do modelo ("Mini Cooler" x "Mini Cooler Térmico" = 0,67; "Bolsa" x "Mochila" = 0). */
export function parecidoDeTipo(a: TituloAnalisado, b: TituloAnalisado): number {
  const x = conjuntoTipo(a), y = conjuntoTipo(b);
  if (!x.size || !y.size) return 0;
  let inter = 0; x.forEach((t) => { if (y.has(t)) inter++; });
  return inter / (x.size + y.size - inter);
}

export interface TrocaEstampa { de: string; para: string }
export interface AdaptacaoTitulo {
  titulo: string;
  estampaAntiga: string;
  estampaNova: string;
  linhaAntiga: string;
  linhaNova: string;
  /** trocas para os textos do modelo (estampa, linha e capacidade) */
  trocas: TrocaEstampa[];
  capacidadeDiferente: boolean;
  /** palavras do modelo que saíram / do produto novo que entraram */
  sai: string[];
  entra: string[];
}

const soCor = (texto: string) => {
  const ws = texto.split(" ").map(chaveDe).filter((w) => w && !CONECTORES.has(w));
  return ws.length > 0 && ws.every((w) => CORES.has(w));
};

/**
 * Título do produto novo a partir do título do modelo: só a ESTAMPA (e a linha/capacidade/tamanho, quando o produto novo traz outra) muda.
 * Devolve null se não deu para identificar a estampa nos dois títulos (quem chama usa então a comparação palavra a palavra).
 */
export function adaptarTituloPelaEstampa(nomeNovo: string, tituloModelo: string, marca: string, linhasExtras: string[] = []): AdaptacaoTitulo | null {
  const m = analisarTitulo(tituloModelo, marca, linhasExtras);
  const n = analisarTitulo(nomeNovo, marca, linhasExtras);
  if (!n.estampa) return null;                                    // nada que identifique a estampa nova
  if (!m.toks.length) return null;

  const estNova = n.toks.filter((t) => t.papel === "estampa").map((t) => t.texto).join(" ");
  const semEstampaReal = soCor(estNova);                          // "Mochila Xodo Azul": é cor, não desenho
  const trocaLinha = !!m.linha && !!n.linha && chaveDe(m.linha) !== chaveDe(n.linha);
  const capNovaDif = !!m.capacidade && !!n.capacidade && chaveDe(m.capacidade) !== chaveDe(n.capacidade);
  const tamNovo = !!m.tamanho && !!n.tamanho && chaveDe(m.tamanho) !== chaveDe(n.tamanho);

  const saida: Tok[] = [];
  let estampaPosta = false, linhaPosta = false;
  const poeEstampa = () => { if (!estampaPosta) { estampaPosta = true; if (estNova) saida.push({ texto: estNova, chave: chaveDe(estNova), papel: "estampa" }); } };
  const modeloTemEstampa = m.toks.some((t) => t.papel === "estampa");

  // produto novo com tamanho (P/G) e modelo sem: o tamanho entra logo antes da estampa
  const tamanhoAntes = !m.tamanho && n.tamanho ? n.tamanho : "";

  for (const t of m.toks) {
    if (t.papel === "estampa") {
      if (!estampaPosta && tamanhoAntes) saida.push({ texto: tamanhoAntes, chave: chaveDe(tamanhoAntes), papel: "tamanho" });
      poeEstampa();
      continue;                                                    // as demais faixas de estampa (ex.: "Azul e Branca") saem junto
    }
    if (t.papel === "linha") {
      if (trocaLinha) { if (!linhaPosta) { linhaPosta = true; saida.push({ texto: n.linha, chave: chaveDe(n.linha), papel: "linha" }); } }
      else saida.push(t);
      if (!modeloTemEstampa && !estampaPosta) { if (tamanhoAntes) saida.push({ texto: tamanhoAntes, chave: chaveDe(tamanhoAntes), papel: "tamanho" }); poeEstampa(); }
      continue;
    }
    if (t.papel === "capacidade" && capNovaDif) { saida.push({ texto: n.capacidade, chave: chaveDe(n.capacidade), papel: "capacidade" }); continue; }
    if (t.papel === "tamanho" && tamNovo) { saida.push({ texto: n.tamanho, chave: chaveDe(n.tamanho), papel: "tamanho" }); continue; }
    // "Estampada/Decorada" some se o produto novo é liso (só cor); "Original" e o resto ficam
    if (t.papel === "marcador" && t.deEstampa && semEstampaReal) continue;
    saida.push(t);
    // modelo sem estampa nenhuma: ela entra depois da linha (ou da marca/tipo)
    if (!modeloTemEstampa && !estampaPosta) {
      const proximo = m.toks[m.toks.indexOf(t) + 1];
      const ultimoDoInicio = (t.papel === "marca" || t.papel === "tipo") && !m.toks.some((x) => x.papel === "linha") && (!proximo || (proximo.papel !== "marca" && proximo.papel !== "tipo"));
      if (ultimoDoInicio) { if (tamanhoAntes) saida.push({ texto: tamanhoAntes, chave: chaveDe(tamanhoAntes), papel: "tamanho" }); poeEstampa(); }
    }
  }
  poeEstampa();
  // capacidade só do produto novo (modelo sem): vai no fim
  if (!m.capacidade && n.capacidade) saida.push({ texto: n.capacidade, chave: chaveDe(n.capacidade), papel: "capacidade" });

  const titulo = juntarComLimite(saida);

  const trocas: TrocaEstampa[] = [];
  const primeiraFaixa = faixasDeEstampa(m.toks)[0] || "";
  if (primeiraFaixa && estNova && nrm(primeiraFaixa) !== nrm(estNova)) trocas.push({ de: primeiraFaixa, para: estNova });
  if (trocaLinha) trocas.push({ de: m.linha, para: n.linha });
  if (capNovaDif) trocas.push({ de: m.capacidade, para: n.capacidade });
  return {
    titulo, estampaAntiga: m.estampa, estampaNova: estNova, linhaAntiga: m.linha, linhaNova: trocaLinha ? n.linha : m.linha,
    trocas, capacidadeDiferente: capNovaDif,
    sai: m.toks.filter((t) => t.papel === "estampa").map((t) => t.texto), entra: estNova ? [estNova] : [],
  };
}

/** faixas contíguas de estampa do título ("Copatucano" | "Azul e Branca" quando há "Estampada" no meio). */
function faixasDeEstampa(toks: Tok[]): string[] {
  const faixas: string[][] = [];
  let atual: string[] | null = null;
  for (const t of toks) {
    if (t.papel === "estampa") { if (!atual) { atual = []; faixas.push(atual); } atual.push(t.texto); }
    else atual = null;
  }
  return faixas.map((f) => f.join(" "));
}

export const LIMITE_TITULO_PADRAO = 60;

/** Junta os papéis num título de até `max` caracteres tirando primeiro o que menos informa: Estampa/Estampada, Original, formato. A estampa nunca é cortada. */
function juntarComLimite(toks: Tok[], max = LIMITE_TITULO_PADRAO): string {
  let lista = toks.slice();
  const juntar = () => lista.map((t) => t.texto).join(" ").replace(/\s+/g, " ").trim();
  const tira = (f: (t: Tok) => boolean) => { const i = lista.findIndex(f); if (i >= 0) { lista.splice(i, 1); return true; } return false; };
  const ordem: ((t: Tok) => boolean)[] = [
    (t) => t.papel === "marcador" && !!t.deEstampa,  // Estampa / Estampada (sobra "Original", que lê melhor sozinho)
    (t) => t.papel === "marcador" && !t.deEstampa,   // Original
    (t) => t.papel === "formato",
    (t) => t.papel === "conector",
  ];
  for (const f of ordem) {
    while (juntar().length > max && tira(f)) { /* tira uma por vez */ }
    if (juntar().length <= max) break;
  }
  return juntar();
}
