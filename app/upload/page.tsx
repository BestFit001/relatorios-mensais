"use client";
import { useState, ChangeEvent, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";
import { useRouter } from "next/navigation";

function letraParaIndice(letra: string): number {
  let l = letra.trim().toUpperCase();
  let num = 0;
  for (let i = 0; i < l.length; i++) {
    num = num * 26 + (l.charCodeAt(i) - 64);
  }
  return num - 1;
}

function normalizarSku(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "");
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/^["']|["']$/g, "").trim();
  if (/e\+/i.test(s)) {
    try { s = BigInt(Math.trunc(Number(s))).toString(); } catch {}
  }
  return s.toLowerCase();
}

function parseNumeroBruto(valor: any): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;
  let s = String(valor).replace(/R\$/g, "").replace(/BRL/g, "").replace(/\$/g, "").replace(/\s/g, "").trim();
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

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

  const [regrasTiny, setRegrasTiny] = useState({ sku: 'C', estoque: 'F', status_sku: 'A', status_valor: 'B' });
  const [contaMlSelecionada, setContaMlSelecionada] = useState<"Mercado Livre 1" | "Mercado Livre 2">("Mercado Livre 1");

  const [colunasPorConta, setColunasPorConta] = useState<{ [key: string]: { ml_mlb: string, ml_sku: string, ml_comissao: string, ml_peso: string, ml_altura: string, ml_largura: string, ml_comprimento: string } }>({
    "Mercado Livre 1": { ml_mlb: 'B', ml_sku: 'E', ml_comissao: 'AA', ml_peso: 'AF', ml_altura: 'AC', ml_largura: 'AD', ml_comprimento: 'AE' },
    "Mercado Livre 2": { ml_mlb: 'B', ml_sku: 'E', ml_comissao: 'AA', ml_peso: 'AF', ml_altura: 'AC', ml_largura: 'AD', ml_comprimento: 'AE' }
  });

  const [regrasColsCusto, setRegrasColsCusto] = useState({
    custo_sku: 'B', custo_produto: 'C', custo_valor: 'D', custo_marca: 'E'
  });

  const [pesquisaCusto, setPesquisaCusto] = useState("");
  const [listaCustosFiltrados, setListaCustosFiltrados] = useState<any[]>([]);
  const [pesquisaMl, setPesquisaMl] = useState("");

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
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarConfiguracoesSupabase();
  }, []);

  const carregarConfiguracoesSupabase = async () => {
    try {
      const { data } = await supabase.from('config_regras_canais').select('*');
      if (data && data.length > 0) {
        const novoObj: any = { ...colunasPorConta };
        data.forEach((r: any) => {
          if (novoObj[r.conta]) {
            novoObj[r.conta] = {
              ml_mlb: r.coluna_mlb || novoObj[r.conta].ml_mlb,
              ml_sku: r.coluna_sku || novoObj[r.conta].ml_sku,
              ml_comissao: r.coluna_comissao || novoObj[r.conta].ml_comissao,
              ml_peso: r.coluna_peso || novoObj[r.conta].ml_peso,
              ml_altura: r.coluna_altura || novoObj[r.conta].ml_altura,
              ml_largura: r.coluna_largura || novoObj[r.conta].ml_largura,
              ml_comprimento: r.coluna_comprimento || novoObj[r.conta].ml_comprimento,
            };
          }
        });
        setColunasPorConta(novoObj);
      }
    } catch (e) {}
  };

  const salvarRegrasMlSupabase = async () => {
    try {
      setLoading(true);
      for (const conta of ["Mercado Livre 1", "Mercado Livre 2"]) {
        const c = colunasPorConta[conta];
        await supabase.from('config_regras_canais').upsert({
          conta,
          coluna_mlb: c.ml_mlb,
          coluna_sku: c.ml_sku,
          coluna_comissao: c.ml_comissao,
          coluna_peso: c.ml_peso,
          coluna_altura: c.ml_altura,
          coluna_largura: c.ml_largura,
          coluna_comprimento: c.ml_comprimento,
        }, { onConflict: 'conta' });
      }
      alert("✅ Regras de Mercado Livre salvas com sucesso!");
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message);
    }
    setLoading(false);
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
            formatado.push({ mes_referencia: mesReferencia, codigo, produto, quantidade, valor: isNaN(valor) ? 0 : valor });
          }
        }
        setDadosABC(formatado);
        alert(`Curva ABC processada: ${formatado.length} produtos válidos.`);
      } catch (err: any) { alert("Erro ao ler Curva ABC: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const processarInventario = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (dadosABC.length === 0) { alert("Processe primeiro a Curva ABC."); e.target.value = ""; return; }
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
          for (let col = 0; col < row.length; col++) {
            const val = normalizarSku(row[col]);
            if (skusPermitidos.has(val)) { skuEncontrado = val; break; }
          }
          if (skuEncontrado) {
            const saldoVal = Number(row[row.length - 1] ?? 0);
            formatado.push({ mes_referencia: mesReferencia, codigo_sku: skuEncontrado, saldo: isNaN(saldoVal) ? 0 : saldoVal });
          }
        }
        setDadosInvBruto(formatado);
        alert(`Inventário processado: ${formatado.length} SKUs identificados.`);
      } catch (err: any) { alert("Erro ao ler Inventário: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const enviarParaBanco = async () => {
    if (dadosABC.length === 0) return;
    setLoading(true);
    await supabase.from('curva_abc').delete().eq('mes_referencia', mesReferencia);
    await supabase.from('inventario').delete().eq('mes_referencia', mesReferencia);
    await supabase.from('curva_abc').insert(dadosABC);
    if (dadosInvBruto.length > 0) await supabase.from('inventario').insert(dadosInvBruto);
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
          if (sku && !/sku|código|codigo/i.test(sku)) {
            mapaUnico.set(sku, { sku, estoque: isNaN(estoque) ? 0 : estoque });
          }
        }
        const registros = Array.from(mapaUnico.values());
        for (let i = 0; i < registros.length; i += 500) {
          await supabase.from('cadastros_base_tiny').upsert(registros.slice(i, i + 500), { onConflict: 'sku' });
        }
        alert(`Base Tiny atualizada! ${registros.length} SKUs processados.`);
        setLoading(false);
      } catch (err: any) { alert("Erro: " + err.message); setLoading(false); }
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
        const mapaUnico = new Map();
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= Math.max(indiceSku, indiceValor)) continue;
          const sku = normalizarSku(row[indiceSku]);
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
      } catch (err: any) { alert("Erro: " + err.message); setLoading(false); }
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
          if (!row || row.length === 0) continue;
          const sku = normalizarSku(row[idxSku]);
          const produto = String(row[idxProd] || "Produto").trim();
          const custo = Number(String(row[idxCusto] || "0").replace("R$", "").trim().replace(",", ".")) || 0;
          const marca = String(row[idxMarca] || "").trim();
          if (sku && !isNaN(custo)) {
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
      } catch (err: any) { alert("Erro: " + err.message); setLoading(false); }
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
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        let sheetName = workbook.SheetNames[0];
        if (workbook.SheetNames.includes("Anúncios")) sheetName = "Anúncios";
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];
        const mapaMlPendente = new Map<string, any>();
        for (let i = 4; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= Math.max(idxMlb, idxSku)) continue;
          const mlb = String(row[idxMlb] || "").trim().toUpperCase();
          if (!mlb || !mlb.startsWith("MLB")) continue;
          let sku = idxSku !== -1 ? normalizarSku(row[idxSku]) : "";
          let comissaoNum = 14;
          let rawComissao = row[idxCom];
          if (rawComissao !== undefined && rawComissao !== "") {
            let parsed = parseFloat(String(rawComissao).replace("%", "").trim().replace(",", "."));
            if (!isNaN(parsed) && parsed > 0) comissaoNum = parsed < 1 ? parsed * 100 : parsed;
          }
          mapaMlPendente.set(mlb, { mlb, sku, comissao: comissaoNum, canal: contaMlSelecionada });
        }
        const registros = Array.from(mapaMlPendente.values());
        for (let i = 0; i < registros.length; i += 500) {
          await supabase.from('ml_anuncios_regras').upsert(registros.slice(i, i + 500), { onConflict: 'mlb' });
        }
        alert(`🚀 Regras de ${contaMlSelecionada} processadas (${registros.length} anúncios).`);
        setLoading(false);
      } catch (err: any) { alert("Erro: " + err.message); setLoading(false); }
    };
    reader.readAsArrayBuffer(file);
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Base Central (Tiny ERP)</h3>
                    <button onClick={limparBaseTiny} className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[10px] font-bold py-1 px-2.5 rounded-lg cursor-pointer">Limpar Base Tiny</button>
                  </div>
                </div>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadTiny} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-xl file:bg-indigo-600 file:text-white cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
              </div>
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">Status (Normal / Obsoleto)</h3>
                </div>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadStatus} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-xl file:bg-violet-600 file:text-white cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
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
                <p className="text-xs text-slate-400">Mapeamento de colunas para leitura de anúncios por conta.</p>
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