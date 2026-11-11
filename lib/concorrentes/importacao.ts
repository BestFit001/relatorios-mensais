// Importação do que o favorito leu no navegador: o texto vem de fora, então TUDO é conferido aqui antes de ir para o banco.
import type { AnuncioRaspado } from "./tipos";
import { ErroValidacao } from "./tipos";
import { parseComprasNoMes, parsePreco, parseVendidos } from "./calculos";
import { separarMarcaVendedor } from "./marca";
import { imagemSegura } from "./mercadolivre/url";
import { URLS, urlsDoCanal } from "./urls";

const URLS_NOME = (c: string): string | null => URLS[c]?.nome ?? null;

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

/** Canal que o favorito informou no texto (favoritos antigos não informam: eram só do Mercado Livre). */
export function canalDoPayload(bruto: unknown): string {
  const c = (bruto as any)?.canal;
  return typeof c === "string" && c ? c : "mercadolivre";
}

export function sanitizarPayload(bruto: unknown, canal: string = "mercadolivre"): PayloadLimpo {
  const urls = urlsDoCanal(canal);
  const p = bruto as any;
  if (p && typeof p === "object" && p.tipo === "fotos") throw new ErroValidacao("Esse texto foi lido no Bing Imagens: cole na aba “Buscar fotos”.");
  if (p && typeof p === "object" && p.tipo === "pesquisa") throw new ErroValidacao("Esse texto foi lido no Google: cole na aba “Pesquisa de preços”.");
  if (!p || typeof p !== "object" || p.v !== 1 || !Array.isArray(p.anuncios)) {
    throw new ErroValidacao("Texto de importação inválido. Cole exatamente o que o favorito copiou.");
  }
  const tipo = p.tipo === "anuncio" ? "anuncio" : p.tipo === "categoria" ? "categoria" : p.tipo === "ranking" ? "ranking" : null;
  if (!tipo) throw new ErroValidacao("Texto de importação inválido (tipo desconhecido).");
  if (canalDoPayload(p) !== canal) {
    const lido = URLS_NOME(canalDoPayload(p));
    throw new ErroValidacao(`Esse texto foi lido ${lido ? `na ${lido}` : "em outro site"}, mas aqui é a aba ${urls.nome}. Cole na aba certa.`);
  }
  if (p.anuncios.length === 0) throw new ErroValidacao("O texto não tem nenhum anúncio.");
  if (p.anuncios.length > MAX_IMPORTADOS) throw new ErroValidacao(`Anúncios demais de uma vez (máximo ${MAX_IMPORTADOS}).`);

  const vistos = new Set<string>();
  const anuncios: AnuncioRaspado[] = [];
  let descartados = 0;
  for (const a of p.anuncios) {
    try {
      const { url, mlb_id } = urls.validarUrlAnuncio(String(a?.url ?? ""));
      const titulo = texto(a?.titulo, 300);
      if (!titulo || vistos.has(mlb_id)) { descartados++; continue; }
      vistos.add(mlb_id);
      const preco = parsePreco(a?.preco);
      const vtxt = typeof a?.vendas_texto === "string" ? a.vendas_texto.slice(0, 80) : null;
      // Amazon informa as compras do ÚLTIMO MÊS (faixa); ML e Shopee informam o total acumulado
      const mes = canal === "amazon" ? parseComprasNoMes(vtxt) : null;
      const vendas = canal === "amazon" ? null : parseVendidos(vtxt);
      const { marca, vendedor } = separarMarcaVendedor(texto(a?.marca, 80), texto(a?.vendedor, 120));
      anuncios.push({
        mlb_id, titulo, url_anuncio: url,
        vendedor, marca,
        ranking: typeof a?.posicao === "number" && Number.isInteger(a.posicao) && a.posicao >= 1 && a.posicao <= 1000 ? a.posicao : null,
        url_imagem: imagemSegura(typeof a?.imagem === "string" ? a.imagem.slice(0, 500) : null),
        preco: preco != null && preco > 0 && preco < 10_000_000 ? preco : null,
        total_vendas: vendas && vendas.total >= 0 && vendas.total < 1_000_000_000 ? vendas.total : null,
        vendas_aproximado: vendas?.aproximado ?? false,
        vendas_mes: mes && mes.total >= 0 && mes.total < 1_000_000_000 ? mes.total : null,
      });
    } catch { descartados++; }
  }
  if (!anuncios.length) throw new ErroValidacao(`Nenhum anúncio válido no texto (os links precisam ser do ${urls.nome}).`);
  return { tipo, paginaUrl: String(p.pagina_url ?? ""), nomeCategoria: texto(p.categoria_nome, 120), anuncios, descartados };
}
