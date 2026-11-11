// Conector "só pelo favorito": o servidor NÃO lê o site (a Shopee e a Amazon bloqueiam leitura automática de servidor);
// os anúncios entram pelo texto que o favorito copia do navegador, e a validação fica em urls.ts + importacao.ts.
import type { Conector } from "./tipos";
import { ErroValidacao } from "./tipos";
import { urlsDoCanal } from "./urls";

export function conectorSoNavegador(id: string, nome: string): Conector {
  const u = urlsDoCanal(id);
  const recusa = (): never => { throw new ErroValidacao(`${nome}: o servidor não lê esse site. Use o favorito “Capturar anúncios” no navegador e importe aqui.`); };
  return {
    id, nome, leituraServidor: false,
    validarUrlCategoria: u.validarUrlCategoria,
    validarUrlAnuncio: u.validarUrlAnuncio,
    rasparCategoria: async () => recusa(),
    buscarAnuncio: async () => recusa(),
    capturarLote: async () => recusa(),
    diagnosticar: async () => [{ estrategia: "servidor", ok: false, detalhe: `${nome} só é lido pelo favorito, no navegador.`, ms: 0 }],
  };
}
