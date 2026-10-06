"use client";
import { useState, ChangeEvent, useEffect } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function UploadPage() {
  const [abaAtiva, setAbaAtiva] = useState<"relatorios" | "cadastros" | "custos" | "regras_ml">("relatorios");

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
  const [regrasColsDinamicas, setRegrasColsDinamicas] = useState({
    custo_sku: 'A', custo_produto: 'B', custo_valor: 'C',
    ml_mlb: 'A', ml_sku: 'B', ml_comissao: 'C', ml_peso: 'D', ml_altura: 'E', ml_largura: 'F', ml_comprimento: 'G'
  });
  const [estatisticas, setEstatisticas] = useState({ totalTiny: 0, normais: 0, obsoletos: 0 });

  // Estados para Custos
  const [listaCustos, setListaCustos] = useState<any[]>([]);
  const [pesquisaCusto, setPesquisaCusto] = useState("");
  const [editandoCustoId, setEditandoCustoId] = useState<number | null>(null);
  const [dadosEdicaoCusto, setDadosEdicaoCusto] = useState({ sku: "", produto: "", custo_unitario: 0 });

  // Estados para Regras ML
  const [listaRegrasMl, setListaRegrasMl] = useState<any[]>([]);
  const [pesquisaMl, setPesquisaMl] = useState("");
  const [editandoMlId, setEditandoMlId] = useState<number | null>(null);
  const [dadosEdicaoMl, setDadosEdicaoMl] = useState({ mlb: "", sku: "", comissao: 0, peso_real: 0, altura: 0, largura: 0, comprimento: 0 });

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
    carregarCustos();
    carregarRegrasMl();
  }, []);

  const carregarDadosCadastros = async () => {
    const { data: regras } = await supabase.from('config_regras_canais').select('*').order('id');
    if (regras) setRegrasCanais(regras);

    const { data: tinyConfig } = await supabase.from('config_regras_tiny').select('*');
    if (tinyConfig) {
      const getC = (k: string, d: string) => tinyConfig.find((t: any) => t.campo === k)?.coluna || d;
      setRegrasTiny({ sku: getC('sku', 'C'), estoque: getC('estoque', 'F'), status_sku: getC('status_sku', 'A'), status_valor: getC('status_valor', 'B') });
      setRegrasColsDinamicas({
        custo_sku: getC('custo_sku', 'A'), custo_produto: getC('custo_produto', 'B'), custo_valor: getC('custo_valor', 'C'),
        ml_mlb: getC('ml_mlb', 'A'), ml_sku: getC('ml_sku', 'B'), ml_comissao: getC('ml_comissao', 'C'),
        ml_peso: getC('ml_peso', 'D'), ml_altura: getC('ml_altura', 'E'), ml_largura: getC('ml_largura', 'F'), ml_comprimento: getC('ml_comprimento', 'G')
      });
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

  const carregarCustos = async () => {
    const { data } = await supabase.from('tabela_custos_skus').select('*').order('sku');
    if (data) setListaCustos(data);
  };

  const carregarRegrasMl = async () => {
    const { data } = await supabase.from('ml_anuncios_regras').select('*').order('id');
    if (data) setListaRegrasMl(data);
  };

  const letraParaIndice = (str: string) => {
    let base = str.toUpperCase().trim();
    let coluna = 0;
    for (let i = 0; i < base.length; i++) {
      coluna = coluna * 26 + (base.charCodeAt(i) - 64);
    }
    return coluna - 1;
  };

  const normalizarSku = (valor: any) => {
    if (valor === null || valor === undefined) return "";
    let s = String(valor).trim();
    if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
    s = s.replace(/^["']|["']$/g, "").trim();
    if (/e\+/i.test(s)) {
      try { s = BigInt(Math.trunc(Number(s))).toString(); } catch {}
    }
    return s;
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
    const { error } = await supabase.from('cadastros_base_tiny').delete().neq('id', 0);
    if (error) alert("Erro: " + error.message);
    else {
      alert("Base Tiny limpa com sucesso!");
      carregarDadosCadastros();
    }
  };

  const limparCanal = async (canalNome: string) => {
    if (!confirm(`Tem certeza que deseja apagar todo o mapeamento do canal "${canalNome}"?`)) return;
    const { error } = await supabase.from('mapeamento_canais_skus').delete().eq('canal', canalNome);
    if (error) alert("Erro: " + error.message);
    else alert(`Canal "${canalNome}" limpo com sucesso!`);
  };

  const limparTabelaCustos = async () => {
    if (!confirm("Tem certeza que deseja apagar todos os custos unitários do Supabase?")) return;
    const { error } = await supabase.from('tabela_custos_skus').delete().neq('id', 0);
    if (error) alert("Erro: " + error.message);
    else {
      alert("🗑️ Tabela de custos limpa com sucesso!");
      carregarCustos();
    }
  };

  const limparRegrasMl = async () => {
    if (!confirm("Tem certeza que deseja apagar todas as regras e medidas do Mercado Livre do Supabase?")) return;
    const { error } = await supabase.from('ml_anuncios_regras').delete().neq('id', 0);
    if (error) alert("Erro: " + error.message);
    else {
      alert("🗑️ Regras do ML limpas com sucesso!");
      carregarRegrasMl();
    }
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

          if (sku && !/sku|código|codigo/i.test(sku)) {
            mapaUnico.set(sku, { sku, estoque: isNaN(estoque) ? 0 : estoque });
          }
        }
        const registros = Array.from(mapaUnico.values());

        const tamanhoLote = 500;
        for (let i = 0; i < registros.length; i += tamanhoLote) {
          const lote = registros.slice(i, i + tamanhoLote);
          const { error } = await supabase.from('cadastros_base_tiny').upsert(lote, { onConflict: 'sku' });
          if (error) throw error;
        }

        alert(`Base Tiny atualizada com sucesso! ${registros.length} SKUs processados.`);
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
        let rangeStep = 1000;
        let from = 0;
        let keepFetching = true;
        while (keepFetching) {
          const { data } = await supabase.from('cadastros_base_tiny').select('sku').range(from, from + rangeStep - 1);
          if (data && data.length > 0) {
            allTiny = [...allTiny, ...data];
            from += rangeStep;
            if (data.length < rangeStep) keepFetching = false;
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

        const tamanhoLote = 500;
        for (let i = 0; i < registros.length; i += tamanhoLote) {
          const lote = registros.slice(i, i + tamanhoLote);
          const { error } = await supabase.from('status_skus_catalogo').upsert(lote, { onConflict: 'sku' });
          if (error) throw error;
        }

        alert(`Status atualizados com sucesso! ${registros.length} SKUs validados.`);
        setLoading(false);
        carregarDadosCadastros();
      } catch (err: any) {
        alert("Erro: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Upload Bruto de Custos com base nas colunas configuradas nas Regras
  const handleUploadCustosUnitarios = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const idxSku = letraParaIndice(regrasColsDinamicas.custo_sku);
    const idxProd = letraParaIndice(regrasColsDinamicas.custo_produto);
    const idxCusto = letraParaIndice(regrasColsDinamicas.custo_valor);

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
          if (!row || row.length <= Math.max(idxSku, idxCusto)) continue;

          const sku = normalizarSku(row[idxSku]);
          const produto = String(row[idxProd] || "Produto sem nome").trim();
          const custo = Number(row[idxCusto] || 0);

          if (sku && !isNaN(custo)) {
            registros.push({ sku, produto, custo_unitario: custo });
          }
        }

        const tamanhoLote = 500;
        for (let i = 0; i < registros.length; i += tamanhoLote) {
          const lote = registros.slice(i, i + tamanhoLote);
          const { error } = await supabase.from('tabela_custos_skus').upsert(lote, { onConflict: 'sku' });
          if (error) throw error;
        }

        alert(`💰 Custos unitários extraídos e atualizados com sucesso! ${registros.length} SKUs processados.`);
        carregarCustos();
        setLoading(false);
      } catch (err: any) {
        alert("Erro ao processar custos: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Upload Bruto de Regras ML com base nas colunas configuradas nas Regras
  const handleUploadRegrasML = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const idxMlb = letraParaIndice(regrasColsDinamicas.ml_mlb);
    const idxSku = letraParaIndice(regrasColsDinamicas.ml_sku);
    const idxCom = letraParaIndice(regrasColsDinamicas.ml_comissao);
    const idxPeso = letraParaIndice(regrasColsDinamicas.ml_peso);
    const idxAlt = letraParaIndice(regrasColsDinamicas.ml_altura);
    const idxLarg = letraParaIndice(regrasColsDinamicas.ml_largura);
    const idxComp = letraParaIndice(regrasColsDinamicas.ml_comprimento);

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
          if (!row || row.length <= Math.max(idxMlb, idxSku)) continue;

          const mlb = String(row[idxMlb] || "").trim();
          const sku = normalizarSku(row[idxSku]);
          const comissao = Number(row[idxCom] || 0);
          const pesoReal = Number(row[idxPeso] || 0);
          const altura = Number(row[idxAlt] || 0);
          const largura = Number(row[idxLarg] || 0);
          const comprimento = Number(row[idxComp] || 0);

          if (mlb && sku) {
            registros.push({ mlb, sku, comissao, peso_real: pesoReal, altura, largura, comprimento });
          }
        }

        const tamanhoLote = 500;
        for (let i = 0; i < registros.length; i += tamanhoLote) {
          const lote = registros.slice(i, i + tamanhoLote);
          const { error } = await supabase.from('ml_anuncios_regras').upsert(lote, { onConflict: 'mlb' });
          if (error) throw error;
        }

        alert(`🚀 Planilha de Regras do ML processada com sucesso! ${registros.length} anúncios mapeados.`);
        carregarRegrasMl();
        setLoading(false);
      } catch (err: any) {
        alert("Erro ao processar planilha do ML: " + err.message);
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
      let rangeStep = 1000;
      let from = 0;
      let keepFetching = true;
      while (keepFetching) {
        const { data: tinyBatch } = await supabase.from('cadastros_base_tiny').select('sku').range(from, from + rangeStep - 1);
        if (tinyBatch && tinyBatch.length > 0) {
          allTiny = [...allTiny, ...tinyBatch];
          from += rangeStep;
          if (tinyBatch.length < rangeStep) keepFetching = false;
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

        let sheetName = workbook.SheetNames[0];
        if (workbook.SheetNames.includes("Template")) sheetName = "Template";
        else if (workbook.SheetNames.includes("Anúncios")) sheetName = "Anúncios";

        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        let linhaInicio = 0;
        for (let i = 0; i < Math.min(json.length, 15); i++) {
          const row = json[i];
          if (row && row.some((cell: any) => {
            const val = String(cell).trim().toLowerCase();
            return val === 'seller_sku' || val === 'sku' || val === 'sku_id';
          })) {
            linhaInicio = i + 1;
            break;
          }
        }
        if (linhaInicio === 0 || linhaInicio < 5) linhaInicio = sheetName === "Template" ? 5 : 4;

        for (let i = linhaInicio; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= indiceColuna) continue;
          
          const skuVal = normalizarSku(row[indiceColuna]);
          if (skuVal && skusTinySet.has(skuVal)) {
            skusEncontradosNoCanal.add(skuVal);
          }
        }
      }

      await supabase.from('mapeamento_canais_skus').delete().eq('canal', canalNome);

      const registrosUpsert = Array.from(skusEncontradosNoCanal).map(sku => ({
        canal: canalNome,
        sku: sku,
        presente: true
      }));

      const tamanhoLote = 500;
      for (let i = 0; i < registrosUpsert.length; i += tamanhoLote) {
        const lote = registrosUpsert.slice(i, i + tamanhoLote);
        const { error } = await supabase.from('mapeamento_canais_skus').insert(lote);
        if (error) throw error;
      }

      alert(`Canal "${canalNome}" sincronizado com sucesso (${files.length} ficheiro(s))! ${registrosUpsert.length} SKUs válidos guardados.`);
      setLoading(false);
    } catch (err: any) {
      alert("Erro ao processar ficheiros: " + err.message);
      setLoading(false);
    }
  };

  const salvarEdicaoCusto = async (id: number) => {
    const { error } = await supabase.from('tabela_custos_skus').update({
      sku: dadosEdicaoCusto.sku.trim(),
      produto: dadosEdicaoCusto.produto.trim(),
      custo_unitario: Number(dadosEdicaoCusto.custo_unitario || 0)
    }).eq('id', id);

    if (error) alert("Erro ao atualizar custo: " + error.message);
    else {
      setEditandoCustoId(null);
      carregarCustos();
    }
  };

  const excluirCusto = async (id: number) => {
    if (!confirm("Excluir este registo de custo?")) return;
    const { error } = await supabase.from('tabela_custos_skus').delete().eq('id', id);
    if (error) alert("Erro: " + error.message);
    else carregarCustos();
  };

  const salvarEdicaoMl = async (id: number) => {
    const { error } = await supabase.from('ml_anuncios_regras').update({
      mlb: dadosEdicaoMl.mlb.trim().toUpperCase(),
      sku: dadosEdicaoMl.sku.trim(),
      comissao: Number(dadosEdicaoMl.comissao || 0),
      peso_real: Number(dadosEdicaoMl.peso_real || 0),
      altura: Number(dadosEdicaoMl.altura || 0),
      largura: Number(dadosEdicaoMl.largura || 0),
      comprimento: Number(dadosEdicaoMl.comprimento || 0)
    }).eq('id', id);

    if (error) alert("Erro ao atualizar regra ML: " + error.message);
    else {
      setEditandoMlId(null);
      carregarRegrasMl();
    }
  };

  const excluirRegraMl = async (id: number) => {
    if (!confirm("Excluir esta regra do Mercado Livre?")) return;
    const { error } = await supabase.from('ml_anuncios_regras').delete().eq('id', id);
    if (error) alert("Erro: " + error.message);
    else carregarRegrasMl();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Central de Abastecimento</h1>
            <p className="text-sm font-medium text-slate-400">Gestão de Relatórios, Custos e Uploads</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-900 p-1.5 rounded-xl border border-slate-800">
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/">Dashboard</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider bg-indigo-600 text-white shadow-sm transition-all" href="/upload">Upload & Canais</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/mapeamento">Mapeamento</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/ads">Painel Ads</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/regras">Regras</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/admin">Admin</Link>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => setAbaAtiva("relatorios")}
            className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "relatorios" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            📊 Relatórios Mensais (ABC & Inventário)
          </button>
          <button
            onClick={() => setAbaAtiva("cadastros")}
            className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "cadastros" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            🛒 Cadastros e Canais
          </button>
          <button
            onClick={() => setAbaAtiva("custos")}
            className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "custos" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            💰 Gestão de Custos por SKU
          </button>
          <button
            onClick={() => setAbaAtiva("regras_ml")}
            className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "regras_ml" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            📦 Regras & Medidas ML
          </button>
        </div>

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
              <p className="text-xs text-slate-400 mb-6">Atualize ou limpe o mapeamento de cada marketplace.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {regrasCanais.map((r, idx) => (
                  <div key={idx} className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between gap-4">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white text-sm">{r.canal}</span>
                      <button onClick={() => limparCanal(r.canal)} className="text-rose-400 hover:text-rose-300 text-[10px] font-bold bg-rose-950/40 border border-rose-900/50 px-2 py-0.5 rounded cursor-pointer">
                        🗑️ Limpar Canal
                      </button>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Atualizar canal (Coluna: {r.coluna_sku}):</label>
                      <input 
                        type="file" 
                        multiple 
                        accept=".xlsx, .xls, .csv" 
                        onChange={(e) => handleUploadCanalMultiplos(r.canal, r.coluna_sku, e)}
                        className="block w-full text-[10px] text-slate-400 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:font-bold file:bg-slate-800 file:text-slate-200 cursor-pointer bg-slate-900 p-1 rounded-lg border border-slate-800"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {abaAtiva === "custos" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-white">Gestão de Custos Unitários por SKU</h2>
                <p className="text-xs text-slate-400 mt-1">Faça o upload bruto da planilha configurada nas Regras (SKU: <strong>{regrasColsDinamicas.custo_sku}</strong>, Produto: <strong>{regrasColsDinamicas.custo_produto}</strong>, Custo: <strong>{regrasColsDinamicas.custo_valor}</strong>) ou consulte/edite abaixo.</p>
              </div>
              <button 
                onClick={limparTabelaCustos}
                className="bg-rose-950/60 hover:bg-rose-900/60 text-rose-400 border border-rose-900/50 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all"
              >
                🗑️ Limpar Todos os Custos
              </button>
            </div>

            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 mb-6">
              <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">Ficheiro de Custos (.xlsx / .csv)</label>
              <input 
                type="file" 
                accept=".xlsx, .xls, .csv" 
                onChange={handleUploadCustosUnitarios} 
                className="block w-full text-xs text-slate-400 file:py-3 file:px-5 file:rounded-xl file:bg-emerald-600 file:text-white cursor-pointer bg-slate-900 p-3 rounded-xl border border-slate-700" 
              />
            </div>

            <div className="mb-4">
              <input 
                type="text" 
                value={pesquisaCusto} 
                onChange={(e) => setPesquisaCusto(e.target.value)} 
                placeholder="Pesquisar SKU ou Nome do Produto..." 
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[500px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                  <tr>
                    <th className="p-3.5">SKU</th>
                    <th className="p-3.5">Nome do Produto</th>
                    <th className="p-3.5 text-right">Custo Unitário</th>
                    <th className="p-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {listaCustos
                    .filter(c => c.sku.toLowerCase().includes(pesquisaCusto.toLowerCase()) || (c.produto && c.produto.toLowerCase().includes(pesquisaCusto.toLowerCase())))
                    .map((item) => {
                      const isEditing = editandoCustoId === item.id;
                      return (
                        <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3.5 font-mono font-bold text-slate-200">
                            {isEditing ? (
                              <input type="text" value={dadosEdicaoCusto.sku} onChange={(e) => setDadosEdicaoCusto({ ...dadosEdicaoCusto, sku: e.target.value })} className="bg-slate-900 border border-slate-700 rounded p-1 w-28 text-white font-mono" />
                            ) : item.sku}
                          </td>
                          <td className="p-3.5 text-slate-300">
                            {isEditing ? (
                              <input type="text" value={dadosEdicaoCusto.produto} onChange={(e) => setDadosEdicaoCusto({ ...dadosEdicaoCusto, produto: e.target.value })} className="bg-slate-900 border border-slate-700 rounded p-1 w-full text-white" />
                            ) : (item.produto || "—")}
                          </td>
                          <td className="p-3.5 text-right font-bold text-emerald-400 font-mono">
                            {isEditing ? (
                              <input type="number" step="0.01" value={dadosEdicaoCusto.custo_unitario} onChange={(e) => setDadosEdicaoCusto({ ...dadosEdicaoCusto, custo_unitario: Number(e.target.value) })} className="bg-slate-900 border border-slate-700 rounded p-1 w-24 text-right text-white font-mono" />
                            ) : `R$ ${Number(item.custo_unitario).toFixed(2)}`}
                          </td>
                          <td className="p-3.5 text-center flex items-center justify-center gap-2">
                            {isEditing ? (
                              <>
                                <button onClick={() => salvarEdicaoCusto(item.id)} className="bg-emerald-600 text-white px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer">Salvar</button>
                                <button onClick={() => setEditandoCustoId(null)} className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-[11px] font-bold cursor-pointer">Cancelar</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => { setEditandoCustoId(item.id); setDadosEdicaoCusto({ sku: item.sku, produto: item.produto || "", custo_unitario: item.custo_unitario }); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer">Editar</button>
                                <button onClick={() => excluirCusto(item.id)} className="bg-rose-950/60 hover:bg-rose-900/60 text-rose-400 px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer">Remover</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {abaAtiva === "regras_ml" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-white">Regras & Medidas do Mercado Livre</h2>
                <p className="text-xs text-slate-400 mt-1">Faça o upload bruto da planilha configurada nas Regras (MLB: <strong>{regrasColsDinamicas.ml_mlb}</strong>, SKU: <strong>{regrasColsDinamicas.ml_sku}</strong>, Comissão: <strong>{regrasColsDinamicas.ml_comissao}</strong>, Peso: <strong>{regrasColsDinasricas?.ml_peso ?? regrasColsDinamicas.ml_peso}</strong>) ou consulte abaixo.</p>
              </div>
              <button 
                onClick={limparRegrasMl}
                className="bg-rose-950/60 hover:bg-rose-900/60 text-rose-400 border border-rose-900/50 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all"
              >
                🗑️ Limpar Regras ML
              </button>
            </div>

            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 mb-6">
              <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">Ficheiro de Regras ML (.xlsx)</label>
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                onChange={handleUploadRegrasML} 
                className="block w-full text-xs text-slate-400 file:py-3 file:px-5 file:rounded-xl file:bg-indigo-600 file:text-white cursor-pointer bg-slate-900 p-3 rounded-xl border border-slate-700" 
              />
            </div>

            <div className="mb-4">
              <input 
                type="text" 
                value={pesquisaMl} 
                onChange={(e) => setPesquisaMl(e.target.value)} 
                placeholder="Pesquisar por MLB ou SKU..." 
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[500px]">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                  <tr>
                    <th className="p-3">MLB</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3 text-center">Comissão (%)</th>
                    <th className="p-3 text-right">Peso (kg)</th>
                    <th className="p-3 text-right">Alt (cm)</th>
                    <th className="p-3 text-right">Larg (cm)</th>
                    <th className="p-3 text-right">Comp (cm)</th>
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {listaRegrasMl
                    .filter(m => m.mlb.toLowerCase().includes(pesquisaMl.toLowerCase()) || m.sku.toLowerCase().includes(pesquisaMl.toLowerCase()))
                    .map((item) => {
                      const isEditing = editandoMlId === item.id;
                      return (
                        <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 font-mono font-bold text-slate-200">
                            {isEditing ? (
                              <input type="text" value={dadosEdicaoMl.mlb} onChange={(e) => setDadosEdicaoMl({ ...dadosEdicaoMl, mlb: e.target.value })} className="bg-slate-900 border border-slate-700 rounded p-1 w-28 text-white font-mono" />
                            ) : item.mlb}
                          </td>
                          <td className="p-3 font-mono text-slate-400">
                            {isEditing ? (
                              <input type="text" value={dadosEdicaoMl.sku} onChange={(e) => setDadosEdicaoMl({ ...dadosEdicaoMl, sku: e.target.value })} className="bg-slate-900 border border-slate-700 rounded p-1 w-24 text-white font-mono" />
                            ) : item.sku}
                          </td>
                          <td className="p-3 text-center font-bold text-rose-400">
                            {isEditing ? (
                              <input type="number" step="0.01" value={dadosEdicaoMl.comissao} onChange={(e) => setDadosEdicaoMl({ ...dadosEdicaoMl, comissao: Number(e.target.value) })} className="bg-slate-900 border border-slate-700 rounded p-1 w-16 text-center text-white" />
                            ) : `${Number(item.comissao).toFixed(2)}%`}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-300">
                            {isEditing ? (
                              <input type="number" step="0.001" value={dadosEdicaoMl.peso_real} onChange={(e) => setDadosEdicaoMl({ ...dadosEdicaoMl, peso_real: Number(e.target.value) })} className="bg-slate-900 border border-slate-700 rounded p-1 w-20 text-right text-white" />
                            ) : Number(item.peso_real).toFixed(3)}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-300">
                            {isEditing ? (
                              <input type="number" step="0.01" value={dadosEdicaoMl.altura} onChange={(e) => setDadosEdicaoMl({ ...dadosEdicaoMl, altura: Number(e.target.value) })} className="bg-slate-900 border border-slate-700 rounded p-1 w-16 text-right text-white" />
                            ) : item.altura}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-300">
                            {isEditing ? (
                              <input type="number" step="0.01" value={dadosEdicaoMl.largura} onChange={(e) => setDadosEdicaoMl({ ...dadosEdicaoMl, largura: Number(e.target.value) })} className="bg-slate-900 border border-slate-700 rounded p-1 w-16 text-right text-white" />
                            ) : item.largura}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-300">
                            {isEditing ? (
                              <input type="number" step="0.01" value={dadosEdicaoMl.comprimento} onChange={(e) => setDadosEdicaoMl({ ...dadosEdicaoMl, comprimento: Number(e.target.value) })} className="bg-slate-900 border border-slate-700 rounded p-1 w-16 text-right text-white" />
                            ) : item.comprimento}
                          </td>
                          <td className="p-3 text-center flex items-center justify-center gap-2">
                            {isEditing ? (
                              <>
                                <button onClick={() => salvarEdicaoMl(item.id)} className="bg-emerald-600 text-white px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer">Salvar</button>
                                <button onClick={() => setEditandoMlId(null)} className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-[11px] font-bold cursor-pointer">Cancelar</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => { setEditandoMlId(item.id); setDadosEdicaoMl({ mlb: item.mlb, sku: item.sku, comissao: item.comissao, peso_real: item.peso_real, altura: item.altura, largura: item.largura, comprimento: item.comprimento }); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer">Editar</button>
                                <button onClick={() => excluirRegraMl(item.id)} className="bg-rose-950/60 hover:bg-rose-900/60 text-rose-400 px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer">Remover</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}