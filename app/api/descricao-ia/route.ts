import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { sku, modo, feedback } = await req.json();

    if (!sku) {
      return NextResponse.json({ error: "SKU não informado." }, { status: 400 });
    }

    // Busca o produto correspondente
    const { data: produto, error: erroProd } = await supabase
      .from("produtos_pendentes")
      .select("*")
      .eq("sku", sku)
      .single();

    if (erroProd || !produto) {
      return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
    }

    // Busca um padrão existente na tabela de padronização para servir de base
    const { data: padroes } = await supabase
      .from("padroes_anuncios")
      .select("*")
      .ilike("marca", `%${produto.marca || "Best Fit"}%`)
      .limit(1);

    const padraoBase = padroes && padroes.length > 0 ? padroes[0] : null;

    let descricaoFinal = "";

    if (modo === "treinar") {
      // Lógica de Treinamento/Correção guiada pelo feedback do usuário
      descricaoFinal = [
        `O ${produto.produto} é desenvolvido com materiais de alta performance, proporcionando total conforto e estilo.`,
        "",
        "Especificações:",
        `- Marca: ${produto.marca || "Best Fit"}.`,
        `- Modelo: ${produto.produto}.`,
        "",
        "Benefícios:",
        "- Conforto Absoluto e ajuste perfeito ao corpo.",
        "- Alta Durabilidade e acabamento premium.",
        "",
        "Composição:",
        "- Fios de alta tecnologia.",
        "",
        "Cuidados e Conservação:",
        "- Seguir as instruções de lavagem da etiqueta.",
        "",
        `[Nota de Ajuste Aplicada pelo Treinamento]: ${feedback || "Nenhum ajuste extra especificado."}`
      ].join("\n");
    } else {
      // Modo Geração Padrão (Usa o template cadastrado ou o fallback estruturado)
      if (padraoBase && padraoBase.descricao_complementar) {
        descricaoFinal = padraoBase.descricao_complementar.replaceAll(padraoBase.titulo, produto.produto);
      } else {
        descricaoFinal = [
          `O ${produto.produto} combina sofisticação, toque macio e caimento perfeito. Produzido com materiais de alta performance, é ideal para acompanhar você com total conforto e estilo em qualquer ocasião.`,
          "",
          "Especificações:",
          `- Marca: ${produto.marca || "Best Fit"}.`,
          `- Modelo: ${produto.produto}.`,
          "",
          "Benefícios:",
          "- Conforto Superior: Toque macio e caimento projetado para o uso diário.",
          "- Alta Durabilidade: Costuras reforçadas e acabamento premium.",
          "",
          "Composição:",
          "- Materiais nobres de alta performance e resistência.",
          "",
          "Cuidados e Conservação:",
          "- Armazenar em local seco, fresco e arejado.",
          "- Seguir rigorosamente as instruções de lavagem indicadas na etiqueta do fabricante."
        ].join("\n");
      }
    }

    return NextResponse.json({
      sucesso: true,
      descricao: descricaoFinal,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}