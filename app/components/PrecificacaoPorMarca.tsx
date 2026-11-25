"use client";
import React, { useEffect, useState } from "react";
import {
  CFG_MARCAS_PADRAO, carregarCfgMarcas, salvarCfgMarcas, lerPercentual, lerUnidades,
  type CfgMarcas, type MarcaInfo,
} from "../../lib/precificacaoMarcas";

/** Configuração por marca de uma tela: carrega do banco e salva sozinha (depois de uma pausa) a cada mudança. */
export function useCfgMarcas(escopo: string) {
  const [cfg, setCfg] = useState<CfgMarcas>({ ...CFG_MARCAS_PADRAO, regras: [] });
  const [pronta, setPronta] = useState(false);
  useEffect(() => {
    let vivo = true;
    carregarCfgMarcas(escopo).then((c) => { if (vivo) { setCfg(c); setPronta(true); } });
    return () => { vivo = false; };
  }, [escopo]);
  useEffect(() => {
    if (!pronta) return;
    const t = setTimeout(() => { salvarCfgMarcas(escopo, cfg); }, 600);
    return () => clearTimeout(t);
  }, [cfg, pronta, escopo]);
  return [cfg, setCfg] as const;
}

interface Props {
  cfg: CfgMarcas;
  onChange: (cfg: CfgMarcas) => void;
  marcas: MarcaInfo[];
  /** mostra o campo de unidades comprometidas por marca (Amazon) */
  comUnidades?: boolean;
  /** texto do lucro padrão, para explicar o que vale para as marcas sem regra */
  rotuloPadrao?: string;
}

const campoCls = "bg-slate-950 border rounded-lg px-2 py-1.5 text-xs font-mono font-bold outline-none";

export default function PrecificacaoPorMarca({ cfg, onChange, marcas, comUnidades = false, rotuloPadrao = "o lucro desejado padrão" }: Props) {
  const [marcaNova, setMarcaNova] = useState("");
  const [margemNova, setMargemNova] = useState("");
  const [unidadesNovas, setUnidadesNovas] = useState("");
  const [erro, setErro] = useState("");

  const usadas = new Set(cfg.regras.map((r) => r.chave));
  const disponiveis = marcas.filter((m) => !usadas.has(m.chave));
  const qtdDe = (chave: string) => marcas.find((m) => m.chave === chave)?.qtd ?? 0;

  const adicionar = () => {
    setErro("");
    const m = marcas.find((x) => x.chave === marcaNova);
    if (!m) { setErro("Escolha a marca."); return; }
    if (lerPercentual(margemNova) === null) { setErro("Informe o lucro desejado da marca (entre 0 e 99,9%)."); return; }
    if (comUnidades && unidadesNovas.trim() && lerUnidades(unidadesNovas) === null) { setErro("As unidades devem ser um número inteiro maior que zero."); return; }
    onChange({ ...cfg, ativo: true, regras: [...cfg.regras, { chave: m.chave, nome: m.nome, margem: margemNova.trim(), unidades: unidadesNovas.trim() }] });
    setMarcaNova(""); setMargemNova(""); setUnidadesNovas("");
  };
  const alterar = (chave: string, campo: "margem" | "unidades", valor: string) =>
    onChange({ ...cfg, regras: cfg.regras.map((r) => (r.chave === chave ? { ...r, [campo]: valor } : r)) });
  const remover = (chave: string) => onChange({ ...cfg, regras: cfg.regras.filter((r) => r.chave !== chave) });

  return (
    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3" data-precificacao-marca>
      <label className="flex items-center gap-2 cursor-pointer w-fit">
        <input
          type="checkbox" checked={cfg.ativo} data-marca-ativo
          onChange={(e) => onChange({ ...cfg, ativo: e.target.checked })}
          className="w-4 h-4 accent-amber-500 cursor-pointer"
        />
        <span className="text-xs font-black text-white uppercase tracking-wider">🏷️ Precificar por marca</span>
      </label>

      {!cfg.ativo ? (
        <p className="text-[11px] text-slate-500">
          Ligue para definir um lucro desejado diferente em cada marca{comUnidades ? " (e as unidades comprometidas dela)" : ""}. Desligado, todos os SKUs usam {rotuloPadrao}.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2" data-marca-form>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Marca</label>
              <select
                value={marcaNova} onChange={(e) => setMarcaNova(e.target.value)} data-marca-select
                className={`${campoCls} border-slate-700 text-slate-200 min-w-[220px] cursor-pointer`}
              >
                <option value="">{disponiveis.length ? "Selecione a marca…" : "Todas as marcas já foram adicionadas"}</option>
                {disponiveis.map((m) => <option key={m.chave} value={m.chave}>{m.nome} ({m.qtd} SKUs)</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Lucro desejado (%)</label>
              <input
                type="number" inputMode="decimal" step="0.1" min="0" value={margemNova} data-marca-margem
                onChange={(e) => setMargemNova(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }}
                className={`${campoCls} border-amber-600/50 text-amber-300 w-28`}
              />
            </div>
            {comUnidades && (
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Unidades</label>
                <input
                  type="number" inputMode="numeric" min="1" step="1" value={unidadesNovas} data-marca-unidades
                  onChange={(e) => setUnidadesNovas(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }}
                  placeholder="padrão"
                  className={`${campoCls} border-slate-700 text-slate-200 w-24`}
                />
              </div>
            )}
            <button
              type="button" onClick={adicionar} data-marca-adicionar
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded-lg text-xs uppercase tracking-wider cursor-pointer"
            >
              + Adicionar marca
            </button>
          </div>
          {erro && <p className="text-[11px] text-rose-400" data-marca-erro>{erro}</p>}

          {cfg.regras.length > 0 && (
            <ul className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden" data-marca-lista>
              {cfg.regras.map((r) => {
                const margemOk = lerPercentual(r.margem) !== null;
                const unidadesOk = !r.unidades.trim() || lerUnidades(r.unidades) !== null;
                return (
                  <li key={r.chave} data-marca-regra={r.chave} className="flex flex-wrap items-center gap-3 px-3 py-2 bg-slate-900/60">
                    <span className="text-xs font-bold text-white min-w-[160px]">{r.nome}</span>
                    <span className="text-[10px] text-slate-500 w-16">{qtdDe(r.chave)} SKUs</span>
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 uppercase">
                      Lucro %
                      <input
                        type="number" inputMode="decimal" step="0.1" min="0" value={r.margem} data-regra-margem={r.chave}
                        onChange={(e) => alterar(r.chave, "margem", e.target.value)}
                        className={`${campoCls} ${margemOk ? "border-amber-600/50" : "border-rose-500"} text-amber-300 w-20`}
                      />
                    </label>
                    {comUnidades && (
                      <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase">
                        Unidades
                        <input
                          type="number" inputMode="numeric" min="1" step="1" value={r.unidades} placeholder="padrão" data-regra-unidades={r.chave}
                          onChange={(e) => alterar(r.chave, "unidades", e.target.value)}
                          className={`${campoCls} ${unidadesOk ? "border-slate-700" : "border-rose-500"} text-slate-200 w-20`}
                        />
                      </label>
                    )}
                    {!margemOk && <span className="text-[10px] text-rose-400">lucro inválido: vale {cfg.semRegra === "excluir" ? "ficar de fora" : "o padrão"}</span>}
                    <button
                      type="button" onClick={() => remover(r.chave)} data-regra-remover={r.chave} aria-label={`Remover ${r.nome}`}
                      className="ml-auto text-slate-500 hover:text-rose-300 text-xs px-1.5 py-1 rounded cursor-pointer"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
            <span>Marcas sem regra (e SKUs sem marca):</span>
            <select
              value={cfg.semRegra} data-marca-sem-regra
              onChange={(e) => onChange({ ...cfg, semRegra: e.target.value === "excluir" ? "excluir" : "padrao" })}
              className={`${campoCls} border-slate-700 text-slate-200 cursor-pointer`}
            >
              <option value="padrao">usar {rotuloPadrao}</option>
              <option value="excluir">ficar de fora</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
