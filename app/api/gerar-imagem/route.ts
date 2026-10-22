import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "A chave da API do Gemini não está configurada nas variáveis de ambiente." },
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

    // Utilizando o identificador de modelo compatível com o SDK atual @google/genai
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
    });

    const respostaTexto = response.text || "Diretriz gerada com sucesso.";

    return NextResponse.json({ 
      sucesso: true, 
      imagemUrl: "", 
      descricaoGerada: respostaTexto,
      mensagem: "Instrução visual gerada com sucesso pelo Gemini!" 
    });
  } catch (error: any) {
    console.error("Erro na API do Gemini:", error);
    return NextResponse.json(
      { error: error?.message || "Erro interno ao processar com o Gemini." },
      { status: 500 }
    );
  }
}