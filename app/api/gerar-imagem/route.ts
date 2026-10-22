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

    let response;
    let tentativas = 3;
    let sucesso = false;

    // Loop de tentativas automáticas para contornar picos de alta demanda (503)
    while (tentativas > 0 && !sucesso) {
      try {
        response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: contents,
        });
        sucesso = true;
      } catch (err: any) {
        tentativas--;
        if (tentativas === 0) throw err;
        // Aguarda 1.5 segundos antes de tentar novamente
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    const respostaTexto = response?.text || "Diretriz gerada com sucesso.";

    return NextResponse.json({ 
      sucesso: true, 
      imagemUrl: "", 
      descricaoGerada: respostaTexto,
      mensagem: "Instrução visual gerada com sucesso pelo Gemini!" 
    });
  } catch (error: any) {
    console.error("Erro na API do Gemini:", error);
    return NextResponse.json(
      { error: "Os servidores da IA estão com alta demanda no momento. Por favor, tente novamente em alguns segundos." },
      { status: 500 }
    );
  }
}