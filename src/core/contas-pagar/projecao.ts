/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PROJEÇÃO DE CONTAS RECORRENTES — o que ainda vai vencer, derivado da REGRA.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A tela de contas recorrentes olhava só para trás: ela reinferia o padrão dos
 * lançamentos JÁ existentes. Isso responde "quanto eu paguei", e a pergunta que
 * falta é "quanto eu VOU pagar" — que não se responde com histórico, porque o
 * histórico não sabe que o contrato acaba em março.
 *
 * ⚠️ **A FONTE É A REGRA (`recurrences`), e só ela.** Existem duas noções de
 * "conta recorrente" no produto: a REGRA cadastrada e o PADRÃO inferido dos
 * lançamentos (`./recorrentes.ts`). Projetar pelas duas ao mesmo tempo faria a
 * mesma tela ter duas definições de recorrente, e só uma delas tem chave para
 * casar com o título materializado — a outra é um agrupamento heurístico, sem
 * id, e uma projeção sem chave é uma projeção que pode duplicar dinheiro no dia
 * em que o materializador voltar a rodar. Decisão registrada, não implícita.
 *
 * ⚠️ **A REGRA ANTI-DUPLICIDADE, e por que ela é por MÊS.** Cada ocorrência
 * projetada carrega a chave `rec:<regraId>:<data>` — a MESMA que o
 * materializador grava em `movements.reference_code` (`refFatura`, com índice
 * único parcial no banco). Mas o casamento não é pela chave exata, é pelo par
 * **(regra, mês)**: o materializador arredonda o dia (`min(diaVencimento, 28)`)
 * e a regra pode ter mudado de dia desde que o título nasceu, então exigir a
 * data idêntica deixaria passar uma duplicata separada por 24 horas. Por mês,
 * um título já materializado SEMPRE suprime a projeção daquele mês. Nunca se
 * soma os dois.
 *
 * Puro, tipado, demo-safe, sem I/O e sem relógio (`hoje` entra por parâmetro).
 * Versão `contas-pagar-projecao/1.0.0`.
 */
import type { RiskMovement } from "@/core/risk-engine/types";
import { cancelado } from "@/core/indicadores/convencoes";

export const PROJECAO_VERSION = "contas-pagar-projecao/1.0.0";

/** Os ciclos que o banco aceita (`recurrence_freq`). */
export type Frequencia =
  | "semanal" | "mensal" | "bimestral" | "trimestral"
  | "quadrimestral" | "semestral" | "anual";

/** Meses por ciclo. `semanal` é o caso especial (passo de 7 dias). */
const MESES_DO_CICLO: Record<Frequencia, number> = {
  semanal: 0, mensal: 1, bimestral: 2, trimestral: 3,
  quadrimestral: 4, semestral: 6, anual: 12,
};

/**
 * A REGRA, no formato que o motor precisa — um recorte de `public.recurrences`.
 *
 * ⚠️ `fim: null` é uma recorrência SEM PRAZO, não uma recorrência longa. Ela é
 * projetável (o intervalo pedido a limita), mas o número dela merece ser
 * contado à parte: uma projeção de doze meses feita quase toda de contratos sem
 * data de término promete uma certeza que o cadastro não tem.
 */
export interface RegraRecorrente {
  id: string;
  descricao: string;
  /** Nome da contraparte, quando resolvido. */
  contraparte?: string | null;
  categoria?: string | null;
  valor: number;
  frequencia: Frequencia;
  /** `start_date` — a primeira competência da regra. */
  inicio: string;
  /** `end_date` — `null` quando não há prazo. */
  fim: string | null;
  /** `due_day` — o dia do mês. `null` usa o dia do `inicio`. */
  diaVencimento: number | null;
  /**
   * A regra está valendo.
   *
   * ⚠️ No banco isto é UM booleano (`active`), e por isso **pausada e cancelada
   * são indistinguíveis** aqui. As duas param a projeção — que é o
   * comportamento certo para ambas —, mas o produto não consegue dizer qual das
   * duas aconteceu, e essa é uma limitação do schema, não uma escolha deste
   * motor.
   */
  ativa: boolean;
}

export interface OcorrenciaProjetada {
  /** `rec:<regraId>:<data>` — a mesma chave do materializador. */
  chave: string;
  regraId: string;
  descricao: string;
  contraparte: string | null;
  categoria: string | null;
  /** "YYYY-MM-DD". */
  vencimento: string;
  /** "YYYY-MM". */
  mes: string;
  valor: number;
  /**
   * ⚠️ A distinção que as Tarefas 2 e 3 usam para não afirmar como fato o que é
   * expectativa: `realizado` é um título que EXISTE no banco; `projetado` é
   * aritmética sobre a regra.
   */
  origem: "realizado" | "projetado";
  /**
   * O valor não veio da regra, veio da última cobrança conhecida.
   *
   * ⚠️ `recurrences.amount` é fixo — não existe campo de valor variável no
   * schema. Quando o último título materializado da regra cobrou OUTRO valor,
   * é esse que se usa (é o que a conta realmente custa hoje) e a ocorrência
   * fica marcada, porque a regra e a realidade discordam.
   */
  estimada: boolean;
  /** O id do movimento, quando `origem === "realizado"`. */
  movimentoId?: string;
}

export interface ResumoProjecao {
  versao: string;
  de: string;
  ate: string;
  ocorrencias: OcorrenciaProjetada[];
  /** Soma de tudo no intervalo — realizado + projetado. Nunca negativa. */
  total: number;
  totalRealizado: number;
  totalProjetado: number;
  /** Meses distintos cobertos pelo intervalo (para a média mensal). */
  meses: number;
  /** Quantas regras entraram, e por que as outras não. */
  regrasConsideradas: number;
  regrasInativas: number;
  regrasEncerradas: number;
  /** Regras sem `end_date` que produziram ocorrência — o horizonte incerto. */
  regrasSemPrazo: number;
  /** Regras cujo valor projetado veio da última cobrança, não da regra. */
  regrasComValorDivergente: number;
}

/* ========================================================================== */
/* Datas                                                                       */
/* ========================================================================== */

const mesDe = (iso: string) => iso.slice(0, 7);
const round2 = (n: number) => Math.round(n * 100) / 100;
const dia = (iso: string) => iso.slice(0, 10);

/** `rec:<regraId>:<data>` — idêntica a `refFatura` do materializador. */
export const chaveOcorrencia = (regraId: string, dataISO: string) => `rec:${regraId}:${dataISO}`;

/**
 * As datas que uma regra produz dentro de `[de, ate]`.
 *
 * ⚠️ **Tem de concordar com o materializador**, senão a projeção diz dia 10 e o
 * título nasce dia 15 — e a tela mostra duas contas onde há uma. As duas regras
 * que fazem a data são as mesmas de `datasFaturaCron`: o dia do mês é fixado em
 * `min(diaVencimento, 28)` (28 porque fevereiro existe, e escorregar para o mês
 * seguinte adiantaria a cobrança em um ciclo inteiro), e o passo é +7 dias no
 * semanal ou +N meses nos demais. Há guarda no `engine-audit` exigindo que as
 * duas devolvam a mesma lista.
 *
 * A varredura começa no `inicio` da regra — nunca no `de` do intervalo —,
 * porque é o início que fixa a fase do ciclo: um trimestral que começou em
 * janeiro vence em abril e julho, não no primeiro mês que alguém resolveu olhar.
 */
export function datasDaRegra(regra: RegraRecorrente, de: string, ate: string): string[] {
  const meses = MESES_DO_CICLO[regra.frequencia] ?? 1;
  const inicio = new Date(`${dia(regra.inicio)}T00:00:00Z`);
  const limite = new Date(`${dia(ate)}T00:00:00Z`);
  const cursor = new Date(inicio);
  if (meses > 0 && regra.diaVencimento) {
    cursor.setUTCDate(Math.min(regra.diaVencimento, 28));
  }
  const fim = regra.fim ? dia(regra.fim) : null;

  const out: string[] = [];
  // ⚠️ Teto de iterações: uma regra semanal sobre dez anos daria 520 datas, e um
  // intervalo absurdo não pode virar laço infinito numa tela.
  for (let guarda = 0; cursor <= limite && guarda < 600; guarda++) {
    const d = cursor.toISOString().slice(0, 10);
    // Data de fim: não se projeta além dela. O teste é `>` e não `>=` — o dia do
    // fim ainda é vigência.
    if (fim && d > fim) break;
    if (d >= dia(de)) out.push(d);
    if (meses === 0) cursor.setUTCDate(cursor.getUTCDate() + 7);
    else {
      cursor.setUTCMonth(cursor.getUTCMonth() + meses);
      if (regra.diaVencimento) cursor.setUTCDate(Math.min(regra.diaVencimento, 28));
    }
  }
  return out;
}

/* ========================================================================== */
/* O motor                                                                     */
/* ========================================================================== */

/** Extrai o id da regra de um `reference_code` no formato `rec:<id>:<data>`. */
export function regraDoMovimento(m: Pick<RiskMovement, "referenceCode">): string | null {
  const ref = m.referenceCode ?? "";
  if (!ref.startsWith("rec:")) return null;
  const resto = ref.slice(4);
  const corte = resto.lastIndexOf(":");
  return corte > 0 ? resto.slice(0, corte) : null;
}

export interface EntradaProjecao {
  regras: RegraRecorrente[];
  /** Os lançamentos já existentes — é neles que se procura o que já foi materializado. */
  movimentos: RiskMovement[];
  de: string;
  ate: string;
}

export function projetarRecorrentes(e: EntradaProjecao): ResumoProjecao {
  const de = dia(e.de);
  const ate = dia(e.ate);
  const vazio: ResumoProjecao = {
    versao: PROJECAO_VERSION, de, ate, ocorrencias: [],
    total: 0, totalRealizado: 0, totalProjetado: 0, meses: 0,
    regrasConsideradas: 0, regrasInativas: 0, regrasEncerradas: 0,
    regrasSemPrazo: 0, regrasComValorDivergente: 0,
  };
  // ⚠️ Intervalo invertido devolve VAZIO, não silêncio: é a regra da janela
  // canônica (ONDA 1) — pedir de agosto a julho não é "não há nada".
  if (de > ate) return vazio;

  /* ---- 1. o que JÁ foi materializado, por (regra, mês) -------------------- */
  const materializado = new Map<string, RiskMovement>();
  const ultimoDaRegra = new Map<string, RiskMovement>();
  for (const m of e.movimentos) {
    if (cancelado(m)) continue;
    const regraId = regraDoMovimento(m);
    if (!regraId) continue;
    const d = dia(m.paid_date ?? m.due_date);
    // A chave do casamento é (regra, MÊS) — ver o bloco de cabeçalho.
    const k = `${regraId}·${mesDe(d)}`;
    const atual = materializado.get(k);
    if (!atual || dia(atual.due_date) > dia(m.due_date)) materializado.set(k, m);
    const ult = ultimoDaRegra.get(regraId);
    if (!ult || dia(ult.due_date) < dia(m.due_date)) ultimoDaRegra.set(regraId, m);
  }

  /* ---- 2. percorrer as regras -------------------------------------------- */
  const ocorrencias: OcorrenciaProjetada[] = [];
  let inativas = 0, encerradas = 0, semPrazo = 0, consideradas = 0, divergentes = 0;

  for (const r of e.regras) {
    // Pausada ou cancelada não projeta — as duas chegam aqui como `ativa:false`.
    if (!r.ativa) { inativas++; continue; }
    // Encerrada antes do intervalo: nada a projetar, e vale contar para a tela
    // poder dizer que a regra existe mas acabou.
    if (r.fim && dia(r.fim) < de) { encerradas++; continue; }

    const datas = datasDaRegra(r, de, ate);
    if (datas.length === 0) continue;
    consideradas++;
    if (!r.fim) semPrazo++;

    // ⚠️ Valor: a regra manda, EXCETO quando a última cobrança conhecida
    // discorda dela. `recurrences.amount` é fixo e o schema não tem campo de
    // valor variável nem de indexação — então nenhum reajuste é inventado aqui:
    // ou é o valor da regra, ou é o último valor REAL que a empresa pagou.
    const ultimo = ultimoDaRegra.get(r.id);
    const valorUltimo = ultimo ? Math.abs(ultimo.amount) : null;
    const divergiu = valorUltimo !== null && round2(valorUltimo) !== round2(r.valor);
    if (divergiu) divergentes++;
    const valorProjetado = round2(divergiu ? (valorUltimo as number) : r.valor);

    for (const d of datas) {
      const mes = mesDe(d);
      const existente = materializado.get(`${r.id}·${mes}`);
      if (existente) {
        // ⚠️ O título EXISTE: usa-se ele e NUNCA se soma a projeção do mesmo
        // mês. É a regra anti-duplicidade, e ela vale mesmo quando o dia não
        // bate — por isso o casamento é por mês.
        ocorrencias.push({
          chave: chaveOcorrencia(r.id, dia(existente.due_date)),
          regraId: r.id, descricao: r.descricao,
          contraparte: r.contraparte ?? null, categoria: r.categoria ?? null,
          vencimento: dia(existente.due_date), mes,
          valor: round2(Math.abs(existente.amount)),
          origem: "realizado", estimada: false, movimentoId: existente.id,
        });
        continue;
      }
      ocorrencias.push({
        chave: chaveOcorrencia(r.id, d),
        regraId: r.id, descricao: r.descricao,
        contraparte: r.contraparte ?? null, categoria: r.categoria ?? null,
        vencimento: d, mes,
        valor: valorProjetado,
        origem: "projetado", estimada: divergiu,
      });
    }
  }

  ocorrencias.sort((a, b) => (a.vencimento === b.vencimento
    ? a.descricao.localeCompare(b.descricao)
    : a.vencimento.localeCompare(b.vencimento)));

  const totalRealizado = round2(ocorrencias.filter((o) => o.origem === "realizado").reduce((s, o) => s + o.valor, 0));
  const totalProjetado = round2(ocorrencias.filter((o) => o.origem === "projetado").reduce((s, o) => s + o.valor, 0));

  return {
    versao: PROJECAO_VERSION, de, ate,
    ocorrencias,
    total: round2(totalRealizado + totalProjetado),
    totalRealizado,
    totalProjetado,
    meses: mesesNoIntervalo(de, ate).length,
    regrasConsideradas: consideradas,
    regrasInativas: inativas,
    regrasEncerradas: encerradas,
    regrasSemPrazo: semPrazo,
    regrasComValorDivergente: divergentes,
  };
}

/** Os meses "YYYY-MM" que o intervalo toca, do mais antigo ao mais novo. */
export function mesesNoIntervalo(de: string, ate: string): string[] {
  const out: string[] = [];
  if (dia(de) > dia(ate)) return out;
  let cur = mesDe(de);
  const fim = mesDe(ate);
  for (let guarda = 0; cur <= fim && guarda < 240; guarda++) {
    out.push(cur);
    const [a, m] = cur.split("-").map(Number);
    const d = new Date(Date.UTC(a, m, 1));
    cur = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return out;
}

/** Uma linha por mês do intervalo — o gráfico da Tarefa 3. */
export interface MesProjetado {
  mes: string;
  realizado: number;
  projetado: number;
  total: number;
  /** Verdadeiro quando o mês tem alguma ocorrência projetada. */
  temProjecao: boolean;
}

export function porMes(r: ResumoProjecao): MesProjetado[] {
  const base = new Map<string, MesProjetado>();
  // ⚠️ TODOS os meses do intervalo entram, inclusive os vazios. Mês sem
  // ocorrência vale R$ 0,00 — pular o mês faria a linha do gráfico ligar
  // fevereiro a abril como se março não existisse.
  for (const mes of mesesNoIntervalo(r.de, r.ate)) {
    base.set(mes, { mes, realizado: 0, projetado: 0, total: 0, temProjecao: false });
  }
  for (const o of r.ocorrencias) {
    const linha = base.get(o.mes);
    if (!linha) continue;
    if (o.origem === "realizado") linha.realizado = round2(linha.realizado + o.valor);
    else { linha.projetado = round2(linha.projetado + o.valor); linha.temProjecao = true; }
    linha.total = round2(linha.realizado + linha.projetado);
  }
  return Array.from(base.values());
}
