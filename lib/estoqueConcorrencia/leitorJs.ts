// Leitor de estoque de uma página de anúncio do Mercado Livre (recebe o HTML como texto).
// É um TEXTO de JS puro porque roda em dois lugares com a mesma regra: no servidor/testes (leitor.ts) e dentro do favorito do navegador.
// Por isso: sem comentários "//" e todo comando termina em ";" (o favorito vai numa linha só).
//
// Ordem dos sinais (do mais confiável para o menos):
//   1. aviso forte na página ("publicação pausada/finalizada", "não está mais disponível")        -> esgotado
//      (avisos fracos como "produto esgotado" só valem se o JSON-LD não disser InStock: a página pode citar outros produtos)
//   2. JSON-LD do produto com availability OutOfStock/SoldOut/Discontinued                       -> esgotado
//   3. texto de quantidade ("(+50 disponíveis)", "Última disponível!") ou availability InStock    -> em_estoque
//   4. "available_quantity" dentro dos dados da página (só quando nada acima decidiu)              -> 0 = esgotado, >0 = em_estoque
//   5. nada claro                                                                                  -> desconhecido (nunca dispara aviso)
// O aviso "acabou" só sai de esgotado; "desconhecido" é falta de informação, não de estoque.
export const LER_ESTOQUE_JS = String.raw`
function lerEstoqueHtml(html) {
  html = String(html || "");
  var r = { status: "desconhecido", estoque: null, aproximado: false, detalhe: "Não achei informação de estoque na página.", titulo: null, imagem: null, vendedor: null };
  var ld = [], re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi, m;
  while ((m = re.exec(html))) { ld.push(m[1]); }
  var disp = null, nomeLd = null, imgLd = null;
  function varre(o) {
    if (!o || typeof o !== "object") { return; }
    if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) { varre(o[i]); } return; }
    if (o["@type"] === "Product") {
      if (!nomeLd && o.name) { nomeLd = String(o.name); }
      var im = Array.isArray(o.image) ? o.image[0] : o.image;
      if (!imgLd && im) { imgLd = typeof im === "object" ? im.url : String(im); }
    }
    if (!disp && typeof o.availability === "string") { disp = o.availability.replace(/^.*[\/#]/, ""); }
    for (var k in o) { if (o[k] && typeof o[k] === "object") { varre(o[k]); } }
  }
  for (var i = 0; i < ld.length; i++) { try { varre(JSON.parse(ld[i])); } catch (e) {} }
  var texto = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  var og = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i.exec(html);
  var h1 = /<h1[^>]*class=["'][^"']*ui-pdp-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  r.titulo = (nomeLd || (h1 && h1[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) || (og && og[1]) || "").trim() || null;
  var ogi = /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html);
  r.imagem = imgLd || (ogi && ogi[1]) || null;
  var vend = /ui-pdp-seller__header__title[^>]*>([^<]+)</i.exec(html);
  r.vendedor = vend ? vend[1].replace(/^(vendido\s+)?por\s+/i, "").trim() || null : null;
  var forte = /(publica[çc][ãa]o|an[úu]ncio)\s+(est[áa]\s+)?(pausad[oa]|finalizad[oa]|encerrad[oa])|n[ãa]o\s+est[áa]\s+mais\s+dispon[íi]vel/i.exec(texto);
  var fraco = /estoque\s+esgotad[oa]|produto\s+(esgotad[oa]|indispon[íi]vel)|indispon[íi]vel\s+no\s+momento|sem\s+estoque\s+dispon[íi]vel/i.exec(texto);
  var qtd = /\(?\s*(\+)?\s*(\d[\d.]*)\s+dispon[íi]ve(?:l|is)\s*\)?/i.exec(texto);
  var ultima = /[úu]ltim[ao]s?\s+(?:unidade|dispon[íi]vel)/i.exec(texto);
  var interno = /"available_quantity"\s*:\s*(\d+)/.exec(html);
  var ruim = disp && /^(OutOfStock|SoldOut|Discontinued)$/i.test(disp);
  var bom = disp && /^(InStock|LimitedAvailability|OnlineOnly|InStoreOnly|BackOrder|PreOrder)$/i.test(disp);
  if (forte && !qtd && !ultima) { r.status = "esgotado"; r.detalhe = "A página avisa: “" + forte[0] + "”."; return r; }
  if (ruim && !qtd && !ultima) { r.status = "esgotado"; r.detalhe = "O Mercado Livre marca o anúncio como sem estoque (" + disp + ")."; return r; }
  if (fraco && !qtd && !ultima && !bom) { r.status = "esgotado"; r.detalhe = "A página avisa: “" + fraco[0] + "”."; return r; }
  if (qtd || ultima) {
    r.status = "em_estoque";
    if (qtd) { r.estoque = parseInt(qtd[2].replace(/\./g, ""), 10); r.aproximado = !!qtd[1]; r.detalhe = "A página mostra “" + qtd[0].trim() + "”."; }
    else { r.estoque = 1; r.detalhe = "A página mostra “" + ultima[0] + "”."; }
    return r;
  }
  if (bom) {
    r.status = "em_estoque";
    r.detalhe = "O Mercado Livre marca o anúncio como disponível (" + disp + ").";
    if (interno && parseInt(interno[1], 10) > 0) { r.estoque = parseInt(interno[1], 10); r.detalhe += " Quantidade nos dados da página: " + r.estoque + "."; }
    return r;
  }
  if (interno) {
    var n = parseInt(interno[1], 10);
    r.status = n > 0 ? "em_estoque" : "esgotado"; r.estoque = n;
    r.detalhe = "Quantidade nos dados da página: " + n + ".";
    return r;
  }
  return r;
}
`;
