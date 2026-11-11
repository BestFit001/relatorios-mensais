import { redirect } from "next/navigation";

// A Análise de mercado agora é uma aba da página "Análise da concorrência"; o endereço antigo continua funcionando.
export default function AnaliseMercadoPage() {
  redirect("/concorrentes?aba=analise-mercado");
}
