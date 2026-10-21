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

    // Agrupa por SKU Pai para estruturar Pai -> Filhos
    const agrupadosPorPai: { [pai: string]: any[] } = {};
    produtos.forEach((p) => {
      const pai = p.sku_pai || p.sku.substring(0, 5);
      if (!agrupadosPorPai[pai]) agrupadosPorPai[pai] = [];
      agrupadosPorPai[pai].push(p);
    });

    const linhasExportacao = [];

    for (const [paiKey, itens] of Object.entries(agrupadosPorPai)) {
      // 1. Linha do Pai
      linhasExportacao.push({
        "": "", // Primeira coluna em branco
        SKU: paiKey,
        "Nome do Produto": itens[0].produto.split("-")[0].trim(),
        "Tipo": "P", // Produto Pai
        "Unidade": "UN",
        "NCM": itens[0].ncm || "",
        "CEST": itens[0].cest || "",
        "Origem": "0",
        "Preço": itens[0].preco_venda || 0,
        "Custo": itens[0].custo || 0,
        "Peso Líquido": "0,500",
        "Peso Bruto": "0,500",
        "Largura": "20",
        "Altura": "20",
        "Comprimento": "20",
        "Situação": "Ativo",
        "EAN": "", // Pai sem EAN
        "Descrição": `Descrição padrão para ${itens[0].produto}`
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
          "": "", // Primeira coluna em branco
          SKU: p.sku,
          "Nome do Produto": `${p.produto} ${p.cor ? `- ${p.cor}` : ""} ${p.tamanho ? `- ${p.tamanho}` : ""}`,
          "Tipo": "V", // Variação / Filho
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
          "EAN": p.ean || "", // EAN apenas no filho
          "Descrição": descricaoFinal
        });
      }
    }

    return NextResponse.json({ sucesso: true, dados: linhasExportacao });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}