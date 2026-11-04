// Envio dos alertas de tarefa (roda no servidor, chamado a cada minuto pelo relógio do banco).
import { agoraSP, concluiu, deveAlertar, refAlerta, hhmm, type Conclusao } from "./tarefas";

export interface PayloadPush { titulo: string; corpo: string; tag: string; url: string }
export type EnviarPush = (assinatura: { endpoint: string; p256dh: string; auth: string }, payload: PayloadPush) => Promise<{ ok: boolean; gone?: boolean; erro?: string }>;

/** Lê todas as linhas de uma tabela (o PostgREST devolve no máximo 1000 por vez). */
async function lerTudo(supabase: any, tabela: string, colunas = "*") {
  const todas: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from(tabela).select(colunas).order("id", { ascending: true }).range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    if (!data || data.length === 0) break;
    todas.push(...data);
    if (data.length < 1000) break;
  }
  return todas;
}

export async function processarAlertas(supabase: any, enviar: EnviarPush, agora: Date = new Date()) {
  const hoje = agoraSP(agora).data;
  const [tarefas, conclusoes, assinaturas] = await Promise.all([
    lerTudo(supabase, "home_tarefas"),
    lerTudo(supabase, "home_tarefas_conclusoes"),
    lerTudo(supabase, "push_assinaturas"),
  ]);

  const porEmail = new Map<string, any[]>();
  assinaturas.forEach((a) => {
    const k = String(a.email).trim().toLowerCase();
    porEmail.set(k, [...(porEmail.get(k) || []), a]);
  });

  const resumo = { tarefasComAviso: 0, candidatos: 0, enviados: 0, assinaturasRemovidas: 0, semAssinatura: 0, erros: [] as string[] };

  for (const t of tarefas) {
    if (t.legado || t.aviso_minutos === null || t.aviso_minutos === undefined || !t.hora_entrega) continue;
    resumo.tarefasComAviso++;
    for (const emailBruto of t.responsaveis || []) {
      const email = String(emailBruto).trim().toLowerCase();
      const feita = concluiu(t, email, conclusoes as Conclusao[], hoje);
      const alerta = deveAlertar(t, feita, agora);
      if (!alerta) continue;
      resumo.candidatos++;

      const subs = porEmail.get(email) || [];
      if (subs.length === 0) { resumo.semAssinatura++; continue; }

      // trava anti-repetição: só quem conseguir inserir a linha envia (unique tarefa+email+referência)
      const referencia = refAlerta(t, hoje);
      const { data: inserido, error: eIns } = await supabase
        .from("push_alertas_enviados")
        .upsert({ tarefa_id: t.id, email, referencia }, { onConflict: "tarefa_id,email,referencia", ignoreDuplicates: true })
        .select();
      if (eIns) { resumo.erros.push(`trava ${t.id}/${email}: ${eIns.message}`); continue; }
      if (!inserido || inserido.length === 0) continue;   // já enviado

      const corpo = alerta.quando === "antes"
        ? `Vence em ${alerta.minutosRestantes <= 1 ? "1 minuto" : alerta.minutosRestantes + " minutos"} (${hhmm(t.hora_entrega)}).`
        : `Venceu às ${hhmm(t.hora_entrega)} e ainda não foi concluída.`;
      const payload: PayloadPush = { titulo: `📝 ${t.titulo}`, corpo, tag: `tarefa-${t.id}-${referencia}`, url: "/inicio" };

      for (const sub of subs) {
        const r = await enviar({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
        if (r.ok) resumo.enviados++;
        else if (r.gone) {
          await supabase.from("push_assinaturas").delete().eq("endpoint", sub.endpoint);
          resumo.assinaturasRemovidas++;
        } else resumo.erros.push(`${email}: ${r.erro}`);
      }
    }
  }
  return resumo;
}
