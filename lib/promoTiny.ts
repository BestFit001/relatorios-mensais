// Planilha de estoque (inventário) do Tiny usada nas abas de Promoções (ML, Magalu, Shopee, TikTok):
// em que coluna está o SKU e em qual está o saldo. Fica salva no banco e vale para as quatro abas.
import { supabase } from "./supabase";

export interface ConfigPromoTiny { sku: string; estoque: string }
export const PADRAO_PROMO_TINY: ConfigPromoTiny = { sku: "C", estoque: "F" };
const CAMPOS = { sku: "promo_tiny_sku", estoque: "promo_tiny_estoque" } as const;
// Mercado Livre tem uma configuração por conta (ml1, ml2, ml3): promo_tiny_sku_ml1, promo_tiny_estoque_ml1...
const campoDaConta = (campo: string, conta?: string) => (conta ? `${campo}_${conta}` : campo);

/** "C" -> 2, "AA" -> 26. -1 se não for uma letra de coluna válida. */
export function indiceColuna(letra: string): number {
  const t = String(letra ?? "").trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(t)) return -1;
  let n = 0;
  for (const ch of t) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function letraDaColuna(indice: number): string {
  let n = indice + 1, s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Com `conta`, vale a configuração daquela conta; sem ela (ou sem nada salvo para a conta), a geral; sem nada, C e F. */
export async function carregarConfigPromoTiny(conta?: string): Promise<ConfigPromoTiny> {
  const cfg = { ...PADRAO_PROMO_TINY };
  try {
    const campos = [CAMPOS.sku, CAMPOS.estoque, ...(conta ? [campoDaConta(CAMPOS.sku, conta), campoDaConta(CAMPOS.estoque, conta)] : [])];
    const { data } = await supabase.from("config_regras_tiny").select("campo, coluna").in("campo", campos);
    const valor = (campo: string) => {
      const r = (data || []).find((x: any) => x.campo === campo);
      const letra = String(r?.coluna ?? "").trim().toUpperCase();
      return r && indiceColuna(letra) >= 0 ? letra : "";
    };
    cfg.sku = valor(campoDaConta(CAMPOS.sku, conta)) || valor(CAMPOS.sku) || cfg.sku;
    cfg.estoque = valor(campoDaConta(CAMPOS.estoque, conta)) || valor(CAMPOS.estoque) || cfg.estoque;
  } catch { /* sem banco: usa o padrão C / F */ }
  return cfg;
}

export async function salvarConfigPromoTiny(cfg: ConfigPromoTiny, conta?: string): Promise<void> {
  const sku = cfg.sku.trim().toUpperCase(), estoque = cfg.estoque.trim().toUpperCase();
  if (indiceColuna(sku) < 0 || indiceColuna(estoque) < 0) throw new Error("Use só letras de coluna (ex.: C, F, AB).");
  if (sku === estoque) throw new Error("O SKU e o estoque não podem estar na mesma coluna.");
  const { error } = await supabase.from("config_regras_tiny").upsert(
    [{ campo: campoDaConta(CAMPOS.sku, conta), coluna: sku }, { campo: campoDaConta(CAMPOS.estoque, conta), coluna: estoque }],
    { onConflict: "campo" },
  );
  if (error) throw new Error(error.message);
}

/** Número em formato brasileiro ou americano (1.234,56 / 1,234.56 / 12,5 / 12). Não numérico = null. */
export function saldoParaNumero(v: any): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").trim().replace(/\s/g, "");
  if (!s) return 0;
  s = s.replace(/[^\d.,-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  const temV = s.includes(","), temP = s.includes(".");
  if (temV && temP) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (temV) s = s.replace(",", ".");
  else if (temP && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface EstoqueTiny {
  mapa: Map<string, number>;
  comEstoque: number;
  linhasLidas: number;
  /** Algo que o usuário precisa saber (coluna fora da planilha, nada com saldo...). */
  aviso?: string;
}

/** Lê o inventário nas colunas configuradas. SKU repetido (vários depósitos) soma; linha de título é ignorada. */
export function lerEstoqueTiny(linhas: any[][], cfg: ConfigPromoTiny, normalizar: (v: any) => string): EstoqueTiny {
  const iSku = indiceColuna(cfg.sku), iEst = indiceColuna(cfg.estoque);
  const mapa = new Map<string, number>();
  let linhasLidas = 0, semNumero = 0, maxCols = 0;
  for (const row of linhas) {
    if (!row) continue;
    maxCols = Math.max(maxCols, row.length);
    if (iSku < 0 || iEst < 0 || row.length <= Math.min(iSku, iEst)) continue;
    const sku = normalizar(row[iSku]);
    if (!sku) continue;
    const saldo = saldoParaNumero(row[iEst]);
    if (saldo === null) { semNumero++; continue; }   // título ("Saldo") ou texto
    linhasLidas++;
    mapa.set(sku, (mapa.get(sku) || 0) + saldo);
  }
  const comEstoque = Array.from(mapa.values()).filter((v) => v > 0).length;
  let aviso: string | undefined;
  if (iSku < 0 || iEst < 0) aviso = "As colunas configuradas são inválidas. Ajuste em Configurações.";
  else if (Math.max(iSku, iEst) >= maxCols) aviso = `A planilha só tem ${maxCols} coluna(s), mas a configuração usa SKU na ${cfg.sku} e estoque na ${cfg.estoque}. Ajuste em Configurações.`;
  else if (mapa.size === 0) aviso = `Nenhum SKU foi lido (SKU na coluna ${cfg.sku}, estoque na ${cfg.estoque}). Confira as colunas em Configurações.`;
  else if (comEstoque === 0) aviso = `Nenhum SKU com saldo maior que zero (estoque lido na coluna ${cfg.estoque}). Confira a coluna em Configurações.`;
  else if (semNumero > linhasLidas) aviso = `Muitas linhas com saldo que não é número na coluna ${cfg.estoque}. Confira a coluna em Configurações.`;
  return { mapa, comEstoque, linhasLidas, aviso };
}
