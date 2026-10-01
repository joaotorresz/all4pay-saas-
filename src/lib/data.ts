/**
 * Data access for the financial overview widgets.
 *
 * Each function returns the already-aggregated shape a widget needs.
 * In demo mode it aggregates the deterministic seed; otherwise it queries
 * Supabase and runs the SAME aggregation functions. No mocked data ever
 * reaches a non-demo (production) render.
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import { vinculosProjeto } from "@/lib/projeto-vinculo";
import { listProjetos } from "@/lib/iuli-cadastros";
import { linhasDeCategoria } from "@/lib/registros";
import {
  listarCategorias, salvarCategoria, listarCentrosCusto, listarProjetos as listarProjetosCadastro,
} from "@/lib/cadastros-hierarquia";
import { categoriasSelecionaveis, caminhoDe, contaDaLinha, type LinhaConta } from "@/core/registros/hierarquia";
import {
  DEMO_ACCOUNTS,
  DEMO_MOVEMENTS,
  DEMO_RECORRENCIAS,
  DEMO_PARTIES,
} from "@/lib/demo/seed";
import {
  summarizeReceivables,
  summarizePayables,
  summarizeAccounts,
  dailyCashflow,
  dailyCashflowProjetado,
  monthlySales,
  isoDay,
} from "@/lib/aggregations";
import { importedMovements, importedAccounts, importedParties, importedCadastros, updateImportedMovement, updateImportedAccount, removerImported, appendImported } from "@/lib/imported";
import type {
  Movement,
  MovementType,
  ReceivablesSummary,
  PayablesSummary,
  AccountsSummary,
  DailyCashflowPoint,
  MonthlySalesPoint,
  Category,
  CategoryKind,
  CostCenter,
  Party,
  FinancialAccount,
  LancamentoInput,
  SplitLine,
} from "@/lib/types";
import { linhasParaRiskInput, type LinhaMovimento } from "@/lib/risco-linhas";
import type { RiskInput } from "@/core/risk-engine/types";
import type { RegraRecorrente } from "@/core/contas-pagar/projecao";
import { TETO_LINHAS, semAmostra } from "@/lib/supabase/consulta";
import { reportar } from "@/lib/erros";
import { resolverAberturaVerificada } from "@/lib/abertura";

/**
 * Fonte de dados em demonstração: usa o dataset IMPORTADO (FDIP) quando
 * existir, senão o seed determinístico. É isto que faz o upload no
 * onboarding inteligente refletir em todas as páginas.
 */
const seedMovements = (): Movement[] => importedMovements() ?? DEMO_MOVEMENTS;
const seedAccounts = (): FinancialAccount[] => importedAccounts() ?? DEMO_ACCOUNTS;

/** Brief delay so per-widget skeletons are perceptible in demo mode. */
const demoDelay = () => new Promise((r) => setTimeout(r, 550));

const MOVEMENT_COLS =
  "id,account_id,type,status,category,amount,due_date,paid_date,reconciled,description,reference_code";

export async function getReceivables(): Promise<ReceivablesSummary> {
  if (isDemo) {
    await demoDelay();
    return summarizeReceivables(seedMovements());
  }
  const supabase = createClient();
  // pendentes (a receber) + recebidos HOJE (hero "realizado hoje") — exclui cancelado/pago antigo.
  const hoje = isoDay(new Date());
  const { data, error } = await semAmostra(supabase
    .from("movements")
    .select(MOVEMENT_COLS))
    .eq("type", "entrada")
    .or(`status.eq.pendente,and(status.eq.pago,paid_date.eq.${hoje})`).limit(TETO_LINHAS);
  if (error) throw error;
  return summarizeReceivables((data ?? []) as Movement[]);
}

export async function getPayables(): Promise<PayablesSummary> {
  if (isDemo) {
    await demoDelay();
    return summarizePayables(seedMovements());
  }
  const supabase = createClient();
  // pendentes (a pagar) + pagos HOJE (hero "realizado hoje") — exclui cancelado/pago antigo.
  const hoje = isoDay(new Date());
  const { data, error } = await semAmostra(supabase
    .from("movements")
    .select(MOVEMENT_COLS))
    .eq("type", "saida")
    .or(`status.eq.pendente,and(status.eq.pago,paid_date.eq.${hoje})`).limit(TETO_LINHAS);
  if (error) throw error;
  return summarizePayables((data ?? []) as Movement[]);
}

export async function getAccounts(): Promise<AccountsSummary> {
  if (isDemo) {
    await demoDelay();
    return summarizeAccounts(seedAccounts(), seedMovements());
  }
  const supabase = createClient();
  const [accountsRes, unreconciledRes] = await Promise.all([
    supabase.from("financial_accounts").select("*").order("balance", { ascending: false }).limit(TETO_LINHAS),
    semAmostra(supabase.from("movements").select("account_id,reconciled")).eq("reconciled", false).neq("status", "cancelado").limit(TETO_LINHAS),
  ]);
  if (accountsRes.error) throw accountsRes.error;
  if (unreconciledRes.error) throw unreconciledRes.error;
  const pseudoMovements = (unreconciledRes.data ?? []).map((r) => ({
    account_id: (r as { account_id: string }).account_id,
    reconciled: false,
  })) as Movement[];
  return summarizeAccounts(accountsRes.data ?? [], pseudoMovements);
}

export async function getDailyCashflow(
  days = 14,
): Promise<DailyCashflowPoint[]> {
  if (isDemo) {
    await demoDelay();
    return dailyCashflow(seedMovements(), days);
  }
  const supabase = createClient();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const { data, error } = await semAmostra(supabase
    .from("movements")
    .select("type,amount,due_date,paid_date,status"))
    .eq("status", "pago")
    .gte("paid_date", isoDay(start)).limit(TETO_LINHAS);
  if (error) throw error;
  return dailyCashflow((data ?? []) as Movement[], days);
}

/** Fluxo de caixa diário num intervalo [from, to] (Home navegável por mês).
 *  Saldo ABSOLUTO e com PROJEÇÃO: dias <= hoje = realizado (pagos); dias > hoje =
 *  previsto (pendentes por vencimento) — por isso o gráfico aparece em meses
 *  futuros. A abertura ancora no saldo real: saldo atual − realizado de [from,hoje]
 *  + previsto de (hoje, from) quando o período começa no futuro. */
export async function getDailyCashflowRange(
  from: string,
  to: string,
): Promise<DailyCashflowPoint[]> {
  const hoje = isoDay(new Date());
  const sig = (m: Movement) => (m.type === "entrada" ? m.amount : -m.amount);
  // abertura = saldo atual − realizado já contado em [from,hoje] + previsto entre hoje e um from futuro
  const abertura = (movs: Movement[], saldoAtual: number) => {
    let realizadoNoPeriodo = 0, previstoAteFrom = 0;
    for (const m of movs) {
      if (m.status === "pago") {
        const pd = m.paid_date ?? m.due_date;
        if (pd >= from && pd <= hoje) realizadoNoPeriodo += sig(m);
      } else if (m.status === "pendente" && m.due_date > hoje && m.due_date < from) {
        previstoAteFrom += sig(m);
      }
    }
    return saldoAtual - realizadoNoPeriodo + previstoAteFrom;
  };

  if (isDemo) {
    await demoDelay();
    const movs = seedMovements();
    const saldoAtual = seedAccounts().reduce((s, a) => s + a.balance, 0);
    return dailyCashflowProjetado(movs, from, to, abertura(movs, saldoAtual), hoje);
  }
  const supabase = createClient();
  const [accRes, paidRes, pendRes] = await Promise.all([
    supabase.from("financial_accounts").select("balance").limit(TETO_LINHAS),
    semAmostra(supabase.from("movements").select("type,amount,due_date,paid_date,status")).eq("status", "pago").gte("paid_date", from).lte("paid_date", hoje).limit(TETO_LINHAS),
    semAmostra(supabase.from("movements").select("type,amount,due_date,paid_date,status")).eq("status", "pendente").gt("due_date", hoje).lte("due_date", to).limit(TETO_LINHAS),
  ]);
  if (paidRes.error) throw paidRes.error;
  if (pendRes.error) throw pendRes.error;
  const movs = [...((paidRes.data ?? []) as Movement[]), ...((pendRes.data ?? []) as Movement[])];
  const saldoAtual = (accRes.data ?? []).reduce((s, a) => s + Number((a as { balance: number }).balance), 0);
  return dailyCashflowProjetado(movs, from, to, abertura(movs, saldoAtual), hoje);
}

/** Open items of a direction, ordered by due date — for the drill-down list. */
export async function getOpenMovements(
  type: MovementType,
): Promise<Movement[]> {
  if (isDemo) {
    await demoDelay();
    return seedMovements().filter(
      (m) => m.type === type && m.status === "pendente",
    ).sort((a, b) => a.due_date.localeCompare(b.due_date));
  }
  const supabase = createClient();
  const { data, error } = await semAmostra(supabase
    .from("movements")
    .select(MOVEMENT_COLS))
    .eq("type", type)
    .eq("status", "pendente")
    .order("due_date", { ascending: true }).limit(TETO_LINHAS);
  if (error) throw error;
  return (data ?? []) as Movement[];
}

/** Filtro da tela unificada de Entradas/Saídas. */
export type MovementFilter = "aberto" | "realizado" | "recorrente";

/** Lista de movimentos de uma direção por filtro (em aberto / realizado /
 *  recorrente) — base da tela unificada. Demo e live idênticos. */
export async function getMovementsByFilter(
  type: MovementType,
  filtro: MovementFilter,
): Promise<Movement[]> {
  if (isDemo) {
    await demoDelay();
    const todos = seedMovements().filter((m) => m.type === type);
    if (filtro === "realizado") {
      return todos
        .filter((m) => m.status === "pago")
        .sort((a, b) => (b.paid_date ?? b.due_date).localeCompare(a.paid_date ?? a.due_date));
    }
    if (filtro === "recorrente") {
      return todos
        .filter((m) => (m.reference_code ?? "").startsWith("rec:") && m.status !== "cancelado")
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
    }
    return todos
      .filter((m) => m.status === "pendente")
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }
  const supabase = createClient();
  let q = semAmostra(supabase.from("movements").select(MOVEMENT_COLS)).eq("type", type).limit(TETO_LINHAS);
  if (filtro === "realizado") {
    q = q.eq("status", "pago").order("paid_date", { ascending: false });
  } else if (filtro === "recorrente") {
    q = q.like("reference_code", "rec:%").neq("status", "cancelado").order("due_date", { ascending: true });
  } else {
    q = q.eq("status", "pendente").order("due_date", { ascending: true });
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Movement[];
}

/** Edita um lançamento ainda EM ABERTO (pendente) — valor, vencimento, descrição.
 *  Demo: patcha o imported store; live: Supabase. Não mexe em saldo (só liquidação move). */
export async function updateMovement(
  id: string,
  patch: { amount?: number; due_date?: string; description?: string | null },
): Promise<void> {
  if (isDemo) { updateImportedMovement(id, patch); return; }
  const supabase = createClient();
  const { error } = await supabase.from("movements").update(patch).eq("id", id);
  if (error) throw error;
}

/** Cancela um lançamento ainda EM ABERTO (status → cancelado). Sai das listas de
 *  aberto/previsto sem virar pago (não afeta saldo). Demo: imported; live: Supabase. */
export async function cancelMovement(id: string): Promise<void> {
  if (isDemo) { updateImportedMovement(id, { status: "cancelado" }); return; }
  const supabase = createClient();
  const { error } = await supabase.from("movements").update({ situacao: "cancelado" }).eq("id", id);
  if (error) throw error;
}

/** Lixeira — lançamentos cancelados (pagamentos e recebimentos), recuperáveis.
 *  Demo: imported store; live: Supabase. */
export async function getTrashedMovements(): Promise<Movement[]> {
  if (isDemo) {
    await demoDelay();
    return seedMovements().filter((m) => m.status === "cancelado").sort((a, b) => b.due_date.localeCompare(a.due_date));
  }
  const supabase = createClient();
  const { data, error } = await semAmostra(supabase
    .from("movements").select(MOVEMENT_COLS)).eq("status", "cancelado").order("due_date", { ascending: false }).limit(TETO_LINHAS);
  if (error) throw error;
  return (data ?? []) as Movement[];
}

// ⚠️ `restoreMovement` (cancelado → previsto) foi APAGADO: a máquina de
// estados declara `cancelado` terminal e o banco recusava SEMPRE. O gesto que a
// regra manda é lançar de novo — `lib/lixeira-relancar.relancarCancelado`.

/**
 * Apaga DEFINITIVAMENTE um lançamento — sem volta.
 *
 * ⚠️ O servidor recusa se o lançamento não estiver na LIXEIRA LÓGICA. Não é
 * limitação: é o desenho. Apagar de vez passou a exigir dois atos separados
 * (excluir, depois expurgar), com um evento em cada e uma janela entre eles em
 * que dá para voltar atrás — que é a definição prática de reversível. Exige
 * também o papel de quem administra e um motivo escrito.
 */
export async function purgeMovement(id: string, motivo: string): Promise<void> {
  if (isDemo) { removerImported([id]); return; }
  const { expurgar } = await import("@/lib/exclusao");
  await expurgar("movements", id, motivo);
}

/** Recebíveis para a tela de Boleto: entrada em aberto OU com boleto (inclui o
 *  campo `boleto`). Demo lê o imported store; live o Supabase. */
export async function getRecebiveisBoleto(): Promise<Movement[]> {
  if (isDemo) {
    await demoDelay();
    return seedMovements()
      .filter((m) => m.type === "entrada" && (m.status === "pendente" || m.boleto))
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }
  const supabase = createClient();
  const { data, error } = await semAmostra(supabase
    .from("movements")
    .select(`${MOVEMENT_COLS},boleto`))
    .eq("type", "entrada")
    .or("status.eq.pendente,boleto.not.is.null")
    .order("due_date", { ascending: true }).limit(TETO_LINHAS);
  if (error) throw error;
  return (data ?? []) as Movement[];
}

/** Unreconciled movements, optionally scoped to one account. */
export async function getUnreconciledMovements(
  accountId?: string,
): Promise<Movement[]> {
  if (isDemo) {
    await demoDelay();
    return seedMovements().filter(
      (m) => !m.reconciled && (!accountId || m.account_id === accountId),
    ).sort((a, b) => b.due_date.localeCompare(a.due_date));
  }
  const supabase = createClient();
  let query = semAmostra(supabase
    .from("movements")
    .select(MOVEMENT_COLS))
    .eq("reconciled", false)
    .order("due_date", { ascending: false }).limit(TETO_LINHAS);
  if (accountId) query = query.eq("account_id", accountId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Movement[];
}

/* ---- Cadastros (selects for the lançamento forms) ---- */

/**
 * As categorias que um LANÇAMENTO pode receber: as FOLHAS ativas da árvore do
 * plano de contas (`categories`), da natureza pedida, com o grupo e o caminho.
 *
 * ⚠️ **Só folhas.** O banco recusa lançamento num grupo
 * (`lancamento_em_categoria_folha`, migration `20260930180000`); oferecer um
 * grupo no formulário seria oferecer uma escolha que o salvar recusa.
 *
 * ⚠️ A árvore é lida pelo MESMO leitor da tela de Plano de contas
 * (`lib/cadastros-hierarquia`). Antes da migration aplicada, as colunas novas
 * (`code`) não existem e a consulta cai no select antigo — REPORTANDO a queda:
 * os formulários de lançamento continuam funcionando na janela entre o
 * deploy e o job `migrar`, em vez de ficarem sem categoria nenhuma.
 */
export async function getCategories(kind: CategoryKind): Promise<Category[]> {
  let arvore;
  try {
    arvore = await listarCategorias();
  } catch (e) {
    if (isDemo || !COLUNA_AUSENTE.test(e instanceof Error ? e.message : "")) throw e;
    reportar(
      "categorias.arvore", e,
      "o formulário oferece a lista plana de categorias até a migration 20260930180000 ser aplicada",
      true,
    );
    const { data, error } = await createClient()
      .from("categories").select("id,kind,name").eq("kind", kind).eq("active", true)
      .order("name").limit(TETO_LINHAS);
    if (error) throw error;
    return (data ?? []) as Category[];
  }
  return categoriasSelecionaveis(arvore, kind).map((c) => ({
    id: c.id,
    kind: c.natureza,
    name: c.nome,
    parent_id: c.paiId,
    code: c.codigo || null,
    dre_linha: c.dreLinha ?? null,
    caminho: caminhoDe(arvore, c.id),
  }));
}

/** O erro do PostgREST para coluna que ainda não existe (migration pendente). */
const COLUNA_AUSENTE = /column .* does not exist|could not find the .* column|42703|PGRST204/i;

/**
 * Cria uma categoria na tabela REAL (`public.categories`) e devolve a linha.
 *
 * ⚠️ Existe porque o formulário de lançamento precisa de um `category_id` que
 * seja UUID de verdade: `movements.category_id` é FK para `categories`, e o
 * plano de contas da tela vive em `org_state` com id numérico próprio
 * (`novoIdRegistro`). Mandar aquele id para esta coluna é o que produzia
 * `22P02 invalid input syntax for type uuid` em TODA gravação com categoria —
 * medido contra o banco de produção.
 *
 * `dre_linha` viaja junto: é a coluna da migration `20260812144846`, e sem um
 * escritor ela seria schema inerte.
 */
/**
 * A LINHA DECLARADA de cada categoria — `nome (minúsculo)` → id da linha do DRE.
 *
 * ⚠️ **Sai de `categories.dre_linha`, que é a tabela que os LANÇAMENTOS
 * referenciam.** O plano de contas local (`lib/registros.linhasDeCategoria`)
 * responde pela árvore que a tela de Cadastros edita; quem carrega dinheiro é
 * esta. Enquanto só o local alimentava o relatório, a linha declarada não valia
 * para quem nunca abriu aquela tela — e o motor caía no palpite por palavra-
 * chave sem que nada dissesse isso.
 *
 * ⚠️ Foi assim que **INSS e FGTS** entraram como DEDUÇÃO DA RECEITA na
 * organização auditada: `ehImpostoVenda` casa `\binss\b`, e encargo de folha
 * não é dedução de receita. Quem cadastrou a categoria sabe em que linha ela
 * entra; o regex, não.
 */
export async function getLinhasDeCategoria(): Promise<Record<string, string>> {
  // Em demonstração a árvore mora no dataset — a MESMA que a tela de Plano de
  // contas edita, então a linha declarada lá chega ao DRE daqui.
  if (isDemo) {
    const out: Record<string, string> = {};
    for (const c of importedCadastros()?.categories ?? []) {
      if (c.name && c.dre_linha) out[c.name.trim().toLowerCase()] = c.dre_linha;
    }
    return out;
  }
  const supabase = createClient();
  if (!supabase) return {};
  // Teto de linhas como toda consulta do sistema: a política diz DE QUEM são
  // as linhas, não QUANTAS.
  const { data, error } = await supabase.from("categories").select("name,dre_linha").limit(TETO_LINHAS);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const c of data as { name: string | null; dre_linha: string | null }[]) {
    if (c.name && c.dre_linha) out[c.name.trim().toLowerCase()] = c.dre_linha;
  }
  return out;
}

/**
 * A linha DECLARADA de cada categoria — UMA função para o DRE, a variação e a
 * exportação. Eram três cópias do mesmo merge, e as três davam precedência ao
 * plano LOCAL.
 *
 * ⚠️ **O BANCO VENCE.** Desde `20260930180000` a tela de Plano de contas edita
 * `categories.dre_linha`; com o local vencendo, a linha que a pessoa acabou de
 * declarar na tela nova perderia para uma declaração velha do navegador. O
 * plano ANTIGO entra só para o nome que o banco NÃO declara — congelado
 * (nenhum escritor sobrou), ele não diverge mais, e some quando a pessoa o
 * traz para o cadastro pelo bloco "Cadastros antigos".
 */
export async function linhasDeclaradasDasCategorias(): Promise<Record<string, string>> {
  const local = linhasDeCategoria();
  return { ...local, ...(await getLinhasDeCategoria()) };
}

export async function criarCategoria(
  nome: string, kind: CategoryKind, dreLinha?: string | null,
): Promise<Category> {
  // Um escritor só: o MESMO da tela de Plano de contas — validação, natureza,
  // unicidade e a frase do banco na recusa.
  const c = await salvarCategoria({
    id: "", nome, codigo: "", natureza: kind, paiId: null, dreLinha: dreLinha ?? undefined, ativo: true,
  });
  return { id: c.id, kind: c.natureza, name: c.nome, parent_id: null, code: null, dre_linha: c.dreLinha ?? null, caminho: c.nome };
}

export async function getCostCenters(): Promise<CostCenter[]> {
  // Em demonstração, a MESMA lista que a tela de Centros de custo edita.
  if (isDemo) {
    return (await listarCentrosCusto()).filter((c) => c.ativo).map((c) => ({ id: c.id, name: c.nome }));
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cost_centers")
    .select("id,name")
    .eq("active", true)
    .order("name").limit(TETO_LINHAS);
  if (error) throw error;
  return (data ?? []) as CostCenter[];
}

type PartyRole = "customer" | "supplier" | "carrier";

/**
 * Os contatos de um PAPEL para os SELETORES de lançamento — só os ATIVOS.
 *
 * ⚠️ Inativo sai da ESCOLHA, não da história: a lista de cadastro e os
 * relatórios continuam vendo-o (`listParties`). Antes `ativo` morava no
 * navegador (`a4p_party_extra`) e o seletor oferecia o cliente desativado em
 * toda máquina. Com a coluna ainda ausente (janela entre o deploy e o job
 * `migrar`), a leitura cai na antiga e REPORTA a queda.
 */
export async function getParties(role: PartyRole): Promise<Party[]> {
  const col = `is_${role}` as const;
  if (isDemo)
    return (importedParties() ?? DEMO_PARTIES).filter(
      (p) => (p as unknown as Record<string, unknown>)[col] && p.ativo !== false,
    );
  const supabase = createClient();
  const { data, error } = await supabase
    .from("parties")
    .select("id,type,name,doc,is_customer,is_supplier,is_carrier,ativo,default_category_id")
    .eq(col, true)
    .eq("ativo", true)
    .order("name").limit(TETO_LINHAS);
  if (!error) return (data ?? []) as Party[];
  if (!COLUNA_AUSENTE.test(error.message ?? "")) throw error;
  reportar(
    "contatos.ativo", error,
    "os seletores oferecem também contatos inativos até a migration 20260930180000 ser aplicada",
    true,
  );
  const r = await supabase
    .from("parties")
    .select("id,type,name,doc,is_customer,is_supplier,is_carrier")
    .eq(col, true)
    .order("name").limit(TETO_LINHAS);
  if (r.error) throw r.error;
  return (r.data ?? []) as Party[];
}

/** Lightweight account list for selects (id + name). */
export async function getAccountsList(): Promise<FinancialAccount[]> {
  if (isDemo) return seedAccounts();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("financial_accounts")
    .select("id,name,bank,balance")
    .order("name").limit(TETO_LINHAS);
  if (error) throw error;
  return (data ?? []) as FinancialAccount[];
}

/* ---- Open Finance: contas bancárias (bank_accounts) ---- */
export interface BankAccount {
  id: string;
  name: string | null;
  balance: number;
  currency: string | null;
  connectorName: string | null; // nome do banco (pluggy_items.connector_name)
  linkedFinancialAccountId: string | null; // vínculo 2A com a conta manual
  balanceSource: "open_finance" | "manual" | "both_visible";
}

/** Contas do Open Finance (bank_accounts) da org. Open Finance é live-only → []
 *  em demo. Traz o nome do banco via embed do pluggy_items (connector). */
export async function getBankAccounts(): Promise<BankAccount[]> {
  if (isDemo) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("id,name,balance,currency,linked_financial_account_id,balance_source,pluggy_items(connector_name)")
    .order("name").limit(TETO_LINHAS);
  if (error) throw error;
  type Row = {
    id: string; name: string | null; balance: number | null; currency: string | null;
    linked_financial_account_id: string | null; balance_source: string | null;
    pluggy_items?: { connector_name: string | null } | { connector_name: string | null }[] | null;
  };
  return ((data ?? []) as Row[]).map((r) => {
    const emb = r.pluggy_items;
    const connectorName = Array.isArray(emb) ? (emb[0]?.connector_name ?? null) : (emb?.connector_name ?? null);
    return {
      id: r.id, name: r.name, balance: Number(r.balance ?? 0), currency: r.currency,
      connectorName, linkedFinancialAccountId: r.linked_financial_account_id,
      balanceSource: (r.balance_source as BankAccount["balanceSource"]) ?? "open_finance",
    };
  });
}

/** Define qual saldo é o oficial numa conta OF vinculada (1C). */
export async function setBankAccountSource(id: string, source: BankAccount["balanceSource"]): Promise<void> {
  if (isDemo) return;
  const { error } = await createClient().from("bank_accounts").update({ balance_source: source }).eq("id", id);
  if (error) throw error;
}

/** Vincula (ou desvincula) uma conta OF a uma conta manual (2A). */
export async function linkBankAccount(bankAccountId: string, financialAccountId: string | null): Promise<void> {
  if (isDemo) return;
  const { error } = await createClient().from("bank_accounts").update({ linked_financial_account_id: financialAccountId }).eq("id", bankAccountId);
  if (error) throw error;
}

/** Edita uma conta financeira — nome, banco e/ou saldo. Demo: imported store;
 *  live: Supabase. (Saldo aqui é ajuste manual da conta, não liquidação.) */
export async function updateAccount(
  id: string,
  patch: { name?: string; bank?: string; balance?: number },
): Promise<void> {
  if (isDemo) { updateImportedAccount(id, patch); return; }
  const supabase = createClient();
  const { error } = await supabase.from("financial_accounts").update(patch).eq("id", id);
  if (error) throw error;
}

/**
 * O valor é um UUID — ou a gravação para AQUI, com o nome do campo.
 *
 * ⚠️ Sem isto, um id que não é UUID atravessa o app inteiro e só é recusado
 * pelo PostgREST, com `invalid input syntax for type uuid: "217290"`. Essa
 * mensagem chega à tela e não diz NADA a quem opera: não nomeia o campo, não
 * sugere ação, e o número não aparece em lugar nenhum da interface. O defeito
 * real é sempre o mesmo — um cadastro que mora no navegador com id próprio
 * sendo mandado para uma coluna que é chave estrangeira.
 *
 * Falhar aqui não conserta a dupla morada; ela é nomeada na mensagem, e quem
 * lê descobre em um segundo o que levaria uma sessão de depuração.
 */
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function exigirUUID(valor: string | null | undefined, campo: string): string | null {
  if (!valor) return null;
  if (RE_UUID.test(valor)) return valor;
  throw new Error(
    `O ${campo} escolhido ainda não existe no banco (id "${valor}"). `
    + "Ele foi cadastrado só neste navegador — abra Cadastros e crie-o de novo para que o lançamento possa apontar para ele.",
  );
}

/**
 * ⚠️ **LANÇAMENTO DE VALOR ZERO NÃO É LANÇAMENTO** — e o sistema aceitava.
 *
 * Achado ao levantar o de-para das categorias (14/08): a organização auditada
 * tem duas ENTRADAS de "Tarifas bancárias" com `amount = 0,00` e um "Planilha"
 * de saída, também zero. Nenhuma delas classifica errado — elas simplesmente
 * não deveriam existir. É lacuna de VALIDAÇÃO, não de classificação.
 *
 * O custo não é o zero em si (ele não move caixa nem resultado): é que ele
 * ocupa uma linha em toda contagem — "26 lançamentos de tarifa" vira 28 —,
 * entra em média por lançamento e em ticket médio puxando os dois para baixo,
 * e aparece na lista de títulos como uma obrigação a conferir que não existe.
 * Um número que ninguém consegue explicar é um número que faz duvidar dos
 * vizinhos.
 *
 * ⚠️ **Negativo também é recusado, e por outra razão.** `amount` é MAGNITUDE
 * nesta base — a direção mora em `type` e em lugar nenhum mais (convenção da
 * ONDA 1). Um valor negativo aqui inverteria o sinal duas vezes em todo motor
 * que usa `assinado()`, e o efeito seria uma entrada que subtrai.
 */
function exigirValor(valor: number, campo = "valor"): number {
  if (!Number.isFinite(valor) || valor === 0) {
    throw new Error(
      `O ${campo} do lançamento não pode ser zero. `
      + "Informe quanto entrou ou saiu — se o objetivo era só registrar o fato sem dinheiro, use uma anotação no contato.",
    );
  }
  if (valor < 0) {
    throw new Error(
      `O ${campo} do lançamento não pode ser negativo. `
      + "Escolha entrada ou saída para dizer a direção; o valor é sempre positivo.",
    );
  }
  return valor;
}

/**
 * O vencimento da parcela `i` (0 = a primeira), FATIANDO a string.
 *
 * ⚠️ Era `isoDay(new Date("YYYY-MM-DD"))`: a string sem hora é meia-noite UTC,
 * e em UTC−3 o dia local é o ANTERIOR — toda despesa lançada para o dia 1º
 * gravava o vencimento no dia 30/31 do mês anterior (achado pela guarda do
 * escritor da demonstração, que confere a data que entrou). E `setMonth` fazia
 * 31/01 + 1 mês virar 03/03: o dia que não existe no mês vira o ÚLTIMO dia
 * dele, nunca escorrega para o mês seguinte.
 */
export function vencimentoDaParcela(primeiro: string, i: number): string {
  const [a, m, d] = primeiro.slice(0, 10).split("-").map(Number);
  const total = a * 12 + (m - 1) + i;
  const ano = Math.floor(total / 12);
  const mes = total % 12; // 0-based
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimo);
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Build the movement rows for a lançamento (handles parcelamento). */
function buildMovementRows(input: LancamentoInput, groupId: string) {
  const type: MovementType = input.kind === "receita" ? "entrada" : "saida";
  const n = Math.max(1, input.installments);
  const per = Math.round((exigirValor(input.amount) / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => {
    const settledNow = input.settled && i === 0;
    return {
      account_id: input.account_id,
      type,
      // ⚠️ `situacao`, nunca `status`: desde 25/08 `movements.status` é
      // `generated always as (…) stored` e o Postgres RECUSA o insert que a
      // mencione (`428C9`). O estado tem UMA morada, e é esta.
      situacao: settledNow ? "baixado" : "previsto",
      category: null,
      category_id: exigirUUID(input.category_id, "categoria"),
      cost_center_id: exigirUUID(input.cost_center_id, "centro de custo"),
      project_id: exigirUUID(input.project_id ?? null, "projeto"),
      party_id: exigirUUID(input.party_id, "contato"),
      amount: per,
      due_date: vencimentoDaParcela(input.due_date, i),
      paid_date: settledNow ? isoDay(new Date()) : null,
      reconciled: false,
      description: input.description,
      competence_date: input.competence_date,
      payment_method: input.payment_method,
      reference_code: input.reference_code,
      nsu: input.nsu,
      group_id: groupId,
      installment_no: n > 1 ? i + 1 : null,
      installment_total: n > 1 ? n : null,
      /**
       * ⚠️ A LINHA QUE FALTAVA, e ela derrubava TODA gravação manual em
       * produção.
       *
       * A ONDA 5 pôs a fechadura no banco (`titulo_exige_origem()` recusa com
       * `A4P05` um título sem procedência) e não deu a chave a este escritor —
       * o único que os formulários de tela usam. Medido contra o banco real
       * numa transação desfeita: sem `origem`, "Este título não diz de onde
       * veio"; com `origem = 'manual'`, passa.
       *
       * O defeito atravessou despercebido porque a recusa acontece no SERVIDOR
       * e a tela a traduzia para "Tente novamente" — o único conselho que não
       * podia dar certo, já que repetir reproduz exatamente a mesma recusa.
       */
      origem: input.origem ?? "manual",
    };
  });
}

/**
 * As fatias de um rateio aplicadas a UM valor, em centavos inteiros — o resto
 * vai para a ÚLTIMA, senão 100 ÷ 3 somaria R$ 99,99 e o rateio nasceria menor
 * que o título.
 */
function fatiarValor(valor: number, splits: SplitLine[]): (SplitLine & { amount: number })[] {
  const total = Math.round(valor * 100);
  let usado = 0;
  return splits.map((s, i) => {
    const cent = i === splits.length - 1 ? total - usado : Math.round(total * (Number(s.percent) || 0) / 100);
    usado += cent;
    return { ...s, amount: cent / 100 };
  });
}

async function nomeDaCategoriaDemo(id: string | null): Promise<string | null> {
  if (!id) return null;
  return (await listarCategorias()).find((c) => c.id === id)?.nome ?? null;
}

/**
 * ⚠️ **O ESCRITOR DA DEMONSTRAÇÃO DO "ADICIONAR" — antes ele não gravava nada.**
 *
 * `createLancamento` fazia `return` dentro de `if (isDemo)` e a tela dizia
 * "Despesa salva": a despesa não aparecia no extrato, no saldo nem no DRE. É o
 * "escritor morto" pelo avesso — lá a produção não lia o que a tela gravava;
 * aqui a demonstração não gravava o que a tela anunciava.
 *
 * As linhas saem do MESMO `buildMovementRows` da produção (parcelas, datas,
 * baixa imediata, procedência `manual`); só o `status` é traduzido de
 * `situacao`, porque o dataset da demonstração guarda a coluna derivada.
 *
 * - O `category` (texto) recebe o NOME da categoria escolhida: é por ele que o
 *   DRE da demonstração classifica (`cat(m) = m.category`).
 * - A `chave` é a do LANÇAMENTO MANUAL, única por título: em produção um
 *   lançamento manual não tem chave de ingestão e duas despesas iguais no mesmo
 *   dia são duas despesas. Sem isto o dedup do dataset descartaria a segunda em
 *   silêncio — a tela diria "salva" sobre uma linha que não entrou.
 * - E CONFERE que cada título entrou; senão lança, com a quantidade.
 * - ⚠️ A repetição é RECUSADA antes de gravar: a demonstração não tem tabela de
 *   regras de recorrência, e gravar só o primeiro título dizendo "salvo"
 *   prometeria repetições que nunca nascem.
 */
function gravarLancamentoDemo(input: LancamentoInput, groupId: string, nomeCategoria: string | null): void {
  // Em produção este dataset não é lido por ninguém: gravar aqui seria o
  // "escritor morto". A trava fica DENTRO da função, não só em quem a chama.
  if (!isDemo) throw new Error("O dataset da demonstração só é gravado na demonstração.");
  if (input.repeat) {
    throw new Error(
      "A repetição não é gravada na demonstração (não há onde guardar a regra). "
      + "Desligue \"Repetir lançamento\" para salvar este título — em produção a regra é gravada.",
    );
  }
  // As chaves de cadastro da demonstração têm id próprio (não UUID): a linha
  // sai do montador da produção SEM elas, e elas voltam como vieram.
  const rows = buildMovementRows(
    { ...input, category_id: null, cost_center_id: null, project_id: null, party_id: null }, groupId,
  ).map((r) => ({
    ...r,
    category_id: input.category_id || null,
    cost_center_id: input.cost_center_id || null,
    project_id: input.project_id || null,
    party_id: input.party_id || null,
  }));
  const splits = (input.splits ?? []).filter((x) => x.category_id || x.cost_center_id || x.project_id);
  const ids = rows.map((_, k) => `mv_${Date.now().toString(36)}_${groupId.slice(0, 8)}_${k}`);
  rows.forEach((r, k) => {
    const { situacao, ...resto } = r;
    appendImported({
      movement: {
        ...resto,
        id: ids[k],
        account_id: r.account_id ?? "",
        status: situacao === "baixado" ? "pago" : "pendente",
        category: nomeCategoria,
        splits: splits.length ? fatiarValor(r.amount, splits) : null,
        chave: `manual:${ids[k]}`,
      } as never,
    });
  });
  const gravados = new Set((importedMovements() ?? []).map((m) => m.id));
  const faltam = ids.filter((id) => !gravados.has(id)).length;
  if (faltam > 0) {
    throw new Error(`${faltam} de ${ids.length} título(s) não entraram no dataset da demonstração. Nada foi confirmado — confira o extrato antes de lançar de novo.`);
  }
}

/** Create a lançamento (Receita/Despesa) — movements (+ splits, recurrence). */
export async function createLancamento(input: LancamentoInput): Promise<void> {
  const groupId =
    globalThis.crypto?.randomUUID?.() ?? `grp-${Date.now()}`;

  if (isDemo) {
    await demoDelay();
    gravarLancamentoDemo(input, groupId, await nomeDaCategoriaDemo(input.category_id));
    return;
  }

  const supabase = createClient();
  const rows = buildMovementRows(input, groupId);
  const { data: inserted, error } = await supabase
    .from("movements")
    .insert(rows)
    .select("id").limit(TETO_LINHAS);
  if (error) throw error;

  /**
   * ⚠️ O RATEIO VAI PARA CADA PARCELA, não só para a primeira. Antes ele
   * entrava só no primeiro título (`firstId`): numa despesa em 6x rateada
   * 60/40, cinco parcelas ficavam sem rateio e o relatório por centro somava
   * cada uma 100/0. O valor da fatia sai da PARCELA, em centavos.
   */
  const splits = (input.splits ?? []).filter((s) => s.category_id || s.cost_center_id || s.project_id);
  if (splits.length && inserted?.length) {
    const titulos = inserted as { id: string }[];
    await gravarRateioOuDesfazer(supabase, titulos.map((t) => t.id), () => titulos.flatMap((mv, i) =>
      fatiarValor(rows[i]?.amount ?? 0, splits).map((s) => ({
        movement_id: mv.id,
        category_id: exigirUUID(s.category_id, "categoria do rateio"),
        cost_center_id: exigirUUID(s.cost_center_id, "centro de custo do rateio"),
        project_id: exigirUUID(s.project_id ?? null, "projeto do rateio"),
        percent: s.percent,
        amount: s.amount,
      }))));
  }

  if (input.repeat) {
    const { error: re } = await supabase.from("recurrences").insert({
      party_id: input.party_id,
      type: input.kind === "receita" ? "entrada" : "saida",
      description: input.description,
      amount: input.amount,
      freq: input.repeat.freq,
      start_date: input.due_date,
      end_date: input.repeat.until,
      category_id: input.category_id,
      cost_center_id: input.cost_center_id,
      due_day: Number(input.due_date.slice(8, 10)), // dia do mês da string ISO (TZ-independente; new Date(UTC).getDate() erraria em UTC-3)
    });
    if (re) throw re;
  }
}

/* ========================================================================== */
/* Títulos avulsos — o escritor que faltava                                    */
/* ========================================================================== */

/**
 * Uma linha a gravar, já pronta: valor, data e categoria decididos por quem
 * chamou.
 *
 * ⚠️ É o que `createLancamento` NÃO resolve. Ele monta N parcelas iguais,
 * espaçadas de mês em mês, a partir de UM valor — o formato de uma despesa
 * parcelada. A folha não tem esse formato: um CLT gera salário, FGTS e DARF na
 * mesma competência, com valores diferentes e em DUAS datas. Empurrá-la pelo
 * caminho comum erraria a data de dois títulos e o valor do terceiro.
 */
export interface TituloAvulso {
  account_id: string;
  type: MovementType;
  amount: number;
  /** Vencimento "YYYY-MM-DD" — é ele que responde "o que cai no dia 20". */
  due_date: string;
  /** Competência: em que mês o resultado reconhece a despesa. */
  competence_date?: string | null;
  category?: string | null;
  /** A categoria do banco (`public.categories.id`) — a chave que o DRE declarado lê. */
  category_id?: string | null;
  description?: string | null;
  party_id?: string | null;
  status?: "pendente" | "pago";
  paid_date?: string | null;
  origem?: LancamentoInput["origem"];
  /** Venda que originou o título — a chave que liga o recebível ao documento. */
  sale_doc_id?: string | null;
  /** Chave de origem/idempotência (`movements.reference_code`). */
  reference_code?: string | null;
  /** O centro de custo e o projeto PRINCIPAIS (UUID do cadastro). */
  cost_center_id?: string | null;
  project_id?: string | null;
  /** O rateio, quando há mais de uma fatia (`core/registros/hierarquia.linhasDoRateio`). */
  splits?: SplitLine[] | null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAVA TÍTULOS PRONTOS — em demonstração E em produção.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **ESTE ESCRITOR EXISTE PORQUE TRÊS TELAS GRAVAVAM NUM LUGAR QUE, EM
 * PRODUÇÃO, NINGUÉM LÊ.**
 *
 * Folha (cadastro de colaborador e agendamento de férias/rescisão) e Nova venda
 * chamavam `appendImported` DIRETO, sem olhar para `isDemo`. Esse store é o
 * dataset da demonstração: `getRiscoInput` e todos os acessores só o consultam
 * dentro de `if (isDemo)`. Em live a linha ia para o `localStorage` e era lida
 * por nada — o título não aparecia no contas a pagar, nem no fluxo, nem no DRE,
 * nem no razão.
 *
 * E a tela dizia **"cadastrado · 6 títulos agendados"**, porque escrever no
 * `localStorage` não falha. É a mesma família do defeito de `origem` da ONDA 5 —
 * um escritor que não alcança o banco — só que pior num ponto: lá o banco
 * RECUSAVA e a tela escondia a recusa; aqui não havia recusa nenhuma para
 * esconder, porque a gravação nunca foi tentada.
 *
 * Por isso a função **LANÇA** quando o banco recusa. Um escritor de dinheiro que
 * engole erro é indistinguível de um que funciona, e foi assim que o defeito
 * chegou até aqui.
 */
export async function criarTitulos(linhas: TituloAvulso[]): Promise<void> {
  if (linhas.length === 0) return;
  // ⚠️ A MESMA trava do formulário, no OUTRO escritor. Validar só num dos dois
  // deixa a porta aberta pela metade — e é sempre a porta menos olhada que fica
  // aberta: aqui entra a folha, que ninguém digita linha a linha.
  linhas.forEach((l) => exigirValor(l.amount));

  if (isDemo) {
    linhas.forEach((l, k) => {
      appendImported({
        movement: {
          id: `mv_${Date.now().toString(36)}_${k}`,
          account_id: l.account_id,
          type: l.type,
          status: l.status ?? "pendente",
          amount: l.amount,
          due_date: l.due_date,
          paid_date: l.paid_date ?? null,
          reconciled: false,
          category: l.category ?? null,
          category_id: l.category_id ?? null,
          cost_center_id: l.cost_center_id ?? null,
          project_id: l.project_id ?? null,
          splits: l.splits?.length ? l.splits : null,
          reference_code: l.reference_code ?? null,
          description: l.description ?? null,
          party_id: l.party_id ?? null,
          origem: l.origem ?? "manual",
        } as never,
      });
    });
    return;
  }

  const supabase = createClient();
  const { data: inseridos, error } = await supabase.from("movements").insert(
    linhas.map((l) => ({
      account_id: l.account_id,
      type: l.type,
      situacao: l.status === "pago" ? "baixado" : "previsto",
      amount: l.amount,
      due_date: l.due_date,
      competence_date: l.competence_date ?? l.due_date,
      paid_date: l.paid_date ?? null,
      reconciled: false,
      category: l.category ?? null,
      description: l.description ?? null,
      party_id: l.party_id ?? null,
      /**
       * ⚠️ `origem` é a chave da fechadura da ONDA 5 (`titulo_exige_origem`
       * recusa com A4P05 um título sem procedência). `especie: "titulo"` é a
       * outra metade: sem ela a linha fica sem classificação e cai na dívida
       * que a tela de qualidade de dados cobra.
       */
      origem: l.origem ?? "manual",
      especie: "titulo",
      ...(l.sale_doc_id ? { sale_doc_id: l.sale_doc_id } : {}),
      ...(l.category_id ? { category_id: exigirUUID(l.category_id, "Categoria") } : {}),
      ...(l.reference_code ? { reference_code: l.reference_code } : {}),
      ...(l.cost_center_id ? { cost_center_id: exigirUUID(l.cost_center_id, "centro de custo") } : {}),
      ...(l.project_id ? { project_id: exigirUUID(l.project_id, "projeto") } : {}),
    })),
  ).select("id").limit(TETO_LINHAS);
  if (error) throw error;
  // O rateio de cada título, na MESMA ordem em que as linhas foram enviadas.
  const titulos = (inseridos as { id: string }[] | null) ?? [];
  if (linhas.some((l) => l.splits?.length)) {
    await gravarRateioOuDesfazer(supabase, titulos.map((t) => t.id), () => titulos.flatMap((mv, i) =>
      (linhas[i]?.splits ?? []).map((sp) => ({
        movement_id: mv.id,
        category_id: exigirUUID(sp.category_id, "categoria do rateio"),
        cost_center_id: exigirUUID(sp.cost_center_id, "centro de custo do rateio"),
        project_id: exigirUUID(sp.project_id ?? null, "projeto do rateio"),
        percent: sp.percent,
        amount: sp.amount ?? null,
      }))));
  }
}

/**
 * Grava o rateio dos títulos que ACABARAM de nascer — e, se ele for recusado,
 * DESFAZ os títulos (exclusão lógica) antes de devolver o erro.
 *
 * ⚠️ Título e rateio são duas gravações. Sem desfazer, uma recusa do rateio
 * deixava os títulos gravados SEM rateio e a tela dizia "não foi possível
 * salvar": a pessoa salvava de novo e o mesmo dinheiro entrava DUAS vezes no
 * contas a pagar, no fluxo e no DRE. Mesma regra da venda: nenhum documento
 * pela metade. Se o desfazer também falhar, a mensagem diz quantos títulos
 * ficaram — para a pessoa não repetir o lançamento às cegas.
 */
async function gravarRateioOuDesfazer(
  supabase: ReturnType<typeof createClient>,
  idsDosTitulos: string[],
  montar: () => Record<string, unknown>[],
): Promise<void> {
  try {
    const fatias = montar();
    if (!fatias.length) return;
    const { error } = await supabase.from("movement_splits").insert(fatias);
    if (error) throw error;
  } catch (e) {
    const motivo = (e as { message?: string } | null)?.message ?? String(e);
    const { excluirLogico } = await import("@/lib/exclusao");
    let ficaram = 0;
    for (const id of idsDosTitulos) {
      try { await excluirLogico("movements", id, `Rateio recusado ao lançar: ${motivo}`); } catch { ficaram += 1; }
    }
    throw new Error(ficaram === 0
      ? `O rateio foi recusado (${motivo}). O lançamento foi desfeito — corrija e salve de novo.`
      : `O rateio foi recusado (${motivo}), e ${ficaram} título(s) ficaram gravados sem rateio. Confira em Contas a pagar/receber antes de lançar de novo.`);
  }
}

/**
 * O PROJETO de um lançamento que já existe — a ficha do título permite
 * vincular/desvincular depois de lançado.
 *
 * ⚠️ **Em produção grava `movements.project_id`.** Antes o vínculo morava num
 * mapa no navegador (`a4p_movimento_projeto`, id NUMÉRICO do cadastro local):
 * nenhum relatório de outra máquina o via, e o banco nunca sabia que o
 * lançamento era de um projeto. Em demonstração o dataset guarda o id no
 * próprio movimento, pelo mesmo motivo.
 */
export async function definirProjetoDoMovimento(id: string, projetoId: string | null): Promise<void> {
  if (isDemo) {
    updateImportedMovement(id, { project_id: projetoId || null });
    return;
  }
  const { error } = await createClient()
    .from("movements").update({ project_id: exigirUUID(projetoId || null, "projeto") }).eq("id", id);
  if (error) throw error;
}

/** Input for the cash-risk engine (scoreRiscoCaixa). */
/** Demo: deriva um centro de custo plausível a partir da categoria. */
function demoCostCenter(cat: string | null): string {
  const c = (cat ?? "").toLowerCase();
  if (/venda|outros/.test(c)) return "Comercial";
  if (/fornecedor/.test(c)) return "Operações";
  if (/folha/.test(c)) return "Administrativo";
  if (/imposto|tarifa|financ/.test(c)) return "Financeiro";
  return "Administrativo";
}

/**
 * O PostgREST descreve a ausência de um relacionamento assim (PGRST200). É a
 * ÚNICA falha do embed que autoriza cair no select base — o resto sobe.
 */
const RELACAO_AUSENTE = /could not find a relationship|PGRST200|does not exist/i;

/**
 * Memória da capacidade do banco: `undefined` = ainda não se sabe, `true` = o
 * embed resolve, `false` = não resolve (não tentar de novo nesta sessão).
 */
let embedProjetoOk: boolean | undefined;
/** As colunas do cadastro da conta existem? (uma tentativa por sessão) */
let colunasCadastroOk: boolean | undefined;

/** O nome de um embed do PostgREST, que vem objeto ou array de um item. */
const embedName = (e: unknown): string | null =>
  Array.isArray(e) ? ((e[0] as { name?: string } | undefined)?.name ?? null) : ((e as { name?: string } | null)?.name ?? null);

/**
 * As REGRAS de recorrência de SAÍDA — a fonte da projeção de contas recorrentes.
 *
 * ⚠️ Existe separada de `listRecorrencias` (`lib/recorrencias.ts`) porque
 * aquela filtra `type = "entrada"` e descarta o `end_date`: ela serve às
 * assinaturas (MRR), onde a pergunta é outra. Reaproveitá-la aqui traria a
 * lista errada e sem a data que termina o compromisso — que é justamente o
 * campo que impede a projeção de continuar cobrando um contrato encerrado.
 *
 * Demo-safe: em demonstração não há tabela, e o dataset importado não carrega
 * regras — devolve vazio, e a tela diz que não há recorrência cadastrada em vez
 * de inventar uma.
 */
export async function getRegrasRecorrentes(): Promise<RegraRecorrente[]> {
  if (isDemo) return DEMO_RECORRENCIAS;
  const supabase = createClient();
  const { data, error } = await semAmostra(supabase
    .from("recurrences")
    .select("id,description,amount,freq,start_date,end_date,due_day,active,party_id,parties(name),categoria:category_id(name)"))
    .eq("type", "saida")
    .order("description")
    .limit(TETO_LINHAS);
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    descricao: String(r.description ?? "Conta recorrente"),
    contraparte: embedName(r.parties as never) ?? null,
    categoria: embedName(r.categoria as never) ?? null,
    valor: Number(r.amount ?? 0),
    frequencia: (r.freq as RegraRecorrente["frequencia"]) ?? "mensal",
    inicio: String(r.start_date ?? "").slice(0, 10),
    fim: r.end_date ? String(r.end_date).slice(0, 10) : null,
    diaVencimento: r.due_day == null ? null : Number(r.due_day),
    ativa: r.active !== false,
  }));
}

/**
 * ⚠️ **QUEM MONTAR UM `RiskInput` À MÃO PRECISA LER ISTO — é a regra mais cara
 * desta auditoria, e ela produz um número que PARECE regressão.**
 *
 * Este `RiskInput` é só metade do que a tela usa. A outra metade é o
 * **`linhaPorCategoria`** do filtro do relatório — a linha DECLARADA de cada
 * categoria, que vem de `categories.dre_linha` (banco) mesclada com o plano de
 * contas local. É por ela que `montarRelatorio` reconhece a saída
 * `LINHA_TRANSFERENCIA` e PULA o lançamento.
 *
 * Sem ela, uma categoria declarada como transferência — pagamento de fatura de
 * cartão, boleto entre contas próprias — cai no palpite por palavra-chave e
 * entra como DESPESA OPERACIONAL. O resultado sai menor, por dinheiro que só
 * mudou de bolso.
 *
 * ⚠️ **Medido em 21/08/2026, numa conferência de rotina:** a mesma organização
 * deu −R$ 784.743,23 sem a declaração contra −R$ 784.475,53 com ela. Os
 * R$ 267,70 de diferença são a fatura de cartão (167,70) e o boleto de
 * transferência (100,00) — e como a medição acontecia logo depois de um
 * backfill que tocou toda a tabela `movements`, o número errado se disfarçou de
 * REGRESSÃO. Quase virou um pedido para parar a rodada atrás de um defeito que
 * não existia.
 *
 * Ou seja: o erro daqui não produz um zero óbvio. Produz um valor plausível,
 * próximo do certo e do lado errado — que é o tipo que atravessa a revisão.
 *
 * **Ao reproduzir um número de tela fora da aplicação, passe
 * `linhaPorCategoria` (ver `getLinhasDeCategoria`) — ou aceite que
 * transferência virou despesa.**
 */
export async function getRiscoInput(): Promise<RiskInput> {
  const hoje = isoDay(new Date());
  if (isDemo) {
    const saldoAtual = seedAccounts().reduce((s, a) => s + a.balance, 0);
    // Dados importados (FDIP) já vêm com party_id = contraparteNorm e um cadastro
    // de parties; o seed determinístico usa a descrição como rótulo da contraparte.
    const imp = importedMovements();
    // Projeto e centro: o id mora NO MOVIMENTO (como `movements.project_id` em
    // produção). O vínculo antigo do navegador (`lib/projeto-vinculo`, id
    // "5001" do cadastro antigo) só é lido como QUEDA, para lançamentos feitos
    // antes da morada única — nenhuma tela escreve mais nele.
    const vinculos = vinculosProjeto();
    const nomeProjeto: Record<string, string> = {};
    for (const p of listProjetos()) nomeProjeto[p.id] = p.nome;
    for (const p of await listarProjetosCadastro()) nomeProjeto[p.id] = p.nome;
    const nomeCentro: Record<string, string> = {};
    for (const c of await listarCentrosCusto()) nomeCentro[c.id] = c.nome;
    // Resolve a contraparte por party_id (cadastro) OU pela descrição (seed).
    // Assim o seed NÃO perde os nomes quando um upload cria o dataset importado.
    const movements = (imp ?? DEMO_MOVEMENTS).map((m) => ({
      id: m.id,
      type: m.type,
      status: m.status,
      amount: m.amount,
      due_date: m.due_date,
      paid_date: m.paid_date,
      party_id: m.party_id ?? m.description ?? null,
      accountId: m.account_id ?? null,
      category: m.category,
      // CAMP-B: o centro trocado pela edição em massa (demonstração) vence o
      // centro do cadastro — senão a troca não apareceria em lugar nenhum.
      costCenter: (m as { centro_nome?: string | null }).centro_nome
        ?? (m.cost_center_id ? nomeCentro[m.cost_center_id] : null) ?? demoCostCenter(m.category),
      projeto: nomeProjeto[m.project_id ?? vinculos[m.id] ?? ""] ?? null,
      projetoId: m.project_id ?? null,
      centroId: m.cost_center_id ?? null,
      categoriaId: m.category_id ?? null,
      rateio: (m.splits ?? []).map((sp) => ({
        projeto: sp.project_id ? nomeProjeto[sp.project_id] ?? null : null,
        centro: sp.cost_center_id ? nomeCentro[sp.cost_center_id] ?? null : null,
        percentual: Number(sp.percent ?? 0),
        valor: Number(sp.amount ?? 0),
      })),
      parcelas: (m as { installment_total?: number | null }).installment_total ?? null,
      parcela: (m as { installment_no?: number | null }).installment_no ?? null,
      referenceCode: (m as { reference_code?: string | null }).reference_code ?? null,
      origem: (m as { origem?: string | null }).origem ?? null,
      lancadoPor: (m as { lancado_por?: string | null }).lancado_por ?? null,
    }));
    const partyNames: Record<string, string> = {};
    // Parties cadastradas (import) ganham o nome real…
    for (const p of importedParties() ?? []) partyNames[p.id] = p.name;
    // …e qualquer contraparte vinda da descrição (seed) mapeia para si mesma.
    movements.forEach((m) => {
      if (m.party_id && !partyNames[m.party_id]) partyNames[m.party_id] = m.party_id;
    });
    return {
      hoje, saldoAtual, movements, partyNames, horizonDias: 60,
      aberturaVerificada: resolverAberturaVerificada(true, seedAccounts().map((a) => contaDaLinha(a as LinhaConta))),
    };
  }

  const supabase = createClient();
  const COLUNAS_BASE =
    /**
   * ⚠️ **`situacao` ENTRA AQUI, e é uma mudança de comportamento declarada.**
   * `core/central.situacaoDe` PREFERE esta coluna quando ela vem — antes ela
   * nunca vinha, e a função sempre derivava do `status`. Ligá-la faz a Central
   * passar a ler a máquina de estados de verdade, que é o ponto.
   *
   * É seguro HOJE porque a coluna e a derivação concordam: medido em 24/08,
   * 2.230 de 2.230 lançamentos batem. E continua seguro amanhã porque
   * `npm run situacao` (no CI) reprova no primeiro título em que uma situação
   * DERIVÁVEL discordar do `status` — a divergência aparece antes do usuário.
   *
   * Sem isso, `titulosDaVisao` não teria como separar confirmado de previsto, e
   * o relatório continuaria misturando os dois sem dizer qual é qual.
   */
  "id,account_id,type,status,situacao,amount,due_date,paid_date,competence_date,description,party_id,category,origem,lancado_por,reference_code,installment_no,installment_total,category_id,cost_center_id,categoria:category_id(name),centro:cost_center_id(name)";
  /**
   * O embed do projeto depende da FK `movements.project_id → projects`
   * (migration `0019`, aplicada). Onde ela existe, o embed resolve.
   *
   * ⚠️ A tentativa é feita UMA VEZ por sessão e o resultado fica em
   * `embedProjetoOk`. Antes, cada chamada de `getRiscoInput` disparava um
   * request que o PostgREST recusava com **HTTP 400** e só então caía no select
   * base: o número certo aparecia na tela, mas o console e o painel de rede
   * acumulavam um 400 por carregamento. Erro que sempre acontece deixa de ser
   * lido — e é assim que o 400 de verdade, o dia em que aparecer, passa
   * despercebido.
   */
  const movimentos = async () => {
    if (embedProjetoOk !== false) {
      // ⚠️ O rateio (`movement_splits`) vem no MESMO embed: ele depende da
      // coluna `project_id` da 0019, e sem ela o lançamento continua lido.
      const comProjeto = await semAmostra(supabase.from("movements").select(
        `${COLUNAS_BASE},project_id,projeto:project_id(name),rateio:movement_splits(percent,amount,projeto:project_id(name),centro:cost_center_id(name))`,
      )).limit(TETO_LINHAS);
      if (!comProjeto.error) { embedProjetoOk = true; return comProjeto; }
      // Só o erro de relacionamento inexistente justifica a queda. Qualquer
      // outra falha (rede, RLS, timeout) é um problema real e tem de subir —
      // devolver dados parciais como se estivesse tudo bem é o que fazia a tela
      // exibir números incompletos com toda a confiança.
      if (!RELACAO_AUSENTE.test(comProjeto.error.message ?? "")) throw comProjeto.error;
      // ⚠️ A QUEDA É REPORTADA. Ela é a decisão certa em runtime — a tela abre
      // com os números certos — e por isso mesmo era invisível: a dimensão de
      // projeto sumia de TODOS os relatórios e ninguém tinha como saber. Foi
      // este caminho que atravessou meses. `degradado: true` é o que separa
      // "está tudo bem" de "está funcionando, e falta uma coisa".
      reportar(
        "movimentos.embedProjeto", comProjeto.error,
        "os relatórios ficam sem a dimensão de projeto até a migration 0019 ser aplicada",
        true,
      );
      embedProjetoOk = false;
    }
    return semAmostra(supabase.from("movements").select(COLUNAS_BASE)).limit(TETO_LINHAS);
  };
  /**
   * A abertura INFORMADA mora no cadastro da conta (`financial_accounts`,
   * migration `20260930180000`). Antes da migration as colunas não existem: a
   * consulta cai, REPORTA uma vez por sessão (mesmo desenho do embed do
   * projeto) e o Razão fica "não conferido" — que é a verdade até lá.
   */
  const contasConferidas = async () => {
    if (colunasCadastroOk === false) return [];
    const r = await supabase.from("financial_accounts")
      .select("id,name,bank,balance,saldo_inicial,data_saldo_inicial,saldo_inicial_conferido")
      .eq("saldo_inicial_conferido", true).limit(TETO_LINHAS);
    if (!r.error) { colunasCadastroOk = true; return ((r.data ?? []) as LinhaConta[]).map(contaDaLinha); }
    if (!COLUNA_AUSENTE.test(r.error.message ?? "")) throw r.error;
    reportar(
      "abertura.cadastroDaConta", r.error,
      "o Razão fica sem a abertura informada até a migration 20260930180000 ser aplicada",
      true,
    );
    colunasCadastroOk = false;
    return [];
  };
  const [accRes, movRes, partyRes, conferidas] = await Promise.all([
    supabase.from("financial_accounts").select("balance").limit(TETO_LINHAS),
    movimentos(),
    supabase.from("parties").select("id,name").limit(TETO_LINHAS),
    contasConferidas(),
  ]);
  if (accRes.error) throw accRes.error;
  if (movRes.error) throw movRes.error;
  // ⚠️ O MAPEADOR ÚNICO (`lib/risco-linhas`). Esta tela, a consolidação e o
  // runner de automações montam o `RiskInput` pela MESMA função — duas cópias
  // do mapeamento divergem na primeira coluna nova, e aí o resumo do caixa que
  // chega por e-mail discorda da Visão geral que a pessoa abre em seguida.
  // ⚠️ Só `movements.project_id`: o vínculo do navegador (id "5001" do
  // cadastro antigo) não existe para outra máquina e nunca casou com UUID —
  // por isso nenhuma queda local de projeto aqui.
  return linhasParaRiskInput({
    hoje,
    saldosDasContas: ((accRes.data ?? []) as { balance: number }[]).map((a) => a.balance),
    linhas: (movRes.data ?? []) as unknown as LinhaMovimento[],
    partes: (partyRes.data ?? []) as { id: string; name: string }[],
    // Em live só a fonte "informada" (cadastro) alimenta a abertura — o
    // `<LEDGERBAL>` importado ainda não persiste no servidor (ver lib/abertura).
    aberturaVerificada: resolverAberturaVerificada(false, conferidas),
  });
}

export async function getSales(months = 12): Promise<MonthlySalesPoint[]> {
  if (isDemo) {
    await demoDelay();
    return monthlySales(seedMovements(), months);
  }
  const supabase = createClient();
  const start = new Date();
  start.setMonth(start.getMonth() - (months - 1), 1);
  const { data, error } = await semAmostra(supabase
    .from("movements")
    .select("type,status,category,amount,due_date"))
    .eq("type", "entrada")
    .neq("status", "cancelado")
    .gte("due_date", isoDay(start)).limit(TETO_LINHAS);
  if (error) throw error;
  return monthlySales((data ?? []) as Movement[], months);
}
