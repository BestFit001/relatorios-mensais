"use client";
// Relatórios > Afiliados: quanto foi vendido por afiliados e pela própria loja (vendas APROVADAS da mesma planilha que alimenta o
// dashboard), a comissão paga a cada afiliado e como cada um vende (vídeo, live...). As colunas, os perfis próprios e as comissões ficam aqui.
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { numeroBR } from "../../lib/adsImport";
import {
  analisarAfiliados, mesclarCfgAfiliados, normHandle, padraoAfiliados, type CfgAfiliados, type LinhaAfiliado, type Metodo, type VendasAfiliadosMes,
} from "../../lib/afiliados";
import { carregarCfgAfiliados, carregarVendasAfiliados, salvarCfgAfiliados } from "../../lib/afiliadosDb";

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

export default function AfiliadosAds({ canal, mes, setMes, meses }: Props) {
  const padrao = padraoAfiliados(canal);
  const [cfg, setCfg] = useState<CfgAfiliados>(padrao);
  const [dados, setDados] = useState<VendasAfiliadosMes | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<"painel" | "config">("painel");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  // configuração (rascunho das colunas e dos perfis próprios: só valem ao salvar)
  const [colConteudo, setColConteudo] = useState(padrao.colConteudo);
  const [colAfiliado, setColAfiliado] = useState(padrao.colAfiliado);
  const [perfis, setPerfis] = useState(padrao.perfisProprios.join(", "));
  const [novoNome, setNovoNome] = useState("");
  const [novaComissao, setNovaComissao] = useState("");
  // tabela
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "sem_comissao">("todos");
  const [ordem, setOrdem] = useState<"receita" | "comissao" | "pedidos">("receita");
  const [porPagina, setPorPagina] = useState(10);
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<Record<string, string>>({});

  useEffect(() => {
    let ativo = true;
    (async () => {
      const c = await carregarCfgAfiliados(supabase, canal);
      if (!ativo) return;
      setCfg(c); setColConteudo(c.colConteudo); setColAfiliado(c.colAfiliado); setPerfis(c.perfisProprios.join(", "));
    })();
    return () => { ativo = false; };
  }, [canal]);
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    (async () => { const d = await carregarVendasAfiliados(supabase, canal, mes); if (ativo) { setDados(d); setCarregando(false); } })();
    return () => { ativo = false; };
  }, [canal, mes]);

  const gravar = async (nova: CfgAfiliados, aviso: string) => {
    setCfg(nova);
    const erro = await salvarCfgAfiliados(supabase, canal, nova);
    setMsg(erro ? { tipo: "erro", texto: erro } : { tipo: "ok", texto: aviso });
  };
  const definirComissao = async (nome: string, texto: string) => {
    const n = normHandle(nome); const pct = numeroBR(texto);
    if (!n) return;
    const resto = cfg.afiliados.filter((a) => normHandle(a.nome) !== n);
    await gravar({ ...cfg, afiliados: [...resto, { nome: n, comissaoPct: Math.max(0, pct) }].sort((a, b) => a.nome.localeCompare(b.nome)) }, `Comissão de ${n} salva: ${NUM(pct)}%.`);
  };
  const removerAfiliado = async (nome: string) => gravar({ ...cfg, afiliados: cfg.afiliados.filter((a) => normHandle(a.nome) !== normHandle(nome)) }, `${nome} removido da lista de comissões.`);
  const adicionarAfiliado = async () => {
    if (!normHandle(novoNome) || novaComissao.trim() === "") { setMsg({ tipo: "erro", texto: "Informe o nome do afiliado e a comissão (%)." }); return; }
    await definirComissao(novoNome, novaComissao); setNovoNome(""); setNovaComissao("");
  };
  const salvarColunas = async () => {
    const lista = Array.from(new Set(perfis.split(/[,;\n]+/).map(normHandle).filter(Boolean)));
    await gravar(mesclarCfgAfiliados({ ...cfg, colConteudo: colConteudo.trim(), colAfiliado: colAfiliado.trim(), perfisProprios: lista }, padrao), "Configuração salva. As colunas valem a partir do próximo upload de vendas deste canal; os perfis próprios e as comissões valem já.");
  };

  const analise = useMemo(() => (dados ? analisarAfiliados(dados, cfg) : null), [dados, cfg]);
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
  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-purple-500";

  return (
    <div className="space-y-6" data-afiliados-ads>
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">🤝 Afiliados — {canal}</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">Usa as vendas aprovadas da mesma planilha de vendas do dashboard (canceladas e não faturadas ficam de fora). Mostra o que foi vendido por afiliados e pela própria loja, a comissão paga e o método de venda (vídeo, live…).</p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mês de competência</label>
            <select data-afil-mes value={mes} onChange={(e) => setMes(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none cursor-pointer">
              {meses.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          {([["painel", "📊 Painel"], ["config", "⚙️ Afiliados e colunas"]] as const).map(([id, rotulo]) => (
            <button key={id} type="button" data-afil-sub={id} onClick={() => { setAba(id); setMsg(null); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border ${aba === id ? "bg-purple-600 border-purple-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white"}`}>{rotulo}</button>
          ))}
        </div>
        {msg && <p data-afil-msg className={`mt-3 text-xs font-bold ${msg.tipo === "ok" ? "text-emerald-400" : "text-rose-400"}`}>{msg.texto}</p>}
      </div>

      {aba === "config" && (
        <div className="space-y-6" data-afil-config>
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
            <h3 className="text-sm font-black text-white mb-1">1. Colunas da planilha de vendas</h3>
            <p className="text-[11px] text-slate-400 mb-4">Informe a letra da coluna (ex.: BG) ou o nome do cabeçalho. Valem a partir do próximo upload de vendas deste canal (Uploads), porque é nesse momento que a planilha é lida.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Coluna do método de venda (vídeo ou live)</label>
                <input data-afil-cfg="colConteudo" value={colConteudo} onChange={(e) => setColConteudo(e.target.value)} placeholder="Ex.: BG" className={inputCls} /></div>
              <div><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Coluna do nome do afiliado</label>
                <input data-afil-cfg="colAfiliado" value={colAfiliado} onChange={(e) => setColAfiliado(e.target.value)} placeholder="Ex.: BH" className={inputCls} /></div>
              <div className="md:col-span-2"><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Perfis da própria loja (vendas deles não pagam comissão)</label>
                <input data-afil-cfg="perfis" value={perfis} onChange={(e) => setPerfis(e.target.value)} placeholder="Ex.: use.bestfit" className={inputCls} />
                <p className="text-[10px] text-slate-500 mt-0.5">Separe por vírgula. Vendas sem nome de afiliado (ex.: product cards) também contam como venda própria.</p></div>
            </div>
            <button type="button" data-afil-salvar-cols onClick={salvarColunas} className="mt-4 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">Salvar configuração</button>
          </div>

          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
            <h3 className="text-sm font-black text-white mb-1">2. Afiliados e comissão</h3>
            <p className="text-[11px] text-slate-400 mb-4">Nome do afiliado exatamente como aparece na coluna da planilha (ex.: roh_ugc) e a comissão sobre o valor vendido. A comissão também pode ser definida direto na tabela do painel.</p>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nome do afiliado</label>
                <input data-afil-novo-nome value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: roh_ugc" className="w-60 bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-purple-500" /></div>
              <div><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Comissão (%)</label>
                <input data-afil-novo-pct value={novaComissao} onChange={(e) => setNovaComissao(e.target.value)} placeholder="8" className="w-28 bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-purple-500" /></div>
              <button type="button" data-afil-adicionar onClick={adicionarAfiliado} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold py-2.5 px-5 rounded-xl text-xs cursor-pointer">Adicionar afiliado</button>
            </div>
            {cfg.afiliados.length === 0 ? <p data-afil-lista-vazia className="text-[11px] text-slate-500">Nenhum afiliado com comissão definida ainda.</p> : (
              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs" data-afil-lista>
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px]"><tr><th className="p-3">Afiliado</th><th className="p-3 text-right">Comissão (%)</th><th className="p-3"></th></tr></thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {cfg.afiliados.map((a) => (
                      <tr key={a.nome} data-afil-cad={a.nome}>
                        <td className="p-3 font-bold text-slate-100">{a.nome}</td>
                        <td className="p-3 text-right"><input key={a.comissaoPct} defaultValue={String(a.comissaoPct).replace(".", ",")} onBlur={(e) => { if (numeroBR(e.target.value) !== a.comissaoPct) definirComissao(a.nome, e.target.value); }} className="w-24 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-right text-white outline-none focus:border-purple-500" /></td>
                        <td className="p-3 text-right"><button type="button" onClick={() => removerAfiliado(a.nome)} className="text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer">Remover</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {aba === "painel" && (
        carregando ? <p className="p-8 text-center text-slate-400">Carregando…</p>
        : !dados || !analise ? (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 text-center text-sm text-slate-400" data-afil-vazio>
            Ainda não há vendas de afiliados lidas para {canal} em {mes}. Suba a planilha de vendas do canal em Uploads (a mesma do dashboard): ela é lida junto, usando as colunas definidas em “Afiliados e colunas”.
            {!cfg.colAfiliado && !cfg.colConteudo && <span className="block mt-2 text-amber-300">As colunas do método e do afiliado ainda não foram definidas para este canal.</span>}
          </div>
        ) : (
          <>
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3" data-afil-resumo>
                {card("Vendas aprovadas", R$(analise.total.receita), `${NUM(analise.total.pedidos)} pedidos · ${NUM(analise.total.unidades)} un.`)}
                {card("Vendas por afiliados", R$(analise.afiliados.receita), `${PCT(analise.afiliados.pct)} do total · ${NUM(analise.afiliados.pedidos)} pedidos`, "text-purple-300")}
                {card("Vendas próprias (nós)", R$(analise.proprias.receita), `${PCT(analise.proprias.pct)} do total · ${NUM(analise.proprias.pedidos)} pedidos`)}
                {card("Comissão paga", R$(analise.afiliados.comissao), analise.afiliados.receita > 0 ? `${PCT(analise.afiliados.comissao / analise.afiliados.receita)} das vendas de afiliados` : "—", "text-amber-300")}
                {card("Afiliados que venderam", String(analise.afiliados.quantos), analise.afiliados.semComissao > 0 ? `${analise.afiliados.semComissao} sem comissão definida` : "todos com comissão", analise.afiliados.semComissao > 0 ? "text-amber-300" : "text-white")}
                {card("Pedido médio (afiliados)", R$(analise.afiliados.pedidos > 0 ? analise.afiliados.receita / analise.afiliados.pedidos : 0), "vendas ÷ pedidos")}
              </div>
              <p className="text-[10px] text-slate-500 mt-3">Planilha lida em {quando(dados.atualizadoEm)} (método na coluna {dados.colConteudo || "—"}, afiliado na coluna {dados.colAfiliado || "—"}). Comissão = % definido × valor vendido do afiliado.</p>
              {analise.afiliados.semComissao > 0 && (
                <p data-afil-aviso className="mt-3 text-[11px] text-amber-300 bg-amber-950/20 border border-amber-900/40 rounded-xl p-3">⚠ {analise.afiliados.semComissao} afiliado(s) sem comissão definida: estão com comissão R$ 0,00 até você informar o % na tabela abaixo ou em “Afiliados e colunas”.</p>
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
                    <tr><th className="p-3">Afiliado</th><th className="p-3 text-right">Comissão (%)</th><th className="p-3 text-right">Pedidos</th><th className="p-3 text-right">Unid.</th><th className="p-3 text-right">Vendas</th><th className="p-3 text-right">Comissão paga</th><th className="p-3">Vende mais por</th><th className="p-3">Distribuição</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {visiveis.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-500">Nenhum afiliado com esse filtro.</td></tr>}
                    {visiveis.map((l) => (
                      <tr key={l.nome} data-afil-linha={l.nome} className="hover:bg-slate-800/40">
                        <td className="p-3 font-bold text-slate-100">{l.nome}{!l.definido && <span className="ml-2 text-[10px] text-amber-400 font-bold">sem comissão</span>}</td>
                        <td className="p-3 text-right">
                          <input data-afil-pct={l.nome} inputMode="decimal" placeholder="definir %" value={editando[l.nome] ?? (l.comissaoPct === null ? "" : String(l.comissaoPct).replace(".", ","))}
                            onChange={(e) => setEditando((x) => ({ ...x, [l.nome]: e.target.value }))}
                            onBlur={() => { const t = editando[l.nome]; setEditando((x) => { const { [l.nome]: _, ...r } = x; return r; }); if (t !== undefined && t.trim() !== "" && numeroBR(t) !== l.comissaoPct) definirComissao(l.nome, t); }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            className={`w-24 text-right bg-slate-950 border rounded-lg p-1.5 text-xs text-white outline-none focus:border-purple-500 ${l.definido ? "border-slate-700" : "border-amber-700"}`} />
                        </td>
                        <td className="p-3 text-right">{NUM(l.pedidos)}</td>
                        <td className="p-3 text-right">{NUM(l.unidades)}</td>
                        <td className="p-3 text-right">{R$(l.receita)}</td>
                        <td className="p-3 text-right font-bold text-amber-300">{R$(l.comissao)}</td>
                        <td className="p-3 text-slate-200" data-afil-principal={l.nome}>{l.principal ? `${l.principal.metodo} (${PCT(l.principal.pct)})` : "—"}</td>
                        <td className="p-3 text-[11px] text-slate-400">{l.metodos.map((m) => `${m.metodo} ${PCT(m.pct)}`).join(" · ")}</td>
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
          </>
        )
      )}
    </div>
  );
}
