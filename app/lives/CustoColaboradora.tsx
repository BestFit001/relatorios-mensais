"use client";
// Aba oculta do Relatório de Lives (só Admin Geral): mesmo cálculo do "Relatório & Vendas", mês a mês, descontando o custo da colaboradora
// (salário, 13º, férias, 1/3 de férias, encargos, vale-transporte e outros custos digitados à mão).
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { resumirLives, type ItemResumoLive } from "@/lib/livesResumo";
import GraficoEquilibrio from "./GraficoEquilibrio";
import { serieEquilibrio, vinculoNoMes, type VendaDia } from "@/lib/equilibrioLives";
import {
  CAMPO_ADMISSAO, PREFIXO_RH, REGIMES, aplicarRegime, calcularCustoColaboradora, campoRh, lerTodosRh, parametrosDoMes, resultadoComColaboradora, serializarParams,
  type ParamsColaboradora, type RegimeEncargos,
} from "@/lib/custoColaboradora";

export interface ItemLiveColab extends ItemResumoLive {
  vendedor: string;
  dataIso: string;
  timestamp: number | null;
}

const moeda = (v: number) => "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number, casas = 2) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";
const dataBR = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const mesBR = (m: string) => (m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : "—");

/** Mês (AAAA-MM) de uma venda: pela data reconhecida; senão pelo carimbo de tempo. */
function mesDoItem(i: ItemLiveColab): string {
  if (i.dataIso && /^\d{4}-\d{2}/.test(i.dataIso)) return i.dataIso.slice(0, 7);
  if (i.timestamp) { const d = new Date(i.timestamp); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
  return "";
}

/** Aceita "1.234,56", "1234,56" e "1234.56". */
function lerNumero(s: string): number {
  let t = String(s ?? "").trim();
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const v = Number(t);
  return Number.isFinite(v) ? v : 0;
}

function CampoNumero({ valor, onChange, dado, sufixo, largura = "w-full" }: { valor: number; onChange: (n: number) => void; dado: string; sufixo?: string; largura?: string }) {
  const paraTexto = (v: number) => (v ? String(v).replace(".", ",") : "");
  const [texto, setTexto] = useState(paraTexto(valor));
  useEffect(() => { if (lerNumero(texto) !== valor) setTexto(paraTexto(valor)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [valor]);
  return (
    <div className={`flex items-center gap-1.5 ${largura}`}>
      <input type="text" inputMode="decimal" data-colab-campo={dado} value={texto} placeholder="0,00"
        onChange={(e) => { setTexto(e.target.value); onChange(lerNumero(e.target.value)); }}
        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono font-bold outline-none focus:border-indigo-500" />
      {sufixo && <span className="text-[10px] font-bold text-slate-500">{sufixo}</span>}
    </div>
  );
}

function Cartao({ titulo, valor, cor = "text-white", detalhe, destaque = false }: { titulo: string; valor: string; cor?: string; detalhe?: string; destaque?: boolean }) {
  return (
    <div className={`${destaque ? "bg-emerald-950/40 border-emerald-800/60" : "bg-slate-900/90 border-slate-800/80"} p-3.5 rounded-2xl border shadow-xl`}>
      <span className={`block text-[10px] font-bold uppercase ${destaque ? "text-emerald-300" : "text-slate-400"}`}>{titulo}</span>
      <span className={`text-sm font-black font-mono mt-1 block ${cor}`}>{valor}</span>
      {detalhe && <span className="block text-[9px] text-slate-500 mt-0.5">{detalhe}</span>}
    </div>
  );
}

export default function CustoColaboradora({ itens, custoLives, roiMedio, percentualImposto, percentualComissao, canalRegras }: {
  itens: ItemLiveColab[]; custoLives: number; roiMedio: number; percentualImposto: string; percentualComissao: string; canalRegras: string;
}) {
  const meses = useMemo(() => Array.from(new Set(itens.map(mesDoItem).filter(Boolean))).sort().reverse(), [itens]);
  const [mes, setMes] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [salvos, setSalvos] = useState<Map<string, ParamsColaboradora>>(new Map());
  const [carregou, setCarregou] = useState(false);
  const [erroBanco, setErroBanco] = useState("");
  const [params, setParams] = useState<ParamsColaboradora>(parametrosDoMes(new Map(), "").params);
  const [origem, setOrigem] = useState<{ tipo: "salvo" | "herdado" | "padrao"; deMes?: string }>({ tipo: "padrao" });
  const [msg, setMsg] = useState("");
  const [admissao, setAdmissao] = useState("");
  const [admissaoSalva, setAdmissaoSalva] = useState("");
  const [incluirAds, setIncluirAds] = useState(true);
  const hoje = useMemo(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }), []);

  // valores já salvos (um por mês)
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [{ data, error }, adm] = await Promise.all([
        supabase.from("config_regras_tiny").select("campo, coluna").like("campo", `${PREFIXO_RH}%`),
        supabase.from("config_regras_tiny").select("coluna").eq("campo", CAMPO_ADMISSAO).maybeSingle(),
      ]);
      if (!vivo) return;
      if (error) setErroBanco(error.message);
      const dAdm = String(adm?.data?.coluna ?? "").slice(0, 10);
      setAdmissao(dAdm); setAdmissaoSalva(dAdm);
      setSalvos(lerTodosRh(data));
      setCarregou(true);
    })();
    return () => { vivo = false; };
  }, []);

  // mês inicial: o mais recente com vendas
  useEffect(() => { if (!mes && meses.length) setMes(meses[0]); }, [meses, mes]);

  // ao trocar de mês (ou quando os salvos chegam), carrega os valores dele
  useEffect(() => {
    if (!mes || !carregou) return;
    const r = parametrosDoMes(salvos, mes);
    setParams(r.params); setOrigem({ tipo: r.origem, deMes: r.deMes }); setMsg("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, carregou]);

  const vendedores = useMemo(() => Array.from(new Set(itens.map((i) => i.vendedor).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [itens]);
  const doMes = useMemo(() => itens.filter((i) => mesDoItem(i) === mes && (!vendedor || i.vendedor === vendedor)), [itens, mes, vendedor]);
  const semData = useMemo(() => itens.filter((i) => !mesDoItem(i)).length, [itens]);

  const resumo = useMemo(() => resumirLives(doMes, custoLives), [doMes, custoLives]);
  // quanto do mês ela esteve registrada (calendário do mês): salário, 13º, férias e encargos são proporcionais
  const vinc = useMemo(() => vinculoNoMes(mes, admissao), [mes, admissao]);
  const custo = useMemo(() => calcularCustoColaboradora(params, vinc.fator), [params, vinc.fator]);
  const final = useMemo(() => resultadoComColaboradora({ liquidezDasVendas: resumo.liquidezDasVendas, custoLives, totalVenda: resumo.totalVenda, totalPdv: resumo.totalPdv, custoColaboradora: custo.total }), [resumo, custoLives, custo]);

  // vendas de cada dia do mês (só o que o resumo precisa: valor, liquidez e quantidade)
  const porDia = useMemo(() => {
    const m = new Map<string, VendaDia>();
    for (const i of doMes) {
      const dia = i.dataIso && /^\d{4}-\d{2}-\d{2}/.test(i.dataIso) ? i.dataIso.slice(0, 10)
        : i.timestamp ? (() => { const d = new Date(i.timestamp as number); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })() : "";
      if (!dia) continue;
      const x = m.get(dia) || { vendas: 0, liquidez: 0, pedidos: 0 };
      x.vendas += i.valorPago; x.liquidez += i.liquidez; x.pedidos += 1;
      m.set(dia, x);
    }
    return m;
  }, [doMes]);
  const serie = useMemo(() => serieEquilibrio({ mes, hoje, vinculo: vinc, custoColabMes: custo.total, custoLivesMes: custoLives, incluirAds, porDia }), [mes, hoje, vinc, custo.total, custoLives, incluirAds, porDia]);
  const vendasAcum = serie.dias.reduce((a, d) => a + d.vendas, 0);
  const margemMes = vendasAcum > 0 ? serie.liquidezAcumulada / vendasAcum : 0;

  // há algo digitado que ainda não está salvo neste mês?
  const salvoDoMes = mes ? salvos.get(mes) : undefined;
  const sujo = admissao !== admissaoSalva || (salvoDoMes ? serializarParams(salvoDoMes) !== serializarParams(params) : params.salario > 0 || params.valeTransporte > 0 || params.outros.length > 0);

  const mudar = (parcial: Partial<ParamsColaboradora>) => { setParams((p) => ({ ...p, ...parcial })); setMsg(""); };

  const salvar = async () => {
    if (!mes) return;
    const { error } = await supabase.from("config_regras_tiny").upsert({ campo: campoRh(mes), coluna: serializarParams(params) }, { onConflict: "campo" });
    if (error) { setMsg("❌ Não consegui salvar: " + error.message); return; }
    if (admissao !== admissaoSalva) {
      const r = admissao
        ? await supabase.from("config_regras_tiny").upsert({ campo: CAMPO_ADMISSAO, coluna: admissao }, { onConflict: "campo" })
        : await supabase.from("config_regras_tiny").delete().eq("campo", CAMPO_ADMISSAO);
      if (r.error) { setMsg("❌ Salvei os valores, mas não a data de registro: " + r.error.message); setSalvos((prev) => new Map(prev).set(mes, params)); setOrigem({ tipo: "salvo" }); return; }
      setAdmissaoSalva(admissao);
    }
    setSalvos((prev) => new Map(prev).set(mes, params));
    setOrigem({ tipo: "salvo" });
    setMsg(`✅ Valores de ${mesBR(mes)} salvos.`);
  };

  const apagar = async () => {
    if (!mes || !confirm(`Apagar os valores salvos de ${mesBR(mes)}?`)) return;
    const { error } = await supabase.from("config_regras_tiny").delete().eq("campo", campoRh(mes));
    if (error) { setMsg("❌ Não consegui apagar: " + error.message); return; }
    const novo = new Map(salvos); novo.delete(mes);
    setSalvos(novo);
    const r = parametrosDoMes(novo, mes);
    setParams(r.params); setOrigem({ tipo: r.origem, deMes: r.deMes });
    setMsg(`Valores de ${mesBR(mes)} apagados.`);
  };

  const linhasDetalhe: { nome: string; valor: number; dica?: string; forte?: boolean }[] = [
    { nome: vinc.fator < 1 ? `Salário proporcional (${vinc.diasVinculo}/${vinc.diasMes} dias)` : "Salário base", valor: custo.salario },
    { nome: "13º salário (1/12 por mês)", valor: custo.decimoTerceiro },
    { nome: "Férias (1/12 por mês)", valor: custo.ferias },
    { nome: "1/3 constitucional das férias", valor: custo.tercoFerias },
    { nome: `INSS patronal (${pct(params.pInss, 1)})`, valor: custo.inss, dica: "sobre salário + 13º + férias + 1/3" },
    { nome: `RAT/SAT (${pct(params.pRat, 1)})`, valor: custo.rat },
    { nome: `Terceiros / Sistema S (${pct(params.pTerceiros, 1)})`, valor: custo.terceiros },
    { nome: `FGTS (${pct(params.pFgts, 1)})`, valor: custo.fgts },
    ...(params.multaFgts ? [{ nome: "Provisão da multa de 40% do FGTS", valor: custo.multaFgts }] : []),
    { nome: "Vale-transporte pago pela empresa", valor: custo.valeTransporte, dica: custo.descontoVt > 0 ? `VT ${moeda(custo.valeTransporteBruto)} − ${moeda(custo.descontoVt)} descontados da funcionária` : undefined },
    ...(params.outros.length ? [{ nome: "Outros custos", valor: custo.outros }] : []),
    { nome: "Custo total da colaboradora no mês", valor: custo.total, forte: true },
  ];

  return (
    <div className="space-y-6" data-colab>
      <div className="bg-amber-950/30 border border-amber-800/50 text-amber-200 text-[11px] rounded-xl p-3 leading-relaxed">
        🔒 Aba visível só para o <strong>Admin Geral</strong>. O cálculo das vendas é o mesmo do “Relatório & Vendas”; aqui entra o custo da colaboradora, mês a mês.
        O custo de lives (Ads) vem da última planilha de Ads enviada, igual ao relatório.
      </div>

      {erroBanco && <div className="bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-bold rounded-xl p-3">⚠️ Não consegui ler os valores salvos: {erroBanco}</div>}

      <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 shadow-xl flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Mês de competência:</label>
          <select data-colab-mes value={mes} onChange={(e) => setMes(e.target.value)} className="bg-slate-950 border border-indigo-900/60 rounded-xl p-2.5 text-xs text-indigo-300 outline-none font-mono min-w-[150px]">
            {meses.length === 0 && <option value="">sem vendas</option>}
            {meses.map((m) => <option key={m} value={m}>{mesBR(m)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-emerald-400 uppercase mb-1">Vendedor:</label>
          <select data-colab-vendedor value={vendedor} onChange={(e) => setVendedor(e.target.value)} className="bg-slate-950 border border-emerald-900/60 rounded-xl p-2.5 text-xs text-emerald-300 outline-none font-mono min-w-[150px]">
            <option value="">Todos</option>
            {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="text-[11px] text-slate-400 ml-auto">
          {doMes.length} venda(s) em {mesBR(mes)}{vendedor ? ` de ${vendedor}` : ""} · canal {canalRegras}
          {semData > 0 && <span className="block text-amber-400">{semData} venda(s) sem data reconhecida ficam de fora.</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-colab-kpis>
        <Cartao titulo="Valor das Vendas" valor={moeda(resumo.totalVenda)} />
        <Cartao titulo={`Taxas e Tarifas (${canalRegras})`} valor={`- ${moeda(resumo.totalTarifas)}`} cor="text-rose-400" />
        {resumo.totalRebate > 0 && <Cartao titulo="Rebate dos Pedidos (TikTok)" valor={`+ ${moeda(resumo.totalRebate)}`} cor="text-emerald-400" />}
        <Cartao titulo="Total Repasse" valor={moeda(resumo.totalRepasse)} />
        <Cartao titulo="Custo Total (CMV)" valor={`- ${moeda(resumo.totalCusto)}`} cor="text-rose-400" />
        <Cartao titulo={`Impostos (${percentualImposto}%)`} valor={`- ${moeda(resumo.totalImposto)}`} cor="text-amber-400" />
        <Cartao titulo={`Comissão Vend. (${percentualComissao}%)`} valor={`- ${moeda(resumo.totalComissaoVendedora)}`} cor="text-indigo-400" />
        <Cartao titulo="Custo de Lives" valor={`- ${moeda(custoLives)}`} cor="text-cyan-400" />
        <Cartao titulo="ROI Médio" valor={`${roiMedio.toFixed(2)}x`} cor="text-indigo-300" />
        <div data-colab-liquidez-relatorio><Cartao titulo="Liquidez do relatório" valor={moeda(final.liquidezRelatorio)} cor="text-emerald-400" detalhe="após custo das lives, antes da colaboradora" destaque /></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ENTRADAS */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800/80 shadow-xl space-y-5" data-colab-entradas>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">✍️ Valores de {mesBR(mes)}</h3>
            {origem.tipo === "herdado" && <p data-colab-herdado className="text-[11px] text-amber-300 mt-1">Ainda não salvos neste mês: comecei com os de {mesBR(origem.deMes || "")}. Ajuste e salve para fixar.</p>}
            {origem.tipo === "salvo" && <p className="text-[11px] text-emerald-400 mt-1">Valores salvos para este mês.</p>}
            {origem.tipo === "padrao" && <p className="text-[11px] text-slate-400 mt-1">Nenhum valor salvo ainda. Preencha e salve.</p>}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Data de registro (admissão):</label>
            <input type="date" data-colab-admissao value={admissao} onChange={(e) => { setAdmissao(e.target.value); setMsg(""); }}
              className="bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono font-bold outline-none focus:border-indigo-500" />
            <p className="text-[10px] mt-1 text-slate-500" data-colab-vinculo>
              {vinc.semData ? "Sem data de registro: considero o mês inteiro. Informe a data para o cálculo proporcional e o dia a dia."
                : vinc.diasVinculo === 0 ? `Ela só foi registrada em ${dataBR(admissao)}: sem custo em ${mesBR(mes)}.`
                : `Registrada em ${dataBR(admissao)}: ${vinc.diasVinculo} de ${vinc.diasMes} dias de ${mesBR(mes)} (${pct(vinc.fator * 100, 1)} do mês). Vale para todos os meses.`}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Salário bruto mensal (R$):</label>
              <CampoNumero dado="salario" valor={params.salario} onChange={(n) => mudar({ salario: n })} />
              <p className="text-[10px] text-slate-500 mt-1">Valor cheio do mês: o sistema proporcionaliza pela data de registro.</p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Vale-transporte do mês (R$):</label>
              <CampoNumero dado="vt" valor={params.valeTransporte} onChange={(n) => mudar({ valeTransporte: n })} />
              <p className="text-[10px] text-slate-500 mt-1">Valor total do VT do mês, antes do desconto da funcionária.</p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Desconto do VT na funcionária:</label>
              <CampoNumero dado="desconto-vt" valor={params.descontoVtPct} onChange={(n) => mudar({ descontoVtPct: Math.min(100, Math.max(0, n)) })} sufixo="% do salário" />
              <p className="text-[10px] text-slate-500 mt-1">Ela paga até 6% do salário do próprio VT; a empresa arca com o resto. Use 0 para a empresa pagar tudo.</p>
            </div>
          </div>
          {custo.valeTransporteBruto > 0 && (
            <p data-colab-vt-resumo className="text-[11px] text-slate-300 -mt-2">
              VT do mês <strong className="text-slate-100">{moeda(custo.valeTransporteBruto)}</strong> − desconto da funcionária ({pct(params.descontoVtPct, 1)} do salário = <strong className="text-slate-100">{moeda(custo.descontoVt)}</strong>)
              {" "}= a empresa paga <strong className="text-emerald-300">{moeda(custo.valeTransporte)}</strong>.
            </p>
          )}

          <div>
            <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Encargos sobre a folha (imposto pago ao governo):</label>
            <select data-colab-regime value={params.regime} onChange={(e) => { setParams((p) => aplicarRegime(p, e.target.value as RegimeEncargos)); setMsg(""); }}
              className="w-full bg-slate-900 border border-amber-600/50 rounded-xl p-2.5 text-xs text-amber-200 font-bold outline-none">
              {REGIMES.map((r) => <option key={r.valor} value={r.valor}>{r.nome}</option>)}
            </select>
            <p className="text-[10px] text-slate-500 mt-1">{REGIMES.find((r) => r.valor === params.regime)?.dica}. Os encargos incidem sobre salário + 13º + férias + 1/3.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              {([["pInss", "INSS patronal"], ["pRat", "RAT/SAT"], ["pTerceiros", "Terceiros"], ["pFgts", "FGTS"]] as const).map(([k, nome]) => (
                <div key={k}>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{nome}</label>
                  <CampoNumero dado={k} valor={params[k]} sufixo="%" onChange={(n) => setParams((p) => ({ ...p, [k]: n, regime: "personalizado" }))} />
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-300 cursor-pointer mt-3">
              <input type="checkbox" data-colab-multa checked={params.multaFgts} onChange={(e) => mudar({ multaFgts: e.target.checked })} className="accent-indigo-500" />
              Provisionar a multa de 40% do FGTS (demissão sem justa causa)
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-bold text-cyan-400 uppercase">Outros custos do mês (vale-refeição, plano de saúde…):</label>
              <button type="button" data-colab-outro-add onClick={() => mudar({ outros: [...params.outros, { nome: "", valor: 0 }] })} className="text-[11px] font-bold text-cyan-300 hover:text-white cursor-pointer">+ adicionar</button>
            </div>
            {params.outros.length === 0 && <p className="text-[11px] text-slate-500">Nenhum outro custo.</p>}
            <div className="space-y-2">
              {params.outros.map((o, i) => (
                <div key={i} className="flex items-center gap-2" data-colab-outro>
                  <input type="text" value={o.nome} placeholder="Descrição" data-colab-outro-nome onChange={(e) => mudar({ outros: params.outros.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) })}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-500" />
                  <CampoNumero dado={`outro-${i}`} valor={o.valor} largura="w-36" onChange={(n) => mudar({ outros: params.outros.map((x, j) => (j === i ? { ...x, valor: n } : x)) })} />
                  <button type="button" aria-label="Remover" onClick={() => mudar({ outros: params.outros.filter((_, j) => j !== i) })} className="text-rose-400 hover:text-rose-300 text-sm font-bold cursor-pointer px-1">✕</button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="button" data-colab-salvar onClick={salvar} disabled={!mes} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold py-2.5 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer">Salvar para {mesBR(mes)}</button>
            {origem.tipo === "salvo" && <button type="button" data-colab-apagar onClick={apagar} className="text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer">Apagar deste mês</button>}
            {sujo && !msg && <span className="text-[11px] text-amber-300">alterações ainda não salvas</span>}
            {msg && <span data-colab-msg className="text-[11px] text-slate-300">{msg}</span>}
          </div>
        </div>

        {/* DETALHAMENTO */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800/80 shadow-xl" data-colab-detalhe>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">🧾 Custo mensal da colaboradora</h3>
          <table className="w-full text-xs">
            <tbody>
              {linhasDetalhe.map((l) => (
                <tr key={l.nome} className={l.forte ? "border-t border-slate-700" : "border-b border-slate-800/60"} title={l.dica}>
                  <td className={`py-2 pr-3 ${l.forte ? "font-black text-white" : "text-slate-300"}`}>{l.nome}</td>
                  <td className={`py-2 text-right font-mono ${l.forte ? "font-black text-rose-300" : "text-slate-200"}`}>{moeda(l.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {params.outros.length > 0 && (
            <ul className="mt-2 text-[10px] text-slate-500 space-y-0.5">
              {params.outros.map((o, i) => <li key={i}>• {o.nome || "sem descrição"}: {moeda(o.valor)}</li>)}
            </ul>
          )}
          <p className="text-[11px] text-slate-400 mt-3">
            {custo.salario > 0 ? <>Cada R$ 1,00 de salário custa <strong className="text-white">R$ {(custo.total / custo.salario).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> para a empresa ({pct(custo.acimaDoSalarioPct, 1)} acima do salário).</> : "Informe o salário base para ver o custo total."}
          </p>
          <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
            13º e férias entram como provisão mensal (1/12 cada) e o 1/3 de férias é 1/3 da provisão das férias. Não inclui aviso prévio nem rescisão, além da multa do FGTS quando marcada.
            É uma estimativa gerencial: confira os percentuais com o contador.
          </p>
        </div>
      </div>

      {/* RESULTADO */}
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-emerald-900/50 shadow-xl" data-colab-resultado>
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">📉 Margem líquida de {mesBR(mes)} com a colaboradora (mês inteiro)</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Cartao titulo="Liquidez do relatório" valor={moeda(final.liquidezRelatorio)} cor="text-emerald-400" detalhe="após custo das lives" />
          <Cartao titulo="Custo da colaboradora" valor={`- ${moeda(final.custoColaboradora)}`} cor="text-rose-400" detalhe="salário, 13º, férias, encargos, VT e outros" />
          <div data-colab-liquidez-final><Cartao titulo="Liquidez final" valor={moeda(final.liquidezFinal)} cor={final.liquidezFinal < 0 ? "text-rose-400" : "text-emerald-400"} detalhe="o que sobra depois de pagar a colaboradora" destaque /></div>
          <div data-colab-pct-pdv><Cartao titulo="% Lucro sobre PDV" valor={pct(final.margemSobrePdv)} cor={final.margemSobrePdv < 0 ? "text-rose-400" : "text-cyan-400"} detalhe={`antes da colaboradora: ${pct(resumo.mediaLucroPdvGeral)}`} /></div>
          <Cartao titulo="% sobre o valor das vendas" valor={pct(final.margemSobreVendas)} cor={final.margemSobreVendas < 0 ? "text-rose-400" : "text-cyan-400"} />
        </div>
        {serie.projecaoFechamento !== null && (
          <p className="text-[11px] text-amber-300/90 mt-3" data-colab-mes-aberto>
            {mesBR(mes)} ainda não terminou: aqui as vendas são só as de agora e o custo é o do mês inteiro, por isso este número é menor que o acumulado até hoje do gráfico abaixo.
          </p>
        )}
        <p className="text-[11px] text-slate-400 mt-4" data-colab-vendamin>
          {final.vendaMinima === null
            ? "Com a margem das vendas deste mês não há venda que cubra o custo de lives e da colaboradora."
            : <>Para cobrir o custo de lives e da colaboradora com a margem deste mês, o mês precisa vender pelo menos <strong className="text-white">{moeda(final.vendaMinima)}</strong> {resumo.totalVenda >= final.vendaMinima ? "(já atingido)" : `(faltam ${moeda(final.vendaMinima - resumo.totalVenda)})`}.</>}
        </p>
      </div>

      {/* PONTO DE EQUILÍBRIO DIA A DIA */}
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-indigo-900/50 shadow-xl space-y-5" data-colab-equilibrio>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">⚖️ Ponto de equilíbrio dia a dia — {mesBR(mes)}</h3>
            <p className="text-[11px] text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Cada dia trabalhado soma a liquidez das vendas e desconta o custo da colaboradora; sábado e domingo são folga e ficam fora da conta
              {vinc.diasVinculo > 0 && serie.diasTrabalhadosVinculo > 0 ? <> (<strong className="text-slate-200">{moeda(custo.total)}</strong> ÷ {serie.diasTrabalhadosVinculo} dias trabalhados no vínculo = <strong className="text-slate-200">{moeda(serie.custoColabPorDia)}</strong> por dia)</> : null}.
              O acumulado do mês mostra o dia a partir do qual as lives passaram a dar lucro.
            </p>
          </div>
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-300 cursor-pointer" title="O custo de lives vem da planilha de Ads, sem datas: aqui ele é dividido igualmente pelos dias trabalhados do mês (sábado e domingo não entram)">
            <input type="checkbox" data-colab-incluir-ads checked={incluirAds} onChange={(e) => setIncluirAds(e.target.checked)} className="accent-indigo-500" />
            Incluir o custo de lives (Ads), dividido por dia trabalhado
          </label>
        </div>

        {serie.dias.length === 0 ? (
          <p className="text-xs text-slate-400">{vinc.diasMes === 0 ? "Escolha um mês." : `${mesBR(mes)} ainda não começou.`}</p>
        ) : (
          <>
            <div className={`rounded-xl border p-4 text-sm font-semibold ${serie.equilibrio ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-200" : "border-amber-800/60 bg-amber-950/30 text-amber-200"}`} data-colab-veredito>
              {serie.equilibrio
                ? (serie.equilibrio.desdeOInicio
                  ? <>✅ O acumulado de {mesBR(mes)} não ficou negativo em nenhum dia: as lives cobriram o custo desde o começo do mês.</>
                  : <>✅ A partir do dia {serie.equilibrio.dia} ({serie.dias[serie.equilibrio.dia - 1].diaSemana}, {dataBR(serie.equilibrio.data)}) as lives passaram a dar lucro: o acumulado do mês cobriu o custo da colaboradora e se manteve positivo.</>)
                : <>⏳ As lives ainda não cobriram o custo em {mesBR(mes)}: faltam <strong>{moeda(serie.faltaParaEquilibrar)}</strong> de liquidez{margemMes > 0 ? <> (cerca de <strong>{moeda(serie.faltaParaEquilibrar / margemMes)}</strong> em vendas, com a margem do mês)</> : null}.</>}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-colab-equilibrio-kpis>
              <Cartao titulo="Dia do equilíbrio" valor={serie.equilibrio ? `Dia ${serie.equilibrio.dia}` : "ainda não"} cor={serie.equilibrio ? "text-emerald-400" : "text-amber-300"}
                detalhe={serie.equilibrio ? (serie.equilibrio.desdeOInicio ? "sem dia negativo no acumulado" : `${serie.dias[serie.equilibrio.dia - 1].diaSemana}, ${dataBR(serie.equilibrio.data)}`) : `faltam ${moeda(serie.faltaParaEquilibrar)}`} />
              <Cartao titulo={`Acumulado até ${dataBR(serie.ultimoDia || "")}`} valor={moeda(serie.acumuladoFinal)} cor={serie.acumuladoFinal < 0 ? "text-rose-400" : "text-emerald-400"}
                detalhe={`liquidez ${moeda(serie.liquidezAcumulada)} − colaboradora ${moeda(serie.custoColabAcumulado)}${incluirAds ? ` − lives ${moeda(serie.custoAdsAcumulado)}` : ""}`} />
              <Cartao titulo="Dias no lucro / no prejuízo" valor={`${serie.diasLucro} / ${serie.diasPrejuizo}`} detalhe={`${serie.diasSemVenda} dia(s) útil(eis) sem venda · ${serie.diasDeFolga} dia(s) de folga (sáb/dom) fora da conta`} />
              <Cartao titulo="Melhor dia" valor={serie.melhorDia ? moeda(serie.melhorDia.resultado) : "—"} cor="text-cyan-400" detalhe={serie.melhorDia ? `dia ${serie.melhorDia.dia} (${serie.melhorDia.diaSemana})` : undefined} />
              <Cartao titulo="Pior dia" valor={serie.piorDia ? moeda(serie.piorDia.resultado) : "—"} cor={serie.piorDia && serie.piorDia.resultado < 0 ? "text-rose-400" : "text-cyan-400"} detalhe={serie.piorDia ? `dia ${serie.piorDia.dia} (${serie.piorDia.diaSemana})` : undefined} />
            </div>

            {serie.projecaoFechamento !== null && (
              <p className="text-[11px] text-slate-400" data-colab-projecao>
                Se o ritmo médio de liquidez até aqui continuar, {mesBR(mes)} fecha em <strong className={serie.projecaoFechamento < 0 ? "text-rose-300" : "text-emerald-300"}>{moeda(serie.projecaoFechamento)}</strong>
                {serie.previsao === "fora_do_mes" ? " e o acumulado não chega a empatar este mês." : serie.previsao ? <> e o acumulado empata por volta do <strong className="text-white">dia {serie.previsao.dia}</strong>.</> : "."}
                {" "}É uma estimativa: não considera sazonalidade nem a agenda de lives.
              </p>
            )}

            <GraficoEquilibrio dias={serie.dias} diasMes={vinc.diasMes} equilibrio={serie.equilibrio} inicioVinculo={vinc.inicio ? Number(vinc.inicio.slice(8, 10)) : null} />

            <details open className="group" data-colab-tabela-dias>
              <summary className="text-[11px] font-bold text-slate-300 cursor-pointer select-none">Tabela dia a dia</summary>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs text-left whitespace-nowrap">
                  <thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-800">
                    <th className="py-2 pr-3">Dia</th><th className="py-2 pr-3 text-right">Vendas</th><th className="py-2 pr-3 text-right">Liquidez</th><th className="py-2 pr-3 text-right">Colaboradora</th>
                    {incluirAds && <th className="py-2 pr-3 text-right">Lives (Ads)</th>}<th className="py-2 pr-3 text-right">Resultado do dia</th><th className="py-2 text-right">Acumulado</th>
                  </tr></thead>
                  <tbody>
                    {serie.dias.map((d) => {
                      const eq = serie.equilibrio?.dia === d.dia;
                      return (
                        <tr key={d.data} data-dia-linha={d.dia} data-equilibrio={eq ? "1" : "0"} data-folga={d.trabalhado ? "0" : "1"} className={`border-b border-slate-800/60 ${eq ? "bg-emerald-950/40" : ""} ${d.trabalhado ? "" : "opacity-50"}`}>
                          <td className="py-1.5 pr-3 font-mono text-slate-300">{String(d.dia).padStart(2, "0")}/{mes.slice(5, 7)} <span className="text-slate-500">{d.diaSemana}</span>{eq && <span className="ml-2 text-[9px] font-bold text-emerald-300 border border-emerald-700 rounded px-1">equilíbrio</span>}</td>
                          <td className="py-1.5 pr-3 text-right text-slate-200">{d.temVenda ? `${moeda(d.vendas)} (${d.pedidos})` : <span className="text-slate-500">{d.trabalhado ? "sem vendas" : "folga"}</span>}</td>
                          <td className="py-1.5 pr-3 text-right text-slate-200">{moeda(d.liquidez)}</td>
                          <td className="py-1.5 pr-3 text-right text-slate-300">{d.vinculada && d.trabalhado ? `- ${moeda(d.custoColab)}` : <span className="text-slate-600">—</span>}</td>
                          {incluirAds && <td className="py-1.5 pr-3 text-right text-slate-300">{d.trabalhado ? `- ${moeda(d.custoAds)}` : <span className="text-slate-600">—</span>}</td>}
                          <td className={`py-1.5 pr-3 text-right font-bold ${!d.trabalhado ? "text-slate-500" : d.resultado < 0 ? "text-rose-400" : "text-emerald-400"}`}>{d.trabalhado ? moeda(d.resultado) : "—"}</td>
                          <td className={`py-1.5 text-right font-black ${d.acumulado < 0 ? "text-rose-400" : "text-emerald-400"}`}>{moeda(d.acumulado)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
