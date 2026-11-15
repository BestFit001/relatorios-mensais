"use client";
// Carrega o que a análise do Mercado Livre precisa: o relatório em vigor (último envio), o resumo do anterior, o cadastro de anúncios/custos e as regras.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { slugCanal } from "../../lib/adsImportDb";
import { CFG_ML_PADRAO, type AnaliseML, type CfgRecomendacao, type Contexto, type ResumoML } from "../../lib/adsMl";
import { analisarAtual, carregarAnterior, carregarAtual, carregarCfgML, carregarContextoML, type AtualML } from "../../lib/adsMlDb";

export function useDadosML(canal: string) {
  const slug = slugCanal(canal);
  const [atual, setAtual] = useState<AtualML | null>(null);
  const [anterior, setAnterior] = useState<ResumoML | null>(null);
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [cfg, setCfg] = useState<CfgRecomendacao>(CFG_ML_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    (async () => {
      const [a, ant, c, g] = await Promise.all([carregarAtual(supabase, slug), carregarAnterior(supabase, slug), carregarContextoML(supabase), carregarCfgML(supabase, slug)]);
      if (!ativo) return;
      setAtual(a); setAnterior(ant); setCtx(c); setCfg(g); setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [slug, versao]);

  const analise: AnaliseML | null = useMemo(() => (ctx ? analisarAtual(atual, ctx, cfg) : null), [atual, ctx, cfg]);
  return { slug, atual, pads: atual?.pads ?? null, vendas: atual?.vendas ?? null, mes: atual?.mes ?? null, anterior, ctx, cfg, analise, carregando, recarregar };
}
