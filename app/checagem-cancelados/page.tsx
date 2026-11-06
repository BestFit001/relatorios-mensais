"use client";
// Ferramentas > Checagem de Cancelados (aba provisória).
// Sobe a planilha de um canal, indica a coluna do pedido, a coluna do status e as palavras procuradas;
// os pedidos cujo status contém essas palavras são registrados com a escrita definida em Configurações (ex.: "cancelado")
// e podem ser baixados em Excel.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import { buscarTudo } from "../../lib/buscarTudo";
import { indiceDaLetra } from "../../lib/cobertura";
import { achar, chaveDoPedido, interpretarTermo } from "../../lib/checagemCanceladosLogica";
import Navbar from "../components/Navbar";

const CHAVE_FORM = "bestfit_checagem_cancelados_form";   // só lembra as últimas colunas/termo de cada canal (conveniência)
const CANAIS_PADRAO = ["Mercado Livre 1", "Mercado Livre 2", "Mercado Livre 3", "Shopee", "Amazon", "Magazine Luiza", "Netshoes", "Centauro", "Shein", "TikTok", "Site"];
const LIMITE_TELA = 200;

interface FormCanal { linha: string; colPedido: string; colStatus: string; termo: string }
const FORM_VAZIO: FormCanal = { linha: "2", colPedido: "A", colStatus: "B", termo: "cancelado" };

const lerPlanilha = async (arquivo: File): Promise<any[][]> => {
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
  const aba = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<any[]>(aba, { header: 1, raw: true, defval: "" });
};

export default function ChecagemCanceladosPage() {
  const router = useRouter();
  const [subAba, setSubAba] = useState<"checagem" | "config">("checagem");
  const [canais, setCanais] = useState<string[]>([]);
  const [rotulo, setRotulo] = useState("cancelado");
  const [rotuloEdit, setRotuloEdit] = useState("cancelado");
  const [registros, setRegistros] = useState<any[]>([]);
  const [faturados, setFaturados] = useState<Map<string, string>>(new Map());   // chave do pedido -> mês de referência
  const [soFaturados, setSoFaturados] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro" | "info"; linhas: string[] } | null>(null);

  const [canal, setCanal] = useState("");
  const [form, setForm] = useState<FormCanal>(FORM_VAZIO);
  const [formsSalvos, setFormsSalvos] = useState<Record<string, FormCanal>>({});

  const [filtroCanal, setFiltroCanal] = useState("");
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    const [regras, cfg, regs, fats] = await Promise.all([
      supabase.from("config_regras_canais").select("canal").order("id"),
      supabase.from("checagem_cancelados_config").select("valor").eq("chave", "rotulo").maybeSingle(),
      buscarTudo("checagem_cancelados", "*"),
      buscarTudo("faturados", "id, id_pedido, mes_referencia"),
    ]);
    const lista = Array.from(new Set<string>((regras.data || []).map((r: any) => r.canal))).filter(Boolean);
    setCanais(lista.length ? lista : CANAIS_PADRAO);
    const r = String(cfg.data?.valor ?? "").trim() || "cancelado";
    setRotulo(r); setRotuloEdit(r);
    setRegistros(regs);
    const mapa = new Map<string, string>();
    fats.forEach((f: any) => { const k = chaveDoPedido(f.id_pedido); if (k) mapa.set(k, String(f.mes_referencia ?? "")); });
    setFaturados(mapa);
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("usuario_logado")) { router.push("/login"); return; }
    try { setFormsSalvos(JSON.parse(localStorage.getItem(CHAVE_FORM) || "{}")); } catch { /* sem memória: usa o padrão */ }
    carregar().catch((e) => { setCarregando(false); setAviso({ tipo: "erro", linhas: ["Não consegui carregar os dados: " + (e?.message || e)] }); });
  }, [carregar, router]);

  // canal inicial = primeiro da lista; ao trocar de canal volta com o que foi usado nele da última vez
  useEffect(() => { if (!canal && canais.length) setCanal(canais[0]); }, [canais, canal]);
  useEffect(() => { if (canal) setForm(formsSalvos[canal] || FORM_VAZIO); }, [canal, formsSalvos]);

  const lembrarForm = (c: string, f: FormCanal) => {
    const novo = { ...formsSalvos, [c]: f };
    setFormsSalvos(novo);
    try { localStorage.setItem(CHAVE_FORM, JSON.stringify(novo)); } catch { /* sem localStorage: só não lembra */ }
  };

  const processar = async (arquivos: File[]) => {
    if (arquivos.length === 0) return;
    const iPed = indiceDaLetra(form.colPedido), iSta = indiceDaLetra(form.colStatus);
    const linhaInicial = parseInt(form.linha, 10);
    const termo = form.termo.trim();
    if (!canal) return setAviso({ tipo: "erro", linhas: ["Escolha o canal."] });
    if (iPed < 0 || iSta < 0) return setAviso({ tipo: "erro", linhas: ["Informe as letras das colunas do pedido e do status (ex.: A, B, AD)."] });
    if (!(linhaInicial >= 1)) return setAviso({ tipo: "erro", linhas: ["A linha inicial deve ser 1 ou mais (use 2 se a primeira linha for o cabeçalho)."] });
    if (interpretarTermo(termo).length === 0) return setAviso({ tipo: "erro", linhas: ["Escreva as palavras que devem constar no status (ex.: cancelado)."] });

    setProcessando(true); setAviso(null);
    lembrarForm(canal, form);
    try {
      const jaRegistrados = new Set<string>(registros.filter((r) => r.canal === canal).map((r) => String(r.id_pedido)));
      const saida: string[] = [];
      let totalAchados = 0, totalNovos = 0;
      for (const arquivo of arquivos) {
        const linhas = await lerPlanilha(arquivo);
        const r = achar(linhas, { linhaInicial, colPedido: iPed, colStatus: iSta, termo });
        const novos = r.achados.filter((a) => !jaRegistrados.has(a.idPedido));

        const lote = r.achados.map((a) => ({ canal, id_pedido: a.idPedido, status_planilha: a.status, rotulo, termo, arquivo: arquivo.name }));
        for (let i = 0; i < lote.length; i += 500) {
          const { error } = await supabase.from("checagem_cancelados").upsert(lote.slice(i, i + 500), { onConflict: "canal,id_pedido" });
          if (error) throw new Error(error.message);
        }
        r.achados.forEach((a) => jaRegistrados.add(a.idPedido));
        totalAchados += r.achados.length; totalNovos += novos.length;

        let linhaArq = `${arquivo.name}: ${r.lidas} linha(s) lida(s), ${r.achados.length} pedido(s) com “${termo}” no status (${novos.length} novo(s), ${r.achados.length - novos.length} já registrado(s)).`;
        if (r.semPedido) linhaArq += ` ${r.semPedido} linha(s) bateram no status mas estavam sem número de pedido.`;
        saida.push(linhaArq);
        if (r.achados.length === 0) {
          const exemplos = Array.from(new Set(linhas.slice(Math.max(0, linhaInicial - 1), linhaInicial + 199).map((l) => String(l[iSta] ?? "").trim()).filter(Boolean))).slice(0, 5);
          saida.push(exemplos.length ? `Nada encontrado. Status lidos na coluna ${form.colStatus.toUpperCase()}: ${exemplos.map((e) => `“${e}”`).join(", ")}. Confira a coluna e as palavras.` : `Nada encontrado e a coluna ${form.colStatus.toUpperCase()} está vazia a partir da linha ${linhaInicial}. Confira a coluna e a linha inicial.`);
        }
      }
      setAviso({ tipo: totalAchados > 0 ? "ok" : "info", linhas: [`${canal}: ${totalAchados} pedido(s) registrado(s) como “${rotulo}” (${totalNovos} novo(s)).`, ...saida] });
      await carregar();
    } catch (e: any) {
      setAviso({ tipo: "erro", linhas: ["Erro ao processar a planilha: " + (e?.message || e)] });
    }
    setProcessando(false);
  };

  const salvarRotulo = async () => {
    const v = rotuloEdit.trim();
    if (!v) return setAviso({ tipo: "erro", linhas: ["Escreva o texto que será registrado nos pedidos encontrados."] });
    const { error } = await supabase.from("checagem_cancelados_config").upsert({ chave: "rotulo", valor: v }, { onConflict: "chave" });
    if (error) return setAviso({ tipo: "erro", linhas: ["Não consegui salvar: " + error.message] });
    setRotulo(v);
    setAviso({ tipo: "ok", linhas: [`Pronto: os próximos pedidos encontrados serão registrados como “${v}”.`] });
  };

  // ---- lista / download ----
  const mesFaturado = useCallback((r: any) => faturados.get(chaveDoPedido(r.id_pedido)), [faturados]);
  const emComum = useMemo(() => registros.filter((r) => mesFaturado(r) !== undefined).length, [registros, mesFaturado]);
  const base = useMemo(() => (soFaturados ? registros.filter((r) => mesFaturado(r) !== undefined) : registros), [registros, soFaturados, mesFaturado]);

  const porCanal = useMemo(() => {
    const m = new Map<string, number>();
    base.forEach((r) => m.set(r.canal, (m.get(r.canal) || 0) + 1));
    return Array.from(m.entries());
  }, [base]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return base.filter((r) => (!filtroCanal || r.canal === filtroCanal) && (!t || String(r.id_pedido).toLowerCase().includes(t) || String(r.status_planilha ?? "").toLowerCase().includes(t)));
  }, [base, filtroCanal, busca]);

  const baixarExcel = () => {
    if (visiveis.length === 0) return;
    const dados = visiveis.map((r) => ({
      "Canal": r.canal,
      "ID do pedido": String(r.id_pedido),
      "Registro": r.rotulo,
      "Mês do faturamento": mesFaturado(r) ?? "não faturado",
      "Status na planilha": r.status_planilha ?? "",
      "Palavras procuradas": r.termo ?? "",
      "Arquivo": r.arquivo ?? "",
      "Data do registro": r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : "",
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    // o ID vai como texto, para o Excel não transformar em número com notação científica
    dados.forEach((_, i) => { const cel = ws["B" + (i + 2)]; if (cel) { cel.t = "s"; cel.v = String(dados[i]["ID do pedido"]); } });
    ws["!cols"] = [{ wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 18 }, { wch: 34 }, { wch: 22 }, { wch: 28 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    const nomeCanal = filtroCanal ? "_" + filtroCanal.replace(/[^a-zA-Z0-9]+/g, "-") : "";
    XLSX.writeFile(wb, `checagem_${String(rotulo).replace(/[^a-zA-Z0-9]+/g, "-")}${nomeCanal}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const limpar = async (soCanal: string) => {
    const texto = soCanal ? `Apagar os ${registros.filter((r) => r.canal === soCanal).length} pedidos registrados de ${soCanal} (inclusive os que não constam em Faturados)?` : `Apagar TODOS os ${registros.length} pedidos registrados?`;
    if (!confirm(texto)) return;
    const q = supabase.from("checagem_cancelados").delete();
    const { error } = soCanal ? await q.eq("canal", soCanal) : await q.neq("id", 0);
    if (error) return setAviso({ tipo: "erro", linhas: ["Não consegui apagar: " + error.message] });
    setAviso({ tipo: "ok", linhas: [soCanal ? `🗑️ Registros de ${soCanal} apagados.` : "🗑️ Todos os registros foram apagados."] });
    if (soCanal && filtroCanal === soCanal) setFiltroCanal("");
    await carregar();
  };

  const abaCls = (ativa: boolean) => `px-4 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer transition-all ${ativa ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`;
  const campo = "w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-indigo-500";

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Checagem de Cancelados</h1>
            <p className="text-sm font-medium text-slate-400">Ferramenta provisória: encontra nas planilhas dos canais os pedidos cujo status contém o que você procura</p>
          </div>
          <Navbar />
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-slate-900 p-3 rounded-2xl border border-slate-800">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1" data-subabas-checagem>
            <button data-subaba="checagem" onClick={() => setSubAba("checagem")} className={abaCls(subAba === "checagem")}>🔎 Checagem</button>
            <button data-subaba="config" onClick={() => setSubAba("config")} className={abaCls(subAba === "config")}>⚙️ Configurações</button>
          </div>
        </div>

        {aviso && (
          <div data-aviso className={`p-4 rounded-xl border text-sm font-semibold flex items-start justify-between gap-3 ${
            aviso.tipo === "erro" ? "border-rose-900/60 bg-rose-950/40 text-rose-300" : aviso.tipo === "ok" ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-300" : "border-amber-900/60 bg-amber-950/40 text-amber-300"}`}>
            <div className="space-y-1">{aviso.linhas.map((l, i) => <p key={i} className={i === 0 ? "" : "text-xs font-medium opacity-90"}>{l}</p>)}</div>
            <button type="button" onClick={() => setAviso(null)} className="text-xs opacity-70 hover:opacity-100 cursor-pointer">✕</button>
          </div>
        )}

        {subAba === "checagem" && (
          <>
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              <div>
                <h2 className="text-sm font-black text-white uppercase tracking-wider">Subir planilha de um canal</h2>
                <p className="text-[11px] text-slate-400 mt-1">
                  Escolha o canal, diga em quais colunas estão o número do pedido e o status e escreva as palavras que precisam constar no status.
                  “cancelado” acha “Pedido cancelado em 15/09”; “pedido cancelado” exige as duas palavras (em qualquer ordem). Use “;” para várias alternativas (ex.: cancelado; devolvido).
                  Os pedidos achados são registrados como <strong className="text-white">“{rotulo}”</strong>.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Canal</label>
                  <select value={canal} onChange={(e) => setCanal(e.target.value)} data-canal className={campo + " cursor-pointer font-bold"}>
                    {canais.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Linha inicial</label>
                  <input type="number" min={1} value={form.linha} onChange={(e) => setForm({ ...form, linha: e.target.value })} data-linha className={campo + " font-mono"} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. do pedido</label>
                  <input type="text" maxLength={3} value={form.colPedido} onChange={(e) => setForm({ ...form, colPedido: e.target.value.toUpperCase() })} data-col-pedido className={campo + " font-mono text-center font-bold"} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. do status</label>
                  <input type="text" maxLength={3} value={form.colStatus} onChange={(e) => setForm({ ...form, colStatus: e.target.value.toUpperCase() })} data-col-status className={campo + " font-mono text-center font-bold"} />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Palavras no status</label>
                  <input type="text" value={form.termo} onChange={(e) => setForm({ ...form, termo: e.target.value })} data-termo placeholder="ex.: cancelado" className={campo + " font-bold"} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Planilha(s) do canal (xlsx, xls, csv) — pode escolher várias</label>
                <input type="file" multiple accept=".xlsx,.xls,.csv" disabled={processando || carregando || !canal} data-upload
                  onChange={(e) => { const arquivos = Array.from(e.target.files || []); e.target.value = ""; processar(arquivos); }}
                  className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-indigo-600 file:text-white file:font-bold file:cursor-pointer cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
                {processando && <p className="text-xs text-slate-400 mt-2">Lendo a planilha e registrando os pedidos…</p>}
              </div>
            </div>

            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4" data-registrados>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-wider">Pedidos registrados <span className="text-slate-400 font-mono" data-total>({base.length})</span></h2>
                  <p className="text-[11px] text-slate-400 mt-1" data-resumo-faturados>
                    {registros.length} pedido(s) com o status procurado · <strong className="text-emerald-400">{emComum} também constam em Faturados</strong>
                    {faturados.size === 0 && <span className="text-amber-400"> (a tabela de Faturados está vazia: suba os faturados em Uploads)</span>}
                  </p>
                  <label className="flex items-center gap-2 mt-2 text-[11px] font-bold text-slate-300 cursor-pointer w-fit">
                    <input type="checkbox" checked={soFaturados} onChange={(e) => setSoFaturados(e.target.checked)} data-so-faturados className="accent-indigo-500" />
                    Mostrar e baixar só os que constam em Faturados
                  </label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {porCanal.map(([c, n]) => (
                      <button key={c} type="button" onClick={() => setFiltroCanal(filtroCanal === c ? "" : c)} data-chip-canal={c}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${filtroCanal === c ? "bg-indigo-600 text-white border-indigo-500" : "bg-slate-950 text-slate-300 border-slate-700"}`}>
                        {c}: {n}
                      </button>
                    ))}
                    {porCanal.length === 0 && !carregando && <span className="text-xs text-slate-500">Nada registrado ainda.</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Pesquisar pedido ou status" data-busca
                    className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none w-64" />
                  <button type="button" onClick={baixarExcel} disabled={visiveis.length === 0} data-baixar
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase cursor-pointer shadow">
                    ⬇️ Baixar Excel ({visiveis.length})
                  </button>
                  {filtroCanal
                    ? <button type="button" onClick={() => limpar(filtroCanal)} data-limpar-canal className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[11px] font-bold py-2 px-3 rounded-xl cursor-pointer">🗑️ Limpar {filtroCanal}</button>
                    : <button type="button" onClick={() => limpar("")} disabled={registros.length === 0} data-limpar-tudo className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[11px] font-bold py-2 px-3 rounded-xl cursor-pointer disabled:opacity-40">🗑️ Limpar tudo</button>}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[480px]">
                <table className="w-full text-left text-xs whitespace-nowrap" data-tabela>
                  <thead className="bg-slate-950 sticky top-0 text-slate-400 font-bold uppercase text-[10px]">
                    <tr><th className="p-3">Canal</th><th className="p-3">ID do pedido</th><th className="p-3">Registro</th><th className="p-3">Faturado</th><th className="p-3">Status na planilha</th><th className="p-3">Palavras</th><th className="p-3">Arquivo</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {visiveis.slice(0, LIMITE_TELA).map((r) => (
                      <tr key={r.id} className="hover:bg-slate-800/40" data-linha-pedido={r.id_pedido}>
                        <td className="p-3 font-bold text-white">{r.canal}</td>
                        <td className="p-3 font-mono text-indigo-300">{r.id_pedido}</td>
                        <td className="p-3"><span className="bg-rose-950/60 text-rose-300 border border-rose-900/40 px-2 py-0.5 rounded font-bold">{r.rotulo}</span></td>
                        <td className="p-3">{mesFaturado(r) !== undefined ? <span className="text-emerald-400 font-bold">✔ {mesFaturado(r)}</span> : <span className="text-slate-500">não</span>}</td>
                        <td className="p-3 text-slate-300">{r.status_planilha}</td>
                        <td className="p-3 text-slate-400">{r.termo}</td>
                        <td className="p-3 text-slate-400">{r.arquivo}</td>
                      </tr>
                    ))}
                    {visiveis.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500">{carregando ? "Carregando…" : "Nenhum pedido para mostrar."}</td></tr>}
                  </tbody>
                </table>
              </div>
              {visiveis.length > LIMITE_TELA && <p className="text-[11px] text-slate-500">Mostrando os {LIMITE_TELA} primeiros de {visiveis.length}. O Excel baixado traz todos.</p>}
            </div>
          </>
        )}

        {subAba === "config" && (
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4 max-w-2xl" data-config>
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider">Texto registrado nos pedidos</h2>
              <p className="text-[11px] text-slate-400 mt-1">É a escrita que fica gravada em cada pedido encontrado e aparece no Excel (ex.: “cancelado”). Vale para os próximos uploads; o que já foi registrado mantém a escrita da época.</p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); salvarRotulo(); }} className="flex flex-wrap items-center gap-2">
              <input type="text" value={rotuloEdit} onChange={(e) => setRotuloEdit(e.target.value)} maxLength={40} data-rotulo className={campo + " max-w-xs font-bold"} />
              <button type="submit" data-salvar-rotulo className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase cursor-pointer">Salvar</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
