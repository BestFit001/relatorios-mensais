// Descrição complementar dos produtos: SEMPRE texto puro, sem caracteres de Markdown (**, ##, ---, * etc.),
// no padrão usado no Tiny:
//
//   Parágrafo de abertura.
//
//   Especificações:
//   - Marca: ...
//
//   Benefícios:
//   - Título: explicação.
//
//   Composição:
//   - ...
//
//   Cuidados e Conservação:
//   Linha 1.
//   Linha 2.

/** Trecho que vai dentro do prompt da IA, explicando o formato exigido. */
export const INSTRUCAO_FORMATO_DESCRICAO = `FORMATO OBRIGATÓRIO (TEXTO PURO, pronto para colar no campo "Descrição complementar" do Tiny):
- PROIBIDO usar Markdown ou qualquer símbolo de formatação: nada de **negrito**, *itálico*, # títulos, --- linhas, \`código\`, tabelas, emojis ou links.
- Não escreva saudação, explicação, comentário nem "Aqui está": responda SOMENTE com a descrição.
- Estrutura exata, nesta ordem, separando cada bloco com UMA linha em branco:
  1) Um parágrafo de abertura (3 a 5 frases, sem título).
  2) "Especificações:" seguido de linhas começando com "- Rótulo: valor." (Marca, Modelo, e as medidas/capacidade/material/detalhes reais do produto).
  3) "Benefícios:" seguido de linhas "- Nome do Benefício: explicação curta."
  4) "Composição:" seguido de linhas começando com "- ".
  5) "Cuidados e Conservação:" seguido de uma frase curta por linha, SEM hífen no começo.
- Os títulos dos blocos terminam com dois-pontos e ficam sozinhos na linha.
- Use apenas hífen simples "-" para listas.

EXEMPLO DO PADRÃO (siga exatamente este formato):
A Bolsa Ombro Baguete Farm Rio Sol de Verão é o acessório charmoso e funcional que faltava para guardar o essencial com muita praticidade e estilo. Compacta e versátil, conta com bolsos externos estratégicos e alça regulável.

Especificações:
- Marca: Farm Rio.
- Modelo: Bolsa Baguete.
- Estampa: Sol de Verão.
- Alça: Regulável para melhor ajuste no ombro.

Benefícios:
- Design Charmoso e Funcional: Formato baguete compacto que acomoda os itens essenciais do dia a dia.
- Conforto Ajustável: Alça regulável que se adapta ao corpo para um uso confortável.

Composição:
- 100% Poliéster.

Cuidados e Conservação:
Limpar delicadamente apenas com um pano úmido e sabão neutro.
Secar obrigatoriamente à sombra em local ventilado.`;

const TITULOS_CONHECIDOS = [
  "especificacoes", "especificacao", "beneficios", "composicao", "cuidados e conservacao", "cuidados", "conservacao",
  "caracteristicas", "diferenciais", "indicacao de uso", "indicacoes de uso", "informacoes adicionais", "dimensoes", "observacoes",
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Converte qualquer texto (inclusive com Markdown vindo da IA ou de padrões antigos) para o padrão de texto puro:
 * tira **, __, #, ---, crases, links e HTML; "* item" vira "- item"; títulos viram "Título:".
 */
export function limparDescricao(entrada: any): string {
  let s = String(entrada ?? "");
  if (!s.trim()) return "";

  s = s.replace(/\r\n?/g, "\n").replace(/ /g, " ");
  // blocos de código ```...``` -> só o conteúdo
  s = s.replace(/```[a-z]*\n?([\s\S]*?)```/gi, "$1");
  // HTML simples que a IA às vezes solta
  s = s.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n").replace(/<[^>]+>/g, "");

  const linhas = s.split("\n").map((bruta) => {
    let l = bruta.trimEnd();
    if (/^\s*(?:[-*_=]\s*){3,}$/.test(l)) return "";              // --- *** ___ ===  (linha horizontal)
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)) return "";   // separador de tabela |---|---|

    let virouTitulo = false;
    const h = l.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/);          // ### Título
    if (h) { l = h[1]; virouTitulo = true; }

    l = l.replace(/^\s*>\s?/, "");                                  // citação
    // marcador de lista: "* ", "• ", "– ", "- " (mantém só "- ")
    const item = l.match(/^(\s*)([*•●▪◦–—+-])\s+(.*)$/);
    let ehItem = false;
    if (item) { l = item[3]; ehItem = true; }
    else {
      const num = l.match(/^\s*\d{1,2}[.)]\s+(.*)$/);              // 1. item
      if (num) { l = num[1]; ehItem = true; }
    }

    // negrito / itálico / sublinhado / riscado / crase
    l = l
      .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, "$1$2")   // *itálico*
      .replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=[\s).,;:!?]|$)/g, "$1$2")     // _itálico_
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")                                  // imagem
      .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1")                           // [texto](url) -> texto
      .replace(/\*\*|__/g, "")                                               // sobras
      .replace(/^\s*\*+\s*|\s*\*+\s*$/g, "")                                 // asteriscos soltos nas pontas
      .replace(/[ \t]+/g, " ")
      .trim();

    if (!l) return "";

    // título de bloco: "Benefícios", "**Benefícios**", "### Benefícios", "Benefícios:" -> "Benefícios:"
    const base = semAcento(l.replace(/[:：]\s*$/, "").trim());
    if (!ehItem && (virouTitulo || TITULOS_CONHECIDOS.includes(base)) && l.length <= 60) {
      return l.replace(/[:：.]*\s*$/, "") + ":";
    }
    return ehItem ? "- " + l : l;
  });

  let texto = linhas.join("\n");

  // tira abertura de chat tipo "Claro! Aqui está a descrição:" no começo
  texto = texto.replace(/^\s*(?:claro|certo|perfeito|ok|segue|aqui est[aá]|aqui vai)[^\n]{0,120}\n+/i, (m) => (/[:!]\s*\n/.test(m) ? "" : m));

  // linhas em branco: no máximo uma, e uma antes de cada título de bloco
  texto = texto
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([^\n])\n([A-ZÀ-Ú][^\n]{0,59}:)\n/g, (m, ant, tit) => (TITULOS_CONHECIDOS.includes(semAcento(tit.replace(/:$/, ""))) ? `${ant}\n\n${tit}\n` : m))
    .trim();

  return texto;
}

/** true se o texto ainda tem símbolos de Markdown (usado nos testes e para avisar na tela). */
export function temMarkdown(texto: any): boolean {
  const s = String(texto ?? "");
  return /\*\*|^\s*#{1,6}\s|^\s*[-*_]{3,}\s*$|^\s*\*\s|`|__/m.test(s);
}
