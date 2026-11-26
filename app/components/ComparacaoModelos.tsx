"use client";
// Tela comparativa dos Novos Cadastros: aparece ANTES de gerar a planilha do Tiny. Para cada produto pai mostra o produto novo
// ao lado do produto base (modelo da aba Padronização) e pergunta "é esse modelo?". Só depois disso o app monta título, medidas
// e descrição — quase tudo sem IA; a IA (Claude) só entra, se marcada, para escrever/ajustar a descrição.

import React, { useMemo, useState } from "react";
import { LIMITE_TITULO } from "../../lib/adaptarModelo";
import { acharModeloPorSku, compararProdutoModelo } from "../../lib/comparacaoModelos";
import { modeloParecido, rankearModelos } from "../../lib/padroesAnuncios";

export interface ModeloResumo {
  id: string; titulo: string; marca?: string | null; sku?: string | null; categoria?: string | null;
  altura?: any; largura?: any; comprimento?: any; peso?: any;
}
export interface PaiParaComparar { chave: string; nome: string; marca: string; variacoes: number }
export interface EscolhaTela { modeloId: string | null; titulo: string; usarIA: boolean }

interface Estado { decisao: "sim" | "nao"; modeloId: string; titulo: string; tituloEditado: boolean; usarIA: boolean; skuBusca: string; msgBusca: string }

const medidas = (m: ModeloResumo) => {
  const n = (v: any) => (v === null || v === undefined || v === "" ? "?" : String(v));
  return `${n(m.altura)}×${n(m.largura)}×${n(m.comprimento)} cm · ${n(m.peso)} kg`;
};

export default function ComparacaoModelos({ pais, modelos, iaConfigurada, linhas = [], modo = "cadastro", onCancelar, onConfirmar }: {
  pais: PaiParaComparar[];
  modelos: ModeloResumo[];
  /** linhas novas do lote (ex.: "Xodo"), para separar linha e estampa no título */
  linhas?: string[];
  /** "cadastro" (Novos Cadastros): produto novo; "correcao" (Correção de anúncios): anúncio que já existe, só é alterado quando há modelo */
  modo?: "cadastro" | "correcao";
  /** false = a chave ANTHROPIC_API_KEY não está no Vercel: a opção de IA fica desligada */
  iaConfigurada: boolean;
  onCancelar: () => void;
  onConfirmar: (escolhas: Record<string, EscolhaTela>) => void;
}) {
  const inicial = useMemo(() => {
    const r: Record<string, Estado> = {};
    for (const p of pais) {
      const parecido = modeloParecido(p.nome, p.marca, modelos, linhas);
      const modelo = parecido;
      // correção: se o anúncio é o PRÓPRIO modelo (mesmo SKU), o padrão é não mexer nele
      const ehOModelo = modo === "correcao" && modelos.some((m) => String(m.sku ?? "").trim() !== "" && String(m.sku).trim() === p.chave);
      const decisao: "sim" | "nao" = parecido && !ehOModelo ? "sim" : "nao";
      r[p.chave] = {
        decisao, modeloId: modelo ? String(modelo.id) : "",
        titulo: modelo ? compararProdutoModelo(p.nome, modelo.titulo, p.marca, linhas).titulo : p.nome,
        tituloEditado: false, usarIA: modo === "cadastro" && decisao === "nao" && iaConfigurada, skuBusca: "", msgBusca: "",
      };
    }
    return r;
  }, [pais, modelos, iaConfigurada, linhas, modo]);
  const [estado, setEstado] = useState<Record<string, Estado>>(inicial);
  // o ranking de modelos de cada anúncio só depende do nome: calcula uma vez (a tela re-renderiza a cada alteração)
  const ranques = useMemo(() => {
    const r: Record<string, ReturnType<typeof rankearModelos>> = {};
    for (const p of pais) r[p.chave] = rankearModelos(p.nome, p.marca, modelos, linhas);
    return r;
  }, [pais, modelos, linhas]);

  const mudar = (chave: string, f: (e: Estado) => Estado) => setEstado((s) => ({ ...s, [chave]: f(s[chave]) }));
  const modeloDe = (id: string) => modelos.find((m) => String(m.id) === id) || null;

  /** troca o modelo comparado e recalcula o título sugerido (a menos que o usuário já tenha editado) */
  const escolherModelo = (p: PaiParaComparar, id: string, extra: Partial<Estado> = {}) =>
    mudar(p.chave, (e) => {
      const m = modeloDe(id);
      return { ...e, modeloId: id, titulo: e.tituloEditado || !m ? e.titulo : compararProdutoModelo(p.nome, m.titulo, p.marca, linhas).titulo, ...extra };
    });

  const decidir = (p: PaiParaComparar, decisao: "sim" | "nao") =>
    mudar(p.chave, (e) => {
      const m = modeloDe(e.modeloId);
      return {
        ...e, decisao,
        usarIA: modo === "cadastro" && iaConfigurada && decisao === "nao",   // sem modelo a IA é quem escreve a descrição; com modelo bastam as trocas automáticas
        titulo: e.tituloEditado ? e.titulo : decisao === "sim" && m ? compararProdutoModelo(p.nome, m.titulo, p.marca, linhas).titulo : p.nome,
      };
    });

  const buscarSku = (p: PaiParaComparar) => {
    const e = estado[p.chave];
    const achou = acharModeloPorSku(e.skuBusca, modelos);
    if (!achou) {
      mudar(p.chave, (x) => ({ ...x, msgBusca: e.skuBusca.trim() ? `Nenhum modelo da Padronização tem o SKU ${e.skuBusca.trim()}. Confira o SKU ou cadastre o modelo na aba Padronização.` : "Digite o SKU do modelo." }));
      return;
    }
    mudar(p.chave, (x) => ({
      ...x, decisao: "sim", modeloId: String(achou.id), usarIA: false, msgBusca: `Modelo encontrado: ${achou.titulo}`,
      titulo: x.tituloEditado ? x.titulo : compararProdutoModelo(p.nome, achou.titulo, p.marca, linhas).titulo,
    }));
  };

  const confirmar = () => {
    const out: Record<string, EscolhaTela> = {};
    for (const p of pais) {
      const e = estado[p.chave];
      const sim = e.decisao === "sim" && !!modeloDe(e.modeloId);
      out[p.chave] = { modeloId: sim ? e.modeloId : null, titulo: sim ? e.titulo.trim() : "", usarIA: iaConfigurada && e.usarIA && (modo === "cadastro" || sim) };
    }
    onConfirmar(out);
  };

  const campo = "bg-[#1b1f38] text-sm text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none";

  return (
    <div data-comparacao className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-4">
      <div className="w-full max-w-5xl bg-[#0d0f18] border border-gray-700 rounded-2xl shadow-2xl my-6">
        <div className="p-5 border-b border-gray-800">
          <h2 className="text-xl font-bold text-white">{modo === "correcao" ? "Escolher o modelo de cada anúncio" : "Confirmar o modelo de cada produto"}</h2>
          <p className="text-xs text-gray-400 mt-1">
            {modo === "correcao"
              ? "Para cada anúncio da planilha, escolha com qual produto da aba Padronização ele deve ser parecido: o app corrige o título (troca só a estampa), a descrição, o SEO, a categoria, as medidas e o peso com base nele. Em “Não é esse modelo” o anúncio não é alterado. "
              : null}
            {modo === "correcao" ? null : "Compare o produto novo com o produto base da aba Padronização."} Se for o mesmo modelo, o app só troca a estampa (e a capacidade, se mudar) no título,
            na descrição, no SEO e nas palavras-chave, e copia categoria, medidas e peso do modelo exatamente como estão cadastrados. Se não for, a descrição sai genérica.
            {iaConfigurada
              ? " A IA (Claude, modelo mais barato) só é usada nas descrições marcadas abaixo."
              : " A IA não está configurada (falta a chave ANTHROPIC_API_KEY no Vercel): as descrições saem pelas regras automáticas."}
          </p>
        </div>

        <div className="p-5 space-y-4">
          {pais.map((p) => {
            const e = estado[p.chave];
            const ranque = ranques[p.chave] || [];
            const idsParecidos = new Set(ranque.map((r) => String(r.padrao.id)));
            const outros = modelos.filter((m) => !idsParecidos.has(String(m.id))).sort((a, b) => String(a.titulo).localeCompare(String(b.titulo)));
            const modelo = modeloDe(e.modeloId);
            const cmp = modelo ? compararProdutoModelo(p.nome, modelo.titulo, p.marca, linhas) : null;
            const nivel = modelo ? ranque.find((r) => String(r.padrao.id) === String(modelo.id))?.nivel : undefined;
            return (
              <div key={p.chave} data-comp-pai={p.chave} className="bg-[#131625] border border-gray-800 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3">
                    <p className="text-xs text-emerald-300 font-semibold">{modo === "correcao" ? "Anúncio atual" : "Produto novo"} (SKU pai {p.chave}, {p.variacoes} variação(ões))</p>
                    <p data-comp-nome className="text-sm text-white mt-1">{p.nome}</p>
                    <p className="text-xs text-gray-400 mt-1">Marca: {p.marca}</p>
                  </div>
                  <div className="rounded-lg border border-purple-900/60 bg-purple-950/20 p-3">
                    <p className="text-xs text-purple-300 font-semibold">Produto base (Padronização)</p>
                    {modelos.length === 0 ? (
                      <p className="text-sm text-gray-400 mt-1">Nenhum modelo cadastrado na aba Padronização.</p>
                    ) : (
                      <select data-comp-modelo value={e.modeloId} onChange={(ev) => escolherModelo(p, ev.target.value)} className={`${campo} w-full mt-1`}>
                        {!e.modeloId && <option value="">Escolha um modelo…</option>}
                        {ranque.length > 0 && (
                          <optgroup label="Mais parecidos com o produto novo">
                            {ranque.map((r) => <option key={r.padrao.id} value={String(r.padrao.id)}>{r.padrao.titulo}{r.padrao.sku ? ` (SKU ${r.padrao.sku})` : ""}</option>)}
                          </optgroup>
                        )}
                        {outros.length > 0 && (
                          <optgroup label="Todos os modelos">
                            {outros.map((m) => <option key={m.id} value={String(m.id)}>{m.titulo}{m.sku ? ` (SKU ${m.sku})` : ""}</option>)}
                          </optgroup>
                        )}
                      </select>
                    )}
                    {modelo && (
                      <p data-comp-dados-modelo className="text-xs text-gray-400 mt-1">
                        Categoria (copiada do modelo, sem alteração): <span className="text-purple-200">{modelo.categoria || "sem categoria"}</span> · {medidas(modelo)}
                      </p>
                    )}
                    {modelo && nivel === "mesma-linha" && <p data-comp-nivel className="text-xs text-emerald-300 mt-1">Mesmo tipo de produto e mesma linha.</p>}
                    {modelo && nivel === "mesmo-tipo" && <p data-comp-nivel className="text-xs text-amber-300 mt-1">Mesmo tipo de produto, mas outra linha: confira se a categoria e as medidas servem.</p>}
                    {modelo && !nivel && <p data-comp-nivel className="text-xs text-amber-300 mt-1">Este modelo é de outro tipo de produto: confira a categoria e as medidas.</p>}
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-xs text-gray-400">
                    É esse modelo?
                    <select data-comp-decisao value={e.decisao} onChange={(ev) => decidir(p, ev.target.value as "sim" | "nao")} className={`${campo} block mt-1 min-w-[190px]`}>
                      <option value="sim" disabled={!e.modeloId}>É esse modelo</option>
                      <option value="nao">Não é esse modelo</option>
                    </select>
                  </label>
                  <label className="text-xs text-gray-400">
                    Ou procure o modelo pelo SKU
                    <span className="flex gap-2 mt-1">
                      <input data-comp-sku value={e.skuBusca} onChange={(ev) => mudar(p.chave, (x) => ({ ...x, skuBusca: ev.target.value, msgBusca: "" }))}
                        onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); buscarSku(p); } }}
                        placeholder="SKU do modelo" className={`${campo} w-40`} />
                      <button type="button" data-comp-buscar onClick={() => buscarSku(p)} className="bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold px-3 rounded-lg cursor-pointer">Buscar</button>
                    </span>
                  </label>
                  {e.msgBusca && <p data-comp-msg-sku className={`text-xs ${e.msgBusca.startsWith("Modelo encontrado") ? "text-emerald-300" : "text-amber-300"}`}>{e.msgBusca}</p>}
                </div>

                {e.decisao === "sim" && cmp ? (
                  <div className="space-y-2">
                    <p data-comp-muda className="text-xs text-gray-300">
                      {cmp.estampaNova && (
                        <span data-comp-estampa className="block mb-1">
                          Estampa identificada: <b className="text-red-300">{cmp.estampaAntiga || "(nenhuma no modelo)"}</b> → <b className="text-emerald-300">{cmp.estampaNova}</b>. O resto do título é do modelo, sem mudar.
                        </span>
                      )}
                      {cmp.trocas.length === 0
                        ? "Mesmo nome do modelo: nada a trocar nos textos."
                        : <>Troca nos textos: {cmp.trocas.map((t, i) => <span key={i} className="mr-2"><b className="text-red-300">{t.de}</b> → <b className="text-emerald-300">{t.para || "(remover)"}</b></span>)}</>}
                    </p>
                    {cmp.capacidadeDiferente && (
                      <p data-comp-aviso-cap className="text-xs text-amber-300">⚠️ A capacidade do produto novo é diferente da do modelo. Se não for o mesmo produto, escolha “Não é esse modelo”.</p>
                    )}
                    <label className="text-xs text-gray-400 block">
                      Título que vai para o Tiny ({e.titulo.length}/{LIMITE_TITULO} caracteres)
                      <input data-comp-titulo value={e.titulo} onChange={(ev) => mudar(p.chave, (x) => ({ ...x, titulo: ev.target.value, tituloEditado: true }))} className={`${campo} w-full mt-1 ${e.titulo.length > LIMITE_TITULO ? "border-red-500" : ""}`} />
                    </label>
                    {e.titulo.length > LIMITE_TITULO && <p className="text-xs text-red-300">O título passa de {LIMITE_TITULO} caracteres; o marketplace pode cortar.</p>}
                  </div>
                ) : (
                  <p data-comp-generico className="text-xs text-gray-300">{modo === "correcao"
                    ? "Sem modelo: este anúncio não será alterado (sai na planilha exatamente como veio)."
                    : "Sem modelo de referência: o título fica como o nome do produto, a categoria fica em branco e as medidas vêm da aba Dimensões e Peso ou do cadastro (só se não houver nenhuma informação ficam as genéricas 20×20×20 cm e 0,5 kg). A descrição sai genérica."}</p>
                )}

                {(modo === "cadastro" || e.decisao === "sim") && <label className={`flex items-center gap-2 text-xs ${iaConfigurada ? "text-gray-300" : "text-gray-600"}`}>
                  <input data-comp-ia type="checkbox" disabled={!iaConfigurada} checked={iaConfigurada && e.usarIA} onChange={(ev) => mudar(p.chave, (x) => ({ ...x, usarIA: ev.target.checked }))} className="accent-purple-600" />
                  {e.decisao === "sim" ? "Usar IA para reescrever a descrição (gasta tokens; sem isso só troca a estampa)" : "Usar IA para escrever a descrição genérica (gasta tokens; sem isso usa o texto padrão)"}
                </label>}
              </div>
            );
          })}
        </div>

        <div className="p-5 border-t border-gray-800 flex justify-end gap-3">
          <button type="button" data-comp-cancelar onClick={onCancelar} className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2 rounded-lg text-sm cursor-pointer">Cancelar</button>
          <button type="button" data-comp-confirmar onClick={confirmar} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg text-sm font-bold cursor-pointer">{modo === "correcao" ? "Corrigir anúncios" : "Gerar planilha do Tiny"}</button>
        </div>
      </div>
    </div>
  );
}
