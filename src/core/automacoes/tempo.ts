/**
 * O relógio das automações — o dia de HOJE é o de Brasília, dito.
 *
 * ⚠️ O runner roda na Vercel, em UTC. `new Date().toISOString().slice(0, 10)`
 * ali é o dia de Londres: entre 21h e meia-noite de Brasília ele já é AMANHÃ, e
 * o lembrete de "vence hoje" sairia com os títulos de amanhã. O cron diário
 * dispara às 12h UTC (9h de Brasília), longe da virada — e é justamente por
 * isso que o erro não apareceria em teste nenhum até alguém disparar o runner
 * à mão às 22h. O fuso é EXPLÍCITO, não herdado do servidor.
 */
import { ehDiaUtil, feriadosNacionais } from "@/core/folha/calendario";

export const FUSO_DAS_AUTOMACOES = "America/Sao_Paulo";

/** YYYY-MM-DD no fuso pedido (padrão: Brasília), a partir de um instante. */
export function hojeEm(agora: Date, fuso: string = FUSO_DAS_AUTOMACOES): string {
  // `en-CA` formata como YYYY-MM-DD — o formato ISO, sem montar à mão.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(agora);
}

/** Soma dias a uma data-só (fatiando a string; nunca `new Date("YYYY-MM-DD")` local). */
export function somarDias(iso: string, n: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = ate.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

const feriadosDe = (iso: string) => new Set([
  ...feriadosNacionais(Number(iso.slice(0, 4))),
  ...feriadosNacionais(Number(iso.slice(0, 4)) + 1),
]);

export const diaUtil = (iso: string): boolean => ehDiaUtil(iso.slice(0, 10), feriadosDe(iso));

/** O próximo dia útil DEPOIS de `iso`. */
export function proximoDiaUtil(iso: string): string {
  let d = somarDias(iso, 1);
  for (let i = 0; i < 15 && !diaUtil(d); i++) d = somarDias(d, 1);
  return d;
}

/** A segunda-feira da semana de `iso` (a semana vai de segunda a domingo). */
export function segundaDaSemana(iso: string): string {
  const dow = diaDaSemana(iso);
  return somarDias(iso, dow === 0 ? -6 : 1 - dow);
}

/** Hoje é o PRIMEIRO dia útil da semana? (Segunda de feriado passa para terça.) */
export function primeiroDiaUtilDaSemana(iso: string): boolean {
  if (!diaUtil(iso)) return false;
  for (let d = segundaDaSemana(iso); d < iso; d = somarDias(d, 1)) if (diaUtil(d)) return false;
  return true;
}

/** "30/09" · "30/09/2026" */
export const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const dataBRcurta = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeDoMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;

export function mesAnterior(ym: string): string {
  const [a, m] = ym.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}
