// Tabela de tarifação por canal (config_regras_tarifacao): leitura da faixa de preço e escolha da regra que vale para um preço.
//
// A faixa vem como texto digitado pelo usuário ("0 até 50", "R$ 79,00 até R$ 999999", "50 até 20.000"). Duas coisas davam errado:
//  - "20.000" era lido como 20 (o ponto era tratado como decimal), então a faixa "50 até 20.000" virava "50 até 20" e nunca valia;
//  - quando duas faixas se tocam ("0 até 50" e "50 até 20.000"), o preço exatamente no começo da 2ª faixa caía na 1ª.
// No TikTok isso fazia o PDV ser calculado com a comissão da faixa de baixo (16% + R$ 4) enquanto a tela mostrava a da faixa certa
// (12% + R$ 6): o preço saía ~1% a 4% acima do necessário e a margem final passava da margem alvo.
// Agora vale a faixa que COMEÇA no maior valor que não passa do preço (cada faixa vai do seu início até o início da próxima).

/** Número escrito numa faixa: "78.99" -> 78,99; "79,00" -> 79; "20.000" -> 20000 (ponto de milhar); "1.234,50" -> 1234,5. */
export function numeroDaFaixa(texto: unknown): number {
  let s = String(texto ?? "").replace(/R\$/gi, "").replace(/\s/g, "").trim();
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");      // só pontos de milhar
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Números que aparecem no texto da faixa, na ordem. */
export function numerosDaFaixa(faixa: unknown): number[] {
  const achados = String(faixa ?? "").toLowerCase().match(/\d[\d.,]*/g) || [];
  return achados.map(numeroDaFaixa).filter((n) => Number.isFinite(n));
}

/** Início da faixa (primeiro número do texto; 0 se não houver). */
export function inicioDaFaixa(faixa: unknown): number {
  const n = numerosDaFaixa(faixa);
  return n.length ? n[0] : 0;
}

/** Regra que vale para o preço: a da faixa que começa mais perto, sem passar dele. Abaixo de todos os inícios, vale a 1ª faixa. */
export function escolherRegraPorPreco<T extends { faixa_preco?: unknown }>(regras: T[], preco: number): T | undefined {
  if (regras.length === 0) return undefined;
  const comInicio = regras.map((r) => ({ r, inicio: inicioDaFaixa(r.faixa_preco) }));
  const cabem = comInicio.filter((x) => x.inicio <= preco + 1e-9);
  const lista = cabem.length ? cabem : comInicio.map((x) => ({ ...x, inicio: -x.inicio }));   // sem nenhuma: a de menor início
  return lista.reduce((a, b) => (b.inicio > a.inicio ? b : a)).r;
}
