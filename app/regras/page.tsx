"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

export default function RegrasPage() {
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const router = useRouter();

  // Estados originais do app de relatórios / tiny
  const [metaTacos, setMetaTacos] = useState("2"); 
  const [regrasTiny, setRegrasTiny] = useState({ sku: 'C', estoque: 'F', status_sku: 'A', status_valor: 'B' });
  const [regrasCustos, setRegrasCustos] = useState({ sku: 'A', produto: 'B', custo: 'C', marca: 'D' });
  const [regrasMlCols, setRegrasMlCols] = useState({ mlb: 'A', sku: 'B', comissao: 'C', peso: '', altura: 'E', largura: 'F', comprimento: 'G' });
  const [regrasCanais, setRegrasCanais] = useState<any[]>([]);
  const [regrasTarifacao, setRegrasTarifacao] = useState<any[]>([]);

  // Estados de Tarifação
  const [novoCanal, setNovoCanal] = useState("Amazon");
  const [novaFaixa, setNovaFaixa] = useState("R$ 0.00 até R$ 78.99");
  const [novaComissao, setNovaComissao] = useState("14.00");
  const [novaTarifaFixa, setNovaTarifaFixa] = useState("4.00");
  const [novoFrete, setNovoFrete] = useState("0.00");
  const [salvandoTarifa, setSalvandoTarifa] = useState(false);

  // NOVO: Gestão dos Canais Dinâmicos do Dashboard (Clube Hebraica, Clube Paineiras e outros)
  const [novoCanalDash, setNovoCanalDash] = useState("");
  const [listaCanaisDash, setListaCanaisDash] = useState<string[]>([
    'Mercado Livre', 'Shopee', 'Amazon', 'TikTok Shop', 'Magalu', 'Clube Hebraica', 'Clube Paineiras'
  ]);

  const canaisTarifacao = ["Amazon", "Centauro", "Magalu", "Netshoes", "Shein", "Shopee", "Site", "TikTok Shop", "Clube Hebraica", "Clube Paineiras"];

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    
    const { data: configs } = await supabase.from('config_regras_tiny').select('*');
    if (configs) {
      const getCol = (campo: string, def: string) => configs.find((t: any) => t.campo === campo)?.coluna || def;
      
      const tacosSalvo = configs.find((t: any) => t.campo === 'meta_tacos')?.coluna || "2";
      setMetaTacos(tacosSalvo);

      // Carrega canais dinâmicos salvos para o Dashboard
      const canaisSalvos = configs.find((t: any) => t.campo === 'canais_dashboard');
      if (canaisSalvos && canaisSalvos.coluna) {
        try {
          const parsed = JSON.parse(canaisSalvos.coluna);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const baseObrigatoria = ['Clube Hebraica', 'Clube Paineiras'];
            setListaCanaisDash(Array.from(new Set([...parsed, ...baseObrigatoria])));
          }
        } catch (e) {}
      }

      setRegrasTiny({ sku: getCol('sku', 'C'), estoque: getCol('estoque', 'F'), status_sku: getCol('status_sku', 'A'), status_valor: getCol('status_valor', 'B') });
      setRegrasCustos({ sku: getCol('custo_sku', 'A'), produto: getCol('custo_produto', 'B'), custo: getCol('custo_valor', 'C'), marca: getCol('custo_marca', 'D') });
      setRegrasMlCols({ 
        mlb: getCol('ml_mlb', 'A'), sku: getCol('ml_sku', 'B'), comissao: getCol('ml_comissao', 'C'), 
        peso: getCol('ml_peso', ''), altura: getCol('ml_altura', 'E'), largura: getCol('ml_largura', 'F'), comprimento: getCol('ml_comprimento', 'G') 
      });
    }

    const { data: canaisConfig } = await supabase.from('config_regras_canais').select('*').order('id');
    if (canaisConfig) setRegrasCanais(canaisConfig);

    const { data: tarifacaoData } = await supabase.from('config_regras_tarifacao').select('*').order('id');
    if (tarifacaoData) setRegrasTarifacao(tarifacaoData);

    setLoading(false);
  };

  const adicionarCanalDash = async () => {
    if (!novoCanalDash.trim()) return;
    const nomeFormatado = novoCanalDash.trim();
    if (listaCanaisDash.includes(nomeFormatado)) {
      alert("Este canal já está cadastrado.");
      return;
    }
    const novaLista = [...listaCanaisDash, nomeFormatado];
    setListaCanaisDash(novaLista);
    setNovoCanalDash("");

    await supabase.from('config_regras_tiny').upsert({
      campo: 'canais_dashboard',
      coluna: JSON.stringify(novaLista)
    }, { onConflict: 'campo' });

    alert(`✅ Canal "${nomeFormatado}" adicionado ao Dashboard com sucesso!`);
  };

  const removerCanalDash = async (canalRemover: string) => {
    if (canalRemover === 'Clube Hebraica' || canalRemover === 'Clube Paineiras') {
      alert("As lojas físicas principais não podem ser removidas.");
      return;
    }
    if (!confirm(`Remover o canal ${canalRemover}?`)) return;
    const novaLista = listaCanaisDash.filter(c => c !== canalRemover);
    setListaCanaisDash(novaLista);

    await supabase.from('config_regras_tiny').upsert({
      campo: 'canais_dashboard',
      coluna: JSON.stringify(novaLista)
    }, { onConflict: 'campo' });
  };

  const salvarTodasRegras = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    const configs = [
      { campo: 'meta_tacos', coluna: metaTacos.toString() },
      { campo: 'canais_dashboard', coluna: JSON.stringify(listaCanaisDash) },
      { campo: 'sku', coluna: regrasTiny.sku.toUpperCase() },
      { campo: 'estoque', coluna: regrasTiny.estoque.toUpperCase() },
      { campo: 'status_sku', coluna: regrasTiny.status_sku.toUpperCase() },
      { campo: 'status_valor', coluna: regrasTiny.status_valor.toUpperCase() },
      { campo: 'custo_sku', coluna: regrasCustos.sku.toUpperCase() },
      { campo: 'custo_produto', coluna: regrasCustos.produto.toUpperCase() },
      { campo: 'custo_valor', coluna: regrasCustos.custo.toUpperCase() },
      { campo: 'custo_marca', coluna: regrasCustos.marca.toUpperCase() },
      { campo: 'ml_mlb', coluna: regrasMlCols.mlb.toUpperCase() },
      { campo: 'ml_sku', coluna: regrasMlCols.sku.toUpperCase() },
      { campo: 'ml_comissao', coluna: regrasMlCols.comissao.toUpperCase() },
      { campo: 'ml_peso', coluna: regrasMlCols.peso.toUpperCase() },
      { campo: 'ml_altura', coluna: regrasMlCols.altura.toUpperCase() },
      { campo: 'ml_largura', coluna: regrasMlCols.largura.toUpperCase() },
      { campo: 'ml_comprimento', coluna: regrasMlCols.comprimento.toUpperCase() },
    ];

    for (const cfg of configs) {
      await supabase.from('config_regras_tiny').upsert(cfg, { onConflict: 'campo' });
    }

    alert("✅ Configurações e regras salvas com sucesso!");
    setSalvando(false);
  };

  const alternarAtivoAds = async (id: number, ativoAtual: boolean) => {
    const novoStatus = !ativoAtual;
    setRegrasCanais(prev => prev.map(r => r.id === id ? { ...r, ativo_ads: novoStatus } : r));
    await supabase.from('config_regras_canais').update({ ativo_ads: novoStatus }).eq('id', id);
  };

  const adicionarRegraTarifacao = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvandoTarifa(true);

    const { error } = await supabase.from('config_regras_tarifacao').insert([{
      canal: novoCanal,
      faixa_preco: novaFaixa,
      comissao: Number(novaComissao),
      tarifa_fixa: Number(novaTarifaFixa),
      frete: Number(novoFrete)
    }]);

    if (error) {
      alert("Erro ao adicionar regra: " + error.message);
    } else {
      carregarDados();
      alert("✅ Regra de tarifação adicionada com sucesso!");
    }
    setSalvandoTarifa(false);
  };

  const removerRegraTarifacao = async (id: number) => {
    if (!confirm("Tem certeza que deseja remover esta regra?")) return;
    const { error } = await supabase.from('config_regras_tarifacao').delete().eq('id', id);
    if (error) alert("Erro: " + error.message);
    else carregarDados();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Central de Regras</h1>
            <p className="text-sm font-medium text-slate-400">Configure os canais do Dash, colunas brutas e tarifação por canal</p>
          </div>

          <Navbar />
        </div>

        {loading ? (
          <p className="p-8 text-center text-slate-400">A carregar...</p>
        ) : (
          <div className="space-y-8">

            {/* GESTÃO DOS CANAIS DO DASHBOARD */}
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              <h2 className="text-lg font-bold text-white">Canais Ativos no Dashboard Omnichannel</h2>
              <p className="text-xs text-slate-400">Adicione ou remova canais que aparecerão no seletor do Dashboard (*Clube Hebraica* e *Clube Paineiras* são fixos e obrigatórios).</p>
              
              <div className="flex gap-2 max-w-md">
                <input 
                  type="text" 
                  value={novoCanalDash} 
                  onChange={e => setNovoCanalDash(e.target.value)} 
                  placeholder="Nome do novo canal..." 
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none"
                />
                <button 
                  type="button" 
                  onClick={adicionarCanalDash}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-5 py-3 rounded-xl text-xs uppercase cursor-pointer transition"
                >
                  Inserir Canal
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {listaCanaisDash.map((c) => (
                  <div key={c} className="bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 flex items-center gap-3 text-xs">
                    <span className="font-bold text-slate-200">{c}</span>
                    {c !== 'Clube Hebraica' && c !== 'Clube Paineiras' && (
                      <button type="button" onClick={() => removerCanalDash(c)} className="text-rose-400 hover:text-rose-300 font-bold">×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* VISIBILIDADE DE CANAIS NO ADS */}
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold mb-1 text-white">Visibilidade de Canais no Painel Ads</h2>
              <p className="text-xs text-slate-400 mb-6">Marque quais canais aparecem no Painel Ads.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {regrasCanais.map((r) => (
                  <div key={r.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                    <span className="font-bold text-white text-xs">{r.canal}</span>
                    <button 
                      type="button"
                      onClick={() => alternarAtivoAds(r.id, r.ativo_ads ?? true)}
                      className={`px-3 py-1 rounded text-[10px] font-bold cursor-pointer transition-all ${
                        (r.ativo_ads ?? true) ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}
                    >
                      {(r.ativo_ads ?? true) ? '✓ Visível' : '✕ Oculto'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* REGRAS DE TARIFAÇÃO POR CANAL */}
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
              <div>
                <h2 className="text-lg font-bold mb-1 text-white">Regras de Tarifação por Canal</h2>
                <p className="text-xs text-slate-400">Defina comissão, tarifa fixa e frete por faixa de preço para os marketplaces.</p>
              </div>

              <form onSubmit={adicionarRegraTarifacao} className="bg-slate-950 p-6 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-6 gap-4 items-end">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Canal</label>
                  <select value={novoCanal} onChange={(e) => setNovoCanal(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none">
                    {canaisTarifacao.map((c, i) => <option key={i} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Faixa de Preço</label>
                  <input type="text" value={novaFaixa} onChange={(e) => setNovaFaixa(e.target.value)} placeholder="Ex: R$ 0.00 até R$ 78.99" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none" required />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Comissão (%)</label>
                  <input type="number" step="0.01" value={novaComissao} onChange={(e) => setNovaComissao(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none" required />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tarifa Fixa (R$)</label>
                  <input type="number" step="0.01" value={novaTarifaFixa} onChange={(e) => setNovaTarifaFixa(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none" required />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Frete (R$)</label>
                  <input type="number" step="0.01" value={novoFrete} onChange={(e) => setNovoFrete(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none" required />
                </div>
                <div>
                  <button type="submit" disabled={salvandoTarifa} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-lg text-xs uppercase tracking-wider cursor-pointer">
                    + Adicionar
                  </button>
                </div>
              </form>

              <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[400px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                    <tr>
                      <th className="p-3.5">Canal</th>
                      <th className="p-3.5">Faixa de Preço</th>
                      <th className="p-3.5 text-center">Comissão</th>
                      <th className="p-3.5 text-right">Tarifa Fixa</th>
                      <th className="p-3.5 text-right">Frete</th>
                      <th className="p-3.5 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {regrasTarifacao.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5 font-bold text-white">{item.canal}</td>
                        <td className="p-3.5 text-slate-300">{item.faixa_preco}</td>
                        <td className="p-3.5 text-center font-bold text-indigo-400">{Number(item.comissao).toFixed(2)}%</td>
                        <td className="p-3.5 text-right font-mono text-slate-300">R$ {Number(item.tarifa_fixa).toFixed(2)}</td>
                        <td className="p-3.5 text-right font-mono text-emerald-400">R$ {Number(item.frete).toFixed(2)}</td>
                        <td className="p-3.5 text-center">
                          <button onClick={() => removerRegraTarifacao(item.id)} className="bg-rose-950/60 text-rose-400 px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer">
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FORMULÁRIO DE CONFIGURAÇÕES GERAIS */}
            <form onSubmit={salvarTodasRegras} className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-bold mb-1 text-white">Configurações Gerais e Mapeamento</h2>
                  <p className="text-xs text-slate-400">Defina metas do sistema e colunas correspondentes de importação.</p>
                </div>
                
                <div className="bg-purple-950/30 border border-purple-800/50 p-3 rounded-xl flex items-center gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-purple-300 uppercase tracking-wider mb-1">🎯 Meta TACOS Global (%)</label>
                    <p className="text-[9px] text-purple-400/70">Métrica para Budget no Ads.</p>
                  </div>
                  <input 
                    type="number" 
                    step="0.1"
                    value={metaTacos} 
                    onChange={(e) => setMetaTacos(e.target.value)} 
                    className="w-20 bg-slate-950 border border-purple-700/50 rounded-lg p-2 text-sm font-bold text-emerald-400 text-center outline-none focus:border-purple-500" 
                    required 
                  />
                </div>
              </div>

              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3">Planilha de Custos Unitários</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna SKU</label>
                    <input type="text" maxLength={2} value={regrasCustos.sku} onChange={(e) => setRegrasCustos({ ...regrasCustos, sku: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Nome Produto</label>
                    <input type="text" maxLength={2} value={regrasCustos.produto} onChange={(e) => setRegrasCustos({ ...regrasCustos, produto: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Custo Unitário</label>
                    <input type="text" maxLength={2} value={regrasCustos.custo} onChange={(e) => setRegrasCustos({ ...regrasCustos, custo: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Marca</label>
                    <input type="text" maxLength={2} value={regrasCustos.marca} onChange={(e) => setRegrasCustos({ ...regrasCustos, marca: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">Planilha de Regras & Medidas ML</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna MLB</label>
                    <input type="text" maxLength={2} value={regrasMlCols.mlb} onChange={(e) => setRegrasMlCols({ ...regrasMlCols, mlb: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna SKU</label>
                    <input type="text" maxLength={2} value={regrasMlCols.sku} onChange={(e) => setRegrasMlCols({ ...regrasMlCols, sku: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Comissão (%)</label>
                    <input type="text" maxLength={2} value={regrasMlCols.comissao} onChange={(e) => setRegrasMlCols({ ...regrasMlCols, comissao: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Peso Real (Opcional)</label>
                    <input type="text" maxLength={2} value={regrasMlCols.peso} onChange={(e) => setRegrasMlCols({ ...regrasMlCols, peso: e.target.value })} placeholder="Ex: D (ou vazio)" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Altura</label>
                    <input type="text" maxLength={2} value={regrasMlCols.altura} onChange={(e) => setRegrasMlCols({ ...regrasMlCols, altura: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Largura</label>
                    <input type="text" maxLength={2} value={regrasMlCols.largura} onChange={(e) => setRegrasMlCols({ ...regrasMlCols, largura: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Comprimento</label>
                    <input type="text" maxLength={2} value={regrasMlCols.comprimento} onChange={(e) => setRegrasMlCols({ ...regrasMlCols, comprimento: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button type="submit" disabled={salvando} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">
                  {salvando ? "A salvar..." : "Salvar Todas as Configurações"}
                </button>
              </div>
            </form>

          </div>
        )}

      </div>
    </div>
  );
}