// Nome de exibição de cada pessoa, definido pelo admin (Painel Admin > Editar). Sem nome definido, vale o que vem do e-mail.
// Fica salvo em config_regras_tiny (campo "nome_<e-mail>"), a mesma tabela de configurações que o app já usa; não precisa de tabela nova.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { EVENTO_NOMES, campoNome, definirNome, definirNomes, limparNome } from "./nomesBase";

export { EVENTO_NOMES, MAX_NOME, campoNome, limparNome, nomeDeExibicao, nomeDoEmailPadrao, nomePersonalizado } from "./nomesBase";

let carregando: Promise<void> | null = null;
let ultimaBusca = 0;

export async function carregarNomes(forcar = false): Promise<void> {
  if (typeof window === "undefined") return;
  if (!forcar && !carregando && Date.now() - ultimaBusca < 30000) return;   // várias telas pedem ao mesmo tempo: busca uma vez
  if (!carregando || forcar) {
    carregando = (async () => {
      const { data, error } = await supabase.from("config_regras_tiny").select("campo, coluna").like("campo", "nome_%");
      if (error || !data) return;   // sem rede: fica com o que já tinha
      ultimaBusca = Date.now();
      const m = new Map<string, string>();
      (data as any[]).forEach((r) => { const n = limparNome(r.coluna); if (n) m.set(String(r.campo).slice(5), n); });
      if (definirNomes(m)) window.dispatchEvent(new CustomEvent(EVENTO_NOMES));
    })().finally(() => { carregando = null; });
  }
  await carregando;
}

/** Salva (ou, com nome vazio, remove) o nome de alguém. Devolve a mensagem de erro, ou null se deu certo. */
export async function salvarNome(email: string, nome: string): Promise<string | null> {
  const campo = campoNome(email), limpo = limparNome(nome);
  const { error } = limpo
    ? await supabase.from("config_regras_tiny").upsert({ campo, coluna: limpo }, { onConflict: "campo" })
    : await supabase.from("config_regras_tiny").delete().eq("campo", campo);
  if (error) return error.message;
  definirNome(email, limpo);
  window.dispatchEvent(new CustomEvent(EVENTO_NOMES));
  return null;
}

/** Faz a tela redesenhar quando algum nome mudar (e busca os nomes na primeira vez). Use nas telas que mostram nomes de pessoas. */
export function useNomes(): number {
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    const atualizar = () => setVersao((v) => v + 1);
    window.addEventListener(EVENTO_NOMES, atualizar);
    carregarNomes();
    return () => window.removeEventListener(EVENTO_NOMES, atualizar);
  }, []);
  return versao;
}
