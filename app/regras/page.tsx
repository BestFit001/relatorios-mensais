"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

const MESES_OPCOES = [
  { valor: "janeiro", nome: "Janeiro" },
  { valor: "fevereiro", nome: "Fevereiro" },
  { valor: "março", nome: "Março" },
  { valor: "abril", nome: "Abril" },
  { valor: "maio", nome: "Maio" },
  { valor: "junho", nome: "Junho" },
  { valor: "julho", nome: "Julho" },
  { valor: "agosto", nome: "Agosto" },
  { valor: "setembro", nome: "Setembro" },
  { valor: "outubro", nome: "Outubro" },
  { valor: "novembro", nome: "Novembro" },
  { valor: "dezembro", nome: "Dezembro" }
];

const ANOS_OPCOES = ["2025", "2026", "2027", "2028"];

export default function RegrasPage() {
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const router = useRouter();

  // Canais disponíveis no seletor
  const [canais, setCanais] = useState<string[]>([
    'Mercado Livre 1', 'Mercado Livre 2', 'Amazon', 'Magalu', 'Shopee', 'TikTok', 'Shein', 'Netshoes', 'Site', 'Clube Hebraica', 'Clube Paineiras', 'Centauro'
  ]);
  const [canalSelecionado, setCanalSelecionado] = useState('Mercado Livre 1');
  const [novoCanalInput, setNovoCanalInput] = useState('');

  // Configuração global de Imposto sobre Vendas (válido para todos os canais)
  const [impostoGlobal, setImpostoGlobal] = useState<string>("6.00");
  const [salvandoImposto, setSalvandoImposto] = useState(false);

  // Estados de Seleção de Mês e Ano
  const [mesSelecionado, setMesSelecionado] = useState("outubro");
  const [anoSelecionado, setAnoSelecionado] = useState("2026");
  const metaMesFormatado = `${mesSelecionado} de ${anoSelecionado}`;

  const [metaValor, setMetaValor] = useState<number | string>(0);
  const [responsavelCanal, setResponsavelCanal] = useState('Equipe Best Fit');
  const [logoUrl, setLogoUrl] = useState('');
  const [formulaApuracao, setFormulaApuracao] = useState('PDV - (PDV * 12%)');
  // Armazenagem no Full: o prazo varia de canal para canal
  const [diasAlertaArm, setDiasAlertaArm] = useState('90');
  const [diasCobrancaArm, setDiasCobrancaArm] = useState('120');
  // Recomendações (aba Full): quando um SKU vendido fora do Full merece ser enviado
  const [recVendasMin, setRecVendasMin] = useState('5');
  const [recLucroMin, setRecLucroMin] = useState('100');
  const [recMargemMin, setRecMargemMin] = useState('12');
  const [recDevMax, setRecDevMax] = useState('5');
  const [recDiasCobertura, setRecDiasCobertura] = useState('30');
  const [recExigirEstoque, setRecExigirEstoque] = useState(true);
  const [recMargemRever, setRecMargemRever] = useState('5');
  const [colunasFoco, setColunasFoco] = useState({
    idPedido: 'A',
    sku: 'B',
    precoVenda: 'P',
    quantidade: 'O',
    repasseDireto: ''
  });

  // Estados mantidos (Tiny, Custos e ML)
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
      carregarRegrasCanalEspecifico(canalSelecionado, metaMesFormatado);
    }
  }, [canalSelecionado, mesSelecionado, anoSelecionado]);

  const carregarDadosGlobais = async () => {
    setLoading(true);
    
    const { data: configs } = await supabase.from('config_regras_tiny').select('*');
    if (configs) {
      const getCol = (campo: string, def: string) => configs.find((t: any) => t.campo === campo)?.coluna || def;
      
      const tacosSalvo = configs.find((t: any) => t.campo === 'meta_tacos')?.coluna || "2";
      setMetaTacos(tacosSalvo);

      const impostoSalvo = configs.find((t: any) => t.campo === 'imposto_global')?.coluna || "6.00";
      setImpostoGlobal(impostoSalvo);

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

  const carregarRegrasCanalEspecifico = async (canal: string, periodoFormatado: string) => {
    const { data: regraDb } = await supabase.from('config_regras_canais').select('*').eq('canal', canal).maybeSingle();
    if (regraDb) {
      setFormulaApuracao(regraDb.formula_excel || 'PDV - (PDV * 12%)');
      setResponsavelCanal(regraDb.responsavel || 'Equipe Best Fit');
      setLogoUrl(regraDb.logo_url || '');
      setDiasAlertaArm(String(regraDb.dias_alerta_armazenagem ?? 90));
      setDiasCobrancaArm(String(regraDb.dias_cobranca_armazenagem ?? 120));
      setRecVendasMin(String(regraDb.rec_vendas_min ?? 5));
      setRecLucroMin(String(regraDb.rec_lucro_min ?? 100));
      setRecMargemMin(String(regraDb.rec_margem_min ?? 12));
      setRecDevMax(String(regraDb.rec_dev_max ?? 5));
      setRecDiasCobertura(String(regraDb.rec_dias_cobertura ?? 30));
      setRecExigirEstoque(regraDb.rec_exigir_estoque !== false);
      setRecMargemRever(String(regraDb.rec_margem_rever ?? 5));
      setColunasFoco({
        idPedido: regraDb.col_id_pedido || 'A',
        sku: regraDb.col_sku || 'B',
        precoVenda: regraDb.col_pdv || regraDb.col_preco_venda || 'P',
        quantidade: regraDb.col_quantidade || 'O',
        repasseDireto: regraDb.col_repasse || regraDb.col_estado || ''
      });
    } else {
      setFormulaApuracao('PDV - (PDV * 12%)');
      setResponsavelCanal('Equipe Best Fit');
      setLogoUrl('');
      setDiasAlertaArm('90');
      setDiasCobrancaArm('120');
      setColunasFoco({ idPedido: 'A', sku: 'B', precoVenda: 'P', quantidade: 'O', repasseDireto: '' });
    }

    const { data: metaDb } = await supabase
      .from('tb_metas')
      .select('*')
      .eq('canal', canal)
      .eq('mes_referencia', periodoFormatado)
      .maybeSingle();

    if (metaDb) {
      setMetaValor(metaDb.meta_valor || 0);
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
      const repasseCol = colunasFoco.repasseDireto ? colunasFoco.repasseDireto.toUpperCase().trim() : '';

      const alertaArm = Math.max(1, parseInt(diasAlertaArm, 10) || 90);
      const cobrancaArm = Math.max(1, parseInt(diasCobrancaArm, 10) || 120);
      if (alertaArm >= cobrancaArm) throw new Error("Armazenagem: o aviso (dias) precisa ser menor que o início da cobrança.");

      const registroRegra: any = {
        canal: canalSelecionado,
        formula_excel: formulaApuracao,
        responsavel: responsavelCanal,
        logo_url: logoUrl,
        col_id_pedido: colunasFoco.idPedido.toUpperCase(),
        col_sku: colunasFoco.sku.toUpperCase(),
        col_repasse: repasseCol,
        col_estado: repasseCol,
        col_pdv: colunasFoco.precoVenda.toUpperCase(),
        col_quantidade: colunasFoco.quantidade.toUpperCase(),
        dias_alerta_armazenagem: alertaArm,
        dias_cobranca_armazenagem: cobrancaArm,
        rec_vendas_min: Math.max(0, parseInt(recVendasMin, 10) || 0),
        rec_lucro_min: Number(String(recLucroMin).replace(',', '.')) || 0,
        rec_margem_min: Number(String(recMargemMin).replace(',', '.')) || 0,
        rec_dev_max: Number(String(recDevMax).replace(',', '.')) || 0,
        rec_dias_cobertura: Math.max(1, parseInt(recDiasCobertura, 10) || 30),
        rec_exigir_estoque: recExigirEstoque,
        rec_margem_rever: Number(String(recMargemRever).replace(',', '.')) || 0
      };
      let { error: erroRegra } = await supabase.from('config_regras_canais').upsert([registroRegra], { onConflict: 'canal' });

      // Migration dos prazos de armazenagem ainda não executada: salva o restante e avisa
      let faltouMigration = false;
      if (erroRegra && /dias_alerta_armazenagem|dias_cobranca_armazenagem|rec_/i.test(erroRegra.message)) {
        faltouMigration = true;
        const { dias_alerta_armazenagem, dias_cobranca_armazenagem, rec_vendas_min, rec_lucro_min, rec_margem_min, rec_dev_max, rec_dias_cobertura, rec_exigir_estoque, rec_margem_rever, ...semPrazos } = registroRegra;
        ({ error: erroRegra } = await supabase.from('config_regras_canais').upsert([semPrazos], { onConflict: 'canal' }));
      }

      if (erroRegra) throw new Error("Erro ao salvar regras: " + erroRegra.message);
      if (faltouMigration) alert("Regras salvas, mas os prazos de armazenagem e os parâmetros das recomendações NÃO foram gravados: execute as migrations 20261104120000_prazos_armazenagem_por_canal.sql e 20261112150000_full_alimentado_pelo_upload_e_recomendacoes.sql no Supabase.");

      const { error: erroMeta } = await supabase.from('tb_metas').upsert([{
        canal: canalSelecionado,
        mes_referencia: metaMesFormatado,
        meta_valor: Number(metaValor) || 0,
        responsavel: responsavelCanal
      }], { onConflict: 'canal, mes_referencia' });

      if (erroMeta) throw new Error("Erro ao salvar meta: " + erroMeta.message);

      alert(`✅ Configurações e meta do canal "${canalSelecionado}" (${metaMesFormatado}) salvas com sucesso!`);
    } catch (err: any) {
      alert("❌ " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  const salvarImpostoGlobal = async () => {
    setSalvandoImposto(true);
    try {
      const { error } = await supabase.from('config_regras_tiny').upsert([{
        campo: 'imposto_global',
        coluna: impostoGlobal.toString().trim()
      }], { onConflict: 'campo' });

      if (error) throw error;
      alert(`✅ Alíquota de imposto (${impostoGlobal}%) salva para todos os canais!`);
    } catch (err: any) {
      alert("Erro ao salvar imposto: " + err.message);
    } finally {
      setSalvandoImposto(false);
    }
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
      { campo: 'imposto_global', coluna: impostoGlobal.toString() },
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
            <h1 className="text-2xl font-black text-white tracking-tight">Central de Regras & Parametrização</h1>
            <p className="text-sm font-medium text-slate-400">Configure alíquotas fiscais, fórmulas de apuração de canais e colunas de relatórios.</p>
          </div>
          <Navbar />
        </div>

        {loading ? (
          <p className="p-8 text-center text-slate-400">A carregar configurações...</p>
        ) : (
          <div className="space-y-8">

            {/* CARD GLOBAL DE IMPOSTO SOBRE VENDAS */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950/70 p-6 rounded-2xl border border-indigo-800/40 shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block mb-1">Fiscal Omnichannel</span>
                <h2 className="text-lg font-black text-white">Alíquota de Imposto sobre Vendas (Simples Nacional)</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Esta alíquota será multiplicada pelo PDV faturado e <strong>descontada da liquidez real</strong> (não do repasse da plataforma).
                </p>
              </div>

              <div className="flex items-center gap-3 bg-slate-950 p-2 rounded-xl border border-slate-800">
                <div className="flex items-center gap-1.5 px-3">
                  <span className="text-xs font-bold text-slate-400">%</span>
                  <input
                    type="number"
                    step="0.01"
                    value={impostoGlobal}
                    onChange={e => setImpostoGlobal(e.target.value)}
                    placeholder="Ex: 6.00"
                    className="w-20 bg-transparent text-emerald-400 font-mono font-black text-base outline-none text-right"
                  />
                  <span className="text-xs text-slate-400 font-bold">%</span>
                </div>
                <button
                  type="button"
                  onClick={salvarImpostoGlobal}
                  disabled={salvandoImposto}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-lg transition uppercase tracking-wider cursor-pointer shadow"
                >
                  {salvandoImposto ? "Salvando..." : "Salvar Imposto"}
                </button>
              </div>
            </div>

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

            {/* BLOCO DE CONFIGURAÇÃO DO CANAL SELECIONADO */}
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                <h2 className="text-lg font-extrabold text-indigo-400">Configurando Canal: {canalSelecionado}</h2>
                <span className="text-xs text-slate-400 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">Parâmetros de Apuração</span>
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

                {/* SELEÇÃO POR MÊS E ANO */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Mês de Referência (Histórico da Meta):</label>
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={mesSelecionado}
                      onChange={e => setMesSelecionado(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-indigo-300 font-bold outline-none cursor-pointer"
                    >
                      {MESES_OPCOES.map(m => (
                        <option key={m.valor} value={m.valor} className="bg-slate-900 text-white">
                          {m.nome}
                        </option>
                      ))}
                    </select>

                    <select
                      value={anoSelecionado}
                      onChange={e => setAnoSelecionado(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-indigo-300 font-bold outline-none cursor-pointer"
                    >
                      {ANOS_OPCOES.map(a => (
                        <option key={a} value={a} className="bg-slate-900 text-white">
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Salvando como: <strong className="text-slate-300 uppercase">{metaMesFormatado}</strong>
                  </span>
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
                  <label className="block text-xs font-bold text-slate-300">Meta de Faturamento (R$) para {metaMesFormatado}:</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={metaValor} 
                    onChange={e => setMetaValor(e.target.value)} 
                    className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl p-3 text-xs font-bold text-emerald-400 outline-none" 
                  />
                </div>
              </div>

              {/* FÓRMULA DE APURAÇÃO DO REPASSE / LÍQUIDO DO CANAL */}
              <div className="space-y-2 bg-slate-950 p-5 rounded-xl border border-purple-900/40">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-purple-300 uppercase tracking-wider">
                    Fórmula de Apuração do Líquido / Repasse da Plataforma:
                  </label>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">Calculado Linha a Linha</span>
                </div>
                <input 
                  type="text" 
                  value={formulaApuracao} 
                  onChange={e => setFormulaApuracao(e.target.value)} 
                  placeholder="Ex: PDV - (PDV * 14%) - 4 - (PDV >= 79 ? 21.95 : 0)" 
                  className="w-full bg-slate-900 border border-purple-500/50 rounded-xl p-3.5 font-mono text-xs font-bold text-purple-200 outline-none focus:border-purple-400 shadow-inner" 
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Exemplos: Amazon = <code className="text-purple-300 font-bold">{"PDV - (PDV * 14%) - 4 - (PDV >= 79 ? 21.95 : 0)"}</code> ou Centauro = <code className="text-purple-300 font-bold">{"(P - Q) * O"}</code>.
                </p>
              </div>

              {/* MAPEAMENTO DAS 4 COLUNAS FOCO + REPASSE DIRETO */}
              <div className="space-y-3 pt-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Mapeamento das Colunas da Planilha:</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 mb-1">ID Pedido</span>
                    <input type="text" value={colunasFoco.idPedido} onChange={e => setColunasFoco({...colunasFoco, idPedido: e.target.value.toUpperCase()})} placeholder="Ex: A" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-indigo-400 font-mono font-bold text-center uppercase outline-none" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 mb-1">SKU</span>
                    <input type="text" value={colunasFoco.sku} onChange={e => setColunasFoco({...colunasFoco, sku: e.target.value.toUpperCase()})} placeholder="Ex: N ou B" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-indigo-400 font-mono font-bold text-center uppercase outline-none" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-amber-400 mb-1">Preço Venda (PDV)</span>
                    <input type="text" value={colunasFoco.precoVenda} onChange={e => setColunasFoco({...colunasFoco, precoVenda: e.target.value.toUpperCase()})} placeholder="Ex: P" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-amber-400 font-mono font-bold text-center uppercase outline-none" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-cyan-400 mb-1">Quantidade</span>
                    <input type="text" value={colunasFoco.quantidade} onChange={e => setColunasFoco({...colunasFoco, quantidade: e.target.value.toUpperCase()})} placeholder="Ex: O" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-cyan-400 font-mono font-bold text-center uppercase outline-none" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 mb-1">Repasse Direto (Opc.)</span>
                    <input type="text" value={colunasFoco.repasseDireto} onChange={e => setColunasFoco({...colunasFoco, repasseDireto: e.target.value.toUpperCase()})} placeholder="Ex: T (ML)" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-300 font-mono font-bold text-center uppercase outline-none" />
                  </div>
                </div>
              </div>

              {/* PRAZO DE ARMAZENAGEM NO FULL (varia por canal) */}
              <div className="space-y-3 pt-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Armazenagem no Full — prazo deste canal:</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div>
                    <span className="block text-[10px] font-bold text-amber-400 mb-1">Avisar a partir de (dias em estoque)</span>
                    <input type="number" min={1} value={diasAlertaArm} onChange={e => setDiasAlertaArm(e.target.value)} className="w-full bg-slate-900 border border-amber-600/50 rounded-lg p-2.5 text-xs text-amber-400 font-mono font-bold text-center outline-none" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-rose-400 mb-1">Começa a cobrar armazenagem com (dias)</span>
                    <input type="number" min={1} value={diasCobrancaArm} onChange={e => setDiasCobrancaArm(e.target.value)} className="w-full bg-slate-900 border border-rose-600/50 rounded-lg p-2.5 text-xs text-rose-400 font-mono font-bold text-center outline-none" />
                  </div>
                  <p className="sm:col-span-2 text-[11px] text-slate-400">
                    Na aba Fulfillment, o lote enviado ao Full gera o aviso “faltam X dias” a partir do primeiro prazo e passa a “em cobrança” no segundo. Cada canal pode ter um prazo diferente (padrão: 90 e 120).
                  </p>
                </div>
              </div>

              {/* RECOMENDAÇÕES DO FULL (aba Full > Recomendações) */}
              <div className="space-y-3 pt-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Recomendações do Full — quando vale enviar um produto:</label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div>
                    <span className="block text-[10px] font-bold text-fuchsia-400 mb-1">Vendas mínimas no mês (un.)</span>
                    <input type="number" min={0} value={recVendasMin} onChange={e => setRecVendasMin(e.target.value)} className="w-full bg-slate-900 border border-fuchsia-600/50 rounded-lg p-2.5 text-xs text-fuchsia-300 font-mono font-bold text-center outline-none" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-emerald-400 mb-1">Lucro líquido mínimo no mês (R$)</span>
                    <input type="number" min={0} step="0.01" value={recLucroMin} onChange={e => setRecLucroMin(e.target.value)} className="w-full bg-slate-900 border border-emerald-600/50 rounded-lg p-2.5 text-xs text-emerald-300 font-mono font-bold text-center outline-none" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-emerald-400 mb-1">Margem líquida mínima (%)</span>
                    <input type="number" min={0} step="0.1" value={recMargemMin} onChange={e => setRecMargemMin(e.target.value)} className="w-full bg-slate-900 border border-emerald-600/50 rounded-lg p-2.5 text-xs text-emerald-300 font-mono font-bold text-center outline-none" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-rose-400 mb-1">Devolução máxima (%)</span>
                    <input type="number" min={0} step="0.1" value={recDevMax} onChange={e => setRecDevMax(e.target.value)} className="w-full bg-slate-900 border border-rose-600/50 rounded-lg p-2.5 text-xs text-rose-300 font-mono font-bold text-center outline-none" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-cyan-400 mb-1">Cobrir quantos dias de venda</span>
                    <input type="number" min={1} value={recDiasCobertura} onChange={e => setRecDiasCobertura(e.target.value)} className="w-full bg-slate-900 border border-cyan-600/50 rounded-lg p-2.5 text-xs text-cyan-300 font-mono font-bold text-center outline-none" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-amber-400 mb-1">Rever no Full se a margem for menor que (%)</span>
                    <input type="number" step="0.1" value={recMargemRever} onChange={e => setRecMargemRever(e.target.value)} className="w-full bg-slate-900 border border-amber-600/50 rounded-lg p-2.5 text-xs text-amber-300 font-mono font-bold text-center outline-none" />
                  </div>
                  <label className="col-span-2 flex items-center gap-2 text-[11px] text-slate-300 font-bold cursor-pointer">
                    <input type="checkbox" checked={recExigirEstoque} onChange={e => setRecExigirEstoque(e.target.checked)} className="accent-fuchsia-500 w-4 h-4" />
                    Só recomendar produto com estoque na Sede
                  </label>
                  <p className="col-span-2 lg:col-span-4 text-[11px] text-slate-400">
                    A aba Full &gt; Recomendações cruza as vendas do mês que NÃO foram Full (vindas do upload de vendas do Mercado Livre) com estas regras: o SKU precisa atingir vendas, lucro e margem mínimos e ter devolução abaixo do teto. A quantidade sugerida cobre os dias informados. SKUs que já estão no Full com margem abaixo do limite de revisão aparecem em “Rever no Full”.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button 
                  type="button" 
                  onClick={salvarRegrasCanalAtual} 
                  disabled={salvando}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-8 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-purple-950/50"
                >
                  {salvando ? "A salvar..." : `Salvar Regras de ${canalSelecionado}`}
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

            {/* CONFIGURAÇÕES GERAIS TINY & CUSTOS */}
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