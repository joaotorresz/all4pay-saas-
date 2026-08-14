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
import {
  DEMO_ACCOUNTS,
  DEMO_MOVEMENTS,
  DEMO_CATEGORIES,
  DEMO_RECORRENCIAS,
  DEMO_COST_CENTERS,
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
import { importedMovements, importedAccounts, importedParties, updateImportedMovement, updateImportedAccount, removerImported, appendImported } from "@/lib/imported";
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
} from "@/lib/types";
import type { RiskInput } from "@/core/risk-engine/types";
import type { RegraRecorrente } from "@/core/contas-pagar/projecao";
import { TETO_LINHAS, semAmostra } from "@/lib/supabase/consulta";
import { reportar } from "@/lib/erros";

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
  const { error } = await supabase.from("movements").update({ status: "cancelado" }).eq("id", id);
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

/** Restaura um cancelado de volta para EM ABERTO (status → pendente). */
export async function restoreMovement(id: string): Promise<void> {
  if (isDemo) { updateImportedMovement(id, { status: "pendente" }); return; }
  const supabase = createClient();
  const { error } = await supabase.from("movements").update({ status: "pendente" }).eq("id", id);
  if (error) throw error;
}

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

export async function getCategories(kind: CategoryKind): Promise<Category[]> {
  if (isDemo) return DEMO_CATEGORIES.filter((c) => c.kind === kind);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id,kind,name")
    .eq("kind", kind)
    .eq("active", true)
    .order("name").limit(TETO_LINHAS);
  if (error) throw error;
  return (data ?? []) as Category[];
}

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
  if (isDemo) return {};
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

export async function criarCategoria(
  nome: string, kind: CategoryKind, dreLinha?: string | null,
): Promise<Category> {
  if (isDemo) {
    const nova = { id: `demo-cat-${Date.now()}`, kind, name: nome };
    DEMO_CATEGORIES.push(nova);
    return nova;
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .insert({ name: nome, kind, dre_linha: dreLinha ?? null })
    .select("id,kind,name")
    .single();
  if (error) throw error;
  return data as Category;
}

export async function getCostCenters(): Promise<CostCenter[]> {
  if (isDemo) return DEMO_COST_CENTERS;
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

export async function getParties(role: PartyRole): Promise<Party[]> {
  const col = `is_${role}` as const;
  if (isDemo)
    return DEMO_PARTIES.filter(
      (p) => (p as unknown as Record<string, unknown>)[col],
    );
  const supabase = createClient();
  const { data, error } = await supabase
    .from("parties")
    .select("id,type,name,doc,is_customer,is_supplier,is_carrier")
    .eq(col, true)
    .order("name").limit(TETO_LINHAS);
  if (error) throw error;
  return (data ?? []) as Party[];
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

/** Build the movement rows for a lançamento (handles parcelamento). */
function buildMovementRows(input: LancamentoInput, groupId: string) {
  const type: MovementType = input.kind === "receita" ? "entrada" : "saida";
  const n = Math.max(1, input.installments);
  const per = Math.round((exigirValor(input.amount) / n) * 100) / 100;
  const base = new Date(input.due_date);
  return Array.from({ length: n }, (_, i) => {
    const due = new Date(base);
    due.setMonth(base.getMonth() + i);
    const settledNow = input.settled && i === 0;
    return {
      account_id: input.account_id,
      type,
      status: settledNow ? "pago" : "pendente",
      category: null,
      category_id: exigirUUID(input.category_id, "categoria"),
      cost_center_id: exigirUUID(input.cost_center_id, "centro de custo"),
      project_id: exigirUUID(input.project_id ?? null, "projeto"),
      party_id: exigirUUID(input.party_id, "contato"),
      amount: per,
      due_date: isoDay(due),
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

/** Create a lançamento (Receita/Despesa) — movements (+ splits, recurrence). */
export async function createLancamento(input: LancamentoInput): Promise<void> {
  const groupId =
    globalThis.crypto?.randomUUID?.() ?? `grp-${Date.now()}`;

  if (isDemo) {
    await demoDelay();
    return; // demo: no write, the form just confirms success
  }

  const supabase = createClient();
  const rows = buildMovementRows(input, groupId);
  const { data: inserted, error } = await supabase
    .from("movements")
    .insert(rows)
    .select("id").limit(TETO_LINHAS);
  if (error) throw error;

  const firstId = inserted?.[0]?.id;
  if (input.splits?.length && firstId) {
    const { error: se } = await supabase.from("movement_splits").insert(
      input.splits.map((s) => ({
        movement_id: firstId,
        category_id: s.category_id,
        cost_center_id: s.cost_center_id,
        percent: s.percent,
      })),
    );
    if (se) throw se;
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
  description?: string | null;
  party_id?: string | null;
  status?: "pendente" | "pago";
  paid_date?: string | null;
  origem?: LancamentoInput["origem"];
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
          description: l.description ?? null,
          party_id: l.party_id ?? null,
          origem: l.origem ?? "manual",
        } as never,
      });
    });
    return;
  }

  const supabase = createClient();
  const { error } = await supabase.from("movements").insert(
    linhas.map((l) => ({
      account_id: l.account_id,
      type: l.type,
      status: l.status ?? "pendente",
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
    })),
  );
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

export async function getRiscoInput(): Promise<RiskInput> {
  const hoje = isoDay(new Date());
  if (isDemo) {
    const saldoAtual = seedAccounts().reduce((s, a) => s + a.balance, 0);
    // Dados importados (FDIP) já vêm com party_id = contraparteNorm e um cadastro
    // de parties; o seed determinístico usa a descrição como rótulo da contraparte.
    const imp = importedMovements();
    // Projeto: o vínculo local é a fonte síncrona (ver lib/projeto-vinculo).
    const vinculos = vinculosProjeto();
    const nomeProjeto: Record<string, string> = {};
    for (const p of listProjetos()) nomeProjeto[p.id] = p.nome;
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
      costCenter: demoCostCenter(m.category),
      projeto: nomeProjeto[vinculos[m.id] ?? ""] ?? null,
      parcelas: (m as { installment_total?: number | null }).installment_total ?? null,
      parcela: (m as { installment_no?: number | null }).installment_no ?? null,
      referenceCode: (m as { reference_code?: string | null }).reference_code ?? null,
    }));
    const partyNames: Record<string, string> = {};
    // Parties cadastradas (import) ganham o nome real…
    for (const p of importedParties() ?? []) partyNames[p.id] = p.name;
    // …e qualquer contraparte vinda da descrição (seed) mapeia para si mesma.
    movements.forEach((m) => {
      if (m.party_id && !partyNames[m.party_id]) partyNames[m.party_id] = m.party_id;
    });
    return { hoje, saldoAtual, movements, partyNames, horizonDias: 60 };
  }

  const supabase = createClient();
  const COLUNAS_BASE =
    "id,account_id,type,status,amount,due_date,paid_date,party_id,category,reference_code,installment_no,installment_total,categoria:category_id(name),centro:cost_center_id(name)";
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
      const comProjeto = await semAmostra(supabase.from("movements").select(`${COLUNAS_BASE},projeto:project_id(name)`)).limit(TETO_LINHAS);
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
  const [accRes, movRes, partyRes] = await Promise.all([
    supabase.from("financial_accounts").select("balance").limit(TETO_LINHAS),
    movimentos(),
    supabase.from("parties").select("id,name").limit(TETO_LINHAS),
  ]);
  if (accRes.error) throw accRes.error;
  if (movRes.error) throw movRes.error;
  const saldoAtual = (accRes.data ?? []).reduce(
    (s, a) => s + Number((a as { balance: number }).balance),
    0,
  );
  const vinculosLive = vinculosProjeto();
  const nomeProjetoLive: Record<string, string> = {};
  for (const p of listProjetos()) nomeProjetoLive[p.id] = p.nome;
  // ⚠️ O `select` traz um SUBCONJUNTO das colunas de `Movement` (sem
  // `reconciled`/`description`), então a asserção direta deixou de compilar ao
  // acrescentar as colunas de parcela. Passar por `unknown` é o que declara que
  // a forma vinda do PostgREST é parcial de propósito — e não um `any` solto,
  // que apagaria a checagem dos campos que o mapeamento usa.
  const movements = ((movRes.data ?? []) as unknown as (Pick<
    Movement, "id" | "type" | "status" | "amount" | "due_date" | "paid_date" | "party_id" | "account_id" | "category"
  > & {
    categoria?: unknown; centro?: unknown; projeto?: unknown;
    installment_no?: number | null; installment_total?: number | null;
  })[]).map((m) => ({
    id: m.id,
    type: m.type,
    status: m.status,
    amount: m.amount,
    due_date: m.due_date,
    paid_date: m.paid_date,
    party_id: m.party_id ?? null,
    accountId: m.account_id ?? null,
    // categoria real (nome do cadastro) tem prioridade sobre o texto livre
    category: embedName(m.categoria) ?? m.category,
    costCenter: embedName(m.centro),
    projeto: embedName(m.projeto) ?? nomeProjetoLive[vinculosLive[m.id] ?? ""] ?? null,
    // Parcela: separa o compromisso que ACABA do que continua (ver RiskMovement).
    parcelas: (m as { installment_total?: number | null }).installment_total ?? null,
    parcela: (m as { installment_no?: number | null }).installment_no ?? null,
    // A chave que liga o título à REGRA de recorrência que o gerou.
    referenceCode: (m as { reference_code?: string | null }).reference_code ?? null,
  }));
  const partyNames: Record<string, string> = {};
  (partyRes.data ?? []).forEach((p) => {
    const row = p as { id: string; name: string };
    partyNames[row.id] = row.name;
  });
  return { hoje, saldoAtual, movements, partyNames, horizonDias: 60 };
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
