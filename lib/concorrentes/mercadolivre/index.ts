// Conector do Mercado Livre: tenta a API oficial e, se ela recusar, lê as páginas públicas (direto ou via proxy).
// ML_ESTRATEGIA = auto (padrão) | api | html
import type { AnuncioRaspado, Captura, Conector, DiagnosticoItem, RefAnuncio, ResultadoCategoria, ResultadoLote } from "../tipos";
import { SEM_TEMPO } from "../tipos";

import { comLimite } from "../calculos";
import { ErroSemTempo, apiBuscar, apiGet, apiItens, apiNomeDoVendedor, baixarHtml, itemDaApi, obterToken, temProxy } from "./fontes";
import { parseAnuncio, parseListagem } from "./parsers";
import { PAGINA_LISTAGEM, consultaDaCategoria, nomeDaCategoria, normalizarUrlAnuncio, normalizarUrlCategoria, urlDaPagina } from "./url";

const modo = () => (process.env.ML_ESTRATEGIA || "auto").toLowerCase();
const usaApi = () => modo() !== "html";
const usaHtml = () => modo() !== "api";
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const PAGINA_API = 50;
const CONCORRENCIA = () => Math.max(1, Number(process.env.ML_CONCORRENCIA) || 5);
/** Tempo total de uma chamada de cadastro (a função da Vercel para em 60 s). */
const PRAZO_CADASTRO_MS = 50_000;

async function categoriaPelaApi(url: string, paginas: number): Promise<ResultadoCategoria> {
  const consulta = consultaDaCategoria(url);
  const anuncios: AnuncioRaspado[] = [];
  const avisos: string[] = [];
  for (let p = 0; p < paginas; p++) {
    try {
      const lote = await apiBuscar(consulta, p * PAGINA_API, PAGINA_API);
      anuncios.push(...lote);
      if (lote.length < PAGINA_API) break;
    } catch (e) {
      if (p === 0) throw e;
      avisos.push(`página ${p + 1} da API falhou: ${msg(e)}`);
    }
  }
  if (!anuncios.length) throw new Error("a API não devolveu anúncios");
  avisos.push("A API pesquisa pelo texto do link; o resultado pode diferir da listagem exibida no site.");
  return { nome: nomeDaCategoria(url), anuncios, fonte: "api", avisos };
}

async function categoriaPeloHtml(url: string, paginas: number, ate: number): Promise<ResultadoCategoria> {
  const avisos: string[] = [];
  const porId = new Map<string, AnuncioRaspado>();
  let nome: string | null = null;

  // as páginas da listagem são independentes: lê todas ao mesmo tempo (via proxy cada uma pode levar dezenas de segundos)
  const lidas = await Promise.allSettled(
    Array.from({ length: paginas }, (_, i) => baixarHtml(urlDaPagina(url, i + 1), ate).then(parseListagem))
  );
  lidas.forEach((r, i) => {
    if (r.status === "rejected") {
      if (i === 0) throw r.reason;
      avisos.push(`página ${i + 1} não pôde ser lida: ${msg(r.reason)}`);
      return;
    }
    nome = nome || r.value.nome;
    for (const a of r.value.anuncios) if (!porId.has(a.mlb_id)) porId.set(a.mlb_id, a);
  });
  const lista = Array.from(porId.values());
  if (!lista.length) throw new Error("não encontrei anúncios na página (o layout do site pode ter mudado)");

  // a listagem quase nunca traz o total de vendas: abre a página de cada anúncio para completar, enquanto houver tempo
  const faltando = lista.filter((a) => a.total_vendas == null || a.vendedor == null || a.preco == null);
  let semTempo = 0, falhas = 0;
  await comLimite(faltando, CONCORRENCIA(), async (a) => {
    try {
      const d = parseAnuncio(await baixarHtml(a.url_anuncio, ate), a.url_anuncio);
      if (!d) { falhas++; return; }
      a.vendedor = a.vendedor ?? d.vendedor;
      a.marca = a.marca ?? d.marca;
      a.preco = a.preco ?? d.preco;
      a.url_imagem = a.url_imagem ?? d.url_imagem;
      if (a.total_vendas == null) { a.total_vendas = d.total_vendas; a.vendas_aproximado = d.vendas_aproximado; }
    } catch (e) { if (e instanceof ErroSemTempo) semTempo++; else falhas++; }
  });
  if (semTempo) avisos.push(`${semTempo} anúncio(s) ficaram sem total de vendas por falta de tempo; use "Atualizar agora" para completar.`);
  if (falhas) avisos.push(`${falhas} anúncio(s) não puderam ser abertos para ler vendas/vendedor.`);
  return { nome, anuncios: lista, fonte: temProxy() ? "proxy" : "html", avisos };
}

async function anuncioPelaApi(mlb_id: string): Promise<AnuncioRaspado> {
  const item = await apiGet(`/items/${mlb_id}`);
  const a = itemDaApi(item);
  if (!a) throw new Error("a API não devolveu os dados do anúncio");
  a.vendedor = a.vendedor ?? (await apiNomeDoVendedor(item?.seller_id));
  return a;
}

async function anuncioPeloHtml(url: string): Promise<AnuncioRaspado> {
  const a = parseAnuncio(await baixarHtml(url), url);
  if (!a) throw new Error("não consegui ler o anúncio na página");
  return a;
}

export const conectorMercadoLivre: Conector = {
  id: "mercadolivre",
  nome: "Mercado Livre",
  leituraServidor: true,

  validarUrlCategoria: normalizarUrlCategoria,
  validarUrlAnuncio: normalizarUrlAnuncio,

  async rasparCategoria(url, paginas) {
    const alvo = normalizarUrlCategoria(url);
    const erros: string[] = [];
    if (usaApi()) { try { return await categoriaPelaApi(alvo, paginas); } catch (e) { erros.push(`API: ${msg(e)}`); } }
    if (usaHtml()) { try { return await categoriaPeloHtml(alvo, paginas, Date.now() + PRAZO_CADASTRO_MS); } catch (e) { erros.push(`Página: ${msg(e)}`); } }
    throw new Error(erros.join(" | ") || "nenhuma estratégia habilitada");
  },

  async buscarAnuncio(url) {
    const { url: limpa, mlb_id } = normalizarUrlAnuncio(url);
    const erros: string[] = [];
    if (usaApi()) { try { return await anuncioPelaApi(mlb_id); } catch (e) { erros.push(`API: ${msg(e)}`); } }
    if (usaHtml()) { try { return await anuncioPeloHtml(limpa); } catch (e) { erros.push(`Página: ${msg(e)}`); } }
    throw new Error(erros.join(" | ") || "nenhuma estratégia habilitada");
  },

  async capturarLote(refs: RefAnuncio[], ate?: number): Promise<ResultadoLote> {
    const ok = new Map<string, Captura>(), erros = new Map<string, string>();
    let pendentes = refs;

    if (usaApi() && pendentes.length) {
      try {
        const itens = await apiItens(pendentes.map((r) => r.mlb_id));
        pendentes = pendentes.filter((r) => {
          const a = itemDaApi(itens.get(r.mlb_id));
          if (a && a.preco != null) { ok.set(r.mlb_id, { preco: a.preco, total_vendas: a.total_vendas, vendas_aproximado: a.vendas_aproximado }); return false; }
          erros.set(r.mlb_id, "API sem dados deste anúncio");
          return true;
        });
      } catch (e) {
        for (const r of pendentes) erros.set(r.mlb_id, `API: ${msg(e)}`);
      }
    }

    if (usaHtml() && pendentes.length) {
      await comLimite(pendentes, CONCORRENCIA(), async (r) => {
        try {
          const a = parseAnuncio(await baixarHtml(r.url_anuncio, ate), r.url_anuncio);
          if (!a || a.preco == null) throw new Error("preço não encontrado na página");
          ok.set(r.mlb_id, { preco: a.preco, total_vendas: a.total_vendas, vendas_aproximado: a.vendas_aproximado });
          erros.delete(r.mlb_id);
        } catch (e) {
          if (e instanceof ErroSemTempo) { erros.set(r.mlb_id, SEM_TEMPO); return; }
          const antes = erros.get(r.mlb_id);
          erros.set(r.mlb_id, `${antes ? antes + " | " : ""}Página: ${msg(e)}`);
        }
      });
    }
    return { ok, erros };
  },

  async diagnosticar() {
    const itens: DiagnosticoItem[] = [];
    const ate = Date.now() + 54_000; // a rota para em 60 s
    const medir = async (estrategia: string, fn: () => Promise<string>) => {
      const t = Date.now();
      try { itens.push({ estrategia, ok: true, detalhe: await fn(), ms: Date.now() - t }); }
      catch (e) { itens.push({ estrategia, ok: false, detalhe: msg(e), ms: Date.now() - t }); }
    };
    await medir("API · credenciais", async () => (await obterToken()) ? "token obtido" : "sem credenciais (ML_CLIENT_ID/ML_CLIENT_SECRET/ML_ACCESS_TOKEN) — chamadas anônimas");
    let primeiroId: string | null = null;
    await medir("API · busca pública", async () => {
      const r = await apiBuscar("organizador", 0, 5);
      primeiroId = r[0]?.mlb_id ?? null;
      return `${r.length} resultado(s)`;
    });
    await medir("API · dados de anúncio (/items/bulk)", async () => {
      if (!primeiroId) throw new Error("sem anúncio de teste (a busca falhou)");
      const m = await apiItens([primeiroId]);
      const a = itemDaApi(m.get(primeiroId));
      if (!a) throw new Error("a API não devolveu o anúncio");
      return `preço ${a.preco ?? "?"}, vendidos ${a.total_vendas ?? "?"}`;
    });
    let primeiroLink: string | null = null;
    await medir(`Página · listagem${temProxy() ? " (via proxy)" : ""}`, async () => {
      const r = parseListagem(await baixarHtml("https://lista.mercadolivre.com.br/organizador", ate));
      primeiroLink = r.anuncios[0]?.url_anuncio ?? null;
      if (!r.anuncios.length) throw new Error("a página abriu, mas nenhum anúncio foi reconhecido");
      return `${r.anuncios.length} anúncio(s) reconhecido(s)`;
    });
    await medir(`Página · anúncio${temProxy() ? " (via proxy)" : ""}`, async () => {
      if (!primeiroLink) throw new Error("sem anúncio de teste (a listagem falhou)");
      const a = parseAnuncio(await baixarHtml(primeiroLink, ate), primeiroLink);
      if (!a) throw new Error("não consegui ler o anúncio");
      return `preço ${a.preco ?? "?"}, vendidos ${a.total_vendas ?? "não informado"}`;
    });
    return itens;
  },
};

