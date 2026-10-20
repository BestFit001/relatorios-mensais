"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import * as XLSX from "xlsx";

export default function ProdutosPage() {
  const router = useRouter();
  const [subAba, setSubAba] = useState<"pendentes" | "realizados">("pendentes");
  const [loading, setLoading] = useState(false);

  const [dadosPendentes, setDadosPendentes] = useState<any[]>([]);
  const [cadastrosRealizados, setCadastrosRealizados] = useState<any[]>([]);
  const [canaisLista, setCanaisLista] = useState<string[]>([]);
  const [pesquisaPendentes, setPesquisaPendentes] = useState("");
  const [pesquisaRealizados, setPesquisaRealizados] = useState("");

  // Estado para o Modal de Cadastro Manual
  const [modalAberto, setModalAberto] = useState(false);
  const [formManual, setFormManual] = useState({
    sku: "", produto: "", cor: "", tamanho: "", origem: "", ncm: "", cest: "", ean: "",
    custo: 0, preco_venda: 0, dimensoes_peso: "", marca: "", tabela_medida: "",
    qtdd_ecom: 0, qtdd_fba: 0, ativo: "Não", data_envio_compras: "", codigo: "", observacoes: ""
  });

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

  // Upload de planilha com salvamento persistente e aplicação de filtros
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
        const idxCor = getCol(/cor/i);
        const idxTam = getCol(/tamanho/i);
        const idxOrigem = getCol(/origem/i);
        const idxNcm = getCol(/ncm/i);
        const idxCest = getCol(/cest/i);
        const idxEan = getCol(/ean/i);
        const idxCusto = getCol(/custo/i);
        const idxPreco = getCol(/preço venda|preco|venda/i);
        const idxDimensoes = getCol(/dimensões e peso|dimensoes/i);
        const idxMarca = getCol(/marca/i);
        const idxTabMedida = getCol(/tabela de medida|medida/i);
        const idxQtdEcom = getCol(/qtdd ecom|ecom/i);
        const idxQtdFba = getCol(/qtdd fba|fba/i);
        const idxAtivo = getCol(/ativo/i);
        const idxDataEnvio = getCol(/data envio compras|envio/i);
        const idxCodigo = getCol(/código|codigo/i);
        const idxObs = getCol(/obs|observações/i);

        const skusExistentesSet = new Set([
          ...dadosPendentes.map((c: any) => String(c.sku).trim().toLowerCase()),
          ...cadastrosRealizados.map((c: any) => String(c.sku).trim().toLowerCase())
        ]);

        const novosRegistros: any[] = [];
        let ignoradosAtivoSim = 0;
        let ignoradosDuplicados = 0;

        for (let i = idxHeader + 1; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;

          const skuVal = idxSku !== -1 ? String(row[idxSku] || "").trim() : String(row[0] || "").trim();
          if (!skuVal || skuVal.length < 5 || /sku/i.test(skuVal)) continue;

          // Condição: Ignorar se Ativo for "Sim"
          const ativoVal = idxAtivo !== -1 ? String(row[idxAtivo] || "").trim().toLowerCase() : "";
          if (ativoVal === "sim" || ativoVal === "true" || ativoVal === "1") {
            ignoradosAtivoSim++;
            continue;
          }

          // Condição: Ignorar duplicados
          const skuLower = skuVal.toLowerCase();
          if (skusExistentesSet.has(skuLower)) {
            ignoradosDuplicados++;
            continue;
          }
          skusExistentesSet.add(skuLower); // Evita duplicados no mesmo lote

          novosRegistros.push({
            sku: skuVal,
            produto: idxNome !== -1 ? String(row[idxNome] || "").trim() : "Produto sem nome",
            cor: idxCor !== -1 ? String(row[idxCor] || "").trim() : "",
            tamanho: idxTam !== -1 ? String(row[idxTam] || "").trim() : "",
            origem: idxOrigem !== -1 ? String(row[idxOrigem] || "").trim() : "",
            ncm: idxNcm !== -1 ? String(row[idxNcm] || "").trim() : "",
            cest: idxCest !== -1 ? String(row[idxCest] || "").trim() : "",
            ean: idxEan !== -1 ? String(row[idxEan] || "").trim() : "",
            custo: idxCusto !== -1 ? Number(row[idxCusto]) || 0 : 0,
            preco_venda: idxPreco !== -1 ? Number(row[idxPreco]) || 0 : 0,
            dimensoes_peso: idxDimensoes !== -1 ? String(row[idxDimensoes] || "").trim() : "",
            marca: idxMarca !== -1 ? String(row[idxMarca] || "").trim() : "",
            tabela_medida: idxTabMedida !== -1 ? String(row[idxTabMedida] || "").trim() : "",
            qtdd_ecom: idxQtdEcom !== -1 ? Number(row[idxQtdEcom]) || 0 : 0,
            qtdd_fba: idxQtdFba !== -1 ? Number(row[idxQtdFba]) || 0 : 0,
            ativo: "Não",
            data_envio_compras: idxDataEnvio !== -1 ? String(row[idxDataEnvio] || "").trim() : "",
            codigo: idxCodigo !== -1 ? String(row[idxCodigo] || "").trim() : "",
            observacoes: idxObs !== -1 ? String(row[idxObs] || "").trim() : ""
          });
        }

        if (novosRegistros.length > 0) {
          await supabase.from("produtos_pendentes").upsert(novosRegistros, { onConflict: "sku" });
          await carregarPendentesDoBanco();
        }

        alert(`Planilha importada com sucesso!\n- Adicionados aos Pendentes: ${novosRegistros.length}\n- Ignorados (Ativo = Sim): ${ignoradosAtivoSim}\n- Ignorados (Duplicados): ${ignoradosDuplicados}`);
      } catch (err: any) {
        alert("Erro ao ler planilha: " + err.message);
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  // Salvar Cadastro Manual
  const handleSalvarManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formManual.sku || !formManual.produto) {
      alert("Preencha ao menos o SKU e o Nome do Produto.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("produtos_pendentes").upsert([formManual], { onConflict: "sku" });
    if (error) {
      alert("Erro ao salvar: " + error.message);
    } else {
      alert("✅ Produto adicionado aos Cadastros Pendentes com sucesso!");
      setModalAberto(false);
      setFormManual({
        sku: "", produto: "", cor: "", tamanho: "", origem: "", ncm: "", cest: "", ean: "",
        custo: 0, preco_venda: 0, dimensoes_peso: "", marca: "", tabela_medida: "",
        qtdd_ecom: 0, qtdd_fba: 0, ativo: "Não", data_envio_compras: "", codigo: "", observacoes: ""
      });
      carregarPendentesDoBanco();
    }
    setLoading(false);
  };

  // Mover de Pendentes para Realizados e Tiny ERP
  const enviarParaRealizados = async (item: any) => {
    setLoading(true);
    try {
      // 1. Grava na tabela de realizados
      const { error: errRealizado } = await supabase.from("produtos_novos_cadastrados").upsert([{
        sku: item.sku,
        produto: item.produto,
        cor: item.cor,
        tamanho: item.tamanho,
        origem: item.origem,
        ncm: item.ncm,
        cest: item.cest,
        ean: item.ean,
        custo: item.custo,
        preco_venda: item.preco_venda,
        dimensoes_peso: item.dimensoes_peso,
        marca: item.marca,
        tabela_medida: item.tabela_medida,
        qtdd_ecom: item.qtdd_ecom,
        qtdd_fba: item.qtdd_fba,
        data_envio_compras: item.data_envio_compras,
        codigo: item.codigo,
        observacoes: item.observacoes
      }], { onConflict: "sku" });

      if (errRealizado) throw errRealizado;

      // 2. Apaga da tabela de pendentes
      await supabase.from("produtos_pendentes").delete().eq("sku", item.sku);

      // 3. Insere na base do Tiny ERP para interligar com a aba Cadastros
      await supabase.from("cadastros_base_tiny").upsert({
        sku: item.sku,
        produto: item.produto,
        estoque: 0
      }, { onConflict: "sku" });

      await carregarPendentesDoBanco();
      await carregarRealizadosDoBanco();
      alert(`🚀 Produto ${item.sku} movido para Realizados com sucesso!`);
    } catch (err: any) {
      alert("Erro ao cadastrar: " + err.message);
    }
    setLoading(false);
  };

  const toggleCanalRealizado = async (sku: string, canal: string, checked: boolean) => {
    try {
      if (checked) {
        await supabase.from("mapeamento_canais_skus").insert([{ canal, sku, presente: true }]);
      } else {
        await supabase.from("mapeamento_canais_skus").delete().eq("canal", canal).eq("sku", sku);
      }
    } catch (err: any) {
      console.error("Erro ao atualizar canal:", err);
    }
  };

  const pendentesFiltrados = dadosPendentes.filter((c) =>
    String(c.sku || "").toLowerCase().includes(pesquisaPendentes.toLowerCase()) ||
    String(c.produto || "").toLowerCase().includes(pesquisaPendentes.toLowerCase())
  );

  const realizadosFiltrados = cadastrosRealizados.filter((c) =>
    String(c.sku || "").toLowerCase().includes(pesquisaRealizados.toLowerCase()) ||
    String(c.produto || "").toLowerCase().includes(pesquisaRealizados.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Gestão de Produtos</h1>
            <p className="text-sm font-medium text-slate-400">Controle completo de Cadastros Pendentes, Inclusão Manual e Realizados</p>
          </div>
          <Navbar />
        </div>

        <div className="flex justify-between items-center flex-wrap gap-4">
          <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
            <button
              onClick={() => setSubAba("pendentes")}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
                subAba === "pendentes" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
              }`}
            >
              Cadastros Pendentes ({dadosPendentes.length})
            </button>
            <button
              onClick={() => setSubAba("realizados")}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
                subAba === "realizados" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
              }`}
            >
              Cadastros Realizados ({cadastrosRealizados.length})
            </button>
          </div>

          {subAba === "pendentes" && (
            <button
              onClick={() => setModalAberto(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg transition-all"
            >
              + Inserir Produto Manualmente
            </button>
          )}
        </div>

        {subAba === "pendentes" ? (
          <div className="space-y-6">
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Upload de Planilha de Produtos a Cadastrar</h3>
              <p className="text-xs text-slate-400">Itens duplicados e com Ativo = "Sim" são descartados automaticamente, e os demais ficam salvos na base.</p>
              
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleUploadPendentes}
                  className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer"
                />
              </div>
            </div>

            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Produtos Pendentes ({pendentesFiltrados.length})</h3>
                <input
                  type="text"
                  value={pesquisaPendentes}
                  onChange={(e) => setPesquisaPendentes(e.target.value)}
                  placeholder="Pesquisar SKU ou Nome..."
                  className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none w-72"
                />
              </div>

              <div className="overflow-x-auto max-h-[500px] rounded-xl border border-slate-800">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                    <tr>
                      <th className="p-3">SKU</th>
                      <th className="p-3">Nome do Produto</th>
                      <th className="p-3">Cor</th>
                      <th className="p-3">Tamanho</th>
                      <th className="p-3">Marca</th>
                      <th className="p-3">NCM</th>
                      <th className="p-3">EAN</th>
                      <th className="p-3 text-right">Custo</th>
                      <th className="p-3 text-right">Preço Venda</th>
                      <th className="p-3 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {pendentesFiltrados.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-mono text-indigo-400 font-bold">{item.sku}</td>
                        <td className="p-3 text-white">{item.produto}</td>
                        <td className="p-3 text-slate-300">{item.cor || "—"}</td>
                        <td className="p-3 text-slate-300">{item.tamanho || "—"}</td>
                        <td className="p-3 text-slate-300">{item.marca || "—"}</td>
                        <td className="p-3 text-slate-300 font-mono">{item.ncm || "—"}</td>
                        <td className="p-3 text-slate-300 font-mono">{item.ean || "—"}</td>
                        <td className="p-3 text-right font-mono text-rose-400">R$ {Number(item.custo).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-emerald-400">R$ {Number(item.preco_venda).toFixed(2)}</td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => enviarParaRealizados(item)}
                            disabled={loading}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer shadow"
                          >
                            Cadastrar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {pendentesFiltrados.length === 0 && (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-slate-500">Nenhum produto pendente encontrado.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Cadastros Realizados & Marcação por Canais</h3>
              <input
                type="text"
                value={pesquisaRealizados}
                onChange={(e) => setPesquisaRealizados(e.target.value)}
                placeholder="Pesquisar por SKU ou Nome..."
                className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none w-full md:w-80"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[600px]">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                  <tr>
                    <th className="p-3.5">SKU</th>
                    <th className="p-3.5">Nome do Produto</th>
                    <th className="p-3.5">Marca</th>
                    <th className="p-3.5">Cor / Tam</th>
                    {canaisLista.map((canal, cIdx) => (
                      <th key={cIdx} className="p-3.5 text-center text-[9px]">{canal}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {realizadosFiltrados.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-indigo-400">{item.sku}</td>
                      <td className="p-3.5 font-semibold text-white">{item.produto || "—"}</td>
                      <td className="p-3.5 text-slate-300">{item.marca || "—"}</td>
                      <td className="p-3.5 text-slate-300">{item.cor} / {item.tamanho}</td>
                      {canaisLista.map((canal, cIdx) => (
                        <td key={cIdx} className="p-3.5 text-center">
                          <input
                            type="checkbox"
                            onChange={(e) => toggleCanalRealizado(item.sku, canal, e.target.checked)}
                            className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {realizadosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={4 + canaisLista.length} className="p-8 text-center text-slate-500">Nenhum cadastro realizado encontrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MODAL DE CADASTRO MANUAL */}
        {modalAberto && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-white">Inserir Novo Produto Manualmente (Pendentes)</h3>
                <button onClick={() => setModalAberto(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
              </div>

              <form onSubmit={handleSalvarManual} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">SKU *</label>
                  <input type="text" required value={formManual.sku} onChange={(e) => setFormManual({...formManual, sku: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nome do Produto *</label>
                  <input type="text" required value={formManual.produto} onChange={(e) => setFormManual({...formManual, produto: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cor</label>
                  <input type="text" value={formManual.cor} onChange={(e) => setFormManual({...formManual, cor: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tamanho</label>
                  <input type="text" value={formManual.tamanho} onChange={(e) => setFormManual({...formManual, tamanho: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Marca</label>
                  <input type="text" value={formManual.marca} onChange={(e) => setFormManual({...formManual, marca: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Origem</label>
                  <input type="text" value={formManual.origem} onChange={(e) => setFormManual({...formManual, origem: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">NCM</label>
                  <input type="text" value={formManual.ncm} onChange={(e) => setFormManual({...formManual, ncm: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">CEST</label>
                  <input type="text" value={formManual.cest} onChange={(e) => setFormManual({...formManual, cest: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">EAN</label>
                  <input type="text" value={formManual.ean} onChange={(e) => setFormManual({...formManual, ean: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Custo (R$)</label>
                  <input type="number" step="0.01" value={formManual.custo} onChange={(e) => setFormManual({...formManual, custo: Number(e.target.value)})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Preço Venda (R$)</label>
                  <input type="number" step="0.01" value={formManual.preco_venda} onChange={(e) => setFormManual({...formManual, preco_venda: Number(e.target.value)})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Dimensões e Peso</label>
                  <input type="text" value={formManual.dimensoes_peso} onChange={(e) => setFormManual({...formManual, dimensoes_peso: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tabela de Medida</label>
                  <input type="text" value={formManual.tabela_medida} onChange={(e) => setFormManual({...formManual, tabela_medida: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">QTDD ECOM</label>
                  <input type="number" value={formManual.qtdd_ecom} onChange={(e) => setFormManual({...formManual, qtdd_ecom: Number(e.target.value)})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">QTDD FBA</label>
                  <input type="number" value={formManual.qtdd_fba} onChange={(e) => setFormManual({...formManual, qtdd_fba: Number(e.target.value)})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Envio Compras</label>
                  <input type="text" value={formManual.data_envio_compras} onChange={(e) => setFormManual({...formManual, data_envio_compras: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Código</label>
                  <input type="text" value={formManual.codigo} onChange={(e) => setFormManual({...formManual, codigo: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Observações</label>
                  <input type="text" value={formManual.observacoes} onChange={(e) => setFormManual({...formManual, observacoes: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white" />
                </div>

                <div className="md:col-span-3 flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button type="button" onClick={() => setModalAberto(false)} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-5 rounded-xl cursor-pointer">Cancelar</button>
                  <button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-6 rounded-xl cursor-pointer">Salvar Produto</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}