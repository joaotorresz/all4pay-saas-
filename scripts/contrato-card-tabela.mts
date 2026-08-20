/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTRATO CARD × TABELA — para QUALQUER período e QUALQUER combinação de filtro
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run card-tabela        (dentro de `npm test` e do CI)
 *
 * ⚠️ **Por que esta guarda existe, e por que ela sozinha teria pego os três
 * piores defeitos desta auditoria.** Todas as três telas de dinheiro do produto
 * têm a mesma anatomia — um punhado de CARDS em cima e uma TABELA embaixo — e
 * os três defeitos foram da MESMA família: o card e a tabela lendo bases
 * diferentes sem que nada obrigasse os dois a concordar.
 *
 *   1. **O painel que se apagava sozinho.** Os cards eram calculados sobre a
 *      lista JÁ filtrada pelo status. Clicar em "Pagas" zerava "A vencer" e
 *      "Vencidas", como se filtrar tivesse APAGADO os outros títulos.
 *   2. **O período que não filtrava.** A cápsula pintava e não recortava nada:
 *      clicar em "Agosto" não mudava um número sequer, e quem clicava concluía
 *      que os valores abaixo já eram daquele mês.
 *   3. **O filtro sem correspondência devolvendo TUDO** em vez de vazio — o
 *      defeito que ensina a pessoa a não confiar no filtro.
 *
 * Nenhum dos três é erro de aritmética: cada número, sozinho, está certo. O que
 * está errado é a RELAÇÃO entre duas superfícies da mesma tela. Guarda de valor
 * não vê isso, porque não existe um valor errado para apontar.
 *
 * ⚠️ **A varredura é o PRODUTO CARTESIANO inteiro**, não uma amostra: períodos ×
 * contas × categorias × busca × status. Um defeito desta família aparece numa
 * combinação específica — foi o status que quebrou, não o período —, e testar
 * "alguns casos representativos" é justamente como ele passou.
 *
 * Determinístico: fixture fixa, sem relógio e sem rede.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { filtrarTitulos, resumoTitulos, statusDoTitulo, type FiltroTitulos } from "@/core/movimentacoes";
import { montarRelatorio, ESTRUTURA_DRE } from "@/core/relatorios";
import { INPUT_ORG } from "./fixture-org.mts";

let falhas = 0;
const casosRodados = { total: 0, comLinha: 0, deviamTerLinha: 0, tiveram: 0, cascataComValor: 0 };
const falha = (nome: string, detalhe: string) => { falhas++; console.log(`✗ FAIL ${nome}\n    ${detalhe}`); };
const ok = (nome: string, cond: boolean, detalhe = "") => { if (!cond) falha(nome, detalhe); };
const soma = (ms: RiskMovement[]) => Math.round(ms.reduce((s, m) => s + Math.abs(m.amount), 0) * 100) / 100;

/* ═══ A FIXTURE — desenhada para os filtros DISCRIMINAREM ══════════════════ */
/**
 * ⚠️ **Cada recorte tem de separar o conjunto em partes DESIGUAIS.** Se as duas
 * contas tivessem o mesmo total, filtrar por uma delas devolveria metade em
 * ambos os casos e um filtro trocado passaria despercebido. Se todos os títulos
 * tivessem o mesmo status, a invariante do status não estaria sendo exercida.
 *
 * Hoje = 15/09/2026. Os três status aparecem, com valores distintos:
 *   liquidado ..... 1.000 (c1/aluguel) + 2.000 (c2/folha) ......... 3.000
 *   atrasado ...... 4.000 (c1/folha) ............................... 4.000
 *   aberto ........ 8.000 (c2/aluguel) + 16.000 (c1/aluguel) ...... 24.000
 *   TOTAL ......................................................... 31.000
 */
const HOJE = "2026-09-15";
let seq = 0;
const t = (
  venc: string, valor: number, conta: string, categoria: string,
  status: "pago" | "pendente",
): RiskMovement => ({
  id: `t${++seq}`, type: "saida", status, amount: valor,
  due_date: venc, paid_date: status === "pago" ? venc : null,
  competence_date: venc, category: categoria, description: categoria,
  party_id: null, party_name: null, account_id: conta, accountId: conta,
} as unknown as RiskMovement);

const TITULOS: RiskMovement[] = [
  t("2026-09-01", 1_000, "c1", "Aluguel", "pago"),       // liquidado
  t("2026-09-02", 2_000, "c2", "Folha", "pago"),         // liquidado
  t("2026-09-05", 4_000, "c1", "Folha", "pendente"),     // atrasado (venceu 05/09)
  t("2026-09-20", 8_000, "c2", "Aluguel", "pendente"),   // aberto
  t("2026-10-10", 16_000, "c1", "Aluguel", "pendente"),  // aberto, fora de setembro
];

const INPUT: RiskInput = {
  hoje: HOJE, saldoAtual: 50_000, movements: TITULOS,
  accounts: [{ id: "c1", name: "Conta 1", balance: 30_000 }, { id: "c2", name: "Conta 2", balance: 20_000 }],
  parties: [], partyNames: {},
} as unknown as RiskInput;

/**
 * O caso é NÃO DEGENERADO quando cada recorte aponta para algo que existe na
 * fixture: período válido que contém título, conta real, categoria real, busca
 * que casa, e um status que de fato ocorre naquele recorte. Sobre esses a
 * cobertura tem de ser TOTAL — é neles que card e tabela têm o que comparar.
 */
function naoDegenerado(
  p: { nome: string; de?: string; ate?: string },
  conta: string | undefined, categoria: string | undefined, busca: string,
  status: FiltroTitulos["status"],
): boolean {
  if (conta === "c9-inexistente" || categoria === "Categoria que não existe") return false;
  if (busca === "zzz-sem-correspondencia") return false;
  if (p.nome === "invertido" || p.nome === "mês sem título") return false;
  // O recorte existe; resta saber se ele contém título com AQUELE status.
  const f = { de: p.de, ate: p.ate, conta, categoria, busca, status } as FiltroTitulos;
  return filtrarTitulos(INPUT, "pagar", { ...f, status: "todos" })
    .some((m) => status === "todos" || statusDoTitulo(m, HOJE) === status);
}

/* ═══ O PRODUTO CARTESIANO ════════════════════════════════════════════════ */
const PERIODOS: { nome: string; de?: string; ate?: string }[] = [
  { nome: "sem recorte" },
  { nome: "setembro", de: "2026-09-01", ate: "2026-09-30" },
  { nome: "só a 1ª semana", de: "2026-09-01", ate: "2026-09-07" },
  { nome: "outubro", de: "2026-10-01", ate: "2026-10-31" },
  { nome: "dois meses", de: "2026-09-01", ate: "2026-10-31" },
  // ⚠️ Períodos que NÃO contêm nada: o vazio é resposta e tem de ser vazio.
  { nome: "mês sem título", de: "2026-12-01", ate: "2026-12-31" },
  // ⚠️ Intervalo INVERTIDO — o caso que a ONDA 1 nomeou. Aqui ele tem de
  //    devolver vazio, nunca "tudo" nem o intervalo trocado em silêncio.
  { nome: "invertido", de: "2026-10-31", ate: "2026-09-01" },
];
const CONTAS = [undefined, "c1", "c2", "c9-inexistente"];
const CATEGORIAS = [undefined, "Aluguel", "Folha", "Categoria que não existe"];
const BUSCAS = ["", "aluguel", "zzz-sem-correspondencia"];
const STATUS: (FiltroTitulos["status"])[] = ["todos", "liquidado", "aberto", "atrasado"];

for (const p of PERIODOS)
  for (const conta of CONTAS)
    for (const categoria of CATEGORIAS)
      for (const busca of BUSCAS) {
        const comum = { de: p.de, ate: p.ate, conta, categoria, busca } as FiltroTitulos;
        const nome = `${p.nome} · conta=${conta ?? "todas"} · cat=${categoria ?? "todas"} · busca="${busca}"`;

        /* ── A base dos cards: TODOS os recortes MENOS o status ──────────── */
        const base = filtrarTitulos(INPUT, "pagar", { ...comum, status: "todos" });
        const cards = resumoTitulos(base, "pagar", HOJE);
        const cardDe = (id: string) => cards.find((c) => c.id === id)!;

        for (const status of STATUS) {
          casosRodados.total++;
          const tabela = filtrarTitulos(INPUT, "pagar", { ...comum, status });
          if (tabela.length > 0) casosRodados.comLinha++;
          // ⚠️ Um caso "não degenerado" é aquele em que TODO recorte aponta para
          // algo que existe. É sobre ESSES que a cobertura tem de ser total.
          if (naoDegenerado(p, conta, categoria, busca, status)) {
            casosRodados.deviamTerLinha++;
            if (tabela.length > 0) casosRodados.tiveram++;
            else falha(`[${nome}] status="${status}": caso não degenerado devolveu VAZIO`,
                       "todos os recortes apontam para algo que existe — a lista não podia estar vazia");
          }

          /* 1. O DEFEITO Nº 1: trocar o status NÃO pode mexer nos cards. */
          const cardsAgora = resumoTitulos(
            filtrarTitulos(INPUT, "pagar", { ...comum, status: "todos" }), "pagar", HOJE,
          );
          ok(`[${nome}] status="${status}" não altera os cards`,
             JSON.stringify(cardsAgora) === JSON.stringify(cards),
             "os cards mudaram ao trocar o filtro de status — o painel se apaga sozinho");

          /* 2. O CONTRATO DIRETO: o card do status escolhido = total da tabela. */
          if (status !== "todos") {
            ok(`[${nome}] card "${status}" == total da tabela`,
               Math.abs(cardDe(status!).valor - soma(tabela)) < 0.005,
               `card ${cardDe(status!).valor} × tabela ${soma(tabela)}`);
            ok(`[${nome}] a QUANTIDADE do card "${status}" == linhas da tabela`,
               cardDe(status!).quantidade === tabela.length,
               `card ${cardDe(status!).quantidade} × tabela ${tabela.length}`);
          } else {
            ok(`[${nome}] card "Total" == total da tabela sem status`,
               Math.abs(cardDe("total").valor - soma(tabela)) < 0.005,
               `card ${cardDe("total").valor} × tabela ${soma(tabela)}`);
          }

          /* 3. A tabela é SUBCONJUNTO da base — filtrar só pode tirar. */
          const idsBase = new Set(base.map((m) => m.id));
          ok(`[${nome}] status="${status}": a tabela é subconjunto da base dos cards`,
             tabela.every((m) => idsBase.has(m.id)),
             "o filtro de status FEZ APARECER título que a base não tinha");

          /* 4. O DEFEITO Nº 3: filtro sem correspondência devolve VAZIO. */
          if (categoria === "Categoria que não existe" || conta === "c9-inexistente" || busca === "zzz-sem-correspondencia") {
            ok(`[${nome}] status="${status}": filtro sem correspondência devolve VAZIO`,
               tabela.length === 0, `devolveu ${tabela.length} linha(s)`);
          }

          /* 5. O DEFEITO Nº 2: o período RECORTA de verdade. */
          if (p.de && p.ate && p.de <= p.ate) {
            const fora = tabela.filter((m) => (m.due_date ?? "").slice(0, 10) < p.de! || (m.due_date ?? "").slice(0, 10) > p.ate!);
            ok(`[${nome}] status="${status}": nenhum título FORA do período`,
               fora.length === 0, `${fora.length} título(s) fora de ${p.de}..${p.ate}`);
          }
          /* O intervalo invertido não devolve "tudo" nem o intervalo trocado. */
          if (p.nome === "invertido") {
            ok(`[${nome}] status="${status}": intervalo invertido devolve VAZIO`,
               tabela.length === 0, `devolveu ${tabela.length} linha(s)`);
          }
        }

        /* 6. Os três status PARTICIONAM a base: somam o total e não se repetem. */
        const somaDosTres = cardDe("liquidado").valor + cardDe("aberto").valor + cardDe("atrasado").valor;
        ok(`[${nome}] os três status somam o Total (nenhum título fora, nenhum contado 2×)`,
           Math.abs(somaDosTres - cardDe("total").valor) < 0.005,
           `${somaDosTres} × ${cardDe("total").valor}`);
        ok(`[${nome}] as quantidades também particionam`,
           cardDe("liquidado").quantidade + cardDe("aberto").quantidade + cardDe("atrasado").quantidade === cardDe("total").quantidade);
        /* Todo título da base recebe exatamente UM status. */
        ok(`[${nome}] todo título da base tem um status reconhecido`,
           base.every((m) => ["liquidado", "aberto", "atrasado"].includes(statusDoTitulo(m, HOJE))));
      }

/* ═══ O MESMO CONTRATO NO DRE: cartão × tabela ════════════════════════════ */
/**
 * ⚠️ A tela do DRE tem a mesma anatomia — cartões executivos em cima, cascata
 * embaixo — e o mesmo risco: o cartão somando por conta própria enquanto a
 * tabela usa a estrutura. Aqui a invariante é a da CASCATA: cada linha "=" tem
 * de ser exatamente a fórmula sobre as linhas acima, em TODA janela — inclusive
 * nas vazias, onde um zero pode esconder uma linha que deixou de ser somada.
 *
 * ⚠️ **A CASCATA É REESCRITA À MÃO AQUI, e não lida de `l.formula`.** A primeira
 * versão desta verificação somava `l.formula` e comparava com a linha — e o
 * motor calcula a linha a partir dessa MESMA declaração. Era `x == x`: plantar
 * o defeito (tirar `deducoes` da fórmula da receita líquida) não a fez falhar,
 * porque os dois lados mudaram juntos. É a quinta aparição desta tautologia
 * neste repositório, agora dentro de uma guarda escrita para caçá-la.
 *
 * Com a cascata escrita aqui, as duas descrições são independentes: mexer na
 * estrutura sem mexer nesta lista faz o contrato reprovar, que é a única forma
 * de ele estar medindo alguma coisa.
 */
const CASCATA_A_MAO: Record<string, [1 | -1, string][]> = {
  receita_liquida: [[1, "receita_bruta"], [-1, "deducoes"]],
  lucro_bruto: [[1, "receita_liquida"], [-1, "custos_variaveis"]],
  margem_contribuicao: [[1, "lucro_bruto"], [-1, "despesas_variaveis"]],
  ebitda: [[1, "margem_contribuicao"], [-1, "despesas_operacionais"]],
  ebit: [[1, "ebitda"], [-1, "depreciacao_amortizacao"]],
  resultado_liquido: [
    [1, "ebit"], [1, "resultado_financeiro"], [-1, "impostos_lucro"], [1, "nao_operacional"],
  ],
};

{
  /**
   * ⚠️ **A FIXTURE DESTE BLOCO É OUTRA, e a troca foi o plantio que a exigiu.**
   * Os títulos acima são todos SAÍDA em duas categorias (aluguel e folha) — bom
   * para o painel, inútil para a cascata: `deducoes`, `custos_variaveis`,
   * `resultado_financeiro` e `impostos_lucro` valem ZERO em toda janela. Plantei
   * o defeito (tirar `deducoes` da fórmula da receita líquida) e o contrato NÃO
   * reprovou — não porque a verificação fosse fraca, mas porque a entrada não
   * discriminava: subtrair zero de qualquer coisa dá qualquer coisa.
   *
   * `INPUT_ORG` foi desenhada com um valor DISTINTO em cada nível da cascata,
   * exatamente para que uma troca entre linhas apareça como um número que
   * ninguém reconhece.
   */
  const JANELAS = [
    { de: "2026-07-01", ate: "2026-07-31" },  // mês cheio, todas as linhas ocupadas
    { de: "2026-05-01", ate: "2026-07-31" },  // três meses, um deles negativo e um vazio
    { de: "2026-12-01", ate: "2026-12-31" },  // vazia
  ];
  for (const intervalo of JANELAS) {
    for (const regime of ["competencia", "caixa"] as const) {
      const rel = montarRelatorio(INPUT_ORG, ESTRUTURA_DRE, { intervalo, regime } as never);
      const val = (id: string, k: number) => rel.linhas.find((l) => l.id === id)?.celulas[k]?.valor ?? 0;
      rel.colunas.forEach((col, k) => {
        casosRodados.total++;
        for (const [id, partes] of Object.entries(CASCATA_A_MAO)) {
          const esperado = partes.reduce((s, [sinal, ref]) => s + sinal * val(ref, k), 0);
          if (Math.abs(esperado) > 0.005) casosRodados.cascataComValor++;
          ok(`[dre ${col} · ${regime}] a linha "${id}" fecha contra a cascata escrita à mão`,
             Math.abs(val(id, k) - esperado) < 0.005,
             `linha ${val(id, k)} × esperado ${esperado}`);
        }
      });
    }
  }
}

/* ═══ A GUARDA DA GUARDA ══════════════════════════════════════════════════ */
/**
 * ⚠️ **Um contrato que roda sobre o vazio fica verde provando nada.** Metade
 * destes casos são combinações que devolvem lista vazia de propósito (filtro
 * sem correspondência, mês sem título, intervalo invertido) — e num conjunto só
 * de vazios toda igualdade seria 0 == 0. Esta asserção exige que uma fatia
 * substancial dos casos tenha EXERCITADO linha de verdade.
 */
/**
 * ⚠️ **A primeira versão desta asserção media a coisa errada, e ela mesma
 * denunciou isso.** Eu havia exigido que ao menos 25% dos casos tivessem linha;
 * deu 165 de 1352 (12%) e reprovou. O limiar estava errado, não a varredura: o
 * produto cartesiano é dominado de propósito por combinações VAZIAS (filtro sem
 * correspondência, mês sem título, intervalo invertido), e acrescentar mais
 * casos negativos — que é melhorar a guarda — pioraria a razão. Uma asserção
 * que pune quem cobre mais casos negativos aponta para o lado errado.
 *
 * O que importa é o outro lado: **todo caso NÃO DEGENERADO tem de exercitar
 * linha.** Aí não há como o contrato ficar verde sobre `0 == 0`, e a métrica
 * não se degrada quando a cobertura melhora. Baixar o limiar teria feito a
 * guarda passar sem que nada tivesse sido resolvido — o contorno que a sexta
 * regra proíbe.
 */
/**
 * ⚠️ **E a cascata também precisa provar que recebeu valor.** Um contrato de
 * cascata rodando sobre linhas todas zeradas fecha em `0 = 0 − 0` e não mede
 * nada — foi exatamente esse o buraco que o plantio do D4 revelou.
 */
ok(`cobertura: a cascata exercitou linhas com VALOR (não é 0 = 0 − 0)`,
   casosRodados.cascataComValor >= 5,
   `${casosRodados.cascataComValor} verificações de cascata com valor não nulo`);
ok(`cobertura: TODO caso não degenerado exercitou linha (não é 0 == 0)`,
   casosRodados.deviamTerLinha > 0 && casosRodados.tiveram === casosRodados.deviamTerLinha,
   `${casosRodados.tiveram} de ${casosRodados.deviamTerLinha} casos não degenerados com linha`);

console.log(
  falhas === 0
    ? `✓ TODOS — contrato card × tabela em ${casosRodados.total} combinações · ${casosRodados.deviamTerLinha} não degeneradas, TODAS com linha\n`
    : `\n✗ ${falhas} FALHA(S) — card e tabela discordam\n`,
);
if (falhas > 0) process.exit(1);
