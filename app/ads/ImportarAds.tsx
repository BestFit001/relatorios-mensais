"use client";
// Adsense de um canal: envia a planilha da campanha + a planilha de anúncios, localiza o SKU do vendedor de cada
// anúncio, busca o custo e calcula a margem líquida por produto (com paginação). As colunas vêm da aba Configurações.
import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import {
  calcularProdutos, ehTikTok, padraoDoCanal, lerCampanha, lerCatalogo, mesDoNomeDoArquivo, totalizar,
  type CfgAdsCanal, type Catalogo, type CustoSku, type ProdutoCalculado,
} from "../../lib/adsImport";
import {
  carregarCatalogoAds, carregarCfgAds, excluirCampanha, listarCampanhasSalvas, salvarCampanha, salvarCatalogoAds, slugCanal, type CampanhaSalva,
} from "../../lib/adsImportDb";

type Props = { canal: string; mes: string; setMes: (m: string) => void; meses: string[]; custosMap: Map<string, any>; regras: any[] };
type Previa = { arquivo: string; campanhas: { id: string; nome: string; produtos: ProdutoCalculado[]; ignoradas: number }[]; catalogoNovo: Catalogo | null; avisos: string[] };

const R$ = (v: number) => "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PCT = (v: number) => ((v || 0) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const NUM = (v: number) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const quando = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

async function lerPlanilha(arquivo: File, aba: string): Promise<any[][]> {
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
  const nome = aba && wb.SheetNames.includes(aba) ? aba : wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: "", raw: true }) as any[][];
}

export default function ImportarAds({ canal, mes, setMes, meses, custosMap, regras }: Props) {
  const slug = slugCanal(canal);
  const [cfg, setCfg] = useState<CfgAdsCanal>(padraoDoCanal(canal));
  const [catalogoSalvo, setCatalogoSalvo] = useState<Catalogo | null>(null);
  const [salvas, setSalvas] = useState<CampanhaSalva[]>([]);
  const [selecionada, setSelecionada] = useState<string>("");
  const [arqCampanha, setArqCampanha] = useState<File | null>(null);
  const [arqCatalogo, setArqCatalogo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [processando, setProcessando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "aviso"; texto: string } | null>(null);
  // tabela
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "negativos" | "sem_custo">("todos");
  const [ordem, setOrdem] = useState<"receita" | "margemRs" | "margemPct" | "investimento" | "roi" | "pedidos">("receita");
  const [porPagina, setPorPagina] = useState(10);
  const [pagina, setPagina] = useState(1);
  const [aberto, setAberto] = useState<string | null>(null);

  const custos = useMemo(() => {
    const m = new Map<string, CustoSku>();
    custosMap.forEach((v, k) => m.set(k, { custo: Number(v?.custo_unitario || 0), produto: v?.produto }));
    return m;
  }, [custosMap]);

  useEffect(() => { (async () => { setCfg(await carregarCfgAds(supabase, slug, canal)); setCatalogoSalvo(await carregarCatalogoAds(supabase, slug)); })(); }, [slug, canal]);

  const recarregarSalvas = async (manter?: string) => {
    const l = await listarCampanhasSalvas(supabase, slug, mes);
    setSalvas(l);
    setSelecionada((atual) => (manter && l.some((c) => c.id === manter) ? manter : l.some((c) => c.id === atual) ? atual : l[0]?.id || ""));
  };
  useEffect(() => { setPrevia(null); recarregarSalvas(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug, mes]);

  const escolherCampanha = (f: File | null) => {
    setArqCampanha(f); setMsg(null);
    const m = f ? mesDoNomeDoArquivo(f.name) : null;
    if (m && meses.includes(m)) setMes(m);   // o nome do arquivo traz o período (ex.: 2026-11-01 a 2026-11-15)
  };

  const processar = async () => {
    if (!arqCampanha) { setMsg({ tipo: "erro", texto: "Escolha a planilha da campanha." }); return; }
    setProcessando(true); setMsg(null); setPrevia(null);
    try {
      const avisos: string[] = [];
      let catalogoUsado = catalogoSalvo, catalogoNovo: Catalogo | null = null;
      if (arqCatalogo) {
        const lc = lerCatalogo(await lerPlanilha(arqCatalogo, cfg.catalogo.aba), cfg.catalogo);
        if (lc.erro || !lc.catalogo) { setMsg({ tipo: "erro", texto: lc.erro || "Não consegui ler a planilha de anúncios." }); setProcessando(false); return; }
        catalogoNovo = lc.catalogo; catalogoUsado = lc.catalogo;
        if (lc.semSkuSeller > 0) avisos.push(`${lc.semSkuSeller} variação(ões) da planilha de anúncios estão sem SKU do vendedor e foram ignoradas.`);
      } else if (!catalogoSalvo) {
        avisos.push("Ainda não há planilha de anúncios salva: sem ela não dá para achar o SKU do vendedor nem o custo. Envie a planilha de anúncios também.");
      }
      const lcamp = lerCampanha(await lerPlanilha(arqCampanha, cfg.campanha.aba), cfg.campanha);
      if (lcamp.erro) { setMsg({ tipo: "erro", texto: lcamp.erro }); setProcessando(false); return; }
      const calc = calcularProdutos(lcamp.linhas, { canal, regras, custos, catalogo: catalogoUsado, cfg });
      const grupos = new Map<string, { id: string; nome: string; produtos: ProdutoCalculado[] }>();
      for (const p of calc) {
        const id = p.campanhaId || "sem-id";
        const g = grupos.get(id) || { id, nome: p.campanhaNome || arqCampanha.name, produtos: [] };
        g.produtos.push(p); grupos.set(id, g);
      }
      const campanhas = Array.from(grupos.values()).map((g) => ({ ...g, ignoradas: grupos.size === 1 ? lcamp.ignoradasSemMovimento : 0 }));
      const semAnuncio = calc.filter((p) => p.status === "sem_anuncio").length;
      const semCusto = calc.filter((p) => p.status === "sem_custo" || p.status === "custo_parcial").length;
      if (semAnuncio) avisos.push(`${semAnuncio} produto(s) da campanha não estão na planilha de anúncios (sem SKU do vendedor): a margem deles considera custo zero.`);
      if (semCusto) avisos.push(`${semCusto} produto(s) têm SKU sem custo cadastrado (ou só parte das variações): confira na tabela os marcados "sem custo".`);
      if (lcamp.ignoradasSemMovimento) avisos.push(`${lcamp.ignoradasSemMovimento} produto(s) sem investimento nem vendas foram deixados de fora.`);
      setPrevia({ arquivo: arqCampanha.name, campanhas, catalogoNovo, avisos });
      setSelecionada(campanhas[0]?.id || ""); setPagina(1); setAberto(null);
    } catch (e: any) {
      setMsg({ tipo: "erro", texto: "Não consegui ler as planilhas: " + (e?.message || e) });
    }
    setProcessando(false);
  };

  const salvarPrevia = async () => {
    if (!previa) return;
    setSalvando(true); setMsg(null);
    if (previa.catalogoNovo) {
      const e = await salvarCatalogoAds(supabase, slug, previa.catalogoNovo);
      if (e) { setMsg({ tipo: "erro", texto: e }); setSalvando(false); return; }
      setCatalogoSalvo(previa.catalogoNovo);
    }
    for (const c of previa.campanhas) {
      const e = await salvarCampanha(supabase, slug, canal, mes, { id: c.id, nome: c.nome, arquivo: previa.arquivo, ignoradas: c.ignoradas, produtos: c.produtos });
      if (e) { setMsg({ tipo: "erro", texto: e }); setSalvando(false); return; }
    }
    const primeira = previa.campanhas[0]?.id;
    setPrevia(null); setArqCampanha(null); setArqCatalogo(null);
    await recarregarSalvas(primeira);
    setMsg({ tipo: "ok", texto: `Salvo em ${mes}: os produtos já entram na Análise global do Adsense.` });
    setSalvando(false);
  };

  const apagar = async (c: CampanhaSalva) => {
    if (!confirm(`Apagar a campanha "${c.nome}" de ${mes}? Os produtos dela também saem da Análise global.`)) return;
    const e = await excluirCampanha(supabase, slug, mes, c);
    if (e) { setMsg({ tipo: "erro", texto: e }); return; }
    await recarregarSalvas();
    setMsg({ tipo: "ok", texto: "Campanha apagada." });
  };

  // ---- o que está na tela: a prévia (ainda não salva) ou a campanha salva selecionada
  const campanhasVisiveis = previa ? previa.campanhas.map((c) => ({ id: c.id, nome: c.nome, produtos: c.produtos })) : salvas.map((c) => ({ id: c.id, nome: c.nome, produtos: c.produtos }));
  const atual = campanhasVisiveis.find((c) => c.id === selecionada) || campanhasVisiveis[0];
  const salvaAtual = !previa ? salvas.find((c) => c.id === atual?.id) : undefined;
  const totais = useMemo(() => totalizar(atual?.produtos || []), [atual]);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let l = (atual?.produtos || []).filter((p) => {
      if (filtro === "negativos" && p.margemRs >= 0) return false;
      if (filtro === "sem_custo" && p.status !== "sem_custo" && p.status !== "custo_parcial" && p.status !== "sem_anuncio") return false;
      if (!q) return true;
      return p.produto.toLowerCase().includes(q) || p.idProduto.includes(q) || p.skus.some((s) => s.toLowerCase().includes(q));
    });
    const val = (p: ProdutoCalculado) => (ordem === "roi" ? p.roiPlataforma : (p as any)[ordem]);
    l = [...l].sort((a, b) => val(b) - val(a));
    return l;
  }, [atual, busca, filtro, ordem]);

  const totalPaginas = Math.max(1, Math.ceil(linhas.length / porPagina));
  const pag = Math.min(pagina, totalPaginas);
  const visiveis = linhas.slice((pag - 1) * porPagina, pag * porPagina);
  useEffect(() => { setPagina(1); }, [busca, filtro, ordem, porPagina, selecionada, previa]);
  const botoesPagina = useMemo(() => {
    const todos = Array.from({ length: totalPaginas }, (_, i) => i + 1);
    return todos.filter((n) => n === 1 || n === totalPaginas || Math.abs(n - pag) <= 2);
  }, [totalPaginas, pag]);

  const card = (rotulo: string, valor: string, extra?: string, cor = "text-white") => (
    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{rotulo}</div>
      <div className={`text-lg font-black mt-1 ${cor}`}>{valor}</div>
      {extra && <div className="text-[10px] text-slate-500 mt-0.5">{extra}</div>}
    </div>
  );

  return (
    <div className="space-y-6" data-importar-ads>
      {/* ENVIO DAS PLANILHAS */}
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">📥 Importar planilhas — {canal}</h2>
            <p className="text-xs text-slate-400 mt-1">Envie a planilha da campanha e a de anúncios. O app acha o SKU do vendedor de cada anúncio, busca o custo e calcula a margem líquida. As colunas ficam na sub-aba Configurações deste canal.</p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mês de competência</label>
            <select data-mes-importar value={mes} onChange={(e) => setMes(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none cursor-pointer">
              {meses.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">1. Planilha da campanha (Product data)</label>
            <input type="file" accept=".xlsx,.xls,.csv" data-arq-campanha onChange={(e) => escolherCampanha(e.target.files?.[0] || null)} className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-700 file:text-white file:font-bold cursor-pointer" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">2. Planilha de anúncios (ID do anúncio → SKU do vendedor)</label>
            <input type="file" accept=".xlsx,.xls,.csv" data-arq-catalogo onChange={(e) => { setArqCatalogo(e.target.files?.[0] || null); setMsg(null); }} className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white file:font-bold cursor-pointer" />
            <p data-status-catalogo className="text-[10px] mt-1 text-slate-500">
              {catalogoSalvo ? `Já salva: ${Object.keys(catalogoSalvo.produtos).length} produtos, ${Object.values(catalogoSalvo.produtos).reduce((a, p) => a + p.v.length, 0)} SKUs (atualizada em ${quando(catalogoSalvo.atualizadoEm)}). Só envie de novo se houver anúncios novos.` : "Nenhuma planilha de anúncios salva ainda."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-5">
          <button type="button" data-processar disabled={processando || !arqCampanha} onClick={processar} className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">{processando ? "Calculando…" : "Calcular"}</button>
          {previa && <button type="button" data-salvar-previa disabled={salvando} onClick={salvarPrevia} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">{salvando ? "Salvando…" : `💾 Salvar em ${mes}`}</button>}
          {previa && <button type="button" onClick={() => setPrevia(null)} className="text-xs font-bold text-slate-400 hover:text-white cursor-pointer">Descartar prévia</button>}
          {msg && <span data-msg-importar className={`text-xs font-bold ${msg.tipo === "ok" ? "text-emerald-400" : msg.tipo === "erro" ? "text-rose-400" : "text-amber-400"}`}>{msg.texto}</span>}
        </div>
        {previa && previa.avisos.length > 0 && (
          <ul data-avisos className="mt-4 space-y-1 text-[11px] text-amber-300 bg-amber-950/20 border border-amber-900/40 rounded-xl p-3">
            {previa.avisos.map((a, i) => <li key={i}>⚠ {a}</li>)}
          </ul>
        )}
        {previa && <p className="mt-3 text-[11px] text-sky-300" data-previa>Prévia de “{previa.arquivo}” — ainda não salva. Confira os números abaixo e clique em Salvar.</p>}
      </div>

      {/* CAMPANHAS DO MÊS */}
      {campanhasVisiveis.length === 0 ? (
        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 text-center text-sm text-slate-500">Nenhuma campanha importada em {mes}. Envie as planilhas acima para começar.</div>
      ) : atual && (
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl" data-campanhas>
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {campanhasVisiveis.map((c) => (
              <button key={c.id} type="button" data-campanha={c.id} onClick={() => setSelecionada(c.id)} title={c.nome}
                className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer max-w-xs truncate border ${atual.id === c.id ? "bg-purple-600 border-purple-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white"}`}>
                {c.nome.replace(/^\[Auto-created\]\s*/i, "")}
              </button>
            ))}
            {salvaAtual && <span className="text-[10px] text-slate-500 ml-2">importada em {quando(salvaAtual.importadoEm)} · {salvaAtual.arquivo}</span>}
            {salvaAtual && <button type="button" data-apagar-campanha onClick={() => apagar(salvaAtual)} className="ml-auto text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer">🗑️ Apagar esta campanha</button>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6" data-resumo-campanha>
            {card("Investimento", R$(totais.investimento), cfg.somarAfiliado ? "custo + afiliados" : "só custo do anúncio")}
            {card("Receita bruta", R$(totais.receita))}
            {card("ROI", NUM(totais.roi) + "x", "receita ÷ investimento")}
            {card("Margem líquida", R$(totais.margemRs), PCT(totais.margemPct) + " da receita", totais.margemRs >= 0 ? "text-emerald-400" : "text-rose-400")}
            {card("Pedidos", NUM(totais.pedidos))}
            {card("Produtos", String(totais.produtos), totais.semCusto + totais.semAnuncio > 0 ? `${totais.semCusto + totais.semAnuncio} com custo/SKU em falta` : "todos com custo", totais.semCusto + totais.semAnuncio > 0 ? "text-amber-300" : "text-white")}
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input data-busca-produto value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto, ID ou SKU…" className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-purple-500 w-64" />
            <select data-filtro value={filtro} onChange={(e) => setFiltro(e.target.value as any)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer">
              <option value="todos">Todos os produtos</option><option value="negativos">Só margem negativa</option><option value="sem_custo">Só sem custo / sem SKU</option>
            </select>
            <select data-ordem value={ordem} onChange={(e) => setOrdem(e.target.value as any)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer">
              <option value="receita">Ordenar: maior receita</option><option value="margemRs">Ordenar: maior margem (R$)</option><option value="margemPct">Ordenar: maior margem (%)</option>
              <option value="investimento">Ordenar: maior investimento</option><option value="roi">Ordenar: maior ROI</option><option value="pedidos">Ordenar: mais pedidos</option>
            </select>
            <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
              <span>Por página</span>
              <select data-por-pagina value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer">
                {[10, 25, 50, 100, 500].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap" data-tabela-produtos>
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3 min-w-[260px]">Produto</th><th className="p-3">SKU seller</th><th className="p-3 text-right">Pedidos</th><th className="p-3 text-right">Receita</th>
                  <th className="p-3 text-right">PDV</th><th className="p-3 text-right">Invest.</th><th className="p-3 text-right">ROI</th><th className="p-3 text-right">Custo prod.</th>
                  <th className="p-3 text-right">Imposto</th><th className="p-3 text-right">Tarifa</th><th className="p-3 text-right">Embal.</th><th className="p-3 text-right">Margem R$</th><th className="p-3 text-right">Margem %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {visiveis.length === 0 && <tr><td colSpan={13} className="p-6 text-center text-slate-500">Nenhum produto com esse filtro.</td></tr>}
                {visiveis.map((p) => {
                  const k = p.idProduto;
                  return (
                    <React.Fragment key={k}>
                      <tr data-produto={k} onClick={() => setAberto(aberto === k ? null : k)} className="hover:bg-slate-800/40 cursor-pointer">
                        <td className="p-3">
                          <div className="font-bold text-slate-100 whitespace-normal line-clamp-2 max-w-[340px]">{p.produto || "Produto sem nome"}</div>
                          <div className="text-[10px] text-slate-500">ID {p.idProduto}{p.status === "sem_anuncio" && <span className="ml-2 text-amber-400 font-bold">sem anúncio na planilha</span>}{(p.status === "sem_custo") && <span className="ml-2 text-amber-400 font-bold">sem custo</span>}{p.status === "custo_parcial" && <span className="ml-2 text-amber-400 font-bold">custo parcial ({p.skusComCusto}/{p.skus.length})</span>}</div>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-slate-300">{p.sku || "—"}{p.skus.length > 1 && <span className="text-slate-500"> +{p.skus.length - 1}</span>}</td>
                        <td className="p-3 text-right">{NUM(p.pedidos)}</td>
                        <td className="p-3 text-right">{R$(p.receita)}</td>
                        <td className="p-3 text-right text-slate-400">{R$(p.pdv)}</td>
                        <td className="p-3 text-right">{R$(p.investimento)}</td>
                        <td className="p-3 text-right">{NUM(p.roiPlataforma)}x</td>
                        <td className="p-3 text-right text-slate-400">{R$(p.custoProduto)}</td>
                        <td className="p-3 text-right text-slate-400">{R$(p.imposto)}</td>
                        <td className="p-3 text-right text-slate-400">{R$(p.tarifa + p.frete)}</td>
                        <td className="p-3 text-right text-slate-400">{R$(p.embalagem)}</td>
                        <td className={`p-3 text-right font-bold ${p.margemRs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{R$(p.margemRs)}</td>
                        <td className={`p-3 text-right font-bold ${p.margemRs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{PCT(p.margemPct)}</td>
                      </tr>
                      {aberto === k && (
                        <tr data-produto-detalhe={k} className="bg-slate-950/60">
                          <td colSpan={13} className="p-4 whitespace-normal">
                            <div className="text-[11px] text-slate-400 mb-1">SKUs do vendedor deste anúncio ({p.skus.length}) · custo unitário usado (SKU {p.sku}): <strong className="text-slate-200">{R$(p.custoUnit)}</strong> · custo de afiliados: {R$(p.custoAfiliado)}</div>
                            <div className="flex flex-wrap gap-1.5">{p.skus.length ? p.skus.map((s) => <span key={s} className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300">{s}</span>) : <span className="text-[11px] text-amber-400">Nenhum SKU do vendedor encontrado para este ID de produto.</span>}</div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 mt-4" data-paginacao>
            <span className="text-[11px] text-slate-500">{linhas.length === 0 ? "0 produtos" : `${(pag - 1) * porPagina + 1}–${Math.min(pag * porPagina, linhas.length)} de ${linhas.length} produto(s)`}</span>
            <div className="flex items-center gap-1">
              <button type="button" data-pag-ant disabled={pag <= 1} onClick={() => setPagina(pag - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">‹ Anterior</button>
              {botoesPagina.map((n, i) => (
                <React.Fragment key={n}>
                  {i > 0 && n - botoesPagina[i - 1] > 1 && <span className="text-slate-600 px-1">…</span>}
                  <button type="button" data-pag={n} onClick={() => setPagina(n)} className={`w-8 h-8 rounded-lg text-xs font-bold border cursor-pointer ${n === pag ? "bg-purple-600 border-purple-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400"}`}>{n}</button>
                </React.Fragment>
              ))}
              <button type="button" data-pag-prox disabled={pag >= totalPaginas} onClick={() => setPagina(pag + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">Próxima ›</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
