/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LINHAS DO BANCO → RiskInput — o MAPEADOR ÚNICO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Três caminhos leem `movements` e entregam o `RiskInput` que os motores
 * consomem: a tela (`getRiscoInput`, pela sessão do usuário), a consolidação
 * multiempresa (`getRiscoInputPorOrg`, pela RPC `org_movements`) e o runner de
 * automações (pela RPC `automacao_contexto`, sem sessão).
 *
 * ⚠️ **Eram duas cópias do mapeamento, e a terceira ia nascer.** Cada uma
 * decidia sozinha de onde vem o nome da categoria, o que fazer com a data nula,
 * se a competência e a descrição chegam aos motores. Duas cópias divergem na
 * primeira coluna nova — e aí o resumo do caixa que o dono recebe por e-mail
 * discorda da Visão geral que ele abre em seguida, sem nenhuma das duas estar
 * "errada". Uma função só é a 2ª saída da regra geral (DUAS FONTES PARA UM
 * FATO): a regra vira código e os três caminhos a chamam.
 *
 * Puro: sem Supabase, sem `window`, sem relógio. Aceita o nome das dimensões
 * nos DOIS formatos que o banco devolve — o embed do PostgREST (`{ name }` ou
 * `[{ name }]`) e o texto achatado das RPCs.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

/** O nome de um embed do PostgREST (objeto ou array de um item) OU um texto já achatado. */
export function nomeDaDimensao(e: unknown): string | null {
  if (e == null) return null;
  if (typeof e === "string") return e.trim() ? e : null;
  if (Array.isArray(e)) return ((e[0] as { name?: string } | undefined)?.name ?? null) || null;
  return ((e as { name?: string }).name ?? null) || null;
}

/** Uma linha de `movements` como o banco a entrega (colunas + dimensões resolvidas). */
export interface LinhaMovimento {
  id: unknown;
  type: unknown;
  status: unknown;
  /**
   * ⚠️ Selecionada pela tela e NÃO transportada — de propósito, e igual a
   * antes deste mapeador: ligá-la muda o que a Central lê (`situacaoDe`
   * prefere a coluna). Mudança de comportamento não entra escondida num
   * refactor; entra com nome, num commit próprio.
   */
  situacao?: unknown;
  amount: unknown;
  due_date?: unknown;
  paid_date?: unknown;
  competence_date?: unknown;
  description?: unknown;
  party_id?: unknown;
  account_id?: unknown;
  /** O texto livre da categoria (coluna `movements.category`). */
  category?: unknown;
  /** O nome da categoria do cadastro — embed ou texto achatado. VENCE o texto livre. */
  categoria?: unknown;
  centro?: unknown;
  projeto?: unknown;
  origem?: unknown;
  lancado_por?: unknown;
  reference_code?: unknown;
  installment_no?: unknown;
  installment_total?: unknown;
  category_id?: unknown;
  cost_center_id?: unknown;
  project_id?: unknown;
  /** As fatias do rateio (`movement_splits`), quando o caminho as traz. */
  rateio?: { percent?: unknown; amount?: unknown; projeto?: unknown; centro?: unknown }[] | null;
}

const texto = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const inteiro = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

/**
 * Uma linha → um `RiskMovement`.
 *
 * `projetoLocal` resolve o projeto quando o banco não o traz (o vínculo local
 * de `lib/projeto-vinculo`, que a tela usa enquanto a coluna não chega em todo
 * lugar). O servidor não tem vínculo local e simplesmente não o passa.
 */
export function linhaParaRiskMovement(
  r: LinhaMovimento, projetoLocal?: (movimentoId: string) => string | null,
): RiskMovement {
  const id = String(r.id);
  return {
    id,
    type: String(r.type) as RiskMovement["type"],
    status: String(r.status) as RiskMovement["status"],
    amount: Number(r.amount ?? 0),
    // ⚠️ Vencimento nulo vira texto vazio, nunca `null`: os motores fatiam a
    // data (`due_date.slice`) e um nulo derrubaria a tela inteira por uma linha.
    due_date: String(r.due_date ?? ""),
    paid_date: texto(r.paid_date),
    party_id: texto(r.party_id),
    accountId: texto(r.account_id),
    // A categoria do CADASTRO tem prioridade sobre o texto livre.
    category: nomeDaDimensao(r.categoria) ?? texto(r.category),
    competence_date: texto(r.competence_date),
    descricao: texto(r.description),
    costCenter: nomeDaDimensao(r.centro),
    projeto: nomeDaDimensao(r.projeto) ?? projetoLocal?.(id) ?? null,
    projetoId: texto(r.project_id),
    centroId: texto(r.cost_center_id),
    categoriaId: texto(r.category_id),
    rateio: (r.rateio ?? []).map((sp) => ({
      projeto: nomeDaDimensao(sp.projeto), centro: nomeDaDimensao(sp.centro),
      percentual: Number(sp.percent ?? 0), valor: Number(sp.amount ?? 0),
    })),
    parcelas: inteiro(r.installment_total),
    parcela: inteiro(r.installment_no),
    referenceCode: texto(r.reference_code),
    origem: texto(r.origem),
    lancadoPor: texto(r.lancado_por),
  };
}

export interface EntradaRiskInput {
  hoje: string;
  /** O saldo de cada conta (o banco é a autoridade do NÍVEL). */
  saldosDasContas: readonly (number | string | null | undefined)[];
  linhas: readonly LinhaMovimento[];
  partes?: readonly { id: unknown; name?: unknown; nome?: unknown }[];
  projetoLocal?: (movimentoId: string) => string | null;
  aberturaVerificada?: RiskInput["aberturaVerificada"];
}

/** O `RiskInput` inteiro, a partir das linhas. */
export function linhasParaRiskInput(e: EntradaRiskInput): RiskInput {
  const saldoAtual = e.saldosDasContas.reduce<number>((s, v) => s + Number(v ?? 0), 0);
  const movements = e.linhas.map((l) => linhaParaRiskMovement(l, e.projetoLocal));
  const partyNames: Record<string, string> = {};
  for (const p of e.partes ?? []) {
    const nome = texto(p.name ?? p.nome);
    if (p.id != null && nome) partyNames[String(p.id)] = nome;
  }
  return {
    hoje: e.hoje,
    saldoAtual,
    contas: e.saldosDasContas.length,
    movements,
    partyNames,
    horizonDias: 60,
    ...(e.aberturaVerificada !== undefined ? { aberturaVerificada: e.aberturaVerificada } : {}),
  };
}
