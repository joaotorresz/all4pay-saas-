/**
 * Agenda de faturamento — função PURA compartilhada pelo Cron
 * (`/api/recorrencias/run`) e pela ativação em live, para que ambos gerem as
 * MESMAS datas/`reference_code` (dedup idempotente). Sem deps de cliente/servidor.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);

export type FreqDB = "semanal" | "mensal" | "bimestral" | "trimestral" | "quadrimestral" | "semestral" | "anual";

/** Meses por ciclo (semanal=0 → passo especial de +7 dias). */
const MESES: Record<FreqDB, number> = {
  semanal: 0, mensal: 1, bimestral: 2, trimestral: 3, quadrimestral: 4, semestral: 6, anual: 12,
};

/** Datas de faturamento no intervalo [hoje, hoje+dias], a partir de start_date.
 *  Entende TODOS os ciclos (uma fonte de verdade p/ o Cron e o ativar). */
export function datasFaturaCron(startISO: string, freq: FreqDB | string, dueDay: number | null, hojeISO: string, dias = 180): string[] {
  const meses = MESES[freq as FreqDB] ?? 1;
  const hoje = new Date(hojeISO + "T00:00:00");
  const fim = new Date(hoje); fim.setDate(fim.getDate() + dias);
  const cur = new Date(startISO + "T00:00:00");
  if (meses > 0 && dueDay) cur.setDate(Math.min(dueDay, 28));
  const step = () => {
    if (meses === 0) cur.setDate(cur.getDate() + 7);
    else { cur.setMonth(cur.getMonth() + meses); if (dueDay) cur.setDate(Math.min(dueDay, 28)); }
  };
  const out: string[] = [];
  let guard = 0;
  while (cur <= fim && guard++ < 500) {
    if (cur >= hoje) out.push(iso(cur));
    step();
  }
  return out;
}

/** O ciclo da UI JÁ É o enum freq do banco (7 valores). Identidade + saneamento. */
export function cicloParaFreq(ciclo: string): FreqDB {
  return (Object.keys(MESES) as FreqDB[]).includes(ciclo as FreqDB) ? (ciclo as FreqDB) : "mensal";
}

/** `reference_code` idempotente de uma fatura de recorrência. */
export const refFatura = (recId: string, dataISO: string) => `rec:${recId}:${dataISO}`;

/**
 * Quantos dias à frente a ATIVAÇÃO de uma assinatura lança faturas — o MESMO
 * horizonte na demonstração e em produção. A demonstração lançava "6 faturas",
 * e uma assinatura anual virava SEIS ANOS de receita a receber (medido:
 * 6 × R$ 3.200) enquanto produção lançava 180 dias.
 */
export const HORIZONTE_ATIVACAO_DIAS = 180;

/**
 * Quais faturas saem do fluxo quando a assinatura é pausada ou cancelada:
 * só as PENDENTES com vencimento de hoje em diante. Recebida é caixa que já
 * entrou (apagá-la desfaz dinheiro recebido); vencida em aberto continua
 * devida. É a regra que a consulta de produção aplica no banco
 * (`status = pendente` e `due_date >= hoje`), escrita uma vez para a
 * demonstração seguir a mesma.
 */
export function faturasARemoverAoEncerrar(
  faturas: readonly { id: string; status: string; due_date: string }[],
  hojeISO: string,
): string[] {
  return faturas.filter((f) => f.status === "pendente" && f.due_date >= hojeISO).map((f) => f.id);
}

/**
 * O que a ativação lançou — a tela diz o número, não "entram no previsto".
 *
 * ⚠️ `faturas` são as NOVAS; `jaExistiam` as que o banco recusou por
 * duplicata E que estão visíveis (o Cron ou uma ativação anterior já as
 * gravou); `naLixeira` os vencimentos cuja fatura foi para a lixeira ao
 * pausar — o índice único `movements_rec_ref_uniq` ainda os enxerga, então
 * nenhum caminho de escrita os recria, e eles ficam FORA do previsto até
 * alguém restaurá-los. Contar os três como "0 faturas" fazia a tela dizer
 * "nenhuma fatura vence" sobre um contrato com faturas.
 */
export interface ResultadoAtivacao {
  faturas: number; jaExistiam: number; naLixeira: string[]; horizonteDias: number;
  /** A conferência das duplicadas falhou — a tela diz que não sabe. */
  aviso?: string;
}

/**
 * O que a ativação fez, em uma frase. ⚠️ "Nenhuma fatura" só quando NADA
 * existe no horizonte: as que já estavam no previsto (Cron, ativação
 * anterior) e as que foram para a lixeira ao pausar são ditas pelo nome —
 * somá-las a zero fazia a tela negar faturas que existem, e esconder as da
 * lixeira deixava receita contratada fora do previsto sem ninguém saber.
 */
export function mensagemDaAtivacao(res: ResultadoAtivacao): string {
  const pl = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
  const partes: string[] = [];
  if (res.faturas > 0) partes.push(`${pl(res.faturas, "fatura nova", "faturas novas")} no previsto (Títulos a receber, fluxo e DRE)`);
  if (res.jaExistiam > 0) partes.push(`${pl(res.jaExistiam, "já estava", "já estavam")} no previsto`);
  if (res.naLixeira.length > 0) {
    partes.push(`${pl(res.naLixeira.length, "fatura está", "faturas estão")} na lixeira desde a pausa (vence${res.naLixeira.length === 1 ? "" : "m"} ${res.naLixeira.map((d) => d.split("-").reverse().join("/")).join(", ")}) e fica${res.naLixeira.length === 1 ? "" : "m"} fora do previsto até ser${res.naLixeira.length === 1 ? "" : "em"} restaurada${res.naLixeira.length === 1 ? "" : "s"} na Lixeira`);
  }
  if (res.aviso) partes.push(res.aviso);
  if (partes.length === 0) return `Ativada — nenhuma fatura vence nos próximos ${res.horizonteDias} dias, então nada entrou no previsto ainda`;
  return `Ativada — ${partes.join(" · ")}`;
}

