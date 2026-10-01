/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CHECKLIST DE FECHAMENTO — cada tarefa com RESPONSÁVEL, PRAZO e REVISOR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O checklist anterior era uma caixinha por tarefa: marcava "feito" e mais
 * nada. Não dizia quem devia fazer, até quando, nem quem conferiu — e um
 * fechamento sem essas três respostas é uma lista de desejos. O Campfire
 * resolve o mês como um fluxo de trabalho; este módulo é a regra dele.
 *
 * ⚠️ **A MÁQUINA é a mesma do banco** (`close_tasks_maquina`, migration
 * 20260930200000): pendente → concluída → revisada, com reabrir e desfazer a
 * revisão. Esta cópia existe para a TELA explicar antes do clique o que o
 * banco recusaria depois dele, e para a demonstração (que não tem banco)
 * aplicar a mesma regra. Quem autoriza em produção é o gatilho.
 *
 * ⚠️ **Quem concluiu não revisa a própria tarefa — quando existe outro membro
 * habilitado.** Sem outro, a autorrevisão é PERMITIDA e CARIMBADA (decisão R1
 * do dono, a mesma da Central): um controle que liga e desliga conforme o
 * quadro de membros não é controle, então ele nunca desliga — na empresa de
 * uma pessoa ele vira REGISTRO.
 *
 * ⚠️ **O mês trava com tudo revisado, ou com um MOTIVO escrito** (20+
 * caracteres). Proibir sem saída faria alguém marcar "revisado" só para
 * conseguir travar, e aí o checklist mente.
 *
 * ⚠️ **As tarefas-padrão nascem de um MODELO e se repetem todo mês.** O
 * responsável e o revisor são HERDADOS do mesmo item do mês anterior — é o que
 * faz a atribuição valer uma vez e se repetir sozinha, sem uma tabela de
 * modelos por organização (que exigiria seed + gatilho para um default que não
 * muda por empresa).
 *
 * Puro, tipado, demo-safe, sem I/O e sem relógio (`hoje`/`agora` entram por
 * parâmetro). Versão `close-checklist/1.0.0`.
 */

export const CHECKLIST_VERSION = "close-checklist/1.0.0";

/** O piso do motivo — o mesmo da revisão administrativa: barra o vazio e o de fachada. */
export const MOTIVO_MINIMO = 20;

/** pending = a fazer · review = concluída, aguardando revisão · done = revisada (os valores do banco). */
export type StatusTarefa = "pending" | "review" | "done";

export const ROTULO_STATUS: Record<StatusTarefa, string> = {
  pending: "A fazer",
  review: "Aguardando revisão",
  done: "Revisada",
};

export interface ModeloTarefa {
  chave: string;
  titulo: string;
  descricao: string;
  /** A tela onde a tarefa se faz. */
  href: string;
  /** Dia do MÊS SEGUINTE em que vence (o fechamento acontece depois do mês acabar). */
  diaPrazo: number;
  ordem: number;
}

/**
 * As cinco tarefas que todo mês tem. A ordem é a do trabalho: primeiro o
 * dinheiro bate com o banco, depois entram as provisões, depois se lê o
 * resultado, depois os impostos (que dependem do resultado), e só então o
 * pacote sai para o contador.
 */
export const MODELO_PADRAO: readonly ModeloTarefa[] = [
  { chave: "conciliar_bancos", ordem: 1, diaPrazo: 3,
    titulo: "Reconciliar as contas bancárias",
    descricao: "Conferir o extrato de cada conta com os lançamentos do mês e conciliar o que falta.",
    href: "/dashboard/financial/reconciliation" },
  { chave: "provisoes", ordem: 2, diaPrazo: 4,
    titulo: "Lançar as provisões com estorno",
    descricao: "Provisionar as despesas do mês que ainda não chegaram; o estorno no dia 1º nasce junto.",
    href: "/dashboard/reports/monthly-closing?painel=checklist" },
  { chave: "revisar_dre", ordem: 3, diaPrazo: 5,
    titulo: "Revisar o DRE e a variação",
    descricao: "Ler o resultado do mês contra o anterior e explicar o que mudou.",
    href: "/dashboard/reports/variance" },
  { chave: "conferir_impostos", ordem: 4, diaPrazo: 6,
    titulo: "Conferir os impostos do mês",
    descricao: "Conferir a base e as guias do mês antes do vencimento.",
    href: "/dashboard/sales-invoices/tax-provisioning" },
  { chave: "exportar_contador", ordem: 5, diaPrazo: 8,
    titulo: "Exportar ao contador",
    descricao: "Gerar o razão e o DRE do mês e enviar ao contador.",
    href: "/exportar" },
];

export interface TarefaFechamento {
  id: string;
  /** "YYYY-MM". */
  mes: string;
  chave: string;
  titulo: string;
  descricao: string;
  href: string;
  ordem: number;
  responsavelId: string | null;
  revisorId: string | null;
  /** "YYYY-MM-DD". */
  prazo: string | null;
  status: StatusTarefa;
  concluidaPor: string | null;
  concluidaEm: string | null;
  revisadaPor: string | null;
  revisadaEm: string | null;
  autorrevisao: boolean;
  autorrevisaoMotivo: string | null;
}

/** Um membro da organização, com a resposta que interessa aqui: pode revisar? */
export interface MembroFechamento {
  id: string;
  nome: string;
  /** Tem a ação `fechar` na matriz de papéis. */
  podeRevisar: boolean;
}

/* ========================================================================== */
/* Datas — fatiando a string, nunca `new Date(iso)` local                      */
/* ========================================================================== */

/** Primeiro dia do mês seguinte + (dia − 1), limitado ao último dia daquele mês. */
export function prazoDoModelo(mes: string, diaPrazo: number): string {
  const [a, m] = mes.split("-").map(Number);
  const aSeg = m === 12 ? a + 1 : a;
  const mSeg = m === 12 ? 1 : m + 1;
  const ultimo = new Date(Date.UTC(aSeg, mSeg, 0)).getUTCDate();
  const d = Math.min(Math.max(1, diaPrazo), ultimo);
  return `${aSeg}-${String(mSeg).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function mesAnteriorDe(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/* ========================================================================== */
/* Geração do mês                                                              */
/* ========================================================================== */

/**
 * As tarefas do mês que AINDA NÃO EXISTEM, prontas para gravar.
 *
 * ⚠️ Idempotente: devolve só o que falta (por chave). Abrir a tela duas vezes
 * não cria a tarefa duas vezes — e no banco o índice único
 * `(org_id, mes, chave)` garante o mesmo contra dois computadores ao mesmo
 * tempo.
 *
 * ⚠️ O responsável e o revisor vêm da MESMA chave no mês anterior. É o que faz
 * "quem cuida da conciliação" ser respondido uma vez, não todo mês.
 */
export function tarefasAGerar(
  mes: string,
  existentes: readonly Pick<TarefaFechamento, "mes" | "chave" | "responsavelId" | "revisorId">[],
  modelo: readonly ModeloTarefa[] = MODELO_PADRAO,
): Omit<TarefaFechamento, "id">[] {
  const doMes = new Set(existentes.filter((t) => t.mes === mes).map((t) => t.chave));
  const anterior = new Map(
    existentes.filter((t) => t.mes === mesAnteriorDe(mes)).map((t) => [t.chave, t]),
  );
  return modelo
    .filter((mo) => !doMes.has(mo.chave))
    .map((mo) => ({
      mes, chave: mo.chave, titulo: mo.titulo, descricao: mo.descricao, href: mo.href, ordem: mo.ordem,
      responsavelId: anterior.get(mo.chave)?.responsavelId ?? null,
      revisorId: anterior.get(mo.chave)?.revisorId ?? null,
      prazo: prazoDoModelo(mes, mo.diaPrazo),
      status: "pending" as const,
      concluidaPor: null, concluidaEm: null, revisadaPor: null, revisadaEm: null,
      autorrevisao: false, autorrevisaoMotivo: null,
    }));
}

/* ========================================================================== */
/* Situação — o que a tela marca                                               */
/* ========================================================================== */

/**
 * Atrasada = passou do prazo e ainda NÃO foi revisada.
 *
 * ⚠️ "Vence hoje" não é atraso (a mesma regra do contas a pagar): a tarefa
 * com prazo hoje ainda está no prazo até o fim do dia. E concluída sem revisão
 * continua podendo atrasar — o fechamento só termina quando alguém conferiu.
 */
export function atrasada(t: Pick<TarefaFechamento, "status" | "prazo">, hoje: string): boolean {
  return t.status !== "done" && !!t.prazo && t.prazo < hoje.slice(0, 10);
}

/* ========================================================================== */
/* A máquina                                                                   */
/* ========================================================================== */

export type ResultadoAcao =
  | { ok: true; tarefa: TarefaFechamento }
  | { ok: false; codigo: "transicao" | "segregacao" | "permissao" | "membro" | "travado"; erro: string };

const recusa = (codigo: Extract<ResultadoAcao, { ok: false }>["codigo"], erro: string): ResultadoAcao =>
  ({ ok: false, codigo, erro });

/** Concluir: pendente → aguardando revisão, carimbando quem concluiu. */
export function concluir(t: TarefaFechamento, ator: string, agora: string): ResultadoAcao {
  if (t.status !== "pending") return recusa("transicao", `A tarefa está "${ROTULO_STATUS[t.status]}" e não pode ser concluída de novo.`);
  return { ok: true, tarefa: { ...t, status: "review", concluidaPor: ator, concluidaEm: agora } };
}

/** Reabrir uma concluída que ninguém revisou ainda. */
export function reabrir(t: TarefaFechamento): ResultadoAcao {
  if (t.status !== "review") return recusa("transicao", "Só uma tarefa concluída e ainda não revisada pode ser reaberta.");
  return { ok: true, tarefa: { ...t, status: "pending", concluidaPor: null, concluidaEm: null } };
}

/**
 * A pergunta da segregação, isolada para a tela poder fazê-la ANTES do clique:
 * "se este ator revisar esta tarefa, o que acontece?".
 */
export function avaliarRevisao(
  t: Pick<TarefaFechamento, "status" | "concluidaPor">,
  ator: string,
  membros: readonly MembroFechamento[],
): { pode: true; autorrevisao: boolean } | { pode: false; codigo: "transicao" | "segregacao" | "permissao"; erro: string } {
  if (t.status !== "review") {
    return { pode: false, codigo: "transicao", erro: "A tarefa precisa estar concluída antes de ser revisada." };
  }
  const eu = membros.find((m) => m.id === ator);
  if (!eu?.podeRevisar) {
    return { pode: false, codigo: "permissao", erro: "Seu papel nesta organização não revisa o fechamento." };
  }
  if (t.concluidaPor && t.concluidaPor === ator) {
    // ⚠️ "Existe ALGUÉM que poderia revisar no meu lugar?" — não "a empresa é pequena?".
    const outro = membros.some((m) => m.id !== ator && m.podeRevisar);
    if (outro) {
      return { pode: false, codigo: "segregacao", erro: "Quem concluiu a tarefa não pode revisá-la — outra pessoa com o papel de fechamento precisa revisar." };
    }
    return { pode: true, autorrevisao: true };
  }
  return { pode: true, autorrevisao: false };
}

export const MOTIVO_AUTORREVISAO = "organização sem outro membro habilitado a revisar";

/** Revisar: aguardando revisão → revisada, com a segregação e o carimbo. */
export function revisar(
  t: TarefaFechamento, ator: string, membros: readonly MembroFechamento[], agora: string,
): ResultadoAcao {
  const a = avaliarRevisao(t, ator, membros);
  if (!a.pode) return recusa(a.codigo, a.erro);
  return {
    ok: true,
    tarefa: {
      ...t, status: "done", revisadaPor: ator, revisadaEm: agora,
      autorrevisao: a.autorrevisao, autorrevisaoMotivo: a.autorrevisao ? MOTIVO_AUTORREVISAO : null,
    },
  };
}

/** Desfazer a revisão (volta para aguardando revisão). */
export function desfazerRevisao(t: TarefaFechamento, ator: string, membros: readonly MembroFechamento[]): ResultadoAcao {
  if (t.status !== "done") return recusa("transicao", "Só uma tarefa revisada pode ter a revisão desfeita.");
  if (!membros.find((m) => m.id === ator)?.podeRevisar) return recusa("permissao", "Seu papel nesta organização não revisa o fechamento.");
  return { ok: true, tarefa: { ...t, status: "review", revisadaPor: null, revisadaEm: null, autorrevisao: false, autorrevisaoMotivo: null } };
}

/** Atribuir responsável, revisor e prazo — só a membros da organização. */
export function atribuir(
  t: TarefaFechamento,
  mudanca: Partial<Pick<TarefaFechamento, "responsavelId" | "revisorId" | "prazo">>,
  membros: readonly MembroFechamento[],
): ResultadoAcao {
  const ehMembro = (id: string | null | undefined) => !id || membros.some((m) => m.id === id);
  if (!ehMembro(mudanca.responsavelId)) return recusa("membro", "O responsável escolhido não é membro desta organização.");
  if (!ehMembro(mudanca.revisorId)) return recusa("membro", "O revisor escolhido não é membro desta organização.");
  return { ok: true, tarefa: { ...t, ...mudanca } };
}

/* ========================================================================== */
/* A trava do mês                                                              */
/* ========================================================================== */

export interface ProntidaoTrava {
  total: number;
  revisadas: number;
  /** Concluídas aguardando revisão. */
  aguardandoRevisao: number;
  aFazer: number;
  atrasadas: number;
  /** Todas revisadas — trava sem pedir nada. */
  completa: boolean;
  /** 0..1 — revisadas / total. `null` sem tarefa nenhuma. */
  fracao: number | null;
}

export function prontidao(tarefas: readonly TarefaFechamento[], hoje: string): ProntidaoTrava {
  const total = tarefas.length;
  const revisadas = tarefas.filter((t) => t.status === "done").length;
  return {
    total,
    revisadas,
    aguardandoRevisao: tarefas.filter((t) => t.status === "review").length,
    aFazer: tarefas.filter((t) => t.status === "pending").length,
    atrasadas: tarefas.filter((t) => atrasada(t, hoje)).length,
    completa: total > 0 && revisadas === total,
    fracao: total === 0 ? null : revisadas / total,
  };
}

/**
 * Pode travar? Com tudo revisado, sim. Com tarefa aberta, só com motivo de
 * `MOTIVO_MINIMO`+ caracteres — o mesmo teste do gatilho `accounting_periods_trava`.
 */
export function podeTravar(
  tarefas: readonly TarefaFechamento[], motivo: string | null | undefined,
): { pode: true; comMotivo: boolean } | { pode: false; abertas: number; erro: string } {
  const abertas = tarefas.filter((t) => t.status !== "done").length;
  if (abertas === 0) return { pode: true, comMotivo: false };
  if ((motivo ?? "").trim().length >= MOTIVO_MINIMO) return { pode: true, comMotivo: true };
  return {
    pode: false, abertas,
    erro: `${abertas} tarefa(s) ainda não foram concluídas e revisadas. Conclua e revise, ou escreva o motivo da trava (ao menos ${MOTIVO_MINIMO} caracteres).`,
  };
}
