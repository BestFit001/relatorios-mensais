"use client";
// Carrega o que a análise do Mercado Livre precisa: as duas planilhas do mês, o cadastro de anúncios/custos e as regras de recomendação.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { slugCanal } from "../../lib/adsImportDb";
import { CFG_ML_PADRAO, type AnaliseML, type CfgRecomendacao, type Contexto } from "../../lib/adsMl";
import { analisarMes, carregarCfgML, carregarContextoML, carregarEnvios, type EnvioPads, type EnvioVendas } from "../../lib/adsMlDb";

export function useDadosML(canal: string, mes: string, versaoExterna = 0) {
  const slug = slugCanal(canal);
  const [pads, setPads] = useState<EnvioPads | null>(null);
  const [vendas, setVendas] = useState<EnvioVendas | null>(null);
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [cfg, setCfg] = useState<CfgRecomendacao>(CFG_ML_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    (async () => {
      const [e, c, g] = await Promise.all([carregarEnvios(supabase, slug, mes), carregarContextoML(supabase), carregarCfgML(supabase, slug)]);
      if (!ativo) return;
      setPads(e.pads); setVendas(e.vendas); setCtx(c); setCfg(g); setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [slug, mes, versao, versaoExterna]);

  const analise: AnaliseML | null = useMemo(() => (ctx ? analisarMes(pads, vendas, ctx, cfg) : null), [pads, vendas, ctx, cfg]);
  return { slug, pads, vendas, ctx, cfg, analise, carregando, recarregar };
}
