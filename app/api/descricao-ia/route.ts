import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { skuAlvo, sku, modo, prompt, imagemBase64, mimeType } = await req.json();

    // Tenta obter o SKU do campo específico ou extraí-lo automaticamente do texto digitado
    let skuFinal = skuAlvo || sku;
    if (!skuFinal && prompt) {
      const matchSku = prompt.match(/(?:sku[:\s]*)(\d+)/i) || prompt.match(/\b\d{4,6}\b/);
      if (matchSku) {
        skuFinal = matchSku[1] || matchSku[0];
      }
    }

    if (!skuFinal) {
      return NextResponse.json(
        { error: "SKU não informado. Preencha o campo 'SKU Alvo' no topo ou inclua o número do SKU na sua mensagem." },
        { status: 400 }
      );
    }

    // Procura o produto nas tabelas de pendentes ou realizados
    let { data: produto } = await supabase
      .from("produtos_pendentes")
      .select("*")
      .eq("sku", skuFinal)
      .single();

    if (!produto) {
      const { data: produtoCadastrado } = await supabase
        .from("produtos_novos_cadastrados")
        .select("*")
        .eq("sku", skuFinal)
        .single();
      produto = produtoCadastrado;
    }

    if (!produto) {
      return NextResponse.json(
        { error: `Produto com SKU ${skuFinal} não encontrado na base de dados.` },
        { status: 404 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    let respostaIA = "";

    if (apiKey) {
      const ai = new GoogleGenAI({ apiKey });
      const contents: any[] = [];

      if (imagemBase64) {
        contents.push({
          inlineData: {
            data: imagemBase64,
            mimeType: mimeType || "image/jpeg",
          },
        });
      }

      const contextoProduto = `Informações do Produto:\n- SKU: ${produto.sku}\n- Nome: ${produto.produto}\n- Marca: ${produto.marca || "Best Fit"}\n- Cor: ${produto.cor || "N/A"}\n- Tamanho: ${produto.tamanho || "N/A"}`;
      
      const instrucao = modo === "treinar"
        ? `Modo de Treinamento/Correção. O usuário enviou o seguinte feedback/instrução para ajustar a regra de descrição deste produto: "${prompt}". Atualize a estrutura e gere o texto padronizado aplicando esta correção de forma estrita.`
        : `Gere uma descrição de e-commerce profissional, detalhada e padronizada para este produto, baseada na instrução: "${prompt || 'Gerar descrição padrão'}".`;

      contents.push(`${contextoProduto}\n\n${instrucao}`);

      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: contents,
        });
        respostaIA = response.text || "";
      } catch (e) {
        respostaIA = "";
      }
    }

    if (!respostaIA) {
      respostaIA = [
        `O ${produto.produto} combina sofisticação, toque macio e caimento perfeito. Produzido com materiais de alta performance, é ideal para acompanhar você com total conforto e estilo em qualquer ocasião.`,
        "",
        "Especificações:",
        `- Marca: ${produto.marca || "Best Fit"}.`,
        `- Modelo: ${produto.produto}.`,
        produto.cor ? `- Cor: ${produto.cor}.` : "",
        produto.tamanho ? `- Tamanho: ${produto.tamanho}.` : "",
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
      ].filter(Boolean).join("\n");
    }

    return NextResponse.json({
      sucesso: true,
      resposta: respostaIA,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}