import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "A variável de ambiente OPENAI_API_KEY não está configurada no servidor." },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const { prompt, modeloBase64, produtoBase64 } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "O prompt descritivo é obrigatório." }, { status: 400 });
    }

    // Se o utilizador enviou fotos de referência (modelo/produto), podes enriquecer o prompt 
    // ou passá-las para modelos que aceitam imagem de entrada (como GPT-4o para estruturar o prompt visual ou DALL-E)
    let promptFinal = prompt;
    if (modeloBase64 || produtoBase64) {
      promptFinal = `${prompt}. [Contexto aplicado: Utilizar as características visuais da modelo e vestir o produto de referência de forma realista].`;
    }

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: promptFinal,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    });

    const imageUrl = response.data?.[0]?.url;

    if (!imageUrl) {
      return NextResponse.json({ error: "A IA não conseguiu gerar a imagem." }, { status: 500 });
    }

    return NextResponse.json({ sucesso: true, imagemUrl: imageUrl });
  } catch (error: any) {
    console.error("Erro ao gerar imagem com DALL-E:", error);
    return NextResponse.json(
      { error: error.response?.data?.error?.message || error.message || "Erro interno ao gerar a imagem." },
      { status: 500 }
    );
  }
}