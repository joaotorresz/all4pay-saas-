/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A EXPORTAÇÃO BATE COM A TELA — e o razão fecha com o consolidado
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O DEFEITO QUE ESTA GUARDA EXISTE PARA IMPEDIR JÁ ACONTECEU SEIS VEZES
 * NESTE REPOSITÓRIO, com outros nomes:** `approval_limit` em três moradas, o
 * `resíduo = x − x`, `organizations.name` derivado do e-mail, `status` ×
 * `situacao`, dois publicadores de deploy e o branch padrão disputando o tronco
 * com o `main`. Sempre a mesma forma: **duas fontes para um fato**.
 *
 * A sétima seria a mais cara, porque o arquivo SAI DA EMPRESA. Uma exportação
 * que monta a própria consulta produz um DRE que discorda da tela que o dono
 * conferiu — e quem descobre é o contador, semanas depois, com a declaração
 * meio entregue.
 *
 * Duas asserções, e elas são diferentes:
 *
 *   1. **LINHA POR LINHA** — a exportação × a cascata, para o MESMO período,
 *      o MESMO input e o MESMO filtro. Um centavo reprova NOMEANDO a linha.
 *   2. **O FECHAMENTO** — o razão somado por linha do DRE reproduz o
 *      consolidado. É a conta que o contador faz; a diferença é que aqui ela é
 *      feita antes dele.
 *
 * ⚠️ **E O TESTE NEGATIVO É O ITEM PRINCIPAL, não o apêndice.** Guarda que
 * nunca reprovou é decoração, e decoração custa mais que ausência porque
 * fabrica confiança. Aqui o defeito é PLANTADO na forma exata que se quer
 * proibir — uma exportação com consulta própria, reclassificando por
 * palavra-chave — e a guarda tem de sair VERMELHA **nomeando a linha
 * divergente**, não estourando com erro de execução. Vermelho pelo motivo
 * errado é pior que guarda nenhuma.
 */
import { montarDRE, type Relatorio } from "@/core/relatorios";
import { montarExportacao, conferirFechamento, type CabecalhoExportacao, type Exportacao } from "@/core/exportacao";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { INPUT, INPUT_QUEIMANDO } from "./fixture.mts";

let falhas = 0;
const ok = (t: string, cond: boolean, detalhe = "") => {
  console.log(`${cond ? "✓" : "✗"} ${t}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas++;
};

const INTERVALO = { de: "2026-08-01", ate: "2026-08-31" };
const brl = (n: number) =>
  `R$${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const cab = (extra: Partial<CabecalhoExportacao> = {}): CabecalhoExportacao => ({
  empresa: "Fixture Ltda",
  cnpj: "00.000.000/0001-00",
  regimeTributario: "Lucro Presumido",
  regime: "competencia",
  periodoDe: INTERVALO.de,
  periodoAte: INTERVALO.ate,
  geradoEm: "2026-08-25T12:00:00.000Z",
  visao: "com-previsto",
  incluiCancelados: false,
  ...extra,
});

/**
 * ⚠️ **A LINHA DECLARADA ENTRA NA FIXTURE, e não é detalhe.**
 *
 * Sem ela, `t1` ("Transferência entre contas") cai no palpite por palavra-chave
 * e vira despesa — e aí NENHUM lançamento fica fora do DRE, e a asserção do
 * bloco 3 passa sobre uma lista VAZIA. Verde sobre o nada é o defeito que a
 * ONDA 4 achou na condição 4 do teste de coerência.
 *
 * Declará-la é também o que reproduz o caso real: foi exatamente a
 * transferência entrando no resultado que produziu os R$ 267,70.
 */
const LINHA_POR_CATEGORIA: Record<string, string> = {
  "transferência entre contas": "transferencia",
};

/** O caminho REAL: a tela monta o relatório, a exportação o reescreve. */
function pelaCascata(input: RiskInput, incluiCancelados = false) {
  const filtro = { intervalo: INTERVALO, tipo: "vertical" as const, linhaPorCategoria: LINHA_POR_CATEGORIA };
  const rel = montarDRE(input, filtro);
  const exp = montarExportacao(rel, input.movements, cab({ incluiCancelados }), (id) => input.partyNames?.[id ?? ""] ?? "");
  return { rel, exp };
}

/* ═══════════════════ 1 · linha por linha, contra a cascata ════════════════ */

console.log("\n── 1 · a exportação × a cascata, linha por linha ──");

for (const [nome, input, minRazao] of [["fixture", INPUT, 5], ["empresa que queima", INPUT_QUEIMANDO, 2]] as const) {
  const { rel, exp } = pelaCascata(input as RiskInput);
  ok(`${nome} · mesma quantidade de linhas`, exp.dre.length === rel.linhas.length,
    `${exp.dre.length} × ${rel.linhas.length}`);

  let divergentes = 0;
  rel.linhas.forEach((l, i) => {
    const e = exp.dre[i];
    if (!e || e.id !== l.id || Math.abs(e.valor - l.total.valor) > 0.005) {
      divergentes++;
      console.log(`   ✗ LINHA DIVERGENTE: ${l.label} (${l.id}) — tela ${brl(l.total.valor)} × arquivo ${e ? brl(e.valor) : "ausente"}`);
    }
  });
  ok(`${nome} · nenhuma linha diverge da tela`, divergentes === 0, `${divergentes} divergente(s)`);

  /*
   * ⚠️ Uma guarda que roda sobre o vazio fica verde provando nada — é o defeito
   * que a ONDA 4 achou na condição 4 do teste de coerência. Aqui ela AFIRMA que
   * o caminho recebeu valor: linhas com número, razão com movimento.
   */
  const comValor = rel.linhas.filter((l) => Math.abs(l.total.valor) > 0.005).length;
  ok(`${nome} · a medição não rodou sobre o vazio`, comValor >= 3 && exp.razao.length >= minRazao,
    `${comValor} linha(s) com valor · ${exp.razao.length} lançamento(s) no razão`);
}

/* ═════════════════════ 2 · o fechamento do razão ═════════════════════════ */

console.log("\n── 2 · o razão somado por linha reproduz o consolidado ──");

for (const [nome, input] of [["fixture", INPUT], ["empresa que queima", INPUT_QUEIMANDO]] as const) {
  const { exp } = pelaCascata(input as RiskInput);
  const fora = conferirFechamento(exp);
  for (const d of fora) {
    console.log(`   ✗ ${d.label} (${d.linhaId}) — DRE ${brl(d.noDre)} × razão ${brl(d.noRazao)} · diferença ${brl(d.diferenca)}`);
  }
  ok(`${nome} · o razão fecha com o DRE`, fora.length === 0, `${fora.length} linha(s) fora`);
}

/* ══════════════ 3 · o que fica FORA sai listado, e não soma ═══════════════ */

console.log("\n── 3 · nada some em silêncio ──");
{
  const { exp } = pelaCascata(INPUT);
  const fora = exp.razao.filter((r) => !r.noDre);
  ok("há lançamento FORA do DRE para conferir (senão a asserção abaixo é vazia)",
    fora.length > 0, `${fora.length} fora do DRE`);
  ok("todo lançamento fora do DRE traz o MOTIVO escrito",
    fora.length > 0 && fora.every((r) => r.motivoFora.length > 10),
    fora.map((r) => `${r.movimentoId}: ${r.motivoFora}`).join(" · "));
  ok("nenhum lançamento fora do DRE entra no total do razão",
    Math.abs(exp.resumo.totalRazao - exp.razao.filter((r) => r.noDre).reduce((s, r) => s + r.valor, 0)) < 0.005);

  // Cancelado: some por padrão, aparece a pedido — e continua sem somar.
  const semCancelados = pelaCascata(INPUT, false).exp;
  const comCancelados = pelaCascata(INPUT, true).exp;
  ok("cancelado NÃO entra por padrão", semCancelados.resumo.cancelados === 0);
  ok("cancelado entra quando pedido, e continua fora do DRE",
    comCancelados.resumo.cancelados > 0
      && comCancelados.razao.filter((r) => r.situacao === "cancelado").every((r) => !r.noDre),
    `${comCancelados.resumo.cancelados} cancelado(s)`);
  ok("incluir cancelados NÃO move o resultado",
    Math.abs(semCancelados.resumo.resultado - comCancelados.resumo.resultado) < 0.005,
    `${brl(semCancelados.resumo.resultado)} × ${brl(comCancelados.resumo.resultado)}`);
}

/* ═══════════════════════════ 4 · TESTE NEGATIVO ══════════════════════════ */

console.log("\n── 4 · TESTE NEGATIVO: a exportação com consulta PRÓPRIA ──");
console.log("   (é a sétima 'duas fontes para um fato'; a guarda tem de nomeá-la)");
{
  /**
   * A exportação proibida: ela ignora `relatorio.classificacao` e decide a
   * linha do DRE por PALAVRA-CHAVE por conta própria — que foi exatamente como
   * nasceram os R$ 267,70 de transferência dentro da despesa operacional.
   * Repare que ela é *plausível*: roda, produz números, e o arquivo abre.
   */
  function exportacaoComConsultaPropria(rel: Relatorio, movs: RiskMovement[]): Exportacao {
    const base = montarExportacao(rel, movs, cab());
    const razao = base.razao.map((r) => {
      const cat = r.categoria.toLowerCase();
      const linha = /venda|serviç/.test(cat) ? "receita_bruta"
        : /folha|aluguel|transfer/.test(cat) ? "despesas_operacionais"
        : r.linhaDreId;
      return { ...r, linhaDreId: linha, noDre: true, valor: Math.abs(r.valorLancamento) };
    });
    return { ...base, razao };
  }

  const filtro = { intervalo: INTERVALO, tipo: "vertical" as const, linhaPorCategoria: LINHA_POR_CATEGORIA };
  const rel = montarDRE(INPUT, filtro);
  const torta = exportacaoComConsultaPropria(rel, INPUT.movements);

  let divergencias: ReturnType<typeof conferirFechamento> = [];
  let estourou = "";
  try {
    divergencias = conferirFechamento(torta);
  } catch (e) {
    estourou = String((e as Error)?.message ?? e);
  }

  ok("a guarda NÃO estoura — ela mede", estourou === "", estourou);
  ok("a guarda fica VERMELHA com a consulta própria", divergencias.length > 0,
    `${divergencias.length} divergência(s)`);
  ok("e ela NOMEIA a linha divergente",
    divergencias.every((d) => d.label.length > 0 && d.linhaId.length > 0)
      && divergencias.some((d) => Math.abs(d.diferenca) > 0.005),
    divergencias.slice(0, 3).map((d) => `${d.linhaId}: ${brl(d.diferenca)}`).join(" · "));

  // ⚠️ E o positivo tem de continuar verde no MESMO relatório — senão o que a
  // guarda pegou foi a fixture, não o defeito.
  const bom = montarExportacao(rel, INPUT.movements, cab());
  ok("a exportação CERTA, sobre o mesmo relatório, continua fechando",
    conferirFechamento(bom).length === 0);
}

console.log(
  falhas === 0
    ? "\n✓ TODOS — a exportação sai da cascata, fecha com o consolidado, e a consulta própria reprova nomeada\n"
    : `\n✗ ${falhas} falha(s) na exportação para o contador\n`,
);
process.exit(falhas === 0 ? 0 : 1);
