"use client";
// Relatórios > Afiliados: quanto foi vendido por afiliados e pela própria loja (vendas APROVADAS da mesma planilha que alimenta o
// dashboard), a comissão paga a cada afiliado, como cada um vende (vídeo, live...) e os produtos mais vendidos. Aqui é só visualização:
// as colunas, os perfis próprios e as comissões ficam em Afiliados > Configurações.
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import {
  analisarAfiliados, normHandle, padraoAfiliados, type CfgAfiliados, type LinhaAfiliado, type Metodo, type ProdutoAfil, type VendasAfiliadosMes,
} from "../../lib/afiliados";
import { carregarCfgAfiliados, carregarVendasAfiliados } from "../../lib/afiliadosDb";
import { calcularLiquidoAfiliados } from "../../lib/afiliadosLiquido";
import { slugCanal } from "../../lib/adsImportDb";

type Props = { canal: string; mes: string; setMes: (m: string) => void; meses: string[] };

const R$ = (v: number) => "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PCT = (v: number) => ((v || 0) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const NUM = (v: number) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const quando = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const CORES = ["bg-purple-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-slate-500"];

function BarrasMetodo({ titulo, vazio, metodos, dado }: { titulo: string; vazio: string; metodos: Metodo[]; dado: string }) {
  return (
    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5" data-metodos={dado}>
      <h3 className="text-sm font-black text-white mb-3">{titulo}</h3>
      {metodos.length === 0 ? <p className="text-[11px] text-slate-500">{vazio}</p> : (
        <>
          <div className="flex h-3 rounded-full overflow-hidden bg-slate-800 mb-4">
            {metodos.map((m, i) => <div key={m.metodo} className={CORES[i % CORES.length]} style={{ width: `${m.pct * 100}%` }} title={`${m.metodo}: ${PCT(m.pct)}`} />)}
          </div>
          <ul className="space-y-2">
            {metodos.map((m, i) => (
              <li key={m.metodo} data-metodo-linha={m.metodo} className="flex items-center gap-3 text-xs">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${CORES[i % CORES.length]}`} />
                <span className="font-bold text-slate-100 flex-1">{m.metodo}</span>
                <span className="text-slate-400">{NUM(m.pedidos)} pedido(s)</span>
                <span className="text-slate-200 w-28 text-right">{R$(m.receita)}</span>
                <span className="font-bold text-white w-14 text-right">{PCT(m.pct)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function TabelaProdutos({ dado, produtos, vazio, mostrarAfiliados }: { dado: string; produtos: ProdutoAfil[]; vazio: string; mostrarAfiliados?: boolean }) {
  const [ordem, setOrdem] = useState<"receita" | "unidades">("receita");
  const [porPagina, setPorPagina] = useState(10);
  const [pagina, setPagina] = useState(1);
  const lista = useMemo(() => [...produtos].sort((a, b) => (ordem === "unidades" ? b.unidades - a.unidades || b.receita - a.receita : b.receita - a.receita)), [produtos, ordem]);
  useEffect(() => { setPagina(1); }, [produtos, ordem, porPagina]);
  const total = lista.reduce((t, p) => t + p.receita, 0);
  const totalPaginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const pag = Math.min(pagina, totalPaginas);
  const visiveis = lista.slice((pag - 1) * porPagina, pag * porPagina);
  if (lista.length === 0) return <p className="text-[11px] text-slate-500" data-afil-prod-vazio={dado}>{vazio}</p>;
  return (
    <div data-afil-prod={dado}>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <select data-afil-prod-ordem={dado} value={ordem} onChange={(e) => setOrdem(e.target.value as any)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer">
          <option value="receita">Ordenar: maior venda (R$)</option><option value="unidades">Ordenar: mais unidades</option>
        </select>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <span>Por página</span>
          <select data-afil-prod-por-pagina={dado} value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer">
            {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto border border-slate-800 rounded-xl">
        <table className="w-full text-left border-collapse text-xs" data-afil-prod-tabela={dado}>
          <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
            <tr><th className="p-3 w-10">#</th><th className="p-3">Produto</th><th className="p-3 text-right">Unid.</th><th className="p-3 text-right">Pedidos</th><th className="p-3 text-right">Vendas</th><th className="p-3 text-right">Comissão</th><th className="p-3 text-right">Líquido</th><th className="p-3 text-right">Margem</th><th className="p-3 text-right">% das vendas</th>{mostrarAfiliados && <th className="p-3 text-right">Afiliados</th>}</tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {visiveis.map((p, i) => (
              <tr key={(p.sku || p.nome) + i} data-afil-prod-linha={p.sku || p.nome} className="hover:bg-slate-800/40">
                <td className="p-3 text-slate-500 font-bold">{(pag - 1) * porPagina + i + 1}</td>
                <td className="p-3"><div className="font-bold text-slate-100">{p.nome || p.sku || "Sem nome"}</div>{p.sku && p.nome && <div className="text-[10px] text-slate-500">{p.sku}</div>}</td>
                <td className="p-3 text-right">{NUM(p.unidades)}</td>
                <td className="p-3 text-right">{NUM(p.pedidos)}</td>
                <td className="p-3 text-right font-bold text-slate-100">{R$(p.receita)}</td>
                <td className="p-3 text-right text-amber-300">{R$(p.comissao)}</td>
                <td className="p-3 text-right font-bold text-emerald-300">{p.liquido === null ? "—" : R$(p.liquido)}{p.semCusto && <span title="Produto sem custo cadastrado: custo R$ 0,00 no cálculo" className="ml-1 text-[9px] text-yellow-300 font-black">sem custo</span>}</td>
                <td className={`p-3 text-right ${p.liquido !== null && p.liquido < 0 ? "text-rose-400" : "text-slate-300"}`}>{p.liquido === null || p.receita <= 0 ? "—" : PCT(p.liquido / p.receita)}</td>
                <td className="p-3 text-right text-slate-300">{PCT(total > 0 ? p.receita / total : 0)}</td>
                {mostrarAfiliados && <td className="p-3 text-right text-slate-300">{NUM(p.afiliados)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3" data-afil-prod-paginacao={dado}>
        <span className="text-[11px] text-slate-500">{`${(pag - 1) * porPagina + 1}–${Math.min(pag * porPagina, lista.length)} de ${lista.length} produto(s)`}</span>
        <div className="flex items-center gap-1">
          <button type="button" data-afil-prod-ant={dado} disabled={pag <= 1} onClick={() => setPagina(pag - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">‹ Anterior</button>
          <span className="text-[11px] text-slate-400 px-2">{pag} / {totalPaginas}</span>
          <button type="button" data-afil-prod-prox={dado} disabled={pag >= totalPaginas} onClick={() => setPagina(pag + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">Próxima ›</button>
        </div>
      </div>
    </div>
  );
}

export default function AfiliadosAds({ canal, mes, setMes, meses }: Props) {
  const padrao = padraoAfiliados(canal);
  const [cfg, setCfg] = useState<CfgAfiliados>(padrao);
  const [dados, setDados] = useState<VendasAfiliadosMes | null>(null);
  const [dadosLiq, setDadosLiq] = useState<VendasAfiliadosMes | null>(null);   // as mesmas vendas já com o resultado do dashboard (custo, repasse...)
  const [calculandoLiq, setCalculandoLiq] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [selAfil, setSelAfil] = useState("");
  const boxProdAfil = useRef<HTMLDivElement>(null);
  // tabela
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "sem_comissao">("todos");
  const [ordem, setOrdem] = useState<"receita" | "comissao" | "pedidos">("receita");
  const [porPagina, setPorPagina] = useState(10);
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const c = await carregarCfgAfiliados(supabase, canal);
      if (!ativo) return;
      setCfg(c);
    })();
    return () => { ativo = false; };
  }, [canal]);
  useEffect(() => {
    let ativo = true;
    setCarregando(true); setDadosLiq(null); setCalculandoLiq(false);
    (async () => {
      const d = await carregarVendasAfiliados(supabase, canal, mes);
      if (!ativo) return;
      setDados(d); setCarregando(false);
      if (!d) return;
      setCalculandoLiq(true);
      const l = await calcularLiquidoAfiliados(supabase, canal, mes, d);
      if (ativo) { setDadosLiq(l); setCalculandoLiq(false); }
    })();
    return () => { ativo = false; };
  }, [canal, mes]);

  const analise = useMemo(() => (dados ? analisarAfiliados(dadosLiq || dados, cfg) : null), [dados, dadosLiq, cfg]);
  const semCustoQtd = useMemo(() => (dadosLiq ? dadosLiq.grupos.reduce((t, g) => t + (g.pr || []).filter((p) => p.x?.sc).length, 0) : 0), [dadosLiq]);
  const liqNaoCalculado = (calculandoLiq ? "calculando…" : "indisponível: suba de novo a planilha de vendas do mês em Uploads");
  const afilAtual = analise ? (analise.linhas.find((l) => l.nome === selAfil) || analise.linhas[0] || null) : null;
  const linhas = useMemo(() => {
    if (!analise) return [] as LinhaAfiliado[];
    const q = normHandle(busca);
    const l = analise.linhas.filter((x) => (filtro === "todos" || !x.definido) && (!q || x.nome.includes(q)));
    return [...l].sort((a, b) => (ordem === "comissao" ? b.comissao - a.comissao : ordem === "pedidos" ? b.pedidos - a.pedidos : b.receita - a.receita));
  }, [analise, busca, filtro, ordem]);
  useEffect(() => { setPagina(1); }, [busca, filtro, ordem, porPagina, mes]);
  const totalPaginas = Math.max(1, Math.ceil(linhas.length / porPagina));
  const pag = Math.min(pagina, totalPaginas);
  const visiveis = linhas.slice((pag - 1) * porPagina, pag * porPagina);
  const botoes = useMemo(() => Array.from({ length: totalPaginas }, (_, i) => i + 1).filter((n) => n === 1 || n === totalPaginas || Math.abs(n - pag) <= 2), [totalPaginas, pag]);

  const card = (rotulo: string, valor: string, extra?: string, cor = "text-white") => (
    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{rotulo}</div>
      <div className={`text-lg font-black mt-1 ${cor}`}>{valor}</div>
      {extra && <div className="text-[10px] text-slate-500 mt-0.5">{extra}</div>}
    </div>
  );

  return (
    <div className="space-y-6" data-afiliados-ads>
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">🤝 Afiliados — {canal}</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">Usa as vendas aprovadas da mesma planilha de vendas do dashboard (canceladas e não faturadas ficam de fora). Mostra o que foi vendido por afiliados e pela própria loja, a comissão paga, o método de venda (vídeo, live…) e os produtos mais vendidos.</p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mês de competência</label>
            <select data-afil-mes value={mes} onChange={(e) => setMes(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none cursor-pointer">
              {meses.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {(
        carregando ? <p className="p-8 text-center text-slate-400">Carregando…</p>
        : !dados || !analise ? (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 text-center text-sm text-slate-400" data-afil-vazio>
            Ainda não há vendas de afiliados lidas para {canal} em {mes}. Suba a planilha de vendas do canal em Uploads (a mesma do dashboard): ela é lida junto, usando as colunas definidas em Afiliados · Configurações.
            {!cfg.colAfiliado && !cfg.colConteudo && <span className="block mt-2 text-amber-300">As colunas do método e do afiliado ainda não foram definidas para este canal. <Link href={`/afiliados?canal=${slugCanal(canal)}`} className="underline font-bold">Definir agora</Link></span>}
          </div>
        ) : (
          <>
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-afil-resumo>
                {card("Vendas aprovadas", R$(analise.total.receita), `${NUM(analise.total.pedidos)} pedidos · ${NUM(analise.total.unidades)} un.`)}
                {card("Vendas por afiliados", R$(analise.afiliados.receita), `${PCT(analise.afiliados.pct)} do total · ${NUM(analise.afiliados.pedidos)} pedidos`, "text-purple-300")}
                {card("Vendas próprias (nós)", R$(analise.proprias.receita), `${PCT(analise.proprias.pct)} do total · ${NUM(analise.proprias.pedidos)} pedidos`)}
                {card("Comissão paga", R$(analise.afiliados.comissao), analise.afiliados.receita > 0 ? `${PCT(analise.afiliados.comissao / analise.afiliados.receita)} das vendas de afiliados` : "—", "text-amber-300")}
                {card("Afiliados que venderam", String(analise.afiliados.quantos), analise.afiliados.semComissao > 0 ? `${analise.afiliados.semComissao} sem comissão definida` : "todos com comissão", analise.afiliados.semComissao > 0 ? "text-amber-300" : "text-white")}
                {card("Líquido total (após comissão)", analise.total.liquido === null ? "—" : R$(analise.total.liquido), analise.total.liquido === null ? liqNaoCalculado : `${PCT(analise.total.receita > 0 ? analise.total.liquido / analise.total.receita : 0)} das vendas · como no dashboard, menos a comissão`, "text-emerald-300")}
                {card("Líquido das vendas de afiliados", analise.afiliados.liquido === null ? "—" : R$(analise.afiliados.liquido), analise.afiliados.liquido === null ? liqNaoCalculado : `${PCT(analise.afiliados.receita > 0 ? analise.afiliados.liquido / analise.afiliados.receita : 0)} das vendas deles · já sem a comissão`, "text-emerald-300")}
                {card("Pedido médio (afiliados)", R$(analise.afiliados.pedidos > 0 ? analise.afiliados.receita / analise.afiliados.pedidos : 0), "vendas ÷ pedidos")}
              </div>
              <p className="text-[10px] text-slate-500 mt-3">Planilha lida em {quando(dados.atualizadoEm)} (método na coluna {dados.colConteudo || "—"}, afiliado na coluna {dados.colAfiliado || "—"}). Comissão = % definido × valor vendido do afiliado. Líquido = mesmo cálculo do dashboard (repasse do canal − custo − frete − devoluções) menos a comissão.</p>
              {semCustoQtd > 0 && <p data-afil-aviso-custo className="mt-3 text-[11px] text-yellow-300 bg-yellow-950/20 border border-yellow-900/40 rounded-xl p-3">⚠ {semCustoQtd} produto(s) vendidos por aqui estão sem custo cadastrado: entram com custo R$ 0,00 e deixam o líquido maior do que o real (o dashboard também mostra “sem custo”).</p>}
              {analise.afiliados.semComissao > 0 && (
                <p data-afil-aviso className="mt-3 text-[11px] text-amber-300 bg-amber-950/20 border border-amber-900/40 rounded-xl p-3">⚠ {analise.afiliados.semComissao} afiliado(s) sem comissão definida: estão com comissão R$ 0,00 até você informar o % em <Link href={`/afiliados?canal=${slugCanal(canal)}`} data-afil-ir-config className="underline font-bold">Afiliados · Configurações</Link>.</p>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BarrasMetodo dado="afiliados" titulo="Como os afiliados vendem (geral)" metodos={analise.afiliados.metodos} vazio="Nenhuma venda de afiliado neste mês." />
              <BarrasMetodo dado="proprias" titulo="Como vendemos nós (venda própria)" metodos={analise.proprias.metodos} vazio="Nenhuma venda própria neste mês." />
            </div>

            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl" data-afil-tabela-box>
              <h3 className="text-sm font-black text-white mb-4">Por afiliado</h3>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <input data-afil-busca value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar afiliado…" className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-purple-500 w-56" />
                <select data-afil-filtro value={filtro} onChange={(e) => setFiltro(e.target.value as any)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer">
                  <option value="todos">Todos os afiliados</option><option value="sem_comissao">Só sem comissão definida</option>
                </select>
                <select data-afil-ordem value={ordem} onChange={(e) => setOrdem(e.target.value as any)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer">
                  <option value="receita">Ordenar: mais vendeu</option><option value="comissao">Ordenar: maior comissão</option><option value="pedidos">Ordenar: mais pedidos</option>
                </select>
                <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
                  <span>Por página</span>
                  <select data-afil-por-pagina value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer">
                    {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap" data-afil-tabela>
                  <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr><th className="p-3">Afiliado</th><th className="p-3 text-right">Comissão (%)</th><th className="p-3 text-right">Pedidos</th><th className="p-3 text-right">Unid.</th><th className="p-3 text-right">Vendas</th><th className="p-3 text-right">Comissão paga</th><th className="p-3 text-right">Líquido</th><th className="p-3">Vende mais por</th><th className="p-3">Distribuição</th><th className="p-3"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {visiveis.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-slate-500">Nenhum afiliado com esse filtro.</td></tr>}
                    {visiveis.map((l) => (
                      <tr key={l.nome} data-afil-linha={l.nome} className="hover:bg-slate-800/40">
                        <td className="p-3 font-bold text-slate-100">{l.nome}{!l.definido && <span className="ml-2 text-[10px] text-amber-400 font-bold">sem comissão</span>}</td>
                        <td className="p-3 text-right" data-afil-pct-valor={l.nome}>{l.comissaoPct === null ? <span className="text-amber-400 font-bold">—</span> : `${NUM(l.comissaoPct)}%`}</td>
                        <td className="p-3 text-right">{NUM(l.pedidos)}</td>
                        <td className="p-3 text-right">{NUM(l.unidades)}</td>
                        <td className="p-3 text-right">{R$(l.receita)}</td>
                        <td className="p-3 text-right font-bold text-amber-300">{R$(l.comissao)}</td>
                        <td className="p-3 text-right font-bold text-emerald-300" data-afil-liquido={l.nome}>{l.liquido === null ? "—" : R$(l.liquido)}{l.semCusto > 0 && <span title="Há produtos sem custo cadastrado: o custo entra como R$ 0,00" className="ml-1 text-[9px] text-yellow-300 font-black">sem custo</span>}</td>
                        <td className="p-3 text-slate-200" data-afil-principal={l.nome}>{l.principal ? `${l.principal.metodo} (${PCT(l.principal.pct)})` : "—"}</td>
                        <td className="p-3 text-[11px] text-slate-400">{l.metodos.map((m) => `${m.metodo} ${PCT(m.pct)}`).join(" · ")}</td>
                        <td className="p-3 text-right"><button type="button" data-afil-ver-produtos={l.nome} onClick={() => { setSelAfil(l.nome); setTimeout(() => boxProdAfil.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} className="text-[11px] font-bold text-purple-400 hover:text-purple-300 cursor-pointer">Ver produtos</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-4" data-afil-paginacao>
                <span className="text-[11px] text-slate-500">{linhas.length === 0 ? "0 afiliados" : `${(pag - 1) * porPagina + 1}–${Math.min(pag * porPagina, linhas.length)} de ${linhas.length} afiliado(s)`}</span>
                <div className="flex items-center gap-1">
                  <button type="button" data-afil-pag-ant disabled={pag <= 1} onClick={() => setPagina(pag - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">‹ Anterior</button>
                  {botoes.map((n, i) => (
                    <React.Fragment key={n}>
                      {i > 0 && n - botoes[i - 1] > 1 && <span className="text-slate-600 px-1">…</span>}
                      <button type="button" data-afil-pag={n} onClick={() => setPagina(n)} className={`w-8 h-8 rounded-lg text-xs font-bold border cursor-pointer ${n === pag ? "bg-purple-600 border-purple-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400"}`}>{n}</button>
                    </React.Fragment>
                  ))}
                  <button type="button" data-afil-pag-prox disabled={pag >= totalPaginas} onClick={() => setPagina(pag + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">Próxima ›</button>
                </div>
              </div>
            </div>
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl" data-afil-prod-geral>
              <h3 className="text-sm font-black text-white mb-1">Produtos mais vendidos pelos afiliados (geral)</h3>
              <p className="text-[11px] text-slate-400 mb-4">Soma de todos os afiliados do mês. Não entra a venda própria da loja.</p>
              {!analise.temProdutos ? <p data-afil-sem-produtos className="text-[11px] text-amber-300 bg-amber-950/20 border border-amber-900/40 rounded-xl p-3">Este mês foi lido antes de o painel guardar os produtos. Suba de novo a planilha de vendas do mês em Uploads para liberar esta lista.</p>
                : <TabelaProdutos dado="geral" mostrarAfiliados produtos={analise.afiliados.produtos} vazio="Nenhuma venda de afiliado neste mês." />}
            </div>

            <div ref={boxProdAfil} className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl scroll-mt-6" data-afil-prod-afiliado>
              <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-black text-white mb-1">Produtos mais vendidos por afiliado</h3>
                  <p className="text-[11px] text-slate-400">Escolha o afiliado para ver o que ele mais vendeu no mês.</p>
                </div>
                {analise.linhas.length > 0 && (
                  <select data-afil-prod-select value={afilAtual?.nome || ""} onChange={(e) => setSelAfil(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none cursor-pointer max-w-xs">
                    {analise.linhas.map((l) => <option key={l.nome} value={l.nome}>{l.nome} · {R$(l.receita)}</option>)}
                  </select>
                )}
              </div>
              {!analise.temProdutos ? <p className="text-[11px] text-amber-300 bg-amber-950/20 border border-amber-900/40 rounded-xl p-3">Suba de novo a planilha de vendas do mês em Uploads para liberar os produtos de cada afiliado.</p>
                : !afilAtual ? <p className="text-[11px] text-slate-500">Nenhum afiliado vendeu neste mês.</p>
                : <TabelaProdutos key={afilAtual.nome} dado="afiliado" produtos={afilAtual.produtos} vazio="Esse afiliado não tem produtos neste mês." />}
            </div>
          </>
        )
      )}
    </div>
  );
}
