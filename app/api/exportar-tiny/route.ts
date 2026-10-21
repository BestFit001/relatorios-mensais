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

    // Busca os produtos na tabela de pendentes
    const { data: produtos } = await supabase
      .from("produtos_pendentes")
      .select("*")
      .in("sku", skus);

    if (!produtos || produtos.length === 0) {
      return NextResponse.json({ error: "Produtos pendentes não encontrados." }, { status: 404 });
    }

    const linhasExportacao = [];

    for (const p of produtos) {
      // Busca a descrição gerada pela IA para este SKU no histórico
      const { data: hist } = await supabase
        .from("historico_descricoes_ia")
        .select("resposta_ia")
        .eq("sku", p.sku)
        .order("id", { ascending: false })
        .limit(1)
        .single();

      const descricaoFinal = hist?.resposta_ia || `Descrição padrão para ${p.produto}`;

      linhasExportacao.push({
        SKU: p.sku,
        "Nome do Produto": p.produto,
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
        "Descrição": descricaoFinal
      });
    }

    return NextResponse.json({ sucesso: true, dados: linhasExportacao });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}