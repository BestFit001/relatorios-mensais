"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { buscarTudo } from "../../lib/buscarTudo";
import { canaisSemRepeticao, normalizarNomeCanal } from "../../lib/vendasCanaisLogica";
import {
  agruparPorPai, paiDoItem, statusDoGrupo, canaisDoSku, montarPresenca, paginar, variantesDeSku, emLotes, type Presenca,
} from "../../lib/cadastroCanais";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import CadastrosCanais from "../components/CadastrosCanais";
import Paginacao from "../components/Paginacao";
import * as XLSX from "xlsx";

const KPI_BARRA = { amber: "bg-amber-500", indigo: "bg-indigo-500", purple: "bg-purple-500", emerald: "bg-emerald-500" } as const;

/** Célula de indicador do topo (clicável): número, título e, se houver, uma barra de progresso fininha. */
function Kpi({ icone, titulo, valor, detalhe, cor, barra, onClick, dataKpi }: {
  icone: string; titulo: string; valor: number; detalhe: string; cor: keyof typeof KPI_BARRA; barra?: number; onClick?: () => void; dataKpi: string;
}) {
  return (
    <button
      onClick={onClick}
      data-kpi={dataKpi}
      className="text-left px-4 py-2.5 flex items-center gap-3 hover:bg-slate-800/40 transition cursor-pointer"
    >
      <span className="text-xl shrink-0" aria-hidden>{icone}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-baseline gap-2">
          <span className="text-xl font-black text-white tabular-nums" data-kpi-valor>{valor}</span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 truncate">{titulo}</span>
        </span>
        <span className="block text-[11px] text-slate-500 truncate">{detalhe}</span>
        {barra !== undefined && (
          <span className="block mt-1 h-1 rounded-full bg-slate-800 overflow-hidden">
            <span className={`block h-full rounded-full transition-all duration-500 ${KPI_BARRA[cor]}`} style={{ width: `${Math.min(100, Math.max(0, barra))}%` }} />
          </span>
        )}
      </span>
    </button>
  );
}

export default function ProdutosPage() {
  const router = useRouter();
  const [subAba, setSubAba] = useState<"pendentes" | "canais" | "periodo" | "config" | "descricoes">("pendentes");
  const [loading, setLoading] = useState(false);

  const [dadosPendentes, setDadosPendentes] = useState<any[]>([]);
  const [cadastrosRealizados, setCadastrosRealizados] = useState<any[]>([]);
  const [canaisLista, setCanaisLista] = useState<string[]>([]);

  const [pesquisaGlobal, setPesquisaGlobal] = useState("");

  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [skusSelecionados, setSkusSelecionados] = useState<string[]>([]);
  const [paginaPend, setPaginaPend] = useState(1);
  const [tamanhoPend, setTamanhoPend] = useState(10);

  // Em quais canais cada SKU já está (Mapa de Cadastros + vendas) e canais que o Mapa oculta
  const [presenca, setPresenca] = useState<Presenca>(new Map());
  const [canaisOcultos, setCanaisOcultos] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaAtualizacao = useRef(0);
  const avisar = (tipo: "ok" | "erro", texto: string) => {
    setToast({ tipo, texto });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tipo === "erro" ? 9000 : 5000);
  };

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

  // Quem sobe a planilha do Mapa de Cadastros (ou as vendas) em outra aba: ao voltar para esta, o app relê tudo sozinho
  const chaveSkus = useMemo(() => [...dadosPendentes, ...cadastrosRealizados].map((i) => String(i.sku)).sort().join("|"), [dadosPendentes, cadastrosRealizados]);
  const chaveRef = useRef("");
  chaveRef.current = chaveSkus;
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState !== "visible" || Date.now() - ultimaAtualizacao.current < 20000) return;
      atualizarTudo(false);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => { document.removeEventListener("visibilitychange", aoVoltar); window.removeEventListener("focus", aoVoltar); };
  }, []);
  // sempre que o conjunto de SKUs muda (importação, cadastro, recadastro...), refaz a detecção dos canais
  useEffect(() => {
    if (!chaveSkus) { setPresenca(new Map()); return; }
    const t = setTimeout(() => carregarPresenca(chaveSkus.split("|")), 250);
    return () => clearTimeout(t);
  }, [chaveSkus]);

  const carregarOcultos = async () => {
    try {
      const { data } = await supabase.from("config_regras_tiny").select("coluna").eq("campo", "mapa_canais_ocultos").maybeSingle();
      setCanaisOcultos(new Set(String(data?.coluna ?? "").split(",").map((x) => x.trim()).filter(Boolean)));
    } catch { /* sem a configuração, nenhum canal fica oculto */ }
  };

  // Um canal conta como cadastrado para o SKU quando ele está no Mapa de Cadastros (mapeamento_canais_skus) ou já vendeu no canal (vendas_canais)
  const carregarPresenca = async (skus: string[]) => {
    try {
      const todas = Array.from(new Set(skus.flatMap(variantesDeSku)));
      const linhas: { canal: any; sku: any }[] = [];
      for (const lote of emLotes(todas, 150)) {
        const [mapa, vendas] = await Promise.all([
          buscarTudo("mapeamento_canais_skus", "canal, sku", (q) => q.eq("presente", true).in("sku", lote)),
          buscarTudo("vendas_canais", "canal, sku", (q) => q.in("sku", lote)),
        ]);
        linhas.push(...mapa, ...vendas);
      }
      setPresenca(montarPresenca(linhas));
    } catch (e) {
      console.error("Não consegui checar o Mapa de Cadastros/vendas:", e);   // sem isso, valem só as marcações feitas à mão
    }
  };

  const atualizarTudo = async (avisarFim: boolean) => {
    ultimaAtualizacao.current = Date.now();
    setLoading(true);
    await Promise.all([carregarOcultos(), carregarPendentesDoBanco(), carregarRealizadosDoBanco()]);
    await carregarPresenca(chaveRef.current ? chaveRef.current.split("|") : []);
    setLoading(false);
    if (avisarFim) avisar("ok", "Tudo atualizado.");
  };

  const carregarDadosIniciais = async () => {
    setLoading(true);
    ultimaAtualizacao.current = Date.now();
    const { data: regrasCanais } = await supabase.from("config_regras_canais").select("canal").order("id");
    let listaCanais = ["Site", "Mercado Livre 1", "Mercado Livre 2", "Mercado Livre 3", "Shopee", "Magalu", "Netshoes", "Centauro", "Amazon", "Shein", "TikTok"];
    if (regrasCanais && regrasCanais.length > 0) {
      listaCanais = canaisSemRepeticao(regrasCanais.map((r: any) => r.canal));
    }
    setCanaisLista(listaCanais);

    await carregarOcultos();
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

  const cadastrarSelecionados = () =>
    cadastrarLista(
      dadosPendentes.filter(p => skusSelecionados.includes(p.sku)),
      `Deseja cadastrar os ${skusSelecionados.length} produtos selecionados de uma vez?`
    );

  // cadastra uma lista de pendentes (um produto pai inteiro ou a seleção); o fluxo de cada SKU é o mesmo do botão "Cadastrar"
  const cadastrarLista = async (itensParaCadastrar: any[], pergunta: string) => {
    if (itensParaCadastrar.length === 0) return;
    if (!confirm(pergunta)) return;

    setLoading(true);
    try {
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

      const feitos = itensParaCadastrar.map(i => i.sku as string);
      setSkusSelecionados(prev => prev.filter(s => !feitos.includes(s)));
      await carregarPendentesDoBanco();
      await carregarRealizadosDoBanco();
      alert(`✅ ${itensParaCadastrar.length} produto(s) cadastrado(s) com sucesso!`);
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

  // ---------- Pendentes: busca, agrupamento por pai e paginação ----------
  const termo = pesquisaGlobal.trim().toLowerCase();
  const combinaBusca = (item: any) =>
    !termo || [item.sku, item.produto, item.sku_pai, item.marca, item.cor, item.tamanho, item.ncm, item.ean].some((v) => String(v ?? "").toLowerCase().includes(termo));
  const pendentesFiltrados = dadosPendentes.filter(combinaBusca);
  const gruposPend = Array.from(agruparPorPai(pendentesFiltrados).entries()).map(([pai, itens]) => ({ pai, itens }));
  const pgPend = paginar(gruposPend.length, paginaPend, tamanhoPend);
  const gruposPendVisiveis = gruposPend.slice(pgPend.inicio, pgPend.fim);
  useEffect(() => { setPaginaPend(1); }, [pesquisaGlobal, tamanhoPend]);

  const toggleGrupoPend = (itens: any[], marcar: boolean) => {
    const skus = itens.map((i) => i.sku as string);
    setSkusSelecionados((prev) => (marcar ? Array.from(new Set([...prev, ...skus])) : prev.filter((s) => !skus.includes(s))));
  };

  // ---------- Indicadores do topo ----------
  const canaisAtivos = canaisLista.filter((c) => !canaisOcultos.has(normalizarNomeCanal(c)));
  const canaisOcultosEmUso = canaisLista.length - canaisAtivos.length;
  const gruposCadastrados = agruparPorPai(cadastrosRealizados);
  let nGruposOk = 0;
  gruposCadastrados.forEach((itens) => { if (statusDoGrupo(itens, canaisAtivos, presenca).completo) nGruposOk++; });
  const nGruposFaltam = gruposCadastrados.size - nGruposOk;
  const pctGruposOk = gruposCadastrados.size ? Math.round((nGruposOk / gruposCadastrados.size) * 100) : 0;
  const nPaisPendentes = new Set(dadosPendentes.map((i) => paiDoItem(i))).size;
  const recarregarListas = async () => { await carregarPendentesDoBanco(); await carregarRealizadosDoBanco(); };

  const realizadosFiltradosPorPeriodo = cadastrosRealizados.filter(item => {
    if (!dataInicio && !dataFim) return true;
    const dataItem = new Date(item.data_cadastro || Date.now());
    if (dataInicio && dataItem < new Date(dataInicio)) return false;
    if (dataFim && dataItem > new Date(dataFim + "T23:59:59")) return false;
    return true;
  });

  const totalSkusRealizados = realizadosFiltradosPorPeriodo.length;
  const paisNoPeriodo = new Set(realizadosFiltradosPorPeriodo.map((i) => paiDoItem(i))).size;
  const mesesGrafico = (() => {
    const m = new Map<string, { skus: number; pais: Set<string> }>();
    for (const i of realizadosFiltradosPorPeriodo) {
      const d = new Date(i.data_cadastro || Date.now());
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const g = m.get(chave) || { skus: 0, pais: new Set<string>() };
      g.skus++; g.pais.add(paiDoItem(i)); m.set(chave, g);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
      .map(([mes, g]) => ({ mes, rotulo: `${mes.slice(5)}/${mes.slice(0, 4)}`, skus: g.skus, pais: g.pais.size }));
  })();
  const maiorMes = Math.max(1, ...mesesGrafico.map((x) => x.skus));

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      {loading && <div className="fixed top-0 left-0 right-0 h-1 bg-purple-500 animate-pulse z-50" data-carregando />}
      {toast && (
        <div
          role="status"
          data-toast={toast.tipo}
          onClick={() => setToast(null)}
          className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm font-bold shadow-2xl cursor-pointer ${toast.tipo === "ok" ? "bg-emerald-950 border-emerald-700 text-emerald-200" : "bg-rose-950 border-rose-700 text-rose-200"}`}
        >
          {toast.texto}
        </div>
      )}
      <div className="max-w-[98%] mx-auto space-y-4">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Novos Cadastros</h1>
            <p className="text-sm font-medium text-slate-400">Do produto pendente ao cadastro em cada canal, num só lugar</p>
          </div>
          <Navbar />
        </div>

        {/* indicadores */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl grid grid-cols-2 xl:grid-cols-4 divide-slate-800 xl:divide-x overflow-hidden" data-kpis>
          <Kpi dataKpi="pendentes" icone="📝" cor="amber" titulo="Pendentes de cadastro" valor={dadosPendentes.length} detalhe={`${nPaisPendentes} produto(s) pai aguardando`} onClick={() => setSubAba("pendentes")} />
          <Kpi dataKpi="cadastrados" icone="📦" cor="indigo" titulo="Cadastrados" valor={cadastrosRealizados.length} detalhe={`${gruposCadastrados.size} produto(s) pai · ${canaisAtivos.length} canais`} onClick={() => setSubAba("canais")} />
          <Kpi dataKpi="faltam" icone="🛒" cor="purple" titulo="Faltam canais" valor={nGruposFaltam} detalhe="produtos com cadastro incompleto nos canais" onClick={() => setSubAba("canais")} />
          <Kpi dataKpi="concluidos" icone="✅" cor="emerald" titulo="100% nos canais" valor={nGruposOk} detalhe={`${pctGruposOk}% dos produtos cadastrados`} barra={pctGruposOk} onClick={() => setSubAba("canais")} />
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-900/80 p-2 rounded-xl border border-slate-800">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 flex-wrap gap-1" role="tablist">
            {([
              ["pendentes", `📝 Pendentes (${dadosPendentes.length})`],
              ["canais", `🛒 Canais (${cadastrosRealizados.length})`],
              ["periodo", "📊 Período & Gráficos"],
              ["descricoes", "✨ Descrições IA"],
              ["config", "⚙️ Configurações"],
            ] as [typeof subAba, string][]).map(([id, rotulo]) => (
              <button
                key={id}
                role="tab"
                aria-selected={subAba === id}
                data-subaba={id}
                onClick={() => setSubAba(id)}
                className={`px-3.5 py-1.5 rounded-lg font-bold text-xs uppercase cursor-pointer transition-all ${subAba === id ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"}`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {/* Oculta a pesquisa global na aba de descrições */}
          {subAba !== "descricoes" && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => atualizarTudo(true)}
                data-atualizar
                title="Recarregar pendentes, cadastrados e a detecção automática de canais"
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold cursor-pointer"
              >
                ↻ Atualizar
              </button>
              <input
                type="text"
                value={pesquisaGlobal}
                onChange={(e) => setPesquisaGlobal(e.target.value)}
                placeholder="🔍 Pesquisar SKU, Pai, Nome..."
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none w-72"
              />
            </div>
          )}
        </div>

        {subAba === "pendentes" && (
          <div className="space-y-3" data-aba-pendentes>
            <div className="flex justify-between items-center flex-wrap gap-3">
              <p className="text-xs text-slate-400">Importe a planilha ou insira à mão, marque os produtos e baixe a planilha do Tiny ou cadastre direto.</p>
              <div className="flex gap-2 flex-wrap items-center">
                <label className="bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer">
                  📤 Importar planilha
                  <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadPendentes} className="hidden" data-upload-pendentes />
                </label>
                <button onClick={abrirManualNovo} className="border border-indigo-500/60 text-indigo-300 hover:bg-indigo-950/40 px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer">+ Manual</button>
                {dadosPendentes.length > 0 && (
                  <button onClick={limparTodosPendentes} className="border border-rose-700/60 text-rose-300 hover:bg-rose-950/40 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer">🗑️ Limpar todos</button>
                )}
              </div>
            </div>

            {dadosPendentes.length > 0 && (
              <div className={`sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 ${skusSelecionados.length > 0 ? "bg-slate-900 border-purple-600/60" : "bg-slate-900/80 border-slate-800"}`} data-barra-selecao-pendentes>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    data-selecionar-todos-pendentes
                    checked={pendentesFiltrados.length > 0 && skusSelecionados.length === pendentesFiltrados.length}
                    onChange={toggleSelecionarTodos}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                  Selecionar todos os {pendentesFiltrados.length} SKU(s){termo ? " da busca" : ""}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-400" data-qtd-selecionados-pendentes>
                    {skusSelecionados.length > 0 ? `${skusSelecionados.length} selecionado(s)` : "Marque os produtos para baixar a planilha ou cadastrar"}
                  </span>
                  {skusSelecionados.length > 0 && (
                    <>
                      <button onClick={baixarPlanilhaTinySelecionados} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow cursor-pointer flex items-center gap-1.5">
                        📥 Baixar Planilha Tiny ({skusSelecionados.length})
                      </button>
                      <button onClick={cadastrarSelecionados} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow cursor-pointer">
                        🚀 Cadastrar Selecionados ({skusSelecionados.length})
                      </button>
                      <button onClick={() => setSkusSelecionados([])} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer">Limpar seleção</button>
                    </>
                  )}
                </div>
              </div>
            )}

            <Paginacao total={gruposPend.length} pagina={pgPend.pagina} tamanho={tamanhoPend} onPagina={setPaginaPend} onTamanho={setTamanhoPend} rotulo="produtos (SKU pai)" opcoes={[10, 20, 50]} />

            {gruposPend.length === 0 ? (
              <div className="bg-slate-900/90 border border-dashed border-slate-700 rounded-2xl p-12 text-center space-y-1" data-vazio-pendentes>
                <p className="text-4xl">{termo ? "🔎" : "📭"}</p>
                <p className="text-sm font-bold text-slate-200">{termo ? "Nenhum produto pendente encontrado" : "Nenhum produto pendente"}</p>
                <p className="text-xs text-slate-500">{termo ? "Ajuste a busca." : "Importe uma planilha ou use “+ Manual” para começar."}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {gruposPendVisiveis.map(({ pai, itens }) => {
                  const qtdSel = itens.filter((i: any) => skusSelecionados.includes(i.sku)).length;
                  return (
                    <article key={pai} data-grupo-pendente={pai} className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                      <header className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 border-b border-slate-800">
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            data-selecionar-grupo-pendente={pai}
                            title="Marcar todas as variações deste pai"
                            checked={qtdSel === itens.length}
                            ref={(el) => { if (el) el.indeterminate = qtdSel > 0 && qtdSel < itens.length; }}
                            onChange={(e) => toggleGrupoPend(itens, e.target.checked)}
                            className="w-3.5 h-3.5 accent-purple-600 rounded cursor-pointer"
                          />
                          <span className="font-mono text-[11px] font-black text-purple-300 bg-purple-950/50 px-1.5 py-0.5 rounded">{pai}</span>
                          <div className="min-w-0">
                            <h3 className="text-[13px] font-semibold text-white truncate max-w-[34rem]" title={itens[0]?.produto}>{itens[0]?.produto || "Produto sem nome"} <span className="text-[11px] font-normal text-slate-500">· {itens.length} var. · {itens[0]?.marca || "—"}</span></h3>
                          </div>
                        </div>
                        <button
                          onClick={() => cadastrarLista(itens, `Cadastrar o produto ${pai} com ${itens.length} variação(ões)?`)}
                          data-cadastrar-grupo={pai}
                          className="border border-emerald-600/70 text-emerald-300 hover:bg-emerald-950/40 px-3 py-1 rounded-lg text-xs font-bold cursor-pointer"
                        >
                          🚀 Cadastrar produto ({itens.length})
                        </button>
                      </header>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead className="text-slate-500 font-bold uppercase text-[10px]">
                            <tr className="border-b border-slate-800">
                              <th className="px-2.5 py-1.5 w-8" />
                              <th className="px-2.5 py-1.5">SKU</th>
                              <th className="px-2.5 py-1.5">Cor</th>
                              <th className="px-2.5 py-1.5">Tam</th>
                              <th className="px-2.5 py-1.5">EAN</th>
                              <th className="px-2.5 py-1.5">NCM / CEST</th>
                              <th className="px-2.5 py-1.5">Medidas A×L×C (cm)</th>
                              <th className="px-2.5 py-1.5 text-center">Qtd Ecom</th>
                              <th className="px-2.5 py-1.5 text-right">Custo</th>
                              <th className="px-2.5 py-1.5 text-right">PDV</th>
                              <th className="px-2.5 py-1.5 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/70">
                            {itens.map((item: any) => {
                              const vende = canaisDoSku(item.sku, canaisAtivos, presenca);
                              return (
                                <tr key={item.sku} className={skusSelecionados.includes(item.sku) ? "bg-purple-950/20" : "hover:bg-slate-900/40"}>
                                  <td className="px-2.5 py-1.5 text-center">
                                    <input type="checkbox" checked={skusSelecionados.includes(item.sku)} onChange={() => toggleSelecionarSku(item.sku)} className="w-4 h-4 accent-purple-600 rounded cursor-pointer" />
                                  </td>
                                  <td className="px-2.5 py-1.5 font-mono font-bold text-indigo-300">
                                    {item.sku}
                                    {vende.length > 0 && (
                                      <span data-ja-vende title={`Este SKU já aparece no Mapa de Cadastros/vendas em: ${vende.join(", ")}`} className="ml-2 align-middle text-[9px] font-bold uppercase bg-amber-950/50 text-amber-300 border border-amber-700/40 px-1.5 py-0.5 rounded">
                                        já vende em {vende.length} canal(is)
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-slate-300">{item.cor || "—"}</td>
                                  <td className="px-2.5 py-1.5 text-slate-300">{item.tamanho || "—"}</td>
                                  <td className="px-2.5 py-1.5 text-slate-400 font-mono">{item.ean || "—"}</td>
                                  <td className="px-2.5 py-1.5 text-slate-400 font-mono">{item.ncm || "—"}{item.cest ? <span className="text-slate-600"> / {item.cest}</span> : null}</td>
                                  <td className="px-2.5 py-1.5 text-slate-300 font-mono" data-medidas>{(item.altura || item.largura || item.comprimento) ? `${item.altura ?? "—"}×${item.largura ?? "—"}×${item.comprimento ?? "—"}` : "—"}</td>
                                  <td className="px-2.5 py-1.5 text-center text-slate-300">{item.qtdd_ecom ?? 0}</td>
                                  <td className="px-2.5 py-1.5 text-right font-mono text-rose-400">R$ {Number(item.custo || 0).toFixed(2)}</td>
                                  <td className="px-2.5 py-1.5 text-right font-mono text-emerald-400">R$ {Number(item.preco_venda || 0).toFixed(2)}</td>
                                  <td className="px-2.5 py-1.5">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button onClick={() => abrirManualEdicao(item)} data-editar-pendente className="text-slate-400 hover:text-white hover:bg-slate-800 px-1.5 py-1 rounded text-xs cursor-pointer" title="Editar produto">✏️</button>
                                      <button onClick={() => enviarParaRealizados(item)} data-cadastrar-sku={item.sku} className="border border-emerald-600/70 text-emerald-300 hover:bg-emerald-950/40 px-2.5 py-0.5 rounded text-xs font-bold cursor-pointer">Cadastrar</button>
                                      <button onClick={() => excluirPendenteIndividual(item.sku)} className="text-slate-500 hover:text-rose-300 hover:bg-rose-950/40 px-1.5 py-1 rounded text-xs cursor-pointer">Excluir</button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <Paginacao total={gruposPend.length} pagina={pgPend.pagina} tamanho={tamanhoPend} onPagina={setPaginaPend} onTamanho={setTamanhoPend} rotulo="produtos (SKU pai)" opcoes={[10, 20, 50]} />
          </div>
        )}

        {subAba === "canais" && (
          <CadastrosCanais
            cadastros={cadastrosRealizados}
            setCadastros={setCadastrosRealizados}
            canais={canaisAtivos}
            presenca={presenca}
            pesquisa={pesquisaGlobal}
            canaisOcultos={canaisOcultosEmUso}
            recarregar={recarregarListas}
            avisar={avisar}
            ocupado={loading}
            setOcupado={setLoading}
          />
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">SKUs cadastrados</span>
                <p className="text-3xl font-black text-emerald-400 mt-2" data-total-cadastrados>{totalSkusRealizados}</p>
                <span className="text-[10px] text-slate-500 mt-1 block">{paisNoPeriodo} produto(s) pai</span>
              </div>
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">Produtos pendentes</span>
                <p className="text-3xl font-black text-amber-400 mt-2">{dadosPendentes.length}</p>
                <span className="text-[10px] text-slate-500 mt-1 block">Faltam cadastrar</span>
              </div>
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">Concluídos nos canais</span>
                <p className="text-3xl font-black text-purple-400 mt-2">{pctGruposOk}%</p>
                <span className="text-[10px] text-slate-500 mt-1 block">{nGruposOk} de {gruposCadastrados.size} produtos</span>
              </div>
            </div>

            <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3" data-grafico-meses>
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">SKUs cadastrados por mês</h4>
              {mesesGrafico.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhum cadastro no período.</p>
              ) : (
                <ul className="space-y-2">
                  {mesesGrafico.map((m) => (
                    <li key={m.mes} className="flex items-center gap-3 text-xs" data-mes={m.mes}>
                      <span className="w-16 text-slate-400 font-mono">{m.rotulo}</span>
                      <div className="flex-1 h-5 rounded-md bg-slate-900 overflow-hidden">
                        <div className="h-full rounded-md bg-gradient-to-r from-purple-600 to-indigo-500" style={{ width: `${Math.max(4, (m.skus / maiorMes) * 100)}%` }} />
                      </div>
                      <span className="w-32 text-right text-slate-300 tabular-nums"><b className="text-white">{m.skus}</b> SKU · {m.pais} pai</span>
                    </li>
                  ))}
                </ul>
              )}
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