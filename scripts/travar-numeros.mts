/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAVAR OS NÚMEROS — cada linha do DRE e do DFC num literal escrito à mão
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `npm run travar`
 *
 * ⚠️ **A 4ª regra manda, e é ela que dá valor a este arquivo:** nenhum valor
 * esperado aqui sai de chamar a função que o teste audita. Todos foram somados
 * à mão a partir de `scripts/fixture-financeira.mts` e escritos como LITERAL.
 * Se a cascata ganhar um defeito, o literal discorda — que é a diferença entre
 * medir e concordar por construção.
 *
 * ⚠️ **E toda linha prova que RECEBEU VALOR.** Verde sobre o vazio é pior que
 * vermelho: há asserção explícita de que cada linha da cascata é diferente de
 * zero, com as exceções NOMEADAS (o mês vazio, que tem de ser zero mesmo).
 *
 * ⚠️ **O que este arquivo NÃO refaz, porque já está travado:** folha por faixa
 * de INSS e IRRF, custo por regime tributário e envelhecimento de recebíveis
 * já têm literais no `engine-audit` (blocos `folha:` e `creceber:`) — INSS
 * 113,85 no piso · 509,60 em 5.000 · teto 951,63 · IRRF 312,89 e 1.579,57 ·
 * custo 6.450,01 (Simples III) × 8.122,23 (Presumido) · faixas de aging uma a
 * uma. Reescrevê-los aqui criaria dois donos para o mesmo número, que é a
 * doença que a camada canônica existe para matar.
 */
import {
  montarDRE, montarDFC, type Relatorio,
} from "@/core/relatorios";
import { dreGerencial } from "@/core/dre/engine";
import {
  entradas, saidas, resultado, saldo, burn, runway, geracaoCaixaMensal, janela,
} from "@/core/indicadores";
import {
  INPUT_FIN, INPUT_FIN_QUEIMA, INTERVALO_FIN, LINHA_POR_CATEGORIA_FIN, HOJE_FIN, SALDO_ATUAL_FIN,
} from "./fixture-financeira.mts";

let fails = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) { fails++; console.log(`✗ FAIL ${n} ${x}`); }
};
/** Compara em CENTAVOS inteiros: 0,1 + 0,2 não é 0,3 em ponto flutuante. */
const cent = (n: number) => Math.round(n * 100);
const eq = (nome: string, obtido: number, esperado: number) =>
  ok(nome, cent(obtido) === cent(esperado), `obtido ${obtido} · esperado ${esperado}`);

const valorDe = (r: Relatorio, id: string, coluna: number): number => {
  const l = r.linhas.find((x) => x.id === id);
  if (!l) { fails++; console.log(`✗ FAIL linha inexistente: ${id}`); return Number.NaN; }
  return l.celulas[coluna].valor;
};

const FILTRO = {
  intervalo: INTERVALO_FIN,
  linhaPorCategoria: LINHA_POR_CATEGORIA_FIN,
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. DRE — as 14 linhas, coluna a coluna
 * ═══════════════════════════════════════════════════════════════════════════ */
{
  const dre = montarDRE(INPUT_FIN, { ...FILTRO });

  ok("dre: três colunas — maio, junho e julho",
     dre.colunas.length === 3 && dre.colunas[0] === "2026-05" && dre.colunas[2] === "2026-07",
     dre.colunas.join(" · "));
  /*
   * ⚠️ O mês VAZIO tem de aparecer como coluna. Sem ele, o relatório liga maio
   * a julho como se junho não existisse — é o mesmo defeito da faixa de dias do
   * painel de contas a pagar, que pulava o dia sem lançamento e virava lista
   * ordenada por data em vez de calendário.
   */
  ok("dre: o mês sem movimento aparece como coluna e é DECLARADO sem dado",
     dre.colunasSemDado.includes("2026-06"), dre.colunasSemDado.join(" · "));

  /* ---- MAIO: os literais, somados à mão ---------------------------------- */
  eq("dre maio · Receita Bruta        (100.000,00 + 50.000,50 + 20.000,00 pendente)", valorDe(dre, "receita_bruta", 0), 170_000.50);
  eq("dre maio · Deduções             (12.000,00 DAS + 3.000,00 devolução)",          valorDe(dre, "deducoes", 0), 15_000.00);
  eq("dre maio · Receita Líquida      (170.000,50 − 15.000,00)",                      valorDe(dre, "receita_liquida", 0), 155_000.50);
  eq("dre maio · Custos Variáveis     (40.000,00 CMV + 2.500,25 frete)",              valorDe(dre, "custos_variaveis", 0), 42_500.25);
  eq("dre maio · Lucro Bruto          (155.000,50 − 42.500,25)",                      valorDe(dre, "lucro_bruto", 0), 112_500.25);
  eq("dre maio · Despesas Variáveis   (7.000,00 comissão + 5.500,00 marketing)",      valorDe(dre, "despesas_variaveis", 0), 12_500.00);
  eq("dre maio · Margem de Contrib.   (112.500,25 − 12.500,00)",                      valorDe(dre, "margem_contribuicao", 0), 100_000.25);
  eq("dre maio · Despesas Operac.     (30.000,00 folha + 8.000,00 aluguel)",          valorDe(dre, "despesas_operacionais", 0), 38_000.00);
  eq("dre maio · EBITDA               (100.000,25 − 38.000,00)",                      valorDe(dre, "ebitda", 0), 62_000.25);
  eq("dre maio · Depreciação          (2.000,00)",                                    valorDe(dre, "depreciacao_amortizacao", 0), 2_000.00);
  eq("dre maio · EBIT                 (62.000,25 − 2.000,00)",                        valorDe(dre, "ebit", 0), 60_000.25);
  eq("dre maio · Result. Financeiro   (+1.200,00 rendimento − 800,00 juros)",         valorDe(dre, "resultado_financeiro", 0), 400.00);
  eq("dre maio · Impostos sobre Lucro (6.000,00 IRPJ/CSLL)",                          valorDe(dre, "impostos_lucro", 0), 6_000.00);
  eq("dre maio · Não Operacional      (+10.000,00 venda de ativo)",                   valorDe(dre, "nao_operacional", 0), 10_000.00);
  eq("dre maio · RESULTADO LÍQUIDO    (60.000,25 + 400,00 − 6.000,00 + 10.000,00)",   valorDe(dre, "resultado_liquido", 0), 64_400.25);

  /*
   * ⚠️ A asserção que prova o CAMINHO, não o resultado: `impostos_lucro` já foi
   * uma linha INALCANÇÁVEL — `ehImpostoVenda` casa `\birpj\b` e levava o
   * movimento para a dedução antes. Cobrar que ela é maior que zero é o que
   * impede o retrocesso de passar verde com a cascata "fechando" no lugar
   * errado.
   */
  ok("dre maio · imposto sobre o LUCRO não caiu na dedução (a linha recebe valor)",
     valorDe(dre, "impostos_lucro", 0) > 0);
  /* ⚠️ E o negativo do mesmo caso: se ele tivesse caído na dedução, ela valeria
     21.000 em vez de 15.000. Afirmar sobre o número ERRADO exclui o caminho. */
  ok("dre maio · a dedução NÃO contém o IRPJ/CSLL (não vale 21.000)",
     cent(valorDe(dre, "deducoes", 0)) !== cent(21_000));

  /* ---- TRANSFERÊNCIA: nenhuma linha, em nenhuma coluna ------------------- */
  const idsNoRelatorio = new Set(dre.linhas.flatMap((l) => l.celulas.flatMap((c) => c.movimentos)));
  ok("dre: a transferência declarada não aparece em NENHUMA linha (saída)", !idsNoRelatorio.has("tr1"));
  ok("dre: a transferência declarada não aparece em NENHUMA linha (entrada)", !idsNoRelatorio.has("tr2"));
  ok("dre: o cancelado de R$ 999.999,99 não aparece em NENHUMA linha", !idsNoRelatorio.has("x1"));

  /* ---- JUNHO: o mês vazio é ZERO em toda linha --------------------------- */
  for (const l of dre.linhas) {
    eq(`dre junho · ${l.label} é zero (mês sem movimento)`, l.celulas[1].valor, 0);
  }

  /* ---- JULHO: o mês NEGATIVO --------------------------------------------- */
  eq("dre julho · Receita Bruta é zero",                       valorDe(dre, "receita_bruta", 2), 0);
  eq("dre julho · Despesas Operacionais (25.000,00 folha)",    valorDe(dre, "despesas_operacionais", 2), 25_000.00);
  eq("dre julho · RESULTADO LÍQUIDO é −25.000,00",             valorDe(dre, "resultado_liquido", 2), -25_000.00);
  /* ⚠️ Sinal: um resultado negativo tem de SAIR negativo. Um `Math.abs` no
     caminho apagaria o prejuízo — e a tela mostraria lucro. */
  ok("dre julho · o prejuízo é NEGATIVO, não uma magnitude",
     valorDe(dre, "resultado_liquido", 2) < 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. DFC — caixa, e a abertura e o fechamento do extrato
 * ═══════════════════════════════════════════════════════════════════════════ */
{
  const dfc = montarDFC(INPUT_FIN, { ...FILTRO });

  /* ---- MAIO -------------------------------------------------------------- */
  eq("dfc maio · Saldo Inicial       (reconstruído de hoje para trás)", valorDe(dfc, "saldo_inicial", 0), 80_000.00);
  eq("dfc maio · Entradas Operac.    (100.000,00 + 50.000,50 — o pendente NÃO entra)", valorDe(dfc, "entradas_operacionais", 0), 150_000.50);
  eq("dfc maio · Saídas Operacionais (12.000 + 3.000 + 40.000 + 2.500,25 + 7.000 + 5.500 + 30.000 + 8.000 + 6.000)", valorDe(dfc, "saidas_operacionais", 0), 114_000.25);
  eq("dfc maio · Fluxo Operacional   (150.000,50 − 114.000,25)",       valorDe(dfc, "fluxo_operacional", 0), 36_000.25);
  eq("dfc maio · Fluxo de Investim.  (+10.000,00 venda de ativo)",     valorDe(dfc, "fluxo_investimento", 0), 10_000.00);
  eq("dfc maio · Fluxo de Financiam. (+1.200,00 − 800,00)",            valorDe(dfc, "fluxo_financiamento", 0), 400.00);
  eq("dfc maio · Fluxo Líquido       (36.000,25 + 10.000,00 + 400,00)", valorDe(dfc, "fluxo_liquido", 0), 46_400.25);
  eq("dfc maio · Saldo Final         (80.000,00 + 46.400,25)",         valorDe(dfc, "saldo_final", 0), 126_400.25);

  /*
   * ⚠️ **O PENDENTE É O QUE SEPARA OS DOIS RELATÓRIOS.** A receita bruta de
   * maio (170.000,50) e as entradas operacionais (150.000,50) diferem
   * exatamente pelos R$ 20.000,00 que foram faturados e não recebidos. Sem
   * essa diferença, um teste que trocasse DRE por DFC passaria — e é a
   * distinção COMPETÊNCIA × CAIXA, que é a razão de existirem dois relatórios.
   */
  const dre = montarDRE(INPUT_FIN, { ...FILTRO });
  eq("dre × dfc · a diferença de maio é EXATAMENTE o título pendente",
     valorDe(dre, "receita_bruta", 0) - valorDe(dfc, "entradas_operacionais", 0), 20_000.00);

  /* ---- JUNHO: o mês vazio não move o saldo ------------------------------- */
  eq("dfc junho · Fluxo Líquido é zero", valorDe(dfc, "fluxo_liquido", 1), 0);
  eq("dfc junho · Saldo Inicial = Saldo Final de maio", valorDe(dfc, "saldo_inicial", 1), 126_400.25);
  eq("dfc junho · Saldo Final não se move", valorDe(dfc, "saldo_final", 1), 126_400.25);

  /* ---- JULHO e o FECHAMENTO --------------------------------------------- */
  eq("dfc julho · Saídas Operacionais (25.000,00)", valorDe(dfc, "saidas_operacionais", 2), 25_000.00);
  eq("dfc julho · Fluxo Líquido (−25.000,00)",      valorDe(dfc, "fluxo_liquido", 2), -25_000.00);
  /*
   * ⚠️ **A VOLTA FECHA.** O saldo inicial é reconstruído de hoje para trás; se
   * a reconstrução estiver certa, o saldo final da ÚLTIMA coluna tem de voltar
   * exatamente ao saldo de hoje. É a única asserção aqui que não depende de eu
   * ter somado certo: ela liga as duas pontas do cálculo.
   */
  eq("dfc julho · Saldo Final volta ao saldo de HOJE (a reconstrução fecha)",
     valorDe(dfc, "saldo_final", 2), SALDO_ATUAL_FIN);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. GERAÇÃO DE CAIXA, BURN e RUNWAY
 * ═══════════════════════════════════════════════════════════════════════════ */
{
  /*
   * Janela do ritmo: 90 dias terminando em 31/07 ⇒ 03/05 a 31/07, três meses.
   * Liquidado na janela, à mão:
   *   entradas 100.000,00 + 50.000,50 + 1.200,00 + 10.000,00 + 25.000,00 (transf.) = 186.200,50
   *   saídas   164.800,25
   *   líquido    21.400,25  ⇒  ÷ 3 meses = 7.133,4166…
   */
  const g = geracaoCaixaMensal(INPUT_FIN);
  eq("geração de caixa mensal (21.400,25 ÷ 3 meses)", Math.round(g.valor * 100) / 100, 7_133.42);

  const b = burn(INPUT_FIN);
  eq("burn é ZERO — a operação gerou caixa na janela", b.valor, 0);
  /*
   * ⚠️ E o runway NÃO é um número aqui: é `sem_queima`. Devolver o teto seria
   * o "33 meses de fôlego" da ONDA 4 — o teto do cálculo saindo como medida.
   */
  const r = runway(INPUT_FIN);
  ok("runway sem queima é INDISPONÍVEL, com o código nomeado",
     r.indisponivel?.codigo === "sem_queima", r.indisponivel?.codigo ?? "(devolveu número)");

  /* ---- a MESMA empresa, queimando ---------------------------------------- */
  /*
   * Com a folha extra de 60.000,00 em 20/07 as saídas viram 224.800,25:
   *   líquido = 186.200,50 − 224.800,25 = −38.599,75  ⇒  ÷ 3 = −12.866,5833…
   *   burn    = 12.866,58
   *   runway  = 101.400,25 ÷ (12.866,5833 ÷ 30) = 101.400,25 ÷ 428,8861 = 236,43 ⇒ 236 dias
   */
  const bq = burn(INPUT_FIN_QUEIMA);
  eq("burn da empresa que queima (38.599,75 ÷ 3 meses)", Math.round(bq.valor * 100) / 100, 12_866.58);
  const rq = runway(INPUT_FIN_QUEIMA);
  ok("runway da empresa que queima existe", !rq.indisponivel, rq.indisponivel?.codigo ?? "");
  eq("runway em dias (101.400,25 ÷ 428,8861 por dia)", rq.valor, 236);
  /*
   * ⚠️ E o caso que separa as duas: os dois inputs têm de dar respostas
   * DIFERENTES. Um caso que não discrimina é um caso que não testa.
   */
  ok("burn: as duas empresas dão respostas diferentes", cent(b.valor) !== cent(bq.valor));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. OS INDICADORES CANÔNICOS sobre a MESMA janela
 * ═══════════════════════════════════════════════════════════════════════════ */
{
  const jMaio = janela("2026-05-01", "2026-05-31", "Maio");

  /*
   * ⚠️ Aqui a canônica conta TUDO o que entrou em caixa, inclusive a
   * transferência — ela não tem a declaração de linha do relatório. É esperado
   * e é a razão de o número diferir do DFC: entradas de caixa (186.200,50 do
   * mês) ≠ entradas OPERACIONAIS (150.000,50). Duas perguntas, duas respostas.
   */
  const ent = entradas(INPUT_FIN, jMaio);
  eq("canônico maio · entradas de caixa (100.000,00 + 50.000,50 + 1.200,00 + 10.000,00 + 25.000,00)",
     ent.valor, 186_200.50);
  const sai = saidas(INPUT_FIN, jMaio);
  eq("canônico maio · saídas de caixa (114.000,25 operacionais + 800,00 juros + 25.000,00 transf.)",
     sai.valor, 139_800.25);
  eq("canônico maio · resultado (186.200,50 − 139.800,25)",
     resultado(INPUT_FIN, jMaio).valor, 46_400.25);
  /*
   * ⚠️ E ele bate com o FLUXO LÍQUIDO do DFC de maio — os dois caminhos chegam
   * ao mesmo número porque a transferência tem as duas pontas dentro do mês e
   * se anula. Se um dia ela deixar de se anular, esta linha denuncia.
   */
  eq("canônico × dfc · o resultado de maio bate com o fluxo líquido",
     resultado(INPUT_FIN, jMaio).valor, 46_400.25);

  eq("canônico · saldo de hoje é o saldo das contas", saldo(INPUT_FIN).valor, SALDO_ATUAL_FIN);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. CONTRATO CARTÃO × TABELA — para todo período e toda combinação de filtro
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O cartão e a tabela da mesma tela vinham de motores diferentes.** A
 * tabela é `montarRelatorio` (`core/relatorios`); os cartões executivos do DRE
 * são `dreGerencial` (`core/dre/engine`). Um cartão que discorda da tabela logo
 * abaixo é pior que cartão nenhum — e nada obrigava os dois a concordar fora do
 * caso único que alguém já tinha visto quebrar.
 *
 * Aqui a igualdade é cobrada na MATRIZ: todo período × toda combinação de
 * filtro. É a diferença entre proteger o par que já quebrou e não depender de
 * ninguém ter previsto qual quebraria.
 */
{
  const PERIODOS = [
    { nome: "maio",       de: "2026-05-01", ate: "2026-05-31" },
    { nome: "junho vazio", de: "2026-06-01", ate: "2026-06-30" },
    { nome: "julho",      de: "2026-07-01", ate: "2026-07-31" },
    { nome: "trimestre",  de: "2026-05-01", ate: "2026-07-31" },
    { nome: "ano",        de: "2026-01-01", ate: "2026-12-31" },
  ];
  const FILTROS = [
    { nome: "sem filtro", extra: {} },
    { nome: "conta inexistente", extra: { conta: "conta-que-nao-existe" } },
    { nome: "projeto inexistente", extra: { projeto: "projeto-que-nao-existe" } },
    { nome: "centro inexistente", extra: { centro: "centro-que-nao-existe" } },
  ];

  /** O mesmo recorte que a tela faz ANTES de alimentar o cartão. */
  const recortar = (de: string, ate: string, extra: Record<string, string> = {}) =>
    INPUT_FIN.movements.filter((m) => {
      if (m.status === "cancelado") return false;
      if (extra.conta && (m as { accountId?: string }).accountId !== extra.conta) return false;
      if (extra.projeto && m.projeto !== extra.projeto) return false;
      if (extra.centro && m.costCenter !== extra.centro) return false;
      return m.due_date >= de && m.due_date <= ate;
    });

  for (const p of PERIODOS) {
    for (const f of FILTROS) {
      const rel = montarDRE(INPUT_FIN, {
        intervalo: { de: p.de, ate: p.ate },
        linhaPorCategoria: LINHA_POR_CATEGORIA_FIN,
        ...f.extra,
      });
      const cartao = dreGerencial(
        recortar(p.de, p.ate, f.extra as Record<string, string>),
        "competencia",
        LINHA_POR_CATEGORIA_FIN,
      );

      const totalTabela = rel.linhas.find((l) => l.id === "receita_bruta")!
        .celulas.reduce((s, c) => s + c.valor, 0);

      eq(`cartão × tabela · receita bruta · ${p.nome} · ${f.nome}`,
         cartao.receitaBruta, totalTabela);

      /*
       * ⚠️ **O filtro que não casa devolve VAZIO, nunca TUDO.** É a mesma regra
       * do painel de contas a pagar: um filtro que ignora o que não encontra
       * ensina a não confiar no filtro — e aqui ele mostraria o resultado da
       * empresa inteira sob o rótulo de um projeto que não existe.
       */
      if (f.nome !== "sem filtro") {
        eq(`filtro sem correspondência devolve ZERO · ${p.nome} · ${f.nome}`, totalTabela, 0);
      }
    }
  }

  /*
   * ⚠️ **A MATRIZ NÃO PODE PASSAR SOBRE O VAZIO.** Quatro zeros comparados a
   * quatro zeros não provam concordância nenhuma — e três das cinco colunas
   * acima são justamente zero por construção.
   */
  const cheio = montarDRE(INPUT_FIN, { ...FILTRO });
  const receitaCheia = cheio.linhas.find((l) => l.id === "receita_bruta")!
    .celulas.reduce((s, c) => s + c.valor, 0);
  eq("cartão × tabela: o trimestre tem valor (a matriz não passou sobre o vazio)",
     receitaCheia, 170_000.50);

  /*
   * ⚠️ **E A PROVA DE QUE O CONTRATO PODE FALHAR.** Este é o defeito que a
   * matriz ACHOU, guardado como teste negativo: sem a declaração, o cartão
   * conta a transferência como receita e diverge da tabela em exatamente
   * R$ 25.000,00 — dinheiro que só trocou de bolso, publicado como
   * faturamento acima de uma tabela que mostrava o número certo.
   *
   * Se um dia esta asserção parar de valer, ou o defeito foi consertado na
   * raiz (e aí ela é reescrita), ou o contrato virou tautologia.
   */
  const semDeclaracao = dreGerencial(recortar(INTERVALO_FIN.de, INTERVALO_FIN.ate), "competencia");
  eq("contrato: SEM a declaração o cartão diverge da tabela em R$ 25.000,00 (o defeito medido)",
     semDeclaracao.receitaBruta - receitaCheia, 25_000.00);
}

console.log(
  fails === 0
    ? "\n✓ TODOS — DRE e DFC linha a linha, geração/burn/runway e o contrato cartão × tabela"
    : `\n✗ ${fails} FALHA(S) — os números não batem com os literais escritos à mão`,
);
process.exit(fails === 0 ? 0 : 1);
