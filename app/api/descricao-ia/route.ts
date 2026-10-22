import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { skuAlvo, sku, modo, prompt, imagemBase64, mimeType, skuReferencia } = await req.json();

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

    // --- BUSCA INTELIGENTE AUTOMÁTICA POR SIMILARIDADE ---
    let padraoBase = null;

    // 1. Se foi passado um SKU de referência manual, tenta buscá-lo primeiro
    if (skuReferencia) {
      const { data: padraoRef } = await supabase
        .from("historico_descricoes_ia")
        .select("resposta_ia")
        .eq("sku", skuReferencia)
        .order("id", { ascending: false })
        .limit(1)
        .single();
      if (padraoRef) padraoBase = padraoRef.resposta_ia;
    }

    // 2. Se não encontrou por referência manual, busca automaticamente na tabela de padrões por palavras-chave do nome
    if (!padraoBase) {
      const { data: todosPadroes } = await supabase
        .from("padroes_anuncios")
        .select("*");

      if (todosPadroes && todosPadroes.length > 0) {
        // Extrai palavras significativas do nome do produto (ex: remove preposições e pega termos maiores que 3 letras)
        const nomeProdutoLower = (produto.produto || "").toLowerCase();
        const palavrasChave = nomeProdutoLower.split(/\s+/).filter((w: string) => w.length > 3);

        let melhorMatch: any = null;
        let maiorPontuacao = -1;

        for (const padrao of todosPadroes) {
          const tituloPadrao = (padrao.titulo || "").toLowerCase();
          let pontuacao = 0;
          for (const palavra of palavrasChave) {
            if (tituloPadrao.includes(palavra)) pontuacao++;
          }
          if (pontuacao > maiorPontuacao) {
            maiorPontuacao = pontuacao;
            melhorMatch = padrao;
          }
        }

        // Se encontrou um match relevante por semelhança, usa-o como base
        if (melhorMatch && maiorPontuacao > 0) {
          padraoBase = melhorMatch.descricao_complementar;
        } else {
          // Fallback para o primeiro padrão genérico da marca ou da tabela
          padraoBase = todosPadroes[0].descricao_complementar;
        }
      }
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

      const contextoProduto = `Informações do Novo Produto:\n- SKU: ${produto.sku}\n- Nome: ${produto.produto}\n- Marca: ${produto.marca || "Best Fit"}\n- Cor: ${produto.cor || "N/A"}\n- Tamanho: ${produto.tamanho || "N/A"}`;
      const baseReferencia = padraoBase ? `\n\nPadrão de Descrição Homologado/Referência Encontrado na Base para este tipo de produto:\n${padraoBase}` : "";
      
      const instrucao = modo === "treinar"
        ? `Modo de Treinamento/Correção. Instrução do usuário: "${prompt}". Ajuste a estrutura aplicando esta regra.`
        : `Gere a descrição otimizada para este novo produto utilizando obrigatoriamente a estrutura e o tom do Padrão de Referência acima (se houver), adaptando o nome e as especificações para o novo item.`;

      contents.push(`${contextoProduto}${baseReferencia}\n\n${instrucao}`);

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

    if (!respostaIA && padraoBase) {
      // Substitui o título do padrão antigo pelo nome do novo produto caso a IA falhe
      respostaIA = padraoBase;
    } else if (!respostaIA) {
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