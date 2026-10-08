"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

type SubItemCarrinho = {
  sku: string;
  produto: string;
  marca: string;
};

type LinhaRegistro = {
  isCarrinho: boolean;
  pedido: string;
  canal: string;
  nf: string;
  solicitacao: string;
  sku: string;
  produto: string;
  marca: string;
  pdv: string;
  frete: string;
  motivo: string;
  observacoes: string;
  condicoes: string;
  subItens: SubItemCarrinho[];
};

const formatarMoeda = (valor: number) => {
  return "R$ " + (valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function DevolucoesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const hoje = new Date().toISOString().split("T")[0];
  const [dataGlobalRetorno, setDataGlobalRetorno] = useState(hoje);

  const [canaisAtivos, setCanaisAtivos] = useState<string[]>([]);
  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());
  const [devolucoes, setDevolucoes] = useState<any[]>([]);

  // Filtros
  const [filtroCanal, setFiltroCanal] = useState("");
  const [filtroMes, setFiltroMes] = useState("");

  // Edição
  const [idEditando, setIdEditando] = useState<number | null>(null);
  const [dadosEdicao, setDadosEdicao] = useState<any>({});

  const linhaInicial: LinhaRegistro = {
    isCarrinho: false,
    pedido: "",
    canal: "",
    nf: "",
    solicitacao: "Devolução",
    sku: "",
    produto: "",
    marca: "",
    pdv: "",
    frete: "",
    motivo: "",
    observacoes: "",
    condicoes: "Sim",
    subItens: []
  };

  const [linhas, setLinhas] = useState<LinhaRegistro[]>([{ ...linhaInicial }]);

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarDadosAuxiliares();
    carregarDevolucoes();
  }, []);

  const carregarDadosAuxiliares = async () => {
    const { data: canaisData } = await supabase.from("config_regras_canais").select("canal").order("id");
    if (canaisData) setCanaisAtivos(canaisData.map(c => c.canal));

    let allCustos: any[] = [];
    let from = 0;
    let step = 1000;
    let keep = true;
    while (keep) {
      const { data } = await supabase.from("tabela_custos_skus").select("*").range(from, from + step - 1);
      if (data && data.length > 0) {
        allCustos = [...allCustos, ...data];
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }

    const mapa = new Map();
    allCustos.forEach((c: any) => {
      const s = String(c.sku || "").trim().toLowerCase();
      if (s) mapa.set(s, c);
    });
    setCustosMap(mapa);
  };

  const carregarDevolucoes = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("devolucoes").select("*").order("id", { ascending: false });
    if (!error && data) setDevolucoes(data);
    setLoading(false);
  };

  const buscarProdutoSku = (sku: string) => {
    const limpo = String(sku || "").trim().toLowerCase();
    const item = custosMap.get(limpo);
    return {
      produto: item?.produto || "",
      marca: item?.marca || ""
    };
  };

  const atualizarLinha = (index: number, campo: keyof LinhaRegistro, valor: any) => {
    const novas = [...linhas];
    novas[index] = { ...novas[index], [campo]: valor };

    if (campo === "sku") {
      const { produto, marca } = buscarProdutoSku(valor);
      novas[index].produto = produto;
      novas[index].marca = marca;
    }

    if (campo === "isCarrinho" && valor === true && novas[index].subItens.length === 0) {
      novas[index].subItens = [{ sku: "", produto: "", marca: "" }];
    }

    setLinhas(novas);
  };

  const adicionarSubItem = (indexLinha: number) => {
    const novas = [...linhas];
    novas[indexLinha].subItens.push({ sku: "", produto: "", marca: "" });
    setLinhas(novas);
  };

  const removerSubItem = (indexLinha: number, subIndex: number) => {
    const novas = [...linhas];
    novas[indexLinha].subItens.splice(subIndex, 1);
    setLinhas(novas);
  };

  const atualizarSubItem = (indexLinha: number, subIndex: number, skuValor: string) => {
    const novas = [...linhas];
    const { produto, marca } = buscarProdutoSku(skuValor);
    novas[indexLinha].subItens[subIndex] = {
      sku: skuValor,
      produto,
      marca
    };
    setLinhas(novas);
  };

  const adicionarLinha = () => {
    setLinhas([...linhas, { ...linhaInicial, canal: canaisAtivos[0] || "" }]);
  };

  const removerLinha = (index: number) => {
    setLinhas(linhas.filter((_, i) => i !== index));
  };

  const salvarDevolucoes = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    const registrosParaSalvar: any[] = [];

    for (const l of linhas) {
      if (!l.pedido.trim() || !l.sku.trim()) continue;

      const freteNum = l.frete ? -Math.abs(Number(l.frete.replace(/\./g, "").replace(",", "."))) : 0;
      const pdvNum = l.pdv ? Number(l.pdv.replace(/\./g, "").replace(",", ".")) : 0;

      // Item principal da linha
      registrosParaSalvar.push({
        pedido: l.pedido.trim(),
        canal: l.canal,
        nota_fiscal: l.nf.trim(),
        solicitacao: l.solicitacao,
        sku: l.sku.trim(),
        produto: l.produto || "Produto sem cadastro",
        marca: l.marca || "-",
        valor_pdv: pdvNum,
        custo_frete: freteNum,
        motivo: l.motivo,
        observacoes: l.observacoes,
        condicoes: l.condicoes,
        data_retorno: dataGlobalRetorno,
        valor_convertido: 0
      });

      // Itens adicionais do carrinho (se houver)
      if (l.isCarrinho && l.subItens.length > 0) {
        for (const sub of l.subItens) {
          if (!sub.sku.trim()) continue;
          registrosParaSalvar.push({
            pedido: l.pedido.trim(),
            canal: l.canal,
            nota_fiscal: l.nf.trim(),
            solicitacao: l.solicitacao,
            sku: sub.sku.trim(),
            produto: sub.produto || "Produto sem cadastro",
            marca: sub.marca || "-",
            valor_pdv: 0,
            custo_frete: 0,
            motivo: l.motivo,
            observacoes: l.observacoes,
            condicoes: l.condicoes,
            data_retorno: dataGlobalRetorno,
            valor_convertido: 0
          });
        }
      }
    }

    if (registrosParaSalvar.length === 0) {
      alert("Preencha ao menos um Pedido e SKU válidos.");
      setSalvando(false);
      return;
    }

    const { error } = await supabase.from("devolucoes").insert(registrosParaSalvar);
    if (error) {
      alert("Erro ao salvar devoluções: " + error.message);
    } else {
      alert("✅ Devoluções salvas com sucesso!");
      setLinhas([{ ...linhaInicial, canal: canaisAtivos[0] || "" }]);
      carregarDevolucoes();
    }
    setSalvando(false);
  };

  const iniciarEdicao = (item: any) => {
    setIdEditando(item.id);
    setDadosEdicao({ ...item });
  };

  const salvarEdicao = async (id: number) => {
    const freteNum = dadosEdicao.custo_frete ? -Math.abs(Number(String(dadosEdicao.custo_frete).replace(",", "."))) : 0;
    const convert = dadosEdicao.valor_convertido ? Number(String(dadosEdicao.valor_convertido).replace(",", ".")) : 0;
    const pdvNum = dadosEdicao.valor_pdv ? Number(String(dadosEdicao.valor_pdv).replace(",", ".")) : 0;

    const { error } = await supabase.from("devolucoes").update({
      pedido: dadosEdicao.pedido,
      canal: dadosEdicao.canal,
      nota_fiscal: dadosEdicao.nota_fiscal,
      solicitacao: dadosEdicao.solicitacao,
      sku: dadosEdicao.sku,
      produto: dadosEdicao.produto,
      marca: dadosEdicao.marca,
      valor_pdv: pdvNum,
      custo_frete: freteNum,
      motivo: dadosEdicao.motivo,
      observacoes: dadosEdicao.observacoes,
      condicoes: dadosEdicao.condicoes,
      valor_convertido: convert
    }).eq("id", id);

    if (error) alert("Erro ao atualizar: " + error.message);
    else {
      setIdEditando(null);
      carregarDevolucoes();
    }
  };

  const excluirDevolucao = async (id: number) => {
    if (!confirm("Excluir este registo definitivamente?")) return;
    const { error } = await supabase.from("devolucoes").delete().eq("id", id);
    if (error) alert("Erro: " + error.message);
    else carregarDevolucoes();
  };

  // Filtragem
  const devolucoesFiltradas = devolucoes.filter(d => {
    const matchCanal = !filtroCanal || d.canal === filtroCanal;
    const matchMes = !filtroMes || (d.data_retorno && d.data_retorno.startsWith(filtroMes));
    return matchCanal && matchMes;
  });

  // Totais
  const totalPDV = devolucoesFiltradas.reduce((acc, d) => acc + Number(d.valor_pdv || 0), 0);
  const totalFreteReverso = devolucoesFiltradas.reduce((acc, d) => acc + Number(d.custo_frete || 0), 0);
  const totalConvertido = devolucoesFiltradas.reduce((acc, d) => acc + Number(d.valor_convertido || 0), 0);

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Registo & Controlo de Devoluções</h1>
            <p className="text-sm font-medium text-slate-400">Gestão de Fretes Reversos, Avarias e Mediações</p>
          </div>
          <Navbar />
        </div>

        {/* CARDS DE RESUMO */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Devoluções</span>
            <span className="text-2xl font-black text-white">{devolucoesFiltradas.length} itens</span>
          </div>
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total em PDV</span>
            <span className="text-2xl font-black text-emerald-400">{formatarMoeda(totalPDV)}</span>
          </div>
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Custo C/ Frete Reverso (Prejuízo)</span>
            <span className="text-2xl font-black text-rose-400">{formatarMoeda(totalFreteReverso)}</span>
          </div>
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl">
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block mb-1">Valor Convertido (Mediações)</span>
            <span className="text-2xl font-black text-purple-400">{formatarMoeda(totalConvertido)}</span>
          </div>
        </div>

        {/* FORMULÁRIO DE REGISTO */}
        <div className="bg-slate-900/90 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">➕ Registar Devoluções</h2>
              <p className="text-xs text-slate-400 mt-1">Marque o carrinho para pedidos com múltiplos SKUs.</p>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center gap-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data Global de Retorno:</label>
              <input
                type="date"
                value={dataGlobalRetorno}
                onChange={(e) => setDataGlobalRetorno(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-white outline-none cursor-pointer"
              />
            </div>
          </div>

          <form onSubmit={salvarDevolucoes} className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3 w-10 text-center" title="Marque se for pedido em carrinho com múltiplos SKUs">🛒</th>
                    <th className="p-3">Pedido</th>
                    <th className="p-3">Canal</th>
                    <th className="p-3">NF</th>
                    <th className="p-3">Solicitação</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3 min-w-[200px]">Produto (Auto)</th>
                    <th className="p-3">Marca</th>
                    <th className="p-3 text-right">PDV (R$)</th>
                    <th className="p-3 text-right">Frete Reverso</th>
                    <th className="p-3">Motivo</th>
                    <th className="p-3 min-w-[180px]">Observações</th>
                    <th className="p-3 text-center">Condições?</th>
                    {linhas.length > 1 && <th className="p-3 text-center w-8"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {linhas.map((l, index) => (
                    <React.Fragment key={index}>
                      <tr className="bg-slate-950/40 hover:bg-slate-800/30 transition-colors">
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={l.isCarrinho}
                            onChange={(e) => atualizarLinha(index, "isCarrinho", e.target.checked)}
                            className="w-4 h-4 accent-purple-600 cursor-pointer"
                            title="Pedido em Carrinho"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={l.pedido}
                            onChange={(e) => atualizarLinha(index, "pedido", e.target.value)}
                            placeholder="Ex: 42372"
                            className="w-24 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none"
                            required
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={l.canal}
                            onChange={(e) => atualizarLinha(index, "canal", e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer"
                            required
                          >
                            <option value="">Canal...</option>
                            {canaisAtivos.map((c, i) => (
                              <option key={i} value={c}>{c}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={l.nf}
                            onChange={(e) => atualizarLinha(index, "nf", e.target.value)}
                            placeholder="NF"
                            className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={l.solicitacao}
                            onChange={(e) => atualizarLinha(index, "solicitacao", e.target.value)}
                            className="w-28 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={l.sku}
                            onChange={(e) => atualizarLinha(index, "sku", e.target.value)}
                            placeholder="SKU"
                            className="w-28 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono outline-none"
                            required
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={l.produto}
                            readOnly
                            placeholder="Auto"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-400 outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={l.marca}
                            readOnly
                            placeholder="Auto"
                            className="w-20 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-400 outline-none"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="text"
                            value={l.pdv}
                            onChange={(e) => atualizarLinha(index, "pdv", e.target.value)}
                            placeholder="0,00"
                            className="w-24 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-right text-emerald-400 font-mono outline-none"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="text"
                            value={l.frete}
                            onChange={(e) => atualizarLinha(index, "frete", e.target.value)}
                            placeholder="-0,00"
                            className="w-24 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-right text-rose-400 font-mono outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={l.motivo}
                            onChange={(e) => atualizarLinha(index, "motivo", e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer"
                          >
                            <option value="">Selecione...</option>
                            <option value="Arrependimento">Arrependimento</option>
                            <option value="Defeito">Defeito</option>
                            <option value="Produto Incorreto">Produto Incorreto</option>
                            <option value="Extravio">Extravio</option>
                            <option value="Outros">Outros</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={l.observacoes}
                            onChange={(e) => atualizarLinha(index, "observacoes", e.target.value)}
                            placeholder="Obs..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <select
                            value={l.condicoes}
                            onChange={(e) => atualizarLinha(index, "condicoes", e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer"
                          >
                            <option value="Sim">Sim</option>
                            <option value="Não">Não</option>
                          </select>
                        </td>
                        {linhas.length > 1 && (
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => removerLinha(index)}
                              className="text-rose-400 hover:text-rose-300 font-bold p-1"
                              title="Remover linha"
                            >
                              ✕
                            </button>
                          </td>
                        )}
                      </tr>

                      {/* GAVETA DE ITENS ADICIONAIS DO CARRINHO */}
                      {l.isCarrinho && (
                        <tr className="bg-purple-950/15 border-b border-purple-900/30">
                          <td colSpan={14} className="p-4 pl-12">
                            <div className="bg-slate-950/60 p-4 rounded-xl border border-purple-900/30">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="text-[11px] font-black text-purple-400 uppercase tracking-wider flex items-center gap-2">
                                  🛒 Itens Adicionais do Carrinho (Pedido: {l.pedido || "..."})
                                </h4>
                                <span className="text-[10px] text-slate-500">
                                  Herda NF, Canal, Solicitação, Motivo e Condições. PDV e Frete permanecem apenas na 1ª linha.
                                </span>
                              </div>

                              <div className="space-y-2">
                                {l.subItens.map((sub, sIdx) => (
                                  <div key={sIdx} className="flex flex-wrap items-center gap-3">
                                    <div className="w-36">
                                      <input
                                        type="text"
                                        placeholder="SKU adicional"
                                        value={sub.sku}
                                        onChange={(e) => atualizarSubItem(index, sIdx, e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-white outline-none focus:border-purple-500"
                                        required
                                      />
                                    </div>
                                    <div className="flex-1 min-w-[200px]">
                                      <input
                                        type="text"
                                        readOnly
                                        placeholder="Produto (Auto)"
                                        value={sub.produto}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-400 outline-none"
                                      />
                                    </div>
                                    <div className="w-28">
                                      <input
                                        type="text"
                                        readOnly
                                        placeholder="Marca (Auto)"
                                        value={sub.marca}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-400 outline-none"
                                      />
                                    </div>
                                    <div>
                                      {l.subItens.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => removerSubItem(index, sIdx)}
                                          className="text-rose-400 hover:text-rose-300 font-bold p-1.5"
                                          title="Remover este SKU do carrinho"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}

                                <button
                                  type="button"
                                  onClick={() => adicionarSubItem(index)}
                                  className="mt-2 text-[10px] font-bold uppercase text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer pt-1"
                                >
                                  + Adicionar Outro SKU ao Carrinho
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={adicionarLinha}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all"
              >
                + Adicionar Outra Linha
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg transition-all"
              >
                {salvando ? "A salvar..." : "💾 Salvar Devoluções"}
              </button>
            </div>
          </form>
        </div>

        {/* LISTAGEM CONSOLIDADA */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden mb-8">
          <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Devoluções Registadas</h2>
              <p className="text-xs text-slate-400 mt-1">Histórico completo com controlo de frete reverso e valores convertidos.</p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={filtroCanal}
                onChange={(e) => setFiltroCanal(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer"
              >
                <option value="">Todos os Canais</option>
                {canaisAtivos.map((c, i) => (
                  <option key={i} value={c}>{c}</option>
                ))}
              </select>
              <input
                type="month"
                value={filtroMes}
                onChange={(e) => setFiltroMes(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer"
              />
            </div>
          </div>

          {loading ? (
            <p className="p-8 text-center text-slate-400">A carregar devoluções...</p>
          ) : devolucoesFiltradas.length === 0 ? (
            <p className="p-8 text-center text-slate-500">Nenhuma devolução encontrada.</p>
          ) : (
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                  <tr>
                    <th className="p-3">Data Retorno</th>
                    <th className="p-3">Pedido</th>
                    <th className="p-3">Canal</th>
                    <th className="p-3">NF</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3 min-w-[200px]">Produto</th>
                    <th className="p-3">Marca</th>
                    <th className="p-3 text-right">PDV</th>
                    <th className="p-3 text-right">Frete Reverso</th>
                    <th className="p-3 text-right text-purple-400">Valor Convertido</th>
                    <th className="p-3">Motivo</th>
                    <th className="p-3">Observações</th>
                    <th className="p-3 text-center">Condições</th>
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {devolucoesFiltradas.map((item) => {
                    const isEditing = idEditando === item.id;
                    return (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-mono text-slate-400">
                          {item.data_retorno ? item.data_retorno.split("-").reverse().join("/") : "-"}
                        </td>
                        <td className="p-3 font-bold text-white">
                          {isEditing ? (
                            <input
                              type="text"
                              value={dadosEdicao.pedido}
                              onChange={(e) => setDadosEdicao({ ...dadosEdicao, pedido: e.target.value })}
                              className="bg-slate-900 border border-slate-700 rounded p-1 w-20 text-white"
                            />
                          ) : item.pedido}
                        </td>
                        <td className="p-3 text-slate-300">{item.canal}</td>
                        <td className="p-3 text-slate-400">{item.nota_fiscal || "-"}</td>
                        <td className="p-3 font-mono font-bold text-indigo-400">
                          {isEditing ? (
                            <input
                              type="text"
                              value={dadosEdicao.sku}
                              onChange={(e) => setDadosEdicao({ ...dadosEdicao, sku: e.target.value })}
                              className="bg-slate-900 border border-slate-700 rounded p-1 w-24 text-white font-mono"
                            />
                          ) : item.sku}
                        </td>
                        <td className="p-3 text-slate-300 max-w-[220px] truncate">{item.produto}</td>
                        <td className="p-3 text-slate-400">{item.marca}</td>
                        <td className="p-3 text-right font-mono text-emerald-400">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              value={dadosEdicao.valor_pdv}
                              onChange={(e) => setDadosEdicao({ ...dadosEdicao, valor_pdv: e.target.value })}
                              className="bg-slate-900 border border-slate-700 rounded p-1 w-20 text-right text-white"
                            />
                          ) : formatarMoeda(item.valor_pdv)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-rose-400">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              value={dadosEdicao.custo_frete}
                              onChange={(e) => setDadosEdicao({ ...dadosEdicao, custo_frete: e.target.value })}
                              className="bg-slate-900 border border-slate-700 rounded p-1 w-20 text-right text-white"
                            />
                          ) : formatarMoeda(item.custo_frete)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-purple-400">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              value={dadosEdicao.valor_convertido}
                              onChange={(e) => setDadosEdicao({ ...dadosEdicao, valor_convertido: e.target.value })}
                              className="bg-slate-900 border border-slate-700 rounded p-1 w-20 text-right text-purple-300"
                            />
                          ) : formatarMoeda(item.valor_convertido)}
                        </td>
                        <td className="p-3 text-slate-300">{item.motivo || "-"}</td>
                        <td className="p-3 text-slate-400 max-w-[180px] truncate">{item.observacoes || "-"}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.condicoes === "Sim" ? "bg-emerald-950/60 text-emerald-400" : "bg-rose-950/60 text-rose-400"}`}>
                            {item.condicoes}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => salvarEdicao(item.id)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-[10px] font-bold">Salvar</button>
                              <button onClick={() => setIdEditando(null)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded text-[10px] font-bold">Cancelar</button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => iniciarEdicao(item)} className="bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white px-2.5 py-1 rounded text-[11px] font-bold transition-colors">✏️</button>
                              <button onClick={() => excluirDevolucao(item.id)} className="bg-rose-950/40 hover:bg-rose-900 text-rose-400 border border-rose-900/50 px-2.5 py-1 rounded text-[11px] font-bold transition-colors">🗑️</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}