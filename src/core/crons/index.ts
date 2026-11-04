/**
 * OS CRONS DA PLATAFORMA — quais existem e quando um deles está atrasado
 * (Fase 3.4 do plano, 04/11/2026).
 *
 * O materializador de recorrências (`/api/recorrencias/run`) nunca completou
 * uma execução em produção, e ninguém viu: sem nada para materializar, ou sem
 * a chave de serviço, a rota não escrevia rastro nenhum. "Não rodou" e "rodou
 * e não havia o que fazer" eram indistinguíveis.
 *
 * Agora cada execução completa grava UMA linha em `cron_execucoes`, mesmo sem
 * trabalho, e a guarda agendada `crons-no-ar` (a cada 15 minutos no GitHub)
 * reprova quando um cron diário passa de 26 horas sem execução bem-sucedida.
 *
 * ⚠️ A lista abaixo é a de `vercel.json`. A guarda `crons-diarios` (npm test)
 * reprova se as duas divergirem: um cron novo sem vigia, ou um vigia de um
 * cron que saiu.
 */
export const VERSAO_CRONS = "crons/1.0.0";

export interface CronDiario {
  /** O nome gravado em `cron_execucoes.job`. */
  job: string;
  /** A rota que a Vercel chama. */
  rota: string;
}

export const CRONS_DIARIOS: readonly CronDiario[] = [
  { job: "recorrencias", rota: "/api/recorrencias/run" },
  { job: "automacoes", rota: "/api/financial-os/run" },
];

/** Um dia e duas horas: a Vercel não garante o minuto exato do disparo. */
export const PRAZO_HORAS = 26;

export interface UltimaExecucao { job: string; terminadoEm: string | null }

export interface SituacaoCron {
  job: string;
  rota: string;
  terminadoEm: string | null;
  horas: number | null;
  emDia: boolean;
  motivo: string;
}

/** A situação de cada cron diário, dada a última execução bem-sucedida de cada um. */
export function avaliarCrons(ultimas: readonly UltimaExecucao[], agora: Date): SituacaoCron[] {
  return CRONS_DIARIOS.map((c) => {
    const u = ultimas.find((x) => x.job === c.job)?.terminadoEm ?? null;
    if (!u) {
      return { ...c, terminadoEm: null, horas: null, emDia: false,
        motivo: `${c.rota} nunca completou uma execução` };
    }
    const horas = (agora.getTime() - new Date(u).getTime()) / 3_600_000;
    const emDia = horas <= PRAZO_HORAS;
    return {
      ...c, terminadoEm: u, horas: Math.round(horas * 10) / 10, emDia,
      motivo: emDia
        ? `última execução há ${Math.round(horas)} h`
        : `${c.rota} está há ${Math.round(horas)} h sem completar (prazo ${PRAZO_HORAS} h)`,
    };
  });
}
