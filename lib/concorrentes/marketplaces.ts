// Registro de conectores. Para plugar Shopee/Amazon: criar `lib/concorrentes/<canal>/index.ts` com um `Conector`,
// registrar aqui e marcar `disponivel: true` em canais.ts.
import type { Conector } from "./tipos";
import { ErroValidacao } from "./tipos";
import { CANAIS } from "./canais";
import { conectorMercadoLivre } from "./mercadolivre";

const conectores: Record<string, Conector> = {
  mercadolivre: conectorMercadoLivre,
};

export function obterConector(canal: string): Conector {
  const info = CANAIS.find((c) => c.id === canal);
  if (!info) throw new ErroValidacao(`Canal desconhecido: ${canal}`);
  const c = conectores[canal];
  if (!c || !info.disponivel) throw new ErroValidacao(`${info.nome} ainda não está disponível (em breve).`);
  return c;
}
