/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BILLING — o relógio da assinatura, o bloqueio suave e a reconciliação
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Puro, tipado, sem I/O e sem relógio próprio (`hoje` entra por parâmetro).
 * Versão `billing/1.0.0`.
 *
 * ⚠️ **O QUE A MEDIÇÃO DE 18/08 ACHOU, e é o motivo deste módulo existir.**
 * 16 organizações em produção; **2** com assinatura; **14 com NENHUMA** — nem
 * trial. Não é que o teste delas venceu: **nunca houve relógio**. E as duas que
 * têm assinatura estão com `current_period_end` NULO, ou seja, sem data de fim
 * também. A coluna existia e estava inerte, a mesma família do `competence_date`
 * que o DRE não lia.
 *
 * O efeito prático, medido: **1.402 dos 1.415 lançamentos (99,1%) estão em
 * organizações que não pagam nada**, e a única que paga (R$990/mês) tem ZERO
 * lançamentos. O produto não estava perdendo cobrança — ele não tinha cobrança.
 *
 * ⚠️ **BLOQUEIO SUAVE, NUNCA APAGAR NEM ESCONDER.** Vencido é quem parou de
 * pagar, não quem parou de existir: leitura e exportação continuam INTEIRAS, só
 * a escrita para. Esconder o dado de quem venceu transforma uma cobrança em
 * sequestro de arquivo — e o dado é da empresa, não nosso. Quem paga em atraso
 * volta a escrever no mesmo instante, sem restaurar nada.
 */

export const BILLING_VERSION = "billing/1.0.0";

/** Dias de teste que uma organização nova recebe. */
export const TRIAL_DIAS = 14;

/**
 * Quantos dias sem nenhum lançamento fazem um plano PAGO virar alerta.
 * ⚠️ Não é cancelamento automático: é a lista de quem ligar antes de o cliente
 * cancelar sozinho. Cobrar de quem não usa é como se perde um cliente calado.
 */
export const OCIOSA_DIAS = 30;

export type StatusAssinatura = "trial" | "active" | "past_due" | "canceled" | "none";

export interface Assinatura {
  orgId: string;
  status: StatusAssinatura;
  /** Nome comercial do plano; ausente enquanto ninguém escolheu um. */
  plano?: string | null;
  mrr: number;
  /** `YYYY-MM-DD` — quando o período corrente começou. */
  inicio?: string | null;
  /** `YYYY-MM-DD` — quando ele termina. NULO é "sem prazo", e é um defeito. */
  fim?: string | null;
}

export interface EstadoDaAssinatura {
  status: StatusAssinatura;
  plano?: string | null;
  inicio?: string | null;
  fim?: string | null;
  /** Dias de calendário até o fim. Negativo = já venceu. `null` sem prazo. */
  diasRestantes: number | null;
  /** O teste acabou (ou a cobrança falhou) e a escrita está suspensa. */
  bloqueado: boolean;
  /** Está em teste, dentro do prazo. */
  emTeste: boolean;
  /** Frase para a tela do CLIENTE — sem termo técnico, sempre com a saída. */
  aviso?: string;
}

/**
 * ⚠️ **DIAS DE CALENDÁRIO, fatiando a string.** `new Date("2026-08-18")` é
 * meia-noite UTC; em UTC−3 um "faltam 8 dias" vira 7 depois das 21h, e o
 * cliente vê o prazo encolher sozinho durante a noite. Mesmo defeito que a
 * PARTE de assinatura do administrador já tinha corrigido.
 */
export function diasEntre(de: string, ate: string): number {
  const [ay, am, ad] = de.slice(0, 10).split("-").map(Number);
  const [by, bm, bd] = ate.slice(0, 10).split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86_400_000);
}

export function estadoDaAssinatura(a: Assinatura | null, hoje: string): EstadoDaAssinatura {
  const status: StatusAssinatura = a?.status ?? "none";
  const fim = a?.fim ?? null;
  const diasRestantes = fim ? diasEntre(hoje, fim) : null;

  /*
   * ⚠️ **SEM ASSINATURA NÃO É "EM DIA".** A leitura preguiçosa seria tratar a
   * ausência como acesso liberado — e foi exatamente assim que 14 organizações
   * operaram por dois meses. Mas bloquear retroativamente quem já está dentro
   * puniria o cliente por um defeito nosso: quem não tem linha ganha o relógio
   * a partir de HOJE (a migration faz isso), e até lá `none` não bloqueia.
   * Aqui a ausência é NOMEADA, para a tela poder dizer o que está acontecendo.
   */
  if (status === "canceled") {
    return {
      status, plano: a?.plano ?? null, inicio: a?.inicio ?? null, fim,
      diasRestantes, bloqueado: true, emTeste: false,
      aviso: "Sua conta foi encerrada. Você continua vendo e exportando tudo o que já registrou; para voltar a lançar, escolha um plano.",
    };
  }

  if (status === "past_due") {
    return {
      status, plano: a?.plano ?? null, inicio: a?.inicio ?? null, fim,
      diasRestantes, bloqueado: true, emTeste: false,
      aviso: "Não conseguimos confirmar o pagamento deste mês. Seus dados estão todos aqui e você pode consultar e exportar à vontade; novos lançamentos voltam assim que o pagamento entrar.",
    };
  }

  if (status === "trial") {
    const venceu = diasRestantes !== null && diasRestantes < 0;
    if (venceu) {
      return {
        status, plano: a?.plano ?? null, inicio: a?.inicio ?? null, fim,
        diasRestantes, bloqueado: true, emTeste: false,
        aviso: "Seu período de teste terminou. Nada foi apagado: você continua vendo e exportando tudo. Para voltar a lançar, escolha um plano.",
      };
    }
    return {
      status, plano: a?.plano ?? null, inicio: a?.inicio ?? null, fim,
      diasRestantes, bloqueado: false, emTeste: true,
      aviso: diasRestantes === null
        ? undefined
        : diasRestantes === 0
          ? "Seu período de teste termina hoje."
          : `Seu período de teste termina em ${diasRestantes} ${diasRestantes === 1 ? "dia" : "dias"}.`,
    };
  }

  // `active` — só bloqueia se o período tiver de fato vencido.
  if (status === "active") {
    const venceu = diasRestantes !== null && diasRestantes < 0;
    return {
      status, plano: a?.plano ?? null, inicio: a?.inicio ?? null, fim,
      diasRestantes, bloqueado: venceu, emTeste: false,
      aviso: venceu
        ? "A assinatura venceu. Seus dados continuam aqui e podem ser consultados e exportados; para voltar a lançar, renove o plano."
        : undefined,
    };
  }

  return {
    status: "none", plano: null, inicio: null, fim: null,
    diasRestantes: null, bloqueado: false, emTeste: false,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * RECONCILIAÇÃO BILLING × USO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ As três perguntas são independentes e SEPARADAS de propósito — cada uma
 * manda fazer uma coisa diferente:
 *   · usa e não paga        → receita que está vazando pela porta
 *   · paga e não usa        → cliente prestes a cancelar; ligue antes
 *   · usa acima do plano    → conversa de upgrade, não corte
 * Somá-las num único "alertas: 7" apagaria justamente o que decide a ação.
 */

export type TipoAlerta = "usa_sem_plano" | "paga_sem_uso" | "acima_do_limite";

export interface OrgParaReconciliar {
  orgId: string;
  nome: string;
  status: StatusAssinatura;
  plano?: string | null;
  mrr: number;
  fim?: string | null;
  lancamentos: number;
  /** `YYYY-MM-DD` do último lançamento, ou null se nunca houve. */
  ultimoLancamento?: string | null;
  /** Teto de lançamentos do plano contratado, quando o plano declara um. */
  limiteLancamentos?: number | null;
}

export interface AlertaBilling {
  tipo: TipoAlerta;
  orgId: string;
  nome: string;
  /** Frase pronta, com o número que a justifica. */
  detalhe: string;
  /** O que fazer. Alerta sem ação vira paisagem. */
  acao: string;
}

export function reconciliarBilling(orgs: OrgParaReconciliar[], hoje: string): AlertaBilling[] {
  const out: AlertaBilling[] = [];
  for (const o of orgs) {
    const est = estadoDaAssinatura(
      { orgId: o.orgId, status: o.status, plano: o.plano, mrr: o.mrr, fim: o.fim },
      hoje,
    );
    const pagando = o.status === "active" && o.mrr > 0;

    /*
     * ⚠️ "Ativa sem plano" é USO sem cobrança, não organização sem linha.
     * Uma org recém-criada e vazia não é vazamento de receita — é uma conta que
     * ainda não começou. O corte é ter lançamento.
     */
    if (o.lancamentos > 0 && !pagando && !est.emTeste) {
      out.push({
        tipo: "usa_sem_plano",
        orgId: o.orgId, nome: o.nome,
        detalhe: `${o.lancamentos} lançamento(s) e nenhuma cobrança ativa (situação: ${o.status}).`,
        acao: "Converter em plano pago ou abrir um teste com prazo.",
      });
    }

    if (pagando) {
      const dias = o.ultimoLancamento ? diasEntre(o.ultimoLancamento, hoje) : null;
      if (dias === null || dias > OCIOSA_DIAS) {
        out.push({
          tipo: "paga_sem_uso",
          orgId: o.orgId, nome: o.nome,
          detalhe: dias === null
            ? `Plano ${o.plano ?? "—"} ativo e NENHUM lançamento desde o início.`
            : `Plano ${o.plano ?? "—"} ativo e ${dias} dias sem nenhum lançamento.`,
          acao: "Falar com o cliente antes de ele cancelar sozinho.",
        });
      }
      if (o.limiteLancamentos != null && o.lancamentos > o.limiteLancamentos) {
        out.push({
          tipo: "acima_do_limite",
          orgId: o.orgId, nome: o.nome,
          detalhe: `${o.lancamentos} lançamentos contra o teto de ${o.limiteLancamentos} do plano ${o.plano ?? "—"}.`,
          acao: "Conversa de upgrade — nunca corte: o dado já está lá dentro.",
        });
      }
    }
  }
  return out;
}

/**
 * O MRR que o painel do administrador publica.
 *
 * ⚠️ Só assinatura **ativa** entra. `trial` tem MRR zero por definição (ninguém
 * pagou ainda) e `past_due` é dinheiro que NÃO entrou — contá-lo faria o painel
 * anunciar receita que o extrato não tem, que é a única forma de erro de MRR
 * que chega a um investidor.
 */
export function mrrDeAssinaturas(as: Assinatura[]): number {
  return as
    .filter((a) => a.status === "active")
    .reduce((s, a) => s + (Number.isFinite(a.mrr) ? a.mrr : 0), 0);
}
