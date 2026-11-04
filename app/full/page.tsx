"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import * as XLSX from "xlsx";
import {
  normTexto,
  statusCancelado,
  detectarColunasML,
  avaliarFormulaCanal,
  hojeSaoPaulo,
  resumirArmazenagemPorSku,
  textoAlertaArmazenagem,
  statusArmazenagem,
  DIAS_ALERTA_PADRAO,
  DIAS_COBRANCA_PADRAO,
  parseDiaVenda,
  classificarRitmo,
  diasDoMesRef,
  REGRAS_RITMO_PADRAO,
  type Lote,
  type RegraRitmo,
} from "../../lib/fulfillment";
import { ehMercadoLivre } from "../../lib/tarifacao";

const matrizFretes = [
  { atePeso: 0.3, faixas: { "78.99": 8.15, "99.99": 12.95, "119.99": 14.95, "149.99": 16.95, "199.99": 19.05, "200": 21.65 } },
  { atePeso: 0.5, faixas: { "78.99": 8.25, "99.99": 13.85, "119.99": 16.15, "149.99": 18.15, "199.99": 20.45, "200": 23.25 } },
  { atePeso: 1.0, faixas: { "78.99": 8.45, "99.99": 14.45, "119.99": 16.85, "149.99": 19.05, "199.99": 21.35, "200": 24.45 } },
  { atePeso: 1.5, faixas: { "78.99": 8.65, "99.99": 14.75, "119.99": 17.15, "149.99": 19.45, "199.99": 21.75, "200": 25.45 } },
  { atePeso: 2.0, faixas: { "78.99": 8.75, "99.99": 15.05, "119.99": 17.65, "149.99": 19.85, "199.99": 22.25, "200": 25.55 } },
  { atePeso: 3.0, faixas: { "78.99": 9.15, "99.99": 16.45, "119.99": 19.15, "149.99": 21.65, "199.99": 24.35, "200": 27.05 } },
  { atePeso: 4.0, faixas: { "78.99": 9.75, "99.99": 17.85, "119.99": 20.75, "149.99": 23.35, "199.99": 26.35, "200": 29.25 } },
  { atePeso: 5.0, faixas: { "78.99": 10.25, "99.99": 19.75, "119.99": 22.85, "149.99": 26.05, "199.99": 29.25, "200": 32.45 } },
  { atePeso: 6.0, faixas: { "78.99": 10.35, "99.99": 25.95, "119.99": 29.15, "149.99": 33.35, "199.99": 36.45, "200": 40.85 } },
  { atePeso: 7.0, faixas: { "78.99": 10.45, "99.99": 27.55, "119.99": 31.65, "149.99": 36.75, "199.99": 40.85, "200": 45.25 } },
];

function calcularFreteML(pdv: number, pesoReal: number, altura: number, largura: number, comprimento: number): number {
  if (pdv < 79.00) return 0.00;
  const pesoVolumetrico = (altura * largura * comprimento) / 6000;
  const pesoConsiderado = Math.max(pesoReal, pesoVolumetrico);
  let linhaFrete = matrizFretes.find(m => pesoConsiderado <= m.atePeso);
  if (!linhaFrete) linhaFrete = matrizFretes[matrizFretes.length - 1];

  let valorFrete = 0;
  if (pdv < 79) valorFrete = linhaFrete.faixas["78.99"];
  else if (pdv < 100) valorFrete = linhaFrete.faixas["99.99"];
  else if (pdv < 120) valorFrete = linhaFrete.faixas["119.99"];
  else if (pdv < 150) valorFrete = linhaFrete.faixas["149.99"];
  else if (pdv < 200) valorFrete = linhaFrete.faixas["199.99"];
  else valorFrete = linhaFrete.faixas["200"];
  return valorFrete || 0;
}

function normalizarSku(valor: any) {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/^["']|["']$/g, "").trim();
  return s.toLowerCase();
}

function parseNumero(valor: any): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;
  let s = String(valor).replace(/R\$/g, "").replace(/\s/g, "").trim();
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

function verificarDataNoPeriodo(dataStr: any, periodoCompetencia: string): boolean {
  if (periodoCompetencia === "TODOS") return true;
  if (!dataStr) return false;
  const [mesAlvo, anoAlvo] = periodoCompetencia.split("/");
  const str = String(dataStr).trim();
  if (str.includes("-")) {
    const partes = str.split("-");
    if (partes.length >= 3) {
      const a = partes[0]; const m = partes[1].padStart(2, "0");
      return a === anoAlvo && m === mesAlvo.padStart(2, "0");
    }
  }
  if (str.includes("/")) {
    const partes = str.split("/");
    if (partes.length === 3) {
      const m = partes[1].padStart(2, "0"); const a = partes[2];
      return a === anoAlvo && m === mesAlvo.padStart(2, "0");
    }
  }
  return false;
}

const formatarMoeda = (valor: number) => "R$ " + (valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LogisticaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [modoLogistica, setModoLogistica] = useState<"full" | "padrao">("padrao");
  const [subAba, setSubAba] = useState<"estoque" | "vendas" | "relatorio" | "config">("vendas");

  const [canais, setCanais] = useState<string[]>([]);
  const [canalSelecionado, setCanalSelecionado] = useState("");
  const meses = ["01/2026", "02/2026", "03/2026", "04/2026", "05/2026", "06/2026", "07/2026", "08/2026", "09/2026", "10/2026", "11/2026", "12/2026"];
  const [mesSelecionado, setMesSelecionado] = useState("10/2026");

  // Bases de Dados
  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());
  const [regrasMlSkuMap, setRegrasMlSkuMap] = useState<Map<string, any>>(new Map());
  const [regrasMlMlbMap, setRegrasMlMlbMap] = useState<Map<string, any>>(new Map());
  const [regrasTarifacao, setRegrasTarifacao] = useState<any[]>([]);
  const [tinyMap, setTinyMap] = useState<Map<string, number>>(new Map());
  const [lancamentosGravados, setLancamentosGravados] = useState<any[]>([]);

  // Estados - Estoque (Full)
  const [matrizEstoque, setMatrizEstoque] = useState<any[]>([]);
  const [linhaEstoque, setLinhaEstoque] = useState("13");
  const [colSkuEstoque, setColSkuEstoque] = useState("D");
  const [colQtdEstoque, setColQtdEstoque] = useState("X");
  const [previewEstoque, setPreviewEstoque] = useState<any[]>([]);

  // Estados - Estoque ENVIADO ao Full (remessas). A data de entrada é sempre a do dia do upload.
  const [matrizRemessa, setMatrizRemessa] = useState<any[]>([]);
  const [nomeArquivoRemessa, setNomeArquivoRemessa] = useState("");
  const [linhaRemessa, setLinhaRemessa] = useState("2");
  const [colSkuRemessa, setColSkuRemessa] = useState("A");
  const [colQtdRemessa, setColQtdRemessa] = useState("B");
  const [previewRemessa, setPreviewRemessa] = useState<any[]>([]);
  const [lotes, setLotes] = useState<any[]>([]);
  const [estoqueCDLista, setEstoqueCDLista] = useState<any[]>([]);
  const [regrasCanais, setRegrasCanais] = useState<any[]>([]);
  const [layoutDetectado, setLayoutDetectado] = useState("");

  // Estados - Mapeamento de Vendas
  const [matrizVendas, setMatrizVendas] = useState<any[]>([]);
  const [linhaVendas, setLinhaVendas] = useState("7");
  const [colPedidoVendas, setColPedidoVendas] = useState("A");     // N.º Venda
  const [colCarrinhoVendas, setColCarrinhoVendas] = useState("D"); // Status / Pacote
  const [colSkuVendas, setColSkuVendas] = useState("X");           // SKU
  const [colMlbVendas, setColMlbVendas] = useState("Y");           // MLB Anúncio
  const [colQtdVendas, setColQtdVendas] = useState("H");           // Quantidade
  const [colPdvVendas, setColPdvVendas] = useState("AC");          // Preço unitário do anúncio
  const [colLiquidoVendas, setColLiquidoVendas] = useState("T");   // Líquido ML
  const [colReceitaPacote, setColReceitaPacote] = useState("I");   // Receita Bruta Total
  const [colEntregaVendas, setColEntregaVendas] = useState("AS");  // Forma de Entrega (Flex)

  // Conceito / Fórmula de Líquido do Canal
  const [formulaCanal, setFormulaCanal] = useState<"ml_recalculo" | "formula_regras">("ml_recalculo");
  // Texto que identifica, na coluna de entrega, o envio que gera taxa (ML: "Flex"; outros canais: definido por canal)
  const [textoEntrega, setTextoEntrega] = useState("flex");
  const [cfgSalva, setCfgSalva] = useState(false);
  // Ritmo de vendas por canal: "N vendas em D dias = status" (a primeira regra atingida vale) e limites de devolução
  const [colDataVendas, setColDataVendas] = useState("B");
  const [regrasRitmo, setRegrasRitmo] = useState<RegraRitmo[]>(REGRAS_RITMO_PADRAO);
  const [pctDevAtencao, setPctDevAtencao] = useState("5");
  const [minVendasDev, setMinVendasDev] = useState("5");
  // Fórmula de vendas dos canais fora do ML (mesmo formato da aba Regras: ex. "PDV - (PDV * 12%)")
  const [formulaVendas, setFormulaVendas] = useState("");

  // Deduções e Taxas
  const [aliquotaImposto, setAliquotaImposto] = useState("9");
  const [comissaoPadrao, setComissaoPadrao] = useState("19");     // Comissão se não achar MLB
  const [custoEmbalagem, setCustoEmbalagem] = useState("0.70");
  const [taxaFlex, setTaxaFlex] = useState("12.99");               // Débito do Flex
  const [metaDiasCobertura, setMetaDiasCobertura] = useState("45");

  // Diagnóstico
  const [margemMinimaPromissora, setMargemMinimaPromissora] = useState("12");
  const [vendasMinimasPromissoras, setVendasMinimasPromissoras] = useState("3");
  const [tetoMaxDevolucao, setTetoMaxDevolucao] = useState("10");

  const [dadosProcessados, setDadosProcessados] = useState<any[]>([]);
  const [pesquisaBusca, setPesquisaBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("TODOS");

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) { router.push("/login"); return; }
    carregarDadosBase();
  }, []);

  useEffect(() => {
    if (canalSelecionado && mesSelecionado) {
      carregarConfiguracoes(canalSelecionado);
      carregarHistoricoGravado();
      setDadosProcessados([]);
      setLayoutDetectado("");
      setCfgSalva(false);
    }
  }, [canalSelecionado, mesSelecionado, modoLogistica, regrasCanais]);

  const carregarDadosBase = async () => {
    const { data: canaisData } = await supabase.from('config_regras_canais').select('*').order('id');
    if (canaisData) {
      setRegrasCanais(canaisData);
      const lista = canaisData.filter((c: any) => c.ativo_ads !== false).map((c: any) => c.canal);
      setCanais(lista);
      if (lista.length > 0) setCanalSelecionado(lista[0]);
    }

    let step = 1000;
    let from = 0; let keep = true;
    const mapaC = new Map();
    while (keep) {
      const { data } = await supabase.from('tabela_custos_skus').select('*').range(from, from + step - 1);
      if (data && data.length > 0) {
        data.forEach((c: any) => mapaC.set(normalizarSku(c.sku), c));
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }
    setCustosMap(mapaC);

    // Carrega a base com as regras de MLB (comissão, peso, dimensões)
    from = 0; keep = true;
    const mapaMlSku = new Map();
    const mapaMlMlb = new Map();
    while (keep) {
      const { data } = await supabase.from('ml_anuncios_regras').select('*').range(from, from + step - 1);
      if (data && data.length > 0) {
        data.forEach((m: any) => {
          if (m.sku) mapaMlSku.set(normalizarSku(m.sku), m);
          if (m.mlb) mapaMlMlb.set(String(m.mlb).trim().toUpperCase(), m);
          if (m.anuncio) mapaMlMlb.set(String(m.anuncio).trim().toUpperCase(), m);
        });
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }
    setRegrasMlSkuMap(mapaMlSku);
    setRegrasMlMlbMap(mapaMlMlb);

    // Regras de tarifação por faixa (usadas para Shopee e Amazon)
    const { data: tarData } = await supabase.from('config_regras_tarifacao').select('*').order('id');
    if (tarData) setRegrasTarifacao(tarData);

    from = 0; keep = true;
    const mapaTiny = new Map();
    while (keep) {
      const { data } = await supabase.from('cadastros_base_tiny').select('sku, estoque').range(from, from + step - 1);
      if (data && data.length > 0) {
        data.forEach((t: any) => mapaTiny.set(normalizarSku(t.sku), Number(t.estoque || 0)));
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }
    setTinyMap(mapaTiny);
  };

  const carregarHistoricoGravado = async () => {
    setLoading(true);
    const tabela = modoLogistica === "full" ? "full_lancamentos" : "vendas_padrao_lancamentos";
    const { data } = await supabase
      .from(tabela)
      .select('*')
      .eq('canal', canalSelecionado)
      .eq('mes_referencia', mesSelecionado)
      .order('receita_bruta', { ascending: false });

    if (data) setLancamentosGravados(data);

    if (modoLogistica === "full") {
      // Estoque do CD (todos os itens que temos no Full, vendendo ou não)
      const { data: est } = await supabase.from('estoque_cd_mensal').select('sku, estoque').eq('canal', canalSelecionado).eq('mes_referencia', mesSelecionado);
      setEstoqueCDLista(est || []);
      await carregarLotes();
    }
    setLoading(false);
  };

  // Remessas enviadas ao Full (lotes). Se a migration ainda não foi rodada, apenas fica vazio.
  const carregarLotes = async () => {
    const { data, error } = await supabase
      .from('fulfillment_batches')
      .select('*')
      .eq('canal', canalSelecionado)
      .order('data_entrada', { ascending: true })
      .order('id', { ascending: true });
    setLotes(error ? [] : (data || []));
  };

  const recalcularFifo = async () => {
    const { error } = await supabase.rpc('fulfillment_recalcular_fifo', { p_canal: canalSelecionado });
    if (error) console.error("FIFO:", error.message);
    await carregarLotes();
  };

  // Aplica a configuração da aba Regras (col_sku, col_pdv, col_quantidade, formula_excel) ao canal escolhido
  const aplicarRegrasDoCanal = (canal: string, lista: any[] = regrasCanais) => {
    const regra = lista.find((r: any) => String(r.canal || "").trim().toLowerCase() === canal.trim().toLowerCase());
    setFormulaVendas(regra?.formula_excel || "PDV - (PDV * 12%)");
    setColSkuVendas(String(regra?.col_sku || "B").toUpperCase());
    setColPdvVendas(String(regra?.col_pdv || regra?.col_preco_venda || "P").toUpperCase());
    setColQtdVendas(String(regra?.col_quantidade || "O").toUpperCase());
    setColPedidoVendas(String(regra?.col_id_pedido || "A").toUpperCase());
    setColCarrinhoVendas("");   // status é opcional fora do ML (se informar, "cancelado" também é removido)
    setLinhaVendas("2");
    // Fora do ML cada canal descreve a entrega de um jeito: por padrão nada é descontado até você configurar
    setColEntregaVendas("");
    setTextoEntrega("");
    setTaxaFlex("0");
    setColDataVendas("");   // opcional: sem data, o ritmo é comparado proporcionalmente ao mês
    return !!regra;
  };

  // Padrão do Mercado Livre (relatório de vendas do ML)
  const aplicarPadraoML = () => {
    setLinhaVendas("7"); setColPedidoVendas("A"); setColCarrinhoVendas("D"); setColSkuVendas("X");
    setColMlbVendas("Y"); setColQtdVendas("H"); setColPdvVendas("AC"); setColLiquidoVendas("T");
    setColReceitaPacote("I"); setColEntregaVendas("AS"); setTextoEntrega("flex"); setTaxaFlex("12.99");
    setColDataVendas("B");
  };

  const carregarConfiguracoes = (canal: string) => {
    const keyPrefix = modoLogistica === "full" ? "full_" : "padrao_";
    const salvoRem = localStorage.getItem(`full_remessa_${canal.toLowerCase()}`);
    if (salvoRem) {
      const r = JSON.parse(salvoRem);
      if (r.linha) setLinhaRemessa(r.linha);
      if (r.colSku) setColSkuRemessa(r.colSku);
      if (r.colQtd) setColQtdRemessa(r.colQtd);
    }
    let p: any = null;
    try { const salvoVen = localStorage.getItem(`${keyPrefix}vendas_${canal.toLowerCase()}`); if (salvoVen) p = JSON.parse(salvoVen); } catch { p = null; }

    // Só existem dois conceitos: Mercado Livre e Fórmula de Vendas (Regras).
    // Configuração antiga (tarifação por faixa / líquido direto) é descartada e volta ao padrão do canal.
    const tipoSalvo = p && (p.formula === "ml_recalculo" || p.formula === "formula_regras") ? p.formula : null;
    const tipo: "ml_recalculo" | "formula_regras" = tipoSalvo || (ehMercadoLivre(canal) ? "ml_recalculo" : "formula_regras");
    const usarSalvo = !!tipoSalvo && p;

    // Parte sempre do padrão do tipo (não herda valores do canal anterior) e depois aplica o que foi salvo
    setFormulaCanal(tipo);
    setRegrasRitmo(REGRAS_RITMO_PADRAO); setPctDevAtencao("5"); setTetoMaxDevolucao("10"); setMinVendasDev("5");
    if (tipo === "ml_recalculo") aplicarPadraoML();
    else aplicarRegrasDoCanal(canal);

    if (usarSalvo) {
      if (p.linha) setLinhaVendas(p.linha);
      if (p.colPedido !== undefined) setColPedidoVendas(p.colPedido);
      if (p.colCarrinho !== undefined) setColCarrinhoVendas(p.colCarrinho);
      if (p.colSku) setColSkuVendas(p.colSku);
      if (p.colMlb) setColMlbVendas(p.colMlb);
      if (p.colQtd) setColQtdVendas(p.colQtd);
      if (p.colPdv) setColPdvVendas(p.colPdv);
      if (p.colLiquido) setColLiquidoVendas(p.colLiquido);
      if (p.colPacoteRec) setColReceitaPacote(p.colPacoteRec);
      if (p.colEntrega !== undefined) setColEntregaVendas(p.colEntrega);
      if (p.textoEntrega !== undefined) setTextoEntrega(p.textoEntrega);
      if (p.taxaFlex !== undefined) setTaxaFlex(p.taxaFlex);
      if (p.colData !== undefined) setColDataVendas(p.colData);
      if (p.formulaVendas !== undefined && tipo === "formula_regras") setFormulaVendas(p.formulaVendas);
    }
    if (p) {
      if (p.comissao) setComissaoPadrao(p.comissao);
      if (p.imposto) setAliquotaImposto(p.imposto);
      if (p.metaDias) setMetaDiasCobertura(p.metaDias);
      if (p.embalagem) setCustoEmbalagem(p.embalagem);
      if (p.margemMin) setMargemMinimaPromissora(p.margemMin);
      if (p.vendasMin) setVendasMinimasPromissoras(p.vendasMin);
      if (p.tetoDev) setTetoMaxDevolucao(p.tetoDev);
      if (p.pctDevAtencao !== undefined) setPctDevAtencao(p.pctDevAtencao);
      if (p.minVendasDev !== undefined) setMinVendasDev(p.minVendasDev);
      if (Array.isArray(p.regrasRitmo)) setRegrasRitmo(p.regrasRitmo);
    }
  };

  const salvarConfiguracoes = () => {
    const keyPrefix = modoLogistica === "full" ? "full_" : "padrao_";
    localStorage.setItem(`${keyPrefix}vendas_${canalSelecionado.toLowerCase()}`, JSON.stringify({
      linha: linhaVendas, colPedido: colPedidoVendas, colCarrinho: colCarrinhoVendas, 
      colSku: colSkuVendas, colMlb: colMlbVendas, colQtd: colQtdVendas, colPdv: colPdvVendas, 
      colLiquido: colLiquidoVendas, colPacoteRec: colReceitaPacote, colEntrega: colEntregaVendas, textoEntrega: textoEntrega,
      taxaFlex: taxaFlex, comissao: comissaoPadrao, imposto: aliquotaImposto, metaDias: metaDiasCobertura, 
      embalagem: custoEmbalagem, formula: formulaCanal, formulaVendas: formulaVendas, margemMin: margemMinimaPromissora,
      vendasMin: vendasMinimasPromissoras, tetoDev: tetoMaxDevolucao,
      colData: colDataVendas, regrasRitmo: regrasRitmo, pctDevAtencao: pctDevAtencao, minVendasDev: minVendasDev
    }));
  };

  const handleUploadVendas = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt: any) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: "A", defval: "" });
        setMatrizVendas(matrix);
        setDadosProcessados([]);

        // Relatório do ML tem 66 ou 67 colunas (as letras deslocam). Confere o cabeçalho e ajusta os campos.
        if (formulaCanal !== "formula_regras") {
          const det = detectarColunasML(matrix as any[]);
          if (det) {
            setLinhaVendas(String(det.linhaInicial));
            setColPedidoVendas(det.pedido);
            setColCarrinhoVendas(det.status);
            setColSkuVendas(det.sku);
            setColMlbVendas(det.mlb);
            setColQtdVendas(det.unidades);
            setColPdvVendas(det.pdv);
            setColLiquidoVendas(det.total);
            setColReceitaPacote(det.receita);
            setColEntregaVendas(det.formaEntrega);
            setColDataVendas(det.data);
            setLayoutDetectado(`Colunas conferidas pelo cabeçalho (${det.layout}): SKU ${det.sku} · PDV ${det.pdv} · Qtd ${det.unidades} · Status ${det.status}`);
          } else setLayoutDetectado("");
        }
      } catch (err: any) { alert("Erro ao ler o ficheiro: " + err.message); }
    };
    reader.readAsBinaryString(file);
  };

  const handleUploadRemessa = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivoRemessa(file.name);
    const reader = new FileReader();
    reader.onload = (evt: any) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: "A", defval: "" });
        setMatrizRemessa(matrix);
        setPreviewRemessa([]);
      } catch (err: any) { alert("Erro ao ler o ficheiro: " + err.message); }
    };
    reader.readAsBinaryString(file);
  };

  const processarPreviewRemessa = () => {
    if (matrizRemessa.length === 0) return alert("Suba a planilha da remessa enviada ao Full primeiro.");
    localStorage.setItem(`full_remessa_${canalSelecionado.toLowerCase()}`, JSON.stringify({ linha: linhaRemessa, colSku: colSkuRemessa, colQtd: colQtdRemessa }));

    const colSku = colSkuRemessa.trim().toUpperCase();
    const colQtd = colQtdRemessa.trim().toUpperCase();
    const startRow = Math.max(0, parseInt(linhaRemessa, 10) - 1 || 0);
    const mapa = new Map<string, number>();

    for (let r = startRow; r < matrizRemessa.length; r++) {
      const row = matrizRemessa[r];
      if (!row) continue;
      const skuNorm = normalizarSku(row[colSku]);
      if (!skuNorm || skuNorm === "sku") continue;
      const qtd = Math.round(parseNumero(row[colQtd]));
      if (qtd <= 0) continue;
      mapa.set(skuNorm, (mapa.get(skuNorm) || 0) + qtd);
    }
    setPreviewRemessa(Array.from(mapa.entries()).map(([skuNorm, quantidade]) => ({ skuNorm, quantidade, produto: custosMap.get(skuNorm)?.produto || "Produto Desconhecido" })));
  };

  const registrarRemessa = async () => {
    if (previewRemessa.length === 0) return;
    const hoje = hojeSaoPaulo();
    const jaExiste = lotes.some((l: any) => l.arquivo_origem === nomeArquivoRemessa && String(l.data_entrada).slice(0, 10) === hoje);
    if (jaExiste && !confirm(`A planilha "${nomeArquivoRemessa}" já foi registrada hoje em ${canalSelecionado}. Registrar de novo vai DUPLICAR as quantidades. Continuar?`)) return;

    setSalvando(true);
    const importacaoId = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : undefined;
    const payload = previewRemessa.map((i: any) => ({
      canal: canalSelecionado, sku: i.skuNorm, data_entrada: hoje,
      qtd_enviada: i.quantidade, qtd_remanescente: i.quantidade,
      importacao_id: importacaoId, arquivo_origem: nomeArquivoRemessa || null,
    }));
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabase.from("fulfillment_batches").insert(payload.slice(i, i + 500));
      if (error) { alert("Erro ao registrar remessa (a migration do Fulfillment já foi executada?): " + error.message); setSalvando(false); return; }
    }
    await recalcularFifo();
    alert(`✅ Remessa registrada com a data de hoje (${hoje.split("-").reverse().join("/")}): ${payload.length} SKUs, ${payload.reduce((a: number, b: any) => a + b.qtd_enviada, 0)} un. O aviso começa ao completar ${DIAS_ALERTA_PADRAO} dias.`);
    setPreviewRemessa([]); setMatrizRemessa([]); setNomeArquivoRemessa("");
    setSalvando(false);
  };

  const excluirRemessa = async (grupo: any) => {
    if (!confirm(`Excluir a remessa de ${grupo.dataBR}${grupo.arquivo ? ` (${grupo.arquivo})` : ""}?`)) return;
    const q = supabase.from("fulfillment_batches").delete();
    const { error } = grupo.importacao_id ? await q.eq("importacao_id", grupo.importacao_id) : await q.in("id", grupo.ids);
    if (error) alert("Erro ao excluir: " + error.message);
    await recalcularFifo();
  };

  const handleUploadEstoque = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt: any) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: "A", defval: "" });
        setMatrizEstoque(matrix);
        setPreviewEstoque([]);
      } catch (err: any) { alert("Erro ao ler o ficheiro: " + err.message); }
    };
    reader.readAsBinaryString(file);
  };

  const processarPreviewEstoque = () => {
    if (matrizEstoque.length === 0) return alert("Suba a planilha de Estoque primeiro.");
    localStorage.setItem(`full_estoque_${canalSelecionado.toLowerCase()}`, JSON.stringify({ linha: linhaEstoque, colSku: colSkuEstoque, colQtd: colQtdEstoque }));

    const colSku = colSkuEstoque.trim().toUpperCase();
    const colQtd = colQtdEstoque.trim().toUpperCase();
    const startRow = Math.max(0, parseInt(linhaEstoque, 10) - 1 || 0);
    const mapaAgrupado = new Map<string, number>();

    for (let r = startRow; r < matrizEstoque.length; r++) {
      const row = matrizEstoque[r];
      if (!row) continue;
      const skuNorm = normalizarSku(row[colSku]);
      if (!skuNorm || skuNorm.toLowerCase() === "sku") continue;
      const qtd = parseNumero(row[colQtd]);
      
      if (mapaAgrupado.has(skuNorm)) mapaAgrupado.set(skuNorm, mapaAgrupado.get(skuNorm)! + qtd);
      else mapaAgrupado.set(skuNorm, qtd);
    }

    const extraidos = Array.from(mapaAgrupado.entries()).map(([skuNorm, qtd]) => ({ sku: skuNorm, skuNorm, quantidade: qtd }));
    setPreviewEstoque(extraidos);
  };

  const salvarEstoqueNoBanco = async () => {
    if (previewEstoque.length === 0) return;
    setSalvando(true);
    const payload = previewEstoque.map((item: any) => ({ canal: canalSelecionado, mes_referencia: mesSelecionado, sku: item.skuNorm, estoque: item.quantidade }));
    const { error } = await supabase.from('estoque_cd_mensal').upsert(payload, { onConflict: 'canal, mes_referencia, sku' });
    if (error) alert("Erro ao salvar estoque no banco: " + error.message);
    else {
      alert(`✅ Estoque do CD atualizado com sucesso!`);
      setPreviewEstoque([]); setMatrizEstoque([]); setSubAba("vendas"); 
    }
    setSalvando(false);
  };

  const limparEstoqueSalvo = async () => {
    if (!confirm(`ATENÇÃO: Deseja apagar todo o Estoque do CD guardado em ${canalSelecionado} para o mês ${mesSelecionado}?`)) return;
    setSalvando(true);
    const { error } = await supabase.from('estoque_cd_mensal').delete().eq('canal', canalSelecionado).eq('mes_referencia', mesSelecionado);
    if (error) alert("Erro ao limpar estoque: " + error.message);
    else { alert("🗑️ Estoque limpo com sucesso!"); setPreviewEstoque([]); setMatrizEstoque([]); }
    setSalvando(false);
  };

  // MOTOR COM RECALCULO VIA MLB E SUPORTE A OUTROS CANAIS
  const executarMotorGeral = async () => {
    if (matrizVendas.length === 0) return alert("Suba a planilha de Vendas primeiro.");
    setLoading(true);
    salvarConfiguracoes();

    const colPedido = colPedidoVendas.trim().toUpperCase();
    const colPacote = colCarrinhoVendas.trim().toUpperCase();
    const temColunaPacote = colPacote !== "" && colPacote !== "ZZZ";

    const colSku = colSkuVendas.trim().toUpperCase();
    const colMlb = colMlbVendas.trim().toUpperCase();
    const colQtd = colQtdVendas.trim().toUpperCase();
    const colPdv = colPdvVendas.trim().toUpperCase();
    const colLiquido = colLiquidoVendas.trim().toUpperCase();
    const colRecPacote = colReceitaPacote.trim().toUpperCase();
    const colEntrega = colEntregaVendas.trim().toUpperCase();
    const modoFormulaRegras = formulaCanal === "formula_regras";
    const palavraEntrega = normTexto(textoEntrega);
    const temColunaEntrega = colEntrega !== "" && colEntrega !== "ZZZ" && palavraEntrega !== "";
    // Envio que gera taxa (no ML: "Flex"; nos outros canais: o texto que você definir na Configuração do Canal)
    const ehEnvioComTaxa = (valor: any) => temColunaEntrega && normTexto(valor).includes(palavraEntrega);

    if (modoFormulaRegras) {
      if (!formulaVendas.trim() || avaliarFormulaCanal(formulaVendas, 100, 1, colPdv, colQtd) === null) {
        setLoading(false);
        setSubAba("config");
        return alert("A fórmula de vendas do canal está vazia ou inválida. Ajuste em Configuração do Canal (ex.: PDV - (PDV * 12%)), como na aba Regras.");
      }
    }

    const impostoPct = Number(aliquotaImposto.replace(",", ".")) || 0;
    const embalagemUnit = Number(custoEmbalagem.replace(",", ".")) || 0;
    const taxaFlexNum = Number(String(taxaFlex).replace(",", "."));
    const taxaFlexUnit = isNaN(taxaFlexNum) ? 0 : taxaFlexNum;
    const metaDias = Number(metaDiasCobertura) || 45;

    const metaMargemPromissora = Number(margemMinimaPromissora.replace(",", ".")) || 12;
    const metaVendasMin = Number(vendasMinimasPromissoras) || 3;
    const limiteDevolucao = Number(String(tetoMaxDevolucao).replace(",", ".")) || 10;
    const limiteAtencaoDev = Number(String(pctDevAtencao).replace(",", ".")) || 5;
    const amostraMinDev = Number(minVendasDev) || 0;

    const startRow = Math.max(0, parseInt(linhaVendas, 10) - 1 || 0);

    // 1. Mapeia ordens de alteração (para capturar valor financeiro em caso de troca)
    const pedidosAlteracaoMap = new Map<string, { receita: number; liquido: number; isFlex: boolean }>();

    for (let r = startRow; r < matrizVendas.length; r++) {
      const row = matrizVendas[r];
      if (!row) continue;
      const idPed = String(row[colPedido] || "").trim();
      const status = String(row[colPacote] || "").toLowerCase();

      if (idPed && status.includes("solicitação de alteração")) {
        const rec = parseNumero(row[colRecPacote]);
        let liq = parseNumero(row[colLiquido]);
        const forma = temColunaEntrega ? String(row[colEntrega] || "") : "";
        const isFlex = ehEnvioComTaxa(forma);

        if (isFlex) {
          liq -= taxaFlexUnit;
        }

        pedidosAlteracaoMap.set(idPed, { receita: rec, liquido: liq, isFlex });
      }
    }

    // 2. Base de Devoluções e Curva ABC
    // Aba Devoluções: unidades devolvidas do SKU, neste canal, no mês de competência
    let devQuery = await supabase.from("devolucoes").select("sku, data_retorno, canal, quantidade");
    if (devQuery.error) devQuery = await supabase.from("devolucoes").select("sku, data_retorno, canal") as any;  // base sem a coluna quantidade
    const dadosDevolucaoRaw: any[] | null = devQuery.data as any;
    const mapaDevContagem = new Map<string, number>();
    if (dadosDevolucaoRaw) {
      dadosDevolucaoRaw.forEach((d: any) => {
        if (verificarDataNoPeriodo(d.data_retorno, mesSelecionado) && normTexto(d.canal) === normTexto(canalSelecionado)) {
          const skuKey = normalizarSku(d.sku);
          const unid = Math.max(1, Number(d.quantidade) || 1);
          if (skuKey) mapaDevContagem.set(skuKey, (mapaDevContagem.get(skuKey) || 0) + unid);
        }
      });
    }

    const { data: dadosAbcRaw } = await supabase.from("curva_abc").select("codigo, quantidade").eq("mes_referencia", mesSelecionado);
    const mapaVendasAbc = new Map<string, number>();
    if (dadosAbcRaw) {
      dadosAbcRaw.forEach((a: any) => {
        const skuKey = normalizarSku(a.codigo);
        if (skuKey) mapaVendasAbc.set(skuKey, (mapaVendasAbc.get(skuKey) || 0) + Number(a.quantidade || 0));
      });
    }

    const { data: estData } = await supabase.from('estoque_cd_mensal').select('sku, estoque').eq('canal', canalSelecionado).eq('mes_referencia', mesSelecionado);
    const mapaEstoqueCD = new Map();
    if (estData) estData.forEach((e: any) => mapaEstoqueCD.set(e.sku, Number(e.estoque)));

    const mapaAgrupado = new Map<string, any>();
    const trocasJaProcessadas = new Set<string>();

    // Datas das vendas válidas por SKU (para o ritmo "N vendas em D dias")
    const colData = colDataVendas.trim().toUpperCase();
    const mapaDias = new Map<string, Map<number, number>>();
    const registrarDia = (skuKey: string, qtd: number, linha: any, linhaPai?: any) => {
      if (!colData) return;
      let dia = parseDiaVenda(linha?.[colData]);
      if (dia === null && linhaPai) dia = parseDiaVenda(linhaPai?.[colData]);
      if (dia === null) return;
      const m = mapaDias.get(skuKey) || new Map<number, number>();
      m.set(dia, (m.get(dia) || 0) + qtd);
      mapaDias.set(skuKey, m);
    };

    let r = startRow;
    while (r < matrizVendas.length) {
      const row = matrizVendas[r];
      if (!row) { r++; continue; }

      const idPedido = String(row[colPedido] || "").trim();
      const textoStatus = temColunaPacote ? String(row[colPacote] || "").trim() : "";
      const statusLower = textoStatus.toLowerCase();

      // Pula linha-mãe de alteração original (o valor foi associado à troca)
      if (statusLower.includes("solicitação de alteração")) {
        r++;
        continue;
      }

      const isTroca = statusLower.includes("troca");
      const matchPacote = temColunaPacote ? textoStatus.match(/^pacote\s*(?:de)?\s*(\d+)/i) : null;

      // Forma de entrega Flex
      const formaEntregaTexto = temColunaEntrega ? String(row[colEntrega] || "") : "";
      const isFlex = ehEnvioComTaxa(formaEntregaTexto);

      // CANCELADO: a informação está no próprio status (coluna D). Linha cancelada não é venda:
      // não entra PDV (receita) nem o abatimento do custo (CMV) do SKU.
      const isCanceladaOuDevolvida = !isTroca && statusCancelado(textoStatus);

      if (isCanceladaOuDevolvida) {
        r++;
        continue;
      }

      // CASO 1: TROCA DE PRODUTO (Custo e faturamento computados 1x)
      if (isTroca) {
        const skuOrig = String(row[colSku] || "").trim();
        const skuKey = normalizarSku(skuOrig);

        if (skuKey) {
          const chaveTroca = `${idPedido}_${skuKey}`;

          if (!trocasJaProcessadas.has(chaveTroca)) {
            trocasJaProcessadas.add(chaveTroca);

            const infoOrig = pedidosAlteracaoMap.get(idPedido);
            
            if (infoOrig) {
              let receitaTroca = parseNumero(row[colPdv]);
              if (receitaTroca === 0) receitaTroca = infoOrig.receita;

              let liquidoTroca = infoOrig.liquido;
              if (isFlex && !infoOrig.isFlex) {
                liquidoTroca -= taxaFlexUnit;
              }

              registrarDia(skuKey, 1, row);
              if (mapaAgrupado.has(skuKey)) {
                const exist = mapaAgrupado.get(skuKey);
                exist.receitaBruta += receitaTroca;
                exist.liquidoML += liquidoTroca;
                exist.qtdVendida += 1;
              } else {
                mapaAgrupado.set(skuKey, {
                  sku: skuOrig,
                  skuKey: skuKey,
                  receitaBruta: receitaTroca,
                  liquidoML: liquidoTroca,
                  qtdVendida: 1
                });
              }
            }
          }
        }
        r++;
        continue;
      }

      // CASO 2: PRODUTO EM CARRINHO (DESCONSIDERA A LINHA DO PACOTE E RECALCULA TAXAS VIA MLB)
      if (matchPacote) {
        const qtdItensPacote = parseInt(matchPacote[1], 10);

        for (let k = 1; k <= qtdItensPacote; k++) {
          if (r + k < matrizVendas.length) {
            const chRow = matrizVendas[r + k];
            // Cada item do carrinho tem o seu próprio status: item cancelado sai (sem PDV e sem custo)
            if (!chRow || statusCancelado(temColunaPacote ? chRow[colPacote] : "")) continue;
            const chSkuOrig = String(chRow[colSku] || "").trim();
            const chSkuKey = normalizarSku(chSkuOrig);
            const chMlbCod = String(chRow[colMlb] || "").trim().toUpperCase();
            const chQtd = Math.max(1, parseNumero(chRow[colQtd]) || 1);
            const chPdvUnit = parseNumero(chRow[colPdv]);
            const chReceitaTotalItem = chPdvUnit * chQtd;

            if (chSkuKey) {
              // 1. Busca regras do anúncio por MLB ou por SKU
              const mlRegra = regrasMlMlbMap.get(chMlbCod) || regrasMlSkuMap.get(chSkuKey);

              // 2. Comissão do MLB
              const comissaoPct = mlRegra && Number(mlRegra.comissao) > 0 ? Number(mlRegra.comissao) : (Number(comissaoPadrao) || 19);
              
              // 3. Validação dos R$ 79,00
              let tarifaFixaItem = 0;
              let freteTotalItem = 0;

              if (chPdvUnit < 79.00) {
                // Abaixo de R$ 79: desconta a tarifa fixa (R$ 6,50 do ML)
                tarifaFixaItem = 6.50 * chQtd;
              } else {
                // A partir de R$ 79: consulta peso real e dimensões cadastradas no MLB e debita frete da matriz
                const pesoReal = mlRegra && Number(mlRegra.peso_real) > 0 ? Number(mlRegra.peso_real) : (Number(mlRegra?.peso) || 2.0);
                const altura = mlRegra && Number(mlRegra.altura) > 0 ? Number(mlRegra.altura) : 10;
                const largura = mlRegra && Number(mlRegra.largura) > 0 ? Number(mlRegra.largura) : 10;
                const comprimento = mlRegra && Number(mlRegra.comprimento) > 0 ? Number(mlRegra.comprimento) : 10;

                const freteUnitario = calcularFreteML(chPdvUnit, pesoReal, altura, largura, comprimento);
                freteTotalItem = freteUnitario * chQtd;
              }

              const comissaoTotalItem = (chReceitaTotalItem * (comissaoPct / 100)) + tarifaFixaItem;

              // Líquido recalculado do item sem superfaturamento de carrinho
              let liquidoCalculadoItem = chReceitaTotalItem - comissaoTotalItem - freteTotalItem;

              if (isFlex) {
                liquidoCalculadoItem -= taxaFlexUnit;
              }

              registrarDia(chSkuKey, chQtd, chRow, row);
              if (mapaAgrupado.has(chSkuKey)) {
                const exist = mapaAgrupado.get(chSkuKey);
                exist.receitaBruta += chReceitaTotalItem;
                exist.liquidoML += liquidoCalculadoItem;
                exist.qtdVendida += chQtd;
              } else {
                mapaAgrupado.set(chSkuKey, {
                  sku: chSkuOrig,
                  skuKey: chSkuKey,
                  receitaBruta: chReceitaTotalItem,
                  liquidoML: liquidoCalculadoItem,
                  qtdVendida: chQtd
                });
              }
            }
          }
        }

        r += (qtdItensPacote + 1);
      } else {
        // CASO 3: VENDA AVULSA PADRÃO
        const skuOriginal = String(row[colSku] || "").trim();
        const skuKey = normalizarSku(skuOriginal);

        if (!skuKey || skuKey === "sku" || skuKey === "total") {
          r++;
          continue;
        }

        const qtdLinha = Math.max(1, parseNumero(row[colQtd]) || 1);
        let pdvUnit = parseNumero(row[colPdv]);
        let receitaBrutaLinha = pdvUnit * qtdLinha;

        if (receitaBrutaLinha === 0 && colRecPacote && !modoFormulaRegras) {
          receitaBrutaLinha = parseNumero(row[colRecPacote]);
        }

        let liquidoLinha = 0;

        if (modoFormulaRegras) {
          // CANAIS FORA DO ML: PDV, SKU e Qtd nas colunas informadas + fórmula de vendas (igual à aba Regras)
          const calc = avaliarFormulaCanal(formulaVendas, pdvUnit, qtdLinha, colPdv, colQtd);
          // resultado inválido numa linha (ex.: negativo): mesmo critério do dashboard, PDV − 16%
          liquidoLinha = calc !== null ? calc : Math.max(0, receitaBrutaLinha * 0.84);
          if (isFlex) liquidoLinha -= taxaFlexUnit;   // envio com taxa definido na Configuração do Canal (opcional)
        } else {
          // MERCADO LIVRE: Coluna T com abatimento de Flex
          liquidoLinha = parseNumero(row[colLiquido]);
          if (isFlex) {
            liquidoLinha -= taxaFlexUnit;
          }
        }

        registrarDia(skuKey, qtdLinha, row);
        if (mapaAgrupado.has(skuKey)) {
          const exist = mapaAgrupado.get(skuKey);
          exist.receitaBruta += receitaBrutaLinha;
          exist.liquidoML += liquidoLinha;
          exist.qtdVendida += qtdLinha;
        } else {
          mapaAgrupado.set(skuKey, {
            sku: skuOriginal,
            skuKey: skuKey,
            receitaBruta: receitaBrutaLinha,
            liquidoML: liquidoLinha,
            qtdVendida: qtdLinha
          });
        }
        r++;
      }
    }

    // Consolidação Financeira Final
    const resultados = Array.from(mapaAgrupado.values()).map((item: any) => {
      const skuKey = item.skuKey;
      const custoData = custosMap.get(skuKey);
      const custoUnitario = Number(custoData?.custo_unitario || 0);
      const produtoNome = custoData?.produto || "Produto Desconhecido";
      
      const estoqueCD = mapaEstoqueCD.get(skuKey) || 0;
      const estoqueCentral = tinyMap.get(skuKey) || 0;

      const devolucoesTotais = mapaDevContagem.get(skuKey) || 0;
      const vendasTotais = Math.max(mapaVendasAbc.get(skuKey) || 0, item.qtdVendida);
      const taxaDevolucao = vendasTotais > 0 ? (devolucoesTotais / vendasTotais) * 100 : 0;

      let lucroRs = 0;
      let margemPct = 0;

      if (item.qtdVendida > 0) {
        const custoProdutoTotal = custoUnitario * item.qtdVendida;
        const impostoTotal = item.receitaBruta * (impostoPct / 100);
        const embalagemTotal = modoLogistica === "padrao" ? (embalagemUnit * item.qtdVendida) : 0;

        // FÓRMULA FINAL: LÍQUIDO RECALCULADO - CUSTO - IMPOSTO - EMBALAGEM
        lucroRs = item.liquidoML - custoProdutoTotal - impostoTotal - embalagemTotal;
        margemPct = item.receitaBruta > 0 ? (lucroRs / item.receitaBruta) * 100 : 0;
      }

      const tarifaFreteSoma = item.receitaBruta - item.liquidoML;

      // Indicadores Logísticos
      const vmd = item.qtdVendida / 30;
      const coberturaAtual = vmd > 0 ? (estoqueCD / vmd) : (estoqueCD > 0 ? 999 : 0);
      let sugestaoEnvioBruta = Math.ceil((vmd * metaDias) - estoqueCD);
      if (sugestaoEnvioBruta < 0) sugestaoEnvioBruta = 0;

      let statusEstoque = "";
      if (coberturaAtual <= 10 && vmd > 0) statusEstoque = "Ruptura Iminente";
      else if (coberturaAtual > 60 && estoqueCD > 5) statusEstoque = "Risco de Aging";
      else if (vmd === 0 && estoqueCD > 0) statusEstoque = "Estoque Parado";
      else statusEstoque = "Saudável";

      // Devolução alta (limite definido na Configuração do Canal): não recomenda o envio.
      // Só vale com amostra mínima de vendas, para 1 devolução em 1 venda não bloquear o item.
      const devAlta = devolucoesTotais > 0 && vendasTotais >= amostraMinDev && taxaDevolucao >= limiteDevolucao;
      const ritmo = classificarRitmo(regrasRitmo, item.qtdVendida, mapaDias.get(skuKey) || null, diasDoMesRef(mesSelecionado));

      let statusEnvio = "";
      let qtdEnviar = sugestaoEnvioBruta;
      if (sugestaoEnvioBruta > 0 && devAlta) {
        statusEnvio = `🚫 Não Enviar (Devolução ${taxaDevolucao.toFixed(1)}%)`;
        qtdEnviar = 0;
      } else if (sugestaoEnvioBruta > 0) {
        if (estoqueCentral >= sugestaoEnvioBruta) statusEnvio = "✅ Enviar Agora";
        else if (estoqueCentral > 0 && estoqueCentral < sugestaoEnvioBruta) {
          statusEnvio = "⚠️ Enviar Parcial";
          qtdEnviar = estoqueCentral; 
        } else {
          statusEnvio = "❌ Falta no Central";
          qtdEnviar = 0;
        }
      } else {
        statusEnvio = "⏸️ Não Enviar";
      }

      let diagnostico = "";
      if (margemPct <= 0) {
        diagnostico = "❌ Prejuízo (Sem Futuro)";
      } else if (taxaDevolucao >= limiteDevolucao && devolucoesTotais > 0) {
        diagnostico = "⛔ Alta Devolução (Sem Futuro)";
      } else if (margemPct >= metaMargemPromissora && item.qtdVendida >= metaVendasMin && taxaDevolucao < limiteDevolucao) {
        diagnostico = "🌟 Promissor (Escalar)";
      } else if (margemPct < 10) {
        diagnostico = "⚠️ Margem Baixa (Atenção)";
      } else {
        diagnostico = "✅ Regular (Manter)";
      }

      return {
        canal: canalSelecionado, mes_referencia: mesSelecionado, sku: item.sku, produto: produtoNome,
        qtd_vendida: item.qtdVendida, receita_bruta: item.receitaBruta, estoque_cd: estoqueCD, armazenagem: 0,
        estoque_central: estoqueCentral, custo_produto: custoUnitario * item.qtdVendida, imposto: item.receitaBruta * (impostoPct / 100),
        tarifa_frete: tarifaFreteSoma, embalagem: modoLogistica === "padrao" ? (embalagemUnit * item.qtdVendida) : 0, 
        lucro_liquido: lucroRs, margem_pct: margemPct,
        vmd: Number(vmd.toFixed(2)), cobertura_dias: Number(coberturaAtual.toFixed(1)), sugestao_envio: qtdEnviar,
        status_estoque: statusEstoque, status_envio: statusEnvio, taxa_devolucao: taxaDevolucao,
        qtd_devolucoes: devolucoesTotais, diagnostico: diagnostico,
        ritmo_vendas: ritmo.status, ritmo_nivel: ritmo.nivel, ritmo_por_data: ritmo.porData, dev_atencao: taxaDevolucao >= limiteAtencaoDev && devolucoesTotais > 0
      };
    });

    setDadosProcessados(resultados.sort((a: any, b: any) => b.receita_bruta - a.receita_bruta));
    setLoading(false);
  };

  const salvarDadosNoBanco = async () => {
    if (dadosProcessados.length === 0) return;
    setSalvando(true);
    const tabela = modoLogistica === "full" ? "full_lancamentos" : "vendas_padrao_lancamentos";
    
    await supabase.from(tabela).delete().eq('canal', canalSelecionado).eq('mes_referencia', mesSelecionado);
    
    let payloadFormatado: any[] = [];

    if (modoLogistica === "padrao") {
      payloadFormatado = dadosProcessados.map((item: any) => ({
        canal: item.canal,
        mes_referencia: item.mes_referencia,
        sku: item.sku,
        produto: item.produto,
        qtd_vendida: item.qtd_vendida,
        receita_bruta: item.receita_bruta,
        custo_produto: item.custo_produto,
        imposto: item.imposto,
        tarifa_frete: item.tarifa_frete,
        embalagem: item.embalagem || 0,
        lucro_liquido: item.lucro_liquido,
        margem_pct: item.margem_pct,
        taxa_devolucao: item.taxa_devolucao || 0,
        qtd_devolucoes: item.qtd_devolucoes || 0,
        diagnostico: item.diagnostico || ""
      }));
    } else {
      payloadFormatado = dadosProcessados.map((item: any) => ({
        canal: item.canal,
        mes_referencia: item.mes_referencia,
        sku: item.sku,
        produto: item.produto,
        qtd_vendida: item.qtd_vendida,
        receita_bruta: item.receita_bruta,
        estoque_cd: item.estoque_cd || 0,
        armazenagem: item.armazenagem || 0,
        estoque_central: item.estoque_central || 0,
        custo_produto: item.custo_produto,
        imposto: item.imposto,
        tarifa_frete: item.tarifa_frete,
        lucro_liquido: item.lucro_liquido,
        margem_pct: item.margem_pct,
        vmd: item.vmd || 0,
        cobertura_dias: item.cobertura_dias || 0,
        sugestao_envio: item.sugestao_envio || 0,
        status_estoque: item.status_estoque || "",
        status_envio: item.status_envio || "",
        taxa_devolucao: item.taxa_devolucao || 0,
        qtd_devolucoes: item.qtd_devolucoes || 0,
        ritmo_vendas: item.ritmo_vendas || ""
      }));
    }

    let res = await supabase.from(tabela).insert(payloadFormatado);
    if (res.error && modoLogistica === "full" && /taxa_devolucao|qtd_devolucoes|ritmo_vendas/i.test(res.error.message)) {
      // Migration das colunas de devolução/ritmo ainda não executada: grava o restante e avisa
      const semNovas = payloadFormatado.map(({ taxa_devolucao, qtd_devolucoes, ritmo_vendas, ...resto }: any) => resto);
      res = await supabase.from(tabela).insert(semNovas);
      if (!res.error) alert("Análise gravada, mas SEM os campos de devolução e ritmo: execute a migration 20261104090000_full_lancamentos_devolucao_ritmo.sql no Supabase.");
    }
    
    if (res.error) {
      alert("Erro ao gravar resultados no banco: " + res.error.message);
    } else {
      if (modoLogistica === "full") {
        // Vendas válidas do mês (cancelados já ficaram de fora) dão baixa nos lotes enviados ao Full, do mais antigo ao mais novo (FIFO)
        const vendasMes = dadosProcessados
          .filter((i: any) => Number(i.qtd_vendida) > 0)
          .map((i: any) => ({ canal: canalSelecionado, mes_referencia: mesSelecionado, sku: normalizarSku(i.sku), qtd: Math.round(Number(i.qtd_vendida)) }));
        const del = await supabase.from("fulfillment_vendas_mes").delete().eq("canal", canalSelecionado).eq("mes_referencia", mesSelecionado);
        if (!del.error && vendasMes.length > 0) {
          for (let i = 0; i < vendasMes.length; i += 500) await supabase.from("fulfillment_vendas_mes").insert(vendasMes.slice(i, i + 500));
        }
        await recalcularFifo();
      }
      alert(`✅ Análise gravada com sucesso!`);
      setMatrizVendas([]);
      setDadosProcessados([]);
      carregarHistoricoGravado();
      setSubAba("relatorio");
    }
    setSalvando(false);
  };

  const limparCanalInteiro = async () => {
    if (!confirm(`ATENÇÃO: Deseja apagar todo o Relatório Analítico salvo de ${canalSelecionado} no mês de ${mesSelecionado}?`)) return;
    const tabela = modoLogistica === "full" ? "full_lancamentos" : "vendas_padrao_lancamentos";
    await supabase.from(tabela).delete().eq('canal', canalSelecionado).eq('mes_referencia', mesSelecionado);
    if (modoLogistica === "full") {
      await supabase.from("fulfillment_vendas_mes").delete().eq("canal", canalSelecionado).eq("mes_referencia", mesSelecionado);
      await recalcularFifo();
    }
    carregarHistoricoGravado();
  };

  const baseRows = dadosProcessados.length > 0 ? dadosProcessados : lancamentosGravados;

  // FULL: todo SKU que está no estoque do CD aparece, vendendo ou não.
  // Sem venda => só a quantidade em estoque (CD e Sede); vendas, receita, margem, cobertura e envio ficam zerados.
  const dataSource = (() => {
    if (modoLogistica !== "full" || estoqueCDLista.length === 0) return baseRows;
    const jaTem = new Set(baseRows.map((i: any) => normalizarSku(i.sku)));
    const semVenda = estoqueCDLista
      .filter((e: any) => Number(e.estoque) > 0 && !jaTem.has(normalizarSku(e.sku)))
      .map((e: any) => {
        const skuKey = normalizarSku(e.sku);
        return {
          canal: canalSelecionado, mes_referencia: mesSelecionado, sku: skuKey,
          produto: custosMap.get(skuKey)?.produto || "Produto Desconhecido",
          qtd_vendida: 0, receita_bruta: 0, estoque_cd: Number(e.estoque), armazenagem: 0,
          estoque_central: tinyMap.get(skuKey) || 0, custo_produto: 0, imposto: 0, tarifa_frete: 0,
          lucro_liquido: 0, margem_pct: 0, vmd: 0, cobertura_dias: 0, sugestao_envio: 0,
          status_estoque: "Estoque Parado", status_envio: "⏸️ Não Enviar", taxa_devolucao: 0, qtd_devolucoes: 0, diagnostico: "", ritmo_vendas: "Sem vendas",
        };
      })
      .sort((a: any, b: any) => b.estoque_cd - a.estoque_cd);
    return [...baseRows, ...semVenda];
  })();

  // Armazenagem: lotes enviados ao Full, aviso a partir de 90 dias (cobrança em 120)
  const hojeISO = hojeSaoPaulo();
  const lotesCalc: Lote[] = lotes.map((l: any) => ({ id: l.id, sku: l.sku, dataEntrada: String(l.data_entrada).slice(0, 10), qtdEnviada: Number(l.qtd_enviada), qtdRemanescente: Number(l.qtd_remanescente) }));
  const resumoArmazenagem = resumirArmazenagemPorSku(lotesCalc, hojeISO);
  const skusEmAlerta = Array.from(resumoArmazenagem.values()).filter((r) => r.nivel !== "OK").sort((a, b) => a.diasParaCobranca - b.diasParaCobranca);

  const remessasAgrupadas = (() => {
    const mapa = new Map<string, any>();
    lotes.forEach((l: any) => {
      const data = String(l.data_entrada).slice(0, 10);
      const chave = l.importacao_id || `${data}_${l.arquivo_origem || ""}_${l.id}`;
      const g = mapa.get(chave) || { importacao_id: l.importacao_id, ids: [] as any[], data, dataBR: data.split("-").reverse().join("/"), arquivo: l.arquivo_origem, skus: 0, enviada: 0, saldo: 0 };
      g.ids.push(l.id); g.skus += 1; g.enviada += Number(l.qtd_enviada); g.saldo += Number(l.qtd_remanescente);
      mapa.set(chave, g);
    });
    return Array.from(mapa.values()).sort((a, b) => (a.data < b.data ? 1 : -1));
  })();

  const filtrados = dataSource.filter((item: any) => {
    const mText = !pesquisaBusca || String(item.sku).toLowerCase().includes(pesquisaBusca.toLowerCase()) || String(item.produto).toLowerCase().includes(pesquisaBusca.toLowerCase());
    const armz = resumoArmazenagem.get(normalizarSku(item.sku));
    const mStatus = filtroStatus === "TODOS" ||
      (modoLogistica === "full"
        ? (filtroStatus === "Armazenagem"
            ? (!!armz && armz.nivel !== "OK")
            : filtroStatus.startsWith("ritmo:")
            ? String(item.ritmo_vendas || "") === filtroStatus.slice(6)
            : (item.status_estoque === filtroStatus || (item.status_envio && item.status_envio.includes(filtroStatus))))
        : (item.diagnostico && item.diagnostico.includes(filtroStatus)));
    return mText && mStatus;
  });

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Logística Integrada</h1>
            <p className="text-sm font-medium text-slate-400">Motor de Análise para Modalidade Full/FBA e Própria</p>
          </div>
          <Navbar />
        </div>

        {/* TOGGLE MODALIDADE */}
        <div className="flex flex-wrap gap-4 mb-8 border-b border-slate-800 pb-6">
          <button 
            onClick={() => { setModoLogistica("full"); setSubAba("vendas"); setDadosProcessados([]); }} 
            className={`px-8 py-3.5 rounded-xl font-black text-sm tracking-wider cursor-pointer transition-all ${modoLogistica === "full" ? "bg-purple-600 text-white shadow-lg shadow-purple-900/40" : "bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800"}`}
          >
            ⚡ Logística Full / FBA
          </button>
          <button 
            onClick={() => { setModoLogistica("padrao"); setSubAba("vendas"); setDadosProcessados([]); }} 
            className={`px-8 py-3.5 rounded-xl font-black text-sm tracking-wider cursor-pointer transition-all ${modoLogistica === "padrao" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40" : "bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800"}`}
          >
            📦 Logística Própria (Padrão)
          </button>
        </div>

        {/* PARÂMETROS GLOBAIS COMUNS */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Canal Logístico:</label>
              <select value={canalSelecionado} onChange={e => setCanalSelecionado(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none cursor-pointer">
                {canais.map((c, i) => <option key={i} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Competência (Mês de Análise):</label>
              <select value={mesSelecionado} onChange={e => setMesSelecionado(e.target.value)} className={`w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold outline-none cursor-pointer ${modoLogistica === "full" ? "text-purple-400" : "text-indigo-400"}`}>
                {meses.map((m, i) => <option key={i} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* NAVEGAÇÃO DE SUB-ABAS */}
        <div className="flex flex-wrap gap-3 mb-6">
          {modoLogistica === "full" && (
            <button onClick={() => setSubAba("estoque")} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${subAba === "estoque" ? "bg-amber-600 text-white shadow-amber-900/30" : "bg-slate-900 text-slate-400 border border-slate-800"}`}>
              📦 1. Upload Estoque do CD
            </button>
          )}
          <button onClick={() => setSubAba("vendas")} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${subAba === "vendas" ? (modoLogistica === "full" ? "bg-purple-600 text-white" : "bg-indigo-600 text-white") : "bg-slate-900 text-slate-400 border border-slate-800"}`}>
            ⚡ {modoLogistica === "full" ? "2. Motor de Reposição" : "1. Motor de Diagnóstico"}
          </button>
          <button onClick={() => setSubAba("relatorio")} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${subAba === "relatorio" ? "bg-emerald-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-800"}`}>
            📊 {modoLogistica === "full" ? "3. Ranking e Relatório" : "2. Veredicto e Relatório"}
          </button>
          <button onClick={() => setSubAba("config")} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${subAba === "config" ? "bg-cyan-600 text-white shadow-cyan-900/30" : "bg-slate-900 text-slate-400 border border-slate-800"}`}>
            ⚙️ Configuração do Canal
          </button>
        </div>

        {/* ABA ESTOQUE (SÓ FULL) */}
        {subAba === "estoque" && modoLogistica === "full" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-2">
              <div>
                <h2 className="text-lg font-bold text-amber-400 flex items-center gap-2"><span>📦 Registar Fotografia de Estoque do CD</span></h2>
                <p className="text-xs text-slate-400 mt-1">Carregue a planilha de inventário do marketplace para cruzamento e reposição.</p>
              </div>
              <button onClick={limparEstoqueSalvo} disabled={salvando} className="bg-rose-950/80 hover:bg-rose-900 text-rose-400 border border-rose-800/50 font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all">
                🗑️ Limpar Estoque do Mês
              </button>
            </div>
            <div className="bg-amber-950/20 p-5 rounded-xl border border-amber-900/30">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Ficheiro de Estoque (Excel/CSV):</label>
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUploadEstoque} className="w-full bg-slate-950 border border-slate-700 file:border-0 file:bg-amber-600 file:text-white file:text-xs file:font-bold file:py-2.5 file:px-4 file:rounded-lg file:mr-4 file:cursor-pointer rounded-xl p-1.5 text-xs text-slate-300 cursor-pointer" />
                </div>
                <div><label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Linha Inicial</label><input type="number" value={linhaEstoque} onChange={e => setLinhaEstoque(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" /></div>
                <div><label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Coluna SKU</label><input type="text" value={colSkuEstoque} onChange={e => setColSkuEstoque(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" /></div>
                <div><label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Coluna Qtd</label><input type="text" value={colQtdEstoque} onChange={e => setColQtdEstoque(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-emerald-400 outline-none" /></div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={processarPreviewEstoque} disabled={matrizEstoque.length === 0} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">1. Ler e Pré-visualizar</button>
                {previewEstoque.length > 0 && <button onClick={salvarEstoqueNoBanco} disabled={salvando} className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-amber-900/40">{salvando ? "A Salvar..." : "2. Guardar Estoque"}</button>}
              </div>
            </div>
            {previewEstoque.length > 0 && (
              <div className="overflow-x-auto max-h-[400px] border border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 uppercase text-[10px]"><tr><th className="p-3">SKU Consolidado</th><th className="p-3 text-right">Estoque Lido Total</th></tr></thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {previewEstoque.slice(0, 50).map((item: any, idx: number) => (<tr key={idx}><td className="p-3 font-mono font-bold text-white">{item.sku}</td><td className="p-3 text-right font-bold text-emerald-400">{item.quantidade} un.</td></tr>))}
                  </tbody>
                </table>
              </div>
            )}

            {/* REMESSA ENVIADA AO FULL — registra com a data do upload e controla os 90/120 dias */}
            <div className="border-t border-slate-800 pt-6 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-purple-400 flex items-center gap-2"><span>🚚 Registrar Estoque Enviado ao Full</span></h2>
                <p className="text-xs text-slate-400 mt-1">
                  Suba a planilha do que foi enviado. A data de entrada é registrada automaticamente com o dia do upload
                  (<strong className="text-slate-200">{hojeISO.split("-").reverse().join("/")}</strong>). Ao completar {DIAS_ALERTA_PADRAO} dias o sistema avisa quantos dias faltam para {DIAS_COBRANCA_PADRAO}, quando a armazenagem passa a ser cobrada.
                </p>
              </div>
              <div className="bg-purple-950/20 p-5 rounded-xl border border-purple-900/30">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Planilha da Remessa (Excel/CSV):</label>
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUploadRemessa} className="w-full bg-slate-950 border border-slate-700 file:border-0 file:bg-purple-600 file:text-white file:text-xs file:font-bold file:py-2.5 file:px-4 file:rounded-lg file:mr-4 file:cursor-pointer rounded-xl p-1.5 text-xs text-slate-300 cursor-pointer" />
                  </div>
                  <div><label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Linha Inicial</label><input type="number" value={linhaRemessa} onChange={e => setLinhaRemessa(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" /></div>
                  <div><label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Coluna SKU</label><input type="text" value={colSkuRemessa} onChange={e => setColSkuRemessa(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" /></div>
                  <div><label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Coluna Qtd Enviada</label><input type="text" value={colQtdRemessa} onChange={e => setColQtdRemessa(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-emerald-400 outline-none" /></div>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={processarPreviewRemessa} disabled={matrizRemessa.length === 0} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">1. Ler e Pré-visualizar</button>
                  {previewRemessa.length > 0 && <button onClick={registrarRemessa} disabled={salvando} className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-purple-900/40">{salvando ? "A Registar..." : `2. Registrar Remessa (${hojeISO.split("-").reverse().join("/")})`}</button>}
                </div>
              </div>

              {previewRemessa.length > 0 && (
                <div className="overflow-x-auto max-h-[300px] border border-slate-800 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 uppercase text-[10px]"><tr><th className="p-3">SKU</th><th className="p-3">Produto</th><th className="p-3 text-right">Qtd Enviada</th></tr></thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {previewRemessa.slice(0, 100).map((item: any, idx: number) => (<tr key={idx}><td className="p-3 font-mono font-bold text-white">{item.skuNorm}</td><td className="p-3 text-slate-300 truncate max-w-[260px]">{item.produto}</td><td className="p-3 text-right font-bold text-emerald-400">{item.quantidade} un.</td></tr>))}
                    </tbody>
                  </table>
                </div>
              )}

              {skusEmAlerta.length > 0 && (
                <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl p-4 text-xs text-amber-200 space-y-1">
                  <div className="font-black uppercase tracking-wider text-amber-400 text-[11px] mb-1">⚠️ Armazenagem — {skusEmAlerta.length} SKU(s) em atenção</div>
                  {skusEmAlerta.slice(0, 15).map((r) => (
                    <div key={r.sku}><span className="font-mono font-bold text-white">{r.sku}</span> — {r.nivel === "COBRANDO" ? r.qtdCobrando : r.qtdEmAlerta} un. · {textoAlertaArmazenagem(r.nivel, r.diasParaCobranca)}</div>
                  ))}
                  {skusEmAlerta.length > 15 && <div className="text-amber-400/70">… e mais {skusEmAlerta.length - 15} SKUs (veja no Relatório)</div>}
                </div>
              )}

              {remessasAgrupadas.length > 0 && (
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                      <tr><th className="p-3">Data do Upload</th><th className="p-3">Planilha</th><th className="p-3 text-right">SKUs</th><th className="p-3 text-right">Enviado</th><th className="p-3 text-right">Ainda no Full*</th><th className="p-3 text-center">Dias</th><th className="p-3">Situação</th><th className="p-3"></th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {remessasAgrupadas.map((g: any, idx: number) => {
                        const st = statusArmazenagem(g.data, g.saldo, hojeISO);
                        return (
                          <tr key={idx}>
                            <td className="p-3 font-mono text-white">{g.dataBR}</td>
                            <td className="p-3 text-slate-300 truncate max-w-[220px]">{g.arquivo || "—"}</td>
                            <td className="p-3 text-right text-slate-300">{g.skus}</td>
                            <td className="p-3 text-right text-slate-300">{g.enviada}</td>
                            <td className="p-3 text-right font-bold text-emerald-400">{g.saldo}</td>
                            <td className="p-3 text-center font-mono text-slate-300">{st.dias}</td>
                            <td className="p-3 text-[11px] font-bold">
                              {g.saldo <= 0 ? <span className="text-slate-500">Vendido por completo</span>
                                : st.nivel === "COBRANDO" ? <span className="text-rose-400">💸 {textoAlertaArmazenagem(st.nivel, st.diasParaCobranca)}</span>
                                : st.nivel === "ALERTA" ? <span className="text-amber-400">⏳ {textoAlertaArmazenagem(st.nivel, st.diasParaCobranca)}</span>
                                : <span className="text-emerald-400">✔️ Faltam {Math.max(0, DIAS_ALERTA_PADRAO - st.dias)} dias para o aviso</span>}
                            </td>
                            <td className="p-3 text-right"><button onClick={() => excluirRemessa(g)} className="text-rose-400 hover:text-rose-300 text-[10px] font-bold uppercase cursor-pointer">Excluir</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="p-3 text-[10px] text-slate-500">* Remessa menos as vendas válidas já gravadas (cancelados não abatem), do lote mais antigo para o mais novo (FIFO).</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA CONFIGURAÇÃO DO CANAL */}
        {subAba === "config" && (
          <div className="space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
              <div className="flex flex-wrap justify-between items-start gap-4">
                <div>
                  <h2 className="text-lg font-bold text-cyan-400 flex items-center gap-2"><span>⚙️ Configuração do Canal — {canalSelecionado}</span></h2>
                  <p className="text-xs text-slate-400 mt-1">Cada canal tem a sua própria configuração: onde estão as colunas na planilha de vendas e como o líquido é calculado. Fica salva neste navegador, por canal.</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => {
                    if (formulaCanal === "ml_recalculo") aplicarPadraoML();
                    else if (!aplicarRegrasDoCanal(canalSelecionado)) alert("Este canal ainda não tem fórmula cadastrada na aba Regras. Foi aplicado o modelo padrão (colunas B, O e P); ajuste conforme a sua planilha.");
                    setCfgSalva(false);
                  }} className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider cursor-pointer">↺ Restaurar padrão do canal</button>
                  <button type="button" onClick={() => { salvarConfiguracoes(); setCfgSalva(true); }} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider cursor-pointer shadow-lg shadow-cyan-900/40">💾 Salvar configuração</button>
                </div>
              </div>
              {cfgSalva && <div className="text-xs text-emerald-400 font-bold">✔ Configuração de {canalSelecionado} salva. Ela será carregada sempre que você escolher este canal.</div>}

              {/* CONCEITO DO CANAL */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                  <div>
                    <label className="block text-[10px] font-black text-purple-400 uppercase tracking-wider mb-1">Como o líquido deste canal é calculado:</label>
                    <select
                      value={formulaCanal}
                      onChange={e => {
                        const novo = e.target.value as "ml_recalculo" | "formula_regras";
                        setFormulaCanal(novo);
                        if (novo === "ml_recalculo") aplicarPadraoML(); else aplicarRegrasDoCanal(canalSelecionado);
                        setCfgSalva(false);
                      }}
                      className="w-full bg-slate-900 border border-purple-500/50 rounded-lg p-2 text-xs font-bold text-white outline-none cursor-pointer"
                    >
                      <option value="ml_recalculo">Mercado Livre (relatório de vendas do ML)</option>
                      <option value="formula_regras">Fórmula de Vendas (como na aba Regras)</option>
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">Ao trocar, as colunas voltam ao padrão do conceito escolhido.</p>
                  </div>
                  <div className="md:col-span-2 text-xs text-slate-300 bg-slate-900/80 p-3 rounded-lg border border-slate-800/80 leading-relaxed">
                    {formulaCanal === "ml_recalculo" ? (
                      <span><strong className="text-emerald-400">Mercado Livre:</strong> usa o líquido da planilha (coluna T). Carrinhos ignoram a linha-mãe e calculam cada item pelo MLB: comissão %, R$ 6,50 se PDV &lt; R$ 79 ou frete por cubagem se &ge; R$ 79. Trocas debitam o custo 1x. Status “cancelado” remove a linha (sem PDV e sem custo), inclusive dentro de pacotes.</span>
                    ) : (
                      <span><strong className="text-emerald-400">Fórmula de Vendas:</strong> você indica em que coluna estão SKU, Quantidade e PDV e escreve a fórmula, igual à aba Regras. Use <code className="text-amber-300">PDV</code> e <code className="text-amber-300">QTD</code>; o resultado é o líquido da linha. Não usa MLB nem outras regras do ML.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* FÓRMULA (fora do ML) */}
              {formulaCanal === "formula_regras" && (
                <div className="bg-emerald-950/10 p-4 rounded-xl border border-emerald-900/30 space-y-2">
                  <label className="block text-[10px] font-black text-emerald-400 uppercase tracking-wider">Fórmula de vendas (líquido da linha):</label>
                  <div className="flex gap-2">
                    <input type="text" value={formulaVendas} onChange={e => { setFormulaVendas(e.target.value); setCfgSalva(false); }} placeholder="PDV - (PDV * 12%)" className="flex-1 bg-slate-950 border border-emerald-600/50 rounded-lg p-2 text-xs font-mono text-emerald-300 font-bold outline-none" />
                    <button type="button" onClick={() => { if (!aplicarRegrasDoCanal(canalSelecionado)) alert("Este canal não tem fórmula cadastrada na aba Regras."); setCfgSalva(false); }} className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-3 rounded-lg text-[10px] uppercase tracking-wider cursor-pointer whitespace-nowrap">↻ Carregar da aba Regras</button>
                  </div>
                  <p className="text-[10px] text-slate-500">Exemplos: <code className="text-amber-300">PDV - (PDV * 12%)</code> · <code className="text-amber-300">(PDV * QTD) - ((PDV * QTD) * 14%) - 5</code>. Ao usar QTD, a fórmula já devolve o valor total da linha.</p>
                  {formulaVendas.trim() && avaliarFormulaCanal(formulaVendas, 100, 1, colPdvVendas, colQtdVendas) === null && <p className="text-[11px] text-rose-400 font-bold">⚠ Fórmula inválida ou com resultado negativo para PDV = 100.</p>}
                  {formulaVendas.trim() && avaliarFormulaCanal(formulaVendas, 100, 1, colPdvVendas, colQtdVendas) !== null && <p className="text-[11px] text-slate-400">Teste: PDV 100, QTD 1 → líquido R$ {(avaliarFormulaCanal(formulaVendas, 100, 1, colPdvVendas, colQtdVendas) as number).toFixed(2)}</p>}
                </div>
              )}

              {/* COLUNAS DA PLANILHA DE VENDAS */}
              <div className={`p-5 rounded-xl border ${modoLogistica === "full" ? "bg-purple-950/10 border-purple-900/20" : "bg-indigo-950/10 border-indigo-900/20"}`}>
                <h3 className="text-[11px] font-black text-slate-300 uppercase tracking-wider mb-3">Onde está cada informação na planilha de vendas de {canalSelecionado}</h3>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Linha Inicial</label>
                    <input type="number" value={linhaVendas} onChange={e => { setLinhaVendas(e.target.value); setCfgSalva(false); }} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Col. SKU</label>
                    <input type="text" value={colSkuVendas} onChange={e => { setColSkuVendas(e.target.value.toUpperCase()); setCfgSalva(false); }} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Col. Qtd</label>
                    <input type="text" value={colQtdVendas} onChange={e => { setColQtdVendas(e.target.value.toUpperCase()); setCfgSalva(false); }} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-cyan-400 uppercase mb-1" title="Preço unitário de venda do item">Col. PDV</label>
                    <input type="text" value={colPdvVendas} onChange={e => { setColPdvVendas(e.target.value.toUpperCase()); setCfgSalva(false); }} className="w-full bg-slate-900 border border-cyan-600/50 rounded-lg p-2 text-xs font-mono text-center text-cyan-300 font-bold outline-none" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-indigo-400 uppercase mb-1">Col. N.º Pedido</label>
                    <input type="text" value={colPedidoVendas} onChange={e => { setColPedidoVendas(e.target.value.toUpperCase()); setCfgSalva(false); }} className="w-full bg-slate-900 border border-indigo-600/50 rounded-lg p-2 text-xs font-mono text-center text-indigo-300 font-bold outline-none" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-amber-400 uppercase mb-1" title={formulaCanal === "ml_recalculo" ? "Coluna D do ML: 'Pacote de X produtos' ou o Status da venda. Se constar 'cancelado', a linha sai." : "Opcional. Se o canal tiver coluna de status, linhas com 'cancelado' saem do PDV e do custo."}>{formulaCanal === "ml_recalculo" ? "Col. Status/Pacote" : "Col. Status (opcional)"}</label>
                    <input type="text" value={colCarrinhoVendas} onChange={e => { setColCarrinhoVendas(e.target.value.toUpperCase()); setCfgSalva(false); }} placeholder={formulaCanal === "ml_recalculo" ? "D" : "—"} className="w-full bg-slate-900 border border-amber-600/50 rounded-lg p-2 text-xs font-mono text-center text-amber-300 font-bold outline-none" />
                  </div>

                  {modoLogistica === "full" && (
                    <div>
                      <label className="block text-[9px] font-bold text-sky-400 uppercase mb-1" title="Coluna com a data da venda. Usada para contar as vendas dentro de cada intervalo de dias (ritmo de vendas).">Col. Data da Venda</label>
                      <input type="text" value={colDataVendas} onChange={e => { setColDataVendas(e.target.value.toUpperCase()); setCfgSalva(false); }} placeholder="—" className="w-full bg-slate-900 border border-sky-600/50 rounded-lg p-2 text-xs font-mono text-center text-sky-300 font-bold outline-none" />
                    </div>
                  )}

                  {formulaCanal === "ml_recalculo" && (
                    <>
                      <div>
                        <label className="block text-[9px] font-bold text-purple-400 uppercase mb-1" title="Coluna com o código MLB do anúncio">Col. MLB Anúncio</label>
                        <input type="text" value={colMlbVendas} onChange={e => { setColMlbVendas(e.target.value.toUpperCase()); setCfgSalva(false); }} className="w-full bg-slate-900 border border-purple-600/50 rounded-lg p-2 text-xs font-mono text-center text-purple-300 font-bold outline-none" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-emerald-400 uppercase mb-1" title="Coluna com o valor líquido recebido (Total)">Col. Líquido</label>
                        <input type="text" value={colLiquidoVendas} onChange={e => { setColLiquidoVendas(e.target.value.toUpperCase()); setCfgSalva(false); }} className="w-full bg-slate-900 border border-emerald-600/50 rounded-lg p-2 text-xs font-mono text-center text-emerald-300 font-bold outline-none" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-amber-300 uppercase mb-1" title="Comissão usada quando o MLB não tem regra cadastrada">Comissão Padrão (%)</label>
                        <input type="number" value={comissaoPadrao} onChange={e => { setComissaoPadrao(e.target.value); setCfgSalva(false); }} className="w-full bg-slate-900 border border-amber-600/50 rounded-lg p-2 text-xs font-mono text-center text-amber-300 font-bold outline-none" />
                      </div>
                    </>
                  )}
                </div>

                {/* ENTREGA — cada canal descreve de um jeito */}
                <div className="mt-5 pt-4 border-t border-slate-800/80">
                  <h4 className="text-[10px] font-black text-amber-300 uppercase tracking-wider mb-1">Envio com taxa (opcional)</h4>
                  <p className="text-[10px] text-slate-500 mb-3">Cada canal escreve a forma de entrega de um jeito. Informe a coluna, o trecho de texto que identifica o envio que gera taxa e o valor descontado por pedido. Deixe a coluna vazia para não descontar nada.</p>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-amber-300 uppercase mb-1">Col. Forma de Entrega</label>
                      <input type="text" value={colEntregaVendas} onChange={e => { setColEntregaVendas(e.target.value.toUpperCase()); setCfgSalva(false); }} placeholder="—" className="w-full bg-slate-900 border border-amber-600/50 rounded-lg p-2 text-xs font-mono text-center text-amber-300 font-bold outline-none" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[9px] font-bold text-amber-300 uppercase mb-1">Texto que identifica o envio com taxa</label>
                      <input type="text" value={textoEntrega} onChange={e => { setTextoEntrega(e.target.value); setCfgSalva(false); }} placeholder={formulaCanal === "ml_recalculo" ? "flex" : "ex.: envio próprio"} className="w-full bg-slate-900 border border-amber-600/50 rounded-lg p-2 text-xs font-mono text-amber-300 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-amber-300 uppercase mb-1">Taxa por pedido (R$)</label>
                      <input type="number" step="0.01" value={taxaFlex} onChange={e => { setTaxaFlex(e.target.value); setCfgSalva(false); }} className="w-full bg-slate-900 border border-amber-600/50 rounded-lg p-2 text-xs font-mono text-center text-amber-300 font-bold outline-none" />
                    </div>
                  </div>
                </div>
                {layoutDetectado && <p className="text-[10px] text-emerald-400 mt-3">✔ {layoutDetectado}</p>}
              </div>

              {/* RITMO DE VENDAS (Full) */}
              {modoLogistica === "full" && (
                <div className="bg-sky-950/10 p-5 rounded-xl border border-sky-900/30 space-y-3">
                  <div>
                    <h3 className="text-[11px] font-black text-sky-300 uppercase tracking-wider">📈 Ritmo de vendas — status do SKU em {canalSelecionado}</h3>
                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                      Defina quantas vendas, em quantos dias, dão cada status. Vale a <strong className="text-slate-300">primeira regra da lista</strong> que o SKU atingir, então deixe a mais exigente em cima (ex.: 10 vendas em 5 dias = Ótimo; 5 vendas em 15 dias = Bom).
                      {colDataVendas.trim()
                        ? <> Conta as vendas válidas (sem canceladas) em qualquer intervalo de dias seguidos, usando a coluna de data <strong className="text-sky-300">{colDataVendas}</strong>.</>
                        : <> Sem coluna de data, compara o ritmo médio do mês: vendas do mês ÷ dias do mês.</>}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {regrasRitmo.map((r, idx) => (
                      <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                        <span className="w-5 text-center font-mono text-slate-500">{idx + 1}</span>
                        <input type="number" min={1} value={r.vendas} onChange={e => { setRegrasRitmo(rs => rs.map(x => x.id === r.id ? { ...x, vendas: Number(e.target.value) || 0 } : x)); setCfgSalva(false); }} className="w-20 bg-slate-900 border border-sky-600/50 rounded-lg p-2 text-xs font-mono text-center text-sky-300 font-bold outline-none" />
                        <span>vendas em</span>
                        <input type="number" min={1} value={r.dias} onChange={e => { setRegrasRitmo(rs => rs.map(x => x.id === r.id ? { ...x, dias: Number(e.target.value) || 0 } : x)); setCfgSalva(false); }} className="w-20 bg-slate-900 border border-sky-600/50 rounded-lg p-2 text-xs font-mono text-center text-sky-300 font-bold outline-none" />
                        <span>dias =</span>
                        <input type="text" value={r.status} onChange={e => { setRegrasRitmo(rs => rs.map(x => x.id === r.id ? { ...x, status: e.target.value } : x)); setCfgSalva(false); }} placeholder="Status (ex.: Bom)" className="w-44 bg-slate-900 border border-emerald-600/50 rounded-lg p-2 text-xs font-bold text-emerald-300 outline-none" />
                        <button type="button" disabled={idx === 0} onClick={() => { setRegrasRitmo(rs => { const c = [...rs]; [c[idx - 1], c[idx]] = [c[idx], c[idx - 1]]; return c; }); setCfgSalva(false); }} className="px-2 py-1 rounded bg-slate-800 text-slate-300 disabled:opacity-30 cursor-pointer text-xs" title="Subir (mais exigente)">↑</button>
                        <button type="button" disabled={idx === regrasRitmo.length - 1} onClick={() => { setRegrasRitmo(rs => { const c = [...rs]; [c[idx + 1], c[idx]] = [c[idx], c[idx + 1]]; return c; }); setCfgSalva(false); }} className="px-2 py-1 rounded bg-slate-800 text-slate-300 disabled:opacity-30 cursor-pointer text-xs" title="Descer">↓</button>
                        <button type="button" onClick={() => { setRegrasRitmo(rs => rs.filter(x => x.id !== r.id)); setCfgSalva(false); }} className="px-2 py-1 rounded bg-rose-950/60 text-rose-400 cursor-pointer text-xs" title="Remover">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" onClick={() => { setRegrasRitmo(rs => [...rs, { id: "r" + Date.now(), vendas: 3, dias: 30, status: "" }]); setCfgSalva(false); }} className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-3 py-2 rounded-lg text-[10px] uppercase tracking-wider cursor-pointer">＋ Adicionar regra</button>
                    <span className="text-[10px] text-slate-500">Sem atingir nenhuma regra: “Abaixo da meta” · sem vendas no mês: “Sem vendas”.</span>
                  </div>
                </div>
              )}

              {/* DEVOLUÇÕES */}
              <div className="bg-rose-950/10 p-5 rounded-xl border border-rose-900/30 space-y-3">
                <div>
                  <h3 className="text-[11px] font-black text-rose-300 uppercase tracking-wider">↩️ Devoluções — quanto o item é devolvido em {canalSelecionado}</h3>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    A % vem da aba Devoluções: unidades devolvidas do SKU neste canal, no mês de competência, ÷ vendas do SKU no mês (o maior valor entre a Curva ABC e as vendas da planilha).
                    {modoLogistica === "full" ? " Acima do limite, o motor não recomenda o envio ao Full." : " Acima do limite, o veredicto vira “Alta Devolução”."}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold text-amber-400 uppercase mb-1">Atenção a partir de (%)</label>
                    <input type="number" step="0.1" value={pctDevAtencao} onChange={e => { setPctDevAtencao(e.target.value); setCfgSalva(false); }} className="w-full bg-slate-900 border border-amber-600/50 rounded-lg p-2 text-xs font-mono text-center text-amber-300 font-bold outline-none" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-rose-400 uppercase mb-1">{modoLogistica === "full" ? "Não recomendar envio a partir de (%)" : "Alta devolução a partir de (%)"}</label>
                    <input type="number" step="0.1" value={tetoMaxDevolucao} onChange={e => { setTetoMaxDevolucao(e.target.value); setCfgSalva(false); }} className="w-full bg-slate-900 border border-rose-600/50 rounded-lg p-2 text-xs font-mono text-center text-rose-300 font-bold outline-none" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1" title="Abaixo dessa quantidade de vendas no mês a % é mostrada, mas não bloqueia o envio (evita 1 devolução em 1 venda = 100%).">Mín. de vendas para avaliar</label>
                    <input type="number" value={minVendasDev} onChange={e => { setMinVendasDev(e.target.value); setCfgSalva(false); }} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="button" onClick={() => setSubAba("vendas")} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">← Voltar ao Motor</button>
              </div>
            </div>
          </div>
        )}

        {/* ABA VENDAS / MOTOR */}
        {subAba === "vendas" && (
          <div className="space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className={`text-lg font-bold flex items-center gap-2 ${modoLogistica === "full" ? "text-purple-400" : "text-indigo-400"}`}>
                  <span>⚡ Cruzamento e Motor ({modoLogistica === "full" ? "Reposição" : "Diagnóstico"})</span>
                </h2>
              </div>

              {/* FILTROS SUPERIORES DE CUSTOS E VALIDAÇÃO */}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Ficheiro de Vendas Brutas (Excel/CSV):</label>
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUploadVendas} className={`w-full bg-slate-950 border border-slate-700 file:border-0 file:text-white file:text-xs file:font-bold file:py-2.5 file:px-4 file:rounded-lg file:mr-4 file:cursor-pointer rounded-xl p-1.5 text-xs text-slate-300 cursor-pointer ${modoLogistica === "full" ? "file:bg-purple-600" : "file:bg-indigo-600"}`} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Imposto (%):</label>
                  <input type="number" value={aliquotaImposto} onChange={e => setAliquotaImposto(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-center text-emerald-400 outline-none" />
                </div>
                {modoLogistica === "full" ? (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Meta Cobertura (Dias):</label>
                    <input type="number" value={metaDiasCobertura} onChange={e => setMetaDiasCobertura(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-center text-indigo-400 outline-none" />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Custo Embalagem (R$):</label>
                    <input type="number" step="0.01" value={custoEmbalagem} onChange={e => setCustoEmbalagem(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-center text-rose-400 outline-none" />
                  </div>
                )}
              </div>

              {/* RESUMO DA CONFIGURAÇÃO DO CANAL (edição na aba Configuração do Canal) */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="text-xs text-slate-300 leading-relaxed space-y-1">
                  <div>
                    <span className="font-bold text-cyan-400">⚙️ {canalSelecionado}: </span>
                    {formulaCanal === "ml_recalculo" ? "Mercado Livre (líquido da coluna " + colLiquidoVendas + " + recálculo de carrinhos via MLB)" : <>Fórmula de vendas <code className="text-emerald-300">{formulaVendas || "— não definida —"}</code></>}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Linha {linhaVendas} · SKU {colSkuVendas} · Qtd {colQtdVendas} · PDV {colPdvVendas}
                    {formulaCanal === "ml_recalculo" ? ` · MLB ${colMlbVendas}` : ""}
                    {colCarrinhoVendas ? ` · Status ${colCarrinhoVendas}` : ""}
                    {colEntregaVendas && textoEntrega ? ` · Entrega ${colEntregaVendas} (“${textoEntrega}” = −R$ ${taxaFlex})` : ""}
                  </div>
                  {layoutDetectado && <div className="text-[10px] text-emerald-400">✔ {layoutDetectado}</div>}
                  <div className="text-[10px] text-slate-500">
                    {formulaCanal === "formula_regras"
                      ? "Status “cancelado” (se a coluna de status estiver configurada) remove a linha do PDV e do custo."
                      : "Status “cancelado” na coluna D remove a linha: sem PDV e sem abatimento do custo (vale também para cada item dentro de um pacote)."}
                  </div>
                </div>
                <button type="button" onClick={() => setSubAba("config")} className="bg-cyan-700/80 hover:bg-cyan-600 text-white font-bold px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider cursor-pointer whitespace-nowrap">⚙️ Configuração do Canal</button>
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={executarMotorGeral} disabled={matrizVendas.length === 0 || loading} className={`py-3 px-6 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg ${matrizVendas.length === 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700 text-white cursor-pointer'}`}>
                  {loading ? "A Cruzar..." : "1. Processar na Tela"}
                </button>
                {dadosProcessados.length > 0 && (
                  <button onClick={salvarDadosNoBanco} disabled={salvando} className={`py-3 px-6 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer shadow-lg text-white ${modoLogistica === "full" ? "bg-purple-600 hover:bg-purple-500 shadow-purple-900/40" : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/40"}`}>
                    {salvando ? "A Gravar..." : "2. Gravar Análise no Banco"}
                  </button>
                )}
              </div>
            </div>

            {dadosProcessados.length > 0 && (
              <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 text-center animate-in zoom-in duration-300">
                 <h3 className="text-xl font-black text-emerald-400 mb-2">Relatório Processado com Sucesso!</h3>
                 <p className="text-sm text-slate-400 mb-4">
                   {formulaCanal === "ml_recalculo"
                     ? "O motor recalculou os pacotes com base nas regras do MLB, aplicou a regra dos R$ 79,00 e removeu os cancelados e devoluções, "
                     : "O motor aplicou a fórmula de vendas do canal e removeu os cancelados e devoluções, "}
                   consolidando <strong>{dadosProcessados.length} SKUs</strong>.
                 </p>
                 <p className="text-xs text-slate-500">Clique em "Gravar Análise no Banco" para armazenar os dados e ir para o Relatório Oficial.</p>
              </div>
            )}
          </div>
        )}

        {/* ABA RELATÓRIO */}
        {subAba === "relatorio" && (
           <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
             
             {/* AVISO DE ARMAZENAGEM (FULL): a partir de 90 dias, faltam X dias para os 120 */}
             {modoLogistica === "full" && skusEmAlerta.length > 0 && (
               <div className="bg-amber-950/30 border border-amber-800/50 rounded-2xl p-5 text-xs text-amber-200 space-y-1">
                 <div className="font-black uppercase tracking-wider text-amber-400 text-[11px] mb-1">⚠️ Armazenagem do Full — {skusEmAlerta.length} SKU(s) em atenção</div>
                 {skusEmAlerta.slice(0, 10).map((r) => (
                   <div key={r.sku}><span className="font-mono font-bold text-white">{r.sku}</span> — {r.nivel === "COBRANDO" ? r.qtdCobrando : r.qtdEmAlerta} un. · {textoAlertaArmazenagem(r.nivel, r.diasParaCobranca)}</div>
                 ))}
                 {skusEmAlerta.length > 10 && <div className="text-amber-400/70">… e mais {skusEmAlerta.length - 10} (use o filtro “Armazenagem em alerta”)</div>}
               </div>
             )}

             {/* KPIs */}
             <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-lg">
                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Faturamento Apurado</span>
                <span className="text-xl font-black text-white">{formatarMoeda(dataSource.reduce((a: number, b: any) => a + Number(b.receita_bruta || 0), 0))}</span>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-lg">
                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Lucro Líquido Real</span>
                <span className="text-xl font-black text-emerald-400">{formatarMoeda(dataSource.reduce((a: number, b: any) => a + Number(b.lucro_liquido || 0), 0))}</span>
              </div>
              
              {modoLogistica === "full" ? (
                <>
                  <div className="bg-slate-900/90 border border-rose-900/40 p-5 rounded-2xl shadow-lg">
                    <span className="block text-[10px] font-bold text-rose-400 uppercase mb-2">Ruptura Iminente</span>
                    <span className="text-xl font-black text-rose-400">{dataSource.filter((i:any) => i.status_estoque === "Ruptura Iminente").length} SKUs</span>
                  </div>
                  <div className="bg-slate-900/90 border border-amber-900/40 p-5 rounded-2xl shadow-lg">
                    <span className="block text-[10px] font-bold text-amber-400 uppercase mb-2">Risco de Aging</span>
                    <span className="text-xl font-black text-amber-400">{dataSource.filter((i:any) => i.status_estoque === "Risco de Aging").length} SKUs</span>
                  </div>
                  <div className="bg-purple-900/30 border border-purple-800 p-5 rounded-2xl shadow-lg">
                    <span className="block text-[10px] font-bold text-purple-400 uppercase mb-2">Sugestão Envio Hoje</span>
                    <span className="text-xl font-black text-purple-300">{dataSource.reduce((a: number, b: any) => a + Number(b.sugestao_envio || 0), 0)} un.</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-emerald-950/20 border border-emerald-900/40 p-5 rounded-2xl shadow-lg">
                    <span className="block text-[10px] font-bold text-emerald-400 uppercase mb-2">🌟 SKUs Promissores</span>
                    <span className="text-xl font-black text-emerald-400">{dataSource.filter((i:any) => i.diagnostico?.includes("Promissor")).length} Produtos</span>
                  </div>
                  <div className="bg-rose-950/20 border border-rose-900/40 p-5 rounded-2xl shadow-lg">
                    <span className="block text-[10px] font-bold text-rose-400 uppercase mb-2">⛔ Sem Futuro (Cortar)</span>
                    <span className="text-xl font-black text-rose-400">{dataSource.filter((i:any) => i.diagnostico?.includes("Sem Futuro") || i.diagnostico?.includes("Devolvido")).length} Produtos</span>
                  </div>
                  <div className="bg-amber-950/20 border border-amber-900/40 p-5 rounded-2xl shadow-lg">
                    <span className="block text-[10px] font-bold text-amber-400 uppercase mb-2">⚠️ Ponto de Atenção</span>
                    <span className="text-xl font-black text-amber-400">{dataSource.filter((i:any) => i.diagnostico?.includes("Atenção")).length} Produtos</span>
                  </div>
                </>
              )}
            </div>

            {/* TABELA COMPLETA */}
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <h3 className="text-lg font-bold text-white">Relatório Completo ({canalSelecionado} - {mesSelecionado})</h3>
                <div className="flex gap-2">
                  <input type="text" placeholder="Buscar SKU/Produto" value={pesquisaBusca} onChange={e => setPesquisaBusca(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none w-48" />
                  
                  {modoLogistica === "full" ? (
                    <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer">
                      <option value="TODOS">Todos os Status</option>
                      <option value="Enviar">Apenas c/ Sugestão de Envio</option>
                      <option value="Ruptura Iminente">Ruptura Iminente</option>
                      <option value="Risco de Aging">Risco de Aging</option>
                      <option value="Falta no Central">Sem Saldo na Sede</option>
                      <option value="Estoque Parado">Estoque Parado (sem venda)</option>
                      <option value="Devolução">Envio bloqueado por Devolução</option>
                      {regrasRitmo.filter(r => r.status.trim()).map(r => <option key={r.id} value={`ritmo:${r.status.trim()}`}>Ritmo: {r.status.trim()}</option>)}
                      <option value="ritmo:Abaixo da meta">Ritmo: Abaixo da meta</option>
                      <option value="Armazenagem">Armazenagem em alerta ({DIAS_ALERTA_PADRAO}+ dias)</option>
                    </select>
                  ) : (
                    <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer">
                      <option value="TODOS">Todos os Diagnósticos</option>
                      <option value="Promissor">🌟 Apenas Promissores</option>
                      <option value="Sem Futuro">⛔ Sem Futuro (Prejuízo/Alta Dev.)</option>
                      <option value="Atenção">⚠️ Em Atenção (Margem Baixa)</option>
                      <option value="Regular">✅ Regulares</option>
                    </select>
                  )}
                  
                  <button onClick={limparCanalInteiro} className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-sm ml-2">
                    🗑️ Apagar Mês
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                    {modoLogistica === "full" ? (
                      <tr>
                        <th className="p-3 text-center">#</th>
                        <th className="p-3">SKU</th>
                        <th className="p-3 min-w-[200px]">Produto</th>
                        <th className="p-3 text-right">Vendas</th>
                        <th className="p-3 text-right">Receita (R$)</th>
                        <th className="p-3 text-right text-emerald-300">Est. CD</th>
                        <th className="p-3 text-right text-indigo-300">Sede</th>
                        <th className="p-3 text-center">Cobertura</th>
                        <th className="p-3 text-right">Margem LÍQ.</th>
                        <th className="p-3 text-center text-sky-300">Ritmo</th>
                        <th className="p-3 text-center text-rose-300">Devolução</th>
                        <th className="p-3 text-center border-l border-slate-800">Status CD</th>
                        <th className="p-3 text-center text-amber-300">Armazenagem</th>
                        <th className="p-3 text-center">Ação Reposição</th>
                        <th className="p-3 text-center font-black text-purple-400">📦 Enviar Qtd</th>
                      </tr>
                    ) : (
                      <tr>
                        <th className="p-3 text-center">#</th>
                        <th className="p-3">SKU</th>
                        <th className="p-3 min-w-[200px]">Produto</th>
                        <th className="p-3 text-right text-indigo-300">Vendas (Qtd)</th>
                        <th className="p-3 text-right">Receita (R$)</th>
                        <th className="p-3 text-right text-rose-300" title="Custo com caixa, fita, etc.">Custo Embalagem</th>
                        <th className="p-3 text-right font-black text-emerald-400">Margem LÍQ.</th>
                        <th className="p-3 text-center text-amber-300">Qtd Devolvida</th>
                        <th className="p-3 text-center">Taxa Devolução</th>
                        <th className="p-3 text-center border-l border-slate-800 bg-slate-900">Veredicto (Diagnóstico)</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {filtrados.map((item: any, idx: number) => {
                      let rowStyle = "";
                      if (modoLogistica === "padrao") {
                        if (item.diagnostico?.includes("Sem Futuro")) rowStyle = "bg-rose-950/10";
                        else if (item.diagnostico?.includes("Promissor")) rowStyle = "bg-emerald-950/10";
                      }

                      return (
                        <tr key={item.id || idx} className={`hover:bg-slate-800/40 transition-colors ${rowStyle}`}>
                          <td className="p-3 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-3 font-mono font-bold text-white">{item.sku}</td>
                          <td className="p-3 text-slate-300 truncate max-w-[220px]" title={item.produto}>{item.produto}</td>
                          <td className="p-3 text-right font-bold text-slate-200">{item.qtd_vendida} un.</td>
                          <td className="p-3 text-right font-mono text-slate-400">{formatarMoeda(item.receita_bruta)}</td>
                          
                          {modoLogistica === "full" ? (
                            <>
                              <td className="p-3 text-right font-mono font-bold text-emerald-400">{item.estoque_cd}</td>
                              <td className="p-3 text-right font-mono font-bold text-indigo-400">{item.estoque_central}</td>
                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${Number(item.qtd_vendida) === 0 ? 'text-slate-500' : item.cobertura_dias < 10 ? 'bg-rose-950/60 text-rose-400 border border-rose-900/40' : item.cobertura_dias > 60 ? 'bg-amber-950/60 text-amber-400 border border-amber-900/40' : 'text-slate-400'}`}>
                                  {item.cobertura_dias > 900 ? '+90' : Number(item.cobertura_dias).toFixed(0)} dias
                                </span>
                              </td>
                              <td className={`p-3 text-right font-mono font-bold ${item.margem_pct >= 10 ? 'text-emerald-400' : 'text-rose-500'}`} title={`Lucro R$: ${formatarMoeda(item.lucro_liquido)}`}>
                                {Number(item.margem_pct).toFixed(1)}%
                              </td>
                              <td className="p-3 text-center text-[10px] font-bold">
                                {(() => {
                                  const lbl = String(item.ritmo_vendas || "");
                                  if (!lbl) return <span className="text-slate-600">—</span>;
                                  const pos = regrasRitmo.findIndex(r => r.status.trim() === lbl);
                                  const cls = lbl === "Sem vendas" ? "text-slate-500" : pos === 0 ? "bg-emerald-900/30 text-emerald-300 border border-emerald-800/50" : pos > 0 ? "bg-sky-900/30 text-sky-300 border border-sky-800/50" : "bg-amber-950/40 text-amber-400 border border-amber-900/40";
                                  return <span className={`px-2 py-0.5 rounded uppercase ${cls}`}>{lbl}</span>;
                                })()}
                              </td>
                              <td className="p-3 text-center text-[11px] font-mono font-bold">
                                {(() => {
                                  if (item.taxa_devolucao === undefined || item.taxa_devolucao === null) return <span className="text-slate-600">—</span>;
                                  const taxa = Number(item.taxa_devolucao) || 0;
                                  const und = Number(item.qtd_devolucoes) || 0;
                                  const lim = Number(String(tetoMaxDevolucao).replace(",", ".")) || 10;
                                  const aten = Number(String(pctDevAtencao).replace(",", ".")) || 5;
                                  const cls = und === 0 ? "text-slate-500" : taxa >= lim ? "text-rose-400" : taxa >= aten ? "text-amber-400" : "text-emerald-400";
                                  return <span className={cls} title={`${und} un. devolvidas de ${Math.max(Number(item.qtd_vendida) || 0, 0)} vendidas`}>{taxa.toFixed(1)}%{und > 0 ? ` (${und} un.)` : ""}</span>;
                                })()}
                              </td>
                              <td className="p-3 text-center border-l border-slate-800/50">
                                {item.status_estoque === "Ruptura Iminente" ? <span className="text-rose-400 font-bold text-[10px]">🔥 Ruptura</span> : item.status_estoque === "Risco de Aging" ? <span className="text-amber-400 font-bold text-[10px]">⚠️ Aging Alto</span> : item.status_estoque === "Estoque Parado" ? <span className="text-amber-400 font-bold text-[10px]">⏳ Parado</span> : <span className="text-emerald-400 text-[10px]">✔️ Saudável</span>}
                              </td>
                              <td className="p-3 text-center text-[10px] font-bold">
                                {(() => {
                                  const a = resumoArmazenagem.get(normalizarSku(item.sku));
                                  if (!a || a.nivel === "OK") return <span className="text-slate-600">—</span>;
                                  return a.nivel === "COBRANDO"
                                    ? <span className="text-rose-400" title={`${a.qtdCobrando} un. com ${a.loteMaisAntigoDias} dias`}>💸 Cobrando ({a.qtdCobrando} un.)</span>
                                    : <span className="text-amber-400" title={`${a.qtdEmAlerta} un. · lote mais antigo com ${a.loteMaisAntigoDias} dias`}>⏳ {textoAlertaArmazenagem(a.nivel, a.diasParaCobranca).replace("Começará cobrar estoque — ", "")}</span>;
                                })()}
                              </td>
                              <td className="p-3 text-center">
                                {String(item.status_envio).includes("Devolução") ? <span className="bg-rose-900/30 text-rose-400 border border-rose-800/50 px-2 py-1 rounded text-[10px] font-bold uppercase">{item.status_envio}</span> : item.status_envio.includes("Parcial") ? <span className="bg-amber-900/30 text-amber-400 border border-amber-800/50 px-2 py-1 rounded text-[10px] font-bold uppercase">{item.status_envio}</span> : item.status_envio.includes("Falta") ? <span className="bg-rose-900/30 text-rose-400 border border-rose-800/50 px-2 py-1 rounded text-[10px] font-bold uppercase">{item.status_envio}</span> : item.status_envio.includes("Não") ? <span className="text-slate-500 text-[10px] uppercase font-bold">{item.status_envio}</span> : <span className="bg-emerald-900/30 text-emerald-400 border border-emerald-800/50 px-2 py-1 rounded text-[10px] font-bold uppercase">{item.status_envio}</span>}
                              </td>
                              <td className="p-3 text-center font-mono font-black text-lg text-purple-400">
                                {item.sugestao_envio > 0 ? `+${item.sugestao_envio}` : '-'}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="p-3 text-right font-mono text-rose-300/70">{formatarMoeda(item.embalagem)}</td>
                              <td className={`p-3 text-right font-mono font-black ${item.margem_pct >= 10 ? 'text-emerald-400' : 'text-rose-500'}`} title={`Lucro R$: ${formatarMoeda(item.lucro_liquido)}`}>
                                {Number(item.margem_pct).toFixed(1)}%
                              </td>
                              <td className="p-3 text-center font-bold text-amber-300">{item.qtd_devolucoes}</td>
                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.taxa_devolucao >= 10 ? 'bg-rose-950/60 text-rose-400 border border-rose-900/40' : item.taxa_devolucao > 5 ? 'bg-amber-950/60 text-amber-400 border border-amber-900/40' : 'text-emerald-400'}`}>
                                  {Number(item.taxa_devolucao).toFixed(1)}%
                                </span>
                              </td>
                              <td className="p-3 text-center border-l border-slate-800/50 bg-slate-950/20">
                                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                  item.diagnostico?.includes("Sem Futuro") ? 'bg-rose-900/30 text-rose-400 border border-rose-800/50' : 
                                  item.diagnostico?.includes("Promissor") ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/50' : 
                                  item.diagnostico?.includes("Atenção") ? 'bg-amber-900/30 text-amber-400 border border-amber-800/50' : 
                                  'text-slate-400 border border-slate-700'
                                }`}>
                                  {item.diagnostico}
                                </span>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
           </div>
        )}

      </div>
    </div>
  );
}