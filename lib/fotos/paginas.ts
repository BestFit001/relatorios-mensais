// Acha, no HTML da página de uma loja, as fotos do produto (a maior possível). Só texto: sem rede, para poder testar.

const entidades = (t: string) => t.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function atributos(tag: string): Record<string, string> {
  const a: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) a[m[1].toLowerCase()] = entidades(m[2] ?? m[3] ?? m[4] ?? "");
  return a;
}

/** Endereço absoluto https (http vira https: a maioria das lojas aceita); o resto é descartado. */
function absoluto(bruto: unknown, base: string): string | null {
  if (typeof bruto !== "string") return null;
  const t = entidades(bruto.trim());
  if (!t || t.length > 2000 || /^(data|blob|javascript):/i.test(t)) return null;
  try {
    const u = new URL(t, base);
    if (u.protocol === "http:") u.protocol = "https:";
    return u.protocol === "https:" ? u.toString() : null;
  } catch { return null; }
}

function imagensDoLD(no: any, saida: unknown[], produto = false, fundo = 0) {
  if (!no || typeof no !== "object" || fundo > 6) return;
  if (Array.isArray(no)) { no.forEach((x) => imagensDoLD(x, saida, produto, fundo + 1)); return; }
  const tipo = ([] as unknown[]).concat(no["@type"] ?? []).map(String).join(" ");
  const ehProduto = produto || /Product|ImageObject/i.test(tipo);
  if (ehProduto && no.image != null) {
    for (const i of ([] as any[]).concat(no.image)) saida.push(typeof i === "string" ? i : i?.url ?? i?.contentUrl);
  }
  if (ehProduto && /ImageObject/i.test(tipo)) saida.push(no.url ?? no.contentUrl);
  for (const k of Object.keys(no)) if (k === "@graph" || k === "mainEntity" || k === "itemListElement" || k === "hasVariant" || k === "item") imagensDoLD(no[k], saida, ehProduto, fundo + 1);
}

/** Fotos da página, da mais confiável para a menos: dados do produto, versões ampliadas da loja, imagem de compartilhamento. */
export function extrairImagensDaPagina(html: string, base: string, max = 10): string[] {
  const achadas: unknown[] = [];

  // 1) dados estruturados do produto (JSON-LD)
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { imagensDoLD(JSON.parse(m[1].trim()), achadas); } catch { /* JSON quebrado: ignora */ }
  }
  // 2) versões ampliadas que as lojas colocam no HTML (Amazon, Mercado Livre e outras)
  for (const m of html.matchAll(/"hiRes"\s*:\s*"([^"]+)"/g)) achadas.push(m[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/"));
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    for (const k of ["data-zoom", "data-old-hires", "data-zoom-image", "data-large", "data-large-src"]) if (a[k]) achadas.push(a[k]);
    if (a["data-a-dynamic-image"]) { try { Object.keys(JSON.parse(a["data-a-dynamic-image"])).forEach((u) => achadas.push(u)); } catch { /* ignora */ } }
  }
  // 3) imagem de compartilhamento (quase toda loja tem)
  const nomesMeta = new Set(["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src", "image"]);
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = atributos(m[0]); const nome = (a.property || a.name || a.itemprop || "").toLowerCase();
    if (nomesMeta.has(nome) && a.content) achadas.push(a.content);
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) { const a = atributos(m[0]); if ((a.rel || "").toLowerCase() === "image_src" && a.href) achadas.push(a.href); }

  const vistos = new Set<string>(); const saida: string[] = [];
  for (const bruto of achadas) { const u = absoluto(bruto, base); if (u && !vistos.has(u)) { vistos.add(u); saida.push(u); if (saida.length >= max) break; } }
  return saida;
}

/** Versões maiores da MESMA foto, conhecidas das lojas. Quem não existir some na medição (o servidor da loja responde 404). */
export function variantesMaiores(url: string): string[] {
  const v: string[] = [];
  let u: URL; try { u = new URL(url); } catch { return v; }
  const caminho = u.pathname;
  // Amazon: .../I/71abc._AC_SX679_.jpg -> .../I/71abc.jpg (original)
  if (/(^|\.)media-amazon\.com$|(^|\.)ssl-images-amazon\.com$/.test(u.hostname)) {
    const orig = caminho.replace(/\._[^/]*_(\.[a-z]+)$/i, "$1"); if (orig !== caminho) v.push(`${u.origin}${orig}`);
  }
  // Mercado Livre: ...-I.jpg / -O.webp -> versões F e O (maiores)
  if (/(^|\.)mlstatic\.com$/.test(u.hostname)) {
    const m = caminho.match(/^(.*-)[A-Z](\.(?:jpg|webp))$/i);
    if (m) for (const s of ["F", "O"]) { const c = `${m[1]}${s}${m[2]}`; if (c !== caminho) v.push(`${u.origin}${c}`); }
  }
  // Shopee: .../file/<id>_tn -> .../file/<id>
  if (/susercontent\.com$/.test(u.hostname) && /_tn$/.test(caminho)) v.push(`${u.origin}${caminho.replace(/_tn$/, "")}`);
  // Magalu: .../280x210/... -> .../1500x1500/...
  if (/mlcdn\.com\.br$/.test(u.hostname)) { const g = caminho.replace(/^\/\d{2,4}x\d{2,4}\//, "/1500x1500/"); if (g !== caminho) v.push(`${u.origin}${g}`); }
  return v;
}
