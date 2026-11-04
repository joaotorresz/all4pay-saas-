/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS AGENTES DA QUATTRO AI — a moldura (Etapa 1 do plano "AI first", 03/11/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Um agente é UMA tarefa com dono: ele prepara o trabalho (a mensagem de
 * cobrança, a conciliação, a conta a pagar) e a pessoa aprova. O que cada
 * agente pode fazer sozinho é escolha da empresa, por NÍVEL e por LIMITE.
 *
 *   nível 0 · só observa .......... conta na trilha o que faria; não propõe
 *   nível 1 · prepara e pede ...... vai para "Para você aprovar"
 *   nível 2 · faz até o limite .... executa sozinho dentro do limite em R$ e
 *                                   por dia; acima disso, pede aprovação
 *   nível 3 · faz e avisa ......... executa tudo e conta depois
 *
 * ⚠️ O AGENTE PROPÕE, NUNCA GRAVA. Quem grava é o escritor de sempre de cada
 * fato (a régua, a baixa, a conta a pagar), depois do "Aprovar" ou dentro do
 * limite. Os números da proposta saem dos motores, nunca do modelo.
 *
 * ⚠️ O BANCO É QUEM RECUSA (migration 20261104120000): o nível máximo de cada
 * agente, a transição de estado da proposta e quem decide moram lá. Este
 * arquivo só descreve e roteia; uma tela que mentisse sobre o nível bateria
 * na restrição do banco.
 *
 * ⚠️ Nasce DESLIGADO duas vezes: o interruptor da plataforma (`AGENTES`,
 * lido só em `ligado.ts`) e o `ativo` de cada empresa, que nasce falso.
 *
 * Puro, tipado, demo-safe.
 */
export const VERSAO_AGENTES = "agentes/1.0.0";

export type IdAgente = "cobranca" | "conciliacao" | "contas_pagar" | "caixa" | "fechamento";
export type NivelAgente = 0 | 1 | 2 | 3;

export interface DescricaoAgente {
  id: IdAgente;
  nome: string;
  /** A missão em uma frase. */
  missao: string;
  /** Quando ele trabalha. */
  gatilho: string;
  /** O que ele prepara para a pessoa. */
  prepara: string;
  /** O nível mais alto que a empresa pode escolher. ⚠️ Espelho da restrição do banco. */
  nivelMaximo: NivelAgente;
  /**
   * Pronto = o agente já trabalha quando ligado. Em construção = aparece na
   * tela, mas não liga (a etapa dele no plano ainda não entrou).
   */
  pronto: boolean;
}

/**
 * O CATÁLOGO, na ordem do plano. ⚠️ Contas a pagar nunca passa do nível 1:
 * dinheiro saindo sozinho é o maior risco, e a restrição mora no banco.
 */
export const AGENTES: readonly DescricaoAgente[] = [
  {
    id: "cobranca", nome: "Agente de cobrança",
    missao: "Cobra quem vai vencer ou atrasou, no canal certo, pela régua da empresa.",
    gatilho: "Todo dia de manhã, quando um título chega a uma etapa da régua.",
    prepara: "A mensagem do dia de cada cliente, com o link de pagamento quando ele existe.",
    nivelMaximo: 3, pronto: true,
  },
  {
    id: "conciliacao", nome: "Agente de conciliação",
    missao: "Casa o extrato com os títulos e só pergunta o que não fechou.",
    gatilho: "Quando um extrato novo chega.",
    prepara: "O par extrato e título, com a categoria e o motivo.",
    nivelMaximo: 3, pronto: false,
  },
  {
    id: "contas_pagar", nome: "Agente de contas a pagar",
    missao: "Transforma boleto e nota da caixa de entrada em conta agendada.",
    gatilho: "Quando um documento chega à caixa de entrada.",
    prepara: "A conta com fornecedor, vencimento e valor, e o aviso de duplicidade ou boleto suspeito.",
    nivelMaximo: 1, pronto: false,
  },
  {
    id: "caixa", nome: "Agente de caixa",
    missao: "Vigia o caixa da semana e avisa do furo antes que ele aconteça.",
    gatilho: "Todo dia de manhã.",
    prepara: "O aviso do furo e a sugestão de antecipar ou adiar.",
    nivelMaximo: 1, pronto: false,
  },
  {
    id: "fechamento", nome: "Agente de fechamento",
    missao: "Fecha o mês, monta a DRE e entrega ao contador.",
    gatilho: "Nos primeiros dias úteis do mês.",
    prepara: "A lista do que falta para fechar e o pacote do contador.",
    nivelMaximo: 1, pronto: false,
  },
];

export const IDS_AGENTE: readonly IdAgente[] = AGENTES.map((a) => a.id);

export const descricaoDe = (id: IdAgente): DescricaoAgente => {
  const d = AGENTES.find((a) => a.id === id);
  if (!d) throw new Error(`agente desconhecido: ${id}`);
  return d;
};

export const NIVEIS: readonly { nivel: NivelAgente; nome: string; explica: string }[] = [
  { nivel: 0, nome: "Só observa", explica: "Conta na trilha o que faria. Não propõe nem faz nada." },
  { nivel: 1, nome: "Prepara e pede aprovação", explica: "Tudo vai para Para você aprovar." },
  { nivel: 2, nome: "Faz até o limite", explica: "Faz sozinho dentro do limite. Acima dele, pede aprovação." },
  { nivel: 3, nome: "Faz e avisa", explica: "Faz tudo sozinho e conta depois." },
];

/** A configuração de UM agente numa empresa (linha de `agentes`). */
export interface ConfigAgente {
  agente: IdAgente;
  ativo: boolean;
  nivel: NivelAgente;
  /** Limite por ação, em R$. 0 = nenhuma ação com valor sai sozinha. */
  limiteValor: number;
  /** Quantas ações por dia ele faz sozinho. 0 = nenhuma. */
  limiteDia: number;
}

/**
 * O padrão: DESLIGADO, no nível 1. ⚠️ Espelho de `agentes_padrao()` no banco
 * (o seed e o gatilho leem de lá); a guarda `agentes` confere os dois.
 */
export const configPadrao = (agente: IdAgente): ConfigAgente => ({
  agente, ativo: false, nivel: 1, limiteValor: 0, limiteDia: 0,
});

/* ────────────────────────── as propostas ────────────────────────── */

export type EstadoProposta = "pendente" | "aprovada" | "recusada" | "executada" | "falhou" | "expirada";

/** O que cada estado diz na tela. */
export const ROTULO_ESTADO: Record<EstadoProposta, string> = {
  pendente: "Para você aprovar",
  aprovada: "Aprovada",
  recusada: "Recusada",
  executada: "Feita",
  falhou: "Não deu certo",
  expirada: "Passou do prazo",
};

/** Estados de onde não se sai. ⚠️ Espelho do gatilho do banco. */
export const ESTADOS_TERMINAIS: readonly EstadoProposta[] = ["recusada", "executada", "falhou", "expirada"];

export interface PropostaAgente {
  id: string;
  agente: IdAgente;
  /** O que ele quer fazer, curto ("Cobrar Padaria do Zé"). */
  titulo: string;
  /** Por que, com os fatos ("Venceu há 5 dias, R$ 1.200,00"). */
  porque: string;
  /** O valor envolvido, quando há. Nulo = ação sem valor (uma mensagem). */
  valor: number | null;
  estado: EstadoProposta;
  criadaEm: string;
  decididaEm?: string | null;
  motivo?: string | null;
}

/* ────────────────────────── o roteamento ────────────────────────── */

export type Destino = "avisar" | "aprovar" | "executar";

export interface PedidoDeRota {
  config: ConfigAgente;
  /** Valor da ação; nulo quando ela não envolve dinheiro. */
  valor: number | null;
  /** Quantas ações este agente já fez SOZINHO hoje, nesta empresa. */
  feitasHoje: number;
}

/**
 * Para onde vai UMA proposta. Falha fechada: na dúvida, pede aprovação.
 *
 *  · agente desligado, ou nível 0 ........ avisar (nada se executa)
 *  · nível 1 ............................. aprovar
 *  · nível 2 ............................. executar só se cabe no valor E no dia
 *  · nível 3 ............................. executar
 *  · acima do nível máximo do agente ..... trata como o máximo (o banco recusa
 *                                          gravar um nível maior; isto é o cinto)
 */
export function rotear({ config, valor, feitasHoje }: PedidoDeRota): Destino {
  if (!config.ativo) return "avisar";
  const nivel = Math.min(config.nivel, descricaoDe(config.agente).nivelMaximo) as NivelAgente;
  if (nivel === 0) return "avisar";
  if (nivel === 1) return "aprovar";
  if (nivel === 3) return "executar";
  // nível 2
  if (!(config.limiteDia > 0) || feitasHoje >= config.limiteDia) return "aprovar";
  if (valor != null) {
    if (!Number.isFinite(valor) || valor < 0) return "aprovar";
    if (!(config.limiteValor > 0) || valor > config.limiteValor) return "aprovar";
  }
  return "executar";
}

/** A frase que a tela mostra sob o nível escolhido. */
export function resumoDoNivel(c: ConfigAgente, formatar: (v: number) => string): string {
  if (!c.ativo) return "Desligado. Nada é feito nem proposto.";
  const nivel = Math.min(c.nivel, descricaoDe(c.agente).nivelMaximo);
  if (nivel === 0) return "Só observa: conta na trilha o que faria, sem propor nem fazer nada.";
  if (nivel === 1) return "Prepara tudo e espera a sua aprovação.";
  if (nivel === 3) return "Faz tudo sozinho e conta depois.";
  if (!(c.limiteDia > 0)) return "Sem limite por dia definido: tudo espera a sua aprovação.";
  const valor = c.limiteValor > 0 ? `até ${formatar(c.limiteValor)} por ação` : "só ações sem valor";
  return `Faz sozinho ${valor}, no máximo ${c.limiteDia} por dia. O resto espera a sua aprovação.`;
}
