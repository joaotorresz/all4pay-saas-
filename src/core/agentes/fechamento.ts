/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O AGENTE DE FECHAMENTO (Etapa 8 do plano "AI first", 05/11/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nos primeiros dias do mês ele olha o checklist de fechamento do mês que
 * acabou (o MESMO da tela: `core/close/checklist`, gravado em `close_tasks`) e
 * propõe o próximo passo:
 *  - checklist que ainda não começou: "começar o fechamento";
 *  - cada tarefa aberta: fazer (a fazer) ou revisar (aguardando revisão),
 *    com o prazo e o atraso;
 *  - tudo revisado e o mês aberto: "travar o mês".
 *
 * ⚠️ O "Aprovar" abre a tarefa na tela de sempre (o padrão que o dono escolheu
 * para o agente de caixa). O agente nunca conclui, revisa nem trava: o
 * fechamento é sempre da pessoa, e o nível máximo é 1 (o banco recusa mais).
 *
 * ⚠️ A chave leva o mês e o passo (`tarefa:<mês>:<tarefa>:<passo>`): quando a
 * tarefa anda (a fazer → revisar → revisada), a proposta antiga expira e a do
 * passo novo aparece.
 *
 * Puro: nada de banco, relógio ou provedor.
 */
import { mesLabel } from "@/core/close";
import { mesAnteriorDe, MODELO_PADRAO, type StatusTarefa } from "@/core/close/checklist";
import { rotear, type ConfigAgente, type Destino } from "./index";

/** Até que dia do mês ele cobra o fechamento do mês anterior. */
export const DIA_LIMITE_FECHAMENTO = 20;

/** A tela do checklist (onde começa e onde trava). */
export const ENDERECO_CHECKLIST = "/dashboard/reports/monthly-closing?painel=checklist";

export interface TarefaParaAgente {
  chave: string;
  titulo: string;
  href: string | null;
  ordem: number;
  status: StatusTarefa | "running";
  prazo: string | null;
}

export interface FontesFechamento {
  /** "YYYY-MM". */
  mes: string;
  travado: boolean;
  tarefas: TarefaParaAgente[];
}

export interface PropostaDeFechamento {
  chave: string;
  titulo: string;
  porque: string;
  dados: { mes: string; passo: "comecar" | "fazer" | "revisar" | "travar"; tarefa: string | null; href: string };
}

const dataBR = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
};

/** O mês que o agente cobra hoje, ou nulo fora da janela (depois do dia 20). */
export function mesParaFechar(hoje: string): string | null {
  const dia = Number(hoje.slice(8, 10));
  if (!(dia >= 1 && dia <= DIA_LIMITE_FECHAMENTO)) return null;
  return mesAnteriorDe(hoje.slice(0, 7));
}

/** O nome curto do mês ("outubro"), para o título. */
const nomeDoMes = (mes: string) => mesLabel(mes).replace(/ de \d{4}$/, "");

const passoDe = (s: TarefaParaAgente["status"]): "fazer" | "revisar" | null =>
  s === "done" ? null : s === "review" ? "revisar" : "fazer";

/**
 * As propostas do mês, sem repetir o que já teve proposta (a recusada não
 * volta enquanto a tarefa estiver no mesmo passo).
 */
export function propostasDeFechamento(f: FontesFechamento, hoje: string, jaPropostas: ReadonlySet<string>): PropostaDeFechamento[] {
  if (f.travado) return [];
  const mes = f.mes;
  const nome = nomeDoMes(mes);
  const out: PropostaDeFechamento[] = [];
  const add = (p: PropostaDeFechamento) => { if (!jaPropostas.has(p.chave)) out.push(p); };

  if (f.tarefas.length === 0) {
    add({
      chave: `comecar:${mes}`,
      titulo: `Começar o fechamento de ${nome}`,
      porque: `O checklist de ${mesLabel(mes)} ainda não começou: são ${MODELO_PADRAO.length} tarefas, da conciliação dos bancos ao envio ao contador. Ao aprovar, o checklist abre para você.`,
      dados: { mes, passo: "comecar", tarefa: null, href: ENDERECO_CHECKLIST },
    });
    return out;
  }

  const abertas = [...f.tarefas].sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo))
    .filter((t) => passoDe(t.status));
  for (const t of abertas) {
    const passo = passoDe(t.status)!;
    const prazo = !t.prazo ? "Sem prazo."
      : t.prazo < hoje.slice(0, 10) ? `Atrasada: o prazo era ${dataBR(t.prazo)}.`
        : t.prazo === hoje.slice(0, 10) ? "Vence hoje." : `Prazo: ${dataBR(t.prazo)}.`;
    add({
      chave: `tarefa:${mes}:${t.chave}:${passo}`,
      // "Conferir ·": a tarefa já pode se chamar "Revisar o DRE" (nada de "Revisar revisar").
      titulo: passo === "revisar" ? `Conferir · ${t.titulo}` : t.titulo,
      porque: `Fechamento de ${mesLabel(mes)}. ${passo === "revisar" ? "Já foi feita e espera alguém conferir." : "Ainda está a fazer."} ${prazo} Ao aprovar, a tarefa abre para você.`,
      dados: { mes, passo, tarefa: t.chave, href: t.href || ENDERECO_CHECKLIST },
    });
  }
  if (abertas.length === 0) {
    add({
      chave: `travar:${mes}`,
      titulo: `Travar ${nome}`,
      porque: `Todas as tarefas de ${mesLabel(mes)} foram feitas e revisadas. Travar o mês impede que um lançamento mude o que já foi entregue ao contador. Ao aprovar, o checklist abre para você travar.`,
      dados: { mes, passo: "travar", tarefa: null, href: ENDERECO_CHECKLIST },
    });
  }
  return out;
}

/** Nunca faz sozinho: no máximo pede. */
export function planejarFechamento(propostas: readonly PropostaDeFechamento[], config: ConfigAgente): { chave: string; destino: Destino }[] {
  return propostas.map((p) => {
    const destino = rotear({ config, valor: null, feitasHoje: 0 });
    return { chave: p.chave, destino: destino === "executar" ? "aprovar" : destino };
  });
}

export const MOTIVO_FECHAMENTO = {
  travado: "O mês já foi travado.",
  andou: "A tarefa andou: o passo seguinte, se houver, vem numa sugestão nova.",
  outroMes: "O fechamento deste mês saiu da janela do agente.",
} as const;

/**
 * A proposta pendente ainda vale? Só se o mês é o de hoje, não travou, e o
 * passo da chave é o passo atual da tarefa (ou o checklist continua no mesmo
 * estado para "começar" e "travar").
 */
export function propostaDeFechamentoVale(chave: string, f: FontesFechamento | null): string | null {
  const [tipo, mes, tarefa, passo] = chave.split(":");
  if (!f || f.mes !== mes) return MOTIVO_FECHAMENTO.outroMes;
  if (f.travado) return MOTIVO_FECHAMENTO.travado;
  if (tipo === "comecar") return f.tarefas.length === 0 ? null : MOTIVO_FECHAMENTO.andou;
  if (tipo === "travar") return f.tarefas.length > 0 && f.tarefas.every((t) => t.status === "done") ? null : MOTIVO_FECHAMENTO.andou;
  const t = f.tarefas.find((x) => x.chave === tarefa);
  return t && passoDe(t.status) === passo ? null : MOTIVO_FECHAMENTO.andou;
}
