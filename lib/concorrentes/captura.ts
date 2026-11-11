// Casos de uso do monitor: cadastrar categoria (raspa 2 páginas), adicionar anúncio avulso e a captura diária.
import type { SupabaseClient } from "@supabase/supabase-js";
import { obterConector } from "./marketplaces";
import { calcularVendasNoDia, hojeSP, comLimite, totalBase } from "./calculos";
import { ErroValidacao, type AnuncioRaspado } from "./tipos";

export const PAGINAS_POR_CATEGORIA = 2;
const MAX_ANUNCIOS = 100;
const em = <T,>(l: T[], n: number): T[][] => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));

function falha(contexto: string, error: { message: string } | null) {
  if (error) throw new Error(`${contexto}: ${error.message}`);
}

/** Linhas de `anuncios` + 1ª linha de histórico (sem vendas_no_dia: ainda não há "ontem"). */
async function gravarAnuncios(db: SupabaseClient, categoria_id: string, lista: AnuncioRaspado[], hoje: string, manual: boolean) {
  const linhas = lista.map((a) => ({
    categoria_id, mlb_id: a.mlb_id, titulo: a.titulo, vendedor: a.vendedor, url_anuncio: a.url_anuncio, url_imagem: a.url_imagem,
    ativo: true, manual,
    ultimo_preco: a.preco, ultimo_total_vendas: a.total_vendas, ultimas_vendas_dia: null, ultima_captura: hoje,
  }));
  const novos: { id: string; mlb_id: string }[] = [];
  for (const lote of em(linhas, 200)) {
    // ignoreDuplicates: anúncio que já existe (inclusive desativado à mão) não é mexido
    const { data, error } = await db.from("anuncios").upsert(lote, { onConflict: "categoria_id,mlb_id", ignoreDuplicates: true }).select("id,mlb_id");
    falha("gravar anúncios", error);
    novos.push(...(data || []));
  }
  const porMlb = new Map(lista.map((a) => [a.mlb_id, a]));
  const historico = novos.map((n) => {
    const a = porMlb.get(n.mlb_id)!;
    return { anuncio_id: n.id, data_captura: hoje, preco: a.preco, total_vendas_acumulado: a.total_vendas, vendas_no_dia: null, vendas_aproximado: a.vendas_aproximado };
  });
  for (const lote of em(historico, 500)) {
    const { error } = await db.from("historico_diario").upsert(lote, { onConflict: "anuncio_id,data_captura", ignoreDuplicates: true });
    falha("gravar histórico", error);
  }
  return novos.length;
}

export async function cadastrarCategoria(db: SupabaseClient, entrada: { canal: string; url: string; nome?: string }) {
  const conector = obterConector(entrada.canal);
  const url = conector.validarUrlCategoria(entrada.url);
  const hoje = hojeSP();

  // raspa ANTES de gravar: se falhar, nada fica pela metade
  const r = await conector.rasparCategoria(url, PAGINAS_POR_CATEGORIA);
  const anuncios = r.anuncios.slice(0, MAX_ANUNCIOS);
  const nome = (entrada.nome || "").trim() || r.nome || "Categoria";

  const { data: cat, error } = await db.from("categorias")
    .upsert({ nome, canal: entrada.canal, url_origem: url, ativo: true, ultima_raspagem: new Date().toISOString() }, { onConflict: "canal,url_origem" })
    .select("*").single();
  falha("gravar categoria", error);

  const novos = await gravarAnuncios(db, cat.id, anuncios, hoje, false);
  return { categoria: cat, encontrados: anuncios.length, novos, fonte: r.fonte, avisos: r.avisos };
}

export async function adicionarAnuncioAvulso(db: SupabaseClient, entrada: { categoria_id: string; url: string }) {
  const { data: cat, error } = await db.from("categorias").select("id,canal").eq("id", entrada.categoria_id).maybeSingle();
  falha("buscar categoria", error);
  if (!cat) throw new ErroValidacao("Categoria não encontrada.");
  const conector = obterConector(cat.canal);
  const { mlb_id } = conector.validarUrlAnuncio(entrada.url);

  const { data: existente, error: e2 } = await db.from("anuncios").select("id,ativo").eq("categoria_id", cat.id).eq("mlb_id", mlb_id).maybeSingle();
  falha("buscar anúncio", e2);
  if (existente?.ativo) throw new ErroValidacao("Esse anúncio já está sendo monitorado nesta categoria.");
  if (existente && !existente.ativo) {
    const { error: e3 } = await db.from("anuncios").update({ ativo: true }).eq("id", existente.id);
    falha("reativar anúncio", e3);
    return { reativado: true, mlb_id };
  }
  const a = await conector.buscarAnuncio(entrada.url);
  await gravarAnuncios(db, cat.id, [a], hojeSP(), true);
  return { reativado: false, mlb_id: a.mlb_id, titulo: a.titulo };
}

export async function definirAtivo(db: SupabaseClient, anuncio_id: string, ativo: boolean) {
  const { error } = await db.from("anuncios").update({ ativo }).eq("id", anuncio_id);
  falha("atualizar anúncio", error);
}

export interface ResumoCaptura {
  data: string;
  ativos: number;
  jaCapturados: number;
  processados: number;
  ok: number;
  falhas: number;
  pendentes: number;
  completo: boolean;
  erros: { mlb_id: string; motivo: string }[];
  ms: number;
}

/**
 * Captura diária: para cada anúncio ativo grava preço e total de vendas de hoje e calcula
 * vendas_no_dia = total de hoje − total da captura anterior. Roda dentro de um orçamento de tempo
 * e pode ser repetida (já capturados hoje são pulados), então nunca estoura o limite da função.
 */
export async function capturarDiario(db: SupabaseClient, opc: { orcamentoMs?: number; forcar?: boolean; categoriaId?: string } = {}): Promise<ResumoCaptura> {
  const inicio = Date.now();
  const orcamento = opc.orcamentoMs ?? 50_000;
  const hoje = hojeSP();

  const todos: any[] = [];
  for (let de = 0; ; de += 1000) {
    let q = db.from("anuncios")
      .select("id,mlb_id,url_anuncio,ultima_captura,ultimo_total_vendas,ultimas_vendas_dia,categoria_id,categorias!inner(canal,ativo)")
      .eq("ativo", true).eq("categorias.ativo", true)
      .order("id", { ascending: true }).range(de, de + 999);
    if (opc.categoriaId) q = q.eq("categoria_id", opc.categoriaId);
    const { data, error } = await q;
    falha("listar anúncios ativos", error);
    todos.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const fila = todos.filter((a) => opc.forcar || a.ultima_captura !== hoje);
  // quem está há mais tempo sem captura vai primeiro (se o tempo acabar, o resto fica para a próxima rodada)
  fila.sort((a, b) => String(a.ultima_captura ?? "").localeCompare(String(b.ultima_captura ?? "")));

  const resumo: ResumoCaptura = { data: hoje, ativos: todos.length, jaCapturados: todos.length - fila.length, processados: 0, ok: 0, falhas: 0, pendentes: 0, completo: true, erros: [], ms: 0 };
  const categoriasTocadas = new Set<string>();

  for (const lote of em(fila, 20)) {
    if (Date.now() - inicio > orcamento) break;
    // anúncios de um mesmo lote podem ser de canais diferentes
    const porCanal = new Map<string, any[]>();
    for (const a of lote) { const c = a.categorias.canal; porCanal.set(c, [...(porCanal.get(c) || []), a]); }

    for (const [canal, itens] of Array.from(porCanal.entries())) {
      let conector;
      try { conector = obterConector(canal); } catch (e: any) {
        for (const a of itens) { resumo.falhas++; resumo.processados++; if (resumo.erros.length < 20) resumo.erros.push({ mlb_id: a.mlb_id, motivo: e.message }); }
        continue;
      }
      const r = await conector.capturarLote(itens.map((a) => ({ mlb_id: a.mlb_id, url_anuncio: a.url_anuncio })));
      const historico: any[] = [];
      const atualizacoes: { id: string; campos: Record<string, unknown> }[] = [];
      for (const a of itens) {
        resumo.processados++;
        const cap = r.ok.get(a.mlb_id);
        if (!cap) {
          resumo.falhas++;
          if (resumo.erros.length < 20) resumo.erros.push({ mlb_id: a.mlb_id, motivo: r.erros.get(a.mlb_id) || "sem resposta" });
          continue;
        }
        resumo.ok++;
        categoriasTocadas.add(a.categoria_id);
        const vendasDia = calcularVendasNoDia(cap.total_vendas, totalBase(a, hoje));
        historico.push({ anuncio_id: a.id, data_captura: hoje, preco: cap.preco, total_vendas_acumulado: cap.total_vendas, vendas_no_dia: vendasDia, vendas_aproximado: cap.vendas_aproximado, capturado_em: new Date().toISOString() });
        atualizacoes.push({ id: a.id, campos: {
          ultimo_preco: cap.preco,
          ...(cap.total_vendas != null ? { ultimo_total_vendas: cap.total_vendas } : {}), // sem número novo, mantém o último como base
          ultimas_vendas_dia: vendasDia,
          ultima_captura: hoje,
        } });
      }
      if (historico.length) {
        const { error } = await db.from("historico_diario").upsert(historico, { onConflict: "anuncio_id,data_captura" });
        falha("gravar histórico diário", error);
        await comLimite(atualizacoes, 8, async (u) => { const { error: e } = await db.from("anuncios").update(u.campos).eq("id", u.id); falha("atualizar anúncio", e); });
      }
    }
  }

  if (categoriasTocadas.size) await db.from("categorias").update({ ultima_raspagem: new Date().toISOString() }).in("id", Array.from(categoriasTocadas));
  resumo.pendentes = Math.max(0, fila.length - resumo.processados);
  resumo.completo = resumo.pendentes === 0;
  resumo.ms = Date.now() - inicio;
  return resumo;
}
