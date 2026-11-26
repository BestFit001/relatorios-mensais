// "Pedido em carrinho": o analista marca na sub-aba "Vendas no prejuízo" os pedidos cujo prejuízo é só aparente.
// Pedido marcado deixa de entrar no cálculo de prejuízo daquela aba. A marca fica em config_regras_tiny (uma linha por pedido),
// então vale para todos os analistas e não precisa de tabela nova.
export const PREFIXO_CARRINHO = "prejuizo_carrinho:";

export interface MarcaCarrinho { por: string; em: string }

/** `chave` é a mesma das linhas de venda: "canal normalizado|pedido normalizado". */
export const campoCarrinho = (chave: string) => PREFIXO_CARRINHO + chave;

export const serializarCarrinho = (m: MarcaCarrinho) => `${m.por}|${m.em}`;

export function lerCarrinho(linhas: any[] | null | undefined): Map<string, MarcaCarrinho> {
  const mapa = new Map<string, MarcaCarrinho>();
  for (const l of linhas || []) {
    const campo = String(l?.campo ?? "");
    if (!campo.startsWith(PREFIXO_CARRINHO)) continue;
    const [por = "", em = ""] = String(l?.coluna ?? "").split("|");
    mapa.set(campo.slice(PREFIXO_CARRINHO.length), { por, em });
  }
  return mapa;
}
