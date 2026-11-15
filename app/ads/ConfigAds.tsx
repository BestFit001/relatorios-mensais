"use client";
// Adsense > (canal) > Configurações: colunas de cada planilha importada naquele canal e parâmetros do cálculo de margem.
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { ehTikTok, mesclarConfig, numeroBR, padraoDoCanal, type CfgAdsCanal, type CustosManuais } from "../../lib/adsImport";
import RegrasSugestoesAds from "./RegrasSugestoesAds";
import { carregarCfgAds, carregarCustosManuais, salvarCfgAds, salvarCustosManuais, slugCanal } from "../../lib/adsImportDb";

type Campo = { chave: string; rotulo: string; dica: string; obrigatorio?: boolean };

const CAMPOS_CAMPANHA: Campo[] = [
  { chave: "aba", rotulo: "Aba da planilha", dica: "Deixe vazio para usar a primeira aba." },
  { chave: "idProduto", rotulo: "ID do produto / anúncio", dica: "Liga o anúncio ao SKU do vendedor.", obrigatorio: true },
  { chave: "produto", rotulo: "Nome do produto", dica: "Só para exibir." },
  { chave: "idSku", rotulo: "ID do SKU no canal", dica: "Opcional: só se a planilha da campanha já vier por SKU." },
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
  { chave: "idProduto", rotulo: "ID do produto / anúncio", dica: "Mesmo ID usado na planilha da campanha.", obrigatorio: true },
  { chave: "idSku", rotulo: "ID do SKU no canal", dica: "Opcional." },
  { chave: "skuSeller", rotulo: "SKU do vendedor (nosso)", dica: "É com ele que o app acha o custo.", obrigatorio: true },
  { chave: "variacao", rotulo: "Variação", dica: "Só para exibir." },
  { chave: "nome", rotulo: "Nome do produto", dica: "Só para exibir." },
  { chave: "preco", rotulo: "Preço", dica: "Só para exibir." },
];

export default function ConfigAds({ canal }: { canal: string }) {
  const slug = slugCanal(canal);
  const padrao = padraoDoCanal(canal);
  const tiktok = ehTikTok(canal);
  const [cfg, setCfg] = useState<CfgAdsCanal>(padrao);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [manuais, setManuais] = useState<CustosManuais>({});
  const [msgManual, setMsgManual] = useState<string>("");
  const [novoId, setNovoId] = useState("");
  const [novoCusto, setNovoCusto] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      const c = await carregarCfgAds(supabase, slug, canal);
      const m = await carregarCustosManuais(supabase, slug);
      if (vivo) { setCfg(c); setManuais(m); setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [slug, canal]);

  const mudar = (grupo: "campanha" | "catalogo", chave: string, valor: string) => { setCfg((c) => ({ ...c, [grupo]: { ...c[grupo], [chave]: valor } })); setMsg(null); };

  const salvar = async () => {
    setSalvando(true); setMsg(null);
    const erro = await salvarCfgAds(supabase, slug, mesclarConfig(cfg, padrao));
    setSalvando(false);
    setMsg(erro ? { tipo: "erro", texto: erro } : { tipo: "ok", texto: "Configuração salva. As próximas importações já usam essas colunas." });
  };
  const restaurar = () => { setCfg(padrao); setMsg({ tipo: "ok", texto: tiktok ? "Padrão restaurado: clique em Salvar para gravar." : "Campos limpos: clique em Salvar para gravar." }); };

  const gravarManuais = async (novo: CustosManuais, aviso: string) => {
    setManuais(novo);
    const erro = await salvarCustosManuais(supabase, slug, novo);
    setMsgManual(erro || aviso);
  };
  const adicionarManual = async () => {
    const id = novoId.trim().replace(/\.0$/, ""); const custo = numeroBR(novoCusto);
    if (!id || !(custo > 0)) { setMsgManual("Informe o ID do produto e um custo maior que zero."); return; }
    await gravarManuais({ ...manuais, [id]: { custo, nome: manuais[id]?.nome } }, `Custo do produto ${id} salvo. A margem já usa esse valor na aba Campanhas.`);
    setNovoId(""); setNovoCusto("");
  };
  const mudarManual = async (id: string, texto: string) => {
    const custo = numeroBR(texto);
    if (!(custo > 0)) { setMsgManual("O custo precisa ser maior que zero (para voltar ao custo da base, use Remover)."); return; }
    await gravarManuais({ ...manuais, [id]: { ...manuais[id], custo } }, `Custo do produto ${id} atualizado.`);
  };
  const removerManual = async (id: string) => {
    const { [id]: _fora, ...resto } = manuais;
    await gravarManuais(resto, `Custo do produto ${id} removido: volta a valer o custo da base.`);
  };

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
        <h2 className="text-lg font-bold text-white">⚙️ Configurações — {canal}</h2>
        <p className="text-xs text-slate-400 mt-1">
          Em cada campo, informe a <strong className="text-slate-200">letra da coluna</strong> (ex.: G) ou o <strong className="text-slate-200">nome do cabeçalho</strong> (ex.: Receita bruta).
          O app localiza as colunas sozinho a cada importação, sem precisar mexer na planilha. Campos com <span className="text-rose-400">*</span> são obrigatórios.
          Cada canal tem a sua própria configuração{tiktok ? "; o TikTok Shop já vem preenchido com o modelo do TikTok" : ", que começa em branco: preencha as colunas da planilha que esse canal exporta"}. Os canais do menu Adsense são os marcados como visíveis em Regras Gerais.
        </p>
      </div>

      {bloco("1. Planilha da campanha", tiktok ? "Exportação do TikTok Ads (Product data): uma linha por produto, com custo, pedidos, receita e ROI." : `Relatório de anúncios do ${canal}: uma linha por anúncio/produto, com investimento, pedidos, receita e ROI.`, "campanha", CAMPOS_CAMPANHA)}
      {bloco("2. Planilha de anúncios", tiktok ? "Modelo \"Sales information\" do TikTok Seller Center: relaciona o ID do produto ao SKU do vendedor. Fica salva e só precisa ser enviada de novo quando houver anúncios novos." : `Planilha de anúncios do ${canal}: relaciona o ID do anúncio ao SKU do vendedor. Fica salva e só precisa ser enviada de novo quando houver anúncios novos.`, "catalogo", CAMPOS_CATALOGO)}

      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl" data-cfg-bloco="calculo">
        <h3 className="text-sm font-black text-white mb-4">3. Cálculo da margem líquida</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <label className="flex items-start gap-3 cursor-pointer md:col-span-3">
            <input type="checkbox" data-cfg="incluirAfiliado" checked={cfg.incluirAfiliado} onChange={(e) => { setCfg((c) => ({ ...c, incluirAfiliado: e.target.checked })); setMsg(null); }} className="mt-0.5 w-4 h-4 accent-purple-500" />
            <span className="text-xs text-slate-300"><strong className="text-white">Incluir o custo de afiliados no investimento.</strong> <span className="text-slate-500">Desligado (padrão): só o custo do anúncio entra no investimento, na margem e no ROI. O valor destinado aos afiliados fica de fora.</span></span>
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

      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl" data-cfg-bloco="custos-manuais">
        <h3 className="text-sm font-black text-white mb-1">4. Custos informados à mão</h3>
        <p className="text-[11px] text-slate-400 mb-4">Para produtos sem custo na base de custos. Vale para o anúncio inteiro (ID do produto pai, o mesmo da planilha da campanha) e substitui o custo da base. A margem é recalculada na hora na aba Campanhas, onde também dá para digitar o custo direto na tabela.</p>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">ID do produto</label>
            <input data-manual-novo-id value={novoId} onChange={(e) => setNovoId(e.target.value)} placeholder="Ex.: 1735023458288764396" className="w-64 bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-purple-500 font-mono" /></div>
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Custo unitário (R$)</label>
            <input data-manual-novo-custo value={novoCusto} onChange={(e) => setNovoCusto(e.target.value)} placeholder="0,00" className="w-32 bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-purple-500" /></div>
          <button type="button" data-manual-adicionar onClick={adicionarManual} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold py-2.5 px-5 rounded-xl text-xs cursor-pointer">Adicionar custo</button>
        </div>
        {Object.keys(manuais).length === 0 ? (
          <p className="text-[11px] text-slate-500" data-manual-vazio>Nenhum custo informado à mão ainda.</p>
        ) : (
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs" data-manual-lista>
              <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px]"><tr><th className="p-3">Produto</th><th className="p-3">ID</th><th className="p-3 text-right">Custo unit. (R$)</th><th className="p-3"></th></tr></thead>
              <tbody className="divide-y divide-slate-800/70">
                {Object.entries(manuais).map(([id, m]) => (
                  <tr key={id} data-manual-linha={id}>
                    <td className="p-3 text-slate-200 max-w-[360px] truncate">{m.nome || "—"}</td>
                    <td className="p-3 font-mono text-[11px] text-slate-400">{id}</td>
                    <td className="p-3 text-right"><input key={m.custo} defaultValue={String(m.custo).replace(".", ",")} onBlur={(e) => { if (numeroBR(e.target.value) !== m.custo) mudarManual(id, e.target.value); }} className="w-28 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-right text-white outline-none focus:border-purple-500" /></td>
                    <td className="p-3 text-right"><button type="button" onClick={() => removerManual(id)} className="text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer">Remover</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {msgManual && <p data-manual-msg className="text-[11px] font-bold text-emerald-400 mt-3">{msgManual}</p>}
      </div>

      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl max-w-3xl" data-cfg-bloco="sugestoes">
        <RegrasSugestoesAds canal={canal} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" data-salvar-cfg-ads onClick={salvar} disabled={salvando} className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">{salvando ? "Salvando…" : "Salvar configuração"}</button>
        <button type="button" onClick={restaurar} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold py-2.5 px-5 rounded-xl text-xs cursor-pointer">{tiktok ? "Restaurar padrão do TikTok" : "Limpar campos"}</button>
        {msg && <span data-cfg-msg className={`text-xs font-bold ${msg.tipo === "ok" ? "text-emerald-400" : "text-rose-400"}`}>{msg.texto}</span>}
      </div>
    </div>
  );
}
