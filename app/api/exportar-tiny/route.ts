import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { acharPadrao, medidasDoProduto } from "../../../lib/padroesAnuncios";
import { normSkuPai } from "../../../lib/dimensoesPeso";
import { INSTRUCAO_FORMATO_DESCRICAO, limparDescricao } from "../../../lib/textoDescricao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;   // a IA pode demorar: sem isso a Vercel corta a resposta e o navegador recebe corpo vazio
const LIMITE_IA_MS = 25000;       // se a IA não responder em 25 s, usa o texto padrão e segue

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

function toTitleCase(str: string) {
  if (!str) return "";
  const lowercaseWords = ["de", "do", "da", "dos", "das", "e", "em", "por", "com", "para", "a", "o"];
  return str
    .toLowerCase()
    .replace(/\\vert(\{[^}]*\})?|ert\{[^}]*\}|_x000[bB]_|[\r\n\t\v]+/g, " ")
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
    .replace(/\\vert(\{[^}]*\})?|ert\{[^}]*\}|_x000[bB]_|[\r\n\t\v]+/g, "")
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

function comTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`IA sem resposta em ${ms / 1000}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Texto "Descrição complementar" do pai: histórico do SKU -> padrão oficial -> IA (com limite de tempo) -> texto padrão. */
async function descricaoDoPai(
  nomePaiFormatado: string,
  marcaPai: string,
  histSku: { resposta_ia?: string | null } | null,
  padroesOficiais: any[] | null,
  ai: GoogleGenAI | null
): Promise<string> {
  let descricaoComplementarPai = "";
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
          const regexTitulo = new RegExp(String(padraoEncontrado.titulo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
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
4. Estruture o texto com parágrafo introdutório, Especificações, Benefícios, Composição e Cuidados e Conservação.

${INSTRUCAO_FORMATO_DESCRICAO}

DADOS DO PRODUTO:
- Nome/Título: ${nomePaiFormatado}
- Marca: ${marcaPai}`;

          const response: any = await comTimeout(ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [promptEquilibrado],
          }), LIMITE_IA_MS);

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

  // garantia final: o campo "Descrição complementar" do Tiny é texto puro (sem **, ###, --- etc.),
  // venha o texto do histórico, de um padrão antigo ou da IA
  return limparDescricao(descricaoComplementarPai);
}

const COLUNAS_BASE = (o: {
  sku: string; descricao: string; ncm: string; origem: string; preco: number; custo: number; ean: string; cest: string;
  tipo: "V" | "S"; pai: string; variacoes: string; marca: string; tituloSeo: string; descSeo: string; kw: string; slug: string;
  complementar: string; categoria: string; medidas: { altura: number; largura: number; comprimento: number; peso: number };
}): Record<string, string | number> => ({
  "ID": "",
  "Código (SKU)": o.sku,
  "Descrição": o.descricao,
  "Unidade": "UN",
  "Classificação fiscal": o.ncm,
  "Origem": o.origem,
  "Preço": o.preco,
  "Valor IPI fixo": 0,
  "Observações": "",
  "Situação": "Ativo",
  "Estoque": "",
  "Preço de custo": o.custo,
  "Cód do Fornecedor": "",
  "Fornecedor": "",
  "Localização": "",
  "Estoque máximo": "",
  "Estoque mínimo": "",
  "Peso líquido (Kg)": o.medidas.peso.toFixed(3),
  "Peso bruto (Kg)": o.medidas.peso.toFixed(3),
  "GTIN/EAN": o.ean,
  "GTIN/EAN tributável": o.ean,
  "Descrição complementar": o.complementar,
  "CEST": o.cest,
  "Código de Enquadramento IPI": "",
  "Formato embalagem": "Pacote / Caixa",
  "Largura embalagem": String(o.medidas.largura),
  "Altura embalagem": String(o.medidas.altura),
  "Comprimento embalagem": String(o.medidas.comprimento),
  "Diâmetro embalagem": "",
  "Tipo do produto": o.tipo,
  "URL imagem 1": "",
  "URL imagem 2": "",
  "URL imagem 3": "",
  "URL imagem 4": "",
  "URL imagem 5": "",
  "URL imagem 6": "",
  "Categoria": o.categoria,
  "Código do pai": o.pai,
  "Variações": o.variacoes,
  "Marca": o.marca,
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
  "Título SEO": o.tituloSeo,
  "Descrição SEO": o.descSeo,
  "Palavras chave SEO": o.kw,
  "Slug": o.slug,
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

const chavePai = (p: any) => p.sku_pai || (String(p.sku).length > 5 ? String(p.sku).substring(0, 5) : p.sku);

export async function POST(req: Request) {
  try {
    const corpo = await req.json().catch(() => ({}));
    const skus: string[] = Array.isArray(corpo?.skus) ? corpo.skus : [];

    if (skus.length === 0) {
      return NextResponse.json({ error: "Nenhum SKU selecionado para exportação." }, { status: 400 });
    }

    const { data: produtos, error: erroProdutos } = await supabase.from("produtos_pendentes").select("*").in("sku", skus);
    if (erroProdutos) throw erroProdutos;
    if (!produtos || produtos.length === 0) {
      return NextResponse.json({ error: "Produtos pendentes não encontrados." }, { status: 404 });
    }

    const { data: padroesOficiais } = await supabase.from("padroes_anuncios").select("*");

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

    // grupos por pai (mantém a ordem)
    const grupos = new Map<string, any[]>();
    for (const p of produtos) {
      const k = chavePai(p);
      grupos.set(k, [...(grupos.get(k) || []), p]);
    }

    // histórico de descrições: UMA consulta para todos os pais (antes era uma por pai)
    const skusBase = Array.from(grupos.values()).map((itens) => itens[0].sku);
    const { data: historicos } = await supabase
      .from("historico_descricoes_ia")
      .select("sku, resposta_ia, id")
      .in("sku", skusBase)
      .order("id", { ascending: false });
    const histPorSku = new Map<string, { resposta_ia?: string | null }>();
    (historicos || []).forEach((h: any) => { if (!histPorSku.has(h.sku)) histPorSku.set(h.sku, h); });

    // descrições de todos os pais EM PARALELO (cada IA com limite de tempo)
    const entradas = Array.from(grupos.entries());
    const descricoes = await Promise.all(
      entradas.map(([, itens]) => {
        const base = itens[0];
        const nomePai = toTitleCase(limparTextoEstrito(String(base.produto || "").split("-")[0]));
        return descricaoDoPai(nomePai, base.marca || "Best Fit", histPorSku.get(base.sku) || null, padroesOficiais || [], ai);
      })
    );

    // medidas e peso REAIS informados na aba "Dimensões e Peso" (por SKU pai): prioridade máxima
    const { data: dimensoes } = await supabase.from("dimensoes_peso").select("*").in("sku_pai", entradas.map(([k]) => k));
    const dimPorPai = new Map<string, any>();
    (dimensoes || []).forEach((d: any) => dimPorPai.set(normSkuPai(d.sku_pai), d));
    const medidasFinais = (item: any, padrao: any, dim: any) =>
      dim
        ? { altura: Number(dim.altura), largura: Number(dim.largura), comprimento: Number(dim.comprimento), peso: Number(dim.peso), origem: "dimensoes" as const }
        : medidasDoProduto(item, padrao);

    const linhasExportacao: Record<string, string | number>[] = [];
    const resumo = { produtos: 0, medidasReais: 0, medidasProprias: 0, medidasDoPadrao: 0, genericas: 0, padroesUsados: [] as string[], skusGenericos: [] as string[] };

    entradas.forEach(([paiKey, itensDoPai], idx) => {
      const produtoBase = itensDoPai[0];
      const nomePaiRaw = limparTextoEstrito(String(produtoBase.produto || "").split("-")[0]);
      const nomePaiFormatado = toTitleCase(nomePaiRaw);
      const marcaPai = produtoBase.marca || "Best Fit";
      const descricaoComplementarPai = descricoes[idx];
      const dim = dimPorPai.get(normSkuPai(paiKey)) || null;

      // outras informações do produto: modelo parecido na Padronização (medidas, peso, categoria)
      const achado = acharPadrao(nomePaiRaw, marcaPai, padroesOficiais || []);
      const padrao = achado?.padrao || null;
      const categoria = padrao?.categoria ? String(padrao.categoria) : "";
      if (padrao?.titulo && !resumo.padroesUsados.includes(String(padrao.titulo))) resumo.padroesUsados.push(String(padrao.titulo));

      // 1. Produto Pai (Tipo do produto = V)
      linhasExportacao.push(COLUNAS_BASE({
        sku: paiKey, descricao: nomePaiFormatado, ncm: produtoBase.ncm || "", origem: produtoBase.origem || "0",
        preco: produtoBase.preco_venda || 0, custo: produtoBase.custo || 0, ean: "", cest: produtoBase.cest || "",
        tipo: "V", pai: "", variacoes: "", marca: marcaPai, tituloSeo: nomePaiFormatado,
        descSeo: `Compre ${nomePaiFormatado} na ${marcaPai}. Qualidade superior, conforto e estilo para você. Garanta já o seu!`,
        kw: gerarPalavrasChave(nomePaiFormatado), slug: gerarSlug(nomePaiFormatado),
        complementar: descricaoComplementarPai, categoria, medidas: medidasFinais(produtoBase, padrao, dim),
      }));

      // 2. Produtos Filhos / Variações (Tipo do produto = S)
      for (const p of itensDoPai) {
        const nomeFilhoFormatado = toTitleCase(limparTextoEstrito(p.produto || ""));
        const marcaFilho = p.marca || "Best Fit";
        const corFormatada = p.cor ? toTitleCase(limparTextoEstrito(p.cor)) : "";
        const tamFormatado = p.tamanho ? limparTextoEstrito(String(p.tamanho)) : "";
        const medidas = medidasFinais(p, padrao, dim);
        resumo.produtos++;
        if (medidas.origem === "dimensoes") resumo.medidasReais++;
        else if (medidas.origem === "produto") resumo.medidasProprias++;
        else if (medidas.origem === "padrao") resumo.medidasDoPadrao++;
        else { resumo.genericas++; resumo.skusGenericos.push(String(p.sku)); }

        linhasExportacao.push(COLUNAS_BASE({
          sku: p.sku, descricao: nomeFilhoFormatado, ncm: p.ncm || "", origem: p.origem || "0",
          preco: p.preco_venda || 0, custo: p.custo || 0, ean: p.ean || "", cest: p.cest || "",
          tipo: "S", pai: paiKey, variacoes: `Cor:${corFormatada}||Tamanho:${tamFormatado}||`, marca: marcaFilho,
          tituloSeo: nomeFilhoFormatado,
          descSeo: `Compre ${nomeFilhoFormatado} - Cor: ${corFormatada}, Tam: ${tamFormatado} na ${marcaFilho}. Conforto e qualidade garantidos.`,
          kw: gerarPalavrasChave(nomeFilhoFormatado), slug: gerarSlug(nomeFilhoFormatado),
          complementar: descricaoComplementarPai, categoria, medidas,
        }));
      }
    });

    return NextResponse.json({ sucesso: true, dados: linhasExportacao, resumo });
  } catch (error: unknown) {
    console.error("Erro ao exportar produtos:", error);
    const mensagem = error instanceof Error ? error.message : (error as any)?.message || "Erro interno ao exportar os produtos.";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
