import { capturarDiario } from "../../../../lib/concorrentes/captura";
import { ehUuid, executar, supabaseServidor } from "../../../../lib/concorrentes/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Botão "Atualizar agora" do painel: faz a captura do cron e também relê o que já foi lido hoje há mais de 10 min, para pegar mudança de preço no mesmo dia (repita até `pendentes` chegar a 0). Corpo: { categoria_id? } */
export async function POST(req: Request) {
  return executar(req, async (c) => capturarDiario(supabaseServidor(), { categoriaId: ehUuid(c.categoria_id) ? c.categoria_id : undefined, releitura: true }));
}
