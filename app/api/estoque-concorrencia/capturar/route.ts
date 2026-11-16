import { capturarEstoque } from "../../../../lib/estoqueConcorrencia/servidor";
import { executar, supabaseServidor } from "../../../../lib/concorrentes/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Botão "Ler agora": lê no servidor todos os anúncios acompanhados (repita enquanto `pendentes` for maior que 0). */
export async function POST(req: Request) {
  return executar(req, async () => capturarEstoque(supabaseServidor(), { forcar: true }));
}
