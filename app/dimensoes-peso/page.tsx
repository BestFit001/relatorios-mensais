"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { nomeDoPaiDe, numeroBR, pesoParaKg } from "../../lib/dimensoesPeso";
import Navbar from "../components/Navbar";

const campo = "w-full bg-[#1b1f38] text-sm text-white px-4 py-2.5 rounded-lg border border-gray-700 focus:border-purple-500 outline-none";
const rotulo = "block text-[11px] font-bold text-gray-400 uppercase mb-1";
const fmt = (n: any, casas = 1) => (Number.isFinite(Number(n)) ? Number(n) : 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });

type Achado = { nome: string; origem: string } | null;

export default function DimensoesPesoPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");

  // formulário
  const [skuPai, setSkuPai] = useState("");
  const [nome, setNome] = useState("");
  const [achado, setAchado] = useState<Achado>(null);
  const [buscandoNome, setBuscandoNome] = useState(false);
  const [jaTemMedidas, setJaTemMedidas] = useState(false);
  const [largura, setLargura] = useState("");
  const [altura, setAltura] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [peso, setPeso] = useState("");
  const [unidadePeso, setUnidadePeso] = useState<"kg" | "g">("kg");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const seq = useRef(0);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const salvo = localStorage.getItem("usuario_logado");
    if (!salvo) { router.push("/login"); return; }
    try { setUsuario(String(JSON.parse(salvo).email || "")); } catch { router.push("/login"); }
  }, [router]);

  const carregarLista = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase.from("dimensoes_peso").select("*").order("atualizado_em", { ascending: false });
    if (error) setErro("Não consegui carregar a lista: " + error.message);
    else { setErro(""); setLista(data || []); }
    setCarregando(false);
  }, []);
  useEffect(() => { carregarLista(); }, [carregarLista]);

  /** Procura o nome do produto pelo SKU pai nos cadastros (pendentes e já cadastrados). */
  async function acharNome(sku: string): Promise<Achado> {
    const tabelas: [string, string][] = [["produtos_pendentes", "Produtos pendentes"], ["produtos_novos_cadastrados", "Produtos cadastrados"]];
    const seguro = sku.replace(/[%_,()]/g, "");
    for (const [t, rotuloTabela] of tabelas) {
      const { data } = await supabase.from(t).select("produto").eq("sku_pai", sku).limit(1);
      if (data?.[0]?.produto) return { nome: nomeDoPaiDe(data[0].produto), origem: rotuloTabela };
    }
    for (const [t, rotuloTabela] of tabelas) {
      const { data } = await supabase.from(t).select("produto").eq("sku", sku).limit(1);
      if (data?.[0]?.produto) return { nome: nomeDoPaiDe(data[0].produto), origem: rotuloTabela };
    }
    if (seguro.length >= 3) {
      for (const [t, rotuloTabela] of tabelas) {
        const { data } = await supabase.from(t).select("produto").ilike("sku", `${seguro}%`).limit(1);
        if (data?.[0]?.produto) return { nome: nomeDoPaiDe(data[0].produto), origem: rotuloTabela };
      }
    }
    return null;
  }

  // ao digitar o SKU pai: puxa o nome sozinho e, se o SKU já tem medidas salvas, abre elas para editar
  useEffect(() => {
    const sku = skuPai.trim();
    const minha = ++seq.current;
    if (!sku) { setNome(""); setAchado(null); setJaTemMedidas(false); setBuscandoNome(false); return; }
    setBuscandoNome(true);
    const t = setTimeout(async () => {
      const [prod, salvo] = await Promise.all([
        acharNome(sku),
        supabase.from("dimensoes_peso").select("*").eq("sku_pai", sku).maybeSingle(),
      ]);
      if (minha !== seq.current) return;   // o usuário já digitou outra coisa
      setAchado(prod);
      const reg = salvo.data;
      setJaTemMedidas(!!reg);
      if (reg) {
        setNome(reg.produto || prod?.nome || "");
        setLargura(String(reg.largura).replace(".", ","));
        setAltura(String(reg.altura).replace(".", ","));
        setComprimento(String(reg.comprimento).replace(".", ","));
        setPeso(String(reg.peso).replace(".", ","));
        setUnidadePeso("kg");
      } else {
        setNome(prod?.nome || "");
      }
      setBuscandoNome(false);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuPai]);

  function limpar() {
    seq.current++;
    setSkuPai(""); setNome(""); setAchado(null); setJaTemMedidas(false);
    setLargura(""); setAltura(""); setComprimento(""); setPeso(""); setUnidadePeso("kg");
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const sku = skuPai.trim();
    if (!sku) { setMsg({ tipo: "erro", texto: "Informe o SKU pai." }); return; }
    const l = numeroBR(largura), a = numeroBR(altura), c = numeroBR(comprimento), p = numeroBR(peso);
    const faltando = [["largura", l], ["altura", a], ["comprimento", c], ["peso", p]].filter(([, v]) => v === null || (v as number) <= 0).map(([n]) => n);
    if (faltando.length) { setMsg({ tipo: "erro", texto: `Preencha com números maiores que zero: ${faltando.join(", ")}.` }); return; }
    const pesoKg = pesoParaKg(p as number, unidadePeso);

    setSalvando(true);
    const { error } = await supabase.from("dimensoes_peso").upsert(
      {
        sku_pai: sku, produto: nome.trim() || null,
        largura: l, altura: a, comprimento: c, peso: Math.round(pesoKg * 1000) / 1000,
        criado_por: usuario || null, atualizado_em: new Date().toISOString(),
      },
      { onConflict: "sku_pai" }
    );
    setSalvando(false);
    if (error) { setMsg({ tipo: "erro", texto: "Erro ao salvar: " + error.message }); return; }
    setMsg({ tipo: "ok", texto: `✅ Medidas do SKU pai ${sku} salvas. A exportação para o Tiny já usa esses valores.` });
    limpar();
    carregarLista();
  }

  function editar(r: any) {
    setMsg(null);
    setSkuPai(String(r.sku_pai));   // o efeito acima carrega nome e medidas
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function excluir(r: any) {
    if (!confirm(`Remover as medidas do SKU pai ${r.sku_pai}${r.produto ? " (" + r.produto + ")" : ""}?`)) return;
    const { error } = await supabase.from("dimensoes_peso").delete().eq("sku_pai", r.sku_pai);
    if (error) { alert("Erro ao excluir: " + error.message); return; }
    carregarLista();
  }

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((r) => String(r.sku_pai).toLowerCase().includes(q) || String(r.produto || "").toLowerCase().includes(q));
  }, [lista, busca]);

  return (
    <div className="min-h-screen bg-[#0d0f18] text-white p-6">
      <Navbar />
      <div className="max-w-5xl mx-auto space-y-6 mt-6">
        <div className="flex justify-between items-center bg-[#131625] p-6 rounded-xl border border-gray-800">
          <div>
            <h1 className="text-2xl font-bold">Dimensões e Peso</h1>
            <p className="text-gray-400 text-sm">
              Informe o SKU pai e as medidas reais da embalagem. Na exportação para o Tiny, esses valores têm prioridade sobre qualquer outra medida.
            </p>
          </div>
          <span className="text-sm bg-purple-900/50 text-purple-400 px-3 py-1 rounded-full border border-purple-800 whitespace-nowrap">{lista.length} SKU(s) com medidas</span>
        </div>

        <form ref={formRef} onSubmit={salvar} data-form-dimensoes className="bg-[#131625] p-6 rounded-xl border border-gray-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-purple-400">{jaTemMedidas ? "Editando medidas já salvas" : "Novo cadastro de medidas"}</h2>
            {jaTemMedidas && <span data-ja-tem className="text-xs bg-amber-900/40 text-amber-300 border border-amber-800 px-3 py-1 rounded-full">Este SKU pai já tem medidas — salvar atualiza</span>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={rotulo}>SKU pai</label>
              <input data-sku-pai value={skuPai} onChange={(e) => setSkuPai(e.target.value)} className={campo} placeholder="Ex: 12345" autoComplete="off" />
            </div>
            <div className="md:col-span-2">
              <label className={rotulo}>Produto {buscandoNome ? <span className="text-gray-500 normal-case">(buscando...)</span> : achado ? <span data-origem-nome className="text-green-400 normal-case">(puxado de {achado.origem})</span> : skuPai.trim() && !jaTemMedidas ? <span data-nome-nao-achado className="text-amber-300 normal-case">(não achei nos cadastros — pode digitar o nome)</span> : null}</label>
              <input data-nome value={nome} onChange={(e) => setNome(e.target.value)} readOnly={!!achado} className={campo + (achado ? " opacity-80" : "")} placeholder="O nome aparece sozinho ao digitar o SKU pai" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className={rotulo}>Largura (cm)</label>
              <input data-largura inputMode="decimal" value={largura} onChange={(e) => setLargura(e.target.value)} className={campo + " text-center"} placeholder="0" />
            </div>
            <div>
              <label className={rotulo}>Altura (cm)</label>
              <input data-altura inputMode="decimal" value={altura} onChange={(e) => setAltura(e.target.value)} className={campo + " text-center"} placeholder="0" />
            </div>
            <div>
              <label className={rotulo}>Comprimento (cm)</label>
              <input data-comprimento inputMode="decimal" value={comprimento} onChange={(e) => setComprimento(e.target.value)} className={campo + " text-center"} placeholder="0" />
            </div>
            <div>
              <label className={rotulo}>Peso do produto real</label>
              <div className="flex gap-2">
                <input data-peso inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} className={campo + " text-center"} placeholder={unidadePeso === "kg" ? "0,350" : "350"} />
                <select data-unidade value={unidadePeso} onChange={(e) => setUnidadePeso(e.target.value as "kg" | "g")} className="bg-[#1b1f38] text-sm text-white px-2 rounded-lg border border-gray-700 outline-none cursor-pointer">
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                </select>
              </div>
            </div>
          </div>

          {msg && <p data-msg className={`text-xs rounded-lg p-3 border ${msg.tipo === "ok" ? "text-green-300 bg-green-950/30 border-green-900" : "text-red-300 bg-red-950/30 border-red-900"}`}>{msg.texto}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { limpar(); setMsg(null); }} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm cursor-pointer">Limpar</button>
            <button type="submit" data-salvar disabled={salvando} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium cursor-pointer">
              {salvando ? "Salvando..." : jaTemMedidas ? "Atualizar medidas" : "Salvar medidas"}
            </button>
          </div>
        </form>

        <div className="bg-[#131625] rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Medidas cadastradas ({filtrada.length})</h2>
            <input data-busca value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por SKU pai ou nome..." className="bg-[#1b1f38] text-xs text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none w-64" />
          </div>
          {erro && <p className="p-4 text-xs text-red-300">{erro}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase bg-[#1b1f38]">
                  <th className="p-4">SKU pai</th>
                  <th className="p-4">Produto</th>
                  <th className="p-4">Largura × Altura × Comprimento (cm)</th>
                  <th className="p-4">Peso</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-sm">
                {carregando ? (
                  <tr><td colSpan={5} className="p-6 text-center text-gray-400">Carregando...</td></tr>
                ) : filtrada.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-gray-400">{lista.length === 0 ? "Nenhuma medida cadastrada ainda." : "Nada encontrado para essa busca."}</td></tr>
                ) : (
                  filtrada.map((r) => (
                    <tr key={r.sku_pai} data-linha={r.sku_pai} className="hover:bg-[#1b1f38]/50 transition">
                      <td className="p-4 font-mono text-white">{r.sku_pai}</td>
                      <td className="p-4 text-gray-300">{r.produto || "—"}</td>
                      <td className="p-4 text-gray-300 font-mono">{fmt(r.largura)} × {fmt(r.altura)} × {fmt(r.comprimento)}</td>
                      <td className="p-4 text-gray-300 font-mono">{fmt(r.peso, 3)} kg</td>
                      <td className="p-4 text-center whitespace-nowrap">
                        <button onClick={() => editar(r)} data-editar className="bg-indigo-900/60 hover:bg-indigo-800 text-indigo-100 px-3 py-1 rounded text-xs transition cursor-pointer mr-2">✏️ Editar</button>
                        <button onClick={() => excluir(r)} className="bg-red-900/60 hover:bg-red-900 text-red-200 px-3 py-1 rounded text-xs transition cursor-pointer">Excluir</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
