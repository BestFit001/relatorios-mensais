// Registro de conectores. Shopee e Amazon são "só pelo favorito" (fonteNavegador.ts); para ler pelo servidor, trocar por um conector completo
// (como o do Mercado Livre) e marcar `leituraServidor: true` em canais.ts.
import type { Conector } from "./tipos";
import { ErroValidacao } from "./tipos";
import { CANAIS } from "./canais";
import { conectorMercadoLivre } from "./mercadolivre";
import { conectorSoNavegador } from "./fonteNavegador";

const conectores: Record<string, Conector> = {
  mercadolivre: conectorMercadoLivre,
  shopee: conectorSoNavegador("shopee", "Shopee"),
  amazon: conectorSoNavegador("amazon", "Amazon"),
};

export function obterConector(canal: string): Conector {
  const info = CANAIS.find((c) => c.id === canal);
  if (!info) throw new ErroValidacao(`Canal desconhecido: ${canal}`);
  const c = conectores[canal];
  if (!c || !info.disponivel) throw new ErroValidacao(`${info.nome} ainda não está disponível (em breve).`);
  return c;
}
