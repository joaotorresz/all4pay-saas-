/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CENTRAL FINANCEIRA — a máquina de estados do título, a alçada e a fila única
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Contas a Pagar e Contas a Receber são, cada um, três coisas: relatório,
 * análise e ENTRADA de dado. Nenhum dos dois CONFIRMA nada — a confirmação e a
 * baixa acontecem AQUI, num lugar só, com segregação de funções e alçada. E o
 * Upload é a quarta porta de entrada. Nada entra no relatório sem passar por
 * confirmação humana ou por regra explícita.
 *
 * Puro, tipado, sem I/O e sem relógio (o `agora` entra por parâmetro).
 * Versão `central/1.0.0`.
 *
 * ⚠️ **O que este módulo NÃO reimplementa.** A segregação (quem lança ≠ quem
 * aprova) já é lei do BANCO desde a ONDA 9: o gatilho `approvals_segregacao`
 * carimba `approver_id = auth.uid()` e a restrição `approver_id <> requester_id`
 * recusa a auto-aprovação. E a alçada por faixa de valor já existe em
 * `core/institutional` (`regraParaValor`). Este módulo dá o VOCABULÁRIO comum —
 * a máquina de estados do título — e repete a MESMA regra de segregação/alçada
 * para a tela poder explicar antes do clique o que o banco recusaria depois.
 */

export const CENTRAL_VERSION = "central/1.0.0";

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. A MÁQUINA DE ESTADOS
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Os estados de um título. A ORDEM do fluxo feliz é
 * Previsto → Confirmado → Baixado → Conciliado; Cancelado e Estornado são
 * saídas.
 *
 * ⚠️ **Previsto ≠ Confirmado, e essa é a distinção que a Central existe para
 * criar.** Hoje "Registrar pagamento" dá baixa DIRETA (A4P-052) — pula a
 * confirmação. Aqui esse caminho morre: nada vai de Previsto a Baixado sem
 * passar por Confirmado, e a confirmação é onde a alçada e a segregação mordem.
 */
export type Situacao =
  | "previsto"
  | "confirmado"
  | "baixado"
  | "conciliado"
  | "cancelado"
  | "estornado";

/**
 * As transições PERMITIDAS. Tudo que não está aqui é proibido — não há caminho
 * lateral. A guarda prova isso plantando uma transição fora da tabela.
 *
 * ⚠️ `baixado → conciliado` é a única que avança depois da baixa; a conciliação
 * é o casamento com o extrato (Upload / Open Finance). `estornado` é terminal:
 * o estorno cria uma CONTRAPARTIDA, não desfaz o original (a lição do
 * fechamento contábil, ONDA 13).
 */
export const TRANSICOES: Record<Situacao, Situacao[]> = {
  previsto: ["confirmado", "cancelado"],
  confirmado: ["baixado", "cancelado", "previsto"], // volta a previsto = "desconfirmar", só antes da baixa
  baixado: ["conciliado", "estornado"],
  conciliado: ["estornado"],
  cancelado: [],
  estornado: [],
};

export function transicaoValida(de: Situacao, para: Situacao): boolean {
  return TRANSICOES[de]?.includes(para) ?? false;
}

/**
 * ⚠️ Confirmar é a transição que EXIGE alçada e segregação; as demais têm
 * regras próprias. Declarar por transição, e não por um `if` na tela, é o que
 * impede uma tela nova de esquecer a regra.
 */
export const TRANSICAO_EXIGE_APROVACAO: Record<string, boolean> = {
  "previsto->confirmado": true,
  "confirmado->baixado": false, // a baixa executa o que a confirmação já autorizou
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. SEGREGAÇÃO (R1) E ALÇADA
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Papéis, do menos ao mais poderoso — o mesmo vocabulário de role_permissions. */
export type Papel = "leitor" | "lancador" | "aprovador" | "fechador" | "admin" | "titular";

/**
 * A FAIXA DE ALÇADA por papel — quanto cada um pode aprovar.
 *
 * ⚠️ **Sem alçada configurada, NADA é aprovável — não "tudo é aprovável".** Um
 * papel ausente deste mapa tem teto ZERO. É a direção segura: um sistema que
 * libera o que não sabe classificar é o Modo Pro cortina de novo.
 *
 * Estes são os PADRÕES (o joão pediu "padrão editável"): a tela deixa ajustar,
 * e a alçada real de cada organização vence estes valores.
 */
export const ALCADA_PADRAO: Record<Papel, number> = {
  leitor: 0,
  lancador: 0, // lança, não aprova
  aprovador: 5_000,
  fechador: 50_000,
  admin: Infinity,
  titular: Infinity,
};

export interface Lancamento {
  id: string;
  valor: number;
  /** Quem CRIOU o lançamento — a outra ponta da segregação. */
  lancadoPor: string;
  situacao: Situacao;
}

export interface Aprovador {
  id: string;
  papel: Papel;
}

export type MotivoRecusa =
  | "auto_aprovacao"
  | "acima_da_alcada"
  | "papel_sem_alcada"
  | "situacao_nao_permite";

export interface VeredictoAprovacao {
  pode: boolean;
  motivo?: MotivoRecusa;
  /** Frase pronta para a tela, sempre que `pode` é false. */
  explicacao?: string;
  /** Quando acima da alçada: o teto do papel, para a tela dizer "sobe para…". */
  tetoDoPapel?: number;
}

/**
 * ⚠️ **R1, INEGOCIÁVEL: quem lançou NUNCA aprova o próprio lançamento.** É a
 * razão de a Central existir. Esta função é a MESMA regra que o gatilho do
 * banco aplica — aqui ela existe para a tela poder desabilitar o botão e dizer
 * por quê, antes do clique. A autoridade continua sendo o banco.
 */
export function podeAprovar(
  lanc: Lancamento,
  aprovador: Aprovador,
  alcada: Record<Papel, number> = ALCADA_PADRAO,
): VeredictoAprovacao {
  // Só faz sentido aprovar quem está PREVISTO (a caminho de confirmado).
  if (lanc.situacao !== "previsto") {
    return {
      pode: false, motivo: "situacao_nao_permite",
      explicacao: `Só um título previsto pode ser confirmado; este está ${rotuloSituacao(lanc.situacao)}.`,
    };
  }

  // R1 — a regra que manda em todas as outras.
  if (lanc.lancadoPor === aprovador.id) {
    return {
      pode: false, motivo: "auto_aprovacao",
      explicacao: "Você lançou este título. Quem lança não aprova o próprio lançamento — outra pessoa precisa confirmar.",
    };
  }

  const teto = alcada[aprovador.papel];
  // ⚠️ Papel sem alçada declarada = teto ZERO, não infinito.
  if (teto === undefined || teto <= 0) {
    return {
      pode: false, motivo: "papel_sem_alcada", tetoDoPapel: 0,
      explicacao: `O papel "${aprovador.papel}" não tem alçada de aprovação. Configure a alçada ou peça a quem tem.`,
    };
  }

  if (lanc.valor > teto) {
    return {
      pode: false, motivo: "acima_da_alcada", tetoDoPapel: teto,
      explicacao: `Este título (${fmt(lanc.valor)}) está acima da sua alçada (${fmt(teto)}). Ele sobe para um papel com alçada maior.`,
    };
  }

  return { pode: true };
}

/**
 * A quem o título SOBE quando está acima da alçada de todos os aprovadores
 * disponíveis. Devolve o menor papel cujo teto cobre o valor — "sobe o mínimo
 * necessário", não "vai direto ao titular".
 */
export function papelQueAprova(
  valor: number,
  alcada: Record<Papel, number> = ALCADA_PADRAO,
): Papel | null {
  const ordem: Papel[] = ["aprovador", "fechador", "admin", "titular"];
  for (const p of ordem) {
    if ((alcada[p] ?? 0) >= valor) return p;
  }
  return null; // nem o titular cobre — só acontece com alçada mal configurada
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. A FILA ÚNICA DE CONFIRMAÇÃO
 * ═══════════════════════════════════════════════════════════════════════════ */

export type Origem = "contas-a-pagar" | "contas-a-receber" | "upload";

export interface ItemFila {
  id: string;
  descricao: string;
  contraparte: string;
  valor: number;
  /** "entrada" (receber) | "saida" (pagar) — decide a coluna e o sinal. */
  direcao: "entrada" | "saida";
  vencimento: string;
  situacao: Situacao;
  origem: Origem;
  lancadoPor: string;
}

export interface FilaConfirmacao {
  itens: ItemFila[];
  /** Só os que esperam confirmação (situacao = previsto). */
  aguardando: ItemFila[];
  totalAguardando: number;
  porOrigem: Record<Origem, number>;
}

/**
 * Monta a fila única: tudo que entrou por Contas a Pagar, Contas a Receber ou
 * Upload aparece aqui, com a ORIGEM visível. A Central não cria título nenhum —
 * ela recebe o que as quatro portas produziram e organiza a confirmação.
 */
export function montarFila(itens: ItemFila[]): FilaConfirmacao {
  const aguardando = itens.filter((i) => i.situacao === "previsto");
  const porOrigem: Record<Origem, number> = {
    "contas-a-pagar": 0, "contas-a-receber": 0, "upload": 0,
  };
  for (const i of aguardando) porOrigem[i.origem] = (porOrigem[i.origem] ?? 0) + 1;
  return {
    itens, aguardando,
    totalAguardando: aguardando.length,
    porOrigem,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. O EFEITO NO RELATÓRIO — Confirmado × Previsto
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ **CONFIRMADO ≠ PREVISTO, e o relatório NUNCA mistura sem dizer.** O DRE e o
 * DFC passam a distinguir o que foi confirmado (compromisso firme) do que é só
 * previsto (ainda pode não acontecer), e o usuário escolhe ver com ou sem
 * previsto.
 *
 * Estas são as situações que contam como "confirmado" para o relatório: um
 * título de que a operação já não pode se livrar sem estornar.
 */
export const SITUACOES_CONFIRMADAS: Situacao[] = ["confirmado", "baixado", "conciliado"];

export function ehConfirmado(s: Situacao): boolean {
  return SITUACOES_CONFIRMADAS.includes(s);
}

export type VisaoRelatorio = "confirmado" | "com-previsto";

/**
 * Filtra os títulos que entram num relatório conforme a visão escolhida.
 * `confirmado`: só o firme. `com-previsto`: firme + previsto (mas nunca
 * cancelado nem estornado — esses saíram do resultado por definição).
 */
export function titulosDaVisao<T extends { situacao: Situacao }>(
  titulos: T[], visao: VisaoRelatorio,
): T[] {
  return titulos.filter((t) => {
    if (t.situacao === "cancelado" || t.situacao === "estornado") return false;
    if (visao === "confirmado") return ehConfirmado(t.situacao);
    return true; // com-previsto: tudo que não saiu
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * util
 * ═══════════════════════════════════════════════════════════════════════════ */

const ROTULO: Record<Situacao, string> = {
  previsto: "previsto",
  confirmado: "confirmado",
  baixado: "baixado",
  conciliado: "conciliado",
  cancelado: "cancelado",
  estornado: "estornado",
};
export function rotuloSituacao(s: Situacao): string {
  return ROTULO[s] ?? s;
}

/**
 * ⚠️ Formatador PRÓPRIO, à mão — a Central é core e não importa a tela. Duas
 * casas, vírgula decimal, `R$` colado (a convenção do sistema). Não chama
 * `formatBRL`: um core que importa `lib/format` cria acoplamento de camada, e
 * o contrato de guarda que confere a frase perderia independência.
 */
function fmt(v: number): string {
  if (!Number.isFinite(v)) return "sem limite";
  const [int, dec] = Math.abs(v).toFixed(2).split(".");
  const milhar = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 ? "-" : ""}R$${milhar},${dec}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. DERIVAÇÃO da situação a partir do status legado
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ **A situação, quando o dado não a tem ainda.** A coluna `situacao` só
 * existe depois da migration da Central; até lá (e em demo), derivamos do
 * `status` legado com a MESMA regra do backfill da migration — um título pago é
 * `baixado` (a baixa aconteceu, mesmo antes de a Central existir), cancelado é
 * `cancelado`, o resto é `previsto`. Uma regra de derivação diferente da do
 * backfill faria a tela e o banco discordarem no dia da migration.
 */
export function situacaoDe(m: { status: "pendente" | "pago" | "cancelado"; situacao?: Situacao }): Situacao {
  if (m.situacao) return m.situacao;
  if (m.status === "pago") return "baixado";
  if (m.status === "cancelado") return "cancelado";
  return "previsto";
}
