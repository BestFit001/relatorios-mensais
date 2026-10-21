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

    // Agrupa por SKU Pai para gerar Pai e Filhos na proporção exata
    const agrupadosPorPai: { [pai: string]: any[] } = {};
    produtos.forEach((p) => {
      const pai = p.sku_pai || (p.sku.length > 5 ? p.sku.substring(0, 5) : p.sku);
      if (!agrupadosPorPai[pai]) agrupadosPorPai[pai] = [];
      agrupadosPorPai[pai].push(p);
    });

    const linhasExportacao = [];

    for (const [paiKey, itens] of Object.entries(agrupadosPorPai)) {
      const produtoBase = itens[0];
      const nomePai = produtoBase.produto.split("-")[0].trim();

      // 1. Linha do Pai
      linhasExportacao.push({
        "": "", // Coluna A em branco
        "SKU": paiKey,
        "Nome do Produto": nomePai,
        "Cor ": "",
        "Tamanho ": "",
        "Origem": produtoBase.origem || "0-Nacional",
        "NCM": produtoBase.ncm || "",
        "CEST": produtoBase.cest || "",
        "EAN": "", // EAN em branco no Pai
        "Custo": produtoBase.custo || 0,
        "Preço Venda": produtoBase.preco_venda || 0,
        "Dimensões e Peso": produtoBase.dimensoes || "",
        "Marca": produtoBase.marca || "BEST FIT",
        "Tabela de Medida": produtoBase.tabela_medida || "",
        "QTDD ECOM": produtoBase.qtdd_ecom || 0,
        "QTDD FBA": 0,
        "Ativo": "Não",
        "Data envio compras ": "",
        "código": paiKey,
        "OBSERVAÇÕES": ""
      });

      // 2. Linhas de TODOS os Filhos (Garante que cada produto selecionado gera a sua linha)
      for (const p of itens) {
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
          "Nome do Produto": p.produto,
          "Cor ": p.cor || "",
          "Tamanho ": p.tamanho || "",
          "Origem": p.origem || "0-Nacional",
          "NCM": p.ncm || "",
          "CEST": p.cest || "",
          "EAN": p.ean || "", // EAN preenchido apenas no filho
          "Custo": p.custo || 0,
          "Preço Venda": p.preco_venda || 0,
          "Dimensões e Peso": p.dimensoes || "",
          "Marca": p.marca || "BEST FIT",
          "Tabela de Medida": p.tabela_medida || "",
          "QTDD ECOM": p.qtdd_ecom || 0,
          "QTDD FBA": 0,
          "Ativo": "Não",
          "Data envio compras ": "",
          "código": p.sku,
          "OBSERVAÇÕES": descricaoFinal
        });
      }
    }

    return NextResponse.json({ sucesso: true, dados: linhasExportacao });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}