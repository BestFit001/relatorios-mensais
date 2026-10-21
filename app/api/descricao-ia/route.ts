import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { prompt, skuProduto } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Erro crítico: GEMINI_API_KEY não encontrada nas variáveis de ambiente da Vercel." }, { status: 500 });
    }

    const systemInstruction = "Você é um especialista em e-commerce e copywriter sênior para a Best Fit (moda fitness e athletic wear). Crie descrições altamente persuasivas, técnicas e focadas em performance de vendas para marketplaces, focando em benefícios visuais e texturais, sem termos negativos.";

    // Atualizado para o modelo correto gemini-3.8-flash conforme solicitado pela API do Google
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;
    
    const apiResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${systemInstruction}\n\nSKU Alvo: ${skuProduto || "Nenhum"}\n\nSolicitação do Usuário: ${prompt}` }
            ]
          }
        ]
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
    return NextResponse.json({ error: `Erro interno no servidor: ${error.message}` }, { status: 500 });
  }
}