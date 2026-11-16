import { importarLeituraNavegador } from "../../../../lib/estoqueConcorrencia/servidor";
import { executar, supabaseServidor } from "../../../../lib/concorrentes/servidor";
import { ErroValidacao } from "../../../../lib/concorrentes/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Importa o que o favorito “Ler estoque” leu no navegador. Corpo: { texto: string (JSON do favorito) } */
export async function POST(req: Request) {
  return executar(req, async (c) => {
    if (typeof c.texto !== "string" || !c.texto.trim()) throw new ErroValidacao("Cole o texto que o favorito copiou.");
    if (c.texto.length > 2_000_000) throw new ErroValidacao("Texto grande demais.");
    let payload: unknown;
    try { payload = JSON.parse(c.texto); } catch { throw new ErroValidacao("O texto colado não está completo. Use o botão Copiar do favorito e cole tudo."); }
    return importarLeituraNavegador(supabaseServidor(), payload);
  });
}
