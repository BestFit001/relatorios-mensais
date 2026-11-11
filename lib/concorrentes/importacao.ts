// Importação do que o favorito leu no navegador: o texto vem de fora, então TUDO é conferido aqui antes de ir para o banco.
import type { AnuncioRaspado } from "./tipos";
import { ErroValidacao } from "./tipos";
import { parsePreco, parseVendidos } from "./calculos";
import { separarMarcaVendedor } from "./marca";
import { imagemSegura, normalizarUrlAnuncio } from "./mercadolivre/url";

export const MAX_IMPORTADOS = 300;

export interface PayloadLimpo {
  tipo: "categoria" | "anuncio" | "ranking";
  paginaUrl: string;
  nomeCategoria: string | null;
  anuncios: AnuncioRaspado[];
  descartados: number;
}

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

export function sanitizarPayload(bruto: unknown): PayloadLimpo {
  const p = bruto as any;
  if (!p || typeof p !== "object" || p.v !== 1 || !Array.isArray(p.anuncios)) {
    throw new ErroValidacao("Texto de importação inválido. Cole exatamente o que o favorito copiou.");
  }
  const tipo = p.tipo === "anuncio" ? "anuncio" : p.tipo === "categoria" ? "categoria" : p.tipo === "ranking" ? "ranking" : null;
  if (!tipo) throw new ErroValidacao("Texto de importação inválido (tipo desconhecido).");
  if (p.anuncios.length === 0) throw new ErroValidacao("O texto não tem nenhum anúncio.");
  if (p.anuncios.length > MAX_IMPORTADOS) throw new ErroValidacao(`Anúncios demais de uma vez (máximo ${MAX_IMPORTADOS}).`);

  const vistos = new Set<string>();
  const anuncios: AnuncioRaspado[] = [];
  let descartados = 0;
  for (const a of p.anuncios) {
    try {
      const { url, mlb_id } = normalizarUrlAnuncio(String(a?.url ?? ""));
      const titulo = texto(a?.titulo, 300);
      if (!titulo || vistos.has(mlb_id)) { descartados++; continue; }
      vistos.add(mlb_id);
      const preco = parsePreco(a?.preco);
      const vendas = parseVendidos(typeof a?.vendas_texto === "string" ? a.vendas_texto.slice(0, 80) : null);
      const { marca, vendedor } = separarMarcaVendedor(texto(a?.marca, 80), texto(a?.vendedor, 120));
      anuncios.push({
        mlb_id, titulo, url_anuncio: url,
        vendedor, marca,
        ranking: typeof a?.posicao === "number" && Number.isInteger(a.posicao) && a.posicao >= 1 && a.posicao <= 1000 ? a.posicao : null,
        url_imagem: imagemSegura(typeof a?.imagem === "string" ? a.imagem.slice(0, 500) : null),
        preco: preco != null && preco > 0 && preco < 10_000_000 ? preco : null,
        total_vendas: vendas && vendas.total >= 0 && vendas.total < 1_000_000_000 ? vendas.total : null,
        vendas_aproximado: vendas?.aproximado ?? false,
      });
    } catch { descartados++; }
  }
  if (!anuncios.length) throw new ErroValidacao("Nenhum anúncio válido no texto (os links precisam ser do Mercado Livre).");
  return { tipo, paginaUrl: String(p.pagina_url ?? ""), nomeCategoria: texto(p.categoria_nome, 120), anuncios, descartados };
}
