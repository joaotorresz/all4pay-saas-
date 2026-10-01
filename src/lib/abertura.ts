/**
 * A abertura conferida, RESOLVIDA das fontes reais do sistema.
 *
 * `core/indicadores/abertura` decide a CASCATA (pura); este arquivo lê de onde
 * as fontes moram e chama a cascata:
 *
 *   1. **importada** — o `<LEDGERBAL>` do arquivo, guardado em `importedAbertura`
 *      quando um OFX declarou o saldo (só demo — em live o dado ainda não tem
 *      coluna; ver "não feito" abaixo).
 *   2. **informada** — o saldo de abertura CONFIRMADO no cadastro da conta
 *      (`financial_accounts.saldo_inicial_conferido`, migration
 *      `20260930180000`), consolidado sobre as contas. Quem lê as contas é
 *      `getRiscoInput`; esta função só recebe a lista — antes ela lia a morada
 *      ANTIGA (`org_state`) sozinha, e a conta conferida na tela nova não
 *      chegaria nunca ao Razão.
 *   3. nada → `null` → o Razão diz NÃO CONFERIDO.
 *
 * ⚠️ **Nada aqui deriva de lançamento.** A importada vem do campo de saldo do
 * banco; a informada, do cadastro. A primeira linha do extrato não entra em
 * lugar nenhum.
 *
 * ⚠️ **Declarado como NÃO FEITO:** em live a abertura IMPORTADA não persiste —
 * o dataset importado não é gravado no servidor. Então, em produção, só a fonte
 * "informada" (o cadastro da conta, no banco) alimenta a abertura; um OFX com
 * `<LEDGERBAL>` reconcilia em demo e ainda não em live. As colunas de saldo e
 * data já existem desde `20260930180000` (`saldo_inicial`,
 * `data_saldo_inicial`); falta o importador gravá-las com a procedência
 * "importada" — passo isolado, que não deve reaproveitar a flag de conferido
 * (conferir é ato de gente, não de arquivo).
 */
import { escolherAbertura, type AberturaVerificada } from "@/core/indicadores/abertura";
import { importedAbertura } from "@/lib/imported";
import type { ContaBancaria } from "@/core/registros";

/**
 * Consolida o saldo de abertura CONFIRMADO no cadastro das contas. Só entram as
 * contas com `saldoInicialConferido === true` e uma data de referência — o
 * default `0`/hoje do formulário não conta. O valor é a SOMA (a abertura
 * consolidada de todas as contas) e a data é a mais ANTIGA declarada (o ponto de
 * partida do histórico).
 */
export function aberturaInformadaDoCadastro(contas: readonly ContaBancaria[]): { valor: number; data: string } | null {
  const confirmadas = contas.filter(
    (c) => c.saldoInicialConferido && c.dataSaldoInicial,
  );
  if (confirmadas.length === 0) return null;
  const valor = Math.round(confirmadas.reduce((s, c) => s + (c.saldoInicial || 0), 0) * 100) / 100;
  const data = confirmadas.map((c) => c.dataSaldoInicial).sort()[0];
  return { valor, data };
}

/**
 * A abertura conferida para o `RiskInput`, resolvida da cascata. `demo` decide se
 * a fonte importada (o dataset local) é olhada — em live ela não persiste.
 */
export function resolverAberturaVerificada(demo: boolean, contas: readonly ContaBancaria[]): AberturaVerificada | null {
  const importada = demo ? importedAbertura() : null;
  const informada = aberturaInformadaDoCadastro(contas);
  return escolherAbertura({ importada, informada });
}
