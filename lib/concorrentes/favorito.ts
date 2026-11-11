// Favorito (bookmarklet) "Capturar anúncios": roda DENTRO do navegador do usuário, na página do Mercado Livre, Shopee, Amazon
// ou nos resultados do Google (Shopping), lê o que está na tela e mostra um texto (JSON) para colar no painel.
// Não envia nada sozinho e não usa senha: o navegador já está logado e não é bloqueado como o servidor.
// Deve ser JS puro e autocontido (sem comentários "//": o código vai numa linha só dentro do favorito).
export const FAVORITO_JS = String.raw`(async function () {
  var ID = "cb-import-box";
  var antigo = document.getElementById(ID); if (antigo) antigo.remove();
  var caixa = document.createElement("div"); caixa.id = ID;
  caixa.style.cssText = "position:fixed;z-index:2147483647;top:12px;right:12px;width:400px;max-width:92vw;background:#0f172a;color:#e2e8f0;font:13px/1.4 system-ui,sans-serif;border:1px solid #6366f1;border-radius:12px;padding:14px;box-shadow:0 10px 40px rgba(0,0,0,.6)";
  document.body.appendChild(caixa);
  function esc(t) { return String(t).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function tela(html) { caixa.innerHTML = html; }
  function status(t) { tela("<b>Monitor de concorrentes</b><div style='margin-top:6px'>" + esc(t) + "</div>"); }
  function limpa(t) { return (t || "").replace(/\s+/g, " ").trim(); }
  function texto(el) { return el ? limpa(el.textContent) : ""; }
  function espera(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function vendas(t) { var m = /(\+?\s*\d[\d.,]*\s*(?:mil|k|milh(?:ão|ao|ões|oes))?\s*vendid[oa]s?)/i.exec(t || "") || /(vendid[oa]s?\s*:?\s*\d[\d.,]*\s*(?:mil|k)?)(?![\d\wÀ-ÿ])/i.exec(t || ""); return m ? limpa(m[1]) : null; }
  function compras(t) { var m = /((?:mais\s+de\s+)?\+?\s*\d[\d.,]*\s*(?:mil|milh(?:ão|ao|ões|oes))?\s*\+?\s*(?:compra(?:s|dos?)|vendid[oa]s?)\s+(?:no|nos|em)\s+(?:[úu]ltimos?\s+30\s+dias|(?:[úu]ltimo\s+)?m[eê]s(?:\s+passado)?))/i.exec(t || ""); return m ? limpa(m[1]) : null; }
  function folhas(el) {
    if (!el) return "";
    var d = el.ownerDocument || document, w = d.createTreeWalker(el, 4, null), n, out = [];
    while ((n = w.nextNode())) { var t = limpa(n.nodeValue); if (t) out.push(t); }
    return out.join(" | ");
  }
  function idMLB(u) { var m = /[?&#]wid=(MLB-?\d{6,})/i.exec(u) || /MLB-?(\d{6,})/i.exec(u); if (!m) return null; return "MLB" + /\d{6,}/.exec(m[0])[0]; }
  function idAmazon(u) { var m = /\/(?:dp|gp\/product|gp\/aw\/d|product|d)\/([A-Z0-9]{10})(?:[/?#]|$)/i.exec(u || ""); return m ? m[1].toUpperCase() : null; }
  function idShopee(u) { var a = /-i\.(\d+)\.(\d+)(?:[/?#]|$)/.exec(u || ""); if (a) return a[1] + "." + a[2]; var b = /\/product\/(\d+)\/(\d+)(?:[/?#]|$)/.exec(u || ""); return b ? b[1] + "." + b[2] : null; }
  function riscado(e) { for (var x = e, i = 0; x && x.nodeType === 1 && i < 4; x = x.parentElement, i++) { try { if (/line-through/.test(getComputedStyle(x).textDecorationLine || "")) return true; } catch (er) {} } return false; }
  var RE_PRECO = /^R\$\s*\d[\d.]*(?:,\d{1,2})?(?:\s*[-–]\s*R\$\s*\d[\d.]*(?:,\d{1,2})?)?$/;
  function elementosPreco(raiz) {
    var out = [];
    Array.prototype.forEach.call(raiz.querySelectorAll("*"), function (e) {
      var t = limpa(e.textContent);
      if (t.length > 40 || !RE_PRECO.test(t)) return;
      for (var i = 0; i < e.children.length; i++) { if (limpa(e.children[i].textContent) === t) return; }
      if (riscado(e)) return;
      out.push(e);
    });
    return out;
  }
  function precoGenerico(raiz) {
    var el = elementosPreco(raiz)[0];
    var t = el ? texto(el) : null;
    var m = /R\$\s*(\d[\d.]*(?:,\d{1,2})?)/.exec(t || raiz.textContent || "");
    if (!m) return null;
    var n = Number(m[1].replace(/\./g, "").replace(",", "."));
    return isFinite(n) ? n : null;
  }
  function numeroDe(t) {
    var m = /R\$\s*(\d[\d.]*(?:,\d{1,2})?)/.exec(t || ""); if (!m) return null;
    var n = Number(m[1].replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : null;
  }
  function precoRiscadoGenerico(raiz) {
    var achado = null;
    if (!raiz) return null;
    Array.prototype.forEach.call(raiz.querySelectorAll("*"), function (e) {
      if (achado != null) return;
      var t = limpa(e.textContent);
      if (t.length > 40 || !RE_PRECO.test(t)) return;
      for (var i = 0; i < e.children.length; i++) { if (limpa(e.children[i].textContent) === t) return; }
      if (riscado(e)) achado = numeroDe(t);
    });
    return achado;
  }
  function vendasGenerico(raiz) {
    var achado = null;
    Array.prototype.forEach.call(raiz.querySelectorAll("*"), function (e) {
      if (achado) return;
      var t = limpa(e.textContent);
      if (t.length < 40 && /vendid/i.test(t) && /\d/.test(t) && !e.children.length) achado = vendas(t);
    });
    return achado || vendas(folhas(raiz));
  }
  function imagem(raiz) {
    var i = raiz.querySelector("img"); if (!i) return null;
    var cand = [i.getAttribute("data-src"), i.currentSrc, i.getAttribute("src")];
    for (var k = 0; k < cand.length; k++) { if (cand[k] && cand[k].indexOf("data:") !== 0) return cand[k]; }
    return null;
  }
  function produtoLD() {
    var achado = null;
    function busca(o) {
      if (!o) return null;
      if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) { var r = busca(o[i]); if (r) return r; } return null; }
      if (o["@type"] === "Product") return o;
      return busca(o["@graph"]);
    }
    Array.prototype.forEach.call(document.querySelectorAll('script[type="application/ld+json"]'), function (s) {
      try { var r = busca(JSON.parse(s.textContent)); if (r && !achado) achado = r; } catch (e) {}
    });
    return achado;
  }
  function precoDoLD(ld) { var of = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers; if (!of) return null; var p = of.price != null ? of.price : of.lowPrice; var n = Number(p); return p != null && isFinite(n) ? n : null; }
  async function rolar() {
    var y0 = window.scrollY;
    for (var i = 0; i < 25; i++) {
      window.scrollBy(0, Math.max(400, Math.floor(window.innerHeight * 0.9)));
      await espera(300);
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 40) break;
    }
    window.scrollTo(0, y0);
    await espera(300);
  }
  function posicaoTag(t) { var m = /(\d{1,3})\s*[º°o]\s*mais\s+vendido/i.exec(t || ""); return m ? Number(m[1]) : null; }
  function montar(el, a, base, generico) {
    var href; try { href = new URL(a.getAttribute("href"), base).href; } catch (e) { return null; }
    var id = idMLB(href); if (!id) return null;
    var titulo = generico ? (texto(el.querySelector("h2,h3,.poly-component__title")) || limpa(a.getAttribute("title")) || texto(a).slice(0, 150)) : (texto(a) || limpa(a.getAttribute("title")) || texto(el.querySelector("h2,h3")));
    if (!titulo) return null;
    var vend = texto(el.querySelector(".poly-component__seller, .ui-search-official-store-label")).replace(/^(vendido\s+)?por\s+/i, "");
    return { mlb_id: id, titulo: titulo, vendedor: vend || null, marca: texto(el.querySelector(".poly-component__brand")) || null, url: href, imagem: imagem(el), preco: precoML(el), preco_original: precoOriginalML(el), vendas_texto: vendas(el.textContent), posicao: posicaoTag(el.textContent) };
  }
  function precoML(raiz) {
    if (!raiz) return null;
    var blocos = Array.prototype.slice.call(raiz.querySelectorAll(".andes-money-amount"));
    var atual = raiz.querySelector(".poly-price__current .andes-money-amount, .ui-search-price__second-line .andes-money-amount") || blocos.filter(function (b) { return !b.classList.contains("andes-money-amount--previous"); })[0];
    if (!atual) return null;
    var f = atual.querySelector(".andes-money-amount__fraction"); if (!f) return null;
    var c = atual.querySelector(".andes-money-amount__cents");
    var n = Number(texto(f).replace(/\./g, "") + (c ? "." + texto(c) : ""));
    return isFinite(n) ? n : null;
  }
  function precoOriginalML(raiz) {
    if (!raiz) return null;
    var b = raiz.querySelector(".andes-money-amount--previous"); if (!b) return null;
    var f = b.querySelector(".andes-money-amount__fraction"); if (!f) return null;
    var c = b.querySelector(".andes-money-amount__cents");
    var n = Number(texto(f).replace(/\./g, "") + (c ? "." + texto(c) : ""));
    return isFinite(n) ? n : null;
  }
  function juntarEm(mapa, lista, chave) {
    return function (item) {
      if (!item) return;
      var ja = mapa[item[chave]];
      if (ja) { for (var k in item) { if (ja[k] == null && item[k] != null) ja[k] = item[k]; } }
      else { mapa[item[chave]] = item; lista.push(item); }
    };
  }
  function cartoes(doc, base) {
    var mapa = {}, lista = [];
    var juntar = juntarEm(mapa, lista, "mlb_id");
    var els = doc.querySelectorAll("li.ui-search-layout__item, div.poly-card, div.ui-search-result__wrapper");
    Array.prototype.forEach.call(els, function (el) {
      var a = el.querySelector("a.poly-component__title, a.ui-search-link, a.ui-search-item__group__element, h2 a, h3 a") || el.querySelector("a[href]");
      if (a) juntar(montar(el, a, base, false));
    });
    if (!lista.length) {
      Array.prototype.forEach.call(doc.querySelectorAll("a[href]"), function (a) {
        if (!idMLB(a.getAttribute("href") || "")) return;
        var el = a;
        for (var i = 0; i < 7 && el; i++) { if (el.querySelector && el.querySelector("img") && el.querySelector(".andes-money-amount")) break; el = el.parentElement; }
        if (el && el.querySelector && el.querySelector(".andes-money-amount")) juntar(montar(el, a, base, true));
      });
    }
    return lista;
  }
  function proxima(doc, base) {
    var a = doc.querySelector(".andes-pagination__button--next a, a.andes-pagination__link[title='Seguinte'], a[rel='next']");
    if (!a || !a.getAttribute("href")) return null;
    try { return new URL(a.getAttribute("href"), base).href; } catch (e) { return null; }
  }
  async function lerMercadoLivre() {
    var ehLista = /^lista\./.test(location.hostname);
    var ehRanking = /^\/mais-vendidos/i.test(location.pathname);
    if (!ehLista && !ehRanking && idMLB(location.href)) {
      status("Lendo o anúncio…");
      var ld = produtoLD() || {};
      var of = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
      var titulo = limpa(ld.name) || texto(document.querySelector("h1.ui-pdp-title"));
      if (!titulo) throw new Error("Não consegui ler o título do anúncio. Abra a página do anúncio e tente de novo.");
      var pr = of && of.price != null ? Number(of.price) : precoML(document.querySelector(".ui-pdp-price__second-line"));
      var imgLd = Array.isArray(ld.image) ? ld.image[0] : ld.image;
      var og = document.querySelector('meta[property="og:image"]');
      var vend1 = texto(document.querySelector(".ui-pdp-seller__header__title, .ui-pdp-seller__link-trigger-button")).replace(/^(vendido\s+)?por\s+/i, "");
      var marca1 = limpa(typeof ld.brand === "object" && ld.brand ? ld.brand.name : ld.brand);
      if (!marca1) { Array.prototype.forEach.call(document.querySelectorAll("tr"), function (tr) { var th = tr.querySelector("th"), td = tr.querySelector("td"); if (!marca1 && th && td && /^marca$/i.test(texto(th))) marca1 = texto(td); }); }
      return { v: 1, canal: "mercadolivre", tipo: "anuncio", pagina_url: location.href, coletado_em: new Date().toISOString(), anuncios: [{
        mlb_id: idMLB(location.href), titulo: titulo, vendedor: vend1 || null, marca: marca1 || null, url: location.href,
        imagem: imgLd || (og && og.content) || null, preco: isFinite(pr) ? pr : null, preco_original: precoOriginalML(document.querySelector(".ui-pdp-price")),
        vendas_texto: vendas(texto(document.querySelector(".ui-pdp-subtitle")) || texto(document.querySelector(".ui-pdp-header")))
      }] };
    }
    var PAGINAS = 2, todos = [], vistos = {}, doc = document, base = location.href;
    for (var p = 1; p <= PAGINAS; p++) {
      status("Lendo a página " + p + " de " + PAGINAS + "…");
      cartoes(doc, base).forEach(function (c) { if (!vistos[c.mlb_id]) { vistos[c.mlb_id] = 1; todos.push(c); } });
      if (p === PAGINAS) break;
      var prox = proxima(doc, base); if (!prox) break;
      var r = await fetch(prox, { credentials: "include" }); if (!r.ok) break;
      doc = new DOMParser().parseFromString(await r.text(), "text/html"); base = prox;
    }
    if (!todos.length) throw new Error("Não encontrei anúncios nesta página. Abra uma listagem ou a página Mais vendidos do Mercado Livre e tente de novo.");
    if (ehRanking) { todos.forEach(function (c, i) { if (c.posicao == null) c.posicao = i + 1; }); }
    return { v: 1, canal: "mercadolivre", tipo: ehRanking ? "ranking" : "categoria", pagina_url: location.href, categoria_nome: texto(document.querySelector("h1")) || null, coletado_em: new Date().toISOString(), anuncios: todos };
  }
  function cartaoAmazon(el, base) {
    var asin = el.getAttribute("data-asin"); if (!asin || !/^[A-Z0-9]{10}$/i.test(asin)) return null;
    var h = el.querySelector("h2");
    var img = el.querySelector("img.s-image") || el.querySelector("img");
    var titulo = texto(h) || limpa(img && img.getAttribute("alt")); if (!titulo) return null;
    var p = el.querySelector(".a-price:not(.a-text-price) .a-offscreen");
    var pr = p ? Number(texto(p).replace(/[^\d,]/g, "").replace(",", ".")) : precoGenerico(el);
    var pd = el.querySelector(".a-price.a-text-price .a-offscreen");
    return { mlb_id: asin.toUpperCase(), titulo: titulo, vendedor: null, marca: null, url: "https://www.amazon.com.br/dp/" + asin.toUpperCase(), imagem: img ? (img.getAttribute("src") || null) : null, preco: pr != null && isFinite(pr) ? pr : null, preco_original: pd ? numeroDe(texto(pd)) : null, vendas_texto: compras(folhas(el)), posicao: null };
  }
  function cartoesAmazonLista(doc, base) {
    var mapa = {}, lista = [], juntar = juntarEm(mapa, lista, "mlb_id");
    Array.prototype.forEach.call(doc.querySelectorAll("div[data-component-type='s-search-result'][data-asin], div.s-result-item[data-asin]"), function (el) { juntar(cartaoAmazon(el, base)); });
    return lista;
  }
  function cartoesAmazonRanking(doc, base) {
    var mapa = {}, lista = [], juntar = juntarEm(mapa, lista, "mlb_id");
    Array.prototype.forEach.call(doc.querySelectorAll("a[href]"), function (a) {
      var asin = idAmazon(a.getAttribute("href") || ""); if (!asin) return;
      var el = a;
      for (var i = 0; i < 7 && el; i++) { if (el.querySelector && el.querySelector("img") && /R\$\s*\d/.test(el.textContent || "")) break; el = el.parentElement; }
      if (!el || !el.querySelector || !/R\$\s*\d/.test(el.textContent || "")) return;
      var img = el.querySelector("img");
      var titulo = limpa(img && img.getAttribute("alt")) || texto(el.querySelector("[class*='line-clamp'], span > div")) || limpa(a.getAttribute("title")) || texto(a).slice(0, 150);
      if (!titulo) return;
      var tag = el.querySelector(".zg-bdg-text, [class*='zg-bdg']");
      var pos = /#\s*(\d{1,3})/.exec(texto(tag) || el.textContent || "");
      juntar({ mlb_id: asin, titulo: titulo, vendedor: null, marca: null, url: "https://www.amazon.com.br/dp/" + asin, imagem: img ? (img.getAttribute("src") || null) : null, preco: precoGenerico(el), vendas_texto: compras(folhas(el)), posicao: pos ? Number(pos[1]) : null });
    });
    return lista;
  }
  function proximaAmazon(doc, base) {
    var a = doc.querySelector("a.s-pagination-next:not(.s-pagination-disabled), a[rel='next']");
    if (!a || !a.getAttribute("href")) return null;
    try { return new URL(a.getAttribute("href"), base).href; } catch (e) { return null; }
  }
  async function lerAmazon() {
    var ehRanking = /(bestsellers|best-sellers|mais-vendidos|zgbs)/i.test(location.pathname);
    var asin = idAmazon(location.pathname + location.search);
    if (!ehRanking && asin && !/^\/s(\/|$)/.test(location.pathname)) {
      status("Lendo o produto…");
      var titulo = texto(document.getElementById("productTitle"));
      if (!titulo) throw new Error("Não consegui ler o título do produto. Abra a página do produto da Amazon e tente de novo.");
      var pe = document.querySelector("#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen, #corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen, #apex_desktop .a-price:not(.a-text-price) .a-offscreen, .a-price:not(.a-text-price) .a-offscreen");
      var pr = pe ? Number(texto(pe).replace(/[^\d,]/g, "").replace(",", ".")) : null;
      var pdp = document.querySelector("#corePriceDisplay_desktop_feature_div .a-price.a-text-price .a-offscreen, #corePrice_feature_div .a-price.a-text-price .a-offscreen, #apex_desktop .basisPrice .a-offscreen, .basisPrice .a-offscreen");
      var vend = texto(document.getElementById("sellerProfileTriggerId"));
      if (!vend) { var mi = /(?:vendido|enviado)\s+por\s+(.+?)(?:\s+e\s+entregue|\.|$)/i.exec(texto(document.getElementById("merchantInfoFeature_feature_div")) || texto(document.getElementById("tabular-buybox"))); if (mi) vend = limpa(mi[1]); }
      var marca = texto(document.getElementById("bylineInfo")).replace(/^(marca:|visite a loja\s+(?:d[aeo]s?\s+)?|visit the\s+|brand:)\s*/i, "").replace(/\s+store$/i, "");
      if (!marca) { var po = document.querySelector(".po-brand .po-break-word"); marca = texto(po); }
      var im = document.getElementById("landingImage");
      var imagemSrc = im ? (im.getAttribute("data-old-hires") || im.getAttribute("src")) : null;
      var prova = folhas(document.getElementById("social-proofing-faceout-title-tk_bought")) || folhas(document.getElementById("centerCol"));
      return { v: 1, canal: "amazon", tipo: "anuncio", pagina_url: location.href, coletado_em: new Date().toISOString(), anuncios: [{
        mlb_id: asin, titulo: titulo, vendedor: vend || null, marca: marca || null, url: "https://www.amazon.com.br/dp/" + asin, imagem: imagemSrc,
        preco: pr != null && isFinite(pr) ? pr : null, preco_original: pdp ? numeroDe(texto(pdp)) : null, vendas_texto: compras(prova)
      }] };
    }
    var PAGINAS = ehRanking ? 1 : 2, todos = [], vistos = {}, doc = document, base = location.href;
    for (var p = 1; p <= PAGINAS; p++) {
      status("Lendo a página " + p + " de " + PAGINAS + "…");
      if (doc.querySelector("form[action*='validateCaptcha']")) throw new Error("A Amazon pediu uma verificação (captcha). Resolva-a na página e clique no favorito de novo.");
      var achados = cartoesAmazonLista(doc, base);
      if (!achados.length) achados = cartoesAmazonRanking(doc, base);
      achados.forEach(function (c) { if (!vistos[c.mlb_id]) { vistos[c.mlb_id] = 1; todos.push(c); } });
      if (p === PAGINAS) break;
      var prox = proximaAmazon(doc, base); if (!prox) break;
      var r = await fetch(prox, { credentials: "include" }); if (!r.ok) break;
      doc = new DOMParser().parseFromString(await r.text(), "text/html"); base = prox;
    }
    if (!todos.length) throw new Error("Não encontrei produtos nesta página. Abra uma busca, categoria ou a página Mais vendidos da Amazon e tente de novo.");
    if (ehRanking) { todos.forEach(function (c, i) { if (c.posicao == null) c.posicao = i + 1; }); }
    return { v: 1, canal: "amazon", tipo: ehRanking ? "ranking" : "categoria", pagina_url: location.href, categoria_nome: texto(document.querySelector("h1")) || limpa((new URL(location.href)).searchParams.get("k")) || null, coletado_em: new Date().toISOString(), anuncios: todos };
  }
  function cartoesShopee() {
    var mapa = {}, lista = [], juntar = juntarEm(mapa, lista, "mlb_id");
    Array.prototype.forEach.call(document.querySelectorAll("a[href]"), function (a) {
      var href; try { href = new URL(a.getAttribute("href"), location.href).href; } catch (e) { return; }
      var id = idShopee(new URL(href).pathname); if (!id) return;
      var el = a;
      for (var i = 0; i < 7 && el; i++) { if (el.querySelector && el.querySelector("img") && /R\$\s*\d/.test(el.textContent || "")) break; el = el.parentElement; }
      if (!el || !el.querySelector || !/R\$\s*\d/.test(el.textContent || "")) return;
      var img = el.querySelector("img");
      var titulo = limpa(img && img.getAttribute("alt"));
      if (!titulo || titulo.length < 12) {
        var maior = "";
        Array.prototype.forEach.call(el.querySelectorAll("*"), function (e) { if (e.children.length) return; var t = limpa(e.textContent); if (t.length > maior.length && t.length < 200 && !/^R\$|vendid|^-?\d+%|frete|^\d[\d.,]*$/i.test(t)) maior = t; });
        titulo = maior || titulo;
      }
      if (!titulo) return;
      var sp = id.split(".");
      juntar({ mlb_id: id, titulo: titulo, vendedor: null, marca: null, url: "https://shopee.com.br/product/" + sp[0] + "/" + sp[1], imagem: img ? (img.getAttribute("src") || null) : null, preco: precoGenerico(el), preco_original: precoRiscadoGenerico(el), vendas_texto: vendasGenerico(el), posicao: null });
    });
    return lista;
  }
  async function lerShopee() {
    var id = idShopee(location.pathname);
    if (id) {
      status("Lendo o produto…");
      var ld = produtoLD() || {};
      var titulo = limpa(ld.name) || texto(document.querySelector("h1")) || limpa((document.querySelector('meta[property="og:title"]') || {}).content);
      if (!titulo) throw new Error("Não consegui ler o título do produto. Espere a página carregar por completo e tente de novo.");
      var pr = precoDoLD(ld); if (pr == null) pr = precoGenerico(document.querySelector("main") || document.body);
      var imgLd = Array.isArray(ld.image) ? ld.image[0] : ld.image;
      var og = document.querySelector('meta[property="og:image"]');
      var marca = limpa(typeof ld.brand === "object" && ld.brand ? ld.brand.name : ld.brand);
      var sp = id.split(".");
      return { v: 1, canal: "shopee", tipo: "anuncio", pagina_url: location.href, coletado_em: new Date().toISOString(), anuncios: [{
        mlb_id: id, titulo: titulo, vendedor: null, marca: marca || null, url: "https://shopee.com.br/product/" + sp[0] + "/" + sp[1],
        imagem: imgLd || (og && og.content) || null, preco: pr, preco_original: precoRiscadoGenerico(document.querySelector("main") || document.body), vendas_texto: vendasGenerico(document.querySelector("main") || document.body)
      }] };
    }
    status("Rolando a página para carregar os produtos…");
    await rolar();
    status("Lendo os produtos…");
    var todos = cartoesShopee();
    if (!todos.length) throw new Error("Não encontrei produtos nesta página. Abra uma busca, categoria ou loja da Shopee, espere carregar e tente de novo.");
    var kw = (new URL(location.href)).searchParams.get("keyword");
    return { v: 1, canal: "shopee", tipo: "categoria", pagina_url: location.href, categoria_nome: limpa(kw) || texto(document.querySelector("h1")) || null, coletado_em: new Date().toISOString(), anuncios: todos };
  }
  function linkDoCartao(el) {
    var primeiro = null, externo = null;
    Array.prototype.forEach.call(el.querySelectorAll("a[href]"), function (a) {
      var h; try { h = new URL(a.getAttribute("href"), location.href); } catch (e) { return; }
      if (!/^https?:$/.test(h.protocol)) return;
      var dest = h;
      if (/(^|\.)google\./.test(h.hostname) && /^\/(url|aclk)$/.test(h.pathname)) { var alvo = h.searchParams.get("url") || h.searchParams.get("q") || h.searchParams.get("adurl"); if (alvo) { try { dest = new URL(alvo); } catch (e) {} } }
      if (!primeiro) primeiro = dest.href;
      if (!externo && !/(^|\.)google\./.test(dest.hostname)) externo = dest.href;
    });
    return externo || primeiro;
  }
  async function lerGoogle() {
    status("Rolando a página para carregar os resultados…");
    await rolar();
    status("Lendo os resultados…");
    var precos = elementosPreco(document.body).filter(function (e) { return !e.closest("header, nav, [role='navigation']"); });
    if (precos.length > 400) precos = precos.slice(0, 400);
    var usados = [], resultados = [];
    precos.forEach(function (pe) {
      var card = null, el = pe;
      for (var i = 0; i < 9 && el && el !== document.body; i++) {
        el = el.parentElement; if (!el) break;
        var n = 0; for (var k = 0; k < precos.length; k++) { if (el.contains(precos[k])) n++; if (n > 1) break; }
        if (n > 1) break;
        if (el.querySelector("a[href]")) card = el;
      }
      if (!card || usados.indexOf(card) >= 0) return;
      usados.push(card);
      var preco = precoGenerico(pe.parentElement && pe.parentElement.contains(pe) ? pe : card);
      var folhas = [];
      Array.prototype.forEach.call(card.querySelectorAll("*"), function (e) { if (!e.children.length) { var t = limpa(e.textContent); if (t.length >= 2 && t.length <= 220) folhas.push(t); } });
      var heading = card.querySelector("[role='heading'], h3, h4");
      var titulo = texto(heading);
      if (!titulo) { folhas.forEach(function (t) { if (t.length > titulo.length && !/^R\$|^\d[\d.,]*$|frete|avalia|opini|% ?off|^-\d+%/i.test(t)) titulo = t; }); }
      var link = linkDoCartao(card);
      var host = ""; try { host = new URL(link).hostname.replace(/^www\./, ""); } catch (e) {}
      if (/(^|\.)google\./.test(host)) host = "";
      var loja = "";
      var LOJAS = /mercado\s*li[vb]re|amazon|shopee|magalu|magazine\s*luiza|netshoes|shein|tiktok|centauro|americanas|casas\s*bahia|kabum|aliexpress|leroy|submarino|carrefour|extra|ponto|fast\s*shop|dafiti|amaro|renner|shoptime|zattini|havan|decathlon|nike|adidas/i;
      folhas.forEach(function (t) { if (!loja && t.length <= 40 && t !== titulo && LOJAS.test(t) && !/^R\$/.test(t)) loja = t; });
      if (!loja) { var cand = ""; folhas.forEach(function (t) { if (!cand && t.length >= 3 && t.length <= 30 && t !== titulo && !/^R\$|\d|frete|avalia|opini|off|parcel|grátis|gratis|vendid|novo|usado/i.test(t)) cand = t; }); loja = cand; }
      var img = card.querySelector("img"); var src = img ? (img.getAttribute("src") || "") : "";
      if (titulo && preco != null) resultados.push({ titulo: titulo, loja: loja || host || null, host: host || null, preco: preco, url: link, imagem: /^https:/.test(src) ? src : null });
    });
    if (!resultados.length) throw new Error("Não encontrei produtos com preço nesta página. No Google, abra a aba Shopping, espere carregar e clique no favorito de novo.");
    var q = (new URL(location.href)).searchParams.get("q");
    return { v: 1, canal: "google", tipo: "pesquisa", pagina_url: location.href, termo: limpa(q) || null, coletado_em: new Date().toISOString(), resultados: resultados };
  }
  var ABAS = { mercadolivre: "Mercado Livre", shopee: "Shopee", amazon: "Amazon", google: "Pesquisa de preços (ou Buscar fotos)" };
  async function mostrar(payload) {
    var itens = payload.anuncios || payload.resultados || [];
    var json = JSON.stringify(payload);
    var info;
    if (payload.tipo === "pesquisa") {
      var comLoja = itens.filter(function (a) { return a.loja; }).length;
      info = comLoja + " com o nome da loja identificado.";
    } else {
      var comVendas = itens.filter(function (a) { return a.vendas_texto; }).length;
      var comPosicao = itens.filter(function (a) { return a.posicao; }).length;
      info = comVendas + " com " + (payload.canal === "amazon" ? "compras do mês" : "total de vendas") + " visível" + (comPosicao ? ", " + comPosicao + " com posição no Mais vendidos" : "") + ".";
    }
    tela("<b>Pronto: " + itens.length + (payload.tipo === "pesquisa" ? " oferta(s)" : " anúncio(s)") + "</b><div id='cb-info' style='margin:6px 0 0;color:#cbd5e1'>" + esc(info) + "</div><div id='cb-msg' style='margin:2px 0 6px;color:#a5b4fc'></div>" +
      "<textarea id='cb-ta' readonly style='width:100%;height:80px;background:#020617;color:#e2e8f0;border:1px solid #334155;border-radius:8px;font:11px monospace'></textarea>" +
      "<div style='margin-top:8px;display:flex;gap:8px'><button id='cb-copiar' style='background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer;font-weight:700'>Copiar</button>" +
      "<button id='cb-fechar' style='background:#1e293b;color:#e2e8f0;border:0;border-radius:8px;padding:6px 12px;cursor:pointer'>Fechar</button></div>");
    var ta = document.getElementById("cb-ta"); ta.value = json;
    var aviso = "Copiado! Volte ao painel, aba " + (ABAS[payload.canal] || "") + ", e cole no campo de importação.";
    function copiar() {
      ta.focus(); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.getElementById("cb-msg").textContent = ok ? aviso : "Não deu para copiar sozinho: o texto está selecionado, aperte Ctrl+C.";
    }
    document.getElementById("cb-copiar").onclick = copiar;
    document.getElementById("cb-fechar").onclick = function () { caixa.remove(); };
    try { await navigator.clipboard.writeText(json); document.getElementById("cb-msg").textContent = aviso; } catch (e) { copiar(); }
  }
  try {
    var h = location.hostname;
    var payload;
    if (/(^|\.)google\.[a-z.]+$/i.test(h)) payload = await lerGoogle();
    else if (/(^|\.)amazon\.com\.br$/i.test(h)) payload = await lerAmazon();
    else if (/(^|\.)shopee\.com\.br$/i.test(h)) payload = await lerShopee();
    else payload = await lerMercadoLivre();
    await mostrar(payload);
  } catch (e) {
    tela("<b>Monitor de concorrentes</b><div style='margin:6px 0;color:#fca5a5'>" + esc(e.message || e) + "</div><button id='cb-fechar' style='background:#1e293b;color:#e2e8f0;border:0;border-radius:8px;padding:6px 12px;cursor:pointer'>Fechar</button>");
    document.getElementById("cb-fechar").onclick = function () { caixa.remove(); };
  }
})();`;

/** Endereço do favorito: arraste o link para a barra de favoritos (ou crie um favorito e cole isto como endereço). */
export const favoritoHref = () => "javascript:" + encodeURIComponent(FAVORITO_JS);
