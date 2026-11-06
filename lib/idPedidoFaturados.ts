// Extrai o número do pedido do texto da coluna de observações da planilha de Faturados (NFes de saída).
// MESMA regra do upload de Faturados (Uploads > Passo 1), compartilhada para a aba Impacto usar exatamente a mesma leitura.

/** Número do pedido encontrado no texto (sem normalizar), ou null. */
export function extrairIdPedidoDaObservacao(texto: unknown): string | null {
  const raw = texto === null || texto === undefined ? "" : String(texto).trim();
  if (!raw) return null;
  const matchAmazon = raw.match(/\b\d{3}-\d{7}-\d{7}\b/);
  const matchMagalu = raw.match(/\bLU-[A-Z0-9-]+\b/i);
  const matchML = raw.match(/\b20000\d+\b/);
  const matchNum = raw.match(/\b\d{10,20}\b/);
  const matchGen = raw.match(/\b[A-Z0-9]{8,22}\b/i);
  if (matchAmazon) return matchAmazon[0].trim();
  if (matchMagalu) return matchMagalu[0].trim();
  if (matchML) return matchML[0].trim();
  if (matchNum) return matchNum[0].trim();
  if (matchGen) return matchGen[0].trim();
  return null;
}

/** "R$ 1.234,56" / "1234.56" / 1234.56 -> número (null se não for número). */
export function paraNumeroBR(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  let s = String(v).replace(/R\$|\s/g, "").trim();
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
