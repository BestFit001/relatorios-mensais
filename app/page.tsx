'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/app/components/Navbar';

/* =====================================================================
   DASHBOARD OMNICHANNEL — app/dashboard/page.tsx
   ===================================================================== */

const MODALIDADE_FRETE_DESCONTADO = 'flex';
const CANAIS_FISICOS_PADRAO = ['Clube Hebraica', 'Clube Paineiras'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const TABELAS = [
  'vendas_padrao_lancamentos',
  'faturados',
  'tabela_custos_skus',
  'config_regras_canais',
  'config_regras_tiny',
  'tb_metas',
  'devolucoes',
  'ads_faturamento_canal',
  'ads_campanhas_lancamentos',
  'plp_pedidos',
] as const;

/* ------------------------------ helpers ------------------------------ */
const norm = (v: any) =>
  String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const normPedido = (v: any) => String(v ?? '').trim().replace(/\.0$/, '').replace(/\s+/g, '').toLowerCase();
const pad = (n: number) => String(n).padStart(2, '0');
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const labelMes = (d: Date) => `${MESES[d.getMonth()]} de ${d.getFullYear()}`;
const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const num = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let s = String(val).trim().replace('R$', '').trim();
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
};

const isChannelFisico = (canal: string) => {
  const n = norm(canal);
  return n.includes('clube') || n.includes('loja') || n.includes('paineiras') || n.includes('hebraica');
};

const matchCanal = (canalNorm: string, filtro: string) => {
  if (filtro === 'TODOS') return true;
  if (filtro === 'ML_GERAL') return canalNorm.startsWith('mercado livre');
  return canalNorm === norm(filtro);
};

function parseData(v: any): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : isoLocal(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
    return !isNaN(d.getTime()) && isoLocal(d) === `${m[1]}-${m[2]}-${m[3]}` ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const iso = `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
    const d = new Date(`${iso}T00:00:00`);
    return !isNaN(d.getTime()) && isoLocal(d) === iso ? iso : null;
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function normalizarMesRef(v: any): string | null {
  const s = norm(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${pad(Number(m[1]))}/${m[2]}`;
  m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return `${pad(Number(m[2]))}/${m[1]}`;
  m = s.match(/^(\d{1,2})-(\d{4})$/);
  if (m) return `${pad(Number(m[1]))}/${m[2]}`;
  m = s.match(/^(\d{4})\/(\d{1,2})$/);
  if (m) return `${pad(Number(m[2]))}/${m[1]}`;
  const nomeMes = s.replace(/\s+de\s+\d{4}$/, '').trim();
  const idx = MESES.findIndex((mes) => norm(mes) === nomeMes);
  const ano = s.match(/(\d{4})/);
  if (idx >= 0 && ano) return `${pad(idx + 1)}/${ano[1]}`;
  return null;
}

function mesesDoPeriodo(ini: string, fim: string) {
  const out: { chave: string; fracao: number }[] = [];
  let [y, m] = ini.split('-').map(Number);
  const [yf, mf] = fim.split('-').map(Number);
  while (y < yf || (y === yf && m <= mf)) {
    const diasMes = new Date(y, m, 0).getDate();
    const mIni = `${y}-${pad(m)}-01`;
    const mFim = `${y}-${pad(m)}-${pad(diasMes)}`;
    const a = ini > mIni ? ini : mIni;
    const b = fim < mFim ? fim : mFim;
    const dias = Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000) + 1;
    out.push({ chave: `${pad(m)}/${y}`, fracao: Math.max(0, dias) / diasMes });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

async function buscarTudo(tabela: string): Promise<{ dados: any[]; erro: string | null }> {
  const passo = 1000;
  let from = 0;
  const acc: any[] = [];
  for (;;) {
    let { data, error } = await supabase.from(tabela).select('*').order('id', { ascending: true }).range(from, from + passo - 1);
    if (error) ({ data, error } = await supabase.from(tabela).select('*').range(from, from + passo - 1));
    if (error) return { dados: acc, erro: `${tabela}: ${error.message}` };
    if (!data || data.length === 0) break;
    acc.push(...data);
    if (data.length < passo) break;
    from += passo;
  }
  return { dados: acc, erro: null };
}

type Ctx = Record<string, number>;
type Node = (c: Ctx) => number;
type Formula = { fn: Node; refs: string[] };

function compilarFormula(src: any): Formula | null {
  const texto = String(src || '').trim().replace(/^=/, '');
  if (!texto) return null;
  const tokens = texto.match(/\d+(?:[.,]\d+)?|\$?[A-Za-z]{1,3}\$?\d*|[-+*/^()%]/g);
  if (!tokens || tokens.join('') !== texto.replace(/\s+/g, '')) return null;

  let i = 0;
  const refs: string[] = [];
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  const expr = (): Node => {
    let l = term();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const r = term();
      const a = l;
      l = op === '+' ? (c) => a(c) + r(c) : (c) => a(c) - r(c);
    }
    return l;
  };
  const term = (): Node => {
    let l = power();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const r = power();
      const a = l;
      l = op === '*' ? (c) => a(c) * r(c) : (c) => a(c) / r(c);
    }
    return l;
  };
  const power = (): Node => {
    const base = unary();
    if (peek() === '^') {
      next();
      const e = power();
      return (c) => Math.pow(base(c), e(c));
    }
    return base;
  };
  const unary = (): Node => {
    if (peek() === '-') { next(); const x = unary(); return (c) => -x(c); }
    if (peek() === '+') { next(); return unary(); }
    return postfix();
  };
  const postfix = (): Node => {
    let n = primary();
    while (peek() === '%') { next(); const a = n; n = (c) => a(c) / 100; }
    return n;
  };
  const primary = (): Node => {
    const t = next();
    if (t === undefined) throw new Error('fim inesperado');
    if (t === '(') {
      const e = expr();
      if (next() !== ')') throw new Error('parêntese');
      return e;
    }
    if (/^\d/.test(t)) { const v = Number(t.replace(',', '.')); return () => v; }
    if (/^\$?[A-Za-z]/.test(t)) {
      if (peek() === '(') throw new Error('função não suportada');
      const col = t.replace(/[^A-Za-z]/g, '').toUpperCase();
      refs.push(col);
      return (c) => c[col];
    }
    throw new Error('token inválido');
  };

  try {
    const root = expr();
    if (i !== tokens.length) return null;
    return { fn: root, refs };
  } catch {
    return null;
  }
}

type RegraCanal = { formula: Formula | null; colPdv: string; colQtd: string; ok: boolean; responsavel: string; logo: string | null };

type Metricas = {
  canal: string; canalNorm: string; isFisico: boolean; responsavel: string; logoUrl: string | null;
  metaValor: number; vendasDoDia: number;
  bruto: number; devBruto: number; fatBruto: number;
  liqVendas: number; devLiq: number; freteDevolucao: number; fatLiquidoAntesDeducoes: number; fatLiquido: number;
  cmv: number; ads: number; flex: number; lucro: number; margemPct: number;
  progressoMetaPct: number; valorFaltante: number; mediaDiariaNecessaria: number; projecao: number;
  itens: number;
};

const somar = (lista: Metricas[]) =>
  lista.reduce(
    (a, c) => ({
      metaValor: a.metaValor + c.metaValor, vendasDoDia: a.vendasDoDia + c.vendasDoDia,
      bruto: a.bruto + c.bruto, devBruto: a.devBruto + c.devBruto, fatBruto: a.fatBruto + c.fatBruto,
      liqVendas: a.liqVendas + c.liqVendas, devLiq: a.devLiq + c.devLiq, freteDevolucao: a.freteDevolucao + c.freteDevolucao,
      fatLiquidoAntesDeducoes: a.fatLiquidoAntesDeducoes + c.fatLiquidoAntesDeducoes, fatLiquido: a.fatLiquido + c.fatLiquido,
      cmv: a.cmv + c.cmv, ads: a.ads + c.ads, flex: a.flex + c.flex, lucro: a.lucro + c.lucro,
      projecao: a.projecao + c.projecao, itens: a.itens + c.itens,
    }),
    { metaValor: 0, vendasDoDia: 0, bruto: 0, devBruto: 0, fatBruto: 0, liqVendas: 0, devLiq: 0, freteDevolucao: 0, fatLiquidoAntesDeducoes: 0, fatLiquido: 0, cmv: 0, ads: 0, flex: 0, lucro: 0, projecao: 0, itens: 0 }
  );

/* ================================ página ================================ */
export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [db, setDb] = useState<Record<string, any[]>>({});
  const [erros, setErros] = useState<string[]>([]);

  const [selectedChannelFilter, setSelectedChannelFilter] = useState('TODOS');
  const [appliedChannelFilter, setAppliedChannelFilter] = useState('TODOS');
  const [modalidadeFilter, setModalidadeFilter] = useState('TODAS');
  const [appliedModalidadeFilter, setAppliedModalidadeFilter] = useState('TODAS');
  const [viewMode, setViewMode] = useState<'cards' | 'linhas'>('cards');

  const hojeIso = isoLocal(new Date());
  const inicioMesIso = hojeIso.slice(0, 8) + '01';
  const [dateFilter, setDateFilter] = useState('MES_ATUAL');
  const [customStartDate, setCustomStartDate] = useState(inicioMesIso);
  const [customEndDate, setCustomEndDate] = useState(hojeIso);
  const [appliedDateFilter, setAppliedDateFilter] = useState('MES_ATUAL');
  const [appliedStartDate, setAppliedStartDate] = useState(inicioMesIso);
  const [appliedEndDate, setAppliedEndDate] = useState(hojeIso);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const carregarDados = async () => {
    const resultados = await Promise.all(TABELAS.map((t) => buscarTudo(t)));
    const novo: Record<string, any[]> = {};
    const falhas: string[] = [];
    resultados.forEach((r, idx) => {
      novo[TABELAS[idx]] = r.dados;
      if (r.erro) falhas.push(r.erro);
    });
    setDb(novo);
    setErros(falhas);
  };

  useEffect(() => {
    let ativo = true;
    (async () => {
      setLoading(true);
      try { await carregarDados(); }
      catch (e) { setErros([`Falha inesperada ao carregar dados: ${e instanceof Error ? e.message : String(e)}`]); }
      finally { if (ativo) setLoading(false); }
    })();
    return () => { ativo = false; };
  }, []);

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    setAppliedChannelFilter(selectedChannelFilter);
    setAppliedModalidadeFilter(modalidadeFilter);
    setAppliedDateFilter(dateFilter);
    setAppliedStartDate(customStartDate);
    setAppliedEndDate(customEndDate);
    try { await carregarDados(); }
    catch (e) { setErros((atual) => [...atual, `Falha ao atualizar dados: ${e instanceof Error ? e.message : String(e)}`]); }
    finally { setIsRecalculating(false); }
  };

  /* ------------------------------ período ------------------------------ */
  const periodo = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const addDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const iniMes = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
    const fimMes = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
    let ini: Date;
    let fim: Date;
    let modoMes = false;
    switch (appliedDateFilter) {
      case 'MES_ANTERIOR': {
        const ref = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        ini = iniMes(ref); fim = fimMes(ref); modoMes = true; break;
      }
      case 'HOJE': ini = hoje; fim = hoje; break;
      case 'SEMANA': ini = addDias(hoje, -6); fim = hoje; break;
      case 'QUINZENA': ini = addDias(hoje, -14); fim = hoje; break;
      case 'PERSONALIZADO':
        ini = new Date((appliedStartDate || isoLocal(hoje)) + 'T00:00:00');
        fim = new Date((appliedEndDate || isoLocal(hoje)) + 'T00:00:00');
        if (ini > fim) { const tmp = ini; ini = fim; fim = tmp; }
        break;
      default: ini = iniMes(hoje); fim = hoje; modoMes = true;
    }
    const ontem = addDias(hoje, -1);
    return {
      ini: isoLocal(ini), fim: isoLocal(fim), modoMes,
      mesLabel: labelMes(fim),
      isMesAtual: appliedDateFilter === 'MES_ATUAL',
      diasPassados: Math.max(1, hoje.getDate()),
      totalDiasMes: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate(),
      ontemIso: isoLocal(ontem),
      ontemDia: pad(ontem.getDate()),
    };
  }, [appliedDateFilter, appliedStartDate, appliedEndDate]);

  /* --------------------------- regras por canal --------------------------- */
  const regrasPorCanal = useMemo(() => {
    const m = new Map<string, RegraCanal>();
    (db.config_regras_canais || []).forEach((r: any) => {
      const colPdv = String(r.col_pdv || r.col_preco_venda || 'D').toUpperCase();
      const colQtd = String(r.col_quantidade || 'G').toUpperCase();
      const formula = compilarFormula(r.formula_excel);
      const ok = !!formula && formula.refs.every((c) => c === colPdv || c === colQtd);
      m.set(norm(r.canal), { formula, colPdv, colQtd, ok, responsavel: r.responsavel || '', logo: r.logo_url || null });
    });
    return m;
  }, [db.config_regras_canais]);

  const calcularLinha = (canal: string, valor: number, qtd: number, liquidoFallback?: number) => {
    const r = regrasPorCanal.get(norm(canal));
    const unitario = !!(r && r.ok && r.formula && r.formula.refs.includes(r.colQtd));
    const bruto = unitario ? valor * qtd : valor;
    if (r && r.ok && r.formula) {
      const liq = r.formula.fn({ [r.colPdv]: valor, [r.colQtd]: qtd });
      if (Number.isFinite(liq)) return { bruto, liquido: liq, comRegra: true };
    }
    const fallbackValido = liquidoFallback !== undefined && liquidoFallback !== null && Number.isFinite(liquidoFallback);
    return { bruto, liquido: fallbackValido ? liquidoFallback : bruto, comRegra: false };
  };

  /* ------------------------------- vendas ------------------------------- */
  const dataPorPedido = useMemo(() => {
    const m = new Map<string, string>();
    (db.faturados || []).forEach((f: any) => {
      const k = normPedido(f.id_pedido);
      const d = parseData(f.data_faturamento);
      if (k && d) m.set(k, d);
    });
    return m;
  }, [db.faturados]);

  const custosMap = useMemo(() => {
    const m = new Map<string, number>();
    (db.tabela_custos_skus || []).forEach((c: any) => {
      const k = norm(c.sku);
      if (k) m.set(k, num(c.custo_unitario ?? c.custo));
    });
    return m;
  }, [db.tabela_custos_skus]);

  const passaFiltros = (canal: string) => {
    if (!matchCanal(norm(canal), appliedChannelFilter)) return false;
    const fisico = isChannelFisico(canal);
    if (appliedModalidadeFilter === 'FISICO' && !fisico) return false;
    if (appliedModalidadeFilter === 'DIGITAL' && fisico) return false;
    return true;
  };

  const vendasPeriodo = useMemo(() => {
    const out: any[] = [];
    for (const s of db.vendas_padrao_lancamentos || []) {
      if (!passaFiltros(s.canal)) continue;
      const pedido = normPedido(s.id_pedido);
      const data = dataPorPedido.get(pedido) || null;

      let dentro: boolean;
      if (periodo.modoMes && s.mes_referencia) {
        const mesRegistro = normalizarMesRef(s.mes_referencia);
        const mesPeriodo = `${pad(Number(periodo.ini.slice(5, 7)))}/${periodo.ini.slice(0, 4)}`;
        dentro = mesRegistro
          ? mesRegistro === mesPeriodo && (!data || (data >= periodo.ini && data <= periodo.fim))
          : !!data && data >= periodo.ini && data <= periodo.fim;
      } else dentro = !!data && data >= periodo.ini && data <= periodo.fim;
      if (!dentro) continue;

      const qtd = num(s.quantidade) || 1;
      const valor = num(s.valor ?? s.preco_venda);
      const repasseRaw = s.repasse_liquido ?? s.repasse;
      const repasseFallback = repasseRaw === null || repasseRaw === undefined || repasseRaw === '' ? undefined : num(repasseRaw);
      const { bruto, liquido, comRegra } = calcularLinha(s.canal, valor, qtd, repasseFallback);
      const k = norm(s.sku);
      const custoUni = custosMap.get(k) ?? 0;
      out.push({ canal: s.canal, canalNorm: norm(s.canal), pedido, data, bruto, liquido, comRegra, cmv: custoUni * qtd, semCusto: custoUni <= 0, sku: k });
    }
    return out;
  }, [db.vendas_padrao_lancamentos, dataPorPedido, custosMap, regrasPorCanal, periodo, appliedChannelFilter, appliedModalidadeFilter]);

  /* --------------------------- frete FLEX (PLP) --------------------------- */
  const flex = useMemo(() => {
    const porPedido = new Map<string, { valor: number; canal: string; data: string | null }>();
    (db.plp_pedidos || []).forEach((p: any) => {
      if (norm(p.modalidade) !== MODALIDADE_FRETE_DESCONTADO) return;
      const k = normPedido(p.numero_pedido ?? p.id_pedido ?? p.pedido);
      if (k && !porPedido.has(k)) porPedido.set(k, { valor: num(p.valor_frete), canal: p.canal, data: parseData(p.data_envio) });
    });

    const porCanal = new Map<string, number>();
    const usados = new Set<string>();
    vendasPeriodo.forEach((v) => {
      const f = porPedido.get(v.pedido);
      if (!f || usados.has(v.pedido)) return;
      usados.add(v.pedido);
      porCanal.set(v.canalNorm, (porCanal.get(v.canalNorm) || 0) + f.valor);
    });

    let semVendaQtd = 0;
    let semVendaValor = 0;
    porPedido.forEach((f, k) => {
      if (usados.has(k) || !f.data || f.data < periodo.ini || f.data > periodo.fim) return;
      if (!passaFiltros(f.canal)) return;
      semVendaQtd++;
      semVendaValor += f.valor;
    });
    return { porCanal, semVendaQtd, semVendaValor };
  }, [db.plp_pedidos, vendasPeriodo, periodo, appliedChannelFilter, appliedModalidadeFilter]);

  /* ------------------------------ devoluções ------------------------------ */
  const devolucoes = useMemo(() => {
    const m = new Map<string, { bruto: number; liquido: number; freteDevolucao: number }>();
    (db.devolucoes || []).forEach((d: any) => {
      if (norm(d.solicitacao).includes('troca')) return;
      if (!d.canal || !passaFiltros(d.canal)) return;
      const data = parseData(d.data_retorno);
      if (!data || data < periodo.ini || data > periodo.fim) return;
      const qtd = Math.max(1, num(d.quantidade) || 1);
      const { bruto, liquido } = calcularLinha(d.canal, num(d.pdv), qtd);
      const freteRev = num(d.custo_frete ?? d.frete);
      const k = norm(d.canal);
      const atual = m.get(k) || { bruto: 0, liquido: 0, freteDevolucao: 0 };
      m.set(k, {
        bruto: atual.bruto + bruto,
        liquido: atual.liquido + liquido,
        freteDevolucao: atual.freteDevolucao + freteRev
      });
    });
    return m;
  }, [db.devolucoes, regrasPorCanal, periodo, appliedChannelFilter, appliedModalidadeFilter]);

  /* ---------------------------------- Ads ---------------------------------- */
  const adsPorCanal = useMemo(() => {
    const gasto = new Map<string, number>();
    const invest = new Map<string, number>();
    (db.ads_faturamento_canal || []).forEach((a: any) => {
      const mes = normalizarMesRef(a.mes_referencia);
      if (!mes) return;
      const k = `${norm(a.canal)}|${mes}`;
      gasto.set(k, (gasto.get(k) || 0) + num(a.gasto_ads));
    });
    (db.ads_campanhas_lancamentos || []).forEach((a: any) => {
      const mes = normalizarMesRef(a.mes_referencia);
      if (!mes) return;
      const k = `${norm(a.canal)}|${mes}`;
      invest.set(k, (invest.get(k) || 0) + num(a.investimento));
    });
    const canais = new Set<string>();
    [...gasto.keys(), ...invest.keys()].forEach((k) => canais.add(k.split('|')[0]));

    const meses = mesesDoPeriodo(periodo.ini, periodo.fim);
    const out = new Map<string, number>();
    canais.forEach((c) => {
      let total = 0;
      meses.forEach(({ chave, fracao }) => {
        const chaveMes = `${c}|${chave}`;
        const valorMes = gasto.has(chaveMes) ? (gasto.get(chaveMes) || 0) : (invest.get(chaveMes) || 0);
        total += valorMes * (periodo.isMesAtual ? 1 : fracao);
      });
      out.set(c, total);
    });
    return out;
  }, [db.ads_faturamento_canal, db.ads_campanhas_lancamentos, periodo]);

  /* -------------------------------- canais -------------------------------- */
  const canaisLista = useMemo(() => {
    const mapa = new Map<string, string>();
    const add = (n: any) => { const k = norm(n); if (k && !mapa.has(k)) mapa.set(k, String(n).trim()); };
    (db.config_regras_canais || []).forEach((r: any) => add(r.canal));
    const cfg = (db.config_regras_tiny || []).find((t: any) => t.campo === 'canais_dashboard');
    if (cfg?.coluna) {
      try { const p = JSON.parse(cfg.coluna); if (Array.isArray(p)) p.forEach(add); } catch {}
    }
    CANAIS_FISICOS_PADRAO.forEach(add);
    (db.vendas_padrao_lancamentos || []).forEach((r: any) => add(r.canal));
    (db.devolucoes || []).forEach((r: any) => add(r.canal));
    (db.ads_faturamento_canal || []).forEach((r: any) => add(r.canal));
    (db.ads_campanhas_lancamentos || []).forEach((r: any) => add(r.canal));
    (db.plp_pedidos || []).forEach((r: any) => add(r.canal));
    return Array.from(mapa.values());
  }, [db.config_regras_tiny, db.config_regras_canais, db.vendas_padrao_lancamentos, db.devolucoes, db.ads_faturamento_canal, db.ads_campanhas_lancamentos, db.plp_pedidos]);

  /* ------------------------------ métricas ------------------------------ */
  const channelAnalytics = useMemo(() => {
    const porCanal = new Map<string, any[]>();
    vendasPeriodo.forEach((v) => {
      const arr = porCanal.get(v.canalNorm) || [];
      arr.push(v);
      porCanal.set(v.canalNorm, arr);
    });
    const metas: any[] = db.tb_metas || [];

    return canaisLista
      .filter((c) => passaFiltros(c))
      .sort((a, b) => {
        const fa = isChannelFisico(a), fb = isChannelFisico(b);
        return fa === fb ? 0 : fa ? -1 : 1;
      })
      .map((canal): Metricas => {
        const k = norm(canal);
        const vs = porCanal.get(k) || [];
        const regra = regrasPorCanal.get(k);
        const dev = devolucoes.get(k) || { bruto: 0, liquido: 0, freteDevolucao: 0 };

        const bruto = vs.reduce((s, v) => s + v.bruto, 0);
        const liqVendas = vs.reduce((s, v) => s + v.liquido, 0);
        const cmv = vs.reduce((s, v) => s + v.cmv, 0);
        const vendasDoDia = vs.filter((v) => v.data === periodo.ontemIso).reduce((s, v) => s + v.bruto, 0);
        const fatBruto = bruto - dev.bruto;
        
        const fatLiquidoAntesDeducoes = liqVendas - dev.liquido;
        const ads = adsPorCanal.get(k) || 0;
        const fl = flex.porCanal.get(k) || 0;
        const fatLiquido = fatLiquidoAntesDeducoes - dev.freteDevolucao - ads - fl;
        const lucro = fatLiquido - cmv;

        const mesAlvoMeta = `${pad(Number(periodo.ini.slice(5, 7)))}/${periodo.ini.slice(0, 4)}`;
        const metaObj = metas.find((g) => norm(g.canal) === k && normalizarMesRef(g.mes_referencia) === mesAlvoMeta) || metas.find((g) => norm(g.canal) === k && !normalizarMesRef(g.mes_referencia));
        const metaValor = num(metaObj?.meta_valor);
        const valorFaltante = Math.max(0, metaValor - fatBruto);
        const projecao = periodo.isMesAtual ? (fatBruto / periodo.diasPassados) * periodo.totalDiasMes : fatBruto;
        const diasRestantes = Math.max(1, periodo.totalDiasMes - periodo.diasPassados);

        return {
          canal, canalNorm: k, isFisico: isChannelFisico(canal),
          responsavel: regra?.responsavel || metaObj?.responsavel || 'Equipe Best Fit',
          logoUrl: regra?.logo || null,
          metaValor, vendasDoDia, bruto, devBruto: dev.bruto, fatBruto, liqVendas, devLiq: dev.liquido, freteDevolucao: dev.freteDevolucao, fatLiquidoAntesDeducoes, fatLiquido,
          cmv, ads, flex: fl, lucro,
          margemPct: fatBruto > 0 ? (lucro / fatBruto) * 100 : 0,
          progressoMetaPct: metaValor > 0 ? (fatBruto / metaValor) * 100 : 0,
          valorFaltante,
          mediaDiariaNecessaria: periodo.isMesAtual && valorFaltante > 0 ? valorFaltante / diasRestantes : 0,
          projecao, itens: vs.length,
        };
      });
  }, [canaisLista, vendasPeriodo, devolucoes, adsPorCanal, flex, regrasPorCanal, db.tb_metas, periodo, appliedChannelFilter, appliedModalidadeFilter]);

  const ecommerce = useMemo(() => channelAnalytics.filter((c) => !c.isFisico), [channelAnalytics]);
  const fisicas = useMemo(() => channelAnalytics.filter((c) => c.isFisico), [channelAnalytics]);
  const totE = useMemo(() => somar(ecommerce), [ecommerce]);
  const totF = useMemo(() => somar(fisicas), [fisicas]);
  const totG = useMemo(() => somar(channelAnalytics), [channelAnalytics]);

  const progressoDigital = totE.metaValor > 0 ? (totE.fatBruto / totE.metaValor) * 100 : 0;

  const avisos = useMemo(() => {
    const lista: string[] = [];
    const semRegra = new Map<string, number>();
    vendasPeriodo.filter((v) => !v.comRegra).forEach((v) => semRegra.set(v.canal, (semRegra.get(v.canal) || 0) + 1));
    if (semRegra.size > 0) {
      lista.push(`Sem fórmula válida em "Configurando Canal": ${Array.from(semRegra.entries()).map(([c, n]) => `${c} (${n} itens)`).join(', ')}.`);
    }
    const skusSemCusto = new Set(vendasPeriodo.filter((v) => v.semCusto).map((v) => v.sku));
    if (skusSemCusto.size > 0) lista.push(`${skusSemCusto.size} SKUs vendidos sem custo cadastrado.`);
    return lista;
  }, [vendasPeriodo]);

  const handleEnviarEmailAlerta = () => {
    const email = 'gisele@usebestfit.com.br';
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const assunto = encodeURIComponent(`📊 Resumo de Vendas - Lojas Físicas e Online (${dataHoje})`);
    const linhaLoja = (nome: string) => {
      const c = channelAnalytics.find((x) => norm(x.canal).includes(nome));
      return `${nome.charAt(0).toUpperCase() + nome.slice(1)}: R$ ${brl(c?.fatBruto || 0)} (${(c?.progressoMetaPct || 0).toFixed(1)}% da meta)\n`;
    };
    let corpo = `Olá, tudo bem? Segue resumo executivo do período ${periodo.ini} a ${periodo.fim}.\n\n`;
    corpo += linhaLoja('hebraica') + linhaLoja('paineiras');
    corpo += `E-commerce: R$ ${brl(totE.fatBruto)} (${progressoDigital.toFixed(1)}% da meta)\n\n`;
    corpo += `Caso queiram visualiza-lo, acessem o link a seguir: https://dashboard-e-commerce-nine.vercel.app/\n`;
    window.location.href = `mailto:${email}?subject=${assunto}&body=${encodeURIComponent(corpo)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090e] p-8 text-slate-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-slate-400">Carregando dados do Supabase...</p>
        </div>
      </div>
    );
  }

  const dash = (v: number) => (v > 0 ? `− R$ ${brl(v)}` : `R$ ${brl(0)}`);

  const BlocoModalidade = ({ fisico, digital, cor = 'text-slate-200' }: { fisico: number; digital: number; cor?: string }) => (
    <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
      <div>
        <span className="block text-[9px] text-emerald-400 font-bold uppercase mb-1">Lojas Físicas</span>
        <span className={`text-xs font-bold block ${cor}`}>R$ {brl(fisico)}</span>
      </div>
      <div className="pt-2 border-t border-slate-800/50">
        <span className="block text-[9px] text-blue-400 font-bold uppercase mb-0.5">E-commerce</span>
        <span className={`text-xs font-bold block ${cor}`}>R$ {brl(digital)}</span>
      </div>
    </div>
  );

  const Deducao = ({ rotulo, valor }: { rotulo: string; valor: number }) => (
    <div className="flex justify-between text-[10px] text-slate-400">
      <span>{rotulo}</span>
      <span className={valor > 0 ? 'text-rose-400 font-bold' : ''}>{dash(valor)}</span>
    </div>
  );

  const LinhaTabela = ({ item, cor }: { item: Metricas; cor: string }) => (
    <tr className="hover:bg-slate-900/60 transition border-b border-slate-800/50">
      <td className="py-3.5 px-6">
        <span className="block font-bold text-white">{item.canal}</span>
        <span className="text-[10px] text-slate-400">{item.responsavel}</span>
      </td>
      <td className="py-3.5 px-4 text-right font-mono text-slate-300">R$ {brl(item.vendasDoDia)}</td>
      <td className="py-3.5 px-4 text-right font-bold text-white">R$ {brl(item.fatBruto)}</td>
      <td className="py-3.5 px-4 text-right font-bold text-purple-300">R$ {brl(item.fatLiquido)}</td>
      <td className="py-3.5 px-4 text-right text-rose-300">R$ {brl(item.ads)}</td>
      <td className="py-3.5 px-4 text-right text-rose-300">R$ {brl(item.flex)}</td>
      <td className={`py-3.5 px-4 text-right font-bold ${item.lucro >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>R$ {brl(item.lucro)}</td>
      <td className="py-3.5 px-4 text-right font-mono text-slate-400">R$ {brl(item.metaValor)}</td>
      <td className={`py-3.5 px-4 text-center font-black ${item.progressoMetaPct >= 100 ? 'text-emerald-400' : cor}`}>{item.progressoMetaPct.toFixed(1)}%</td>
      <td className="py-3.5 px-6 text-right font-black text-emerald-400">{item.margemPct.toFixed(1)}%</td>
    </tr>
  );

  const TotalTabela = ({ titulo, t, cor }: { titulo: string; t: ReturnType<typeof somar>; cor: string }) => (
    <tr className="bg-slate-950 font-black border-b border-slate-800">
      <td className={`py-3 px-6 ${cor}`}>{titulo}</td>
      <td className={`py-3 px-4 text-right font-mono ${cor}`}>R$ {brl(t.vendasDoDia)}</td>
      <td className={`py-3 px-4 text-right ${cor}`}>R$ {brl(t.fatBruto)}</td>
      <td className={`py-3 px-4 text-right ${cor}`}>R$ {brl(t.fatLiquido)}</td>
      <td className={`py-3 px-4 text-right ${cor}`}>R$ {brl(t.ads)}</td>
      <td className={`py-3 px-4 text-right ${cor}`}>R$ {brl(t.flex)}</td>
      <td className={`py-3 px-4 text-right ${cor}`}>R$ {brl(t.lucro)}</td>
      <td className="py-3 px-4 text-right font-mono text-slate-400">R$ {brl(t.metaValor)}</td>
      <td className={`py-3 px-4 text-center ${cor}`}>{t.metaValor > 0 ? ((t.fatBruto / t.metaValor) * 100).toFixed(1) + '%' : '-'}</td>
      <td className={`py-3 px-6 text-right ${cor}`}>{t.fatBruto > 0 ? ((t.lucro / t.fatBruto) * 100).toFixed(1) + '%' : '-'}</td>
    </tr>
  );

  return (
    <div className="min-h-screen bg-[#07090e] p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">

        {/* CABEÇALHO */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Dashboard Omnichannel</h1>
            <p className="text-sm font-medium text-slate-400">Visão consolidada consultando Supabase (Faturados, Regras, Devoluções, Ads, PLP e Custos)</p>
          </div>
          <Navbar />
        </div>

        {/* AVISOS */}
        {(erros.length > 0 || avisos.length > 0) && (
          <div className="space-y-2">
            {erros.length > 0 && (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-950/30 p-4 text-xs text-rose-200 space-y-1">
                <strong className="block text-rose-300">Falha ao carregar do Supabase:</strong>
                {erros.map((e) => <span key={e} className="block">• {e}</span>)}
              </div>
            )}
            {avisos.length > 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-200 space-y-1">
                <strong className="block text-amber-300">Atenção aos dados:</strong>
                {avisos.map((a) => <span key={a} className="block">• {a}</span>)}
              </div>
            )}
          </div>
        )}

        {/* BARRA DE FILTROS SUPERIOR */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 shadow-xl gap-4">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Dashboard Best Fit</h2>
            <p className="text-xs text-slate-400 mt-0.5">Lucro real = Fat. líquido (fórmula do canal) − Devoluções − CMV − Ads − Frete FLEX</p>
          </div>

          <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
            <button onClick={handleEnviarEmailAlerta} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 transition text-white font-extrabold text-xs rounded-xl shadow-lg cursor-pointer">
              Enviar Relatório por E-mail
            </button>

            <div className="flex gap-2 items-center bg-slate-950 p-1.5 rounded-xl border border-slate-700">
              <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="bg-transparent text-indigo-300 font-bold text-xs focus:outline-none px-2 cursor-pointer">
                <option value="MES_ATUAL" className="bg-slate-900 text-white">Mês Atual (Padrão Metas)</option>
                <option value="MES_ANTERIOR" className="bg-slate-900 text-white">Mês Anterior</option>
                <option value="HOJE" className="bg-slate-900 text-white">Hoje</option>
                <option value="SEMANA" className="bg-slate-900 text-white">Últimos 7 dias</option>
                <option value="QUINZENA" className="bg-slate-900 text-white">Últimos 15 dias</option>
                <option value="PERSONALIZADO" className="bg-slate-900 text-white">Personalizado</option>
              </select>
            </div>
            {dateFilter === 'PERSONALIZADO' && (
              <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-700">
                <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="bg-transparent text-slate-300 font-bold text-xs focus:outline-none" />
                <span className="text-slate-500 text-xs font-bold">até</span>
                <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="bg-transparent text-slate-300 font-bold text-xs focus:outline-none" />
              </div>
            )}

            <div className="flex gap-2 items-center bg-slate-950 p-1.5 rounded-xl border border-slate-700">
              <select value={modalidadeFilter} onChange={(e) => setModalidadeFilter(e.target.value)} className="bg-transparent text-emerald-300 font-bold text-xs focus:outline-none px-2 cursor-pointer">
                <option value="TODAS" className="bg-slate-900 text-white">Todas as Modalidades</option>
                <option value="FISICO" className="bg-slate-900 text-white">Lojas Físicas</option>
                <option value="DIGITAL" className="bg-slate-900 text-white">E-commerce / Marketplaces</option>
              </select>
            </div>

            <div className="flex gap-2 items-center bg-slate-950 p-1.5 rounded-xl border border-slate-700">
              <select value={selectedChannelFilter} onChange={(e) => setSelectedChannelFilter(e.target.value)} className="bg-transparent text-purple-300 font-bold text-xs focus:outline-none px-2 cursor-pointer">
                <option value="TODOS" className="bg-slate-900 text-white">Todos os Canais</option>
                <option value="ML_GERAL" className="bg-slate-900 text-white">Mercado Livre (Geral)</option>
                {canaisLista.map((ch) => <option key={ch} value={ch} className="bg-slate-900 text-white">{ch}</option>)}
              </select>
            </div>

            <button onClick={handleRecalculate} disabled={isRecalculating} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 transition text-white font-extrabold text-xs rounded-xl shadow-lg cursor-pointer">
              {isRecalculating ? 'Calculando...' : 'Recalcular'}
            </button>
          </div>
        </div>

        {/* MODO DE VISUALIZAÇÃO */}
        <div className="flex justify-between items-center bg-slate-900/90 px-5 py-3 rounded-2xl border border-slate-800/80 shadow-lg">
          <span className="text-xs text-slate-300 font-bold">Modo de Visualização dos Canais:</span>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200 select-none">
              <input type="checkbox" checked={viewMode === 'cards'} onChange={() => setViewMode('cards')} className="w-4 h-4 rounded bg-slate-950 border-slate-700 cursor-pointer" />
              Visualização em Cards
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200 select-none">
              <input type="checkbox" checked={viewMode === 'linhas'} onChange={() => setViewMode('linhas')} className="w-4 h-4 rounded bg-slate-950 border-slate-700 cursor-pointer" />
              Visualização em Linhas (Tabela Executiva)
            </label>
          </div>
        </div>

        {/* 4 CARDS PRINCIPAIS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

          {/* FATURAMENTO BRUTO */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between shadow-xl">
            <div className="text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Faturamento Bruto</span>
              <h3 className="text-2xl font-black text-white mt-1">R$ {brl(totG.fatBruto)}</h3>
              <p className="text-[10px] text-slate-500 mt-1">{totG.itens} itens validados</p>
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[10px] text-slate-400"><span>Vendas</span><span>R$ {brl(totG.bruto)}</span></div>
              <Deducao rotulo="Devoluções / cancelamentos" valor={totG.devBruto} />
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3 text-center">
              <div>
                <span className="block text-[9px] text-emerald-400 font-bold uppercase mb-2">Lojas Físicas</span>
                <div className="grid grid-cols-2 gap-2">
                  {fisicas.map((loja) => {
                    const diff = Math.abs(loja.progressoMetaPct - 100);
                    const abaixo = loja.progressoMetaPct < 100;
                    return (
                      <div key={loja.canal} className="bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                        <span className="font-bold text-slate-200 text-xs block">{loja.canal.replace(/clube|loja/gi, '').trim() || loja.canal}</span>
                        <span className="text-xs font-black text-white block mt-0.5">R$ {brl(loja.fatBruto)}</span>
                        <span className={`text-[9px] font-black block mt-0.5 ${abaixo ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {abaixo ? `▼ ${diff.toFixed(1)}% abaixo` : `▲ ${diff.toFixed(1)}% acima`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="pt-2 border-t border-slate-800/50">
                <span className="block text-[9px] text-blue-400 font-bold uppercase mb-0.5">E-commerce</span>
                <span className="text-xs font-bold text-slate-200 block">R$ {brl(totE.fatBruto)}</span>
                <span className={`text-[10px] font-black block mt-0.5 ${progressoDigital >= 100 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {progressoDigital >= 100 ? `▲ ${(progressoDigital - 100).toFixed(1)}% acima` : `▼ ${(100 - progressoDigital).toFixed(1)}% abaixo`}
                </span>
              </div>
            </div>
          </div>

          {/* FATURAMENTO LÍQUIDO */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between shadow-xl">
            <div className="text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Faturamento Líquido (Repasse)</span>
              <h3 className="text-2xl font-black text-purple-400 mt-1">R$ {brl(totG.fatLiquido)}</h3>
              <p className="text-[10px] text-slate-500 mt-1">Após fórmula de cada canal</p>
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[10px] text-slate-400"><span>Repasse das vendas</span><span>R$ {brl(totG.liqVendas)}</span></div>
              <Deducao rotulo="Devoluções (líquido)" valor={totG.devLiq} />
            </div>
            <BlocoModalidade fisico={totF.fatLiquido} digital={totE.fatLiquido} />
          </div>

          {/* CMV */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between shadow-xl">
            <div className="text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase">CMV Total (Padrão Atual)</span>
              <h3 className="text-2xl font-black text-amber-400 mt-1">R$ {brl(totG.cmv)}</h3>
              <p className="text-[10px] text-slate-500 mt-1">Custo unitário x quantidade</p>
            </div>
            <BlocoModalidade fisico={totF.cmv} digital={totE.cmv} />
          </div>

          {/* LUCRO LÍQUIDO REAL */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-emerald-500/30 flex flex-col justify-between shadow-xl">
            <div className="text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Lucro Líquido Real</span>
              <h3 className={`text-2xl font-black mt-1 ${totG.lucro >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>R$ {brl(totG.lucro)}</h3>
              <p className="text-[10px] text-slate-500 mt-1">Fat. líquido − CMV − Ads − FLEX</p>
            </div>
            <div className="mt-3 space-y-1">
              <Deducao rotulo="CMV" valor={totG.cmv} />
              <Deducao rotulo="Adsense (investimento)" valor={totG.ads} />
              <Deducao rotulo="Frete FLEX (PLP)" valor={totG.flex} />
            </div>
            <BlocoModalidade fisico={totF.lucro} digital={totE.lucro} />
          </div>
        </div>

        {/* LISTAGEM DE CANAIS / LOJAS */}
        {viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {channelAnalytics.map((item) => {
              const metaBatida = item.progressoMetaPct >= 100;
              return (
                <div key={item.canal} className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 space-y-4 flex flex-col justify-between shadow-xl">
                  <div className="flex justify-between items-start border-b border-slate-800 pb-3 gap-3">
                    <div className="flex items-center gap-3">
                      {item.logoUrl
                        ? <img src={item.logoUrl} alt={item.canal} className="w-11 h-11 rounded-xl bg-white object-contain p-1 border border-slate-700 shadow" />
                        : <div className="w-11 h-11 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-500 text-[10px] font-bold">Logo</div>}
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wide">{item.responsavel}</span>
                        <h4 className="font-black text-white text-sm tracking-tight">{item.canal}</h4>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border whitespace-nowrap ${metaBatida ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border-rose-500/40'}`}>
                        {item.progressoMetaPct.toFixed(1)}% da meta atingida
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 tracking-tight">Meta: R$ {brl(item.metaValor)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold tracking-wider mb-0.5">FAT. BRUTO</span>
                      <strong className="text-xs font-black text-white">R$ {brl(item.fatBruto)}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-purple-300 block font-bold tracking-wider mb-0.5">FAT. LÍQUIDO</span>
                      <strong className="text-xs font-black text-purple-400">R$ {brl(item.fatLiquido)}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-emerald-300 block font-bold tracking-wider mb-0.5">MARGEM LÍQ.</span>
                      <strong className="text-xs font-black text-emerald-400">{item.margemPct.toFixed(1)}%</strong>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1.5 text-xs">
                    <Deducao rotulo="Devoluções (bruto)" valor={item.devBruto} />
                    <Deducao rotulo="CMV" valor={item.cmv} />
                    <Deducao rotulo="Adsense" valor={item.ads} />
                    <Deducao rotulo="Frete FLEX" valor={item.flex} />
                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-900">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Lucro líquido:</span>
                      <strong className={`text-xs font-black ${item.lucro >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>R$ {brl(item.lucro)}</strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">{periodo.isMesAtual ? 'Projeção do mês:' : 'Faturamento final:'}</span>
                      <strong className="text-xs font-black text-indigo-300">R$ {brl(item.projecao)}</strong>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-slate-900">
                      {item.metaValor > 0 && item.valorFaltante === 0 ? (
                        <span className="w-full text-center text-xs font-black text-emerald-400 py-0.5">🎉 Parabéns, meta batida!</span>
                      ) : (
                        <>
                          <span className="text-[10px] text-slate-400 font-bold uppercase">Faltou para a meta:</span>
                          <strong className="text-xs font-black text-amber-400">
                            R$ {brl(item.valorFaltante)}
                            {item.mediaDiariaNecessaria > 0 && <span className="block text-[9px] text-slate-400 font-bold text-right">{brl(item.mediaDiariaNecessaria)} / dia</span>}
                          </strong>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800/80 shadow-xl overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800 tracking-wider">
                <tr>
                  <th className="py-4 px-6">Canal / Responsável</th>
                  <th className="py-4 px-4 text-right">Vendas de Ontem ({periodo.ontemDia})</th>
                  <th className="py-4 px-4 text-right">Fat. Bruto</th>
                  <th className="py-4 px-4 text-right">Fat. Líquido</th>
                  <th className="py-4 px-4 text-right">Adsense</th>
                  <th className="py-4 px-4 text-right">Frete FLEX</th>
                  <th className="py-4 px-4 text-right">Lucro Líq.</th>
                  <th className="py-4 px-4 text-right">Meta</th>
                  <th className="py-4 px-4 text-center">Meta Atingida</th>
                  <th className="py-4 px-6 text-right text-emerald-400">Margem Líq.</th>
                </tr>
              </thead>
              <tbody>
                {ecommerce.length > 0 && (
                  <>
                    <tr className="bg-slate-950/70"><td colSpan={10} className="py-3 px-6 text-indigo-400 font-black">E-commerce / Marketplaces</td></tr>
                    {ecommerce.map((item) => <LinhaTabela key={item.canal} item={item} cor="text-rose-400" />)}
                    <TotalTabela titulo="Total E-Commerce" t={totE} cor="text-indigo-300" />
                  </>
                )}
                {fisicas.length > 0 && (
                  <>
                    <tr className="bg-slate-950/70"><td colSpan={10} className="py-3 px-6 text-emerald-400 font-black">Lojas Físicas</td></tr>
                    {fisicas.map((item) => <LinhaTabela key={item.canal} item={item} cor="text-rose-400" />)}
                    <TotalTabela titulo="Total Lojas Físicas" t={totF} cor="text-emerald-300" />
                  </>
                )}
                <TotalTabela titulo="TOTAL GERAL" t={totG} cor="text-white" />
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}