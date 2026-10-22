import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "A chave da API do Gemini não está configurada nas variáveis de ambiente do servidor." },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const { prompt, modeloBase64, produtoBase64 } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "O prompt descritivo é obrigatório." }, { status: 400 });
    }

    const contents: any[] = [];
    
    if (modeloBase64) {
      contents.push({
        inlineData: {
          data: modeloBase64,
          mimeType: "image/jpeg",
        },
      });
    }

    if (produtoBase64) {
      contents.push({
        inlineData: {
          data: produtoBase64,
          mimeType: "image/jpeg",
        },
      });
    }

    contents.push(`Gera uma diretriz de imagem profissional e detalhada para e-commerce baseada nisto: ${prompt}`);

    let response;
    let erroDetalhado = "";

    // Tenta primeiro o modelo gemini-2.0-flash
    try {
      response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: contents,
      });
    } catch (err: any) {
      erroDetalhado += ` [2.0-flash: ${err.message}]`;
      // Tenta o modelo de fallback gemini-1.5-flash
      try {
        response = await ai.models.generateContent({
          model: "gemini-1.5-flash",
          contents: contents,
        });
      } catch (err2: any) {
        erroDetalhado += ` [1.5-flash: ${err2.message}]`;
        throw new Error(`Falha em ambos os modelos: ${erroDetalhado}`);
      }
    }

    const respostaTexto = response.text || "Diretriz gerada com sucesso.";

    return NextResponse.json({ 
      sucesso: true, 
      imagemUrl: "", 
      descricaoGerada: respostaTexto,
      mensagem: "Instrução visual gerada com sucesso pelo Gemini!" 
    });
  } catch (error: any) {
    console.error("Erro detalhado na API do Gemini:", error);
    return NextResponse.json(
      { error: `Erro da API Google: ${error.message}` },
      { status: 500 }
    );
  }
}