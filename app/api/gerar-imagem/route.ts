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
    
    // Adiciona a foto da modelo como referência visual, se fornecida
    if (modeloBase64) {
      contents.push({
        inlineData: {
          data: modeloBase64,
          mimeType: "image/jpeg",
        },
      });
    }

    // Adiciona a foto do produto como referência visual, se fornecida
    if (produtoBase64) {
      contents.push({
        inlineData: {
          data: produtoBase64,
          mimeType: "image/jpeg",
        },
      });
    }

    contents.push(`Gera uma imagem realista de e-commerce e as diretrizes baseadas nisto: ${prompt}`);

    // Chamada à API utilizando o modelo compatível com multimodal e configuração de modalidades
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: contents,
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    let imagemUrl = "";
    let textoGerado = "";

    // Varre as partes da resposta para extrair o texto e/ou a imagem gerada em base64
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          textoGerado += part.text;
        } else if (part.inlineData) {
          const base64Data = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || "image/png";
          imagemUrl = `data:${mimeType};base64,${base64Data}`;
        }
      }
    }

    return NextResponse.json({ 
      sucesso: true, 
      imagemUrl: imagemUrl, 
      descricaoGerada: textoGerado || response.text || "",
      mensagem: "Processado com sucesso pelo Gemini!" 
    });
  } catch (error: any) {
    console.error("Erro na API do Gemini:", error);
    return NextResponse.json(
      { error: error?.message || "Erro interno ao processar a imagem com o Gemini." },
      { status: 500 }
    );
  }
}