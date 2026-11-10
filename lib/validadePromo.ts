// Validade (duração) das campanhas do Mercado Livre: lê a coluna DATE_VALIDITY da planilha de campanha.
// O valor pode estar em cada linha de anúncio ou só no rodapé da planilha (aí vale para todos os anúncios).
// Funções puras, sem React nem banco.

export interface Validade { inicio: string | null; fim: string }   // datas ISO (aaaa-mm-dd); sem início conhecido = só o fim

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const p2 = (n: number) => String(n).padStart(2, "0");
function isoValida(a: number, m: number, d: number): string | null {
  if (a < 2000 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(a, m - 1, d));
  if (t.getUTCMonth() !== m - 1) return null;   // 31/02 etc.
  return `${a}-${p2(m)}-${p2(d)}`;
}
/** Data de um instante com fuso (ex.: 2026-11-21T02:59:00Z) no horário de São Paulo, que é onde a campanha vale. */
function dataEmSaoPaulo(texto: string): string | null {
  const t = new Date(texto);
  if (isNaN(t.getTime())) return null;
  return t.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/** Todas as datas que aparecem em um valor de célula, na ordem em que aparecem. Número = data serial do Excel. */
export function extrairDatas(valor: any): string[] {
  if (valor === null || valor === undefined || valor === "") return [];
  if (valor instanceof Date) return isNaN(valor.getTime()) ? [] : [valor.toISOString().slice(0, 10)];
  if (typeof valor === "number") {
    if (valor < 30000 || valor > 80000) return [];
    return [new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86400000).toISOString().slice(0, 10)];
  }
  const s = String(valor);
  const achados: { pos: number; iso: string }[] = [];
  const usado: [number, number][] = [];
  const livre = (i: number, f: number) => !usado.some(([a, b]) => i < b && f > a);
  const marcar = (i: number, f: number, iso: string | null) => { if (iso && livre(i, f)) { achados.push({ pos: i, iso }); usado.push([i, f]); } };

  // instante ISO com hora e fuso/Z
  for (const m of s.matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})/g)) marcar(m.index!, m.index! + m[0].length, dataEmSaoPaulo(m[0]));
  // aaaa-mm-dd (hora sem fuso é ignorada)
  for (const m of s.matchAll(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/g)) marcar(m.index!, m.index! + m[0].length, isoValida(+m[1], +m[2], +m[3]));
  // dd/mm/aaaa (se o segundo número passar de 12, é mm/dd/aaaa)
  for (const m of s.matchAll(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/g)) {
    let a = +m[1], b = +m[2], ano = +m[3];
    if (ano < 100) ano += 2000;
    const [d, mes] = b > 12 && a <= 12 ? [b, a] : [a, b];
    marcar(m.index!, m.index! + m[0].length, isoValida(ano, mes, d));
  }
  // 20 de novembro de 2026
  for (const m of s.matchAll(/(\d{1,2})\s+de\s+([a-zçã]+)\s+(?:de\s+)?(\d{4})/gi)) {
    const mes = MESES[m[2].toLowerCase()];
    if (mes) marcar(m.index!, m.index! + m[0].length, isoValida(+m[3], mes, +m[1]));
  }
  return achados.sort((x, y) => x.pos - y.pos).map((x) => x.iso);
}

/** "2026-11-10 a 2026-11-20" = início e fim; uma data só = fim da campanha. Sem data = null. */
export function interpretarValidade(valor: any): Validade | null {
  const d = extrairDatas(valor);
  if (d.length === 0) return null;
  if (d.length === 1) return { inicio: null, fim: d[0] };
  const ini = d[0], fim = d[d.length - 1];
  return ini <= fim ? { inicio: ini, fim } : { inicio: fim, fim: ini };
}

export function validadeEmTexto(v: Validade | null): string {
  if (!v) return "";
  const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  return v.inicio ? `${br(v.inicio)} a ${br(v.fim)}` : `até ${br(v.fim)}`;
}

export interface ValidadesLidas {
  porLinha: Map<number, Validade>;   // índice da linha da planilha -> validade escrita na própria linha
  rodape: Validade | null;           // validade encontrada abaixo dos anúncios (vale para todos sem validade própria)
  origemRodape: string;              // onde o rodapé foi lido (para mostrar ao usuário)
}

const ROTULO = /date[_\s]?validity|vig[eê]ncia/i;

/**
 * Lê a validade da planilha de campanha.
 *  - idxItemId: coluna dos anúncios (ITEM_ID); a linha de título é a 0.
 *  - idxCol: coluna DATE_VALIDITY (-1 se a planilha não tem a coluna: só procura o rótulo "DATE_VALIDITY" no rodapé).
 * Cada linha de anúncio com data na coluna tem validade própria. O rodapé (linhas depois do último anúncio) é lido de baixo
 * para cima: primeiro um rótulo "DATE_VALIDITY" com a data ao lado ou embaixo, depois a própria coluna.
 */
export function lerValidadesDaPlanilha(linhas: any[][], idxItemId: number, idxCol: number): ValidadesLidas {
  const porLinha = new Map<number, Validade>();
  let ultimo = 0;
  for (let i = 1; i < linhas.length; i++) {
    const r = linhas[i];
    if (!r) continue;
    const mlb = String(r[idxItemId] ?? "").trim().toUpperCase();
    if (mlb.startsWith("MLB")) {
      ultimo = i;
      if (idxCol >= 0) { const v = interpretarValidade(r[idxCol]); if (v) porLinha.set(i, v); }
    }
  }

  let rodape: Validade | null = null, origemRodape = "";
  const baixo = linhas.slice(ultimo + 1);
  // 1) rótulo "DATE_VALIDITY" no rodapé, com a data na mesma célula, nas células ao lado ou na célula de baixo
  for (let k = baixo.length - 1; k >= 0 && !rodape; k--) {
    const r = baixo[k] || [];
    for (let c = 0; c < r.length && !rodape; c++) {
      const t = String(r[c] ?? "");
      if (!ROTULO.test(t)) continue;
      let v = interpretarValidade(t.replace(ROTULO, " "));
      for (let j = c + 1; !v && j < Math.min(r.length, c + 4); j++) v = interpretarValidade(r[j]);
      if (!v) v = interpretarValidade((baixo[k + 1] || [])[c]);
      if (v) { rodape = v; origemRodape = `rodapé, linha ${ultimo + 2 + k}`; }
    }
  }
  // 2) a coluna DATE_VALIDITY nas linhas do rodapé, de baixo para cima
  if (!rodape && idxCol >= 0) {
    for (let k = baixo.length - 1; k >= 0 && !rodape; k--) {
      const v = interpretarValidade((baixo[k] || [])[idxCol]);
      if (v) { rodape = v; origemRodape = `rodapé, coluna DATE_VALIDITY, linha ${ultimo + 2 + k}`; }
    }
  }
  return { porLinha, rodape, origemRodape };
}
