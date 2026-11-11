// Favorito (bookmarklet) "Capturar anúncios": roda DENTRO do navegador do usuário, na página do Mercado Livre,
// lê os anúncios e mostra um texto (JSON) para colar no painel. Não envia nada sozinho e não usa senha:
// o navegador já está logado e não é bloqueado como o servidor.
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
  function vendas(t) { var m = /(\+?\s*\d[\d.,]*\s*(?:mil|milh(?:ão|ao|ões|oes))?\s*vendid[oa]s?)/i.exec(t || ""); return m ? limpa(m[1]) : null; }
  function idMLB(u) { var m = /[?&#]wid=(MLB-?\d{6,})/i.exec(u) || /MLB-?(\d{6,})/i.exec(u); if (!m) return null; return "MLB" + /\d{6,}/.exec(m[0])[0]; }
  function preco(raiz) {
    if (!raiz) return null;
    var blocos = Array.prototype.slice.call(raiz.querySelectorAll(".andes-money-amount"));
    var atual = raiz.querySelector(".poly-price__current .andes-money-amount, .ui-search-price__second-line .andes-money-amount") || blocos.filter(function (b) { return !b.classList.contains("andes-money-amount--previous"); })[0];
    if (!atual) return null;
    var f = atual.querySelector(".andes-money-amount__fraction"); if (!f) return null;
    var c = atual.querySelector(".andes-money-amount__cents");
    var n = Number(texto(f).replace(/\./g, "") + (c ? "." + texto(c) : ""));
    return isFinite(n) ? n : null;
  }
  function imagem(raiz) {
    var i = raiz.querySelector("img"); if (!i) return null;
    var cand = [i.getAttribute("data-src"), i.currentSrc, i.getAttribute("src")];
    for (var k = 0; k < cand.length; k++) { if (cand[k] && cand[k].indexOf("data:") !== 0) return cand[k]; }
    return null;
  }
  function posicaoTag(t) { var m = /(\d{1,3})\s*[\u00ba\u00b0o]\s*mais\s+vendido/i.exec(t || ""); return m ? Number(m[1]) : null; }
  function montar(el, a, base, generico) {
    var href; try { href = new URL(a.getAttribute("href"), base).href; } catch (e) { return null; }
    var id = idMLB(href); if (!id) return null;
    var titulo = generico ? (texto(el.querySelector("h2,h3,.poly-component__title")) || limpa(a.getAttribute("title")) || texto(a).slice(0, 150)) : (texto(a) || limpa(a.getAttribute("title")) || texto(el.querySelector("h2,h3")));
    if (!titulo) return null;
    var vend = texto(el.querySelector(".poly-component__seller, .ui-search-official-store-label")).replace(/^(vendido\s+)?por\s+/i, "");
    return { mlb_id: id, titulo: titulo, vendedor: vend || null, marca: texto(el.querySelector(".poly-component__brand")) || null, url: href, imagem: imagem(el), preco: preco(el), vendas_texto: vendas(el.textContent), posicao: posicaoTag(el.textContent) };
  }
  function cartoes(doc, base) {
    var mapa = {}, lista = [];
    function juntar(item) {
      if (!item) return;
      var ja = mapa[item.mlb_id];
      if (ja) { for (var k in item) { if (ja[k] == null && item[k] != null) ja[k] = item[k]; } }
      else { mapa[item.mlb_id] = item; lista.push(item); }
    }
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
  try {
    var payload;
    var ehLista = /^lista\./.test(location.hostname);
    var ehRanking = /^\/mais-vendidos/i.test(location.pathname);
    if (!ehLista && !ehRanking && idMLB(location.href)) {
      status("Lendo o anúncio…");
      var ld = produtoLD() || {};
      var of = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
      var titulo = limpa(ld.name) || texto(document.querySelector("h1.ui-pdp-title"));
      if (!titulo) throw new Error("Não consegui ler o título do anúncio. Abra a página do anúncio e tente de novo.");
      var pr = of && of.price != null ? Number(of.price) : preco(document.querySelector(".ui-pdp-price__second-line"));
      var imgLd = Array.isArray(ld.image) ? ld.image[0] : ld.image;
      var og = document.querySelector('meta[property="og:image"]');
      var vend1 = texto(document.querySelector(".ui-pdp-seller__header__title, .ui-pdp-seller__link-trigger-button")).replace(/^(vendido\s+)?por\s+/i, "");
      var marca1 = limpa(typeof ld.brand === "object" && ld.brand ? ld.brand.name : ld.brand);
      if (!marca1) { Array.prototype.forEach.call(document.querySelectorAll("tr"), function (tr) { var th = tr.querySelector("th"), td = tr.querySelector("td"); if (!marca1 && th && td && /^marca$/i.test(texto(th))) marca1 = texto(td); }); }
      payload = { v: 1, tipo: "anuncio", pagina_url: location.href, coletado_em: new Date().toISOString(), anuncios: [{
        mlb_id: idMLB(location.href), titulo: titulo, vendedor: vend1 || null, marca: marca1 || null, url: location.href,
        imagem: imgLd || (og && og.content) || null, preco: isFinite(pr) ? pr : null,
        vendas_texto: vendas(texto(document.querySelector(".ui-pdp-subtitle")) || texto(document.querySelector(".ui-pdp-header")))
      }] };
    } else {
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
      payload = { v: 1, tipo: ehRanking ? "ranking" : "categoria", pagina_url: location.href, categoria_nome: texto(document.querySelector("h1")) || null, coletado_em: new Date().toISOString(), anuncios: todos };
    }
    var json = JSON.stringify(payload);
    var comVendas = payload.anuncios.filter(function (a) { return a.vendas_texto; }).length;
    var comPosicao = payload.anuncios.filter(function (a) { return a.posicao; }).length;
    tela("<b>Pronto: " + payload.anuncios.length + " anúncio(s)</b><div id='cb-info' style='margin:6px 0 0;color:#cbd5e1'>" + comVendas + " com total de vendas visível" + (comPosicao ? ", " + comPosicao + " com posição no Mais vendidos" : "") + ".</div><div id='cb-msg' style='margin:2px 0 6px;color:#a5b4fc'></div>" +
      "<textarea id='cb-ta' readonly style='width:100%;height:80px;background:#020617;color:#e2e8f0;border:1px solid #334155;border-radius:8px;font:11px monospace'></textarea>" +
      "<div style='margin-top:8px;display:flex;gap:8px'><button id='cb-copiar' style='background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer;font-weight:700'>Copiar</button>" +
      "<button id='cb-fechar' style='background:#1e293b;color:#e2e8f0;border:0;border-radius:8px;padding:6px 12px;cursor:pointer'>Fechar</button></div>");
    var ta = document.getElementById("cb-ta"); ta.value = json;
    function copiar() {
      ta.focus(); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.getElementById("cb-msg").textContent = ok ? "Copiado! Volte ao painel e cole no campo de importação." : "Não deu para copiar sozinho: o texto está selecionado, aperte Ctrl+C.";
    }
    document.getElementById("cb-copiar").onclick = copiar;
    document.getElementById("cb-fechar").onclick = function () { caixa.remove(); };
    try { await navigator.clipboard.writeText(json); document.getElementById("cb-msg").textContent = "Copiado! Volte ao painel e cole no campo de importação."; } catch (e) { copiar(); }
  } catch (e) {
    tela("<b>Monitor de concorrentes</b><div style='margin:6px 0;color:#fca5a5'>" + esc(e.message || e) + "</div><button id='cb-fechar' style='background:#1e293b;color:#e2e8f0;border:0;border-radius:8px;padding:6px 12px;cursor:pointer'>Fechar</button>");
    document.getElementById("cb-fechar").onclick = function () { caixa.remove(); };
  }
})();`;

/** Endereço do favorito: arraste o link para a barra de favoritos (ou crie um favorito e cole isto como endereço). */
export const favoritoHref = () => "javascript:" + encodeURIComponent(FAVORITO_JS);
