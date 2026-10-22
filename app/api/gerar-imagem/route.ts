import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key do Gemini ausente nas variáveis de ambiente." },
        { status: 500 }
      );
    }

    const { prompt, modeloBase64, produtoBase64 } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "O prompt é obrigatório." }, { status: 400 });
    }

    const parts: any[] = [];

    if (modeloBase64) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: modeloBase64,
        },
      });
    }

    if (produtoBase64) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: produtoBase64,
        },
      });
    }

    parts.push({
      text: `Gera uma diretriz de imagem profissional para e-commerce baseada nisto: ${prompt}`,
    });

    let response: Response | null = null;
    let data: any = null;
    let tentativas = 4;
    let sucesso = false;

    // Loop de tentativas para contornar o pico de alta demanda (503) da Google
    while (tentativas > 0 && !sucesso) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: parts,
              },
            ],
          }),
        }
      );

      data = await response.json();

      if (response.ok) {
        sucesso = true;
      } else if (response.status === 503 || data?.error?.code === 503) {
        tentativas--;
        if (tentativas === 0) break;
        // Aguarda 2 segundos antes de tentar novamente
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        // Se for outro tipo de erro (ex: chave inválida), sai imediatamente
        break;
      }
    }

    if (!response || !response.ok) {
      throw new Error(data?.error?.message || `Erro HTTP ${response?.status || 500}`);
    }

    const respostaTexto =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Diretriz gerada com sucesso.";

    return NextResponse.json({
      sucesso: true,
      imagemUrl: "",
      descricaoGerada: respostaTexto,
      mensagem: "Processado com sucesso!",
    });
  } catch (error: any) {
    console.error("ERRO TÉCNICO FETCH:", error);
    return NextResponse.json(
      { error: `Erro técnico: ${error?.message || "Erro desconhecido"}` },
      { status: 500 }
    );
  }
}