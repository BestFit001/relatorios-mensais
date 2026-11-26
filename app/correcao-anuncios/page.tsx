"use client";
// Correção de anúncios: sobe a planilha de produtos do Tiny, escolhe com qual modelo da Padronização cada anúncio deve se parecer e baixa a
// planilha corrigida (título, descrição, SEO, slug, categoria, medidas e peso) para subir de volta no Tiny. Nada é salvo no banco.

import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import Navbar from "../components/Navbar";
import ComparacaoModelos, { type EscolhaTela, type ModeloResumo, type PaiParaComparar } from "../components/ComparacaoModelos";
import { descobrirLinhas } from "../../lib/estampa";
import { conteudoPeloModelo } from "../../lib/comparacaoModelos";
import { normSkuPai } from "../../lib/dimensoesPeso";
import {
  agruparAnuncios, colunasObrigatorias, corrigirGrupo, mapearColunas, montarPlanilhaCorrigida, nomeParaComparar, OPCOES_PADRAO,
  type Colunas, type GrupoAnuncio, type Linha, type OpcoesCorrecao, type ResultadoGrupo,
} from "../../lib/correcaoAnuncios";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");

interface Planilha { arquivo: string; headers: string[]; linhas: Linha[]; colunas: Colunas; grupos: GrupoAnuncio[] }
interface ParaEscolha { pais: PaiParaComparar[]; modelos: any[]; iaConfigurada: boolean; linhas: string[]; dimensoes: Map<string, any> }
interface Resultado { resultados: ResultadoGrupo[]; semModelo: string[]; avisosIA: string[]; iaUsada: number; planilha: Linha[] }

const ROTULOS_OPCOES: { campo: keyof OpcoesCorrecao; nome: string; dica: string }[] = [
  { campo: "titulo", nome: "Título", dica: "troca só a estampa no título do modelo (nas variações, mantém “- Cor - Tamanho”)" },
  { campo: "descricao", nome: "Descrição complementar", dica: "a do modelo, com a estampa trocada (ou reescrita pela IA, se você marcar)" },
  { campo: "seo", nome: "SEO e slug", dica: "título SEO, descrição SEO, palavras-chave e slug" },
  { campo: "categoria", nome: "Categoria", dica: "copiada do modelo sem mudar uma letra" },
  { campo: "medidas", nome: "Medidas e peso", dica: "do modelo (ou da aba Dimensões e Peso, se o SKU pai estiver lá)" },
];

const resumo = (t: string, n = 90) => { const s = String(t ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };

export default function CorrecaoAnunciosPage() {
  const [planilha, setPlanilha] = useState<Planilha | null>(null);
  const [msg, setMsg] = useState("");
  const [opcoes, setOpcoes] = useState<OpcoesCorrecao>(OPCOES_PADRAO);
  const [ocupado, setOcupado] = useState("");
  const [escolha, setEscolha] = useState<ParaEscolha | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function lerArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setMsg(""); setResultado(null); setPlanilha(null);
    try {
      const buffer = await arquivo.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const aba = wb.Sheets[wb.SheetNames[0]];
      const cabecalho = (XLSX.utils.sheet_to_json(aba, { header: 1, defval: "" })[0] as any[] | undefined) || [];
      const headers = cabecalho.map((h) => String(h ?? "").trim()).filter(Boolean);
      const linhas = XLSX.utils.sheet_to_json(aba, { defval: "" }) as Linha[];
      const colunas = mapearColunas(headers);
      const falta = colunasObrigatorias(colunas);
      if (falta.length) { setMsg(`Essa planilha não parece ser a de produtos do Tiny: faltam as colunas ${falta.join(" e ")}. Exporte os produtos pelo Tiny e suba o arquivo sem mudar o cabeçalho.`); return; }
      const grupos = agruparAnuncios(linhas, colunas);
      if (grupos.length === 0) { setMsg("Não encontrei nenhum produto nessa planilha."); return; }
      setPlanilha({ arquivo: arquivo.name, headers, linhas, colunas, grupos });
    } catch (err: any) {
      setMsg("Não consegui ler a planilha: " + (err?.message || err));
    }
  }

  async function escolherModelos() {
    if (!planilha) return;
    setOcupado("Carregando os modelos da Padronização…"); setMsg("");
    try {
      const { data: modelos, error } = await supabase.from("padroes_anuncios").select("*").order("titulo");
      if (error) throw error;
      if (!modelos || modelos.length === 0) { setMsg("A aba Padronização IA ainda não tem nenhum modelo cadastrado. Cadastre ou importe os modelos primeiro."); setOcupado(""); return; }
      const { data: dims } = await supabase.from("dimensoes_peso").select("*").in("sku_pai", planilha.grupos.map((g) => g.chave));
      const dimensoes = new Map<string, any>();
      (dims || []).forEach((d: any) => dimensoes.set(normSkuPai(d.sku_pai), d));
      let iaConfigurada = false;
      try { iaConfigurada = !!(await (await fetch("/api/ia-status")).json()).configurada; } catch { /* sem resposta: sem IA */ }
      const pais: PaiParaComparar[] = planilha.grupos.map((g) => ({ chave: g.chave, nome: nomeParaComparar(g.nomeAtual), marca: g.marca || "Best Fit", variacoes: Math.max(1, g.filhosIdx.length) }));
      const porMarca = new Map<string, string[]>();
      pais.forEach((p) => porMarca.set(p.marca, [...(porMarca.get(p.marca) || []), p.nome]));
      const linhas = Array.from(porMarca.entries()).flatMap(([marca, nomes]) => descobrirLinhas(nomes, marca));
      setEscolha({ pais, modelos: modelos.map((m: any) => ({ ...m, id: String(m.id) })), iaConfigurada, linhas, dimensoes });
    } catch (err: any) {
      setMsg("Erro ao preparar as escolhas: " + (err?.message || err));
    }
    setOcupado("");
  }

  async function corrigir(escolhas: Record<string, EscolhaTela>) {
    if (!planilha || !escolha) return;
    const { modelos, linhas: linhasExtras, dimensoes } = escolha;
    setEscolha(null);
    setOcupado("Corrigindo os anúncios…");
    try {
      const modeloDe = (id: string | null) => (id ? modelos.find((m: any) => String(m.id) === String(id)) || null : null);
      // 1) IA (opcional): só a descrição dos anúncios marcados, poucos por vez
      const descricaoIA = new Map<string, string>();
      const avisosIA: string[] = [];
      const pedidos = planilha.grupos.flatMap((g) => {
        const esc = escolhas[g.chave]; const modelo = modeloDe(esc?.modeloId ?? null);
        if (!esc?.usarIA || !modelo || !String(modelo.descricao_complementar || "").trim()) return [];
        const marca = g.marca || "Best Fit";
        const c = conteudoPeloModelo(nomeParaComparar(g.nomeAtual), marca, modelo, linhasExtras);
        return [{ chave: g.chave, descricaoModelo: String(modelo.descricao_complementar), trocas: c.comparacao.trocas, marca }];
      });
      for (let i = 0; i < pedidos.length; i += 3) {
        setOcupado(`A IA está reescrevendo as descrições (${Math.min(i + 3, pedidos.length)} de ${pedidos.length})…`);
        const res = await fetch("/api/corrigir-anuncios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens: pedidos.slice(i, i + 3) }) });
        const texto = await res.text();
        let dados: any = {};
        try { dados = JSON.parse(texto); } catch { /* corpo vazio */ }
        if (!res.ok || !dados.resultados) { avisosIA.push(dados.error || `a IA não respondeu (HTTP ${res.status}); essas descrições saíram só com a troca da estampa`); continue; }
        Object.entries<any>(dados.resultados).forEach(([chave, r]) => {
          if (r?.texto) descricaoIA.set(chave, r.texto);
          else if (r?.motivo && !avisosIA.includes(r.motivo)) avisosIA.push(r.motivo);
        });
      }
      // 2) correção de cada anúncio (sem rede)
      setOcupado("Montando a planilha corrigida…");
      const resultados: ResultadoGrupo[] = [];
      const semModelo: string[] = [];
      for (const g of planilha.grupos) {
        const esc = escolhas[g.chave]; const modelo = modeloDe(esc?.modeloId ?? null);
        if (!modelo) { semModelo.push(g.chave); continue; }
        const d = dimensoes.get(normSkuPai(g.chave)) || null;
        resultados.push(corrigirGrupo(planilha.linhas, g, planilha.colunas, modelo, opcoes, {
          tituloFinal: esc.titulo, descricaoIA: descricaoIA.get(g.chave), linhasExtras,
          dimensoes: d ? { altura: d.altura, largura: d.largura, comprimento: d.comprimento, peso: d.peso } : null,
        }));
      }
      setResultado({ resultados, semModelo, avisosIA, iaUsada: descricaoIA.size, planilha: montarPlanilhaCorrigida(planilha.linhas, resultados) });
    } catch (err: any) {
      setMsg("Erro ao corrigir: " + (err?.message || err));
    }
    setOcupado("");
  }

  function baixarPlanilha() {
    if (!planilha || !resultado) return;
    const ws = XLSX.utils.json_to_sheet(resultado.planilha, { header: planilha.headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produtos Tiny");
    XLSX.writeFile(wb, `anuncios_corrigidos_${Date.now()}.xlsx`);
  }

  function baixarRelatorio() {
    if (!resultado) return;
    const linhas = resultado.resultados.flatMap((r) => r.alteracoes.map((a) => ({ "SKU pai": r.chave, "SKU": a.sku, "Tipo": a.tipo, "Campo": a.campo, "Antes": a.antes, "Depois": a.depois })));
    const ws = XLSX.utils.json_to_sheet(linhas, { header: ["SKU pai", "SKU", "Tipo", "Campo", "Antes", "Depois"] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Alterações");
    XLSX.writeFile(wb, `relatorio_correcao_${Date.now()}.xlsx`);
  }

  const totais = useMemo(() => {
    if (!resultado) return null;
    const linhasAlteradas = resultado.resultados.reduce((s, r) => s + r.linhasNovas.size, 0);
    const comMudanca = resultado.resultados.filter((r) => r.alteracoes.length > 0).length;
    return { linhasAlteradas, comMudanca, semMudanca: resultado.resultados.length - comMudanca };
  }, [resultado]);

  const nVariacoes = planilha ? planilha.grupos.reduce((s, g) => s + g.filhosIdx.length, 0) : 0;
  const algumaOpcao = Object.values(opcoes).some(Boolean);

  return (
    <div className="min-h-screen bg-[#0d0f18] text-white p-6">
      <Navbar />
      <div className="max-w-7xl mx-auto space-y-6 mt-6">
        <div className="bg-[#131625] p-6 rounded-xl border border-gray-800">
          <h1 className="text-2xl font-bold">Correção de anúncios</h1>
          <p className="text-gray-400 text-sm mt-1">
            Suba a planilha de produtos exportada do Tiny, escolha com qual produto da Padronização IA cada anúncio deve se parecer e baixe a planilha corrigida
            para subir de volta no Tiny. Nada é salvo no app.
          </p>
        </div>

        {msg && <div data-corr-msg className="bg-amber-950/40 border border-amber-800/60 text-amber-200 text-sm rounded-xl p-4">{msg}</div>}
        {ocupado && <div data-corr-ocupado className="bg-purple-950/40 border border-purple-800/60 text-purple-200 text-sm rounded-xl p-4">{ocupado}</div>}

        <div className="bg-[#131625] p-6 rounded-xl border border-gray-800 space-y-4" data-corr-upload>
          <h2 className="text-lg font-semibold text-purple-400">1. Planilha de produtos do Tiny</h2>
          <input data-corr-arquivo type="file" accept=".xlsx,.xls,.csv" onChange={lerArquivo}
            className="block text-sm text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-700 file:text-white file:font-semibold file:cursor-pointer" />
          {planilha && (
            <div data-corr-resumo className="text-sm text-gray-300 space-y-1">
              <p><strong className="text-white">{planilha.arquivo}</strong>: {planilha.linhas.length} linha(s), {planilha.grupos.length} anúncio(s) ({nVariacoes} variação(ões)).</p>
              {(["categoria", "compl", "slug", "altura", "pesoBruto"] as (keyof Colunas)[]).some((k) => !planilha.colunas[k]) && (
                <p className="text-amber-300 text-xs">
                  Colunas que não existem nessa planilha e, por isso, não serão corrigidas: {[
                    ["categoria", "Categoria"], ["compl", "Descrição complementar"], ["tituloSeo", "Título SEO"], ["descSeo", "Descrição SEO"], ["kw", "Palavras chave SEO"], ["slug", "Slug"],
                    ["altura", "Altura embalagem"], ["largura", "Largura embalagem"], ["comprimento", "Comprimento embalagem"], ["pesoLiq", "Peso líquido (Kg)"], ["pesoBruto", "Peso bruto (Kg)"],
                  ].filter(([k]) => !planilha.colunas[k as keyof Colunas]).map(([, n]) => n).join(", ") || "nenhuma"}.
                </p>
              )}
            </div>
          )}
        </div>

        {planilha && (
          <div className="bg-[#131625] p-6 rounded-xl border border-gray-800 space-y-4" data-corr-opcoes>
            <h2 className="text-lg font-semibold text-purple-400">2. O que corrigir</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ROTULOS_OPCOES.map((o) => (
                <label key={o.campo} className="flex items-start gap-2 text-sm text-gray-200 cursor-pointer">
                  <input type="checkbox" data-corr-opcao={o.campo} checked={opcoes[o.campo]} onChange={(e) => setOpcoes((s) => ({ ...s, [o.campo]: e.target.checked }))} className="accent-purple-600 mt-1" />
                  <span><b>{o.nome}</b><span className="block text-xs text-gray-400">{o.dica}</span></span>
                </label>
              ))}
            </div>
            <button type="button" data-corr-escolher disabled={!!ocupado || !algumaOpcao} onClick={escolherModelos}
              className="bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold cursor-pointer">
              Escolher o modelo de cada anúncio
            </button>
          </div>
        )}

        {resultado && totais && (
          <div className="bg-[#131625] p-6 rounded-xl border border-emerald-900/60 space-y-4" data-corr-resultado>
            <h2 className="text-lg font-semibold text-emerald-300">3. Planilha corrigida</h2>
            <p className="text-sm text-gray-200">
              {totais.comMudanca} anúncio(s) corrigido(s) ({totais.linhasAlteradas} linha(s) alterada(s))
              {totais.semMudanca ? `, ${totais.semMudanca} já estavam iguais ao modelo` : ""}
              {resultado.semModelo.length ? `, ${resultado.semModelo.length} sem modelo (ficaram como vieram)` : ""}.
              {resultado.iaUsada ? ` A IA reescreveu ${resultado.iaUsada} descrição(ões).` : " Nenhuma IA foi usada (zero tokens)."}
            </p>
            {resultado.avisosIA.length > 0 && <p className="text-xs text-amber-300">⚠️ IA: {resultado.avisosIA.join(" | ")}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" data-corr-baixar onClick={baixarPlanilha} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-lg text-sm font-bold cursor-pointer">Baixar planilha corrigida (Tiny)</button>
              <button type="button" data-corr-relatorio onClick={baixarRelatorio} className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2.5 rounded-lg text-sm cursor-pointer">Baixar relatório de alterações</button>
              <button type="button" data-corr-trocar onClick={escolherModelos} className="bg-gray-800 hover:bg-gray-700 text-gray-200 px-5 py-2.5 rounded-lg text-sm cursor-pointer">Refazer as escolhas</button>
            </div>
            <div className="space-y-2">
              {resultado.resultados.map((r) => (
                <details key={r.chave} data-corr-anuncio={r.chave} className="bg-[#0d0f18] border border-gray-800 rounded-lg p-3">
                  <summary className="cursor-pointer text-sm">
                    <span className="font-mono text-purple-300">{r.chave}</span>{" "}
                    {r.alteracoes.length === 0 ? <span className="text-gray-400">já está igual ao modelo “{resumo(r.modeloTitulo, 50)}”</span> : (
                      <><span className="text-red-300 line-through">{resumo(r.nomeAtual, 60)}</span> → <span className="text-emerald-300">{resumo(r.tituloNovo, 60)}</span></>
                    )}
                    <span className="text-xs text-gray-500"> · modelo: {resumo(r.modeloTitulo, 50)}</span>
                  </summary>
                  {r.avisos.length > 0 && <p className="text-xs text-amber-300 mt-2">{r.avisos.join("; ")}</p>}
                  {r.alteracoes.length > 0 && (
                    <div className="overflow-x-auto mt-2">
                      <table className="w-full text-xs text-left">
                        <thead><tr className="text-[10px] uppercase text-gray-500 border-b border-gray-800"><th className="py-1 pr-3">SKU</th><th className="py-1 pr-3">Campo</th><th className="py-1 pr-3">Antes</th><th className="py-1">Depois</th></tr></thead>
                        <tbody>
                          {r.alteracoes.map((a, i) => (
                            <tr key={i} className="border-b border-gray-900 align-top">
                              <td className="py-1 pr-3 font-mono text-gray-300 whitespace-nowrap">{a.sku}</td>
                              <td className="py-1 pr-3 text-gray-300 whitespace-nowrap">{a.campo}</td>
                              <td className="py-1 pr-3 text-red-300">{resumo(a.antes, 110) || "(vazio)"}</td>
                              <td className="py-1 text-emerald-300">{resumo(a.depois, 110)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </details>
              ))}
            </div>
          </div>
        )}
      </div>

      {escolha && (
        <ComparacaoModelos modo="correcao" pais={escolha.pais} modelos={escolha.modelos as ModeloResumo[]} iaConfigurada={escolha.iaConfigurada} linhas={escolha.linhas}
          onCancelar={() => setEscolha(null)} onConfirmar={corrigir} />
      )}
    </div>
  );
}
