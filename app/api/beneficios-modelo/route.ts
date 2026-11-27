import { NextResponse } from "next/server";
import { gerarTexto, provedoresConfigurados, resumirFalhas } from "../../../lib/iaProvedores";
import { MAX_BENEFICIOS, dividirTitulo, lerDadosImagem, pedidoBeneficios } from "../../../lib/beneficiosModelo";
import { MOTIVO_SEM_CHAVE } from "../../../lib/adaptarModelo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sugere título (2 linhas), capacidade e benefícios de um modelo a partir do texto dele. A chave do Claude fica só no servidor (ANTHROPIC_API_KEY). */
export async function POST(req: Request) {
  let c: any; try { c = await req.json(); } catch { return NextResponse.json({ erro: "corpo inválido" }, { status: 400 }); }
  const titulo = String(c?.titulo || "").trim().slice(0, 300);
  if (!titulo) return NextResponse.json({ erro: "faltou o título do modelo" }, { status: 400 });
  const quantidade = Math.min(Math.max(Math.round(Number(c?.quantidade)) || 4, 1), MAX_BENEFICIOS);
  const modelo = { titulo, marca: String(c?.marca || "").slice(0, 80), categoria: String(c?.categoria || "").slice(0, 200), descricao: String(c?.descricao || ""), descricao_seo: String(c?.descricao_seo || "") };
  const provedores = provedoresConfigurados();
  const alternativa = { ...dividirTitulo(titulo, modelo.marca), capacidade: "" };
  if (!provedores.length) return NextResponse.json({ erro: MOTIVO_SEM_CHAVE, sugestaoTitulo: alternativa }, { status: 503 });
  const res = await gerarTexto(provedores, pedidoBeneficios(modelo, quantidade), { json: true, maxTokens: 1200, prazoFinal: Date.now() + 50_000, aceitar: (t) => !!lerDadosImagem(t, quantidade) });
  const dados = res.texto ? lerDadosImagem(res.texto, quantidade) : null;
  if (!dados) return NextResponse.json({ erro: "A IA não respondeu: " + (resumirFalhas(res.falhas) || "sem detalhe") + ". Preencha os benefícios à mão.", sugestaoTitulo: alternativa }, { status: 502 });
  if (!dados.linha1 && !dados.linha2) { const t = dividirTitulo(titulo, modelo.marca); dados.linha1 = t.linha1; dados.linha2 = t.linha2; }
  return NextResponse.json(dados);
}
