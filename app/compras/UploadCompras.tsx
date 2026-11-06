"use client";
// Compras > Upload: os 5 envios da rotina semanal (estoque e vendas das lojas físicas pelo Shop9; saldos e vendas do e-commerce pelo Tiny).
// Cada envio mostra uma prévia (linhas, unidades, valores, avisos) antes de gravar.
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  lerEstoqueShop9, lerVendasShop9, lerSaldosTiny, lerVendasTiny, periodoDe, rotuloPeriodo,
  type ResumoArquivo, type ResultadoEstoqueShop9, type ResultadoVendas, type ResultadoSaldosTiny,
} from "../../lib/comprasImport";
import {
  gravarProdutos, gravarEstoque, gravarVendas, registrarUpload, carregarUploads,
  carregarNomesFiliais, salvarNomesFiliais, apagarEstoqueTodo, apagarVendasDoMes, apagarTudo, type UploadReg,
} from "../../lib/comprasDb";

type SlotId = "estoque_shop9" | "vendas_shop9" | "estoque_tiny_8" | "estoque_tiny_10" | "vendas_tiny";
type Estado = "ocioso" | "lendo" | "pronto" | "enviando" | "ok" | "erro";
interface Slot { arquivo: string; estado: Estado; resumo: ResumoArquivo | null; msg: string; prog: string }
const SLOT_VAZIO: Slot = { arquivo: "", estado: "ocioso", resumo: null, msg: "", prog: "" };

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quando = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }); };
const aguardar = () => new Promise((r) => setTimeout(r, 60));   // deixa a tela pintar antes de um trabalho pesado

/** Lê a 1ª aba de qualquer planilha (xlsx/xls) o mais leve possível: o estoque do Shop9 tem ~180 mil linhas. */
async function lerPlanilhaLeve(arquivo: File): Promise<any[][]> {
  const wb = XLSX.read(new Uint8Array(await arquivo.arrayBuffer()), { type: "array", cellStyles: false, cellNF: false, cellText: false, cellFormula: false, cellHTML: false });
  return XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true });
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function Cartao({ id, titulo, ajuda, filhos, usaPeriodo, s, u, periodo, onEscolher, onEnviar }: { id: SlotId; titulo: string; ajuda: string; filhos?: React.ReactNode; usaPeriodo?: boolean; s: Slot; u?: UploadReg; periodo: number; onEscolher: (id: SlotId, f: File | undefined) => void; onEnviar: (id: SlotId) => void }) {
  const ocupado = s.estado === "lendo" || s.estado === "enviando";
  return (
    <div data-slot={id} className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3">
      <div>
        <h3 className="text-sm font-black text-white">{titulo}</h3>
        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{ajuda}</p>
      </div>
      {filhos}
      <div className="text-[11px] text-slate-500" data-ultimo>
        {u ? <>Último envio{usaPeriodo ? ` (${rotuloPeriodo(periodo)})` : ""}: <strong className="text-slate-300">{quando(u.created_at)}</strong> · {fmt(u.linhas)} linhas · {fmt(u.unidades)} un{u.valor ? ` · ${brl(u.valor)}` : ""}</> : <>Nenhum envio{usaPeriodo ? ` para ${rotuloPeriodo(periodo)}` : ""} ainda.</>}
      </div>
      <label className={`block border-2 border-dashed rounded-xl p-4 text-center text-xs font-bold cursor-pointer transition-all ${ocupado ? "opacity-50 pointer-events-none" : "border-slate-700 text-slate-300 hover:border-indigo-500 hover:text-white"}`}>
        {s.arquivo ? `📄 ${s.arquivo} (clique para trocar)` : "📤 Escolher arquivo (.xls / .xlsx)"}
        <input type="file" accept=".xls,.xlsx,.XLS,.XLSX,.csv" className="hidden" data-input={id} onChange={(e) => { onEscolher(id, e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {s.prog && <p className="text-[11px] text-indigo-300 font-semibold" data-prog>{s.prog}</p>}
      {s.estado === "erro" && <p data-erro className="text-xs font-semibold text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-xl p-3">{s.msg}</p>}
      {s.estado === "ok" && <p data-ok className="text-xs font-semibold text-emerald-300 bg-emerald-950/40 border border-emerald-900/60 rounded-xl p-3">{s.msg}</p>}
      {(s.estado === "pronto" || s.estado === "enviando") && s.resumo && (
        <div className="space-y-2" data-previa>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-950 rounded-xl p-2"><p className="text-[10px] text-slate-500 uppercase font-bold">Linhas</p><p className="text-sm font-black text-white">{fmt(s.resumo.linhas)}</p></div>
            <div className="bg-slate-950 rounded-xl p-2"><p className="text-[10px] text-slate-500 uppercase font-bold">Unidades</p><p className="text-sm font-black text-white">{fmt(s.resumo.unidades)}</p></div>
            <div className="bg-slate-950 rounded-xl p-2"><p className="text-[10px] text-slate-500 uppercase font-bold">{id.startsWith("estoque") ? "Custo" : "Valor"}</p><p className="text-sm font-black text-white">{s.resumo.valor ? brl(s.resumo.valor) : "—"}</p></div>
          </div>
          {s.resumo.detalhe.length > 0 && (
            <div className="max-h-40 overflow-auto rounded-xl border border-slate-800">
              <table className="w-full text-[11px]">
                <tbody>
                  {s.resumo.detalhe.map((d) => (
                    <tr key={d.rotulo} className="border-b border-slate-800/60 last:border-0">
                      <td className="px-2 py-1 text-slate-300">{d.rotulo}</td>
                      <td className="px-2 py-1 text-right text-slate-400">{fmt(d.linhas)} lin.</td>
                      <td className="px-2 py-1 text-right text-slate-400">{fmt(d.unidades)} un</td>
                      <td className="px-2 py-1 text-right text-slate-400">{d.valor ? brl(d.valor) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {s.resumo.avisos.map((av, i) => <p key={i} className="text-[11px] text-amber-300">⚠ {av}</p>)}
          <button type="button" data-enviar={id} disabled={s.estado === "enviando"} onClick={() => onEnviar(id)}
            className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase disabled:opacity-50 cursor-pointer">
            {s.estado === "enviando" ? "Gravando…" : id.startsWith("vendas") ? `Gravar vendas de ${rotuloPeriodo(periodo)}` : "Gravar (substitui o estoque anterior)"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function UploadCompras({ aoGravar }: { aoGravar: () => void }) {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [manter8e10, setManter8e10] = useState(false);
  const [usarTotal, setUsarTotal] = useState(true);
  const [padraoFba, setPadraoFba] = useState("FBA");
  const [slots, setSlots] = useState<Record<SlotId, Slot>>({
    estoque_shop9: SLOT_VAZIO, vendas_shop9: SLOT_VAZIO, estoque_tiny_8: SLOT_VAZIO, estoque_tiny_10: SLOT_VAZIO, vendas_tiny: SLOT_VAZIO,
  });
  const [uploads, setUploads] = useState<UploadReg[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [nomesMsg, setNomesMsg] = useState("");
  const [apagando, setApagando] = useState<"" | "estoque" | "mes" | "tudo">("");   // qual apagamento está aguardando confirmação
  const [confirmacao, setConfirmacao] = useState("");
  const [apagarMsg, setApagarMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [apagarOcupado, setApagarOcupado] = useState(false);
  const brutos = useRef<Partial<Record<SlotId, any[][]>>>({});
  const analises = useRef<Partial<Record<SlotId, any>>>({});

  const periodo = periodoDe(ano, mes);
  const mudar = (id: SlotId, p: Partial<Slot>) => setSlots((s) => ({ ...s, [id]: { ...s[id], ...p } }));

  const recarregarUploads = useCallback(() => { carregarUploads().then(setUploads).catch(() => { /* sem registro de envios: a tela segue */ }); }, []);
  useEffect(() => { recarregarUploads(); carregarNomesFiliais().then(setNomes).catch(() => { /* sem nomes: usa "Filial N" */ }); }, [recarregarUploads]);

  /** Interpreta as linhas já lidas com as opções atuais (mês, filiais 8/10, valor, FBA). */
  const interpretar = useCallback((id: SlotId): ResumoArquivo => {
    const linhas = brutos.current[id]!;
    if (id === "estoque_shop9") { const r = lerEstoqueShop9(linhas); analises.current[id] = r; return r.resumo; }
    if (id === "vendas_shop9") { const r = lerVendasShop9(linhas, periodo, { manter8e10 }); analises.current[id] = r; return r.resumo; }
    if (id === "estoque_tiny_8") { const r = lerSaldosTiny(linhas, 8); analises.current[id] = r; return r.resumo; }
    if (id === "estoque_tiny_10") { const r = lerSaldosTiny(linhas, 10); analises.current[id] = r; return r.resumo; }
    let fba = /fba/i;
    try { fba = new RegExp(padraoFba.trim() || "FBA", "i"); } catch { /* texto inválido: usa FBA */ }
    const r = lerVendasTiny(linhas, periodo, { usarTotal, padraoFba: fba }); analises.current[id] = r; return r.resumo;
  }, [periodo, manter8e10, usarTotal, padraoFba]);

  // mudou mês / opções: refaz a prévia dos arquivos já escolhidos (sem reler o arquivo)
  useEffect(() => {
    (["vendas_shop9", "vendas_tiny"] as SlotId[]).forEach((id) => {
      if (!brutos.current[id]) return;
      try { mudar(id, { resumo: interpretar(id), estado: "pronto", msg: "" }); } catch (e: any) { mudar(id, { estado: "erro", msg: e.message }); }
    });
  }, [interpretar]);

  const escolher = async (id: SlotId, arquivo: File | undefined) => {
    if (!arquivo) return;
    mudar(id, { ...SLOT_VAZIO, arquivo: arquivo.name, estado: "lendo", prog: "Lendo o arquivo… (o estoque do Shop9 é grande e pode levar até 1 minuto)" });
    await aguardar();
    try {
      brutos.current[id] = await lerPlanilhaLeve(arquivo);
      await aguardar();
      mudar(id, { resumo: interpretar(id), estado: "pronto", prog: "", msg: "" });
    } catch (e: any) {
      delete brutos.current[id];
      mudar(id, { estado: "erro", prog: "", msg: e?.message || String(e) });
    }
  };

  const enviar = async (id: SlotId) => {
    const a = analises.current[id];
    if (!a) return;
    const prog = (t: string, f: number, tot: number) => mudar(id, { prog: `${t}: ${f}/${tot}` });
    mudar(id, { estado: "enviando", msg: "", prog: "Gravando…" });
    try {
      let lote: number | null = null;
      let tipo: string = id, per: number | null = null;
      if (id === "estoque_shop9") {
        const r = a as ResultadoEstoqueShop9;
        await gravarProdutos(r.produtos, true, prog);
        lote = await gravarEstoque(r.estoque, { tipo: "fisicas" }, prog);
      } else if (id === "estoque_tiny_8" || id === "estoque_tiny_10") {
        const r = a as ResultadoSaldosTiny;
        await gravarProdutos(r.produtosNovos, false, prog);
        lote = await gravarEstoque(r.estoque, { tipo: "filial", filial: id === "estoque_tiny_8" ? 8 : 10 }, prog);
      } else {
        const r = a as ResultadoVendas;
        per = periodo;
        await gravarProdutos(r.produtosNovos, false, prog);
        lote = await gravarVendas(r.vendas, periodo, id === "vendas_shop9" ? "shop9" : "tiny", prog);
      }
      const res = slots[id].resumo!;
      await registrarUpload({ tipo, periodo: per, arquivo: slots[id].arquivo, linhas: res.linhas, unidades: res.unidades, valor: res.valor, lote });
      delete brutos.current[id]; delete analises.current[id];
      mudar(id, { estado: "ok", prog: "", msg: "Gravado com sucesso." });
      recarregarUploads(); aoGravar();
    } catch (e: any) {
      mudar(id, { estado: "erro", prog: "", msg: "Erro ao gravar: " + (e?.message || e) });
    }
  };

  const ultimo = (tipo: string, per?: number) => uploads.find((u) => u.tipo === tipo && (per === undefined || u.periodo === per));

  const campo = "bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none focus:border-indigo-500";

  const comum = (id: SlotId, usaPeriodo?: boolean) => ({ s: slots[id], u: ultimo(id, usaPeriodo ? periodo : undefined), periodo, onEscolher: escolher, onEnviar: enviar });
  const executarApagar = async () => {
    if (!apagando || confirmacao.trim().toUpperCase() !== "APAGAR") return;
    setApagarOcupado(true); setApagarMsg(null);
    try {
      if (apagando === "estoque") await apagarEstoqueTodo();
      else if (apagando === "mes") await apagarVendasDoMes(periodo);
      else await apagarTudo();
      setApagarMsg({ ok: true, texto: apagando === "estoque" ? "Estoque apagado." : apagando === "mes" ? `Vendas de ${rotuloPeriodo(periodo)} apagadas.` : "Toda a base de compras foi apagada." });
      setApagando(""); setConfirmacao("");
      recarregarUploads(); aoGravar();
    } catch (e: any) {
      setApagarMsg({ ok: false, texto: "Erro ao apagar: " + (e?.message || e) });
    }
    setApagarOcupado(false);
  };

  const filiaisNomes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

  return (
    <div className="space-y-6" data-aba-upload>
      <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-2">
        <h2 className="text-sm font-black text-white uppercase tracking-wider">Rotina semanal</h2>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          O <strong className="text-slate-200">estoque</strong> é sempre trocado pelo novo (sem histórico). As <strong className="text-slate-200">vendas</strong> ficam guardadas mês a mês:
          ao enviar de novo o mesmo mês, só aquele mês (daquela origem) é substituído e os meses anteriores continuam para as comparações.
          As lojas físicas vêm do Shop9 (todas as filiais exceto a 8 e a 10); a filial 8 (e-commerce) e a 10 (Amazon FBA) vêm do Tiny.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-6">
          <h3 className="text-xs font-black text-indigo-300 uppercase tracking-widest">🏬 Lojas físicas (Shop9)</h3>
          <Cartao id="estoque_shop9" {...comum("estoque_shop9")} titulo="1. Estoque de todas as filiais — Atual"
            ajuda="Relatório do Super Gerador. Atualiza o cadastro das grades (marca, classe, família, fornecedor, custo, preços) e troca o estoque das filiais físicas. Filiais 8 e 10 deste arquivo são ignoradas." />
          <Cartao id="vendas_shop9" {...comum("vendas_shop9", true)} titulo="2. Vendas de todas as filiais" usaPeriodo
            ajuda="Vendas do mês vigente (do dia 1º até hoje). Escolha o mês abaixo; o que já estava gravado para esse mês (Shop9) é substituído."
            filhos={
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <select value={mes} onChange={(e) => setMes(+e.target.value)} data-mes className={campo + " cursor-pointer font-bold"}>
                    {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <input type="number" value={ano} onChange={(e) => setAno(+e.target.value || ano)} data-ano className={campo + " w-24 font-bold"} />
                  <span className="text-[11px] text-slate-500">vale também para as vendas do Tiny</span>
                </div>
                <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={manter8e10} onChange={(e) => setManter8e10(e.target.checked)} data-manter8e10 />
                  Manter também as filiais 8 e 10 que vierem neste arquivo (por padrão são ignoradas, pois o e-commerce vem do Tiny)
                </label>
              </div>
            } />
        </div>

        <div className="space-y-6">
          <h3 className="text-xs font-black text-indigo-300 uppercase tracking-widest">🛒 E-commerce (Tiny)</h3>
          <Cartao id="estoque_tiny_8" {...comum("estoque_tiny_8")} titulo="3. Saldo em estoque — depósito GERAL (filial 8)"
            ajuda="Tiny › Suprimentos › Relatórios › Saldo em estoque, depósito “GERAL”. Todos os SKUs viram filial 8; a chave do item fica grade-8." />
          <Cartao id="estoque_tiny_10" {...comum("estoque_tiny_10")} titulo="4. Saldo em estoque — FBA (filial 10)"
            ajuda="Mesmo relatório, depósito FBA. Todos os SKUs viram filial 10 (Amazon FBA). Opcional se você não usa o FBA." />
          <Cartao id="vendas_tiny" {...comum("vendas_tiny", true)} titulo="5. Relatório de vendas do Tiny" usaPeriodo
            ajuda="Vendas › Relatórios › Vendas, baseado em notas fiscais, agrupado por e-commerce, sub-agrupado por produto. Canais que tenham FBA no nome vão para a filial 10; os demais, somados, para a filial 8. O mês é o escolhido no cartão 2."
            filhos={
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Valor da venda</label>
                  <select value={usarTotal ? "total" : "valor"} onChange={(e) => setUsarTotal(e.target.value === "total")} data-valor-tiny className={campo + " w-full cursor-pointer"}>
                    <option value="total">Total (valor + frete)</option>
                    <option value="valor">Valor (sem frete)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Canal vai p/ filial 10 se contiver</label>
                  <input value={padraoFba} onChange={(e) => setPadraoFba(e.target.value)} data-fba className={campo + " w-full"} />
                </div>
              </div>
            } />
        </div>
      </div>


      <details className="bg-slate-900/90 rounded-2xl border border-rose-900/50" data-apagar>
        <summary className="px-5 py-4 text-sm font-black text-rose-300 cursor-pointer">🗑️ Apagar dados (subiu errado?)</summary>
        <div className="px-5 pb-5 space-y-3">
          <p className="text-[11px] text-slate-400">
            Para limpar um envio errado e subir de novo. Não dá para desfazer. Os nomes das filiais não são apagados.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-apagar-opcao="estoque" onClick={() => { setApagando("estoque"); setConfirmacao(""); setApagarMsg(null); }}
              className="px-4 py-2 rounded-xl border border-rose-800 text-rose-300 hover:bg-rose-950/50 text-xs font-black cursor-pointer">Apagar todo o estoque</button>
            <button type="button" data-apagar-opcao="mes" onClick={() => { setApagando("mes"); setConfirmacao(""); setApagarMsg(null); }}
              className="px-4 py-2 rounded-xl border border-rose-800 text-rose-300 hover:bg-rose-950/50 text-xs font-black cursor-pointer">Apagar as vendas de {rotuloPeriodo(periodo)} (mês do cartão 2)</button>
            <button type="button" data-apagar-opcao="tudo" onClick={() => { setApagando("tudo"); setConfirmacao(""); setApagarMsg(null); }}
              className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-black cursor-pointer">Apagar TUDO da base de compras</button>
          </div>
          {apagando && (
            <div className="border border-rose-900/60 bg-rose-950/30 rounded-xl p-3 space-y-2" data-apagar-confirmar>
              <p className="text-xs font-semibold text-rose-200">
                {apagando === "estoque" && "Vai apagar o estoque de TODAS as filiais (lojas e e-commerce). As vendas e o cadastro continuam."}
                {apagando === "mes" && `Vai apagar as vendas de ${rotuloPeriodo(periodo)} (Shop9 e Tiny). Os outros meses continuam.`}
                {apagando === "tudo" && "Vai apagar estoque, vendas de todos os meses, cadastro das grades e o registro dos envios. A base volta a ficar vazia."}
                {" "}Digite <strong>APAGAR</strong> para confirmar:
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} data-apagar-texto placeholder="APAGAR" className={campo + " w-40 uppercase"} />
                <button type="button" data-apagar-executar disabled={apagarOcupado || confirmacao.trim().toUpperCase() !== "APAGAR"} onClick={executarApagar}
                  className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-black uppercase disabled:opacity-40 cursor-pointer">{apagarOcupado ? "Apagando…" : "Confirmar e apagar"}</button>
                <button type="button" onClick={() => { setApagando(""); setConfirmacao(""); }} className="text-xs text-slate-400 hover:text-white cursor-pointer">Cancelar</button>
              </div>
            </div>
          )}
          {apagarMsg && <p data-apagar-msg className={`text-xs font-semibold ${apagarMsg.ok ? "text-emerald-300" : "text-rose-300"}`}>{apagarMsg.texto}</p>}
        </div>
      </details>

      <details className="bg-slate-900/90 rounded-2xl border border-slate-800" data-nomes-filiais>
        <summary className="px-5 py-4 text-sm font-black text-white cursor-pointer">🏷️ Nomes das filiais (opcional)</summary>
        <div className="px-5 pb-5 space-y-3">
          <p className="text-[11px] text-slate-400">Aparecem na análise no lugar de “Filial 3”, por exemplo “3 - Shopping X”. Deixe em branco o que não quiser nomear.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {filiaisNomes.map((n) => (
              <div key={n} className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 w-5 text-right">{n}</span>
                <input value={nomes[String(n)] || ""} onChange={(e) => setNomes({ ...nomes, [String(n)]: e.target.value })} data-nome-filial={n} className={campo + " w-full"}
                  placeholder={n === 8 ? "E-commerce" : n === 10 ? "Amazon FBA" : ""} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" data-salvar-nomes onClick={async () => {
              try { await salvarNomesFiliais(nomes); setNomesMsg("Nomes salvos."); aoGravar(); } catch (e: any) { setNomesMsg("Erro: " + e.message); }
            }} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase cursor-pointer">Salvar nomes</button>
            {nomesMsg && <span className="text-xs text-slate-400">{nomesMsg}</span>}
          </div>
        </div>
      </details>
    </div>
  );
}
