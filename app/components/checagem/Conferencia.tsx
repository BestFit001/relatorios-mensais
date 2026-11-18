"use client";
// Checagem de Cancelados > Conferência: sobe os cancelados e as notas (NF-e) de meses que não estão na base de Faturados,
// guarda tudo numa base SEPARADA (nada entra em faturados, então dashboards e totais não mudam) e cruza pelo número do pedido.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../../lib/supabase";
import { buscarTudo } from "../../../lib/buscarTudo";
import { indiceDaLetra } from "../../../lib/cobertura";
import { lerArquivoComoLinhas } from "../../../lib/lerArquivo";
import { achar, chaveDoPedido, interpretarTermo } from "../../../lib/checagemCanceladosLogica";
import { cruzar, lerNotas, type NotaGuardada } from "../../../lib/conferenciaCanceladosLogica";

const CHAVE_CANC = "bestfit_conferencia_cancelados_form";
const CHAVE_NOTAS = "bestfit_conferencia_notas_form";
const LIMITE_TELA = 200;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const campo = "w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-indigo-500";
const arquivoCls = "block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-indigo-600 file:text-white file:font-bold file:cursor-pointer cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700";

interface FormCanc { linha: string; colPedido: string; colStatus: string; termo: string }
const FORM_CANC: FormCanc = { linha: "2", colPedido: "A", colStatus: "B", termo: "cancelado" };
interface FormNotas { linha: string; colPedido: string; colNf: string; colComprador: string; colValor: string; periodo: string }
const FORM_NOTAS: FormNotas = { linha: "2", colPedido: "AI", colNf: "", colComprador: "", colValor: "", periodo: "" };
type Aviso = { tipo: "ok" | "erro" | "info"; linhas: string[] } | null;

const lerJson = <T,>(chave: string, padrao: T): T => { try { return { ...padrao, ...JSON.parse(localStorage.getItem(chave) || "{}") }; } catch { return padrao; } };
const guardar = (chave: string, v: unknown) => { try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* sem localStorage: só não lembra */ } };

export default function Conferencia({ canais }: { canais: string[] }) {
  const [cancelados, setCancelados] = useState<any[]>([]);
  const [notas, setNotas] = useState<Map<string, NotaGuardada>>(new Map());
  const [totalNotas, setTotalNotas] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState<"" | "cancelados" | "notas">("");
  const [aviso, setAviso] = useState<Aviso>(null);

  const [canal, setCanal] = useState("");
  const [formsCanc, setFormsCanc] = useState<Record<string, FormCanc>>({});
  const [formCanc, setFormCanc] = useState<FormCanc>(FORM_CANC);
  const [formNotas, setFormNotas] = useState<FormNotas>(FORM_NOTAS);

  const [filtroCanal, setFiltroCanal] = useState("");
  const [situacao, setSituacao] = useState<"todos" | "com" | "sem">("todos");
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    const canc = await buscarTudo("conferencia_cancelados", "*");
    const { count } = await supabase.from("conferencia_notas").select("id", { count: "exact", head: true });
    // só busca as notas dos pedidos cancelados (a base de notas pode ter dezenas de milhares de linhas)
    const chaves = Array.from(new Set(canc.map((c: any) => String(c.chave))));
    const mapa = new Map<string, NotaGuardada>();
    const pedacos: string[][] = [];
    for (let i = 0; i < chaves.length; i += 150) pedacos.push(chaves.slice(i, i + 150));
    for (let i = 0; i < pedacos.length; i += 6) {
      const respostas = await Promise.all(pedacos.slice(i, i + 6).map((p) => supabase.from("conferencia_notas").select("chave,nf_e,comprador,valor_pedido,periodo,arquivo").in("chave", p)));
      for (const r of respostas) {
        if (r.error) throw new Error(r.error.message);
        (r.data || []).forEach((n: any) => mapa.set(String(n.chave), n));
      }
    }
    setCancelados(canc); setTotalNotas(count ?? 0); setNotas(mapa);   // tudo junto, para a tela nunca mostrar números pela metade
    setCarregando(false);
  }, []);

  useEffect(() => {
    setFormsCanc(lerJson<Record<string, FormCanc>>(CHAVE_CANC, {}));
    setFormNotas(lerJson<FormNotas>(CHAVE_NOTAS, FORM_NOTAS));
    carregar().catch((e) => { setCarregando(false); setAviso({ tipo: "erro", linhas: ["Não consegui carregar a conferência: " + (e?.message || e)] }); });
  }, [carregar]);
  useEffect(() => { if (!canal && canais.length) setCanal(canais[0]); }, [canais, canal]);
  useEffect(() => { if (canal) setFormCanc(formsCanc[canal] || FORM_CANC); }, [canal, formsCanc]);

  // ---- 1) cancelados ----
  const subirCancelados = async (arquivos: File[]) => {
    if (arquivos.length === 0) return;
    const iPed = indiceDaLetra(formCanc.colPedido), iSta = indiceDaLetra(formCanc.colStatus);
    const linhaInicial = parseInt(formCanc.linha, 10);
    const termo = formCanc.termo.trim();
    if (!canal) return setAviso({ tipo: "erro", linhas: ["Escolha o canal."] });
    if (iPed < 0 || iSta < 0) return setAviso({ tipo: "erro", linhas: ["Informe as letras das colunas do pedido e do status (ex.: A, B, AD)."] });
    if (!(linhaInicial >= 1)) return setAviso({ tipo: "erro", linhas: ["A linha inicial deve ser 1 ou mais (use 2 se a primeira linha for o cabeçalho)."] });
    if (interpretarTermo(termo).length === 0) return setAviso({ tipo: "erro", linhas: ["Escreva as palavras que devem constar no status (ex.: cancelado)."] });
    setProcessando("cancelados"); setAviso(null);
    const novas = { ...formsCanc, [canal]: formCanc }; setFormsCanc(novas); guardar(CHAVE_CANC, novas);
    try {
      const ja = new Set(cancelados.filter((c) => c.canal === canal).map((c) => String(c.chave)));
      const saida: string[] = []; let achados = 0, novos = 0;
      for (const arquivo of arquivos) {
        const linhas = await lerArquivoComoLinhas(arquivo);
        const r = achar(linhas, { linhaInicial, colPedido: iPed, colStatus: iSta, termo });
        const lote = r.achados.map((a) => ({ canal, id_pedido: a.idPedido, chave: chaveDoPedido(a.idPedido), status_planilha: a.status, termo, arquivo: arquivo.name })).filter((l) => l.chave);
        for (let i = 0; i < lote.length; i += 500) {
          const { error } = await supabase.from("conferencia_cancelados").upsert(lote.slice(i, i + 500), { onConflict: "canal,chave" });
          if (error) throw new Error(error.message);
        }
        const n = lote.filter((l) => !ja.has(l.chave)).length;
        lote.forEach((l) => ja.add(l.chave));
        achados += lote.length; novos += n;
        saida.push(`${arquivo.name}: ${r.lidas} linha(s) lida(s), ${lote.length} pedido(s) com “${termo}” no status (${n} novo(s)).`);
        if (lote.length === 0) {
          const ex = Array.from(new Set(linhas.slice(Math.max(0, linhaInicial - 1), linhaInicial + 199).map((l) => String(l[iSta] ?? "").trim()).filter(Boolean))).slice(0, 5);
          saida.push(ex.length ? `Nada encontrado. Status lidos na coluna ${formCanc.colStatus.toUpperCase()}: ${ex.map((e) => `“${e}”`).join(", ")}. Confira a coluna e as palavras.` : `Nada encontrado e a coluna ${formCanc.colStatus.toUpperCase()} está vazia a partir da linha ${linhaInicial}.`);
        }
      }
      setAviso({ tipo: achados ? "ok" : "info", linhas: [`${canal}: ${achados} cancelado(s) guardado(s) na conferência (${novos} novo(s)).`, ...saida] });
      await carregar();
    } catch (e: any) { setAviso({ tipo: "erro", linhas: ["Erro ao processar a planilha: " + (e?.message || e)] }); }
    setProcessando("");
  };

  // ---- 2) notas ----
  const subirNotas = async (arquivos: File[]) => {
    if (arquivos.length === 0) return;
    const f = formNotas;
    const iPed = indiceDaLetra(f.colPedido);
    const iNf = f.colNf.trim() ? indiceDaLetra(f.colNf) : -1, iNome = f.colComprador.trim() ? indiceDaLetra(f.colComprador) : -1, iValor = f.colValor.trim() ? indiceDaLetra(f.colValor) : -1;
    const linhaInicial = parseInt(f.linha, 10);
    if (iPed < 0) return setAviso({ tipo: "erro", linhas: ["Informe a letra da coluna de onde sai o número do pedido (ex.: AI)."] });
    if ((f.colNf.trim() && iNf < 0) || (f.colComprador.trim() && iNome < 0) || (f.colValor.trim() && iValor < 0)) return setAviso({ tipo: "erro", linhas: ["Alguma letra de coluna está inválida. Use só letras (ex.: A, B, AD)."] });
    if (iNf < 0 && iNome < 0 && iValor < 0) return setAviso({ tipo: "erro", linhas: ["Informe pelo menos uma coluna para guardar (NF-e, nome do comprador ou valor do pedido)."] });
    if (!(linhaInicial >= 1)) return setAviso({ tipo: "erro", linhas: ["A linha inicial deve ser 1 ou mais (use 2 se a primeira linha for o cabeçalho)."] });
    setProcessando("notas"); setAviso(null); guardar(CHAVE_NOTAS, f);
    try {
      const saida: string[] = []; let guardadas = 0;
      for (const arquivo of arquivos) {
        const linhas = await lerArquivoComoLinhas(arquivo);
        const r = lerNotas(linhas, { linhaInicial, colPedido: iPed, colNf: iNf, colComprador: iNome, colValor: iValor });
        const periodo = f.periodo.trim() || arquivo.name.replace(/\.[^.]+$/, "");
        const lote = Array.from(r.notas.values()).map((n) => ({
          chave: n.chave, id_pedido: n.id_pedido, periodo, arquivo: arquivo.name,
          ...(iNf >= 0 ? { nf_e: n.nf_e || null } : {}), ...(iNome >= 0 ? { comprador: n.comprador || null } : {}), ...(iValor >= 0 ? { valor_pedido: n.valor_pedido } : {}),
        }));
        for (let i = 0; i < lote.length; i += 500) {
          const { error } = await supabase.from("conferencia_notas").upsert(lote.slice(i, i + 500), { onConflict: "chave" });
          if (error) throw new Error(error.message);
        }
        guardadas += lote.length;
        let l = `${arquivo.name}: ${r.lidas} linha(s) lida(s), ${lote.length} nota(s) guardada(s) (período “${periodo}”).`;
        if (r.semPedido) l += ` ${r.semPedido} linha(s) sem número de pedido reconhecido.`;
        if (r.repetidos) l += ` ${r.repetidos} pedido(s) em mais de uma linha: guardei a primeira.`;
        saida.push(l);
      }
      await carregar();
      setAviso({ tipo: guardadas ? "ok" : "info", linhas: [`${guardadas} nota(s) guardada(s) na conferência. Não foram para Faturados.`, ...saida] });
    } catch (e: any) { setAviso({ tipo: "erro", linhas: ["Erro ao processar a planilha: " + (e?.message || e)] }); }
    setProcessando("");
  };

  // ---- resultado ----
  const cruzado = useMemo(() => cruzar(cancelados.map((c) => ({ ...c, chave: String(c.chave) })), notas), [cancelados, notas]);
  const base = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return cruzado.linhas.filter((l) => (!filtroCanal || l.canal === filtroCanal) && (situacao === "todos" || (situacao === "com" ? !!l.nota : !l.nota))
      && (!t || [l.id_pedido, l.nota?.nf_e, l.nota?.comprador, l.status_planilha].some((v) => String(v ?? "").toLowerCase().includes(t))));
  }, [cruzado, filtroCanal, situacao, busca]);
  const totalVisivel = useMemo(() => base.reduce((a, l) => a + (Number(l.nota?.valor_pedido) || 0), 0), [base]);
  const porCanal = useMemo(() => {
    const m = new Map<string, { n: number; com: number; v: number }>();
    cruzado.linhas.forEach((l) => { const x = m.get(l.canal) || { n: 0, com: 0, v: 0 }; x.n++; if (l.nota) { x.com++; x.v += Number(l.nota.valor_pedido) || 0; } m.set(l.canal, x); });
    return Array.from(m.entries());
  }, [cruzado]);

  const baixar = () => {
    if (base.length === 0) return;
    const dados = base.map((l) => ({
      "Canal": l.canal, "ID do pedido": String(l.id_pedido), "Situação": l.nota ? "Com nota" : "Sem nota",
      "NF-e": l.nota?.nf_e ?? "", "Nome do comprador": l.nota?.comprador ?? "",
      "Valor do pedido": l.nota?.valor_pedido === null || l.nota?.valor_pedido === undefined ? "" : Number(l.nota.valor_pedido),
      "Período da nota": l.nota?.periodo ?? "", "Status na planilha": l.status_planilha ?? "", "Arquivo dos cancelados": l.arquivo ?? "", "Arquivo das notas": l.nota?.arquivo ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    dados.forEach((d, i) => {   // ID e NF-e como texto, para o Excel não virar notação científica
      const b = ws["B" + (i + 2)]; if (b) { b.t = "s"; b.v = String(d["ID do pedido"]); }
      const nf = ws["D" + (i + 2)]; if (nf && d["NF-e"] !== "") { nf.t = "s"; nf.v = String(d["NF-e"]); }
      const v = ws["F" + (i + 2)]; if (v && typeof v.v === "number") v.z = '"R$" #,##0.00';
    });
    const n = dados.length + 2;
    ws["E" + n] = { t: "s", v: "TOTAL" }; ws["F" + n] = { t: "n", v: totalVisivel, z: '"R$" #,##0.00' };
    ws["!ref"] = `A1:J${n}`;
    ws["!cols"] = [{ wch: 18 }, { wch: 24 }, { wch: 11 }, { wch: 16 }, { wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 30 }, { wch: 26 }, { wch: 26 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Conferência");
    XLSX.writeFile(wb, `conferencia_cancelados${filtroCanal ? "_" + filtroCanal.replace(/[^a-zA-Z0-9]+/g, "-") : ""}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const limpar = async (o: "cancelados" | "notas") => {
    const qtd = o === "cancelados" ? cancelados.length : totalNotas;
    if (qtd === 0) return;
    if (!confirm(o === "cancelados" ? `Apagar os ${qtd} cancelados guardados na conferência? (as notas guardadas ficam)` : `Apagar as ${qtd} notas guardadas na conferência? (os cancelados ficam)`)) return;
    const { error } = await supabase.from(o === "cancelados" ? "conferencia_cancelados" : "conferencia_notas").delete().neq("id", 0);
    if (error) return setAviso({ tipo: "erro", linhas: ["Não consegui apagar: " + error.message] });
    setAviso({ tipo: "ok", linhas: [o === "cancelados" ? "🗑️ Cancelados da conferência apagados." : "🗑️ Notas da conferência apagadas."] });
    setFiltroCanal(""); await carregar();
  };

  return (
    <div className="space-y-6" data-conferencia>
      <div className="p-4 rounded-xl border border-indigo-900/50 bg-indigo-950/30 text-xs text-indigo-200" data-conferencia-info>
        <strong className="text-white">Conferência de meses antigos.</strong> Suba aqui os cancelados e as notas (NF-e) de meses que não estão na base de Faturados. Tudo fica guardado numa base separada, <strong className="text-white">não entra em Faturados</strong> e não altera dashboards, rankings nem totais. Pode voltar depois: o que foi subido continua aqui até você apagar.
      </div>

      {aviso && (
        <div data-conf-aviso className={`p-4 rounded-xl border text-sm font-semibold flex items-start justify-between gap-3 ${aviso.tipo === "erro" ? "border-rose-900/60 bg-rose-950/40 text-rose-300" : aviso.tipo === "ok" ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-300" : "border-amber-900/60 bg-amber-950/40 text-amber-300"}`}>
          <div className="space-y-1">{aviso.linhas.map((l, i) => <p key={i} className={i === 0 ? "" : "text-xs font-medium opacity-90"}>{l}</p>)}</div>
          <button type="button" onClick={() => setAviso(null)} className="text-xs opacity-70 hover:opacity-100 cursor-pointer">✕</button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4" data-conf-cancelados>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider">1. Pedidos cancelados <span className="text-slate-400 font-mono" data-conf-qtd-canc>({cancelados.length} guardados)</span></h2>
            <p className="text-[11px] text-slate-400 mt-1">Planilha do canal: indique as colunas do pedido e do status e as palavras que precisam constar (ex.: “cancelado”; use “;” para várias).</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <div className="col-span-2 md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Canal</label>
              <select value={canal} onChange={(e) => setCanal(e.target.value)} data-conf-canal className={campo + " cursor-pointer font-bold"}>{canais.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            </div>
            <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Linha inicial</label>
              <input type="number" min={1} value={formCanc.linha} onChange={(e) => setFormCanc({ ...formCanc, linha: e.target.value })} data-conf-linha className={campo + " font-mono"} /></div>
            <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. pedido</label>
              <input type="text" maxLength={3} value={formCanc.colPedido} onChange={(e) => setFormCanc({ ...formCanc, colPedido: e.target.value.toUpperCase() })} data-conf-col-pedido className={campo + " font-mono text-center font-bold"} /></div>
            <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. status</label>
              <input type="text" maxLength={3} value={formCanc.colStatus} onChange={(e) => setFormCanc({ ...formCanc, colStatus: e.target.value.toUpperCase() })} data-conf-col-status className={campo + " font-mono text-center font-bold"} /></div>
            <div className="col-span-2 md:col-span-5"><label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Palavras no status</label>
              <input type="text" value={formCanc.termo} onChange={(e) => setFormCanc({ ...formCanc, termo: e.target.value })} data-conf-termo className={campo + " font-bold"} /></div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Planilha(s) do canal (xlsx, xls, csv) — pode escolher várias</label>
            <input type="file" multiple accept=".xlsx,.xls,.csv" disabled={!!processando || carregando || !canal} data-conf-upload-cancelados
              onChange={(e) => { const a = Array.from(e.target.files || []); e.target.value = ""; subirCancelados(a); }} className={arquivoCls} />
            {processando === "cancelados" && <p className="text-xs text-slate-400 mt-2">Lendo a planilha e guardando os cancelados…</p>}
          </div>
        </div>

        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4" data-conf-notas>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider">2. Notas (NF-e de saída) <span className="text-slate-400 font-mono" data-conf-qtd-notas>({totalNotas} guardadas)</span></h2>
            <p className="text-[11px] text-slate-400 mt-1">Mesma planilha usada em Faturados. O número do pedido é lido da coluna indicada (dentro do texto da observação). Deixe em branco o que não quiser guardar.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Linha inicial</label>
              <input type="number" min={1} value={formNotas.linha} onChange={(e) => setFormNotas({ ...formNotas, linha: e.target.value })} data-conf-n-linha className={campo + " font-mono"} /></div>
            <div><label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Col. nº pedido</label>
              <input type="text" maxLength={3} value={formNotas.colPedido} onChange={(e) => setFormNotas({ ...formNotas, colPedido: e.target.value.toUpperCase() })} data-conf-n-col-pedido className={campo + " font-mono text-center font-bold"} /></div>
            <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. NF-e</label>
              <input type="text" maxLength={3} value={formNotas.colNf} onChange={(e) => setFormNotas({ ...formNotas, colNf: e.target.value.toUpperCase() })} data-conf-n-col-nf className={campo + " font-mono text-center font-bold"} /></div>
            <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. comprador</label>
              <input type="text" maxLength={3} value={formNotas.colComprador} onChange={(e) => setFormNotas({ ...formNotas, colComprador: e.target.value.toUpperCase() })} data-conf-n-col-comprador className={campo + " font-mono text-center font-bold"} /></div>
            <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. valor</label>
              <input type="text" maxLength={3} value={formNotas.colValor} onChange={(e) => setFormNotas({ ...formNotas, colValor: e.target.value.toUpperCase() })} data-conf-n-col-valor className={campo + " font-mono text-center font-bold"} /></div>
            <div className="col-span-2 md:col-span-5"><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Período desta(s) planilha(s) (opcional, ex.: Ago/2026; se vazio usa o nome do arquivo)</label>
              <input type="text" value={formNotas.periodo} onChange={(e) => setFormNotas({ ...formNotas, periodo: e.target.value })} data-conf-n-periodo maxLength={40} className={campo} /></div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Planilha(s) de notas (xlsx, xls, csv) — pode escolher várias</label>
            <input type="file" multiple accept=".xlsx,.xls,.csv,.txt" disabled={!!processando || carregando} data-conf-upload-notas
              onChange={(e) => { const a = Array.from(e.target.files || []); e.target.value = ""; subirNotas(a); }} className={arquivoCls} />
            {processando === "notas" && <p className="text-xs text-slate-400 mt-2">Lendo a planilha e guardando as notas…</p>}
          </div>
        </div>
      </div>

      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4" data-conf-resultado>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider">Conferência <span className="text-slate-400 font-mono" data-conf-total>({base.length})</span></h2>
            <p className="text-sm font-black text-rose-400 mt-1" data-conf-valor>{brl(totalVisivel)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5" data-conf-resumo>
              <strong className="text-emerald-400">{cruzado.comNota} com nota</strong> · <strong className="text-amber-400">{cruzado.semNota} sem nota</strong> (de {cancelados.length} cancelados guardados). “Sem nota” = o pedido não apareceu nas notas guardadas: suba a planilha do mês certo.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {porCanal.map(([c, x]) => (
                <button key={c} type="button" onClick={() => setFiltroCanal(filtroCanal === c ? "" : c)} data-conf-chip={c}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${filtroCanal === c ? "bg-indigo-600 text-white border-indigo-500" : "bg-slate-950 text-slate-300 border-slate-700"}`}>{c}: {x.com}/{x.n} · {brl(x.v)}</button>
              ))}
              {porCanal.length === 0 && !carregando && <span className="text-xs text-slate-500">Nada guardado ainda.</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={situacao} onChange={(e) => setSituacao(e.target.value as any)} data-conf-situacao className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white cursor-pointer">
              <option value="todos">Todos</option><option value="com">Só com nota</option><option value="sem">Só sem nota</option>
            </select>
            <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Pedido, NF-e ou comprador" data-conf-busca className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none w-60" />
            <button type="button" onClick={baixar} disabled={base.length === 0} data-conf-baixar className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase cursor-pointer shadow">⬇️ Baixar Excel ({base.length})</button>
            <button type="button" onClick={() => limpar("cancelados")} disabled={cancelados.length === 0} data-conf-limpar-cancelados className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[11px] font-bold py-2 px-3 rounded-xl cursor-pointer disabled:opacity-40">🗑️ Apagar cancelados</button>
            <button type="button" onClick={() => limpar("notas")} disabled={totalNotas === 0} data-conf-limpar-notas className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[11px] font-bold py-2 px-3 rounded-xl cursor-pointer disabled:opacity-40">🗑️ Apagar notas</button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[480px]">
          <table className="w-full text-left text-xs whitespace-nowrap" data-conf-tabela>
            <thead className="bg-slate-950 sticky top-0 text-slate-400 font-bold uppercase text-[10px]">
              <tr><th className="p-3">Canal</th><th className="p-3">ID do pedido</th><th className="p-3">Situação</th><th className="p-3">NF-e</th><th className="p-3">Comprador</th><th className="p-3 text-right">Valor do pedido</th><th className="p-3">Período</th><th className="p-3">Status na planilha</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {base.slice(0, LIMITE_TELA).map((l) => (
                <tr key={l.id} className="hover:bg-slate-800/40" data-conf-linha-pedido={l.id_pedido}>
                  <td className="p-3 font-bold text-white">{l.canal}</td>
                  <td className="p-3 font-mono text-indigo-300">{l.id_pedido}</td>
                  <td className="p-3">{l.nota ? <span className="text-emerald-400 font-bold">✔ Com nota</span> : <span className="text-amber-400 font-bold">Sem nota</span>}</td>
                  <td className="p-3 font-mono text-slate-300">{l.nota?.nf_e}</td>
                  <td className="p-3 text-slate-300">{l.nota?.comprador}</td>
                  <td className="p-3 text-right font-mono font-bold text-rose-300">{l.nota && l.nota.valor_pedido !== null && l.nota.valor_pedido !== undefined ? brl(Number(l.nota.valor_pedido)) : "—"}</td>
                  <td className="p-3 text-slate-400">{l.nota?.periodo}</td>
                  <td className="p-3 text-slate-400">{l.status_planilha}</td>
                </tr>
              ))}
              {base.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500">{carregando ? "Carregando…" : "Nada para mostrar. Suba os cancelados e as notas acima."}</td></tr>}
            </tbody>
          </table>
        </div>
        {base.length > LIMITE_TELA && <p className="text-[11px] text-slate-500">Mostrando os {LIMITE_TELA} primeiros de {base.length}. O Excel baixado traz todos.</p>}
      </div>
    </div>
  );
}
