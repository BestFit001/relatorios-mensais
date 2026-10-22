import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key do Gemini ausente nas variáveis de ambiente." },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const { prompt, modeloBase64, produtoBase64 } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "O prompt é obrigatório." }, { status: 400 });
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

    contents.push(`Gera uma diretriz de imagem profissional para e-commerce baseada nisto: ${prompt}`);

    // Testando com o gemini-2.0-flash que é o padrão da v1
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: contents,
    });

    const respostaTexto = response.text || "Sucesso";

    return NextResponse.json({ 
      sucesso: true, 
      imagemUrl: "", 
      descricaoGerada: respostaTexto,
      mensagem: "Processado com sucesso!" 
    });
  } catch (error: any) {
    console.error("ERRO DETALHADO:", error);
    
    // Retorna a mensagem técnica exata para vermos na tela
    const mensagemErro = error?.message || JSON.stringify(error) || "Erro desconhecido";
    return NextResponse.json(
      { error: `Erro técnico: ${mensagemErro}` },
      { status: 500 }
    );
  }
}