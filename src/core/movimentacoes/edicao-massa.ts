/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EDIÇÃO EM MASSA DE TÍTULOS — o que pode mudar, o que NÃO pode, e por quê
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Trocar a categoria de trinta títulos um a um é o trabalho que faz a pessoa
 * desistir de classificar direito. A edição em massa resolve isso — e é
 * justamente por mexer em muitos títulos de uma vez que ela precisa de regra
 * escrita: um clique errado aqui não erra UMA linha, erra o mês.
 *
 * ⚠️ **O PLANO VEM ANTES DA GRAVAÇÃO.** `planejarEdicao` não grava nada: devolve
 * quantos títulos mudam, quanto somam, o de→para de cada grupo e — com o MESMO
 * peso — quais ficaram de fora e por quê. A tela mostra o plano e só então
 * grava. Um "aplicado a 30 títulos" que descobre depois que 4 eram de mês
 * fechado transfere para a pessoa o trabalho de achar quais.
 *
 * As quatro recusas, cada uma com o defeito que evita:
 *
 *  1. **Mês FECHADO não muda** — nem o título que ESTÁ nele, nem o vencimento
 *     que o levaria PARA ele. O fechamento existe para o balancete entregue ao
 *     contador não se mover; reclassificar em lote dentro de um mês fechado é
 *     exatamente o movimento que ele proíbe. A correção de mês fechado é
 *     ESTORNO rastreado, não edição.
 *  2. **Vencimento só muda no PREVISTO.** Um título baixado já moveu dinheiro
 *     numa data real; trocar o vencimento dele reescreveria o aging e a
 *     pontualidade de pagamento sem que nada tenha acontecido. Categoria,
 *     centro e projeto do baixado PODEM mudar — são classificação, não fato.
 *  3. **Cancelado e estornado ficam como estão.** São estados terminais
 *     (decisão do dono: cancelado não ressuscita), e editá-los em lote é o
 *     caminho mais curto para um terminal virar transitório sem ninguém decidir.
 *  4. **Nada muda o que já está igual** — não vira "alterado", não vira evento
 *     na trilha. Um evento que diz que nada mudou esconde o que mudou.
 *
 * Puro, sem relógio (`hoje` e os meses fechados entram por parâmetro).
 */
import type { RiskMovement } from "@/core/risk-engine/types";

export const EDICAO_MASSA_VERSION = "edicao-massa/1.0.0";

export type CampoEdicao = "categoria" | "centro" | "projeto" | "vencimento";

export const ROTULO_CAMPO: Record<CampoEdicao, string> = {
  categoria: "Categoria",
  centro: "Centro de custo",
  projeto: "Projeto",
  vencimento: "Vencimento",
};

export interface AlteracaoEmMassa {
  campo: CampoEdicao;
  /** O valor novo: id (categoria/centro/projeto) ou data ISO (vencimento). Vazio = remover. */
  para: string | null;
  /** Como o valor novo se LÊ na tela — o nome, não o id. */
  paraRotulo: string;
}

export type MotivoRecusa = "mes_fechado" | "destino_fechado" | "nao_previsto" | "terminal" | "igual" | "data_invalida";

export const ROTULO_RECUSA: Record<MotivoRecusa, string> = {
  mes_fechado: "está em mês fechado — a correção é por estorno",
  destino_fechado: "o novo vencimento cai em mês fechado",
  nao_previsto: "já foi baixado — vencimento só muda em título previsto",
  terminal: "cancelado ou estornado não se edita",
  igual: "já está com esse valor",
  data_invalida: "a data informada não é válida",
};

export interface ItemPlano {
  id: string;
  valor: number;
  de: string;
  para: string;
}

export interface Recusa {
  id: string;
  valor: number;
  motivo: MotivoRecusa;
  explicacao: string;
}

export interface GrupoDePara {
  de: string;
  para: string;
  quantidade: number;
  soma: number;
}

export interface PlanoEdicao {
  alteracao: AlteracaoEmMassa;
  aplicar: ItemPlano[];
  recusados: Recusa[];
  quantidade: number;
  soma: number;
  grupos: GrupoDePara[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const mes = (iso: string | null | undefined) => (iso ?? "").slice(0, 7);

/** O valor ATUAL do campo, como se lê na tela. */
export function valorAtual(m: RiskMovement, campo: CampoEdicao): string {
  switch (campo) {
    case "categoria": return m.category ?? "";
    case "centro": return m.costCenter ?? "";
    case "projeto": return m.projeto ?? "";
    case "vencimento": return (m.due_date ?? "").slice(0, 10);
  }
}

/**
 * ⚠️ "Terminal" lê as DUAS colunas: `situacao` é a máquina de estados e
 * `status` é a derivação dela. Olhar só uma deixaria passar o estornado, que
 * no `status` aparece como pago.
 */
const ehTerminal = (m: RiskMovement) =>
  m.status === "cancelado" || m.situacao === "cancelado" || m.situacao === "estornado";

const ehPrevisto = (m: RiskMovement) =>
  m.status === "pendente" && (!m.situacao || m.situacao === "previsto" || m.situacao === "confirmado");

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function planejarEdicao(
  titulos: readonly RiskMovement[],
  alteracao: AlteracaoEmMassa,
  ctx: { mesesFechados: readonly string[] },
): PlanoEdicao {
  const fechados = new Set(ctx.mesesFechados.map((m) => m.slice(0, 7)));
  const aplicar: ItemPlano[] = [];
  const recusados: Recusa[] = [];
  const recusar = (m: RiskMovement, motivo: MotivoRecusa) =>
    recusados.push({ id: m.id, valor: r2(Math.abs(m.amount)), motivo, explicacao: ROTULO_RECUSA[motivo] });

  const para = alteracao.campo === "vencimento" ? (alteracao.para ?? "") : alteracao.paraRotulo;
  for (const m of titulos) {
    if (ehTerminal(m)) { recusar(m, "terminal"); continue; }
    // ⚠️ A trava olha o mês em que o título ESTÁ — é o mesmo campo que o
    // gatilho do banco lê (`due_date`). Ler outra data aqui faria a tela
    // aceitar o que o banco recusa, e a recusa chegaria como erro genérico.
    if (fechados.has(mes(m.due_date))) { recusar(m, "mes_fechado"); continue; }
    if (alteracao.campo === "vencimento") {
      if (!DATA.test(para)) { recusar(m, "data_invalida"); continue; }
      if (!ehPrevisto(m)) { recusar(m, "nao_previsto"); continue; }
      if (fechados.has(mes(para))) { recusar(m, "destino_fechado"); continue; }
    }
    const de = valorAtual(m, alteracao.campo);
    if (de === para) { recusar(m, "igual"); continue; }
    aplicar.push({ id: m.id, valor: r2(Math.abs(m.amount)), de, para });
  }

  const porDe = new Map<string, GrupoDePara>();
  for (const a of aplicar) {
    const g = porDe.get(a.de) ?? { de: a.de, para: a.para, quantidade: 0, soma: 0 };
    g.quantidade += 1;
    g.soma = r2(g.soma + a.valor);
    porDe.set(a.de, g);
  }
  return {
    alteracao,
    aplicar,
    recusados,
    quantidade: aplicar.length,
    soma: r2(aplicar.reduce((s, a) => s + a.valor, 0)),
    grupos: Array.from(porDe.values()).sort((a, b) => b.soma - a.soma),
  };
}

/** O resumo da trilha para UM título — "Categoria: de X para Y". */
export const resumoDoEvento = (campo: CampoEdicao, de: string, para: string): string =>
  `${ROTULO_CAMPO[campo]}: de ${de || "(vazio)"} para ${para || "(vazio)"} · edição em massa`;
