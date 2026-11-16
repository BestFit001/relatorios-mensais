// Níveis de usuário do Hub.
//   admin       = Admin Geral: todas as abas, todas as agendas e a tela Admin.
//   admin_area  = Admin de Área: todas as abas (menos a tela Admin) e só as agendas que o Admin Geral liberar.
//   analista    = só as áreas designadas.
//   geral       = só as áreas designadas.
//   compras     = nível antigo (anterior a esta mudança): continua valendo como "só as áreas designadas".
export const NIVEIS = [
  { valor: "admin", nome: "Admin Geral", descricao: "Todas as abas, todas as agendas e a tela Admin" },
  { valor: "admin_area", nome: "Admin de Área", descricao: "Todas as abas (menos Admin) e só as agendas liberadas" },
  { valor: "analista", nome: "Analista", descricao: "Somente as áreas designadas" },
  { valor: "geral", nome: "Geral", descricao: "Somente as áreas designadas" },
] as const;
export type Nivel = (typeof NIVEIS)[number]["valor"];

export const ehAdminGeral = (perfil?: string | null) => perfil === "admin";
/** Admin Geral e Admin de Área enxergam todas as abas (exceto a tela Admin, que é só do Admin Geral). */
export const acessoTotal = (perfil?: string | null) => perfil === "admin" || perfil === "admin_area";
export const nomeDoNivel = (perfil?: string | null) =>
  NIVEIS.find((n) => n.valor === perfil)?.nome || (perfil === "compras" ? "Operacional (antigo)" : perfil || "—");
