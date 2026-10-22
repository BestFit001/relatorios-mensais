import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

function toTitleCase(str: string) {
  if (!str) return "";
  const lowercaseWords = ["de", "do", "da", "dos", "das", "e", "em", "por", "com", "para", "a", "o"];
  return str
    .toLowerCase()
    .replace(/\\?vert(\{[^}]*\})?|ert\{[^}]*\}|[\r\n\t\v]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word, index) => {
      if (index > 0 && lowercaseWords.includes(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function limparTextoEstrito(str: string) {
  if (!str) return "";
  return String(str)
    .replace(/\\?vert(\{[^}]*\})?|ert\{[^}]*\}|[\r\n\t\v_x000b_]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function gerarSlug(str: string) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function gerarPalavrasChave(titulo: string) {
  if (!titulo) return "";
  const base = toTitleCase(titulo);
  return `${base},${base} Confortável,${base} Original Best Fit,Moda Fitness e Casual`;
}

export async function POST(req: Request) {
  try {
    const { skus } = await req.json();

    if (!skus || skus.length === 0) {
      return NextResponse.json(
        { error: "Nenhum SKU selecionado para exportação." },
        { status: 400 }
      );
    }

    const { data: produtos, error: erroProdutos } = await supabase
      .from("produtos_pendentes")
      .select("*")
      .in("sku", skus);

    if (erroProdutos) throw erroProdutos;

    if (!produtos || produtos.length === 0) {
      return NextResponse.json(
        { error: "Produtos pendentes não encontrados." },
        { status: 404 }
      );
    }

    const { data: padroesOficiais } = await supabase
      .from("padroes_anuncios")
      .select("titulo, descricao_complementar")
      .limit(3);

    const { data: historicoTreinamentos } = await supabase
      .from("historico_descricoes_ia")
      .select("prompt_usuario, resposta_ia")
      .order("id", { ascending: false })
      .limit(4);

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

    const paisUnicos = Array.from(
      new Set(
        produtos.map((p) =>
          p.sku_pai ||
          (p.sku.length > 5 ? p.sku.substring(0, 5) : p.sku)
        )
      )
    );

    const linhasExportacao: Record<string, string | number>[] = [];

    for (const paiKey of paisUnicos) {
      const itensDoPai = produtos.filter(
        (p) =>
          (p.sku_pai ||
            (p.sku.length > 5 ? p.sku.substring(0, 5) : p.sku)) === paiKey
      );

      if (itensDoPai.length === 0) continue;

      const produtoBase = itensDoPai[0];
      const nomePaiRaw = limparTextoEstrito(
        String(produtoBase.produto || "").split("-")[0]
      );
      const nomePaiFormatado = toTitleCase(nomePaiRaw);
      const slugPai = gerarSlug(nomePaiFormatado);
      const palavrasChavePai = gerarPalavrasChave(nomePaiFormatado);
      const marcaPai = produtoBase.marca || "Best Fit";

      // Função com raciocínio lógico avançado para a IA analisar o produto real
      async function gerarDescricaoComLogica(nomeItem: string, corItem: string, tamItem: string) {
        const { data: histSku } = await supabase
          .from("historico_descricoes_ia")
          .select("resposta_ia")
          .eq("sku", produtoBase.sku)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (histSku?.resposta_ia) {
          return histSku.resposta_ia;
        }

        if (ai) {
          try {
            let contexto = `Você é um analista de e-commerce sênior da Best Fit. Sua tarefa é ler o padrão existente na base, cruzar com o produto real que está a ser cadastrado e aplicar LÓGICA CRÍTICA.
REGRAS DE RACIOCÍNIO OBRIGATÓRIAS:
1. Identifique o nome real e a estampa/tema do produto atual (ex: se o título diz "Sorvete", substitua qualquer menção a estampas antigas como "cavalo marinho" ou "florido" pelo tema correto do Sorvete).
2. Adapte o contexto visual de forma coerente (ex: se o produto é de sorvete, ajuste os detalhes visuais da descrição para refletir essa temática, mantendo a essência comercial).
3. Preserve os pilares técnicos de qualidade que vierem do padrão (ex: proteção solar UV50+, toque macio, conforto e instruções de lavagem).
4. Nunca traga nomes cruzados ou errados de outros produtos. A descrição tem de pertencer exclusivamente ao produto atual.
\n\n`;

            if (padroesOficiais && padroesOficiais.length > 0) {
              contexto += "Padrão de Referência da Base:\n";
              padroesOficiais.forEach(p => {
                contexto += `- ${p.descricao_complementar}\n`;
              });
            }

            if (historicoTreinamentos && historicoTreinamentos.length > 0) {
              contexto += "\nHistórico de Correções e Aprendizados do Chat:\n";
              historicoTreinamentos.forEach(h => {
                contexto += `- ${h.prompt_usuario}\n`;
              });
            }

            const promptFinal = `${contexto}\n\nAplique a lógica analítica e gere a descrição complementar perfeita para:\n- Nome / Tema Real: ${nomeItem}\n- Marca: ${marcaPai}\n- Cor: ${corItem || "Não informada"}\n- Tamanho: ${tamItem || "Não informado"}`;

            const response = await ai.models.generateContent({
              model: "gemini-3.8-flash",
              contents: [promptFinal],
            });

            if (response.text) return response.text;
          } catch (err) {
            console.error("Erro na lógica da IA:", err);
          }
        }

        return [
          `O ${nomeItem} foi desenvolvido para proporcionar momentos inesquecíveis sob o sol com máxima segurança e estilo.`,
          "",
          "Especificações:",
          `- Marca: ${marcaPai}.`,
          `- Modelo: ${nomeItem}.`,
          corItem ? `- Cor: ${corItem}.` : "",
          tamItem ? `- Tamanho: ${tamItem}.` : "",
          "",
          "Benefícios:",
          "- Conforto Superior: Toque macio e caimento projetado para o uso diário.",
          "- Alta Durabilidade: Costuras reforçadas e acabamento premium.",
          "",
          "Composição:",
          "- Materiais nobres de alta performance e resistência.",
          "",
          "Cuidados e Conservação:",
          "- Seguir rigorosamente as instruções de lavagem indicadas na etiqueta do fabricante."
        ].filter(Boolean).join("\n");
      }

      const descricaoComplementarPai = await gerarDescricaoComLogica(nomePaiFormatado, "", "");

      // 1. Produto Pai (Tipo do produto = V)
      linhasExportacao.push({
        "ID": "",
        "Código (SKU)": paiKey,
        "Descrição": nomePaiFormatado,
        "Unidade": "UN",
        "Classificação fiscal": produtoBase.ncm || "",
        "Origem": produtoBase.origem || "0",
        "Preço": produtoBase.preco_venda || 0,
        "Valor IPI fixo": 0,
        "Observações": "",
        "Situação": "Ativo",
        "Estoque": "",
        "Preço de custo": produtoBase.custo || 0,
        "Cód do Fornecedor": "",
        "Fornecedor": "",
        "Localização": "",
        "Estoque máximo": "",
        "Estoque mínimo": "",
        "Peso líquido (Kg)": "0.500",
        "Peso bruto (Kg)": "0.500",
        "GTIN/EAN": "",
        "GTIN/EAN tributável": "",
        "Descrição complementar": descricaoComplementarPai,
        "CEST": produtoBase.cest || "",
        "Código de Enquadramento IPI": "",
        "Formato embalagem": "",
        "Largura embalagem": "20",
        "Altura embalagem": "20",
        "Comprimento embalagem": "20",
        "Diâmetro embalagem": "",
        "Tipo do produto": "V",
        "URL imagem 1": "",
        "URL imagem 2": "",
        "URL imagem 3": "",
        "URL imagem 4": "",
        "URL imagem 5": "",
        "URL imagem 6": "",
        "Categoria": "",
        "Código do pai": "",
        "Variações": "",
        "Marca": marcaPai,
        "Garantia": "30 dias",
        "Sob encomenda": "Não",
        "Preço promocional": "",
        "URL imagem externa 1": "",
        "URL imagem externa 2": "",
        "URL imagem externa 3": "",
        "URL imagem externa 4": "",
        "URL imagem externa 5": "",
        "URL imagem externa 6": "",
        "Link do vídeo": "",
        "Título SEO": nomePaiFormatado,
        "Descrição SEO": `Compre ${nomePaiFormatado} na ${marcaPai}. Qualidade superior, conforto e estilo para você. Garanta já o seu!`,
        "Palavras chave SEO": palavrasChavePai,
        "Slug": slugPai,
        "Dias para preparação": "0",
        "Controlar lotes": "Não",
        "Unidade por caixa": "",
        "URL imagem externa 7": "",
        "URL imagem externa 8": "",
        "URL imagem externa 9": "",
        "URL imagem externa 10": "",
        "Markup": "",
        "Permitir inclusão nas vendas": "Sim",
        "EX TIPI": "",
      });

      // 2. Produtos Filhos / Variações (Tipo do produto = S)
      for (const p of itensDoPai) {
        const nomeFilhoRaw = limparTextoEstrito(p.produto || "");
        const nomeFilhoFormatado = toTitleCase(nomeFilhoRaw);
        const slugFilho = gerarSlug(nomeFilhoFormatado);
        const palavrasChaveFilho = gerarPalavrasChave(nomeFilhoFormatado);
        const marcaFilho = p.marca || "Best Fit";

        const corFormatada = p.cor ? toTitleCase(limparTextoEstrito(p.cor)) : "";
        const tamFormatado = p.tamanho ? limparTextoEstrito(String(p.tamanho)) : "";
        const variacaoFormatada = `Cor:${corFormatada}||Tamanho:${tamFormatado}||`;

        const descricaoComplementarFinal = await gerarDescricaoComLogica(nomeFilhoFormatado, corFormatada, tamFormatado);

        linhasExportacao.push({
          "ID": "",
          "Código (SKU)": p.sku,
          "Descrição": nomeFilhoFormatado,
          "Unidade": "UN",
          "Classificação fiscal": p.ncm || "",
          "Origem": p.origem || "0",
          "Preço": p.preco_venda || 0,
          "Valor IPI fixo": 0,
          "Observações": "",
          "Situação": "Ativo",
          "Estoque": "",
          "Preço de custo": p.custo || 0,
          "Cód do Fornecedor": "",
          "Fornecedor": "",
          "Localização": "",
          "Estoque máximo": "",
          "Estoque mínimo": "",
          "Peso líquido (Kg)": "0.500",
          "Peso bruto (Kg)": "0.500",
          "GTIN/EAN": p.ean || "",
          "GTIN/EAN tributável": p.ean || "",
          "Descrição complementar": descricaoComplementarFinal,
          "CEST": p.cest || "",
          "Código de Enquadramento IPI": "",
          "Formato embalagem": "",
          "Largura embalagem": "20",
          "Altura embalagem": "20",
          "Comprimento embalagem": "20",
          "Diâmetro embalagem": "",
          "Tipo do produto": "S",
          "URL imagem 1": "",
          "URL imagem 2": "",
          "URL imagem 3": "",
          "URL imagem>",
          "URL imagem 4": "",
          "URL imagem 5": "",
          "URL imagem 6": "",
          "Categoria": "",
          "Código do pai": paiKey,
          "Variações": variacaoFormatada,
          "Marca": marcaFilho,
          "Garantia": "30 dias",
          "Sob encomenda": "Não",
          "Preço promocional": "",
          "URL imagem externa 1": "",
          "URL imagem externa 2": "",
          "URL imagem externa 3": "",
          "URL imagem externa 4": "",
          "URL imagem externa 5": "",
          "URL imagem externa 6": "",
          "Link do vídeo": "",
          "Título SEO": nomeFilhoFormatado,
          "Descrição SEO": `Compre ${nomeFilhoFormatado} - Cor: ${corFormatada}, Tam: ${tamFormatado} na ${marcaFilho}. Conforto e qualidade garantidos.`,
          "Palavras chave SEO": palavrasChaveFilho,
          "Slug": slugFilho,
          "Dias para preparação": "0",
          "Controlar lotes": "Não",
          "Unidade por caixa": "",
          "URL imagem externa 7": "",
          "URL imagem externa 8": "",
          "URL imagem externa 9": "",
          "URL imagem externa 10": "",
          "Markup": "",
          "Permitir inclusão nas vendas": "Sim",
          "EX TIPI": "",
        });
      }
    }

    return NextResponse.json({
      sucesso: true,
      dados: linhasExportacao,
    });
  } catch (error: unknown) {
    console.error("Erro ao exportar produtos:", error);
    const mensagem =
      error instanceof Error ? error.message : "Erro interno ao exportar os produtos.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}