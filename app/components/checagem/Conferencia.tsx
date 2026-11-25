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
import { acharCabecalho, CABECALHOS_NOTAS, CABECALHOS_VENDAS } from "../../../lib/conferenciaColunas";
import { baixaPorSku, cruzar, juntarItens, lerItens, lerNotas, textoDosItens, type ItemGuardado, type NotaGuardada } from "../../../lib/conferenciaCanceladosLogica";

const CHAVE_CANC = "bestfit_conferencia_cancelados_form";
const CHAVE_NOTAS = "bestfit_conferencia_notas_form";
const CHAVE_ITENS = "bestfit_conferencia_itens_form";
const LIMITE_TELA = 200;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const campo = "w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-indigo-500";
const arquivoCls = "block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-indigo-600 file:text-white file:font-bold file:cursor-pointer cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700";

// auto = acha as colunas pelo texto do cabeçalho da planilha; as letras digitadas só valem quando o cabeçalho não é reconhecido (ou com auto desligado)
interface FormCanc { auto: boolean; linha: string; colPedido: string; colStatus: string; colSku: string; colQtd: string; colProduto: string; termo: string }
const FORM_CANC: FormCanc = { auto: true, linha: "2", colPedido: "A", colStatus: "B", colSku: "", colQtd: "", colProduto: "", termo: "cancel" };
interface FormNotas { auto: boolean; linha: string; colPedido: string; colNf: string; colComprador: string; colValor: string; periodo: string }
const FORM_NOTAS: FormNotas = { auto: true, linha: "2", colPedido: "AI", colNf: "", colComprador: "", colValor: "", periodo: "" };
// "cancel" pega cancelado, cancelada, cancelou... (o antigo "cancelado" deixava de fora "Cancelada pelo comprador" do Mercado Livre)
const formCancDoCanal = (f?: Partial<FormCanc>): FormCanc => { const m = { ...FORM_CANC, ...(f || {}) }; if (m.termo.trim().toLowerCase() === "cancelado") m.termo = "cancel"; return m; };
const letraDoIndice = (i: number) => { let t = "", n = i + 1; while (n > 0) { const m = (n - 1) % 26; t = String.fromCharCode(65 + m) + t; n = Math.floor((n - 1) / 26); } return t; };
interface FormItens { linha: string; colPedido: string; colSku: string; colQtd: string; colProduto: string }
const FORM_ITENS: FormItens = { linha: "2", colPedido: "A", colSku: "", colQtd: "", colProduto: "" };
type Aviso = { tipo: "ok" | "erro" | "info"; linhas: string[] } | null;

const lerJson = <T,>(chave: string, padrao: T): T => { try { return { ...padrao, ...JSON.parse(localStorage.getItem(chave) || "{}") }; } catch { return padrao; } };
const guardar = (chave: string, v: unknown) => { try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* sem localStorage: só não lembra */ } };

export default function Conferencia({ canais }: { canais: string[] }) {
  const [cancelados, setCancelados] = useState<any[]>([]);
  const [notas, setNotas] = useState<Map<string, NotaGuardada>>(new Map());
  const [totalNotas, setTotalNotas] = useState(0);
  const [itens, setItens] = useState<Map<string, ItemGuardado[]>>(new Map());   // SKU e quantidade por pedido (planilha da conferência ou vendas guardadas)
  const [totalItens, setTotalItens] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState<"" | "cancelados" | "notas" | "itens">("");
  const [aviso, setAviso] = useState<Aviso>(null);

  const [canal, setCanal] = useState("");
  const [formsCanc, setFormsCanc] = useState<Record<string, FormCanc>>({});
  const [formCanc, setFormCanc] = useState<FormCanc>(FORM_CANC);
  const [formNotas, setFormNotas] = useState<FormNotas>(FORM_NOTAS);
  const [formItens, setFormItens] = useState<FormItens>(FORM_ITENS);

  const [filtroCanal, setFiltroCanal] = useState("");
  const [situacao, setSituacao] = useState<"todos" | "com" | "sem">("todos");
  const [filtroSku, setFiltroSku] = useState<"todos" | "com" | "sem">("todos");
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
    // SKU e quantidade: o que foi subido na conferência + as vendas guardadas (vendas_canais) dos mesmos pedidos
    const { count: contItens } = await supabase.from("conferencia_itens").select("id", { count: "exact", head: true });
    const subidos: ItemGuardado[] = [];
    for (let i = 0; i < pedacos.length; i += 6) {
      const respostas = await Promise.all(pedacos.slice(i, i + 6).map((p) => supabase.from("conferencia_itens").select("chave,sku,quantidade,produto,arquivo").in("chave", p).limit(5000)));
      for (const r of respostas) { if (r.error) throw new Error(r.error.message); subidos.push(...((r.data || []) as ItemGuardado[])); }
    }
    const ids = Array.from(new Set(canc.map((c: any) => String(c.id_pedido))));
    const vendas: any[] = [];
    for (let i = 0; i < ids.length; i += 600) {
      const lote = ids.slice(i, i + 600), pedacosV: string[][] = [];
      for (let j = 0; j < lote.length; j += 100) pedacosV.push(lote.slice(j, j + 100));
      const respostas = await Promise.all(pedacosV.map((p) => supabase.from("vendas_canais").select("id_pedido,sku,produto,quantidade").in("id_pedido", p).limit(5000)));
      for (const r of respostas) { if (r.error) throw new Error(r.error.message); vendas.push(...(r.data || [])); }
    }
    setItens(juntarItens(subidos, vendas)); setTotalItens(contItens ?? 0);
    setCancelados(canc); setTotalNotas(count ?? 0); setNotas(mapa);   // tudo junto, para a tela nunca mostrar números pela metade
    setCarregando(false);
  }, []);

  useEffect(() => {
    setFormsCanc(lerJson<Record<string, FormCanc>>(CHAVE_CANC, {}));
    setFormNotas(lerJson<FormNotas>(CHAVE_NOTAS, FORM_NOTAS));
    setFormItens(lerJson<FormItens>(CHAVE_ITENS, FORM_ITENS));
    carregar().catch((e) => { setCarregando(false); setAviso({ tipo: "erro", linhas: ["Não consegui carregar a conferência: " + (e?.message || e)] }); });
  }, [carregar]);
  useEffect(() => { if (!canal && canais.length) setCanal(canais[0]); }, [canais, canal]);
  useEffect(() => { if (canal) setFormCanc(formCancDoCanal(formsCanc[canal])); }, [canal, formsCanc]);

  // ---- 1) planilha de vendas: cancelados + SKU + quantidade de uma vez ----
  const subirCancelados = async (arquivos: File[]) => {
    if (arquivos.length === 0) return;
    const f = formCanc;
    const termo = f.termo.trim();
    if (!canal) return setAviso({ tipo: "erro", linhas: ["Escolha o canal."] });
    if (interpretarTermo(termo).length === 0) return setAviso({ tipo: "erro", linhas: ["Escreva as palavras que devem constar no status (ex.: cancel)."] });
    const opc = (v: string) => (v.trim() ? indiceDaLetra(v) : -1);
    const manual = { iPed: indiceDaLetra(f.colPedido), iSta: indiceDaLetra(f.colStatus), iSku: opc(f.colSku), iQtd: opc(f.colQtd), iProd: opc(f.colProduto), linhaInicial: parseInt(f.linha, 10) };
    if ((f.colSku.trim() && manual.iSku < 0) || (f.colQtd.trim() && manual.iQtd < 0) || (f.colProduto.trim() && manual.iProd < 0)) return setAviso({ tipo: "erro", linhas: ["Alguma letra de coluna está inválida. Use só letras (ex.: A, B, AD)."] });
    if (!f.auto && (manual.iPed < 0 || manual.iSta < 0)) return setAviso({ tipo: "erro", linhas: ["Informe as letras das colunas do pedido e do status (ex.: A, D)."] });
    if (!f.auto && !(manual.linhaInicial >= 1)) return setAviso({ tipo: "erro", linhas: ["A linha inicial deve ser 1 ou mais (use 2 se a primeira linha for o cabeçalho)."] });
    setProcessando("cancelados"); setAviso(null);
    const novas = { ...formsCanc, [canal]: f }; setFormsCanc(novas); guardar(CHAVE_CANC, novas);
    try {
      const ja = new Set(cancelados.filter((c) => c.canal === canal).map((c) => String(c.chave)));
      const saida: string[] = []; let achados = 0, novos = 0, itensGuardados = 0; const pedidosComSku = new Set<string>();
      let detectado: Partial<FormCanc> | null = null;
      for (const arquivo of arquivos) {
        const linhas = await lerArquivoComoLinhas(arquivo);
        let { iPed, iSta, iSku, iQtd, iProd, linhaInicial } = manual; let origem = "letras digitadas";
        if (f.auto) {
          // cada canal tem seu cabeçalho: o que o cabeçalho trouxer vale; o que faltar completa com as letras salvas deste canal
          const h = acharCabecalho(linhas, CABECALHOS_VENDAS);
          if (h.linhaCabecalho >= 0) {
            iPed = h.colunas.pedido; iSta = h.colunas.status ?? manual.iSta; iSku = h.colunas.sku ?? manual.iSku; iQtd = h.colunas.quantidade ?? manual.iQtd; iProd = h.colunas.produto ?? manual.iProd;
            linhaInicial = h.linhaCabecalho + 2; origem = `cabeçalho da linha ${h.linhaCabecalho + 1}`;
            const faltou = [h.colunas.status === undefined && "status", h.colunas.sku === undefined && "SKU", h.colunas.quantidade === undefined && "quantidade"].filter(Boolean) as string[];
            if (faltou.length) saida.push(`${arquivo.name}: no cabeçalho não achei ${faltou.join(", ")}; usei as letras salvas deste canal (se estiverem vazias, esse dado não é guardado). Digite-as em “Ajustar colunas manualmente”: ficam lembradas para o canal ${canal}.`);
            detectado = { linha: String(linhaInicial), colPedido: letraDoIndice(iPed), colStatus: iSta >= 0 ? letraDoIndice(iSta) : f.colStatus, colSku: iSku >= 0 ? letraDoIndice(iSku) : "", colQtd: iQtd >= 0 ? letraDoIndice(iQtd) : "", colProduto: iProd >= 0 ? letraDoIndice(iProd) : "" };
          } else saida.push(`${arquivo.name}: não reconheci o cabeçalho deste canal; usei as letras de “Ajustar colunas manualmente” (ficam lembradas para o canal ${canal}).`);
        }
        if (iPed < 0 || iSta < 0 || !(linhaInicial >= 1)) throw new Error(`${arquivo.name}: não achei as colunas do pedido e do status. Abra “Ajustar colunas” e digite as letras.`);
        const r = achar(linhas, { linhaInicial, colPedido: iPed, colStatus: iSta, termo });
        const lote = r.achados.map((a) => ({ canal, id_pedido: a.idPedido, chave: chaveDoPedido(a.idPedido), status_planilha: a.status, termo, arquivo: arquivo.name })).filter((l) => l.chave);
        for (let i = 0; i < lote.length; i += 500) {
          const { error } = await supabase.from("conferencia_cancelados").upsert(lote.slice(i, i + 500), { onConflict: "canal,chave" });
          if (error) throw new Error(error.message);
        }
        const n = lote.filter((l) => !ja.has(l.chave)).length;
        lote.forEach((l) => ja.add(l.chave));
        achados += lote.length; novos += n;
        const cols = [`pedido ${letraDoIndice(iPed)}`, `status ${letraDoIndice(iSta)}`, ...(iSku >= 0 ? [`SKU ${letraDoIndice(iSku)}`] : []), ...(iQtd >= 0 ? [`quantidade ${letraDoIndice(iQtd)}`] : [])].join(", ");
        saida.push(`${arquivo.name}: ${r.lidas} linha(s) lida(s), ${lote.length} pedido(s) com “${termo}” no status (${n} novo(s)). Colunas (${origem}): ${cols}.`);
        if (lote.length === 0) {
          const ex = Array.from(new Set(linhas.slice(Math.max(0, linhaInicial - 1), linhaInicial + 199).map((l) => String(l[iSta] ?? "").trim()).filter(Boolean))).slice(0, 5);
          saida.push(ex.length ? `Nada encontrado. Status lidos na coluna ${letraDoIndice(iSta)}: ${ex.map((e) => `“${e}”`).join(", ")}. Confira a coluna e as palavras.` : `Nada encontrado e a coluna ${letraDoIndice(iSta)} está vazia. Confira a coluna e a linha inicial.`);
        }
        // SKU e quantidade da mesma planilha, só dos pedidos cancelados
        if (lote.length > 0 && iSku >= 0) {
          const ri = lerItens(linhas, { linhaInicial, colPedido: iPed, colSku: iSku, colQtd: iQtd, colProduto: iProd }, new Set(lote.map((l) => l.chave)));
          const loteI = ri.itens.map((i) => ({ chave: i.chave, id_pedido: i.id_pedido, sku: i.sku, quantidade: i.quantidade, produto: i.produto || null, arquivo: arquivo.name }));
          for (let i = 0; i < loteI.length; i += 500) {
            const { error } = await supabase.from("conferencia_itens").upsert(loteI.slice(i, i + 500), { onConflict: "chave,sku" });
            if (error) throw new Error(error.message);
          }
          loteI.forEach((i) => pedidosComSku.add(i.chave)); itensGuardados += loteI.length;
          let l = `SKU e quantidade: ${loteI.length} item(ns) de ${ri.pedidos} pedido(s) cancelado(s).`;
          if (ri.semSku) l += ` ${ri.semSku} linha(s) do cancelado sem SKU.`;
          if (ri.qtdInvalida) l += ` ${ri.qtdInvalida} linha(s) com quantidade inválida (não guardadas).`;
          if (ri.qtdZeradaComo1) l += ` ${ri.qtdZeradaComo1} linha(s) com quantidade 0 (o canal zera a quantidade dos cancelados): contei 1 unidade por linha.`;
          saida.push(l);
        } else if (lote.length > 0) saida.push("Não achei a coluna de SKU desta planilha: guardei só os cancelados. Digite a letra do SKU (e da quantidade) em “Ajustar colunas manualmente” e suba de novo; o SKU também pode vir das vendas guardadas ou de “Outra planilha de SKU”.");
      }
      if (detectado) {   // lembra as colunas achadas para este canal (aparecem em “Ajustar colunas manualmente”)
        const salvo = { ...f, ...detectado } as FormCanc; const nf = { ...novas, [canal]: salvo }; setFormsCanc(nf); setFormCanc(salvo); guardar(CHAVE_CANC, nf);
      }
      setAviso({ tipo: achados ? "ok" : "info", linhas: [`${canal}: ${achados} cancelado(s) guardado(s) na conferência (${novos} novo(s))${itensGuardados ? `, com SKU e quantidade de ${pedidosComSku.size} pedido(s)` : ""}.`, ...saida] });
      await carregar();
    } catch (e: any) { setAviso({ tipo: "erro", linhas: ["Erro ao processar a planilha: " + (e?.message || e)] }); }
    setProcessando("");
  };

  // ---- 2) notas ----
  const subirNotas = async (arquivos: File[]) => {
    if (arquivos.length === 0) return;
    const f = formNotas;
    const opc = (v: string) => (v.trim() ? indiceDaLetra(v) : -1);
    const manual = { iPed: indiceDaLetra(f.colPedido), iNf: opc(f.colNf), iNome: opc(f.colComprador), iValor: opc(f.colValor), linhaInicial: parseInt(f.linha, 10) };
    if ((f.colNf.trim() && manual.iNf < 0) || (f.colComprador.trim() && manual.iNome < 0) || (f.colValor.trim() && manual.iValor < 0)) return setAviso({ tipo: "erro", linhas: ["Alguma letra de coluna está inválida. Use só letras (ex.: A, B, AD)."] });
    if (!f.auto) {
      if (manual.iPed < 0) return setAviso({ tipo: "erro", linhas: ["Informe a letra da coluna de onde sai o número do pedido (ex.: AI)."] });
      if (manual.iNf < 0 && manual.iNome < 0 && manual.iValor < 0) return setAviso({ tipo: "erro", linhas: ["Informe pelo menos uma coluna para guardar (NF-e, nome do comprador ou valor do pedido)."] });
      if (!(manual.linhaInicial >= 1)) return setAviso({ tipo: "erro", linhas: ["A linha inicial deve ser 1 ou mais (use 2 se a primeira linha for o cabeçalho)."] });
    }
    setProcessando("notas"); setAviso(null); guardar(CHAVE_NOTAS, f);
    try {
      const saida: string[] = []; let guardadas = 0;
      for (const arquivo of arquivos) {
        const linhas = await lerArquivoComoLinhas(arquivo);
        let { iPed, iNf, iNome, iValor, linhaInicial } = manual; let origem = "letras digitadas";
        if (f.auto) {
          const h = acharCabecalho(linhas, CABECALHOS_NOTAS);
          if (h.linhaCabecalho >= 0) {
            iPed = h.colunas.pedido; iNf = h.colunas.nf ?? manual.iNf; iNome = h.colunas.comprador ?? manual.iNome; iValor = h.colunas.valor ?? manual.iValor;
            linhaInicial = h.linhaCabecalho + 2; origem = `cabeçalho da linha ${h.linhaCabecalho + 1}`;
          } else saida.push(`${arquivo.name}: não reconheci o cabeçalho (procuro “Observações”, “Número Nota”, “Contato”, “Valor Nota”); usei as letras de “Ajustar colunas”.`);
        }
        if (iPed < 0 || !(linhaInicial >= 1) || (iNf < 0 && iNome < 0 && iValor < 0)) throw new Error(`${arquivo.name}: não achei as colunas das notas. Abra “Ajustar colunas” e digite as letras.`);
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
        const cols = [`pedido ${letraDoIndice(iPed)}`, ...(iNf >= 0 ? [`NF-e ${letraDoIndice(iNf)}`] : []), ...(iNome >= 0 ? [`comprador ${letraDoIndice(iNome)}`] : []), ...(iValor >= 0 ? [`valor ${letraDoIndice(iValor)}`] : [])].join(", ");
        let l = `${arquivo.name}: ${r.lidas} linha(s) lida(s), ${lote.length} nota(s) guardada(s) (período “${periodo}”). Colunas (${origem}): ${cols}.`;
        if (r.semPedido) l += ` ${r.semPedido} linha(s) sem número de pedido reconhecido.`;
        if (r.repetidos) l += ` ${r.repetidos} pedido(s) em mais de uma linha: guardei a primeira.`;
        saida.push(l);
      }
      await carregar();
      setAviso({ tipo: guardadas ? "ok" : "info", linhas: [`${guardadas} nota(s) guardada(s) na conferência. Não foram para Faturados.`, ...saida] });
    } catch (e: any) { setAviso({ tipo: "erro", linhas: ["Erro ao processar a planilha: " + (e?.message || e)] }); }
    setProcessando("");
  };

  // ---- 3) SKU e quantidade ----
  const subirItens = async (arquivos: File[]) => {
    if (arquivos.length === 0) return;
    const f = formItens;
    const iPed = indiceDaLetra(f.colPedido), iSku = indiceDaLetra(f.colSku);
    const iQtd = f.colQtd.trim() ? indiceDaLetra(f.colQtd) : -1, iProd = f.colProduto.trim() ? indiceDaLetra(f.colProduto) : -1;
    const linhaInicial = parseInt(f.linha, 10);
    if (iPed < 0 || iSku < 0) return setAviso({ tipo: "erro", linhas: ["Informe as letras das colunas do número do pedido e do SKU (ex.: A, F)."] });
    if ((f.colQtd.trim() && iQtd < 0) || (f.colProduto.trim() && iProd < 0)) return setAviso({ tipo: "erro", linhas: ["Alguma letra de coluna está inválida. Use só letras (ex.: A, B, AD)."] });
    if (!(linhaInicial >= 1)) return setAviso({ tipo: "erro", linhas: ["A linha inicial deve ser 1 ou mais (use 2 se a primeira linha for o cabeçalho)."] });
    if (cancelados.length === 0) return setAviso({ tipo: "erro", linhas: ["Suba primeiro os pedidos cancelados (bloco 1): só guardo SKU e quantidade dos pedidos cancelados."] });
    setProcessando("itens"); setAviso(null); guardar(CHAVE_ITENS, f);
    try {
      const alvos = new Set(cancelados.map((c) => String(c.chave)));
      const saida: string[] = []; const achados = new Set<string>(); let guardados = 0;
      for (const arquivo of arquivos) {
        const linhas = await lerArquivoComoLinhas(arquivo);
        const r = lerItens(linhas, { linhaInicial, colPedido: iPed, colSku: iSku, colQtd: iQtd, colProduto: iProd }, alvos);
        const lote = r.itens.map((i) => ({ chave: i.chave, id_pedido: i.id_pedido, sku: i.sku, quantidade: i.quantidade, produto: i.produto || null, arquivo: arquivo.name }));
        for (let i = 0; i < lote.length; i += 500) {
          const { error } = await supabase.from("conferencia_itens").upsert(lote.slice(i, i + 500), { onConflict: "chave,sku" });
          if (error) throw new Error(error.message);
        }
        r.itens.forEach((i) => achados.add(i.chave)); guardados += lote.length;
        let l = `${arquivo.name}: ${r.lidas} linha(s) lida(s), ${r.pedidos} pedido(s) cancelado(s) encontrado(s), ${lote.length} item(ns) (SKU) guardado(s).`;
        if (r.ignoradas) l += ` ${r.ignoradas} linha(s) de pedidos que não são cancelados (ignoradas).`;
        if (r.semSku) l += ` ${r.semSku} linha(s) do cancelado sem SKU.`;
        if (r.qtdInvalida) l += ` ${r.qtdInvalida} linha(s) com quantidade inválida (não guardadas).`;
        if (r.qtdZeradaComo1) l += ` ${r.qtdZeradaComo1} linha(s) com quantidade 0 (o canal zera a quantidade dos cancelados): contei 1 unidade por linha.`;
        if (r.semPedido) l += ` ${r.semPedido} linha(s) sem número de pedido.`;
        saida.push(l);
        if (r.pedidos === 0) {
          const ex = linhas.slice(Math.max(0, linhaInicial - 1), linhaInicial + 2).map((l) => `pedido “${String(l[iPed] ?? "").trim()}”, SKU “${String(l[iSku] ?? "").trim()}”`);
          saida.push(`Nenhum pedido cancelado apareceu nessa planilha. Primeiras linhas lidas: ${ex.join(" | ") || "(vazio)"}. Confira as colunas e se é a planilha do mês dos cancelados.`);
        }
      }
      await carregar();
      setAviso({ tipo: guardados ? "ok" : "info", linhas: [`SKU e quantidade de ${achados.size} pedido(s) cancelado(s) guardados (${guardados} item(ns)). Não foram para Faturados.`, ...saida] });
    } catch (e: any) { setAviso({ tipo: "erro", linhas: ["Erro ao processar a planilha: " + (e?.message || e)] }); }
    setProcessando("");
  };

  // ---- resultado ----
  const cruzado = useMemo(() => cruzar(cancelados.map((c) => ({ ...c, chave: String(c.chave) })), notas), [cancelados, notas]);
  const base = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return cruzado.linhas.filter((l) => (!filtroCanal || l.canal === filtroCanal) && (situacao === "todos" || (situacao === "com" ? !!l.nota : !l.nota))
      && (filtroSku === "todos" || (filtroSku === "com") === itens.has(l.chave))
      && (!t || [l.id_pedido, l.nota?.nf_e, l.nota?.comprador, l.status_planilha, textoDosItens(itens.get(l.chave))].some((v) => String(v ?? "").toLowerCase().includes(t))));
  }, [cruzado, filtroCanal, situacao, filtroSku, busca, itens]);
  const comSku = useMemo(() => cruzado.linhas.filter((l) => itens.has(l.chave)).length, [cruzado, itens]);
  const baixa = useMemo(() => baixaPorSku(base.filter((l) => itens.has(l.chave)).map((l) => itens.get(l.chave)!)), [base, itens]);
  const totalPecas = useMemo(() => baixa.reduce((a, x) => a + x.quantidade, 0), [baixa]);
  const totalVisivel = useMemo(() => base.reduce((a, l) => a + (Number(l.nota?.valor_pedido) || 0), 0), [base]);
  const porCanal = useMemo(() => {
    const m = new Map<string, { n: number; com: number; v: number }>();
    cruzado.linhas.forEach((l) => { const x = m.get(l.canal) || { n: 0, com: 0, v: 0 }; x.n++; if (l.nota) { x.com++; x.v += Number(l.nota.valor_pedido) || 0; } m.set(l.canal, x); });
    return Array.from(m.entries());
  }, [cruzado]);

  const baixar = () => {
    if (base.length === 0) return;
    // uma linha por SKU do pedido (pedido sem SKU = uma linha em branco); o valor do pedido só na primeira linha dele, para a soma não duplicar
    const dados: Record<string, any>[] = [];
    base.forEach((l) => {
      const its = itens.get(l.chave) || [];
      const comum = {
        "Canal": l.canal, "ID do pedido": String(l.id_pedido), "Situação": l.nota ? "Com nota" : "Sem nota",
      };
      const resto = (primeira: boolean) => ({
        "NF-e": l.nota?.nf_e ?? "", "Nome do comprador": l.nota?.comprador ?? "",
        "Valor do pedido": !primeira || l.nota?.valor_pedido === null || l.nota?.valor_pedido === undefined ? "" : Number(l.nota.valor_pedido),
        "Período da nota": l.nota?.periodo ?? "", "Status na planilha": l.status_planilha ?? "",
      });
      const fim = { "Arquivo dos cancelados": l.arquivo ?? "", "Arquivo das notas": l.nota?.arquivo ?? "" };
      if (its.length === 0) dados.push({ ...comum, "SKU": "", "Quantidade": "", ...resto(true), "Origem do SKU": "Sem SKU", ...fim });
      else its.forEach((it, k) => dados.push({ ...comum, "SKU": it.sku, "Quantidade": Number(it.quantidade), ...resto(k === 0), "Origem do SKU": it.origem ?? "", ...fim }));
    });
    const ws = XLSX.utils.json_to_sheet(dados);
    dados.forEach((d, i) => {   // ID, SKU e NF-e como texto, para o Excel não virar notação científica nem cortar zeros
      const b = ws["B" + (i + 2)]; if (b) { b.t = "s"; b.v = String(d["ID do pedido"]); }
      const sku = ws["D" + (i + 2)]; if (sku && d["SKU"] !== "") { sku.t = "s"; sku.v = String(d["SKU"]); }
      const nf = ws["F" + (i + 2)]; if (nf && d["NF-e"] !== "") { nf.t = "s"; nf.v = String(d["NF-e"]); }
      const v = ws["H" + (i + 2)]; if (v && typeof v.v === "number") v.z = '"R$" #,##0.00';
    });
    const n = dados.length + 2;
    ws["G" + n] = { t: "s", v: "TOTAL" }; ws["H" + n] = { t: "n", v: totalVisivel, z: '"R$" #,##0.00' };
    ws["D" + n] = { t: "s", v: "TOTAL DE PEÇAS" }; ws["E" + n] = { t: "n", v: totalPecas };
    ws["!ref"] = `A1:M${n}`;
    ws["!cols"] = [{ wch: 18 }, { wch: 24 }, { wch: 11 }, { wch: 18 }, { wch: 11 }, { wch: 16 }, { wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 30 }, { wch: 22 }, { wch: 26 }, { wch: 26 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Conferência");
    // 2ª aba: quanto tirar do estoque, somado por SKU
    const resumo = baixa.map((x) => ({ "SKU": x.sku, "Produto": x.produto, "Quantidade a retirar": x.quantidade, "Pedidos": x.pedidos }));
    const ws2 = XLSX.utils.json_to_sheet(resumo.length ? resumo : [{ "SKU": "", "Produto": "", "Quantidade a retirar": "", "Pedidos": "" }]);
    resumo.forEach((r, i) => { const c = ws2["A" + (i + 2)]; if (c) { c.t = "s"; c.v = String(r.SKU); } });
    ws2["!cols"] = [{ wch: 20 }, { wch: 44 }, { wch: 20 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Baixa de estoque");
    XLSX.writeFile(wb, `conferencia_cancelados${filtroCanal ? "_" + filtroCanal.replace(/[^a-zA-Z0-9]+/g, "-") : ""}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Segunda planilha (arquivo separado): quantas unidades de cada SKU saíram e em quantos pedidos, respeitando os filtros da tela
  const baixarSaidasPorSku = () => {
    if (baixa.length === 0) return;
    const dados = baixa.map((x) => ({ "SKU": x.sku, "Produto": x.produto, "Quantidade total (unidades)": x.quantidade, "Vezes que saiu (pedidos)": x.pedidos }));
    const ws = XLSX.utils.json_to_sheet(dados);
    dados.forEach((d, i) => { const c = ws["A" + (i + 2)]; if (c) { c.t = "s"; c.v = String(d["SKU"]); } });   // SKU como texto: não perde zeros à esquerda
    const n = dados.length + 2;
    ws["A" + n] = { t: "s", v: "TOTAL" };
    ws["C" + n] = { t: "n", v: totalPecas };
    ws["D" + n] = { t: "n", v: dados.reduce((a, d) => a + d["Vezes que saiu (pedidos)"], 0) };
    ws["!ref"] = `A1:D${n}`;
    ws["!cols"] = [{ wch: 20 }, { wch: 44 }, { wch: 26 }, { wch: 24 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Saídas por SKU");
    XLSX.writeFile(wb, `saidas_por_sku${filtroCanal ? "_" + filtroCanal.replace(/[^a-zA-Z0-9]+/g, "-") : ""}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const limpar = async (o: "cancelados" | "notas" | "itens") => {
    const qtd = o === "cancelados" ? cancelados.length : o === "notas" ? totalNotas : totalItens;
    if (qtd === 0) return;
    if (!confirm(o === "cancelados" ? `Apagar os ${qtd} cancelados guardados na conferência? (as notas e os SKUs guardados ficam)` : o === "notas" ? `Apagar as ${qtd} notas guardadas na conferência? (os cancelados e os SKUs ficam)` : `Apagar os ${qtd} itens (SKU e quantidade) guardados na conferência? (os cancelados e as notas ficam)`)) return;
    const { error } = await supabase.from(o === "cancelados" ? "conferencia_cancelados" : o === "notas" ? "conferencia_notas" : "conferencia_itens").delete().neq("id", 0);
    if (error) return setAviso({ tipo: "erro", linhas: ["Não consegui apagar: " + error.message] });
    setAviso({ tipo: "ok", linhas: [o === "cancelados" ? "🗑️ Cancelados da conferência apagados." : o === "notas" ? "🗑️ Notas da conferência apagadas." : "🗑️ SKUs e quantidades da conferência apagados."] });
    setFiltroCanal(""); await carregar();
  };

  return (
    <div className="space-y-6" data-conferencia>
      <div className="p-4 rounded-xl border border-indigo-900/50 bg-indigo-950/30 text-xs text-indigo-200" data-conferencia-info>
        <strong className="text-white">Conferência de meses antigos.</strong> Suba aqui a planilha de vendas (traz os cancelados, o SKU e a quantidade) e a planilha de notas (NF-e) de meses que não estão na base de Faturados. Tudo fica guardado numa base separada, <strong className="text-white">não entra em Faturados</strong> e não altera dashboards, rankings nem totais. Pode voltar depois: o que foi subido continua aqui até você apagar.
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
            <h2 className="text-sm font-black text-white uppercase tracking-wider">1. Planilha de vendas <span className="text-slate-400 font-mono" data-conf-qtd-canc>({cancelados.length} cancelados guardados)</span></h2>
            <p className="text-[11px] text-slate-400 mt-1">Planilha do canal, do jeito que baixou. Uma só planilha traz os cancelados, o SKU e a quantidade de cada pedido.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Canal</label>
              <select value={canal} onChange={(e) => setCanal(e.target.value)} data-conf-canal className={campo + " cursor-pointer font-bold"}>{canais.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            </div>
            <div><label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Palavras no status</label>
              <input type="text" value={formCanc.termo} onChange={(e) => setFormCanc({ ...formCanc, termo: e.target.value })} data-conf-termo title="“cancel” pega cancelado, cancelada, cancelou… Use “;” para várias palavras." className={campo + " font-bold"} /></div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={formCanc.auto} onChange={(e) => setFormCanc({ ...formCanc, auto: e.target.checked })} data-conf-auto className="accent-indigo-500" />
            Achar as colunas sozinho pelo cabeçalho (pedido, status, SKU e unidades)
          </label>
          <details className="rounded-xl border border-slate-800 bg-slate-950/40" data-conf-colunas>
            <summary className="cursor-pointer text-[11px] font-bold text-slate-400 p-3">Ajustar colunas manualmente</summary>
            <div className="grid grid-cols-3 gap-3 items-end p-3 pt-0">
              <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Linha inicial</label>
                <input type="number" min={1} value={formCanc.linha} onChange={(e) => setFormCanc({ ...formCanc, linha: e.target.value })} data-conf-linha className={campo + " font-mono"} /></div>
              <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. pedido</label>
                <input type="text" maxLength={3} value={formCanc.colPedido} onChange={(e) => setFormCanc({ ...formCanc, colPedido: e.target.value.toUpperCase() })} data-conf-col-pedido className={campo + " font-mono text-center font-bold"} /></div>
              <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. status</label>
                <input type="text" maxLength={3} value={formCanc.colStatus} onChange={(e) => setFormCanc({ ...formCanc, colStatus: e.target.value.toUpperCase() })} data-conf-col-status className={campo + " font-mono text-center font-bold"} /></div>
              <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. SKU</label>
                <input type="text" maxLength={3} value={formCanc.colSku} onChange={(e) => setFormCanc({ ...formCanc, colSku: e.target.value.toUpperCase() })} data-conf-col-sku className={campo + " font-mono text-center font-bold"} /></div>
              <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. quantidade</label>
                <input type="text" maxLength={3} value={formCanc.colQtd} onChange={(e) => setFormCanc({ ...formCanc, colQtd: e.target.value.toUpperCase() })} data-conf-col-qtd placeholder="vazio = 1" className={campo + " font-mono text-center font-bold"} /></div>
              <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. produto</label>
                <input type="text" maxLength={3} value={formCanc.colProduto} onChange={(e) => setFormCanc({ ...formCanc, colProduto: e.target.value.toUpperCase() })} data-conf-col-produto className={campo + " font-mono text-center font-bold"} /></div>
              <p className="col-span-3 text-[10px] text-slate-500">Estas letras só valem com a opção acima desligada ou quando o cabeçalho da planilha não é reconhecido.</p>
            </div>
          </details>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Planilha(s) de vendas (xlsx, xls, csv) — pode escolher várias</label>
            <input type="file" multiple accept=".xlsx,.xls,.csv" disabled={!!processando || carregando || !canal} data-conf-upload-cancelados
              onChange={(e) => { const a = Array.from(e.target.files || []); e.target.value = ""; subirCancelados(a); }} className={arquivoCls} />
            {processando === "cancelados" && <p className="text-xs text-slate-400 mt-2">Lendo a planilha e guardando cancelados, SKU e quantidade…</p>}
          </div>
          <details className="rounded-xl border border-slate-800 bg-slate-950/40 p-3" data-conf-itens-det>
            <summary className="cursor-pointer text-[11px] font-bold text-slate-400">Outra planilha de SKU (opcional)</summary>
        <div className="space-y-4 pt-4 border-t border-slate-800" data-conf-itens>
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider">SKU e quantidade de outra planilha <span className="text-slate-400 font-mono" data-conf-qtd-itens>({totalItens} guardados)</span></h3>
            <p className="text-[11px] text-slate-400 mt-1">Use só se a planilha de vendas do passo 1 não trouxe o SKU. Só os pedidos cancelados são guardados. Pedido com vários SKUs vira uma linha por SKU. Se o pedido já estiver nas vendas guardadas, o SKU vem de lá sozinho.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Linha inicial</label>
              <input type="number" min={1} value={formItens.linha} onChange={(e) => setFormItens({ ...formItens, linha: e.target.value })} data-conf-i-linha className={campo + " font-mono"} /></div>
            <div><label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Col. nº pedido</label>
              <input type="text" maxLength={3} value={formItens.colPedido} onChange={(e) => setFormItens({ ...formItens, colPedido: e.target.value.toUpperCase() })} data-conf-i-col-pedido className={campo + " font-mono text-center font-bold"} /></div>
            <div><label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Col. SKU</label>
              <input type="text" maxLength={3} value={formItens.colSku} onChange={(e) => setFormItens({ ...formItens, colSku: e.target.value.toUpperCase() })} data-conf-i-col-sku className={campo + " font-mono text-center font-bold"} /></div>
            <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. quantidade</label>
              <input type="text" maxLength={3} value={formItens.colQtd} onChange={(e) => setFormItens({ ...formItens, colQtd: e.target.value.toUpperCase() })} data-conf-i-col-qtd placeholder="vazio = 1" className={campo + " font-mono text-center font-bold"} /></div>
            <div className="col-span-2 md:col-span-4"><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. nome do produto (opcional)</label>
              <input type="text" maxLength={3} value={formItens.colProduto} onChange={(e) => setFormItens({ ...formItens, colProduto: e.target.value.toUpperCase() })} data-conf-i-col-produto className={campo + " font-mono text-center font-bold w-24"} /></div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Planilha(s) de vendas (xlsx, xls, csv) — pode escolher várias</label>
            <input type="file" multiple accept=".xlsx,.xls,.csv" disabled={!!processando || carregando} data-conf-upload-itens
              onChange={(e) => { const a = Array.from(e.target.files || []); e.target.value = ""; subirItens(a); }} className={arquivoCls} />
            {processando === "itens" && <p className="text-xs text-slate-400 mt-2">Lendo a planilha e guardando SKU e quantidade…</p>}
          </div>
        </div>

          </details>
        </div>

        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4" data-conf-notas>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider">2. Notas (NF-e de saída) <span className="text-slate-400 font-mono" data-conf-qtd-notas>({totalNotas} guardadas)</span></h2>
            <p className="text-[11px] text-slate-400 mt-1">Mesma planilha de notas usada em Faturados. O número do pedido é lido da observação da nota.</p>
          </div>
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Período desta(s) planilha(s) (opcional, ex.: Ago/2026; se vazio usa o nome do arquivo)</label>
            <input type="text" value={formNotas.periodo} onChange={(e) => setFormNotas({ ...formNotas, periodo: e.target.value })} data-conf-n-periodo maxLength={40} className={campo} /></div>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={formNotas.auto} onChange={(e) => setFormNotas({ ...formNotas, auto: e.target.checked })} data-conf-n-auto className="accent-indigo-500" />
            Achar as colunas sozinho pelo cabeçalho (observações, número da nota, contato e valor)
          </label>
          <details className="rounded-xl border border-slate-800 bg-slate-950/40" data-conf-n-colunas>
            <summary className="cursor-pointer text-[11px] font-bold text-slate-400 p-3">Ajustar colunas manualmente</summary>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end p-3 pt-0">
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
              <p className="col-span-2 md:col-span-5 text-[10px] text-slate-500">Estas letras só valem com a opção acima desligada ou quando o cabeçalho da planilha não é reconhecido. Deixe em branco o que não quiser guardar.</p>
            </div>
          </details>
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
              <strong className="text-emerald-400">{cruzado.comNota} com nota</strong> · <strong className="text-amber-400">{cruzado.semNota} sem nota</strong> (de {cancelados.length} cancelados guardados). “Sem nota” = o pedido não apareceu nas notas guardadas: suba a planilha do mês certo. <strong className="text-sky-300" data-conf-resumo-sku>{comSku} com SKU</strong> · <strong className="text-amber-400">{cruzado.linhas.length - comSku} sem SKU</strong>.
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
            <select value={filtroSku} onChange={(e) => setFiltroSku(e.target.value as any)} data-conf-filtro-sku className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white cursor-pointer">
              <option value="todos">SKU: todos</option><option value="com">Só com SKU</option><option value="sem">Só sem SKU</option>
            </select>
            <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Pedido, NF-e, comprador ou SKU" data-conf-busca className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none w-60" />
            <button type="button" onClick={baixar} disabled={base.length === 0} data-conf-baixar className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase cursor-pointer shadow">⬇️ Baixar Excel ({base.length})</button>
            <button type="button" onClick={baixarSaidasPorSku} disabled={baixa.length === 0} data-conf-baixar-skus title="Planilha separada: cada SKU com a quantidade total e em quantos pedidos saiu (segue os filtros da tela)" className="bg-sky-700 hover:bg-sky-600 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase cursor-pointer shadow">⬇️ Saídas por SKU ({baixa.length})</button>
            <button type="button" onClick={() => limpar("cancelados")} disabled={cancelados.length === 0} data-conf-limpar-cancelados className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[11px] font-bold py-2 px-3 rounded-xl cursor-pointer disabled:opacity-40">🗑️ Apagar cancelados</button>
            <button type="button" onClick={() => limpar("notas")} disabled={totalNotas === 0} data-conf-limpar-notas className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[11px] font-bold py-2 px-3 rounded-xl cursor-pointer disabled:opacity-40">🗑️ Apagar notas</button>
            <button type="button" onClick={() => limpar("itens")} disabled={totalItens === 0} data-conf-limpar-itens className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[11px] font-bold py-2 px-3 rounded-xl cursor-pointer disabled:opacity-40">🗑️ Apagar SKUs</button>
          </div>
        </div>
        <details className="rounded-xl border border-sky-900/50 bg-sky-950/20" data-conf-baixa>
          <summary className="cursor-pointer p-3 text-xs font-bold text-sky-200">📦 Baixa de estoque: {baixa.length} SKU(s), {totalPecas} peça(s) em {base.filter((l) => itens.has(l.chave)).length} pedido(s) da lista abaixo (respeita os filtros)</summary>
          <div className="overflow-x-auto max-h-[280px]">
            <table className="w-full text-left text-xs whitespace-nowrap" data-conf-baixa-tabela>
              <thead className="bg-slate-950 sticky top-0 text-slate-400 font-bold uppercase text-[10px]"><tr><th className="p-2.5">SKU</th><th className="p-2.5">Produto</th><th className="p-2.5 text-right">Quantidade a retirar</th><th className="p-2.5 text-right">Pedidos</th></tr></thead>
              <tbody className="divide-y divide-slate-800/60">
                {baixa.map((x) => (
                  <tr key={x.sku} data-conf-baixa-sku={x.sku}><td className="p-2.5 font-mono text-sky-300">{x.sku}</td><td className="p-2.5 text-slate-300">{x.produto}</td><td className="p-2.5 text-right font-mono font-bold text-white">{x.quantidade}</td><td className="p-2.5 text-right font-mono text-slate-400">{x.pedidos}</td></tr>
                ))}
                {baixa.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-500">Nenhum SKU para somar. Suba a planilha de vendas (bloco 3).</td></tr>}
              </tbody>
            </table>
          </div>
        </details>
        <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[480px]">
          <table className="w-full text-left text-xs whitespace-nowrap" data-conf-tabela>
            <thead className="bg-slate-950 sticky top-0 text-slate-400 font-bold uppercase text-[10px]">
              <tr><th className="p-3">Canal</th><th className="p-3">ID do pedido</th><th className="p-3">Situação</th><th className="p-3">SKU × quantidade</th><th className="p-3">NF-e</th><th className="p-3">Comprador</th><th className="p-3 text-right">Valor do pedido</th><th className="p-3">Período</th><th className="p-3">Status na planilha</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {base.slice(0, LIMITE_TELA).map((l) => (
                <tr key={l.id} className="hover:bg-slate-800/40" data-conf-linha-pedido={l.id_pedido}>
                  <td className="p-3 font-bold text-white">{l.canal}</td>
                  <td className="p-3 font-mono text-indigo-300">{l.id_pedido}</td>
                  <td className="p-3">{l.nota ? <span className="text-emerald-400 font-bold">✔ Com nota</span> : <span className="text-amber-400 font-bold">Sem nota</span>}</td>
                  <td className="p-3 font-mono text-sky-300 whitespace-normal min-w-[160px]" data-conf-itens-pedido>
                    {(itens.get(l.chave) || []).length
                      ? (itens.get(l.chave) || []).map((it) => <div key={it.sku} title={it.produto || undefined}>{it.sku} <strong className="text-white">×{Number(it.quantidade)}</strong></div>)
                      : <span className="text-amber-400 font-sans font-bold">Sem SKU</span>}
                  </td>
                  <td className="p-3 font-mono text-slate-300">{l.nota?.nf_e}</td>
                  <td className="p-3 text-slate-300">{l.nota?.comprador}</td>
                  <td className="p-3 text-right font-mono font-bold text-rose-300">{l.nota && l.nota.valor_pedido !== null && l.nota.valor_pedido !== undefined ? brl(Number(l.nota.valor_pedido)) : "—"}</td>
                  <td className="p-3 text-slate-400">{l.nota?.periodo}</td>
                  <td className="p-3 text-slate-400">{l.status_planilha}</td>
                </tr>
              ))}
              {base.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500">{carregando ? "Carregando…" : "Nada para mostrar. Suba os cancelados e as notas acima."}</td></tr>}
            </tbody>
          </table>
        </div>
        {base.length > LIMITE_TELA && <p className="text-[11px] text-slate-500">Mostrando os {LIMITE_TELA} primeiros de {base.length}. O Excel baixado traz todos.</p>}
      </div>
    </div>
  );
}
