/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PAINEL DE CONTAS A RECEBER — e por que ele NÃO é o de pagar espelhado.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A estrutura é a mesma do `core/contas-pagar`, e de propósito: as duas telas
 * respondem "quanto, em que situação e em que dia cai", e duas telas do mesmo
 * produto que respondem a mesma pergunta com desenhos diferentes obrigam quem
 * opera a reaprender a leitura ao trocar de lado.
 *
 * Mas **três coisas mudam**, e nenhuma delas é cosmética:
 *
 * ⚠️ **1. NEM TODA ENTRADA É ALGO QUE ALGUÉM DEVE.**
 *
 * No lado de pagar, `type === "saida"` basta. Aqui não: transferência entre
 * contas próprias, resgate de aplicação, empréstimo tomado e rendimento
 * financeiro entram no extrato como ENTRADA e não são recebível — ninguém os
 * deve à empresa. Contá-los faria a tela dizer que há dinheiro a receber que
 * não existe, e a mesma entrada apareceria como cobrança a fazer.
 *
 * É o defeito que a ONDA 13 já mediu na base do imposto ("a base era toda
 * entrada", R$ 35.900 de não-faturamento dentro dela). A regra vem de lá —
 * `foraDaBaseTributavel`, com os termos ancorados em `\b` para "aporte" não
 * casar dentro de "transporte".
 *
 * ⚠️ **2. O ATRASO TEM IDADE, e é ela que decide a ação.**
 *
 * Contas a pagar não precisa disso: o que venceu, paga-se. No recebível a
 * idade é a informação: 15 dias de atraso é um lembrete, 90 dias é protesto ou
 * perda. Um total de "vencidas" sem faixas esconde a diferença entre uma
 * carteira que atrasa e uma carteira que não paga — e as duas exigem coisas
 * opostas de quem cobra.
 *
 * ⚠️ **3. A CONCENTRAÇÃO É RISCO, e o total a esconde.**
 *
 * R$ 100.000 a receber de vinte clientes e R$ 100.000 de um só são o mesmo
 * número e situações diferentes: no segundo, um calote quebra o mês. Contas a
 * pagar não tem esse problema — concentrar fornecedor é poder de barganha, não
 * exposição.
 *
 * Puro, tipado, demo-safe, sem I/O e sem relógio. Versão `contas-receber/1.0.0`.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { magnitude, liquidado, previsto, cancelado, dataDe } from "@/core/indicadores/convencoes";
import { foraDaBaseTributavel } from "@/core/indicadores";

export const CONTAS_RECEBER_VERSION = "contas-receber/1.0.0";

/* ========================================================================== */
/* O recorte                                                                   */
/* ========================================================================== */

export interface FiltroContasReceber {
  /** Início do período, inclusive (YYYY-MM-DD). */
  de: string;
  /** Fim do período, inclusive. */
  ate: string;
  /** Nome do projeto. `null`/ausente = todos. */
  projeto?: string | null;
  /** Nome do centro de custo. `null`/ausente = todos. */
  centro?: string | null;
  /** Nome do cliente. `null`/ausente = todos. */
  cliente?: string | null;
}

/**
 * ⚠️ Entrada, não cancelada, **e que seja faturamento**.
 *
 * A terceira condição é a que separa este motor de uma cópia do de pagar. Ver
 * o bloco 1 do cabeçalho: transferência entre contas próprias não é recebível.
 */
export const ehContaAReceber = (m: RiskMovement) =>
  m.type === "entrada" && !cancelado(m) && !foraDaBaseTributavel(m.category);

function passaNosFiltros(
  m: RiskMovement, f: FiltroContasReceber, nomes: Record<string, string> | undefined,
): boolean {
  if (f.projeto && m.projeto !== f.projeto) return false;
  if (f.centro && m.costCenter !== f.centro) return false;
  if (f.cliente && nomeDaContraparte(m, nomes) !== f.cliente) return false;
  return true;
}

const dentro = (d: string | null | undefined, de: string, ate: string) =>
  !!d && d.slice(0, 10) >= de && d.slice(0, 10) <= ate;

/**
 * O nome que a tela mostra.
 *
 * ⚠️ Cai na CATEGORIA quando não há cadastro, e não em "Sem cliente": num
 * extrato importado a maioria das entradas ainda não tem `party_id`, e uma
 * coluna inteira de "Sem cliente" faz a tela parecer quebrada quando ela está
 * apenas descrevendo dado que ninguém classificou.
 */
const nomeDaContraparte = (m: RiskMovement, nomes: Record<string, string> | undefined) =>
  (m.party_id ? nomes?.[m.party_id] : null) ?? m.category ?? "Sem cliente";

/* ========================================================================== */
/* O que cada card mostra                                                      */
/* ========================================================================== */

export interface TituloDoCard {
  id: string;
  /** Nome do cliente, quando o cadastro o resolve. */
  cliente: string;
  categoria: string;
  valor: number;
  /** A data que importa para ESTE card — recebimento nos recebidos, vencimento nos demais. */
  data: string;
  /** Dias de atraso; só faz sentido no card de vencidas. */
  diasAtraso?: number;
}

export interface CardContasReceber {
  total: number;
  quantidade: number;
  /** A relação que o botão de expandir revela — ordenada por valor. */
  titulos: TituloDoCard[];
}

export type SituacaoReceber = "recebido" | "a_vencer" | "vencido";

export const ROTULO_SITUACAO_RECEBER: Record<SituacaoReceber, string> = {
  recebido: "Recebidas",
  a_vencer: "A vencer",
  vencido: "Vencidas",
};

/** As três exceções semânticas sancionadas do design system. Nenhum hex novo. */
export const TOKEN_SITUACAO_RECEBER: Record<SituacaoReceber, string> = {
  recebido: "var(--color-positive)",
  a_vencer: "var(--color-warning)",
  vencido: "var(--color-negative)",
};

export interface DiaDoCalendarioReceber {
  data: string;
  /** Total que vence neste dia e ainda não entrou. */
  aReceber: number;
  /** Total recebido neste dia. */
  recebido: number;
  quantidade: number;
  situacao: SituacaoReceber | null;
  ehHoje: boolean;
}

/* ========================================================================== */
/* O envelhecimento — a leitura que só o recebível tem                         */
/* ========================================================================== */

export type FaixaAtraso = "ate_30" | "de_31_a_60" | "de_61_a_90" | "acima_90";

export const ROTULO_FAIXA: Record<FaixaAtraso, string> = {
  ate_30: "Até 30 dias",
  de_31_a_60: "31 a 60 dias",
  de_61_a_90: "61 a 90 dias",
  acima_90: "Mais de 90 dias",
};

/**
 * ⚠️ **A faixa é sobre a IDADE do atraso, e a ordem dos testes importa.**
 *
 * Um título de 91 dias precisa cair em "mais de 90", não em "até 30" por um
 * teste frouxo. E a primeira faixa começa em UM dia: zero dia de atraso é o
 * título que vence hoje, e ele não está atrasado — mesma regra do painel de
 * pagar, pelo mesmo motivo (contá-lo criaria um pico de inadimplência toda
 * manhã, que sumiria à tarde sem nada ter acontecido).
 */
export function faixaDoAtraso(dias: number): FaixaAtraso {
  if (dias <= 30) return "ate_30";
  if (dias <= 60) return "de_31_a_60";
  if (dias <= 90) return "de_61_a_90";
  return "acima_90";
}

export interface LinhaEnvelhecimento {
  faixa: FaixaAtraso;
  rotulo: string;
  valor: number;
  quantidade: number;
  /** Fração sobre o total VENCIDO — não sobre a carteira inteira. */
  fracao: number;
}

/* ========================================================================== */
/* A concentração — quem responde por quanto do que se tem a receber          */
/* ========================================================================== */

export interface ExposicaoCliente {
  cliente: string;
  /** Em aberto: a vencer + vencido. É o que se perde num calote. */
  emAberto: number;
  vencido: number;
  quantidade: number;
  /** Fatia do total em aberto. */
  fracao: number;
}

export interface PainelContasReceber {
  versao: string;
  filtro: FiltroContasReceber;
  recebidoNoPeriodo: CardContasReceber;
  aVencer: CardContasReceber;
  vencidas: CardContasReceber;
  distribuicao: {
    situacao: SituacaoReceber; rotulo: string; valor: number; quantidade: number; fracao: number;
  }[];
  dias: DiaDoCalendarioReceber[];
  diasTruncados: boolean;
  /**
   * ⚠️ **A CARTEIRA É POSIÇÃO, NÃO PERÍODO** — e daqui para baixo o recorte de
   * tempo NÃO se aplica.
   *
   * Descobri isto montando a fixture da guarda, e é um defeito que eu ia
   * publicar: com tudo preso ao período, um título vencido desde junho
   * desaparece da tela quando se olha agosto. No lado de PAGAR isso é
   * inofensivo — a pergunta é "o que vence neste mês". No recebível é o
   * contrário: **o atraso velho é justamente o que importa**, e uma tela de
   * cobrança que esconde a dívida de noventa dias porque o filtro está no mês
   * corrente esconde exatamente o dinheiro que se está perdendo.
   *
   * É a distinção POSIÇÃO × FLUXO que a ONDA 1 já nomeou: os três cards e o
   * calendário são FLUXO (o que se moveu na janela); envelhecimento e exposição
   * são POSIÇÃO (o que existe em aberto, tenha vencido quando tiver). Os
   * filtros de projeto, centro e cliente continuam valendo nos dois — eles são
   * recorte, não tempo.
   */
  carteira: {
    /** Tudo em aberto: a vencer + vencido, sem recorte de tempo. */
    emAberto: number;
    aVencer: number;
    vencido: number;
    titulos: number;
  };
  /** As faixas de atraso sobre TODO o vencido em aberto — não só o do período. */
  envelhecimento: LinhaEnvelhecimento[];
  /** Os clientes com mais dinheiro em aberto na carteira inteira. */
  exposicao: ExposicaoCliente[];
  /**
   * A fatia do maior cliente sobre o total em aberto.
   *
   * ⚠️ Sai separado do array porque é a leitura de RISCO, e ela precisa ser
   * dita mesmo quando ninguém rola a lista até o fim.
   */
  concentracaoMaiorCliente: number;
}

/** Um trimestre — o mesmo teto do painel de pagar, pelo mesmo motivo. */
export const TETO_DIAS_RECEBER = 92;

/** Quantos clientes a tela lista antes de cortar. */
export const TETO_CLIENTES = 8;

/* ========================================================================== */
/* O motor                                                                     */
/* ========================================================================== */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Dias entre duas datas-só, fatiando a string. */
function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = ate.slice(0, 10).split("-").map(Number);
  // ⚠️ `Date.UTC`, nunca `new Date("YYYY-MM-DD")` local: em UTC−3 o dia 1º vira
  // o último do mês anterior e o atraso sai com um dia a mais.
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

const somarDia = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
};

function montarCard(
  ms: RiskMovement[], nomes: Record<string, string> | undefined,
  dataDe: (m: RiskMovement) => string, hoje?: string,
): CardContasReceber {
  const titulos: TituloDoCard[] = ms.map((m) => {
    const d = dataDe(m);
    return {
      id: m.id,
      cliente: nomeDaContraparte(m, nomes),
      categoria: m.category ?? "Sem categoria",
      valor: magnitude(m),
      data: d,
      ...(hoje ? { diasAtraso: diasEntre(d, hoje) } : {}),
    };
  });
  // Maior primeiro: quem abre "vencidas" quer saber o que cobrar antes.
  titulos.sort((a, b) => b.valor - a.valor);
  return {
    total: round2(titulos.reduce((s, t) => s + t.valor, 0)),
    quantidade: titulos.length,
    titulos,
  };
}

export function montarPainelContasReceber(
  input: RiskInput, filtro: FiltroContasReceber,
): PainelContasReceber {
  const hoje = input.hoje.slice(0, 10);
  const { de, ate } = filtro;
  const nomes = input.partyNames;

  const base = input.movements.filter(
    (m) => ehContaAReceber(m) && passaNosFiltros(m, filtro, nomes),
  );

  // RECEBIDO: pela data de PAGAMENTO — é caixa que já entrou.
  const recebidas = base.filter(
    (m) => liquidado(m) && dentro(m.paid_date ?? m.due_date, de, ate),
  );
  // A VENCER e VENCIDAS: pela data de VENCIMENTO — ainda não viraram caixa.
  const emAberto = base.filter((m) => previsto(m) && dentro(m.due_date, de, ate));
  // ⚠️ "Vence hoje" é A VENCER: ainda está no prazo.
  const aVencer = emAberto.filter((m) => m.due_date.slice(0, 10) >= hoje);
  const vencidas = emAberto.filter((m) => m.due_date.slice(0, 10) < hoje);

  const cardRecebido = montarCard(recebidas, nomes, (m) => (m.paid_date ?? m.due_date).slice(0, 10));
  const cardAVencer = montarCard(aVencer, nomes, (m) => m.due_date.slice(0, 10));
  const cardVencidas = montarCard(vencidas, nomes, (m) => m.due_date.slice(0, 10), hoje);

  const totais: { situacao: SituacaoReceber; valor: number; quantidade: number }[] = [
    { situacao: "recebido", valor: cardRecebido.total, quantidade: cardRecebido.quantidade },
    { situacao: "a_vencer", valor: cardAVencer.total, quantidade: cardAVencer.quantidade },
    { situacao: "vencido", valor: cardVencidas.total, quantidade: cardVencidas.quantidade },
  ];
  const somaGeral = totais.reduce((s, t) => s + t.valor, 0);
  // ⚠️ A soma das três só faz sentido como DENOMINADOR de proporção. Ela nunca
  // é exibida como total: misturaria dinheiro que entrou com dinheiro que vai
  // entrar. É a mesma decisão registrada no painel de pagar.
  const distribuicao = totais.map((t) => ({
    ...t,
    rotulo: ROTULO_SITUACAO_RECEBER[t.situacao],
    fracao: somaGeral > 0 ? t.valor / somaGeral : 0,
  }));

  /* ---- O calendário: TODOS os dias do período, inclusive os vazios -------- */
  const porDia = new Map<string, DiaDoCalendarioReceber>();
  const toque = (data: string): DiaDoCalendarioReceber =>
    porDia.get(data) ?? { data, aReceber: 0, recebido: 0, quantidade: 0, situacao: null, ehHoje: data === hoje };

  for (const m of recebidas) {
    const d = (m.paid_date ?? m.due_date).slice(0, 10);
    const x = toque(d);
    porDia.set(d, { ...x, recebido: round2(x.recebido + magnitude(m)), quantidade: x.quantidade + 1 });
  }
  for (const m of emAberto) {
    const d = m.due_date.slice(0, 10);
    const x = toque(d);
    porDia.set(d, { ...x, aReceber: round2(x.aReceber + magnitude(m)), quantidade: x.quantidade + 1 });
  }

  const dias: DiaDoCalendarioReceber[] = [];
  for (let d = de; d <= ate && dias.length < TETO_DIAS_RECEBER; d = somarDia(d)) {
    const x = toque(d);
    dias.push({
      ...x,
      // A situação do dia é a mais URGENTE que ele contém, não a mais frequente.
      situacao: x.aReceber > 0
        ? (d < hoje ? "vencido" as const : "a_vencer" as const)
        : x.recebido > 0 ? "recebido" as const : null,
      ehHoje: d === hoje,
    });
  }
  const diasTruncados = dias.length > 0 && dias[dias.length - 1].data < ate;

  /* ---- A CARTEIRA: posição, sem recorte de tempo -------------------------- */
  // ⚠️ Sobre `base`, não sobre `emAberto`: o vencido de junho continua sendo
  // dívida em agosto, e é ele que a cobrança precisa ver.
  const carteiraAberta = base.filter(previsto);
  const carteiraAVencer = carteiraAberta.filter((m) => m.due_date.slice(0, 10) >= hoje);
  const carteiraVencida = carteiraAberta.filter((m) => m.due_date.slice(0, 10) < hoje);
  const somaDe = (ms: RiskMovement[]) => round2(ms.reduce((s, m) => s + magnitude(m), 0));
  const totalVencido = somaDe(carteiraVencida);
  const totalEmAberto = somaDe(carteiraAberta);

  /* ---- O envelhecimento, sobre a carteira inteira ------------------------- */
  const porFaixa = new Map<FaixaAtraso, { valor: number; quantidade: number }>();
  for (const m of carteiraVencida) {
    const f = faixaDoAtraso(diasEntre(m.due_date.slice(0, 10), hoje));
    const x = porFaixa.get(f) ?? { valor: 0, quantidade: 0 };
    porFaixa.set(f, { valor: round2(x.valor + magnitude(m)), quantidade: x.quantidade + 1 });
  }
  const ORDEM: FaixaAtraso[] = ["ate_30", "de_31_a_60", "de_61_a_90", "acima_90"];
  const envelhecimento: LinhaEnvelhecimento[] = ORDEM.map((faixa) => {
    const x = porFaixa.get(faixa) ?? { valor: 0, quantidade: 0 };
    return {
      faixa, rotulo: ROTULO_FAIXA[faixa], valor: x.valor, quantidade: x.quantidade,
      // ⚠️ Sobre o VENCIDO, não sobre a carteira: a pergunta é "de tudo que
      // está atrasado, quanto é atraso velho".
      fracao: totalVencido > 0 ? x.valor / totalVencido : 0,
    };
  });

  /* ---- A exposição por cliente, sobre a carteira inteira ------------------ */
  const porCliente = new Map<string, { emAberto: number; vencido: number; quantidade: number }>();
  for (const m of carteiraAberta) {
    const nome = nomeDaContraparte(m, nomes);
    const ehVencido = m.due_date.slice(0, 10) < hoje;
    const x = porCliente.get(nome) ?? { emAberto: 0, vencido: 0, quantidade: 0 };
    porCliente.set(nome, {
      emAberto: round2(x.emAberto + magnitude(m)),
      vencido: round2(x.vencido + (ehVencido ? magnitude(m) : 0)),
      quantidade: x.quantidade + 1,
    });
  }
  const exposicao: ExposicaoCliente[] = Array.from(porCliente.entries())
    .map(([cliente, x]) => ({
      cliente, ...x,
      fracao: totalEmAberto > 0 ? x.emAberto / totalEmAberto : 0,
    }))
    .sort((a, b) => b.emAberto - a.emAberto)
    .slice(0, TETO_CLIENTES);

  return {
    versao: CONTAS_RECEBER_VERSION,
    filtro,
    recebidoNoPeriodo: cardRecebido,
    aVencer: cardAVencer,
    vencidas: cardVencidas,
    distribuicao,
    dias,
    diasTruncados,
    carteira: {
      emAberto: totalEmAberto,
      aVencer: somaDe(carteiraAVencer),
      vencido: totalVencido,
      titulos: carteiraAberta.length,
    },
    envelhecimento,
    exposicao,
    concentracaoMaiorCliente: exposicao[0]?.fracao ?? 0,
  };
}

/* ========================================================================== */
/* A PONTE VENDA × RECEBIMENTO — por que os dois números não se somam         */
/* ========================================================================== */

/**
 * ⚠️ **ESTA É A PARTE QUE O MENU "VENDER" TRAZ, E É A MAIS FÁCIL DE ERRAR.**
 *
 * Fundir vender e receber numa área só junta, na mesma tela, dois números que
 * a intuição manda somar e que **contam o mesmo dinheiro duas vezes**:
 *
 *  - **Faturei** olha a COMPETÊNCIA: a venda aconteceu, o resultado é do mês.
 *  - **Recebi** olha o CAIXA: o dinheiro entrou na conta.
 *  - **Vou receber** olha o VENCIMENTO: o dinheiro ainda vai entrar.
 *
 * Uma venda de R$ 3.000 em três parcelas fatura R$ 3.000 hoje e gera três
 * títulos de R$ 1.000. Somar "faturei R$ 3.000" com "vou receber R$ 2.000" dá
 * R$ 5.000 de nada — é a mesma venda contada de dois ângulos.
 *
 * É a mesma família do defeito que `pontePosicaoFluxo` já resolve entre estoque
 * e fluxo: duas respostas verdadeiras a perguntas diferentes, exibidas com o
 * mesmo peso e sem dizer qual é qual. A saída, ali e aqui, é devolver as duas
 * JUNTAS com o que cada uma mede — e a frase que reconcilia.
 */
export interface PonteVendaRecebimento {
  /** Faturamento por competência na janela. */
  faturado: number;
  /** Caixa que entrou na janela. */
  recebido: number;
  /** Em aberto com vencimento na janela (a vencer + vencido). */
  aReceber: number;
  /**
   * Quanto do faturado do período já virou caixa, de 0 a 1.
   *
   * ⚠️ `null` quando não houve faturamento — e não zero. "0% do que faturei já
   * entrou" é uma afirmação sobre um mês de vendas ruins; a verdade pode ser
   * "não faturei nada", que manda vender, não cobrar. É a regra da ONDA 4:
   * o zero da ausência e o zero do desastre não podem ser o mesmo pixel.
   */
  conversaoEmCaixa: number | null;
  /** A frase que impede a soma. */
  explicacao: string;
}

export function ponteVendaRecebimento(
  input: RiskInput, filtro: FiltroContasReceber,
): PonteVendaRecebimento {
  const { de, ate } = filtro;
  const nomes = input.partyNames;
  const base = input.movements.filter(
    (m) => ehContaAReceber(m) && passaNosFiltros(m, filtro, nomes),
  );

  /**
   * ⚠️ A data de competência sai de `dataDe(m, "competencia")`, a função
   * canônica — não de uma regra escrita aqui.
   *
   * Escrevi `competence_date ?? due_date` na primeira versão e o typecheck
   * pegou: `RiskMovement` não carrega esse campo, e a convenção do sistema é
   * que competência É o vencimento. Uma segunda regra de data, mesmo
   * "equivalente", é como duas telas passam a discordar sobre em que mês uma
   * venda entrou — o defeito que a ONDA 1 existe para matar.
   */
  const faturado = base
    .filter((m) => dentro(dataDe(m, "competencia"), de, ate))
    .reduce((s, m) => s + magnitude(m), 0);

  const recebido = base
    .filter((m) => liquidado(m) && dentro(m.paid_date ?? m.due_date, de, ate))
    .reduce((s, m) => s + magnitude(m), 0);

  const aReceber = base
    .filter((m) => previsto(m) && dentro(m.due_date, de, ate))
    .reduce((s, m) => s + magnitude(m), 0);

  return {
    faturado: round2(faturado),
    recebido: round2(recebido),
    aReceber: round2(aReceber),
    conversaoEmCaixa: faturado > 0 ? recebido / faturado : null,
    explicacao:
      "Faturado é a venda no mês em que ela aconteceu; recebido é o dinheiro que entrou na conta; a receber é o que ainda vai vencer. Os três olham datas diferentes do mesmo negócio e não se somam — uma venda parcelada fatura uma vez e entra várias.",
  };
}

/* ========================================================================== */
/* As opções dos filtros — só o que EXISTE no dado                            */
/* ========================================================================== */

/**
 * ⚠️ **Os períodos são REEXPORTADOS do painel de pagar, não copiados.**
 *
 * "Mês", "semana de segunda a domingo" e "personalizado" não têm nada de
 * específico do lado que se paga — e a semana começar na segunda foi uma
 * decisão tomada com motivo escrito. Duas cópias divergiriam no primeiro
 * ajuste, e o dia em que o recorte de semana mudasse num lado e não no outro,
 * as duas telas passariam a discordar sobre o que é "esta semana" sem que
 * nenhuma estivesse errada isoladamente — o defeito que a ONDA 1 existe para
 * matar.
 */
export {
  periodoMes, periodoSemana, periodoPersonalizado, periodoInvalido,
  type Periodo, type TipoPeriodo,
} from "@/core/contas-pagar";

export function opcoesDeFiltroReceber(
  input: RiskInput,
): { projetos: string[]; centros: string[]; clientes: string[] } {
  const projetos = new Set<string>();
  const centros = new Set<string>();
  const clientes = new Set<string>();
  for (const m of input.movements) {
    if (!ehContaAReceber(m)) continue;
    if (m.projeto) projetos.add(m.projeto);
    if (m.costCenter) centros.add(m.costCenter);
    // Só quem tem título EM ABERTO ou recebido entra — a lista de filtro que
    // oferece o que não devolve nada ensina a não confiar no filtro.
    clientes.add(nomeDaContraparte(m, input.partyNames));
  }
  const ordenar = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { projetos: ordenar(projetos), centros: ordenar(centros), clientes: ordenar(clientes) };
}
