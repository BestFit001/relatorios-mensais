"use client";
// Mapa de Cadastros > SKUs para exclusão: a lista de SKUs marcados "Para exclusão" e, por canal, a caixinha que marca quando o SKU
// já foi excluído dali. Onde o SKU não está cadastrado no canal aparece ❌ (nada a excluir), como no resto do Mapa.
import React, { useEffect, useMemo, useState } from "react";
import { carregarExclusoesCanal, chaveExclusaoCanal, marcarExclusaoCanal } from "../../lib/skusExclusao";
import { normalizarSkuPai, paiDoSku } from "../../lib/skuPai";

type ItemMapa = { sku: string; estoque: number; status: string; pres: boolean[]; nome: string; marca: string };
type Props = { itens: ItemMapa[]; visiveis: { canal: string; i: number }[]; paraExclusao: Set<string>; loading: boolean; paiManual?: Map<string, string> };
type Visao = "filhos" | "pais" | "pais_filhos";
type Linha = { norm: string; item: ItemMapa | null };
type Grupo = { pai: string; filhos: Linha[]; pend: boolean };

const fmtInt = (n: number) => n.toLocaleString("pt-BR");

export default function SkusParaExclusao({ itens, visiveis, paraExclusao, loading, paiManual }: Props) {
  const [visao, setVisao] = useState<Visao>("filhos");
  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<"TODOS" | "PENDENTES" | "CONCLUIDOS">("PENDENTES");
  const [porPagina, setPorPagina] = useState(50);
  const [pag, setPag] = useState(1);

  useEffect(() => { carregarExclusoesCanal().then((s) => { setFeitos(s); setCarregado(true); }); }, []);

  // um registro por SKU da lista (com os dados do cadastro quando ele existe na base)
  const linhas = useMemo(() => {
    const porNorm = new Map<string, ItemMapa>();
    for (const it of itens) porNorm.set(normalizarSkuPai(it.sku), it);
    return Array.from(paraExclusao).sort().map((norm) => ({ norm, item: porNorm.get(norm) || null }));
  }, [itens, paraExclusao]);

  const pendente = (norm: string, item: ItemMapa | null) => !!item && visiveis.some((v) => item.pres[v.i] && !feitos.has(chaveExclusaoCanal(norm, v.canal)));

  const resumo = useMemo(() => {
    const porCanal = visiveis.map((v) => ({ canal: v.canal, presentes: 0, feitos: 0 }));
    let pend = 0;
    for (const l of linhas) {
      if (pendente(l.norm, l.item)) pend++;
      visiveis.forEach((v, k) => { if (l.item?.pres[v.i]) { porCanal[k].presentes++; if (feitos.has(chaveExclusaoCanal(l.norm, v.canal))) porCanal[k].feitos++; } });
    }
    return { pend, porCanal };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, visiveis, feitos]);

  const termos = useMemo(() => busca.split(",").map((t) => t.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()).filter(Boolean), [busca]);
  const filtradas = useMemo(() => linhas.filter((l) => {
    if (situacao !== "TODOS" && pendente(l.norm, l.item) !== (situacao === "PENDENTES")) return false;
    if (termos.length > 0 && !termos.some((t) => l.norm.includes(t) || (l.item?.nome || "").toLowerCase().replace(/[^a-z0-9]/g, "").includes(t))) return false;
    return true;
  }), // eslint-disable-next-line react-hooks/exhaustive-deps
  [linhas, situacao, termos, feitos, visiveis]);

  // Visão por pai: os SKUs da lista agrupados pelo pai (ajuste manual ou 5 primeiros dígitos). O pai está "pendente" se algum filho da lista está.
  const grupos = useMemo<Grupo[]>(() => {
    const m = new Map<string, Linha[]>();
    for (const l of linhas) { const pai = paiDoSku(l.norm, paiManual); const a = m.get(pai); if (a) a.push(l); else m.set(pai, [l]); }
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([pai, filhos]) => ({ pai, filhos, pend: filhos.some((f) => pendente(f.norm, f.item)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, paiManual, feitos, visiveis]);
  const gruposFiltrados = useMemo(() => grupos.filter((g) => {
    if (situacao !== "TODOS" && g.pend !== (situacao === "PENDENTES")) return false;
    if (termos.length > 0 && !termos.some((t) => g.pai.includes(t) || g.filhos.some((f) => f.norm.includes(t) || (f.item?.nome || "").toLowerCase().replace(/[^a-z0-9]/g, "").includes(t)))) return false;
    return true;
  }), [grupos, situacao, termos]);
  const pendPais = grupos.filter((g) => g.pend).length;

  const porPai = visao !== "filhos";
  const totalUnidades = porPai ? gruposFiltrados.length : filtradas.length;
  const paginas = Math.max(1, Math.ceil(totalUnidades / porPagina));
  const atual = Math.min(pag, paginas);
  const pagina = filtradas.slice((atual - 1) * porPagina, atual * porPagina);
  const paginaGrupos = gruposFiltrados.slice((atual - 1) * porPagina, atual * porPagina);

  // Caixinha do pai: vale para todos os filhos dele que existem naquele canal
  const alternarPai = async (g: Grupo, canal: string, marcar: boolean) => {
    const alvos = g.filhos.filter((f) => f.item?.pres[visiveis.find((v) => v.canal === canal)!.i]);
    await Promise.all(alvos.filter((f) => feitos.has(chaveExclusaoCanal(f.norm, canal)) !== marcar).map((f) => alternar(f.norm, canal, marcar)));
  };

  const alternar = async (norm: string, canal: string, marcar: boolean) => {
    const k = chaveExclusaoCanal(norm, canal);
    setFeitos((s) => { const n = new Set(s); if (marcar) n.add(k); else n.delete(k); return n; });   // otimista; volta se não salvar
    const e = await marcarExclusaoCanal(norm, canal, marcar);
    if (e) {
      setFeitos((s) => { const n = new Set(s); if (marcar) n.delete(k); else n.add(k); return n; });
      setErro(e);
    } else setErro("");
  };

  const classeFiltro = (ativo: boolean) => `px-3 py-2 rounded-xl text-[11px] font-bold border cursor-pointer ${ativo ? "bg-amber-600 border-amber-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white"}`;

  const celulaCanal = (norm: string, item: ItemMapa | null, v: { canal: string; i: number }) => {
    const k = chaveExclusaoCanal(norm, v.canal);
    const presente = !!item?.pres[v.i];
    return (
      <td key={v.canal} className="p-3.5 text-center">
        {presente ? (
          <label className="inline-flex items-center gap-1.5 cursor-pointer" title={feitos.has(k) ? "Excluído deste canal (clique para desfazer)" : "Marque quando excluir o SKU deste canal"}>
            <input type="checkbox" data-excluido={`${norm}|${v.canal}`} checked={feitos.has(k)} onChange={(e) => alternar(norm, v.canal, e.target.checked)} className="w-4 h-4 accent-emerald-500 cursor-pointer" />
            <span className={`text-[10px] font-bold ${feitos.has(k) ? "text-emerald-400" : "text-amber-300"}`}>{feitos.has(k) ? "excluído" : "pendente"}</span>
          </label>
        ) : <span data-sem-canal className="text-rose-500/60 text-sm">❌</span>}
      </td>
    );
  };

  const linhaFilho = ({ norm, item }: Linha, recuado: boolean) => {
    const pend = pendente(norm, item);
    return (
      <tr key={(recuado ? "f_" : "") + norm} data-sku-exclusao={norm} className={`hover:bg-slate-800/40 ${pend ? "" : "bg-emerald-950/10"}`}>
        <td className={`p-3.5 ${recuado ? "pl-9" : ""}`}>
          <span className="font-mono font-bold text-slate-200">{recuado && <span className="text-slate-600 mr-1">└</span>}{item?.sku || norm.toUpperCase()}</span>
          {item?.nome && <span className="block text-[10px] text-slate-400 max-w-[300px] truncate">{item.nome}</span>}
          {!item && <span className="block text-[10px] text-slate-500">fora da base de cadastros</span>}
        </td>
        <td className="p-3.5 text-center">{item ? <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.status === "Obsoleto" ? "bg-rose-950/60 text-rose-400 border border-rose-900/50" : "bg-emerald-950/60 text-emerald-400 border border-emerald-900/50"}`}>{item.status}</span> : "—"}</td>
        <td className={`p-3.5 text-right font-bold ${item && item.estoque > 0 ? "text-indigo-400" : "text-slate-500"}`}>{item ? item.estoque : "—"}</td>
        {visiveis.map((v) => celulaCanal(norm, item, v))}
      </tr>
    );
  };

  const linhaPai = (g: Grupo) => {
    const estoque = g.filhos.reduce((n, f) => n + (f.item?.estoque || 0), 0);
    const nome = g.filhos.find((f) => f.item?.nome)?.item?.nome || "";
    const pendentes = g.filhos.filter((f) => pendente(f.norm, f.item)).length;
    return (
      <tr key={"pai_" + g.pai} data-pai-exclusao={g.pai} className={`${g.pend ? "bg-slate-800/50" : "bg-emerald-950/20"} ${visao === "pais_filhos" ? "border-t-2 border-slate-700" : ""}`}>
        <td className="p-3.5">
          <span className="font-mono font-black text-white">{g.pai.toUpperCase()}</span> <span className="ml-1 px-1.5 py-0.5 rounded bg-indigo-950/70 border border-indigo-900/60 text-[9px] font-bold text-indigo-300">PAI</span>
          <span className="block text-[10px] text-slate-400 max-w-[300px] truncate">{g.filhos.length} filho(s) na lista{pendentes > 0 ? ` · ${pendentes} com exclusão pendente` : " · todos concluídos"}{nome ? ` · ${nome}` : ""}</span>
        </td>
        <td className="p-3.5 text-center text-slate-500">—</td>
        <td className={`p-3.5 text-right font-bold ${estoque > 0 ? "text-indigo-400" : "text-slate-500"}`}>{estoque}</td>
        {visiveis.map((v) => {
          const presentes = g.filhos.filter((f) => f.item?.pres[v.i]);
          if (presentes.length === 0) return <td key={v.canal} className="p-3.5 text-center"><span data-sem-canal className="text-rose-500/60 text-sm">❌</span></td>;
          const feitosN = presentes.filter((f) => feitos.has(chaveExclusaoCanal(f.norm, v.canal))).length;
          const todos = feitosN === presentes.length;
          return (
            <td key={v.canal} className="p-3.5 text-center">
              <label className="inline-flex items-center gap-1.5 cursor-pointer" title={todos ? "Todos os filhos excluídos deste canal (clique para desfazer)" : "Marca todos os filhos deste pai neste canal"}>
                <input type="checkbox" data-excluido-pai={`${g.pai}|${v.canal}`} checked={todos} ref={(el) => { if (el) el.indeterminate = feitosN > 0 && !todos; }} onChange={(e) => alternarPai(g, v.canal, e.target.checked)} className="w-4 h-4 accent-emerald-500 cursor-pointer" />
                <span className={`text-[10px] font-bold ${todos ? "text-emerald-400" : "text-amber-300"}`}>{feitosN}/{presentes.length}</span>
              </label>
            </td>
          );
        })}
      </tr>
    );
  };

  if (loading || !carregado) return <p className="p-10 text-center text-slate-400 font-medium bg-slate-900/90 rounded-2xl border border-slate-800">Carregando…</p>;
  if (paraExclusao.size === 0) return <div data-sem-exclusao className="p-10 text-center text-sm text-slate-500 bg-slate-900/90 rounded-2xl border border-slate-800">Nenhum SKU marcado como “Para exclusão”. Suba a planilha em ⚙️ Configurações &gt; Produtos para exclusão.</div>;

  return (
    <div className="space-y-6" data-skus-exclusao>
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <h2 className="text-lg font-bold text-white">SKUs para exclusão</h2>
        <p className="text-xs text-slate-400 mt-1 mb-5 max-w-3xl">Marque a caixinha quando o SKU for excluído do canal. O ❌ aparece onde o SKU não está cadastrado (não há o que excluir). O SKU sai de “Pendentes” quando todas as caixinhas dos canais em que ele existe estiverem marcadas.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4"><div className="text-[11px] font-bold text-slate-400">SKUs na lista</div><div data-total-lista className="text-2xl font-black text-amber-400 mt-1">{fmtInt(linhas.length)}</div><div data-total-pais className="text-[10px] text-slate-500 mt-0.5">de {fmtInt(grupos.length)} pai(s)</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4"><div className="text-[11px] font-bold text-slate-400">Com exclusão pendente</div><div data-total-pendentes className="text-2xl font-black text-rose-400 mt-1">{fmtInt(resumo.pend)}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4"><div className="text-[11px] font-bold text-slate-400">Concluídos</div><div className="text-2xl font-black text-emerald-400 mt-1">{fmtInt(linhas.length - resumo.pend)}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4"><div className="text-[11px] font-bold text-slate-400">Fora da base de cadastros</div><div className="text-2xl font-black text-slate-300 mt-1">{fmtInt(linhas.filter((l) => !l.item).length)}</div></div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl overflow-hidden border border-slate-700" data-visao-exclusao role="group" aria-label="Visualizar por">
            {([["filhos", "Filhos"], ["pais", "Pais"], ["pais_filhos", "Pais e filhos"]] as [Visao, string][]).map(([v, n]) => (
              <button key={v} type="button" data-visao={v} onClick={() => { setVisao(v); setPag(1); }} className={`px-3 py-2 text-[11px] font-bold cursor-pointer ${visao === v ? "bg-indigo-600 text-white" : "bg-slate-950 text-slate-400 hover:text-white"}`}>{n}</button>
            ))}
          </div>
          <input data-busca-exclusao value={busca} onChange={(e) => { setBusca(e.target.value); setPag(1); }} placeholder="Buscar SKU ou produto (separe por vírgula)…" className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-amber-500 w-72" />
          <button type="button" data-sit="PENDENTES" onClick={() => { setSituacao("PENDENTES"); setPag(1); }} className={classeFiltro(situacao === "PENDENTES")}>Pendentes ({fmtInt(porPai ? pendPais : resumo.pend)})</button>
          <button type="button" data-sit="CONCLUIDOS" onClick={() => { setSituacao("CONCLUIDOS"); setPag(1); }} className={classeFiltro(situacao === "CONCLUIDOS")}>Concluídos ({fmtInt(porPai ? grupos.length - pendPais : linhas.length - resumo.pend)})</button>
          <button type="button" data-sit="TODOS" onClick={() => { setSituacao("TODOS"); setPag(1); }} className={classeFiltro(situacao === "TODOS")}>Todos ({fmtInt(porPai ? grupos.length : linhas.length)})</button>
        </div>
        {erro && <p data-erro-exclusao className="mt-3 text-xs font-bold text-rose-400">{erro}</p>}
      </div>

      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs" data-tabela-exclusao>
            <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3.5 min-w-[240px]">SKU</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-right">Estoque</th>
                {resumo.porCanal.map((c) => (
                  <th key={c.canal} className="p-3.5 text-center normal-case"><div className="uppercase">{c.canal}</div><div className="text-[10px] font-semibold text-slate-500">{fmtInt(c.feitos)}/{fmtInt(c.presentes)} excluídos</div></th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {totalUnidades === 0 && <tr><td colSpan={3 + visiveis.length} className="p-8 text-center text-slate-500">Nenhum {porPai ? "pai" : "SKU"} {situacao === "PENDENTES" ? "pendente" : situacao === "CONCLUIDOS" ? "concluído" : ""} com esse filtro.</td></tr>}
              {!porPai && pagina.map((l) => linhaFilho(l, false))}
              {porPai && paginaGrupos.map((g) => (
                <React.Fragment key={g.pai}>
                  {linhaPai(g)}
                  {visao === "pais_filhos" && g.filhos.map((f) => linhaFilho(f, true))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-t border-slate-800">
          <span className="text-[11px] text-slate-500">{totalUnidades === 0 ? (porPai ? "0 pais" : "0 SKUs") : `${(atual - 1) * porPagina + 1}–${Math.min(atual * porPagina, totalUnidades)} de ${fmtInt(totalUnidades)} ${porPai ? "pai(s)" : "SKU(s)"}`}</span>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <select value={porPagina} onChange={(e) => { setPorPagina(Number(e.target.value)); setPag(1); }} className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer">{[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n} por página</option>)}</select>
            <button type="button" disabled={atual <= 1} onClick={() => setPag(atual - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">‹ Anterior</button>
            <span>{atual}/{paginas}</span>
            <button type="button" disabled={atual >= paginas} onClick={() => setPag(atual + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">Próxima ›</button>
          </div>
        </div>
      </div>
    </div>
  );
}
