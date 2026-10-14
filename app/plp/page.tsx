"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import * as XLSX from "xlsx";

const canaisPadraoBase = [
  "Mercado Livre 1",
  "Mercado Livre 2",
  "Mercado Livre 3",
  "Shopee",
  "Amazon",
  "Magalu",
  "Magazine Luiza",
  "Netshoes",
  "Centauro",
  "Shein",
  "TikTok",
  "Site"
];

const analistasPadraoBase: Record<string, string> = {
  "Mercado Livre 1": "Gabrielle",
  "Mercado Livre 2": "Alisson",
  "Mercado Livre 3": "Felipe",
  "Amazon": "Gabrielle",
  "Netshoes": "Alisson",
  "Magalu": "Gabrielle",
  "Magazine Luiza": "Gabrielle",
  "Shopee": "Alisson",
  "Centauro": "Felipe",
  "TikTok": "Alisson",
  "Tiktok": "Alisson",
  "Site": "Alisson e Gabrielle",
  "Shein": "Gabrielle"
};

// HELPER: LOCALIZA O ANALISTA DO CANAL DE FORMA INSENSÍVEL A MAIÚSCULAS/MINÚSCULAS E VARIAÇÕES
function obterAnalistaDoCanal(canalNome: string, mapaAnalistas: Record<string, string>): string {
  if (!canalNome) return "Expedição";
  const cNorm = String(canalNome).trim().toLowerCase();

  // 1. Busca direta insensível a maiúsculas
  for (const [k, v] of Object.entries(mapaAnalistas)) {
    if (k.trim().toLowerCase() === cNorm) {
      return v || "Expedição";
    }
  }

  // 2. Variações comuns de TikTok
  if (cNorm === "tiktok" || cNorm === "tik tok" || cNorm === "tiktok shop") {
    for (const [k, v] of Object.entries(mapaAnalistas)) {
      const kNorm = k.trim().toLowerCase();
      if (kNorm === "tiktok" || kNorm === "tik tok" || kNorm === "tiktok shop") {
        return v || "Expedição";
      }
    }
    return "Alisson";
  }

  // 3. Variações comuns de Magalu
  if (cNorm === "magalu" || cNorm === "magazine luiza" || cNorm === "magazinedeluiza") {
    for (const [k, v] of Object.entries(mapaAnalistas)) {
      const kNorm = k.trim().toLowerCase();
      if (kNorm === "magalu" || kNorm === "magazine luiza") {
        return v || "Expedição";
      }
    }
    return "Gabrielle";
  }

  // 4. Variações com '0' (ex: Mercado Livre 02 -> Mercado Livre 2)
  const cNormZero = cNorm.replace(" 0", " ");
  for (const [k, v] of Object.entries(mapaAnalistas)) {
    if (k.trim().toLowerCase().replace(" 0", " ") === cNormZero) {
      return v || "Expedição";
    }
  }

  // 5. Busca por inclusão sem espaços
  const cLimpo = cNorm.replace(/[\s\-_]/g, "");
  for (const [k, v] of Object.entries(mapaAnalistas)) {
    const kLimpo = k.trim().toLowerCase().replace(/[\s\-_]/g, "");
    if (cLimpo === kLimpo || cLimpo.includes(kLimpo) || kLimpo.includes(cLimpo)) {
      return v || "Expedição";
    }
  }

  return "Expedição";
}

function obterTaxaFlexDoCanal(canalNome: string, mapaTaxas: Record<string, number>): number {
  if (!canalNome) return 12.99;
  const cNorm = String(canalNome).trim().toLowerCase();

  for (const [k, v] of Object.entries(mapaTaxas)) {
    if (k.trim().toLowerCase() === cNorm) return Number(v);
  }
  const cLimpo = cNorm.replace(/[\s\-_]/g, "");
  for (const [k, v] of Object.entries(mapaTaxas)) {
    const kLimpo = k.trim().toLowerCase().replace(/[\s\-_]/g, "");
    if (cLimpo === kLimpo || cLimpo.includes(kLimpo) || kLimpo.includes(cLimpo)) {
      return Number(v);
    }
  }
  return 12.99;
}

const formatarMoeda = (valor: number) =>
  "R$ " + (valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PlpPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  // 2 Abas: Entrada | Manifesto
  const [abaAtiva, setAbaAtiva] = useState<"entrada" | "manifesto">("manifesto");

  // Canais, Taxas e Analistas Fixos por Canal
  const [canais, setCanais] = useState<string[]>(canaisPadraoBase);
  const [taxasFlexCanal, setTaxasFlexCanal] = useState<Record<string, number>>({});
  const [analistasPorCanal, setAnalistasPorCanal] = useState<Record<string, string>>(analistasPadraoBase);
  const [modalConfigAberto, setModalConfigAberto] = useState(false);
  const [novoCanalNome, setNovoCanalNome] = useState("");

  // Analista/Colaborador exibido no documento atual
  const [analistaDocumento, setAnalistaDocumento] = useState("Gabrielle");

  // ==========================================
  // ABA 1: ENTRADA (MANUAL & PLANILHA)
  // ==========================================
  const [modoEntrada, setModoEntrada] = useState<"manual" | "planilha">("manual");
  const [dataEnvio, setDataEnvio] = useState(new Date().toISOString().split("T")[0]);
  const [canalSelecionado, setCanalSelecionado] = useState(canaisPadraoBase[0]);
  const [modalidade, setModalidade] = useState<"FLEX" | "AGENCIA" | "CORREIOS">("FLEX");

  const [pedidosTexto, setPedidosTexto] = useState("");
  const [matrizPlanilha, setMatrizPlanilha] = useState<any[]>([]);
  const [colunaPedido, setColunaPedido] = useState("A");
  const [linhaInicial, setLinhaInicial] = useState("2");
  const [previewQtd, setPreviewQtd] = useState(0);

  // ==========================================
  // ABA 2: MANIFESTO & IMPRESSÃO
  // ==========================================
  const [filtroDataInicio, setFiltroDataInicio] = useState(new Date().toISOString().split("T")[0]);
  const [filtroDataFim, setFiltroDataFim] = useState(new Date().toISOString().split("T")[0]);
  const [filtroAnalista, setFiltroAnalista] = useState("TODOS");
  const [filtroCanal, setFiltroCanal] = useState("TODOS");
  const [filtroModalidade, setFiltroModalidade] = useState("FLEX_CORREIOS");
  const [pedidos, setPedidos] = useState<any[]>([]);

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarCanaisTaxasEAnalistas();
  }, []);

  useEffect(() => {
    buscarPedidos();
  }, [filtroDataInicio, filtroDataFim, filtroCanal, filtroModalidade, filtroAnalista, analistasPorCanal]);

  // LISTA DINÂMICA DE ANALISTAS NO FILTRO:
  const listaAnalistasUnicos = Array.from(
    new Set(
      Object.values(analistasPorCanal)
        .flatMap((n) => (n || "").replace(/\s+e\s+/gi, ",").replace(/&/g, ",").split(","))
        .map((n) => n?.trim())
        .filter((n) => n && n !== "" && n !== "Expedição")
    )
  ).sort((a, b) => a.localeCompare(b));

  useEffect(() => {
    if (filtroAnalista !== "TODOS" && !listaAnalistasUnicos.includes(filtroAnalista)) {
      setFiltroAnalista("TODOS");
    }
  }, [listaAnalistasUnicos, filtroAnalista]);

  // Canais disponíveis no dropdown conforme o analista filtrado (com busca insensível)
  const canaisFiltradosParaSelect =
    filtroAnalista === "TODOS"
      ? canais
      : canais.filter((c) => {
          const resp = obterAnalistaDoCanal(c, analistasPorCanal);
          return resp === filtroAnalista || resp.includes(filtroAnalista);
        });

  // CARREGA DO SUPABASE DE FORMA UNIVERSAL
  const carregarCanaisTaxasEAnalistas = async () => {
    try {
      const { data: configData, error: configError } = await supabase
        .from("plp_config_canais")
        .select("*")
        .order("canal", { ascending: true });

      const mapaTaxas: Record<string, number> = {};
      const mapaAnalistas: Record<string, string> = {};
      const canaisDoBanco: string[] = [];

      if (!configError && configData && configData.length > 0) {
        configData.forEach((row: any) => {
          const nomeCanal = String(row.canal).trim();
          canaisDoBanco.push(nomeCanal);
          mapaAnalistas[nomeCanal] = String(row.analista_responsavel || "Expedição").trim();
          mapaTaxas[nomeCanal] = Number(row.taxa_flex ?? 12.99);
        });

        canaisPadraoBase.forEach((c) => {
          if (!canaisDoBanco.includes(c)) {
            canaisDoBanco.push(c);
            mapaAnalistas[c] = analistasPadraoBase[c] || "Expedição";
            mapaTaxas[c] = 12.99;
          }
        });

        setCanais(canaisDoBanco);
        setTaxasFlexCanal(mapaTaxas);
        setAnalistasPorCanal(mapaAnalistas);

        localStorage.setItem("plp_taxas_flex_por_canal", JSON.stringify(mapaTaxas));
        localStorage.setItem("plp_analistas_por_canal", JSON.stringify(mapaAnalistas));

        if (canaisDoBanco.length > 0 && !canalSelecionado) {
          setCanalSelecionado(canaisDoBanco[0]);
        }
        return;
      }

      const mapaUnico = new Map<string, string>();
      canaisPadraoBase.forEach((c) => mapaUnico.set(c.trim().toLowerCase(), c.trim()));

      const { data: canaisData } = await supabase.from("config_regras_canais").select("canal");
      if (canaisData) {
        canaisData.forEach((c: any) => {
          if (c.canal?.trim()) mapaUnico.set(c.canal.trim().toLowerCase(), c.canal.trim());
        });
      }

      const lista = Array.from(mapaUnico.values()).sort((a, b) => a.localeCompare(b));
      setCanais(lista);

      const salvoTaxas = localStorage.getItem("plp_taxas_flex_por_canal");
      const taxas: Record<string, number> = salvoTaxas ? JSON.parse(salvoTaxas) : {};
      lista.forEach((c) => {
        if (taxas[c] === undefined) taxas[c] = 12.99;
      });
      setTaxasFlexCanal(taxas);

      const salvoAnalistas = localStorage.getItem("plp_analistas_por_canal");
      const analistas: Record<string, string> = salvoAnalistas ? JSON.parse(salvoAnalistas) : {};

      const temHenrique = Object.values(analistas).some((v) => v.includes("Henrique"));
      const analistasFinais =
        temHenrique || Object.keys(analistas).length === 0
          ? { ...analistasPadraoBase }
          : { ...analistasPadraoBase, ...analistas };

      lista.forEach((c) => {
        if (!analistasFinais[c]) analistasFinais[c] = analistasPadraoBase[c] || "Expedição";
      });
      setAnalistasPorCanal(analistasFinais);
      localStorage.setItem("plp_analistas_por_canal", JSON.stringify(analistasFinais));
    } catch (err) {
      console.error("Erro ao carregar configurações de canais:", err);
    }
  };

  const salvarConfiguracoesUniversais = async () => {
    setSalvandoConfig(true);
    try {
      const payload = canais.map((c) => ({
        canal: c,
        analista_responsavel: analistasPorCanal[c]?.trim() || "Expedição",
        taxa_flex: Number(taxasFlexCanal[c] ?? 12.99),
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from("plp_config_canais")
        .upsert(payload, { onConflict: "canal" });

      if (error) {
        alert("Erro ao salvar no banco Supabase: " + error.message);
      } else {
        alert("✅ Configurações salvas universalmente! Todos os usuários agora verão estes mesmos responsáveis.");
        localStorage.setItem("plp_taxas_flex_por_canal", JSON.stringify(taxasFlexCanal));
        localStorage.setItem("plp_analistas_por_canal", JSON.stringify(analistasPorCanal));
        setModalConfigAberto(false);
        await carregarCanaisTaxasEAnalistas();
        await buscarPedidos();
      }
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message);
    }
    setSalvandoConfig(false);
  };

  const atualizarTaxaFlexLocal = (canal: string, valor: number) => {
    setTaxasFlexCanal((prev) => ({ ...prev, [canal]: valor }));
  };

  const atualizarAnalistaCanalLocal = (canal: string, nome: string) => {
    setAnalistasPorCanal((prev) => ({ ...prev, [canal]: nome }));
  };

  const handleMudarFiltroAnalista = (novoAnalista: string) => {
    setFiltroAnalista(novoAnalista);
    if (novoAnalista !== "TODOS") {
      const analistaDoCanalAtual = obterAnalistaDoCanal(filtroCanal, analistasPorCanal);
      if (filtroCanal !== "TODOS" && !analistaDoCanalAtual.includes(novoAnalista)) {
        setFiltroCanal("TODOS");
      }
    }
  };

  const handleAdicionarCanal = async () => {
    const n = novoCanalNome.trim();
    if (!n) return;
    if (!canais.some((c) => c.toLowerCase() === n.toLowerCase())) {
      const novaLista = [...canais, n].sort((a, b) => a.localeCompare(b));
      setCanais(novaLista);
      const novoTaxas = { ...taxasFlexCanal, [n]: 12.99 };
      const novoAnalistas = { ...analistasPorCanal, [n]: "Expedição" };
      setTaxasFlexCanal(novoTaxas);
      setAnalistasPorCanal(novoAnalistas);
      setNovoCanalNome("");

      await supabase.from("plp_config_canais").upsert({
        canal: n,
        analista_responsavel: "Expedição",
        taxa_flex: 12.99,
        updated_at: new Date().toISOString()
      }, { onConflict: "canal" });
    } else {
      alert("Este canal já está na lista.");
    }
  };

  const handleRemoverCanal = async (canalParaRemover: string) => {
    if (!confirm(`Deseja remover o canal "${canalParaRemover}" das configurações?`)) return;
    const novaLista = canais.filter((c) => c !== canalParaRemover);
    setCanais(novaLista);
    const nAnalistas = { ...analistasPorCanal };
    delete nAnalistas[canalParaRemover];
    setAnalistasPorCanal(nAnalistas);
    const nTaxas = { ...taxasFlexCanal };
    delete nTaxas[canalParaRemover];
    setTaxasFlexCanal(nTaxas);

    await supabase.from("plp_config_canais").delete().eq("canal", canalParaRemover);
  };

  const buscarPedidos = async () => {
    setLoading(true);
    let query = supabase
      .from("plp_pedidos")
      .select("*")
      .gte("data_envio", filtroDataInicio)
      .lte("data_envio", filtroDataFim)
      .order("canal", { ascending: true })
      .order("created_at", { ascending: true });

    if (filtroCanal !== "TODOS") {
      query = query.ilike("canal", filtroCanal);
    }

    if (filtroModalidade === "FLEX_CORREIOS") {
      query = query.in("modalidade", ["FLEX", "CORREIOS"]);
    } else if (filtroModalidade !== "TODOS") {
      query = query.eq("modalidade", filtroModalidade);
    }

    const { data } = await query;
    let dadosFiltrados = data || [];

    // FILTRO POR ANALISTA COM COMPATIBILIDADE CASE-INSENSITIVE PARA TIKTOK
    if (filtroAnalista !== "TODOS") {
      dadosFiltrados = dadosFiltrados.filter((p: any) => {
        if (p.modalidade === "FLEX") {
          return true; // Flex sempre é unificado
        }
        const analistaDoCanal = obterAnalistaDoCanal(p.canal, analistasPorCanal);
        return analistaDoCanal === filtroAnalista || analistaDoCanal.includes(filtroAnalista);
      });
    }

    setPedidos(dadosFiltrados);
    setLoading(false);
  };

  // SINCRONIZA AUTOMATICAMENTE O NOME DO ANALISTA NO CABEÇALHO
  useEffect(() => {
    if (filtroModalidade === "FLEX") {
      const analistasFlexPresentes = Array.from(
        new Set(
          pedidos
            .filter((p) => p.modalidade === "FLEX")
            .map((p) => obterAnalistaDoCanal(p.canal, analistasPorCanal))
            .filter((n) => n && n !== "Expedição")
        )
      ).sort();

      if (analistasFlexPresentes.length >= 2) {
        setAnalistaDocumento(analistasFlexPresentes.join(" & "));
      } else {
        const todosAtivos = Array.from(
          new Set(Object.values(analistasPorCanal).filter((n) => n && n !== "Expedição"))
        ).sort();
        if (todosAtivos.length >= 2) {
          setAnalistaDocumento(todosAtivos.slice(0, 2).join(" & "));
        } else if (analistasFlexPresentes.length === 1) {
          setAnalistaDocumento(analistasFlexPresentes[0]);
        } else {
          setAnalistaDocumento("Alisson & Gabrielle");
        }
      }
      return;
    }

    if (filtroAnalista !== "TODOS") {
      if (filtroModalidade === "FLEX_CORREIOS") {
        const temFlexDeOutro = pedidos.some(
          (p) => p.modalidade === "FLEX" && !obterAnalistaDoCanal(p.canal, analistasPorCanal).includes(filtroAnalista)
        );
        if (temFlexDeOutro) {
          const analistasPresentes = Array.from(
            new Set(pedidos.map((p) => obterAnalistaDoCanal(p.canal, analistasPorCanal)))
          ).filter((n) => n && n !== "Expedição").sort();
          if (analistasPresentes.length >= 2) {
            setAnalistaDocumento(analistasPresentes.join(" & "));
            return;
          }
        }
      }
      setAnalistaDocumento(filtroAnalista);
      return;
    }

    if (filtroCanal !== "TODOS") {
      setAnalistaDocumento(obterAnalistaDoCanal(filtroCanal, analistasPorCanal));
      return;
    }

    const analistasPresentes = Array.from(
      new Set(pedidos.map((p) => obterAnalistaDoCanal(p.canal, analistasPorCanal)))
    ).filter((n) => n && n !== "Expedição").sort();

    if (analistasPresentes.length === 1) {
      setAnalistaDocumento(analistasPresentes[0]);
    } else if (analistasPresentes.length > 1) {
      setAnalistaDocumento(analistasPresentes.join(" & "));
    } else {
      setAnalistaDocumento("Expedição");
    }
  }, [filtroModalidade, filtroAnalista, filtroCanal, pedidos, analistasPorCanal]);

  const handleUploadPlanilha = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt: any) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: "A", defval: "" });
        setMatrizPlanilha(matrix);

        const col = colunaPedido.trim().toUpperCase();
        const start = Math.max(0, parseInt(linhaInicial, 10) - 1 || 0);
        const count = matrix.slice(start).filter((r: any) => String(r[col] || "").trim()).length;
        setPreviewQtd(count);
      } catch (err: any) {
        alert("Erro ao ler ficheiro: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSalvarPedidos = async () => {
    let listaPedidos: string[] = [];

    if (modoEntrada === "manual") {
      listaPedidos = pedidosTexto
        .split(/[\n,;]+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (listaPedidos.length === 0) return alert("Digite ou cole ao menos um número de pedido.");
    } else {
      if (matrizPlanilha.length === 0) return alert("Selecione um ficheiro Excel/CSV.");
      const col = colunaPedido.trim().toUpperCase();
      const start = Math.max(0, parseInt(linhaInicial, 10) - 1 || 0);

      for (let r = start; r < matrizPlanilha.length; r++) {
        const v = String(matrizPlanilha[r]?.[col] || "").trim();
        if (v && v.toLowerCase() !== "pedido" && v.toLowerCase() !== "n.º de venda") {
          listaPedidos.push(v);
        }
      }
      if (listaPedidos.length === 0) return alert(`Nenhum pedido encontrado na coluna ${col}.`);
    }

    setSalvando(true);
    const valorFreteUnit = modalidade === "FLEX" ? obterTaxaFlexDoCanal(canalSelecionado, taxasFlexCanal) : 0;

    const payload = listaPedidos.map((ped) => ({
      data_envio: dataEnvio,
      numero_pedido: ped,
      modalidade: modalidade,
      canal: canalSelecionado,
      valor_frete: valorFreteUnit,
    }));

    const { error } = await supabase.from("plp_pedidos").insert(payload);
    if (error) {
      alert("Erro ao gravar pedidos: " + error.message);
    } else {
      alert(`✅ ${payload.length} pedido(s) gravado(s) com sucesso para ${canalSelecionado}!`);
      setPedidosTexto("");
      setMatrizPlanilha([]);
      setPreviewQtd(0);
      buscarPedidos();
      setAbaAtiva("manifesto");
    }
    setSalvando(false);
  };

  const handleExcluirPedido = async (id: number) => {
    if (!confirm("Remover este pedido?")) return;
    await supabase.from("plp_pedidos").delete().eq("id", id);
    buscarPedidos();
  };

  const handleLimparPeriodo = async () => {
    if (!confirm(`Remover TODOS os ${pedidos.length} pedidos deste filtro?`)) return;
    const ids = pedidos.map((p) => p.id);
    if (ids.length === 0) return;
    setLoading(true);
    await supabase.from("plp_pedidos").delete().in("id", ids);
    buscarPedidos();
  };

  const handleBaixarExcel = () => {
    if (pedidos.length === 0) return alert("Nenhum pedido no período filtrado.");

    const dados = pedidos.map((item) => ({
      "Data de Envio": item.data_envio,
      "Número do Pedido": item.numero_pedido,
      Canal: item.canal,
      "Valor Frete (R$)": item.modalidade === "FLEX" ? Number(item.valor_frete || 0) : 0,
      Modalidade: item.modalidade,
    }));

    const ws = XLSX.utils.json_to_sheet(dados);
    ws["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 20 }, { wch: 18 }, { wch: 14 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PLP Expedição");
    XLSX.writeFile(wb, `PLP_${filtroDataInicio}_ate_${filtroDataFim}.xlsx`);
  };

  const handleImprimir = () => {
    if (pedidos.length === 0) return alert("Nenhum pedido para imprimir.");
    window.print();
  };

  // AGRUPA OS PEDIDOS EM COLUNAS POR CANAL NORMALIZADO
  const gerarColunasPorCanal = (listaPedidos: any[], maxLinhasPorColuna = 26) => {
    const mapa = new Map<string, string[]>();
    for (const p of listaPedidos) {
      const cOriginal = String(p.canal || "Geral").trim();
      const cCanonico = canais.find((cn) => cn.trim().toLowerCase() === cOriginal.toLowerCase()) || cOriginal;

      if (!mapa.has(cCanonico)) mapa.set(cCanonico, []);
      mapa.get(cCanonico)!.push(p.numero_pedido);
    }

    const colunas: { canal: string; totalCanal: number; pedidos: { idx: number; numero: string }[] }[] = [];

    mapa.forEach((peds, canalNome) => {
      const total = peds.length;
      for (let i = 0; i < total; i += maxLinhasPorColuna) {
        const pedSlice = peds.slice(i, i + maxLinhasPorColuna);
        colunas.push({
          canal: i === 0 ? canalNome : `${canalNome} (cont.)`,
          totalCanal: total,
          pedidos: pedSlice.map((num, j) => ({ idx: i + j + 1, numero: num }))
        });
      }
    });

    return colunas;
  };

  const colunasPorCanal = gerarColunasPorCanal(pedidos, 26);

  const kpis = {
    total: pedidos.length,
    flex: pedidos.filter((p) => p.modalidade === "FLEX").length,
    agencia: pedidos.filter((p) => p.modalidade === "AGENCIA").length,
    correios: pedidos.filter((p) => p.modalidade === "CORREIOS").length,
    custoTotalFlex: pedidos
      .filter((p) => p.modalidade === "FLEX")
      .reduce((acc, p) => acc + Number(p.valor_frete || 0), 0),
  };

  const formatarMetodoEnvioTexto = () => {
    if (filtroModalidade === "FLEX_CORREIOS") return "Flex + Correios";
    if (filtroModalidade === "FLEX") return "Mercado Envios Flex";
    if (filtroModalidade === "AGENCIA") return "Agência";
    if (filtroModalidade === "CORREIOS") return "Correios";
    return "Todas as Modalidades";
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans print:p-0 print:bg-white print:text-black">
      
      {/* CSS DE IMPRESSÃO MINIMALISTA A4 PAISAGEM */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 6mm 8mm;
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          nav, header, button, .print-hide {
            display: none !important;
          }
          .folha-print-manifesto {
            width: 100% !important;
            border: 1.5px solid #000000 !important;
            background: #ffffff !important;
            color: #000000 !important;
            padding: 6px 8px !important;
            box-shadow: none !important;
          }
          .bloco-assinatura-print {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          td, th {
            border: 1px solid #d1d5db !important;
            padding: 2.5px 5px !important;
            font-size: 10px !important;
            line-height: 1.2 !important;
          }
        }
      `}</style>

      <div className="max-w-[98%] mx-auto space-y-6">
        
        {/* CABEÇALHO EM TELA */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Expedição & PLPs</h1>
            <p className="text-sm font-medium text-slate-400">
              Controle de envios, analistas fixos por canal e impressão de manifesto
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setModalConfigAberto(true)}
              className="bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-800 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all flex items-center gap-2"
            >
              <span>⚙️ Canais, Taxas & Analistas</span>
            </button>
            <Navbar />
          </div>
        </div>

        {/* 2 ABAS */}
        <div className="flex gap-3 print:hidden">
          <button
            onClick={() => setAbaAtiva("entrada")}
            className={`px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "entrada"
                ? "bg-purple-600 text-white shadow-purple-900/40"
                : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
            }`}
          >
            📥 1. Entrada de Pedidos
          </button>
          <button
            onClick={() => setAbaAtiva("manifesto")}
            className={`px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "manifesto"
                ? "bg-indigo-600 text-white shadow-indigo-900/40"
                : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
            }`}
          >
            🖨️ 2. Manifesto de Expedição & Impressão
          </button>
        </div>

        {/* ======================================================== */}
        {/* ABA 1: ENTRADA DE PEDIDOS (MANUAL OU PLANILHA)           */}
        {/* ======================================================== */}
        {abaAtiva === "entrada" && (
          <div className="bg-slate-900/90 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl space-y-5 animate-in fade-in duration-300 print:hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>📥 Lançamento de Pedidos</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Selecione o canal e a modalidade para registro</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase">Origem:</span>
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setModoEntrada("manual")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                      modoEntrada === "manual" ? "bg-purple-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    ✍️ Digitar / Colar
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoEntrada("planilha")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                      modoEntrada === "planilha" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    📑 Planilha
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data de Envio:</label>
                <input
                  type="date"
                  value={dataEnvio}
                  onChange={(e) => setDataEnvio(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Canal de Venda:
                </label>
                <select
                  value={canalSelecionado}
                  onChange={(e) => setCanalSelecionado(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none cursor-pointer"
                >
                  {canais.map((c, i) => (
                    <option key={i} value={c}>
                      {c} ({obterAnalistaDoCanal(c, analistasPorCanal)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Modalidade de Envio:
                </label>
                <select
                  value={modalidade}
                  onChange={(e) => setModalidade(e.target.value as any)}
                  className={`w-full bg-slate-950 border rounded-xl p-2.5 text-xs font-black outline-none cursor-pointer ${
                    modalidade === "FLEX" ? "border-amber-500/80 text-amber-400" : "border-slate-700 text-white"
                  }`}
                >
                  <option value="FLEX">⚡ FLEX (Com Frete)</option>
                  <option value="AGENCIA">🏢 AGÊNCIA (R$ 0,00)</option>
                  <option value="CORREIOS">📮 CORREIOS (R$ 0,00)</option>
                </select>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Colaborador(a) Fixo(a) do Canal: <strong className="text-indigo-400">{obterAnalistaDoCanal(canalSelecionado, analistasPorCanal)}</strong> | Frete na Coluna D (Excel):
              </span>
              <strong className={modalidade === "FLEX" ? "text-amber-400 text-sm font-mono" : "text-slate-500"}>
                {modalidade === "FLEX" ? formatarMoeda(obterTaxaFlexDoCanal(canalSelecionado, taxasFlexCanal)) : "R$ 0,00"}
              </strong>
            </div>

            {modoEntrada === "manual" ? (
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">
                  Cole os números de pedido (um por linha ou separados por vírgula):
                </label>
                <textarea
                  rows={4}
                  value={pedidosTexto}
                  onChange={(e) => setPedidosTexto(e.target.value)}
                  placeholder="2000018949435054&#10;2000018941773046&#10;2000018941467386"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-white outline-none focus:border-purple-500 transition-all resize-y"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800 items-end">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ficheiro (Excel/CSV):</label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleUploadPlanilha}
                    className="w-full bg-slate-900 border border-slate-700 file:border-0 file:bg-indigo-600 file:text-white file:text-xs file:font-bold file:py-1.5 file:px-3 file:rounded-lg file:mr-3 file:cursor-pointer rounded-xl p-1 text-xs text-slate-300 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Coluna do Pedido:</label>
                  <input
                    type="text"
                    value={colunaPedido}
                    onChange={(e) => setColunaPedido(e.target.value.toUpperCase())}
                    placeholder="A"
                    className="w-full bg-slate-900 border border-amber-600/50 rounded-lg p-2 text-xs font-mono text-center text-amber-300 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Linha Inicial:</label>
                  <input
                    type="number"
                    value={linhaInicial}
                    onChange={(e) => setLinhaInicial(e.target.value)}
                    placeholder="2"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSalvarPedidos}
                disabled={salvando}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-8 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-purple-900/40 transition-all"
              >
                {salvando ? "A Gravar..." : modoEntrada === "manual" ? "Salvar Pedido(s)" : `Importar Planilha ${previewQtd > 0 ? `(${previewQtd} encontrados)` : ""}`}
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ABA 2: MANIFESTO DE EXPEDIÇÃO & IMPRESSÃO PAISAGEM       */}
        {/* ======================================================== */}
        {abaAtiva === "manifesto" && (
          <div className="space-y-6">
            
            {/* PAINEL DE FILTROS EM TELA */}
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4 print:hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-base font-bold text-white">Manifesto de Expedição</h2>
                  <p className="text-xs text-slate-400">Listas organizadas por canal lado a lado na folha deitada</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleImprimir}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-indigo-900/40 transition-all flex items-center gap-2"
                  >
                    <span>🖨️ Imprimir Lista (A4 Deitada)</span>
                  </button>
                  <button
                    onClick={handleBaixarExcel}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-2"
                  >
                    <span>📥 Baixar Excel</span>
                  </button>
                  <button
                    onClick={handleLimparPeriodo}
                    disabled={pedidos.length === 0}
                    className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all"
                  >
                    🗑️ Limpar Filtro
                  </button>
                </div>
              </div>

              {/* Filtros Integrados */}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">De:</label>
                  <input
                    type="date"
                    value={filtroDataInicio}
                    onChange={(e) => setFiltroDataInicio(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Até:</label>
                  <input
                    type="date"
                    value={filtroDataFim}
                    onChange={(e) => setFiltroDataFim(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white outline-none"
                  />
                </div>

                {/* FILTRAR POR ANALISTA ATIVO */}
                <div>
                  <label className="block text-[10px] font-bold text-purple-400 uppercase mb-1">
                    Filtrar Analista:
                  </label>
                  <select
                    value={filtroAnalista}
                    onChange={(e) => handleMudarFiltroAnalista(e.target.value)}
                    className="w-full bg-slate-950 border border-purple-500/50 rounded-xl p-2 text-xs font-bold text-purple-300 outline-none cursor-pointer"
                  >
                    <option value="TODOS">Todos os Analistas</option>
                    {listaAnalistasUnicos.map((a, i) => (
                      <option key={i} value={a}>{a}</option>
                    ))}
                  </select>
                </div>

                {/* CANAL (ADAPTADO AO ANALISTA SELECIONADO) */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Canal:</label>
                  <select
                    value={filtroCanal}
                    onChange={(e) => setFiltroCanal(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white outline-none cursor-pointer"
                  >
                    <option value="TODOS">
                      {filtroAnalista === "TODOS" ? "Todos os Canais" : `Todos de ${filtroAnalista}`}
                    </option>
                    {canaisFiltradosParaSelect.map((c, i) => (
                      <option key={i} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Modalidade:</label>
                  <select
                    value={filtroModalidade}
                    onChange={(e) => setFiltroModalidade(e.target.value)}
                    className="w-full bg-slate-950 border border-amber-600/50 rounded-xl p-2 text-xs font-bold text-amber-300 outline-none cursor-pointer"
                  >
                    <option value="FLEX_CORREIOS">⚡ FLEX + Correios (Unificados)</option>
                    <option value="TODOS">Todas as Modalidades</option>
                    <option value="FLEX">Apenas Flex</option>
                    <option value="AGENCIA">Apenas Agência</option>
                    <option value="CORREIOS">Apenas Correios</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Colaborador(es) no Papel:
                  </label>
                  <input
                    type="text"
                    value={analistaDocumento}
                    onChange={(e) => setAnalistaDocumento(e.target.value)}
                    placeholder="Nome..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-semibold text-white outline-none"
                  />
                </div>
              </div>

              {/* KPIs de Tela */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-1">
                <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
                  <span className="block text-[9px] font-bold text-slate-400 uppercase">Total Volumes</span>
                  <span className="text-base font-black text-white">{kpis.total}</span>
                </div>
                <div className="bg-slate-950 border border-amber-900/40 p-2.5 rounded-xl">
                  <span className="block text-[9px] font-bold text-amber-400 uppercase">Flex</span>
                  <span className="text-base font-black text-amber-400">{kpis.flex}</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
                  <span className="block text-[9px] font-bold text-slate-400 uppercase">Agência</span>
                  <span className="text-base font-black text-white">{kpis.agencia}</span>
                </div>
                <div className="bg-slate-950 border border-indigo-900/40 p-2.5 rounded-xl">
                  <span className="block text-[9px] font-bold text-indigo-400 uppercase">Correios</span>
                  <span className="text-base font-black text-indigo-400">{kpis.correios}</span>
                </div>
                <div className="bg-slate-950 border border-emerald-900/40 p-2.5 rounded-xl">
                  <span className="block text-[9px] font-bold text-emerald-400 uppercase">Frete Flex Total</span>
                  <span className="text-base font-black text-emerald-400">{formatarMoeda(kpis.custoTotalFlex)}</span>
                </div>
              </div>
            </div>

            {/* ======================================================== */}
            {/* DOCUMENTO DE IMPRESSÃO (A4 PAISAGEM - COLUNAS POR CANAL) */}
            {/* ======================================================== */}
            <div className="folha-print-manifesto bg-white text-black p-4 rounded-xl border border-slate-300 shadow-xl">
              
              {/* CABEÇALHO */}
              <div className="border-b-2 border-black pb-2 mb-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h1 className="text-base font-black uppercase tracking-wide">PLP DE ENVIOS — BEST FIT</h1>
                    <p className="text-[10px] text-gray-700">Controle de Expedição e Autorização de Envio</p>
                  </div>
                  <div className="text-right text-[11px] leading-tight">
                    <p>Data de Envio: <strong>{filtroDataInicio === filtroDataFim ? filtroDataInicio : `${filtroDataInicio} a ${filtroDataFim}`}</strong></p>
                    <p>Modalidade de Envio: <strong className="uppercase">{formatarMetodoEnvioTexto()}</strong></p>
                    <p>Colaborador(es) do Canal: <strong>{analistaDocumento || "Expedição"}</strong></p>
                  </div>
                </div>
              </div>

              {/* LISTAS DE PEDIDOS AGRUPADAS POR CANAL LADO A LADO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 print:grid-cols-4 gap-3">
                {colunasPorCanal.map((col, cIdx) => (
                  <div key={cIdx} className="border border-black rounded print:rounded-none overflow-hidden self-start">
                    {/* TÍTULO DO CANAL */}
                    <div className="bg-gray-100 border-b border-black font-bold text-xs p-1.5 text-center uppercase tracking-wide">
                      {col.canal} <span className="text-[10px] text-gray-600 font-normal">({col.pedidos.length})</span>
                    </div>

                    {/* LISTA SEQUENCIAL DE PEDIDOS DO CANAL */}
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-300 text-[9px] uppercase font-bold text-gray-700">
                          <th className="p-1 text-center w-8 border-r border-gray-300">#</th>
                          <th className="p-1">Número do Pedido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 text-[10px] font-mono">
                        {col.pedidos.map((p) => (
                          <tr key={p.idx} className="h-5 hover:bg-gray-50">
                            <td className="p-0.5 text-center text-gray-500 border-r border-gray-200 w-8">{p.idx}</td>
                            <td className="p-0.5 pl-1.5 font-bold text-black">{p.numero}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

                {pedidos.length === 0 && (
                  <div className="col-span-4 p-8 text-center text-gray-500 italic text-xs border border-dashed border-gray-300 rounded">
                    Nenhum pedido registrado no filtro selecionado.
                  </div>
                )}
              </div>

              {/* BLOCO DE TOTALIZADOR E 2 ASSINATURAS */}
              <div className="bloco-assinatura-print mt-3">
                <div className="flex justify-between items-center border-t-2 border-black p-1.5 bg-gray-100 text-xs font-bold">
                  <span>TOTAL DE VOLUMES CONFERIDOS:</span>
                  <span className="font-mono text-sm">{kpis.total} pacotes</span>
                </div>

                <div className="grid grid-cols-2 gap-8 pt-4 mt-2 border-t border-gray-300 text-[11px]">
                  <div className="border-t border-black pt-1">
                    <p className="font-bold">Colaborador(es) do Canal ({analistaDocumento || "Expedição"}):</p>
                    <p className="text-gray-500 mt-2">Assinatura: _________________________________________</p>
                  </div>
                  <div className="border-t border-black pt-1">
                    <p className="font-bold">Responsável pela Embalagem:</p>
                    <p className="text-gray-500 mt-2">Assinatura: _________________________________________</p>
                  </div>
                </div>

                <div className="text-[8px] text-gray-400 text-center pt-2">
                  Documento para controle interno — PLP de Envios Best Fit
                </div>
              </div>
            </div>

            {/* TABELA DE AUDITORIA INDIVIDUAL EM TELA */}
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3 print:hidden">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Auditoria e Exclusão Individual ({pedidos.length})
              </h3>
              <div className="overflow-x-auto max-h-[300px]">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-2 text-center">#</th>
                      <th className="p-2">Data</th>
                      <th className="p-2">N.º do Pedido</th>
                      <th className="p-2">Canal</th>
                      <th className="p-2 text-center">Modalidade</th>
                      <th className="p-2 text-right text-amber-300">Frete (Coluna D - Excel)</th>
                      <th className="p-2 text-center">Excluir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {pedidos.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-2 text-center font-mono text-slate-500">{idx + 1}</td>
                        <td className="p-2 font-mono text-slate-300">{item.data_envio}</td>
                        <td className="p-2 font-mono font-bold text-white">{item.numero_pedido}</td>
                        <td className="p-2 text-slate-300 font-semibold">{item.canal}</td>
                        <td className="p-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                              item.modalidade === "FLEX"
                                ? "bg-amber-900/30 text-amber-400 border-amber-800/50"
                                : item.modalidade === "AGENCIA"
                                ? "bg-slate-800 text-slate-300 border-slate-700"
                                : "bg-indigo-900/30 text-indigo-400 border-indigo-800/50"
                            }`}
                          >
                            {item.modalidade}
                          </span>
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-400">
                          {item.modalidade === "FLEX" ? formatarMoeda(item.valor_frete) : "R$ 0,00"}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => handleExcluirPedido(item.id)}
                            className="text-rose-400 hover:text-rose-300 p-1 cursor-pointer font-bold"
                            title="Remover pedido"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* MODAL CONFIGURAÇÃO TAXAS FLEX E ANALISTAS UNIVERSAL */}
        {modalConfigAberto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 print:hidden">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto p-6 md:p-8 shadow-2xl space-y-5">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-amber-400 flex items-center gap-2">
                    <span>⚙️ Canais, Analistas Responsáveis & Taxas Flex</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Ao salvar, as alterações ficam gravadas no banco Supabase e serão sincronizadas para <strong>todos os usuários</strong>.
                  </p>
                </div>
                <button
                  onClick={() => setModalConfigAberto(false)}
                  className="text-slate-400 hover:text-white text-base cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Novo canal..."
                  value={novoCanalNome}
                  onChange={(e) => setNovoCanalNome(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none flex-1"
                />
                <button
                  type="button"
                  onClick={handleAdicionarCanal}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded-xl text-xs uppercase cursor-pointer"
                >
                  + Adicionar Canal
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                {canais.map((c, i) => (
                  <div key={i} className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 relative group">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-white block">{c}</span>
                      {!canaisPadraoBase.includes(c) && (
                        <button
                          type="button"
                          onClick={() => handleRemoverCanal(c)}
                          className="text-rose-400 hover:text-rose-300 text-[10px] font-bold uppercase cursor-pointer"
                          title="Remover canal"
                        >
                          ✕ Remover
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[9px] text-slate-500 block">Colaborador(a) Responsável:</span>
                        <input
                          type="text"
                          value={analistasPorCanal[c] || ""}
                          onChange={(e) => atualizarAnalistaCanalLocal(c, e.target.value)}
                          placeholder="Nome..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs font-semibold text-white outline-none focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 block">Frete Flex (R$):</span>
                        <input
                          type="number"
                          step="0.01"
                          value={taxasFlexCanal[c] ?? 12.99}
                          onChange={(e) => atualizarTaxaFlexLocal(c, parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-900 border border-amber-600/50 rounded-lg p-1.5 text-xs font-mono text-center text-amber-300 font-bold outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                <span className="text-[11px] text-slate-500 italic">
                  Salva no Supabase para sincronização universal entre computadores.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModalConfigAberto(false)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 px-5 rounded-xl text-xs uppercase cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={salvarConfiguracoesUniversais}
                    disabled={salvandoConfig}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase cursor-pointer shadow-lg shadow-purple-900/40 transition-all"
                  >
                    {salvandoConfig ? "A Salvar no Banco..." : "Salvar Configurações Universais"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}