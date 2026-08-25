/**
 * O VEREDICTO DA CADEIA — o que a tela de governança pode AFIRMAR.
 *
 * ⚠️ **O defeito que este arquivo existe para matar (A4P-079).** A tela exibia
 * uma pílula verde *"Cadeia íntegra · N eventos · cadeia SHA-256"* em produção,
 * e ela não podia significar nada: `audit_log` **não guarda hash nenhum** (as
 * colunas são id·usuario·acao·antes·depois·created_at·org_id·entidade·
 * entidade_id·origem·ip·correlacao — nenhuma de encadeamento). `getAuditTrail`
 * MONTA a cadeia no navegador, no instante da leitura, a partir das linhas
 * como elas estão AGORA — e então verifica essa cadeia contra ela mesma.
 *
 * É `x − x` outra vez, a quarta neste repositório: uma igualdade que não pode
 * falhar, vestida de verificação. Medido, com o mesmo caminho da produção:
 * adulterar o `depois` de uma linha → **intacta**; apagar a linha do meio →
 * **intacta**; cadeia vazia → **intacta**. Nos três a tela dizia que estava
 * tudo certo.
 *
 * ⚠️ **E o botão "Testar adulteração" tornava o defeito PIOR.** Ele altera uma
 * cópia em memória DEPOIS da cadeia montada, então reprova de verdade — e
 * demonstra ao cliente uma proteção que o dado guardado não tem. Uma prova que
 * funciona só no caso que não acontece.
 *
 * A regra que sai daqui: **tela de auditoria não afirma integridade que não
 * pode conferir.** Enquanto o hash não for gravado junto da linha, o que se diz
 * é o que se sabe — a origem da cadeia decide a frase.
 */

/**
 * De onde vem o encadeamento que está sendo verificado.
 * - `armazenada`: o hash e o elo anterior vieram GUARDADOS com o evento, então
 *   recomputá-los pode discordar do que está escrito — a verificação vale.
 * - `reconstruida`: a cadeia foi montada na leitura a partir dos dados brutos.
 *   Verificá-la é comparar o cálculo com ele mesmo; não prova nada.
 */
export type OrigemDaCadeia = "armazenada" | "reconstruida";

export type TomDaCadeia = "positivo" | "neutro" | "alerta";

export interface VeredictoCadeia {
  /** A verificação de integridade tem valor probatório? */
  verificavel: boolean;
  /** O que a pílula da tela diz. Curto — cabe num selo. */
  rotulo: string;
  tom: TomDaCadeia;
  /** Por que, em uma frase, para quem opera. */
  explicacao: string;
  /**
   * O teste de adulteração pode ser oferecido? Só quando a cadeia é armazenada:
   * demonstrar a detecção sobre uma cadeia reconstruída anuncia uma proteção
   * que o dado não tem.
   */
  podeTestarAdulteracao: boolean;
}

/**
 * ⚠️ A ORDEM DOS TESTES É REGRA. O vazio vem PRIMEIRO: uma cadeia sem evento
 * nenhum passa em `verificarIntegridade` por vacuidade (o laço não roda), e
 * "Cadeia íntegra · 0 eventos" afirma que a auditoria está em ordem quando a
 * verdade é que não há auditoria. É a doutrina da ONDA 4 — o motivo ocupa o
 * lugar da afirmação.
 */
export function veredictoDaCadeia(args: {
  origem: OrigemDaCadeia;
  total: number;
  intacta: boolean;
}): VeredictoCadeia {
  const { origem, total, intacta } = args;

  if (total === 0) {
    return {
      verificavel: false,
      rotulo: "Sem eventos registrados",
      tom: "neutro",
      explicacao:
        "Nenhuma ação foi registrada nesta organização ainda. Não há cadeia para conferir — e ausência de registro não é o mesmo que registro em ordem.",
      podeTestarAdulteracao: false,
    };
  }

  if (origem === "reconstruida") {
    return {
      verificavel: false,
      rotulo: "Encadeamento não verificável",
      tom: "alerta",
      explicacao:
        "Os eventos são registrados, mas o encadeamento é calculado na hora da leitura — não fica guardado junto de cada evento. Conferi-lo compararia o cálculo com ele mesmo, então esta tela não afirma integridade. O histórico continua íntegro pelas permissões do banco.",
      podeTestarAdulteracao: false,
    };
  }

  return intacta
    ? {
        verificavel: true,
        rotulo: "Cadeia íntegra",
        tom: "positivo",
        explicacao:
          "Cada evento guarda o hash do anterior. Recomputar a cadeia bate com o que está gravado — nada foi alterado nem removido.",
        podeTestarAdulteracao: true,
      }
    : {
        verificavel: true,
        rotulo: "Adulteração detectada",
        tom: "alerta",
        explicacao:
          "A recomputação da cadeia discorda do que está gravado: algum evento foi alterado ou removido depois de registrado.",
        podeTestarAdulteracao: true,
      };
}
