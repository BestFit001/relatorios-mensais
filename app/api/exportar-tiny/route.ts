import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

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

    // Agrupa por SKU Pai (5 primeiros dígitos)
    const paisUnicos = Array.from(
      new Set(produtos.map((p) => p.sku_pai || (p.sku.length > 5 ? p.sku.substring(0, 5) : p.sku)))
    );

    const linhasExportacao = [];

    for (const paiKey of paisUnicos) {
      const itensDoPai = produtos.filter((p) => (p.sku_pai || p.sku.substring(0, 5)) === paiKey);
      if (itensDoPai.length === 0) continue;

      const produtoBase = itensDoPai[0];
      const nomePai = produtoBase.produto.split("-")[0].trim();

      // 1. Linha do Pai com as colunas exatas até EX TIPI (Coluna BK)
      linhasExportacao.push({
        "": "", // Coluna A em branco
        "SKU": paiKey,
        "ID": "",
        "Código Pai": "",
        "Nome do Produto": nomePai,
        "Tipo": "P",
        "Unidade": "UN",
        "NCM": produtoBase.ncm || "",
        "CEST": produtoBase.cest || "",
        "Origem": produtoBase.origem || "0",
        "Preço": produtoBase.preco_venda || 0,
        "Preço Promocional": "",
        "Custo": produtoBase.custo || 0,
        "Custo Médio": "",
        "Peso Líquido": "0,500",
        "Peso Bruto": "0,500",
        "Largura": "20",
        "Altura": "20",
        "Comprimento": "20",
        "Volume": "",
        "Estoque Atual": "",
        "Estoque Mínimo": "",
        "Estoque Máximo": "",
        "Localização": "Geral",
        "Situação": "Ativo",
        "EAN": "", // EAN em branco no Pai
        "GTIN": "",
        "GTIN Embalagem": "",
        "Marca": produtoBase.marca || "BEST FIT",
        "Categoria": "",
        "Garantia": "",
        "Observações": "",
        "Descrição": `Descrição padrão para ${nomePai}`,
        "SEO - Título": "",
        "SEO - Descrição": "",
        "SEO - Palavras-chave": "",
        "SEO - Slug": "",
        "Dias Preparação": "0",
        "Controlar Estoque": "Não",
        "Exibir E-commerce": "Sim",
        "Produto Composto": "Não",
        "Free": "",
        "Unidade de medida": "UN",
        "Altura embalagem": "20",
        "Largura embalagem": "20",
        "Comprimento embalagem": "20",
        "Diametro": "",
        "Garantia descrição": "",
        "Vídeo": "",
        "Cross-docking": "0",
        "Sob encomenda": "Não",
        "Localização física": "",
        "Estoque máximo": "",
        "Estoque mínimo": "",
        "controlar por lote": "Não",
        "Classe de enquadramento IPI": "",
        "Código da lista de serviços": "",
        "Código de enquadramento do IPI": "",
        "Código do gênero": "",
        "Código do serviço": "",
        "Código IBPT": "",
        "Código origem": "",
        "Código pai do serviço": "",
        "Condição do produto": "Não especificado",
        "Controlar estoque": "Não",
        "Custo unitário": produtoBase.custo || 0,
        "Dias preparação": "0",
        "Estoque atual": "",
        "Exibir no e-commerce": "Sim",
        "Frete grátis": "Não",
        "Permitir inclusão de observações no pedido": "Sim",
        "EX TIPI": ""
      });

      // 2. Linhas de cada Filho (Variação) com as colunas exatas até EX TIPI (Coluna BK)
      for (const p of itensDoPai) {
        const { data: hist } = await supabase
          .from("historico_descricoes_ia")
          .select("resposta_ia")
          .eq("sku", p.sku)
          .order("id", { ascending: false })
          .limit(1)
          .single();

        const descricaoFinal = hist?.resposta_ia || `Descrição detalhada para ${p.produto} - Cor: ${p.cor}, Tam: ${p.tamanho}`;

        linhasExportacao.push({
          "": "", // Coluna A em branco
          "SKU": p.sku,
          "ID": "",
          "Código Pai": paiKey,
          "Nome do Produto": p.produto,
          "Tipo": "V",
          "Unidade": "UN",
          "NCM": p.ncm || "",
          "CEST": p.cest || "",
          "Origem": p.origem || "0",
          "Preço": p.preco_venda || 0,
          "Preço Promocional": "",
          "Custo": p.custo || 0,
          "Custo Médio": "",
          "Peso Líquido": "0,500",
          "Peso Bruto": "0,500",
          "Largura": "20",
          "Altura": "20",
          "Comprimento": "20",
          "Volume": "",
          "Estoque Atual": "",
          "Estoque Mínimo": "",
          "Estoque Máximo": "",
          "Localização": "Geral",
          "Situação": "Ativo",
          "EAN": p.ean || "", // EAN preenchido apenas no filho
          "GTIN": p.ean || "",
          "GTIN Embalagem": "",
          "Marca": p.marca || "BEST FIT",
          "Categoria": "",
          "Garantia": "",
          "Observações": "",
          "Descrição": descricaoFinal,
          "SEO - Título": "",
          "SEO - Descrição": "",
          "SEO - Palavras-chave": "",
          "SEO - Slug": "",
          "Dias Preparação": "0",
          "Controlar Estoque": "Não",
          "Exibir E-commerce": "Sim",
          "Produto Composto": "Não",
          "Free": "",
          "Unidade de medida": "UN",
          "Altura embalagem": "20",
          "Largura embalagem": "20",
          "Comprimento embalagem": "20",
          "Diametro": "",
          "Garantia descrição": "",
          "Vídeo": "",
          "Cross-docking": "0",
          "Sob encomenda": "Não",
          "Localização física": "",
          "Estoque máximo": "",
          "Estoque mínimo": "",
          "controlar por lote": "Não",
          "Classe de enquadramento IPI": "",
          "Código da lista de serviços": "",
          "Código de enquadramento do IPI": "",
          "Código do gênero": "",
          "Código do serviço": "",
          "Código IBPT": "",
          "Código origem": "",
          "Código pai do serviço": "",
          "Condição do produto": "Não especificado",
          "Controlar estoque": "Não",
          "Custo unitário": p.custo || 0,
          "Dias preparação": "0",
          "Estoque atual": "",
          "Exibir no e-commerce": "Sim",
          "Frete grátis": "Não",
          "Permitir inclusão de observações no pedido": "Sim",
          "EX TIPI": ""
        });
      }
    }

    return NextResponse.json({ sucesso: true, dados: linhasExportacao });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}