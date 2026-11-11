// Lista ÚNICA das abas do app, na mesma ordem e com os mesmos nomes do menu lateral (app/components/Navbar.tsx).
// Usada pelo Painel Admin (marcar permissões) e pelo Navbar (o admin enxerga tudo).
// Ao criar uma aba nova: acrescente aqui e coloque o link no Navbar.

export interface RotaMenu { id: string; nome: string }
export interface SecaoMenu { titulo: string; /** false = a aba fica solta no menu, sem submenu */ submenu: boolean; rotas: RotaMenu[] }

/** O Início (/inicio) aparece para qualquer usuário logado; não depende de permissão. */
export const ROTA_INICIO: RotaMenu = { id: "/inicio", nome: "Início" };

export const SECOES_MENU: SecaoMenu[] = [
  { titulo: "Dashboard", submenu: true, rotas: [
    { id: "/dashboard", nome: "Simplificado" },
    { id: "/executivo", nome: "Executivo" },
  ] },
  { titulo: "Reputação", submenu: false, rotas: [{ id: "/reputacao", nome: "Reputação" }] },
  { titulo: "Marketing", submenu: true, rotas: [
    { id: "/marketing", nome: "Postagens" },
    { id: "/marketing/ajustes", nome: "Ajustes no Site" },
  ] },
  { titulo: "Relatórios", submenu: true, rotas: [
    { id: "/", nome: "Curva ABC" },
    { id: "/mapeamento", nome: "Mapa de Cadastros" },
    { id: "/ads", nome: "Adsense" },
    { id: "/devolucoes", nome: "Devoluções" },
    { id: "/full", nome: "Fulfillment" },
    { id: "/lives", nome: "Lives" },
    { id: "/videos", nome: "Vídeos" },
    { id: "/analise-mercado", nome: "Análise de mercado (aba da Análise da concorrência)" },
    { id: "/concorrentes", nome: "Análise da concorrência" },
  ] },
  { titulo: "Promoções", submenu: true, rotas: [
    { id: "/promocoes/ml", nome: "Mercado Livre" },
    { id: "/promocoes/magalu", nome: "Magazine Luiza" },
    { id: "/promocoes/shopee", nome: "Shopee" },
    { id: "/promocoes/tiktok", nome: "TikTok Shop" },
  ] },
  { titulo: "Ferramentas", submenu: true, rotas: [
    { id: "/calculadora", nome: "Calculadora" },
    { id: "/produtos", nome: "Novos Cadastros" },
    { id: "/padronizacao", nome: "Padronização IA" },
    { id: "/dimensoes-peso", nome: "Dimensões e Peso" },
    { id: "/plp", nome: "PLPs (Expedição)" },
    { id: "/checagem-cancelados", nome: "Checagem de Cancelados" },
    { id: "/consulta-liquida", nome: "Consulta líquida" },
    { id: "/apresentacao-time", nome: "Apresentação Time" },
  ] },
  { titulo: "Compras", submenu: false, rotas: [{ id: "/compras", nome: "Compras" }] },
  { titulo: "Agenda", submenu: false, rotas: [{ id: "/agenda", nome: "Agenda" }] },
  { titulo: "Configurações", submenu: true, rotas: [
    { id: "/regras", nome: "Regras Gerais" },
    { id: "/upload", nome: "Uploads Base" },
    { id: "/admin", nome: "Painel Admin" },
  ] },
];

/** Todas as rotas que dependem de permissão, com o nome completo ("Relatórios › Curva ABC"). */
export const ROTAS_DISPONIVEIS: RotaMenu[] = SECOES_MENU.flatMap((s) =>
  s.rotas.map((r) => ({ id: r.id, nome: s.submenu ? `${s.titulo} › ${r.nome}` : r.nome }))
);

/** Nome de uma rota gravada nas permissões; caminhos que não existem mais viram "<caminho> (acesso antigo)". */
export function nomeDaRota(id: string): string {
  if (id === ROTA_INICIO.id) return ROTA_INICIO.nome;
  return ROTAS_DISPONIVEIS.find((r) => r.id === id)?.nome ?? `${id} (acesso antigo, sem efeito)`;
}
