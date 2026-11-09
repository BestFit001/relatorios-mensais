// Mapa de Cadastros: SKU que vendeu em um canal conta como CADASTRADO naquele canal.
// Este arquivo é só lógica (sem rede nem tela): decide quais pares (canal, SKU) faltam em `mapeamento_canais_skus`.

const semAcento = (s: any) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "TikTok" = "Tiktok" = "tik tok": compara nomes de canal sem se importar com maiúsculas, acento ou espaço. */
export const normalizarNomeCanal = (nome: any): string => {
  const k = semAcento(nome).replace(/[^a-z0-9]/g, "");
  return k === "magazineluiza" ? "magalu" : k;   // Magalu e Magazine Luiza são o mesmo canal
};

/** Nome oficial do canal: "Magazine Luiza" vira "Magalu"; os demais ficam como estão. */
export const nomeOficialCanal = (nome: any): string => {
  const t = String(nome ?? "").trim();
  return normalizarNomeCanal(t) === "magalu" ? "Magalu" : t;
};

/** Lista de canais sem repetição (ignora maiúsculas, acento e o apelido Magazine Luiza). */
export function canaisSemRepeticao(lista: any[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const c of lista) {
    const nome = nomeOficialCanal(c);
    const k = normalizarNomeCanal(nome);
    if (!k || vistos.has(k)) continue;
    vistos.add(k); out.push(nome);
  }
  return out;
}

/** Mesma normalização de SKU usada em todo o app. */
export function normalizarSkuVenda(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** Canais que não têm catálogo/cadastro (ex.: Clube Hebraica, Clube Paineiras): ficam fora do Mapa de Cadastros. */
export const canalTemCadastro = (nome: any): boolean => !normalizarNomeCanal(nome).startsWith("clube");

/** Descobre a qual canal cadastrado uma venda pertence (null = o canal da venda não existe na lista). */
export function canalDaVenda(nomeNaVenda: any, canais: string[]): string | null {
  const k = normalizarNomeCanal(nomeNaVenda);
  if (!k) return null;
  return canais.find((c) => normalizarNomeCanal(c) === k) ?? null;
}

export interface VendaMinima { canal: any; sku: any }
export interface ParCanalSku { canal: string; sku: string }

export interface ResultadoSincronizacao {
  /** pares (canal, SKU) que venderam mas ainda não constavam como cadastrados */
  novos: ParCanalSku[];
  /** SKUs vendidos que não existem na base do Tiny (não são registrados) */
  foraDaBase: string[];
  /** nomes de canal que aparecem nas vendas mas não existem na lista de canais */
  canaisSemCadastro: string[];
}

export function pendentesDeRegistro(p: {
  vendas: VendaMinima[];
  canais: string[];
  /** pares já marcados como cadastrados (presente = true) */
  presentes: Iterable<ParCanalSku>;
  /** SKUs da base do Tiny, já normalizados */
  skusBase: Set<string>;
}): ResultadoSincronizacao {
  const jaTem = new Set<string>();
  for (const x of p.presentes) jaTem.add(`${normalizarNomeCanal(x.canal)}|${normalizarSkuVenda(x.sku)}`);

  const novos = new Map<string, ParCanalSku>();
  const foraDaBase = new Set<string>();
  const semCanal = new Set<string>();

  for (const v of p.vendas) {
    const canal = canalDaVenda(v.canal, p.canais);
    if (!canal) { const nome = String(v.canal ?? "").trim(); if (nome) semCanal.add(nome); continue; }

    let sku = normalizarSkuVenda(v.sku);
    if (!sku || sku === "semsku" || sku.length > 40) continue;

    if (!p.skusBase.has(sku)) {
      // Amazon: vendas antigas com sufixo F / FBA casam com o SKU da base (mesma regra da Curva ABC)
      let alt = "";
      if (normalizarNomeCanal(canal).includes("amazon")) {
        if (sku.endsWith("fba") && p.skusBase.has(sku.slice(0, -3))) alt = sku.slice(0, -3);
        else if (sku.endsWith("f") && p.skusBase.has(sku.slice(0, -1))) alt = sku.slice(0, -1);
      }
      if (!alt) { foraDaBase.add(sku); continue; }
      sku = alt;
    }

    const chave = `${normalizarNomeCanal(canal)}|${sku}`;
    if (jaTem.has(chave) || novos.has(chave)) continue;
    novos.set(chave, { canal, sku });
  }
  return { novos: Array.from(novos.values()), foraDaBase: Array.from(foraDaBase), canaisSemCadastro: Array.from(semCanal) };
}
