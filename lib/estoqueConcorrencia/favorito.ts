// Favorito (bookmarklet) "Ler estoque": roda no navegador do usuário, numa página do Mercado Livre, pega a lista de anúncios que o painel copiou,
// abre cada anúncio (mesmo endereço, com a sessão do usuário) e mostra o texto com o estoque lido, para colar no painel.
// O servidor costuma ser barrado pelo Mercado Livre; o navegador do usuário não. Não envia nada sozinho.
// JS puro e autocontido: sem comentários "//" e todo comando termina em ";" (o código vai numa linha só dentro do favorito).
import { LER_ESTOQUE_JS } from "./leitorJs";

export const FAVORITO_ESTOQUE_JS = String.raw`(async function () {${LER_ESTOQUE_JS}
  var ID = "cb-estoque-box";
  var antigo = document.getElementById(ID); if (antigo) { antigo.remove(); }
  var caixa = document.createElement("div"); caixa.id = ID;
  caixa.style.cssText = "position:fixed;z-index:2147483647;top:12px;right:12px;width:400px;max-width:92vw;background:#0f172a;color:#e2e8f0;font:13px/1.4 system-ui,sans-serif;border:1px solid #f43f5e;border-radius:12px;padding:14px;box-shadow:0 10px 40px rgba(0,0,0,.5);";
  document.body.appendChild(caixa);
  var BTN = "border:0;border-radius:8px;padding:6px 12px;cursor:pointer;";
  function esc(t) { return String(t).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function tela(html) { caixa.innerHTML = html; }
  function status(t) { tela("<b>Ler estoque</b><div style='margin-top:6px'>" + esc(t) + "</div>"); }
  function espera(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function fechavel(html) {
    tela(html + "<div style='margin-top:8px'><button id='cb-fechar' style='background:#1e293b;color:#e2e8f0;" + BTN + "'>Fechar</button></div>");
    document.getElementById("cb-fechar").onclick = function () { caixa.remove(); };
  }
  function erro(t) { fechavel("<b>Ler estoque</b><div style='margin:6px 0;color:#fca5a5'>" + t + "</div>"); }
  function lerLista(t) { try { var j = JSON.parse(t); if (j && j.v === 1 && j.tipo === "lista_estoque" && Array.isArray(j.itens)) { return j; } } catch (e) {} return null; }
  var host = location.hostname.toLowerCase();
  async function pedirLista() {
    var l = null;
    status("Lendo a lista copiada (se o navegador perguntar, permita ver a área de transferência)…");
    try { l = lerLista(await Promise.race([navigator.clipboard.readText(), espera(4000).then(function () { return ""; })])); } catch (e) {}
    if (l) { return l; }
    return new Promise(function (resolve) {
      tela("<b>Ler estoque</b><div style='margin:6px 0'>Não achei a lista copiada do painel. Cole aqui (botão “Copiar lista” do painel):</div>" +
        "<textarea id='cb-lista' style='width:100%;height:80px;background:#020617;color:#e2e8f0;border:1px solid #334155;border-radius:8px;font:11px monospace'></textarea>" +
        "<div id='cb-msg' style='margin:4px 0;color:#fca5a5'></div>" +
        "<div style='display:flex;gap:8px'><button id='cb-ir' style='background:#e11d48;color:#fff;" + BTN + "font-weight:700'>Ler estoque</button>" +
        "<button id='cb-fechar' style='background:#1e293b;color:#e2e8f0;" + BTN + "'>Fechar</button></div>");
      document.getElementById("cb-fechar").onclick = function () { caixa.remove(); };
      document.getElementById("cb-ir").onclick = function () {
        var x = lerLista(document.getElementById("cb-lista").value);
        if (!x) { document.getElementById("cb-msg").textContent = "Texto inválido: use o botão Copiar lista do painel."; return; }
        resolve(x);
      };
    });
  }
  try {
    if (/^(www\.)?(localhost|127\.0\.0\.1)/i.test(host) || /vercel\.app$/i.test(host)) { erro("Abra uma página do site do canal (ex.: a página de um produto) e clique de novo, não a do painel."); return; }
    var lista = await pedirLista();
    var canalLista = typeof lista.canal === "string" ? lista.canal : "mercadolivre";
    var daqui = [], outros = {}, total = 0;
    lista.itens.forEach(function (it) {
      if (!it || !/^[A-Za-z0-9._:-]{3,80}$/.test(it.item_id) || typeof it.url !== "string") { return; }
      total++;
      var h = ""; try { h = new URL(it.url).hostname.toLowerCase(); } catch (e) {}
      if (h === host) { daqui.push(it); } else { outros[h || "?"] = (outros[h || "?"] || 0) + 1; }
    });
    var resto = Object.keys(outros).map(function (h) { return outros[h] + " em " + h; }).join(", ");
    if (!daqui.length) { erro("Nenhum anúncio da lista é deste endereço (" + esc(host) + "). Estão em: " + esc(resto || "—") + ". Abra qualquer página desse endereço e clique de novo."); return; }
    var lidos = [], falhas = [], feitos = 0, fila = daqui.slice();
    async function um(it) {
      try {
        var r = await fetch(it.url, { credentials: "include" });
        if (r.status === 404 || r.status === 410) {
          lidos.push({ item_id: it.item_id, status: "esgotado", estoque: null, aproximado: false, detalhe: "A página do anúncio não existe mais (erro " + r.status + ").", titulo: null, imagem: null, vendedor: null });
        } else {
          if (!r.ok) { throw new Error("erro " + r.status); }
          if (/\/(captcha|account-verification|gz\/|login)/i.test(new URL(r.url).pathname)) { throw new Error("o site pediu verificação"); }
          var l = lerEstoqueHtml(await r.text(), canalLista, it.item_id);
          l.item_id = it.item_id;
          lidos.push(l);
        }
      } catch (e) { falhas.push({ item_id: it.item_id, motivo: String((e && e.message) || e).slice(0, 80) }); }
      feitos++;
      status("Lendo anúncios… " + feitos + " de " + daqui.length);
    }
    async function trabalhador() { while (fila.length) { await um(fila.shift()); await espera(150); } }
    status("Lendo anúncios… 0 de " + daqui.length);
    await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
    if (!lidos.length) { erro("Não consegui ler nenhum anúncio (" + esc(falhas[0] ? falhas[0].motivo : "sem resposta") + "). Confira se está logado e se a página abre normalmente, e tente de novo."); return; }
    var acabaram = lidos.filter(function (a) { return a.status === "esgotado"; }).length;
    var semSinal = lidos.filter(function (a) { return a.status === "desconhecido"; }).length;
    var payload = { v: 1, canal: canalLista, tipo: "estoque", pagina_url: location.href, coletado_em: new Date().toISOString(), lidos: lidos, falhas: falhas };
    var json = JSON.stringify(payload);
    var partes = [lidos.length + " de " + total + " lidos", acabaram + " sem estoque"];
    if (semSinal) { partes.push(semSinal + " sem informação de estoque na página"); }
    if (falhas.length) { partes.push(falhas.length + " com erro (" + falhas[0].item_id + ": " + falhas[0].motivo + ")"); }
    if (resto) { partes.push("faltam " + resto + ": abra uma página desse endereço e clique de novo com a mesma lista"); }
    tela("<b>Pronto: " + lidos.length + " anúncio(s) lido(s)</b><div style='margin:6px 0 0;color:#cbd5e1'>" + esc(partes.join(" · ")) + "</div><div id='cb-msg' style='margin:2px 0 6px;color:#6ee7b7'></div>" +
      "<textarea id='cb-ta' readonly style='width:100%;height:70px;background:#020617;color:#e2e8f0;border:1px solid #334155;border-radius:8px;font:11px monospace'></textarea>" +
      "<div style='margin-top:8px;display:flex;gap:8px'><button id='cb-copiar' style='background:#e11d48;color:#fff;" + BTN + "font-weight:700'>Copiar</button>" +
      "<button id='cb-fechar' style='background:#1e293b;color:#e2e8f0;" + BTN + "'>Fechar</button></div>");
    var ta = document.getElementById("cb-ta"); ta.value = json;
    var aviso = "Copiado! Volte ao painel e cole no campo “Resultado da leitura”.";
    function copiar() {
      ta.focus(); ta.select();
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
      document.getElementById("cb-msg").textContent = ok ? aviso : "Não deu para copiar sozinho: o texto está selecionado, aperte Ctrl+C.";
    }
    document.getElementById("cb-copiar").onclick = copiar;
    document.getElementById("cb-fechar").onclick = function () { caixa.remove(); };
    try { await navigator.clipboard.writeText(json); document.getElementById("cb-msg").textContent = aviso; } catch (e) { copiar(); }
  } catch (e) { erro(esc((e && e.message) || e)); }
})();`;

/** Endereço do favorito “Ler estoque” (arraste para a barra de favoritos). */
export const favoritoEstoqueHref = () => "javascript:" + encodeURIComponent(FAVORITO_ESTOQUE_JS);

export interface ListaEstoque { v: 1; tipo: "lista_estoque"; canal: string; gerado_em: string; itens: { item_id: string; url: string }[] }
/** Lista que o painel copia para o favorito ler (os anúncios acompanhados e ativos de UM canal). */
export function montarListaEstoque(itens: { item_id: string; url: string }[], canal: string = "mercadolivre", agora: Date = new Date()): ListaEstoque {
  const vistos = new Set<string>();
  return { v: 1, tipo: "lista_estoque", canal, gerado_em: agora.toISOString(), itens: itens.filter((i) => (vistos.has(i.item_id) ? false : (vistos.add(i.item_id), true))).map((i) => ({ item_id: i.item_id, url: i.url })) };
}
