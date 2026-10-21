import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { prompt, skuAlvo, skuReferencia, imagemBase64, mimeType } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY não configurada nas variáveis de ambiente." }, { status: 500 });
    }

    let dadosProdutoAlvo: any = null;
    let textoReferencia: string = "";

    if (skuAlvo) {
      const { data } = await supabase
        .from("produtos_pendentes")
        .select("*")
        .eq("sku", skuAlvo)
        .single();
      if (data) dadosProdutoAlvo = data;
    }

    if (skuReferencia) {
      const { data } = await supabase
        .from("historico_descricoes_ia")
        .select("resposta_ia")
        .eq("sku", skuReferencia)
        .order("id", { ascending: false })
        .limit(1)
        .single();
      if (data) textoReferencia = data.resposta_ia;
    }

    const padraoEstrutura = `
Siga estritamente esta estrutura de quebras de linha e seções, SEM USAR NENHUMA FORMATAÇÃO (sem negrito, sem itálico, sem asteriscos):

[Breve descrição fluida e vendedora do produto analisado, focando em benefícios visuais e texturais, sem termos negativos]

Especificações:
- Marca: [Marca]
- Modelo: [Modelo]
- Cor: [Cor]
- Tamanho: [Tamanho]
- [Outras especificações relevantes]

Benefícios:
- [Benefício 1]
- [Benefício 2]
- [Benefício 3]

Composição:
- [Composição 1]
- [Composição 2]

Cuidados e Conservação:
- [Cuidado 1]
- [Cuidado 2]
- [Cuidado 3]
`;

    let contextoExtra = "";
    if (dadosProdutoAlvo) {
      contextoExtra += `\nDados do Produto Alvo no Banco (Use obrigatoriamente):\n- Nome: ${dadosProdutoAlvo.produto}\n- Cor: ${dadosProdutoAlvo.cor}\n- Tamanho: ${dadosProdutoAlvo.tamanho}\n- Marca: ${dadosProdutoAlvo.marca}\n`;
    }
    if (textoReferencia) {
      contextoExtra += `\nDescrição de Referência (Baseie-se rigorosamente nesta estrutura e estilo):\n${textoReferencia}\n`;
    }

    const systemInstruction = `Você é um copywriter sênior para e-commerce (Best Fit). Seu objetivo é gerar descrições de produtos limpas, exatamente no padrão solicitado, prontas para copiar e colar. PROIBIDO usar formatação Markdown (* ou **).`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;
    
    // Monta os conteúdos da requisição (suportando texto e imagem opcional)
    const parts: any[] = [
      { text: `${systemInstruction}\n\n${padraoEstrutura}\n\n${contextoExtra}\n\nSolicitação do usuário: ${prompt || "Gere a descrição com base na imagem e dados do SKU."}` }
    ];

    if (imagemBase64 && mimeType) {
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: imagemBase64
        }
      });
    }

    const apiResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }]
      })
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      const errorMessage = data.error?.message || JSON.stringify(data);
      return NextResponse.json({ error: `Google API Error: ${errorMessage}` }, { status: apiResponse.status });
    }

    const textoGerado = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textoGerado) {
      return NextResponse.json({ error: "A IA não retornou nenhum conteúdo válido." }, { status: 500 });
    }

    return NextResponse.json({ resposta: textoGerado });
  } catch (error: any) {
    return NextResponse.json({ error: `Erro interno: ${error.message}` }, { status: 500 });
  }
}