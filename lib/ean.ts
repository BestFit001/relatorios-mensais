// EAN/GTIN: o código de barras do produto, igual em qualquer loja (o SKU é interno e o Google não conhece).
export const limparEan = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

/** 8, 12, 13 ou 14 dígitos e dígito verificador (GS1) conferindo. */
export function eanValido(v: unknown): boolean {
  const d = limparEan(v);
  if (![8, 12, 13, 14].includes(d.length)) return false;
  let soma = 0;
  for (let i = 0; i < d.length - 1; i++) soma += Number(d[d.length - 2 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (soma % 10)) % 10 === Number(d[d.length - 1]);
}

export const googleShoppingEanUrl = (ean: string) => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(limparEan(ean))}`;
export const googleImagensEanUrl = (ean: string) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(limparEan(ean))}`;
