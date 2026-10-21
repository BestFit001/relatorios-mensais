import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(req: Request) {
  try {
    const { prompt, skuProduto } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY não configurada nas variáveis de ambiente." }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `Você é um especialista em e-commerce e copywriter sênior para a Best Fit (moda fitness e athletic wear). 
    Seu objetivo é criar descrições altamente persuasivas, técnicas e focadas em performance de vendas para marketplaces (Shopee, Mercado Livre, Amazon). 
    Diretrizes obrigatórias:
    - Foco em benefícios visuais e texturais (ex: toque macio, alta compressão, zero transparência, secagem rápida).
    - Proibido usar termos negativos ou focar no que o produto não tem.
    - Linguagem direta, limpa e profissional.
    SKU de referência / Contexto: ${skuProduto || "Geral"}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      },
    });

    return NextResponse.json({ resposta: response.text });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}