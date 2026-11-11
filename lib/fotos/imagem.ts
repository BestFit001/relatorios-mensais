// Lê largura/altura direto do começo do arquivo (PNG, JPEG, GIF, WebP) — sem baixar a imagem inteira nem instalar biblioteca.
export type TipoImagem = "jpeg" | "png" | "gif" | "webp";
export interface Dimensoes { tipo: TipoImagem; largura: number; altura: number }

export function dimensoes(b: Buffer): Dimensoes | null {
  if (b.length < 24) return null;
  // PNG
  if (b.readUInt32BE(0) === 0x89504e47 && b.toString("ascii", 12, 16) === "IHDR") return { tipo: "png", largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) };
  // GIF
  if (b.toString("ascii", 0, 3) === "GIF") return { tipo: "gif", largura: b.readUInt16LE(6), altura: b.readUInt16LE(8) };
  // WebP
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const k = b.toString("ascii", 12, 16);
    if (k === "VP8X" && b.length >= 30) return { tipo: "webp", largura: 1 + b.readUIntLE(24, 3), altura: 1 + b.readUIntLE(27, 3) };
    if (k === "VP8L" && b.length >= 25) { const v = b.readUInt32LE(21); return { tipo: "webp", largura: (v & 0x3fff) + 1, altura: ((v >> 14) & 0x3fff) + 1 }; }
    if (k === "VP8 " && b.length >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { tipo: "webp", largura: b.readUInt16LE(26) & 0x3fff, altura: b.readUInt16LE(28) & 0x3fff };
    return null;
  }
  // JPEG: procura o marcador SOFn
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const tam = b.readUInt16BE(i + 2);
      if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { tipo: "jpeg", altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7) };
      if (tam < 2) return null;
      i += 2 + tam;
    }
  }
  return null;
}

export const extensaoDe = (t: TipoImagem) => (t === "jpeg" ? "jpg" : t);
