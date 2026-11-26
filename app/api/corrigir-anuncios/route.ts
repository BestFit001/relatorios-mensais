import { NextResponse } from "next/server";
import { gerarTexto, provedoresConfigurados, resumirFalhas } from "../../../lib/iaProvedores";
import { MOTIVO_SEM_CHAVE } from "../../../lib/adaptarModelo";
import { limparDescricao } from "../../../lib/textoDescricao";
import { pedidoDescricaoDoModelo } from "../../../lib/comparacaoModelos";

// Correção de anúncios: a IA (Claude) só reescreve a DESCRIÇÃO do modelo para o anúncio; todo o resto (título, SEO, categoria,
// medidas) é calculado sem IA na tela. A tela manda poucos anúncios por vez para caber no tempo da função.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const PRAZO_IA_MS = 50000;
const MAX_TOKENS_DESCRICAO = 3000;
const MAX_ITENS = 4;

interface ItemEntrada { chave: string; descricaoModelo: string; trocas: { de: string; para: string }[]; marca: string }
interface ItemSaida { texto?: string; provedor?: string; motivo?: string }

export async function POST(req: Request) {
  try {
    const corpo = await req.json().catch(() => ({}));
    const itens: ItemEntrada[] = Array.isArray(corpo?.itens) ? corpo.itens.slice(0, MAX_ITENS) : [];
    if (itens.length === 0) return NextResponse.json({ error: "Nenhum anúncio para a IA reescrever." }, { status: 400 });

    const provedores = provedoresConfigurados();
    const resultados: Record<string, ItemSaida> = {};
    if (provedores.length === 0) {
      itens.forEach((i) => { resultados[String(i.chave)] = { motivo: MOTIVO_SEM_CHAVE }; });
      return NextResponse.json({ sucesso: true, resultados });
    }

    const prazoFinal = Date.now() + PRAZO_IA_MS;
    await Promise.all(itens.map(async (i) => {
      const chave = String(i.chave);
      const base = limparDescricao(String(i.descricaoModelo || ""));
      if (!base.trim()) { resultados[chave] = { motivo: "o modelo não tem descrição complementar" }; return; }
      const trocas = Array.isArray(i.trocas) ? i.trocas.map((t) => ({ de: String(t?.de ?? ""), para: String(t?.para ?? "") })).filter((t) => t.de) : [];
      const res = await gerarTexto(provedores, pedidoDescricaoDoModelo(base, trocas, String(i.marca || "Best Fit")), { prazoFinal, maxTokens: MAX_TOKENS_DESCRICAO });
      resultados[chave] = res.texto
        ? { texto: limparDescricao(res.texto), provedor: res.provedor || undefined }
        : { motivo: resumirFalhas(res.falhas) || "a IA devolveu uma resposta vazia" };
    }));
    return NextResponse.json({ sucesso: true, resultados });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro ao reescrever as descrições." }, { status: 500 });
  }
}
