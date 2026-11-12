"use client";
// Mapa de Cadastros > Configurações: os uploads que alimentam o painel (antes ficavam em Uploads > Cadastros e Canais).
//   • Base Central (Tiny ERP): SKU + estoque            -> cadastros_base_tiny
//   • Status (Normal / Obsoleto)                         -> status_skus_catalogo
//   • Planilhas por canal (coluna do SKU por canal)      -> mapeamento_canais_skus
// Mesma lógica de antes; a diferença é que as colunas (letras) podem ser conferidas e alteradas aqui mesmo.
import React, { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { buscarTudo } from "@/lib/buscarTudo";
import { indiceDaLetra, lerEstoque, normalizarSkuEstoque } from "@/lib/cobertura";
import { abaPrincipal } from "@/lib/lerArquivo";
import { canalTemCadastro, normalizarNomeCanal } from "@/lib/vendasCanaisLogica";
import { carregarParaExclusao, gravarParaExclusao, limparParaExclusao } from "@/lib/skusExclusao";

type Letras = { sku: string; estoque: string; status_sku: string; status_valor: string; exclusao_sku: string };
type Aviso = { tipo: "ok" | "erro"; texto: string } | null;
interface RegraCanal { id: number; canal: string; coluna_sku: string | null }

const LETRAS_PADRAO: Letras = { sku: "C", estoque: "F", status_sku: "A", status_valor: "B", exclusao_sku: "A" };
const soLetras = (v: string) => v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);

/** Lê a aba com os dados (ignora abas ocultas/vazias, como a dropdown_options_hidden das planilhas do ML). */
async function lerPrimeiraAba(arquivo: File): Promise<any[][]> {
  const wb = XLSX.read(new Uint8Array(await arquivo.arrayBuffer()), { type: "array", cellDates: true, raw: false });
  return XLSX.utils.sheet_to_json(abaPrincipal(wb), { header: 1, defval: "" }) as any[][];
}

async function gravarEmLotes(tabela: string, registros: any[], opcoes?: { onConflict: string }): Promise<string> {
  for (let i = 0; i < registros.length; i += 500) {
    const lote = registros.slice(i, i + 500);
    const { error } = opcoes ? await supabase.from(tabela).upsert(lote, opcoes) : await supabase.from(tabela).insert(lote);
    if (error) return `${tabela} (lote ${i / 500 + 1}): ${error.message}`;
  }
  return "";
}

function CampoLetra({ rotulo, valor, onMudar, onSalvar, dado }: { rotulo: string; valor: string; onMudar: (v: string) => void; onSalvar: () => void; dado: string }) {
  return (
    <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
      {rotulo}
      <input
        type="text" value={valor} maxLength={3} data-letra={dado}
        onChange={(e) => onMudar(soLetras(e.target.value))} onBlur={onSalvar}
        className="w-14 bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-indigo-400 font-mono font-bold text-center uppercase outline-none focus:border-indigo-500"
      />
    </label>
  );
}

export default function ConfigMapaCadastros({
  resumo, onAtualizado, onSincronizar, sincronizando,
}: {
  resumo: { total: number; normais: number; obsoletos: number }; onAtualizado: () => void;
  /** registra como cadastrado (por canal) todo SKU que já vendeu; mostra o resultado no aviso da página */
  onSincronizar: () => Promise<void>; sincronizando: boolean;
}) {
  const [letras, setLetras] = useState<Letras>(LETRAS_PADRAO);
  const [canais, setCanais] = useState<RegraCanal[]>([]);
  const [ocupado, setOcupado] = useState("");
  const [aviso, setAviso] = useState<Aviso>(null);
  const [novoCanal, setNovoCanal] = useState("");
  const [totalExclusao, setTotalExclusao] = useState<number | null>(null);
  const [modoExclusao, setModoExclusao] = useState<"somar" | "substituir">("somar");

  const carregar = useCallback(async () => {
    const [{ data: tiny }, { data: regras }] = await Promise.all([
      supabase.from("config_regras_tiny").select("campo, coluna"),
      supabase.from("config_regras_canais").select("id, canal, coluna_sku").order("id"),
    ]);
    if (tiny) {
      const g = (k: keyof Letras) => String(tiny.find((t: any) => t.campo === k)?.coluna || LETRAS_PADRAO[k]);
      setLetras({ sku: g("sku"), estoque: g("estoque"), status_sku: g("status_sku"), status_valor: g("status_valor"), exclusao_sku: g("exclusao_sku") });
    }
    if (regras) setCanais(regras as RegraCanal[]);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { carregarParaExclusao().then((s) => setTotalExclusao(s.size)); }, []);

  // ---- colunas (letras) ----
  const salvarLetra = async (campo: keyof Letras) => {
    const v = letras[campo];
    if (indiceDaLetra(v) < 0) { setAviso({ tipo: "erro", texto: `Coluna inválida (“${v || "vazia"}”). Use letras, como C ou AB.` }); return; }
    const { error } = await supabase.from("config_regras_tiny").upsert({ campo, coluna: v }, { onConflict: "campo" });
    setAviso(error ? { tipo: "erro", texto: "Não consegui salvar a coluna: " + error.message } : null);
  };
  const salvarColunaCanal = async (r: RegraCanal) => {
    const v = soLetras(r.coluna_sku || "");
    if (indiceDaLetra(v) < 0) { setAviso({ tipo: "erro", texto: `Coluna inválida para ${r.canal}. Use letras, como A ou AB.` }); return; }
    const { error } = await supabase.from("config_regras_canais").update({ coluna_sku: v }).eq("id", r.id);
    setAviso(error ? { tipo: "erro", texto: "Não consegui salvar a coluna do canal: " + error.message } : null);
  };

  const terminar = (tipo: "ok" | "erro", texto: string) => { setOcupado(""); setAviso({ tipo, texto }); if (tipo === "ok") onAtualizado(); };

  // ---- Base Central (Tiny) ----
  const subirTiny = async (arquivo: File | undefined | null) => {
    if (!arquivo) return;
    const iSku = indiceDaLetra(letras.sku), iEst = indiceDaLetra(letras.estoque);
    if (iSku < 0 || iEst < 0) return setAviso({ tipo: "erro", texto: "Defina as colunas de SKU e estoque antes de subir." });
    setOcupado("tiny"); setAviso(null);
    try {
      const linhas = await lerPrimeiraAba(arquivo);
      const leitura = lerEstoque(linhas, iSku, iEst);   // ignora o cabeçalho; SKU repetido tem as quantidades somadas
      if (leitura.registros.length === 0) return terminar("erro", "Nenhum SKU foi lido com essas colunas. Confira as letras do SKU e do estoque.");

      // quem sairia da base: pede confirmação se for muita coisa (sinal de coluna errada)
      const atual = await buscarTudo("cadastros_base_tiny", "id, sku");
      const novos = new Set(leitura.registros.map((r) => r.sku));
      const idsRemover: number[] = atual.filter((t: any) => !novos.has(normalizarSkuEstoque(t.sku))).map((t: any) => t.id);
      const removidos = idsRemover.length;
      if (removidos > Math.max(50, atual.length * 0.2) &&
          !confirm(`Atenção: ${removidos} dos ${atual.length} SKUs da base não estão nesta planilha e serão removidos. As colunas estão certas? Continuar?`)) {
        return terminar("erro", "Upload cancelado: nada foi alterado.");
      }

      const ts = new Date().toISOString();
      const erro = await gravarEmLotes("cadastros_base_tiny", leitura.registros.map((r) => ({ sku: r.sku, estoque: r.estoque, atualizado_em: ts })), { onConflict: "sku" });
      if (erro) return terminar("erro", "Falhou ao gravar a base do Tiny (nada foi apagado): " + erro);
      for (let i = 0; i < idsRemover.length; i += 200) {   // só depois de gravar tudo
        const del = await supabase.from("cadastros_base_tiny").delete().in("id", idsRemover.slice(i, i + 200));
        if (del.error) return terminar("erro", `Estoque gravado (${leitura.registros.length} SKUs), mas não consegui remover os que saíram da planilha: ${del.error.message}`);
      }
      terminar("ok", `✅ Base Tiny substituída: ${leitura.registros.length} SKUs gravados${removidos ? `, ${removidos} que não estavam na planilha foram removidos` : ""}${leitura.repetidos.length ? `, ${leitura.repetidos.length} SKU(s) repetido(s) com as quantidades somadas` : ""}.`);
    } catch (e: any) { terminar("erro", "Erro ao ler a planilha: " + (e?.message || e)); }
  };
  const limparBaseTiny = async () => {
    if (!confirm("Tem certeza que deseja apagar toda a base do Tiny ERP?")) return;
    const { error } = await supabase.from("cadastros_base_tiny").delete().neq("id", 0);
    terminar(error ? "erro" : "ok", error ? "Não consegui limpar a base: " + error.message : "🗑️ Base do Tiny apagada.");
  };

  // ---- Status (Normal / Obsoleto) ----
  const subirStatus = async (arquivo: File | undefined | null) => {
    if (!arquivo) return;
    const iSku = indiceDaLetra(letras.status_sku), iVal = indiceDaLetra(letras.status_valor);
    if (iSku < 0 || iVal < 0) return setAviso({ tipo: "erro", texto: "Defina as colunas de SKU e status antes de subir." });
    setOcupado("status"); setAviso(null);
    try {
      const linhas = await lerPrimeiraAba(arquivo);
      const mapa = new Map<string, { sku: string; status: string }>();
      for (const row of linhas) {
        if (!row || row.length <= Math.max(iSku, iVal)) continue;
        const sku = normalizarSkuEstoque(row[iSku]);
        if (!sku) continue;
        const bruto = String(row[iVal] || "Normal").trim();
        mapa.set(sku, { sku, status: /obsoleto|inativo|arquivo|descontinuado/i.test(bruto) ? "Obsoleto" : "Normal" });
      }
      const erro = await gravarEmLotes("status_skus_catalogo", Array.from(mapa.values()), { onConflict: "sku" });
      if (erro) return terminar("erro", "Falhou ao gravar os status: " + erro);
      terminar("ok", `✅ Status atualizados: ${mapa.size} SKUs validados.`);
    } catch (e: any) { terminar("erro", "Erro ao ler a planilha: " + (e?.message || e)); }
  };

  // ---- Para exclusão (SKUs que não serão repostos) ----
  const subirExclusao = async (arquivo: File | undefined | null) => {
    if (!arquivo) return;
    const iSku = indiceDaLetra(letras.exclusao_sku);
    if (iSku < 0) return setAviso({ tipo: "erro", texto: "Defina a coluna do SKU antes de subir." });
    setOcupado("exclusao"); setAviso(null);
    try {
      const linhas = await lerPrimeiraAba(arquivo);
      const lidos: string[] = [];
      linhas.forEach((row, n) => {
        const sku = normalizarSkuEstoque(row?.[iSku]);
        if (!sku) return;
        if (n === 0 && !/\d{6,}/.test(sku)) return;   // cabeçalho ("Grade", "SKU"...)
        lidos.push(sku);
      });
      const unicos = Array.from(new Set(lidos));
      if (unicos.length === 0) return terminar("erro", "Nenhum SKU foi lido com essa coluna. Confira a letra da coluna do SKU.");
      const base = await buscarTudo("cadastros_base_tiny", "sku");
      const naBase = new Set(base.map((t: any) => normalizarSkuEstoque(t.sku)));
      const existem = unicos.filter((s) => naBase.has(s)).length;
      const erro = await gravarParaExclusao(unicos, modoExclusao === "substituir");
      if (erro) return terminar("erro", erro);
      setTotalExclusao((await carregarParaExclusao()).size);
      terminar("ok", `✅ ${unicos.length} SKU(s) marcados como “Para exclusão” (${modoExclusao === "substituir" ? "lista substituída" : "somados à lista"})${existem < unicos.length ? ` · ${unicos.length - existem} não constam na base do Tiny e não aparecem em SKUs por canal` : ""}.`);
    } catch (e: any) { terminar("erro", "Erro ao ler a planilha: " + (e?.message || e)); }
  };
  const limparExclusao = async () => {
    if (!confirm("Remover a marca “Para exclusão” de todos os SKUs?")) return;
    const erro = await limparParaExclusao();
    if (!erro) setTotalExclusao(0);
    terminar(erro ? "erro" : "ok", erro || "🗑️ Lista “Para exclusão” limpa: todos os SKUs voltam a “Mantidos”.");
  };

  // ---- Canais ----
  const subirCanal = async (r: RegraCanal, arquivos: File[]) => {
    if (arquivos.length === 0) return;
    const i = indiceDaLetra(r.coluna_sku || "A");
    if (i < 0) return setAviso({ tipo: "erro", texto: `Defina a coluna do SKU de ${r.canal} antes de subir.` });
    setOcupado("canal:" + r.canal); setAviso(null);
    try {
      const base = await buscarTudo("cadastros_base_tiny", "sku");
      const conhecidos = new Set(base.map((t: any) => normalizarSkuEstoque(t.sku)));
      const encontrados = new Set<string>();
      for (const arq of arquivos) {
        const linhas = await lerPrimeiraAba(arq);
        for (let n = 4; n < linhas.length; n++) {   // as 4 primeiras linhas são cabeçalho nas planilhas dos canais
          const row = linhas[n];
          if (!row || row.length <= i) continue;
          const sku = normalizarSkuEstoque(row[i]);
          if (sku && conhecidos.has(sku)) encontrados.add(sku);
        }
      }
      const del = await supabase.from("mapeamento_canais_skus").delete().ilike("canal", r.canal.replace(/[\\%_]/g, "\\$&"));
      if (del.error) return terminar("erro", "Não consegui limpar o canal antes de regravar: " + del.error.message);
      const erro = await gravarEmLotes("mapeamento_canais_skus", Array.from(encontrados).map((sku) => ({ canal: r.canal, sku, presente: true })));
      if (erro) return terminar("erro", `Falhou ao gravar ${r.canal}: ${erro}`);
      terminar("ok", `✅ Canal “${r.canal}” sincronizado: ${encontrados.size} SKUs presentes.`);
      await onSincronizar();   // SKU que vendeu mas não estava na planilha também conta como cadastrado
    } catch (e: any) { terminar("erro", "Erro ao ler a planilha: " + (e?.message || e)); }
  };
  const limparCanal = async (canal: string) => {
    if (!confirm(`Apagar os dados do canal "${canal}"?`)) return;
    const { error } = await supabase.from("mapeamento_canais_skus").delete().ilike("canal", canal.replace(/[\\%_]/g, "\\$&"));
    terminar(error ? "erro" : "ok", error ? "Não consegui limpar o canal: " + error.message : `🗑️ Canal “${canal}” limpo.`);
  };
  const limparTodosCanais = async () => {
    if (!confirm("Apagar os dados de TODOS os canais? O Progresso por canal volta a zero até você subir as planilhas de novo ou usar “Sincronizar com vendas”.")) return;
    setOcupado("limpar-todos"); setAviso(null);
    const { error } = await supabase.from("mapeamento_canais_skus").delete().neq("id", 0);
    terminar(error ? "erro" : "ok", error ? "Não consegui limpar os canais: " + error.message : "🗑️ Todos os canais foram limpos.");
  };

  // ---- novo canal (novos marketplaces) ----
  const adicionarCanal = async () => {
    const nome = novoCanal.trim().replace(/\s+/g, " ");
    if (!nome) return setAviso({ tipo: "erro", texto: "Digite o nome do canal." });
    if (nome.length > 40) return setAviso({ tipo: "erro", texto: "Nome muito longo (máximo 40 caracteres)." });
    if (canais.some((c) => normalizarNomeCanal(c.canal) === normalizarNomeCanal(nome))) return setAviso({ tipo: "erro", texto: `O canal “${nome}” já existe (a comparação ignora maiúsculas e acentos).` });
    setOcupado("novo-canal"); setAviso(null);
    const { error } = await supabase.from("config_regras_canais").insert({ canal: nome, coluna_sku: "A" });
    if (error) return terminar("erro", "Não consegui criar o canal: " + error.message);
    setNovoCanal(""); await carregar();
    terminar("ok", `✅ Canal “${nome}” criado. Suba a planilha dele abaixo (ajuste a coluna do SKU se precisar). Para usar nos uploads de vendas e no Dashboard, configure também em Regras Gerais.`);
  };

  const arquivoCls = "block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-white file:font-bold file:cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700 disabled:opacity-50";

  return (
    <div className="space-y-6" data-config-mapa>
      <p className="text-xs text-slate-400">
        Estas planilhas alimentam o painel de Progresso e os Gráficos. Confira as colunas, suba o arquivo e o painel é atualizado na hora.
      </p>

      {aviso && (
        <div data-aviso className={`p-3 rounded-xl border text-xs font-bold ${aviso.tipo === "ok" ? "bg-emerald-950/40 border-emerald-700/50 text-emerald-300" : "bg-rose-950/40 border-rose-800/60 text-rose-200"}`}>{aviso.texto}</div>
      )}
      {ocupado && <div className="p-3 rounded-xl border border-indigo-800/50 bg-indigo-950/30 text-indigo-300 text-xs font-bold" data-processando>Processando a planilha… não feche a página.</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total SKUs Tiny</span>
          <p className="text-3xl font-black text-white mt-2" data-resumo-total>{resumo.total}</p>
        </div>
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg">
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Normais</span>
          <p className="text-3xl font-black text-white mt-2">{resumo.normais}</p>
        </div>
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg">
          <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">Obsoletos</span>
          <p className="text-3xl font-black text-white mt-2">{resumo.obsoletos}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Base Central (Tiny ERP)</h3>
            <button type="button" onClick={limparBaseTiny} disabled={!!ocupado} className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[10px] font-bold py-1 px-2.5 rounded-lg cursor-pointer disabled:opacity-50">🗑️ Limpar Base Tiny</button>
          </div>
          <p className="text-xs text-slate-400">Substitui o estoque da base: SKU que não vier na planilha sai da base e SKU repetido tem as quantidades somadas (mesma regra da Curva ABC).</p>
          <div className="flex flex-wrap gap-4">
            <CampoLetra rotulo="Coluna do SKU" dado="sku" valor={letras.sku} onMudar={(v) => setLetras((l) => ({ ...l, sku: v }))} onSalvar={() => salvarLetra("sku")} />
            <CampoLetra rotulo="Coluna do estoque" dado="estoque" valor={letras.estoque} onMudar={(v) => setLetras((l) => ({ ...l, estoque: v }))} onSalvar={() => salvarLetra("estoque")} />
          </div>
          <input type="file" accept=".xlsx,.xls,.csv" disabled={!!ocupado} data-upload-tiny onChange={(e) => { subirTiny(e.target.files?.[0]); e.target.value = ""; }} className={arquivoCls + " file:bg-indigo-600"} />
        </div>

        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Status (Normal / Obsoleto)</h3>
          <p className="text-xs text-slate-400">Quem estiver como obsoleto, inativo, arquivo ou descontinuado vira “Obsoleto”; o resto é “Normal”.</p>
          <div className="flex flex-wrap gap-4">
            <CampoLetra rotulo="Coluna do SKU" dado="status_sku" valor={letras.status_sku} onMudar={(v) => setLetras((l) => ({ ...l, status_sku: v }))} onSalvar={() => salvarLetra("status_sku")} />
            <CampoLetra rotulo="Coluna do status" dado="status_valor" valor={letras.status_valor} onMudar={(v) => setLetras((l) => ({ ...l, status_valor: v }))} onSalvar={() => salvarLetra("status_valor")} />
          </div>
          <input type="file" accept=".xlsx,.xls,.csv" disabled={!!ocupado} data-upload-status onChange={(e) => { subirStatus(e.target.files?.[0]); e.target.value = ""; }} className={arquivoCls + " file:bg-violet-600"} />
        </div>
      </div>

      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4" data-config-exclusao>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Produtos para exclusão</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400"><strong className="text-amber-300" data-total-exclusao>{totalExclusao ?? "…"}</strong> SKU(s) marcados</span>
            <button type="button" onClick={limparExclusao} disabled={!!ocupado || !totalExclusao} data-limpar-exclusao className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[10px] font-bold py-1 px-2.5 rounded-lg cursor-pointer disabled:opacity-40">🗑️ Limpar lista</button>
          </div>
        </div>
        <p className="text-xs text-slate-400">Suba a planilha dos produtos que não serão repostos e indique a coluna do SKU. Todos os SKUs dela ficam com a tag “Para exclusão” em SKUs por canal, onde dá para filtrar por “Para exclusão” ou “Mantidos”.</p>
        <div className="flex flex-wrap items-center gap-4">
          <CampoLetra rotulo="Coluna do SKU" dado="exclusao_sku" valor={letras.exclusao_sku} onMudar={(v) => setLetras((l) => ({ ...l, exclusao_sku: v }))} onSalvar={() => salvarLetra("exclusao_sku")} />
          <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">Ao subir:
            <select value={modoExclusao} onChange={(e) => setModoExclusao(e.target.value as any)} data-modo-exclusao className="bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-200 font-semibold normal-case outline-none cursor-pointer">
              <option value="somar">somar à lista atual</option>
              <option value="substituir">substituir a lista atual</option>
            </select>
          </label>
        </div>
        <input type="file" accept=".xlsx,.xls,.csv" disabled={!!ocupado} data-upload-exclusao onChange={(e) => { subirExclusao(e.target.files?.[0]); e.target.value = ""; }} className={arquivoCls + " file:bg-amber-600"} />
      </div>

      <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
          <h2 className="text-lg font-bold text-white">Upload e Gestão Individual dos Canais</h2>
          <button type="button" onClick={limparTodosCanais} disabled={!!ocupado} data-limpar-todos
            className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[11px] font-bold py-1.5 px-3 rounded-lg cursor-pointer disabled:opacity-50">🗑️ Limpar todos os canais</button>
        </div>
        <p className="text-xs text-slate-400 mb-4">Suba as planilhas por canal definindo a coluna onde o SKU será lido (fica salva). Pode enviar vários arquivos de uma vez.</p>

        <form onSubmit={(e) => { e.preventDefault(); adicionarCanal(); }} className="flex flex-wrap items-center gap-2 mb-6" data-form-novo-canal>
          <input type="text" value={novoCanal} onChange={(e) => setNovoCanal(e.target.value)} maxLength={40} placeholder="Novo canal (ex.: Kabum)" data-novo-canal
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 w-64" />
          <button type="submit" disabled={!!ocupado || !novoCanal.trim()} data-adicionar-canal
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer disabled:opacity-40">+ Adicionar canal</button>
        </form>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {canais.filter((r) => canalTemCadastro(r.canal)).map((r) => (   // canais sem catálogo (clubes) não têm upload
            <div key={r.id} data-canal-card={r.canal} className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between gap-4">
              <div className="flex justify-between items-center">
                <span className="font-bold text-white text-sm">{r.canal}</span>
                <button type="button" onClick={() => limparCanal(r.canal)} disabled={!!ocupado} className="text-rose-400 text-[10px] font-bold bg-rose-950/40 px-2.5 py-1 rounded cursor-pointer disabled:opacity-50">Limpar</button>
              </div>
              <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">Coluna SKU:
                <input
                  type="text" value={r.coluna_sku || "A"} maxLength={3} data-letra-canal={r.canal}
                  onChange={(e) => setCanais((lista) => lista.map((x) => (x.id === r.id ? { ...x, coluna_sku: soLetras(e.target.value) } : x)))}
                  onBlur={() => salvarColunaCanal(r)}
                  className="w-14 bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-indigo-400 font-mono font-bold text-center uppercase outline-none focus:border-indigo-500"
                />
              </label>
              <input type="file" multiple accept=".xlsx,.xls,.csv" disabled={!!ocupado} data-upload-canal={r.canal}
                onChange={(e) => { const arquivos = Array.from(e.target.files || []); e.target.value = ""; subirCanal(r, arquivos); }}   /* copia antes de limpar: o FileList esvazia junto com o campo */
                className="block w-full text-[10px] text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200 cursor-pointer bg-slate-900 p-1.5 rounded-lg border border-slate-800 disabled:opacity-50" />
            </div>
          ))}
          {canais.length === 0 && <p className="text-xs text-slate-500">Nenhum canal cadastrado em Regras Gerais.</p>}
        </div>
      </div>

      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-3xl">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Vendas → Cadastros</h3>
          <p className="text-xs text-slate-400 mt-1">
            Se um SKU vendeu em um canal (pelos uploads de vendas) mas não consta como cadastrado nele, o Mapa registra como cadastrado automaticamente
            ao abrir esta tela e depois de cada upload de canal. Só entram SKUs que existem na base do Tiny.
          </p>
        </div>
        <button type="button" onClick={onSincronizar} disabled={sincronizando || !!ocupado} data-sincronizar-vendas
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black px-5 py-2.5 rounded-xl cursor-pointer disabled:opacity-40">
          {sincronizando ? "Sincronizando…" : "🔄 Sincronizar com vendas agora"}
        </button>
      </div>
    </div>
  );
}
