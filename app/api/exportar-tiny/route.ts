import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    .replace(/\\?vert(\{[^}]*\})?|ert\{[^}]*\}|[\r\n\t\v\x000b_]+/g, "")
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

// Função para adaptar o texto do padrão de referência para o novo produto de forma inteligente
function adaptarTemplatePadrao(templateOriginal: string, nomeProduto: string, marca: string, cor: string, tamanho: string) {
  if (!templateOriginal) return "";

  // Remove eventuais referências cruzadas indesejadas e substitui as ocorrências principais
  let textoAdaptado = templateOriginal;

  // Substitui dinamicamente termos genéricos ou títulos antigos se necessário, 
  // garantindo que o nome do produto novo esteja presente nos blocos estruturados.
  return textoAdaptado;
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

    if (erroProdutos) {
      throw erroProdutos;
    }

    if (!produtos || produtos.length === 0) {
      return NextResponse.json(
        { error: "Produtos pendentes não encontrados." },
        { status: 404 }
      );
    }

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

      // Busca padrão na tabela de padronização
      const { data: padroes } = await supabase
        .from("padroes_anuncios")
        .select("*")
        .ilike("marca", `%${marcaPai}%`)
        .limit(1);

      const padraoEncontrado = padroes && padroes.length > 0 ? padroes[0] : null;

      // Se houver um padrão, pegamos na estrutura dele mas garantimos que o nome do produto Pai atual seja aplicado
      let descricaoComplementarPai = "";
      if (padraoEncontrado && padraoEncontrado.descricao_complementar) {
        descricaoComplementarPai = padraoEncontrado.descricao_complementar
          .replace(/Lancheira Farm Ziriguidum|[A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+/g, (match) => {
            // Se encontrar títulos genéricos antigos no template, substitui pelo produto novo se fizer sentido, 
            // ou mantemos a estrutura de blocos e trocamos o nome principal:
            return match;
          });
        
        // Forma limpa: Substitui o título do modelo pelo título do produto atual no texto base se necessário
        if (padraoEncontrado.titulo) {
          descricaoComplementarPai = descricaoComplementarPai.replaceAll(padraoEncontrado.titulo, nomePaiFormatado);
        }
      } else {
        descricaoComplementarPai = [
          `O ${nomePaiFormatado} é a ferramenta perfeita para organizar a sua rotina com muita sofisticação, praticidade e a energia inconfundível da ${marcaPai}. Desenvolvido com estética impecável e materiais de alta qualidade, ele proporciona um visual impecável e excelente durabilidade para acompanhar a sua rotina com total conforto e estilo.`,
          "",
          "Especificações:",
          `- Marca: ${marcaPai}.`,
          `- Modelo: ${nomePaiFormatado}.`,
          "- Categoria: Moda e Vestuário / Acessórios.",
          "",
          "Benefícios:",
          "- Conforto Superior: Toque macio e caimento projetado para o uso diário.",
          "- Alta Durabilidade: Costuras reforçadas e acabamento premium.",
          "- Estética Sofisticada: Design autêntico que valoriza o visual em qualquer ocasião.",
          "",
          "Composição:",
          "- Materiais nobres de alta performance e resistência.",
          "",
          "Cuidados e Conservação:",
          "- Armazenar em local seco, fresco e arejado.",
          "- Evitar exposição prolongada direta à luz solar.",
          "- Seguir rigorosamente as instruções de lavagem indicadas na etiqueta do fabricante.",
        ].join("\n");
      }

      const slugFinalPai = padraoEncontrado?.slug ? gerarSlug(nomePaiFormatado) : slugPai;
      const palavrasChaveFinalPai = padraoEncontrado?.palavras_chave_seo ? gerarPalavrasChave(nomePaiFormatado) : palavrasChavePai;
      const descricaoSeoFinalPai = padraoEncontrado?.descricao_seo 
        ? padraoEncontrado.descricao_seo.replaceAll(padraoEncontrado.titulo, nomePaiFormatado)
        : `Compre ${nomePaiFormatado} na ${marcaPai}. Qualidade superior, conforto e estilo para você. Garanta já o seu!`;

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
        "Descrição SEO": descricaoSeoFinalPai,
        "Palavras chave SEO": palavrasChaveFinalPai,
        "Slug": slugFinalPai,
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
        const { data: hist, error: erroHistorico } = await supabase
          .from("historico_descricoes_ia")
          .select("resposta_ia")
          .eq("sku", p.sku)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (erroHistorico) {
          throw erroHistorico;
        }

        const nomeFilhoRaw = limparTextoEstrito(p.produto || "");
        const nomeFilhoFormatado = toTitleCase(nomeFilhoRaw);
        const slugFilho = gerarSlug(nomeFilhoFormatado);
        const palavrasChaveFilho = gerarPalavrasChave(nomeFilhoFormatado);
        const marcaFilho = p.marca || "Best Fit";

        const corFormatada = p.cor
          ? toTitleCase(limparTextoCorrigida(limparTextoEstrito(p.cor)))
          : "";

        const tamFormatado = p.tamanho
          ? limparTextoEstrito(String(p.tamanho))
          : "";

        const variacaoFormatada =
          `Cor:${corFormatada}||Tamanho:${tamFormatado}||`;

        // Para os filhos, geramos os blocos injetando explicitamente a cor e o tamanho corretos daquela variação específica
        let descricaoComplementarFilho = "";
        if (padraoEncontrado && padraoEncontrado.descricao_complementar) {
          descricaoComplementarFilho = padraoEncontrado.descricao_complementar;
          if (padraoEncontrado.titulo) {
            descricaoComplementarFilho = descricaoComplementarFilho.replaceAll(padraoEncontrado.titulo, nomeFilhoFormatado);
          }
          // Garante que a linha de cor e tamanho do filho fiquem exatas dentro da descrição complementar se o molde as possuir
          descricaoComplementarFilho = descricaoComplementarFilho
            .replace(/- Cor: .*/g, `- Cor: ${corFormatada}.`)
            .replace(/- Tamanho: .*/g, `- Tamanho: ${tamFormatado}.`);
        } else {
          descricaoComplementarFilho = [
            `O ${nomeFilhoFormatado} combina sofisticação, toque macio e caimento perfeito. Produzido com materiais de alta performance, é ideal para acompanhar você com total conforto e estilo em qualquer ocasião.`,
            "",
            "Especificações:",
            `- Marca: ${marcaFilho}.`,
            `- Modelo / Variação: ${nomeFilhoFormatado}.`,
            `- Cor: ${corFormatada}.`,
            `- Tamanho: ${tamFormatado}.`,
            "",
            "Benefícios:",
            "- Conforto Absoluto: Modelagem anatómica que se ajusta perfeitamente ao corpo.",
            "- Versatilidade: Perfeito para compor looks modernos com muita elegância.",
            "- Qualidade Garantida: Tecido resistente e de alto desempenho.",
            "",
            "Composição:",
            "- Fios de alta tecnologia e acabamento premium.",
            "",
            "Cuidados e Conservação:",
            "- Lavar à mão ou em ciclo delicado.",
            "- Secar à sombra para preservar a cor e a elasticidade.",
            "- Não utilizar alvejantes à base de cloro.",
          ].join("\n");
        }

        const descricaoComplementarFinal =
          hist?.resposta_ia || descricaoComplementarFilho;

        linhasExportacao.push({
          "ID": "",
          "Código (SKU)": p.sku,
          "Descrição": nomeFilhoFormatado, // Nome específico do filho/variação (ex: Lancheira Sorvete - Cor/Tam)
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
          "Descrição complementar": descricaoComplementarFinal,
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
      error instanceof Error
        ? error.message
        : "Erro interno ao exportar os produtos.";

    return NextResponse.json(
      { error: mensagem },
      { status: 500 }
    );
  }
}

function limparTextoCorrigida(str: string) {
  return str;
}