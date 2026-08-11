/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COERÊNCIA — duas verdades não podem virar uma contradição na mesma tela
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ A auditoria nomeou o caso: há telas que anunciam **"ruptura de caixa em
 * zero dias"** e, ao lado, **"runway de vinte e quatro meses"**. Quem lê conclui
 * que o sistema está quebrado — e a conclusão é razoável, porque nada na tela
 * explica como as duas frases convivem.
 *
 * Só que **nenhuma das duas está errada**. Elas respondem perguntas diferentes:
 *
 *  - **Ruptura** olha o AGENDADO: os títulos com data marcada nos próximos 60
 *    dias. Se há uma folha de pagamento vencendo amanhã e o recebimento grande
 *    só entra depois, o saldo fica negativo amanhã — ruptura em 1 dia. É a
 *    pergunta de tesouraria: *"o dinheiro está no lugar certo na hora certa?"*
 *  - **Runway** olha o RITMO: saldo ÷ queima média dos últimos 90 dias. Uma
 *    empresa que gera caixa tem runway no teto. É a pergunta de sobrevivência:
 *    *"em que velocidade estou consumindo o que tenho?"*
 *
 * É o mesmo defeito que a ONDA 1 encontrou entre POSIÇÃO e FLUXO nas duas telas
 * de "a receber": duas respostas verdadeiras a perguntas diferentes, exibidas
 * com o mesmo peso, como se fossem a mesma medida. A correção também é a mesma —
 * **não escolher uma e apagar a outra**, e sim declarar o que cada uma mede e
 * mostrar as duas juntas, com a frase que as reconcilia.
 *
 * Apagar a ruptura para "não assustar" tiraria o aviso que evita o cheque
 * devolvido; apagar o runway tiraria a leitura que diz se a empresa está de pé.
 *
 * Puro, tipado, sem I/O. Versão `ia-coerencia/1.0.0`.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import { runway, runwayMeses, burn, saldo, janelaHoje, RUNWAY_CAP_DIAS } from "@/core/indicadores";

export const COERENCIA_VERSION = "ia-coerencia/1.0.0";

export interface LeituraDeCaixa {
  /** O número, na unidade dele. ⚠️ Só é resposta quando `indisponivel` é vazio. */
  valor: number;
  /**
   * Preenchido quando NÃO há número — a frase que a tela mostra no lugar dele.
   *
   * ⚠️ Uma leitura sem número não some da ponte: "não há queima a medir" é
   * justamente metade da contradição que esta camada existe para explicar.
   * Omitir a leitura deixaria a ruptura sozinha na tela, parecendo consenso.
   */
  indisponivel?: string;
  unidade: "dias" | "meses" | "reais";
  /** O que ESTA leitura mede — a frase que impede a confusão. */
  mede: string;
  /** O que ela NÃO enxerga. É esta metade que costuma faltar. */
  naoEnxerga: string;
}

export interface PonteRupturaRunway {
  ruptura: LeituraDeCaixa & { existe: boolean };
  runway: LeituraDeCaixa;
  saldoHoje: number;
  /**
   * ⚠️ `true` quando as duas leituras, lado a lado, parecem se contradizer:
   * ruptura próxima E runway longo (ou o contrário). Não é erro — é o momento
   * em que a tela é OBRIGADA a explicar.
   */
  pareceContradicao: boolean;
  /** A frase que reconcilia. Vazia quando não há aparência de contradição. */
  explicacao: string;
}

/** Abaixo disto, "a ruptura é logo". */
export const RUPTURA_PROXIMA_DIAS = 30;
/** Acima disto, "o runway é longo". */
export const RUNWAY_LONGO_DIAS = 180;

/**
 * As duas leituras juntas, com o que cada uma mede.
 *
 * `rupturaDia` vem do motor de liquidez (projeção do agendado); quando não há
 * ruptura no horizonte, ele é `null` — e `null` **não** é zero. Tratar a
 * ausência de ruptura como "ruptura no dia zero" foi, provavelmente, como o
 * "zero dias" apareceu ao lado de um runway longo.
 */
export function ponteRupturaRunway(
  input: RiskInput,
  rupturaDia: number | null,
): PonteRupturaRunway {
  const r = runway(input);
  const rm = runwayMeses(input);
  const dias = r.indisponivel ? null : r.valor;
  const meses = rm.indisponivel ? null : rm.valor;
  const temRuptura = rupturaDia !== null && rupturaDia >= 0;
  // ⚠️ Duas ausências opostas, e a diferença decide tudo. `sem_queima` é a
  // empresa que gera caixa — o lado TRANQUILO da contradição, e o que faz a
  // ruptura próxima parecer inexplicável. `caixa_negativo` é o contrário: ali
  // ruptura e runway dizem a MESMA coisa, e anunciar contradição mandaria a
  // pessoa procurar um engano onde há só uma empresa no vermelho.
  const ritmoTranquilo = r.indisponivel?.codigo === "sem_queima"
    || (dias !== null && dias >= RUNWAY_LONGO_DIAS);

  const leituraRuptura: LeituraDeCaixa & { existe: boolean } = {
    existe: temRuptura,
    valor: temRuptura ? rupturaDia : 0,
    unidade: "dias",
    mede: "o primeiro dia em que o saldo fica negativo considerando só o que já está AGENDADO (títulos com data marcada)",
    naoEnxerga: "receita que ainda não virou título, e qualquer entrada sem data definida",
  };

  const leituraRunway: LeituraDeCaixa = {
    valor: meses ?? 0,
    indisponivel: rm.indisponivel?.motivo,
    unidade: "meses",
    mede: "quanto tempo o saldo de hoje cobre a queima MÉDIA dos últimos 90 dias",
    naoEnxerga: "quando cada título vence — uma média mensal não sabe que a folha cai antes do recebimento",
  };

  const rupturaProxima = temRuptura && rupturaDia <= RUPTURA_PROXIMA_DIAS;
  const pareceContradicao = rupturaProxima && ritmoTranquilo;

  return {
    ruptura: leituraRuptura,
    runway: leituraRunway,
    saldoHoje: saldo(input, janelaHoje(input.hoje)).valor,
    pareceContradicao,
    explicacao: pareceContradicao ? frasePonte(rupturaDia ?? 0, meses, dias) : "",
  };
}

/**
 * A frase que reconcilia — escrita para o dono, não para o analista.
 *
 * ⚠️ Ela diz o que FAZER, não só o que é. "As duas leituras medem coisas
 * diferentes" é verdadeiro e inútil: quem lê quer saber se precisa agir hoje.
 */
export function frasePonte(
  rupturaDias: number, runwayMeses: number | null, runwayDias: number | null,
): string {
  const quando = rupturaDias === 0 ? "hoje" : rupturaDias === 1 ? "amanhã" : `em ${rupturaDias} dias`;
  // ⚠️ `null` (não há queima a medir) e o TETO dizem a mesma coisa ao leitor —
  // "o ritmo não está consumindo o caixa" — e por isso compartilham a frase.
  // O que não podem compartilhar é o NÚMERO: era o teto saindo como se fosse
  // fôlego medido.
  const folego = runwayDias === null || runwayMeses === null || runwayDias >= RUNWAY_CAP_DIAS
    ? "a operação não está queimando caixa no ritmo dos últimos 90 dias"
    : `no ritmo dos últimos 90 dias o saldo cobriria cerca de ${runwayMeses} meses`;
  return (
    `As duas leituras estão certas e respondem perguntas diferentes: ${folego}, `
    + `mas os títulos JÁ AGENDADOS deixam o saldo negativo ${quando}. `
    + `É um problema de DATA, não de tamanho: falta dinheiro na hora, não no mês. `
    + `Antecipar um recebimento ou adiar um pagamento resolve; cortar custo, não.`
  );
}

/* ========================================================================== */
/* A REGRA GERAL — narrativas que não podem conviver sem ponte                 */
/* ========================================================================== */

export interface Narrativa {
  id: string;
  /** O texto como ele vai para a tela. */
  texto: string;
  /** Os indicadores que a frase cita, por nome canônico. */
  cita: string[];
}

/**
 * Pares de indicadores que, na mesma tela, exigem a ponte.
 *
 * ⚠️ A lista é curta e nomeada. Uma regra genérica ("avise sempre que dois
 * números divergirem") não é aplicável: quase todo par de indicadores diverge
 * por desenho, e um aviso em toda tela é um aviso que ninguém lê.
 */
export const PARES_QUE_EXIGEM_PONTE: { a: string; b: string; porque: string }[] = [
  {
    a: "ruptura", b: "runway",
    porque: "um olha o agendado por data, o outro o ritmo médio — podem apontar para lados opostos sem que nenhum esteja errado",
  },
  {
    a: "posicao", b: "fluxo",
    porque: "estoque de títulos × resultado do período: o primeiro nunca é negativo, o segundo pode ser",
  },
  {
    a: "competencia", b: "caixa",
    porque: "o mesmo mês tem dois valores legítimos, e a diferença é o que ainda não foi pago",
  },
];

export function exigePonte(cita: readonly string[]): { a: string; b: string; porque: string } | null {
  for (const p of PARES_QUE_EXIGEM_PONTE) {
    if (cita.includes(p.a) && cita.includes(p.b)) return p;
  }
  return null;
}

/**
 * As narrativas de uma tela que se contradizem sem explicação.
 *
 * É o que a guarda cobra: se duas frases da MESMA tela citam um par que exige
 * ponte, uma delas tem de trazer a explicação.
 */
export function contradicoesSemPonte(narrativas: readonly Narrativa[]): { par: string; narrativas: string[] }[] {
  const out: { par: string; narrativas: string[] }[] = [];
  const todasCitam = narrativas.flatMap((n) => n.cita);
  const par = exigePonte(todasCitam);
  if (!par) return out;
  const temExplicacao = narrativas.some((n) => /respondem perguntas diferentes|problema de DATA|leituras/i.test(n.texto));
  if (!temExplicacao) {
    out.push({ par: `${par.a} × ${par.b}`, narrativas: narrativas.map((n) => n.id) });
  }
  return out;
}
