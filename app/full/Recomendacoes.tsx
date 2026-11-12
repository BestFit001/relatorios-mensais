"use client";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { normalizarSku } from "../../lib/fullMotor";

const moeda = (v: number) => "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props { canal: string; mes: string; regra: any; tinyMap: Map<string, number>; custosMap: Map<string, any>; }

// Parâmetros vindos da aba Regras (config_regras_canais.rec_*), com padrões quando o canal ainda não os tem
function parametros(regra: any) {
  const n = (v: any, p: number) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? p : Number(v));
  return {
    vendasMin: n(regra?.rec_vendas_min, 5), lucroMin: n(regra?.rec_lucro_min, 100), margemMin: n(regra?.rec_margem_min, 12),
    devMax: n(regra?.rec_dev_max, 5), dias: Math.max(1, n(regra?.rec_dias_cobertura, 30)), exigirEstoque: regra?.rec_exigir_estoque !== false,
    margemRever: n(regra?.rec_margem_rever, 5),
  };
}

export default function Recomendacoes({ canal, mes, regra, tinyMap, custosMap }: Props) {
  const [fora, setFora] = useState<any[]>([]);
  const [full, setFull] = useState<any[]>([]);
  const [skusNoFull, setSkusNoFull] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(false);
  const [visao, setVisao] = useState<"recomendados" | "todos">("recomendados");
  const [busca, setBusca] = useState("");
  const p = useMemo(() => parametros(regra), [regra]);

  useEffect(() => {
    if (!canal || !mes) return;
    let vivo = true;
    (async () => {
      setCarregando(true);
      const [a, b, c] = await Promise.all([
        supabase.from("vendas_padrao_lancamentos").select("*").eq("canal", canal).eq("mes_referencia", mes),
        supabase.from("full_lancamentos").select("*").eq("canal", canal).eq("mes_referencia", mes),
        supabase.from("estoque_cd_mensal").select("sku, estoque").eq("canal", canal).eq("mes_referencia", mes),
      ]);
      if (!vivo) return;
      setFora(a.data || []); setFull(b.data || []);
      const set = new Set<string>();
      (b.data || []).forEach((r: any) => set.add(normalizarSku(r.sku)));
      (c.data || []).forEach((r: any) => { if (Number(r.estoque) > 0) set.add(normalizarSku(r.sku)); });   // já tem estoque no Full, mesmo sem vender
      setSkusNoFull(set);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [canal, mes]);

  const candidatos = useMemo(() => {
    return fora.filter((r: any) => !skusNoFull.has(normalizarSku(r.sku))).map((r: any) => {
      const chave = normalizarSku(r.sku);
      const qtd = Number(r.qtd_vendida) || 0; const lucro = Number(r.lucro_liquido) || 0; const margem = Number(r.margem_pct) || 0;
      const dev = Number(r.taxa_devolucao) || 0; const estoque = tinyMap.get(chave) || 0;
      const falhas: string[] = [];
      if (qtd < p.vendasMin) falhas.push(`vendas ${qtd} < ${p.vendasMin}`);
      if (lucro < p.lucroMin) falhas.push(`lucro ${moeda(lucro)} < ${moeda(p.lucroMin)}`);
      if (margem < p.margemMin) falhas.push(`margem ${margem.toFixed(1)}% < ${p.margemMin}%`);
      if (dev >= p.devMax && Number(r.qtd_devolucoes) > 0) falhas.push(`devolução ${dev.toFixed(1)}% ≥ ${p.devMax}%`);
      if (p.exigirEstoque && estoque <= 0) falhas.push("sem estoque na Sede");
      const sugerido = Math.ceil((qtd / 30) * p.dias);
      const enviar = p.exigirEstoque ? Math.min(sugerido, estoque) : sugerido;
      return { ...r, chave, qtd, lucro, margem, dev, estoque, falhas, ok: falhas.length === 0, enviar, produto: r.produto || custosMap.get(chave)?.produto || "Produto Desconhecido" };
    }).sort((a: any, b: any) => (Number(b.ok) - Number(a.ok)) || (b.lucro - a.lucro));
  }, [fora, skusNoFull, tinyMap, custosMap, p]);

  const rever = useMemo(() => {
    const mapaFora = new Map<string, any>(); fora.forEach((r: any) => mapaFora.set(normalizarSku(r.sku), r));
    return full.map((r: any) => {
      const chave = normalizarSku(r.sku);
      const qtd = Number(r.qtd_vendida) || 0; const lucro = Number(r.lucro_liquido) || 0; const margem = Number(r.margem_pct) || 0; const dev = Number(r.taxa_devolucao) || 0;
      const motivos: string[] = [];
      if (lucro < 0) motivos.push("prejuízo no Full");
      else if (margem < p.margemRever) motivos.push(`margem ${margem.toFixed(1)}% < ${p.margemRever}%`);
      if (dev >= p.devMax && Number(r.qtd_devolucoes) > 0) motivos.push(`devolução ${dev.toFixed(1)}% ≥ ${p.devMax}%`);
      const f = mapaFora.get(chave);
      return { ...r, chave, qtd, lucro, margem, dev, motivos, margemFora: f ? Number(f.margem_pct) || 0 : null, qtdFora: f ? Number(f.qtd_vendida) || 0 : 0 };
    }).filter((r: any) => r.motivos.length > 0 && r.qtd > 0).sort((a: any, b: any) => a.margem - b.margem);
  }, [full, fora, p]);

  const filtrar = (lista: any[]) => {
    const t = busca.trim().toLowerCase();
    return t ? lista.filter((r: any) => String(r.sku).toLowerCase().includes(t) || String(r.produto || "").toLowerCase().includes(t)) : lista;
  };
  const recomendados = candidatos.filter((c: any) => c.ok);
  const listaCand = filtrar(visao === "recomendados" ? recomendados : candidatos);
  const lucroPotencial = recomendados.reduce((t: number, c: any) => t + c.lucro, 0);

  return (
    <div className="space-y-6 animate-in fade-in zoom-in duration-300">
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <h2 className="text-lg font-bold text-fuchsia-400 mb-1">💡 Recomendações — {canal} · {mes}</h2>
        <p className="text-[11px] text-slate-400">
          Cruza as vendas do mês que <strong className="text-slate-200">não foram Full</strong> (vindas do upload de vendas do Mercado Livre) com os parâmetros da aba Regras:
          vendas ≥ <strong className="text-slate-200">{p.vendasMin}</strong>, lucro líquido ≥ <strong className="text-slate-200">{moeda(p.lucroMin)}</strong>, margem ≥ <strong className="text-slate-200">{p.margemMin}%</strong>,
          devolução &lt; <strong className="text-slate-200">{p.devMax}%</strong>{p.exigirEstoque ? ", com estoque na Sede" : ""}. Quantidade sugerida: {p.dias} dias de venda.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-[9px] uppercase text-slate-500 font-bold">Recomendados para enviar</div><div className="text-2xl font-black text-fuchsia-300">{recomendados.length}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-[9px] uppercase text-slate-500 font-bold">Lucro líquido deles hoje</div><div className="text-2xl font-black text-emerald-300">{moeda(lucroPotencial)}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-[9px] uppercase text-slate-500 font-bold">SKUs fora do Full analisados</div><div className="text-2xl font-black text-slate-200">{candidatos.length}</div></div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3"><div className="text-[9px] uppercase text-slate-500 font-bold">Para rever no Full</div><div className="text-2xl font-black text-amber-300">{rever.length}</div></div>
        </div>
        {carregando && <p className="text-xs text-slate-400 mt-3">Carregando…</p>}
        {!carregando && fora.length === 0 && (
          <p className="text-xs text-amber-300 mt-3">Ainda não há vendas fora do Full para {canal} em {mes}. Elas são gravadas ao subir a planilha de vendas do Mercado Livre em Uploads.</p>
        )}
      </div>

      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-black text-white uppercase tracking-wider">🚀 Candidatos a enviar ao Full</h3>
          <div className="flex flex-wrap gap-2 items-center">
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar SKU ou produto" className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none" />
            <button onClick={() => setVisao("recomendados")} className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase cursor-pointer ${visao === "recomendados" ? "bg-fuchsia-600 text-white" : "bg-slate-950 text-slate-400 border border-slate-700"}`}>Só recomendados</button>
            <button onClick={() => setVisao("todos")} className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase cursor-pointer ${visao === "todos" ? "bg-fuchsia-600 text-white" : "bg-slate-950 text-slate-400 border border-slate-700"}`}>Todos (com o motivo)</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-800">
              <tr><th className="py-2 pr-3">SKU</th><th className="pr-3">Produto</th><th className="pr-3 text-right">Vendas</th><th className="pr-3 text-right">Lucro líquido</th><th className="pr-3 text-right">Margem</th><th className="pr-3 text-right">Devolução</th><th className="pr-3 text-right">Estoque Sede</th><th className="pr-3 text-right">Enviar</th><th>Situação</th></tr>
            </thead>
            <tbody>
              {listaCand.map((c: any, i: number) => (
                <tr key={i} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="py-2 pr-3 font-mono text-slate-200">{c.sku}</td>
                  <td className="pr-3 text-slate-300 max-w-[260px] truncate" title={c.produto}>{c.produto}</td>
                  <td className="pr-3 text-right font-mono">{c.qtd}</td>
                  <td className={`pr-3 text-right font-mono ${c.lucro >= 0 ? "text-emerald-300" : "text-rose-400"}`}>{moeda(c.lucro)}</td>
                  <td className="pr-3 text-right font-mono">{c.margem.toFixed(1)}%</td>
                  <td className="pr-3 text-right font-mono">{c.dev.toFixed(1)}%</td>
                  <td className="pr-3 text-right font-mono">{c.estoque}</td>
                  <td className="pr-3 text-right font-mono font-bold text-fuchsia-300">{c.ok ? c.enviar : "—"}</td>
                  <td>{c.ok ? <span className="text-emerald-300 font-bold">✅ Enviar ao Full</span> : <span className="text-slate-400">{c.falhas.join(" · ")}</span>}</td>
                </tr>
              ))}
              {listaCand.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-slate-500">{visao === "recomendados" ? "Nenhum SKU atinge os parâmetros. Veja “Todos” para o motivo ou ajuste as regras na aba Regras." : "Nada para mostrar."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <h3 className="text-sm font-black text-white uppercase tracking-wider">🔎 Rever no Full</h3>
        <p className="text-[11px] text-slate-400">SKUs que já vendem pelo Full com margem abaixo de {p.margemRever}%, prejuízo ou devolução acima de {p.devMax}%. Se o mesmo SKU também vendeu fora do Full, a margem de lá aparece para comparar.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-800">
              <tr><th className="py-2 pr-3">SKU</th><th className="pr-3">Produto</th><th className="pr-3 text-right">Vendas Full</th><th className="pr-3 text-right">Lucro</th><th className="pr-3 text-right">Margem Full</th><th className="pr-3 text-right">Margem fora do Full</th><th>Motivo</th></tr>
            </thead>
            <tbody>
              {filtrar(rever).map((r: any, i: number) => (
                <tr key={i} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="py-2 pr-3 font-mono text-slate-200">{r.sku}</td>
                  <td className="pr-3 text-slate-300 max-w-[260px] truncate" title={r.produto}>{r.produto}</td>
                  <td className="pr-3 text-right font-mono">{r.qtd}</td>
                  <td className={`pr-3 text-right font-mono ${r.lucro >= 0 ? "text-emerald-300" : "text-rose-400"}`}>{moeda(r.lucro)}</td>
                  <td className="pr-3 text-right font-mono">{r.margem.toFixed(1)}%</td>
                  <td className="pr-3 text-right font-mono">{r.margemFora === null ? "—" : `${r.margemFora.toFixed(1)}% (${r.qtdFora} un.)`}</td>
                  <td className="text-amber-300">{r.motivos.join(" · ")}</td>
                </tr>
              ))}
              {rever.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-500">Nenhum SKU do Full precisa de revisão.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
