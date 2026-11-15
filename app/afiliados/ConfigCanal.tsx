"use client";
// Afiliados > Configurações > (canal): colunas da planilha de vendas, perfis da própria loja e comissão de cada afiliado.
// O painel do canal (Relatórios > Afiliados > canal) só mostra os dados; tudo que se define fica aqui.
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { numeroBR } from "../../lib/adsImport";
import { mesclarCfgAfiliados, normHandle, padraoAfiliados, type CfgAfiliados } from "../../lib/afiliados";
import { carregarCfgAfiliados, listarAfiliadosVistos, salvarCfgAfiliados } from "../../lib/afiliadosDb";

const R$ = (v: number) => "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM = (v: number) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-purple-500";
const rotuloCls = "block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1";

export default function ConfigCanalAfiliados({ canal }: { canal: string }) {
  const padrao = padraoAfiliados(canal);
  const [cfg, setCfg] = useState<CfgAfiliados>(padrao);
  const [vistos, setVistos] = useState<{ nome: string; receita: number }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [colConteudo, setColConteudo] = useState(padrao.colConteudo);
  const [colAfiliado, setColAfiliado] = useState(padrao.colAfiliado);
  const [colProduto, setColProduto] = useState(padrao.colProduto);
  const [perfis, setPerfis] = useState(padrao.perfisProprios.join(", "));
  const [novoNome, setNovoNome] = useState("");
  const [novaComissao, setNovaComissao] = useState("");

  useEffect(() => {
    let ativo = true;
    setCarregando(true); setMsg(null);
    (async () => {
      const [c, v] = await Promise.all([carregarCfgAfiliados(supabase, canal), listarAfiliadosVistos(supabase, canal)]);
      if (!ativo) return;
      setCfg(c); setVistos(v); setColConteudo(c.colConteudo); setColAfiliado(c.colAfiliado); setColProduto(c.colProduto); setPerfis(c.perfisProprios.join(", ")); setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [canal]);

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
  const removerComissao = async (nome: string) => gravar({ ...cfg, afiliados: cfg.afiliados.filter((a) => normHandle(a.nome) !== normHandle(nome)) }, `Comissão de ${nome} removida.`);
  const adicionar = async () => {
    if (!normHandle(novoNome) || novaComissao.trim() === "") { setMsg({ tipo: "erro", texto: "Informe o nome do afiliado e a comissão (%)." }); return; }
    await definirComissao(novoNome, novaComissao); setNovoNome(""); setNovaComissao("");
  };
  const salvarColunas = async () => {
    const lista = Array.from(new Set(perfis.split(/[,;\n]+/).map(normHandle).filter(Boolean)));
    await gravar(mesclarCfgAfiliados({ ...cfg, colConteudo: colConteudo.trim(), colAfiliado: colAfiliado.trim(), colProduto: colProduto.trim(), perfisProprios: lista }, padrao), "Configuração salva. As colunas valem a partir do próximo upload de vendas deste canal; os perfis próprios e as comissões valem já.");
  };

  // quem aparece na lista: os que já têm comissão + os que apareceram nas planilhas (menos os perfis da loja)
  const linhas = useMemo(() => {
    const proprios = new Set(cfg.perfisProprios.map(normHandle));
    const m = new Map<string, { nome: string; pct: number | null; receita: number }>();
    cfg.afiliados.forEach((a) => m.set(normHandle(a.nome), { nome: normHandle(a.nome), pct: a.comissaoPct, receita: 0 }));
    vistos.forEach((v) => { const n = normHandle(v.nome); if (proprios.has(n)) return; const x = m.get(n); if (x) x.receita = v.receita; else m.set(n, { nome: n, pct: null, receita: v.receita }); });
    return Array.from(m.values()).sort((a, b) => (a.pct === null ? 0 : 1) - (b.pct === null ? 0 : 1) || b.receita - a.receita || a.nome.localeCompare(b.nome));
  }, [cfg, vistos]);
  const semComissao = linhas.filter((l) => l.pct === null).length;

  if (carregando) return <p className="p-6 text-sm text-slate-400">Carregando…</p>;
  return (
    <div className="space-y-6" data-afil-config>
      {msg && <p data-afil-msg className={`text-xs font-bold ${msg.tipo === "ok" ? "text-emerald-400" : "text-rose-400"}`}>{msg.texto}</p>}
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <h3 className="text-sm font-black text-white mb-1">Colunas da planilha de vendas</h3>
        <p className="text-[11px] text-slate-400 mb-4">Informe a letra da coluna (ex.: BG) ou o nome do cabeçalho. Valem a partir do próximo upload de vendas deste canal (Uploads), porque é nesse momento que a planilha é lida.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div><label className={rotuloCls}>Coluna do método de venda (vídeo ou live)</label>
            <input data-afil-cfg="colConteudo" value={colConteudo} onChange={(e) => setColConteudo(e.target.value)} placeholder="Ex.: BG" className={inputCls} /></div>
          <div><label className={rotuloCls}>Coluna do nome do afiliado</label>
            <input data-afil-cfg="colAfiliado" value={colAfiliado} onChange={(e) => setColAfiliado(e.target.value)} placeholder="Ex.: BH" className={inputCls} /></div>
          <div><label className={rotuloCls}>Coluna do nome do produto (opcional)</label>
            <input data-afil-cfg="colProduto" value={colProduto} onChange={(e) => setColProduto(e.target.value)} placeholder="Ex.: I" className={inputCls} />
            <p className="text-[10px] text-slate-500 mt-0.5">Só é usada para os produtos que ainda não estão na base de custos; os demais mostram o nome da base.</p></div>
          <div className="md:col-span-2"><label className={rotuloCls}>Perfis da própria loja (vendas deles não pagam comissão)</label>
            <input data-afil-cfg="perfis" value={perfis} onChange={(e) => setPerfis(e.target.value)} placeholder="Ex.: use.bestfit" className={inputCls} />
            <p className="text-[10px] text-slate-500 mt-0.5">Separe por vírgula. Vendas sem nome de afiliado (ex.: product cards) também contam como venda própria.</p></div>
        </div>
        <button type="button" data-afil-salvar-cols onClick={salvarColunas} className="mt-4 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">Salvar colunas e perfis</button>
      </div>

      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <h3 className="text-sm font-black text-white mb-1">Comissão de cada afiliado</h3>
        <p className="text-[11px] text-slate-400 mb-4">Os afiliados que já apareceram nas planilhas de vendas lidas ficam listados aqui: é só informar o % de cada um (comissão sobre o valor vendido). Se um afiliado ainda não apareceu, adicione pelo nome exato da planilha (ex.: roh_ugc).</p>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div><label className={rotuloCls}>Nome do afiliado</label>
            <input data-afil-novo-nome value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: roh_ugc" className="w-60 bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-purple-500" /></div>
          <div><label className={rotuloCls}>Comissão (%)</label>
            <input data-afil-novo-pct value={novaComissao} onChange={(e) => setNovaComissao(e.target.value)} placeholder="8" className="w-28 bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-purple-500" /></div>
          <button type="button" data-afil-adicionar onClick={adicionar} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold py-2.5 px-5 rounded-xl text-xs cursor-pointer">Adicionar afiliado</button>
        </div>
        {linhas.length === 0 ? <p data-afil-lista-vazia className="text-[11px] text-slate-500">Nenhum afiliado ainda. Eles aparecem aqui depois do upload de vendas do canal (com a coluna do afiliado definida acima) ou quando você adiciona pelo nome.</p> : (
          <>
            {semComissao > 0 && <p data-afil-aviso-cfg className="text-[11px] text-amber-300 mb-3">⚠ {semComissao} afiliado(s) sem comissão definida: ficam com R$ 0,00 de comissão no painel até você informar o %.</p>}
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs" data-afil-lista>
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px]"><tr><th className="p-3">Afiliado</th><th className="p-3 text-right">Vendeu (meses lidos)</th><th className="p-3 text-right">Comissão (%)</th><th className="p-3"></th></tr></thead>
                <tbody className="divide-y divide-slate-800/70">
                  {linhas.map((a) => (
                    <tr key={a.nome} data-afil-cad={a.nome}>
                      <td className="p-3 font-bold text-slate-100">{a.nome}{a.pct === null && <span className="ml-2 text-[10px] text-amber-400 font-bold">sem comissão</span>}</td>
                      <td className="p-3 text-right text-slate-300">{a.receita > 0 ? R$(a.receita) : "—"}</td>
                      <td className="p-3 text-right"><input data-afil-pct={a.nome} inputMode="decimal" placeholder="definir %" key={String(a.pct)} defaultValue={a.pct === null ? "" : String(a.pct).replace(".", ",")}
                        onBlur={(e) => { const t = e.target.value; if (t.trim() !== "" && numeroBR(t) !== a.pct) definirComissao(a.nome, t); }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className={`w-24 bg-slate-950 border rounded-lg p-2 text-xs text-right text-white outline-none focus:border-purple-500 ${a.pct === null ? "border-amber-700" : "border-slate-700"}`} /></td>
                      <td className="p-3 text-right">{a.pct !== null && <button type="button" onClick={() => removerComissao(a.nome)} className="text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer">Remover comissão</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
