/**
 * A JANELA — o recorte de tempo de qualquer indicador.
 *
 * Todo indicador responde "quanto, ENTRE QUANDO E QUANDO". A janela é esse
 * intervalo, e ela existe como tipo próprio por um motivo específico: filtros de
 * data montados solto produzem intervalos IMPOSSÍVEIS que ninguém percebe.
 *
 * ⚠️ O caso real que originou este arquivo: um filtro combinava "maior que hoje"
 * com "menor que o fim do mês passado". Nenhuma data satisfaz as duas, então a
 * consulta voltava vazia — e vazio, na tela, lê-se "não há nada", não "você
 * pediu um intervalo que não existe". O número zero mentia com toda a confiança.
 *
 * Aqui um intervalo invertido é `vazia: true` com `motivo` — a tela mostra o
 * motivo em vez de um zero.
 */

export interface Janela {
  /** Primeiro dia, inclusive (YYYY-MM-DD). */
  de: string;
  /** Último dia, inclusive (YYYY-MM-DD). */
  ate: string;
  /** Rótulo curto para a UI ("Agosto 2026", "Últimos 30 dias"). */
  label: string;
  /**
   * `true` quando o intervalo pedido é impossível (`de > ate`). Os indicadores
   * devolvem 0 com procedência explicando — nunca um zero mudo.
   */
  vazia: boolean;
  motivo?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO local (YYYY-MM-DD) de um `Date` — nunca `toISOString`, que é UTC. */
export const isoLocal = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Parse de data-só como MEIA-NOITE LOCAL.
 * `new Date("2026-08-01")` é meia-noite UTC e, em UTC-3, cai em 31/07 — é o bug
 * de fuso que o `npm run tz` guarda desde sempre.
 */
export const parseLocal = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00`);

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Constrói uma janela validando a ordem das pontas. */
export function janela(de: string, ate: string, label?: string): Janela {
  const d = de.slice(0, 10);
  const a = ate.slice(0, 10);
  if (d > a) {
    return {
      de: d,
      ate: a,
      label: label ?? `${d} → ${a}`,
      vazia: true,
      // A mensagem nomeia as duas pontas: quem montou o filtro precisa ver QUAL
      // par de condições se anulou, não só que "não há dados".
      motivo: `Intervalo impossível: o início (${d}) é posterior ao fim (${a}). Nenhuma data satisfaz as duas condições.`,
    };
  }
  return { de: d, ate: a, label: label ?? `${d} → ${a}`, vazia: false };
}

/** O dia de hoje — a janela mais curta que existe. */
export function janelaHoje(hojeISO: string): Janela {
  const d = hojeISO.slice(0, 10);
  return { de: d, ate: d, label: "Hoje", vazia: false };
}

/** Um mês de calendário inteiro. `mes` é 0-based, como no `Date`. */
export function janelaMes(ano: number, mes: number): Janela {
  const primeiro = `${ano}-${pad(mes + 1)}-01`;
  const ultimo = isoLocal(new Date(ano, mes + 1, 0));
  return { de: primeiro, ate: ultimo, label: `${MESES[mes]} ${ano}`, vazia: false };
}

/** O mês a que uma data pertence. */
export function janelaDoMesDe(iso: string): Janela {
  const d = parseLocal(iso);
  return janelaMes(d.getFullYear(), d.getMonth());
}

/**
 * Os últimos `n` dias TERMINANDO em `ate` (inclusive) — janela retroativa.
 * `n = 30` devolve 30 dias, não 31: a ponta final conta como um deles.
 */
export function janelaUltimosDias(n: number, ateISO: string, label?: string): Janela {
  const fim = parseLocal(ateISO);
  const ini = new Date(fim);
  ini.setDate(ini.getDate() - (Math.max(1, n) - 1));
  return janela(isoLocal(ini), isoLocal(fim), label ?? `Últimos ${n} dias`);
}

/**
 * A janela imediatamente ANTERIOR, do mesmo tamanho — a régua de comparação.
 * Comparar um mês cheio com meio mês produz uma queda que não existe.
 */
export function janelaAnterior(j: Janela): Janela {
  const dias = diasDe(j);
  const fim = parseLocal(j.de);
  fim.setDate(fim.getDate() - 1);
  const ini = new Date(fim);
  ini.setDate(ini.getDate() - (dias - 1));
  return janela(isoLocal(ini), isoLocal(fim), "Período anterior");
}

/** Quantos dias a janela cobre, contando as duas pontas. */
export function diasDe(j: Janela): number {
  if (j.vazia) return 0;
  const ms = parseLocal(j.ate).getTime() - parseLocal(j.de).getTime();
  return Math.round(ms / 86400000) + 1;
}

/** A data cai dentro da janela? Comparação de STRING ISO — sem `Date`, sem fuso. */
export function dentro(j: Janela, iso: string | null | undefined): boolean {
  if (!iso || j.vazia) return false;
  const d = iso.slice(0, 10);
  return d >= j.de && d <= j.ate;
}

/**
 * A janela contém o dia de hoje?
 *
 * É isto que separa "o mês selecionado" de "hoje" — a distinção que a Home
 * misturava. Um card rotulado "este mês" enquanto se navega para março de 2025
 * está mostrando março, e chamá-lo de "hoje" é o mesmo defeito de rótulo que
 * fazia o número parecer errado quando estava certo.
 */
export const contemHoje = (j: Janela, hojeISO: string): boolean => dentro(j, hojeISO);

/**
 * A janela está inteiramente no passado / no futuro em relação a hoje?
 * Quem usa: os rótulos ("realizado" × "previsto") e os avisos de projeção.
 */
export const passada = (j: Janela, hojeISO: string): boolean => !j.vazia && j.ate < hojeISO.slice(0, 10);
export const futura = (j: Janela, hojeISO: string): boolean => !j.vazia && j.de > hojeISO.slice(0, 10);
