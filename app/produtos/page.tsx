"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { canaisSemRepeticao } from "../../lib/vendasCanaisLogica";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import * as XLSX from "xlsx";

export default function ProdutosPage() {
  const router = useRouter();
  const [subAba, setSubAba] = useState<"pendentes" | "canais" | "periodo" | "config" | "descricoes">("pendentes");
  const [loading, setLoading] = useState(false);

  const [dadosPendentes, setDadosPendentes] = useState<any[]>([]);
  const [cadastrosRealizados, setCadastrosRealizados] = useState<any[]>([]);
  const [canaisLista, setCanaisLista] = useState<string[]>([]);

  const [pesquisaGlobal, setPesquisaGlobal] = useState("");
  const [itensPorPagina, setItemsPorPagina] = useState(10);
  const [filtroStatusRealizados, setFiltroStatusRealizados] = useState<"todos" | "completos" | "parciais">("todos");
  const [filtroCanalEspecifico, setFiltroCanalEspecifico] = useState<string>("todos");

  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [gruposExpandidos, setGruposExpandidos] = useState<{ [pai: string]: boolean }>({});
  const [skusSelecionados, setSkusSelecionados] = useState<string[]>([]);
  // Seleção própria da sub-aba Canais (SKUs já cadastrados), para Excluir / Recadastrar
  const [canaisSel, setCanaisSel] = useState<string[]>([]);

  // Estados para a IA de Descrições
  const [modoIA, setModoIA] = useState<"gerar" | "treinar">("gerar");
  const [chatMensagens, setChatMensagens] = useState<any[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [skuAlvo, setSkuAlvo] = useState("");
  const [skuReferencia, setSkuReferencia] = useState("");
  const [imagemAnexada, setImagemAnexada] = useState<{ base64: string; mimeType: string; nome: string } | null>(null);
  const [carregandoIA, setCarregandoIA] = useState(false);
  const [ultimaDescricaoGerada, setUltimaDescricaoGerada] = useState("");
  const [salvandoPadraoOficial, setSalvandoPadraoOficial] = useState(false);

  // Estados para Configuração / Busca por SKU no Histórico
  const [skuBuscaConfig, setSkuBuscaConfig] = useState("");
  const [resultadoBuscaConfig, setResultadoBuscaConfig] = useState<any>(null);
  const [buscandoConfig, setBuscandoConfig] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const formManualVazio = {
    sku: "", produto: "", cor: "", tamanho: "", ean: "", ncm: "", cest: "",
    custo: "", preco_venda: "", altura: "", largura: "", comprimento: "", marca: "BEST FIT",
  };
  const [formManual, setFormManual] = useState<any>(formManualVazio);
  const [editandoManualSku, setEditandoManualSku] = useState<string | null>(null);

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarDadosIniciais();
  }, []);

  const carregarDadosIniciais = async () => {
    setLoading(true);
    const { data: regrasCanais } = await supabase.from("config_regras_canais").select("canal").order("id");
    let listaCanais = ["Site", "Mercado Livre 1", "Mercado Livre 2", "Mercado Livre 3", "Shopee", "Magalu", "Netshoes", "Centauro", "Amazon", "Shein", "TikTok"];
    if (regrasCanais && regrasCanais.length > 0) {
      listaCanais = canaisSemRepeticao(regrasCanais.map((r: any) => r.canal));
    }
    setCanaisLista(listaCanais);

    await carregarPendentesDoBanco();
    await carregarRealizadosDoBanco();
    setLoading(false);
  };

  const carregarPendentesDoBanco = async () => {
    const { data } = await supabase.from("produtos_pendentes").select("*").order("id", { ascending: false });
    if (data) setDadosPendentes(data);
  };

  const carregarRealizadosDoBanco = async () => {
    const { data } = await supabase.from("produtos_novos_cadastrados").select("*").order("id", { ascending: false });
    if (data) setCadastrosRealizados(data);
  };

  const handleAnexarImagem = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result as string;
      if (result) {
        const parts = result.split(",");
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
        setImagemAnexada({ base64: parts[1], mimeType, nome: file.name });
      }
    };
    reader.readAsDataURL(file);
  };

  const buscarDescricaoPorSkuConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skuBuscaConfig.trim()) return;
    setBuscandoConfig(true);
    setResultadoBuscaConfig(null);

    try {
      const { data, error } = await supabase
        .from("historico_descricoes_ia")
        .select("*")
        .ilike("sku", `%${skuBuscaConfig.trim()}%`)
        .order("id", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        setResultadoBuscaConfig({ naoEncontrado: true });
      } else {
        setResultadoBuscaConfig(data);
      }
    } catch (err) {
      setResultadoBuscaConfig({ naoEncontrado: true });
    }
    setBuscandoConfig(false);
  };

  const excluirDescricaoHistorico = async (id: number, sku: string) => {
    if (!confirm(`Deseja realmente excluir o registo do histórico para o SKU ${sku}?`)) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("historico_descricoes_ia").delete().eq("id", id);
      if (error) throw error;
      alert(`✅ Registo do SKU ${sku} excluído com sucesso!`);
      setResultadoBuscaConfig(null);
      setSkuBuscaConfig("");
    } catch (err: any) {
      alert("Erro ao excluir: " + err.message);
    }
    setLoading(false);
  };

  const baixarPlanilhaTinySelecionados = async () => {
    if (skusSelecionados.length === 0) {
      alert("Selecione ao menos um produto na tabela para baixar a planilha do Tiny.");
      return;
    }

    try {
      setLoading(true);
      // agrupa por produto pai e manda em lotes pequenos (3 pais por vez): a IA gera uma descrição por pai e um lote grande pode estourar o tempo do servidor
      const porPai = new Map<string, string[]>();
      skusSelecionados.forEach((sku) => {
        const it = dadosPendentes.find((p: any) => p.sku === sku);
        const pai = it?.sku_pai || (sku.length > 5 ? sku.substring(0, 5) : sku);
        porPai.set(pai, [...(porPai.get(pai) || []), sku]);
      });
      const lotes: string[][] = [];
      let atual: string[] = [];
      let paisNoLote = 0;
      for (const lista of porPai.values()) {
        atual.push(...lista);
        paisNoLote++;
        if (paisNoLote >= 3) { lotes.push(atual); atual = []; paisNoLote = 0; }
      }
      if (atual.length) lotes.push(atual);

      const linhas: any[] = [];
      const resumo = {
        produtos: 0, medidasReais: 0, medidasProprias: 0, medidasDoPadrao: 0, genericas: 0, skusGenericos: [] as string[],
        descricoes: { modeloIA: 0, modeloIgual: 0, historico: 0, iaSemModelo: 0, textoPadrao: 0 },
        paisSemIA: [] as string[],
        motivosIA: [] as string[],
        iaUsada: {} as Record<string, number>,
        avisosIA: [] as string[],
      };
      for (let i = 0; i < lotes.length; i++) {
        const res = await fetch("/api/exportar-tiny", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skus: lotes[i] })
        });
        const texto = await res.text();
        let data: any = {};
        try { data = JSON.parse(texto); } catch { /* corpo vazio ou não-JSON */ }
        if (!res.ok || !data.dados) {
          const motivo = data.error
            || (texto ? `resposta inesperada do servidor (HTTP ${res.status}): ${texto.replace(/\s+/g, " ").slice(0, 140)}` : `o servidor não devolveu resposta (HTTP ${res.status}) — provavelmente demorou demais`);
          throw new Error(`${motivo}${lotes.length > 1 ? ` [lote ${i + 1} de ${lotes.length}]` : ""}`);
        }
        linhas.push(...data.dados);
        if (data.resumo) {
          resumo.produtos += data.resumo.produtos || 0;
          resumo.medidasReais += data.resumo.medidasReais || 0;
          resumo.medidasProprias += data.resumo.medidasProprias || 0;
          resumo.medidasDoPadrao += data.resumo.medidasDoPadrao || 0;
          resumo.genericas += data.resumo.genericas || 0;
          resumo.skusGenericos.push(...(data.resumo.skusGenericos || []));
          const dd = data.resumo.descricoes || {};
          (Object.keys(resumo.descricoes) as (keyof typeof resumo.descricoes)[]).forEach((k) => { resumo.descricoes[k] += dd[k] || 0; });
          resumo.paisSemIA.push(...(data.resumo.paisSemIA || []));
          (data.resumo.motivosIA || []).forEach((m: string) => { if (!resumo.motivosIA.includes(m)) resumo.motivosIA.push(m); });
          Object.entries(data.resumo.iaUsada || {}).forEach(([nome, n]) => { resumo.iaUsada[nome] = (resumo.iaUsada[nome] || 0) + Number(n || 0); });
          (data.resumo.avisosIA || []).forEach((m: string) => { if (!resumo.avisosIA.includes(m)) resumo.avisosIA.push(m); });
        }
      }

      const worksheet = XLSX.utils.json_to_sheet(linhas);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Produtos Tiny");
      XLSX.writeFile(workbook, `produtos_tiny_${Date.now()}.xlsx`);

      const d = resumo.descricoes;
      const linhasDescricao = [
        d.modeloIA ? `- ${d.modeloIA} produto(s) pai: a IA leu o modelo da Padronização e adaptou título, descrição, SEO e palavras-chave` : "",
        d.modeloIgual ? `- ${d.modeloIgual} produto(s) pai: mesmo nome do modelo, texto copiado do modelo` : "",
        d.historico ? `- ${d.historico} produto(s) pai: texto já salvo no histórico do SKU` : "",
        d.iaSemModelo ? `- ${d.iaSemModelo} produto(s) pai: sem modelo parecido, a IA escreveu do zero` : "",
        d.textoPadrao ? `- ${d.textoPadrao} produto(s) pai: texto padrão genérico` : "",
      ].filter(Boolean).join("\n");
      const iaTexto = Object.entries(resumo.iaUsada).map(([nome, n]) => `${nome}: ${n}`).join(" · ");
      alert(
        `✅ Planilha gerada com ${resumo.produtos} produto(s).\n\nDescrições:\n${linhasDescricao}` +
        (iaTexto ? `\n\n🤖 IA que respondeu (produtos pai) — ${iaTexto}` : "") +
        (resumo.avisosIA.length ? `\n↪ A IA principal falhou e a reserva assumiu: ${resumo.avisosIA.join(" | ")}` : "") +
        (resumo.paisSemIA.length ? `\n\n⚠️ A IA não foi aproveitada e a descrição saiu genérica: ${resumo.paisSemIA.join(", ")}` : "") +
        (resumo.motivosIA.length ? `\n\nMotivo: ${resumo.motivosIA.join(" | ")}` : "") +
        `\n\nMedidas da embalagem:\n` +
        `- ${resumo.medidasReais} com as medidas e o peso reais da aba Dimensões e Peso\n` +
        `- ${resumo.medidasProprias} com as medidas informadas no cadastro\n` +
        `- ${resumo.medidasDoPadrao} com as medidas do modelo da aba Padronização\n` +
        `- ${resumo.genericas} com medidas genéricas (20x20x20 cm, 0,5 kg)` +
        (resumo.skusGenericos.length ? `\n\nSem medidas (revise no Tiny): ${resumo.skusGenericos.slice(0, 12).join(", ")}${resumo.skusGenericos.length > 12 ? "…" : ""}` : "")
      );
    } catch (err: any) {
      alert("Erro ao exportar: " + err.message);
    }
    setLoading(false);
  };

  const handleUploadPendentes = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result;
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        let idxHeader = -1;
        for (let i = 0; i < Math.min(json.length, 10); i++) {
          const row = json[i];
          if (row && row.some((cell: any) => /sku/i.test(String(cell)))) {
            idxHeader = i;
            break;
          }
        }
        if (idxHeader === -1) idxHeader = 2;

        const headers = json[idxHeader].map((h: any) => String(h || "").trim());
        const getCol = (nameRegex: RegExp) => headers.findIndex((h: string) => nameRegex.test(h));

        const idxSku = getCol(/sku/i);
        const idxNome = getCol(/nome do produto|produto/i);
        const idxCor = getCol(/cor/i);
        const idxTam = getCol(/tamanho/i);
        const idxNcm = getCol(/ncm/i);
        const idxCest = getCol(/cest/i);
        const idxEan = getCol(/ean/i);
        const idxCusto = getCol(/custo/i);
        const idxPreco = getCol(/preço venda|preco|venda/i);
        const idxMarca = getCol(/marca/i);
        const idxQtdEcom = getCol(/qtdd ecom|ecom/i);
        const idxAtivo = getCol(/ativo/i);
        const idxAltura = getCol(/altura/i);
        const idxLargura = getCol(/largura/i);
        const idxComp = getCol(/comprimento|cumprimento/i);
        const medida = (row: any[], idx: number) => {
          if (idx === -1) return null;
          const v = String(row[idx] ?? "").trim().replace(",", ".");
          const n = Number(v);
          return v !== "" && Number.isFinite(n) && n > 0 ? n : null;
        };

        const skusExistentesSet = new Set([
          ...dadosPendentes.map((c: any) => String(c.sku).trim().toLowerCase()),
          ...cadastrosRealizados.map((c: any) => String(c.sku).trim().toLowerCase())
        ]);

        const novosRegistros: any[] = [];
        let ignoradosAtivoSim = 0;
        let ignoradosDuplicados = 0;

        for (let i = idxHeader + 1; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;

          const skuVal = idxSku !== -1 ? String(row[idxSku] || "").trim() : String(row[0] || "").trim();
          if (!skuVal || skuVal.length < 5 || /sku/i.test(skuVal)) continue;

          const ativoVal = idxAtivo !== -1 ? String(row[idxAtivo] || "").trim().toLowerCase() : "";
          if (ativoVal === "sim" || ativoVal === "true" || ativoVal === "1") {
            ignoradosAtivoSim++;
            continue;
          }

          const skuLower = skuVal.toLowerCase();
          if (skusExistentesSet.has(skuLower)) {
            ignoradosDuplicados++;
            continue;
          }
          skusExistentesSet.add(skuLower);

          const skuPai = skuVal.length > 5 ? skuVal.substring(0, 5) : skuVal;

          novosRegistros.push({
            sku: skuVal,
            sku_pai: skuPai,
            produto: idxNome !== -1 ? String(row[idxNome] || "").trim() : "Produto sem nome",
            cor: idxCor !== -1 ? String(row[idxCor] || "").trim() : "",
            tamanho: idxTam !== -1 ? String(row[idxTam] || "").trim() : "",
            ncm: idxNcm !== -1 ? String(row[idxNcm] || "").trim() : "",
            cest: idxCest !== -1 ? String(row[idxCest] || "").trim() : "",
            ean: idxEan !== -1 ? String(row[idxEan] || "").trim() : "",
            custo: idxCusto !== -1 ? Number(row[idxCusto]) || 0 : 0,
            preco_venda: idxPreco !== -1 ? Number(row[idxPreco]) || 0 : 0,
            marca: idxMarca !== -1 ? String(row[idxMarca] || "").trim() : "BEST FIT",
            qtdd_ecom: idxQtdEcom !== -1 ? Number(row[idxQtdEcom]) || 0 : 0,
            altura: medida(row, idxAltura),
            largura: medida(row, idxLargura),
            comprimento: medida(row, idxComp),
          });
        }

        if (novosRegistros.length > 0) {
          await supabase.from("produtos_pendentes").upsert(novosRegistros, { onConflict: "sku" });
          await carregarPendentesDoBanco();
        }
        alert(`Planilha importada com sucesso!\n- Adicionados: ${novosRegistros.length}\n- Ignorados (Ativo=Sim): ${ignoradosAtivoSim}\n- Ignorados (Duplicados): ${ignoradosDuplicados}`);
      } catch (err: any) {
        alert("Erro ao ler planilha: " + err.message);
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const abrirManualNovo = () => { setEditandoManualSku(null); setFormManual(formManualVazio); setModalAberto(true); };
  const abrirManualEdicao = (item: any) => {
    const t = (v: any) => (v === null || v === undefined ? "" : String(v));
    setEditandoManualSku(item.sku);
    setFormManual({
      sku: t(item.sku), produto: t(item.produto), cor: t(item.cor), tamanho: t(item.tamanho), ean: t(item.ean), ncm: t(item.ncm), cest: t(item.cest),
      custo: t(item.custo), preco_venda: t(item.preco_venda), altura: t(item.altura), largura: t(item.largura), comprimento: t(item.comprimento),
      marca: t(item.marca) || "BEST FIT",
    });
    setModalAberto(true);
  };

  const handleSalvarManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const sku = String(formManual.sku || "").trim();
    const produto = String(formManual.produto || "").trim();
    if (!sku || !produto) {
      alert("Preencha ao menos o SKU e o Nome do Produto.");
      return;
    }
    const num = (v: any): number | null => {
      if (v === "" || v === null || v === undefined) return null;
      const n = Number(String(v).replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };
    const txt = (v: any) => { const t = String(v ?? "").trim(); return t === "" ? null : t; };

    setLoading(true);
    const payload: any = {
      sku,
      sku_pai: sku.length > 5 ? sku.substring(0, 5) : sku,
      produto,
      cor: txt(formManual.cor), tamanho: txt(formManual.tamanho), ean: txt(formManual.ean), ncm: txt(formManual.ncm), cest: txt(formManual.cest),
      custo: num(formManual.custo) ?? 0, preco_venda: num(formManual.preco_venda) ?? 0,
      altura: num(formManual.altura), largura: num(formManual.largura), comprimento: num(formManual.comprimento),
      marca: txt(formManual.marca) || "BEST FIT",
    };
    if (!editandoManualSku) payload.qtdd_ecom = 0;

    let error: { message: string } | null = null;
    if (editandoManualSku && sku !== editandoManualSku) {
      // SKU corrigido: atualiza a mesma linha (não cria outra) e recusa se o SKU novo já existe nos pendentes
      const { data: duplicado } = await supabase.from("produtos_pendentes").select("id").eq("sku", sku).maybeSingle();
      if (duplicado) { setLoading(false); alert(`Já existe um produto pendente com o SKU ${sku}.`); return; }
      ({ error } = await supabase.from("produtos_pendentes").update(payload).eq("sku", editandoManualSku));
    } else {
      ({ error } = await supabase.from("produtos_pendentes").upsert([payload], { onConflict: "sku" }));
    }
    if (error) {
      alert("Erro ao salvar: " + error.message);
    } else {
      alert(editandoManualSku ? "✅ Produto atualizado!" : "✅ Produto adicionado aos Pendentes com sucesso!");
      setModalAberto(false);
      setEditandoManualSku(null);
      setFormManual(formManualVazio);
      carregarPendentesDoBanco();
    }
    setLoading(false);
  };

  const enviarParaIA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() && !skuAlvo && !imagemAnexada) return;

    const textoUsuario = modoIA === "treinar" 
      ? `[MODO TREINAMENTO / CORREÇÃO] ${inputPrompt}` 
      : (inputPrompt || `Gerar descrição padronizada para o SKU Alvo: ${skuAlvo}`);

    const novaMsgUsuario = { remetente: "usuario", texto: `${textoUsuario} ${imagemAnexada ? `[📷 Imagem Anexada: ${imagemAnexada.nome}]` : ""}` };
    
    setChatMensagens(prev => [...prev, novaMsgUsuario]);
    setInputPrompt("");
    const imgParaEnviar = imagemAnexada;
    setImagemAnexada(null);
    setCarregandoIA(true);

    try {
      const res = await fetch("/api/descricao-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: textoUsuario, 
          skuAlvo, 
          skuReferencia,
          modo: modoIA,
          imagemBase64: imgParaEnviar?.base64,
          mimeType: imgParaEnviar?.mimeType
        })
      });
      const data = await res.json();

      if (res.ok && data.resposta) {
        setChatMensagens(prev => [...prev, { remetente: "ia", texto: data.resposta }]);
        setUltimaDescricaoGerada(data.resposta);
      } else {
        setChatMensagens(prev => [...prev, { remetente: "ia", texto: `Erro detalhado: ${data.error || "Falha desconhecida"}` }]);
      }
    } catch (err: any) {
      setChatMensagens(prev => [...prev, { remetente: "ia", texto: "Erro de conexão: " + err.message }]);
    }
    setCarregandoIA(false);
  };

  const salvarComoPadraoOficial = async () => {
    if (!ultimaDescricaoGerada) {
      alert("Nenhuma descrição gerada para salvar.");
      return;
    }

    setSalvandoPadraoOficial(true);
    try {
      const { error } = await supabase.from("padroes_anuncios").insert([
        {
          titulo: skuAlvo ? `Produto SKU ${skuAlvo}` : "Modelo Padrão IA",
          marca: "BEST FIT",
          descricao_complementar: ultimaDescricaoGerada,
        },
      ]);

      if (error) throw error;
      alert("✅ Sucesso! O texto gerado foi salvo explicitamente como padrão oficial na base de dados.");
    } catch (err: any) {
      alert("Erro ao salvar padrão: " + err.message);
    }
    setSalvandoPadraoOficial(false);
  };

  const excluirPendenteIndividual = async (sku: string) => {
    if (!confirm(`Deseja remover o SKU ${sku} dos pendentes?`)) return;
    await supabase.from("produtos_pendentes").delete().eq("sku", sku);
    carregarPendentesDoBanco();
  };

  const excluirRealizadoGrupo = async (paiKey: string, itensDoGrupo: any[]) => {
    if (!confirm(`ATENÇÃO: Deseja excluir o grupo Pai ${paiKey} e todas as suas variações da aba de Canais?`)) return;
    setLoading(true);
    try {
      const skusParaExcluir = itensDoGrupo.map(i => i.sku);
      await supabase.from("produtos_novos_cadastrados").delete().eq("sku_pai", paiKey);
      for (const s of skusParaExcluir) {
        await supabase.from("produtos_novos_cadastrados").delete().eq("sku", s);
      }
      await carregarRealizadosDoBanco();
      alert(`🗑️ Grupo Pai ${paiKey} excluído com sucesso!`);
    } catch (err: any) {
      alert("Erro: " + err.message);
    }
    setLoading(false);
  };

  const limparTodosPendentes = async () => {
    if (!confirm("Deseja apagar TODOS os produtos pendentes?")) return;
    await supabase.from("produtos_pendentes").delete().neq("id", 0);
    setDadosPendentes([]);
    setSkusSelecionados([]);
  };

  const enviarParaRealizados = async (item: any) => {
    setLoading(true);
    try {
      const { error } = await supabase.from("produtos_novos_cadastrados").upsert([{
        sku: item.sku,
        sku_pai: item.sku_pai || item.sku.substring(0, 5),
        produto: item.produto,
        marca: item.marca,
        custo: item.custo,
        preco_venda: item.preco_venda,
        cor: item.cor,
        tamanho: item.tamanho,
        altura: item.altura ?? null,
        largura: item.largura ?? null,
        comprimento: item.comprimento ?? null,
        ncm: item.ncm ?? null,
        cest: item.cest ?? null,
        ean: item.ean ?? null,
        qtdd_ecom: item.qtdd_ecom ?? 0,
        data_cadastro: new Date().toISOString(),
        canais_enviados: {},
        clipes_enviados: {}
      }], { onConflict: "sku" });

      if (error) throw error;
      await supabase.from("produtos_pendentes").delete().eq("sku", item.sku);

      await supabase.from("cadastros_base_tiny").upsert({ sku: item.sku, produto: item.produto, estoque: 0 }, { onConflict: "sku" });
      await supabase.from("tabela_custos_skus").upsert({ sku: item.sku, produto: item.produto, marca: item.marca || "BEST FIT", custo_unitario: Number(item.custo || 0) }, { onConflict: "sku" });

      await carregarPendentesDoBanco();
      await carregarRealizadosDoBanco();
      alert(`🚀 SKU ${item.sku} cadastrado com sucesso!`);
    } catch (err: any) {
      alert("Erro: " + err.message);
    }
    setLoading(false);
  };

  const cadastrarSelecionados = async () => {
    if (skusSelecionados.length === 0) return;
    if (!confirm(`Deseja cadastrar os ${skusSelecionados.length} produtos selecionados de uma vez?`)) return;

    setLoading(true);
    try {
      const itensParaCadastrar = dadosPendentes.filter(p => skusSelecionados.includes(p.sku));

      for (const item of itensParaCadastrar) {
        await supabase.from("produtos_novos_cadastrados").upsert([{
          sku: item.sku,
          sku_pai: item.sku_pai || item.sku.substring(0, 5),
          produto: item.produto,
          marca: item.marca,
          custo: item.custo,
          preco_venda: item.preco_venda,
          cor: item.cor,
          tamanho: item.tamanho,
          altura: item.altura ?? null,
          largura: item.largura ?? null,
          comprimento: item.comprimento ?? null,
          ncm: item.ncm ?? null,
          cest: item.cest ?? null,
          ean: item.ean ?? null,
          qtdd_ecom: item.qtdd_ecom ?? 0,
          data_cadastro: new Date().toISOString(),
          canais_enviados: {},
          clipes_enviados: {}
        }], { onConflict: "sku" });

        await supabase.from("produtos_pendentes").delete().eq("sku", item.sku);

        await supabase.from("cadastros_base_tiny").upsert({ sku: item.sku, produto: item.produto, estoque: 0 }, { onConflict: "sku" });
        await supabase.from("tabela_custos_skus").upsert({ sku: item.sku, produto: item.produto, marca: item.marca || "BEST FIT", custo_unitario: Number(item.custo || 0) }, { onConflict: "sku" });
      }

      setSkusSelecionados([]);
      await carregarPendentesDoBanco();
      await carregarRealizadosDoBanco();
      alert(`✅ ${itensParaCadastrar.length} produtos cadastrados com sucesso em massa!`);
    } catch (err: any) {
      alert("Erro ao cadastrar em massa: " + err.message);
    }
    setLoading(false);
  };

  const toggleSelecionarTodos = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSkusSelecionados(pendentesFiltrados.map(p => p.sku));
    } else {
      setSkusSelecionados([]);
    }
  };

  const toggleSelecionarSku = (sku: string) => {
    if (skusSelecionados.includes(sku)) {
      setSkusSelecionados(skusSelecionados.filter(s => s !== sku));
    } else {
      setSkusSelecionados([...skusSelecionados, sku]);
    }
  };

  const toggleCanalPai = async (paiKey: string, canal: string, checked: boolean) => {
    try {
      const atualizados = [...cadastrosRealizados];
      const alvos = atualizados.filter(i => (i.sku_pai || i.sku.substring(0, 5)) === paiKey);

      for (const alvo of alvos) {
        const canais = alvo.canais_enviados || {};
        canais[canal] = checked;
        alvo.canais_enviados = canais;

        await supabase.from("produtos_novos_cadastrados").update({ canais_enviados: canais }).eq("sku", alvo.sku);
      }
      setCadastrosRealizados(atualizados);
    } catch (err) {
      console.error(err);
    }
  };

  const agruparPorPai = (lista: any[]) => {
    const grupos: { [pai: string]: any[] } = {};
    lista.forEach(item => {
      const pai = item.sku_pai || (item.sku.length > 5 ? item.sku.substring(0, 5) : item.sku);
      if (!grupos[pai]) grupos[pai] = [];
      grupos[pai].push(item);
    });
    return grupos;
  };

  const filtrarLista = (lista: any[]) => {
    return lista.filter(item => {
      const matchPesquisa = 
        String(item.sku || "").toLowerCase().includes(pesquisaGlobal.toLowerCase()) ||
        String(item.produto || "").toLowerCase().includes(pesquisaGlobal.toLowerCase()) ||
        String(item.sku_pai || "").toLowerCase().includes(pesquisaGlobal.toLowerCase()) ||
        String(item.marca || "").toLowerCase().includes(pesquisaGlobal.toLowerCase()) ||
        String(item.cor || "").toLowerCase().includes(pesquisaGlobal.toLowerCase()) ||
        String(item.tamanho || "").toLowerCase().includes(pesquisaGlobal.toLowerCase()) ||
        String(item.ncm || "").toLowerCase().includes(pesquisaGlobal.toLowerCase()) ||
        String(item.ean || "").toLowerCase().includes(pesquisaGlobal.toLowerCase());
      
      if (!matchPesquisa) return false;

      if (subAba === "canais") {
        const canais = item.canais_enviados || {};
        const totalCanais = canaisLista.length;
        const marcados = canaisLista.filter(c => canais[c]).length;
        const isCompleto = totalCanais > 0 && marcados === totalCanais;

        if (filtroStatusRealizados === "completos" && !isCompleto) return false;
        if (filtroStatusRealizados === "parciais" && (isCompleto || marcados === 0)) return false;

        if (filtroCanalEspecifico !== "todos" && !canais[filtroCanalEspecifico]) return false;
      }

      return true;
    });
  };

  const pendentesFiltrados = filtrarLista(dadosPendentes);
  const realizadosFiltrados = filtrarLista(cadastrosRealizados);
  const gruposRealizados = agruparPorPai(realizadosFiltrados);
  const chavesGrupos = Object.keys(gruposRealizados);

  const toggleExpandirGrupo = (pai: string) => {
    setGruposExpandidos(prev => ({ ...prev, [pai]: !prev[pai] }));
  };

  // ---- Sub-aba Canais: selecionar SKUs para Excluir / Recadastrar ----
  // As ações valem só para o que está na tela (grupos exibidos na página atual), para nunca mexer em item escondido por filtro ou paginação.
  const skusVisiveisCanais = chavesGrupos.slice(0, itensPorPagina).flatMap(p => gruposRealizados[p].map((i: any) => i.sku as string));
  const selecionadosCanais = canaisSel.filter(s => skusVisiveisCanais.includes(s));
  const noLotes = <T,>(lista: T[], tam = 100) => Array.from({ length: Math.ceil(lista.length / tam) }, (_, i) => lista.slice(i * tam, (i + 1) * tam));

  const toggleSkuCanais = (sku: string) =>
    setCanaisSel(prev => (prev.includes(sku) ? prev.filter(s => s !== sku) : [...prev, sku]));

  const toggleGrupoCanais = (itens: any[], marcar: boolean) => {
    const skus = itens.map(i => i.sku as string);
    setCanaisSel(prev => (marcar ? Array.from(new Set([...prev, ...skus])) : prev.filter(s => !skus.includes(s))));
  };

  const toggleTodosCanais = (marcar: boolean) =>
    setCanaisSel(prev => (marcar ? Array.from(new Set([...prev, ...skusVisiveisCanais])) : prev.filter(s => !skusVisiveisCanais.includes(s))));

  const excluirSelecionadosCanais = async () => {
    const skus = selecionadosCanais;
    if (skus.length === 0) return;
    if (!confirm(`Excluir ${skus.length} SKU(s) da aba de Canais?\n\nEles somem daqui junto com as marcações de canais e de clipes. (O custo e o cadastro-base do SKU não são apagados.)`)) return;
    setLoading(true);
    try {
      for (const lote of noLotes(skus)) {
        const { error } = await supabase.from("produtos_novos_cadastrados").delete().in("sku", lote);
        if (error) throw error;
      }
      setCanaisSel(prev => prev.filter(s => !skus.includes(s)));
      await carregarRealizadosDoBanco();
      alert(`🗑️ ${skus.length} SKU(s) excluído(s) da aba de Canais.`);
    } catch (err: any) {
      await carregarRealizadosDoBanco();
      alert("Erro ao excluir: " + err.message);
    }
    setLoading(false);
  };

  // Devolve os SKUs para os Pendentes (com todos os dados, para editar e cadastrar de novo) e tira da aba de Canais.
  const recadastrarSelecionadosCanais = async () => {
    const skus = selecionadosCanais;
    if (skus.length === 0) return;
    if (!confirm(`Recadastrar ${skus.length} SKU(s)?\n\nEles voltam para a aba Pendentes (você pode editar e cadastrar de novo) e saem de Canais. As marcações de canais e de clipes deles são zeradas.`)) return;
    setLoading(true);
    try {
      const itens = cadastrosRealizados.filter(i => skus.includes(i.sku));
      const registros = itens.map((i: any) => ({
        sku: i.sku,
        sku_pai: i.sku_pai || (i.sku.length > 5 ? i.sku.substring(0, 5) : i.sku),
        produto: i.produto,
        marca: i.marca,
        cor: i.cor,
        tamanho: i.tamanho,
        ncm: i.ncm ?? null,
        cest: i.cest ?? null,
        ean: i.ean ?? null,
        custo: i.custo,
        preco_venda: i.preco_venda,
        qtdd_ecom: i.qtdd_ecom ?? 0,
        altura: i.altura ?? null,
        largura: i.largura ?? null,
        comprimento: i.comprimento ?? null,
      }));
      // primeiro grava nos Pendentes; só depois tira de Canais (se algo falhar, nada se perde)
      for (const lote of noLotes(registros)) {
        const { error } = await supabase.from("produtos_pendentes").upsert(lote, { onConflict: "sku" });
        if (error) throw error;
      }
      for (const lote of noLotes(itens.map((i: any) => i.sku as string))) {
        const { error } = await supabase.from("produtos_novos_cadastrados").delete().in("sku", lote);
        if (error) throw error;
      }
      setCanaisSel(prev => prev.filter(s => !skus.includes(s)));
      await carregarPendentesDoBanco();
      await carregarRealizadosDoBanco();
      alert(`🔁 ${registros.length} SKU(s) voltaram para Pendentes. É só editar (✏️) e clicar em Cadastrar de novo.`);
    } catch (err: any) {
      await carregarPendentesDoBanco();
      await carregarRealizadosDoBanco();
      alert("Erro ao recadastrar: " + err.message);
    }
    setLoading(false);
  };

  const realizadosFiltradosPorPeriodo = cadastrosRealizados.filter(item => {
    if (!dataInicio && !dataFim) return true;
    const dataItem = new Date(item.data_cadastro || Date.now());
    if (dataInicio && dataItem < new Date(dataInicio)) return false;
    if (dataFim && dataItem > new Date(dataFim + "T23:59:59")) return false;
    return true;
  });

  const totalSkusRealizados = realizadosFiltradosPorPeriodo.length;

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Novos Cadastros</h1>
            <p className="text-sm font-medium text-slate-400">Produtos pendentes, cadastros realizados por canal, descrições com IA e produção por período</p>
          </div>
          <Navbar />
        </div>

        <div className="flex flex-wrap justify-between items-center gap-4 bg-slate-900 p-3 rounded-2xl border border-slate-800">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 flex-wrap gap-1">
            <button
              onClick={() => setSubAba("pendentes")}
              className={`px-4 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer transition-all ${
                subAba === "pendentes" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Pendentes ({dadosPendentes.length})
            </button>
            <button
              onClick={() => setSubAba("canais")}
              className={`px-4 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer transition-all ${
                subAba === "canais" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              🛒 Canais ({cadastrosRealizados.length})
            </button>
            <button
              onClick={() => setSubAba("periodo")}
              className={`px-4 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer transition-all ${
                subAba === "periodo" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Período & Gráficos
            </button>
            <button
              onClick={() => setSubAba("descricoes")}
              className={`px-4 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer transition-all ${
                subAba === "descricoes" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              ✨ Descrições IA
            </button>
            <button
              onClick={() => setSubAba("config")}
              className={`px-4 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer transition-all ${
                subAba === "config" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              ⚙️ Configurações
            </button>
          </div>

          {/* Oculta a pesquisa global na aba de descrições */}
          {subAba !== "descricoes" && (
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={pesquisaGlobal}
                onChange={(e) => setPesquisaGlobal(e.target.value)}
                placeholder="🔍 Pesquisar SKU, Pai, Nome..."
                className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white outline-none w-80"
              />
            </div>
          )}
        </div>

        {subAba === "pendentes" && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl flex justify-between items-center flex-wrap gap-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase">Upload de Planilha de Produtos a Cadastrar</h3>
                <p className="text-xs text-slate-400 mt-1">Selecione os produtos abaixo e baixe a planilha pronta para o Tiny ou cadastre em massa.</p>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                {skusSelecionados.length > 0 && (
                  <>
                    <button
                      onClick={baixarPlanilhaTinySelecionados}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg cursor-pointer flex items-center gap-1.5"
                    >
                      📥 Baixar Planilha Tiny ({skusSelecionados.length})
                    </button>
                    <button
                      onClick={cadastrarSelecionados}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg cursor-pointer"
                    >
                      🚀 Cadastrar Selecionados ({skusSelecionados.length})
                    </button>
                  </>
                )}
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleUploadPendentes}
                  className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:bg-purple-600 file:text-white cursor-pointer"
                />
                {dadosPendentes.length > 0 && (
                  <button onClick={limparTodosPendentes} className="bg-rose-950 hover:bg-rose-900 text-rose-300 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer">🗑️ Limpar Todos</button>
                )}
                <button onClick={abrirManualNovo} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold cursor-pointer">+ Manual</button>
              </div>
            </div>

            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden p-6">
              <div className="overflow-x-auto max-h-[550px]">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-slate-950 sticky top-0 text-slate-400 font-bold uppercase text-[10px] z-10">
                    <tr>
                      <th className="p-3 text-center w-10">
                        <input
                          type="checkbox"
                          checked={pendentesFiltrados.length > 0 && skusSelecionados.length === pendentesFiltrados.length}
                          onChange={toggleSelecionarTodos}
                          className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                        />
                      </th>
                      <th className="p-3">SKU / Pai</th>
                      <th className="p-3">Nome do Produto</th>
                      <th className="p-3">Cor</th>
                      <th className="p-3">Tam</th>
                      <th className="p-3">NCM</th>
                      <th className="p-3">CEST</th>
                      <th className="p-3">EAN</th>
                      <th className="p-3">Medidas A×L×C (cm)</th>
                      <th className="p-3">Marca</th>
                      <th className="p-3 text-center">Qtd Ecom</th>
                      <th className="p-3 text-right">Custo</th>
                      <th className="p-3 text-right">Preço Venda</th>
                      <th className="p-3 text-center sticky right-0 bg-slate-950 shadow-l">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {pendentesFiltrados.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={skusSelecionados.includes(item.sku)}
                            onChange={() => toggleSelecionarSku(item.sku)}
                            className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-mono">
                          <span className="text-purple-400 font-bold">Pai: {item.sku_pai}</span><br/>
                          <span className="text-indigo-300">Var: {item.sku}</span>
                        </td>
                        <td className="p-3 text-white">{item.produto}</td>
                        <td className="p-3 text-slate-300">{item.cor || "—"}</td>
                        <td className="p-3 text-slate-300">{item.tamanho || "—"}</td>
                        <td className="p-3 text-slate-300 font-mono">{item.ncm || "—"}</td>
                        <td className="p-3 text-slate-300 font-mono">{item.cest || "—"}</td>
                        <td className="p-3 text-slate-300 font-mono">{item.ean || "—"}</td>
                        <td className="p-3 text-slate-300 font-mono" data-medidas>{(item.altura || item.largura || item.comprimento) ? `${item.altura ?? "—"}×${item.largura ?? "—"}×${item.comprimento ?? "—"}` : "—"}</td>
                        <td className="p-3 text-slate-300">{item.marca || "—"}</td>
                        <td className="p-3 text-center text-slate-300">{item.qtdd_ecom}</td>
                        <td className="p-3 text-right font-mono text-rose-400">R$ {Number(item.custo).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-emerald-400">R$ {Number(item.preco_venda).toFixed(2)}</td>
                        <td className="p-3 text-center sticky right-0 bg-slate-950 shadow-l flex items-center justify-center gap-2">
                          <button onClick={() => abrirManualEdicao(item)} data-editar-pendente className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-1 rounded text-xs font-bold cursor-pointer" title="Editar produto">✏️</button>
                          <button onClick={() => enviarParaRealizados(item)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-xs font-bold cursor-pointer">Cadastrar</button>
                          <button onClick={() => excluirPendenteIndividual(item.sku)} className="bg-rose-950 hover:bg-rose-900 text-rose-400 px-2 py-1 rounded text-xs font-bold cursor-pointer">Excluir</button>
                        </td>
                      </tr>
                    ))}
                    {pendentesFiltrados.length === 0 && (
                      <tr>
                        <td colSpan={14} className="p-8 text-center text-slate-500">Nenhum produto pendente encontrado.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {subAba === "canais" && (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4 border-b border-slate-800 pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-slate-400 uppercase">Filtros:</span>
                <select value={filtroStatusRealizados} onChange={(e) => setFiltroStatusRealizados(e.target.value as any)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none cursor-pointer">
                  <option value="todos">Todos os Status</option>
                  <option value="completos">100% Concluídos</option>
                  <option value="parciais">Parcialmente Concluídos</option>
                </select>
                <select value={filtroCanalEspecifico} onChange={(e) => setFiltroCanalEspecifico(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none cursor-pointer">
                  <option value="todos">Todos os Canais</option>
                  {canaisLista.map((c, i) => <option key={i} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Exibir por página:</span>
                <select value={itensPorPagina} onChange={(e) => setItemsPorPagina(Number(e.target.value))} className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-white outline-none cursor-pointer">
                  <option value={5}>5 grupos</option>
                  <option value={10}>10 grupos</option>
                  <option value={20}>20 grupos</option>
                  <option value={50}>50 grupos</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5" data-barra-selecao-canais>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  data-selecionar-todos-canais
                  checked={skusVisiveisCanais.length > 0 && selecionadosCanais.length === skusVisiveisCanais.length}
                  onChange={(e) => toggleTodosCanais(e.target.checked)}
                  className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                />
                Selecionar todos os SKUs exibidos
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400" data-qtd-selecionados-canais>
                  {selecionadosCanais.length > 0 ? `${selecionadosCanais.length} SKU(s) selecionado(s)` : "Marque os itens para excluir ou recadastrar"}
                </span>
                <button
                  onClick={recadastrarSelecionadosCanais}
                  disabled={selecionadosCanais.length === 0 || loading}
                  data-recadastrar-canais
                  title="Devolve os SKUs marcados para a aba Pendentes, para editar e cadastrar de novo"
                  className="bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
                >
                  🔁 Recadastrar ({selecionadosCanais.length})
                </button>
                <button
                  onClick={excluirSelecionadosCanais}
                  disabled={selecionadosCanais.length === 0 || loading}
                  data-excluir-canais
                  className="bg-rose-950/80 hover:bg-rose-900 disabled:opacity-30 disabled:cursor-not-allowed text-rose-300 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
                >
                  🗑️ Excluir ({selecionadosCanais.length})
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {chavesGrupos.slice(0, itensPorPagina).map((paiKey, gIdx) => {
                const itensDoGrupo = gruposRealizados[paiKey];
                const expandido = Boolean(gruposExpandidos[paiKey]);
                const qtdMarcadosGrupo = itensDoGrupo.filter((i: any) => canaisSel.includes(i.sku)).length;

                return (
                  <div key={gIdx} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3" data-grupo-canais={paiKey}>
                    <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          data-selecionar-grupo={paiKey}
                          title="Marcar todas as variações deste pai"
                          checked={qtdMarcadosGrupo === itensDoGrupo.length}
                          ref={(el) => { if (el) el.indeterminate = qtdMarcadosGrupo > 0 && qtdMarcadosGrupo < itensDoGrupo.length; }}
                          onChange={(e) => toggleGrupoCanais(itensDoGrupo, e.target.checked)}
                          className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                        />
                        <button
                          onClick={() => toggleExpandirGrupo(paiKey)}
                          className="flex items-center gap-2 text-xs font-mono font-black text-purple-400 uppercase cursor-pointer hover:text-purple-300"
                        >
                          <span className={`transform transition-transform ${expandido ? "rotate-180" : ""}`}>▼</span>
                          SKU PAI: {paiKey} ({itensDoGrupo.length} variações)
                        </button>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] text-slate-500">Cadastrado em: {new Date(itensDoGrupo[0].data_cadastro || Date.now()).toLocaleDateString("pt-BR")}</span>
                        <button
                          onClick={() => excluirRealizadoGrupo(paiKey, itensDoGrupo)}
                          className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer"
                        >
                          🗑️ Excluir Grupo
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-[10px] text-slate-400 uppercase border-b border-slate-900">
                            <th className="p-2">SKU / Produto</th>
                            {canaisLista.map((canal, cIdx) => (
                              <th key={cIdx} className="p-2 text-center text-[9px]">{canal}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/50">
                          <tr className="bg-purple-950/20 font-bold">
                            <td className="p-2 text-purple-300 font-mono">Pai: {paiKey}</td>
                            {canaisLista.map((canal, cIdx) => {
                              const todosMarcados = itensDoGrupo.every(i => (i.canais_enviados || {})[canal]);

                              return (
                                <td key={cIdx} className="p-2 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[9px] text-slate-400 w-10 text-right">Cad:</span>
                                      <input
                                        type="checkbox"
                                        checked={todosMarcados}
                                        onChange={(e) => toggleCanalPai(paiKey, canal, e.target.checked)}
                                        className="w-3.5 h-3.5 accent-purple-600 rounded cursor-pointer"
                                      />
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>

                          {expandido && itensDoGrupo.map((item, vIdx) => (
                            <tr key={vIdx} className="bg-slate-900/20 text-slate-400">
                              <td className="p-2 pl-6" colSpan={1 + canaisLista.length}>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    data-selecionar-sku={item.sku}
                                    checked={canaisSel.includes(item.sku)}
                                    onChange={() => toggleSkuCanais(item.sku)}
                                    className="w-3.5 h-3.5 accent-purple-600 rounded cursor-pointer"
                                  />
                                  <span><span className="font-mono text-indigo-300 font-bold">↳ {item.sku}</span> — {item.produto} (Cor: {item.cor || "—"}, Tam: {item.tamanho || "—"})</span>
                                </label>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {subAba === "descricoes" && (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Construtor de Descrições Padronizado com IA</h3>
                <p className="text-xs text-slate-400 mt-1">Gere descrições exatas ou treine a IA com instruções/correções manuais.</p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-700">
                  <button
                    onClick={() => setModoIA("gerar")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${modoIA === "gerar" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"}`}
                  >
                    Modo Geração
                  </button>
                  <button
                    onClick={() => setModoIA("treinar")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${modoIA === "treinar" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"}`}
                  >
                    Modo Treinamento / Correção
                  </button>
                </div>

                <input
                  type="text"
                  value={skuAlvo}
                  onChange={(e) => setSkuAlvo(e.target.value)}
                  placeholder="SKU Alvo..."
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none w-28"
                />
                <input
                  type="text"
                  value={skuReferencia}
                  onChange={(e) => setSkuReferencia(e.target.value)}
                  placeholder="SKU Referência..."
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none w-28"
                />
              </div>
            </div>

            <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 h-[350px] overflow-y-auto space-y-4">
              {chatMensagens.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.remetente === "usuario" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-xs leading-relaxed ${
                    msg.remetente === "usuario" ? "bg-purple-600 text-white rounded-br-none" : "bg-slate-900 text-slate-200 border border-slate-800 rounded-bl-none whitespace-pre-wrap font-mono"
                  }`}>
                    {msg.texto}
                  </div>
                </div>
              ))}
              {carregandoIA && (
                <div className="flex justify-start">
                  <div className="bg-slate-900 text-slate-400 p-3 rounded-2xl text-xs animate-pulse">
                    {modoIA === "treinar" ? "Processando instrução de treinamento..." : "Analisando dados/imagem e gerando descrição padronizada..."}
                  </div>
                </div>
              )}
              {chatMensagens.length === 0 && (
                <div className="text-center text-slate-500 py-16 text-xs">
                  {modoIA === "gerar" 
                    ? "Informe o SKU Alvo, anexe foto se desejar, e solicite a geração da copy." 
                    : "Digite as regras, o que estava errado ou o formato esperado para treinar a IA."}
                </div>
              )}
            </div>

            <form onSubmit={enviarParaIA} className="flex gap-2 items-center flex-wrap">
              <label className="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 px-4 py-3 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-2">
                📷 {imagemAnexada ? "Imagem anexada (1)" : "Anexar Foto"}
                <input type="file" accept="image/*" onChange={handleAnexarImagem} className="hidden" />
              </label>
              {imagemAnexada && (
                <span className="text-[11px] text-purple-400 truncate max-w-[200px]">✓ {imagemAnexada.nome}</span>
              )}
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder={modoIA === "gerar" ? "Ex: Gere a descrição padrão para este produto..." : "Ex: Não inclua tamanho na descrição complementar..."}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-xs text-white outline-none"
              />
              <button type="submit" disabled={carregandoIA} className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-3 rounded-xl text-xs uppercase cursor-pointer transition-all shadow-lg">
                {modoIA === "gerar" ? "Gerar Copy" : "Aplicar Treinamento"}
              </button>
            </form>

            {ultimaDescricaoGerada && (
              <div className="pt-3 border-t border-slate-800 flex justify-between items-center bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Resultado pré-visualizado (não salvo automaticamente).</span>
                <button
                  type="button"
                  onClick={salvarComoPadraoOficial}
                  disabled={salvandoPadraoOficial}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase cursor-pointer transition-all shadow-lg"
                >
                  {salvandoPadraoOficial ? "Salvando..." : "✅ Aprovar e Salvar na Base de Padronização"}
                </button>
              </div>
            )}
          </div>
        )}

        {subAba === "config" && (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Gerenciar Histórico de Descrições por SKU</h3>
                <p className="text-xs text-slate-400 mt-1">Consulte ou remova dados salvos no Supabase para qualquer SKU.</p>
              </div>

              <form onSubmit={buscarDescricaoPorSkuConfig} className="flex gap-2 max-w-xl">
                <input
                  type="text"
                  value={skuBuscaConfig}
                  onChange={(e) => setSkuBuscaConfig(e.target.value)}
                  placeholder="Digite o SKU (ex: 22191)..."
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                />
                <button type="submit" disabled={buscandoConfig} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase cursor-pointer transition-all">
                  {buscandoConfig ? "Buscando..." : "Pesquisar"}
                </button>
              </form>

              {resultadoBuscaConfig && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 mt-4">
                  {resultadoBuscaConfig.naoEncontrado ? (
                    <p className="text-xs text-rose-400">Nenhum registo encontrado para este SKU no histórico.</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-[10px] text-slate-400 border-b border-slate-900 pb-2">
                        <span>SKU: <strong className="text-purple-400">{resultadoBuscaConfig.sku}</strong></span>
                        <span>Guardado em: {new Date(resultadoBuscaConfig.created_at || Date.now()).toLocaleString("pt-BR")}</span>
                      </div>
                      <pre className="text-xs text-slate-200 whitespace-pre-wrap font-mono leading-relaxed bg-slate-900/60 p-3 rounded-lg max-h-60 overflow-y-auto">
                        {resultadoBuscaConfig.resposta_ia}
                      </pre>
                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => excluirDescricaoHistorico(resultadoBuscaConfig.id, resultadoBuscaConfig.sku)}
                          className="bg-rose-950 hover:bg-rose-900 text-rose-300 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5"
                        >
                          🗑️ Excluir Registo do Supabase
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {subAba === "periodo" && (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Comparador de Períodos & Gráficos de Produção</h3>
                <p className="text-xs text-slate-400 mt-1">Filtre por período para comparar o volume de cadastros realizados. Os números de vídeos ficam em Relatórios › Vídeos.</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div>
                  <span className="text-slate-400 mr-2">De:</span>
                  <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white outline-none" />
                </div>
                <div>
                  <span className="text-slate-400 mr-2">Até:</span>
                  <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white outline-none" />
                </div>
                {(dataInicio || dataFim) && (
                  <button onClick={() => { setDataInicio(""); setDataFim(""); }} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-xl font-bold cursor-pointer">Limpar</button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">Cadastros Realizados</span>
                <p className="text-3xl font-black text-emerald-400 mt-2">{totalSkusRealizados}</p>
              </div>
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">Produtos Pendentes</span>
                <p className="text-3xl font-black text-amber-400 mt-2">{dadosPendentes.length}</p>
                <span className="text-[10px] text-slate-500 mt-1 block">Faltam cadastrar</span>
              </div>
            </div>
          </div>
        )}

        {modalAberto && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl p-6 space-y-4 my-auto">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white">{editandoManualSku ? `Editar Produto Pendente — ${editandoManualSku}` : "Inserir Produto Manualmente (Pendentes)"}</h3>
                <button onClick={() => { setModalAberto(false); setEditandoManualSku(null); }} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
              </div>
              <form onSubmit={handleSalvarManual} data-form-manual className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">SKU *</label>
                  <input type="text" required data-m-sku value={formManual.sku} onChange={(e) => setFormManual({...formManual, sku: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500" />
                </div>
                <div className="col-span-2 md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nome do Produto *</label>
                  <input type="text" required data-m-produto value={formManual.produto} onChange={(e) => setFormManual({...formManual, produto: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cor</label>
                  <input type="text" data-m-cor value={formManual.cor} onChange={(e) => setFormManual({...formManual, cor: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tamanho</label>
                  <input type="text" data-m-tamanho value={formManual.tamanho} onChange={(e) => setFormManual({...formManual, tamanho: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">EAN</label>
                  <input type="text" data-m-ean value={formManual.ean} onChange={(e) => setFormManual({...formManual, ean: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">NCM</label>
                  <input type="text" data-m-ncm value={formManual.ncm} onChange={(e) => setFormManual({...formManual, ncm: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">CEST</label>
                  <input type="text" data-m-cest value={formManual.cest} onChange={(e) => setFormManual({...formManual, cest: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Custo (R$)</label>
                  <input type="number" step="0.01" data-m-custo value={formManual.custo} onChange={(e) => setFormManual({...formManual, custo: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">PDV — Preço de venda (R$)</label>
                  <input type="number" step="0.01" data-m-preco_venda value={formManual.preco_venda} onChange={(e) => setFormManual({...formManual, preco_venda: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Marca</label>
                  <input type="text" data-m-marca value={formManual.marca} onChange={(e) => setFormManual({...formManual, marca: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Altura (cm)</label>
                  <input type="number" step="0.01" data-m-altura value={formManual.altura} onChange={(e) => setFormManual({...formManual, altura: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Largura (cm)</label>
                  <input type="number" step="0.01" data-m-largura value={formManual.largura} onChange={(e) => setFormManual({...formManual, largura: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Comprimento (cm)</label>
                  <input type="number" step="0.01" data-m-comprimento value={formManual.comprimento} onChange={(e) => setFormManual({...formManual, comprimento: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500" />
                </div>
                <p className="col-span-2 md:col-span-4 text-[10px] text-slate-500">Só SKU e Nome são obrigatórios. Ao corrigir o SKU, o produto é atualizado (não duplicado) e o SKU Pai é recalculado. Se as medidas ficarem em branco, a planilha do Tiny usa as do modelo parecido da aba Padronização e, se não houver, as genéricas (20×20×20 cm).</p>
                <div className="col-span-2 md:col-span-4 flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button type="button" onClick={() => { setModalAberto(false); setEditandoManualSku(null); }} className="bg-slate-800 px-4 py-2 rounded-xl text-white font-bold cursor-pointer">Cancelar</button>
                  <button type="submit" data-m-salvar className="bg-indigo-600 hover:bg-indigo-500 px-5 py-2 rounded-xl text-white font-bold cursor-pointer">Salvar</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}