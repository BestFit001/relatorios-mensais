"use client";
// Adsense > Análise global > Configurações: colunas de cada planilha importada (TikTok) e parâmetros do cálculo de margem.
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { CFG_PADRAO_TIKTOK, mesclarConfig, type CfgAdsCanal } from "../../lib/adsImport";
import { carregarCfgAds, salvarCfgAds, slugCanal } from "../../lib/adsImportDb";

type Campo = { chave: string; rotulo: string; dica: string; obrigatorio?: boolean };

const CAMPOS_CAMPANHA: Campo[] = [
  { chave: "aba", rotulo: "Aba da planilha", dica: "Deixe vazio para usar a primeira aba." },
  { chave: "idProduto", rotulo: "ID do produto (TikTok)", dica: "Liga o anúncio ao SKU do vendedor.", obrigatorio: true },
  { chave: "produto", rotulo: "Nome do produto", dica: "Só para exibir." },
  { chave: "idSku", rotulo: "ID do SKU (TikTok)", dica: "Opcional: só se a planilha da campanha já vier por SKU." },
  { chave: "campanhaId", rotulo: "ID da campanha", dica: "Separa as campanhas quando a planilha tem mais de uma." },
  { chave: "campanhaNome", rotulo: "Nome da campanha", dica: "Só para exibir." },
  { chave: "investimento", rotulo: "Investimento (custo)", dica: "Quanto foi gasto no anúncio.", obrigatorio: true },
  { chave: "custoAfiliado", rotulo: "Custo de afiliados", dica: "Opcional." },
  { chave: "pedidos", rotulo: "Pedidos (unidades)", dica: "Vendas atribuídas ao anúncio.", obrigatorio: true },
  { chave: "receita", rotulo: "Receita bruta", dica: "Faturamento atribuído ao anúncio.", obrigatorio: true },
  { chave: "roi", rotulo: "ROI", dica: "Opcional: sem ele o app calcula receita ÷ custo." },
  { chave: "pdv", rotulo: "PDV (preço de venda)", dica: "Opcional: sem ele o app usa receita ÷ pedidos." },
];
const CAMPOS_CATALOGO: Campo[] = [
  { chave: "aba", rotulo: "Aba da planilha", dica: "Na planilha do TikTok a aba se chama Template." },
  { chave: "idProduto", rotulo: "ID do produto (TikTok)", dica: "Mesmo ID usado na planilha da campanha.", obrigatorio: true },
  { chave: "idSku", rotulo: "ID do SKU (TikTok)", dica: "Opcional." },
  { chave: "skuSeller", rotulo: "SKU do vendedor (nosso)", dica: "É com ele que o app acha o custo.", obrigatorio: true },
  { chave: "variacao", rotulo: "Variação", dica: "Só para exibir." },
  { chave: "nome", rotulo: "Nome do produto", dica: "Só para exibir." },
  { chave: "preco", rotulo: "Preço", dica: "Só para exibir." },
];

export default function ConfigAds() {
  const [slug, setSlug] = useState<string>("tiktok-shop");
  const [nomeCanal, setNomeCanal] = useState<string>("TikTok Shop");
  const [cfg, setCfg] = useState<CfgAdsCanal>(CFG_PADRAO_TIKTOK);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("config_regras_canais").select("canal").order("id");
      const tt = (data || []).find((c: any) => /tiktok/i.test(String(c.canal || "")));
      const s = tt ? slugCanal(tt.canal) : "tiktok-shop";
      setSlug(s); if (tt) setNomeCanal(tt.canal);
      setCfg(await carregarCfgAds(supabase, s));
      setCarregando(false);
    })();
  }, []);

  const mudar = (grupo: "campanha" | "catalogo", chave: string, valor: string) => { setCfg((c) => ({ ...c, [grupo]: { ...c[grupo], [chave]: valor } })); setMsg(null); };

  const salvar = async () => {
    setSalvando(true); setMsg(null);
    const erro = await salvarCfgAds(supabase, slug, mesclarConfig(cfg));
    setSalvando(false);
    setMsg(erro ? { tipo: "erro", texto: erro } : { tipo: "ok", texto: "Configuração salva. As próximas importações já usam essas colunas." });
  };
  const restaurar = () => { setCfg(CFG_PADRAO_TIKTOK); setMsg({ tipo: "ok", texto: "Padrão restaurado: clique em Salvar para gravar." }); };

  const bloco = (titulo: string, subtitulo: string, grupo: "campanha" | "catalogo", campos: Campo[]) => (
    <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl" data-cfg-bloco={grupo}>
      <h3 className="text-sm font-black text-white mb-1">{titulo}</h3>
      <p className="text-[11px] text-slate-400 mb-4">{subtitulo}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
        {campos.map((c) => (
          <div key={c.chave}>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{c.rotulo}{c.obrigatorio && <span className="text-rose-400"> *</span>}</label>
            <input data-cfg={`${grupo}.${c.chave}`} value={(cfg[grupo] as any)[c.chave] ?? ""} onChange={(e) => mudar(grupo, c.chave, e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-purple-500" />
            <p className="text-[10px] text-slate-500 mt-0.5">{c.dica}</p>
          </div>
        ))}
      </div>
    </div>
  );

  if (carregando) return <p className="p-8 text-center text-slate-400">Carregando configurações…</p>;

  return (
    <div className="space-y-6" data-config-ads>
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <h2 className="text-lg font-bold text-white">⚙️ Importação de planilhas — {nomeCanal}</h2>
        <p className="text-xs text-slate-400 mt-1">
          Em cada campo, informe a <strong className="text-slate-200">letra da coluna</strong> (ex.: G) ou o <strong className="text-slate-200">nome do cabeçalho</strong> (ex.: Receita bruta).
          O app localiza as colunas sozinho a cada importação, sem precisar mexer na planilha. Campos com <span className="text-rose-400">*</span> são obrigatórios.
          Os canais que aparecem no menu Adsense são os marcados como visíveis em Regras Gerais.
        </p>
      </div>

      {bloco("1. Planilha da campanha", "Exportação do TikTok Ads (Product data): uma linha por produto, com custo, pedidos, receita e ROI.", "campanha", CAMPOS_CAMPANHA)}
      {bloco("2. Planilha de anúncios", "Modelo \"Sales information\" do TikTok Seller Center: relaciona o ID do produto ao SKU do vendedor. Fica salva e só precisa ser enviada de novo quando houver anúncios novos.", "catalogo", CAMPOS_CATALOGO)}

      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl" data-cfg-bloco="calculo">
        <h3 className="text-sm font-black text-white mb-4">3. Cálculo da margem líquida</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <label className="flex items-start gap-3 cursor-pointer md:col-span-3">
            <input type="checkbox" data-cfg="somarAfiliado" checked={cfg.somarAfiliado} onChange={(e) => { setCfg((c) => ({ ...c, somarAfiliado: e.target.checked })); setMsg(null); }} className="mt-0.5 w-4 h-4 accent-purple-500" />
            <span className="text-xs text-slate-300"><strong className="text-white">Somar o custo de afiliados ao investimento.</strong> <span className="text-slate-500">Ligado: a margem desconta custo + custo de afiliados. Desligado: só o custo do anúncio.</span></span>
          </label>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Imposto sobre a receita (%)</label>
            <input type="number" step="0.01" data-cfg="impostoPct" value={cfg.impostoPct} onChange={(e) => { setCfg((c) => ({ ...c, impostoPct: e.target.value === "" ? ("" as any) : Number(e.target.value) })); setMsg(null); }} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-purple-500" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Embalagem por pedido (R$)</label>
            <input type="number" step="0.01" data-cfg="embalagemUn" value={cfg.embalagemUn} onChange={(e) => { setCfg((c) => ({ ...c, embalagemUn: e.target.value === "" ? ("" as any) : Number(e.target.value) })); setMsg(null); }} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-purple-500" />
          </div>
          <p className="text-[10px] text-slate-500 md:col-span-3">Comissão, tarifa fixa e frete do canal vêm da tabela de tarifação em Regras Gerais; o custo do produto vem da base de custos por SKU.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" data-salvar-cfg-ads onClick={salvar} disabled={salvando} className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">{salvando ? "Salvando…" : "Salvar configuração"}</button>
        <button type="button" onClick={restaurar} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold py-2.5 px-5 rounded-xl text-xs cursor-pointer">Restaurar padrão do TikTok</button>
        {msg && <span data-cfg-msg className={`text-xs font-bold ${msg.tipo === "ok" ? "text-emerald-400" : "text-rose-400"}`}>{msg.texto}</span>}
      </div>
    </div>
  );
}
