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

  // Canais disponíveis no seletor (incluindo as lojas físicas obrigatórias e os de marketplace)
  const [canais, setCanais] = useState<string[]>([
    'Mercado Livre 1', 'Mercado Livre 2', 'Amazon', 'Magalu', 'Shopee', 'TikTok', 'Shein', 'Netshoes', 'Site', 'Clube Hebraica', 'Clube Paineiras', 'Centauro'
  ]);
  const [canalSelecionado, setCanalSelecionado] = useState('Mercado Livre 1');
  const [novoCanalInput, setNovoCanalInput] = useState('');

  // Estado da regra do canal selecionado (exatamente conforme a sua imagem)
  const [metaMes, setMetaMes] = useState('outubro de 2026');
  const [metaValor, setMetaValor] = useState<number | string>(0);
  const [responsavelCanal, setResponsavelCanal] = useState('Equipe Best Fit');
  const [logoUrl, setLogoUrl] = useState('');
  const [formulaApuracao, setFormulaApuracao] = useState('D2 - (D2 * 12%)');
  const [colunasFoco, setColunasFoco] = useState({
    idPedido: 'A',
    sku: 'B',
    cupomEstado: 'C',
    precoVenda: 'D',
    quantidade: 'G'
  });

  // Estados do outro app mantidos (Tiny, Custos e ML)
  const [metaTacos, setMetaTacos] = useState("2"); 
  const [regrasTiny, setRegrasTiny] = useState({ sku: 'C', estoque: 'F', status_sku: 'A', status_valor: 'B' });
  const [regrasCustos, setRegrasCustos] = useState({ sku: 'A', produto: 'B', custo: 'C', marca: 'D' });
  const [regrasMlCols, setRegrasMlCols] = useState({ mlb: 'A', sku: 'B', comissao: 'C', peso: '', altura: 'E', largura: 'F', comprimento: 'G' });
  const [regrasCanaisAds, setRegrasCanaisAds] = useState<any[]>([]);
  const [regrasTarifacao, setRegrasTarifacao] = useState<any[]>([]);

  // Estados de Tarifação
  const [novoCanal, setNovoCanal] = useState("Amazon");
  const [novaFaixa, setNovaFaixa] = useState("R$ 0.00 até R$ 78.99");
  const [novaComissao, setNovaComissao] = useState("14.00");
  const [novaTarifaFixa, setNovaTarifaFixa] = useState("4.00");
  const [novoFrete, setNovoFrete] = useState("0.00");
  const [salvandoTarifa, setSalvandoTarifa] = useState(false);

  const canaisTarifacao = ["Amazon", "Centauro", "Magalu", "Netshoes", "Shein", "Shopee", "Site", "TikTok Shop", "Clube Hebraica", "Clube Paineiras"];

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarDadosGlobais();
  }, []);

  useEffect(() => {
    if (canalSelecionado) {
      carregarRegrasCanalEspecifico(canalSelecionado);
    }
  }, [canalSelecionado]);

  const carregarDadosGlobais = async () => {
    setLoading(true);
    
    const { data: configs } = await supabase.from('config_regras_tiny').select('*');
    if (configs) {
      const getCol = (campo: string, def: string) => configs.find((t: any) => t.campo === campo)?.coluna || def;
      
      const tacosSalvo = configs.find((t: any) => t.campo === 'meta_tacos')?.coluna || "2";
      setMetaTacos(tacosSalvo);

      const canaisSalvos = configs.find((t: any) => t.campo === 'canais_dashboard');
      if (canaisSalvos && canaisSalvos.coluna) {
        try {
          const parsed = JSON.parse(canaisSalvos.coluna);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const baseObrigatoria = ['Clube Hebraica', 'Clube Paineiras'];
            setCanais(Array.from(new Set([...parsed, ...baseObrigatoria])));
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
    if (canaisConfig) setRegrasCanaisAds(canaisConfig);

    const { data: tarifacaoData } = await supabase.from('config_regras_tarifacao').select('*').order('id');
    if (tarifacaoData) setRegrasTarifacao(tarifacaoData);

    setLoading(false);
  };

  const carregarRegrasCanalEspecifico = async (canal: string) => {
    const { data: regraDb } = await supabase.from('config_regras_canais').select('*').eq('canal', canal).maybeSingle();
    if (regraDb) {
      setFormulaApuracao(regraDb.formula_excel || 'D2 - (D2 * 12%)');
      setResponsavelCanal(regraDb.responsavel || 'Equipe Best Fit');
      setLogoUrl(regraDb.logo_url || '');
      setColunasFoco({
        idPedido: regraDb.col_id_pedido || 'A',
        sku: regraDb.col_sku || 'B',
        cupomEstado: regraDb.col_estado || 'C',
        precoVenda: regraDb.col_pdv || regraDb.col_preco_venda || 'D',
        quantidade: regraDb.col_quantidade || 'G'
      });
    } else {
      setFormulaApuracao('D2 - (D2 * 12%)');
      setResponsavelCanal('Equipe Best Fit');
      setLogoUrl('');
      setColunasFoco({ idPedido: 'A', sku: 'B', cupomEstado: 'C', precoVenda: 'D', quantidade: 'G' });
    }

    const { data: metaDb } = await supabase.from('tb_metas').select('*').eq('canal', canal).maybeSingle();
    if (metaDb) {
      setMetaValor(metaDb.meta_valor || 0);
      if (metaDb.mes_referencia) setMetaMes(metaDb.mes_referencia);
    } else {
      setMetaValor(0);
    }
  };

  const handleLogoUpload = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setLogoUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const salvarRegrasCanalAtual = async () => {
    setSalvando(true);
    try {
      await supabase.from('config_regras_canais').upsert([{
        canal: canalSelecionado,
        formula_excel: formulaApuracao,
        responsavel: responsavelCanal,
        logo_url: logoUrl,
        col_id_pedido: colunasFoco.idPedido.toUpperCase(),
        col_sku: colunasFoco.sku.toUpperCase(),
        col_estado: colunasFoco.cupomEstado.toUpperCase(),
        col_pdv: colunasFoco.precoVenda.toUpperCase(),
        col_quantidade: colunasFoco.quantidade.toUpperCase()
      }], { onConflict: 'canal' });

      await supabase.from('tb_metas').upsert([{
        canal: canalSelecionado,
        mes_referencia: metaMes,
        meta_valor: Number(metaValor) || 0,
        responsavel: responsavelCanal
      }], { onConflict: 'canal, mes_referencia' });

      alert(`✅ Regras e meta do canal "${canalSelecionado}" salvas com sucesso na nuvem!`);
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message);
    }
    setSalvando(false);
  };

  const adicionarNovoCanalGeral = async () => {
    if (!novoCanalInput.trim()) return;
    const nome = novoCanalInput.trim();
    if (canais.includes(nome)) {
      alert("Este canal já existe.");
      return;
    }
    const novaLista = [...canais, nome];
    setCanais(novaLista);
    setNovoCanalInput('');
    setCanalSelecionado(nome);

    await supabase.from('config_regras_tiny').upsert({
      campo: 'canais_dashboard',
      coluna: JSON.stringify(novaLista)
    }, { onConflict: 'campo' });

    alert(`✅ Canal "${nome}" criado e integrado ao sistema!`);
  };

  const salvarConfiguracoesGeraisTiny = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    const configs = [
      { campo: 'meta_tacos', coluna: metaTacos.toString() },
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

    alert("✅ Configurações gerais salvas com sucesso!");
    setSalvando(false);
  };

  const alternarAtivoAds = async (id: number, ativoAtual: boolean) => {
    const novoStatus = !ativoAtual;
    setRegrasCanaisAds(prev => prev.map(r => r.id === id ? { ...r, ativo_ads: novoStatus } : r));
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

    if (error) alert("Erro: " + error.message);
    else {
      carregarDadosGlobais();
      alert("✅ Regra de tarifação adicionada!");
    }
    setSalvandoTarifa(false);
  };

  const removerRegraTarifacao = async (id: number) => {
    if (!confirm("Remover regra?")) return;
    await supabase.from('config_regras_tarifacao').delete().eq('id', id);
    carregarDadosGlobais();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Central de Regras</h1>
            <p className="text-sm font-medium text-slate-400">Configure canais, fórmulas de apuração do Dashboard e regras de colunas</p>
          </div>
          <Navbar />
        </div>

        {loading ? (
          <p className="p-8 text-center text-slate-400">A carregar configurações...</p>
        ) : (
          <div className="space-y-8">

            {/* SELETOR DE CANAIS E ADICIONAR NOVO CANAL */}
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              <h2 className="text-base font-bold text-white">Selecionar Canal para Configurar</h2>
              
              <div className="flex flex-wrap gap-2 items-center">
                {canais.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCanalSelecionado(c)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                      canalSelecionado === c ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 max-w-md pt-2 border-t border-slate-800">
                <input 
                  type="text" 
                  value={novoCanalInput} 
                  onChange={e => setNovoCanalInput(e.target.value)} 
                  placeholder="Novo canal (ex: Dafiti)..." 
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none"
                />
                <button 
                  type="button" 
                  onClick={adicionarNovoCanalGeral}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs uppercase cursor-pointer"
                >
                  + Adicionar Canal
                </button>
              </div>
            </div>

            {/* BLOCO DE CONFIGURAÇÃO EXATA DO CANAL SELECIONADO (CONFORME SUA IMAGEM) */}
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                <h2 className="text-lg font-extrabold text-indigo-400">Configurando Canal: {canalSelecionado}</h2>
                <span className="text-xs text-slate-400 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">Parâmetros do Dash</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Logo do Canal</label>
                  <div className="flex items-center gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="w-12 h-12 rounded-lg bg-white object-contain p-1 border border-slate-700" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500">LOGO</div>
                    )}
                    <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-xs font-bold text-white transition">
                      Escolher ficheiro
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Mês de Referência (Histórico da Meta):</label>
                  <input 
                    type="text" 
                    value={metaMes} 
                    onChange={e => setMetaMes(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-indigo-300 font-bold outline-none" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Responsável pelo Canal:</label>
                  <input 
                    type="text" 
                    value={responsavelCanal} 
                    onChange={e => setResponsavelCanal(e.target.value)} 
                    placeholder="Ex: Equipe Best Fit" 
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none" 
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Meta de Faturamento (R$) para o mês selecionado:</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={metaValor} 
                    onChange={e => setMetaValor(e.target.value)} 
                    className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl p-3 text-xs font-bold text-emerald-400 outline-none" 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">Fórmula de Apuração (Ex: D2 - (D2 * 12%)):</label>
                <input 
                  type="text" 
                  value={formulaApuracao} 
                  onChange={e => setFormulaApuracao(e.target.value)} 
                  className="w-full bg-slate-950 border border-purple-500/40 rounded-xl p-3 font-mono text-xs font-bold text-purple-300 outline-none" 
                />
              </div>

              <div className="space-y-3 pt-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Mapeamento das 5 Colunas Foco:</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 mb-1">ID Pedido</span>
                    <input type="text" maxLength={2} value={colunasFoco.idPedido} onChange={e => setColunasFoco({...colunasFoco, idPedido: e.target.value.toUpperCase()})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-indigo-400 font-mono font-bold text-center uppercase outline-none" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 mb-1">SKU</span>
                    <input type="text" maxLength={2} value={colunasFoco.sku} onChange={e => setColunasFoco({...colunasFoco, sku: e.target.value.toUpperCase()})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-indigo-400 font-mono font-bold text-center uppercase outline-none" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-rose-400 mb-1">Cupom/Estado</span>
                    <input type="text" maxLength={2} value={colunasFoco.cupomEstado} onChange={e => setColunasFoco({...colunasFoco, cupomEstado: e.target.value.toUpperCase()})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-rose-400 font-mono font-bold text-center uppercase outline-none" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-amber-400 mb-1">Preço Venda (PDV)</span>
                    <input type="text" maxLength={2} value={colunasFoco.precoVenda} onChange={e => setColunasFoco({...colunasFoco, precoVenda: e.target.value.toUpperCase()})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-amber-400 font-mono font-bold text-center uppercase outline-none" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-cyan-400 mb-1">Quantidade</span>
                    <input type="text" maxLength={2} value={colunasFoco.quantidade} onChange={e => setColunasFoco({...colunasFoco, quantidade: e.target.value.toUpperCase()})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-cyan-400 font-mono font-bold text-center uppercase outline-none" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button 
                  type="button" 
                  onClick={salvarRegrasCanalAtual} 
                  disabled={salvando}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-8 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-purple-950/50"
                >
                  {salvando ? "A salvar..." : `Salvar Alterações de ${canalSelecionado}`}
                </button>
              </div>
            </div>

            {/* VISIBILIDADE DE CANAIS NO ADS */}
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold mb-1 text-white">Visibilidade de Canais no Painel Ads</h2>
              <p className="text-xs text-slate-400 mb-6">Marque quais canais aparecem no Painel Ads.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {regrasCanaisAds.map((r) => (
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

            {/* CONFIGURAÇÕES GERAIS TNY & CUSTOS */}
            <form onSubmit={salvarConfiguracoesGeraisTiny} className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-bold mb-1 text-white">Configurações Gerais (ERP / Custos / ML)</h2>
                  <p className="text-xs text-slate-400">Mapeamento de colunas brutas do Tiny e planilhas de apoio.</p>
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

              <div className="flex justify-end pt-4">
                <button type="submit" disabled={salvando} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">
                  {salvando ? "A salvar..." : "Salvar Configurações Gerais"}
                </button>
              </div>
            </form>

          </div>
        )}

      </div>
    </div>
  );
}