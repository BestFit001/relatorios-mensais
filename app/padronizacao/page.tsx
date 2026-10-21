"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function PadronizacaoPage() {
  const [padroes, setPadroes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados do formulário
  const [titulo, setTitulo] = useState("");
  const [marca, setMarca] = useState("");
  const [slug, setSlug] = useState("");
  const [palavrasChave, setPalavrasChave] = useState("");
  const [descricaoSeo, setDescricaoSeo] = useState("");
  const [descricaoComplementar, setDescricaoComplementar] = useState("");

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

  async function salvarPadrao(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo || !marca) {
      alert("Título e Marca são obrigatórios.");
      return;
    }

    const novoPadrao = {
      titulo,
      marca,
      slug,
      palavras_chave_seo: palavrasChave,
      descricao_seo: descricaoSeo,
      descricao_complementar: descricaoComplementar,
    };

    const { error } = await supabase.from("padroes_anuncios").insert([novoPadrao]);

    if (error) {
      alert("Erro ao salvar: " + error.message);
    } else {
      setTitulo("");
      setMarca("");
      setSlug("");
      setPalavrasChave("");
      setDescricaoSeo("");
      setDescricaoComplementar("");
      carregarPadroes();
    }
  }

  async function excluirPadrao(id: string) {
    if (!confirm("Tem a certeza que deseja excluir este padrão?")) return;
    const { error } = await supabase.from("padroes_anuncios").delete().eq("id", id);
    if (error) {
      alert("Erro ao excluir: " + error.message);
    } else {
      carregarPadroes();
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0f18] text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
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

        {/* Formulário de Criação */}
        <form onSubmit={salvarPadrao} className="bg-[#131625] p-6 rounded-xl border border-gray-800 space-y-4">
          <h2 className="text-lg font-semibold text-purple-400">Novo Produto Modelo</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Título do Produto Referência</label>
              <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} className="w-full bg-[#1b1f38] text-sm text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none" placeholder="Ex: Lancheira Farm Ziriguidum" required />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Marca</label>
              <input type="text" value={marca} onChange={e => setMarca(e.target.value)} className="w-full bg-[#1b1f38] text-sm text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none" placeholder="Ex: Farm Rio" required />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Slug Ideal</label>
              <input type="text" value={slug} onChange={e => setSlug(e.target.value)} className="w-full bg-[#1b1f38] text-sm text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none" placeholder="Ex: lancheira-farm-ziriguidum" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Palavras-chave SEO</label>
              <input type="text" value={palavrasChave} onChange={e => setPalavrasChave(e.target.value)} className="w-full bg-[#1b1f38] text-sm text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none" placeholder="Ex: Lancheira, Farm, Térmica..." />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Descrição SEO</label>
              <textarea value={descricaoSeo} onChange={e => setDescricaoSeo(e.target.value)} className="w-full bg-[#1b1f38] text-sm text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none h-20" placeholder="Compre Lancheira Farm..." />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Descrição Complementar (Template Oficial)</label>
              <textarea value={descricaoComplementar} onChange={e => setDescricaoComplementar(e.target.value)} className="w-full bg-[#1b1f38] text-sm text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none h-40 font-mono" placeholder="Especificações:&#10;- Marca:&#10;..." />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition">
              Salvar Padrão
            </button>
          </div>
        </form>

        {/* Listagem */}
        <div className="bg-[#131625] rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h2 className="font-semibold">Modelos Cadastrados</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase bg-[#1b1f38]">
                  <th className="p-4">Título Referência</th>
                  <th className="p-4">Marca</th>
                  <th className="p-4">SEO / Descrição</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-sm">
                {loading ? (
                  <tr><td colSpan={4} className="p-6 text-center text-gray-400">A carregar padrões...</td></tr>
                ) : padroes.length === 0 ? (
                  <tr><td colSpan={4} className="p-6 text-center text-gray-400">Nenhum padrão cadastrado.</td></tr>
                ) : (
                  padroes.map((p) => (
                    <tr key={p.id} className="hover:bg-[#1b1f38]/50 transition">
                      <td className="p-4 font-medium text-white">{p.titulo}</td>
                      <td className="p-4 text-gray-300">{p.marca}</td>
                      <td className="p-4 text-gray-300">
                        <span className={p.descricao_seo ? "text-green-400" : "text-gray-500"}>✓ SEO</span> •{" "}
                        <span className={p.descricao_complementar ? "text-green-400" : "text-gray-500"}>✓ Desc.</span>
                      </td>
                      <td className="p-4 text-center">
                        <button onClick={() => excluirPadrao(p.id)} className="bg-red-900/60 hover:bg-red-900 text-red-200 px-3 py-1 rounded text-xs transition">
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