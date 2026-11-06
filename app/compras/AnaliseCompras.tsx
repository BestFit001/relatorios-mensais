"use client";
// Compras > Análise: tabela dinâmica sobre a BASE (grade × filial) — estoque, vendas por mês, preço praticado, cobertura e curva ABC.
// Linhas em níveis (expandir/recolher), colunas cruzadas (ex.: por filial), medidas à escolha, filtros e exportação para Excel.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  ABC_PADRAO, DIMENSOES, MODELOS, achatar, agregar, aplicarFiltros, celulasDoNo, construirBase, formatar, idsExpansiveis,
  listarMedidas, nomeDim, valoresDaColuna, type DimId, type Filtros, type LinhaBase, type OpcoesABC, type Ordenacao, type Pivot, type ProdutoDB,
} from "../../lib/comprasAnalise";
import { periodoDe, rotuloPeriodo, ultimosPeriodos } from "../../lib/comprasImport";
import {
  carregarEstoque, carregarNomesFiliais, carregarProdutos, carregarUploads, carregarVendas, ultimoPeriodoComVenda, type UploadReg,
} from "../../lib/comprasDb";

const CHAVE_LS = "bestfit_compras_pivot_v1";
const ALTURA_LINHA = 30;
const FILTROS_DIMS: DimId[] = ["filial", "marca", "genero", "classe", "familia", "fornecedor", "abc", "situacao", "tamanho", "cor", "produto"];

function FiltroMulti({ dim, opcoes, sel, onChange }: { dim: DimId; opcoes: string[]; sel: Set<string> | undefined; onChange: (s: Set<string>) => void }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [aberto]);
  const lista = busca ? opcoes.filter((o) => o.toLowerCase().includes(busca.toLowerCase())) : opcoes;
  const n = sel?.size ?? 0;
  const alternar = (o: string) => { const s = new Set(sel); if (s.has(o)) s.delete(o); else s.add(o); onChange(s); };
  return (
    <div ref={ref} className="relative" data-filtro={dim}>
      <button type="button" onClick={() => setAberto(!aberto)}
        className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer whitespace-nowrap ${n ? "bg-indigo-600/20 border-indigo-500 text-indigo-200" : "bg-slate-950 border-slate-700 text-slate-300 hover:text-white"}`}>
        {nomeDim(dim)}{n ? ` (${n})` : ""} ▾
      </button>
      {aberto && (
        <div className="absolute z-30 mt-1 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 space-y-2">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" autoFocus
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-indigo-500" />
          <div className="flex gap-2 text-[10px] font-bold">
            <button type="button" className="text-indigo-300 hover:text-white cursor-pointer" onClick={() => onChange(new Set([...(sel ?? []), ...lista.slice(0, 500)]))}>Marcar visíveis</button>
            <button type="button" className="text-slate-400 hover:text-white cursor-pointer" onClick={() => onChange(new Set())}>Limpar</button>
          </div>
          <div className="max-h-60 overflow-auto space-y-0.5">
            {lista.slice(0, 300).map((o) => (
              <label key={o} className="flex items-center gap-2 px-1 py-0.5 text-[11px] text-slate-200 hover:bg-slate-800 rounded cursor-pointer">
                <input type="checkbox" checked={sel?.has(o) ?? false} onChange={() => alternar(o)} />
                <span className="truncate" title={o}>{o}</span>
              </label>
            ))}
            {lista.length > 300 && <p className="text-[10px] text-slate-500 px-1">+{lista.length - 300} — refine a busca</p>}
            {lista.length === 0 && <p className="text-[10px] text-slate-500 px-1">Nada encontrado.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AnaliseCompras({ versao }: { versao: number }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [produtos, setProdutos] = useState<Map<string, ProdutoDB>>(new Map());
  const [estoque, setEstoque] = useState<any[]>([]);
  const [vendas, setVendas] = useState<any[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<UploadReg[]>([]);
  const [ultimoPer, setUltimoPer] = useState<number | null>(null);

  const [nMeses, setNMeses] = useState(6);
  const [abcOpc, setAbcOpc] = useState<OpcoesABC>(ABC_PADRAO);
  const [pivot, setPivot] = useState<Pivot>(MODELOS[0].pivot);
  const [filtros, setFiltros] = useState<Filtros>({});
  const [soEstoque, setSoEstoque] = useState(false);
  const [soVenda, setSoVenda] = useState(false);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [ordem, setOrdem] = useState<Ordenacao>({ coluna: null, dir: "asc" });
  const [rolagem, setRolagem] = useState(0);
  const [altura, setAltura] = useState(600);
  const caixa = useRef<HTMLDivElement>(null);
  const [lsPronto, setLsPronto] = useState(false);

  // preferências do usuário (só conveniência)
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE_LS) || "null");
      if (s) {
        if (s.pivot?.linhas) setPivot(s.pivot);
        if (s.nMeses) setNMeses(s.nMeses);
        if (s.abcOpc) setAbcOpc({ ...ABC_PADRAO, ...s.abcOpc });
        setSoEstoque(!!s.soEstoque); setSoVenda(!!s.soVenda);
      }
    } catch { /* sem preferências: usa o modelo padrão */ }
    setLsPronto(true);
  }, []);
  useEffect(() => {
    if (!lsPronto) return;
    try { localStorage.setItem(CHAVE_LS, JSON.stringify({ pivot, nMeses, abcOpc, soEstoque, soVenda })); } catch { /* sem localStorage */ }
  }, [pivot, nMeses, abcOpc, soEstoque, soVenda, lsPronto]);

  // cadastro, estoque, nomes das filiais e registro dos envios
  useEffect(() => {
    let vivo = true;
    setCarregando(true); setErro("");
    Promise.all([carregarProdutos(), carregarEstoque(), carregarNomesFiliais(), carregarUploads(), ultimoPeriodoComVenda()])
      .then(([prods, est, nm, ups, ult]) => {
        if (!vivo) return;
        setProdutos(new Map(prods.map((p: any) => [String(p.grade), p as ProdutoDB])));
        setEstoque(est); setNomes(nm); setUploads(ups); setUltimoPer(ult);
      })
      .catch((e) => { if (vivo) { setErro("Não consegui carregar os dados: " + (e?.message || e)); setCarregando(false); } });
    return () => { vivo = false; };
  }, [versao]);

  const fim = ultimoPer ?? periodoDe(new Date().getFullYear(), new Date().getMonth() + 1);
  const periodos = useMemo(() => ultimosPeriodos(fim, nMeses), [fim, nMeses]);

  // vendas do intervalo escolhido
  useEffect(() => {
    let vivo = true;
    carregarVendas(periodos[0])
      .then((v) => { if (vivo) { setVendas(v); setCarregando(false); } })
      .catch((e) => { if (vivo) { setErro("Não consegui carregar as vendas: " + (e?.message || e)); setCarregando(false); } });
    return () => { vivo = false; };
  }, [periodos, versao]);

  const base = useMemo(() => construirBase(produtos, estoque, vendas, periodos, nomes, abcOpc), [produtos, estoque, vendas, periodos, nomes, abcOpc]);
  const filtradas = useMemo(() => aplicarFiltros(base, filtros, soEstoque, soVenda), [base, filtros, soEstoque, soVenda]);

  const opcoesFiltro = useMemo(() => {
    const m = {} as Record<DimId, string[]>;
    for (const d of FILTROS_DIMS) {
      const s = new Set<string>();
      for (const l of base) s.add(l.dims[d]);
      m[d] = Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    }
    return m;
  }, [base]);

  const medidasDisp = useMemo(() => listarMedidas(periodos, rotuloPeriodo), [periodos]);
  const medidasSel = useMemo(() => pivot.medidas.map((id) => medidasDisp.find((m) => m.id === id)).filter(Boolean) as typeof medidasDisp, [pivot.medidas, medidasDisp]);
  const colunaValores = useMemo(() => valoresDaColuna(filtradas, pivot.coluna), [filtradas, pivot.coluna]);
  const ctx = useMemo(() => ({ medidas: medidasSel, nPer: periodos.length, colunaDim: pivot.coluna, colunaValores }), [medidasSel, periodos.length, pivot.coluna, colunaValores]);

  useEffect(() => { setAbertos(new Set()); setOrdem({ coluna: null, dir: "asc" }); }, [pivot.linhas.join(",")]);
  useEffect(() => { if (ordem.coluna !== null && ordem.coluna >= medidasSel.length * (1 + colunaValores.length)) setOrdem({ coluna: null, dir: "asc" }); }, [medidasSel.length, colunaValores.length, ordem.coluna]);

  const visiveis = useMemo(() => achatar(filtradas, pivot.linhas, abertos, ordem, ctx), [filtradas, pivot.linhas, abertos, ordem, ctx]);
  const totalGeral = useMemo(() => celulasDoNo(filtradas, ctx), [filtradas, ctx]);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const atualizar = () => setAltura(el.clientHeight || 600);
    atualizar();
    window.addEventListener("resize", atualizar);
    return () => window.removeEventListener("resize", atualizar);
  }, [carregando]);

  const kpis = useMemo(() => {
    const a = agregar(filtradas, periodos.length, true);
    const media = periodos.length ? a.qtd / periodos.length : 0;
    return [
      { id: "estoque", nome: "Estoque (un)", valor: formatar(a.estoque, "int"), sub: `${formatar(a.estCusto, "brl")} a custo` },
      { id: "vendas", nome: `Vendas ${periodos.length} m (un)`, valor: formatar(a.qtd, "int"), sub: `${formatar(a.valor, "brl")} vendidos` },
      { id: "preco", nome: "Preço médio praticado", valor: formatar(a.qtd > 0 ? a.valor / a.qtd : null, "brl"), sub: a.tabela > 0 ? `${formatar(1 - a.valorTab / a.tabela, "pct")} de desconto sobre a tabela` : "—" },
      { id: "cob", nome: "Cobertura (meses)", valor: formatar(a.qtd > 0 ? a.estoque / media : null, "dec"), sub: `média de ${formatar(media, "int")} un/mês` },
      { id: "prod", nome: "Produtos (códigos)", valor: formatar(a.produtos?.size ?? 0, "int"), sub: `${formatar(a.linhas, "int")} grades × filiais` },
    ];
  }, [filtradas, periodos.length]);

  const ultimoEnvio = (tipo: string) => uploads.find((u) => u.tipo === tipo);
  const ddmm = (iso?: string) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca"; };

  // ----- ações de configuração -----
  const aplicarModelo = (id: string) => { const m = MODELOS.find((x) => x.id === id); if (m) setPivot({ ...m.pivot, linhas: [...m.pivot.linhas], medidas: [...m.pivot.medidas] }); };
  const moverLinha = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= pivot.linhas.length) return;
    const l = [...pivot.linhas]; [l[i], l[j]] = [l[j], l[i]];
    setPivot({ ...pivot, linhas: l });
  };
  const alternarMedida = (id: string) => setPivot({ ...pivot, medidas: pivot.medidas.includes(id) ? pivot.medidas.filter((m) => m !== id) : [...pivot.medidas, id] });
  const alternarAberto = (id: string) => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clicarCabecalho = (coluna: number | null) => setOrdem((o) => (o.coluna === coluna ? { coluna, dir: o.dir === "asc" ? "desc" : "asc" } : { coluna, dir: coluna === null ? "asc" : "desc" }));

  // ----- exportação -----
  const baixar = (aoa: any[][], nome: string) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compras");
    XLSX.writeFile(wb, `${nome}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const baixarTabela = () => {
    const grupos = ["Total", ...colunaValores];
    const cab1 = ["Linhas"], cab2 = [""];
    grupos.forEach((g) => medidasSel.forEach((m, i) => { cab1.push(i === 0 ? g : ""); cab2.push(m.nome); }));
    const num = (v: number | null) => (v === null ? "" : v);
    const corpo = visiveis.map((l) => [`${"    ".repeat(l.nivel)}${l.rotulo}`, ...celulasDoNo(l.linhas, ctx).map(num)]);
    baixar([pivot.coluna ? cab1 : cab2.map((_, i) => (i === 0 ? "Linhas" : cab2[i])), ...(pivot.coluna ? [cab2] : []), ["Total geral", ...totalGeral.map(num)], ...corpo], "compras_tabela");
  };
  const baixarBase = () => {
    const cab = ["Grade + filial", "Grade", "Código", "Produto", "Filial", "Cor", "Tamanho", "Gênero", "Marca", "Classe", "Família", "Fornecedor", "Estoque", "Custo", "Custo Total", "PDV", "Margem de tabela",
      ...periodos.flatMap((p) => [`${rotuloPeriodo(p)} QTT`, `${rotuloPeriodo(p)} VALOR`]), "VENDA ITENS", "VENDA VALOR", "Preço médio praticado", "Curva ABC"];
    const corpo = filtradas.map((l: LinhaBase) => [
      l.chave, l.dims.grade, l.dims.codigo, l.dims.produto, l.dims.filial, l.dims.cor, l.dims.tamanho, l.dims.genero, l.dims.marca, l.dims.classe, l.dims.familia, l.dims.fornecedor,
      l.estoque, l.custo, l.estoque * l.custo, l.pdv, l.pdv > 0 ? (l.pdv - l.custo) / l.pdv : "",
      ...periodos.flatMap((_, i) => [l.qtdMes[i], Math.round(l.valorMes[i] * 100) / 100]), l.qtd, Math.round(l.valor * 100) / 100, l.qtd > 0 ? Math.round((l.valor / l.qtd) * 100) / 100 : "", l.dims.abc,
    ]);
    baixar([cab, ...corpo], "compras_base");
  };

  // ----- render da tabela -----
  const nMed = medidasSel.length;
  const grupos = ["Total geral", ...colunaValores];
  const inicio = Math.max(0, Math.floor(rolagem / ALTURA_LINHA) - 8);
  const fimJanela = Math.min(visiveis.length, inicio + Math.ceil(altura / ALTURA_LINHA) + 16);
  const nColunas = 1 + grupos.length * nMed;
  const setaOrdem = (c: number | null) => (ordem.coluna === c ? (ordem.dir === "asc" ? " ▲" : " ▼") : "");
  const campo = "bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none focus:border-indigo-500";
  const tdNum = (v: number | null, m: (typeof medidasSel)[number]) => (
    <td className={`px-3 text-right tabular-nums whitespace-nowrap border-b border-slate-800/60 ${v !== null && v < 0 ? "text-rose-400" : ""}`}>{formatar(v, m.formato)}</td>
  );

  if (carregando && base.length === 0 && !erro) return <p className="text-sm text-slate-400 p-6" data-carregando>Carregando dados de compras…</p>;

  return (
    <div className="space-y-4" data-aba-analise>
      {erro && <p className="p-3 rounded-xl border border-rose-900/60 bg-rose-950/40 text-rose-300 text-sm font-semibold">{erro}</p>}

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-500" data-frescor>
        <span>Estoque lojas (Shop9): <strong className="text-slate-300">{ddmm(ultimoEnvio("estoque_shop9")?.created_at)}</strong></span>
        <span>Saldo e-commerce (Tiny): <strong className="text-slate-300">{ddmm(ultimoEnvio("estoque_tiny_8")?.created_at)}</strong></span>
        <span>Vendas: <strong className="text-slate-300">{rotuloPeriodo(periodos[0])} a {rotuloPeriodo(periodos[periodos.length - 1])}</strong>{ultimoPer ? "" : " (nenhuma venda enviada)"}</span>
      </div>

      {base.length === 0 && !carregando && (
        <p className="p-4 rounded-xl border border-amber-900/60 bg-amber-950/30 text-amber-300 text-sm font-semibold" data-vazio>
          Ainda não há dados de compras. Vá na sub-aba Upload e envie o estoque e as vendas.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-kpis>
        {kpis.map((k) => (
          <div key={k.id} data-kpi={k.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{k.nome}</p>
            <p className="text-xl font-black text-white mt-1">{k.valor}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 items-end">
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Modelo pronto</label>
            <select data-modelo defaultValue="" onChange={(e) => { if (e.target.value) aplicarModelo(e.target.value); e.target.value = ""; }} className={campo + " w-full cursor-pointer font-bold"}>
              <option value="">Escolher um modelo…</option>
              {MODELOS.map((m) => <option key={m.id} value={m.id}>{m.nome} — {m.descricao}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Período de vendas</label>
            <select data-meses value={nMeses} onChange={(e) => setNMeses(+e.target.value)} className={campo + " w-full cursor-pointer font-bold"}>
              {[1, 2, 3, 4, 6, 9, 12].map((n) => <option key={n} value={n}>Últimos {n} {n === 1 ? "mês" : "meses"}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Colunas (cruzar por)</label>
            <select data-coluna value={pivot.coluna ?? ""} onChange={(e) => setPivot({ ...pivot, coluna: (e.target.value || null) as DimId | null })} className={campo + " w-full cursor-pointer font-bold"}>
              <option value="">— nenhuma —</option>
              {DIMENSOES.filter((d) => !pivot.linhas.includes(d.id) && d.id !== "grade" && d.id !== "produto" && d.id !== "codigo").map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2" data-linhas>
          <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Linhas (níveis):</span>
          {pivot.linhas.map((d, i) => (
            <span key={d} data-linha-chip={d} className="inline-flex items-center gap-1 bg-indigo-600/20 border border-indigo-500/60 text-indigo-200 rounded-lg pl-2 pr-1 py-1 text-[11px] font-bold">
              {i + 1}. {nomeDim(d)}
              <button type="button" title="Subir nível" onClick={() => moverLinha(i, -1)} className="px-1 hover:text-white cursor-pointer">←</button>
              <button type="button" title="Descer nível" onClick={() => moverLinha(i, 1)} className="px-1 hover:text-white cursor-pointer">→</button>
              <button type="button" title="Remover" disabled={pivot.linhas.length === 1} onClick={() => setPivot({ ...pivot, linhas: pivot.linhas.filter((x) => x !== d) })} className="px-1 hover:text-rose-300 cursor-pointer disabled:opacity-30">✕</button>
            </span>
          ))}
          <select data-add-linha value="" onChange={(e) => { if (e.target.value) setPivot({ ...pivot, linhas: [...pivot.linhas, e.target.value as DimId], coluna: pivot.coluna === e.target.value ? null : pivot.coluna }); }} className={campo + " cursor-pointer"}>
            <option value="">+ adicionar nível</option>
            {DIMENSOES.filter((d) => !pivot.linhas.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>

          <details className="relative ml-auto" data-medidas>
            <summary className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-[11px] font-bold text-slate-200 cursor-pointer list-none">Valores ({pivot.medidas.length}) ▾</summary>
            <div className="absolute right-0 z-30 mt-1 w-72 max-h-80 overflow-auto bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 space-y-2">
              {Array.from(new Set(medidasDisp.map((m) => m.grupo))).map((g) => (
                <div key={g}>
                  <p className="text-[10px] font-black text-slate-500 uppercase">{g}</p>
                  {medidasDisp.filter((m) => m.grupo === g).map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-[11px] text-slate-200 py-0.5 cursor-pointer">
                      <input type="checkbox" data-medida={m.id} checked={pivot.medidas.includes(m.id)} onChange={() => alternarMedida(m.id)} /> {m.nome}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </details>
        </div>

        <div className="flex flex-wrap items-center gap-2" data-filtros>
          <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Filtros:</span>
          {FILTROS_DIMS.map((d) => (
            <FiltroMulti key={d} dim={d} opcoes={opcoesFiltro[d] || []} sel={filtros[d]} onChange={(s) => setFiltros({ ...filtros, [d]: s })} />
          ))}
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 cursor-pointer ml-2">
            <input type="checkbox" data-so-estoque checked={soEstoque} onChange={(e) => setSoEstoque(e.target.checked)} /> Só com estoque
          </label>
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 cursor-pointer">
            <input type="checkbox" data-so-venda checked={soVenda} onChange={(e) => setSoVenda(e.target.checked)} /> Só com venda
          </label>
          {(Object.values(filtros).some((s) => s && s.size) || soEstoque || soVenda) && (
            <button type="button" data-limpar-filtros onClick={() => { setFiltros({}); setSoEstoque(false); setSoVenda(false); }} className="text-[11px] font-bold text-rose-300 hover:text-white cursor-pointer">Limpar filtros</button>
          )}
        </div>

        <details className="text-[11px] text-slate-400" data-abc>
          <summary className="cursor-pointer font-bold text-slate-300">Curva ABC: por {abcOpc.criterio === "valor" ? "valor vendido" : "unidades"}, {abcOpc.escopo === "geral" ? "ranking geral" : "ranking dentro de cada filial"} (A até {abcOpc.corteA}%, B até {abcOpc.corteB}%)</summary>
          <div className="flex flex-wrap items-end gap-3 mt-2">
            <div><label className="block text-[10px] font-bold uppercase mb-1">Critério</label>
              <select value={abcOpc.criterio} onChange={(e) => setAbcOpc({ ...abcOpc, criterio: e.target.value as any })} className={campo + " cursor-pointer"}><option value="valor">Valor vendido (R$)</option><option value="qtd">Unidades vendidas</option></select></div>
            <div><label className="block text-[10px] font-bold uppercase mb-1">Ranking</label>
              <select value={abcOpc.escopo} onChange={(e) => setAbcOpc({ ...abcOpc, escopo: e.target.value as any })} className={campo + " cursor-pointer"}><option value="geral">Geral (todas as filiais)</option><option value="filial">Dentro de cada filial</option></select></div>
            <div><label className="block text-[10px] font-bold uppercase mb-1">Corte A (%)</label>
              <input type="number" value={abcOpc.corteA} min={1} max={99} onChange={(e) => setAbcOpc({ ...abcOpc, corteA: Math.min(+e.target.value || 80, abcOpc.corteB - 1) })} className={campo + " w-20"} /></div>
            <div><label className="block text-[10px] font-bold uppercase mb-1">Corte B (%)</label>
              <input type="number" value={abcOpc.corteB} min={2} max={100} onChange={(e) => setAbcOpc({ ...abcOpc, corteB: Math.max(+e.target.value || 95, abcOpc.corteA + 1) })} className={campo + " w-20"} /></div>
            <p className="text-[10px] text-slate-500 max-w-md">A curva é calculada por produto (código), sobre todas as filiais e o período escolhido, antes dos filtros. Use “Curva ABC” como nível de linha ou como filtro.</p>
          </div>
        </details>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-expandir onClick={() => setAbertos(idsExpansiveis(filtradas, pivot.linhas))} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 cursor-pointer">Expandir tudo</button>
        <button type="button" data-recolher onClick={() => setAbertos(new Set())} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 cursor-pointer">Recolher tudo</button>
        <span className="text-[11px] text-slate-500">{formatar(filtradas.length, "int")} linhas da base · {formatar(visiveis.length, "int")} linhas na tabela</span>
        <div className="ml-auto flex gap-2">
          <button type="button" data-baixar-tabela onClick={baixarTabela} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-[11px] font-black text-white cursor-pointer">⬇ Baixar tabela</button>
          <button type="button" data-baixar-base onClick={baixarBase} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-[11px] font-black text-white cursor-pointer">⬇ Baixar base (grade × filial)</button>
        </div>
      </div>

      <div ref={caixa} onScroll={(e) => setRolagem((e.target as HTMLDivElement).scrollTop)} data-tabela-pivot
        className="overflow-auto rounded-2xl border border-slate-800 bg-slate-950" style={{ maxHeight: "66vh" }}>
        <table className="text-xs border-separate border-spacing-0 min-w-full">
          <thead>
            {pivot.coluna && (
              <tr>
                <th className="sticky top-0 left-0 z-20 bg-slate-900 border-b border-slate-800 px-3 py-2 text-left text-slate-400">{nomeDim(pivot.coluna)} →</th>
                {grupos.map((g) => <th key={g} colSpan={nMed} className="sticky top-0 z-10 bg-slate-900 border-b border-l border-slate-800 px-3 py-2 text-center text-indigo-300 font-black whitespace-nowrap">{g}</th>)}
              </tr>
            )}
            <tr>
              <th onClick={() => clicarCabecalho(null)} data-ordenar-rotulo
                className={`sticky left-0 z-20 bg-slate-900 border-b border-slate-800 px-3 py-2 text-left text-slate-300 font-black cursor-pointer min-w-[320px] ${pivot.coluna ? "top-[34px]" : "top-0"}`}
                style={pivot.coluna ? { top: 34 } : undefined}>
                {pivot.linhas.map(nomeDim).join(" › ")}{setaOrdem(null)}
              </th>
              {grupos.map((g, gi) => medidasSel.map((m, mi) => (
                <th key={g + m.id} onClick={() => clicarCabecalho(gi * nMed + mi)} data-ordenar-medida={gi * nMed + mi}
                  className={`bg-slate-900 border-b border-slate-800 px-3 py-2 text-right text-slate-300 font-bold cursor-pointer whitespace-nowrap sticky z-10 ${mi === 0 && pivot.coluna ? "border-l" : ""}`}
                  style={{ top: pivot.coluna ? 34 : 0 }}>
                  {m.nome}{setaOrdem(gi * nMed + mi)}
                </th>
              )))}
            </tr>
          </thead>
          <tbody>
            <tr className="font-black bg-slate-900/70" data-total-geral style={{ height: ALTURA_LINHA }}>
              <td className="sticky left-0 z-[5] bg-slate-900 px-3 text-white border-b border-slate-800">Total geral</td>
              {totalGeral.map((v, i) => <React.Fragment key={i}>{tdNum(v, medidasSel[i % nMed])}</React.Fragment>)}
            </tr>
            {inicio > 0 && <tr style={{ height: inicio * ALTURA_LINHA }}><td colSpan={nColunas} /></tr>}
            {visiveis.slice(inicio, fimJanela).map((l) => {
              const cels = celulasDoNo(l.linhas, ctx);
              return (
                <tr key={l.id} data-linha-pivot data-nivel={l.nivel} style={{ height: ALTURA_LINHA }} className={`hover:bg-slate-900/60 ${l.temFilhos ? "font-semibold" : ""}`}>
                  <td className="sticky left-0 z-[5] bg-slate-950 px-3 border-b border-slate-800/60 whitespace-nowrap" style={{ paddingLeft: 12 + l.nivel * 18 }}>
                    {l.temFilhos
                      ? <button type="button" data-alternar onClick={() => alternarAberto(l.id)} className="inline-block w-4 text-slate-400 hover:text-white cursor-pointer">{l.aberto ? "▾" : "▸"}</button>
                      : <span className="inline-block w-4" />}
                    <span className="text-slate-100" title={l.rotulo}>{l.rotulo.length > 70 ? l.rotulo.slice(0, 70) + "…" : l.rotulo}</span>
                  </td>
                  {cels.map((v, i) => <React.Fragment key={i}>{tdNum(v, medidasSel[i % nMed])}</React.Fragment>)}
                </tr>
              );
            })}
            {fimJanela < visiveis.length && <tr style={{ height: (visiveis.length - fimJanela) * ALTURA_LINHA }}><td colSpan={nColunas} /></tr>}
            {visiveis.length === 0 && <tr><td colSpan={nColunas} className="p-6 text-center text-slate-500">Nenhuma linha com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
