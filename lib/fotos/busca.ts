// Busca de fotos por imagem: Vision acha onde a foto está na internet; aqui medimos cada imagem e ordenamos pela resolução.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ErroValidacao } from "../concorrentes/tipos";
import { dimensoes, type TipoImagem } from "./imagem";
import { fetchSeguro, urlPermitida, type RespostaSegura } from "./seguranca";
import { buscarNoVision, type Candidato, type OrigemFoto } from "./vision";

export interface FotoAchada {
  url: string; largura: number; altura: number; pixels: number; tipo: TipoImagem; bytes: number | null;
  origem: OrigemFoto; pagina: string | null; titulo: string | null; dominio: string;
}
export interface BuscaResposta { fotos: FotoAchada[]; palpite: string; entidades: string[]; candidatos: number; usados: number; limite: number }

export const LIMITE_PADRAO = 950; // abaixo dos 1.000 gratuitos, para nunca virar cobrança por descuido
export const limiteMensal = () => { const n = Number(process.env.FOTOS_LIMITE_MES); return Number.isFinite(n) && n > 0 ? Math.floor(n) : LIMITE_PADRAO; };

const inicioDoMes = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(); };

export async function usoDoMes(sb: SupabaseClient): Promise<number> {
  const { count, error } = await sb.from("fotos_buscas").select("id", { count: "exact", head: true }).gte("criado_em", inicioDoMes());
  if (error) throw new Error("Não consegui ler o contador de buscas (rode a migration 20261111200000_fotos_buscas.sql no Supabase): " + error.message);
  return count || 0;
}

type Baixar = (url: string) => Promise<RespostaSegura>;
const baixarCabecalho: Baixar = (url) => fetchSeguro(url, { maxBytes: 131_072, timeoutMs: 6000, headers: { range: "bytes=0-131071" } });

/** Mede uma imagem lendo só o começo do arquivo. Devolve null se não for imagem, estiver quebrada ou pequena demais (ícone). */
export async function medirImagem(c: Candidato, baixar: Baixar = baixarCabecalho): Promise<FotoAchada | null> {
  const u = urlPermitida(c.url); if (!u) return null;
  try {
    const r = await baixar(c.url);
    if (r.status < 200 || r.status >= 300) return null;
    const d = dimensoes(r.corpo); if (!d) return null;
    if (Math.max(d.largura, d.altura) < 100) return null;
    const cr = String(r.headers["content-range"] || "").match(/\/(\d+)$/);
    const cl = Number(r.headers["content-length"]);
    const bytes = cr ? Number(cr[1]) : r.status === 200 && Number.isFinite(cl) && cl > 0 ? cl : null;
    let dominio = u.hostname.replace(/^www\./, "");
    return { url: c.url, largura: d.largura, altura: d.altura, pixels: d.largura * d.altura, tipo: d.tipo, bytes, origem: c.origem, pagina: c.pagina || null, titulo: c.titulo || null, dominio };
  } catch { return null; }
}

/** Mede em paralelo (poucas por vez, com prazo total) e ordena: maior resolução primeiro; empate = mais parecida primeiro. */
export async function medirTodas(cands: Candidato[], baixar: Baixar = baixarCabecalho, opc = { paralelo: 8, prazoMs: 40_000 }): Promise<FotoAchada[]> {
  const fim = Date.now() + opc.prazoMs; const saida: FotoAchada[] = []; let i = 0;
  const peso = { igual: 0, parcial: 1, parecida: 2 } as const;
  const trabalhador = async () => { while (i < cands.length && Date.now() < fim) { const c = cands[i++]; const f = await medirImagem(c, baixar); if (f) saida.push(f); } };
  await Promise.all(Array.from({ length: Math.min(opc.paralelo, cands.length) }, trabalhador));
  return saida.sort((a, b) => b.pixels - a.pixels || peso[a.origem] - peso[b.origem]);
}

/** Valida a foto enviada (base64 de JPEG/PNG/WebP/GIF, até ~4,5 MB) e devolve o base64 limpo. */
export function validarImagem(entrada: unknown): string {
  if (typeof entrada !== "string" || !entrada) throw new ErroValidacao("Envie a foto de referência.");
  const b64 = entrada.replace(/^data:image\/[a-z+.-]+;base64,/i, "").replace(/\s/g, "");
  if (b64.length > 6_000_000) throw new ErroValidacao("Foto grande demais. Use uma de até 4 MB.");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new ErroValidacao("Foto inválida.");
  if (!dimensoes(Buffer.from(b64.slice(0, 400_000), "base64"))) throw new ErroValidacao("Não reconheci a imagem. Use JPG, PNG, WebP ou GIF.");
  return b64;
}

export async function buscarFotos(sb: SupabaseClient, dados: { imagem: unknown; usuario?: unknown; sku?: unknown }, baixar: Baixar = baixarCabecalho): Promise<BuscaResposta> {
  const chave = process.env.GOOGLE_VISION_API_KEY;
  if (!chave) throw new ErroValidacao("Falta configurar GOOGLE_VISION_API_KEY nas variáveis de ambiente da Vercel (veja o passo a passo na aba).");
  const b64 = validarImagem(dados.imagem);
  const limite = limiteMensal(); const antes = await usoDoMes(sb);
  if (antes >= limite) throw new ErroValidacao(`Limite de ${limite} buscas neste mês atingido (a cota gratuita do Google é 1.000). Ele zera no começo do próximo mês; ou aumente FOTOS_LIMITE_MES sabendo que passar de 1.000 é cobrado.`);
  const v = await buscarNoVision(b64, chave);
  // conta o uso assim que o Google respondeu (é aí que a cota é gasta)
  await sb.from("fotos_buscas").insert({ usuario: String(dados.usuario || "").slice(0, 120) || null, sku: String(dados.sku || "").slice(0, 60) || null, achados: v.candidatos.length });
  const fotos = await medirTodas(v.candidatos, baixar);
  return { fotos, palpite: v.palpite, entidades: v.entidades, candidatos: v.candidatos.length, usados: antes + 1, limite };
}
