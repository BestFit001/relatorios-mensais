import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { skuAlvo, sku, modo, prompt, imagemBase64, mimeType } = await req.json();

    let skuFinal = skuAlvo || sku;
    if (!skuFinal && prompt) {
      const matchSku = prompt.match(/(?:sku[:\s]*)(\d+)/i) || prompt.match(/\b\d{4,6}\b/);
      if (matchSku) {
        skuFinal = matchSku[1] || matchSku[0];
      }
    }

    if (!skuFinal) {
      return NextResponse.json(
        { error: "SKU não informado. Preencha o campo 'SKU Alvo' ou informe o SKU no texto." },
        { status: 400 }
      );
    }

    // Busca o produto
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

    // 1. Busca os padrões oficiais homologados na base
    const { data: padroesOficiais } = await supabase
      .from("padroes_anuncios")
      .select("titulo, descricao_complementar")
      .limit(5);

    // 2. Busca o histórico recente de feedbacks de treinamento/correção do chat para acumular inteligência
    const { data: historicoTreinamentos } = await supabase
      .from("historico_descricoes_ia")
      .select("prompt_usuario, resposta_ia")
      .order("id", { ascending: false })
      .limit(6);

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

      // Constrói o contexto acumulado com os padrões da base e o aprendizado contínuo do chat
      let contextoAcumulado = "DIRETRIZES DE APRENDIZAGEM E PADRÃO DE QUALIDADE (Best Fit):\n";

      if (padroesOficiais && padroesOficiais.length > 0) {
        contextoAcumulado += "\n--- Padrões Oficiais Homologados ---\n";
        padroesOficiais.forEach((p, idx) => {
          contextoAcumulado += `[Padrão ${idx + 1}]:\n${p.descricao_complementar}\n`;
        });
      }

      if (historicoTreinamentos && historicoTreinamentos.length > 0) {
        contextoAcumulado += "\n--- Histórico de Treinamentos e Correções Anteriores do Chat ---\n";
        historicoTreinamentos.forEach((h, idx) => {
          contextoAcumulado += `Correção ${idx + 1} -> Instrução: "${h.prompt_usuario}"\n`;
        });
      }

      const infoProduto = `\nProduto Atual a Processar:\n- SKU: ${produto.sku}\n- Nome: ${produto.produto}\n- Marca: ${produto.marca || "Best Fit"}\n- Cor: ${produto.cor || "N/A"}\n- Tamanho: ${produto.tamanho || "N/A"}`;
      
      const instrucaoFinal = modo === "treinar"
        ? `[MODO TREINAMENTO]: O usuário aplicou a seguinte instrução de refinamento: "${prompt}". Atualize a diretriz para este produto aplicando rigorosamente esta melhoria.`
        : `Gere a descrição otimizada para este produto utilizando a fusão perfeita entre os Padrões Oficiais e as Correções Recentes do chat, garantindo uma copy de alta conversão e alinhada ao Tiny.`;

      contents.push(`${contextoAcumulado}\n${infoProduto}\n\n${instrucaoFinal}`);

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