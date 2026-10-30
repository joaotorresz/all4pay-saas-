/**
 * A FATURA PÚBLICA (`/pagar?t=…`) no modelo da Asaas — as regras puras da
 * página: em que situação a cobrança está e como se diz isso ao cliente.
 *
 * ⚠️ O VALOR da página é o EMITIDO no Pix/boleto. Multa e juros só aparecem
 * quando o BOLETO foi registrado com eles (`encargos` gravado na cobrança, no
 * fim deste arquivo): é o banco que os cobra na hora do pagamento. O Pix tem
 * valor fixo e não os carrega — mostrar um total corrigido ao lado de um Pix
 * do valor original faria o cliente pagar um número e ler outro.
 */
import { diasEntre } from "@/core/automacoes/tempo";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export type TomFatura = "warning" | "neutral" | "positive";

export interface SituacaoFatura {
  /** "Cobrança vencida" · "Vence hoje" · "Aguardando pagamento" · "Pagamento recebido". */
  rotulo: string;
  tom: TomFatura;
  /** "vencida há 13 dias" · "vence em 5 dias" · "vence hoje" · null. */
  prazo: string | null;
}

export function situacaoDaFatura(s: "aberto" | "pago" | "indisponivel", vencimento: string | null, hoje: string): SituacaoFatura {
  if (s === "pago") return { rotulo: "Pagamento recebido", tom: "positive", prazo: null };
  if (s === "indisponivel") return { rotulo: "Cobrança indisponível", tom: "neutral", prazo: null };
  if (!vencimento || !/^\d{4}-\d{2}-\d{2}/.test(vencimento)) return { rotulo: "Aguardando pagamento", tom: "neutral", prazo: null };
  const d = diasEntre(vencimento.slice(0, 10), hoje.slice(0, 10));
  if (d > 0) return { rotulo: "Cobrança vencida", tom: "warning", prazo: `vencida há ${plural(d, "dia", "dias")}` };
  if (d === 0) return { rotulo: "Vence hoje", tom: "warning", prazo: "vence hoje" };
  return { rotulo: "Aguardando pagamento", tom: "neutral", prazo: `vence em ${plural(-d, "dia", "dias")}` };
}

/**
 * MULTA E JUROS DA COBRANÇA (30/10/2026, pedido do dono: "os cards como os da
 * Asaas" e a regra configurável por empresa). Os percentuais vêm em PONTOS
 * PERCENTUAIS (2 = 2%), como a pessoa digita e o banco guarda.
 *
 * ⚠️ A regra que vale para uma cobrança é a GRAVADA nela no instante da
 * emissão (o que o banco registrou), nunca a configuração de hoje: mudar a
 * regra da empresa não pode mudar o que o boleto já emitido cobra.
 */
export interface RegraEncargos {
  /** Multa única, em % do valor (2 = 2%). */
  multaPct: number;
  /** Juros de mora, em % ao mês, por dia de atraso (1 = 1% a.m.). */
  jurosMesPct: number;
  /** Dias depois do vencimento em que ainda NÃO se cobra nada (tolerância). */
  carenciaDias: number;
  /** Até quantos dias depois do vencimento ainda aceita o pagamento; null = sem limite. */
  aceitarAteDias: number | null;
}

/** Os limites que a tela e o banco conferem (o banco de novo, no `check`). */
export const LIMITES_ENCARGOS = Object.freeze({
  multaPct: 10,
  jurosMesPct: 10,
  carenciaDias: 60,
  aceitarAteDias: 365,
});

/** A regra que a lei permite numa relação de consumo (CDC art. 52 e praxe do CC). */
export const REGRA_PADRAO: RegraEncargos = Object.freeze({ multaPct: 2, jurosMesPct: 1, carenciaDias: 0, aceitarAteDias: null });

/** O que está errado na regra digitada, numa frase por campo (vazio = vale). */
export function problemasDaRegra(r: RegraEncargos): string[] {
  const p: string[] = [];
  const faixa = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max;
  if (!faixa(r.multaPct, LIMITES_ENCARGOS.multaPct)) p.push(`A multa vai de 0% a ${LIMITES_ENCARGOS.multaPct}%.`);
  if (!faixa(r.jurosMesPct, LIMITES_ENCARGOS.jurosMesPct)) p.push(`Os juros vão de 0% a ${LIMITES_ENCARGOS.jurosMesPct}% ao mês.`);
  if (!Number.isInteger(r.carenciaDias) || !faixa(r.carenciaDias, LIMITES_ENCARGOS.carenciaDias)) {
    p.push(`A tolerância vai de 0 a ${LIMITES_ENCARGOS.carenciaDias} dias.`);
  }
  if (r.aceitarAteDias !== null) {
    if (!Number.isInteger(r.aceitarAteDias) || !faixa(r.aceitarAteDias, LIMITES_ENCARGOS.aceitarAteDias)) {
      p.push(`O prazo para aceitar pagamento vai de 0 a ${LIMITES_ENCARGOS.aceitarAteDias} dias.`);
    } else if (r.aceitarAteDias < r.carenciaDias) {
      p.push("O prazo para aceitar pagamento não pode acabar antes da tolerância.");
    }
  }
  return p;
}

/** Os avisos que não impedem salvar: acima do que a lei permite cobrar de consumidor. */
export function avisosDaRegra(r: RegraEncargos): string[] {
  const a: string[] = [];
  if (r.multaPct > 2) a.push("De consumidor (pessoa física), a multa passa a ser abusiva acima de 2% (CDC, art. 52).");
  if (r.jurosMesPct > 1) a.push("Juros de mora acima de 1% ao mês precisam estar no contrato com o cliente.");
  return a;
}

/** Lê a regra gravada (jsonb do banco). Qualquer coisa fora do formato = sem regra. */
export function lerRegraEncargos(bruto: unknown): RegraEncargos | null {
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
  const r: RegraEncargos = {
    multaPct: n(o.multaPct),
    jurosMesPct: n(o.jurosMesPct),
    carenciaDias: n(o.carenciaDias),
    aceitarAteDias: o.aceitarAteDias === null || o.aceitarAteDias === undefined ? null : n(o.aceitarAteDias),
  };
  return problemasDaRegra(r).length ? null : r;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export interface EncargosDaFatura {
  diasAtraso: number;
  multa: number;
  juros: number;
  /** O valor a pagar hoje: original + multa + juros. */
  total: number;
  /** A data-limite de pagamento (vencimento + aceitarAteDias), ou null. */
  aceitaAte: string | null;
  /** Passou do prazo que a empresa aceita: o boleto não é mais pago. */
  expirada: boolean;
}

/**
 * Quanto se paga HOJE. Multa uma vez e juros pro rata die SOBRE OS DIAS DE
 * ATRASO DESDE O VENCIMENTO, mas só depois da tolerância (com 3 dias de
 * tolerância, pagar no 3º dia não tem encargo; no 4º, multa + 4 dias de juros).
 */
export function encargosDaFatura(valor: number, vencimento: string | null, hoje: string, regra: RegraEncargos | null): EncargosDaFatura {
  const base = { diasAtraso: 0, multa: 0, juros: 0, total: r2(valor), aceitaAte: null as string | null, expirada: false };
  if (!vencimento || !/^\d{4}-\d{2}-\d{2}/.test(vencimento)) return base;
  const d = Math.max(0, diasEntre(vencimento.slice(0, 10), hoje.slice(0, 10)));
  base.diasAtraso = d;
  if (!regra) return base;
  if (regra.aceitarAteDias !== null) {
    const [a, m, dia] = vencimento.slice(0, 10).split("-").map(Number);
    base.aceitaAte = new Date(Date.UTC(a, m - 1, dia + regra.aceitarAteDias)).toISOString().slice(0, 10);
    base.expirada = d > regra.aceitarAteDias;
  }
  if (d <= regra.carenciaDias) return base;
  const multa = r2(valor * (regra.multaPct / 100));
  const juros = r2(valor * (regra.jurosMesPct / 100) * (d / 30));
  return { ...base, multa, juros, total: r2(valor + multa + juros) };
}

/**
 * QUAL PIX A PÁGINA MOSTRA (Pix atualizado, decisão do dono, 30/10/2026).
 *
 *   · sem multa e juros correndo → o Pix ORIGINAL (o comum, sem dia);
 *   · com multa e juros → só o Pix DO DIA (o de hoje; o de ontem pagaria
 *     menos). Sem ele, `podeGerar` diz se a página oferece o botão;
 *   · prazo encerrado ou cobrança fechada → nenhum.
 *
 * ⚠️ O Pix do dia precisa valer o total de hoje (a 1 centavo): um Pix de
 * outro valor não é oferecido como se pagasse a dívida.
 */
export function pixDaFatura<C extends { tipo: "pix" | "boleto"; valor: number; textoQrCode: string | null; diaReferencia?: string | null }>(
  cobrancas: readonly C[],
  o: { aberto: boolean; encerrada: boolean; comEncargo: boolean; totalHoje: number; hoje: string; pixAtualizadoLigado: boolean },
): { pix: C | undefined; doDia: boolean; podeGerar: boolean } {
  const nada = { pix: undefined, doDia: false, podeGerar: false };
  if (!o.aberto || o.encerrada) return nada;
  if (!o.comEncargo) {
    return { pix: cobrancas.find((x) => x.tipo === "pix" && !!x.textoQrCode && !x.diaReferencia), doDia: false, podeGerar: false };
  }
  const hoje = o.hoje.slice(0, 10);
  const doDia = cobrancas.find((x) => x.tipo === "pix" && !!x.textoQrCode && x.diaReferencia === hoje
    && Math.abs(x.valor - o.totalHoje) <= 0.01);
  if (doDia) return { pix: doDia, doDia: true, podeGerar: false };
  return { pix: undefined, doDia: false, podeGerar: o.pixAtualizadoLigado };
}
