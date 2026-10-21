import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { prompt, skuProduto } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY não configurada na Vercel/Ambiente." }, { status: 500 });
    }

    const systemInstruction = "Você é um especialista em e-commerce e copywriter sênior para a Best Fit (moda fitness e athletic wear). Crie descrições altamente persuasivas, técnicas e focadas em performance de vendas para marketplaces, focando em benefícios visuais e texturais, sem termos negativos.";

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: `${systemInstruction}\n\nContexto SKU: ${skuProduto || "Geral"}\n\nSolicitação: ${prompt}` }] }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Erro na API do Google Gemini");
    }

    const textoGerado = data.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível gerar a resposta.";

    return NextResponse.json({ resposta: textoGerado });
  } catch (error: any) {
    console.error("Erro detalhado:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}