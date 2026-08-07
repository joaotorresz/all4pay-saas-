/**
 * MOVIMENTAÇÕES FINANCEIRAS — títulos, transferências, extrato, fatura de
 * cartão e as regras de conciliação.
 *
 * É a camada operacional do dinheiro: o que vence, o que já caiu, o que andou
 * entre contas. Tudo sai do MESMO `RiskInput` do DRE/fluxo/risco — nenhum
 * número aqui é digitado por fora nem recalculado por um caminho paralelo.
 *
 * Puro, tipado, demo-safe. Versão movimentacoes/1.0.0.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

export const MOVIMENTACOES_VERSION = "movimentacoes/1.0.0";

const round2 = (n: number) => Math.round(n * 100) / 100;
const dia = (s?: string | null) => (s ?? "").slice(0, 10);
const vivo = (m: RiskMovement) => m.status !== "cancelado";

/* ============================== 1. os títulos ============================== */

export type Direcao = "receber" | "pagar";
export type StatusTitulo = "liquidado" | "aberto" | "atrasado";

export interface CardResumo {
  id: StatusTitulo | "total";
  label: string;
  valor: number;
  quantidade: number;
  /** Fatia do total geral — o que o anel do card desenha. */
  percentual: number;
}

export interface FiltroTitulos {
  de?: string | null;
  ate?: string | null;
  conta?: string | null;
  categoria?: string | null;
  parte?: string | null;
  status?: StatusTitulo | "todos";
  busca?: string;
}

export const statusDoTitulo = (m: RiskMovement, hoje: string): StatusTitulo =>
  m.status === "pago" ? "liquidado" : dia(m.due_date) < hoje ? "atrasado" : "aberto";

const semAcento = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * A janela é por VENCIMENTO — é a data que responde "o que cai no período".
 * Um título pago fora da janela mas vencido dentro dela continua sendo do
 * período; é assim que a cobrança e a tesouraria olham.
 */
export function filtrarTitulos(
  input: RiskInput,
  direcao: Direcao,
  f: FiltroTitulos = {},
): RiskMovement[] {
  const tipo = direcao === "receber" ? "entrada" : "saida";
  const q = semAcento((f.busca ?? "").trim());
  const nomes = input.partyNames ?? {};
  return input.movements.filter((m) => {
    if (!vivo(m) || m.type !== tipo) return false;
    const d = dia(m.due_date);
    if (f.de && d < f.de) return false;
    if (f.ate && d > f.ate) return false;
    if (f.conta && m.accountId !== f.conta) return false;
    if (f.categoria && m.category !== f.categoria) return false;
    if (f.parte && m.party_id !== f.parte) return false;
    if (f.status && f.status !== "todos" && statusDoTitulo(m, input.hoje) !== f.status) return false;
    if (!q) return true;
    const alvo = [m.id, m.category, m.party_id && nomes[m.party_id], String(m.amount)];
    return alvo.some((s) => s && semAcento(String(s)).includes(q));
  }).sort((a, b) => dia(b.due_date).localeCompare(dia(a.due_date)));
}

const LABELS: Record<Direcao, Record<StatusTitulo, string>> = {
  receber: { liquidado: "Contas recebidas", aberto: "Contas a receber", atrasado: "Contas atrasadas" },
  pagar: { liquidado: "Contas pagas", aberto: "Contas a pagar", atrasado: "Contas atrasadas" },
};

/** Os 4 cards do topo: cada um com valor, quantidade e % do total. */
export function resumoTitulos(ms: RiskMovement[], direcao: Direcao, hoje: string): CardResumo[] {
  const total = round2(ms.reduce((s, m) => s + Math.abs(m.amount), 0));
  const grupo = (st: StatusTitulo): CardResumo => {
    const l = ms.filter((m) => statusDoTitulo(m, hoje) === st);
    const v = round2(l.reduce((s, m) => s + Math.abs(m.amount), 0));
    return {
      id: st, label: LABELS[direcao][st], valor: v, quantidade: l.length,
      percentual: total > 0 ? Math.round((v / total) * 1000) / 10 : 0,
    };
  };
  return [
    grupo("liquidado"), grupo("aberto"), grupo("atrasado"),
    { id: "total", label: "Total", valor: total, quantidade: ms.length, percentual: total > 0 ? 100 : 0 },
  ];
}

/* ============================ 2. transferências ============================ */

/**
 * Uma transferência é UM fato com DOIS lados: sai de uma conta e entra em
 * outra. Guardá-la como um registro só (e não como dois lançamentos soltos) é o
 * que impede o fluxo de caixa de contar o dinheiro duas vezes — a transferência
 * não é receita nem despesa, é deslocamento.
 */
export interface Transferencia {
  id: string;
  contaOrigem: string;
  contaDestino: string;
  data: string;
  /** Quando o dinheiro CHEGA, se diferente do dia em que saiu (TED D+1). */
  dataChegada: string | null;
  valor: number;
  descricao: string;
  conciliadaOrigem: boolean;
  conciliadaDestino: boolean;
  criadoEm: string;
}

export function validarTransferencia(t: Partial<Transferencia>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!t.contaOrigem) e.contaOrigem = "Selecione a conta de origem.";
  if (!t.contaDestino) e.contaDestino = "Selecione a conta de destino.";
  // Transferir para a mesma conta não move nada e sujaria o extrato com duas
  // linhas que se anulam.
  if (t.contaOrigem && t.contaOrigem === t.contaDestino) e.contaDestino = "A conta de destino é igual à de origem.";
  if (!t.valor || t.valor <= 0) e.valor = "Informe o valor da transferência.";
  if (!t.data) e.data = "Informe a data da transferência.";
  if (t.dataChegada && t.data && t.dataChegada < t.data) e.dataChegada = "A chegada é anterior à saída.";
  return e;
}

export interface ResumoTransferencias { total: number; valor: number; noMes: number }

export function resumoTransferencias(ts: Transferencia[], hoje: string): ResumoTransferencias {
  const mes = hoje.slice(0, 7);
  return {
    total: ts.length,
    valor: round2(ts.reduce((s, t) => s + t.valor, 0)),
    noMes: ts.filter((t) => t.data.slice(0, 7) === mes).length,
  };
}

export interface FiltroTransferencias {
  de?: string | null;
  ate?: string | null;
  origem?: string | null;
  destino?: string | null;
  /** "sim" = ambas conciliadas · "nao" = falta alguma. */
  conciliacao?: "todas" | "sim" | "nao";
}

export function filtrarTransferencias(ts: Transferencia[], f: FiltroTransferencias = {}): Transferencia[] {
  return ts.filter((t) => {
    if (f.de && t.data < f.de) return false;
    if (f.ate && t.data > f.ate) return false;
    if (f.origem && t.contaOrigem !== f.origem) return false;
    if (f.destino && t.contaDestino !== f.destino) return false;
    if (f.conciliacao === "sim" && !(t.conciliadaOrigem && t.conciliadaDestino)) return false;
    if (f.conciliacao === "nao" && t.conciliadaOrigem && t.conciliadaDestino) return false;
    return true;
  }).sort((a, b) => b.data.localeCompare(a.data));
}

/* ============================== 3. o extrato ============================== */

export interface LinhaExtrato {
  id: string;
  data: string;
  descricao: string;
  categoria: string | null;
  tipo: "entrada" | "saida";
  valor: number;
  /** Saldo da conta DEPOIS deste lançamento. */
  saldo: number;
  conciliado: boolean;
}

/**
 * Extrato de uma conta no período, com saldo corrente.
 *
 * O saldo de abertura não fica guardado: parte-se do saldo ATUAL da conta e
 * desfaz-se o que foi liquidado a partir do início do período — a mesma técnica
 * do painel financeiro, para os dois fecharem no mesmo número.
 */
export function extratoDaConta(
  input: RiskInput,
  contaId: string,
  de: string,
  ate: string,
  saldoAtualDaConta: number,
): { abertura: number; linhas: LinhaExtrato[]; entradas: number; saidas: number; fechamento: number } {
  const daConta = input.movements.filter((m) => vivo(m) && m.accountId === contaId && m.status === "pago");
  const depoisDoInicio = daConta
    .filter((m) => dia(m.paid_date || m.due_date) >= de)
    .reduce((s, m) => s + (m.type === "entrada" ? m.amount : -m.amount), 0);
  let saldo = round2(saldoAtualDaConta - depoisDoInicio);
  const abertura = saldo;

  const nomes = input.partyNames ?? {};
  const noPeriodo = daConta
    .filter((m) => {
      const d = dia(m.paid_date || m.due_date);
      return d >= de && d <= ate;
    })
    .sort((a, b) => dia(a.paid_date || a.due_date).localeCompare(dia(b.paid_date || b.due_date)));

  let entradas = 0, saidas = 0;
  const linhas = noPeriodo.map((m) => {
    const v = Math.abs(m.amount);
    if (m.type === "entrada") entradas += v; else saidas += v;
    saldo = round2(saldo + (m.type === "entrada" ? v : -v));
    return {
      id: m.id,
      data: dia(m.paid_date || m.due_date),
      descricao: (m.party_id && nomes[m.party_id]) || m.category || "Movimento",
      categoria: m.category ?? null,
      tipo: m.type,
      valor: round2(v),
      saldo,
      conciliado: false,
    } as LinhaExtrato;
  });

  return { abertura, linhas, entradas: round2(entradas), saidas: round2(saidas), fechamento: saldo };
}

/* =========================== 4. fatura do cartão =========================== */

export type StatusFatura = "aberta" | "fechada" | "paga" | "parcial";

export interface Fatura {
  id: string;
  contaId: string;
  cartao: string;
  /** Ciclo: a fatura fecha no dia de fechamento e vence no de vencimento. */
  fechamento: string;
  vencimento: string;
  total: number;
  pago: number;
  status: StatusFatura;
  lancamentos: string[];
}

/** Data segura: dia 31 em fevereiro vira o último dia do mês. */
function dataDoMes(ano: number, mes0: number, d: number): string {
  const ultimo = new Date(ano, mes0 + 1, 0).getDate();
  const dd = Math.min(Math.max(1, d), ultimo);
  return `${ano}-${String(mes0 + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/**
 * Agrupa as despesas de um cartão em FATURAS por ciclo.
 *
 * O ciclo é o que define a fatura: uma compra depois do fechamento cai na
 * fatura do mês SEGUINTE, não na que está fechando. Errar isso muda o mês em
 * que a despesa aparece no caixa.
 */
export function faturasDoCartao(
  input: RiskInput,
  cartao: { id: string; nome: string; diaFechamento: number; diaVencimento: number },
  de: string,
  ate: string,
): Fatura[] {
  const desp = input.movements.filter((m) => vivo(m) && m.accountId === cartao.id && m.type === "saida");
  const porCiclo = new Map<string, { movs: RiskMovement[]; pago: number; total: number }>();

  for (const m of desp) {
    const d = dia(m.paid_date || m.due_date);
    if (!d) continue;
    const [a, mm, dd] = d.split("-").map(Number);
    // Depois do fechamento → a compra pertence ao ciclo do mês seguinte.
    const desloca = dd > cartao.diaFechamento ? 1 : 0;
    const ref = new Date(a, mm - 1 + desloca, 1);
    const chave = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
    if (!porCiclo.has(chave)) porCiclo.set(chave, { movs: [], pago: 0, total: 0 });
    const c = porCiclo.get(chave)!;
    c.movs.push(m);
    c.total += Math.abs(m.amount);
    if (m.status === "pago") c.pago += Math.abs(m.amount);
  }

  const hoje = input.hoje;
  const out: Fatura[] = [];
  porCiclo.forEach((c, chave) => {
    const [a, mm] = chave.split("-").map(Number);
    const fechamento = dataDoMes(a, mm - 1, cartao.diaFechamento);
    const vencimento = dataDoMes(a, mm - 1, cartao.diaVencimento);
    if (vencimento < de || vencimento > ate) return;
    const total = round2(c.total);
    const pago = round2(c.pago);
    const status: StatusFatura =
      pago >= total && total > 0 ? "paga"
        : pago > 0 ? "parcial"
        : fechamento <= hoje ? "fechada"
        : "aberta";
    out.push({
      id: `${cartao.id}-${chave}`, contaId: cartao.id, cartao: cartao.nome,
      fechamento, vencimento, total, pago, status,
      lancamentos: c.movs.map((m) => m.id),
    });
  });
  return out.sort((a, b) => b.vencimento.localeCompare(a.vencimento));
}

/* ========================== 5. fluxo de caixa mensal ========================== */

export interface FluxoMensal {
  mes: string;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  transferenciaEntrada: number;
  transferenciaSaida: number;
  saldoFinal: number;
  linhas: { data: string; descricao: string; tipo: "entrada" | "saida"; valor: number; saldo: number }[];
}

/**
 * O fluxo do mês por conta(s). Transferências entram em colunas PRÓPRIAS: elas
 * mexem no saldo da conta mas não são receita nem despesa — misturá-las com
 * entradas/saídas inflaria o faturamento com dinheiro que já era da empresa.
 */
export function fluxoCaixaMensal(
  input: RiskInput,
  mes: string,
  contas: string[],
  transferencias: Transferencia[],
  saldoDasContas: number,
): FluxoMensal {
  const de = `${mes}-01`;
  const [a, mm] = mes.split("-").map(Number);
  const ate = dataDoMes(a, mm - 1, 31);
  const escopo = (id?: string | null) => contas.length === 0 || (id != null && contas.includes(id));

  const pagos = input.movements.filter((m) => vivo(m) && m.status === "pago" && escopo(m.accountId));
  const depois = pagos
    .filter((m) => dia(m.paid_date || m.due_date) >= de)
    .reduce((s, m) => s + (m.type === "entrada" ? m.amount : -m.amount), 0);
  const transfDepois = transferencias
    .filter((t) => t.data >= de)
    .reduce((s, t) => s + (escopo(t.contaDestino) ? t.valor : 0) - (escopo(t.contaOrigem) ? t.valor : 0), 0);
  const saldoInicial = round2(saldoDasContas - depois - transfDepois);

  const doMes = pagos.filter((m) => {
    const d = dia(m.paid_date || m.due_date);
    return d >= de && d <= ate;
  });
  const entradas = round2(doMes.filter((m) => m.type === "entrada").reduce((s, m) => s + Math.abs(m.amount), 0));
  const saidas = round2(doMes.filter((m) => m.type === "saida").reduce((s, m) => s + Math.abs(m.amount), 0));

  const tsMes = transferencias.filter((t) => t.data >= de && t.data <= ate);
  const transferenciaEntrada = round2(tsMes.filter((t) => escopo(t.contaDestino)).reduce((s, t) => s + t.valor, 0));
  const transferenciaSaida = round2(tsMes.filter((t) => escopo(t.contaOrigem)).reduce((s, t) => s + t.valor, 0));

  const nomes = input.partyNames ?? {};
  let saldo = saldoInicial;
  const linhas = [
    ...doMes.map((m) => ({
      data: dia(m.paid_date || m.due_date),
      descricao: (m.party_id && nomes[m.party_id]) || m.category || "Movimento",
      tipo: m.type, valor: Math.abs(m.amount),
    })),
    ...tsMes.flatMap((t) => [
      ...(escopo(t.contaOrigem) ? [{ data: t.data, descricao: `Transferência enviada${t.descricao ? ` · ${t.descricao}` : ""}`, tipo: "saida" as const, valor: t.valor }] : []),
      ...(escopo(t.contaDestino) ? [{ data: t.dataChegada || t.data, descricao: `Transferência recebida${t.descricao ? ` · ${t.descricao}` : ""}`, tipo: "entrada" as const, valor: t.valor }] : []),
    ]),
  ].sort((x, y) => x.data.localeCompare(y.data))
    .map((l) => {
      saldo = round2(saldo + (l.tipo === "entrada" ? l.valor : -l.valor));
      return { ...l, valor: round2(l.valor), saldo };
    });

  return {
    mes, saldoInicial, entradas, saidas, transferenciaEntrada, transferenciaSaida,
    saldoFinal: round2(saldo), linhas,
  };
}

/* ======================= 6. regras de conciliação ======================= */

export type TipoTransacaoOFX = "conta_receber" | "conta_pagar" | "transferencia_recebida" | "transferencia_enviada";
export type FuncaoRegra = "pesquisar_conciliar" | "sugerir" | "criar_conciliar" | "criar_sugerir" | "ignorar";

export const TIPOS_OFX: { id: TipoTransacaoOFX; label: string }[] = [
  { id: "conta_receber", label: "Conta a Receber" },
  { id: "conta_pagar", label: "Conta a Pagar" },
  { id: "transferencia_recebida", label: "Transferência Recebida" },
  { id: "transferencia_enviada", label: "Transferência Enviada" },
];

export const FUNCOES_REGRA: { id: FuncaoRegra; label: string; ajuda: string }[] = [
  { id: "pesquisar_conciliar", label: "Pesquisar e conciliar", ajuda: "Procura o lançamento correspondente e concilia sozinho." },
  { id: "sugerir", label: "Sugestão de conciliação", ajuda: "Procura e propõe — a baixa fica esperando confirmação." },
  { id: "criar_conciliar", label: "Criar e conciliar", ajuda: "Não achou lançamento: cria um e já concilia." },
  { id: "criar_sugerir", label: "Criar e sugerir", ajuda: "Não achou: propõe criar o lançamento." },
  { id: "ignorar", label: "Ignorar transação", ajuda: "A transação não vira lançamento — use para movimentos internos." },
];

export interface RegraConciliacao {
  id: string;
  nome: string;
  descricao: string;
  contas: string[];
  tipo: TipoTransacaoOFX;
  funcao: FuncaoRegra;
  /** Casa por trecho da descrição do extrato (opcional). */
  contem: string;
  ativa: boolean;
  criadaEm: string;
  usos: number;
}

export function validarRegra(r: Partial<RegraConciliacao>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!r.nome?.trim()) e.nome = "Informe o nome da regra.";
  if ((r.descricao?.length ?? 0) > 255) e.descricao = "A descrição passa de 255 caracteres.";
  if (!r.contas?.length) e.contas = "Selecione ao menos uma conta bancária.";
  if (!r.tipo) e.tipo = "Selecione o tipo da transação OFX.";
  if (!r.funcao) e.funcao = "Selecione a função da regra.";
  return e;
}

export interface TransacaoOFX {
  id: string;
  contaId: string;
  data: string;
  valor: number;
  descricao: string;
  tipo: TipoTransacaoOFX;
}

/**
 * A primeira regra que casa vence — como num firewall. A ORDEM da lista é a
 * prioridade, e o desempate é arrastar a regra para cima: sem pesos, o usuário
 * entende por que uma ganhou da outra.
 */
export function regraQueCasa(t: TransacaoOFX, regras: RegraConciliacao[]): RegraConciliacao | null {
  const desc = semAcento(t.descricao);
  for (const r of regras) {
    if (!r.ativa) continue;
    if (r.tipo !== t.tipo) continue;
    if (r.contas.length && !r.contas.includes(t.contaId)) continue;
    if (r.contem.trim() && !desc.includes(semAcento(r.contem.trim()))) continue;
    return r;
  }
  return null;
}

export interface ResultadoConciliacao {
  transacao: TransacaoOFX;
  regra: RegraConciliacao | null;
  /** O lançamento candidato, quando a regra manda procurar. */
  candidato: RiskMovement | null;
  acao: "conciliar" | "sugerir" | "criar" | "propor_criacao" | "ignorar" | "sem_regra";
}

/**
 * Casa a transação do extrato com um lançamento: mesmo sinal, valor dentro de
 * 1% e vencimento a até 5 dias da data do extrato. A tolerância existe porque
 * banco e sistema raramente batem no centavo e no dia; sem ela, quase nada
 * conciliaria sozinho.
 */
export function candidatoPara(t: TransacaoOFX, input: RiskInput): RiskMovement | null {
  const querEntrada = t.tipo === "conta_receber" || t.tipo === "transferencia_recebida";
  const abertos = input.movements.filter((m) =>
    vivo(m) && m.status === "pendente" && m.type === (querEntrada ? "entrada" : "saida"));
  const alvo = Math.abs(t.valor);
  let melhor: RiskMovement | null = null;
  let melhorDist = Infinity;
  for (const m of abertos) {
    const v = Math.abs(m.amount);
    if (Math.abs(v - alvo) > alvo * 0.01) continue;
    const dist = Math.abs(new Date(dia(m.due_date) + "T00:00:00").getTime() - new Date(t.data + "T00:00:00").getTime()) / 86_400_000;
    if (dist > 5) continue;
    if (dist < melhorDist) { melhor = m; melhorDist = dist; }
  }
  return melhor;
}

export function conciliar(
  transacoes: TransacaoOFX[],
  regras: RegraConciliacao[],
  input: RiskInput,
): ResultadoConciliacao[] {
  return transacoes.map((t) => {
    const regra = regraQueCasa(t, regras);
    if (!regra) return { transacao: t, regra: null, candidato: null, acao: "sem_regra" as const };
    if (regra.funcao === "ignorar") return { transacao: t, regra, candidato: null, acao: "ignorar" as const };
    const candidato = candidatoPara(t, input);
    if (regra.funcao === "pesquisar_conciliar") {
      return { transacao: t, regra, candidato, acao: candidato ? ("conciliar" as const) : ("sem_regra" as const) };
    }
    if (regra.funcao === "sugerir") {
      return { transacao: t, regra, candidato, acao: candidato ? ("sugerir" as const) : ("sem_regra" as const) };
    }
    // "Criar…" só age quando NÃO achou: criar em cima de um lançamento que já
    // existe é o caminho mais curto para duplicar o financeiro.
    if (regra.funcao === "criar_conciliar") {
      return { transacao: t, regra, candidato, acao: candidato ? ("conciliar" as const) : ("criar" as const) };
    }
    return { transacao: t, regra, candidato, acao: candidato ? ("sugerir" as const) : ("propor_criacao" as const) };
  });
}
