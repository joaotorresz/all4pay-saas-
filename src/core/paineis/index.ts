/**
 * PAINÉIS — os dashboards fechados (financeiro, vendas, assinaturas, contas a
 * pagar/receber, calendário).
 *
 * Diferença para `core/dashboards`: lá o usuário MONTA o painel; aqui o painel
 * é curado, com uma pergunta definida por tela. O que os dois têm em comum é o
 * que importa — tudo sai do MESMO `RiskInput` do DRE/fluxo/risco, e o EBITDA
 * chega por `dreGerencial`, não por uma conta paralela. Nenhum número desta
 * pasta é digitado, estimado por fora ou "de exemplo".
 *
 * Puro, tipado, demo-safe. Versão paineis/1.0.0.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { dreGerencial } from "@/core/dre/engine";
import { mrr as mrrCanonico } from "@/core/indicadores";

export const PAINEIS_VERSION = "paineis/1.0.0";

/**
 * O MRR canônico é apurado a partir dos CONTRATOS quando eles existem, e só
 * cai nos lançamentos quando não existem. Aqui os contratos são a fonte, então
 * o `RiskInput` não é consultado — este é o input mínimo que satisfaz a
 * assinatura sem inventar dado.
 */
const SEM_MOVIMENTOS: RiskInput = { hoje: "1970-01-01", saldoAtual: 0, movements: [] };

/* ------------------------------- utilitários ------------------------------- */

/** Data de caixa: quando saiu/entrou de fato; senão, o vencimento. */
const diaCaixa = (m: RiskMovement) => (m.paid_date || m.due_date || "").slice(0, 10);
const mesDe = (iso: string) => iso.slice(0, 7);
const vivo = (m: RiskMovement) => m.status !== "cancelado";
const realizado = (m: RiskMovement) => m.status === "pago";
const round2 = (n: number) => Math.round(n * 100) / 100;

/** "2026-08" → "2026-08-31" (último dia; vale para qualquer mês/ano bissexto). */
export function fimDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m, 0); // dia 0 do mês seguinte = último dia deste
  return `${mes}-${String(d.getDate()).padStart(2, "0")}`;
}
export const inicioDoMes = (mes: string) => `${mes}-01`;

/** Desloca "2026-08" em N meses (N negativo volta). */
export function deslocarMes(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Os N meses que terminam em `mes` (do mais antigo ao mais recente). */
export function janelaMeses(mes: string, n: number): string[] {
  return Array.from({ length: n }, (_, k) => deslocarMes(mes, k - (n - 1)));
}

const MES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const rotuloMes = (mes: string) => `${MES_ABREV[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
const MES_LONGO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const rotuloMesAno = (mes: string) => `${MES_LONGO[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

/** Filtros comuns a todos os painéis — os três recortes que existem ponta a
 *  ponta no lançamento: conta, centro de custo e projeto. */
export interface FiltroPainel {
  conta?: string | null;
  centro?: string | null;
  /** Nome do projeto (o vínculo vem de `movements.project_id`). */
  projeto?: string | null;
}

export function aplicarFiltro(ms: RiskMovement[], f: FiltroPainel = {}): RiskMovement[] {
  return ms.filter((m) => {
    if (f.conta && m.accountId !== f.conta) return false;
    if (f.centro && m.costCenter !== f.centro) return false;
    if (f.projeto && m.projeto !== f.projeto) return false;
    return true;
  });
}

export interface Fatia { nome: string; valor: number }

function porCategoria(ms: RiskMovement[]): Fatia[] {
  const mapa = new Map<string, number>();
  for (const m of ms) {
    const c = (m.category || "Sem categoria").trim() || "Sem categoria";
    mapa.set(c, (mapa.get(c) ?? 0) + Math.abs(m.amount));
  }
  return Array.from(mapa, ([nome, valor]) => ({ nome, valor: round2(valor) })).sort((a, b) => b.valor - a.valor);
}

/* ============================== 1. FINANCEIRO ============================== */

export interface PainelFinanceiro {
  mes: string;
  /** Saldo em conta ao FIM do mês escolhido. */
  saldoNoMes: number;
  /** Entradas − saídas realizadas no mês. */
  geracaoMes: number;
  /** Geração somada desde o primeiro lançamento até o fim do mês. */
  geracaoAcumulada: number;
  entradas: Fatia[];
  saidas: Fatia[];
  totalEntradas: number;
  totalSaidas: number;
}

/**
 * O saldo de um mês PASSADO não está guardado em lugar nenhum — o que existe é
 * o saldo de hoje. Então volta-se no tempo: saldo de hoje menos tudo que foi
 * liquidado DEPOIS do fim daquele mês. Para o mês corrente o resultado é o
 * próprio saldo atual, como tem de ser.
 */
export function painelFinanceiro(input: RiskInput, mes: string, f: FiltroPainel = {}): PainelFinanceiro {
  const fim = fimDoMes(mes);
  const todos = input.movements.filter(vivo);
  const depois = todos
    .filter((m) => realizado(m) && diaCaixa(m) > fim)
    .reduce((s, m) => s + (m.type === "entrada" ? m.amount : -m.amount), 0);

  const ms = aplicarFiltro(todos, f);
  const doMes = ms.filter((m) => realizado(m) && mesDe(diaCaixa(m)) === mes);
  const entradasMs = doMes.filter((m) => m.type === "entrada");
  const saidasMs = doMes.filter((m) => m.type === "saida");
  const totalEntradas = round2(entradasMs.reduce((s, m) => s + Math.abs(m.amount), 0));
  const totalSaidas = round2(saidasMs.reduce((s, m) => s + Math.abs(m.amount), 0));

  const acumulada = ms
    .filter((m) => realizado(m) && diaCaixa(m) <= fim)
    .reduce((s, m) => s + (m.type === "entrada" ? m.amount : -m.amount), 0);

  return {
    mes,
    saldoNoMes: round2(input.saldoAtual - depois),
    geracaoMes: round2(totalEntradas - totalSaidas),
    geracaoAcumulada: round2(acumulada),
    entradas: porCategoria(entradasMs),
    saidas: porCategoria(saidasMs),
    totalEntradas,
    totalSaidas,
  };
}

/* ================================ 2. VENDAS ================================ */

/** Um mesmo indicador em três janelas — é como o print apresenta. */
export interface TresJanelas { mes: number; trimestre: number; ano: number }

export interface PainelVendas {
  mes: string;
  cac: TresJanelas;
  ltv: TresJanelas;
  ltvSobreCac: TresJanelas;
  ebitdaMes: number;
  ebitdaAno: number;
  /** EBITDA do mês ÷ receita do mês. */
  ebitdaPctReceita: number;
  faturamentoMes: number;
  reembolsos: { mes: number; ano: number };
  chargebacks: { mes: number; ano: number };
  vendasDaSemana: { label: string; valor: number }[];
  vendasDoAno: { label: string; valor: number }[];
  /** Clientes que pagaram alguma coisa no mês. */
  clientesAtivos: number;
  /** Clientes cuja PRIMEIRA receita caiu no mês. */
  clientesNovos: number;
}

const ehMarketing = (c?: string | null) => /marketing|an[úu]ncio|ads|publicidade|tr[áa]fego/i.test(c ?? "");
const ehReembolso = (c?: string | null) => /reembolso|estorno/i.test(c ?? "");

/** Movimentos realizados dentro de uma janela de meses. */
const naJanela = (ms: RiskMovement[], meses: string[]) => {
  const set = new Set(meses);
  return ms.filter((m) => realizado(m) && set.has(mesDe(diaCaixa(m))));
};

/**
 * CAC = quanto se gastou em marketing ÷ quantos clientes NOVOS entraram.
 * Sem cliente novo no período o CAC não existe (dividir por zero seria
 * inventar um número) — devolve 0 e a tela mostra o porquê.
 */
function cacDaJanela(todos: RiskMovement[], meses: string[]): { cac: number; novos: number } {
  const janela = naJanela(todos, meses);
  const gasto = janela.filter((m) => m.type === "saida" && ehMarketing(m.category)).reduce((s, m) => s + Math.abs(m.amount), 0);
  const novos = clientesNovosEm(todos, meses);
  return { cac: novos > 0 ? round2(gasto / novos) : 0, novos };
}

/** Cliente novo = aquele cuja PRIMEIRA receita da história cai na janela. */
function clientesNovosEm(todos: RiskMovement[], meses: string[]): number {
  const set = new Set(meses);
  const primeira = new Map<string, string>();
  for (const m of todos) {
    if (m.type !== "entrada" || !realizado(m) || !m.party_id) continue;
    const d = diaCaixa(m);
    const atual = primeira.get(m.party_id);
    if (!atual || d < atual) primeira.set(m.party_id, d);
  }
  let n = 0;
  primeira.forEach((d) => { if (set.has(mesDe(d))) n++; });
  return n;
}

/**
 * LTV = o que o cliente MÉDIO deixou no período, já descontado o custo médio.
 * Receita ÷ clientes que pagaram, multiplicado pela margem do mesmo período.
 * É uma medida do período — não uma projeção de vida inteira, que exigiria
 * churn confiável que a base ainda não tem.
 */
function ltvDaJanela(todos: RiskMovement[], meses: string[]): { ltv: number; clientes: number } {
  const janela = naJanela(todos, meses);
  const receita = janela.filter((m) => m.type === "entrada").reduce((s, m) => s + Math.abs(m.amount), 0);
  const despesa = janela.filter((m) => m.type === "saida").reduce((s, m) => s + Math.abs(m.amount), 0);
  const clientes = new Set(janela.filter((m) => m.type === "entrada" && m.party_id).map((m) => m.party_id)).size;
  if (clientes === 0 || receita <= 0) return { ltv: 0, clientes };
  const margem = (receita - despesa) / receita;
  return { ltv: round2((receita / clientes) * margem), clientes };
}

export function painelVendas(input: RiskInput, mes: string, f: FiltroPainel = {}): PainelVendas {
  const todos = aplicarFiltro(input.movements.filter(vivo), f);
  const cancelados = aplicarFiltro(input.movements.filter((m) => !vivo(m)), f);

  const jMes = [mes];
  const jTri = janelaMeses(mes, 3);
  const ano = mes.slice(0, 4);
  const jAno = Array.from({ length: 12 }, (_, k) => `${ano}-${String(k + 1).padStart(2, "0")}`);

  const c1 = cacDaJanela(todos, jMes), c3 = cacDaJanela(todos, jTri), c12 = cacDaJanela(todos, jAno);
  const l1 = ltvDaJanela(todos, jMes), l3 = ltvDaJanela(todos, jTri), l12 = ltvDaJanela(todos, jAno);
  const razao = (l: number, c: number) => (c > 0 ? Math.round((l / c) * 100) / 100 : 0);

  // EBITDA vem do MESMO motor do DRE — não de uma conta paralela.
  const dreMes = dreGerencial(naJanela(todos, jMes));
  const dreAno = dreGerencial(naJanela(todos, jAno));
  const receitaMes = dreMes.receitaBruta;

  const somaSe = (ms: RiskMovement[], meses: string[], fn: (m: RiskMovement) => boolean) =>
    round2(naJanela(ms, meses).filter(fn).reduce((s, m) => s + Math.abs(m.amount), 0));

  // Chargeback = venda que voltou atrás: entrada CANCELADA no período.
  const chargeback = (meses: string[]) => {
    const set = new Set(meses);
    return round2(cancelados
      .filter((m) => m.type === "entrada" && set.has(mesDe(m.paid_date || m.due_date || "")))
      .reduce((s, m) => s + Math.abs(m.amount), 0));
  };

  // Vendas da semana: os 7 dias que terminam no último dia do mês escolhido
  // (no mês corrente isso cai em "hoje", que é o que a tela quer mostrar).
  const ancora = mes === mesDe(input.hoje) ? input.hoje : fimDoMes(mes);
  const base = new Date(ancora + "T00:00:00");
  const vendasDaSemana = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - (6 - k));
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const valor = todos
      .filter((m) => m.type === "entrada" && realizado(m) && diaCaixa(m) === iso)
      .reduce((s, m) => s + Math.abs(m.amount), 0);
    return { label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, valor: round2(valor) };
  });

  // A curva PARA no mês corrente: um mês que ainda não aconteceu não vendeu
  // zero — ele não existe. Desenhar a queda até dezembro inventaria um tombo.
  const ultimoMes = mesDe(input.hoje) < jAno[11] ? mesDe(input.hoje) : jAno[11];
  const vendasDoAno = jAno
    .filter((m) => m <= ultimoMes)
    .map((m) => ({ label: rotuloMes(m), valor: somaSe(todos, [m], (x) => x.type === "entrada") }));

  return {
    mes,
    cac: { mes: c1.cac, trimestre: c3.cac, ano: c12.cac },
    ltv: { mes: l1.ltv, trimestre: l3.ltv, ano: l12.ltv },
    ltvSobreCac: { mes: razao(l1.ltv, c1.cac), trimestre: razao(l3.ltv, c3.cac), ano: razao(l12.ltv, c12.cac) },
    ebitdaMes: round2(dreMes.ebitda),
    ebitdaAno: round2(dreAno.ebitda),
    ebitdaPctReceita: receitaMes > 0 ? Math.round((dreMes.ebitda / receitaMes) * 1000) / 10 : 0,
    faturamentoMes: round2(receitaMes),
    reembolsos: {
      mes: somaSe(todos, jMes, (m) => m.type === "saida" && ehReembolso(m.category)),
      ano: somaSe(todos, jAno, (m) => m.type === "saida" && ehReembolso(m.category)),
    },
    chargebacks: { mes: chargeback(jMes), ano: chargeback(jAno) },
    vendasDaSemana,
    vendasDoAno,
    clientesAtivos: l1.clientes,
    clientesNovos: c1.novos,
  };
}

/* ============================= 3. ASSINATURAS ============================= */

/** A forma mínima de uma recorrência que o painel precisa (evita acoplar o
 *  motor puro ao store de `lib/recorrencias`). */
export interface AssinaturaBase {
  id: string;
  clienteId: string;
  clienteNome: string;
  status: "rascunho" | "ativa" | "pausada" | "cancelada";
  /** Valor da fatura do ciclo. */
  valorFatura: number;
  /** Quantos meses tem o ciclo (mensal = 1, anual = 12). */
  mesesCiclo: number;
  criadoEm: string;
  itens: { nome: string; valor: number; qtd: number }[];
}

export interface PainelAssinaturas {
  mes: string;
  mrr: number;
  arr: number;
  /** Variação % do MRR contra o mês anterior. */
  mrrVariacao: number;
  assinaturas: number;
  clientes: number;
  assinaturasVariacao: number;
  clientesVariacao: number;
  churn: number;
  serieMRR: { label: string; valor: number }[];
  serieAssinaturas: { label: string; assinaturas: number; clientes: number }[];
  produtos: { nome: string; assinaturas: number; mrr: number }[];
}

/**
 * MRR de um conjunto de assinaturas — delega ao indicador canônico
 * (`core/indicadores.mrr`). A normalização do ciclo (anual de 1.200 = 100/mês)
 * é a regra, e ela mora num lugar só: quatro implementações independentes de
 * MRR conviviam no sistema, e a do Investor Update usava outra definição
 * inteira.
 */
const mrrDoConjunto = (l: AssinaturaBase[]) =>
  mrrCanonico(SEM_MOVIMENTOS, l.map((a) => ({
    ativo: true, valorCiclo: a.valorFatura, mesesCiclo: a.mesesCiclo,
  }))).valor;

/** Vigente no mês = já existia e ainda não foi cancelada/pausada. Como o
 *  cadastro guarda só o status ATUAL, meses passados assumem vigente desde a
 *  criação — e o cancelamento vale do mês corrente em diante. */
const vigenteEm = (a: AssinaturaBase, mes: string, mesAtual: string) => {
  if (mesDe(a.criadoEm) > mes) return false;
  if (a.status === "rascunho") return false;
  if (a.status === "ativa") return true;
  return mes < mesAtual; // pausada/cancelada: contava até o mês corrente
};

export function painelAssinaturas(assinaturas: AssinaturaBase[], mes: string, hoje: string): PainelAssinaturas {
  const mesAtual = mesDe(hoje);
  const doMes = (m: string) => assinaturas.filter((a) => vigenteEm(a, m, mesAtual));

  const atuais = doMes(mes);
  const anteriores = doMes(deslocarMes(mes, -1));
  const mrr = round2(mrrDoConjunto(atuais));
  const mrrAnt = round2(mrrDoConjunto(anteriores));
  const varPct = (agora: number, antes: number) =>
    antes > 0 ? Math.round(((agora - antes) / antes) * 1000) / 10 : agora > 0 ? 100 : 0;

  const clientesDe = (l: AssinaturaBase[]) => new Set(l.map((a) => a.clienteId)).size;
  // Churn = quantas estavam vigentes no mês anterior e saíram neste.
  const idsAgora = new Set(atuais.map((a) => a.id));
  const perdidas = anteriores.filter((a) => !idsAgora.has(a.id)).length;

  const janela = janelaMeses(mes, 12);
  const produtos = new Map<string, { assinaturas: number; mrr: number }>();
  for (const a of atuais) {
    const total = a.itens.reduce((s, it) => s + it.valor * it.qtd, 0) || a.valorFatura;
    for (const it of a.itens) {
      const p = produtos.get(it.nome) ?? { assinaturas: 0, mrr: 0 };
      p.assinaturas += 1;
      // Rateia o MRR da assinatura pelo peso do item na fatura.
      p.mrr += total > 0 ? mrrDoConjunto([a]) * ((it.valor * it.qtd) / total) : 0;
      produtos.set(it.nome, p);
    }
  }

  return {
    mes,
    mrr,
    arr: round2(mrr * 12),
    mrrVariacao: varPct(mrr, mrrAnt),
    assinaturas: atuais.length,
    clientes: clientesDe(atuais),
    assinaturasVariacao: varPct(atuais.length, anteriores.length),
    clientesVariacao: varPct(clientesDe(atuais), clientesDe(anteriores)),
    churn: anteriores.length > 0 ? Math.round((perdidas / anteriores.length) * 1000) / 10 : 0,
    serieMRR: janela.map((m) => ({ label: rotuloMes(m), valor: round2(mrrDoConjunto(doMes(m))) })),
    serieAssinaturas: janela.map((m) => {
      const l = doMes(m);
      return { label: rotuloMes(m), assinaturas: l.length, clientes: clientesDe(l) };
    }),
    produtos: Array.from(produtos, ([nome, p]) => ({ nome, assinaturas: p.assinaturas, mrr: round2(p.mrr) }))
      .sort((a, b) => b.mrr - a.mrr),
  };
}

/* ======================= 4/5. CONTAS A PAGAR / RECEBER ======================= */

export type StatusTitulo = "liquidado" | "a_vencer" | "atrasado";

export interface GrupoTitulos {
  status: StatusTitulo;
  label: string;
  total: number;
  titulos: number;
  /** Fatia do total geral do período. */
  pct: number;
}

export interface PainelTitulos {
  de: string;
  ate: string;
  direcao: "pagar" | "receber";
  total: number;
  titulos: number;
  grupos: GrupoTitulos[];
  /** Um ponto por data de vencimento com movimento, na ordem do calendário. */
  vencimentos: { data: string; label: string; liquidado: number; aVencer: number; atrasado: number; total: number }[];
  /** As maiores contrapartes do período (quem se paga / quem paga). */
  contrapartes: { nome: string; valor: number; titulos: number }[];
}

const LABEL_STATUS: Record<StatusTitulo, Record<"pagar" | "receber", string>> = {
  liquidado: { pagar: "Pago", receber: "Recebido" },
  a_vencer: { pagar: "A vencer", receber: "A vencer" },
  atrasado: { pagar: "Atrasado", receber: "Atrasado" },
};

/**
 * A janela é por VENCIMENTO — é a data que responde "o que cai neste período".
 * Um título pago fora da janela mas vencido dentro dela continua sendo do
 * período; é assim que a cobrança e a tesouraria olham.
 */
export function painelTitulos(
  input: RiskInput,
  direcao: "pagar" | "receber",
  de: string,
  ate: string,
  f: FiltroPainel = {},
): PainelTitulos {
  const tipo = direcao === "pagar" ? "saida" : "entrada";
  const ms = aplicarFiltro(input.movements.filter(vivo), f).filter((m) => {
    if (m.type !== tipo) return false;
    const d = (m.due_date || "").slice(0, 10);
    return !!d && d >= de && d <= ate;
  });

  const statusDe = (m: RiskMovement): StatusTitulo =>
    realizado(m) ? "liquidado" : (m.due_date || "").slice(0, 10) < input.hoje ? "atrasado" : "a_vencer";

  const total = round2(ms.reduce((s, m) => s + Math.abs(m.amount), 0));
  const grupos = (["liquidado", "a_vencer", "atrasado"] as StatusTitulo[]).map((st) => {
    const l = ms.filter((m) => statusDe(m) === st);
    const t = round2(l.reduce((s, m) => s + Math.abs(m.amount), 0));
    return {
      status: st,
      label: LABEL_STATUS[st][direcao],
      total: t,
      titulos: l.length,
      pct: total > 0 ? Math.round((t / total) * 1000) / 10 : 0,
    };
  });

  const porDia = new Map<string, { liquidado: number; aVencer: number; atrasado: number }>();
  for (const m of ms) {
    const d = (m.due_date || "").slice(0, 10);
    const p = porDia.get(d) ?? { liquidado: 0, aVencer: 0, atrasado: 0 };
    const st = statusDe(m);
    const v = Math.abs(m.amount);
    if (st === "liquidado") p.liquidado += v; else if (st === "atrasado") p.atrasado += v; else p.aVencer += v;
    porDia.set(d, p);
  }

  const nomes = input.partyNames ?? {};
  const porParte = new Map<string, { valor: number; titulos: number }>();
  for (const m of ms) {
    const nome = (m.party_id && nomes[m.party_id]) || "Sem contraparte";
    const p = porParte.get(nome) ?? { valor: 0, titulos: 0 };
    p.valor += Math.abs(m.amount);
    p.titulos += 1;
    porParte.set(nome, p);
  }

  return {
    de,
    ate,
    direcao,
    total,
    titulos: ms.length,
    grupos,
    vencimentos: Array.from(porDia, ([data, p]) => ({
      data,
      label: `${data.slice(8, 10)}/${data.slice(5, 7)}`,
      liquidado: round2(p.liquidado),
      aVencer: round2(p.aVencer),
      atrasado: round2(p.atrasado),
      total: round2(p.liquidado + p.aVencer + p.atrasado),
    })).sort((a, b) => a.data.localeCompare(b.data)),
    contrapartes: Array.from(porParte, ([nome, p]) => ({ nome, valor: round2(p.valor), titulos: p.titulos }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8),
  };
}

/* =============================== 6. CALENDÁRIO =============================== */

export interface DiaCalendario {
  data: string;
  dia: number;
  /** Fora do mês exibido (preenchimento das bordas da grade). */
  foraDoMes: boolean;
  hoje: boolean;
  entradas: number;
  saidas: number;
  /** Entradas − saídas do dia. */
  fluxo: number;
  /** Saldo acumulado ao fim do dia. */
  saldo: number;
  movimentos: number;
}

export interface PainelCalendario {
  mes: string;
  dias: DiaCalendario[];
  totalEntradas: number;
  totalSaidas: number;
  /** Menor e maior fluxo diário do mês — a escala da coloração. */
  minFluxo: number;
  maxFluxo: number;
  minSaldo: number;
  maxSaldo: number;
}

/**
 * A grade sempre começa num domingo e fecha a semana, para o calendário não
 * ficar torto. Os dias das bordas vêm marcados `foraDoMes` e aparecem apagados.
 *
 * O saldo de cada dia é projetado a partir do saldo ao FIM do mês anterior,
 * somando o fluxo dia a dia — assim a última célula fecha no saldo que o
 * painel financeiro mostra para o mês.
 */
export function painelCalendario(input: RiskInput, mes: string, f: FiltroPainel = {}): PainelCalendario {
  const ms = aplicarFiltro(input.movements.filter(vivo), f);
  const inicio = inicioDoMes(mes);
  const fim = fimDoMes(mes);

  // Saldo ao fim do mês anterior (mesma reconstrução do painel financeiro).
  const depois = input.movements
    .filter((m) => vivo(m) && realizado(m) && diaCaixa(m) > fimDoMes(deslocarMes(mes, -1)))
    .reduce((s, m) => s + (m.type === "entrada" ? m.amount : -m.amount), 0);
  let saldo = round2(input.saldoAtual - depois);

  const porDia = new Map<string, { entradas: number; saidas: number; n: number }>();
  for (const m of ms) {
    // Previsto entra pelo vencimento; realizado, pela data de caixa.
    const d = (realizado(m) ? diaCaixa(m) : (m.due_date || "").slice(0, 10));
    if (!d || d < inicio || d > fim) continue;
    const p = porDia.get(d) ?? { entradas: 0, saidas: 0, n: 0 };
    if (m.type === "entrada") p.entradas += Math.abs(m.amount); else p.saidas += Math.abs(m.amount);
    p.n += 1;
    porDia.set(d, p);
  }

  const [ano, mm] = mes.split("-").map(Number);
  const primeiro = new Date(ano, mm - 1, 1);
  const ultimo = new Date(ano, mm, 0);
  const inicioGrade = new Date(ano, mm - 1, 1 - primeiro.getDay());
  const fimGrade = new Date(ano, mm - 1, ultimo.getDate() + (6 - ultimo.getDay()));
  const nDias = Math.round((fimGrade.getTime() - inicioGrade.getTime()) / 86400000) + 1;

  const dias: DiaCalendario[] = [];
  let totalEntradas = 0, totalSaidas = 0;
  for (let k = 0; k < nDias; k++) {
    const d = new Date(inicioGrade.getFullYear(), inicioGrade.getMonth(), inicioGrade.getDate() + k);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const fora = iso < inicio || iso > fim;
    const p = porDia.get(iso) ?? { entradas: 0, saidas: 0, n: 0 };
    const fluxo = round2(p.entradas - p.saidas);
    if (!fora) { totalEntradas += p.entradas; totalSaidas += p.saidas; saldo = round2(saldo + fluxo); }
    dias.push({
      data: iso,
      dia: d.getDate(),
      foraDoMes: fora,
      hoje: iso === input.hoje,
      entradas: round2(p.entradas),
      saidas: round2(p.saidas),
      fluxo,
      saldo,
      movimentos: p.n,
    });
  }

  const doMes = dias.filter((d) => !d.foraDoMes);
  const fluxos = doMes.map((d) => d.fluxo);
  const saldos = doMes.map((d) => d.saldo);
  return {
    mes,
    dias,
    totalEntradas: round2(totalEntradas),
    totalSaidas: round2(totalSaidas),
    minFluxo: fluxos.length ? Math.min(...fluxos) : 0,
    maxFluxo: fluxos.length ? Math.max(...fluxos) : 0,
    minSaldo: saldos.length ? Math.min(...saldos) : 0,
    maxSaldo: saldos.length ? Math.max(...saldos) : 0,
  };
}
