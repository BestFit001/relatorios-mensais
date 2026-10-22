import { NextResponse } from "next/server";
import OpenAI from "openai";

// Inicializa o cliente OpenAI com a chave de ambiente
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "O prompt é obrigatório." }, { status: 400 });
    }

    // Chama a API do DALL-E 3 para gerar a imagem
    const response = await openai.images.generate({
      model: "dall-e-3", // Modelo mais avançado e preciso da OpenAI
      prompt: prompt,
      n: 1, // Quantidade de imagens a gerar
      size: "1024x1024", // Tamanho da imagem (pode ser "1792x1024" ou "1024x1792" se usar o DALL-E 3 na horizontal/vertical)
      response_format: "url", // Retorna uma URL da imagem (válida por tempo limitado)
    });

    // A resposta contém a URL da imagem gerada
    const imageUrl = response.data[0].url;

    return NextResponse.json({ sucesso: true, imagemUrl: imageUrl });
  } catch (error: any) {
    console.error("Erro ao gerar imagem com DALL-E:", error);
    // Retorna uma mensagem de erro amigável ao front-end
    return NextResponse.json(
      { error: error.response?.data?.error?.message || "Erro interno ao gerar a imagem." },
      { status: 500 }
    );
  }
}