"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import { buscarTudo } from "../../lib/buscarTudo";
import { parseNumeroBR, type RegraTarifacao } from "../../lib/tarifacao";
import { normalizarSkuCadastro } from "../../lib/cadastros";
import { CANAIS_ANALISE, IMPOSTO_PCT, analisarPreco, custoIdeal, margemComCusto, precoIndicado, type AnuncioML, type OpcoesCalculo } from "../../lib/analiseMercado";
import Navbar from "../components/Navbar";

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const dataBR = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const moeda = (v: number) => "R$ " + (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const linkValido = (l?: string | null) => /^https?:\/\//i.test(String(l || "").trim());
const entrada = "w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500";
const rotulo = "block text-[10px] font-bold text-slate-400 uppercase mb-1";

type Aba = "concorrencia" | "tendencias";

export default function AnaliseMercadoPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [aba, setAba] = useState<Aba>("concorrencia");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [regras, setRegras] = useState<RegraTarifacao[]>([]);
  const [custos, setCustos] = useState<Map<string, { sku: string; produto: string; custo: number }>>(new Map());
  const [anunciosMl, setAnunciosMl] = useState<{ ml1: Map<string, AnuncioML[]>; ml2: Map<string, AnuncioML[]> }>({ ml1: new Map(), ml2: new Map() });
  const [concorrencia, setConcorrencia] = useState<any[]>([]);
  const [tendencias, setTendencias] = useState<any[]>([]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [reg, cst, ml, conc, tend] = await Promise.all([
        supabase.from("config_regras_tarifacao").select("*"),
        buscarTudo("tabela_custos_skus", "sku, produto, custo_unitario"),
        buscarTudo("ml_anuncios_regras", "sku, comissao, peso_real, altura, largura, comprimento, canal"),
        supabase.from("analise_concorrencia").select("*").order("data", { ascending: false }).order("id", { ascending: false }),
        supabase.from("analise_tendencias").select("*").order("id", { ascending: false }),
      ]);
      if (conc.error || tend.error) throw new Error("As tabelas da Análise de mercado ainda não existem: execute o SQL 20261104190000_push_e_analise_mercado.sql no Supabase.");
      setRegras((reg.data as RegraTarifacao[]) || []);

      const mapaCustos = new Map<string, { sku: string; produto: string; custo: number }>();
      for (const c of cst) {
        const k = normalizarSkuCadastro(c.sku);
        if (k) mapaCustos.set(k, { sku: String(c.sku), produto: String(c.produto || ""), custo: Number(c.custo_unitario) || 0 });
      }
      setCustos(mapaCustos);

      const ml1 = new Map<string, AnuncioML[]>(), ml2 = new Map<string, AnuncioML[]>();
      for (const m of ml) {
        const k = normalizarSkuCadastro(m.sku);
        if (!k) continue;
        const info: AnuncioML = { comissao: Number(m.comissao) || 0, peso_real: Number(m.peso_real) || 0, altura: Number(m.altura) || 0, largura: Number(m.largura) || 0, comprimento: Number(m.comprimento) || 0 };
        const alvo = String(m.canal || "").includes("2") ? ml2 : ml1;
        alvo.set(k, [...(alvo.get(k) || []), info]);
      }
      setAnunciosMl({ ml1, ml2 });
      setConcorrencia(conc.data || []);
      setTendencias(tend.data || []);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const salvo = localStorage.getItem("usuario_logado");
    if (!salvo) { router.push("/login"); return; }
    try { setUsuario(String(JSON.parse(salvo).email || "")); } catch { router.push("/login"); return; }
    carregar();
  }, [carregar, router]);

  /** Regras do canal para um SKU (no ML, comissão e dimensões vêm dos anúncios do SKU). */
  const opcoes = useCallback((canal: string, skuNorm?: string): OpcoesCalculo => {
    const anuncios = skuNorm ? (canal.toLowerCase().includes("mercado livre 2") ? anunciosMl.ml2 : anunciosMl.ml1).get(skuNorm) : undefined;
    return { regras, anuncios };
  }, [regras, anunciosMl]);

  const baixarPlanilha = (nome: string, linhas: any[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Análise");
    XLSX.writeFile(wb, `${nome}_${hojeSP()}.xlsx`);
  };

  const classeAba = (ativa: boolean) =>
    `px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-colors ${ativa ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"}`;

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Análise de mercado</h1>
            <p className="text-sm font-medium text-slate-400">Compare preços da concorrência e descubra o custo ideal ou o preço de venda indicado, com as regras de cada canal.</p>
          </div>
          <Navbar />
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button data-aba="concorrencia" onClick={() => setAba("concorrencia")} className={classeAba(aba === "concorrencia")}>🥊 Concorrência</button>
          <button data-aba="tendencias" onClick={() => setAba("tendencias")} className={classeAba(aba === "tendencias")}>📈 Tendências</button>
          <span className="ml-auto text-[10px] text-slate-500">Imposto considerado: {pct(IMPOSTO_PCT * 100)} do preço (igual à Calculadora)</span>
        </div>

        {erro && <div data-erro className="mb-6 p-4 rounded-xl border border-amber-800/60 bg-amber-950/30 text-amber-200 text-xs font-semibold">⚠️ {erro}</div>}
        {carregando && <p className="text-xs text-slate-500 mb-6">Carregando custos e regras dos canais…</p>}

        {aba === "concorrencia" ? (
          <Concorrencia
            usuario={usuario} custos={custos} opcoes={opcoes} linhas={concorrencia} setLinhas={setConcorrencia}
            desabilitado={!!erro || carregando} baixarPlanilha={baixarPlanilha}
          />
        ) : (
          <Tendencias
            usuario={usuario} opcoes={opcoes} linhas={tendencias} setLinhas={setTendencias}
            desabilitado={!!erro || carregando} baixarPlanilha={baixarPlanilha}
          />
        )}
      </div>
    </div>
  );
}

// ═════════════════════════ CONCORRÊNCIA ═════════════════════════

function Concorrencia({ usuario, custos, opcoes, linhas, setLinhas, desabilitado, baixarPlanilha }: {
  usuario: string; custos: Map<string, { sku: string; produto: string; custo: number }>;
  opcoes: (canal: string, skuNorm?: string) => OpcoesCalculo; linhas: any[]; setLinhas: (f: (p: any[]) => any[]) => void;
  desabilitado: boolean; baixarPlanilha: (nome: string, l: any[][]) => void;
}) {
  const vazio = { data: hojeSP(), canal: "Mercado Livre 1 Clássico", sku: "", link: "", preco: "", margem: "20" };
  const [f, setF] = useState(vazio);
  const [editando, setEditando] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [filtroCanal, setFiltroCanal] = useState("TODOS");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    try { const m = localStorage.getItem("analise_margem_padrao"); if (m) setF((x) => ({ ...x, margem: m })); } catch { /* sem armazenamento */ }
  }, []);

  const skuNorm = normalizarSkuCadastro(f.sku);
  const produto = skuNorm ? custos.get(skuNorm) : undefined;
  const preco = parseNumeroBR(f.preco);
  const margem = parseNumeroBR(f.margem);

  // Pré-visualização do que o formulário vai calcular
  const previa = useMemo(() => {
    if (!(preco > 0)) return null;
    const op = opcoes(f.canal, skuNorm);
    return { ...custoIdeal(f.canal, preco, margem, op) };
  }, [f.canal, preco, margem, skuNorm, opcoes]);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.sku.trim()) return alert("Informe o SKU.");
    if (!(preco > 0)) return alert("Informe o preço de venda do concorrente.");
    if (!(margem >= 0 && margem < 100)) return alert("Informe uma margem entre 0 e 99,9%.");
    setSalvando(true);
    const reg = {
      data: f.data || hojeSP(), canal: f.canal, sku: produto?.sku || f.sku.trim(), nome: produto?.produto || "",
      link: f.link.trim() || null, preco_concorrente: preco, margem_desejada: margem, criado_por: usuario,
    };
    if (editando !== null) {
      const { error } = await supabase.from("analise_concorrencia").update(reg).eq("id", editando);
      setSalvando(false);
      if (error) return alert("Erro ao salvar: " + error.message);
      setLinhas((p) => p.map((x) => (x.id === editando ? { ...x, ...reg } : x)));
      setEditando(null);
    } else {
      const { data, error } = await supabase.from("analise_concorrencia").insert(reg).select().single();
      setSalvando(false);
      if (error || !data) return alert("Erro ao salvar: " + (error?.message || ""));
      setLinhas((p) => [data, ...p]);
    }
    try { localStorage.setItem("analise_margem_padrao", f.margem); } catch { /* ignora */ }
    setF({ ...vazio, canal: f.canal, data: f.data, margem: f.margem });
  };

  const editar = (r: any) => {
    setEditando(r.id);
    setF({ data: String(r.data).slice(0, 10), canal: r.canal, sku: r.sku || "", link: r.link || "", preco: String(r.preco_concorrente).replace(".", ","), margem: String(r.margem_desejada).replace(".", ",") });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const excluir = async (r: any) => {
    if (!confirm(`Excluir a análise de ${r.sku} (${r.canal})?`)) return;
    const { error } = await supabase.from("analise_concorrencia").delete().eq("id", r.id);
    if (error) return alert("Erro ao excluir: " + error.message);
    setLinhas((p) => p.filter((x) => x.id !== r.id));
  };

  // Linhas calculadas
  const calculadas = useMemo(() => linhas.map((r) => {
    const sn = normalizarSkuCadastro(r.sku);
    const op = opcoes(r.canal, sn);
    const p = Number(r.preco_concorrente), m = Number(r.margem_desejada);
    const ideal = custoIdeal(r.canal, p, m, op);
    const info = custos.get(sn);
    const nosso = info && info.custo > 0 ? info.custo : null;
    return { r, ideal, nosso, nome: r.nome || info?.produto || "", margemAtual: nosso !== null ? margemComCusto(r.canal, p, nosso, op) : null };
  }), [linhas, custos, opcoes]);

  const filtradas = calculadas.filter(({ r, nome }) =>
    (filtroCanal === "TODOS" || r.canal === filtroCanal) &&
    (!busca.trim() || `${r.sku} ${nome}`.toLowerCase().includes(busca.trim().toLowerCase()))
  );

  const exportar = () =>
    baixarPlanilha("analise_concorrencia", [
      ["Data", "Canal", "SKU", "Produto", "Preço concorrente", "Comissão", "Tarifa fixa", "Frete", "Líquido do canal", "Imposto (9%)", "Margem desejada %", "Custo ideal", "Nosso custo", "Margem com nosso custo %", "Decisão", "Link"],
      ...filtradas.map(({ r, ideal, nosso, nome, margemAtual }) => [
        dataBR(r.data), r.canal, r.sku, nome, Number(r.preco_concorrente), round2(ideal.analise.comissaoValor), round2(ideal.analise.tarifaFixa), round2(ideal.analise.frete),
        round2(ideal.analise.liquido), round2(ideal.analise.imposto), Number(r.margem_desejada), round2(ideal.custo), nosso ?? "sem custo na base",
        margemAtual === null ? "" : round2(margemAtual), nosso === null ? "" : nosso <= ideal.custo ? "Cabe" : "Acima do custo ideal", r.link || "",
      ]),
    ]);

  return (
    <div data-painel="concorrencia" className="space-y-6">
      <form onSubmit={salvar} className="bg-slate-900/90 p-6 rounded-2xl border border-indigo-900/40 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-indigo-300 uppercase tracking-wider">{editando !== null ? "✏️ Editando análise" : "➕ Nova análise de concorrente"}</h2>
          {editando !== null && <button type="button" onClick={() => { setEditando(null); setF(vazio); }} className="text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer">✕ Cancelar edição</button>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div><label className={rotulo}>Data</label><input type="date" data-f-data value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} className={entrada} /></div>
          <div className="md:col-span-2"><label className={rotulo}>Canal (marketplace)</label>
            <select data-f-canal value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })} className={entrada + " cursor-pointer"}>
              {CANAIS_ANALISE.map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div><label className={rotulo}>SKU</label><input data-f-sku value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} placeholder="Ex: 20345042233" className={entrada} /></div>
          <div className="md:col-span-2"><label className={rotulo}>Produto (automático)</label>
            <div data-f-nome className={`${entrada} min-h-[2.4rem] flex items-center ${produto ? "text-white" : "text-slate-500"}`}>
              {produto ? produto.produto || "(sem nome na base)" : f.sku.trim() ? "SKU não encontrado na base de custos" : "—"}
            </div></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div><label className={rotulo}>Preço de venda do concorrente</label><input data-f-preco inputMode="decimal" value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} placeholder="0,00" className={entrada} /></div>
          <div><label className={rotulo}>Margem desejada (%)</label><input data-f-margem inputMode="decimal" value={f.margem} onChange={(e) => setF({ ...f, margem: e.target.value })} className={entrada} /></div>
          <div className="md:col-span-2"><label className={rotulo}>Link do anúncio (opcional)</label><input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://…" className={entrada} /></div>
          <div className="md:col-span-2 flex items-end"><button type="submit" data-salvar disabled={salvando || desabilitado} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold py-2.5 px-6 rounded-lg text-xs uppercase tracking-wider cursor-pointer shadow-lg">{salvando ? "Salvando..." : editando !== null ? "Salvar alterações" : "Adicionar"}</button></div>
        </div>
        {previa && (
          <div data-previa className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            <Info t="Líquido que o canal repassa" v={moeda(previa.analise.liquido)} dica={`${moeda(previa.analise.preco)} − comissão ${pct(previa.analise.comissaoPct)} (${moeda(previa.analise.comissaoValor)}) − tarifa ${moeda(previa.analise.tarifaFixa)} − frete ${moeda(previa.analise.frete)}`} />
            <Info t="Depois do imposto (9%)" v={moeda(previa.analise.liquidoPosImposto)} />
            <Info t={`Custo ideal p/ ${pct(margem)} de margem`} v={moeda(previa.custo)} cor={previa.custo > 0 ? "text-emerald-300" : "text-rose-300"} />
            <Info t="Nosso custo atual" v={produto && produto.custo > 0 ? moeda(produto.custo) : "sem custo na base"} cor={produto && produto.custo > 0 ? (produto.custo <= previa.custo ? "text-emerald-300" : "text-rose-300") : "text-slate-500"} />
          </div>
        )}
      </form>

      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider mr-auto">Histórico de concorrentes ({filtradas.length})</h2>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar SKU ou produto" className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none w-52" />
          <select value={filtroCanal} onChange={(e) => setFiltroCanal(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer">
            <option value="TODOS">Todos os canais</option>
            {CANAIS_ANALISE.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button onClick={exportar} disabled={filtradas.length === 0} className="px-3 py-2 rounded-lg text-[11px] font-bold border border-slate-700 bg-slate-950 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer">⬇ Baixar planilha</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                {["Data", "Canal", "SKU", "Produto", "Preço concorrente", "Líquido do canal", "Margem desejada", "Custo ideal", "Nosso custo", "Decisão", ""].map((h) => <th key={h} className="p-3 whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtradas.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-slate-500">Nenhuma análise ainda. Preencha o formulário acima.</td></tr>}
              {filtradas.map(({ r, ideal, nosso, nome, margemAtual }) => {
                const cabe = nosso !== null && nosso <= ideal.custo;
                return (
                  <tr key={r.id} data-linha-conc={r.id} className="hover:bg-slate-800/40">
                    <td className="p-3 whitespace-nowrap text-slate-300">{dataBR(r.data)}</td>
                    <td className="p-3 whitespace-nowrap text-slate-300">{r.canal}</td>
                    <td className="p-3 font-mono font-bold text-slate-200">{r.sku}</td>
                    <td className="p-3 text-slate-300 max-w-[16rem] truncate" title={nome}>{nome || "—"}</td>
                    <td className="p-3 font-bold text-white whitespace-nowrap">{moeda(Number(r.preco_concorrente))}</td>
                    <td data-c-liquido className="p-3 font-bold text-indigo-300 whitespace-nowrap" title={`comissão ${pct(ideal.analise.comissaoPct)} ${moeda(ideal.analise.comissaoValor)} · tarifa ${moeda(ideal.analise.tarifaFixa)} · frete ${moeda(ideal.analise.frete)} · imposto 9% ${moeda(ideal.analise.imposto)}`}>{moeda(ideal.analise.liquido)}</td>
                    <td className="p-3 text-slate-300 whitespace-nowrap">{pct(Number(r.margem_desejada))}</td>
                    <td data-c-ideal className={`p-3 font-black whitespace-nowrap ${ideal.custo > 0 ? "text-emerald-300" : "text-rose-300"}`}>{moeda(ideal.custo)}</td>
                    <td className="p-3 whitespace-nowrap text-slate-300">{nosso !== null ? <>{moeda(nosso)} <span className="text-slate-500">({pct(margemAtual || 0)})</span></> : <span className="text-slate-500">sem custo na base</span>}</td>
                    <td data-c-decisao className="p-3 whitespace-nowrap font-bold">
                      {nosso === null ? <span className="text-slate-500">—</span> : cabe
                        ? <span className="text-emerald-400">✅ Cabe (sobra {moeda(ideal.custo - nosso)})</span>
                        : <span className="text-rose-400">❌ Custo {moeda(nosso - ideal.custo)} acima</span>}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {linkValido(r.link) && <a href={r.link} target="_blank" rel="noopener noreferrer" title="Abrir anúncio" className="mr-2 text-cyan-400 hover:text-white">🔗</a>}
                      <button data-editar onClick={() => editar(r)} title="Editar" className="mr-2 text-slate-500 hover:text-cyan-300 cursor-pointer">✏️</button>
                      <button data-excluir onClick={() => excluir(r)} title="Excluir" className="text-slate-500 hover:text-rose-400 cursor-pointer">🗑️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-slate-500">Líquido do canal = preço − comissão − tarifa fixa − frete (as regras da aba Regras e da Calculadora). Custo ideal = líquido − imposto de 9% − margem desejada × preço.</p>
    </div>
  );
}

// ═════════════════════════ TENDÊNCIAS ═════════════════════════

function Tendencias({ usuario, opcoes, linhas, setLinhas, desabilitado, baixarPlanilha }: {
  usuario: string; opcoes: (canal: string, skuNorm?: string) => OpcoesCalculo; linhas: any[]; setLinhas: (f: (p: any[]) => any[]) => void;
  desabilitado: boolean; baixarPlanilha: (nome: string, l: any[][]) => void;
}) {
  const vazio = { nome: "", link: "", canal: "Mercado Livre 1 Clássico", preco: "", margem: "20", custo: "" };
  const [f, setF] = useState(vazio);
  const [editando, setEditando] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    try { const m = localStorage.getItem("analise_margem_padrao"); if (m) setF((x) => ({ ...x, margem: m })); } catch { /* sem armazenamento */ }
  }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const preco = parseNumeroBR(f.preco), margem = parseNumeroBR(f.margem), custo = f.custo.trim() ? parseNumeroBR(f.custo) : null;
    if (!f.nome.trim()) return alert("Informe o nome do produto.");
    if (!(preco > 0)) return alert("Informe o preço praticado pelo concorrente.");
    if (!(margem >= 0 && margem < 100)) return alert("Informe uma margem entre 0 e 99,9%.");
    if (custo !== null && !(custo > 0)) return alert("O custo de compra, se informado, precisa ser maior que zero.");
    setSalvando(true);
    const reg = { nome: f.nome.trim(), link: f.link.trim() || null, canal: f.canal, preco_concorrente: preco, margem_desejada: margem, custo_compra: custo, criado_por: usuario };
    if (editando !== null) {
      const { error } = await supabase.from("analise_tendencias").update(reg).eq("id", editando);
      setSalvando(false);
      if (error) return alert("Erro ao salvar: " + error.message);
      setLinhas((p) => p.map((x) => (x.id === editando ? { ...x, ...reg } : x)));
      setEditando(null);
    } else {
      const { data, error } = await supabase.from("analise_tendencias").insert(reg).select().single();
      setSalvando(false);
      if (error || !data) return alert("Erro ao salvar: " + (error?.message || ""));
      setLinhas((p) => [data, ...p]);
    }
    try { localStorage.setItem("analise_margem_padrao", f.margem); } catch { /* ignora */ }
    setF({ ...vazio, canal: f.canal, margem: f.margem });
  };

  const editar = (r: any) => {
    setEditando(r.id);
    setF({ nome: r.nome, link: r.link || "", canal: r.canal, preco: String(r.preco_concorrente).replace(".", ","), margem: String(r.margem_desejada).replace(".", ","), custo: r.custo_compra ? String(r.custo_compra).replace(".", ",") : "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const excluir = async (r: any) => {
    if (!confirm(`Excluir "${r.nome}"?`)) return;
    const { error } = await supabase.from("analise_tendencias").delete().eq("id", r.id);
    if (error) return alert("Erro ao excluir: " + error.message);
    setLinhas((p) => p.filter((x) => x.id !== r.id));
  };

  const calc = (r: { canal: string; preco_concorrente: any; margem_desejada: any; custo_compra?: any }) => {
    const op = opcoes(r.canal);
    const p = Number(r.preco_concorrente), m = Number(r.margem_desejada);
    const teto = custoIdeal(r.canal, p, m, op);
    const custo = r.custo_compra ? Number(r.custo_compra) : null;
    const indicado = custo ? precoIndicado(r.canal, custo, m, op) : null;
    return { teto, custo, indicado, margemNoConcorrente: custo ? margemComCusto(r.canal, p, custo, op) : null };
  };

  const previa = useMemo(() => {
    const p = parseNumeroBR(f.preco);
    if (!(p > 0)) return null;
    return calc({ canal: f.canal, preco_concorrente: p, margem_desejada: parseNumeroBR(f.margem), custo_compra: f.custo.trim() ? parseNumeroBR(f.custo) : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, opcoes]);
  const margemForm = parseNumeroBR(f.margem);

  const filtradas = linhas.filter((r) => !busca.trim() || String(r.nome).toLowerCase().includes(busca.trim().toLowerCase()));

  const exportar = () =>
    baixarPlanilha("analise_tendencias", [
      ["Produto", "Canal", "Preço concorrente", "Líquido do canal", "Margem desejada %", "Custo máximo p/ a margem (no preço do concorrente)", "Custo de compra", "Preço de venda indicado", "Link"],
      ...filtradas.map((r) => { const c = calc(r); return [r.nome, r.canal, Number(r.preco_concorrente), round2(c.teto.analise.liquido), Number(r.margem_desejada), round2(c.teto.custo), c.custo ?? "", c.indicado ? (c.indicado.inviavel ? "margem inviável" : round2(c.indicado.preco)) : "", r.link || ""]; }),
    ]);

  return (
    <div data-painel="tendencias" className="space-y-6">
      <form onSubmit={salvar} className="bg-slate-900/90 p-6 rounded-2xl border border-indigo-900/40 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-indigo-300 uppercase tracking-wider">{editando !== null ? "✏️ Editando tendência" : "➕ Novo produto em tendência"}</h2>
          {editando !== null && <button type="button" onClick={() => { setEditando(null); setF(vazio); }} className="text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer">✕ Cancelar edição</button>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="md:col-span-3"><label className={rotulo}>Nome do produto</label><input data-t-nome value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} className={entrada} /></div>
          <div className="md:col-span-3"><label className={rotulo}>Link (opcional)</label><input data-t-link value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://…" className={entrada} /></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="md:col-span-2"><label className={rotulo}>Canal onde venderíamos</label>
            <select data-t-canal value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })} className={entrada + " cursor-pointer"}>
              {CANAIS_ANALISE.map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div><label className={rotulo}>Preço do concorrente</label><input data-t-preco inputMode="decimal" value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} placeholder="0,00" className={entrada} /></div>
          <div><label className={rotulo}>Margem desejada (%)</label><input data-t-margem inputMode="decimal" value={f.margem} onChange={(e) => setF({ ...f, margem: e.target.value })} className={entrada} /></div>
          <div><label className={rotulo}>Custo de compra (opcional)</label><input data-t-custo inputMode="decimal" value={f.custo} onChange={(e) => setF({ ...f, custo: e.target.value })} placeholder="0,00" className={entrada} /></div>
          <div className="flex items-end"><button type="submit" data-salvar disabled={salvando || desabilitado} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold py-2.5 px-4 rounded-lg text-xs uppercase tracking-wider cursor-pointer shadow-lg">{salvando ? "Salvando..." : editando !== null ? "Salvar" : "Adicionar"}</button></div>
        </div>
        {previa && (
          <div data-previa className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            <Info t="Líquido que o canal repassa" v={moeda(previa.teto.analise.liquido)} dica={`comissão ${pct(previa.teto.analise.comissaoPct)} · tarifa ${moeda(previa.teto.analise.tarifaFixa)} · frete ${moeda(previa.teto.analise.frete)}`} />
            <Info t={`Custo máximo p/ ${pct(margemForm)} (no preço dele)`} v={moeda(previa.teto.custo)} cor={previa.teto.custo > 0 ? "text-emerald-300" : "text-rose-300"} />
            <Info t="Preço de venda indicado" v={previa.indicado ? (previa.indicado.inviavel ? "margem inviável" : moeda(previa.indicado.preco)) : "informe o custo de compra"} cor={previa.indicado && !previa.indicado.inviavel ? "text-indigo-300" : "text-slate-500"} />
            <Info t="Frente ao concorrente" v={previa.indicado && !previa.indicado.inviavel ? (previa.indicado.preco <= parseNumeroBR(f.preco) ? "✅ abaixo/igual ao dele" : `❌ ${moeda(previa.indicado.preco - parseNumeroBR(f.preco))} acima`) : "—"} />
          </div>
        )}
        <p className="text-[10px] text-slate-500">Como são produtos que ainda não trabalhamos, não há SKU nem custo na base: o preço de venda indicado depende do custo de compra que você informar. Sem ele, a tabela mostra o custo máximo que ainda dá a margem desejada no preço do concorrente.</p>
      </form>

      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider mr-auto">Produtos em tendência ({filtradas.length})</h2>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto" className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none w-52" />
          <button onClick={exportar} disabled={filtradas.length === 0} className="px-3 py-2 rounded-lg text-[11px] font-bold border border-slate-700 bg-slate-950 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer">⬇ Baixar planilha</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                {["Produto", "Canal", "Preço concorrente", "Líquido do canal", "Margem desejada", "Custo máx. p/ a margem", "Custo de compra", "Preço de venda indicado", ""].map((h) => <th key={h} className="p-3 whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtradas.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500">Nenhum produto ainda. Preencha o formulário acima.</td></tr>}
              {filtradas.map((r) => {
                const c = calc(r);
                return (
                  <tr key={r.id} data-linha-tend={r.id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-bold text-slate-200 max-w-[18rem] truncate" title={r.nome}>{r.nome}</td>
                    <td className="p-3 whitespace-nowrap text-slate-300">{r.canal}</td>
                    <td className="p-3 font-bold text-white whitespace-nowrap">{moeda(Number(r.preco_concorrente))}</td>
                    <td data-t-liquido className="p-3 font-bold text-indigo-300 whitespace-nowrap">{moeda(c.teto.analise.liquido)}</td>
                    <td className="p-3 text-slate-300 whitespace-nowrap">{pct(Number(r.margem_desejada))}</td>
                    <td data-t-teto className={`p-3 font-black whitespace-nowrap ${c.teto.custo > 0 ? "text-emerald-300" : "text-rose-300"}`}>{moeda(c.teto.custo)}</td>
                    <td className="p-3 whitespace-nowrap text-slate-300">{c.custo ? moeda(c.custo) : <span className="text-slate-500">—</span>}</td>
                    <td data-t-indicado className="p-3 font-black whitespace-nowrap">
                      {c.indicado ? (c.indicado.inviavel ? <span className="text-rose-400">margem inviável</span> : <span className="text-indigo-300">{moeda(c.indicado.preco)}</span>) : <span className="text-slate-500">informe o custo</span>}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {linkValido(r.link) && <a href={r.link} target="_blank" rel="noopener noreferrer" title="Abrir anúncio" className="mr-2 text-cyan-400 hover:text-white">🔗</a>}
                      <button data-editar onClick={() => editar(r)} title="Editar" className="mr-2 text-slate-500 hover:text-cyan-300 cursor-pointer">✏️</button>
                      <button data-excluir onClick={() => excluir(r)} title="Excluir" className="text-slate-500 hover:text-rose-400 cursor-pointer">🗑️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function Info({ t, v, cor = "text-white", dica }: { t: string; v: string; cor?: string; dica?: string }) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3" title={dica}>
      <div className="text-[10px] font-bold text-slate-400 uppercase">{t}</div>
      <div className={`text-sm font-black mt-1 ${cor}`}>{v}</div>
    </div>
  );
}
