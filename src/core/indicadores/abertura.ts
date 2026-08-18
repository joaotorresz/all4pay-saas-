/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A ABERTURA CONFERIDA — a fonte independente do saldo, e de onde ela vem
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `reconciliarSaldo` (em `./index`) só fecha a conta quando existe uma fonte
 * INDEPENDENTE para o saldo de abertura — o que havia em conta ANTES do primeiro
 * lançamento conhecido. Sem ela, a parcela de fechamento era `extrato −
 * liquidadoTotal`, e o resíduo `extrato − (liquidadoTotal + abertura)` virava
 * `x − x`: zero por álgebra, para qualquer saldo. "Conciliado" sobre uma conta
 * que ninguém fechou é confiança fabricada.
 *
 * Este arquivo é a CASCATA que decide de onde a abertura vem. Três degraus, do
 * mais forte ao mais fraco:
 *
 *   1. **Arquivo importado** (`origem: "extrato_bancario"`) — o banco DECLARA o saldo.
 *      No OFX é o campo `<LEDGERBAL>`, um campo de saldo dedicado, escrito pelo
 *      próprio banco. É a autoridade máxima do arquivo.
 *   2. **Cadastro da conta** (`origem: "cadastro_manual"`) — o operador confirma, com
 *      data de referência, o saldo de abertura da conta. Ato deliberado, não o
 *      preenchimento padrão de um campo.
 *   3. **Nada** — a abertura fica INDISPONÍVEL, e a tela diz NÃO CONFERIDO.
 *
 * ⚠️ **NUNCA a primeira linha do extrato.** A tentação é ler o saldo corrido da
 * primeira transação e chamá-la de abertura. Isso é DERIVAR a abertura dos
 * próprios lançamentos que ela deveria conferir — o mesmo defeito do `x − x`,
 * com outra roupa. A abertura só vale se vier de FORA da lista de movimentos:
 * do campo de saldo que o banco escreve (`LEDGERBAL`), ou do operador. O valor
 * de uma linha de transação nunca é uma dessas coisas.
 */

/** O saldo de abertura conferido — o que `RiskInput.aberturaVerificada` carrega. */
export interface AberturaVerificada {
  /** O saldo que havia em conta antes do primeiro lançamento conhecido. */
  valor: number;
  /** A data a que o saldo se refere. */
  data: string;
  /**
   * ⚠️ **A ORIGEM da âncora, e ela NÃO é cosmética** (A4P-073). A tela do Razão
   * mostra ao usuário de onde veio o saldo de abertura: "informado pelo banco"
   * pesa diferente de "informado no cadastro". `extrato_bancario` = o banco
   * declarou no arquivo (`<LEDGERBAL>`); `cadastro_manual` = alguém digitou.
   * Uma abertura preenchida SEM origem é anônima — a guarda reprova.
   */
  origem: "extrato_bancario" | "cadastro_manual";
  /** Quem confirmou (só na origem cadastro_manual; o banco não tem nome). */
  por?: string;
}

/** Uma fonte candidata da cascata, antes de a prioridade decidir. */
export interface FonteAbertura {
  valor: number;
  data: string;
  por?: string;
}

/**
 * **A CASCATA, e nada além dela.** Arquivo importado vence cadastro; cadastro
 * vence o nada. Pura: não olha para lançamento nenhum — recebe as fontes já
 * resolvidas e só escolhe entre elas.
 *
 * ⚠️ A ordem é a decisão inteira. O banco declara; o operador afirma; e um valor
 * declarado pelo banco não pode ser derrubado por um digitado à mão, porque é o
 * digitado que erra. Se as duas existirem, a importada vence — e a informada
 * fica de reserva, não some (a tela pode oferecer trocar).
 */
export function escolherAbertura(fontes: {
  importada?: FonteAbertura | null;
  informada?: FonteAbertura | null;
}): AberturaVerificada | null {
  if (fontes.importada) {
    return { valor: fontes.importada.valor, data: fontes.importada.data, origem: "extrato_bancario" };
  }
  if (fontes.informada) {
    return {
      valor: fontes.informada.valor,
      data: fontes.informada.data,
      origem: "cadastro_manual",
      por: fontes.informada.por,
    };
  }
  return null;
}

/**
 * **Reconstrói a ABERTURA a partir do saldo DECLARADO pelo banco.**
 *
 * O `<LEDGERBAL>` do OFX é o saldo de FECHAMENTO — quanto havia na conta na data
 * `DTASOF`, depois de todos os lançamentos do arquivo. A abertura (antes do
 * primeiro lançamento) é o fechamento MENOS o movimento líquido já liquidado:
 *
 *   abertura = saldoDeclarado − Σ(lançamentos liquidados, com sinal)
 *
 * ⚠️ **Isto NÃO é "derivar da primeira linha".** O ancoradouro é o número que o
 * banco escreveu no campo de saldo — a autoridade do arquivo —, e os lançamentos
 * entram só como o DELTA entre fechamento e abertura. Derivar da primeira linha
 * seria o oposto: pegar um valor de transação e fingir que é saldo, sem
 * nenhum saldo declarado por trás.
 *
 * `netLiquidado` é a soma ASSINADA (entrada +, saída −) só dos lançamentos já
 * liquidados — os mesmos que compõem o saldo atual da conta. Pendentes não
 * entram: eles não estão no fechamento nem no saldo.
 */
export function aberturaDoExtrato(
  saldoDeclarado: number,
  netLiquidado: number,
  data: string,
): FonteAbertura {
  return { valor: Math.round((saldoDeclarado - netLiquidado) * 100) / 100, data };
}
