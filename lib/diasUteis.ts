// Dias úteis (segunda a sexta, sem feriados) usados pelas tarefas cíclicas da tela inicial.
// Feriados nacionais calculados aqui (inclui os móveis, que dependem da Páscoa); pontos facultativos (Carnaval, Corpus Christi)
// e feriados municipais entram na lista "extras", cadastrada pelo admin (config_regras_tiny, campo `tarefas_feriados_extras`).
// Tudo trabalha com datas ISO "YYYY-MM-DD", sem fuso: é só calendário.

const utcDia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const somar = (iso: string, n: number) => new Date(utcDia(iso) + n * 86400000).toISOString().slice(0, 10);
const diaSemana = (iso: string) => new Date(utcDia(iso)).getUTCDay();   // 0 = domingo ... 6 = sábado
const dois = (n: number) => String(n).padStart(2, "0");

/** Domingo de Páscoa (algoritmo gregoriano de Meeus/Jones/Butcher). */
export function pascoa(ano: number): string {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${dois(mes)}-${dois(dia)}`;
}

const cacheFeriados = new Map<number, Map<string, string>>();

/** Feriados nacionais do ano: data -> nome. */
export function feriadosNacionais(ano: number): Map<string, string> {
  const pronto = cacheFeriados.get(ano);
  if (pronto) return pronto;
  const m = new Map<string, string>();
  const fixo = (mes: number, dia: number, nome: string) => m.set(`${ano}-${dois(mes)}-${dois(dia)}`, nome);
  fixo(1, 1, "Confraternização Universal");
  m.set(somar(pascoa(ano), -2), "Sexta-feira Santa");
  fixo(4, 21, "Tiradentes");
  fixo(5, 1, "Dia do Trabalho");
  fixo(9, 7, "Independência do Brasil");
  fixo(10, 12, "Nossa Senhora Aparecida");
  fixo(11, 2, "Finados");
  fixo(11, 15, "Proclamação da República");
  if (ano >= 2024) fixo(11, 20, "Consciência Negra");
  fixo(12, 25, "Natal");
  cacheFeriados.set(ano, m);
  return m;
}

let extras = new Map<string, string>();

/** Define os feriados extras (datas ISO). Vem do cadastro do admin; aceita texto livre, uma ou mais datas por linha/vírgula. */
export function definirFeriadosExtras(texto: string | string[] | null | undefined) {
  const itens = Array.isArray(texto) ? texto : String(texto || "").split(/[\s,;]+/);
  const novo = new Map<string, string>();
  for (const bruto of itens) {
    const s = String(bruto).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) novo.set(s, "Feriado extra");
    else {
      const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);   // também entende 25/02/2026
      if (br) novo.set(`${br[3]}-${dois(+br[2])}-${dois(+br[1])}`, "Feriado extra");
    }
  }
  extras = novo;
}
export const feriadosExtras = () => Array.from(extras.keys()).sort();

/** Nome do feriado nesse dia, ou null. */
export function nomeFeriado(iso: string): string | null {
  return feriadosNacionais(+iso.slice(0, 4)).get(iso) || extras.get(iso) || null;
}
export const ehFeriado = (iso: string) => nomeFeriado(iso) !== null;

/** Segunda a sexta e que não seja feriado. */
export function ehDiaUtil(iso: string): boolean {
  const d = diaSemana(iso);
  return d >= 1 && d <= 5 && !ehFeriado(iso);
}

/** O próprio dia, se for útil; senão o próximo dia útil. */
export function diaUtilAPartirDe(iso: string): string {
  let d = iso;
  for (let i = 0; i < 40 && !ehDiaUtil(d); i++) d = somar(d, 1);
  return d;
}

/** Último dia útil ANTES da data (estritamente anterior). */
export function diaUtilAnteriorA(iso: string): string {
  let d = somar(iso, -1);
  for (let i = 0; i < 40 && !ehDiaUtil(d); i++) d = somar(d, -1);
  return d;
}

/** Primeiro dia útil do mês "YYYY-MM". */
export function primeiroDiaUtilDoMes(ym: string): string {
  return diaUtilAPartirDe(`${ym}-01`);
}

export function mesAnterior(ym: string): string {
  const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 2, 1));
  return d.toISOString().slice(0, 7);
}
