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

    // Agrupa por SKU Pai (5 primeiros dígitos ou sku_pai)
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

      // 1. Linha do Pai (Estrutura exata para o Tiny)
      linhasExportacao.push({
        "": "", // Coluna A estritamente em branco
        SKU: paiKey,
        "Nome do Produto": nomePai,
        "Tipo": "P", // Pai
        "Unidade": "UN",
        "NCM": produtoBase.ncm || "",
        "CEST": produtoBase.cest || "",
        "Origem": "0",
        "Preço": produtoBase.preco_venda || 0,
        "Custo": produtoBase.custo || 0,
        "Peso Líquido": "0,500",
        "Peso Bruto": "0,500",
        "Largura": "20",
        "Altura": "20",
        "Comprimento": "20",
        "Situação": "Ativo",
        "EAN": "", // EAN em branco no Pai
        "Descrição": `Descrição padrão para ${nomePai}`
      });

      // 2. Linhas dos Filhos (Variações)
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
          "": "", // Coluna A estritamente em branco
          SKU: p.sku, // SKU original completo do filho
          "Nome do Produto": `${p.produto} ${p.cor ? `- ${p.cor}` : ""} ${p.tamanho ? `- ${p.tamanho}` : ""}`,
          "Tipo": "V", // Variação (Filho)
          "Unidade": "UN",
          "NCM": p.ncm || "",
          "CEST": p.cest || "",
          "Origem": "0",
          "Preço": p.preco_venda || 0,
          "Custo": p.custo || 0,
          "Peso Líquido": "0,500",
          "Peso Bruto": "0,500",
          "Largura": "20",
          "Altura": "20",
          "Comprimento": "20",
          "Situação": "Ativo",
          "EAN": p.ean || "", // EAN preenchido apenas no filho
          "Descrição": descricaoFinal
        });
      }
    }

    return NextResponse.json({ sucesso: true, dados: linhasExportacao });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}