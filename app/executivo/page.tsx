'use client';
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/app/components/Navbar';
import { avaliarFormulaPorUnidade as avaliarFormulaRepasse } from '@/lib/formulaRepasse';
import { DESCONTAR_FRETE_ADS_NO_LUCRO, mesDoEnvio } from '@/lib/regrasLucro';
import { criarRepasseReal } from '@/lib/repasseRealLogica';

const TABELAS_SUPABASE = [
  'vendas_canais',
  'faturados',
  'tarifas_site',
  'tabela_custos_skus',
  'config_regras_canais',
  'config_regras_tiny',
  'tb_metas',
  'devolucoes',
  'cancelados',
  'ads_faturamento_canal',
  'plp_pedidos',
  'repasses_pedidos',
  'usuarios_permissoes'
] as const;

const MESES_MAP: Record<string, string> = {
  '01': 'janeiro', '02': 'fevereiro', '03': 'março', '04': 'abril',
  '05': 'maio', '06': 'junho', '07': 'julho', '08': 'agosto',
  '09': 'setembro', '10': 'outubro', '11': 'novembro', '12': 'dezembro'
};

const OPCOES_MESES = [
  { valor: '01', nome: 'Janeiro' },
  { valor: '02', nome: 'Fevereiro' },
  { valor: '03', nome: 'Março' },
  { valor: '04', nome: 'Abril' },
  { valor: '05', nome: 'Maio' },
  { valor: '06', nome: 'Junho' },
  { valor: '07', nome: 'Julho' },
  { valor: '08', nome: 'Agosto' },
  { valor: '09', nome: 'Setembro' },
  { valor: '10', nome: 'Outubro' },
  { valor: '11', nome: 'Novembro' },
  { valor: '12', nome: 'Dezembro' }
];

export default function PainelExecutivoPage() {
  const [loading, setLoading] = useState(true);
  const [database, setDatabase] = useState<Record<string, any[]>>({});
  const [tarifasSiteMap, setTarifasSiteMap] = useState<Record<string, number>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  // Inicia sempre com o ano e mês atuais dinâmicos
  const now = new Date();
  const currentMonthDefault = now.toISOString().slice(0, 7); // ex: "2026-11"
  const [currentRefMonth, setCurrentRefMonth] = useState(currentMonthDefault);

  // Calcula dinamicamente o mês imediatamente anterior à competência selecionada
  const previousRefMonth = useMemo(() => {
    const [anoStr, mesStr] = currentRefMonth.split('-');
    const ano = parseInt(anoStr, 10);
    const mes = parseInt(mesStr, 10) - 1; // 0-indexed
    const d = new Date(ano, mes, 1);
    d.setMonth(d.getMonth() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  }, [currentRefMonth]);

  useEffect(() => {
    async function carregarDados() {
      setLoading(true);
      const resultado: Record<string, any[]> = {};
      await Promise.all(
        TABELAS_SUPABASE.map(async (tabela) => {
          let allRows: any[] = [];
          let from = 0;
          const step = 1000;
          let keep = true;
          while (keep) {
            const { data, error } = await supabase.from(tabela).select('*').range(from, from + step - 1);
            if (error || !data) break;
            allRows = [...allRows, ...data];
            from += step;
            if (data.length < step) keep = false;
          }
          resultado[tabela] = allRows;
        })
      );

      const mapaTarifas: Record<string, number> = {};
      (resultado.tarifas_site || []).forEach((t: any) => {
        const idPed = normalizarPedido(t.id_pedido);
        if (idPed) mapaTarifas[idPed] = parseCurrency(t.valor_tarifa);
      });
      setTarifasSiteMap(mapaTarifas);

      setDatabase(resultado);
      setLoading(false);
    }
    carregarDados();
  }, []);

  const normalizarTexto = (v: any) => 
    String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

  const normalizarSku = (v: any) => {
    if (v === null || v === undefined) return "";
    let s = String(v).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
    if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
    return s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  };

  const normalizarPedido = (v: any) => 
    String(v ?? '').trim().replace(/\.0$/, '').replace(/\s+/g, '').toLowerCase();

  // Verifica se o mes_referencia gravado no upload (ex: "outubro de 2026") pertence ao período filtrado
  const mesRefCorresponde = (valor: any, formatos: { iso: string; barra: string; extenso: string }) => {
    const v = String(valor || '').trim().toLowerCase();
    if (!v) return false;
    return v === formatos.iso || v === formatos.barra || v === formatos.extenso ||
      v.includes(formatos.iso) || v.includes(formatos.barra) || v.includes(formatos.extenso);
  };

  const isChannelFisico = (canalName: string) => {
    const nome = normalizarTexto(canalName);
    return nome.includes('clube') || nome.includes('loja') || nome.includes('paineiras') || nome.includes('hebraica');
  };

  const parseCurrency = (val: any): number => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;

    let s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{2}\/\d{2}\/\d{4}/.test(s)) return 0;

    s = s.replace(/[^\d.,-]/g, '');
    if (!s) return 0;

    const hasComma = s.includes(',');
    const hasDot = s.includes('.');

    if (hasComma && hasDot) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (hasComma && !hasDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (hasDot && !hasComma) {
      const parts = s.split('.');
      if (parts.length > 2) {
        s = s.replace(/\./g, '');
      }
    }

    const num = parseFloat(s);
    return isNaN(num) ? 0 : num;
  };


  const mesRefFormatos = useMemo(() => {
    const [ano, mes] = currentRefMonth.split('-');
    const nomeExtenso = MESES_MAP[mes] || 'outubro';
    return {
      iso: currentRefMonth,
      barra: `${mes}/${ano}`,
      extenso: `${nomeExtenso} de ${ano}`
    };
  }, [currentRefMonth]);

  const mesAntFormatos = useMemo(() => {
    const [ano, mes] = previousRefMonth.split('-');
    const nomeExtenso = MESES_MAP[mes] || 'setembro';
    return {
      iso: previousRefMonth,
      barra: `${mes}/${ano}`,
      extenso: `${nomeExtenso} de ${ano}`
    };
  }, [previousRefMonth]);

  const canaisOficiais = useMemo(() => {
    const mapa = new Map<string, string>();
    const adicionar = (nome: any) => {
      let limpo = String(nome || '').trim();
      if (!limpo) return;
      if (normalizarTexto(limpo).includes('mercado livre 3')) return;
      if (normalizarTexto(limpo).includes('magazine luiza')) limpo = 'Magalu';
      mapa.set(normalizarTexto(limpo), limpo);
    };
    (database.config_regras_canais || []).forEach((r: any) => adicionar(r.canal));
    ['Clube Hebraica', 'Clube Paineiras'].forEach(adicionar);
    return Array.from(mapa.values());
  }, [database.config_regras_canais]);

  const canonizarCanal = (nomeCanal: any) => {
    const limpo = String(nomeCanal || '').trim();
    const norm = normalizarTexto(limpo);
    if (norm.includes('magalu') || norm.includes('magazine luiza')) {
      const match = canaisOficiais.find(c => normalizarTexto(c).includes('magalu') || normalizarTexto(c).includes('magazine luiza'));
      if (match) return match;
    }
    const oficial = canaisOficiais.find(c => normalizarTexto(c) === norm);
    return oficial || limpo;
  };

  const channelRules = database.config_regras_canais || [];
  const sales = database.vendas_canais || [];
  // Repasse REAL do extrato do canal (hoje TikTok): vale no lugar da fórmula estimada
  const repasseRealDe = useMemo(() => criarRepasseReal(database.repasses_pedidos, sales), [database.repasses_pedidos, sales]);
  const products = database.tabela_custos_skus || [];
  const goals = database.tb_metas || [];
  const cancelados = database.cancelados || [];
  const users = database.usuarios_permissoes || [];

  const aliquotaImpostoGlobal = useMemo(() => {
    const cfg = (database.config_regras_tiny || []).find((c: any) => c.campo === 'imposto_global');
    return cfg && cfg.coluna ? parseCurrency(cfg.coluna) : 6.0;
  }, [database.config_regras_tiny]);

  const produtosCustoMap = useMemo(() => {
    const map = new Map();
    (products || []).forEach((p: any) => {
      const sNorm = normalizarSku(p.sku);
      if (sNorm) {
        map.set(sNorm, {
          custo_unitario: parseCurrency(p.custo_unitario || p.preco_custo || p.custo),
          custo_embalagem: parseCurrency(p.custo_embalagem)
        });
      }
    });
    return map;
  }, [products]);

  const faturadosMap = useMemo(() => {
    const map = new Map();
    (database.faturados || []).forEach((f: any) => {
      const idPed = normalizarPedido(f.id_pedido);
      if (idPed) {
        map.set(idPed, {
          data_faturamento: f.data_faturamento ? f.data_faturamento.slice(0, 10) : '',
          mes_referencia: String(f.mes_referencia || '').trim().toLowerCase()
        });
      }
    });
    return map;
  }, [database.faturados]);

  // Frete Flex (PLP): pertence ao mês de ENVIO (data_envio), não ao mês do faturamento.
  const flexRows = useMemo(() => {
    const porPedido = new Map<string, { ped: string; valor: number; mes: string; canal: string }>();
    (database.plp_pedidos || []).forEach((p: any) => {
      const idPed = normalizarPedido(p.numero_pedido ?? p.id_pedido);
      const vFrete = parseCurrency(p.valor_frete);
      if (!idPed || !(vFrete > 0)) return;
      porPedido.set(`${normalizarTexto(p.canal)}|${idPed}`, { ped: idPed, valor: vFrete, mes: mesDoEnvio(p.data_envio), canal: canonizarCanal(p.canal) });
    });
    return Array.from(porPedido.values());
  }, [database.plp_pedidos]);

  const adsMap = useMemo(() => {
    const map = new Map();
    (database.ads_faturamento_canal || []).forEach((a: any) => {
      const mesRefDb = String(a.mes_referencia || '').trim().toLowerCase();
      const matchPeriodo = 
        mesRefDb === mesRefFormatos.iso || 
        mesRefDb === mesRefFormatos.barra || 
        mesRefDb === mesRefFormatos.extenso;

      if (matchPeriodo) {
        const k = normalizarTexto(canonizarCanal(a.canal));
        map.set(k, parseCurrency(a.gasto_ads));
      }
    });
    return map;
  }, [database.ads_faturamento_canal, mesRefFormatos]);

  const activeCancelados = useMemo(() => {
    if (!cancelados) return [];
    return cancelados.filter((c: any) => {
      const mRef = String(c.mes_referencia || '').trim().toLowerCase();
      return mRef === mesRefFormatos.iso || mRef === mesRefFormatos.barra || mRef === mesRefFormatos.extenso;
    });
  }, [cancelados, mesRefFormatos]);

  const activeDevolucoes = useMemo(() => {
    const lista = database.devolucoes || [];
    return lista.filter((d: any) => {
      const dataDev = String(d.data_retorno || d.data || d.data_devolucao || '').trim();
      let mesDev = '';
      if (d.mes_referencia) {
        mesDev = String(d.mes_referencia).trim().toLowerCase();
      } else if (dataDev) {
        if (dataDev.includes('-')) mesDev = dataDev.slice(0, 7);
        else if (dataDev.includes('/')) {
          const parts = dataDev.split('/');
          if (parts.length === 3) mesDev = `${parts[2]}-${parts[1]}`;
        }
      }
      return mesDev === mesRefFormatos.iso || 
             mesDev === mesRefFormatos.barra || 
             mesDev.includes(mesRefFormatos.iso) || 
             mesDev.includes(mesRefFormatos.extenso);
    });
  }, [database.devolucoes, mesRefFormatos]);

  const enrichedSales = useMemo(() => {
    return (sales || []).map((s: any) => ({
      ...s,
      canal: canonizarCanal(s.canal)
    })).filter((s: any) => {
      if (!canaisOficiais.includes(s.canal)) return false;
      const fisico = isChannelFisico(s.canal);
      const ped = normalizarPedido(s.id_pedido);
      const fatInfo = faturadosMap.get(ped);

      if (!fisico) {
        if (!fatInfo) return false;
        const fatMesRef = fatInfo.mes_referencia.toLowerCase();
        const fatData = fatInfo.data_faturamento;

        const matchMes = fatData ? fatData.startsWith(mesRefFormatos.iso) : (
          fatMesRef.includes(mesRefFormatos.iso) ||
          fatMesRef.includes(mesRefFormatos.barra) ||
          fatMesRef.includes(mesRefFormatos.extenso));

        if (!matchMes) return false;
      } else {
        // Lojas físicas: só entram no mês em que o upload foi registrado
        if (!mesRefCorresponde(s.mes_referencia, mesRefFormatos)) return false;
      }
      return true;
    }).map((s: any) => {
      const qtd = parseCurrency(s.quantidade) || 1;
      const precoVenda = parseCurrency(s.preco_venda || s.valor);

      let custoCMV = 0;
      if (isChannelFisico(s.canal) && s.cmv_clube !== undefined && s.cmv_clube !== null) {
        custoCMV = parseCurrency(s.cmv_clube);
      } else {
        const skuVendaNorm = normalizarSku(s.sku);
        const custoProd = produtosCustoMap.get(skuVendaNorm) || { custo_unitario: 0, custo_embalagem: 0 };
        custoCMV = (custoProd.custo_unitario + custoProd.custo_embalagem) * qtd;
      }

      const ped = normalizarPedido(s.id_pedido);
      const ruleObj = channelRules.find((r: any) => normalizarTexto(canonizarCanal(r.canal)) === normalizarTexto(s.canal)) || {};
      let repasseLiquido = parseCurrency(s.repasse_liquido);

      if (ruleObj.formula_excel && ruleObj.formula_excel.trim()) {
        const colPdv = ruleObj.col_pdv || ruleObj.col_preco_venda || 'P';
        const colQtd = ruleObj.col_quantidade || 'O';
        const calculado = avaliarFormulaRepasse(ruleObj.formula_excel, precoVenda, qtd, colPdv, colQtd);
        if (calculado !== null) {
          repasseLiquido = calculado;
        }
      }

      if (isNaN(repasseLiquido) || repasseLiquido <= 0 || (precoVenda > 0 && repasseLiquido > precoVenda * qtd * 1.5)) {
        repasseLiquido = Math.max(0, (precoVenda * qtd) - ((precoVenda * qtd) * 0.16));
      }

      // Repasse real do extrato do canal (se foi enviado) vale no lugar da fórmula
      const repasseReal = repasseRealDe(s);
      if (repasseReal !== null) repasseLiquido = repasseReal;

      const nomeCanal = normalizarTexto(s.canal);
      if ((nomeCanal.includes('site') || nomeCanal.includes('loja virtual')) && tarifasSiteMap[ped]) {
         const taxaVindi = parseCurrency(tarifasSiteMap[ped]);
         repasseLiquido = Math.max(0, repasseLiquido - taxaVindi);
      }
      
      const fatInfo = faturadosMap.get(ped);

      return { 
        ...s, 
        preco_venda: precoVenda,
        custoCMV, 
        repasse_liquido: repasseLiquido,
        data_faturamento: fatInfo ? fatInfo.data_faturamento : (s.data_faturamento || '')
      };
    });
  }, [sales, mesRefFormatos, produtosCustoMap, tarifasSiteMap, faturadosMap, canaisOficiais, channelRules, repasseRealDe]);

  const previousMonthSales = useMemo(() => {
    return (sales || []).map((s: any) => ({
      ...s,
      canal: canonizarCanal(s.canal)
    })).filter((s: any) => {
      if (!canaisOficiais.includes(s.canal)) return false;
      const fisico = isChannelFisico(s.canal);
      const ped = normalizarPedido(s.id_pedido);
      const fatInfo = faturadosMap.get(ped);

      if (!fisico) {
        if (!fatInfo) return false;
        const fatMesRef = fatInfo.mes_referencia.toLowerCase();
        const fatData = fatInfo.data_faturamento;

        const matchMes = 
          fatMesRef.includes(mesAntFormatos.iso) ||
          fatMesRef.includes(mesAntFormatos.barra) ||
          fatMesRef.includes(mesAntFormatos.extenso) ||
          (fatData && fatData.startsWith(mesAntFormatos.iso));

        if (!matchMes) return false;
      } else {
        if (!mesRefCorresponde(s.mes_referencia, mesAntFormatos)) return false;
      }
      return true;
    });
  }, [sales, mesAntFormatos, faturadosMap, canaisOficiais]);

  // "Vendas do dia" = vendas do DIA ANTERIOR (o dia fechado). Independe do mês escolhido no filtro
  // (no dia 1º o dia anterior cai no mês passado).
  const ontem = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return {
      iso: `${yyyy}-${mm}-${dd}`,
      dia: d.getDate(),
      curto: `${dd}/${mm}`,
      completo: `${dd}/${mm}/${yyyy}`,
      mes: { iso: `${yyyy}-${mm}`, barra: `${mm}/${yyyy}`, extenso: `${MESES_MAP[mm] || ''} de ${yyyy}` },
    };
  }, []);

  // Vendas de ontem por canal.
  // - Marketplaces/Site: pela data de faturamento (tabela faturados) = ontem; pedidos cancelados ficam de fora.
  // - Lojas físicas (clubes): a planilha tem uma linha por dia e o upload guarda o número da linha no id
  //   (CLUBEHEBRAICA-<linha>). A primeira linha de dados é o dia 1, então dia = linha - primeira linha + 1.
  const vendasOntemPorCanal = useMemo(() => {
    const mapa = new Map<string, number>();
    const numeroDaLinha = (id: any) => {
      const m = String(id ?? '').match(/-(\d+)\s*$/);
      return m ? parseInt(m[1], 10) : null;
    };
    const pedidosCancelados = new Set<string>(
      (database.cancelados || []).map((c: any) => normalizarPedido(c.id_pedido)).filter(Boolean)
    );
    const primeiraLinha = new Map<string, number>();
    (sales || []).forEach((s: any) => {
      const canal = canonizarCanal(s.canal);
      if (!isChannelFisico(canal)) return;
      const n = numeroDaLinha(s.id_pedido);
      if (n !== null) primeiraLinha.set(canal, Math.min(primeiraLinha.get(canal) ?? Infinity, n));
    });
    (sales || []).forEach((s: any) => {
      const canal = canonizarCanal(s.canal);
      if (!canaisOficiais.includes(canal)) return;
      let doDia = false;
      if (isChannelFisico(canal)) {
        if (!mesRefCorresponde(s.mes_referencia, ontem.mes)) return;
        const n = numeroDaLinha(s.id_pedido);
        const base = primeiraLinha.get(canal);
        doDia = n !== null && base !== undefined && n - base + 1 === ontem.dia;
      } else {
        const ped = normalizarPedido(s.id_pedido);
        const fat = faturadosMap.get(ped);
        doDia = !!fat && fat.data_faturamento === ontem.iso && !pedidosCancelados.has(ped);
      }
      if (doDia) mapa.set(canal, (mapa.get(canal) || 0) + parseCurrency(s.preco_venda || s.valor));
    });
    return mapa;
  }, [sales, database.cancelados, faturadosMap, canaisOficiais, ontem]);

  const channelAnalytics = useMemo(() => {
    const [refAnoStr, refMesStr] = currentRefMonth.split('-');
    const refAno = parseInt(refAnoStr, 10);
    const refMes = parseInt(refMesStr, 10) - 1;
    const nowRef = new Date();
    const isCurrentMonth = (nowRef.getFullYear() === refAno && nowRef.getMonth() === refMes);
    const totalDiasMes = new Date(refAno, refMes + 1, 0).getDate();
    let diasPassados = isCurrentMonth ? Math.max(1, nowRef.getDate()) : totalDiasMes;

    return canaisOficiais.map(channelName => {
      const chSales = enrichedSales.filter((s: any) => s.canal === channelName);
      const prevChSales = previousMonthSales.filter((s: any) => s.canal === channelName);
      const fisico = isChannelFisico(channelName);

      const vendasDoDia = vendasOntemPorCanal.get(channelName) || 0;

      const ruleObj = channelRules.find((r: any) => normalizarTexto(r.canal) === normalizarTexto(channelName)) || {};
      const defaultMetaBruta = fisico ? 56.0 : 48.0;
      
      const goalObj = goals.find((g: any) => {
        const cNome = normalizarTexto(canonizarCanal(g.canal));
        const mMes = String(g.mes_referencia || '').trim().toLowerCase();
        return cNome === normalizarTexto(channelName) && (
          mMes === mesRefFormatos.iso ||
          mMes === mesRefFormatos.barra ||
          mMes === mesRefFormatos.extenso
        );
      }) || goals.find((g: any) => normalizarTexto(canonizarCanal(g.canal)) === normalizarTexto(channelName))
         || { meta_valor: 0, meta_margem_bruta: defaultMetaBruta, meta_margem_liq: 15, responsavel: ruleObj.responsavel || 'Equipe' };

      const cancelamentosMes = activeCancelados
        .filter((c: any) => canonizarCanal(c.canal) === channelName)
        .reduce((sum: number, c: any) => sum + parseCurrency(c.valor), 0);


      // ESTORNO INTEGRAL DOS CANCELADOS: além da receita (já abatida acima), saem junto o repasse
      // (taxas/comissões/frete), o CMV e o frete Flex da venda cancelada. Casa pelo id_pedido;
      // sem id_pedido, usa sku x quantidade da planilha de cancelamentos para estornar o custo.
      let estRepasseCanc = 0, estCmvCanc = 0;
      const pedidosCancelados = new Set<string>();
      const pedidosEstornados = new Set<string>();
      activeCancelados.forEach((c: any) => {
        if (canonizarCanal(c.canal) !== channelName) return;
        const ped = normalizarPedido(c.id_pedido);
        if (ped) pedidosCancelados.add(ped);
        const vendasDoPedido = ped ? chSales.filter((s: any) => normalizarPedido(s.id_pedido) === ped) : [];
        if (vendasDoPedido.length > 0) {
          if (pedidosEstornados.has(ped)) return;
          pedidosEstornados.add(ped);
          vendasDoPedido.forEach((s: any) => {
            estRepasseCanc += s.repasse_liquido || 0;
            estCmvCanc += s.custoCMV || 0;
          });
        } else if (c.sku) {
          const custoP = produtosCustoMap.get(normalizarSku(c.sku)) || { custo_unitario: 0, custo_embalagem: 0 };
          estCmvCanc += (custoP.custo_unitario + custoP.custo_embalagem) * (parseCurrency(c.quantidade) || 1);
        }
      });

      let devPdvBruto = 0;
      let devFreteLiquido = 0;
      let devRepasseLiquido = 0;
      let devCmvTotal = 0;

      activeDevolucoes.forEach((d: any) => {
        if (canonizarCanal(d.canal) === channelName) {
          const pdvVal = parseCurrency(d.pdv || d.valor);
          const freteVal = parseCurrency(d.custo_frete || d.frete);
          const qtdDev = parseCurrency(d.quantidade) || 1;
          
          devPdvBruto += pdvVal;
          devFreteLiquido += freteVal;
          
          let repDev = parseCurrency(d.repasse_liquido || d.repasse);

          if (ruleObj.formula_excel && ruleObj.formula_excel.trim()) {
            const colPdv = ruleObj.col_pdv || ruleObj.col_preco_venda || 'P';
            const colQtd = ruleObj.col_quantidade || 'O';
            const calcDev = avaliarFormulaRepasse(ruleObj.formula_excel, pdvVal, qtdDev, colPdv, colQtd);
            if (calcDev !== null) repDev = calcDev;
          }

          if (isNaN(repDev) || repDev <= 0 || (pdvVal > 0 && repDev > pdvVal * 1.5)) {
            repDev = Math.max(0, pdvVal - (pdvVal * 0.16));
          }
          devRepasseLiquido += repDev;

          const skuDev = normalizarSku(d.sku);
          const custoProd = produtosCustoMap.get(skuDev) || { custo_unitario: 0, custo_embalagem: 0 };
          devCmvTotal += (custoProd.custo_unitario + custoProd.custo_embalagem) * qtdDev;
        }
      });

      const faturadoBrutoPuro = chSales.reduce((sum: number, s: any) => sum + s.preco_venda, 0);
      const faturadoComRedutor = Math.max(0, faturadoBrutoPuro - devPdvBruto - cancelamentosMes);
      
      const repasseVendasCanal = chSales.reduce((sum: number, s: any) => sum + s.repasse_liquido, 0) - estRepasseCanc;
      const repasseTotal = Math.max(0, repasseVendasCanal - devRepasseLiquido);
      
      const canalAds = adsMap.get(normalizarTexto(channelName)) || 0;
      const cmvVendasCanal = chSales.reduce((sum: number, s: any) => sum + s.custoCMV, 0) - estCmvCanc;
      const cmvCanal = Math.max(0, cmvVendasCanal - devCmvTotal);
      const flexCanal = flexRows
        .filter((f) => f.mes === mesRefFormatos.iso && f.canal === channelName && !pedidosCancelados.has(f.ped))
        .reduce((sum, f) => sum + f.valor, 0);
      const impostoCanal = (faturadoComRedutor * aliquotaImpostoGlobal) / 100;

      const lucroLiquidoFinal = repasseTotal - cmvCanal - impostoCanal - (DESCONTAR_FRETE_ADS_NO_LUCRO ? flexCanal + canalAds + devFreteLiquido : 0);
      const metaBase = parseCurrency(goalObj.meta_valor);
      
      const projecaoFaturamento = isCurrentMonth ? (faturadoComRedutor / diasPassados) * totalDiasMes : faturadoComRedutor;
      const projecaoVsMeta = metaBase > 0 ? ((projecaoFaturamento / metaBase) - 1) * 100 : 0;

      const faturadoMesAnterior = prevChSales.reduce((sum: number, s: any) => sum + parseCurrency(s.preco_venda), 0);
      const projVsMesAnterior = faturadoMesAnterior > 0 ? ((faturadoComRedutor / faturadoMesAnterior) - 1) * 100 : 0;

      const margemBrutaAtingida = faturadoBrutoPuro > 0 ? (repasseTotal / faturadoBrutoPuro) * 100 : 0;
      const margemLiqAtingida = faturadoBrutoPuro > 0 ? (lucroLiquidoFinal / faturadoBrutoPuro) * 100 : 0;

      const metaMargemBruta = parseCurrency(goalObj.meta_margem_bruta || defaultMetaBruta);
      const metaMargemLiq = parseCurrency(goalObj.meta_margem_liq || 15);

      const diffMargemBruta = margemBrutaAtingida - metaMargemBruta;
      const diffMargemLiq = margemLiqAtingida - metaMargemLiq;

      return {
        canal: channelName,
        responsavel: ruleObj.responsavel || goalObj.responsavel || 'Equipe',
        vendasDoDia,
        faturadoComRedutor,
        metaValor: metaBase,
        projecaoFaturamento,
        projecaoVsMeta,
        faturadoMesAnterior,
        projVsMesAnterior,
        metaMargemBruta,
        margemBrutaAtingida,
        diffMargemBruta,
        metaMargemLiq,
        margemLiqAtingida,
        diffMargemLiq,
        isFisico: fisico,
        faturadoBrutoPuro,
        repasseTotal,
        lucroLiquidoFinal
      };
    });
  }, [enrichedSales, previousMonthSales, goals, adsMap, channelRules, currentRefMonth, mesRefFormatos, canaisOficiais, activeCancelados, activeDevolucoes, vendasOntemPorCanal, produtosCustoMap, aliquotaImpostoGlobal]);

  const ecommerceChannels = channelAnalytics.filter(c => !c.isFisico);
  const physicalChannels = channelAnalytics.filter(c => c.isFisico);

  const sumTotals = (channels: any[]) => {
    return channels.reduce((acc, curr) => ({
      vendasDoDia: acc.vendasDoDia + curr.vendasDoDia,
      faturadoComRedutor: acc.faturadoComRedutor + curr.faturadoComRedutor,
      metaValor: acc.metaValor + curr.metaValor,
      projecaoFaturamento: acc.projecaoFaturamento + curr.projecaoFaturamento,
      faturadoMesAnterior: acc.faturadoMesAnterior + curr.faturadoMesAnterior,
      faturadoBrutoPuro: acc.faturadoBrutoPuro + curr.faturadoBrutoPuro,
      repasseTotal: acc.repasseTotal + curr.repasseTotal,
      lucroLiquidoFinal: acc.lucroLiquidoFinal + curr.lucroLiquidoFinal,
      metaBrutaPonderada: acc.metaBrutaPonderada + (curr.metaMargemBruta * curr.metaValor),
      metaLiqPonderada: acc.metaLiqPonderada + (curr.metaMargemLiq * curr.metaValor),
    }), { 
      vendasDoDia: 0, faturadoComRedutor: 0, metaValor: 0, projecaoFaturamento: 0, faturadoMesAnterior: 0, 
      faturadoBrutoPuro: 0, repasseTotal: 0, lucroLiquidoFinal: 0, metaBrutaPonderada: 0, metaLiqPonderada: 0 
    });
  };

  const enrichTotals = (totals: any) => {
    const margemBrutaAtingida = totals.faturadoBrutoPuro > 0 ? (totals.repasseTotal / totals.faturadoBrutoPuro) * 100 : 0;
    const margemLiqAtingida = totals.faturadoBrutoPuro > 0 ? (totals.lucroLiquidoFinal / totals.faturadoBrutoPuro) * 100 : 0;
    const metaMargemBruta = totals.metaValor > 0 ? totals.metaBrutaPonderada / totals.metaValor : 0;
    const metaMargemLiq = totals.metaValor > 0 ? totals.metaLiqPonderada / totals.metaValor : 0;

    return {
      ...totals,
      margemBrutaAtingida,
      margemLiqAtingida,
      metaMargemBruta,
      metaMargemLiq,
      diffMargemBruta: margemBrutaAtingida - metaMargemBruta,
      diffMargemLiq: margemLiqAtingida - metaMargemLiq
    };
  };

  const totalEcomRaw = sumTotals(ecommerceChannels);
  const totalEcom = enrichTotals(totalEcomRaw);

  const totalFisicoRaw = sumTotals(physicalChannels);
  const totalFisico = enrichTotals(totalFisicoRaw);

  const totalGeralRaw = {
    vendasDoDia: totalEcomRaw.vendasDoDia + totalFisicoRaw.vendasDoDia,
    faturadoComRedutor: totalEcomRaw.faturadoComRedutor + totalFisicoRaw.faturadoComRedutor,
    metaValor: totalEcomRaw.metaValor + totalFisicoRaw.metaValor,
    projecaoFaturamento: totalEcomRaw.projecaoFaturamento + totalFisicoRaw.projecaoFaturamento,
    faturadoMesAnterior: totalEcomRaw.faturadoMesAnterior + totalFisicoRaw.faturadoMesAnterior,
    faturadoBrutoPuro: totalEcomRaw.faturadoBrutoPuro + totalFisicoRaw.faturadoBrutoPuro,
    repasseTotal: totalEcomRaw.repasseTotal + totalFisicoRaw.repasseTotal,
    lucroLiquidoFinal: totalEcomRaw.lucroLiquidoFinal + totalFisicoRaw.lucroLiquidoFinal,
    metaBrutaPonderada: totalEcomRaw.metaBrutaPonderada + totalFisicoRaw.metaBrutaPonderada,
    metaLiqPonderada: totalEcomRaw.metaLiqPonderada + totalFisicoRaw.metaLiqPonderada,
  };
  const totalGeral = enrichTotals(totalGeralRaw);

  const renderSetaVariacao = (val: number) => {
    if (val >= 0) {
      return <span className="text-emerald-400 font-bold inline-flex items-center gap-0.5">▲ +{val.toFixed(1)}%</span>;
    } else {
      return <span className="text-rose-400 font-bold inline-flex items-center gap-0.5">▼ {val.toFixed(1)}%</span>;
    }
  };

  const renderSetaDiferencaMargem = (diff: number) => {
    if (diff >= 0) {
      return <span className="text-emerald-400 font-bold inline-flex items-center gap-0.5">▲ +{diff.toFixed(1)}%</span>;
    } else {
      return <span className="text-rose-400 font-bold inline-flex items-center gap-0.5">▼ {diff.toFixed(1)}%</span>;
    }
  };

  const renderSetaTotal = (val: number) => {
    if (val >= 0) {
      return <span className="text-green-300 font-black inline-flex items-center gap-0.5">▲ +{val.toFixed(1)}%</span>;
    } else {
      return <span className="text-red-300 font-black inline-flex items-center gap-0.5">▼ {val.toFixed(1)}%</span>;
    }
  };

  const handleEnviarEmailComPrint = async () => {
    if (!tableRef.current) return;
    try {
      setIsProcessing(true);
      // @ts-ignore
      const htmlToImage = await import('html-to-image');
      const toBlob = htmlToImage.toBlob;
      
      const fullWidth = tableRef.current.scrollWidth;
      const fullHeight = tableRef.current.scrollHeight;

      const blob = await toBlob(tableRef.current, {
        backgroundColor: '#0f172a',
        width: fullWidth,
        height: fullHeight,
        style: {
          width: `${fullWidth}px`,
          maxWidth: 'none',
        },
        pixelRatio: 2
      });
      
      if (!blob) throw new Error('Falha ao gerar imagem.');
      
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      
      const emailsCadastrados = users && users.length > 0 
        ? users.map((u: any) => u.email || u.username).filter(Boolean).join(';') 
        : "gisele@usebestfit.com.br";
        
      const dataHoje = new Date().toLocaleDateString('pt-BR');
      const assunto = encodeURIComponent(`DASHBOARD EXECUTIVO DIARIO ${dataHoje} (${mesRefFormatos.extenso})`);
      
      const hebraicaObj = channelAnalytics.find(c => c.canal.toLowerCase().includes('hebraica')) || { faturadoComRedutor: 0, projecaoVsMeta: 0 };
      const paineirasObj = channelAnalytics.find(c => c.canal.toLowerCase().includes('paineiras')) || { faturadoComRedutor: 0, projecaoVsMeta: 0 };
      const ecomProjVsMeta = totalEcom.metaValor > 0 ? ((totalEcom.projecaoFaturamento / totalEcom.metaValor) - 1) * 100 : 0;

      const formatProjText = (val: number) => val >= 0 ? `+${val.toFixed(1)}%` : `${val.toFixed(1)}%`;

      let corpoTexto = `Olá, tudo bem? Segue resumo executivo das vendas das lojas físicas e online em ${dataHoje} (${mesRefFormatos.extenso}). A coluna "Vendas Dia Anterior" refere-se a ${ontem.completo}.\n\n`;
      corpoTexto += `Hebraica: R$ ${hebraicaObj.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Projeção: ${formatProjText(hebraicaObj.projecaoVsMeta)})\n`;
      corpoTexto += `Paineiras: R$ ${paineirasObj.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Projeção: ${formatProjText(paineirasObj.projecaoVsMeta)})\n`;
      corpoTexto += `E-commerce: R$ ${totalEcom.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Projeção: ${formatProjText(ecomProjVsMeta)})\n\n`;
      corpoTexto += `Imagem do Dash:\n\n\n`;
      corpoTexto += `Acesse o sistema para conferir a visão completa: https://dashboard-e-commerce-nine.vercel.app/executivo`;
      
      window.location.href = `mailto:${emailsCadastrados}?subject=${assunto}&body=${encodeURIComponent(corpoTexto)}`;
      alert('✅ Imagem capturada para a área de transferência! Cole com Ctrl + V no corpo do e-mail.');
    } catch (err: any) {
      alert(`Erro ao capturar print: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const [anoFiltro, mesFiltro] = currentRefMonth.split('-');

  const handleMudarMes = (novoMes: string) => {
    setCurrentRefMonth(`${anoFiltro}-${novoMes}`);
  };

  const handleMudarAno = (novoAno: string) => {
    setCurrentRefMonth(`${novoAno}-${mesFiltro}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090e] flex items-center justify-center text-slate-100">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-bold text-slate-400">Carregando Painel Executivo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07090e] p-6 text-slate-100 font-sans space-y-4 text-[10px]">
      
      {/* CABEÇALHO COM SELEÇÃO DINÂMICA DE MÊS */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-slate-900 px-4 py-3 rounded-xl border border-slate-800 gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <Navbar />
          <div>
            <h1 className="text-base font-black text-white tracking-tight">Painel Executivo Omnichannel</h1>
            <p className="text-[10px] text-slate-400">
              Competência ativa: <strong className="text-indigo-400 uppercase">{mesRefFormatos.extenso}</strong> | Data de referência: <span className="font-mono text-slate-300">{new Date().toLocaleDateString('pt-BR')}</span> | Vendas do dia anterior: <span className="font-mono text-slate-300">{ontem.completo}</span>
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* SELETOR DE MÊS E ANO */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-700">
            <span className="text-xs pl-2">📅</span>
            <select
              value={mesFiltro}
              onChange={(e) => handleMudarMes(e.target.value)}
              className="bg-transparent text-indigo-300 font-bold text-xs focus:outline-none pr-1 cursor-pointer"
            >
              {OPCOES_MESES.map((m) => (
                <option key={m.valor} value={m.valor} className="bg-slate-900 text-white">
                  {m.nome}
                </option>
              ))}
            </select>
            <select
              value={anoFiltro}
              onChange={(e) => handleMudarAno(e.target.value)}
              className="bg-transparent text-indigo-300 font-bold text-xs focus:outline-none pr-2 cursor-pointer border-l border-slate-800 pl-2"
            >
              {[2025, 2026, 2027].map((a) => (
                <option key={a} value={String(a)} className="bg-slate-900 text-white">
                  {a}
                </option>
              ))}
            </select>
          </div>

          <button 
            onClick={handleEnviarEmailComPrint} 
            disabled={isProcessing}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span>📸</span> {isProcessing ? 'Gerando Imagem...' : 'Copiar Print & Abrir E-mail'}
          </button>
        </div>
      </div>

      {/* TABELA PANORÂMICA */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-2xl p-1">
        <div className="overflow-x-auto">
          <table ref={tableRef} className="w-full text-left text-slate-200 border-collapse bg-slate-900">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[9px] font-bold border-b border-slate-800 tracking-tight">
              <tr>
                <th className="py-2.5 px-3 border-r border-slate-800 whitespace-nowrap">Canal / Resp.</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Vendas Dia Anterior <span className="font-mono text-slate-500">({ontem.curto})</span></th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Total Mês</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Meta Mês</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Projeção</th>
                <th className="py-2.5 px-3 text-center border-r border-slate-800 whitespace-nowrap">Proj x Meta</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Mês Ant. ({mesAntFormatos.barra})</th>
                <th className="py-2.5 px-3 text-center border-r border-slate-800 whitespace-nowrap">Proj x Ant.</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Meta Margem Bruta</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Margem Bruta Ating</th>
                <th className="py-2.5 px-3 text-center border-r border-slate-800 whitespace-nowrap">Margem Bruta x Ating</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Meta Margem Liq</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Margem Liq Ating</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Margem Liq x Ating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 font-medium">
              
              {/* BLOCO E-COMMERCE */}
              <tr className="bg-slate-950 font-black text-white text-[10px]">
                <td colSpan={14} className="py-2 px-3 text-indigo-400">
                  🌐 E-COMMERCE & MARKETPLACES
                </td>
              </tr>
              {ecommerceChannels.map((item: any, idx: number) => (
                <tr key={item.canal} className={`${idx % 2 === 0 ? 'bg-slate-900/50' : 'bg-slate-950/20'} hover:bg-slate-800/40 transition`}>
                  <td className="py-2 px-3 font-bold border-r border-slate-800/50 whitespace-nowrap">{item.canal} <span className="text-[9px] text-slate-400 font-normal">({item.responsavel})</span></td>
                  <td className="py-2 px-3 text-right font-mono text-slate-300 whitespace-nowrap">R$ {item.vendasDoDia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-2 px-3 text-right font-bold text-white whitespace-nowrap">R$ {item.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-400 whitespace-nowrap">R$ {item.metaValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-2 px-3 text-right font-bold text-indigo-300 whitespace-nowrap">R$ {item.projecaoFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-800/50 whitespace-nowrap">{renderSetaVariacao(item.projecaoVsMeta)}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-400 whitespace-nowrap">R$ {item.faturadoMesAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-800/50 whitespace-nowrap">{renderSetaVariacao(item.projVsMesAnterior)}</td>
                  <td className="py-2 px-3 text-center font-mono text-slate-300 whitespace-nowrap">{item.metaMargemBruta.toFixed(1)}%</td>
                  <td className="py-2 px-3 text-center font-mono text-slate-200 whitespace-nowrap">{item.margemBrutaAtingida.toFixed(1)}%</td>
                  <td className="py-2 px-3 text-center border-r border-slate-800/50 whitespace-nowrap">{renderSetaDiferencaMargem(item.diffMargemBruta)}</td>
                  <td className="py-2 px-3 text-center font-mono text-slate-300 whitespace-nowrap">{item.metaMargemLiq.toFixed(1)}%</td>
                  <td className="py-2 px-3 text-center font-mono text-slate-200 whitespace-nowrap">{item.margemLiqAtingida.toFixed(1)}%</td>
                  <td className="py-2 px-3 text-center whitespace-nowrap">{renderSetaDiferencaMargem(item.diffMargemLiq)}</td>
                </tr>
              ))}
              
              {/* SUB-TOTAL E-COMMERCE */}
              <tr className="bg-indigo-950/80 font-black text-white text-[10px] border-y-2 border-indigo-500 shadow-md">
                <td className="py-2 px-3 border-r border-indigo-500/50 whitespace-nowrap text-white">TOTAL E-COMMERCE</td>
                <td className="py-2 px-3 text-right font-mono text-white whitespace-nowrap">R$ {totalEcom.vendasDoDia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-2 px-3 text-right text-white whitespace-nowrap">R$ {totalEcom.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-2 px-3 text-right font-mono text-indigo-100 whitespace-nowrap">R$ {totalEcom.metaValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-2 px-3 text-right text-indigo-100 whitespace-nowrap">R$ {totalEcom.projecaoFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-2 px-3 text-center border-r border-indigo-500/50 whitespace-nowrap">{renderSetaTotal(totalEcom.metaValor > 0 ? ((totalEcom.projecaoFaturamento / totalEcom.metaValor) - 1) * 100 : 0)}</td>
                <td className="py-2 px-3 text-right font-mono text-indigo-100 whitespace-nowrap">R$ {totalEcom.faturadoMesAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-2 px-3 text-center border-r border-indigo-500/50 whitespace-nowrap">{renderSetaTotal(totalEcom.faturadoMesAnterior > 0 ? ((totalEcom.faturadoComRedutor / totalEcom.faturadoMesAnterior) - 1) * 100 : 0)}</td>
                <td className="py-2 px-3 text-center font-mono text-indigo-100 whitespace-nowrap">{totalEcom.metaMargemBruta.toFixed(1)}%</td>
                <td className="py-2 px-3 text-center font-mono text-indigo-100 whitespace-nowrap">{totalEcom.margemBrutaAtingida.toFixed(1)}%</td>
                <td className="py-2 px-3 text-center border-r border-indigo-500/50 whitespace-nowrap">{renderSetaTotal(totalEcom.diffMargemBruta)}</td>
                <td className="py-2 px-3 text-center font-mono text-indigo-100 whitespace-nowrap">{totalEcom.metaMargemLiq.toFixed(1)}%</td>
                <td className="py-2 px-3 text-center font-mono text-indigo-100 whitespace-nowrap">{totalEcom.margemLiqAtingida.toFixed(1)}%</td>
                <td className="py-2 px-3 text-center whitespace-nowrap">{renderSetaTotal(totalEcom.diffMargemLiq)}</td>
              </tr>

              {/* BLOCO LOJAS FÍSICAS */}
              <tr className="bg-slate-950 font-black text-white text-[10px]">
                <td colSpan={14} className="py-2 px-3 text-emerald-400 border-t border-slate-800">
                  🏬 LOJAS FÍSICAS
                </td>
              </tr>
              {physicalChannels.map((item: any, idx: number) => (
                <tr key={item.canal} className={`${idx % 2 === 0 ? 'bg-slate-900/50' : 'bg-slate-950/20'} hover:bg-slate-800/40 transition`}>
                  <td className="py-2 px-3 font-bold border-r border-slate-800/50 whitespace-nowrap">{item.canal} <span className="text-[9px] text-slate-400 font-normal">({item.responsavel})</span></td>
                  <td className="py-2 px-3 text-right font-mono text-slate-300 whitespace-nowrap">R$ {item.vendasDoDia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-2 px-3 text-right font-bold text-white whitespace-nowrap">R$ {item.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-400 whitespace-nowrap">R$ {item.metaValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-2 px-3 text-right font-bold text-emerald-300 whitespace-nowrap">R$ {item.projecaoFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-800/50 whitespace-nowrap">{renderSetaVariacao(item.projecaoVsMeta)}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-400 whitespace-nowrap">R$ {item.faturadoMesAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-800/50 whitespace-nowrap">{renderSetaVariacao(item.projVsMesAnterior)}</td>
                  <td className="py-2 px-3 text-center font-mono text-slate-300 whitespace-nowrap">{item.metaMargemBruta.toFixed(1)}%</td>
                  <td className="py-2 px-3 text-center font-mono text-slate-200 whitespace-nowrap">{item.margemBrutaAtingida.toFixed(1)}%</td>
                  <td className="py-2 px-3 text-center border-r border-slate-800/50 whitespace-nowrap">{renderSetaDiferencaMargem(item.diffMargemBruta)}</td>
                  <td className="py-2 px-3 text-center font-mono text-slate-500 whitespace-nowrap">-</td>
                  <td className="py-2 px-3 text-center font-mono text-slate-500 whitespace-nowrap">-</td>
                  <td className="py-2 px-3 text-center text-slate-500 whitespace-nowrap">-</td>
                </tr>
              ))}

              {/* SUB-TOTAL LOJAS FÍSICAS */}
              <tr className="bg-emerald-950/80 font-black text-white text-[10px] border-y-2 border-emerald-500 shadow-md">
                <td className="py-2 px-3 border-r border-emerald-500/50 whitespace-nowrap text-white">TOTAL LOJAS FÍSICAS</td>
                <td className="py-2 px-3 text-right font-mono text-white whitespace-nowrap">R$ {totalFisico.vendasDoDia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-2 px-3 text-right text-white whitespace-nowrap">R$ {totalFisico.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-2 px-3 text-right font-mono text-emerald-100 whitespace-nowrap">R$ {totalFisico.metaValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-2 px-3 text-right text-emerald-100 whitespace-nowrap">R$ {totalFisico.projecaoFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-2 px-3 text-center border-r border-emerald-500/50 whitespace-nowrap">{renderSetaTotal(totalFisico.metaValor > 0 ? ((totalFisico.projecaoFaturamento / totalFisico.metaValor) - 1) * 100 : 0)}</td>
                <td className="py-2 px-3 text-right font-mono text-emerald-100 whitespace-nowrap">R$ {totalFisico.faturadoMesAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-2 px-3 text-center border-r border-emerald-500/50 whitespace-nowrap">{renderSetaTotal(totalFisico.faturadoMesAnterior > 0 ? ((totalFisico.faturadoComRedutor / totalFisico.faturadoMesAnterior) - 1) * 100 : 0)}</td>
                <td className="py-2 px-3 text-center font-mono text-emerald-100 whitespace-nowrap">{totalFisico.metaMargemBruta.toFixed(1)}%</td>
                <td className="py-2 px-3 text-center font-mono text-emerald-100 whitespace-nowrap">{totalFisico.margemBrutaAtingida.toFixed(1)}%</td>
                <td className="py-2 px-3 text-center border-r border-emerald-500/50 whitespace-nowrap">{renderSetaTotal(totalFisico.diffMargemBruta)}</td>
                <td className="py-2 px-3 text-center text-emerald-200/50 whitespace-nowrap">-</td>
                <td className="py-2 px-3 text-center text-emerald-200/50 whitespace-nowrap">-</td>
                <td className="py-2 px-3 text-center text-emerald-200/50 whitespace-nowrap">-</td>
              </tr>

            </tbody>

            {/* TOTAL GERAL */}
            <tfoot className="bg-slate-950 text-white font-black text-[10px] border-t-2 border-slate-700 shadow-xl">
              <tr>
                <td className="py-3 px-3 border-r border-slate-700 whitespace-nowrap text-white">TOTAL GERAL</td>
                <td className="py-3 px-3 text-right font-mono text-emerald-400 whitespace-nowrap">R$ {totalGeral.vendasDoDia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-3 px-3 text-right text-white whitespace-nowrap">R$ {totalGeral.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-3 px-3 text-right font-mono text-slate-300 whitespace-nowrap">R$ {totalGeral.metaValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-3 px-3 text-right text-emerald-400 whitespace-nowrap">R$ {totalGeral.projecaoFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-3 px-3 text-center border-r border-slate-700 whitespace-nowrap">{renderSetaTotal(totalGeral.metaValor > 0 ? ((totalGeral.projecaoFaturamento / totalGeral.metaValor) - 1) * 100 : 0)}</td>
                <td className="py-3 px-3 text-right font-mono text-slate-300 whitespace-nowrap">R$ {totalGeral.faturadoMesAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-3 px-3 text-center border-r border-slate-700 whitespace-nowrap">{renderSetaTotal(totalGeral.faturadoMesAnterior > 0 ? ((totalGeral.faturadoComRedutor / totalGeral.faturadoMesAnterior) - 1) * 100 : 0)}</td>
                <td className="py-3 px-3 text-center font-mono text-slate-200 whitespace-nowrap">{totalGeral.metaMargemBruta.toFixed(1)}%</td>
                <td className="py-3 px-3 text-center font-mono text-slate-200 whitespace-nowrap">{totalGeral.margemBrutaAtingida.toFixed(1)}%</td>
                <td className="py-3 px-3 text-center border-r border-slate-700 whitespace-nowrap">{renderSetaTotal(totalGeral.diffMargemBruta)}</td>
                <td className="py-3 px-3 text-center font-mono text-slate-200 whitespace-nowrap">{totalGeral.metaMargemLiq.toFixed(1)}%</td>
                <td className="py-3 px-3 text-center font-mono text-slate-200 whitespace-nowrap">{totalGeral.margemLiqAtingida.toFixed(1)}%</td>
                <td className="py-3 px-3 text-center whitespace-nowrap">{renderSetaTotal(totalGeral.diffMargemLiq)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}