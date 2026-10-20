"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import * as XLSX from "xlsx";

export default function ProdutosPage() {
  const router = useRouter();
  const [subAba, setSubAba] = useState<"pendentes" | "realizados" | "periodo">("pendentes");
  const [loading, setLoading] = useState(false);

  const [dadosPendentes, setDadosPendentes] = useState<any[]>([]);
  const [cadastrosRealizados, setCadastrosRealizados] = useState<any[]>([]);
  const [canaisLista, setCanaisLista] = useState<string[]>([]);
  
  const [pesquisaGlobal, setPesquisaGlobal] = useState("");
  const [itensPorPagina, setItemsPorPagina] = useState(10);
  const [filtroStatusRealizados, setFiltroStatusRealizados] = useState<"todos" | "completos" | "parciais">("todos");
  const [filtroCanalEspecifico, setFiltroCanalEspecifico] = useState<string>("todos");

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarDadosIniciais();
  }, []);

  const carregarDadosIniciais = async () => {
    setLoading(true);
    const { data: regrasCanais } = await supabase.from("config_regras_canais").select("canal").order("id");
    if (regrasCanais && regrasCanais.length > 0) {
      setCanaisLista(regrasCanais.map((r: any) => r.canal));
    } else {
      setCanaisLista(["Mercado Livre 1", "Mercado Livre 2", "Shopee", "Amazon", "Magalu", "TikTok Shop"]);
    }

    await carregarPendentesDoBanco();
    await carregarRealizadosDoBanco();
    setLoading(false);
  };

  const carregarPendentesDoBanco = async () => {
    const { data } = await supabase.from("produtos_pendentes").select("*").order("id", { ascending: false });
    if (data) setDadosPendentes(data);
  };

  const carregarRealizadosDoBanco = async () => {
    const { data } = await supabase.from("produtos_novos_cadastrados").select("*").order("id", { ascending: false });
    if (data) setCadastrosRealizados(data);
  };

  const handleUploadPendentes = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result;
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        let idxHeader = -1;
        for (let i = 0; i < Math.min(json.length, 10); i++) {
          const row = json[i];
          if (row && row.some((cell: any) => /sku/i.test(String(cell)))) {
            idxHeader = i;
            break;
          }
        }
        if (idxHeader === -1) idxHeader = 2;

        const headers = json[idxHeader].map((h: any) => String(h || "").trim());
        const getCol = (nameRegex: RegExp) => headers.findIndex((h: string) => nameRegex.test(h));

        const idxSku = getCol(/sku/i);
        const idxNome = getCol(/nome do produto|produto/i);
        const idxCusto = getCol(/custo/i);
        const idxPreco = getCol(/preço venda|preco|venda/i);
        const idxMarca = getCol(/marca/i);
        const idxAtivo = getCol(/ativo/i);

        const novosRegistros: any[] = [];
        for (let i = idxHeader + 1; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;

          const skuVal = idxSku !== -1 ? String(row[idxSku] || "").trim() : String(row[0] || "").trim();
          if (!skuVal || skuVal.length < 5 || /sku/i.test(skuVal)) continue;

          const ativoVal = idxAtivo !== -1 ? String(row[idxAtivo] || "").trim().toLowerCase() : "";
          if (ativoVal === "sim" || ativoVal === "true" || ativoVal === "1") continue;

          const skuPai = skuVal.length > 5 ? skuVal.substring(0, 5) : skuVal;

          novosRegistros.push({
            sku: skuVal,
            sku_pai: skuPai,
            produto: idxNome !== -1 ? String(row[idxNome] || "").trim() : "Produto sem nome",
            marca: idxMarca !== -1 ? String(row[idxMarca] || "").trim() : "BEST FIT",
            custo: idxCusto !== -1 ? Number(row[idxCusto]) || 0 : 0,
            preco_venda: idxPreco !== -1 ? Number(row[idxPreco]) || 0 : 0
          });
        }

        if (novosRegistros.length > 0) {
          await supabase.from("produtos_pendentes").upsert(novosRegistros, { onConflict: "sku" });
          await carregarPendentesDoBanco();
        }
        alert(`Planilha importada com sucesso! ${novosRegistros.length} itens adicionados.`);
      } catch (err: any) {
        alert("Erro ao ler planilha: " + err.message);
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const enviarParaRealizados = async (item: any) => {
    setLoading(true);
    try {
      const { error } = await supabase.from("produtos_novos_cadastrados").upsert([{
        sku: item.sku,
        sku_pai: item.sku_pai || item.sku.substring(0, 5),
        produto: item.produto,
        marca: item.marca,
        custo: item.custo,
        preco_venda: item.preco_venda,
        data_cadastro: new Date().toISOString(),
        canais_enviados: {},
        clipes_enviados: {}
      }], { onConflict: "sku" });

      if (error) throw error;
      await supabase.from("produtos_pendentes").delete().eq("sku", item.sku);

      await supabase.from("cadastros_base_tiny").upsert({ sku: item.sku, produto: item.produto, estoque: 0 }, { onConflict: "sku" });

      await carregarPendentesDoBanco();
      await carregarRealizadosDoBanco();
      alert(`🚀 SKU ${item.sku} cadastrado com sucesso!`);
    } catch (err: any) {
      alert("Erro: " + err.message);
    }
    setLoading(false);
  };

  const toggleCanal = async (skuOuPai: string, canal: string, checked: boolean, isPai: boolean) => {
    try {
      const atualizados = [...cadastrosRealizados];
      const alvos = isPai ? atualizados.filter(i => i.sku_pai === skuOuPai) : atualizados.filter(i => i.sku === skuOuPai);

      for (const alvo of alvos) {
        const canais = alvo.canais_enviados || {};
        canais[canal] = checked;
        alvo.canais_enviados = canais;

        await supabase.from("produtos_novos_cadastrados").update({ canais_enviados: canais }).eq("sku", alvo.sku);
      }
      setCadastrosRealizados(atualizados);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleClipe = async (skuOuPai: string, canal: string, checked: boolean, isPai: boolean) => {
    try {
      const atualizados = [...cadastrosRealizados];
      const alvos = isPai ? atualizados.filter(i => i.sku_pai === skuOuPai) : atualizados.filter(i => i.sku === skuOuPai);

      for (const alvo of alvos) {
        const clipes = alvo.clipes_enviados || {};
        clipes[canal] = checked;
        alvo.clipes_enviados = clipes;

        await supabase.from("produtos_novos_cadastrados").update({
          clipes_enviados: clipes,
          data_clipes: checked ? new Date().toISOString() : alvo.data_clipes
        }).eq("sku", alvo.sku);
      }
      setCadastrosRealizados(atualizados);
    } catch (err) {
      console.error(err);
    }
  };

  const agruparPorPai = (lista: any[]) => {
    const grupos: { [pai: string]: any[] } = {};
    lista.forEach(item => {
      const pai = item.sku_pai || item.sku.substring(0, 5);
      if (!grupos[pai]) grupos[pai] = [];
      grupos[pai].push(item);
    });
    return grupos;
  };

  const filtrarLista = (lista: any[]) => {
    return lista.filter(item => {
      const matchPesquisa = 
        String(item.sku || "").toLowerCase().includes(pesquisaGlobal.toLowerCase()) ||
        String(item.produto || "").toLowerCase().includes(pesquisaGlobal.toLowerCase()) ||
        String(item.sku_pai || "").toLowerCase().includes(pesquisaGlobal.toLowerCase());
      
      if (!matchPesquisa) return false;

      if (subAba === "realizados") {
        const canais = item.canais_enviados || {};
        const totalCanais = canaisLista.length;
        const marcados = canaisLista.filter(c => canais[c]).length;
        const isCompleto = totalCanais > 0 && marcados === totalCanais;

        if (filtroStatusRealizados === "completos" && !isCompleto) return false;
        if (filtroStatusRealizados === "parciais" && (isCompleto || marcados === 0)) return false;

        if (filtroCanalEspecifico !== "todos" && !canais[filtroCanalEspecifico]) return false;
      }

      return true;
    });
  };

  const pendentesFiltrados = filtrarLista(dadosPendentes);
  const realizadosFiltrados = filtrarLista(cadastrosRealizados);
  const gruposRealizados = agruparPorPai(realizadosFiltrados);
  const chavesGrupos = Object.keys(gruposRealizados);

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Gestão de Produtos por Pai & Variações</h1>
            <p className="text-sm font-medium text-slate-400">Controle de cadastros, clipes, canais e relatórios por período</p>
          </div>
          <Navbar />
        </div>

        <div className="flex flex-wrap justify-between items-center gap-4 bg-slate-900 p-3 rounded-2xl border border-slate-800">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setSubAba("pendentes")}
              className={`px-5 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer transition-all ${
                subAba === "pendentes" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Pendentes ({dadosPendentes.length})
            </button>
            <button
              onClick={() => setSubAba("realizados")}
              className={`px-5 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer transition-all ${
                subAba === "realizados" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Realizados ({cadastrosRealizados.length})
            </button>
            <button
              onClick={() => setSubAba("periodo")}
              className={`px-5 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer transition-all ${
                subAba === "periodo" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Período & Gráficos
            </button>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              value={pesquisaGlobal}
              onChange={(e) => setPesquisaGlobal(e.target.value)}
              placeholder="🔍 Pesquisar SKU, Pai ou Nome..."
              className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white outline-none w-72"
            />
          </div>
        </div>

        {subAba === "pendentes" && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-3">
              <h3 className="text-sm font-bold text-white uppercase">Upload de Planilha de Produtos</h3>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleUploadPendentes}
                className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:bg-purple-600 file:text-white cursor-pointer"
              />
            </div>

            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden p-6">
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-slate-950 sticky top-0 text-slate-400 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">SKU Pai / Variação</th>
                      <th className="p-3">Nome do Produto</th>
                      <th className="p-3 text-right">Custo</th>
                      <th className="p-3 text-right">Preço Venda</th>
                      <th className="p-3 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {pendentesFiltrados.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="p-3 font-mono">
                          <span className="text-purple-400 font-bold">Pai: {item.sku_pai}</span><br/>
                          <span className="text-indigo-300">Var: {item.sku}</span>
                        </td>
                        <td className="p-3 text-white">{item.produto}</td>
                        <td className="p-3 text-right font-mono text-rose-400">R$ {Number(item.custo).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-emerald-400">R$ {Number(item.preco_venda).toFixed(2)}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => enviarParaRealizados(item)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-xs font-bold cursor-pointer"
                          >
                            Cadastrar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {subAba === "realizados" && (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4 border-b border-slate-800 pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-slate-400 uppercase">Filtros:</span>
                <select
                  value={filtroStatusRealizados}
                  onChange={(e) => setFiltroStatusRealizados(e.target.value as any)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none cursor-pointer"
                >
                  <option value="todos">Todos os Status</option>
                  <option value="completos">100% Concluídos</option>
                  <option value="parciais">Parcialmente Concluídos</option>
                </select>

                <select
                  value={filtroCanalEspecifico}
                  onChange={(e) => setFiltroCanalEspecifico(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none cursor-pointer"
                >
                  <option value="todos">Todos os Canais</option>
                  {canaisLista.map((c, i) => <option key={i} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Exibir por página:</span>
                <select
                  value={itensPorPagina}
                  onChange={(e) => setItemsPorPagina(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-white outline-none cursor-pointer"
                >
                  <option value={5}>5 grupos</option>
                  <option value={10}>10 grupos</option>
                  <option value={20}>20 grupos</option>
                  <option value={50}>50 grupos</option>
                </select>
              </div>
            </div>

            <div className="space-y-6">
              {chavesGrupos.slice(0, itensPorPagina).map((paiKey, gIdx) => {
                const itensDoGrupo = gruposRealizados[paiKey];
                return (
                  <div key={gIdx} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                      <span className="text-xs font-mono font-black text-purple-400 uppercase">SKU PAI: {paiKey} ({itensDoGrupo.length} variações)</span>
                      <span className="text-[10px] text-slate-500">Cadastrado em: {new Date(itensDoGrupo[0].data_cadastro || Date.now()).toLocaleDateString("pt-BR")}</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-[10px] text-slate-400 uppercase border-b border-slate-900">
                            <th className="p-2">SKU Variação / Produto</th>
                            {canaisLista.map((canal, cIdx) => (
                              <th key={cIdx} className="p-2 text-center text-[9px]">{canal}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/50">
                          {/* LINHA DO PAI LIMPA PARA MARCAR TODOS OS CANAIS */}
                          <tr className="bg-purple-950/20 font-bold">
                            <td className="p-2 text-purple-300 font-mono">📁 {paiKey}</td>
                            {canaisLista.map((canal, cIdx) => {
                              const todosMarcados = itensDoGrupo.every(i => (i.canais_enviados || {})[canal]);
                              return (
                                <td key={cIdx} className="p-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={todosMarcados}
                                    onChange={(e) => toggleCanal(paiKey, canal, e.target.checked, true)}
                                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                                  />
                                </td>
                              );
                            })}
                          </tr>

                          {/* LINHAS DAS VARIAÇÕES FILHAS COM 2 FILEIRAS (CADASTRO E CLIPES) */}
                          {itensDoGrupo.map((item, vIdx) => (
                            <tr key={vIdx} className="hover:bg-slate-900/40">
                              <td className="p-2">
                                <span className="font-mono text-indigo-300 font-bold">↳ {item.sku}</span><br/>
                                <span className="text-[10px] text-slate-400">{item.produto}</span>
                              </td>
                              {canaisLista.map((canal, cIdx) => (
                                <td key={cIdx} className="p-2 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <div className="flex items-center gap-1" title="Cadastro no Canal">
                                      <span className="text-[9px] text-slate-400 w-10 text-right">Cad:</span>
                                      <input
                                        type="checkbox"
                                        checked={Boolean((item.canais_enviados || {})[canal])}
                                        onChange={(e) => toggleCanal(item.sku, canal, e.target.checked, false)}
                                        className="w-3.5 h-3.5 accent-purple-600 rounded cursor-pointer"
                                      />
                                    </div>
                                    <div className="flex items-center gap-1" title="Clipes Upados">
                                      <span className="text-[9px] text-purple-400 w-10 text-right">Clipe:</span>
                                      <input
                                        type="checkbox"
                                        checked={Boolean((item.clipes_enviados || {})[canal])}
                                        onChange={(e) => toggleClipe(item.sku, canal, e.target.checked, false)}
                                        className="w-3.5 h-3.5 accent-indigo-600 rounded cursor-pointer"
                                      />
                                    </div>
                                  </div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              {chavesGrupos.length === 0 && (
                <p className="text-center text-slate-500 py-8">Nenhum produto realizado encontrado com os filtros selecionados.</p>
              )}
            </div>
          </div>
        )}

        {subAba === "periodo" && (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Relatórios e Estatísticas por Período</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">Total Cadastros Realizados</span>
                <p className="text-3xl font-black text-emerald-400 mt-2">{cadastrosRealizados.length}</p>
              </div>
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">Total Produtos Pendentes</span>
                <p className="text-3xl font-black text-amber-400 mt-2">{dadosPendentes.length}</p>
              </div>
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">Grupos de SKUs Pai</span>
                <p className="text-3xl font-black text-purple-400 mt-2">{Object.keys(agruparPorPai(cadastrosRealizados)).length}</p>
              </div>
            </div>

            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 text-center text-slate-400 text-xs">
              📊 Aqui você pode comparar o volume de cadastros e vídeos upados por data, mês ou período selecionado.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}