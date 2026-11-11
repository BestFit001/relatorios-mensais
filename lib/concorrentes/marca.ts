// Marca do anúncio. Nos cartões do Mercado Livre o texto costuma vir como "MARCA por VENDEDOR".

const limpo = (v: unknown, max = 120): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/**
 * Separa marca e vendedor.
 *  - já veio a marca e o vendedor repete "MARCA por X": fica só o X;
 *  - não veio a marca e o vendedor é "A por B": A é a marca, B é o vendedor;
 *  - qualquer outro texto fica como está (um vendedor sozinho não vira marca: seria chute).
 */
export function separarMarcaVendedor(marca: unknown, vendedor: unknown): { marca: string | null; vendedor: string | null } {
  let m = limpo(marca, 80);
  let v = limpo(vendedor);
  if (v) {
    const x = /^(.{1,60}?)\s+por\s+(.+)$/i.exec(v);
    if (x) {
      const antes = x[1].trim(), depois = x[2].trim();
      if (m) { if (antes.toLowerCase() === m.toLowerCase()) v = depois; }
      else { m = antes; v = depois; }
    }
  }
  return { marca: m, vendedor: v };
}
