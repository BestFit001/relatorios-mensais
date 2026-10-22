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

    const { data: padroesOficiais } = await supabase
      .from("padroes_anuncios")
      .select("*");

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
      } else {
        // 2. Procura padrão na base APENAS se a marca e o contexto baterem de verdade
        let padraoEncontrado: any = null;
        if (padroesOficiais && padroesOficiais.length > 0) {
          padraoEncontrado = padroesOficiais.find(
            (p) => 
              p.marca && 
              p.marca.toLowerCase().includes(marcaPai.toLowerCase()) &&
              p.titulo && 
              nomePaiFormatado.toLowerCase().includes(p.titulo.toLowerCase().split(" ")[0])
          );
        }

        if (padraoEncontrado && padraoEncontrado.descricao_complementar) {
          let textoBase = padraoEncontrado.descricao_complementar;
          if (padraoEncontrado.titulo) {
            const regexTitulo = new RegExp(padraoEncontrado.titulo, "gi");
            textoBase = textoBase.replace(regexTitulo, nomePaiFormatado);
          }
          descricaoComplementarPai = textoBase;
        } else if (ai) {
          // 3. Se não há padrão idêntico, usa a IA com rigor absoluto para analisar o que o produto REALMENTE é
          try {
            const promptEquilibrado = `Você é um analista sênior de e-commerce da Best Fit. Elabore uma descrição comercial impecável e 100% fiel ao produto abaixo.

DIRETRIZES CRÍTICAS:
1. LEITURA REAL DO ITEM: Identifique o que o produto é pelo título ("${nomePaiFormatado}"). 
   - Se for um biquíni/conjunto infantil, mencione proteção UV50+, conforto térmico, tecido próprio para praia/piscina, composição de elastano/poliéster e cuidados de lavagem.
   - Se for uma lancheira, bolsa ou acessório, mencione espaço interno, material resistente, praticidade para o dia a dia e facilidade de limpeza. 
   - NUNCA misture categorias! Uma lancheira jamais é um biquíni.
2. Respeite rigorosamente a marca original (${marcaPai}).
3. NUNCA inclua tamanho ou cor na seção de especificações.
4. Estruture o texto limpo com parágrafo introdutório, Especificações, Benefícios, Composição e Cuidados.

DADOS DO PRODUTO:
- Nome/Título: ${nomePaiFormatado}
- Marca: ${marcaPai}`;

            const response = await ai.models.generateContent({
              model: "gemini-3.8-flash",
              contents: [promptEquilibrado],
            });

            if (response.text) {
              descricaoComplementarPai = response.text.trim();
            }
          } catch (e) {
            console.error("Erro na IA:", e);
          }
        }
      }

      // 4. Fallback contextual se tudo o mais falhar
      if (!descricaoComplementarPai) {
        const isBiquini = nomePaiFormatado.toLowerCase().includes("biquíni") || nomePaiFormatado.toLowerCase().includes("biquini") || nomePaiFormatado.toLowerCase().includes("conjunto");
        
        if (isBiquini) {
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
        } else {
          descricaoComplementarPai = [
            `A ${nomePaiFormatado} da ${marcaPai} foi desenvolvida para unir praticidade, estilo e alta qualidade no transporte das refeições ou pertences do dia a dia. Com um design moderno e funcional, oferece excelente espaço interno e facilidade de limpeza.`,
            "",
            "Especificações:",
            `- Marca: ${marcaPai}`,
            `- Modelo: ${nomePaiFormatado}`,
            "",
            "Benefícios:",
            "- Praticidade: Estrutura funcional e fácil de transportar para a escola ou passeios.",
            "- Alta Durabilidade: Materiais resistentes de excelente acabamento.",
            "- Estilo: Estampa exclusiva e autêntica da marca.",
            "",
            "Composição:",
            "- Materiais de alta performance e fácil higienização.",
            "",
            "Cuidados:",
            "- Limpar com pano úmido e sabão neutro.",
            "- Não lavar na máquina e secar à sombra."
          ].join("\n");
        }
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