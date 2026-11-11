// Busca de fotos: download seguro de URLs que NÃO são nossas (vêm das lojas encontradas no Google). Barra SSRF: só https público.
import { lookup as dnsLookup } from "node:dns";
import { request as httpsRequest } from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";

/** Endereço de rede interna/reservada? (v4 e v6, inclusive v6 mapeado em v4) */
export function ipPrivado(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    const mapeado = x.match(/^(?:0:0:0:0:0:ffff:|::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeado) return ipPrivado(mapeado[1]);
    return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff") || x.startsWith("2001:db8");
  }
  return true; // não é IP válido
}

/** Só liberado em máquina local para testes; na Vercel (VERCEL definida) nunca vale. */
const redeLocalLiberada = () => !process.env.VERCEL && process.env.FOTOS_PERMITIR_REDE_LOCAL === "1";

/** URL aceita: https, sem usuário/senha, porta 443, host que não seja IP interno nem "localhost". */
export function urlPermitida(texto: unknown): URL | null {
  if (typeof texto !== "string" || texto.length > 2000) return null;
  let u: URL;
  try { u = new URL(texto.trim()); } catch { return null; }
  if (redeLocalLiberada()) return u.protocol === "https:" ? u : null;
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (isIP(host) && ipPrivado(host)) return null;
  if (!isIP(host) && !host.includes(".")) return null;
  return u;
}

export interface RespostaSegura { status: number; headers: IncomingHttpHeaders; corpo: Buffer; truncado: boolean; urlFinal: string }
export interface OpcoesFetch { maxBytes: number; timeoutMs: number; headers?: Record<string, string>; maxRedirecoes?: number }

/** O DNS é conferido NA HORA de conectar (sem brecha entre conferir e usar) e os redirecionamentos são refeitos um a um. */
function lookupSeguro(hostname: string, opcoes: any, cb: any) {
  dnsLookup(hostname, { ...opcoes, all: true }, (err, enderecos: any) => {
    if (err) return cb(err);
    const lista = Array.isArray(enderecos) ? enderecos : [{ address: enderecos, family: 4 }];
    if (!lista.length || (!redeLocalLiberada() && lista.some((a: any) => ipPrivado(a.address)))) return cb(new Error("Endereço não permitido."));
    if (opcoes?.all) cb(null, lista); else cb(null, lista[0].address, lista[0].family);
  });
}

export function fetchSeguro(url: string, opc: OpcoesFetch, restantes = opc.maxRedirecoes ?? 3): Promise<RespostaSegura> {
  return new Promise((resolve, reject) => {
    const u = urlPermitida(url);
    if (!u) return reject(new Error("Endereço não permitido."));
    let encerrado = false;
    const fim = (fn: () => void) => { if (!encerrado) { encerrado = true; clearTimeout(relogio); fn(); } };
    const req = httpsRequest(u, {
      method: "GET", lookup: lookupSeguro as any, timeout: opc.timeoutMs,
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", accept: "image/*,*/*;q=0.8", ...(opc.headers || {}) },
    }, (res) => {
      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
        res.resume();
        if (restantes <= 0) return fim(() => reject(new Error("Redirecionamentos demais.")));
        let prox: string;
        try { prox = new URL(res.headers.location, u).toString(); } catch { return fim(() => reject(new Error("Redirecionamento inválido."))); }
        return fim(() => fetchSeguro(prox, opc, restantes - 1).then(resolve, reject));
      }
      const partes: Buffer[] = []; let total = 0; let truncado = false;
      res.on("data", (b: Buffer) => {
        total += b.length; partes.push(b);
        if (total >= opc.maxBytes && !truncado) { truncado = true; req.destroy(); fim(() => resolve({ status, headers: res.headers, corpo: Buffer.concat(partes).subarray(0, opc.maxBytes), truncado: true, urlFinal: u.toString() })); }
      });
      res.on("end", () => fim(() => resolve({ status, headers: res.headers, corpo: Buffer.concat(partes), truncado: false, urlFinal: u.toString() })));
      res.on("error", (e) => fim(() => reject(e)));
      res.on("close", () => { if (!res.complete) fim(() => resolve({ status, headers: res.headers, corpo: Buffer.concat(partes), truncado: true, urlFinal: u.toString() })); });
    });
    const relogio = setTimeout(() => { req.destroy(new Error("Tempo esgotado.")); }, opc.timeoutMs + 500);
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado.")));
    req.on("error", (e) => fim(() => reject(e)));
    req.end();
  });
}
