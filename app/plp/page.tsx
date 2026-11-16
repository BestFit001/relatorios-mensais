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
  "Shopee": "Alisson",
  "Centauro": "Felipe",
  "TikTok": "Alisson",
  "Site": "Alisson e Gabrielle",
  "Shein": "Gabrielle"
};

function obterAnalistaDoCanal(canalNome: string, mapaAnalistas: Record<string, string>): string {
  if (!canalNome) return "Expedição";
  const cNorm = String(canalNome).trim().toLowerCase();

  for (const [k, v] of Object.entries(mapaAnalistas)) {
    if (k.trim().toLowerCase() === cNorm) {
      return v || "Expedição";
    }
  }

  if (cNorm === "tiktok" || cNorm === "tik tok" || cNorm === "tiktok shop") {
    for (const [k, v] of Object.entries(mapaAnalistas)) {
      const kNorm = k.trim().toLowerCase();
      if (kNorm === "tiktok" || kNorm === "tik tok" || kNorm === "tiktok shop") {
        return v || "Expedição";
      }
    }
    return "Alisson";
  }

  if (cNorm === "magalu" || cNorm === "magazine luiza" || cNorm === "magazinedeluiza") {
    for (const [k, v] of Object.entries(mapaAnalistas)) {
      const kNorm = k.trim().toLowerCase();
      if (kNorm === "magalu" || kNorm === "magazine luiza") {
        return v || "Expedição";
      }
    }
    return "Gabrielle";
  }

  const cNormZero = cNorm.replace(" 0", " ");
  for (const [k, v] of Object.entries(mapaAnalistas)) {
    if (k.trim().toLowerCase().replace(" 0", " ") === cNormZero) {
      return v || "Expedição";
    }
  }

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
  const [filtroModalidade, setFiltroModalidade] = useState("TODOS"); // Padrão: "TODOS" (Todas as modalidades)
  const [termoPesquisaPedido, setTermoPesquisaPedido] = useState("");
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());   // pedidos marcados na auditoria para exclusão em massa

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

  // Lista dinâmica de analistas
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

  const canaisFiltradosParaSelect =
    filtroAnalista === "TODOS"
      ? canais
      : canais.filter((c) => {
          const resp = obterAnalistaDoCanal(c, analistasPorCanal);
          return resp === filtroAnalista || resp.includes(filtroAnalista);
        });

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
        alert("✅ Configurações salvas universalmente!");
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

    // Tratamento das novas opções de modalidade
    if (filtroModalidade === "FLEX") {
      query = query.eq("modalidade", "FLEX");
    } else if (filtroModalidade === "AGENCIA") {
      query = query.eq("modalidade", "AGENCIA");
    } else if (filtroModalidade === "CORREIOS") {
      query = query.eq("modalidade", "CORREIOS");
    } else if (filtroModalidade === "AGENCIA_CORREIOS") {
      query = query.in("modalidade", ["AGENCIA", "CORREIOS"]);
    }
    // Se for "TODOS", não restringe modalidade na query (traz tudo)

    const { data } = await query;
    let dadosFiltrados = data || [];

    // Filtro por analista (Respeitando a regra do FLEX)
    if (filtroAnalista !== "TODOS") {
      dadosFiltrados = dadosFiltrados.filter((p: any) => {
        if (p.modalidade === "FLEX" && filtroModalidade === "TODOS") {
          return true; // Quando está em "Todas as Modalidades", o FLEX aparece junto com os demais canais do analista
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
    const valorFreteUnit = modalidade === "FLEX" ? Number(taxasFlexCanal[canalSelecionado] ?? 12.99) : 0;

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

  // Some da seleção o que já não está na lista filtrada (mudou o filtro, a pesquisa ou foi excluído)
  useEffect(() => {
    setSelecionados((atual) => {
      if (atual.size === 0) return atual;
      const existentes = new Set(pedidos.map((p) => p.id));
      const novo = new Set(Array.from(atual).filter((id) => existentes.has(id)));
      return novo.size === atual.size ? atual : novo;
    });
  }, [pedidos]);

  const alternarSelecionado = (id: number) => setSelecionados((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const handleExcluirSelecionados = async () => {
    const ids = Array.from(selecionados);
    if (ids.length === 0) return;
    if (!confirm(`Remover ${ids.length} pedido(s) selecionado(s)? Isso não pode ser desfeito.`)) return;
    setLoading(true);
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from("plp_pedidos").delete().in("id", ids.slice(i, i + 100));
      if (error) { alert("Erro ao excluir: " + error.message); break; }
    }
    setSelecionados(new Set());
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

  // MONTA A FOLHA: seções por canal (e FLEX numa seção só, com subtítulo por canal) fluindo em colunas, 4 colunas por página A4 deitada.
  // Sem buracos: a coluna seguinte continua de onde a anterior parou ("cont." repete o nome da seção).
  const NOME_MODALIDADE: Record<string, string> = { FLEX: "Flex", AGENCIA: "Agência", CORREIOS: "Correios" };
  const montarPaginas = (listaPedidos: any[]) => {
    type Linha = { t: "secao" | "sub" | "pedido"; texto: string; qtd?: number; idx?: number; numero?: string; cont?: boolean };
    const secoes = new Map<string, { titulo: string; flex: boolean; subs: Map<string, string[]> }>();
    for (const p of listaPedidos) {
      const canalBruto = String(p.canal || "Geral").trim();
      const canal = canais.find((cn) => cn.trim().toLowerCase() === canalBruto.toLowerCase()) || canalBruto;
      const flexJunto = p.modalidade === "FLEX" && filtroModalidade === "TODOS";
      const chave = flexJunto ? "__FLEX__" : canal;
      if (!secoes.has(chave)) secoes.set(chave, { titulo: flexJunto ? "FLEX" : canal, flex: flexJunto, subs: new Map() });
      const sec = secoes.get(chave)!;
      const sub = flexJunto ? canal : (NOME_MODALIDADE[p.modalidade] || String(p.modalidade || ""));
      if (!sec.subs.has(sub)) sec.subs.set(sub, []);
      sec.subs.get(sub)!.push(p.numero_pedido);
    }
    const ordenadas = Array.from(secoes.values()).sort((x, y) => (x.flex === y.flex ? x.titulo.localeCompare(y.titulo) : x.flex ? -1 : 1));   // FLEX primeiro
    const CAP_PAG1 = 27, CAP_DEMAIS = 34, COLS = 4;
    const colunas: Linha[][] = [[]];
    const cap = () => (Math.floor((colunas.length - 1) / COLS) === 0 ? CAP_PAG1 : CAP_DEMAIS);
    const novaColuna = () => colunas.push([]);
    const garante = (precisa: number, cont?: { titulo: string; qtd: number }) => {   // abre coluna nova se não couber `precisa` linhas
      if (colunas[colunas.length - 1].length + precisa > cap() && colunas[colunas.length - 1].length > 0) { novaColuna(); if (cont) colunas[colunas.length - 1].push({ t: "secao", texto: cont.titulo, qtd: cont.qtd, cont: true }); }
    };
    for (const sec of ordenadas) {
      const total = Array.from(sec.subs.values()).reduce((n, l) => n + l.length, 0);
      garante(4);
      colunas[colunas.length - 1].push({ t: "secao", texto: sec.titulo, qtd: total });
      const varias = sec.subs.size > 1;
      let n = 0;
      const subs = Array.from(sec.subs.entries()).sort((x, y) => x[0].localeCompare(y[0]));
      for (const [nomeSub, nums] of subs) {
        if (varias) { garante(3, { titulo: sec.titulo, qtd: total }); colunas[colunas.length - 1].push({ t: "sub", texto: nomeSub, qtd: nums.length }); }
        for (const num of nums) {
          garante(1, { titulo: sec.titulo, qtd: total });
          n += 1;
          colunas[colunas.length - 1].push({ t: "pedido", texto: "", idx: n, numero: num });
        }
      }
    }
    const paginas: Linha[][][] = [];
    for (let i = 0; i < colunas.length; i += COLS) paginas.push(colunas.slice(i, i + COLS));
    const ultima = paginas[paginas.length - 1] || [];
    const altura = ultima.reduce((m, c) => Math.max(m, c.length), 0);
    const assinaturaEmPaginaPropria = paginas.length > 0 && altura + 7 > (paginas.length === 1 ? CAP_PAG1 : CAP_DEMAIS);
    return { paginas, assinaturaEmPaginaPropria };
  };

  const pedidosFiltradosPesquisa = termoPesquisaPedido.trim()
    ? pedidos.filter((p) => String(p.numero_pedido).toLowerCase().includes(termoPesquisaPedido.trim().toLowerCase()))
    : pedidos;

  const { paginas: paginasFolha, assinaturaEmPaginaPropria } = montarPaginas(pedidosFiltradosPesquisa);
  const dataBR = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

  const kpis = {
    total: pedidosFiltradosPesquisa.length,
    flex: pedidosFiltradosPesquisa.filter((p) => p.modalidade === "FLEX").length,
    agencia: pedidosFiltradosPesquisa.filter((p) => p.modalidade === "AGENCIA").length,
    correios: pedidosFiltradosPesquisa.filter((p) => p.modalidade === "CORREIOS").length,
    custoTotalFlex: pedidosFiltradosPesquisa
      .filter((p) => p.modalidade === "FLEX")
      .reduce((acc, p) => acc + Number(p.valor_frete || 0), 0),
  };

  const formatarMetodoEnvioTexto = () => {
    if (filtroModalidade === "TODOS") return "Todas as Modalidades (Flex + Agência + Correios)";
    if (filtroModalidade === "FLEX") return "Apenas Pedidos Flex";
    if (filtroModalidade === "AGENCIA") return "Apenas Pedidos Agência";
    if (filtroModalidade === "CORREIOS") return "Apenas Pedidos Correios";
    if (filtroModalidade === "AGENCIA_CORREIOS") return "Agências e Correios";
    return "Todas as Modalidades";
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans print:p-0 print:bg-white print:text-black">
      
      {/* FOLHA DA PLP (tela e impressão A4 paisagem) */}
      <style jsx global>{`
        .plp-folha { color: #111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        .plp-pagina { background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; }
        .plp-topo { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; border-bottom: 2.5px solid #111; padding-bottom: 8px; margin-bottom: 8px; }
        .plp-titulo h1 { font-size: 21px; font-weight: 900; line-height: 1.1; margin: 0; letter-spacing: .01em; }
        .plp-titulo p { font-size: 11px; color: #555; margin: 2px 0 0; }
        .plp-infos { display: flex; gap: 8px; }
        .plp-info { border: 1px solid #111; border-radius: 4px; padding: 3px 10px 4px; min-width: 120px; }
        .plp-info small { display: block; font-size: 9px; color: #555; }
        .plp-info strong { display: block; font-size: 12.5px; line-height: 1.25; }
        .plp-resumo { display: flex; gap: 8px; margin-bottom: 10px; }
        .plp-resumo div { flex: 1; border: 1px solid #111; border-radius: 4px; padding: 3px 10px; display: flex; align-items: baseline; justify-content: space-between; }
        .plp-resumo div.total { flex: 1.4; background: #111; color: #fff; }
        .plp-resumo small { font-size: 10.5px; font-weight: 700; }
        .plp-resumo b { font-size: 19px; font-weight: 900; font-variant-numeric: tabular-nums; }
        .plp-faixa { display: flex; justify-content: space-between; font-size: 10px; color: #555; border-bottom: 1px solid #111; padding-bottom: 3px; margin-bottom: 8px; }
        .plp-colunas { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; align-items: start; }
        .plp-col { border: 1px solid #111; }
        .plp-linha { display: flex; align-items: center; height: 5.4mm; font-size: 10.5px; border-bottom: .5px solid #d4d4d8; padding: 0 5px; }
        .plp-linha:last-child { border-bottom: 0; }
        .plp-secao { background: #111; color: #fff; font-weight: 800; font-size: 11px; justify-content: space-between; border-bottom: 0; }
        .plp-secao.cont { background: #52525b; font-weight: 700; }
        .plp-secao.flex { background: #111; }
        .plp-sub { background: #e4e4e7; font-weight: 700; font-size: 9.5px; justify-content: space-between; }
        .plp-par { background: #f4f4f5; }
        .plp-n { width: 8mm; text-align: right; color: #71717a; font-size: 9px; padding-right: 6px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
        .plp-num { flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 700; font-size: 11px; letter-spacing: .01em; }
        .plp-ck { width: 3.2mm; height: 3.2mm; border: 1px solid #111; border-radius: 1px; flex-shrink: 0; }
        .plp-achado { background: #e9d5ff !important; color: #3b0764; }
        .plp-vazio { padding: 28px; text-align: center; color: #71717a; font-size: 12px; font-style: italic; border: 1px dashed #cbd5e1; border-radius: 6px; }
        .plp-fecho { margin-top: 10px; break-inside: avoid; }
        .plp-total { display: flex; justify-content: space-between; align-items: center; background: #111; color: #fff; padding: 5px 10px; font-weight: 800; font-size: 12px; }
        .plp-total b { font-size: 16px; font-variant-numeric: tabular-nums; }
        .plp-assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 26px; font-size: 11px; }
        .plp-assinaturas div { border-top: 1px solid #111; padding-top: 3px; }
        .plp-assinaturas small { display: block; color: #666; font-size: 9.5px; }
        .plp-rodape { text-align: center; font-size: 8.5px; color: #888; margin-top: 8px; }
        @media print {
          @page { size: A4 landscape; margin: 6mm 8mm; }
          html, body { background: #ffffff !important; color: #000000 !important; margin: 0 !important; padding: 0 !important; }
          nav, header, button, .print-hide { display: none !important; }
          .plp-folha, .plp-secao, .plp-sub, .plp-par, .plp-resumo div.total, .plp-total, .plp-achado { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .plp-pagina { border: 0; border-radius: 0; padding: 0; margin: 0; break-after: page; page-break-after: always; }
          .plp-pagina:last-child { break-after: auto; page-break-after: auto; }
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

              {/* Filtros Integrados (Atualizado com as 5 opções de modalidade) */}
              <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end">
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

                {/* FILTRAR POR ANALISTA */}
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

                {/* CANAL */}
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

                {/* MODALIDADE (COM AS 5 OPÇÕES SOLICITADAS) */}
                <div>
                  <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Modalidade:</label>
                  <select
                    value={filtroModalidade}
                    onChange={(e) => setFiltroModalidade(e.target.value)}
                    className="w-full bg-slate-950 border border-amber-600/50 rounded-xl p-2 text-xs font-bold text-amber-300 outline-none cursor-pointer"
                  >
                    <option value="TODOS">Todas as modalidades</option>
                    <option value="FLEX">Apenas pedidos Flex</option>
                    <option value="AGENCIA">Apenas pedidos Agência</option>
                    <option value="CORREIOS">Apenas pedidos Correios</option>
                    <option value="AGENCIA_CORREIOS">Agências e Correios</option>
                  </select>
                </div>

                {/* PESQUISAR PEDIDO */}
                <div>
                  <label className="block text-[10px] font-bold text-emerald-400 uppercase mb-1">
                    🔍 Pesquisar Pedido:
                  </label>
                  <input
                    type="text"
                    value={termoPesquisaPedido}
                    onChange={(e) => setTermoPesquisaPedido(e.target.value)}
                    placeholder="N.º do pedido..."
                    className="w-full bg-slate-950 border border-emerald-500/50 rounded-xl p-2 text-xs font-mono text-emerald-300 outline-none placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Analista(s) no Papel:
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
            {/* DOCUMENTO DE IMPRESSÃO (A4 PAISAGEM): páginas com 4 colunas */}
            {/* ======================================================== */}
            <div className="folha-print-manifesto plp-folha" data-plp-folha>
              {(() => {
                const totalPag = paginasFolha.length + (assinaturaEmPaginaPropria ? 1 : 0);
                const termo = termoPesquisaPedido.trim().toLowerCase();
                const fecho = (
                  <div className="plp-fecho" data-plp-fecho>
                    <div className="plp-total"><span>Total de volumes conferidos</span><b>{kpis.total} pacotes</b></div>
                    <div className="plp-assinaturas">
                      <div><strong>Colaborador(es) do canal: {analistaDocumento || "Expedição"}</strong><small>Assinatura e data</small></div>
                      <div><strong>Responsável pela embalagem</strong><small>Assinatura e data</small></div>
                    </div>
                    <p className="plp-rodape">Documento para controle interno · PLP de envios Best Fit</p>
                  </div>
                );
                const faixa = (n: number) => (
                  <div className="plp-faixa"><span>PLP de envios · {filtroDataInicio === filtroDataFim ? dataBR(filtroDataInicio) : `${dataBR(filtroDataInicio)} a ${dataBR(filtroDataFim)}`} · {formatarMetodoEnvioTexto()}</span><span>Página {n} de {totalPag}</span></div>
                );
                if (paginasFolha.length === 0) {
                  return <div className="plp-pagina"><div className="plp-vazio">Nenhum pedido encontrado para a pesquisa ou filtros selecionados.</div></div>;
                }
                return (
                  <>
                    {paginasFolha.map((cols, pIdx) => (
                      <div key={pIdx} className="plp-pagina" data-plp-pagina={pIdx + 1}>
                        {pIdx === 0 ? (
                          <>
                            <div className="plp-topo">
                              <div className="plp-titulo">
                                <h1>PLP de envios · Best Fit</h1>
                                <p>Controle de expedição e autorização de envio</p>
                              </div>
                              <div className="plp-infos">
                                <div className="plp-info"><small>Data de envio</small><strong>{filtroDataInicio === filtroDataFim ? dataBR(filtroDataInicio) : `${dataBR(filtroDataInicio)} a ${dataBR(filtroDataFim)}`}</strong></div>
                                <div className="plp-info"><small>Modalidade</small><strong>{formatarMetodoEnvioTexto()}</strong></div>
                                <div className="plp-info"><small>Colaborador(es) do canal</small><strong>{analistaDocumento || "Expedição"}</strong></div>
                              </div>
                            </div>
                            <div className="plp-resumo" data-plp-resumo>
                              <div className="total"><small>Total de volumes</small><b>{kpis.total}</b></div>
                              {kpis.flex > 0 && <div><small>Flex</small><b>{kpis.flex}</b></div>}
                              {kpis.agencia > 0 && <div><small>Agência</small><b>{kpis.agencia}</b></div>}
                              {kpis.correios > 0 && <div><small>Correios</small><b>{kpis.correios}</b></div>}
                            </div>
                          </>
                        ) : faixa(pIdx + 1)}
                        <div className="plp-colunas">
                          {cols.map((col, cIdx) => (
                            <div key={cIdx} className="plp-col">
                              {col.map((l, lIdx) => {
                                if (l.t === "secao") return <div key={lIdx} className={`plp-linha plp-secao${l.cont ? " cont" : ""}${l.texto === "FLEX" ? " flex" : ""}`} data-plp-secao={l.texto}><span>{l.texto}{l.cont ? " (cont.)" : ""}</span><span>{l.qtd}</span></div>;
                                if (l.t === "sub") return <div key={lIdx} className="plp-linha plp-sub"><span>{l.texto}</span><span>{l.qtd}</span></div>;
                                const achou = !!termo && String(l.numero).toLowerCase().includes(termo);
                                return (
                                  <div key={lIdx} className={`plp-linha${(l.idx || 0) % 2 === 0 ? " plp-par" : ""}${achou ? " plp-achado" : ""}`} data-plp-pedido>
                                    <span className="plp-n">{l.idx}</span><span className="plp-num">{l.numero}</span><span className="plp-ck" />
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                        {pIdx === paginasFolha.length - 1 && !assinaturaEmPaginaPropria && fecho}
                      </div>
                    ))}
                    {assinaturaEmPaginaPropria && <div className="plp-pagina" data-plp-pagina={totalPag}>{faixa(totalPag)}{fecho}</div>}
                  </>
                );
              })()}
            </div>

            {/* TABELA DE AUDITORIA INDIVIDUAL EM TELA */}
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3 print:hidden">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">Auditoria e exclusão de pedidos ({pedidosFiltradosPesquisa.length})</h3>
                  <p className="text-[11px] text-slate-500">Use os filtros acima (data, canal, modalidade ou pesquisa), marque os pedidos e exclua de uma vez.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2" data-plp-acoes-massa>
                  <button type="button" data-plp-selecionar-todos onClick={() => setSelecionados(new Set(pedidosFiltradosPesquisa.map((p) => p.id)))} disabled={pedidosFiltradosPesquisa.length === 0}
                    className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-slate-200 text-[11px] font-bold py-1.5 px-3 rounded-lg cursor-pointer">
                    Selecionar todos os {pedidosFiltradosPesquisa.length} do filtro
                  </button>
                  {selecionados.size > 0 && (
                    <button type="button" data-plp-limpar-selecao onClick={() => setSelecionados(new Set())} className="text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer px-2">Limpar seleção</button>
                  )}
                  <button type="button" data-plp-excluir-selecionados onClick={handleExcluirSelecionados} disabled={selecionados.size === 0 || loading}
                    className="bg-rose-950/80 hover:bg-rose-900 disabled:opacity-40 text-rose-300 border border-rose-800 text-[11px] font-bold py-1.5 px-3 rounded-lg cursor-pointer">
                    🗑️ Excluir selecionados ({selecionados.size})
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-2 text-center w-8">
                        <input type="checkbox" data-plp-marcar-tudo aria-label="Selecionar todos do filtro" className="cursor-pointer accent-rose-500"
                          checked={pedidosFiltradosPesquisa.length > 0 && selecionados.size === pedidosFiltradosPesquisa.length}
                          onChange={(e) => setSelecionados(e.target.checked ? new Set(pedidosFiltradosPesquisa.map((p) => p.id)) : new Set())} />
                      </th>
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
                    {pedidosFiltradosPesquisa.map((item, idx) => {
                      const matchItem = termoPesquisaPedido.trim() && String(item.numero_pedido).toLowerCase().includes(termoPesquisaPedido.trim().toLowerCase());
                      return (
                        <tr key={item.id} data-plp-linha-auditoria className={`transition-colors ${selecionados.has(item.id) ? "bg-rose-950/30" : matchItem ? "bg-purple-950/60 font-bold" : "hover:bg-slate-800/40"}`}>
                          <td className="p-2 text-center"><input type="checkbox" data-plp-marcar aria-label={`Selecionar pedido ${item.numero_pedido}`} className="cursor-pointer accent-rose-500" checked={selecionados.has(item.id)} onChange={() => alternarSelecionado(item.id)} /></td>
                          <td className="p-2 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-2 font-mono text-slate-300">{item.data_envio}</td>
                          <td className={`p-2 font-mono ${matchItem ? "text-purple-300 underline" : "text-white font-bold"}`}>{item.numero_pedido}</td>
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
                      );
                    })}
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
                    Ao salvar, as alterações ficam gravadas no banco de dados e serão aplicadas para <strong>todos os usuários</strong>.
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