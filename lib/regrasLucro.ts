// Regra do painel: Lucro Líquido Real = Repasse − CMV − Imposto.
// Frete Flex, Ads e frete reverso de devolução continuam apurados e exibidos por canal, mas ficam FORA do lucro.
// Mude para true para voltar a abater também esses três custos do lucro (vale para Dashboard, Executivo e Início).
export const DESCONTAR_FRETE_ADS_NO_LUCRO = false;

// Frete Flex (PLP) pertence ao mês em que o pedido foi ENVIADO (data_envio). Retorna "AAAA-MM" ou "".
export function mesDoEnvio(valor: any): string {
  const dt = String(valor ?? "").trim();
  if (/^\d{4}-\d{2}/.test(dt)) return dt.slice(0, 7);
  const m = dt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}` : "";
}
