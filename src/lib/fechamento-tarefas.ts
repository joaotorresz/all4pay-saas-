/**
 * O checklist de fechamento — a MORADA ÚNICA das tarefas.
 *
 *  • live → `close_tasks` (migration 20260930200000). Quem autoriza é o gatilho
 *    `close_tasks_maquina`: segregação, carimbos e membros. A tela lê a mensagem
 *    real do banco quando ele recusa — nunca "tente novamente".
 *  • demo → o navegador (`a4p_close_tasks`, formato v2), com a MESMA regra de
 *    `core/close/checklist` aplicada aqui, já que não há banco para recusar.
 *
 * ⚠️ Nada aqui engole erro. Um escritor de estado de fechamento que falha em
 * silêncio mostra "revisada" numa tarefa que o banco nunca aceitou — e é essa
 * marca que decide se o mês pode travar.
 */
import { ler as lerOrg, gravar as gravarOrg } from "@/lib/store-org";
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { TETO_LINHAS } from "@/lib/supabase/consulta";
import { loadCompany } from "@/lib/company";
import { lockPeriod, unlockPeriod, isPeriodLocked } from "@/lib/close";
import {
  tarefasAGerar, concluir as concluirCore, reabrir as reabrirCore, revisar as revisarCore,
  desfazerRevisao as desfazerCore, atribuir as atribuirCore, podeTravar, mesAnteriorDe,
  type TarefaFechamento, type MembroFechamento, type StatusTarefa, type ResultadoAcao,
} from "@/core/close/checklist";

/* ========================================================================== */
/* Demonstração — o navegador                                                  */
/* ========================================================================== */

const KEY = "a4p_close_tasks";

/** O usuário da demonstração e a contadora de exemplo — os dois habilitados a revisar. */
export const DEMO_EU = "demo-eu";
export const DEMO_CONTADORA = "demo-contadora";

function lerDemo(): TarefaFechamento[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = lerOrg<{ versao?: number; tarefas?: TarefaFechamento[] } | null>(KEY, null);
    // ⚠️ O formato antigo ({ mes: { tarefa: true } }) não tinha dono nem
    // carimbo; ele é ignorado, não convertido — converter inventaria quem fez.
    return raw?.versao === 2 && Array.isArray(raw.tarefas) ? raw.tarefas : [];
  } catch { return []; }
}
function gravarDemo(ts: TarefaFechamento[]): void {
  // ⚠️ Sem try/catch: cota estourada tem de aparecer, não virar "salvo".
  // Chave CONGELADA (`store-org`): a morada em produção é `close_tasks`, então
  // ela só toca o navegador na demonstração — nunca vira cópia em `org_state`.
  gravarOrg(KEY, { versao: 2, tarefas: ts });
}
const idDemo = () => globalThis.crypto?.randomUUID?.() ?? `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/* ========================================================================== */
/* Membros e quem está agindo                                                  */
/* ========================================================================== */

export async function membrosDoFechamento(): Promise<MembroFechamento[]> {
  if (isDemo) {
    const c = loadCompany() ?? {};
    const participantes = ((c.participantes ?? []) as Array<{ id?: string; nome?: string; papel?: string }>)
      .filter((p) => p.id && p.nome)
      .map((p) => ({ id: String(p.id), nome: String(p.nome), podeRevisar: p.papel === "administrador" }));
    return [
      { id: DEMO_EU, nome: "Você (titular)", podeRevisar: true },
      { id: DEMO_CONTADORA, nome: "Marina Lopes · contadora", podeRevisar: true },
      ...participantes,
    ];
  }
  const s = createClient();
  // ⚠️ "Pode revisar" sai da MATRIZ do servidor (`role_permissions`, ação
  // `fechar`) — a mesma que o gatilho consulta. Uma lista de papéis escrita
  // aqui divergiria no primeiro ajuste da matriz.
  const [{ data: membros, error: e1 }, { data: papeis, error: e2 }] = await Promise.all([
    s.rpc("org_members"),
    s.from("role_permissions").select("papel").eq("acao", "fechar").limit(TETO_LINHAS),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  const fecham = new Set(((papeis ?? []) as Array<{ papel: string }>).map((p) => p.papel));
  return ((membros ?? []) as Array<{ user_id: string; role: string; display_name?: string | null; email?: string | null }>)
    .map((m) => ({ id: String(m.user_id), nome: m.display_name || m.email || "Membro", podeRevisar: fecham.has(m.role) }));
}

/** Quem está agindo. Em produção é a sessão; na demonstração, o titular. */
export async function atorAtual(): Promise<string | null> {
  if (isDemo) return DEMO_EU;
  const { data } = await createClient().auth.getUser();
  return data.user?.id ?? null;
}

/* ========================================================================== */
/* Leitura (com a geração idempotente do mês)                                  */
/* ========================================================================== */

type Linha = {
  id: string; mes: string | null; chave: string | null; title: string; descricao: string | null; href: string | null;
  ordem: number | null; responsavel_id: string | null; revisor_id: string | null; prazo: string | null;
  status: string; concluida_por: string | null; concluida_em: string | null; revisada_por: string | null;
  revisada_em: string | null; autorrevisao: boolean | null; autorrevisao_motivo: string | null;
};
const COLUNAS = "id,mes,chave,title,descricao,href,ordem,responsavel_id,revisor_id,prazo,status,concluida_por,concluida_em,revisada_por,revisada_em,autorrevisao,autorrevisao_motivo";

const deLinha = (r: Linha): TarefaFechamento => ({
  id: r.id, mes: String(r.mes ?? "").slice(0, 7), chave: r.chave ?? r.id, titulo: r.title,
  descricao: r.descricao ?? "", href: r.href ?? "", ordem: r.ordem ?? 0,
  responsavelId: r.responsavel_id, revisorId: r.revisor_id, prazo: r.prazo ? String(r.prazo).slice(0, 10) : null,
  status: (["pending", "review", "done"].includes(r.status) ? r.status : "pending") as StatusTarefa,
  concluidaPor: r.concluida_por, concluidaEm: r.concluida_em, revisadaPor: r.revisada_por, revisadaEm: r.revisada_em,
  autorrevisao: !!r.autorrevisao, autorrevisaoMotivo: r.autorrevisao_motivo,
});

const ordenar = (ts: TarefaFechamento[]) => ts.sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo));

/**
 * As tarefas do mês — criando, na primeira abertura, as do modelo que faltam.
 * O responsável e o revisor são herdados do mês anterior (`tarefasAGerar`).
 */
export async function tarefasDoMes(mes: string): Promise<TarefaFechamento[]> {
  // ⚠️ Mês travado não GERA tarefa: a lista de um mês entregue não cresce
  // depois da entrega, e o banco recusa a inserção (A4P-FECHAMENTO-MES-TRAVADO).
  // Sem esta conferência, abrir um mês travado antes do checklist existir
  // criaria cinco tarefas "a fazer" congeladas para sempre.
  const travado = isPeriodLocked(mes);
  if (isDemo) {
    const todas = lerDemo();
    const novas = travado ? [] : tarefasAGerar(mes, todas).map((t) => ({ ...t, id: idDemo() }));
    if (novas.length) gravarDemo([...todas, ...novas]);
    return ordenar([...todas, ...novas].filter((t) => t.mes === mes));
  }
  const s = createClient();
  const meses = [`${mes}-01`, `${mesAnteriorDe(mes)}-01`];
  const { data, error } = await s.from("close_tasks").select(COLUNAS).in("mes", meses).limit(TETO_LINHAS);
  if (error) throw new Error(error.message);
  const existentes = ((data ?? []) as Linha[]).map(deLinha);
  const novas = travado ? [] : tarefasAGerar(mes, existentes);
  if (novas.length) {
    // ⚠️ `ignoreDuplicates`: dois computadores abrindo o mês ao mesmo tempo
    // tentam criar as mesmas tarefas, e o índice (org_id, mes, chave) deixa
    // passar uma. Um `insert` puro derrubaria o lote inteiro na colisão.
    const { error: e2 } = await s.from("close_tasks").upsert(
      novas.map((t) => ({
        title: t.titulo, kind: "standard", mes: `${t.mes}-01`, chave: t.chave, descricao: t.descricao,
        href: t.href, ordem: t.ordem, responsavel_id: t.responsavelId, revisor_id: t.revisorId, prazo: t.prazo,
      })),
      { onConflict: "org_id,mes,chave", ignoreDuplicates: true },
    );
    if (e2) throw new Error(e2.message);
    const { data: d2, error: e3 } = await s.from("close_tasks").select(COLUNAS).eq("mes", `${mes}-01`).limit(TETO_LINHAS);
    if (e3) throw new Error(e3.message);
    return ordenar(((d2 ?? []) as Linha[]).map(deLinha));
  }
  return ordenar(existentes.filter((t) => t.mes === mes));
}

/* ========================================================================== */
/* Escrita                                                                     */
/* ========================================================================== */

export type Acao =
  | { tipo: "concluir" } | { tipo: "reabrir" } | { tipo: "revisar" } | { tipo: "desfazer" }
  | { tipo: "atribuir"; responsavelId?: string | null; revisorId?: string | null; prazo?: string | null };

/**
 * Aplica uma ação. Em demo, pela regra pura; em produção, pelo banco (o
 * gatilho decide) — e a mensagem do banco sobe inteira, com a dica.
 */
export async function aplicarAcao(
  tarefa: TarefaFechamento, acao: Acao, ator: string, membros: readonly MembroFechamento[],
): Promise<TarefaFechamento> {
  if (isDemo) {
    // O mesmo congelamento do gatilho: mês travado não muda o checklist.
    if (isPeriodLocked(tarefa.mes)) throw new Error(`${tarefa.mes.split("-").reverse().join("/")} está travado; o checklist dele não muda mais. Reabra o período (com motivo) para alterar.`);
    const agora = new Date().toISOString();
    let r: ResultadoAcao;
    switch (acao.tipo) {
      case "concluir": r = concluirCore(tarefa, ator, agora); break;
      case "reabrir": r = reabrirCore(tarefa); break;
      case "revisar": r = revisarCore(tarefa, ator, membros, agora); break;
      case "desfazer": r = desfazerCore(tarefa, ator, membros); break;
      default: {
        const { tipo: _t, ...mud } = acao; void _t;
        r = atribuirCore(tarefa, mud, membros);
      }
    }
    if (!r.ok) throw new Error(r.erro);
    const nova = r.tarefa;
    gravarDemo(lerDemo().map((t) => (t.id === nova.id ? nova : t)));
    return nova;
  }
  const patch: Record<string, unknown> =
    acao.tipo === "concluir" ? { status: "review" }
    : acao.tipo === "reabrir" ? { status: "pending" }
    : acao.tipo === "revisar" ? { status: "done" }
    : acao.tipo === "desfazer" ? { status: "review" }
    : {
        ...(acao.responsavelId !== undefined ? { responsavel_id: acao.responsavelId } : {}),
        ...(acao.revisorId !== undefined ? { revisor_id: acao.revisorId } : {}),
        ...(acao.prazo !== undefined ? { prazo: acao.prazo } : {}),
      };
  const { data, error } = await createClient().from("close_tasks").update(patch).eq("id", tarefa.id).select(COLUNAS).single();
  if (error) throw new Error(error.hint ? `${error.message} ${error.hint}` : error.message);
  return deLinha(data as Linha);
}

/**
 * Trava (ou reabre) o mês. Com tarefa aberta, a trava exige MOTIVO — a mesma
 * regra do gatilho `accounting_periods_trava`. Reabrir sempre exige motivo
 * (0030). A trava local só é espelhada DEPOIS que o banco aceitou.
 */
export async function travarMes(
  mes: string, travar: boolean, motivo: string | null, tarefas: readonly TarefaFechamento[],
): Promise<void> {
  if (isDemo) {
    if (travar) {
      const p = podeTravar(tarefas, motivo);
      if (!p.pode) throw new Error(p.erro);
      lockPeriod(mes);
    } else {
      if (!(motivo ?? "").trim()) throw new Error("Reabrir um mês fechado exige motivo.");
      unlockPeriod(mes);
    }
    return;
  }
  const { error } = await createClient().rpc("fechar_periodo", { p_mes: mes, p_fechar: travar, p_motivo: motivo?.trim() || null });
  if (error) throw new Error(error.hint ? `${error.message} ${error.hint}` : error.message);
  if (travar) lockPeriod(mes); else unlockPeriod(mes);
}
