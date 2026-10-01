/**
 * A COMPETÊNCIA NA IMPORTAÇÃO — dita pela pessoa, nunca inventada (Rodada 8).
 *
 * Medido em produção (01/10/2026): 2.098 lançamentos sem `competence_date`,
 * TODOS de importação antiga (o último é de 25/08 — desde a Rodada 5 todo
 * escritor grava a data). E os que a gravam pela importação gravam a data do
 * BANCO como competência: o aluguel de setembro pago em 05/10 cai no DRE de
 * outubro. A planilha em lote nem tinha onde dizer outra coisa.
 *
 * Este módulo é a regra, pura e sem I/O, usada pela planilha
 * (`ImportacaoView`) e pela revisão do extrato (`RevisaoImportacao`):
 *
 *  · Em branco ⇒ AUSENTE (`null`), e quem grava cai no fallback DECLARADO (o
 *    vencimento / a data do extrato). Ausente não é erro.
 *  · Preenchida e ilegível ⇒ ERRO nomeado. ⚠️ Nunca o fallback: um "13/2026"
 *    digitado errado que virasse o vencimento em silêncio mandaria o valor
 *    para o mês errado com cara de conferido — é o mesmo defeito do fallback
 *    que produz algo com CARA de dado (A4P-085).
 *  · O mês basta ("09/2026", "2026-09"): competência é MÊS de resultado, e
 *    exigir o dia obrigaria a inventar um. Vira o dia 1º.
 *
 * ⚠️ Mover a competência para OUTRO mês só acontece por ato da pessoa
 * (`competenciaDoMesAnterior` devolve uma PROPOSTA; quem aplica é a tela, com
 * a contagem à vista e o desfazer ao lado). Aplicar sozinho seria classificar
 * por palpite com outro nome — a lição da Rodada 7.
 */

export interface LeituraCompetencia {
  /** ISO `aaaa-mm-dd`, ou `null` quando a célula veio em branco. */
  iso: string | null;
  /** Preenchido só quando a célula tinha algo e não era data nem mês. */
  erro: string | null;
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

function mesValido(ano: number, mes: number): boolean {
  return ano >= 2000 && ano <= 2100 && mes >= 1 && mes <= 12;
}

function diaValido(ano: number, mes: number, dia: number): boolean {
  if (!mesValido(ano, mes) || dia < 1) return false;
  // Último dia do mês sem `Date` local: o dia 0 do mês seguinte, em UTC.
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return dia <= ultimo;
}

/** O que a célula de competência diz. Ver o cabeçalho do módulo. */
export function lerCompetencia(bruto: string | number | null | undefined): LeituraCompetencia {
  const t = String(bruto ?? "").trim();
  if (!t) return { iso: null, erro: null };
  const invalida = { iso: null, erro: `Competência "${t}" não é uma data nem um mês (use 09/2026 ou 30/09/2026).` };

  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) {
    const [a, mm, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return diaValido(a, mm, d) ? { iso: `${m[1]}-${m[2]}-${m[3]}`, erro: null } : invalida;
  }
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) {
    const [d, mm, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return diaValido(a, mm, d) ? { iso: `${m[3]}-${m[2]}-${m[1]}`, erro: null } : invalida;
  }
  m = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) {
    const [mm, a] = [Number(m[1]), Number(m[2])];
    return mesValido(a, mm) ? { iso: `${a}-${doisDigitos(mm)}-01`, erro: null } : invalida;
  }
  m = /^(\d{4})-(\d{2})$/.exec(t);
  if (m) {
    const [a, mm] = [Number(m[1]), Number(m[2])];
    return mesValido(a, mm) ? { iso: `${a}-${m[2]}-01`, erro: null } : invalida;
  }
  // Serial do Excel (dias desde 1899-12-30) — a coluna formatada como data.
  const serial = Number(t);
  if (/^\d+(\.\d+)?$/.test(t) && serial > 20_000 && serial < 80_000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
    return { iso: d.toISOString().slice(0, 10), erro: null };
  }
  return invalida;
}

/** A competência que vai para o banco: a dita, ou o fallback declarado. */
export function competenciaFinal(dita: string | null | undefined, fallback: string): string {
  return dita || fallback;
}

/** `aaaa-mm` do mês anterior ao da data ISO (fatiando a string — nunca `Date` local). */
export function mesAnterior(iso: string): string {
  const a = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7));
  return m === 1 ? `${a - 1}-12` : `${a}-${doisDigitos(m - 1)}`;
}

/** Linha mínima que a proposta precisa — o `FinancialRecord` do FDIP serve. */
export interface LinhaExtrato {
  id: string;
  data: string;
  tipo: "entrada" | "saida" | string;
  contraparteNorm: string;
}

/**
 * A PROPOSTA "contas fixas pagas no começo do mês são do mês anterior".
 *
 * Alcança só SAÍDAS de contraparte que se repete em pelo menos três meses
 * distintos do próprio extrato (aluguel, salário, energia) e pagas até o dia
 * `diaLimite`. ⚠️ Uma compra avulsa no dia 3 é do mês dela; mover TODA saída
 * do começo do mês tiraria do mês a despesa que de fato aconteceu nele.
 *
 * Devolve `id → competência ISO` (dia 1º do mês anterior). Não aplica nada.
 */
export function competenciaDoMesAnterior(
  linhas: readonly LinhaExtrato[], diaLimite: number,
): Record<string, string> {
  const limite = Math.max(1, Math.min(28, Math.floor(diaLimite)));
  const meses = new Map<string, Set<string>>();
  for (const l of linhas) {
    if (l.tipo !== "saida" || !l.contraparteNorm) continue;
    (meses.get(l.contraparteNorm) ?? meses.set(l.contraparteNorm, new Set()).get(l.contraparteNorm)!)
      .add(l.data.slice(0, 7));
  }
  const out: Record<string, string> = {};
  for (const l of linhas) {
    if (l.tipo !== "saida" || !l.contraparteNorm) continue;
    if ((meses.get(l.contraparteNorm)?.size ?? 0) < 3) continue;
    if (Number(l.data.slice(8, 10)) > limite) continue;
    out[l.id] = `${mesAnterior(l.data)}-01`;
  }
  return out;
}

/**
 * O relatório do extrato com a competência DITA em cada linha.
 *
 * ⚠️ A chave é o `fingerprint`, não o `id`: o id do registro é aleatório e
 * renasce a cada reanálise (recategorizar pela IA reanalisa o texto) — chaveada
 * pelo id, a competência que a pessoa escolheu sumiria em silêncio antes de
 * confirmar.
 */
export function comCompetencias<R extends { fingerprint: string; competencia?: string }>(
  records: readonly R[], ditas: Readonly<Record<string, string>>,
): R[] {
  return records.map((r) => (ditas[r.fingerprint] ? { ...r, competencia: ditas[r.fingerprint] } : r));
}
