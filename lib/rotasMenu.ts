// Lista ÚNICA das abas do app, na mesma ordem e com os mesmos nomes do menu lateral (app/components/Navbar.tsx).
// Usada pelo Painel Admin (marcar permissões) e pelo Navbar (o admin enxerga tudo).
// Ao criar uma aba nova: acrescente aqui e coloque o link no Navbar.

export interface RotaMenu {
  id: string; nome: string;
  /** emoji antes do nome no submenu (ex.: as promoções por canal) */
  prefixo?: string;
  /** texto no menu lateral, quando diferente do nome usado nas permissões */
  rotulo?: string;
  /** true = só existe como permissão; não aparece como link no menu (ex.: aba que vive dentro de outra) */
  oculta?: boolean;
}
export interface SecaoMenu { titulo: string; icone: string; /** false = a aba fica solta no menu, sem submenu */ submenu: boolean; rotas: RotaMenu[] }

/** O Início (/inicio) aparece para qualquer usuário logado; não depende de permissão. */
export const ROTA_INICIO: RotaMenu = { id: "/inicio", nome: "Início" };

export const SECOES_MENU: SecaoMenu[] = [
  { titulo: "Dashboard", icone: "📊", submenu: true, rotas: [
    { id: "/dashboard", nome: "Simplificado" },
    { id: "/executivo", nome: "Executivo" },
  ] },
  { titulo: "Relatórios", icone: "📈", submenu: true, rotas: [
    { id: "/ads", nome: "Adsense" },
    { id: "/", nome: "Curva ABC" },
    { id: "/full", nome: "Fulfillment" },
    { id: "/mapeamento", nome: "Mapa de Cadastros" },
    { id: "/ranking", nome: "Ranking" },
    { id: "/reputacao", nome: "Reputação" },
    { id: "/lives", nome: "Lives" },
    { id: "/concorrentes", nome: "Análise da concorrência" },
    { id: "/analise-mercado", nome: "Análise de mercado (aba da Análise da concorrência)", oculta: true },
  ] },
  { titulo: "Promoções", icone: "🏷️", submenu: true, rotas: [
    { id: "/promocoes/ml", nome: "Mercado Livre", prefixo: "🟡" },
    { id: "/promocoes/magalu", nome: "Magazine Luiza", rotulo: "Magalu", prefixo: "🔵" },
    { id: "/promocoes/shopee", nome: "Shopee", prefixo: "🟠" },
    { id: "/promocoes/tiktok", nome: "TikTok Shop", prefixo: "⚫" },
  ] },
  { titulo: "Ferramentas", icone: "🛠️", submenu: true, rotas: [
    { id: "/calculadora", nome: "Calculadora" },
    { id: "/produtos", nome: "Novos Cadastros" },
    { id: "/padronizacao", nome: "Padronização IA" },
  ] },
  { titulo: "Expedição", icone: "🚚", submenu: true, rotas: [
    { id: "/devolucoes", nome: "Devoluções" },
    { id: "/plp", nome: "PLPs" },
    { id: "/dimensoes-peso", nome: "Dimensões e Peso" },
  ] },
  { titulo: "Marketing", icone: "📣", submenu: true, rotas: [
    { id: "/marketing", nome: "Redes Sociais" },
    { id: "/videos", nome: "Vídeos E-commerce" },
    { id: "/apresentacao-time", nome: "Apresentação Time" },
    { id: "/marketing/ajustes", nome: "Site" },
  ] },
  { titulo: "Financeiro", icone: "💰", submenu: true, rotas: [
    { id: "/checagem-cancelados", nome: "Checagem de Cancelados" },
  ] },
  { titulo: "Compras", icone: "🛒", submenu: false, rotas: [{ id: "/compras", nome: "Compras" }] },
  { titulo: "Gestão", icone: "📅", submenu: true, rotas: [
    { id: "/agenda", nome: "Agenda" },
  ] },
  { titulo: "Configurações", icone: "⚙️", submenu: true, rotas: [
    { id: "/regras", nome: "Regras Gerais" },
    { id: "/upload", nome: "Uploads Base" },
    { id: "/admin", nome: "Painel Admin" },
  ] },
];

/** Seção do menu à qual a página atual pertence (a rota mais específica vence: /marketing/ajustes antes de /marketing). */
export function secaoDoCaminho(caminho: string): string | null {
  let melhor: { titulo: string; tam: number } | null = null;
  for (const s of SECOES_MENU) for (const r of s.rotas) {
    const bate = r.id === "/" ? caminho === "/" : caminho === r.id || caminho.startsWith(r.id + "/");
    if (bate && (!melhor || r.id.length > melhor.tam)) melhor = { titulo: s.titulo, tam: r.id.length };
  }
  return melhor ? melhor.titulo : null;
}

/** Todas as rotas que dependem de permissão, com o nome completo ("Relatórios › Curva ABC"). */
export const ROTAS_DISPONIVEIS: RotaMenu[] = SECOES_MENU.flatMap((s) =>
  s.rotas.map((r) => ({ id: r.id, nome: s.submenu ? `${s.titulo} › ${r.nome}` : r.nome }))
);

/** Nome de uma rota gravada nas permissões; caminhos que não existem mais viram "<caminho> (acesso antigo)". */
export function nomeDaRota(id: string): string {
  if (id === ROTA_INICIO.id) return ROTA_INICIO.nome;
  return ROTAS_DISPONIVEIS.find((r) => r.id === id)?.nome ?? `${id} (acesso antigo, sem efeito)`;
}
