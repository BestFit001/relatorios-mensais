import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

function toTitleCase(str: string) {
  if (!str) return "";
  const lowercaseWords = ["de", "do", "da", "dos", "das", "e", "em", "por", "com", "para", "a", "o"];
  return str
    .toLowerCase()
    .replace(/\\?vert(\{[^}]*\})?|ert\{[^}]*\}|[\r\n\t\v]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word, index) => {
      if (index > 0 && lowercaseWords.includes(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function limparTextoEstrito(str: string) {
  if (!str) return "";
  return String(str)
    .replace(/\\?vert(\{[^}]*\})?|ert\{[^}]*\}|[\r\n\t\v_x000b_]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function gerarSlug(str: string) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function gerarPalavrasChave(titulo: string) {
  if (!titulo) return "";
  const base = toTitleCase(titulo);
  return `${base},${base} Confortável,${base} Original Best Fit,Moda Fitness e Casual`;
}

export async function POST(req: Request) {
  try {
    const { skus } = await req.json();

    if (!skus || skus.length === 0) {
      return NextResponse.json(
        { error: "Nenhum SKU selecionado para exportação." },
        { status: 400 }
      );
    }

    const { data: produtos, error: erroProdutos } = await supabase
      .from("produtos_pendentes")
      .select("*")
      .in("sku", skus);

    if (erroProdutos) throw erroProdutos;

    if (!produtos || produtos.length === 0) {
      return NextResponse.json(
        { error: "Produtos pendentes não encontrados." },
        { status: 404 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

    const paisUnicos = Array.from(
      new Set(
        produtos.map((p) =>
          p.sku_pai ||
          (p.sku.length > 5 ? p.sku.substring(0, 5) : p.sku)
        )
      )
    );

    const linhasExportacao: Record<string, string | number>[] = [];

    for (const paiKey of paisUnicos) {
      const itensDoPai = produtos.filter(
        (p) =>
          (p.sku_pai ||
            (p.sku.length > 5 ? p.sku.substring(0, 5) : p.sku)) === paiKey
      );

      if (itensDoPai.length === 0) continue;

      const produtoBase = itensDoPai[0];
      const nomePaiRaw = limparTextoEstrito(
        String(produtoBase.produto || "").split("-")[0]
      );
      const nomePaiFormatado = toTitleCase(nomePaiRaw);
      const slugPai = gerarSlug(nomePaiFormatado);
      const palavrasChavePai = gerarPalavrasChave(nomePaiFormatado);
      const marcaPai = produtoBase.marca || "Best Fit";

      let descricaoComplementarPai = "";

      // 1. Tenta buscar histórico individual exato deste SKU
      const { data: histSku } = await supabase
        .from("historico_descricoes_ia")
        .select("resposta_ia")
        .eq("sku", produtoBase.sku)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (histSku?.resposta_ia) {
        descricaoComplementarPai = histSku.resposta_ia;
      } else if (ai) {
        // 2. Se não tem histórico, obriga a IA a gerar uma descrição rica, analítica e específica para a peça
        try {
          const promptRico = `Você é um analista de e-commerce sênior especializado em moda praia infantil das marcas Tip Top e FARM.
Gere uma descrição comercial profissional e detalhada para o produto abaixo.

REGRAS OBRIGATÓRIAS:
1. Respeite a marca original (${marcaPai}). Se for FARM, elabore focando no estilo único e vibrante da FARM. Se for Tip Top, foque no padrão Tip Top.
2. Identifique o que é o produto pelo título (ex: se contém "Lancheira", entenda que é uma estampa/tema de biquíni infantil exclusivo da FARM).
3. NUNCA inclua tamanho ou cor na seção de especificações.
4. Siga rigidamente esta estrutura rica em blocos:

O Conjunto Biquíni Infantil [Nome do Produto / Tema] foi desenvolvido para proporcionar momentos inesquecíveis sob o sol com máxima segurança. Composto por um top charmoso e uma calcinha combinando, o conjunto apresenta uma estampa exclusiva e vibrante que encanta as pequenas. Além do design exclusivo, a peça conta com proteção solar UV50+ integrada ao tecido, bloqueando os raios solares nocivos e garantindo conforto térmico e respirabilidade durante toda a diversão na praia ou piscina.

Especificações:
- Marca: ${marcaPai}
- Modelo: [Tema / Nome Limpo]
- Proteção: Solar UV50+ permanente no tecido

Benefícios:
- Segurança: Proteção UV50+ que mantém a pele protegida durante as brincadeiras ao ar livre.
- Conforto: Tecido leve e flexível que permite liberdade total de movimentos sem causar irritações.
- Estilo: Design com acabamentos e estampas lúdicas que estimulam a imaginação.
- Ajuste Perfeito: Modelagem ajustada que oferece segurança sem apertar.

Composição:
- Tecido Externo: 84% Poliéster / 16% Elastano
- Forro: 100% Poliamida (proporciona toque macio e secagem rápida)

Cuidados:
Lavar preferencialmente à mão ou em ciclo delicado na máquina.
Utilizar água fria ou morna e sabão neutro.
Não deixar de molho e não utilizar alvejantes à base de cloro.
Secar à sombra e evitar o uso de secadoras.
Não passar a ferro para não danificar as fibras de elastano e a estampa.

DADOS DO PRODUTO:
- Título Exato: ${nomePaiFormatado}
- Marca: ${marcaPai}`;

          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [promptRico],
          });

          if (response.text) {
            descricaoComplementarPai = response.text.trim();
          }
        } catch (e) {
          console.error("Erro ao gerar descrição rica via IA:", e);
        }
      }

      if (!descricaoComplementarPai) {
        descricaoComplementarPai = [
          `O Conjunto Biquíni Infantil ${nomePaiFormatado} foi desenvolvido para proporcionar momentos inesquecíveis sob o sol com máxima segurança. Composto por um top charmoso e uma calcinha combinando, o conjunto apresenta uma estampa exclusiva e vibrante que encanta as pequenas. Além do design exclusivo, a peça conta com proteção solar UV50+ integrada ao tecido, bloqueando os raios solares nocivos e garantindo conforto térmico e respirabilidade durante toda a diversão na praia ou piscina.`,
          "",
          "Especificações:",
          `- Marca: ${marcaPai}`,
          `- Modelo: ${nomePaiFormatado}`,
          "- Proteção: Solar UV50+ permanente no tecido",
          "",
          "Benefícios:",
          "- Segurança: Proteção UV50+ que mantém a pele protegida durante as brincadeiras ao ar livre.",
          "- Conforto: Tecido leve e flexível que permite liberdade total de movimentos sem causar irritações.",
          "- Estilo: Design com acabamentos e estampas lúdicas que estimulam a imaginação.",
          "- Ajuste Perfeito: Modelagem ajustada que oferece segurança sem apertar.",
          "",
          "Composição:",
          "- Tecido Externo: 84% Poliéster / 16% Elastano",
          "- Forro: 100% Poliamida (proporciona toque macio e secagem rápida)",
          "",
          "Cuidados:",
          "Lavar preferencialmente à mão ou em ciclo delicado na máquina.",
          "Utilizar água fria ou morna e sabão neutro.",
          "Não deixar de molho e não utilizar alvejantes à base de cloro.",
          "Secar à sombra e evitar o uso de secadoras.",
          "Não passar a ferro para não danificar as fibras de elastano e a estampa."
        ].join("\n");
      }

      // 1. Produto Pai (Tipo do produto = V)
      linhasExportacao.push({
        "ID": "",
        "Código (SKU)": paiKey,
        "Descrição": nomePaiFormatado,
        "Unidade": "UN",
        "Classificação fiscal": produtoBase.ncm || "",
        "Origem": produtoBase.origem || "0",
        "Preço": produtoBase.preco_venda || 0,
        "Valor IPI fixo": 0,
        "Observações": "",
        "Situação": "Ativo",
        "Estoque": "",
        "Preço de custo": produtoBase.custo || 0,
        "Cód do Fornecedor": "",
        "Fornecedor": "",
        "Localização": "",
        "Estoque máximo": "",
        "Estoque mínimo": "",
        "Peso líquido (Kg)": "0.500",
        "Peso bruto (Kg)": "0.500",
        "GTIN/EAN": "",
        "GTIN/EAN tributável": "",
        "Descrição complementar": descricaoComplementarPai,
        "CEST": produtoBase.cest || "",
        "Código de Enquadramento IPI": "",
        "Formato embalagem": "",
        "Largura embalagem": "20",
        "Altura embalagem": "20",
        "Comprimento embalagem": "20",
        "Diâmetro embalagem": "",
        "Tipo do produto": "V",
        "URL imagem 1": "",
        "URL imagem 2": "",
        "URL imagem 3": "",
        "URL imagem 4": "",
        "URL imagem 5": "",
        "URL imagem 6": "",
        "Categoria": "",
        "Código do pai": "",
        "Variações": "",
        "Marca": marcaPai,
        "Garantia": "30 dias",
        "Sob encomenda": "Não",
        "Preço promocional": "",
        "URL imagem externa 1": "",
        "URL imagem externa 2": "",
        "URL imagem externa 3": "",
        "URL imagem externa 4": "",
        "URL imagem externa 5": "",
        "URL imagem externa 6": "",
        "Link do vídeo": "",
        "Título SEO": nomePaiFormatado,
        "Descrição SEO": `Compre ${nomePaiFormatado} na ${marcaPai}. Qualidade superior, conforto e estilo para você. Garanta já o seu!`,
        "Palavras chave SEO": palavrasChavePai,
        "Slug": slugPai,
        "Dias para preparação": "0",
        "Controlar lotes": "Não",
        "Unidade por caixa": "",
        "URL imagem externa 7": "",
        "URL imagem externa 8": "",
        "URL imagem externa 9": "",
        "URL imagem externa 10": "",
        "Markup": "",
        "Permitir inclusão nas vendas": "Sim",
        "EX TIPI": "",
      });

      // 2. Produtos Filhos / Variações (Tipo do produto = S)
      for (const p of itensDoPai) {
        const nomeFilhoRaw = limparTextoEstrito(p.produto || "");
        const nomeFilhoFormatado = toTitleCase(nomeFilhoRaw);
        const slugFilho = gerarSlug(nomeFilhoFormatado);
        const palavrasChaveFilho = gerarPalavrasChave(nomeFilhoFormatado);
        const marcaFilho = p.marca || "Best Fit";

        const corFormatada = p.cor ? toTitleCase(limparTextoEstrito(p.cor)) : "";
        const tamFormatado = p.tamanho ? limparTextoEstrito(String(p.tamanho)) : "";
        const variacaoFormatada = `Cor:${corFormatada}||Tamanho:${tamFormatado}||`;

        linhasExportacao.push({
          "ID": "",
          "Código (SKU)": p.sku,
          "Descrição": nomeFilhoFormatado,
          "Unidade": "UN",
          "Classificação fiscal": p.ncm || "",
          "Origem": p.origem || "0",
          "Preço": p.preco_venda || 0,
          "Valor IPI fixo": 0,
          "Observações": "",
          "Situação": "Ativo",
          "Estoque": "",
          "Preço de custo": p.custo || 0,
          "Cód do Fornecedor": "",
          "Fornecedor": "",
          "Localização": "",
          "Estoque máximo": "",
          "Estoque mínimo": "",
          "Peso líquido (Kg)": "0.500",
          "Peso bruto (Kg)": "0.500",
          "GTIN/EAN": p.ean || "",
          "GTIN/EAN tributável": p.ean || "",
          "Descrição complementar": descricaoComplementarPai,
          "CEST": p.cest || "",
          "Código de Enquadramento IPI": "",
          "Formato embalagem": "",
          "Largura embalagem": "20",
          "Altura embalagem": "20",
          "Comprimento embalagem": "20",
          "Diâmetro embalagem": "",
          "Tipo do produto": "S",
          "URL imagem 1": "",
          "URL imagem 2": "",
          "URL imagem 3": "",
          "URL imagem 4": "",
          "URL imagem 5": "",
          "URL imagem 6": "",
          "Categoria": "",
          "Código do pai": paiKey,
          "Variações": variacaoFormatada,
          "Marca": marcaFilho,
          "Garantia": "30 dias",
          "Sob encomenda": "Não",
          "Preço promocional": "",
          "URL imagem externa 1": "",
          "URL imagem externa 2": "",
          "URL imagem externa 3": "",
          "URL imagem externa 4": "",
          "URL imagem externa 5": "",
          "URL imagem externa 6": "",
          "Link do vídeo": "",
          "Título SEO": nomeFilhoFormatado,
          "Descrição SEO": `Compre ${nomeFilhoFormatado} - Cor: ${corFormatada}, Tam: ${tamFormatado} na ${marcaFilho}. Conforto e qualidade garantidos.`,
          "Palavras chave SEO": palavrasChaveFilho,
          "Slug": slugFilho,
          "Dias para preparação": "0",
          "Controlar lotes": "Não",
          "Unidade por caixa": "",
          "URL imagem externa 7": "",
          "URL imagem externa 8": "",
          "URL imagem externa 9": "",
          "URL imagem externa 10": "",
          "Markup": "",
          "Permitir inclusão nas vendas": "Sim",
          "EX TIPI": "",
        });
      }
    }

    return NextResponse.json({
      sucesso: true,
      dados: linhasExportacao,
    });
  } catch (error: unknown) {
    console.error("Erro ao exportar produtos:", error);
    const mensagem =
      error instanceof Error ? error.message : "Erro interno ao exportar os produtos.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}