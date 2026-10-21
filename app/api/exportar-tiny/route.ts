import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

function toTitleCase(str: string) {
  if (!str) return "";
  const lowercaseWords = ["de", "do", "da", "dos", "das", "e", "em", "por", "com", "para", "a", "o"];
  return str
    .toLowerCase()
    .split(" ")
    .map((word, index) => {
      if (index > 0 && lowercaseWords.includes(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
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
      return NextResponse.json({ error: "Nenhum SKU selecionado para exportação." }, { status: 400 });
    }

    const { data: produtos } = await supabase
      .from("produtos_pendentes")
      .select("*")
      .in("sku", skus);

    if (!produtos || produtos.length === 0) {
      return NextResponse.json({ error: "Produtos pendentes não encontrados." }, { status: 404 });
    }

    const paisUnicos = Array.from(
      new Set(produtos.map((p) => p.sku_pai || (p.sku.length > 5 ? p.sku.substring(0, 5) : p.sku)))
    );

    const linhasExportacao = [];

    for (const paiKey of paisUnicos) {
      const itensDoPai = produtos.filter((p) => (p.sku_pai || p.sku.substring(0, 5)) === paiKey);
      if (itensDoPai.length === 0) continue;

      const produtoBase = itensDoPai[0];
      const nomePaiRaw = produtoBase.produto.split("-")[0].trim();
      const nomePaiFormatado = toTitleCase(nomePaiRaw);
      const slugPai = gerarSlug(nomePaiFormatado);
      const palavrasChavePai = gerarPalavrasChave(nomePaiFormatado);

      // 1. Linha do Pai (Tipo do produto = V)
      linhasExportacao.push({
        "ID": "",
        "Código (SKU)": paiKey,
        "Descrição": `Confira ${nomePaiFormatado}, desenvolvido para garantir máximo conforto, estilo e alta durabilidade no seu dia a dia. Produto original Best Fit com excelente acabamento.`,
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
        "Descrição complementar": "",
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
        "Marca": produtoBase.marca || "BEST FIT",
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
        "Descrição SEO": `Compre ${nomePaiFormatado} na Best Fit. Qualidade superior, conforto e estilo para você. Garanta já o seu!`,
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
        "EX TIPI": ""
      });

      // 2. Linhas dos Filhos / Variações (Tipo do produto = S)
      for (const p of itensDoPai) {
        const { data: hist } = await supabase
          .from("historico_descricoes_ia")
          .select("resposta_ia")
          .eq("sku", p.sku)
          .order("id", { ascending: false })
          .limit(1)
          .single();

        const nomeFilhoFormatado = toTitleCase(p.produto);
        const slugFilho = gerarSlug(nomeFilhoFormatado);
        const palavrasChaveFilho = gerarPalavrasChave(nomeFilhoFormatado);

        const corFormatada = p.cor ? toTitleCase(String(p.cor).trim()) : "";
        const tamFormatado = p.tamanho ? String(p.tamanho).trim() : "";
        const variacaoFormatada = `Cor:${corFormatada}||Tamanho:${tamFormatado}||`;

        const descricaoPadrao = `O ${nomeFilhoFormatado} combina sofisticação, toque macio e caimento perfeito. Produzido com materiais de alta performance, é ideal para acompanhar você com total conforto em qualquer ocasião.\n\n• Cor: ${corFormatada}\n• Tamanho: ${tamFormatado}\n• Marca: ${p.marca || "Best Fit"}`;
        
        const descricaoFinal = hist?.resposta_ia || descricaoPadrao;

        linhasExportacao.push({
          "ID": "",
          "Código (SKU)": p.sku,
          "Descrição": descricaoFinal,
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
          "Descrição complementar": "",
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
          "URL imagem 4": "",
          "URL imagem 5": "",
          "URL imagem 6": "",
          "Categoria": "",
          "Código do pai": paiKey,
          "Variações": variacaoFormatada,
          "Marca": p.marca || "BEST FIT",
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
          "Descrição SEO": `Compre ${nomeFilhoFormatado} - Cor: ${corFormatada}, Tam: ${tamFormatado} na Best Fit. Conforto e qualidade garantidos.`,
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
          "EX TIPI": ""
        });
      }
    }

    return NextResponse.json({ sucesso: true, dados: linhasExportacao });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}