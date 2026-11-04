"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import Navbar from "../components/Navbar";
import { modelosDaPlanilha, norm, type ModeloPadrao } from "../../lib/padroesAnuncios";
import { limparDescricao, temMarkdown } from "../../lib/textoDescricao";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const chaveModelo = (titulo: any, marca: any) => `${norm(titulo)}|${norm(marca)}`;
const txt = (v: any) => (v === null || v === undefined ? "" : String(v));
const medidas = (p: { altura?: any; largura?: any; comprimento?: any }) => `${p.altura || 0}x${p.largura || 0}x${p.comprimento || 0} cm`;

export default function PadronizacaoPage() {
  const [padroes, setPadroes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Estados do formulário
  const [titulo, setTitulo] = useState("");
  const [marca, setMarca] = useState("");
  const [slug, setSlug] = useState("");
  const [palavrasChave, setPalavrasChave] = useState("");
  const [categoria, setCategoria] = useState("");
  const [altura, setAltura] = useState("");
  const [largura, setLargura] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [peso, setPeso] = useState("");
  const [descricaoSeo, setDescricaoSeo] = useState("");
  const [descricaoComplementar, setDescricaoComplementar] = useState("");

  // Importação de planilha (exemplos do Tiny)
  const [previa, setPrevia] = useState<{ arquivo: string; modelos: (ModeloPadrao & { marcada: boolean })[]; ignoradas: number } | null>(null);
  const [importando, setImportando] = useState(false);
  const [msgImport, setMsgImport] = useState("");
  const inputArquivoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    carregarPadroes();
  }, []);

  async function carregarPadroes() {
    setLoading(true);
    const { data, error } = await supabase
      .from("padroes_anuncios")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setPadroes(data);
    }
    setLoading(false);
  }

  function limparFormulario() {
    setTitulo(""); setMarca(""); setSlug(""); setPalavrasChave(""); setCategoria("");
    setAltura(""); setLargura(""); setComprimento(""); setPeso("");
    setDescricaoSeo(""); setDescricaoComplementar("");
    setEditandoId(null);
  }

  function editarPadrao(p: any) {
    setEditandoId(p.id);
    setTitulo(txt(p.titulo)); setMarca(txt(p.marca)); setSlug(txt(p.slug)); setPalavrasChave(txt(p.palavras_chave_seo));
    setCategoria(txt(p.categoria));
    setAltura(txt(p.altura)); setLargura(txt(p.largura)); setComprimento(txt(p.comprimento)); setPeso(txt(p.peso));
    setDescricaoSeo(txt(p.descricao_seo)); setDescricaoComplementar(limparDescricao(p.descricao_complementar));   // modelos antigos com **, ### etc. já abrem limpos
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function salvarPadrao(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !marca.trim()) {
      alert("Título e Marca são obrigatórios.");
      return;
    }

    const num = (v: string) => {
      if (v === "" || v === null || v === undefined) return null;
      const n = Number(String(v).replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };
    const dados = {
      titulo: titulo.trim(),
      marca: marca.trim(),
      slug,
      palavras_chave_seo: palavrasChave,
      categoria,
      altura: num(altura),
      largura: num(largura),
      comprimento: num(comprimento),
      peso: num(peso),
      descricao_seo: descricaoSeo,
      descricao_complementar: limparDescricao(descricaoComplementar),   // sempre texto puro, sem **, ###, ---
    };

    setSalvando(true);
    const { error } = editandoId
      ? await supabase.from("padroes_anuncios").update(dados).eq("id", editandoId)
      : await supabase.from("padroes_anuncios").insert([dados]);
    setSalvando(false);

    if (error) {
      alert("Erro ao salvar: " + error.message);
    } else {
      limparFormulario();
      carregarPadroes();
    }
  }

  async function excluirPadrao(id: string) {
    if (!confirm("Tem a certeza que deseja excluir este padrão?")) return;
    const { error } = await supabase.from("padroes_anuncios").delete().eq("id", id);
    if (error) {
      alert("Erro ao excluir: " + error.message);
    } else {
      if (editandoId === id) limparFormulario();
      carregarPadroes();
    }
  }

  // ---------------- importar planilha de exemplos (formato de exportação do Tiny/Olist) ----------------
  async function lerPlanilha(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setMsgImport("");
    try {
      const buffer = await arquivo.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }) as any[];
      const { modelos, ignoradas } = modelosDaPlanilha(linhas);
      if (modelos.length === 0) {
        setPrevia(null);
        setMsgImport("Não encontrei produtos nessa planilha. Use a planilha de produtos exportada do Tiny (com as colunas Código (SKU), Descrição, Marca, Categoria, Altura/Largura/Comprimento embalagem, Descrição complementar...).");
        return;
      }
      setPrevia({ arquivo: arquivo.name, modelos: modelos.map((m) => ({ ...m, marcada: true })), ignoradas });
    } catch (err: any) {
      setPrevia(null);
      setMsgImport("Não consegui ler a planilha: " + (err?.message || err));
    }
  }

  async function importarModelos() {
    if (!previa) return;
    const escolhidos = previa.modelos.filter((m) => m.marcada);
    if (escolhidos.length === 0) return;
    setImportando(true);
    let novos = 0, atualizados = 0;
    const erros: string[] = [];
    const existentes = new Map<string, any>();
    padroes.forEach((p) => { existentes.set(chaveModelo(p.titulo, p.marca), p); });

    for (const m of escolhidos) {
      const marcaFinal = m.marca || "BEST FIT";
      const dados = {
        titulo: m.titulo,
        marca: marcaFinal,
        slug: m.slug,
        palavras_chave_seo: m.palavras_chave_seo,
        categoria: m.categoria,
        altura: m.altura,
        largura: m.largura,
        comprimento: m.comprimento,
        peso: m.peso,
        descricao_seo: m.descricao_seo,
        descricao_complementar: limparDescricao(m.descricao_complementar),
      };
      const ja = existentes.get(chaveModelo(m.titulo, marcaFinal));
      const { error } = ja
        ? await supabase.from("padroes_anuncios").update(dados).eq("id", ja.id)
        : await supabase.from("padroes_anuncios").insert([dados]);
      if (error) erros.push(`${m.titulo}: ${error.message}`);
      else if (ja) atualizados++;
      else novos++;
    }
    setImportando(false);
    setPrevia(null);
    setMsgImport(
      `✅ Importação concluída: ${novos} novo(s), ${atualizados} atualizado(s).` +
      (erros.length ? ` Erros: ${erros.join(" | ")}` : "") +
      " Revise na lista abaixo e use ✏️ Editar para ajustar o que precisar."
    );
    carregarPadroes();
  }

  // modelos antigos que ficaram com **, ###, --- etc. na descrição
  const comSimbolos = padroes.filter((p) => temMarkdown(p.descricao_complementar));
  const [limpando, setLimpando] = useState(false);
  async function limparSimbolosDosModelos() {
    if (comSimbolos.length === 0) return;
    if (!confirm(`Limpar os símbolos (**, ###, ---) da descrição de ${comSimbolos.length} modelo(s)? O texto continua o mesmo, só sem os caracteres especiais.`)) return;
    setLimpando(true);
    const erros: string[] = [];
    for (const p of comSimbolos) {
      const { error } = await supabase.from("padroes_anuncios").update({ descricao_complementar: limparDescricao(p.descricao_complementar) }).eq("id", p.id);
      if (error) erros.push(`${p.titulo}: ${error.message}`);
    }
    setLimpando(false);
    if (erros.length) alert("Alguns modelos não foram limpos: " + erros.join(" | "));
    carregarPadroes();
  }

  const campo = "w-full bg-[#1b1f38] text-sm text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none";

  return (
    <div className="min-h-screen bg-[#0d0f18] text-white p-6">

      <Navbar />

      <div className="max-w-7xl mx-auto space-y-6 mt-6">
        {/* Cabeçalho */}
        <div className="flex justify-between items-center bg-[#131625] p-6 rounded-xl border border-gray-800">
          <div>
            <h1 className="text-2xl font-bold">Padronização de Anúncios (IA)</h1>
            <p className="text-gray-400 text-sm">Crie templates de sucesso para a IA clonar automaticamente nos novos produtos.</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm bg-purple-900/50 text-purple-400 px-3 py-1 rounded-full border border-purple-800">
              Best Fit — Copywriting
            </span>
          </div>
        </div>

        {/* Importar planilha de exemplos */}
        <div className="bg-[#131625] p-6 rounded-xl border border-gray-800 space-y-4" data-importar>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-purple-400">Importar planilha de exemplos</h2>
              <p className="text-xs text-gray-400">
                Suba a planilha de produtos exportada do Tiny (.xls, .xlsx ou .csv). Cada produto pai (ou simples) vira um modelo, com título, marca, slug,
                palavras-chave, categoria, medidas, peso, descrição SEO e descrição complementar — os mesmos campos do formulário abaixo.
              </p>
            </div>
            <div>
              <input ref={inputArquivoRef} data-arquivo type="file" accept=".xls,.xlsx,.csv" onChange={lerPlanilha} className="hidden" />
              <button type="button" onClick={() => inputArquivoRef.current?.click()} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer">
                📂 Escolher planilha
              </button>
            </div>
          </div>

          {msgImport && <p data-msg-import className="text-xs text-gray-300 bg-[#1b1f38] border border-gray-700 rounded-lg p-3">{msgImport}</p>}

          {previa && (
            <div data-previa className="space-y-3">
              <p className="text-xs text-gray-300">
                <strong>{previa.arquivo}</strong>: {previa.modelos.length} modelo(s) encontrado(s)
                {previa.ignoradas > 0 ? ` (${previa.ignoradas} linha(s) de variação ignorada(s): o modelo é o produto pai)` : ""}.
                Se um modelo com o mesmo título e marca já existir, ele será atualizado.
              </p>
              <div className="overflow-x-auto border border-gray-800 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1b1f38] text-gray-400 uppercase">
                    <tr>
                      <th className="p-3 w-8"></th>
                      <th className="p-3">Título</th>
                      <th className="p-3">Marca</th>
                      <th className="p-3">Categoria</th>
                      <th className="p-3">Medidas (A×L×C) / Peso</th>
                      <th className="p-3">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {previa.modelos.map((m, i) => {
                      const ja = padroes.some((p) => chaveModelo(p.titulo, p.marca) === chaveModelo(m.titulo, m.marca || "BEST FIT"));
                      return (
                        <tr key={i} data-previa-linha>
                          <td className="p-3">
                            <input type="checkbox" checked={m.marcada} onChange={(e) => setPrevia({ ...previa, modelos: previa.modelos.map((x, j) => (j === i ? { ...x, marcada: e.target.checked } : x)) })} className="accent-purple-600 cursor-pointer" />
                          </td>
                          <td className="p-3 text-white">{m.titulo}</td>
                          <td className="p-3 text-gray-300">{m.marca || "BEST FIT"}</td>
                          <td className="p-3 text-gray-300">{m.categoria || "—"}</td>
                          <td className="p-3 text-gray-300 font-mono">{m.altura || 0}x{m.largura || 0}x{m.comprimento || 0} cm {m.peso ? `| ${m.peso} kg` : ""}</td>
                          <td className="p-3">{ja ? <span className="text-amber-300">atualiza o existente</span> : <span className="text-green-400">novo</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setPrevia(null)} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm cursor-pointer">Descartar</button>
                <button type="button" data-importar-confirmar disabled={importando || previa.modelos.every((m) => !m.marcada)} onClick={importarModelos} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium cursor-pointer">
                  {importando ? "Importando..." : `Importar ${previa.modelos.filter((m) => m.marcada).length} modelo(s)`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Formulário de Criação / Edição */}
        <form ref={formRef} onSubmit={salvarPadrao} data-form-padrao className="bg-[#131625] p-6 rounded-xl border border-gray-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-purple-400">{editandoId ? "Editando Produto Modelo" : "Novo Produto Modelo"}</h2>
            {editandoId && (
              <span className="text-xs bg-amber-900/40 text-amber-300 border border-amber-800 px-3 py-1 rounded-full">Alterando um modelo já salvo</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Título do Produto Referência</label>
              <input type="text" data-f-titulo value={titulo} onChange={e => setTitulo(e.target.value)} className={campo} placeholder="Ex: Lancheira Farm Ziriguidum" required />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Marca</label>
              <input type="text" data-f-marca value={marca} onChange={e => setMarca(e.target.value)} className={campo} placeholder="Ex: Farm Rio" required />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Slug Ideal</label>
              <input type="text" value={slug} onChange={e => setSlug(e.target.value)} className={campo} placeholder="Ex: lancheira-farm-ziriguidum" />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Palavras-chave SEO</label>
              <input type="text" value={palavrasChave} onChange={e => setPalavrasChave(e.target.value)} className={campo} placeholder="Ex: Lancheira, Farm, Térmica..." />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Categoria</label>
              <input type="text" data-f-categoria value={categoria} onChange={e => setCategoria(e.target.value)} className={campo} placeholder="Ex: Acessórios / Bolsas" />
            </div>

            <div className="grid grid-cols-4 gap-2 lg:col-span-1">
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Altura (cm)</label>
                <input type="number" step="0.01" data-f-altura value={altura} onChange={e => setAltura(e.target.value)} className="w-full bg-[#1b1f38] text-xs text-white px-2 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none text-center" placeholder="Alt" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Larg (cm)</label>
                <input type="number" step="0.01" data-f-largura value={largura} onChange={e => setLargura(e.target.value)} className="w-full bg-[#1b1f38] text-xs text-white px-2 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none text-center" placeholder="Larg" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Comp (cm)</label>
                <input type="number" step="0.01" data-f-comprimento value={comprimento} onChange={e => setComprimento(e.target.value)} className="w-full bg-[#1b1f38] text-xs text-white px-2 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none text-center" placeholder="Comp" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Peso (kg)</label>
                <input type="number" step="0.001" data-f-peso value={peso} onChange={e => setPeso(e.target.value)} className="w-full bg-[#1b1f38] text-xs text-white px-2 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none text-center" placeholder="Kg" />
              </div>
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-xs text-gray-400 mb-1">Descrição SEO</label>
              <textarea value={descricaoSeo} onChange={e => setDescricaoSeo(e.target.value)} className={campo + " h-20"} placeholder="Compre Lancheira Farm..." />
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-xs text-gray-400 mb-1">Descrição Complementar (Template Oficial)</label>
              <textarea data-f-complementar value={descricaoComplementar} onChange={e => setDescricaoComplementar(e.target.value)} className={campo + " h-40 font-mono"} placeholder={"Especificações:\n- Marca:\n..."} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            {editandoId && (
              <button type="button" data-cancelar-edicao onClick={limparFormulario} className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2 rounded-lg font-medium transition cursor-pointer">
                Cancelar edição
              </button>
            )}
            <button type="submit" data-salvar-padrao disabled={salvando} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition cursor-pointer">
              {salvando ? "Salvando..." : editandoId ? "Salvar alterações" : "Salvar Padrão"}
            </button>
          </div>
        </form>

        {/* Listagem */}
        <div className="bg-[#131625] rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Modelos Cadastrados ({padroes.length})</h2>
            {comSimbolos.length > 0 && (
              <button type="button" data-limpar-simbolos disabled={limpando} onClick={limparSimbolosDosModelos} className="bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer">
                {limpando ? "Limpando..." : `🧹 Limpar símbolos (**, ###, ---) de ${comSimbolos.length} modelo(s)`}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase bg-[#1b1f38]">
                  <th className="p-4">Título Referência</th>
                  <th className="p-4">Marca</th>
                  <th className="p-4">Categoria / Medidas</th>
                  <th className="p-4">SEO / Descrição</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-sm">
                {loading ? (
                  <tr><td colSpan={5} className="p-6 text-center text-gray-400">A carregar padrões...</td></tr>
                ) : padroes.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-gray-400">Nenhum padrão cadastrado.</td></tr>
                ) : (
                  padroes.map((p) => (
                    <tr key={p.id} data-padrao={p.id} className={`hover:bg-[#1b1f38]/50 transition ${editandoId === p.id ? "bg-amber-950/20" : ""}`}>
                      <td className="p-4 font-medium text-white">{p.titulo}</td>
                      <td className="p-4 text-gray-300">{p.marca}</td>
                      <td className="p-4 text-gray-300 text-xs">
                        {p.categoria && <div className="font-semibold text-purple-300">{p.categoria}</div>}
                        <div className="text-gray-400 font-mono mt-0.5">
                          {medidas(p)} {p.peso ? `| ${p.peso} kg` : ""}
                        </div>
                      </td>
                      <td className="p-4 text-gray-300">
                        <span className={p.descricao_seo ? "text-green-400" : "text-gray-500"}>✓ SEO</span> •{" "}
                        <span className={p.descricao_complementar ? "text-green-400" : "text-gray-500"}>✓ Desc.</span>
                        {temMarkdown(p.descricao_complementar) && <span title="A descrição tem símbolos de Markdown (**, ###). Use o botão Limpar símbolos." className="text-amber-300"> ⚠</span>}
                      </td>
                      <td className="p-4 text-center whitespace-nowrap">
                        <button onClick={() => editarPadrao(p)} data-editar className="bg-indigo-900/60 hover:bg-indigo-800 text-indigo-100 px-3 py-1 rounded text-xs transition cursor-pointer mr-2">
                          ✏️ Editar
                        </button>
                        <button onClick={() => excluirPadrao(p.id)} className="bg-red-900/60 hover:bg-red-900 text-red-200 px-3 py-1 rounded text-xs transition cursor-pointer">
                          Excluir
                        </button>
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
