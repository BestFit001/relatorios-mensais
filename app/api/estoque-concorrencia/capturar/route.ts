import { capturarEstoque } from "../../../../lib/estoqueConcorrencia/servidor";
import { canalEstoqueValido } from "../../../../lib/estoqueConcorrencia/links";
import { ErroValidacao } from "../../../../lib/concorrentes/tipos";
import { executar, supabaseServidor } from "../../../../lib/concorrentes/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Botão "Ler agora": lê no servidor os anúncios acompanhados do canal (repita enquanto `pendentes` for maior que 0). Corpo: { canal? } */
export async function POST(req: Request) {
  return executar(req, async (c) => {
    if (c.canal !== undefined && !canalEstoqueValido(c.canal)) throw new ErroValidacao("Canal desconhecido.");
    return capturarEstoque(supabaseServidor(), { forcar: true, canal: c.canal });
  });
}
