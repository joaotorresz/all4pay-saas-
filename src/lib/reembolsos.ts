/**
 * Reembolsos — caso especializado do funil PAGAR. Reusa alçada (`aprovacoes.ts`),
 * execução (Central, via `movement` de saída) e OCR (`lerDocumento`). Demo-safe:
 *  • demo → localStorage; colaborador entra como `party` no imported store (N3);
 *  • live → tabela `public.reembolsos` (RLS) + colaborador resolvido em `parties`.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { isoDay } from "@/lib/aggregations";
import { primeiraContaAtiva } from "@/lib/conta-padrao";
import { appendImported } from "@/lib/imported";
import { criarSolicitacao, listSolicitacoes, hydrateAprovacoes, autorizarMovimento } from "@/lib/aprovacoes";
import type { Movement, Party } from "@/lib/types";
import { ler, gravar as gravarOrg } from "@/lib/store-org";
import { TETO_LINHAS, semAmostra } from "@/lib/supabase/consulta";
import { reportar } from "@/lib/erros";

export interface ItemReembolso { descricao: string; valor: number; data: string; categoria: string }
export type StatusReembolso = "em_aprovacao" | "aprovado" | "rejeitado" | "a_pagar";

export interface Reembolso {
  id: string;
  colaborador: string;
  colaboradorId: string; // party real (N3)
  chavePix: string;
  itens: ItemReembolso[];
  total: number;
  justificativa?: string;
  status: StatusReembolso;
  solicitacaoId: string;
  movimentos: string[];
  criadoEm: string;
}

const KEY = "a4p_reembolsos";
let cache: Reembolso[] | undefined;
let hydrated = false;
function loadLocal(): Reembolso[] {
  if (cache) return cache;
  if (typeof window === "undefined") { cache = []; return cache; }
  cache = ler(KEY, []);
  return cache!;
}
/**
 * ⚠️ Só a DEMONSTRAÇÃO grava aqui. Em live este arquivo lê e escreve a tabela,
 * e a chave de estado ficou congelada em `store-org` — as duas moradas do
 * mesmo dado eram o defeito, não a redundância.
 */
function saveLocal(list: Reembolso[]) {
  if (!isDemo) return;  // congelada em live: a casa do dado é a tabela
  cache = list;
  gravarOrg(KEY, list);
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

type Embed = { name: string } | { name: string }[] | null | undefined;
const nomeEmbed = (p: Embed) => (Array.isArray(p) ? (p[0]?.name ?? "Colaborador") : (p?.name ?? "Colaborador"));
interface ReembolsoRow {
  id: string; colaborador_id: string | null; approval_id: string | null; movement_id: string | null;
  itens: ItemReembolso[]; amount: number; pix_key: string | null;
  status: "rascunho" | "solicitado" | "em_aprovacao" | "aprovado" | "rejeitado" | "pago"; created_at: string;
  parties?: Embed;
}
function fromRow(r: ReembolsoRow): Reembolso {
  const status: StatusReembolso = r.status === "rejeitado" ? "rejeitado"
    : r.status === "pago" || (r.status === "aprovado" && r.movement_id) ? "a_pagar"
      : r.status === "aprovado" ? "aprovado" : "em_aprovacao";
  return {
    id: r.id, colaborador: nomeEmbed(r.parties), colaboradorId: r.colaborador_id ?? "",
    chavePix: r.pix_key ?? "", itens: r.itens ?? [], total: Number(r.amount), status,
    solicitacaoId: r.approval_id ?? "", movimentos: r.movement_id ? [r.movement_id] : [],
    criadoEm: r.created_at,
  };
}

export async function hydrateReembolsos(force = false): Promise<void> {
  if (hydrated && !force) return;
  if (isDemo) { cache = loadLocal(); hydrated = true; return; }
  try {
    // ⚠️ O `error` do PostgREST VOLTA, não é lançado: sem esta checagem uma
    // leitura recusada virava "Nenhum reembolso aqui" — a lista vazia com cara
    // de lista vazia de verdade.
    const { data, error } = await createClient().from("reembolsos")
      .select("id,colaborador_id,approval_id,movement_id,itens,amount,pix_key,status,created_at,parties(name)")
      .order("created_at", { ascending: false }).limit(TETO_LINHAS);
    if (error) throw error;
    cache = ((data ?? []) as unknown as ReembolsoRow[]).map(fromRow);
    hydrated = true;
  } catch (e) {
    reportar("financeiro.reembolsos", e, "os reembolsos não carregam", true); cache = cache ?? []; }
}

export function listReembolsos(): Reembolso[] {
  return [...(cache ?? [])].sort((a, b) => (b.criadoEm < a.criadoEm ? -1 : 1));
}

/** N3 — resolve o colaborador como `party` real. */
async function resolverColaborador(nome: string): Promise<{ id: string; party?: Party }> {
  if (isDemo) {
    const id = `colab-${slug(nome)}`;
    return { id, party: { id, type: "pf", name: nome, is_supplier: true } as Party };
  }
  const s = createClient();
  // ⚠️ `eq`, não `ilike`: o nome é texto livre, e `%`/`_` nele viram curinga —
  // "Ana_Lima" casaria com "Ana Lima", "AnaXLima"… e o reembolso iria para o
  // cadastro de outra pessoa.
  const { data: achado, error: e0 } = await s.from("parties").select("id").eq("name", nome).limit(1).maybeSingle();
  if (e0) throw new Error(e0.message);
  if (achado?.id) return { id: (achado as { id: string }).id };
  const { data: criado, error: e1 } = await s.from("parties").insert({ type: "pf", name: nome, is_supplier: true }).select("id").single();
  if (e1) throw new Error(e1.message);
  return { id: (criado as { id: string } | null)?.id ?? "" };
}

export interface NovoReembolso { colaborador: string; chavePix: string; itens: ItemReembolso[]; justificativa?: string }

export async function solicitarReembolso(n: NovoReembolso): Promise<Reembolso> {
  await hydrateReembolsos();
  const total = n.itens.reduce((s, it) => s + it.valor, 0);
  const localId = `reemb-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const { id: colaboradorId } = await resolverColaborador(n.colaborador);
  const sol = await criarSolicitacao({
    objetoRef: localId, tipo: "reembolso", beneficiario: n.colaborador, valor: total,
    categoria: n.itens[0]?.categoria, justificativa: n.justificativa, solicitante: n.colaborador,
  });
  const status: StatusReembolso = sol.statusFinal === "aprovada" ? "aprovado" : "em_aprovacao";
  const base: Reembolso = {
    id: localId, colaborador: n.colaborador, colaboradorId, chavePix: n.chavePix, itens: n.itens, total,
    justificativa: n.justificativa, status, solicitacaoId: sol.id, movimentos: [], criadoEm: new Date().toISOString(),
  };
  if (isDemo) { saveLocal([base, ...loadLocal()]); return base; }
  /*
   * ⚠️ SEM A SOLICITAÇÃO NO BANCO, O REEMBOLSO NUNCA SERIA APROVADO. A alçada
   * grava em `approvals` e devolve o id do banco; quando a gravação dela falha,
   * o id que volta é o local ("sol-…"), e o reembolso nasceria com
   * `approval_id` nulo — preso em "Em aprovação" para sempre, sem ninguém na
   * fila para decidir. Melhor recusar agora, com o motivo, do que prometer uma
   * aprovação que não pode acontecer.
   */
  if (!/^[0-9a-f-]{36}$/i.test(sol.id)) {
    throw new Error("A solicitação de aprovação não foi gravada, então o reembolso não teria quem o aprovasse. Tente de novo; se persistir, fale com o suporte.");
  }
  const { data, error } = await createClient().from("reembolsos").insert({
    colaborador_id: colaboradorId || null, approval_id: sol.id,
    itens: n.itens, amount: total, pix_key: n.chavePix || null,
    status: status === "aprovado" ? "aprovado" : "em_aprovacao",
  }).select("id,colaborador_id,approval_id,movement_id,itens,amount,pix_key,status,created_at").single();
  // ⚠️ A recusa SOBE. Antes, `data` nulo caía no objeto local e a tela listava
  // um reembolso que o banco não tinha — ele sumia no recarregar.
  if (error) throw error;
  const saved = fromRow({ ...(data as ReembolsoRow), parties: { name: n.colaborador } });
  cache = [saved, ...(cache ?? [])];
  return saved;
}

/**
 * Quando a alçada aprova, gera os movements de saída (1 por item) e marca a_pagar.
 *
 * ⚠️ **A FALHA DE UM REEMBOLSO NÃO PODE VIRAR "A PAGAR".** Antes, o `insert`
 * dos títulos em produção não olhava o `error`: recusado pelo banco (mês
 * fechado, sem conta, sem permissão), a lista vinha vazia e o reembolso era
 * marcado "A pagar (na Central)" sem um único título na Central. O colaborador
 * esperava um Pix que ninguém ia ver. Agora cada falha fica no reembolso (ele
 * continua "Aprovado", e a próxima sincronização tenta de novo) e volta para a
 * tela com a mensagem do banco.
 */
export async function sincronizarReembolsos(): Promise<{ gerados: number; falhas: string[] }> {
  await hydrateAprovacoes();
  await hydrateReembolsos();
  const statusDe = new Map(listSolicitacoes().map((s) => [s.id, s.statusFinal]));
  let gerados = 0;
  const falhas: string[] = [];
  const list = cache ?? [];
  for (const r of list) {
    const st = statusDe.get(r.solicitacaoId);
    if (st === "rejeitada" && r.status !== "rejeitado") { r.status = "rejeitado"; }
    else if (st === "aprovada" && r.status !== "a_pagar" && !r.movimentos.length) {
      let gerados_: { id: string; valor: number }[];
      try {
        gerados_ = await gerarPagamento(r);
      } catch (e) {
        reportar("financeiro.reembolsos", e, "o reembolso aprovado não virou título a pagar");
        const msg = (e as { message?: string } | null)?.message ?? "o banco recusou a gravação";
        falhas.push(`${r.colaborador}: ${msg}`);
        r.status = "aprovado";
        continue;
      }
      r.movimentos = gerados_.map((g) => g.id);
      r.status = "a_pagar";
      gerados++;
      // N7: o reembolso já passou pela alçada — pré-autoriza cada movimento pelo
      // SEU próprio valor (não por posição, que no live pode desalinhar do item).
      for (const g of gerados_) await autorizarMovimento(g.id, g.valor, r.colaborador);
      if (!isDemo) {
        const { error } = await createClient().from("reembolsos")
          .update({ status: "aprovado", movement_id: r.movimentos[0] ?? null }).eq("id", r.id);
        // Os títulos já existem (e têm chave própria, então a próxima tentativa
        // não os duplica); o que falhou foi o carimbo no reembolso — reportado.
        if (error) reportar("financeiro.reembolsos", error, "o reembolso não registrou o título que gerou");
      }
    } else if (st === "aprovada" && r.status === "em_aprovacao") { r.status = "aprovado"; }
  }
  if (isDemo) saveLocal([...list]); else cache = [...list];
  return { gerados, falhas };
}

/** A chave de cada título do reembolso — o que torna a nova tentativa idempotente. */
export const referenciaDoItem = (reembolsoId: string, item: number): string => `reembolso:${reembolsoId}:${item}`;

/** Cada item vira um movement de saída (party = colaborador real — N3).
 *  Devolve {id, valor} pareado: no live o insert().select() NÃO garante a ordem
 *  das linhas retornadas, então a pré-autorização precisa do valor do PRÓPRIO
 *  movimento — não pode assumir movimentos[k] ↔ itens[k]. */
async function gerarPagamento(r: Reembolso): Promise<{ id: string; valor: number }[]> {
  const hoje = isoDay(new Date());
  const out: { id: string; valor: number }[] = [];
  if (isDemo) {
    const party: Party = { id: r.colaboradorId, type: "pf", name: r.colaborador, is_supplier: true } as Party;
    r.itens.forEach((it, i) => {
      const id = `${r.id}-mv${i}`;
      const movement: Movement = {
        id, account_id: "", type: "saida", status: "pendente", category: it.categoria,
        amount: it.valor, party_id: r.colaboradorId, due_date: hoje, paid_date: null, reconciled: false,
        description: `Reembolso · ${r.colaborador} · ${it.descricao}`,
      } as Movement;
      appendImported({ movement, party });
      out.push({ id, valor: it.valor });
    });
    return out;
  }
  const supabase = createClient();
  const refs = r.itens.map((_, i) => referenciaDoItem(r.id, i));
  // ⚠️ Idempotente: se uma tentativa anterior gravou os títulos e falhou depois
  // (no carimbo do reembolso), a nova tentativa os REENCONTRA pela chave em vez
  // de pagar o colaborador duas vezes.
  const { data: ja, error: e0 } = await semAmostra(supabase
    .from("movements").select("id,amount")).in("reference_code", refs).limit(TETO_LINHAS);
  if (e0) throw new Error(e0.message);
  if ((ja ?? []).length > 0) {
    for (const row of ja as { id: string; amount: number }[]) out.push({ id: row.id, valor: Number(row.amount) });
    return out;
  }
  const accId = await primeiraContaAtiva(supabase);
  // ⚠️ Sem conta, NÃO há título — e isso é dito, não engolido. Antes a função
  // devolvia a lista vazia e o reembolso virava "A pagar" sem nada a pagar.
  if (!accId) throw new Error("Cadastre uma conta bancária: o reembolso precisa dizer de qual conta o Pix sai.");
  const rows = r.itens.map((it, i) => ({
    // ⚠️ ONDA 5: o reembolso é lançado por uma pessoa, não importado.
    origem: "manual" as const,
    especie: "titulo" as const,
    account_id: accId, type: "saida", situacao: "previsto", category: it.categoria, amount: it.valor,
    party_id: r.colaboradorId || null, due_date: hoje, paid_date: null, reconciled: false,
    // A competência é o dia da DESPESA do colaborador, não o dia do reembolso.
    competence_date: it.data || hoje,
    reference_code: refs[i],
    description: `Reembolso · ${r.colaborador} · ${it.descricao}`,
  }));
  const { data, error } = await supabase.from("movements").insert(rows).select("id,amount").limit(TETO_LINHAS);
  if (error) throw error;
  for (const row of (data ?? []) as { id: string; amount: number }[]) out.push({ id: row.id, valor: Number(row.amount) });
  return out;
}

/**
 * Limpa a lista de reembolsos da DEMONSTRAÇÃO.
 *
 * ⚠️ Em live não faz nada, de propósito: a casa do dado é a tabela, e limpar
 * a chave daria a impressão de ter apagado uma fila que continua inteira no
 * banco. Apagar de verdade é operação de tabela, com confirmação e volta —
 * não uma função exportada que qualquer tela pode chamar.
 */
export function clearReembolsos(): void { if (!isDemo) return; saveLocal([]); }
