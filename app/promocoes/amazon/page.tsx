"use client";
import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";
import * as XLSX from "xlsx";
import { escolherRegraPorPreco } from "../../../lib/faixaTarifa";
import ConfigPromoTiny from "../../components/ConfigPromoTiny";
import PrecificacaoPorMarca, { useCfgMarcas } from "../../components/PrecificacaoPorMarca";
import { aplicarMarca, listarMarcas, lerPercentual, lerUnidades, type MarcaInfo } from "../../../lib/precificacaoMarcas";
import { carregarConfigPromoTiny, lerEstoqueTiny, PADRAO_PROMO_TINY, type ConfigPromoTiny as CfgPromoTiny } from "../../../lib/promoTiny";

// A Amazon só aceita até 500 SKUs por arquivo de Desconto no preço
const LIMITE_SKUS_AMAZON = 500;
const ARQUIVO_MODELO = "/modelos/amazon_desconto_preco_fixo.xlsx";

function normalizarSku(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "");
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/^["']|["']$/g, "").trim();
  if (/e\+/i.test(s)) {
    try { s = BigInt(Math.trunc(Number(s))).toString(); } catch {}
  }
  return s.toLowerCase();
}

function parseNumeroBruto(valor: any): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;
  let s = String(valor).replace(/R\$/g, "").replace(/\$/g, "").replace(/\s/g, "").trim();
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

const formatarMoeda = (valor: number) =>
  "R$ " + (Number(valor) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface ItemAmazon {
  sku: string;
  marca: string;
  custo: number;
  saldo: number;
  lucroPct: number;
  preco: number;
  unidades: number;
  /** as unidades pedidas eram maiores que o estoque */
  limitadoPeloEstoque: boolean;
  status: "APTO" | "INAPTO";
  motivo: string;
}

export default function PromocoesAmazonPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [margemAlvo, setMargemAlvo] = useState("10");
  const [unidadesPadrao, setUnidadesPadrao] = useState("10");
  const [dadosEstoqueRaw, setDadosEstoqueRaw] = useState<any[][] | null>(null);
  const [aba, setAba] = useState<"campanha" | "config">("campanha");
  const [cfgTiny, setCfgTiny] = useState<CfgPromoTiny>(PADRAO_PROMO_TINY);
  const [itens, setItens] = useState<ItemAmazon[]>([]);
  const [processado, setProcessado] = useState(false);

  const [custosMap, setCustosMap] = useState<Map<string, number>>(new Map());
  const [skuOriginal, setSkuOriginal] = useState<Map<string, string>>(new Map());   // chave normalizada -> SKU como está na base
  const [marcaMap, setMarcaMap] = useState<Map<string, string>>(new Map());
  const [marcasLista, setMarcasLista] = useState<MarcaInfo[]>([]);
  const [regrasTarifacao, setRegrasTarifacao] = useState<any[]>([]);
  const [skusNaAmazon, setSkusNaAmazon] = useState<Set<string>>(new Set());   // SKUs marcados na Amazon no Mapa de Cadastros
  const [soCadastrados, setSoCadastrados] = useState(true);
  const [cfgMarcas, setCfgMarcas] = useCfgMarcas("amazon");

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarBasesIniciais();
    carregarConfigPromoTiny().then(setCfgTiny);
  }, []);

  const carregarBasesIniciais = async () => {
    setLoading(true);
    try {
      const step = 1000;
      let allCustos: any[] = [];
      let from = 0;
      let keep = true;
      while (keep) {
        const { data } = await supabase.from("tabela_custos_skus").select("*").range(from, from + step - 1);
        if (data && data.length > 0) {
          allCustos = [...allCustos, ...data];
          from += step;
          if (data.length < step) keep = false;
        } else keep = false;
      }
      const cMap = new Map<string, number>();
      const mMap = new Map<string, string>();
      const oMap = new Map<string, string>();
      allCustos.forEach((c: any) => {
        const k = normalizarSku(c.sku);
        if (!k) return;
        cMap.set(k, parseNumeroBruto(c.custo_unitario ?? c.custo ?? 0));
        mMap.set(k, String(c.marca ?? ""));
        oMap.set(k, String(c.sku).trim());
      });
      setCustosMap(cMap);
      setMarcaMap(mMap);
      setSkuOriginal(oMap);
      setMarcasLista(listarMarcas(allCustos));

      const { data: tarifacaoData } = await supabase.from("config_regras_tarifacao").select("*");
      if (tarifacaoData) setRegrasTarifacao(tarifacaoData);

      // SKUs que estão na Amazon segundo o Mapa de Cadastros
      const naAmazon = new Set<string>();
      from = 0; keep = true;
      while (keep) {
        const { data } = await supabase.from("mapeamento_canais_skus").select("sku, presente").ilike("canal", "amazon%").range(from, from + step - 1);
        if (data && data.length > 0) {
          data.forEach((r: any) => { if (r.presente !== false) { const k = normalizarSku(r.sku); if (k) naAmazon.add(k); } });
          from += step;
          if (data.length < step) keep = false;
        } else keep = false;
      }
      setSkusNaAmazon(naAmazon);
      if (naAmazon.size === 0) setSoCadastrados(false);
    } catch (e) {
      console.error("Erro ao carregar bases:", e);
    }
    setLoading(false);
  };

  const regrasDaAmazon = useMemo(
    () => regrasTarifacao.filter((r) => String(r.canal || "").toLowerCase().includes("amazon")),
    [regrasTarifacao],
  );

  const obterRegraAmazon = (precoReferencia: number) => {
    if (regrasDaAmazon.length === 0) return { comissao: 14, tarifa_fixa: 0, frete: 0 };
    // vale a faixa que começa mais perto do preço sem passar dele (lib/faixaTarifa.ts)
    return escolherRegraPorPreco(regrasDaAmazon, precoReferencia) || regrasDaAmazon[0];
  };

  const lerArquivoGenerico = (file: File): Promise<any[][]> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const wb = XLSX.read(evt.target?.result, { type: "array", cellDates: true, raw: false });
          const ws = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as any[][]);
        } catch (err) { reject(err); }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });

  const handleEstoqueUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        setDadosEstoqueRaw(await lerArquivoGenerico(e.target.files[0]));
        setProcessado(false);
        alert("✅ Planilha de estoque (Tiny) carregada com sucesso!");
      } catch (err: any) {
        alert("Erro ao ler estoque: " + err.message);
      }
    }
  };

  const processarCampanhaAmazon = () => {
    if (!dadosEstoqueRaw) {
      alert("Suba a planilha de estoque do Tiny: só o que tem estoque entra na promoção.");
      return;
    }
    const margemPadraoPct = lerPercentual(margemAlvo);
    const soMarcas = cfgMarcas.ativo && cfgMarcas.semRegra === "excluir";
    if (margemPadraoPct === null && !soMarcas) {
      alert("Informe um lucro desejado válido (entre 0 e 99,9%).");
      return;
    }
    const unidadesBase = lerUnidades(unidadesPadrao);
    if (unidadesBase === null) {
      alert("Informe as unidades comprometidas padrão (número inteiro maior que zero).");
      return;
    }

    setLoading(true);
    try {
      // SKU e saldo nas colunas definidas na aba Configurações (padrão C e F); SKU repetido soma os saldos
      const lido = lerEstoqueTiny(dadosEstoqueRaw, cfgTiny, normalizarSku);
      if (lido.mapa.size === 0) {
        alert("⚠️ " + (lido.aviso || "Nenhum SKU foi lido na planilha de estoque."));
        setLoading(false);
        return;
      }
      if (lido.aviso) alert("⚠️ " + lido.aviso);
      const estoqueMap = lido.mapa;

      const imposto = 0.09;
      const embalagem = 0.70;
      // quais SKUs entram: os marcados na Amazon (Mapa de Cadastros) ou todos os que aparecem no estoque
      const candidatos: string[] = soCadastrados && skusNaAmazon.size > 0 ? Array.from(skusNaAmazon) : Array.from(estoqueMap.keys());
      const resultado: ItemAmazon[] = [];

      for (const chave of candidatos) {
        const saldo = estoqueMap.get(chave) || 0;
        const custo = custosMap.get(chave) || 0;
        const marca = marcaMap.get(chave) || "";
        const ap = aplicarMarca(cfgMarcas, marca, margemPadraoPct ?? 0, unidadesBase);
        const item: ItemAmazon = {
          sku: skuOriginal.get(chave) || chave, marca, custo, saldo, lucroPct: ap.margemPct, preco: 0,
          unidades: 0, limitadoPeloEstoque: false, status: "APTO", motivo: "",
        };

        if (ap.fora) { item.status = "INAPTO"; item.motivo = "Marca sem lucro definido"; }
        else if (saldo <= 0) { item.status = "INAPTO"; item.motivo = "Sem estoque"; }
        else if (custo <= 0) { item.status = "INAPTO"; item.motivo = "Custo não encontrado na base"; }
        else if (item.sku.length > 40) { item.status = "INAPTO"; item.motivo = "SKU com mais de 40 caracteres (limite da Amazon)"; }

        if (item.status === "APTO") {
          const margemDec = ap.margemPct / 100;
          let pdv = custo * 1.5;
          let inviavel = false;
          for (let iter = 0; iter < 15; iter++) {
            const regra = obterRegraAmazon(pdv);
            const comissaoVal = parseNumeroBruto(regra.comissao ?? 14);
            const comissaoDec = comissaoVal > 1 ? comissaoVal / 100 : comissaoVal;
            const tarifaFixa = parseNumeroBruto(regra.tarifa_fixa ?? 0);
            const frete = parseNumeroBruto(regra.frete ?? 0);
            const denominador = 1 - (comissaoDec + imposto + margemDec);
            if (denominador <= 0) { inviavel = true; break; }
            pdv = (custo + tarifaFixa + embalagem + frete) / denominador;
          }
          if (inviavel || !(pdv > 0)) { item.status = "INAPTO"; item.motivo = "Lucro inviável (comissão + imposto + lucro ≥ 100%)"; }
          else {
            item.preco = Math.round(pdv * 100) / 100;
            const maximo = Math.floor(saldo);
            item.unidades = Math.max(1, Math.min(ap.unidades, maximo));
            item.limitadoPeloEstoque = ap.unidades > maximo;
          }
        }
        resultado.push(item);
      }

      // aptos primeiro, agrupados por marca (cada arquivo de 500 fica com marcas juntas), depois por SKU
      resultado.sort((a, b) =>
        (a.status === b.status ? 0 : a.status === "APTO" ? -1 : 1) ||
        a.marca.localeCompare(b.marca, "pt-BR") || a.sku.localeCompare(b.sku, "pt-BR", { numeric: true }));
      setItens(resultado);
      setProcessado(true);
      const aptos = resultado.filter((r) => r.status === "APTO").length;
      alert(`✅ Processamento Amazon concluído!\n• Aptos: ${aptos}\n• Inaptos: ${resultado.length - aptos}`);
    } catch (err: any) {
      alert("Erro ao processar: " + err.message);
    }
    setLoading(false);
  };

  const aptos = useMemo(() => itens.filter((i) => i.status === "APTO"), [itens]);
  const inaptos = useMemo(() => itens.filter((i) => i.status === "INAPTO"), [itens]);
  const motivos = useMemo(() => {
    const m = new Map<string, number>();
    inaptos.forEach((i) => m.set(i.motivo, (m.get(i.motivo) || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [inaptos]);
  const partes = useMemo(() => {
    const out: ItemAmazon[][] = [];
    for (let i = 0; i < aptos.length; i += LIMITE_SKUS_AMAZON) out.push(aptos.slice(i, i + LIMITE_SKUS_AMAZON));
    return out;
  }, [aptos]);
  const limitadosPeloEstoque = aptos.filter((i) => i.limitadoPeloEstoque).length;

  // Modelo "Desconto no preço" da Amazon: preenche a aba Modelo (SKU, Preço com desconto, Unidades comprometidas) a partir da linha 3
  const baixarParte = async (indice: number) => {
    const parte = partes[indice];
    if (!parte) return;
    let wb: XLSX.WorkBook;
    try {
      const resp = await fetch(ARQUIVO_MODELO);
      if (!resp.ok) throw new Error("modelo indisponível");
      wb = XLSX.read(await resp.arrayBuffer(), { type: "array" });
      if (!wb.Sheets["Modelo"]) throw new Error("aba Modelo ausente");
    } catch {
      // sem o arquivo do modelo, monta a aba Modelo com os mesmos cabeçalhos
      wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["SKU", "DISCOUNTED PRICE", "COMMITTED UNITS"], ["Código SKU", "Preço com desconto", "Unidades comprometidas"]]), "Modelo");
    }
    const ws = wb.Sheets["Modelo"];
    const linhas = parte.map((i) => [String(i.sku), Number(i.preco.toFixed(2)), i.unidades]);
    XLSX.utils.sheet_add_aoa(ws, linhas, { origin: "A3" });
    const sufixo = partes.length > 1 ? `_parte${indice + 1}de${partes.length}` : "";
    XLSX.writeFile(wb, `Amazon_Desconto_no_preco${sufixo}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Gestão de Promoções — Amazon</h1>
            <p className="text-sm font-medium text-slate-400">Modelo &quot;Desconto no preço&quot; (preço fixo) com base em estoque (Tiny), custo e lucro por marca</p>
          </div>
          <Navbar />
        </div>

        <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
          <button
            onClick={() => setAba("campanha")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${aba === "campanha" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}
          >
            Precificar Campanha
          </button>
          <button
            onClick={() => setAba("config")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${aba === "config" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}
          >
            ⚙️ Configurações
          </button>
        </div>

        {aba === "config" ? (
          <ConfigPromoTiny onSalvo={setCfgTiny} />
        ) : (
          <>
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">⚙️ Configurações & Uploads (Amazon)</h3>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Lucro Desejado (%):</label>
                  <input
                    type="number" value={margemAlvo} onChange={(e) => setMargemAlvo(e.target.value)} data-amazon-margem
                    className="w-full bg-slate-950 border border-amber-600/50 rounded-xl p-2.5 text-xs font-mono text-amber-300 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Unidades comprometidas (padrão):</label>
                  <input
                    type="number" min="1" step="1" value={unidadesPadrao} onChange={(e) => setUnidadesPadrao(e.target.value)} data-amazon-unidades
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-slate-200 font-bold outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Planilha de Estoque do Tiny (SKU col. {cfgTiny.sku}, saldo col. {cfgTiny.estoque}):</label>
                  <input
                    type="file" accept=".xlsx, .xls, .csv" onChange={handleEstoqueUpload} data-amazon-estoque
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white cursor-pointer"
                  />
                  {!dadosEstoqueRaw && <p className="mt-1 text-[10px] text-amber-400">Obrigatório: só o que tem estoque entra na promoção.</p>}
                </div>
              </div>

              <PrecificacaoPorMarca cfg={cfgMarcas} onChange={setCfgMarcas} marcas={marcasLista} comUnidades rotuloPadrao="o lucro e as unidades padrão acima" />

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <label className={`flex items-center gap-2 text-xs ${skusNaAmazon.size ? "text-slate-300 cursor-pointer" : "text-slate-500"}`}>
                  <input
                    type="checkbox" checked={soCadastrados && skusNaAmazon.size > 0} disabled={skusNaAmazon.size === 0} data-amazon-so-cadastrados
                    onChange={(e) => { setSoCadastrados(e.target.checked); setProcessado(false); }}
                    className="w-4 h-4 accent-purple-600"
                  />
                  Só SKUs cadastrados na Amazon (Mapa de Cadastros: {skusNaAmazon.size} SKUs). Desmarcado, entra tudo o que tem estoque na planilha.
                </label>
                <button
                  type="button" onClick={processarCampanhaAmazon} disabled={loading} data-amazon-processar
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
                >
                  {loading ? "A processar..." : "Processar Campanha Amazon"}
                </button>
              </div>

              {regrasDaAmazon.length === 0 && (
                <p className="text-[11px] text-amber-400" data-amazon-sem-tarifa>
                  Nenhuma regra de tarifação da Amazon cadastrada (Regras &gt; Tarifação): o preço usa comissão de 14%, sem tarifa fixa nem frete. Cadastre as faixas da Amazon para o preço sair certo.
                </p>
              )}
            </div>

            {processado && (
              <div className="space-y-4" data-amazon-resultado>
                <div className="text-xs text-slate-300 font-medium bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-1">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>Itens aptos: <strong className="text-emerald-400">{aptos.length}</strong></span>
                    <span>Itens inaptos ignorados: <strong className="text-rose-400">{inaptos.length}</strong></span>
                  </div>
                  {motivos.length > 0 && (
                    <p className="text-[11px] text-slate-400" data-amazon-motivos>
                      Inaptos por motivo: {motivos.map(([m, n]) => `${m} (${n})`).join(" · ")}
                    </p>
                  )}
                  {limitadosPeloEstoque > 0 && (
                    <p className="text-[11px] text-amber-400">{limitadosPeloEstoque} SKU(s) tiveram as unidades reduzidas para o saldo em estoque.</p>
                  )}
                </div>

                {partes.length > 0 && (
                  <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-xl space-y-3">
                    <p className="text-[11px] text-slate-400">
                      A Amazon aceita até <strong className="text-slate-200">{LIMITE_SKUS_AMAZON} SKUs por arquivo</strong>, e um novo arquivo enviado para o mesmo desconto substitui os SKUs anteriores.
                      {partes.length > 1 ? " Por isso a lista sai em partes: envie cada parte em um desconto no preço diferente." : ""}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {partes.map((p, idx) => (
                        <button
                          key={idx} type="button" onClick={() => baixarParte(idx)} data-amazon-baixar={idx}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
                        >
                          {partes.length > 1 ? `Baixar parte ${idx + 1} de ${partes.length} (${p.length} SKUs)` : `Baixar modelo Amazon (${p.length} SKUs)`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
                  <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-white">Pré-visualização do Desconto no preço</h3>
                    <span className="text-xs text-slate-400">Total exibidos: {aptos.length}</span>
                  </div>
                  <div className="overflow-x-auto max-h-[500px]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                        <tr>
                          <th className="p-3">SKU</th>
                          <th className="p-3">Marca</th>
                          <th className="p-3 text-right">Custo</th>
                          <th className="p-3 text-right">Estoque</th>
                          <th className="p-3 text-right">Lucro %</th>
                          <th className="p-3 text-right">Preço com desconto</th>
                          <th className="p-3 text-right">Unidades</th>
                          <th className="p-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                        {aptos.map((item) => (
                          <tr key={item.sku} data-amazon-linha={item.sku} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-3 font-mono text-indigo-400">{item.sku}</td>
                            <td className="p-3 text-slate-300">{item.marca || "—"}</td>
                            <td className="p-3 text-right font-mono text-slate-400">{formatarMoeda(item.custo)}</td>
                            <td className="p-3 text-right font-mono text-slate-300">{item.saldo}</td>
                            <td className="p-3 text-right font-mono text-amber-300">{item.lucroPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-400">{formatarMoeda(item.preco)}</td>
                            <td className="p-3 text-right font-mono text-purple-300 font-bold">{item.unidades}{item.limitadoPeloEstoque ? " *" : ""}</td>
                            <td className="p-3 text-center">
                              <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">APTO</span>
                            </td>
                          </tr>
                        ))}
                        {aptos.length === 0 && (
                          <tr><td colSpan={8} className="p-8 text-center text-slate-500">Nenhum produto apto encontrado.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
