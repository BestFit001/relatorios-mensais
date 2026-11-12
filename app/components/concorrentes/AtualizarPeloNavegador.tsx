"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { atualizarHref } from "../../../lib/concorrentes/atualizar";
import { contarPorEndereco, montarLista } from "../../../lib/concorrentes/atualizacao";
import { botao, campo, caixa, chamar, type Anuncio } from "./comum";

/** Texto do aviso depois de importar o resultado do favorito "Atualizar preços". */
export function resumoAtualizacao(r: any): string {
  const partes = [`${r.atualizados} anúncio(s) atualizado(s)`];
  if (r.mudancasPreco) partes.push(`${r.mudancasPreco} mudança(s) de preço registrada(s)`);
  else partes.push("nenhuma mudança de preço");
  if (r.naoEncontrados) partes.push(`${r.naoEncontrados} não estão no painel (ignorado[s])`);
  if (r.semPreco) partes.push(`${r.semPreco} sem preço na página`);
  if (r.desativadosIgnorados) partes.push(`${r.desativadosIgnorados} desativado(s) ignorado(s)`);
  if (r.precosMeusAtualizados) partes.push(`${r.precosMeusAtualizados} preço(s) de anúncio meu atualizado(s) nos comparativos`);
  return partes.join(", ") + ".";
}

/**
 * "Atualizar pelo navegador": o servidor não consegue ler o Mercado Livre, o navegador do usuário consegue.
 * O painel copia a lista dos anúncios, o favorito "Atualizar preços" lê cada página e o resultado volta por aqui.
 */
export default function AtualizarPeloNavegador({ canal, anuncios, aberto, onAbrir, onAviso, onImportado, titulo = "🔄 Atualizar pelo navegador" }: {
  canal: string; anuncios: Anuncio[]; aberto: boolean; onAbrir: (v: boolean) => void;
  onAviso: (tipo: "ok" | "erro", texto: string) => void; onImportado: () => void | Promise<void>; titulo?: string;
}) {
  const [texto, setTexto] = useState("");
  const [importando, setImportando] = useState(false);
  const favoritoRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => { favoritoRef.current?.setAttribute("href", atualizarHref()); }, []);

  const lista = useMemo(() => montarLista(canal, anuncios.filter((a) => a.ativo)), [canal, anuncios]);
  const enderecos = useMemo(() => contarPorEndereco(lista.itens), [lista]);

  const copiarLista = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(lista)); onAviso("ok", `Lista de ${lista.itens.length} anúncio(s) copiada. Agora abra uma página do Mercado Livre e clique no favorito “Atualizar preços”.`); }
    catch { onAviso("erro", "Não consegui copiar a lista. Libere o acesso à área de transferência no navegador e tente de novo."); }
  };
  const copiarFavorito = async () => {
    try { await navigator.clipboard.writeText(atualizarHref()); onAviso("ok", "Código do favorito copiado. Crie um favorito novo e cole no campo de endereço (URL)."); }
    catch { onAviso("erro", "Não consegui copiar. Arraste o botão para a barra de favoritos."); }
  };
  const importar = async () => {
    setImportando(true);
    try {
      const r = await chamar("importar", "POST", { texto, canal });
      if (r.tipo !== "atualizacao") throw new Error("Esse texto não é de uma atualização: use o campo “Importar do navegador” (no alto da página) para categorias e anúncios.");
      setTexto("");
      await onImportado();
      onAviso("ok", resumoAtualizacao(r));
    } catch (e: any) { onAviso("erro", e.message); }
    finally { setImportando(false); }
  };

  return (
    <details open={aberto} onToggle={(e) => onAbrir((e.currentTarget as HTMLDetailsElement).open)} className={`${caixa}`} data-atualizar-navegador>
      <summary className="cursor-pointer select-none px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-300 flex items-center justify-between gap-3">
        <span>{titulo}</span>
        <span className="text-[10px] font-semibold normal-case text-slate-500 tracking-normal">o seu navegador abre cada anúncio e lê o preço atual: não precisa de API nem de proxy</span>
      </summary>
      <div className="px-5 pb-5 space-y-3">
        <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
          <li>
            Arraste este botão para a barra de favoritos (uma vez só):{" "}
            <a ref={favoritoRef} data-atualizar-favorito onClick={(e) => e.preventDefault()} draggable className="inline-block align-middle px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-[11px] font-black uppercase tracking-wider cursor-grab">🔄 Atualizar preços</a>{" "}
            <button data-acao="copiar-atualizar-favorito" onClick={copiarFavorito} className="text-[11px] underline text-slate-300 hover:text-white cursor-pointer">não consegui arrastar</button>
          </li>
          <li>
            <button data-acao="copiar-lista" onClick={copiarLista} disabled={!lista.itens.length} className={`${botao} bg-slate-800 text-slate-200 hover:bg-slate-700 !py-1.5`}>📋 Copiar lista ({lista.itens.length} anúncio{lista.itens.length === 1 ? "" : "s"})</button>
            {enderecos.length > 0 && <span data-enderecos className="ml-2 text-[11px] text-slate-500">endereços: {enderecos.map((e) => `${e.quantos} em ${e.endereco}`).join(" · ")}</span>}
          </li>
          <li>Abra qualquer página do Mercado Livre e clique em <b>Atualizar preços</b>: ele lê os anúncios da lista (um de cada vez, com a sua sessão) e copia o resultado.{enderecos.length > 1 && <> O navegador só deixa ler os anúncios do endereço em que a página está aberta: <b>repita com uma página de cada endereço acima</b> (a mesma lista serve).</>}</li>
          <li>Volte aqui, cole o resultado e clique em Importar: o preço atual (Por/De) é salvo e cada mudança de preço é registrada com a hora.</li>
        </ol>
        <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
          <label className="grid gap-1 text-[11px] font-bold text-slate-400">Resultado da leitura
            <textarea data-campo="atualizacao-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder={`{"v":1,"canal":"${canal}","tipo":"atualizacao",…}`} className={`${campo} w-full font-mono text-xs`} />
          </label>
          <button data-acao="importar-atualizacao" onClick={importar} disabled={importando || !texto.trim()} className={`${botao} bg-emerald-700 text-white hover:bg-emerald-600`}>{importando ? "Importando…" : "Importar atualização"}</button>
        </div>
      </div>
    </details>
  );
}
