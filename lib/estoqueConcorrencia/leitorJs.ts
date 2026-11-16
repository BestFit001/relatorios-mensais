// Leitor de estoque de uma página de anúncio (recebe o HTML como texto): lerEstoqueML (Mercado Livre) e lerEstoqueGenerico (demais canais).
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
function lerEstoqueML(html) {
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

function lerEstoqueGenerico(html, itemId) {
  html = String(html || "");
  var r = { status: "desconhecido", estoque: null, aproximado: false, detalhe: "", titulo: null, imagem: null, vendedor: null };
  var nomeLd = null, imgLd = null, disp = null, dados = [], ids = [];
  var reS = /<script([^>]*)>([\s\S]*?)<\/script>/gi, m;
  while ((m = reS.exec(html))) {
    var at = m[1], corpo = m[2];
    var ehLd = /ld\+json/i.test(at);
    if (!ehLd && !/type=["']application\/json["']|__UNIVERSAL_DATA_FOR_REHYDRATION__|__NEXT_DATA__|__MODERN_ROUTER_DATA__|__INITIAL_STATE__/i.test(at)) { continue; }
    var j = null; try { j = JSON.parse(corpo); } catch (e) { continue; }
    if (ehLd) { varreLd(j); } else { dados.push(j); var idm = /id=["']([^"']+)["']/i.exec(at); ids.push(idm ? idm[1] : "json"); }
  }
  function varreLd(o) {
    if (!o || typeof o !== "object") { return; }
    if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) { varreLd(o[i]); } return; }
    if (o["@type"] === "Product") {
      if (!nomeLd && o.name) { nomeLd = String(o.name); }
      var im = Array.isArray(o.image) ? o.image[0] : o.image;
      if (!imgLd && im) { imgLd = typeof im === "object" ? im.url : String(im); }
    }
    if (!disp && typeof o.availability === "string") { disp = o.availability.replace(/^.*[\/#]/, ""); }
    for (var k in o) { if (o[k] && typeof o[k] === "object") { varreLd(o[k]); } }
  }
  var CH_TOTAL = /^(totalstock|productstock|totalinventory|totalavailablestock|stocktotal)$/;
  var CH_SKU = /^(stock|stocknum|stockcount|availablestock|availablequantity|stockquantity|inventory|inventoryquantity|quantityavailable|skustock|currentstock|remainstock|leftstock)$/;
  var BOOL_OK = /^(instock|isinstock|hasstock|isavailable|canbuy|purchasable)$/;
  var BOOL_NAO = /^(soldout|issoldout|outofstock|isoutofstock|isunavailable|offshelf)$/;
  var RUIM = /recommend|related|similar|suggest|feed|video|comment|review|otherproduct|morefrom|youmaylike|alsoview/i;
  var cands = [], bools = [], nos = 0;
  function anda(o, caminho, prof) {
    if (!o || typeof o !== "object" || prof > 40 || nos > 300000) { return; }
    nos++;
    if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) { anda(o[i], caminho + "[]", prof + 1); } return; }
    for (var k in o) {
      var v = o[k], kk = k.toLowerCase().replace(/[^a-z]/g, ""), pc = caminho + "." + k;
      if (typeof v === "number" || (typeof v === "string" && /^\d{1,9}$/.test(v))) {
        var n = Number(v);
        if (RUIM.test(pc)) { continue; }
        if (CH_TOTAL.test(kk)) { cands.push({ tipo: "total", n: n, p: pc }); } else if (CH_SKU.test(kk)) { cands.push({ tipo: "sku", n: n, p: pc }); }
      } else if (typeof v === "boolean") {
        if (RUIM.test(pc)) { continue; }
        if (BOOL_OK.test(kk)) { bools.push({ ok: v, p: pc }); } else if (BOOL_NAO.test(kk)) { bools.push({ ok: !v, p: pc }); }
      } else if (v && typeof v === "object") { anda(v, pc, prof + 1); }
    }
  }
  function achaProduto(o, prof) {
    if (!o || typeof o !== "object" || prof > 40) { return null; }
    if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) { var a = achaProduto(o[i], prof + 1); if (a) { return a; } } return null; }
    for (var k in o) { var kk = k.toLowerCase().replace(/[^a-z]/g, ""); if (/^(productid|itemid|spuid|id)$/.test(kk) && String(o[k]) === String(itemId)) { return o; } }
    for (var k2 in o) { if (o[k2] && typeof o[k2] === "object") { var b = achaProduto(o[k2], prof + 1); if (b) { return b; } } }
    return null;
  }
  var escopo = false;
  if (itemId) { for (var d = 0; d < dados.length && !cands.length; d++) { var sub = achaProduto(dados[d], 0); if (sub) { anda(sub, "$", 0); if (cands.length || bools.length) { escopo = true; } } } }
  if (!cands.length && !bools.length) { nos = 0; for (var d2 = 0; d2 < dados.length; d2++) { anda(dados[d2], "$", 0); } }
  var texto = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  var og = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i.exec(html);
  var ogi = /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i.exec(html);
  r.titulo = ((nomeLd || (og && og[1]) || "") + "").trim() || null;
  r.imagem = imgLd || (ogi && ogi[1]) || null;
  var totais = cands.filter(function (c) { return c.tipo === "total"; }), skus = cands.filter(function (c) { return c.tipo === "sku"; });
  var onde = escopo ? "no produto" : "na página";
  if (totais.length || skus.length) {
    var q = 0, desc = "";
    if (totais.length) { q = totais[0].n; desc = "estoque total"; } else { skus.forEach(function (c) { q += c.n; }); desc = "soma de " + skus.length + " variação(ões)"; }
    r.status = q > 0 ? "em_estoque" : "esgotado"; r.estoque = q;
    r.detalhe = "Dados " + onde + " (" + desc + "): " + q + " unidade(s).";
    return r;
  }
  var ruim = disp && /^(OutOfStock|SoldOut|Discontinued)$/i.test(disp), bom = disp && /^(InStock|LimitedAvailability|OnlineOnly|InStoreOnly|BackOrder|PreOrder)$/i.test(disp);
  if (ruim) { r.status = "esgotado"; r.detalhe = "O anúncio marca o produto como sem estoque (" + disp + ")."; return r; }
  if (bom) { r.status = "em_estoque"; r.detalhe = "O anúncio marca o produto como disponível (" + disp + ")."; return r; }
  if (bools.length) {
    var algum = bools.some(function (b) { return b.ok; });
    r.status = algum ? "em_estoque" : "esgotado";
    r.detalhe = "Dados " + onde + " indicam " + (algum ? "produto disponível" : "produto indisponível") + " (" + bools[0].p.replace(/^\$\./, "") + ").";
    return r;
  }
  var neg = /esgotad[oa]|sold\s*out|out\s*of\s*stock|currently\s+unavailable|indispon[íi]vel\s+no\s+momento|produto\s+indispon[íi]vel|n[ãa]o\s+est[áa]\s+dispon[íi]vel|sem\s+estoque/i.exec(texto);
  var pos = /adicionar\s+(ao|à|a)\s+(carrinho|sacola)|add\s+to\s+(cart|bag)|comprar\s+(agora|j[áa])|buy\s+now/i.exec(texto);
  if (neg && !pos) { r.status = "esgotado"; r.detalhe = "Leitura genérica: a página mostra “" + neg[0] + "” e não mostra botão de compra."; return r; }
  if (pos && !neg) { r.status = "em_estoque"; r.detalhe = "Leitura genérica: a página mostra o botão de compra (“" + pos[0] + "”), sem aviso de falta."; return r; }
  var tr = [], rs = /.{0,40}(stock|estoque|esgot|sold|dispon[íi]vel).{0,40}/gi, mm;
  while ((mm = rs.exec(texto)) && tr.length < 3) { tr.push(mm[0].trim()); }
  r.detalhe = "Leitura genérica sem sinal claro de estoque. Dados embutidos: " + (ids.slice(0, 4).join(", ") || "nenhum") + ". " + (tr.length ? "Trechos: “" + tr.join("” · “") + "”." : "Nenhum trecho sobre estoque.") + (html.length < 20000 ? " Página pequena (" + html.length + " caracteres): pode ter vindo só a casca, sem os dados." : "");
  return r;
}
function lerEstoqueHtml(html, canal, itemId) {
  if (!canal || canal === "mercadolivre") { return lerEstoqueML(html); }
  return lerEstoqueGenerico(html, itemId);
}
`;
