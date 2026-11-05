/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O AGENTE DE CAIXA (Etapa 7 do plano "AI first", 04/11/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Todo dia de manhã ele olha o caixa dos próximos dias e procura o FURO: o
 * primeiro dia em que o saldo projetado fica negativo. O saldo de cada dia é o
 * do indicador canônico (`core/indicadores.saldo`), o MESMO da Visão geral:
 * o agente não tem conta de caixa própria.
 *
 * Achando o furo, ele propõe as contas que o cobrem:
 *  - ADIAR um pagamento que vence até o dia do furo;
 *  - ANTECIPAR um recebimento que vence depois dele.
 * Uma proposta por conta, as maiores primeiro, até cobrir o que falta.
 *
 * ⚠️ O "Aprovar" NÃO muda nada (decisão do dono, 04/11/2026): ele abre a conta
 * sugerida, na tela de sempre, para a pessoa negociar ou ajustar. O agente
 * nunca move dinheiro nem muda vencimento, e o nível máximo é 1 (o banco
 * recusa mais que isso).
 *
 * ⚠️ A chave é a conta E o dia do furo (`adiar:<conta>:<dia>`): se o furo
 * muda de dia, ou some, a proposta antiga expira e não fica sugerindo algo
 * que já não resolve.
 *
 * Puro: nada de banco, relógio ou provedor.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { saldo, valorOuNulo } from "@/core/indicadores";
import { janela } from "@/core/indicadores/janela";
import { rotear, type ConfigAgente, type Destino } from "./index";

/** Quantos dias à frente ele vigia ("o caixa da semana"). */
export const HORIZONTE_CAIXA_DIAS = 7;
/** Até quando um recebimento ainda é "antecipável" (dias depois de hoje). */
export const JANELA_ANTECIPAR_DIAS = 30;
/** No máximo, quantas sugestões de cada tipo por furo. */
export const MAX_SUGESTOES = 3;

export type AcaoCaixa = "adiar" | "antecipar";

export interface Furo {
  /** O primeiro dia em que o saldo projetado fica negativo. */
  dia: string;
  /** O saldo projetado nesse dia (negativo). */
  saldoNoDia: number;
  /** O pior saldo da semana a partir do furo: o quanto falta cobrir é −isto. */
  pior: number;
}

export interface PropostaDeCaixa {
  chave: string;
  titulo: string;
  porque: string;
  valor: number;
  dados: { acao: AcaoCaixa; movimento: string; furo: string; falta: number; href: string };
}

const addDias = (iso: string, n: number): string => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const dataBR = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
};

const brl = (n: number) =>
  `R$\u00a0${Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const chaveDoCaixa = (acao: AcaoCaixa, movimento: string, furo: string) => `${acao}:${movimento}:${furo}`;

/** O dia do furo que uma chave carrega (o último pedaço). */
export const furoDaChave = (chave: string): string => chave.slice(chave.lastIndexOf(":") + 1);

/**
 * O furo da semana, pelo saldo canônico de cada dia. Nulo quando o caixa não
 * fica negativo, ou quando não há saldo para medir (sem conta cadastrada:
 * zero não é ausência, e o agente não avisa furo de um caixa que não existe).
 */
export function acharFuro(input: RiskInput, hoje: string, dias = HORIZONTE_CAIXA_DIAS): Furo | null {
  let furo: Furo | null = null;
  for (let i = 0; i <= dias; i++) {
    const dia = addDias(hoje, i);
    const s = valorOuNulo(saldo(input, janela(hoje, dia)));
    if (s == null) return null;
    if (!furo && s < 0) furo = { dia, saldoNoDia: s, pior: s };
    else if (furo && s < furo.pior) furo.pior = s;
  }
  return furo;
}

const nomeDe = (input: RiskInput, m: RiskMovement) =>
  (m.party_id && input.partyNames?.[m.party_id]) || m.descricao || m.category || "Sem nome";

/** O endereço da conta na tela de sempre (o painel, já buscando por ela). */
export function enderecoDaConta(m: RiskMovement, nome: string): string {
  const base = m.type === "saida" ? "/contas-a-pagar/painel-de-despesas" : "/contas-a-receber/painel-de-vendas";
  return `${base}?busca=${encodeURIComponent(nome)}`;
}

/** As maiores primeiro, até cobrir o que falta (e no máximo `MAX_SUGESTOES`). */
function cobrir(candidatas: RiskMovement[], falta: number): RiskMovement[] {
  const out: RiskMovement[] = [];
  let coberto = 0;
  for (const m of [...candidatas].sort((a, b) => b.amount - a.amount || a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id))) {
    if (coberto >= falta || out.length >= MAX_SUGESTOES) break;
    out.push(m);
    coberto += m.amount;
  }
  return out;
}

/**
 * As propostas do dia: as contas a adiar e a antecipar que cobrem o furo, sem
 * repetir o que já teve proposta para o mesmo furo (esperando, ou que terminou:
 * a recusada não volta enquanto o furo for o mesmo).
 */
export function propostasDeCaixa(input: RiskInput, hoje: string, jaPropostas: ReadonlySet<string>): { furo: Furo | null; propostas: PropostaDeCaixa[] } {
  const furo = acharFuro(input, hoje);
  if (!furo) return { furo: null, propostas: [] };
  const falta = Math.round(-furo.pior * 100) / 100;
  const pendente = (m: RiskMovement) => m.status === "pendente" && m.situacao !== "cancelado" && m.amount > 0 && !!m.due_date;

  // Adiar: o pagamento que sai entre hoje e o dia do furo (é ele que cava o buraco).
  const adiaveis = input.movements.filter((m) => pendente(m) && m.type === "saida"
    && m.due_date.slice(0, 10) >= hoje && m.due_date.slice(0, 10) <= furo.dia);
  // Antecipar: o recebimento que só chega depois do furo, mas logo.
  const limite = addDias(hoje, JANELA_ANTECIPAR_DIAS);
  const antecipaveis = input.movements.filter((m) => pendente(m) && m.type === "entrada"
    && m.due_date.slice(0, 10) > furo.dia && m.due_date.slice(0, 10) <= limite);

  const frase = `O caixa fica negativo em ${dataBR(furo.dia)} (−${brl(furo.saldoNoDia)}) e chega a −${brl(furo.pior)} na semana.`;
  const propostas: PropostaDeCaixa[] = [];
  for (const m of cobrir(adiaveis, falta)) {
    const nome = nomeDe(input, m);
    const chave = chaveDoCaixa("adiar", m.id, furo.dia);
    if (jaPropostas.has(chave)) continue;
    propostas.push({
      chave, valor: m.amount,
      titulo: `Adiar pagamento · ${nome}`,
      porque: `${frase} Esta conta vence em ${dataBR(m.due_date)}: negociar para depois de ${dataBR(furo.dia)} alivia ${brl(Math.min(m.amount, falta))}. Ao aprovar, a conta abre para você negociar ou ajustar.`,
      dados: { acao: "adiar", movimento: m.id, furo: furo.dia, falta, href: enderecoDaConta(m, nome) },
    });
  }
  for (const m of cobrir(antecipaveis, falta)) {
    const nome = nomeDe(input, m);
    const chave = chaveDoCaixa("antecipar", m.id, furo.dia);
    if (jaPropostas.has(chave)) continue;
    propostas.push({
      chave, valor: m.amount,
      titulo: `Antecipar recebimento · ${nome}`,
      porque: `${frase} Este recebimento vence em ${dataBR(m.due_date)}: pedir antes de ${dataBR(furo.dia)} cobre ${brl(Math.min(m.amount, falta))}. Ao aprovar, a conta abre para você combinar com o cliente.`,
      dados: { acao: "antecipar", movimento: m.id, furo: furo.dia, falta, href: enderecoDaConta(m, nome) },
    });
  }
  return { furo, propostas };
}

/** Nunca faz sozinho: no máximo pede (o teto do nível é 1, e aqui a garantia de novo). */
export function planejarCaixa(propostas: readonly PropostaDeCaixa[], config: ConfigAgente): { chave: string; destino: Destino }[] {
  return propostas.map((p) => {
    const destino = rotear({ config, valor: p.valor, feitasHoje: 0 });
    return { chave: p.chave, destino: destino === "executar" ? "aprovar" : destino };
  });
}

/**
 * A proposta pendente ainda vale? Só se o furo de hoje é o MESMO dia da chave
 * e a conta continua em aberto. O motivo vai para a tela quando não vale.
 */
export function propostaDeCaixaVale(chave: string, furoHoje: Furo | null, input: RiskInput): string | null {
  if (!furoHoje) return MOTIVO_CAIXA.semFuro;
  if (furoDaChave(chave) !== furoHoje.dia) return MOTIVO_CAIXA.furoMudou;
  const id = chave.split(":")[1];
  const m = input.movements.find((x) => x.id === id);
  if (!m || m.status !== "pendente" || m.situacao === "cancelado") return MOTIVO_CAIXA.contaMudou;
  return null;
}

export const MOTIVO_CAIXA = {
  semFuro: "O caixa da semana não fica mais negativo.",
  furoMudou: "O furo mudou de dia: a sugestão foi refeita para o dia novo.",
  contaMudou: "A conta foi paga, cancelada ou mudou.",
} as const;
