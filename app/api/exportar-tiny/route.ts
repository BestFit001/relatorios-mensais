import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { medidasDoProduto, modeloParecido, nomesEquivalentes, rankearModelos } from "../../../lib/padroesAnuncios";
import { ajustarTitulo, lerRespostaAdaptacao, montarPedidoAdaptacao, MOTIVO_SEM_CHAVE, slugDoTitulo, type RespostaAdaptacao } from "../../../lib/adaptarModelo";
import { gerarTexto, provedoresConfigurados, resumirFalhas, type ProvedorIA } from "../../../lib/iaProvedores";
import { normSkuPai } from "../../../lib/dimensoesPeso";
import { INSTRUCAO_FORMATO_DESCRICAO, limparDescricao } from "../../../lib/textoDescricao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;   // a IA pode demorar: sem isso a Vercel corta a resposta e o navegador recebe corpo vazio
const PRAZO_IA_MS = 50000;        // tempo total da IA (todas as tentativas, nos 2 provedores) antes de usar o texto padrão; a função tem 60 s

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

type FonteConteudo = "historico" | "modelo-ia" | "modelo-igual" | "ia" | "texto-padrao";
interface ConteudoPai {
  descricao: string;
  fonte: FonteConteudo;
  /** modelo da Padronização que serve ao produto (medidas, peso e categoria vêm dele); null = nenhum */
  padrao: any | null;
  /** só quando a IA adaptou o modelo: título, descrição SEO e palavras-chave já ajustados */
  titulo?: string;
  descSeo?: string;
  palavrasChave?: string;
  /** havia modelo do mesmo tipo, mas a IA não respondeu: a descrição saiu genérica */
  modeloSemIA?: boolean;
  /** por que a IA não foi aproveitada (mostrado no aviso final) */
  motivoIA?: string;
  /** qual IA respondeu ("Claude", "Gemini" ou "Groq"); vazio quando nenhuma foi usada */
  provedorIA?: string;
  /** a IA principal falhou, mas a reserva respondeu: o que aconteceu com a principal */
  avisoIA?: string;
}

/**
 * Pede à IA a adaptação do modelo. Tenta o Gemini (raciocínio baixo, para responder rápido) e, se ele falhar, demorar ou
 * responder fora do formato, o Groq. Qualquer um que tenha chave configurada serve; basta um.
 */
async function pedirAdaptacao(
  provedores: ProvedorIA[], pedido: string, totalModelos: number, prazoFinal: number
): Promise<{ r: RespostaAdaptacao | null; provedor: string | null; motivo: string; aviso: string }> {
  let lida: RespostaAdaptacao | null = null;
  const res = await gerarTexto(provedores, pedido, {
    json: true,
    prazoFinal,
    aceitar: (t) => { lida = lerRespostaAdaptacao(t, totalModelos); return !!lida; },
  });
  const falhas = resumirFalhas(res.falhas);
  if (res.provedor && lida) return { r: lida, provedor: res.provedor, motivo: "", aviso: falhas };
  return { r: null, provedor: null, motivo: falhas || "a IA não respondeu", aviso: "" };
}

function textoPadraoSemIA(nomePaiFormatado: string, marcaPai: string): string {
  const n = nomePaiFormatado.toLowerCase();
  const isBiquini = n.includes("biquíni") || n.includes("biquini") || n.includes("conjunto");
  if (isBiquini) {
    return [
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
      "Não passar a ferro para não danificar as fibras de elastano e a estampa.",
    ].join("\n");
  }
  return [
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
    "- Não lavar na máquina e secar à sombra.",
  ].join("\n");
}

/**
 * Conteúdo do produto pai (descrição complementar, e quando há modelo: título, descrição SEO e palavras-chave).
 * Ordem: 1) texto já salvo no histórico do SKU; 2) IA lê o modelo da Padronização do mesmo tipo de produto e ADAPTA
 * (mantém o que é igual, troca/remove o que é da estampa do modelo); 3) cópia do modelo só se o nome for idêntico;
 * 4) IA sem modelo; 5) texto padrão.
 */
async function conteudoDoPai(
  nomePaiRaw: string,
  nomePaiFormatado: string,
  marcaPai: string,
  cores: string[],
  histSku: { resposta_ia?: string | null } | null,
  padroes: any[],
  provedores: ProvedorIA[],
  prazoFinal: number
): Promise<ConteudoPai> {
  const candidatos = rankearModelos(nomePaiRaw, marcaPai, padroes).slice(0, 3);
  const parecido = modeloParecido(nomePaiRaw, marcaPai, padroes);

  // 1. descrição já aprovada para este SKU (histórico do chat)
  if (histSku?.resposta_ia) {
    return { descricao: limparDescricao(histSku.resposta_ia), fonte: "historico", padrao: parecido };
  }

  // 2. a IA analisa o modelo e adapta para o produto novo
  let motivoIA = "";
  const temIA = provedores.length > 0;
  if (candidatos.length > 0 && !temIA) motivoIA = MOTIVO_SEM_CHAVE;
  if (candidatos.length > 0 && temIA) {
    // só os 2 melhores modelos vão para a IA: pedido menor responde mais rápido e cabe no limite por minuto do Groq
    const modelos = candidatos.slice(0, 2).map((c) => c.padrao);
    let pedido = "";
    try {
      pedido = montarPedidoAdaptacao({ nome: nomePaiFormatado, marca: marcaPai, cores }, modelos);
    } catch (e) {
      motivoIA = "erro ao montar o pedido para a IA: " + String((e as any)?.message ?? e).slice(0, 120);
      console.error(motivoIA, e);
    }
    if (pedido) {
      const { r, provedor, motivo, aviso } = await pedirAdaptacao(provedores, pedido, modelos.length, prazoFinal);
      if (r) {
        const escolhido = r.modelo > 0 ? modelos[r.modelo - 1] : null;
        return {
          descricao: r.descricao_complementar,
          fonte: "modelo-ia",
          padrao: escolhido,
          titulo: r.titulo ? toTitleCase(ajustarTitulo(r.titulo)) : undefined,
          descSeo: r.descricao_seo || undefined,
          palavrasChave: r.palavras_chave || undefined,
          provedorIA: provedor || undefined,
          avisoIA: aviso || undefined,
        };
      }
      motivoIA = motivo;
    }
  }

  // 3. mesmo nome do modelo (mesma estampa): aí sim vale copiar o texto do modelo
  const igual = candidatos.find((c) => c.padrao.descricao_complementar && nomesEquivalentes(String(c.padrao.titulo), nomePaiRaw, marcaPai));
  if (igual) {
    return {
      descricao: limparDescricao(igual.padrao.descricao_complementar),
      fonte: "modelo-igual",
      padrao: igual.padrao,
      descSeo: igual.padrao.descricao_seo || undefined,
      palavrasChave: igual.padrao.palavras_chave_seo || undefined,
    };
  }

  // 4. sem modelo parecido: IA escreve do zero lendo o nome do produto
  if (candidatos.length === 0 && temIA) {
    const prompt = `Você é um analista sênior de e-commerce da Best Fit. Elabore uma descrição comercial impecável e 100% fiel ao produto abaixo.

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
    const res = await gerarTexto(provedores, prompt, { prazoFinal });
    if (res.texto) return { descricao: limparDescricao(res.texto), fonte: "ia", padrao: null, provedorIA: res.provedor || undefined, avisoIA: resumirFalhas(res.falhas) || undefined };
    motivoIA = resumirFalhas(res.falhas) || "a IA devolveu uma resposta vazia";
  } else if (candidatos.length === 0 && !temIA) {
    motivoIA = MOTIVO_SEM_CHAVE;
  }

  // 5. texto padrão (a IA não respondeu ou não está configurada)
  return {
    descricao: limparDescricao(textoPadraoSemIA(nomePaiFormatado, marcaPai)),
    fonte: "texto-padrao",
    padrao: parecido,
    modeloSemIA: candidatos.length > 0 && !!motivoIA,
    motivoIA: motivoIA || undefined,
  };
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

    // IAs configuradas no Vercel (ANTHROPIC_API_KEY, GEMINI_API_KEY e/ou GROQ_API_KEY): se uma falhar, a outra assume
    const provedores = provedoresConfigurados();

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

    // conteúdo de todos os pais EM PARALELO (cada IA com limite de tempo): a IA lê o modelo da Padronização e adapta
    const entradas = Array.from(grupos.entries());
    const prazoIA = Date.now() + PRAZO_IA_MS;
    const conteudos = await Promise.all(
      entradas.map(([, itens]) => {
        const base = itens[0];
        const nomeRaw = limparTextoEstrito(String(base.produto || "").split("-")[0]);
        const cores = Array.from(new Set(itens.map((i: any) => (i.cor ? toTitleCase(limparTextoEstrito(i.cor)) : "")).filter(Boolean))) as string[];
        return conteudoDoPai(nomeRaw, toTitleCase(nomeRaw), base.marca || "Best Fit", cores, histPorSku.get(base.sku) || null, padroesOficiais || [], provedores, prazoIA);
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
    const resumo = {
      produtos: 0, medidasReais: 0, medidasProprias: 0, medidasDoPadrao: 0, genericas: 0,
      padroesUsados: [] as string[], skusGenericos: [] as string[],
      // de onde veio a descrição de cada produto pai
      descricoes: { modeloIA: 0, modeloIgual: 0, historico: 0, iaSemModelo: 0, textoPadrao: 0 },
      paisSemIA: [] as string[],   // havia modelo do mesmo tipo, mas a IA não respondeu (texto genérico)
      motivosIA: [] as string[],   // por que a IA não foi aproveitada (sem repetição)
      iaUsada: {} as Record<string, number>,   // quantos produtos pai cada IA respondeu
      avisosIA: [] as string[],    // a IA principal falhou e a reserva assumiu (sem repetição)
      iasConfiguradas: provedores.map((p) => p.nome),
    };

    entradas.forEach(([paiKey, itensDoPai], idx) => {
      const produtoBase = itensDoPai[0];
      const nomePaiRaw = limparTextoEstrito(String(produtoBase.produto || "").split("-")[0]);
      const nomePaiFormatado = toTitleCase(nomePaiRaw);
      const marcaPai = produtoBase.marca || "Best Fit";
      const cont = conteudos[idx];
      const descricaoComplementarPai = cont.descricao;
      const dim = dimPorPai.get(normSkuPai(paiKey)) || null;
      if (cont.fonte === "modelo-ia") resumo.descricoes.modeloIA++;
      else if (cont.fonte === "modelo-igual") resumo.descricoes.modeloIgual++;
      else if (cont.fonte === "historico") resumo.descricoes.historico++;
      else if (cont.fonte === "ia") resumo.descricoes.iaSemModelo++;
      else resumo.descricoes.textoPadrao++;
      if (cont.modeloSemIA) resumo.paisSemIA.push(`${paiKey} (${nomePaiFormatado})`);
      if (cont.motivoIA && !resumo.motivosIA.includes(cont.motivoIA)) resumo.motivosIA.push(cont.motivoIA);
      if (cont.provedorIA) resumo.iaUsada[cont.provedorIA] = (resumo.iaUsada[cont.provedorIA] || 0) + 1;
      if (cont.avisoIA && !resumo.avisosIA.includes(cont.avisoIA)) resumo.avisosIA.push(cont.avisoIA);

      // título final do pai (a IA adapta o do modelo; máx. 60 caracteres, sem cortar palavras) e demais dados do anúncio
      const tituloPai = cont.titulo || nomePaiFormatado;
      const slugDe = (t: string) => (cont.titulo ? slugDoTitulo(t, cont.padrao?.slug || "") : gerarSlug(t));
      const kwDe = (t: string) => cont.palavrasChave || gerarPalavrasChave(t);

      // outras informações do produto: modelo escolhido na Padronização (medidas, peso, categoria)
      const padrao = cont.padrao;
      const categoria = padrao?.categoria ? String(padrao.categoria) : "";
      if (padrao?.titulo && !resumo.padroesUsados.includes(String(padrao.titulo))) resumo.padroesUsados.push(String(padrao.titulo));

      // 1. Produto Pai (Tipo do produto = V)
      linhasExportacao.push(COLUNAS_BASE({
        sku: paiKey, descricao: tituloPai, ncm: produtoBase.ncm || "", origem: produtoBase.origem || "0",
        preco: produtoBase.preco_venda || 0, custo: produtoBase.custo || 0, ean: "", cest: produtoBase.cest || "",
        tipo: "V", pai: "", variacoes: "", marca: marcaPai, tituloSeo: tituloPai,
        descSeo: cont.descSeo || `Compre ${tituloPai} na ${marcaPai}. Qualidade superior, conforto e estilo para você. Garanta já o seu!`,
        kw: kwDe(tituloPai), slug: slugDe(tituloPai),
        complementar: descricaoComplementarPai, categoria, medidas: medidasFinais(produtoBase, padrao, dim),
      }));

      // 2. Produtos Filhos / Variações (Tipo do produto = S)
      for (const p of itensDoPai) {
        // variação sem sufixo no nome ("Nome") usa o título final do pai; com sufixo ("Nome - Cor - Tam") troca só a parte do pai
        const nomeOriginal = String(p.produto || "");
        const resto = nomeOriginal.includes("-") ? nomeOriginal.slice(nomeOriginal.indexOf("-")) : "";
        const nomeFilhoFormatado = cont.titulo
          ? toTitleCase(limparTextoEstrito(`${tituloPai}${resto ? " " + resto : ""}`))
          : toTitleCase(limparTextoEstrito(nomeOriginal));
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
          kw: kwDe(nomeFilhoFormatado), slug: slugDe(nomeFilhoFormatado),
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
