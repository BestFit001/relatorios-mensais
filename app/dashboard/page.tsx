"use client";
import { useState, ChangeEvent, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";
import { useRouter } from "next/navigation";

async function fetchTodosRegistros(tabela: string, select: string = '*', eqCampo?: string, eqValor?: any) {
  let todos: any[] = [];
  let from = 0;
  const step = 1000;
  let continuar = true;
  
  while (continuar) {
    let query = supabase.from(tabela).select(select).range(from, from + step - 1);
    if (eqCampo && eqValor !== undefined) {
      query = query.eq(eqCampo, eqValor);
    }
    
    const { data, error } = await query;
    if (error || !data) break;
    todos = [...todos, ...data];
    from += step;
    if (data.length < step) continuar = false;
  }
  return todos;
}

function letraParaIndice(letra: string): number {
  if (!letra) return -1;
  let l = letra.trim().toUpperCase();
  if (!l) return -1;
  let num = 0;
  for (let i = 0; i < l.length; i++) {
    num = num * 26 + (l.charCodeAt(i) - 64);
  }
  return Math.max(0, num - 1);
}

function normalizarSku(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return s;
}

// PARSER UNIVERSAL DE MOEDA (BR E US) COM PROTEÇÃO CONTRA NÚMEROS DE SÉRIE DE DATAS
function parseSmartFloat(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') {
    if (isNaN(val)) return 0;
    // Se for um número inteiro próximo aos números de série do Excel (datas entre 2024 e 2030 estão entre 45000 e 48000)
    if (val >= 44000 && val <= 49000 && Number.isInteger(Math.floor(val))) return 0;
    return val;
  }

  let strVal = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(strVal) || /^\d{2}\/\d{2}\/\d{4}/.test(strVal)) return 0;

  strVal = strVal.replace(/[^\d.,-]/g, '');
  if (!strVal) return 0;

  const hasComma = strVal.includes(',');
  const hasDot = strVal.includes('.');

  if (hasComma && hasDot) {
    if (strVal.lastIndexOf(',') > strVal.lastIndexOf('.')) {
      strVal = strVal.replace(/\./g, '').replace(',', '.');
    } else {
      strVal = strVal.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    strVal = strVal.replace(/\./g, '').replace(',', '.');
  } else if (hasDot && !hasComma) {
    const parts = strVal.split('.');
    if (parts.length > 2) {
      strVal = strVal.replace(/\./g, '');
    }
  }

  const num = parseFloat(strVal);
  if (isNaN(num)) return 0;
  // Trava de segurança para números de série de datas do Excel ou IDs
  if (num >= 44000 && num <= 49000 && Number.isInteger(Math.floor(num))) return 0;
  if (num > 500000) return 0;

  return num;
}

const MESES_NOMES: Record<string, string> = {
  "01": "janeiro", "02": "fevereiro", "03": "março", "04": "abril",
  "05": "maio", "06": "junho", "07": "julho", "08": "agosto",
  "09": "setembro", "10": "outubro", "11": "novembro", "12": "dezembro"
};

export default function UpdatesPage() {
  const router = useRouter();
  const [abaAtiva, setAbaAtiva] = useState<"relatorios" | "cadastros" | "custos" | "regras_ml" | "vendas_pendentes" | "dashboard_admin">("relatorios");

  const [mes, setMes] = useState("10");
  const [ano, setAno] = useState("2026");
  const [ficheiroABC, setFicheiroABC] = useState("");
  const [ficheiroInventario, setFicheiroInventario] = useState("");
  const [dadosABC, setDadosABC] = useState<any[]>([]);
  const [dadosInventario, setDadosInventario] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [cadastrosPendentes, setCadastrosPendentes] = useState<any[]>([]);
  const [vendasPendentes, setVendasPendentes] = useState<any[]>([]);
  const [selecionadosPendentes, setSelecionadosPendentes] = useState<Record<number, boolean>>({});
  const [skuEmLote, setSkuEmLote] = useState("");
  const [termoPesquisaPendente, setTermoPesquisaPendente] = useState("");

  const [colunasPorConta, setColunasPorConta] = useState<Record<string, any>>({
    "Mercado Livre 1": { ml_mlb: "A", ml_sku: "E", ml_comissao: "H", ml_peso: "N", ml_altura: "O", ml_largura: "P", ml_comprimento: "Q" },
    "Mercado Livre 2": { ml_mlb: "A", ml_sku: "E", ml_comissao: "H", ml_peso: "N", ml_altura: "O", ml_largura: "P", ml_comprimento: "Q" },
  });
  const [contaMlSelecionada, setContaMlSelecionada] = useState<"Mercado Livre 1" | "Mercado Livre 2">("Mercado Livre 1");
  const [pesquisaMl, setPesquisaMl] = useState("");
  const [regrasCanais, setRegrasCanais] = useState<any[]>([]);

  const [colunaEstoqueInventario, setColunaEstoqueInventario] = useState("E");

  const [mesUpload, setMesUpload] = useState("10");
  const [anoUpload, setAnoUpload] = useState("2026");
  const mesAlvoDash = `${anoUpload}-${mesUpload}`;

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
    { valor: "11", nome: "Novembro" }, { valor: "12", nome: "Dezembro" },
  ];
  const anos = [2025, 2026, 2027];

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarCadastrosPendentes();
    carregarVendasPendentes();
    carregarConfiguracoesML();
  }, []);

  const carregarConfiguracoesML = async () => {
    const { data: regras } = await supabase.from('config_regras_canais').select('*').order('id');
    if (regras) {
      setRegrasCanais(regras);
      const novasColunas = { ...colunasPorConta };
      for (const conta of ["Mercado Livre 1", "Mercado Livre 2"] as const) {
        const r = regras.find((x: any) => x.canal === conta);
        if (r) {
          novasColunas[conta] = {
            ml_mlb: r.coluna_mlb || "A",
            ml_sku: r.coluna_sku || "E",
            ml_comissao: r.coluna_comissao || "H",
            ml_peso: r.coluna_peso || "N",
            ml_altura: r.coluna_altura || "O",
            ml_largura: r.coluna_largura || "P",
            ml_comprimento: r.coluna_comprimento || "Q",
          };
        }
      }
      setColunasPorConta(novasColunas);
    }
  };

  const carregarCadastrosPendentes = async () => {
    try {
      const data = await fetchTodosRegistros('cadastros_base');
      setCadastrosPendentes(data.filter((item: any) => !item.sku));
    } catch (err) {
      console.error(err);
    }
  };

  const carregarVendasPendentes = async () => {
    try {
      const data = await fetchTodosRegistros('vendas_canais');
      const custos = await fetchTodosRegistros('tabela_custos_skus', 'sku');
      const skusExistentes = new Set(custos.map((c: any) => normalizarSku(c.sku)));

      const pendentes = data.filter((v: any) => {
        const sNorm = normalizarSku(v.sku);
        return !sNorm || sNorm === 'semsku' || !skusExistentes.has(sNorm);
      });
      setVendasPendentes(pendentes);
    } catch (err) {
      console.error(err);
    }
  };

  const salvarSkuPendente = async (id: number, novoSku: string) => {
    try {
      const skuLimpo = novoSku.trim();
      const sNorm = normalizarSku(skuLimpo);
      
      const { data: custoItem } = await supabase
        .from('tabela_custos_skus')
        .select('produto')
        .ilike('sku', skuLimpo)
        .maybeSingle();

      const nomeAtualizado = custoItem?.produto || 'Produto Comercial';

      await supabase
        .from('vendas_canais')
        .update({ sku: skuLimpo, produto: nomeAtualizado })
        .eq('id', id);

      setVendasPendentes(vendasPendentes.filter(v => v.id !== id));
    } catch (err: any) {
      alert("Erro ao salvar SKU: " + err.message);
    }
  };

  const salvarSkuEmLote = async () => {
    const idsParaSalvar = Object.keys(selecionadosPendentes).filter(id => selecionadosPendentes[Number(id)]);
    if (idsParaSalvar.length === 0 || !skuEmLote.trim()) {
      alert("Selecione pelo menos um item e digite um SKU válido.");
      return;
    }

    setLoading(true);
    try {
      for (const idStr of idsParaSalvar) {
        await salvarSkuPendente(Number(idStr), skuEmLote);
      }
      setSkuEmLote("");
      setSelecionadosPendentes({});
      carregarVendasPendentes();
    } catch (err: any) {
      alert("Erro ao salvar em lote: " + err.message);
    }
    setLoading(false);
  };

  const atualizarColunaSkuCanal = async (id: number, novaLetraCol: string) => {
    const letraUpper = novaLetraCol.toUpperCase().trim();
    const atualizadas = regrasCanais.map(r => r.id === id ? { ...r, coluna_sku: letraUpper } : r);
    setRegrasCanais(atualizadas);

    try {
      await supabase.from('config_regras_canais').update({ coluna_sku: letraUpper }).eq('id', id);
    } catch (err) {
      console.error("Erro ao atualizar coluna do canal:", err);
    }
  };

  const salvarRegrasMlSupabase = async () => {
    try {
      setLoading(true);
      for (const conta of ["Mercado Livre 1", "Mercado Livre 2"] as const) {
        const c = colunasPorConta[conta];
        await supabase.from('config_regras_canais').upsert({
          canal: conta,
          coluna_mlb: c.ml_mlb,
          coluna_sku: c.ml_sku,
          coluna_comissao: c.ml_comissao,
          coluna_peso: c.ml_peso,
          coluna_altura: c.ml_altura,
          coluna_largura: c.ml_largura,
          coluna_comprimento: c.ml_comprimento,
        }, { onConflict: 'canal' });
      }
      alert("✅ Regras de Mercado Livre salvas com sucesso!");
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // PASSO 1: SUBIR FATURADOS DO ERP (TINY)
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
        const idxObs = letraParaIndice("P");

        const registros = [];
        for (let i = 1; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;

          let pedidoId = idxId >= 0 && row[idxId] !== undefined ? String(row[idxId]).trim() : '';
          const rawObs = idxObs >= 0 && row[idxObs] !== undefined ? String(row[idxObs]).trim() : '';

          if (pedidoId) {
            pedidoId = pedidoId.replace(/\.0$/, '').replace(/\D/g, '');
          } else if (rawObs) {
            const numbersOnly = rawObs.replace(/\D/g, '');
            if (numbersOnly.length >= 8) pedidoId = numbersOnly;
          }

          const dataFaturamento = String(row[idxData] || "").trim();

          if (pedidoId) {
            registros.push({
              id_pedido: pedidoId,
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

        alert(`✅ Faturados salvos na tabela 'faturados' (${mesAlvoDash})! Total: ${registros.length} registos.`);
        setLoading(false);
      } catch (err: any) {
        alert("Erro ao importar Faturados: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // PASSO 2: IMPORTAR E CRUZAR VENDAS DO CANAL COM REGRAS DINÂMICAS
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

        const faturadosBanco = await fetchTodosRegistros('faturados', 'id_pedido', 'mes_referencia', mesAlvoDash);
        const idsFaturadosSet = new Set(faturadosBanco.map((f: any) => String(f.id_pedido).trim()));
        
        if (idsFaturadosSet.size === 0) {
          alert(`⚠️ ATENÇÃO: Nenhum pedido faturado encontrado na tabela 'faturados' para o mês [${mesAlvoDash}]. Suba os faturados no Passo 1 primeiro.`);
          setLoading(false);
          return;
        }

        const { data: regraData } = await supabase
          .from('config_regras_canais')
          .select('*')
          .eq('canal', canalAlvoDash)
          .maybeSingle();

        const custosBanco = await fetchTodosRegistros('tabela_custos_skus', 'sku, produto');

        const mapaProdutos = new Map();
        const skusBaseSet = new Set();
        custosBanco.forEach((c: any) => {
          const sNorm = normalizarSku(c.sku);
          const pVal = String(c.produto || "").trim();
          if (sNorm) {
            mapaProdutos.set(sNorm, pVal);
            skusBaseSet.add(sNorm);
          }
        });

        // MAPEAMENTO DINÂMICO BASEADO NO BANCO DE REGRAS
        const isML = canalAlvoDash.toLowerCase().includes("mercado livre");

        const colSkuDef = regraData?.col_sku || regraData?.coluna_sku || (isML ? 'E' : 'B');
        const colPdvDef = regraData?.col_pdv || regraData?.col_preco_venda || (isML ? 'I' : 'D');
        const colQtdDef = regraData?.col_quantidade || regraData?.coluna_quantidade || (isML ? 'H' : 'C');
        const colIdDef = regraData?.col_id_pedido || regraData?.col_estado || 'A';
        const colRepasseDef = regraData?.col_repasse || regraData?.coluna_repasse || (isML ? 'T' : '');

        const idxId = letraParaIndice(colIdDef);
        const idxSku = letraParaIndice(colSkuDef);
        const idxPdv = letraParaIndice(colPdvDef);
        const idxQtd = letraParaIndice(colQtdDef);
        const idxDescricao = letraParaIndice(regraData?.col_descricao || "D"); 
        const idxRepasse = colRepasseDef ? letraParaIndice(colRepasseDef) : -1;

        const novasVendas = [];
        let totalImportados = 0;
        let ignoradosForaDoMes = 0;

        // O Mercado Livre começa na linha 6 do relatório; canais normais começam na linha 1
        let i = isML ? 6 : 1;
        while (i < json.length) {
          const row = json[i];
          if (!row || row.length === 0) {
            i++;
            continue;
          }

          let rawId = idxId >= 0 && row[idxId] !== undefined ? String(row[idxId]).trim() : '';
          rawId = rawId.replace(/\.0$/, '').replace(/\D/g, '');

          if (!rawId) {
            i++;
            continue;
          }

          if (!idsFaturadosSet.has(rawId)) {
            ignoradosForaDoMes++;
            i++;
            continue;
          }

          const descRaw = idxDescricao >= 0 && row[idxDescricao] !== undefined ? String(row[idxDescricao]).trim() : '';

          // 1. TRATAMENTO DE CARRINHO / PACOTE DE PRODUTOS (EXCLUSIVO ML)
          if (isML && descRaw.toLowerCase().includes("pacote de") && descRaw.toLowerCase().includes("produtos")) {
            const match = descRaw.match(/\d+/);
            const qtdItensNoPacote = match ? parseInt(match[0], 10) : 0;
            
            if (qtdItensNoPacote > 0) {
              const pdvPrincipal = parseSmartFloat(idxPdv >= 0 ? row[idxPdv] : 0);
              let repasseTotal = idxRepasse >= 0 ? parseSmartFloat(row[idxRepasse]) : 0;
              if (repasseTotal <= 0 || repasseTotal > pdvPrincipal * 1.5) {
                repasseTotal = Math.max(0, pdvPrincipal - (pdvPrincipal * 0.16));
              }

              let subItens = [];
              let somaPdvSubItens = 0;

              for (let j = 1; j <= qtdItensNoPacote; j++) {
                const subRow = json[i + j];
                if (subRow) {
                  const skuSub = normalizarSku(subRow[idxSku >= 0 ? idxSku : 23]);
                  const pdvSub = parseSmartFloat(subRow[idxPdv >= 0 ? idxPdv : 8]);
                  const qtdSub = Number(subRow[idxQtd >= 0 ? idxQtd : 7] !== undefined ? subRow[idxQtd] : 1) || 1;
                  
                  const existe = skuSub && skusBaseSet.has(skuSub);
                  const skuFinal = existe ? skuSub : (skuSub || 'sem-sku');
                  const nome = existe ? mapaProdutos.get(skuSub) : 'Produto Carrinho';
                  
                  somaPdvSubItens += (pdvSub * qtdSub);
                  subItens.push({ skuFinal, nome, pdvSub, qtdSub });
                }
              }

              for (const item of subItens) {
                let repasseRateado = 0;
                if (somaPdvSubItens > 0) {
                  repasseRateado = repasseTotal * ((item.pdvSub * item.qtdSub) / somaPdvSubItens);
                } else {
                  repasseRateado = repasseTotal / qtdItensNoPacote;
                }

                novasVendas.push({
                  id_pedido: rawId,
                  canal: canalAlvoDash,
                  mes_referencia: mesAlvoDash,
                  sku: item.skuFinal,
                  produto: item.nome,
                  quantidade: item.qtdSub,
                  preco_venda: item.pdvSub,
                  repasse_liquido: repasseRateado
                });
                totalImportados++;
              }

              i += (qtdItensNoPacote + 1);
              continue;
            }
          }

          // 2. VENDAS NORMAIS (LEITURA ESTRITA DA COLUNA PDV MAPEADA)
          const skuRaw = idxSku >= 0 && row[idxSku] !== undefined ? row[idxSku] : '';
          const skuNorm = normalizarSku(skuRaw);
          
          const precoVenda = idxPdv >= 0 ? parseSmartFloat(row[idxPdv]) : 0;
          const quantidade = Number(idxQtd >= 0 && row[idxQtd] !== undefined ? row[idxQtd] : 1) || 1;

          const existeNaBase = skuNorm && skusBaseSet.has(skuNorm);
          const skuFinal = existeNaBase ? skuNorm : (skuNorm || 'sem-sku');
          const nomeProduto = existeNaBase ? mapaProdutos.get(skuNorm) : (skuRaw && isNaN(Number(skuRaw)) ? String(skuRaw).trim() : 'Produto Comercial');

          let repasseLiquido = idxRepasse >= 0 ? parseSmartFloat(row[idxRepasse]) : 0;
          if (repasseLiquido <= 0 || (precoVenda > 0 && repasseLiquido > precoVenda * 1.5)) {
            repasseLiquido = Math.max(0, precoVenda - (precoVenda * 0.16));
          }

          novasVendas.push({
            id_pedido: rawId,
            canal: canalAlvoDash,
            mes_referencia: mesAlvoDash,
            sku: skuFinal,
            produto: nomeProduto,
            quantidade: isNaN(quantidade) ? 1 : quantidade,
            preco_venda: precoVenda,
            repasse_liquido: repasseLiquido
          });
          totalImportados++;

          i++;
        }

        if (novasVendas.length > 0) {
          await supabase.from('vendas_canais').delete().eq('canal', canalAlvoDash).eq('mes_referencia', mesAlvoDash);
          for (let k = 0; k < novasVendas.length; k += 500) {
            const { error } = await supabase.from('vendas_canais').insert(novasVendas.slice(k, k + 500));
            if (error) throw error;
          }
        }

        alert(`✅ Vendas salvas em 'vendas_canais' (${mesAlvoDash})!\n• Importados: ${totalImportados} itens\n• Ignorados: ${ignoradosForaDoMes}`);
        carregarVendasPendentes();
      } catch (err: any) {
        alert("Erro ao cruzar e importar vendas: " + err.message);
      } finally {
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
          const valorTarifa = parseSmartFloat(row[idxTarifa]);

          if (idPedido) {
            registros.push({ id_pedido: idPedido, valor_tarifa: valorTarifa });
          }
        }

        if (registros.length > 0) {
          await supabase.from('tarifas_site').delete().neq('id', 0);
          for (let i = 0; i < registros.length; i += 500) {
            await supabase.from('tarifas_site').upsert(registros.slice(i, i + 500), { onConflict: 'id_pedido' });
          }
        }

        alert(`✅ Tarifas do Site salvas em 'tarifas_site'! Total: ${registros.length} registos.`);
        setLoading(false);
      } catch (err: any) {
        alert("Erro ao importar Tarifas do Site: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleLimparBaseGeral = async () => {
    if (!confirm("⚠️ TEM A CERTEZA? Isto irá apagar todas as vendas e faturados da base.")) return;
    setLoading(true);
    try {
      await supabase.from('vendas_canais').delete().neq('id', 0);
      await supabase.from('faturados').delete().neq('id', 0);
      alert("✅ Tabelas limpas com sucesso!");
    } catch (err: any) {
      alert("Erro ao limpar tabelas: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadABC = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFicheiroABC(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
        
        const formatados = json.slice(1).map(row => ({
          sku: normalizarSku(row[1]),
          produto: row[0],
          quantidade: Number(row[2]),
          valor: Number(row[3]),
          mes_referencia: mesReferencia
        })).filter(r => r.sku && r.quantidade);
        
        setDadosABC(formatados);
      } catch (err) {
        alert("Erro ao ler Curva ABC.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadInventario = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFicheiroInventario(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
        
        const indiceEstoque = letraParaIndice(colunaEstoqueInventario);
        const formatados = json.slice(1).map(row => {
          const skuRaw = row[0];
          const saldoVal = Number(row[row.length - 1] ?? 0);
          const estoque = Number(row[indiceEstoque] || 0);

          return {
            sku: normalizarSku(skuRaw),
            produto: row[1],
            estoque: isNaN(estoque) ? saldoVal : estoque,
            mes_referencia: mesReferencia
          };
        }).filter(r => r.sku);
        
        setDadosInventario(formatados);
      } catch (err) {
        alert("Erro ao ler Inventário.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadRegrasML = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];

        const c = colunasPorConta[contaMlSelecionada];
        const idxMlb = letraParaIndice(c.ml_mlb);
        const idxSku = letraParaIndice(c.ml_sku);
        const idxComissao = letraParaIndice(c.ml_comissao);
        const idxPeso = letraParaIndice(c.ml_peso);
        const idxAlt = letraParaIndice(c.ml_altura);
        const idxLarg = letraParaIndice(c.ml_largura);
        const idxComp = letraParaIndice(c.ml_comprimento);

        const registros = [];
        for (let i = 1; i < json.length; i++) {
          const row = json[i];
          if (!row) continue;

          const rawMlb = row[idxMlb];
          const rawSku = row[idxSku];
          const mlb = rawMlb ? String(rawMlb).trim().toUpperCase() : "";
          const sku = normalizarSku(rawSku);

          if (!mlb) continue;

          let comissao = 0;
          const rawComissao = row[idxComissao];
          if (rawComissao !== undefined && rawComissao !== null) {
            let parsed = parseFloat(String(rawComissao).replace("%", "").trim().replace(",", "."));
            if (!isNaN(parsed)) comissao = parsed;
          }

          let peso = 0;
          if (idxPeso >= 0 && row[idxPeso] !== undefined) {
            let p = Number(String(row[idxPeso]).replace(",", "."));
            if (!isNaN(p)) peso = p;
          }

          const altura = idxAlt >= 0 ? Number(String(row[idxAlt] || "0").replace(",", ".")) || 0 : 0;
          const largura = idxLarg >= 0 ? Number(String(row[idxLarg] || "0").replace(",", ".")) || 0 : 0;
          const comprimento = idxComp >= 0 ? Number(String(row[idxComp] || "0").replace(",", ".")) || 0 : 0;

          registros.push({
            mlb,
            sku,
            canal: contaMlSelecionada,
            comissao,
            peso,
            altura,
            largura,
            comprimento
          });
        }

        if (registros.length > 0) {
          await supabase.from('ml_anuncios_regras').delete().eq('canal', contaMlSelecionada);
          for (let i = 0; i < registros.length; i += 500) {
            await supabase.from('ml_anuncios_regras').upsert(registros.slice(i, i + 500), { onConflict: 'mlb' });
          }
        }

        alert(`✅ Anúncios importados para [${contaMlSelecionada}]! Total: ${registros.length}`);
        setLoading(false);
      } catch (err: any) {
        alert("Erro ao importar regras do ML: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadCustos = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];

        const idxSku = letraParaIndice("A");
        const idxNome = letraParaIndice("B");
        const idxCusto = letraParaIndice("C");
        const idxEmbalagem = letraParaIndice("D");

        const registros = [];
        for (let i = 1; i < json.length; i++) {
          const row = json[i];
          if (!row) continue;

          const sku = normalizarSku(row[idxSku]);
          const produto = String(row[idxNome] || "").trim();
          const custo = parseSmartFloat(row[idxCusto]);
          const embalagem = parseSmartFloat(row[idxEmbalagem]);

          if (sku) {
            registros.push({
              sku,
              produto: produto || "Produto Comercial",
              custo_unitario: custo,
              custo_embalagem: embalagem
            });
          }
        }

        if (registros.length > 0) {
          await supabase.from('tabela_custos_skus').upsert(registros, { onConflict: 'sku' });
        }

        alert(`✅ Base de custos salva com sucesso! Total: ${registros.length} itens.`);
        setLoading(false);
      } catch (err: any) {
        alert("Erro ao subir custos: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
          <div>
            <h1 className="text-xl font-black text-white">Central de Atualizações</h1>
            <p className="text-xs text-slate-400">Importação de relatórios, cruzamento de vendas, parametrização e custos.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setAbaAtiva("relatorios")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${abaAtiva === "relatorios" ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              Relatórios & Vendas
            </button>
            <button
              onClick={() => setAbaAtiva("custos")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${abaAtiva === "custos" ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              Base de Custos
            </button>
            <button
              onClick={() => setAbaAtiva("regras_ml")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${abaAtiva === "regras_ml" ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              Regras ML
            </button>
            <button
              onClick={() => setAbaAtiva("vendas_pendentes")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${abaAtiva === "vendas_pendentes" ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              Pendências ({vendasPendentes.length})
            </button>
          </div>
        </div>

        {/* ABA 1: RELATÓRIOS E CRUZAMENTO DE VENDAS */}
        {abaAtiva === "relatorios" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* PASSO 1: FATURADOS */}
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">Passo 1</span>
                  <h2 className="text-base font-bold text-white">Subir Faturados ERP (Tiny)</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Identifica os pedidos faturados no mês para validação.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna ID Pedido</label>
                    <input type="text" value={colunaIdFaturados} onChange={e => setColunaIdFaturados(e.target.value.toUpperCase())} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-center font-mono font-bold text-white uppercase outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Data Fat.</label>
                    <input type="text" value={colunaDataFaturados} onChange={e => setColunaDataFaturados(e.target.value.toUpperCase())} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-center font-mono font-bold text-white uppercase outline-none" />
                  </div>
                </div>

                <label className="block w-full text-center bg-indigo-600 hover:bg-indigo-500 transition text-white font-bold text-xs py-3 rounded-xl shadow-lg cursor-pointer">
                  <span>{loading ? "A processar..." : "Carregar Planilha de Faturados"}</span>
                  <input type="file" accept=".xlsx, .xls, .csv" onChange={handleSubirFaturados} disabled={loading} className="hidden" />
                </label>
              </div>

              {/* PASSO 2: VENDAS DO CANAL */}
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">Passo 2</span>
                  <h2 className="text-base font-bold text-white">Importar Vendas do Canal</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Cruza os pedidos com os faturados e aplica as regras do canal.</p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Mês Ref.</label>
                    <select value={mesUpload} onChange={e => setMesUpload(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white outline-none font-bold cursor-pointer">
                      {meses.map(m => <option key={m.valor} value={m.valor}>{m.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ano Ref.</label>
                    <select value={anoUpload} onChange={e => setAnoUpload(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white outline-none font-bold cursor-pointer">
                      {anos.map(a => <option key={a} value={String(a)}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Canal de Destino</label>
                    <select value={canalAlvoDash} onChange={e => setCanalAlvoDash(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white outline-none font-bold cursor-pointer">
                      {canaisDashList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <label className="block w-full text-center bg-purple-600 hover:bg-purple-500 transition text-white font-bold text-xs py-3 rounded-xl shadow-lg cursor-pointer">
                  <span>{loading ? "A processar..." : `Importar Vendas de ${canalAlvoDash}`}</span>
                  <input type="file" accept=".xlsx, .xls, .csv" onChange={handleSubirVendasCanal} disabled={loading} className="hidden" />
                </label>
              </div>
            </div>

            {/* TARIFAS DO SITE E GESTÃO */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">Tarifas do Site (Vindi / Gateway)</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col ID Pedido</label>
                    <input type="text" value={colunaIdSite} onChange={e => setColunaIdSite(e.target.value.toUpperCase())} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-center font-mono font-bold text-white uppercase outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col Tarifa</label>
                    <input type="text" value={colunaTarifaSite} onChange={e => setColunaTarifaSite(e.target.value.toUpperCase())} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-center font-mono font-bold text-white uppercase outline-none" />
                  </div>
                </div>
                <label className="block w-full text-center bg-emerald-600 hover:bg-emerald-500 transition text-white font-bold text-xs py-2.5 rounded-xl shadow cursor-pointer">
                  <span>Subir Tarifas do Site</span>
                  <input type="file" accept=".xlsx, .xls, .csv" onChange={handleSubirTarifasSite} className="hidden" />
                </label>
              </div>

              <div className="bg-slate-900/90 p-6 rounded-2xl border border-rose-900/40 shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-rose-400 uppercase tracking-wider">Zona de Limpeza</h3>
                  <p className="text-xs text-slate-400 mt-1">Limpa os registos consolidados de vendas e faturados para reinício de apuração.</p>
                </div>
                <button
                  onClick={handleLimparBaseGeral}
                  disabled={loading}
                  className="bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs py-2.5 rounded-xl transition"
                >
                  Limpar Toda a Base de Vendas
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: BASE DE CUSTOS */}
        {abaAtiva === "custos" && (
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
            <h2 className="text-base font-bold text-white">Importar Base de Custos (SKU, Produto, Custo, Embalagem)</h2>
            <p className="text-xs text-slate-400">Layout esperado: Coluna A = SKU, Coluna B = Nome Produto, Coluna C = Custo Produto, Coluna D = Custo Embalagem.</p>
            <label className="block w-full text-center bg-indigo-600 hover:bg-indigo-500 transition text-white font-bold text-xs py-3 rounded-xl shadow cursor-pointer">
              <span>{loading ? "A processar..." : "Carregar Planilha de Custos"}</span>
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadCustos} disabled={loading} className="hidden" />
            </label>
          </div>
        )}

        {/* ABA 3: REGRAS MERCADO LIVRE */}
        {abaAtiva === "regras_ml" && (
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-white">Regras & Medidas do Mercado Livre</h2>
                <p className="text-xs text-slate-400">Mapeamento de colunas para leitura de anúncios (MLB, SKU, Comissão, Peso, Altura, Largura, Comprimento).</p>
              </div>
              <button onClick={salvarRegrasMlSupabase} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-xl text-xs uppercase cursor-pointer">
                Salvar Configurações
              </button>
            </div>

            <div className="flex bg-slate-950 p-1.5 rounded-xl border border-slate-800 w-fit gap-2">
              <button type="button" onClick={() => setContaMlSelecionada("Mercado Livre 1")} className={`px-4 py-1.5 rounded-lg font-bold text-xs uppercase cursor-pointer ${contaMlSelecionada === "Mercado Livre 1" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Mercado Livre 1</button>
              <button type="button" onClick={() => setContaMlSelecionada("Mercado Livre 2")} className={`px-4 py-1.5 rounded-lg font-bold text-xs uppercase cursor-pointer ${contaMlSelecionada === "Mercado Livre 2" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Mercado Livre 2</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna MLB (ID):</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_mlb} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_mlb: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna SKU:</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_sku} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_sku: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna Comissão:</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_comissao} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_comissao: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna Peso (kg):</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_peso} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_peso: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
            </div>

            <label className="block w-full text-center bg-indigo-600 hover:bg-indigo-500 transition text-white font-bold text-xs py-3 rounded-xl shadow cursor-pointer">
              <span>{loading ? "A processar..." : "Importar Planilha de Anúncios ML"}</span>
              <input type="file" accept=".xlsx, .xls" onChange={handleUploadRegrasML} disabled={loading} className="hidden" />
            </label>
          </div>
        )}

        {/* ABA 4: VENDAS PENDENTES */}
        {abaAtiva === "vendas_pendentes" && (
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-amber-900/40 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-base font-bold text-white">Vendas com SKU Pendente ou Não Cadastrado</h2>
                <p className="text-xs text-slate-400">Atribua o SKU correto aos itens vendidos para cálculo do CMV.</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="SKU para aplicar..."
                  value={skuEmLote}
                  onChange={e => setSkuEmLote(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
                />
                <button
                  onClick={salvarSkuEmLote}
                  disabled={loading}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition"
                >
                  Salvar em Lote
                </button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="p-3 w-8">
                      <input
                        type="checkbox"
                        onChange={e => {
                          const checked = e.target.checked;
                          const map: Record<number, boolean> = {};
                          vendasPendentes.forEach(v => { map[v.id] = checked; });
                          setSelecionadosPendentes(map);
                        }}
                      />
                    </th>
                    <th className="p-3">Pedido</th>
                    <th className="p-3">Canal</th>
                    <th className="p-3">Produto</th>
                    <th className="p-3">SKU Atual</th>
                    <th className="p-3">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {vendasPendentes.map(v => (
                    <tr key={v.id} className="hover:bg-slate-800/40">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={!!selecionadosPendentes[v.id]}
                          onChange={e => setSelecionadosPendentes({ ...selecionadosPendentes, [v.id]: e.target.checked })}
                        />
                      </td>
                      <td className="p-3 text-slate-200">{v.id_pedido}</td>
                      <td className="p-3 text-indigo-400 font-sans">{v.canal}</td>
                      <td className="p-3 text-slate-300 font-sans truncate max-w-xs">{v.produto}</td>
                      <td className="p-3 text-amber-400">{v.sku || "sem-sku"}</td>
                      <td className="p-3">
                        <button
                          onClick={() => {
                            const n = prompt("Novo SKU:", v.sku);
                            if (n) salvarSkuPendente(v.id, n);
                          }}
                          className="text-[10px] text-sky-400 hover:underline uppercase font-sans font-bold"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {vendasPendentes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500 font-sans text-xs">
                        Nenhuma pendência encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}