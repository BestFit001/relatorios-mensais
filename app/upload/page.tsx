"use client";
import { useState, ChangeEvent, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";
import { useRouter } from "next/navigation";

export default function UpdatesPage() {
  const router = useRouter();
  const [abaAtiva, setAbaAtiva] = useState<"relatorios" | "cadastros" | "custos" | "regras_ml" | "dashboard_admin">("relatorios");

  const [mes, setMes] = useState("09");
  const [ano, setAno] = useState("2026");
  const [ficheiroABC, setFicheiroABC] = useState("");
  const [ficheiroInventario, setFicheiroInventario] = useState("");
  const [dadosABC, setDadosABC] = useState<any[]>([]);
  const [dadosInvBruto, setDadosInvBruto] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);

  const [regrasCanais, setRegrasCanais] = useState<any[]>([]);
  const [regrasTiny, setRegrasTiny] = useState({ sku: 'C', estoque: 'F', status_sku: 'A', status_valor: 'B' });
  
  const [contaMlSelecionada, setContaMlSelecionada] = useState<"Mercado Livre 1" | "Mercado Livre 2">("Mercado Livre 1");

  const [colunasPorConta, setColunasPorConta] = useState<{ [key: string]: { ml_mlb: string, ml_sku: string, ml_comissao: string, ml_peso: string, ml_altura: string, ml_largura: string, ml_comprimento: string } }>({
    "Mercado Livre 1": { ml_mlb: 'B', ml_sku: 'E', ml_comissao: 'AA', ml_peso: 'AF', ml_altura: 'AC', ml_largura: 'AD', ml_comprimento: 'AE' },
    "Mercado Livre 2": { ml_mlb: 'B', ml_sku: 'E', ml_comissao: 'AA', ml_peso: 'AF', ml_altura: 'AC', ml_largura: 'AD', ml_comprimento: 'AE' }
  });

  const [regrasColsCusto, setRegrasColsCusto] = useState({
    custo_sku: 'B', custo_produto: 'C', custo_valor: 'D', custo_marca: 'E'
  });

  const [estatisticas, setEstatisticas] = useState({ totalTiny: 0, normais: 0, obsoletos: 0 });

  const [pesquisaCusto, setPesquisaCusto] = useState("");
  const [listaCustosFiltrados, setListaCustosFiltrados] = useState<any[]>([]);

  const [pesquisaMl, setPesquisaMl] = useState("");
  const [listaRegrasMlFiltradas, setListaRegrasMlFiltradas] = useState<any[]>([]);

  // Estados específicos para o Alimentador do Dashboard (Admin)
  const [mesAlvoDash, setMesAlvoDash] = useState("outubro de 2026");
  const [canalAlvoDash, setCanalAlvoDash] = useState("Mercado Livre 1");
  const [canaisDashList, setCanaisDashList] = useState<string[]>([
    "Mercado Livre 1", "Mercado Livre 2", "Amazon", "Magalu", "Shopee", "TikTok", "Shein", "Netshoes", "Site", "Clube Hebraica", "Clube Paineiras", "Centauro"
  ]);
  const [colunaIdFaturados, setColunaIdFaturados] = useState("AI");
  const [colunaDataFaturados, setColunaDataFaturados] = useState("D");
  const [colunaIdSite, setColunaIdSite] = useState("A");
  const [colunaTarifaSite, setColunaTarifaSite] = useState("E");

  const mesReferencia = mes && ano ? `${mes}/${ano}` : "";
  const meses = [
    { valor: "01", nome: "Janeiro" }, { valor: "02", nome: "Fevereiro" },
    { valor: "03", nome: "Março" }, { valor: "04", nome: "Abril" },
    { valor: "05", nome: "Maio" }, { valor: "06", nome: "Junho" },
    { valor: "07", nome: "Julho" }, { valor: "08", nome: "Agosto" },
    { valor: "09", nome: "Setembro" }, { valor: "10", nome: "Outubro" },
    { valor: "11", nome: "Novembro" }, { valor: "12", nome: "Dezembro" }
  ];
  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 11 }, (_, i) => anoAtual - 1 + i);

  useEffect(() => {
    carregarDadosCadastros();
  }, []);

  useEffect(() => {
    pesquisarCustosNoBanco();
  }, [pesquisaCusto]);

  useEffect(() => {
    pesquisarMlNoBanco();
  }, [pesquisaMl]);

  const carregarDadosCadastros = async () => {
    const { data: regras } = await supabase.from('config_regras_canais').select('*').order('id');
    if (regras) setRegrasCanais(regras);

    const { data: tinyConfig } = await supabase.from('config_regras_tiny').select('*');
    if (tinyConfig) {
      const getC = (k: string, d: string) => tinyConfig.find((t: any) => t.campo === k)?.coluna || d;
      setRegrasTiny({ sku: getC('sku', 'C'), estoque: getC('estoque', 'F'), status_sku: getC('status_sku', 'A'), status_valor: getC('status_valor', 'B') });
      setRegrasColsCusto({
        custo_sku: getC('custo_sku', 'B'), custo_produto: getC('custo_produto', 'C'), custo_valor: getC('custo_valor', 'D'), custo_marca: getC('custo_marca', 'E')
      });

      const canalCfg = tinyConfig.find((t: any) => t.campo === 'canais_dashboard');
      if (canalCfg && canalCfg.coluna) {
        try {
          const parsed = JSON.parse(canalCfg.coluna);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCanaisDashList(Array.from(new Set([...parsed, 'Clube Hebraica', 'Clube Paineiras'])));
          }
        } catch (e) {}
      }
    }

    let allTiny: any[] = [];
    let rangeStep = 1000;
    let from = 0;
    let keepFetching = true;
    while (keepFetching) {
      const { data } = await supabase.from('cadastros_base_tiny').select('sku, estoque').range(from, from + rangeStep - 1);
      if (data && data.length > 0) {
        allTiny = [...allTiny, ...data];
        from += rangeStep;
        if (data.length < rangeStep) keepFetching = false;
      } else {
        keepFetching = false;
      }
    }

    const { data: statusData } = await supabase.from('status_skus_catalogo').select('sku, status');
    const totalTiny = allTiny.length;
    const mapaStatus = new Map(statusData?.map(s => [String(s.sku).trim(), s.status]) || []);

    let normais = 0;
    let obsoletos = 0;
    allTiny.forEach(item => {
      const st = mapaStatus.get(String(item.sku).trim()) || 'Normal';
      if (st === 'Obsoleto') obsoletos++;
      else normais++;
    });

    setEstatisticas({ totalTiny, normais, obsoletos });
  };

  const atualizarColunaConfigML = async (campo: string, coluna: string) => {
    const novasColunasConta = {
      ...colunasPorConta,
      [contaMlSelecionada]: {
        ...colunasPorConta[contaMlSelecionada],
        [campo]: coluna
      }
    };
    setColunasPorConta(novasColunasConta);

    const prefixoDb = contaMlSelecionada === "Mercado Livre 1" ? "ml_1_" : "ml_2_";
    const chaveDb = prefixoDb + campo.replace("ml_", "");

    try {
      await supabase.from('config_regras_tiny').upsert(
        { campo: chaveDb, coluna: coluna },
        { onConflict: 'campo' }
      );
    } catch (err) {
      console.error("Erro ao salvar configuração da coluna:", err);
    }
  };

  const pesquisarCustosNoBanco = async () => {
    if (!pesquisaCusto || pesquisaCusto.trim() === "") {
      setListaCustosFiltrados([]);
      return;
    }
    const termo = pesquisaCusto.trim();
    const { data } = await supabase
      .from('tabela_custos_skus')
      .select('*')
      .or(`sku.ilike.%${termo}%,produto.ilike.%${termo}%`)
      .limit(50);

    if (data) setListaCustosFiltrados(data);
  };

  const pesquisarMlNoBanco = async () => {
    if (!pesquisaMl || pesquisaMl.trim() === "") {
      setListaRegrasMlFiltradas([]);
      return;
    }
    const termo = pesquisaMl.trim().toUpperCase();
    const { data } = await supabase
      .from('ml_anuncios_regras')
      .select('*')
      .or(`mlb.ilike.%${termo}%,sku.ilike.%${termo}%`)
      .limit(50);

    if (data) setListaRegrasMlFiltradas(data);
  };

  const letraParaIndice = (str: string) => {
    if (!str) return 0;
    let base = str.toUpperCase().trim();
    let coluna = 0;
    for (let i = 0; i < base.length; i++) {
      coluna = coluna * 26 + (base.charCodeAt(i) - 64);
    }
    return coluna - 1;
  };

  const normalizarSku = (valor: any): string => {
    if (valor === null || valor === undefined) return "";
    let s = String(valor).trim();
    if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
    s = s.replace(/^["']|["']$/g, "").trim();
    if (/e\+/i.test(s)) {
      try { s = BigInt(Math.trunc(Number(s))).toString(); } catch {}
    }
    return s;
  };

  const handleSubirFaturados = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        const idxId = letraParaIndice(colunaIdFaturados);
        const idxData = letraParaIndice(colunaDataFaturados);

        const registros = [];
        for (let i = 1; i < json.length; i++) {
          const row = json[i];
          if (!row) continue;
          const idPedido = String(row[idxId] || "").trim();
          const dataFaturamento = String(row[idxData] || "").trim();

          if (idPedido) {
            registros.push({
              id_pedido: idPedido,
              data_faturamento: dataFaturamento || new Date().toISOString().slice(0, 10),
              mes_referencia: mesAlvoDash
            });
          }
        }

        if (registros.length > 0) {
          await supabase.from('faturados').delete().eq('mes_referencia', mesAlvoDash);
          for (let i = 0; i < registros.length; i += 500) {
            await supabase.from('faturados').insert(registros.slice(i, i + 500));
          }
        }

        alert(`✅ Faturados importados com sucesso! Total: ${registros.length} registos.`);
        setLoading(false);
      } catch (err: any) {
        alert("Erro ao importar Faturados: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSubirVendasCanal = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        const registros = [];
        for (let i = 1; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;

          const idPedido = String(row[0] || "").trim();
          const sku = normalizarSku(row[1]);
          const precoVenda = Number(String(row[3] || "0").replace("R$", "").trim().replace(",", ".")) || 0;
          const quantidade = Number(row[4] || 1);
          const repasseLiquido = Number(String(row[5] || "0").replace("R$", "").trim().replace(",", ".")) || precoVenda;

          if (idPedido || sku) {
            registros.push({
              id_pedido: idPedido || `PED-${i}`,
              sku: sku,
              quantidade: isNaN(quantidade) ? 1 : quantidade,
              preco_venda: precoVenda,
              repasse_liquido: repasseLiquido,
              canal: canalAlvoDash,
              data_faturamento: new Date().toISOString().slice(0, 10),
              mes_referencia: mesAlvoDash
            });
          }
        }

        if (registros.length > 0) {
          await supabase.from('vendas_lives').delete().eq('canal', canalAlvoDash).eq('mes_referencia', mesAlvoDash);
          for (let i = 0; i < registros.length; i += 500) {
            await supabase.from('vendas_lives').insert(registros.slice(i, i + 500));
          }
        }

        alert(`✅ Vendas do canal [${canalAlvoDash}] gravadas! (${registros.length} itens).`);
        setLoading(false);
      } catch (err: any) {
        alert("Erro: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSubirTarifasSite = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        const idxId = letraParaIndice(colunaIdSite);
        const idxTarifa = letraParaIndice(colunaTarifaSite);

        const registros = [];
        for (let i = 1; i < json.length; i++) {
          const row = json[i];
          if (!row) continue;
          const idPedido = String(row[idxId] || "").trim();
          const valorTarifa = Number(String(row[idxTarifa] || "0").replace("R$", "").trim().replace(",", ".")) || 0;

          if (idPedido) {
            registros.push({
              id_pedido: idPedido,
              tarifa_site: valorTarifa,
              mes_referencia: mesAlvoDash
            });
          }
        }

        if (registros.length > 0) {
          await supabase.from('config_regras_tarifacao').upsert(registros, { onConflict: 'id_pedido' });
        }

        alert(`✅ Tarifas do Site importadas! Total: ${registros.length} registos.`);
        setLoading(false);
      } catch (err: any) {
        alert("Erro ao importar Tarifas do Site: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const apagarDadosPorTipo = async (tabela: string) => {
    if (!confirm(`Deseja limpar os registros de [${tabela}] para o mês [${mesAlvoDash}]?`)) return;
    setLoading(true);
    try {
      await supabase.from(tabela).delete().eq('mes_referencia', mesAlvoDash);
      alert(`✅ Registros de ${tabela} limpos.`);
    } catch (err: any) {
      alert("Erro: " + err.message);
    }
    setLoading(false);
  };

  const zerarBancoTotal = async () => {
    if (!confirm("⚠️ Deseja apagar TODAS as informações das bases principais?")) return;
    setLoading(true);
    try {
      await supabase.from('vendas_lives').delete().neq('id', 0);
      await supabase.from('faturados').delete().neq('id', 0);
      alert("✅ Banco de dados limpo com sucesso!");
    } catch (err: any) {
      alert("Erro: " + err.message);
    }
    setLoading(false);
  };

  const processarABC = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFicheiroABC(file.name);

    const reader = new FileReader();
    reader.onload = (evento) => {
      try {
        const data = new Uint8Array(evento.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
        
        const formatado = [];
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;
          const produto = String(row[0] || "").trim();
          const codigo = normalizarSku(row[1]);
          const quantidade = Number(row[2]);
          const valor = Number(row[3]);

          if (codigo && !isNaN(quantidade)) {
            formatado.push({
              mes_referencia: mesReferencia,
              codigo: codigo,
              produto: produto,
              quantidade: quantidade,
              valor: isNaN(valor) ? 0 : valor,
              porcentagem_individual: Number(row[4] || 0),
              porcentagem_acumulada: Number(row[5] || 0),
              classificacao: String(row[6] || "C").trim().toUpperCase()
            });
          }
        }
        setDadosABC(formatado);
        alert(`Curva ABC processada: ${formatado.length} produtos válidos.`);
      } catch (err: any) {
        alert("Erro ao ler Curva ABC: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const processarInventario = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (dadosABC.length === 0) {
      alert("Processe primeiro a Curva ABC.");
      e.target.value = "";
      return;
    }
    setFicheiroInventario(file.name);
    const skusPermitidos = new Set(dadosABC.map(item => String(item.codigo).trim()));

    const reader = new FileReader();
    reader.onload = (evento) => {
      try {
        const data = new Uint8Array(evento.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
        
        const formatado = [];
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;
          let skuEncontrado = "";
          let saldoEstoque = 0;

          for (let col = 0; col < row.length; col++) {
            const val = normalizarSku(row[col]);
            if (skusPermitidos.has(val)) {
              skuEncontrado = val;
              break;
            }
          }

          if (skuEncontrado) {
            const saldoVal = Number(row[row.length - 1] ?? 0);
            if (!isNaN(saldoVal)) saldoEstoque = saldoVal;
            formatado.push({ mes_referencia: mesReferencia, codigo_sku: skuEncontrado, saldo: saldoEstoque });
          }
        }
        setDadosInvBruto(formatado);
        alert(`Inventário processado: ${formatado.length} SKUs identificados.`);
      } catch (err: any) {
        alert("Erro ao ler Inventário: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const enviarParaBanco = async () => {
    if (dadosABC.length === 0) return;
    setLoading(true);
    await supabase.from('curva_abc').delete().eq('mes_referencia', mesReferencia);
    await supabase.from('inventario').delete().eq('mes_referencia', mesReferencia);

    await supabase.from('curva_abc').insert(dadosABC);
    if (dadosInvBruto.length > 0) {
      await supabase.from('inventario').insert(dadosInvBruto);
    }
    setLoading(false);
    alert(`🚀 Dados guardados no Supabase com sucesso!`);
    setFicheiroABC(""); setFicheiroInventario(""); setDadosABC([]); setDadosInvBruto([]);
  };

  const limparDadosCompetencia = async () => {
    if (!mesReferencia) return;
    setLoadingDelete(true);
    await supabase.from('curva_abc').delete().eq('mes_referencia', mesReferencia);
    await supabase.from('inventario').delete().eq('mes_referencia', mesReferencia);
    setLoadingDelete(false);
    alert(`🗑 Dados limpos.`);
  };

  const limparBaseTiny = async () => {
    if (!confirm("Tem certeza que deseja apagar toda a base do Tiny ERP?")) return;
    await supabase.from('cadastros_base_tiny').delete().neq('id', 0);
    carregarDadosCadastros();
  };

  const limparCanal = async (canalNome: string) => {
    if (!confirm(`Apagar canal "${canalNome}"?`)) return;
    await supabase.from('mapeamento_canais_skus').delete().eq('canal', canalNome);
    alert(`Canal limpo.`);
  };

  const limparTabelaCustos = async () => {
    if (!confirm("Apagar todos os custos?")) return;
    await supabase.from('tabela_custos_skus').delete().neq('id', 0);
    setListaCustosFiltrados([]);
  };

  const handleUploadTiny = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const indiceSku = letraParaIndice(regrasTiny.sku);
    const indiceEstoque = letraParaIndice(regrasTiny.estoque);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result;
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        const mapaUnico = new Map();
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= Math.max(indiceSku, indiceEstoque)) continue;

          const sku = normalizarSku(row[indiceSku]);
          const estoque = Number(row[indiceEstoque] || 0);

          if (sku && sku.length >= 10 && !/sku|código|codigo/i.test(sku)) {
            mapaUnico.set(sku, { sku, estoque: isNaN(estoque) ? 0 : estoque });
          }
        }
        const registros = Array.from(mapaUnico.values());

        for (let i = 0; i < registros.length; i += 500) {
          await supabase.from('cadastros_base_tiny').upsert(registros.slice(i, i + 500), { onConflict: 'sku' });
        }

        alert(`Base Tiny atualizada! ${registros.length} SKUs processados.`);
        setLoading(false);
        carregarDadosCadastros();
      } catch (err: any) {
        alert("Erro: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadStatus = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const indiceSku = letraParaIndice(regrasTiny.status_sku);
    const indiceValor = letraParaIndice(regrasTiny.status_valor);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true, raw: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        let allTiny: any[] = [];
        let from = 0;
        let keepFetching = true;
        while (keepFetching) {
          const { data } = await supabase.from('cadastros_base_tiny').select('sku').range(from, from + 999);
          if (data && data.length > 0) {
            allTiny = [...allTiny, ...data];
            from += 1000;
            if (data.length < 1000) keepFetching = false;
          } else {
            keepFetching = false;
          }
        }
        const skusTinySet = new Set(allTiny.map(t => normalizarSku(t.sku)));

        const mapaUnico = new Map();
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= Math.max(indiceSku, indiceValor)) continue;
          const sku = normalizarSku(row[indiceSku]);
          if (!skusTinySet.has(sku)) continue;

          let statusVal = String(row[indiceValor] || 'Normal').trim();
          if (/obsoleto|inativo|arquivo|descontinuado/i.test(statusVal)) statusVal = 'Obsoleto';
          else statusVal = 'Normal';

          mapaUnico.set(sku, { sku, status: statusVal });
        }
        const registros = Array.from(mapaUnico.values());

        for (let i = 0; i < registros.length; i += 500) {
          await supabase.from('status_skus_catalogo').upsert(registros.slice(i, i + 500), { onConflict: 'sku' });
        }

        alert(`Status atualizados! ${registros.length} SKUs validados.`);
        setLoading(false);
        carregarDadosCadastros();
      } catch (err: any) {
        alert("Erro: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadCustosUnitarios = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const idxSku = letraParaIndice(regrasColsCusto.custo_sku);
    const idxProd = letraParaIndice(regrasColsCusto.custo_produto);
    const idxCusto = letraParaIndice(regrasColsCusto.custo_valor);
    const idxMarca = letraParaIndice(regrasColsCusto.custo_marca);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        const mapaUnicoCustos = new Map();
        for (let i = 1; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= Math.max(idxSku, idxCusto)) continue;

          const sku = normalizarSku(row[idxSku]);
          const produto = String(row[idxProd] || "Produto").trim();
          const custo = Number(String(row[idxCusto] || "0").replace("R$", "").trim().replace(",", ".")) || 0;
          const marca = String(row[idxMarca] || "").trim();

          if (sku && sku.length >= 10 && !isNaN(custo)) {
            mapaUnicoCustos.set(sku, { sku, produto, custo_unitario: custo, marca });
          }
        }

        const registros = Array.from(mapaUnicoCustos.values());
        for (let i = 0; i < registros.length; i += 500) {
          await supabase.from('tabela_custos_skus').upsert(registros.slice(i, i + 500), { onConflict: 'sku' });
        }

        alert(`💰 Custos salvos com sucesso! Total: ${registros.length} registos.`);
        setLoading(false);
        pesquisarCustosNoBanco();
      } catch (err: any) {
        alert("Erro: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadRegrasML = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const cols = colunasPorConta[contaMlSelecionada];
    const idxMlb = letraParaIndice(cols.ml_mlb);
    const idxSku = letraParaIndice(cols.ml_sku);
    const idxCom = letraParaIndice(cols.ml_comissao);
    const idxPeso = cols.ml_peso ? letraParaIndice(cols.ml_peso) : -1;
    const idxAlt = cols.ml_altura ? letraParaIndice(cols.ml_altura) : -1;
    const idxLarg = cols.ml_largura ? letraParaIndice(cols.ml_largura) : -1;
    const idxComp = cols.ml_comprimento ? letraParaIndice(cols.ml_comprimento) : -1;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        let sheetName = workbook.SheetNames[0];
        if (workbook.SheetNames.includes("Anúncios")) sheetName = "Anúncios";
        
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        const mapSkuPorMlb = new Map<string, string>();
        for (let i = 4; i < json.length; i++) {
          const row = json[i];
          if (!row) continue;
          const mlbVal = String(row[idxMlb] || "").trim().toUpperCase();
          const skuVal = idxSku !== -1 ? normalizarSku(row[idxSku]) : "";
          if (mlbVal && mlbVal.startsWith("MLB") && skuVal && skuVal.length >= 10 && !mapSkuPorMlb.has(mlbVal)) {
            mapSkuPorMlb.set(mlbVal, skuVal);
          }
        }

        const mapaMlPendente = new Map<string, any>();
        for (let i = 4; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= Math.max(idxMlb, idxSku)) continue;

          const mlb = String(row[idxMlb] || "").trim().toUpperCase();
          if (!mlb || !mlb.startsWith("MLB")) continue;

          let sku = idxSku !== -1 ? normalizarSku(row[idxSku]) : "";
          if ((!sku || sku === "-" || sku.length < 10) && mapSkuPorMlb.has(mlb)) {
            sku = mapSkuPorMlb.get(mlb)!;
          }

          let comissaoNum = 14;
          let rawComissao = row[idxCom];
          if (rawComissao !== undefined && rawComissao !== "") {
            let parsed = parseFloat(String(rawComissao).replace("%", "").trim().replace(",", "."));
            if (!isNaN(parsed) && parsed > 0) comissaoNum = parsed < 1 ? parsed * 100 : parsed;
          }

          let pesoReal = 2.000;
          if (idxPeso >= 0 && row[idxPeso] !== undefined) {
            let p = Number(String(row[idxPeso]).replace(",", "."));
            if (!isNaN(p) && p > 0) pesoReal = p;
          }

          const altura = idxAlt >= 0 ? Number(String(row[idxAlt] || "0").replace(",", ".")) || 0 : 0;
          const largura = idxLarg >= 0 ? Number(String(row[idxLarg] || "0").replace(",", ".")) || 0 : 0;
          const comprimento = idxComp >= 0 ? Number(String(row[idxComp] || "0").replace(",", ".")) || 0 : 0;

          mapaMlPendente.set(mlb, { mlb, sku, comissao: comissaoNum, peso_real: pesoReal, altura, largura, comprimento, canal: contaMlSelecionada });
        }

        const registros = Array.from(mapaMlPendente.values());
        for (let i = 0; i < registros.length; i += 500) {
          await supabase.from('ml_anuncios_regras').upsert(registros.slice(i, i + 500), { onConflict: 'mlb' });
        }

        alert(`🚀 Regras de ${contaMlSelecionada} processadas (${registros.length} anúncios).`);
        setLoading(false);
      } catch (err: any) {
        alert("Erro: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadCanalMultiplos = async (canalNome: string, letraColuna: string, e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setLoading(true);

    const indiceColuna = letraParaIndice(letraColuna || "A");
    try {
      let allTiny: any[] = [];
      let from = 0;
      let keepFetching = true;
      while (keepFetching) {
        const { data: tinyBatch } = await supabase.from('cadastros_base_tiny').select('sku').range(from, from + 999);
        if (tinyBatch && tinyBatch.length > 0) {
          allTiny = [...allTiny, ...tinyBatch];
          from += 1000;
          if (tinyBatch.length < 1000) keepFetching = false;
        } else {
          keepFetching = false;
        }
      }
      const skusTinySet = new Set(allTiny.map(t => normalizarSku(t.sku)));
      const skusEncontradosNoCanal = new Set<string>();

      for (let f = 0; f < files.length; f++) {
        const file = files[f];
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true, raw: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        for (let i = 4; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= indiceColuna) continue;
          const skuVal = normalizarSku(row[indiceColuna]);
          if (skuVal && skuVal.length >= 10 && skusTinySet.has(skuVal)) {
            skusEncontradosNoCanal.add(skuVal);
          }
        }
      }

      await supabase.from('mapeamento_canais_skus').delete().eq('canal', canalNome);
      const registrosUpsert = Array.from(skusEncontradosNoCanal).map(sku => ({ canal: canalNome, sku, presente: true }));

      for (let i = 0; i < registrosUpsert.length; i += 500) {
        await supabase.from('mapeamento_canais_skus').insert(registrosUpsert.slice(i, i + 500));
      }

      alert(`Canal "${canalNome}" sincronizado com sucesso!`);
      setLoading(false);
    } catch (err: any) {
      alert("Erro: " + err.message);
      setLoading(false);
    }
  };

  const pesquisarCustosNoBanco = async () => {
    if (!pesquisaCusto || pesquisaCusto.trim() === "") { setListaCustosFiltrados([]); return; }
    const termo = pesquisaCusto.trim();
    const { data } = await supabase.from('tabela_custos_skus').select('*').or(`sku.ilike.%${termo}%,produto.ilike.%${termo}%`).limit(50);
    if (data) setListaCustosFiltrados(data);
  };

  const excluirCusto = async (id: number) => {
    if (!confirm("Excluir?")) return;
    await supabase.from('tabela_custos_skus').delete().eq('id', id);
    pesquisarCustosNoBanco();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Central de Abastecimento & Updates</h1>
            <p className="text-sm font-medium text-slate-400">Gestão completa de relatórios, bases ERP, custos, faturamento e tarifas do site</p>
          </div>
          <Navbar />
        </div>

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button onClick={() => setAbaAtiva("relatorios")} className={`px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${abaAtiva === "relatorios" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
            📊 Relatórios (ABC & Inventário)
          </button>
          <button onClick={() => setAbaAtiva("cadastros")} className={`px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${abaAtiva === "cadastros" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
            🛒 Cadastros e Canais
          </button>
          <button onClick={() => setAbaAtiva("custos")} className={`px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${abaAtiva === "custos" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
            💰 Custos por SKU
          </button>
          <button onClick={() => setAbaAtiva("regras_ml")} className={`px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${abaAtiva === "regras_ml" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
            📦 Regras & Medidas ML
          </button>
          <button onClick={() => setAbaAtiva("dashboard_admin")} className={`px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${abaAtiva === "dashboard_admin" ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-emerald-400 border border-emerald-800'}`}>
            ⚙️ Updates & Alimenta Dashboard
          </button>
        </div>

        {/* ABA: RELATÓRIOS */}
        {abaAtiva === "relatorios" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
            <h2 className="text-lg font-bold mb-1 text-white">Relatórios Mensais</h2>
            <p className="text-xs text-slate-400 mb-6">Defina a competência e envie as planilhas mensais.</p>
            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800/80 mb-6">
              <div className="mb-6 border-b border-slate-800 pb-6">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">Competência</label>
                  <button onClick={limparDadosCompetencia} disabled={!mesReferencia || loadingDelete} className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[11px] font-bold py-1.5 px-3 rounded-lg cursor-pointer">
                    {loadingDelete ? "A limpar..." : `🗑️ Limpar Base (${mesReferencia})`}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <select className="border border-slate-700 rounded-xl p-3 bg-slate-900 text-xs text-white outline-none cursor-pointer" value={mes} onChange={(e) => setMes(e.target.value)}>
                    {meses.map(m => <option key={m.valor} value={m.valor}>{m.nome}</option>)}
                  </select>
                  <select className="border border-slate-700 rounded-xl p-3 bg-slate-900 text-xs text-white outline-none cursor-pointer" value={ano} onChange={(e) => setAno(e.target.value)}>
                    {anos.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">Curva ABC</label>
                  <input type="file" accept=".xls,.xlsx" disabled={!mesReferencia} onChange={processarABC} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-lg file:bg-indigo-600 file:text-white cursor-pointer bg-slate-900 p-3 rounded-xl border border-slate-700" />
                  {ficheiroABC && <p className="mt-2 text-xs text-emerald-400 font-bold">✓ {ficheiroABC}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">Inventário</label>
                  <input type="file" accept=".xls,.xlsx" disabled={!mesReferencia || dadosABC.length === 0} onChange={processarInventario} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-lg file:bg-indigo-600 file:text-white cursor-pointer bg-slate-900 p-3 rounded-xl border border-slate-700" />
                  {ficheiroInventario && <p className="mt-2 text-xs text-emerald-400 font-bold">✓ {ficheiroInventario}</p>}
                </div>
              </div>
              {(dadosABC.length > 0 || dadosInvBruto.length > 0) && (
                <div className="mt-6 pt-5 border-t border-slate-800 flex justify-end">
                  <button onClick={enviarParaBanco} disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">
                    {loading ? "A gravar..." : "🚀 Gravar Dados no Supabase"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA: CADASTROS E CANAIS */}
        {abaAtiva === "cadastros" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total SKUs Tiny</span>
                <p className="text-3xl font-black text-white mt-2">{estatisticas.totalTiny}</p>
              </div>
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Normais</span>
                <p className="text-3xl font-black text-white mt-2">{estatisticas.normais}</p>
              </div>
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg">
                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">Obsoletos</span>
                <p className="text-3xl font-black text-white mt-2">{estatisticas.obsoletos}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Base Central (Tiny ERP)</h3>
                    <button onClick={limparBaseTiny} className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[10px] font-bold py-1 px-2.5 rounded-lg cursor-pointer">
                      🗑️ Limpar Base Tiny
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">Lê linhas (SKU: <strong>{regrasTiny.sku}</strong>, Estoque: <strong>{regrasTiny.estoque}</strong>).</p>
                </div>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadTiny} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-xl file:bg-indigo-600 file:text-white cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
              </div>

              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">Status (Normal / Obsoleto)</h3>
                  <p className="text-xs text-slate-400 mb-3">Lê linhas (SKU: <strong>{regrasTiny.status_sku}</strong>, Status: <strong>{regrasTiny.status_valor}</strong>).</p>
                </div>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadStatus} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-xl file:bg-violet-600 file:text-white cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
              </div>
            </div>

            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold mb-2 text-white">Upload e Gestão Individual dos Canais</h2>
              <p className="text-xs text-slate-400 mb-6">Suba as planilhas por canal determinando a coluna onde o SKU será lido.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {regrasCanais.map((r, idx) => (
                  <div key={idx} className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between gap-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-bold text-white text-sm block">{r.canal}</span>
                        <span className="text-[10px] font-mono text-indigo-400">Coluna SKU: {r.coluna_sku}</span>
                      </div>
                      <button onClick={() => limparCanal(r.canal)} className="text-rose-400 text-[10px] font-bold bg-rose-950/40 px-2.5 py-1 rounded cursor-pointer">Limpar</button>
                    </div>
                    <input type="file" multiple accept=".xlsx, .xls, .csv" onChange={(e) => handleUploadCanalMultiplos(r.canal, r.coluna_sku, e)} className="block w-full text-[10px] text-slate-400 file:py-1.5 file:px-3 file:rounded-lg file:bg-slate-800 file:text-slate-200 cursor-pointer bg-slate-900 p-1.5 rounded-lg border border-slate-800" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ABA: CUSTOS POR SKU */}
        {abaAtiva === "custos" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-white">Gestão de Custos Unitários por SKU</h2>
              <button onClick={limparTabelaCustos} className="bg-rose-950/60 text-rose-400 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer">🗑️ Limpar Custos</button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800 mb-6">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Col. SKU:</label>
                <input type="text" value={regrasColsCusto.custo_sku} onChange={e => setRegrasColsCusto({...regrasColsCusto, custo_sku: e.target.value.toUpperCase()})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Col. Produto:</label>
                <input type="text" value={regrasColsCusto.custo_produto} onChange={e => setRegrasColsCusto({...regrasColsCusto, custo_produto: e.target.value.toUpperCase()})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Col. Custo:</label>
                <input type="text" value={regrasColsCusto.custo_valor} onChange={e => setRegrasColsCusto({...regrasColsCusto, custo_valor: e.target.value.toUpperCase()})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Col. Marca:</label>
                <input type="text" value={regrasColsCusto.custo_marca} onChange={e => setRegrasColsCusto({...regrasColsCusto, custo_marca: e.target.value.toUpperCase()})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
            </div>

            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadCustosUnitarios} className="block w-full text-xs text-slate-400 file:py-3 file:px-5 file:rounded-xl file:bg-emerald-600 file:text-white cursor-pointer bg-slate-900 p-3 rounded-xl border border-slate-700 mb-6" />
            <input type="text" value={pesquisaCusto} onChange={(e) => setPesquisaCusto(e.target.value)} placeholder="🔍 Pesquisar SKU..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none mb-4" />
            
            {pesquisaCusto.trim() !== "" && (
              <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[400px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px]">
                    <tr><th className="p-3">SKU</th><th className="p-3">Produto</th><th className="p-3">Custo Unitário</th><th className="p-3 text-center">Ações</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {listaCustosFiltrados.map(item => (
                      <tr key={item.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-mono">{item.sku}</td>
                        <td className="p-3">{item.produto}</td>
                        <td className="p-3 font-mono text-emerald-400 font-bold">R$ {Number(item.custo_unitario).toFixed(2)}</td>
                        <td className="p-3 text-center"><button onClick={() => excluirCusto(item.id)} className="text-rose-400 font-bold">Remover</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ABA: REGRAS & MEDIDAS ML */}
        {abaAtiva === "regras_ml" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white">Regras & Medidas do Mercado Livre</h2>
                <p className="text-xs text-slate-400">Mapeamento de colunas para leitura de anúncios por conta (MLB, SKU, Comissão, Peso, Altura, Largura, Comprimento).</p>
              </div>
              <button onClick={salvarRegrasMlSupabase} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-5 rounded-xl text-xs uppercase cursor-pointer">
                Salvar Configurações
              </button>
            </div>

            <div className="flex bg-slate-950 p-2 rounded-xl border border-slate-800 w-fit gap-2">
              <button type="button" onClick={() => setContaMlSelecionada("Mercado Livre 1")} className={`px-4 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer ${contaMlSelecionada === "Mercado Livre 1" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Mercado Livre 1</button>
              <button type="button" onClick={() => setContaMlSelecionada("Mercado Livre 2")} className={`px-4 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer ${contaMlSelecionada === "Mercado Livre 2" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Mercado Livre 2</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950 p-5 rounded-xl border border-slate-800">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna MLB (ID):</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_mlb} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_mlb: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna SKU:</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_sku} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_sku: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna Comissão:</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_comissao} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_comissao: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna Peso (kg):</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_peso} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_peso: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna Altura (cm):</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_altura} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_altura: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna Largura (cm):</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_largura} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_largura: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna Comprimento (cm):</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_comprimento} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_comprimento: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
            </div>

            <input type="file" accept=".xlsx, .xls" onChange={handleUploadRegrasML} className="block w-full text-xs text-slate-400 file:py-3 file:px-5 file:rounded-xl file:bg-indigo-600 file:text-white cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
            <input type="text" value={pesquisaMl} onChange={(e) => setPesquisaMl(e.target.value)} placeholder="🔍 Pesquisar MLB ou SKU..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none" />
          </div>
        )}

        {/* ABA: UPDATES & ALIMENTA DASHBOARD (ADMIN) */}
        {abaAtiva === "dashboard_admin" && (
          <div className="space-y-6">
            
            {/* PASSO 1: FATURADOS */}
            <div className="grid grid-cols-1 gap-6 max-w-xl">
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Passo 1: Faturados (NFes Saída)</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Mês de Referência dos Faturados</label>
                    <input type="text" value={mesAlvoDash} onChange={e => setMesAlvoDash(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-bold" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna ID (Observações / AI)</label>
                      <input type="text" value={colunaIdFaturados} onChange={e => setColunaIdFaturados(e.target.value.toUpperCase())} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-indigo-400 font-mono font-bold text-center uppercase outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Data (D)</label>
                      <input type="text" value={colunaDataFaturados} onChange={e => setColunaDataFaturados(e.target.value.toUpperCase())} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-emerald-400 font-mono font-bold text-center uppercase outline-none" />
                    </div>
                  </div>
                  <label className="block w-full text-center bg-emerald-600 hover:bg-emerald-500 transition text-white font-extrabold text-xs py-3 rounded-xl shadow-lg cursor-pointer">
                    <span>Subir Faturados (Excel/CSV)</span>
                    <input type="file" accept=".xlsx, .xls, .csv" onChange={handleSubirFaturados} className="hidden" />
                  </label>
                </div>
              </div>
            </div>

            {/* PASSO 2: VENDAS POR CANAL E TARIFAS DO SITE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-6">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Passo 2: Importar Vendas (Canal)</h3>
                <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Mês de Referência</label>
                    <input type="text" value={mesAlvoDash} onChange={e => setMesAlvoDash(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Canal de Destino</label>
                    <select value={canalAlvoDash} onChange={e => setCanalAlvoDash(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none font-bold">
                      {canaisDashList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <label className="block w-full text-center bg-purple-600 hover:bg-purple-500 transition text-white font-bold text-xs py-2.5 rounded-lg shadow cursor-pointer">
                    <span>Importar e Cruzar Vendas</span>
                    <input type="file" accept=".xlsx, .xls, .csv" onChange={handleSubirVendasCanal} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-6">
                <h3 className="text-sm font-black text-emerald-400 uppercase tracking-wider">Consulta Tarifas Site</h3>
                <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3">
                  <p className="text-[10px] text-slate-400">Cruza ID do Pedido com a tarifa para descontar do líquido final.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col ID Pedido</label>
                      <input type="text" value={colunaIdSite} onChange={e => setColunaIdSite(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-center font-mono font-bold text-white uppercase outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col Valor Tarifa</label>
                      <input type="text" value={colunaTarifaSite} onChange={e => setColunaTarifaSite(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-center font-mono font-bold text-white uppercase outline-none" />
                    </div>
                  </div>
                  <label className="block w-full text-center bg-indigo-600 hover:bg-indigo-500 transition text-white font-bold text-xs py-2.5 rounded-lg shadow cursor-pointer">
                    <span>Subir Tarifas do Site</span>
                    <input type="file" accept=".xlsx, .xls, .csv" onChange={handleSubirTarifasSite} className="hidden" />
                  </label>
                </div>
              </div>
            </div>

            {/* ZONA DE LIMPEZA DE DADOS */}
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-rose-950/60 shadow-xl space-y-4 max-w-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h3 className="text-sm font-black text-rose-400 uppercase tracking-wider">⚠️ Zona de Limpeza de Dados</h3>
                <input type="text" value={mesAlvoDash} onChange={e => setMesAlvoDash(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-bold outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => apagarDadosPorTipo('faturados')} className="bg-slate-950 hover:bg-rose-950/40 text-rose-300 border border-rose-900 font-bold py-2 px-4 rounded-xl text-xs transition cursor-pointer">
                  Apagar Faturados ({mesAlvoDash})
                </button>
                <button onClick={() => apagarDadosPorTipo('vendas_lives')} className="bg-slate-950 hover:bg-rose-950/40 text-rose-300 border border-rose-900 font-bold py-2 px-4 rounded-xl text-xs transition cursor-pointer">
                  Apagar Vendas ({mesAlvoDash})
                </button>
              </div>
              <div className="pt-3 border-t border-slate-800 flex justify-end">
                <button onClick={zerarBancoTotal} className="bg-rose-600 hover:bg-rose-500 text-white font-black py-2.5 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer">
                  🗑️ Zerar Banco Principal
                </button>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}