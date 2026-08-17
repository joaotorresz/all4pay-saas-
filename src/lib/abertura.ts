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
 *      (`ContaBancaria.saldoInicialConferido`), consolidado sobre as contas.
 *   3. nada → `null` → o Razão diz NÃO CONFERIDO.
 *
 * ⚠️ **Nada aqui deriva de lançamento.** A importada vem do campo de saldo do
 * banco; a informada, do cadastro. A primeira linha do extrato não entra em
 * lugar nenhum.
 *
 * ⚠️ **Declarado como NÃO FEITO:** em live a abertura importada não persiste —
 * `financial_accounts` não tem coluna de saldo declarado nem data, e o dataset
 * importado não é gravado no servidor. Então, em produção, só a fonte
 * "informada" (o cadastro, que já mora em `store-org`) alimenta a abertura; um
 * OFX com `<LEDGERBAL>` reconcilia em demo e ainda não em live. Promover exige
 * migration (coluna de saldo declarado + data em `financial_accounts`), passo
 * isolado.
 */
import { escolherAbertura, type AberturaVerificada } from "@/core/indicadores/abertura";
import { importedAbertura } from "@/lib/imported";
import { listContasBancarias } from "@/lib/registros";

/**
 * Consolida o saldo de abertura CONFIRMADO no cadastro das contas. Só entram as
 * contas com `saldoInicialConferido === true` e uma data de referência — o
 * default `0`/hoje do formulário não conta. O valor é a SOMA (a abertura
 * consolidada de todas as contas) e a data é a mais ANTIGA declarada (o ponto de
 * partida do histórico).
 */
export function aberturaInformadaDoCadastro(): { valor: number; data: string } | null {
  const confirmadas = listContasBancarias().filter(
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
export function resolverAberturaVerificada(demo: boolean): AberturaVerificada | null {
  const importada = demo ? importedAbertura() : null;
  const informada = aberturaInformadaDoCadastro();
  return escolherAbertura({ importada, informada });
}
