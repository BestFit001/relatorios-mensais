"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import * as XLSX from "xlsx";

export default function ProdutosPage() {
  const router = useRouter();
  const [subAba, setSubAba] = useState<"pendentes" | "realizados" | "periodo" | "config" | "descricoes">("pendentes");
  const [loading, setLoading] = useState(false);

  const [dadosPendentes, setDadosPendentes] = useState<any[]>([]);
  const [cadastrosRealizados, setCadastrosRealizados] = useState<any[]>([]);
  const [canaisLista, setCanaisLista] = useState<string[]>([]);
  
  const [canaisComClipesConfig, setCanaisComClipesConfig] = useState<{ [canal: string]: boolean }>({});

  const [pesquisaGlobal, setPesquisaGlobal] = useState("");
  const [itensPorPagina, setItemsPorPagina] = useState(10);
  const [filtroStatusRealizados, setFiltroStatusRealizados] = useState<"todos" | "completos" | "parciais" | "clipes_pendentes">("todos");
  const [filtroCanalEspecifico, setFiltroCanalEspecifico] = useState<string>("todos");

  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [gruposExpandidos, setGruposExpandidos] = useState<{ [pai: string]: boolean }>({});
  const [skusSelecionados, setSkusSelecionados] = useState<string[]>([]);

  // Estados para a IA de Descrições com SKU Alvo, Referência e Anexo de Imagem
  const [chatMensagens, setChatMensagens] = useState<any[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [skuAlvo, setSkuAlvo] = useState("");
  const [skuReferencia, setSkuReferencia] = useState("");
  const [imagemAnexada, setImagemAnexada] = useState<{ base64: string; mimeType: string; nome: string } | null>(null);
  const [carregandoIA, setCarregandoIA] = useState(false);

  // Estados para a Consulta de Descrições na aba Configurações
  const [skuBuscaConfig, setSkuBuscaConfig] = useState("");
  const [resultadoBuscaConfig, setResultadoBuscaConfig] = useState<any>(null);
  const [buscandoConfig, setBuscandoConfig] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [formManual, setFormManual] = useState({
    sku: "", produto: "", cor: "", tamanho: "", ncm: "", cest: "", ean: "",
    custo: 0, preco_venda: 0, marca: "BEST FIT", qtdd_ecom: 0
  });

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
    let listaCanais = ["Site", "Mercado Livre 1", "Mercado Livre 2", "Mercado Livre 3", "Shopee", "Magazine Luiza", "Netshoes", "Centauro", "Amazon", "Shein", "TikTok"];
    if (regrasCanais && regrasCanais.length > 0) {
      listaCanais = regrasCanais.map((r: any) => r.canal);
    }
    setCanaisLista(listaCanais);

    const configSalva = localStorage.getItem("bestfit_canais_clipes_config");
    if (configSalva) {
      try {
        setCanaisComClipesConfig(JSON.parse(configSalva));
      } catch {
        inicializarConfigPadrao(listaCanais);
      }
    } else {
      inicializarConfigPadrao(listaCanais);
    }

    await carregarPendentesDoBanco();
    await carregarRealizadosDoBanco();
    setLoading(false);
  };

  const inicializarConfigPadrao = (listaCanais: string[]) => {
    const configIniciada: { [c: string]: boolean } = {};
    listaCanais.forEach(c => {
      configIniciada[c] = ["Shopee", "TikTok", "Mercado Livre 1", "Shein"].includes(c);
    });
    setCanaisComClipesConfig(configIniciada);
    localStorage.setItem("bestfit_canais_clipes_config", JSON.stringify(configIniciada));
  };

  const atualizarConfigCanal = (canal: string, checked: boolean) => {
    const novaConfig = { ...canaisComClipesConfig, [canal]: checked };
    setCanaisComClipesConfig(novaConfig);
    localStorage.setItem("bestfit_canais_clipes_config", JSON.stringify(novaConfig));
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
        // Separa o base64 puro do mimeType
        const parts = result.split(",");
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
        const base64Data = parts[1];

        setImagemAnexada({
          base64: base64Data,
          mimeType: mimeType,
          nome: file.name
        });
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
            qtdd_ecom: idxQtdEcom !== -1 ? Number(row[idxQtdEcom]) || 0 : 0
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

  const handleSalvarManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formManual.sku || !formManual.produto) {
      alert("Preencha ao menos o SKU e o Nome do Produto.");
      return;
    }

    setLoading(true);
    const skuPai = formManual.sku.length > 5 ? formManual.sku.substring(0, 5) : formManual.sku;
    const payload = { ...formManual, sku_pai: skuPai };

    const { error } = await supabase.from("produtos_pendentes").upsert([payload], { onConflict: "sku" });
    if (error) {
      alert("Erro ao salvar: " + error.message);
    } else {
      alert("✅ Produto adicionado aos Pendentes com sucesso!");
      setModalAberto(false);
      carregarPendentesDoBanco();
    }
    setLoading(false);
  };

  const enviarParaIA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() && !skuAlvo && !imagemAnexada) return;

    const textoUsuario = inputPrompt || `Gerar descrição padronizada para o SKU Alvo: ${skuAlvo}`;
    const novaMsgUsuario = { remetente: "usuario", texto: `${textoUsuario} ${imagemAnexada ? `[📷 Imagem Anexada: ${imagemAnexada.nome}]` : ""}` };
    
    setChatMensagens(prev => [...prev, novaMsgUsuario]);
    setInputPrompt("");
    const imgParaEnviar = imagemAnexada;
    setImagemAnexada(null); // Descarta a imagem da UI para manter apenas a base limpa
    setCarregandoIA(true);

    try {
      const res = await fetch("/api/descricao-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: textoUsuario, 
          skuAlvo, 
          skuReferencia,
          imagemBase64: imgParaEnviar?.base64,
          mimeType: imgParaEnviar?.mimeType
        })
      });
      const data = await res.json();

      if (res.ok && data.resposta) {
        setChatMensagens(prev => [...prev, { remetente: "ia", texto: data.resposta }]);
        
        await supabase.from("historico_descricoes_ia").insert([{
          sku: skuAlvo || skuReferencia || "GERAL",
          prompt_usuario: textoUsuario,
          resposta_ia: data.resposta
        }]);
      } else {
        setChatMensagens(prev => [...prev, { remetente: "ia", texto: `Erro detalhado: ${data.error || "Falha desconhecida"}` }]);
      }
    } catch (err: any) {
      setChatMensagens(prev => [...prev, { remetente: "ia", texto: "Erro de conexão: " + err.message }]);
    }
    setCarregandoIA(false);
  };

  const excluirPendenteIndividual = async (sku: string) => {
    if (!confirm(`Deseja remover o SKU ${sku} dos pendentes?`)) return;
    await supabase.from("produtos_pendentes").delete().eq("sku", sku);
    carregarPendentesDoBanco();
  };

  const excluirRealizadoGrupo = async (paiKey: string, itensDoGrupo: any[]) => {
    if (!confirm(`ATENÇÃO: Deseja excluir o grupo Pai ${paiKey} e todas as suas variações da aba de Realizados?`)) return;
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

  const toggleClipePai = async (paiKey: string, canal: string, checked: boolean) => {
    try {
      const atualizados = [...cadastrosRealizados];
      const alvos = atualizados.filter(i => (i.sku_pai || i.sku.substring(0, 5)) === paiKey);

      for (const alvo of alvos) {
        const clipes = alvo.clipes_enviados || {};
        clipes[canal] = checked;
        alvo.clipes_enviados = clipes;

        await supabase.from("produtos_novos_cadastrados").update({
          clipes_enviados: clipes,
          data_clipes: checked ? new Date().toISOString() : alvo.data_clipes
        }).eq("sku", alvo.sku);
      }
      setCadastrosRealizados(atualizados);
    } catch (err) {
      console.error(err);
    }
  };

  const agruparPorPai = (lista: any[]) => {
    const grupos: { [pai: string]: any[] } = {};
    lista.forEach(item => {
      const pai = item.sku_pai || item.sku.substring(0, 5);
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

      if (subAba === "realizados") {
        const canais = item.canais_enviados || {};
        const clipes = item.clipes_enviados || {};
        const totalCanais = canaisLista.length;
        const marcados = canaisLista.filter(c => canais[c]).length;
        const isCompleto = totalCanais > 0 && marcados === totalCanais;

        if (filtroStatusRealizados === "completos" && !isCompleto) return false;
        if (filtroStatusRealizados === "parciais" && (isCompleto || marcados === 0)) return false;
        
        if (filtroStatusRealizados === "clipes_pendentes") {
          const temClipePendente = canaisLista.some(c => canais[c] && !clipes[c] && canaisComClipesConfig[c]);
          if (!temClipePendente) return false;
        }

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

  const realizadosFiltradosPorPeriodo = cadastrosRealizados.filter(item => {
    if (!dataInicio && !dataFim) return true;
    const dataItem = new Date(item.data_cadastro || Date.now());
    if (dataInicio && dataItem < new Date(dataInicio)) return false;
    if (dataFim && dataItem > new Date(dataFim + "T23:59:59")) return false;
    return true;
  });

  const totalSkusRealizados = realizadosFiltradosPorPeriodo.length;
  let produtosComVideo = 0;
  let totalVideosPostados = 0;

  realizadosFiltradosPorPeriodo.forEach(item => {
    const clipes = item.clipes_enviados || {};
    const canaisComClipes = canaisLista.filter(c => clipes[c] && canaisComClipesConfig[c]);
    if (canaisComClipes.length > 0) {
      produtosComVideo += 1;
      totalVideosPostados += canaisComClipes.length;
    }
  });

  const maxGrafico = Math.max(totalSkusRealizados, produtosComVideo, totalVideosPostados, dadosPendentes.length, 1);

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Gestão de Produtos por Pai & Variações</h1>
            <p className="text-sm font-medium text-slate-400">Controle completo com Construtor de Descrições padronizado por IA e Análise de Imagens</p>
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
              onClick={() => setSubAba("realizados")}
              className={`px-4 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer transition-all ${
                subAba === "realizados" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Realizados ({cadastrosRealizados.length})
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

          <div className="flex items-center gap-3">
            <input
              type="text"
              value={pesquisaGlobal}
              onChange={(e) => setPesquisaGlobal(e.target.value)}
              placeholder="🔍 Pesquisar SKU, Pai, Nome..."
              className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white outline-none w-80"
            />
          </div>
        </div>

        {subAba === "pendentes" && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl flex justify-between items-center flex-wrap gap-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase">Upload de Planilha de Produtos a Cadastrar</h3>
                <p className="text-xs text-slate-400 mt-1">Dados essenciais preservados com seleção em massa.</p>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                {skusSelecionados.length > 0 && (
                  <button
                    onClick={cadastrarSelecionados}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg cursor-pointer animate-pulse"
                  >
                    🚀 Cadastrar Selecionados ({skusSelecionados.length})
                  </button>
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
                <button onClick={() => setModalAberto(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold cursor-pointer">+ Manual</button>
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
                        <td className="p-3 text-slate-300">{item.marca || "—"}</td>
                        <td className="p-3 text-center text-slate-300">{item.qtdd_ecom}</td>
                        <td className="p-3 text-right font-mono text-rose-400">R$ {Number(item.custo).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-emerald-400">R$ {Number(item.preco_venda).toFixed(2)}</td>
                        <td className="p-3 text-center sticky right-0 bg-slate-950 shadow-l flex items-center justify-center gap-2">
                          <button onClick={() => enviarParaRealizados(item)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-xs font-bold cursor-pointer">Cadastrar</button>
                          <button onClick={() => excluirPendenteIndividual(item.sku)} className="bg-rose-950 hover:bg-rose-900 text-rose-400 px-2 py-1 rounded text-xs font-bold cursor-pointer">Excluir</button>
                        </td>
                      </tr>
                    ))}
                    {pendentesFiltrados.length === 0 && (
                      <tr>
                        <td colSpan={13} className="p-8 text-center text-slate-500">Nenhum produto pendente encontrado.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {subAba === "realizados" && (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4 border-b border-slate-800 pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-slate-400 uppercase">Filtros:</span>
                <select value={filtroStatusRealizados} onChange={(e) => setFiltroStatusRealizados(e.target.value as any)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none cursor-pointer">
                  <option value="todos">Todos os Status</option>
                  <option value="completos">100% Concluídos</option>
                  <option value="parciais">Parcialmente Concluídos</option>
                  <option value="clipes_pendentes">⚠️ Clipes Pendentes</option>
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

            <div className="space-y-6">
              {chavesGrupos.slice(0, itensPorPagina).map((paiKey, gIdx) => {
                const itensDoGrupo = gruposRealizados[paiKey];
                const expandido = Boolean(gruposExpandidos[paiKey]);

                return (
                  <div key={gIdx} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                      <button
                        onClick={() => toggleExpandirGrupo(paiKey)}
                        className="flex items-center gap-2 text-xs font-mono font-black text-purple-400 uppercase cursor-pointer hover:text-purple-300"
                      >
                        <span className={`transform transition-transform ${expandido ? "rotate-180" : ""}`}>▼</span>
                        SKU PAI: {paiKey} ({itensDoGrupo.length} variações)
                      </button>
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
                              const clipesMarcados = itensDoGrupo.every(i => (i.clipes_enviados || {})[canal]);
                              const temClipeAtivo = canaisComClipesConfig[canal];

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
                                    {temClipeAtivo ? (
                                      <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-purple-400 w-10 text-right">Clipe:</span>
                                        <input
                                          type="checkbox"
                                          checked={clipesMarcados}
                                          onChange={(e) => toggleClipePai(paiKey, canal, e.target.checked)}
                                          className="w-3.5 h-3.5 accent-indigo-600 rounded cursor-pointer"
                                        />
                                      </div>
                                    ) : (
                                      <span className="text-[8px] text-slate-600 italic">sem clipe</span>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>

                          {expandido && itensDoGrupo.map((item, vIdx) => (
                            <tr key={vIdx} className="bg-slate-900/20 text-slate-400">
                              <td className="p-2 pl-6" colSpan={1 + canaisLista.length}>
                                <span className="font-mono text-indigo-300 font-bold">↳ {item.sku}</span> — {item.produto} (Cor: {item.cor || "—"}, Tam: {item.tamanho || "—"})
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
                <p className="text-xs text-slate-400 mt-1">Gere descrições exatas para copiar e colar, com suporte a SKU Alvo, SKU de Referência e Imagens.</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={skuAlvo}
                  onChange={(e) => setSkuAlvo(e.target.value)}
                  placeholder="SKU Alvo..."
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none w-36"
                />
                <input
                  type="text"
                  value={skuReferencia}
                  onChange={(e) => setSkuReferencia(e.target.value)}
                  placeholder="SKU Referência..."
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none w-36"
                />
              </div>
            </div>

            <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 h-[400px] overflow-y-auto space-y-4">
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
                    Analisando dados/imagem e gerando descrição padronizada...
                  </div>
                </div>
              )}
              {chatMensagens.length === 0 && (
                <div className="text-center text-slate-500 py-20 text-xs">
                  Informe o SKU Alvo (ou anexe uma imagem) e digite sua solicitação abaixo para gerar a copy no padrão exato.
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
                placeholder="Ex: Gere a descrição padrão para este produto..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-xs text-white outline-none"
              />
              <button type="submit" disabled={carregandoIA} className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-3 rounded-xl text-xs uppercase cursor-pointer transition-all shadow-lg">
                Gerar Copy
              </button>
            </form>
          </div>
        )}

        {subAba === "config" && (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Configuração de Canais com Clipes</h3>
              <p className="text-xs text-slate-400 mt-1">Marque abaixo quais canais devem exibir a opção de controle de clipes (vídeos) na aba de realizados. Suas escolhas são salvas automaticamente.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {canaisLista.map((canal, cIdx) => (
                <label key={cIdx} className="flex items-center gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 cursor-pointer hover:border-purple-600 transition-all">
                  <input
                    type="checkbox"
                    checked={Boolean(canaisComClipesConfig[canal])}
                    onChange={(e) => atualizarConfigCanal(canal, e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                  <span className="text-xs font-bold text-white">{canal}</span>
                </label>
              ))}
            </div>

            {/* SEÇÃO: PROCURAR DESCRIÇÃO PELO SKU */}
            <div className="border-t border-slate-800 pt-6 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Procurar Descrição Gerada por SKU</h3>
                <p className="text-xs text-slate-400 mt-1">Consulte rapidamente a última descrição salva no histórico para qualquer SKU.</p>
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
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 mt-4">
                  {resultadoBuscaConfig.naoEncontrado ? (
                    <p className="text-xs text-rose-400">Nenhuma descrição encontrada para este SKU no histórico.</p>
                  ) : (
                    <div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 border-b border-slate-900 pb-2 mb-2">
                        <span>SKU: <strong className="text-purple-400">{resultadoBuscaConfig.sku}</strong></span>
                        <span>Gerado em: {new Date(resultadoBuscaConfig.created_at || Date.now()).toLocaleString("pt-BR")}</span>
                      </div>
                      <pre className="text-xs text-slate-200 whitespace-pre-wrap font-mono leading-relaxed bg-slate-900/60 p-3 rounded-lg">
                        {resultadoBuscaConfig.resposta_ia}
                      </pre>
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
                <p className="text-xs text-slate-400 mt-1">Filtre por período para comparar volumes de cadastros e vídeos produzidos.</p>
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

            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">Cadastros Realizados</span>
                <p className="text-3xl font-black text-emerald-400 mt-2">{totalSkusRealizados}</p>
              </div>
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">Produtos com Vídeo</span>
                <p className="text-3xl font-black text-purple-400 mt-2">{produtosComVideo}</p>
                <span className="text-[10px] text-slate-500 mt-1 block">Vídeos produzidos únicos</span>
              </div>
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">Total Vídeos Postados</span>
                <p className="text-3xl font-black text-indigo-400 mt-2">{totalVideosPostados}</p>
                <span className="text-[10px] text-slate-500 mt-1 block">Soma de posts em canais com clipe</span>
              </div>
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">Produtos Pendentes</span>
                <p className="text-3xl font-black text-amber-400 mt-2">{dadosPendentes.length}</p>
                <span className="text-[10px] text-slate-500 mt-1 block">Faltam cadastrar</span>
              </div>
            </div>

            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-6">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Gráfico Comparativo de Produção</h4>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400 font-semibold">Cadastros Realizados</span>
                    <span className="text-emerald-400 font-bold">{totalSkusRealizados}</span>
                  </div>
                  <div className="w-full bg-slate-900 h-4 rounded-full overflow-hidden border border-slate-800">
                    <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (totalSkusRealizados / maxGrafico) * 100)}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400 font-semibold">Produtos com Vídeo (Produzidos)</span>
                    <span className="text-purple-400 font-bold">{produtosComVideo}</span>
                  </div>
                  <div className="w-full bg-slate-900 h-4 rounded-full overflow-hidden border border-slate-800">
                    <div className="bg-purple-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (produtosComVideo / maxGrafico) * 100)}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400 font-semibold">Total Vídeos Postados (Canais)</span>
                    <span className="text-indigo-400 font-bold">{totalVideosPostados}</span>
                  </div>
                  <div className="w-full bg-slate-900 h-4 rounded-full overflow-hidden border border-slate-800">
                    <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (totalVideosPostados / maxGrafico) * 100)}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400 font-semibold">Produtos Pendentes (Faltam)</span>
                    <span className="text-amber-400 font-bold">{dadosPendentes.length}</span>
                  </div>
                  <div className="w-full bg-slate-900 h-4 rounded-full overflow-hidden border border-slate-800">
                    <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (dadosPendentes.length / maxGrafico) * 100)}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {modalAberto && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white">Inserir Produto Manualmente (Pendentes)</h3>
                <button onClick={() => setModalAberto(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
              </div>
              <form onSubmit={handleSalvarManual} className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">SKU *</label>
                  <input type="text" required value={formManual.sku} onChange={(e) => setFormManual({...formManual, sku: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nome do Produto *</label>
                  <input type="text" required value={formManual.produto} onChange={(e) => setFormManual({...formManual, produto: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Custo (R$)</label>
                  <input type="number" step="0.01" value={formManual.custo} onChange={(e) => setFormManual({...formManual, custo: Number(e.target.value)})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Preço Venda (R$)</label>
                  <input type="number" step="0.01" value={formManual.preco_venda} onChange={(e) => setFormManual({...formManual, preco_venda: Number(e.target.value)})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Marca</label>
                  <input type="text" value={formManual.marca} onChange={(e) => setFormManual({...formManual, marca: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div className="md:col-span-3 flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button type="button" onClick={() => setModalAberto(false)} className="bg-slate-800 px-4 py-2 rounded-xl text-white font-bold cursor-pointer">Cancelar</button>
                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 px-5 py-2 rounded-xl text-white font-bold cursor-pointer">Salvar</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}