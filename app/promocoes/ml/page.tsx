"use client";
import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";
import * as XLSX from "xlsx";
import { abaPrincipal } from "../../../lib/lerArquivo";
import ConfigPromoTiny from "../../components/ConfigPromoTiny";
import { carregarConfigPromoTiny, indiceColuna, lerEstoqueTiny, PADRAO_PROMO_TINY, type ConfigPromoTiny as CfgPromoTiny } from "../../../lib/promoTiny";
import { lerValidadesDaPlanilha, validadeEmTexto, type Validade } from "../../../lib/validadePromo";
import { resumoSkusPromocionados, type PromoValidade, type MarcaPromovido } from "../../../lib/foraPromocao";

const matrizFretes = [
  { atePeso: 0.3, faixas: { "78.99": 8.15, "99.99": 12.95, "119.99": 14.95, "149.99": 16.95, "199.99": 19.05, "200": 21.65 } },
  { atePeso: 0.5, faixas: { "78.99": 8.25, "99.99": 13.85, "119.99": 16.15, "149.99": 18.15, "199.99": 20.45, "200": 23.25 } },
  { atePeso: 1.0, faixas: { "78.99": 8.45, "99.99": 14.45, "119.99": 16.85, "149.99": 19.05, "199.99": 21.35, "200": 24.45 } },
  { atePeso: 1.5, faixas: { "78.99": 8.65, "99.99": 14.75, "119.99": 17.15, "149.99": 19.45, "199.99": 21.75, "200": 25.45 } },
  { atePeso: 2.0, faixas: { "78.99": 8.75, "99.99": 15.05, "119.99": 17.65, "149.99": 19.85, "199.99": 22.25, "200": 25.55 } },
  { atePeso: 3.0, faixas: { "78.99": 9.15, "99.99": 16.45, "119.99": 19.15, "149.99": 21.65, "199.99": 24.35, "200": 27.05 } },
  { atePeso: 4.0, faixas: { "78.99": 9.75, "99.99": 17.85, "119.99": 20.75, "149.99": 23.35, "199.99": 26.35, "200": 29.25 } },
  { atePeso: 5.0, faixas: { "78.99": 10.25, "99.99": 19.75, "119.99": 22.85, "149.99": 26.05, "199.99": 29.25, "200": 32.45 } },
  { atePeso: 6.0, faixas: { "78.99": 10.35, "99.99": 25.95, "119.99": 29.15, "149.99": 33.35, "199.99": 36.45, "200": 40.85 } },
  { atePeso: 7.0, faixas: { "78.99": 10.45, "99.99": 27.55, "119.99": 31.65, "149.99": 36.75, "199.99": 40.85, "200": 45.25 } },
];

function calcularFreteML(pdv: number, pesoReal: number, altura: number, largura: number, comprimento: number): number {
  if (pdv < 79.00) return 0.00;
  const pesoVolumetrico = (altura * largura * comprimento) / 6000;
  const pesoConsiderado = Math.max(pesoReal, pesoVolumetrico);
  let linhaFrete = matrizFretes.find(m => pesoConsiderado <= m.atePeso);
  if (!linhaFrete) linhaFrete = matrizFretes[matrizFretes.length - 1];

  let valorFrete = 0;
  if (pdv < 79) valorFrete = linhaFrete.faixas["78.99"];
  else if (pdv < 100) valorFrete = linhaFrete.faixas["99.99"];
  else if (pdv < 120) valorFrete = linhaFrete.faixas["119.99"];
  else if (pdv < 150) valorFrete = linhaFrete.faixas["149.99"];
  else if (pdv < 200) valorFrete = linhaFrete.faixas["199.99"];
  else valorFrete = linhaFrete.faixas["200"];
  return valorFrete || 0;
}

function normalizarSku(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/^["']|["']$/g, "").trim();
  if (/e\+/i.test(s)) {
    try { s = BigInt(Math.trunc(Number(s))).toString(); } catch {}
  }
  return s.toLowerCase();
}

function skuValido(sku: string): boolean {
  const limpo = normalizarSku(sku);
  return limpo.length >= 10;
}

function parsePorcentagem(valor: any): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return (valor > 0 && valor < 1) ? valor * 100 : valor;
  let s = String(valor).replace(/%/g, "").trim().replace(",", ".");
  const num = parseFloat(s);
  if (isNaN(num)) return 0;
  return (num > 0 && num < 1) ? num * 100 : num;
}

function parseNumeroBruto(valor: any): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;
  let s = String(valor).replace(/R\$/g, "").replace(/\$/g, "").replace(/\s/g, "").trim();
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

// Contas do Mercado Livre: cada uma tem o seu inventário do Tiny (colunas próprias), os seus anúncios e as suas promoções ativas
const CONTAS_ML = [
  { chave: "ml1", rotulo: "Mercado Livre 1" },
  { chave: "ml2", rotulo: "Mercado Livre 2" },
  { chave: "ml3", rotulo: "Mercado Livre 3" },
] as const;
const CHAVE_CONTA_STORAGE = "promo_ml_conta";
// O inventário do Tiny é a mesma planilha para as três contas: uma só configuração de colunas
const ESCOPO_CFG_ML = { chave: "ml", rotulo: "todas as contas do Mercado Livre (ML1, ML2 e ML3)" };
const CAMPO_COL_VALIDADE = "promo_ml_date_validity_col";   // config_regras_tiny: letra da coluna DATE_VALIDITY (vazio = achar pelo título)
const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

const formatarMoeda = (valor: number) =>
  "R$ " + (Number(valor) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PromocoesMlPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [salvandoBanco, setSalvandoBanco] = useState(false);
  const [margemAlvo, setMargemAlvo] = useState("20");
  const [arquivoUpload, setArquivoUpload] = useState<File | null>(null);
  // Inventário do Tiny (colunas do SKU e do saldo em Configurações): só entra na precificação o que tem estoque
  const [contaChave, setContaChave] = useState<string>("ml1");
  const conta = CONTAS_ML.find((c) => c.chave === contaChave) || CONTAS_ML[0];
  const [cfgTiny, setCfgTiny] = useState<CfgPromoTiny>(PADRAO_PROMO_TINY);
  const [estoqueTinyRaw, setEstoqueTinyRaw] = useState<{ nome: string; linhas: any[][] } | null>(null);
  const estoqueTiny = useMemo(() => {
    if (!estoqueTinyRaw) return null;
    const lido = lerEstoqueTiny(estoqueTinyRaw.linhas, cfgTiny, normalizarSku);
    return { nome: estoqueTinyRaw.nome, mapa: lido.mapa, comEstoque: lido.comEstoque, aviso: lido.aviso };
  }, [estoqueTinyRaw, cfgTiny]);
  const [dadosProcessados, setDadosProcessados] = useState<any>(null);
  const [promocoesAtivas, setPromocoesAtivas] = useState<any[]>([]);
  const [termoBusca, setTermoBusca] = useState("");
  const [abaAtiva, setAbaAtiva] = useState<"precificar" | "rebate" | "ativas" | "skus" | "config">("precificar");
  const [colValidade, setColValidade] = useState("");            // letra configurada da coluna DATE_VALIDITY ("" = pelo título)
  const [validadeManual, setValidadeManual] = useState({ inicio: "", fim: "" });   // vale para anúncios cuja validade a planilha não trouxe
  const [validades, setValidades] = useState<PromoValidade[]>([]);
  const [marcas, setMarcas] = useState<MarcaPromovido[]>([]);
  const [anunciosBase, setAnunciosBase] = useState<{ mlb: string; sku: string | null; canal: string }[]>([]);

  const [custosMap, setCustosMap] = useState<Map<string, number>>(new Map());
  const [mlRegrasMap, setMlRegrasMap] = useState<Map<string, any[]>>(new Map());
  const [obsoletosSet, setObsoletosSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    try {
      const salva = localStorage.getItem(CHAVE_CONTA_STORAGE);
      if (salva && CONTAS_ML.some((c) => c.chave === salva)) setContaChave(salva);
    } catch { /* sem localStorage: fica na conta 1 */ }
    carregarBasesDoApp();
    carregarPromocoesAtivasSupabase();
    carregarValidades();
    carregarConfigPromoTiny(ESCOPO_CFG_ML.chave).then(setCfgTiny);   // uma configuração só, vale para as três contas
    supabase.from("config_regras_tiny").select("coluna").eq("campo", CAMPO_COL_VALIDADE).maybeSingle().then(({ data }) => {
      const l = String(data?.coluna ?? "").trim().toUpperCase();
      if (l && indiceColuna(l) >= 0) setColValidade(l);
    });
  }, []);

  // Validade das promoções (uma linha por anúncio x promoção) e anúncios marcados como "já promovi"
  const carregarValidades = async () => {
    const todas: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("promocoes_validade_ml").select("*").order("id").range(from, from + 999);
      if (error || !data) break;
      todas.push(...data);
      if (data.length < 1000) break;
    }
    setValidades(todas as PromoValidade[]);
    const { data: m } = await supabase.from("promocoes_ml_marcados").select("mlb, conta, marcado_em");
    setMarcas((m || []) as MarcaPromovido[]);
  };

  const trocarConta = (chave: string) => {
    if (chave === contaChave) return;
    const temTrabalho = !!dadosProcessados || !!estoqueTinyRaw;
    if (temTrabalho && !confirm("Trocar de conta descarta a planilha de campanha e o inventário já carregados. Continuar?")) return;
    setContaChave(chave);
    setDadosProcessados(null); setEstoqueTinyRaw(null); setArquivoUpload(null);
    try { localStorage.setItem(CHAVE_CONTA_STORAGE, chave); } catch { /* ignora */ }
  };

  const carregarBasesDoApp = async () => {
    setLoading(true);
    try {
      let allCustos: any[] = [];
      let from = 0;
      const step = 1000;
      let keep = true;
      while (keep) {
        const { data } = await supabase.from("tabela_custos_skus").select("*").range(from, from + step - 1);
        if (data && data.length > 0) {
          allCustos = [...allCustos, ...data];
          from += step;
          if (data.length < step) keep = false;
        } else keep = false;
      }

      const cMap = new Map<string, number>();
      const obsSet = new Set<string>();

      allCustos.forEach((c: any) => {
        const k = normalizarSku(c.sku);
        if (k && k.length >= 10) {
          cMap.set(k, Number(c.custo_unitario || c.custo || 0));
          if (String(c.status || "").toLowerCase().includes("obsoleto")) {
            obsSet.add(k);
          }
        }
      });
      setCustosMap(cMap);
      setObsoletosSet(obsSet);

      let allMlRegras: any[] = [];
      from = 0;
      keep = true;
      while (keep) {
        const { data } = await supabase.from("ml_anuncios_regras").select("*").range(from, from + step - 1);
        if (data && data.length > 0) {
          allMlRegras = [...allMlRegras, ...data];
          from += step;
          if (data.length < step) keep = false;
        } else keep = false;
      }

      const mlMap = new Map<string, any[]>();
      allMlRegras.forEach((m: any) => {
        const mlbKey = String(m.mlb || "").trim().toUpperCase();
        const comissaoNum = parsePorcentagem(m.comissao);
        const skuVal = skuValido(m.sku) ? normalizarSku(m.sku) : "";
        const info = {
          canal: String(m.canal || ""),
          sku: skuVal,
          comissao: comissaoNum,
          peso_real: Number(m.peso_real || 2.0),
          altura: Number(m.altura || 10),
          largura: Number(m.largura || 10),
          comprimento: Number(m.comprimento || 10)
        };
        if (mlbKey) {
          if (!mlMap.has(mlbKey)) mlMap.set(mlbKey, []);
          mlMap.get(mlbKey)!.push(info);
        }
      });
      setMlRegrasMap(mlMap);
      setAnunciosBase(allMlRegras.map((m: any) => ({ mlb: String(m.mlb || "").trim().toUpperCase(), sku: m.sku ?? null, canal: String(m.canal || "") })));
    } catch (e) {
      console.error("Erro ao carregar bases:", e);
    }
    setLoading(false);
  };

  const carregarPromocoesAtivasSupabase = async () => {
    const { data } = await supabase.from("promocoes_ativas_ml").select("*").order("id", { ascending: false });
    if (data) setPromocoesAtivas(data);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setArquivoUpload(file);

      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const sheetName = wb.SheetNames.includes("Promoções") ? "Promoções" : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        setDadosProcessados({ rawData, sheetName });
      };
      reader.readAsBinaryString(file);
    }
  };

  const handleEstoqueUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const linhas: any[][] = XLSX.utils.sheet_to_json(abaPrincipal(wb), { header: 1, defval: "" });
        const lido = lerEstoqueTiny(linhas, cfgTiny, normalizarSku);   // SKU repetido soma; colunas vêm de Configurações
        if (lido.mapa.size === 0) { setEstoqueTinyRaw(null); alert(lido.aviso || "Nenhum SKU foi lido no inventário."); return; }
        setEstoqueTinyRaw({ nome: file.name, linhas });
        if (lido.aviso) alert("⚠️ " + lido.aviso);
      } catch (err: any) {
        setEstoqueTinyRaw(null);
        alert("Erro ao ler o inventário: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const processarPlanilhaCampanha = async () => {
    if (!dadosProcessados || !dadosProcessados.rawData) {
      alert("Por favor, selecione uma planilha de campanha do Mercado Livre.");
      return;
    }
    if (!estoqueTiny) {
      alert(`Por favor, selecione o Inventário do Tiny (SKU na coluna ${cfgTiny.sku}, saldo na coluna ${cfgTiny.estoque}): só o que tem estoque é precificado.`);
      return;
    }

    setLoading(true);
    try {
      const { rawData, sheetName } = dadosProcessados;
      if (rawData.length < 1) {
        alert("A planilha parece estar vazia.");
        setLoading(false);
        return;
      }

      const headers = rawData[0].map((h: any) => String(h || "").trim().toUpperCase());
      const getColIndex = (names: string[]) => {
        for (const name of names) {
          const idx = headers.indexOf(name.toUpperCase());
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const idxItemId = getColIndex(["ITEM_ID", "NÚMERO DO ANÚNCIO", "ID"]);
      const idxSku = getColIndex(["SKU", "CÓDIGO SKU"]);
      const idxOriginalPrice = getColIndex(["ORIGINAL_PRICE", "PREÇO ORIGINAL"]);
      const idxPromotionName = getColIndex(["PROMOTION_NAME", "PROMOÇÃO", "NOME DA PROMOÇÃO", "PROMO_NAME"]);
      const idxDateValidity = getColIndex(["DATE_VALIDITY", "VIGÊNCIA", "PERÍODO", "DATE"]);
      const idxColValidade = colValidade && indiceColuna(colValidade) >= 0 ? indiceColuna(colValidade) : idxDateValidity;   // coluna escolhida em Configurações ou achada pelo título

      if (idxItemId === -1 || idxOriginalPrice === -1) {
        alert("Erro: Não foi possível localizar as colunas 'ITEM_ID' e 'ORIGINAL_PRICE' na planilha.");
        setLoading(false);
        return;
      }

      const validadesLidas = lerValidadesDaPlanilha(rawData, idxItemId, idxColValidade);
      const validadeDaLinha = (i: number): Validade | null => validadesLidas.porLinha.get(i) || validadesLidas.rodape;

      const mapSkuPorMlb = new Map<string, string>();
      for (let i = 1; i < rawData.length; i++) {
        const r = rawData[i];
        if (!r) continue;
        const mlbVal = String(r[idxItemId] || "").trim().toUpperCase();
        const skuVal = idxSku !== -1 ? normalizarSku(r[idxSku]) : "";
        if (mlbVal && mlbVal.startsWith("MLB") && skuVal && skuVal !== "-" && skuVal.length >= 10 && !mapSkuPorMlb.has(mlbVal)) {
          mapSkuPorMlb.set(mlbVal, skuVal);
        }
      }

      const margemDesejada = parseFloat(margemAlvo) / 100 || 0.20;
      const imposto = 0.09;
      const mlbProcessadosSet = new Set<string>();
      const resultados: any[] = [];

      for (let i = 1; i < rawData.length; i++) {
        const r = rawData[i];
        if (!r || r.length === 0) continue;

        const mlbRaw = String(r[idxItemId] || "").trim().toUpperCase();
        if (!mlbRaw || !mlbRaw.startsWith("MLB")) continue;

        const mlbKeyNormalizada = mlbRaw.replace(/\s+/g, "").toUpperCase();
        if (mlbProcessadosSet.has(mlbKeyNormalizada)) continue;
        mlbProcessadosSet.add(mlbKeyNormalizada);

        let skuRaw = idxSku !== -1 ? normalizarSku(r[idxSku]) : "";
        let originalPrice = Number(r[idxOriginalPrice] || 0);
        const promoName = idxPromotionName !== -1 ? (r[idxPromotionName] || "Campanha Geral") : "Campanha Geral";
        const validade = validadeDaLinha(i);
        const dateValidity = validade ? validadeEmTexto(validade) : (idxDateValidity !== -1 ? (r[idxDateValidity] || "Indeterminado") : "Indeterminado");

        let anunciosLista = mlRegrasMap.get(mlbKeyNormalizada) || [];
        let anuncioInfo = anunciosLista.length > 0 ? (anunciosLista.find((a: any) => a.canal === conta.rotulo) || anunciosLista[0]) : null;

        if (!anuncioInfo) {
          const { data: dbMatch } = await supabase
            .from("ml_anuncios_regras")
            .select("*")
            .ilike("mlb", mlbRaw)
            .maybeSingle();

          if (dbMatch) {
            const comissaoNum = parsePorcentagem(dbMatch.comissao);
            anuncioInfo = {
              canal: String(dbMatch.canal || ""),
              sku: skuValido(dbMatch.sku) ? normalizarSku(dbMatch.sku) : "",
              comissao: comissaoNum,
              peso_real: Number(dbMatch.peso_real || 2.0),
              altura: Number(dbMatch.altura || 10),
              largura: Number(dbMatch.largura || 10),
              comprimento: Number(dbMatch.comprimento || 10)
            };
          }
        }

        if ((!skuRaw || skuRaw.length < 10) && mapSkuPorMlb.has(mlbRaw)) {
          skuRaw = mapSkuPorMlb.get(mlbRaw)!;
        }
        if ((!skuRaw || skuRaw.length < 10) && anuncioInfo && skuValido(anuncioInfo.sku)) {
          skuRaw = anuncioInfo.sku;
        }
        if (skuRaw && skuRaw.length < 10) {
          skuRaw = "";
        }

        const skuKey = normalizarSku(skuRaw);
        const custo = custosMap.has(skuKey) ? Number(custosMap.get(skuKey)) : 0;

        let statusItem = "APTO";
        let errosList: string[] = [];
        let comissaoVal = 0;
        let pesoReal = 2.0;
        let altura = 10;
        let largura = 10;
        let comprimento = 10;

        if (!anuncioInfo) {
          statusItem = "INAPTO";
          errosList.push(`MLB não cadastrado na base — Atualizar base`);
        } else {
          if (anuncioInfo.canal && anuncioInfo.canal !== conta.rotulo) errosList.push(`Anúncio cadastrado em ${anuncioInfo.canal}`);
          comissaoVal = Number(anuncioInfo.comissao) || 14;
          pesoReal = Number(anuncioInfo.peso_real || 2.0);
          altura = Number(anuncioInfo.altura || 10);
          largura = Number(anuncioInfo.largura || 10);
          comprimento = Number(anuncioInfo.comprimento || 10);
        }

        if (!skuKey || custo <= 0) {
          statusItem = "INAPTO";
          errosList.push("Custo não encontrado — Atualizar base");
        }

        const saldo = skuKey ? (estoqueTiny.mapa.get(skuKey) ?? 0) : 0;
        if (skuKey && saldo <= 0) {
          statusItem = "INAPTO";
          errosList.push(`Sem estoque (Saldo: ${saldo})`);
        }

        let novoPreco = originalPrice;
        if (statusItem === "APTO") {
          const comissaoDec = comissaoVal > 1 ? comissaoVal / 100 : comissaoVal;
          let pdvCalculado = custo * 2;

          for (let iter = 0; iter < 5; iter++) {
            let tarifaFixaItem = pdvCalculado < 79.00 ? 6.50 : 0.00;
            let freteItem = calcularFreteML(pdvCalculado, pesoReal, altura, largura, comprimento);
            
            const denominador = 1 - (comissaoDec + imposto + margemDesejada);
            if (denominador > 0) {
              pdvCalculado = (custo + tarifaFixaItem + freteItem) / denominador;
            }
          }
          novoPreco = pdvCalculado > 0 ? pdvCalculado : originalPrice * 0.9;

          if (originalPrice <= 0 || novoPreco <= 0) {
            statusItem = "INAPTO";
            errosList.push("Preço Inválido");
          }
        }

        resultados.push({
          rowIndex: i,
          MLB: mlbRaw,
          SKU: skuKey,
          PROMOTION_NAME: promoName,
          DATE_VALIDITY: dateValidity,
          VALIDADE: validade,
          ORIGINAL_PRICE: originalPrice,
          FINAL_PRICE: Number(novoPreco.toFixed(2)),
          STATUS: statusItem,
          SALDO: saldo,
          OBSOLETO: obsoletosSet.has(skuKey) ? "SIM" : "NÃO",
          ERRO: errosList.length > 0 ? errosList.join(" | ") : ""
        });
      }

      setDadosProcessados({ rawData, sheetName, itens: resultados, tipo: "precificar", validadeInfo: { rodape: validadesLidas.rodape, origemRodape: validadesLidas.origemRodape, comPropria: validadesLidas.porLinha.size } });
      const deOutraConta = resultados.filter(r => /Anúncio cadastrado em/.test(r.ERRO)).length;
      alert(`✅ Processamento concluído (${conta.rotulo})! ${resultados.filter(r => r.STATUS === "APTO").length} itens aptos e ${resultados.filter(r => r.STATUS === "INAPTO").length} inaptos.` +
        (deOutraConta > 0 ? `\n\n⚠️ ${deOutraConta} anúncio(s) estão cadastrados em outra conta do Mercado Livre. Confira se escolheu a conta certa.` : ""));
    } catch (err: any) {
      alert("Erro ao processar: " + err.message);
    }
    setLoading(false);
  };

  const processarPlanilhaRebate = async () => {
    if (!dadosProcessados || !dadosProcessados.rawData) {
      alert("Por favor, selecione uma planilha de rebate/redução de tarifas do Mercado Livre.");
      return;
    }
    if (!estoqueTiny) {
      alert(`Por favor, selecione o Inventário do Tiny (SKU na coluna ${cfgTiny.sku}, saldo na coluna ${cfgTiny.estoque}): só o que tem estoque entra na análise.`);
      return;
    }

    setLoading(true);
    try {
      const { rawData, sheetName } = dadosProcessados;
      if (rawData.length < 1) {
        alert("A planilha parece estar vazia.");
        setLoading(false);
        return;
      }

      const headers = rawData[0].map((h: any) => String(h || "").trim().toUpperCase());
      const getColIndex = (names: string[]) => {
        for (const name of names) {
          const idx = headers.indexOf(name.toUpperCase());
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const idxItemId = getColIndex(["ITEM_ID", "NÚMERO DO ANÚNCIO", "ID"]);
      const idxSku = getColIndex(["SKU", "CÓDIGO SKU"]);
      const idxFinalPrice = getColIndex(["FINAL_PRICE", "PREÇO FINAL"]);
      const idxNewReceives = getColIndex(["NEW_RECEIVES", "VOCÊ RECEBE", "MELI_AMOUNT", "REDUÇÃO NAS SUAS TARIFAS DE VENDA"]);
      const idxPromotionName = getColIndex(["PROMOTION_NAME", "PROMOÇÃO", "NOME DA PROMOÇÃO", "PROMO_NAME"]);
      const idxDateValidity = getColIndex(["DATE_VALIDITY", "VIGÊNCIA", "PERÍODO", "DATE"]);
      const idxColValidade = colValidade && indiceColuna(colValidade) >= 0 ? indiceColuna(colValidade) : idxDateValidity;   // coluna escolhida em Configurações ou achada pelo título

      if (idxItemId === -1 || idxFinalPrice === -1) {
        alert("Erro: Não foi possível localizar as colunas 'ITEM_ID' e 'FINAL_PRICE' na planilha de rebate.");
        setLoading(false);
        return;
      }

      const validadesLidas = lerValidadesDaPlanilha(rawData, idxItemId, idxColValidade);
      const validadeDaLinha = (i: number): Validade | null => validadesLidas.porLinha.get(i) || validadesLidas.rodape;

      const mapSkuPorMlb = new Map<string, string>();
      for (let i = 1; i < rawData.length; i++) {
        const r = rawData[i];
        if (!r) continue;
        const mlbVal = String(r[idxItemId] || "").trim().toUpperCase();
        const skuVal = idxSku !== -1 ? normalizarSku(r[idxSku]) : "";
        if (mlbVal && mlbVal.startsWith("MLB") && skuVal && skuVal !== "-" && skuVal.length >= 10 && !mapSkuPorMlb.has(mlbVal)) {
          mapSkuPorMlb.set(mlbVal, skuVal);
        }
      }

      const margemDesejada = parseFloat(margemAlvo) / 100 || 0.20;
      const imposto = 0.09;
      const mlbProcessadosSet = new Set<string>();
      const resultados: any[] = [];

      for (let i = 1; i < rawData.length; i++) {
        const r = rawData[i];
        if (!r || r.length === 0) continue;

        const mlbRaw = String(r[idxItemId] || "").trim().toUpperCase();
        if (!mlbRaw || !mlbRaw.startsWith("MLB")) continue;

        const mlbKeyNormalizada = mlbRaw.replace(/\s+/g, "").toUpperCase();
        if (mlbProcessadosSet.has(mlbKeyNormalizada)) continue;
        mlbProcessadosSet.add(mlbKeyNormalizada);

        let skuRaw = idxSku !== -1 ? normalizarSku(r[idxSku]) : "";
        const finalPrice = Number(r[idxFinalPrice] || 0);
        const newReceives = idxNewReceives !== -1 ? parseNumeroBruto(r[idxNewReceives]) : 0;
        const promoName = idxPromotionName !== -1 ? (r[idxPromotionName] || "Com redução de tarifas") : "Com redução de tarifas";
        const validade = validadeDaLinha(i);
        const dateValidity = validade ? validadeEmTexto(validade) : (idxDateValidity !== -1 ? (r[idxDateValidity] || "Indeterminado") : "Indeterminado");

        let anunciosLista = mlRegrasMap.get(mlbKeyNormalizada) || [];
        let anuncioInfo = anunciosLista.length > 0 ? (anunciosLista.find((a: any) => a.canal === conta.rotulo) || anunciosLista[0]) : null;

        if (!anuncioInfo) {
          const { data: dbMatch } = await supabase
            .from("ml_anuncios_regras")
            .select("*")
            .ilike("mlb", mlbRaw)
            .maybeSingle();

          if (dbMatch) {
            anuncioInfo = { canal: String(dbMatch.canal || ""), sku: skuValido(dbMatch.sku) ? normalizarSku(dbMatch.sku) : "" };
          }
        }

        if ((!skuRaw || skuRaw.length < 10) && mapSkuPorMlb.has(mlbRaw)) {
          skuRaw = mapSkuPorMlb.get(mlbRaw)!;
        }
        if ((!skuRaw || skuRaw.length < 10) && anuncioInfo && skuValido(anuncioInfo.sku)) {
          skuRaw = anuncioInfo.sku;
        }
        if (skuRaw && skuRaw.length < 10) {
          skuRaw = "";
        }

        const skuKey = normalizarSku(skuRaw);
        const custo = custosMap.has(skuKey) ? Number(custosMap.get(skuKey)) : 0;

        let statusItem = "APTO";
        let errosList: string[] = [];

        if (!skuKey || custo <= 0) {
          statusItem = "INAPTO";
          errosList.push("Custo não encontrado — Atualizar base");
        }

        if (finalPrice <= 0) {
          statusItem = "INAPTO";
          errosList.push("Preço Final Inválido");
        }

        const saldo = skuKey ? (estoqueTiny.mapa.get(skuKey) ?? 0) : 0;
        if (skuKey && saldo <= 0) {
          statusItem = "INAPTO";
          errosList.push(`Sem estoque (Saldo: ${saldo})`);
        }

        let lucroLiquido = 0;
        let margemFinal = 0;
        if (anuncioInfo && anuncioInfo.canal && anuncioInfo.canal !== conta.rotulo) errosList.push(`Anúncio cadastrado em ${anuncioInfo.canal}`);

        if (statusItem === "APTO") {
          const impostoTotal = finalPrice * imposto;
          lucroLiquido = newReceives - custo - impostoTotal;
          margemFinal = finalPrice > 0 ? (lucroLiquido / finalPrice) * 100 : 0;

          if (margemFinal < (margemDesejada * 100)) {
            statusItem = "INAPTO";
            errosList.push(`Margem (${margemFinal.toFixed(1)}%) abaixo da meta (${(margemDesejada * 100).toFixed(0)}%)`);
          }
        }

        resultados.push({
          rowIndex: i,
          MLB: mlbRaw,
          SKU: skuKey,
          PROMOTION_NAME: promoName,
          DATE_VALIDITY: dateValidity,
          VALIDADE: validade,
          FINAL_PRICE: finalPrice,
          NEW_RECEIVES: newReceives,
          SALDO: saldo,
          LUCRO: Number(lucroLiquido.toFixed(2)),
          MARGEM: Number(margemFinal.toFixed(1)),
          STATUS: statusItem,
          ERRO: errosList.length > 0 ? errosList.join(" | ") : ""
        });
      }

      setDadosProcessados({ rawData, sheetName, itens: resultados, tipo: "rebate", validadeInfo: { rodape: validadesLidas.rodape, origemRodape: validadesLidas.origemRodape, comPropria: validadesLidas.porLinha.size } });
      const deOutraConta = resultados.filter(r => /Anúncio cadastrado em/.test(r.ERRO)).length;
      alert(`✅ Processamento de Rebate concluído (${conta.rotulo})! ${resultados.filter(r => r.STATUS === "APTO").length} itens aptos e ${resultados.filter(r => r.STATUS === "INAPTO").length} inaptos.` +
        (deOutraConta > 0 ? `\n\n⚠️ ${deOutraConta} anúncio(s) estão cadastrados em outra conta do Mercado Livre. Confira se escolheu a conta certa.` : ""));
    } catch (err: any) {
      alert("Erro ao processar rebate: " + err.message);
    }
    setLoading(false);
  };

  const salvarPromocoesNoBanco = async () => {
    if (!dadosProcessados || !dadosProcessados.itens) {
      alert("Processe a planilha primeiro.");
      return;
    }
    const itensAptos = dadosProcessados.itens.filter((r: any) => r.STATUS === "APTO" && skuValido(r.SKU));
    if (itensAptos.length === 0) {
      alert("Nenhum item apto com SKU válido para salvar.");
      return;
    }

    setSalvandoBanco(true);
    try {
      for (const item of itensAptos) {
        await supabase.from("promocoes_ativas_ml").insert([{
          mlb: item.MLB,
          sku: item.SKU,
          promocao: item.PROMOTION_NAME,
          date_validity: item.DATE_VALIDITY,
          canal: conta.rotulo
        }]);
      }
      await carregarPromocoesAtivasSupabase();

      // Duração da campanha (DATE_VALIDITY) de cada anúncio: um MLB pode ter várias promoções, todas ficam registradas
      const fimManual = /^\d{4}-\d{2}-\d{2}$/.test(validadeManual.fim) ? validadeManual.fim : "";
      const iniManual = /^\d{4}-\d{2}-\d{2}$/.test(validadeManual.inicio) ? validadeManual.inicio : null;
      const linhasValidade = new Map<string, any>();
      let semValidade = 0;
      for (const item of itensAptos) {
        const v: Validade | null = item.VALIDADE || (fimManual ? { inicio: iniManual, fim: fimManual } : null);
        if (!v) { semValidade++; continue; }
        const promocao = String(item.PROMOTION_NAME ?? "");
        linhasValidade.set(`${item.MLB}|${promocao}|${v.fim}`, {
          conta: conta.rotulo, mlb: item.MLB, sku: item.SKU, promocao, data_inicio: v.inicio, data_fim: v.fim,
          validade_texto: validadeEmTexto(v), arquivo: arquivoUpload?.name ?? null,
        });
      }
      let msgValidade = "";
      if (linhasValidade.size > 0) {
        const lote = Array.from(linhasValidade.values());
        for (let i = 0; i < lote.length; i += 300) {
          const { error } = await supabase.from("promocoes_validade_ml").upsert(lote.slice(i, i + 300), { onConflict: "conta,mlb,promocao,data_fim" });
          if (error) throw new Error("Promoções salvas, mas não consegui registrar a validade: " + error.message);
        }
        await carregarValidades();
        msgValidade = `\n📅 Validade registrada para ${linhasValidade.size} anúncio(s).`;
      }
      if (semValidade > 0) msgValidade += `\n⚠️ ${semValidade} anúncio(s) ficaram SEM validade (a planilha não trouxe DATE_VALIDITY). Preencha o fim da campanha no quadro "Validade da campanha" e salve de novo.`;
      alert(`🚀 ${itensAptos.length} promoções salvas com sucesso na base de Promoções Ativas!` + msgValidade);
      setAbaAtiva("ativas");
    } catch (err: any) {
      alert("Erro ao salvar no banco: " + err.message);
    }
    setSalvandoBanco(false);
  };

  const excluirPromocaoIndividual = async (id: number) => {
    if (!confirm("Tem certeza que deseja apagar esta promoção da base?")) return;
    const { error } = await supabase.from("promocoes_ativas_ml").delete().eq("id", id);
    if (error) {
      alert("Erro ao excluir: " + error.message);
    } else {
      carregarPromocoesAtivasSupabase();
    }
  };

  const limparBasePromocoes = async () => {
    if (!confirm(`ATENÇÃO: Deseja apagar TODAS as promoções ativas de ${conta.rotulo} guardadas na base?`)) return;
    const { error } = await supabase.from("promocoes_ativas_ml").delete().eq("canal", conta.rotulo);
    if (error) {
      alert("Erro ao limpar base: " + error.message);
    } else {
      carregarPromocoesAtivasSupabase();
      alert(`🗑️ Promoções ativas de ${conta.rotulo} apagadas com sucesso!`);
    }
  };

  const baixarExcelOtimizado = () => {
    if (!dadosProcessados || !dadosProcessados.itens || dadosProcessados.itens.length === 0) {
      alert("Processe a planilha primeiro.");
      return;
    }

    const dadosOtimizados = dadosProcessados.itens.map((item: any) => ({
      ITEM_ID: item.MLB,
      SKU: item.SKU,
      FINAL_PRICE: item.STATUS === "APTO" ? item.FINAL_PRICE : item.ORIGINAL_PRICE,
      STATUS: item.STATUS === "APTO" ? "Elegível" : "Inapto",
      OBSERVACOES: item.ERRO || ""
    }));

    const newWs = XLSX.utils.json_to_sheet(dadosOtimizados);
    const newWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWb, newWs, dadosProcessados.sheetName || "Promoções");

    XLSX.writeFile(newWb, "ml_campanha_ou_rebate_otimizada.xlsx");
  };

  const listaItens = dadosProcessados?.itens || [];
  const tipoProcessamento = dadosProcessados?.tipo || "precificar";

  // Promoções ativas da conta escolhida (as sem conta registrada continuam visíveis para não sumirem)
  const promocoesDaConta = promocoesAtivas.filter((p) => !p.canal || p.canal === conta.rotulo);
  const promocoesFiltradas = promocoesDaConta.filter((p) => 
    String(p.sku || "").toLowerCase().includes(termoBusca.toLowerCase()) ||
    String(p.mlb || "").toLowerCase().includes(termoBusca.toLowerCase()) ||
    String(p.promocao || "").toLowerCase().includes(termoBusca.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Gestão de Promoções — Mercado Livre</h1>
            <p className="text-sm font-medium text-slate-400">Validação com recálculo exato de PDV ideal e peso volumétrico</p>
          </div>
          <Navbar />
        </div>

        <div className="flex flex-wrap items-center gap-3" data-conta-ml>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Conta do Mercado Livre:</span>
          <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
            {CONTAS_ML.map((c) => (
              <button
                key={c.chave}
                type="button"
                onClick={() => trocarConta(c.chave)}
                className={`px-5 py-2 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
                  contaChave === c.chave ? "bg-amber-500 text-slate-950 shadow-lg" : "text-slate-400 hover:text-white"
                }`}
              >
                {c.rotulo.replace("Mercado Livre ", "ML")}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-500">Inventário Tiny (igual para as 3 contas): SKU na coluna <b className="text-slate-300">{cfgTiny.sku}</b> e saldo na <b className="text-slate-300">{cfgTiny.estoque}</b></span>
        </div>

        <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
          <button
            onClick={() => setAbaAtiva("precificar")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
              abaAtiva === "precificar" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            }`}
          >
            Precificar Campanha
          </button>
          <button
            onClick={() => setAbaAtiva("rebate")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
              abaAtiva === "rebate" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            }`}
          >
            Rebate / Redução de Tarifas
          </button>
          <button
            onClick={() => setAbaAtiva("ativas")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
              abaAtiva === "ativas" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            }`}
          >
            Promoções Ativas ({promocoesDaConta.length})
          </button>
          <button
            data-aba-skus
            onClick={() => setAbaAtiva("skus")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
              abaAtiva === "skus" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            }`}
          >
            SKUs Ativos x Promocionados
          </button>
          <button
            onClick={() => setAbaAtiva("config")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
              abaAtiva === "config" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            }`}
          >
            ⚙️ Configurações
          </button>
        </div>

        <div className="space-y-6">
          {abaAtiva === "config" && (<>
            <ConfigPromoTiny conta={ESCOPO_CFG_ML} onSalvo={setCfgTiny} />
            <div className="max-w-4xl bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-3" data-config-validade>
              <h2 className="text-sm font-black text-amber-300 uppercase tracking-wider">Validade da campanha (DATE_VALIDITY)</h2>
              <p className="text-xs text-slate-400">Em que coluna da planilha de campanha está o DATE_VALIDITY. Deixe vazio para o sistema achar pelo título da coluna. O valor pode estar em cada linha ou só no rodapé (abaixo dos anúncios): os dois casos são lidos.</p>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna (letra, opcional)</label>
                  <input data-cfg-col-validade value={colValidade} maxLength={3} onChange={(e) => setColValidade(e.target.value.toUpperCase())} placeholder="auto" className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-center font-mono font-bold text-white uppercase outline-none focus:border-amber-500" />
                </div>
                <button
                  type="button" data-salvar-col-validade
                  onClick={async () => {
                    const l = colValidade.trim().toUpperCase();
                    if (l && indiceColuna(l) < 0) { alert("Use só a letra da coluna (ex.: K, AB) ou deixe vazio."); return; }
                    const { error } = await supabase.from("config_regras_tiny").upsert({ campo: CAMPO_COL_VALIDADE, coluna: l }, { onConflict: "campo" });
                    if (error) alert("Não salvei: " + error.message); else { setColValidade(l); alert(l ? `Salvo: DATE_VALIDITY na coluna ${l}.` : "Salvo: o sistema vai achar a coluna DATE_VALIDITY pelo título."); }
                  }}
                  className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-black uppercase tracking-wide shadow"
                >Salvar</button>
              </div>
            </div>
          </>)}
          {abaAtiva !== "config" && (
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Planilha de Campanha (Excel):</label>
              <input
                key={"camp-" + contaChave}
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileUpload}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer"
              />
            </div>

            <div data-estoque-tiny>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Inventário do Tiny (SKU col. {cfgTiny.sku}, saldo col. {cfgTiny.estoque}):</label>
              <input
                key={"est-" + contaChave}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleEstoqueUpload}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer"
              />
              {estoqueTiny
                ? (estoqueTiny.aviso
                    ? <p data-estoque-aviso className="mt-1 text-[10px] font-bold text-amber-400">⚠️ {estoqueTiny.aviso}</p>
                    : <p data-estoque-ok className="mt-1 text-[10px] font-bold text-emerald-400">✓ {estoqueTiny.nome}: {estoqueTiny.mapa.size} SKUs, {estoqueTiny.comEstoque} com estoque (SKU col. {cfgTiny.sku}, saldo col. {cfgTiny.estoque})</p>)
                : <p className="mt-1 text-[10px] text-amber-400">Obrigatório: só o que tem estoque é precificado.</p>}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Margem Desejada (%):</label>
              <input
                type="number"
                value={margemAlvo}
                onChange={(e) => setMargemAlvo(e.target.value)}
                className="w-full bg-slate-950 border border-amber-600/50 rounded-xl p-2.5 text-xs font-mono text-amber-300 font-bold outline-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={abaAtiva === "rebate" ? processarPlanilhaRebate : processarPlanilhaCampanha}
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all"
              >
                {loading ? "A processar..." : abaAtiva === "rebate" ? "Analisar Rebate" : "Executar Precificação"}
              </button>
            </div>

            {listaItens.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={salvarPromocoesNoBanco}
                  disabled={salvandoBanco}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
                >
                  {salvandoBanco ? "A Salvar..." : "Salvar na Base Ativa"}
                </button>
                <button
                  type="button"
                  onClick={baixarExcelOtimizado}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
                >
                  Baixar Excel Otimizado
                </button>
              </div>
            )}
          </div>
          )}

          {abaAtiva !== "config" && abaAtiva !== "skus" && listaItens.length > 0 && (() => {
            const info = dadosProcessados?.validadeInfo;
            const semPropria = listaItens.filter((r: any) => !r.VALIDADE).length;
            return (
              <div data-quadro-validade className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-xl space-y-2">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <h3 className="text-xs font-black text-amber-300 uppercase tracking-wider">📅 Validade da campanha (DATE_VALIDITY)</h3>
                  {info?.rodape
                    ? <span data-validade-lida className="text-xs font-bold text-emerald-400">✓ Lida no {info.origemRodape}: {validadeEmTexto(info.rodape)}</span>
                    : info?.comPropria > 0
                      ? <span data-validade-lida className="text-xs font-bold text-emerald-400">✓ Lida na coluna DATE_VALIDITY de {info.comPropria} anúncio(s)</span>
                      : <span data-validade-lida className="text-xs font-bold text-amber-400">⚠️ Não encontrei a validade na planilha. Informe o fim da campanha ao lado.</span>}
                  {semPropria > 0 && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span>{info?.rodape ? "Corrigir/ajustar:" : "Para os anúncios sem validade:"}</span>
                      <label className="flex items-center gap-1">início <input type="date" data-validade-inicio value={validadeManual.inicio} onChange={(e) => setValidadeManual((v) => ({ ...v, inicio: e.target.value }))} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none" /></label>
                      <label className="flex items-center gap-1">fim <input type="date" data-validade-fim value={validadeManual.fim} onChange={(e) => setValidadeManual((v) => ({ ...v, fim: e.target.value }))} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none" /></label>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-500">Ao clicar em “Salvar na Base Ativa”, a validade fica registrada para cada anúncio apto (MLB, SKU e duração). Quando a promoção vence e o anúncio não está em outra campanha, ele aparece no Início em “Itens fora de promoção”. Só o que o rodapé/coluna da planilha traz é usado; o campo “fim” serve de reserva.</p>
              </div>
            );
          })()}

          {abaAtiva === "precificar" && listaItens.length > 0 && tipoProcessamento === "precificar" && (
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex justify-between items-center">
                <h3 className="text-sm font-bold text-white">Resultado do Processamento da Campanha</h3>
                <span className="text-xs text-slate-400">Total únicos: {listaItens.length}</span>
              </div>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                    <tr>
                      <th className="p-3">MLB</th>
                      <th className="p-3">SKU</th>
                      <th className="p-3">Campanha</th>
                      <th className="p-3">Validade</th>
                      <th className="p-3 text-right">Saldo</th>
                      <th className="p-3 text-right">Preço Original</th>
                      <th className="p-3 text-right">Novo Preço Sugerido</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center">Observações / Erros</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {listaItens.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-mono text-indigo-400">{item.MLB}</td>
                        <td className="p-3 font-mono text-slate-300">{item.SKU || <span className="text-rose-500 font-bold">SKU INVÁLIDO (&lt; 10 dig)</span>}</td>
                        <td className="p-3 text-slate-300">{item.PROMOTION_NAME}</td>
                        <td className="p-3 font-mono text-amber-400 whitespace-nowrap">{item.VALIDADE ? validadeEmTexto(item.VALIDADE) : "—"}</td>
                        <td className={`p-3 text-right font-mono ${item.SALDO > 0 ? "text-slate-300" : "text-rose-400"}`}>{item.SALDO}</td>
                        <td className="p-3 text-right font-mono text-slate-400">{formatarMoeda(item.ORIGINAL_PRICE)}</td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-400">{formatarMoeda(item.FINAL_PRICE)}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${item.STATUS === "APTO" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-rose-950 text-rose-400 border border-rose-800"}`}>
                            {item.STATUS}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-rose-400">{item.ERRO || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {abaAtiva === "rebate" && listaItens.length > 0 && tipoProcessamento === "rebate" && (
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex justify-between items-center">
                <h3 className="text-sm font-bold text-white">Resultado da Análise de Rebate & Redução de Tarifas</h3>
                <span className="text-xs text-slate-400">Total processados: {listaItens.length}</span>
              </div>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                    <tr>
                      <th className="p-3">MLB</th>
                      <th className="p-3">SKU</th>
                      <th className="p-3">Promoção / Campanha</th>
                      <th className="p-3">Validade</th>
                      <th className="p-3 text-right">Preço Final (PDV)</th>
                      <th className="p-3 text-right text-purple-400">Novo Recebe (Rebate)</th>
                      <th className="p-3 text-right">Saldo</th>
                      <th className="p-3 text-right">Lucro Líquido</th>
                      <th className="p-3 text-right">Margem Final</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center">Observações / Erros</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {listaItens.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-mono text-indigo-400">{item.MLB}</td>
                        <td className="p-3 font-mono text-slate-300">{item.SKU || <span className="text-rose-500 font-bold">SKU INVÁLIDO (&lt; 10 dig)</span>}</td>
                        <td className="p-3 text-slate-300">{item.PROMOTION_NAME}</td>
                        <td className="p-3 font-mono text-amber-400 whitespace-nowrap">{item.VALIDADE ? validadeEmTexto(item.VALIDADE) : "—"}</td>
                        <td className="p-3 text-right font-mono text-slate-200">{formatarMoeda(item.FINAL_PRICE)}</td>
                        <td className="p-3 text-right font-mono text-purple-300 font-bold">{formatarMoeda(item.NEW_RECEIVES)}</td>
                        <td className={`p-3 text-right font-mono ${item.SALDO > 0 ? "text-slate-300" : "text-rose-400"}`}>{item.SALDO}</td>
                        <td className="p-3 text-right font-mono text-emerald-400 font-bold">{formatarMoeda(item.LUCRO)}</td>
                        <td className={`p-3 text-right font-mono font-bold ${item.MARGEM >= parseFloat(margemAlvo) ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {item.MARGEM}%
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${item.STATUS === "APTO" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-rose-950 text-rose-400 border border-rose-800"}`}>
                            {item.STATUS}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-rose-400">{item.ERRO || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {abaAtiva === "skus" && (
            <div data-painel-skus className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Quantidade de SKUs ativos e promocionados</h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  <b className="text-slate-300">SKU ativo</b> = SKU com anúncio na base de anúncios da conta. <b className="text-slate-300">Promocionado</b> = anúncio com campanha vigente hoje ({hojeSP().split("-").reverse().join("/")}), segundo a validade registrada ao salvar as promoções, ou marcado como “já promovi” no Início.
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3.5">Conta</th>
                      <th className="p-3.5 text-right">Anúncios (MLB)</th>
                      <th className="p-3.5 text-right">SKUs ativos</th>
                      <th className="p-3.5 text-right text-emerald-400">SKUs promocionados</th>
                      <th className="p-3.5 text-right">% promocionado</th>
                      <th className="p-3.5 text-right text-amber-400">SKUs sem promoção</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {[...CONTAS_ML.map((c) => ({ chave: c.chave, rotulo: c.rotulo })), { chave: "todas", rotulo: "Todas as contas" }].map((c) => {
                      const doEscopo = (x: { canal?: string | null; conta?: string | null }) => c.chave === "todas" || (x.canal ?? x.conta) === c.rotulo;
                      const r = resumoSkusPromocionados(
                        anunciosBase.filter((a) => doEscopo(a)),
                        validades.filter((v) => doEscopo(v)),
                        marcas.filter((m) => c.chave === "todas" || !m.conta || m.conta === c.rotulo),
                        hojeSP(), normalizarSku,
                      );
                      const total = c.chave === "todas";
                      return (
                        <tr key={c.chave} data-linha-skus={c.chave} className={total ? "bg-slate-900 font-black" : "hover:bg-slate-800/40"}>
                          <td className="p-3.5 text-white font-bold">{c.rotulo}</td>
                          <td className="p-3.5 text-right font-mono text-slate-300">{r.anuncios}</td>
                          <td className="p-3.5 text-right font-mono text-slate-200" data-skus-ativos>{r.skusAtivos}</td>
                          <td className="p-3.5 text-right font-mono text-emerald-400" data-skus-promo>{r.skusPromocionados}</td>
                          <td className="p-3.5 text-right font-mono text-slate-200">{r.percentual.toFixed(1).replace(".", ",")}%</td>
                          <td className="p-3.5 text-right font-mono text-amber-400">{r.skusSemPromocao}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {validades.length === 0 && <p className="text-[11px] text-amber-400">Ainda não há validades registradas: elas passam a existir quando você salva promoções na base (aba Precificar Campanha ou Rebate).</p>}
            </div>
          )}

          {abaAtiva === "ativas" && (
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden p-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Painel de Campanhas & Promoções Ativas</h3>
                  <button
                    type="button"
                    onClick={limparBasePromocoes}
                    className="bg-rose-950/80 hover:bg-rose-900 text-rose-400 border border-rose-900/50 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all"
                  >
                    🗑️ Limpar Base de {conta.rotulo}
                  </button>
                </div>
                <input
                  type="text"
                  value={termoBusca}
                  onChange={(e) => setTermoBusca(e.target.value)}
                  placeholder="Pesquisar por SKU, MLB ou Promoção..."
                  className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none w-full md:w-80"
                />
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[500px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                    <tr>
                      <th className="p-3.5">MLB</th>
                      <th className="p-3.5">SKU</th>
                      <th className="p-3.5">Nome da Promoção</th>
                      <th className="p-3.5">Período de Validade (DATE_VALIDITY)</th>
                      <th className="p-3.5 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {promocoesFiltradas.map((p, idx) => (
                      <tr key={p.id || idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5 font-mono text-indigo-400">{p.mlb}</td>
                        <td className="p-3.5 font-mono text-slate-300">{p.sku}</td>
                        <td className="p-3.5 font-bold text-white">{p.promocao}</td>
                        <td className="p-3.5 font-mono text-amber-400">{p.date_validity || "Indeterminado"}</td>
                        <td className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => excluirPromocaoIndividual(p.id)}
                            className="bg-rose-950/60 hover:bg-rose-900/60 text-rose-400 px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-all"
                          >
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                    {promocoesFiltradas.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500">Nenhuma promoção ativa encontrada.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}