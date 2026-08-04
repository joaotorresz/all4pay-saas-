/**
 * consistencia — A MATRIZ DE CONSISTÊNCIA CRUZADA.
 *
 *   npm run consistencia   (também roda dentro de npm test e no CI)
 *
 * Esta é a entrega que impede os defeitos de voltarem. As outras guardas
 * verificam se um motor está certo sozinho; esta verifica se DOIS CAMINHOS
 * DIFERENTES chegam ao MESMO número.
 *
 * A regra que ela codifica é a da ONDA 1: **um indicador, uma função**. Cada
 * asserção abaixo pega um número que aparece em mais de um lugar do sistema —
 * a Home, o Razão, o DRE, o painel, o motor de risco — e exige igualdade contra
 * `core/indicadores`, a camada canônica.
 *
 * Enquanto isto não existia, a mesma pergunta tinha resposta diferente por
 * tela, e ninguém descobria até um cliente conferir.
 *
 * Determinístico: um dataset fixo, sem relógio e sem rede.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import * as FIXTURE from "./fixture.mts";
import {
  saldo, saldoInicial, entradas, saidas, resultado, burn, runway, runwayMeses,
  geracaoCaixaMensal, mrr, arr, inadimplencia, inadimplenciaTaxa, receitaTributavel,
  painelIndicadores, reconciliarSaldo, foraDaBaseTributavel, pontePosicaoFluxo,
  janela, janelaMes, janelaUltimosDias, janelaHoje, janelaDoMesDe, janelaAnterior,
  diasDe, dentro, contemHoje, saldoEm, saldoAbertura, assinado, magnitude,
  liquidado, dataDe, INDICADORES_VERSION,
} from "@/core/indicadores";
import { calcularBurnRate } from "@/core/risk-engine/burn.engine";
import { calcularRunway } from "@/core/risk-engine/liquidez.engine";
import { scoreRiscoCaixa } from "@/core/risk-engine";
import { analisarQuantitativo } from "@/core/quant";
import { dreGerencial, movimentosNoPeriodo } from "@/core/dre/engine";
import { dailyCashflowRange, dailyCashflow, summarizeAccounts } from "@/lib/aggregations";
import { painelAssinaturas } from "@/core/paineis";
import {
  prepararIngestao, linhasAGravar, planejarLimpeza, chaveIdempotencia,
  CATEGORIAS_TODAS, type LinhaBruta, type LinhaExistente,
} from "@/core/ingestao";
import { montarInvestorUpdate } from "@/core/investor";
import { exigePro, podeAbrir, PLANO_SIMPLES, PLANO_ABERTO } from "@/core/planos";
import { TODOS_OS_DESVIOS, destinoDe } from "@/core/rotas/aliases";
import {
  FUSOES, PRONTAS, ROTAS_A_APOSENTAR, ITENS_PENDENTES,
  prontaParaAposentar, pendencias,
} from "@/core/rotas/consolidacao";
import {
  INVENTARIO, CANONICAS, APOSENTANDO, nomesDuplicados,
} from "@/core/rotas/inventario";
import { CONTROLES, porTipo, malDeclarados } from "@/core/controles";
import {
  resumoIsolamento, achadosDaAuditoria, pendenciasDeAdmin,
  motivoParaNaoAprovar, podeAprovar, FRASE_RECUSA, PAPEIS, ACOES, MATRIZ_DEMO,
} from "@/core/seguranca";
import { avaliarExportacao, rotuloExportado } from "@/core/artefatos";
import { montarFalha, paraAlertar, DONO_POR_MODULO } from "@/core/erros";
import { problemaDoIntervalo } from "@/core/indicadores";
import { regimeDaEmpresa, regimeEmConflito, perfilTributario } from "@/core/tax/regime";
import { eliminacoesIntercompany } from "@/core/relatorios";
import {
  TERMOS, termosProibidosEm, glossarioPublicado, VOZ, comVoz, ESTRANGEIRISMOS_PROIBIDOS,
  textoDeOrigem,
} from "@/core/glossario";
import { MARCA_IA } from "@/core/marca";
import { pct, pctDeInteiro, dataBR, comSinal, MENOS } from "@/lib/format";

import { existsSync } from "node:fs";
import { sanearContraparte, melhorNome, deduplicar } from "@/core/ingestao/contraparte";
import { ACOES_CADASTROS, ACOES_MOVIMENTACOES, ACAO_NOVA_EMPRESA } from "@/core/criar";
import { tituloDaAba, MARCA } from "@/core/marca";
import { SECTIONS, CONFIG } from "@/components/dashboard/nav-data";
import {
  CHAVES_DE_NEGOCIO, PREFERENCIAS_LOCAIS, PRECISAM_DE_TABELA_PROPRIA,
  CACHES_LOCAIS, ROTULO_DA_CHAVE, rotuloDaChave,
  expurgarCaches, enxugarLocal, exportarEstado, importarEstado, backupValido,
} from "@/lib/store-org";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { balancete } from "@/lib/ledger";
import { CAIXA, lancamentosDeMovimentos, nomeConta, tipoConta } from "@/core/ledger/chart";
import { saldoPorNatureza } from "@/core/ledger";
import type { Movement } from "@/lib/types";


/**
 * Varre `src/` atrás de chaves `a4p_*` literais. É como a guarda descobre uma
 * chave nova que ninguém classificou — sem isso, a lista envelhece calada.
 */
function chavesUsadasNoCodigo(): string[] {
  const achadas = new Set<string>();
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      const st = statSync(caminho);
      if (st.isDirectory()) { varrer(caminho); continue; }
      if (!/\.(ts|tsx)$/.test(nome)) continue;
      const txt = readFileSync(caminho, "utf8");
      for (const m of txt.matchAll(/"(a4p_[a-z0-9_]+)"/g)) achadas.add(m[1]);
    }
  };
  varrer("src");
  // Prefixos de chave dinâmica (ex.: `a4p_live_<org>`) não são chaves.
  return Array.from(achadas).filter((c) => !c.endsWith("_")).sort();
}



/**
 * Consultas ao banco SEM teto de linhas.
 *
 * ⚠️ Varre a cadeia inteira (`.from("x") … ;`) e cobra `.limit`, `.range` ou
 * um resultado de linha única. A política de acesso por linha diz DE QUEM são
 * as linhas; ela não diz QUANTAS — e uma consulta sem teto derruba a tela de
 * quem tem mais dados, que é justamente o cliente que mais paga.
 */
function consultasSemTeto(): string[] {
  const out: string[] = [];
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { varrer(caminho); continue; }
      if (!/\.(ts|tsx)$/.test(nome)) continue;
      const txt = readFileSync(caminho, "utf8");
      for (const m of txt.matchAll(/\.from\("([a-z_]+)"\)([\s\S]{0,700}?);/g)) {
        const cadeia = m[2];
        if (!/\.select\(/.test(cadeia)) continue;             // insert/update
        if (/\.limit\(|\.single\(\)|\.maybeSingle\(\)|\.range\(/.test(cadeia)) continue;
        out.push(`${caminho}:${txt.slice(0, m.index).split("\n").length} (${m[1]})`);
      }
    }
  };
  varrer("src");
  return out;
}

/**
 * Indicadores RECALCULADOS dentro de componente de tela.
 *
 * ⚠️ Esta é a causa estrutural da divergência: cada tela somava os lançamentos
 * do seu jeito, e nenhuma estava errada isoladamente — estavam respondendo
 * perguntas diferentes com o mesmo rótulo. A camada canônica só resolve o
 * problema se ninguém puder contorná-la, e contornar é fácil: um `filter` por
 * tipo/status seguido de um `reduce` é a receita inteira.
 *
 * A varredura procura exatamente esse par dentro de `src/components/**`. Ela
 * NÃO acusa somar uma lista já agregada pelo motor (um `reduce` sobre pontos de
 * gráfico, sobre KPIs, sobre linhas de uma tabela) — o que ela pega é a tela
 * indo aos LANÇAMENTOS e apurando de novo.
 */
function indicadoresRecalculadosEmTela(): string[] {
  const out: string[] = [];
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { varrer(caminho); continue; }
      if (!/\.tsx?$/.test(nome)) continue;
      const txt = readFileSync(caminho, "utf8");
      // Procura o `.reduce(` e olha PARA TRÁS: houve um `.filter(` por
      // tipo/status de lançamento no caminho? Olhar para trás é o que funciona
      // aqui — o corpo do filtro tem parênteses próprios (`(m) => …`), e um
      // padrão que tente casar a expressão inteira de uma vez morre no primeiro.
      for (const m of txt.matchAll(/\.reduce\(/g)) {
        const antes = txt.slice(Math.max(0, m.index - 320), m.index);
        const iFiltro = antes.lastIndexOf(".filter(");
        if (iFiltro < 0) continue;
        const trecho = antes.slice(iFiltro);
        if (!/\.type\s*===\s*"(?:entrada|saida)"|\.status\s*===\s*"(?:pago|pendente)"/.test(trecho)) continue;
        out.push(`${caminho}:${txt.slice(0, m.index).split("\n").length}`);
      }
    }
  };
  varrer("src/components");
  return out;
}

const existe = (p: string): boolean => existsSync(p);
const ler = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "");

/** Varre `src/components` e `src/app` aplicando um teste a cada arquivo. */
function varrerTelas(fn: (caminho: string, txt: string) => void): void {
  const anda = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { anda(caminho); continue; }
      if (!/\.tsx$/.test(nome)) continue;
      fn(caminho, readFileSync(caminho, "utf8"));
    }
  };
  anda("src/components");
  anda("src/app");
}

/**
 * Texto de INTERFACE em inglês.
 *
 * ⚠️ Procura a palavra proibida dentro de conteúdo de elemento (`>Texto<`) e em
 * atributos que o usuário lê (`title`, `placeholder`, `aria-label`) — não no
 * código. `dashboard`, `insights` e `balance` são nomes de variável legítimos
 * em todo lugar; o que não pode é a pessoa LER isso.
 */
function textoDeInterfaceEmIngles(): string[] {
  const out: string[] = [];
  varrerTelas((caminho, txt) => {
    const visiveis = [
      ...txt.matchAll(/>\s*([A-Za-zÀ-ú][^<>{}\n]{2,60}?)\s*</g),
      ...txt.matchAll(/(?:title|placeholder|aria-label)="([^"]{3,80})"/g),
    ].map((m) => m[1]);
    for (const v of visiveis) {
      const baixo = v.toLowerCase();
      for (const palavra of ESTRANGEIRISMOS_PROIBIDOS) {
        if (new RegExp(`\\b${palavra}\\b`).test(baixo)) {
          out.push(`${caminho}: "${v.slice(0, 40)}"`);
          break;
        }
      }
    }
  });
  return out;
}

/** Grafias da marca fora do padrão, em texto que o usuário lê. */
function grafiasDaMarcaEmTela(): string[] {
  const out: string[] = [];
  varrerTelas((caminho, txt) => {
    for (const m of txt.matchAll(/>\s*([^<>{}\n]{0,60})</g)) {
      const v = m[1];
      // `All 4 Pay AI` é o nome próprio do assistente — a exceção sancionada.
      const semIA = v.replace(/All 4 Pay AI/g, "");
      if (/All4Pay|ALL4PAY|All4pay|All 4 Pay/.test(semIA)) out.push(`${caminho}: "${v.trim()}"`);
    }
  });
  return out;
}

/**
 * Percentual com precisão fora do padrão em tela.
 *
 * ⚠️ O alvo é a INCONSISTÊNCIA, não o `toFixed`: `paineis/shared.tsx` tinha 0,
 * 1 e 2 casas no mesmo arquivo. Depois da padronização, todo percentual sai por
 * `pct`/`pctDeInteiro`.
 */
function casasDecimaisDePercentualEmTela(): string[] {
  const out: string[] = [];
  varrerTelas((caminho, txt) => {
    for (const m of txt.matchAll(/\.toFixed\(\d\)\s*\}?\s*%/g)) {
      out.push(`${caminho}:${txt.slice(0, m.index).split("\n").length}`);
    }
  });
  return out;
}

/**
 * As rotas que o Next REALMENTE publica: todo diretório com `page.tsx` sob
 * `src/app`. É a lista contra a qual o inventário é conferido — declarar é
 * fácil, o difícil é declarar tudo, e só a varredura sabe o que existe.
 */
function rotasPublicadas(): string[] {
  const out: string[] = [];
  const varrer = (dir: string) => {
    let itens: string[];
    try { itens = readdirSync(dir); } catch { return; }
    if (itens.includes("page.tsx")) {
      out.push(dir.replace(/^src\/app/, "").replace(/^$/, "/") || "/");
    }
    for (const nome of itens) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) varrer(caminho);
    }
  };
  varrer("src/app");
  return out.sort();
}

let fails = 0;
const ok = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`✗ FAIL ${n} ${x}`); } };
/** Igualdade em CENTAVOS inteiros — float não fecha em 1e-9 e não deve fingir. */
const cent = (n: number) => Math.round(n * 100);
const eq = (n: string, a: number, b: number, x = "") =>
  ok(n, cent(a) === cent(b), x || `${a.toFixed(2)} ≠ ${b.toFixed(2)} (Δ ${(a - b).toFixed(2)})`);

/* ========================================================================== */
/* Dataset determinístico — todas as armadilhas de uma vez.                    */
/* ========================================================================== */

const { HOJE, SALDO, mv, DATASET, INPUT } = FIXTURE;

const AGOSTO = janelaMes(2026, 7);

/* ========================================================================== */
/* LINHA 1 — SINAL: `amount` é magnitude, direção vem de `type`.               */
/* ========================================================================== */
{
  eq("sinal: entrada assina positivo", assinado(mv("z", "entrada", "pago", 100, HOJE)), 100);
  eq("sinal: saída assina negativo", assinado(mv("z", "saida", "pago", 100, HOJE)), -100);
  // Um `amount` que chega negativo por engano NÃO pode virar receita numa saída.
  eq("sinal: saída com amount negativo continua saída", assinado(mv("z", "saida", "pago", -100, HOJE)), -100);
  eq("sinal: magnitude nunca é negativa", magnitude(mv("z", "saida", "pago", -100, HOJE)), 100);

  // ⚠️ O SALDO NUNCA É EXIBIDO EM MÓDULO. Este é o guard do bug da Home: o
  // herói renderizava `Math.abs(saldo)`, então um caixa de −31 mil aparecia
  // como +31 mil — a informação mais importante da tela, invertida.
  const negativo: RiskInput = { ...INPUT, saldoAtual: -31_000.16 };
  ok("sinal: saldo negativo permanece negativo", saldo(negativo).valor < 0,
     `saldo devolvido = ${saldo(negativo).valor}`);
  eq("sinal: saldo negativo mantém o valor exato", saldo(negativo).valor, -31_000.16);
}

/* ========================================================================== */
/* LINHA 2 — O QUE CONTA: uma definição de liquidado, não três.                */
/* ========================================================================== */
{
  const pendComPaid = DATASET.find((m) => m.id === "x1")!;
  ok("liquidado: pendente com paid_date NÃO é liquidado", !liquidado(pendComPaid));
  ok("liquidado: pendente com paid_date não tem data de caixa", dataDe(pendComPaid, "caixa") === null);
  ok("liquidado: pendente com paid_date TEM data de competência",
     dataDe(pendComPaid, "competencia") === "2026-08-20");
  ok("liquidado: cancelado não tem data em regime nenhum",
     dataDe(DATASET.find((m) => m.id === "c1")!, "caixa") === null &&
     dataDe(DATASET.find((m) => m.id === "c1")!, "competencia") === null);

  // O pendente de 9.900 fica FORA do caixa e DENTRO da competência de agosto.
  const caixaAgo = entradas(INPUT, AGOSTO, "caixa").valor;
  const compAgo = entradas(INPUT, AGOSTO, "competencia").valor;
  ok("regime: caixa ≠ competência quando há pendente no mês", caixaAgo !== compAgo);
  eq("regime: a diferença é exatamente o pendente do mês", compAgo - caixaAgo,
     9_900 + 1_100 + 7_000 - 5_000);
}

/* ========================================================================== */
/* LINHA 3 — SALDO: uma regra, e ela fecha com o extrato.                      */
/* ========================================================================== */
{
  eq("saldo: hoje == saldoAtual das contas", saldo(INPUT, janelaHoje(HOJE)).valor, SALDO);
  eq("saldo: saldoEm(hoje) == saldoAtual", saldoEm(INPUT, HOJE), SALDO);

  // Reconstruir o passado e voltar ao presente tem de fechar: o saldo de
  // abertura do mês mais os líquidos do mês devolve o saldo de hoje.
  const abertura = saldoAbertura(INPUT, AGOSTO.de);
  const liquidosAteHoje = DATASET
    .filter((m) => liquidado(m) && (dataDe(m, "caixa") ?? "") >= AGOSTO.de && (dataDe(m, "caixa") ?? "") <= HOJE)
    .reduce((s, m) => s + assinado(m), 0);
  eq("saldo: abertura do mês + líquidos até hoje == saldo de hoje", abertura + liquidosAteHoje, SALDO);

  // O saldo futuro incorpora os previstos — e SÓ os previstos.
  const fim = saldoEm(INPUT, "2026-08-31");
  const previstosAteFim = DATASET
    .filter((m) => m.status === "pendente" && m.due_date > HOJE && m.due_date <= "2026-08-31")
    .reduce((s, m) => s + assinado(m), 0);
  eq("saldo: futuro == hoje + previstos da janela", fim, SALDO + previstosAteFim);

  // `summarizeAccounts` (o widget de contas) tem de dar o mesmo total.
  const contas = [{ id: "a", name: "Conta", balance: SALDO, currency: "BRL" }] as Parameters<typeof summarizeAccounts>[0];
  eq("saldo: widget de contas == indicador canônico",
     summarizeAccounts(contas, []).total, saldo(INPUT, janelaHoje(HOJE)).valor);
}

/* ========================================================================== */
/* LINHA 4 — ENTRADAS/SAÍDAS/RESULTADO: a mesma base nas três.                 */
/* ========================================================================== */
{
  const e = entradas(INPUT, AGOSTO).valor;
  const s = saidas(INPUT, AGOSTO).valor;
  const r = resultado(INPUT, AGOSTO).valor;
  eq("fluxo: resultado == entradas − saídas", r, e - s);

  // Valor fechado, conferível à mão (agosto, caixa): e1 12.000 + e2 8.500 +
  // e3 5.000 (pago em 02/08) + t1 20.000 + t2 900 + t3 15.000 = 61.400.
  eq("fluxo: entradas de agosto (valor fechado)", e, 61_400);
  // s1 4.200 + s2 1.800 = 6.000.
  eq("fluxo: saídas de agosto (valor fechado)", s, 6_000);
  eq("fluxo: resultado de agosto (valor fechado)", r, 55_400);

  // O cancelado de 50 mil não pode aparecer em nenhuma das três: remover a
  // linha cancelada do dataset não pode mudar número nenhum.
  const semCancelado: RiskInput = { ...INPUT, movements: DATASET.filter((m) => m.status !== "cancelado") };
  eq("fluxo: cancelado não altera as entradas", entradas(semCancelado, AGOSTO).valor, e);
  eq("fluxo: cancelado não altera o resultado", resultado(semCancelado, AGOSTO).valor, r);

  // ⚠️ CRUZAMENTO: o gráfico de fluxo diário e o total do período têm de somar
  // o mesmo. Eram regras diferentes — `dailyCashflowRange` aceitava qualquer
  // linha com `paid_date`, inclusive pendente.
  const pontos = dailyCashflowRange(DATASET as unknown as Movement[], AGOSTO.de, AGOSTO.ate, 0);
  const somaEnt = pontos.reduce((acc, p) => acc + p.inflow, 0);
  const somaSai = pontos.reduce((acc, p) => acc + Math.abs(p.outflow), 0);
  eq("cruzado: gráfico diário == entradas do período", somaEnt, e);
  eq("cruzado: gráfico diário == saídas do período", somaSai, s);

  // E a linha de saldo do gráfico tem de TERMINAR no saldo real.
  // A janela vai até HOJE de propósito: `dailyCashflowRange` desenha o
  // REALIZADO, e realizado não existe depois de hoje. Levá-la até o fim do mês
  // e cobrar o saldo projetado misturaria as duas leituras — que é como um
  // gráfico "realizado" acabava exibindo dinheiro que ainda não entrou.
  const comAbertura = dailyCashflowRange(
    DATASET as unknown as Movement[], AGOSTO.de, HOJE, saldoAbertura(INPUT, AGOSTO.de),
  );
  eq("cruzado: linha de saldo realizado fecha no saldo de hoje",
     comAbertura[comAbertura.length - 1].balance, saldoEm(INPUT, HOJE));

  // `dailyCashflow` (janela móvel) e `dailyCashflowRange` (janela fixa) têm de
  // usar a MESMA regra sobre o mesmo intervalo.
  const j30 = janelaUltimosDias(30, HOJE);
  const movel = dailyCashflow(DATASET as unknown as Movement[], 30, new Date(`${HOJE}T00:00:00`));
  const fixa = dailyCashflowRange(DATASET as unknown as Movement[], j30.de, j30.ate, 0);
  eq("cruzado: janela móvel == janela fixa (entradas)",
     movel.reduce((a, p) => a + p.inflow, 0), fixa.reduce((a, p) => a + p.inflow, 0));
  eq("cruzado: janela móvel == janela fixa (saídas)",
     movel.reduce((a, p) => a + Math.abs(p.outflow), 0), fixa.reduce((a, p) => a + Math.abs(p.outflow), 0));
}

/* ========================================================================== */
/* LINHA 5 — DRE (competência) contra o indicador canônico.                    */
/* ========================================================================== */
{
  const compE = entradas(INPUT, AGOSTO, "competencia").valor;
  const rows = movimentosNoPeriodo(INPUT, "competencia", AGOSTO.de, AGOSTO.ate);
  const dreEnt = rows.filter((m) => m.type === "entrada").reduce((s, m) => s + Math.abs(m.amount), 0);
  eq("cruzado: DRE competência == entradas canônicas (competência)", dreEnt, compE);

  const dre = dreGerencial(rows);
  eq("cruzado: receita bruta do DRE == entradas canônicas", dre.receitaBruta, compE);

  const compS = saidas(INPUT, AGOSTO, "competencia").valor;
  const dreDesp = rows.filter((m) => m.type === "saida").reduce((s, m) => s + Math.abs(m.amount), 0);
  eq("cruzado: despesa do DRE == saídas canônicas (competência)", dreDesp, compS);
}

/* ========================================================================== */
/* LINHA 6 — BURN e RUNWAY: uma unidade, um número, em todos os motores.       */
/* ========================================================================== */
{
  const b = burn(INPUT).valor;
  const g = geracaoCaixaMensal(INPUT).valor;
  eq("ritmo: burn == max(0, −geração)", b, Math.max(0, -g));

  // risk-engine, quant e o canônico têm de concordar no burn e no runway.
  const be = calcularBurnRate(INPUT, 90);
  eq("cruzado: burn do risk-engine == burn canônico", be.burnMensal, b);
  eq("cruzado: geração do risk-engine == geração canônica", be.liquidoMensal, g);

  const re = calcularRunway(INPUT.saldoAtual, be);
  eq("cruzado: runway do risk-engine == runway canônico (dias)", re.base, runway(INPUT).valor);

  const risco = scoreRiscoCaixa(INPUT);
  eq("cruzado: runway do score de risco == runway canônico", risco.runway.base, runway(INPUT).valor);
  eq("cruzado: runwayDias do score == runway canônico", risco.runwayDias, runway(INPUT).valor);
  eq("cruzado: burn do score de risco == burn canônico", risco.burn.burnMensal, b);

  const q = analisarQuantitativo(INPUT);
  eq("cruzado: burn do quant == burn canônico", q.indicadores.burnRate, b);
  eq("cruzado: runway do quant (meses) == runway canônico (meses)",
     Math.round(q.indicadores.runwayMeses * 10) / 10, runwayMeses(INPUT).valor);

  // Sem queima o runway é o teto, não zero — zero diria o oposto do que ocorre.
  const gerador: RiskInput = {
    ...INPUT,
    movements: [mv("g1", "entrada", "pago", 50_000, "2026-08-01", "2026-08-01")],
  };
  ok("ritmo: quem gera caixa tem burn 0", burn(gerador).valor === 0);
  ok("ritmo: quem gera caixa tem runway no teto", runway(gerador).valor >= 999);

  // Caixa já negativo E queimando: runway 0, nunca negativo (um runway de −40
  // dias já foi exibido como se fossem 40 dias de folga).
  const quebrado: RiskInput = {
    hoje: HOJE, saldoAtual: -5_000,
    movements: [mv("q1", "saida", "pago", 30_000, "2026-08-01", "2026-08-01")],
  } as RiskInput;
  ok("ritmo: dataset queimando tem burn > 0", burn(quebrado).valor > 0);
  ok("ritmo: caixa negativo tem runway 0", runway(quebrado).valor === 0,
     `runway = ${runway(quebrado).valor}`);
}

/* ========================================================================== */
/* LINHA 7 — MRR / ARR: normalizar o ciclo é a regra inteira.                  */
/* ========================================================================== */
{
  const contratos = [
    { ativo: true, valorCiclo: 1_200, mesesCiclo: 12 }, // anual → 100/mês
    { ativo: true, valorCiclo: 300, mesesCiclo: 1 },    // mensal → 300/mês
    { ativo: true, valorCiclo: 600, mesesCiclo: 3 },    // trimestral → 200/mês
    { ativo: false, valorCiclo: 9_999, mesesCiclo: 1 }, // cancelado → 0
  ];
  eq("mrr: normaliza o ciclo (anual/12, trimestral/3)", mrr(INPUT, contratos).valor, 600);
  eq("mrr: contrato inativo não entra", mrr(INPUT, contratos).valor, 600);
  eq("arr: é MRR × 12, não uma segunda apuração", arr(INPUT, contratos).valor, 7_200);

  // Sem contratos, o número é ESTIMADO — e a procedência tem de dizer isso.
  const est = mrr(INPUT);
  ok("mrr: sem contratos, a procedência marca ESTIMADO", est.procedencia.formula.startsWith("ESTIMADO"));

  // ⚠️ CRUZAMENTO: o painel de assinaturas e o Investor Update têm de dizer o
  // MESMO MRR. Havia QUATRO implementações no sistema, e a do Investor Update
  // usava outra definição inteira (`share recorrente × receita mensal`), então
  // o número que ia para o investidor não era o da tela.
  const assinaturas = [
    { id: "a1", clienteId: "c1", criadoEm: "2026-01-10", status: "ativa" as const, valorFatura: 1_200, mesesCiclo: 12, itens: [] },
    { id: "a2", clienteId: "c2", criadoEm: "2026-02-10", status: "ativa" as const, valorFatura: 300, mesesCiclo: 1, itens: [] },
  ];
  const painel = painelAssinaturas(assinaturas, "2026-08", HOJE);
  eq("cruzado: MRR do painel de assinaturas == MRR canônico", painel.mrr,
     mrr(INPUT, assinaturas.map((a) => ({ ativo: true, valorCiclo: a.valorFatura, mesesCiclo: a.mesesCiclo }))).valor);

  const upd = montarInvestorUpdate(INPUT);
  eq("cruzado: MRR do Investor Update == MRR canônico", upd.raw.mrrEstimado, mrr(INPUT).valor);
  const kpiMrr = upd.kpis.find((k) => k.id === "mrr");
  eq("cruzado: KPI de MRR do relatório == MRR canônico", kpiMrr?.valor ?? -1, mrr(INPUT).valor);
  const kpiArr = upd.kpis.find((k) => k.id === "arr");
  eq("cruzado: KPI de ARR do relatório == ARR canônico", kpiArr?.valor ?? -1, arr(INPUT).valor);
}

/* ========================================================================== */
/* LINHA 8 — INADIMPLÊNCIA: o que venceu, não o que vence hoje.                */
/* ========================================================================== */
{
  const inad = inadimplencia(INPUT).valor;
  // v1 3.300 + v2 1.100 = 4.400. O h1 (7.000) vence HOJE e não está vencido.
  eq("inadimplência: só o vencido (valor fechado)", inad, 4_400);
  ok("inadimplência: título que vence hoje fica fora", inad < 7_000);

  const taxa = inadimplenciaTaxa(INPUT).valor;
  ok("inadimplência: taxa entre 0 e 1", taxa >= 0 && taxa <= 1, `taxa = ${taxa}`);

  // O outro lado (a pagar) usa a MESMA função, só trocando a direção.
  eq("inadimplência: lado a pagar (valor fechado)", inadimplencia(INPUT, undefined, "saida").valor, 2_400);
}

/* ========================================================================== */
/* LINHA 9 — RECEITA TRIBUTÁVEL: nem toda entrada é faturamento.               */
/* ========================================================================== */
{
  const rt = receitaTributavel(INPUT, AGOSTO, "caixa").valor;
  // Das entradas de caixa de agosto (61.400), saem transferência 20.000,
  // rendimento 900 e empréstimo 15.000 → 25.500.
  eq("tributável: exclui transferência, rendimento e empréstimo", rt, 25_500);
  ok("tributável: é menor que o total de entradas", rt < entradas(INPUT, AGOSTO).valor);

  // ⚠️ Âncora `\b`: sem ela "aporte" casa dentro de "transporte" e um frete
  // sairia da base do imposto — o mesmo erro de `iss` dentro de "comissão".
  ok("tributável: 'transporte' NÃO é confundido com 'aporte'", !foraDaBaseTributavel("Transporte de carga"));
  ok("tributável: 'aporte' de sócio fica fora", foraDaBaseTributavel("Aporte de sócio"));
  ok("tributável: 'transferência' fica fora", foraDaBaseTributavel("Transferência entre contas"));
}

/* ========================================================================== */
/* LINHA 10 — JANELA: intervalo impossível não devolve zero mudo.              */
/* ========================================================================== */
{
  // O caso real: "maior que hoje" combinado com "menor que o fim do mês
  // passado". Nenhuma data satisfaz as duas.
  const impossivel = janela("2026-08-16", "2026-07-31", "Filtro combinado");
  ok("janela: intervalo invertido é marcado como vazio", impossivel.vazia);
  ok("janela: intervalo invertido explica o motivo", !!impossivel.motivo && impossivel.motivo.includes("impossível"));

  const r = resultado(INPUT, impossivel);
  eq("janela: indicador de janela impossível devolve 0", r.valor, 0);
  ok("janela: o 0 vem com aviso, não mudo", !!r.procedencia.aviso,
     "um zero sem aviso lê-se 'não há nada' em vez de 'o filtro não existe'");
  ok("janela: janela impossível não conta lançamentos", r.procedencia.lancamentos === 0);

  // Janela válida NÃO carrega aviso — senão o aviso vira ruído permanente.
  ok("janela: janela válida não tem aviso", !resultado(INPUT, AGOSTO).procedencia.aviso);

  // Contagem de dias e a régua de comparação.
  eq("janela: agosto tem 31 dias", diasDe(AGOSTO), 31);
  eq("janela: últimos 30 dias tem 30 dias (as duas pontas contam)", diasDe(janelaUltimosDias(30, HOJE)), 30);
  const ant = janelaAnterior(AGOSTO);
  eq("janela: a anterior tem o mesmo tamanho", diasDe(ant), diasDe(AGOSTO));
  ok("janela: a anterior termina um dia antes do início", ant.ate === "2026-07-31");
}

/* ========================================================================== */
/* LINHA 11 — "MÊS SELECIONADO" ≠ "HOJE".                                      */
/* ========================================================================== */
{
  const marco = janelaMes(2026, 2);
  ok("rótulo: março de 2026 não contém hoje", !contemHoje(marco, HOJE));
  ok("rótulo: agosto de 2026 contém hoje", contemHoje(AGOSTO, HOJE));
  ok("rótulo: a janela de hoje é de um dia só", diasDe(janelaHoje(HOJE)) === 1);
  ok("rótulo: janelaDoMesDe(hoje) == mês corrente", janelaDoMesDe(HOJE).de === AGOSTO.de);

  // Navegar para um mês passado não pode mudar o SALDO DE HOJE (posição), mas
  // tem de mudar o resultado (fluxo). Confundir os dois é o que fazia o card
  // "saldo" parecer errado ao trocar o mês.
  ok("rótulo: saldo de hoje independe do mês navegado",
     saldo(INPUT, janelaHoje(HOJE)).valor === SALDO);
  ok("rótulo: resultado depende do mês navegado",
     resultado(INPUT, marco).valor !== resultado(INPUT, AGOSTO).valor);
  ok("rótulo: saldo do fim de março ≠ saldo de hoje",
     saldo(INPUT, marco).valor !== saldo(INPUT, janelaHoje(HOJE)).valor);
}

/* ========================================================================== */
/* LINHA 12 — RAZÃO × EXTRATO: a conta que faltava.                            */
/* ========================================================================== */
{
  const rec = reconciliarSaldo(INPUT);
  eq("reconciliação: o extrato é a autoridade", rec.extrato, SALDO);
  ok("reconciliação: fecha depois de explicada", rec.fecha,
     `extrato ${rec.extrato} vs derivado ${rec.derivado}`);
  ok("reconciliação: lista as parcelas que explicam a diferença", rec.parcelas.length === 3);
  // A soma das parcelas explicativas tem de cobrir a diferença inteira — uma
  // reconciliação com "resto" não reconciliou nada.
  const previstos = rec.parcelas[0].valor;
  const abertura = rec.parcelas[1].valor;
  eq("reconciliação: derivado + previstos + abertura == extrato",
     rec.derivado + previstos + abertura, rec.extrato);

  // ⚠️ O RAZÃO SÓ POSTA O LIQUIDADO. Postar previstos no caixa é o que fazia o
  // balancete divergir do extrato — o defeito de R$ 420.984,91 × −R$ 31.000,16.
  const entries = lancamentosDeMovimentos(INPUT).map((e) => ({
    id: e.externalKey!, data: e.entryDate, descricao: e.description ?? "", origem: e.source ?? "",
    externalKey: e.externalKey,
    linhas: e.lines.map((l) => ({
      conta: l.accountId, nome: nomeConta(l.accountId), tipo: tipoConta(l.accountId),
      debito: l.debit ?? 0, credito: l.credit ?? 0,
    })),
  }));
  const bal = balancete(entries);
  const caixa = bal.find((c) => c.conta === CAIXA);
  ok("razão: existe conta caixa no balancete", !!caixa);
  const pendentesNoRazao = entries.filter((e) => {
    const m = DATASET.find((d) => `mov:${d.id}` === e.externalKey);
    return m && m.status !== "pago";
  });
  ok("razão: nenhum título pendente vira lançamento de caixa", pendentesNoRazao.length === 0,
     `${pendentesNoRazao.length} pendente(s) postado(s) no razão`);

  // O caixa do razão mede a VARIAÇÃO; somado à abertura, fecha no extrato.
  const variacao = caixa ? saldoPorNatureza(caixa.tipo, caixa.debito, caixa.credito) : 0;
  eq("razão: variação do caixa == soma dos líquidos", variacao,
     DATASET.filter(liquidado).reduce((s, m) => s + assinado(m), 0));
  eq("razão: variação + abertura == extrato", variacao + abertura, SALDO);

  // E o balancete continua fechando (D = C) — a invariante do razão.
  const totD = bal.reduce((s, c) => s + c.debito, 0);
  const totC = bal.reduce((s, c) => s + c.credito, 0);
  eq("razão: débito == crédito", totD, totC);
}

/* ========================================================================== */
/* LINHA 13 — O PAINEL: os dez indicadores saem coerentes de uma execução.     */
/* ========================================================================== */
{
  const p = painelIndicadores(INPUT, AGOSTO, "caixa");
  ok("painel: carrega a versão da camada", p.versao === INDICADORES_VERSION);
  eq("painel: resultado bate com entradas − saídas", p.resultado.valor, p.entradas.valor - p.saidas.valor);

  // A identidade fundamental do caixa: abertura + resultado realizado = saldo
  // no fim. Vale num mês FECHADO (julho), onde não há previsto a projetar; no
  // mês corrente ela só vale até hoje, e cobrar o fim do mês compararia
  // realizado com projetado.
  const julho = janelaMes(2026, 6);
  const pj = painelIndicadores(INPUT, julho, "caixa");
  eq("painel: abertura + resultado == saldo de fechamento (mês fechado)",
     pj.saldoInicial.valor + pj.resultado.valor, saldoEm(INPUT, julho.ate));
  eq("painel: arr == mrr × 12", p.arr.valor, p.mrr.valor * 12);
  ok("painel: toda procedência declara a janela",
     Object.values(p).every((v) => typeof v !== "object" || !v || !("procedencia" in v) ||
       (v as { procedencia: { janela: unknown } }).procedencia.janela === AGOSTO ||
       !!(v as { procedencia: { janela: unknown } }).procedencia.janela));

  // Chamar o painel duas vezes com a mesma entrada dá o mesmo número — puro.
  const p2 = painelIndicadores(INPUT, AGOSTO, "caixa");
  eq("painel: é determinístico", p.resultado.valor, p2.resultado.valor);
}

/* ========================================================================== */
/* LINHA 14 — DADOS DEGENERADOS: nada de NaN, nada de Infinity.                */
/* ========================================================================== */
{
  const casos: [string, RiskInput][] = [
    ["vazio", { hoje: HOJE, saldoAtual: 0, movements: [] } as RiskInput],
    ["só cancelados", { hoje: HOJE, saldoAtual: 100, movements: [mv("c", "entrada", "cancelado", 999, HOJE, HOJE)] } as RiskInput],
    ["saldo negativo", { ...INPUT, saldoAtual: -10_000 }],
    ["tudo pendente", { hoje: HOJE, saldoAtual: 0, movements: DATASET.map((m) => ({ ...m, status: "pendente" as const })) } as RiskInput],
  ];
  for (const [nome, inp] of casos) {
    const p = painelIndicadores(inp, AGOSTO, "caixa");
    for (const [chave, ind] of Object.entries(p)) {
      if (!ind || typeof ind !== "object" || !("valor" in ind)) continue;
      const v = (ind as { valor: number }).valor;
      ok(`degenerado/${nome}: ${chave} é finito`, Number.isFinite(v), `valor = ${v}`);
    }
  }
}


/* ========================================================================== */
/* LINHA 15 — INGESTÃO: reimportar o mesmo extrato não duplica nada.           */
/* ========================================================================== */
{
  const extrato: LinhaBruta[] = [
    { contaId: "c1", data: "2026-08-03", valor: 12_000, tipo: "entrada", descritivo: "PIX RECEBIDO 998877 LOJA ALPHA LTDA", contraparte: "Loja Alpha", origem: "extrato" },
    { contaId: "c1", data: "2026-08-05", valor: 4_200, tipo: "saida", descritivo: "TED ENVIADO FOLHA DE PAGAMENTO", origem: "extrato" },
    { contaId: "c1", data: "2026-08-06", valor: 310.5, tipo: "saida", descritivo: "COMPRA CARTAO POSTO SHELL 042", origem: "extrato" },
  ];

  const p1 = prepararIngestao(extrato);
  eq("ingestão: primeira passada aceita tudo", p1.resumo.novas + p1.resumo.revisar, 3);
  eq("ingestão: nada é duplicata na primeira vez", p1.resumo.duplicatasBase, 0);

  // A base depois de gravar a primeira passada.
  const gravadas: LinhaExistente[] = linhasAGravar(p1).map((l, i) => ({
    id: `m${i}`, chave: l.chave, account_id: l.contaId, paid_date: l.data, due_date: l.data,
    amount: l.valor, type: l.tipo, descritivo_bruto: l.descritivoBruto,
  }));

  // ⚠️ O TESTE CENTRAL DA ONDA: o MESMO arquivo, de novo.
  const p2 = prepararIngestao(extrato, gravadas);
  eq("ingestão: reimportar o mesmo extrato não grava NADA", linhasAGravar(p2).length, 0);
  eq("ingestão: as três viram duplicata da base", p2.resumo.duplicatasBase, 3);

  // ⚠️ O MESMO lançamento em OUTRO formato ("Pix recebido - Alpha" vindo da API
  // × "PIX RECEBIDO 998877 LOJA ALPHA LTDA" vindo do OFX). Nenhuma normalização
  // honesta cola os dois textos sem também colar textos que descrevem coisas
  // diferentes — e um falso positivo aqui DESCARTA dinheiro real, calado.
  // Então a resposta é SUSPEITA, não descarte: conta+data+valor+sinal batem, o
  // descritivo não, e quem decide é a pessoa.
  const outroFormato: LinhaBruta[] = [
    { contaId: "c1", data: "2026-08-03", valor: 12_000, tipo: "entrada", descritivo: "Pix recebido - Alpha", origem: "openfinance" },
  ];
  const pf = prepararIngestao(outroFormato, gravadas);
  eq("ingestão: formato diferente vira SUSPEITA, não duplicata exata", pf.resumo.possiveisDuplicatas, 1);
  eq("ingestão: e não é descartada em silêncio", linhasAGravar(pf).length, 1);
  ok("ingestão: a suspeita aponta o lançamento existente", !!pf.linhas[0].duplicataDe);

  // Duplicata DENTRO do arquivo (linha repetida na planilha) entra uma vez só.
  const comRepetida = [...extrato, extrato[0]];
  const p3 = prepararIngestao(comRepetida);
  eq("ingestão: linha repetida no arquivo entra uma vez", linhasAGravar(p3).length, 3);
  eq("ingestão: a repetição é marcada, não descartada em silêncio", p3.resumo.duplicatasArquivo, 1);

  // ⚠️ O QUE **NÃO** PODE SER DUPLICATA — os falsos positivos que descartariam
  // dinheiro de verdade:
  const legitimas: LinhaBruta[] = [
    // valor igual, dia seguinte
    { contaId: "c1", data: "2026-08-04", valor: 12_000, tipo: "entrada", descritivo: "PIX RECEBIDO 998877 LOJA ALPHA LTDA", origem: "extrato" },
    // mesmo dia e valor, SINAL oposto (um estorno)
    { contaId: "c1", data: "2026-08-03", valor: 12_000, tipo: "saida", descritivo: "PIX RECEBIDO 998877 LOJA ALPHA LTDA", origem: "extrato" },
    // mesmo tudo, OUTRA conta (as duas pernas de uma transferência)
    { contaId: "c2", data: "2026-08-03", valor: 12_000, tipo: "entrada", descritivo: "PIX RECEBIDO 998877 LOJA ALPHA LTDA", origem: "extrato" },
    // um centavo de diferença
    { contaId: "c1", data: "2026-08-03", valor: 12_000.01, tipo: "entrada", descritivo: "PIX RECEBIDO 998877 LOJA ALPHA LTDA", origem: "extrato" },
  ];
  const pl = prepararIngestao(legitimas, gravadas);
  eq("ingestão: nenhuma linha legítima vira duplicata EXATA", pl.resumo.duplicatasBase, 0);
  // E, o que mais importa: todas continuam entrando.
  eq("ingestão: todas as linhas legítimas são gravadas", linhasAGravar(pl).length, 4);
  // Dia diferente, conta diferente e centavo diferente nem suspeita geram — só
  // o estorno (mesmo dia/valor/conta, sinal oposto)… que também não, porque o
  // sinal entra na chave aproximada.
  eq("ingestão: variações de dia/conta/centavo não levantam suspeita", pl.resumo.possiveisDuplicatas, 0);

  // Float não separa o que é igual.
  eq("ingestão: 1234.56 e 1234.5600000001 são a mesma chave", 0,
     chaveIdempotencia({ contaId: "c", data: "2026-08-01", valor: 1234.56, tipo: "saida", descritivo: "X" }) ===
     chaveIdempotencia({ contaId: "c", data: "2026-08-01", valor: 1234.5600000001, tipo: "saida", descritivo: "X" }) ? 0 : 1);

  // O descritivo BRUTO é preservado, não sobrescrito pela normalização.
  const bruto = "PIX RECEBIDO 998877 LOJA ALPHA LTDA";
  ok("ingestão: descritivo bruto preservado intacto",
     p1.linhas[0].descritivoBruto === bruto && p1.linhas[0].descritivoNormalizado !== bruto,
     `bruto="${p1.linhas[0].descritivoBruto}" norm="${p1.linhas[0].descritivoNormalizado}"`);

  // `prepararIngestao` NÃO grava — é um plano. (Se gravasse, chamá-la duas
  // vezes com a mesma base mudaria o resultado da segunda.)
  const a = prepararIngestao(extrato, gravadas);
  const b = prepararIngestao(extrato, gravadas);
  eq("ingestão: preparar é puro (não grava)", a.resumo.duplicatasBase, b.resumo.duplicatasBase);
}

/* ========================================================================== */
/* LINHA 16 — TAXONOMIA ÚNICA: uma porta ou outra, a mesma categoria.          */
/* ========================================================================== */
{
  // O MESMO gasto entrando pelo extrato e pelo OCR de documento.
  const porExtrato = prepararIngestao([
    { contaId: "c1", data: "2026-08-10", valor: 890, tipo: "saida", descritivo: "PAGAMENTO ALUGUEL IMOBILIARIA CENTRO", origem: "extrato" },
  ]);
  const porOcr = prepararIngestao([
    { contaId: "c1", data: "2026-08-10", valor: 890, tipo: "saida", descritivo: "ALUGUEL IMOBILIARIA CENTRO", origem: "ocr" },
  ]);
  ok("taxonomia: extrato e OCR classificam igual",
     porExtrato.linhas[0].classificacao.categoria === porOcr.linhas[0].classificacao.categoria,
     `${porExtrato.linhas[0].classificacao.categoria} ≠ ${porOcr.linhas[0].classificacao.categoria}`);
  ok("taxonomia: a categoria sai da lista única",
     CATEGORIAS_TODAS.some((c) => c.id === porOcr.linhas[0].classificacao.categoria));

  // ⚠️ Categoria de RECEITA não captura uma SAÍDA: "pagamento ao Mercado Pago"
  // é despesa, mesmo casando com o padrão da plataforma de recebimento.
  const saidaPlataforma = prepararIngestao([
    { contaId: "c1", data: "2026-08-10", valor: 100, tipo: "saida", descritivo: "MERCADO PAGO TAXA", origem: "extrato" },
  ]);
  ok("taxonomia: padrão de receita não classifica uma saída",
     saidaPlataforma.linhas[0].classificacao.natureza !== "receita",
     `caiu em ${saidaPlataforma.linhas[0].classificacao.categoria}`);

  // O desconhecido entra marcado para REVISAR, não passa batido como certo.
  const opaco = prepararIngestao([
    { contaId: "c1", data: "2026-08-10", valor: 42, tipo: "saida", descritivo: "DEB AUT 9931 XPTO", origem: "extrato" },
  ]);
  ok("taxonomia: o que não se reconhece cai em 'revisar'", opaco.linhas[0].situacao === "revisar");
  ok("taxonomia: e diz por quê", opaco.linhas[0].classificacao.motivo.includes("confira"));
}

/* ========================================================================== */
/* LINHA 17 — LIMPEZA RETROATIVA: remove as cópias, mantém a primeira.         */
/* ========================================================================== */
{
  const base: LinhaExistente[] = [
    { id: "m001", due_date: "2026-08-03", paid_date: "2026-08-03", amount: 12_000, type: "entrada", account_id: "c1", descritivo_bruto: "PIX LOJA ALPHA" },
    { id: "m002", due_date: "2026-08-03", paid_date: "2026-08-03", amount: 12_000, type: "entrada", account_id: "c1", descritivo_bruto: "PIX LOJA ALPHA" },
    { id: "m003", due_date: "2026-08-03", paid_date: "2026-08-03", amount: 12_000, type: "entrada", account_id: "c1", descritivo_bruto: "PIX LOJA ALPHA" },
    { id: "m004", due_date: "2026-08-05", paid_date: "2026-08-05", amount: 4_200, type: "saida", account_id: "c1", descritivo_bruto: "FOLHA" },
  ];
  const r = planejarLimpeza(base);
  eq("limpeza: encontra as duas cópias", r.remover.length, 2);
  ok("limpeza: MANTÉM a primeira (id estável), não a última",
     r.grupos[0].manter === "m001", `manteria ${r.grupos[0].manter}`);
  ok("limpeza: as removidas são as cópias", r.remover.includes("m002") && r.remover.includes("m003"));
  ok("limpeza: o lançamento único não é tocado", !r.remover.includes("m004"));
  eq("limpeza: mostra o impacto no caixa", r.impactoEntradas, 24_000);
  eq("limpeza: e no resultado", r.impactoResultado, 24_000);

  // Base limpa: nada a remover, e o relatório diz isso sem inventar grupo.
  const limpa = planejarLimpeza(base.slice(0, 1).concat(base[3]));
  eq("limpeza: base sem duplicata não remove nada", limpa.remover.length, 0);
  eq("limpeza: e não lista grupos", limpa.grupos.length, 0);
}


/* ========================================================================== */
/* LINHA 18 — GATING DE PLANO: menu e servidor dizem a MESMA coisa.            */
/* ========================================================================== */
{
  // ⚠️ A guarda central do P0-18. O Modo Pro era uma cortina: os grupos sumiam
  // do menu e as rotas continuavam abrindo. Agora quem tranca é o middleware,
  // e ele lê `ROTAS_PRO`. Se as duas listas divergirem, um recurso some do menu
  // e continua acessível por digitação — a cortina de volta, sem ninguém notar.
  const doMenu = SECTIONS
    .filter((sec) => sec.pro)
    .flatMap((sec) => [sec.href, ...sec.items.map((i) => i.href)])
    .filter((h): h is string => !!h);

  const semGate = doMenu.filter((h) => !exigePro(h));
  ok("planos: toda rota Pro do menu é bloqueada no servidor", semGate.length === 0,
     `sem gate: ${semGate.join(", ")}`);

  // E o inverso: a lista do servidor não pode trancar o que o menu entrega no
  // Simples — bloquear o que a pessoa já tem é o outro lado do mesmo defeito.
  const doSimples = SECTIONS
    .filter((sec) => !sec.pro)
    .flatMap((sec) => [sec.href, ...sec.items.map((i) => i.href)])
    .filter((h): h is string => !!h);
  const trancadoAToa = doSimples.filter((h) => exigePro(h));
  ok("planos: nenhuma rota do Simples é trancada", trancadoAToa.length === 0,
     `trancadas à toa: ${trancadoAToa.join(", ")}`);

  // As rotas LEGADAS que redirecionam para as telas Pro também têm de estar
  // trancadas — senão o redirect é uma porta lateral aberta para a mesma tela.

  // Sub-rotas entram pelo mesmo prefixo.
  ok("planos: sub-rota herda o bloqueio", exigePro("/investidores/qualquer-coisa"));

  // ⚠️ E o caso que a fusão da IA criou: a CONVERSA é Simples (é a porta da
  // frente do produto), os quatro MOTORES são Pro e viraram abas dela.
  // Trancar a rota inteira esconderia o chat de todo mundo.
  ok("planos: a conversa da IA é aberta", !exigePro("/all4pay-ai"));
  for (const motor of ["quant", "decisao", "risco", "autonomo"]) {
    ok(`planos: o motor ${motor} exige Pro`, exigePro(`/all4pay-ai?aba=${motor}`));
  }
  // E os endereços legados dos motores continuam trancados — senão o
  // redirecionamento seria a porta lateral que o gate deveria fechar.
  for (const legada of ["/risco", "/decisao", "/autonomo", "/inteligencia"]) {
    ok(`planos: a rota legada ${legada} continua trancada`, exigePro(legada));
  }

  // ⚠️ A tela de UPGRADE e a de assinatura nunca são bloqueadas: trancá-las
  // deixaria quem não tem o plano sem caminho para comprá-lo.
  ok("planos: /planos nunca é bloqueada", !exigePro("/planos"));
  ok("planos: a tela de assinatura nunca é bloqueada",
     !exigePro("/dashboard/administration/subscription"));

  // O Simples não abre Pro; o Pro abre tudo; demo abre tudo.
  ok("planos: Simples não abre rota Pro", !podeAbrir("/investidores", PLANO_SIMPLES));
  ok("planos: Simples abre rota comum", podeAbrir("/", PLANO_SIMPLES));
  ok("planos: Pro abre rota Pro", podeAbrir("/investidores", { ...PLANO_SIMPLES, plano: "pro" }));
  ok("planos: demonstração abre tudo", podeAbrir("/investidores", PLANO_ABERTO));
}


/* ========================================================================== */
/* LINHA 19 — DUAS TELAS DE "A RECEBER": nomes distintos e leituras declaradas */
/* ========================================================================== */
{
  const ponte = pontePosicaoFluxo(INPUT, AGOSTO, "entrada");

  // As duas leituras são DIFERENTES por construção — e é isso que precisa ficar
  // dito na tela. Um sistema em que elas coincidem por acaso esconde o problema.
  ok("telas: posição e fluxo são leituras distintas",
     ponte.posicao.total !== ponte.fluxo.resultado);

  // A posição fecha: liquidado + aberto + atrasado == total, e conta TODOS os
  // títulos do lado, sem recorte de período.
  eq("telas: estoque fecha (liquidado + aberto + atrasado)",
     ponte.posicao.liquidado + ponte.posicao.aberto + ponte.posicao.atrasado, ponte.posicao.total);
  eq("telas: o estoque conta todos os títulos do lado",
     ponte.posicao.titulos, DATASET.filter((m) => m.type === "entrada" && m.status !== "cancelado").length);

  // O fluxo é o indicador canônico, não uma terceira conta.
  eq("telas: o fluxo da ponte == resultado canônico", ponte.fluxo.resultado, resultado(INPUT, AGOSTO).valor);
  eq("telas: as entradas da ponte == entradas canônicas", ponte.fluxo.entradas, entradas(INPUT, AGOSTO).valor);

  // ⚠️ O fluxo PODE ser negativo (mês em que se pagou mais do que se recebeu) e
  // a posição NUNCA é — somar magnitudes de títulos não produz número negativo.
  // Confundir os dois é o que fazia um usuário achar que "a receber" era −33 mil.
  ok("telas: o estoque nunca é negativo", ponte.posicao.total >= 0);

  // A explicação nomeia as duas leituras — é ela que a interface mostra, e sem
  // ela o usuário não tem como saber qual das telas é a verdade (são as duas).
  ok("telas: a explicação nomeia ESTOQUE e RESULTADO",
     ponte.explicacao.includes("ESTOQUE") && ponte.explicacao.includes("RESULTADO"));
  ok("telas: a explicação diz o período do fluxo", ponte.explicacao.includes(AGOSTO.label));

  // ⚠️ E os NOMES no menu têm de ser distintos. Rótulos quase idênticos apontando
  // para leituras diferentes é o defeito original: mesmo nome, números diferentes.
  const rotulos = SECTIONS
    .flatMap((sec) => sec.items)
    .filter((i) => i.href === "/recebimentos" || i.href?.includes("tab=receivables"))
    .map((i) => i.label);
  ok("telas: as duas entradas de menu têm nomes distintos",
     new Set(rotulos).size === rotulos.length, `rótulos: ${rotulos.join(" | ")}`);
  ok("telas: e nenhum é o genérico 'Contas a receber'",
     !rotulos.includes("Contas a receber"), `rótulos: ${rotulos.join(" | ")}`);
}


/* ========================================================================== */
/* LINHA 20 — PERSISTÊNCIA: dado de negócio não pode morar só no navegador.    */
/* ========================================================================== */
{
  // ⚠️ A guarda do P0-17. 74 chaves de localStorage carregavam entidades de
  // negócio inteiras: quem trocasse de máquina perdia aprovações, orçamento e
  // fechamento; dois usuários da mesma empresa nunca viam o mesmo estado; e a
  // trilha de auditoria ficava em zero porque nada passava pelo servidor.
  //
  // Esta guarda não conserta isso sozinha — ela impede que a lista de
  // classificação se perca de vista enquanto a migração acontece por etapas.

  // Nenhuma chave pode estar nas DUAS listas: ou é dado, ou é preferência.
  const nasDuas = CHAVES_DE_NEGOCIO.filter((c) => PREFERENCIAS_LOCAIS.includes(c));
  ok("persistência: nenhuma chave é dado E preferência", nasDuas.length === 0,
     `ambíguas: ${nasDuas.join(", ")}`);
  const emTres = PRECISAM_DE_TABELA_PROPRIA.filter(
    (c) => CHAVES_DE_NEGOCIO.includes(c) || PREFERENCIAS_LOCAIS.includes(c));
  ok("persistência: 'precisa de tabela própria' não se mistura", emTres.length === 0,
     `ambíguas: ${emTres.join(", ")}`);

  // As chaves de negócio são únicas (um typo duplicaria a sincronização).
  ok("persistência: sem chaves de negócio repetidas",
     new Set(CHAVES_DE_NEGOCIO).size === CHAVES_DE_NEGOCIO.length);

  // ⚠️ As chaves que o CÓDIGO usa têm de estar classificadas. Uma chave nova
  // que ninguém classifica é uma entidade de negócio que volta a morar só no
  // navegador — em silêncio, que é como este defeito nasceu.
  const usadas = chavesUsadasNoCodigo();
  const cacheChaves = CACHES_LOCAIS.map((c) => c.chave);
  const classificadas = new Set([
    ...CHAVES_DE_NEGOCIO, ...PREFERENCIAS_LOCAIS, ...PRECISAM_DE_TABELA_PROPRIA,
    ...cacheChaves,
  ]);
  const orfas = usadas.filter((c) => !classificadas.has(c));
  // ⚠️ TETO ZERO. Toda chave usada no código tem de estar em uma das quatro
  // listas — dado de negócio, preferência do dispositivo, cache que expira, ou
  // "precisa de tabela própria". Uma chave nova sem classificação é uma
  // entidade que voltou a morar só no navegador, e foi assim, em silêncio, que
  // este defeito nasceu.
  ok("persistência: toda chave usada no código está classificada",
     orfas.length === 0,
     `${orfas.length} sem classificação: ${orfas.join(", ")}`);

  // As entidades que a auditoria nomeou explicitamente têm de estar na lista de
  // NEGÓCIO — são justamente as que doem quando se perdem.
  for (const critica of [
    "a4p_aprovacoes", "a4p_orcamentos", "a4p_reembolsos", "a4p_comprovantes",
    "a4p_close_tasks", "a4p_pos_taxas", "a4p_company",
  ]) {
    ok(`persistência: ${critica} é dado de negócio`, CHAVES_DE_NEGOCIO.includes(critica));
  }

  // Tema e largura da barra NÃO são dado de negócio — sincronizá-los faria a
  // preferência de um usuário mudar a tela do outro.
  for (const pref of ["a4p_theme", "a4p_sidebar_width", "a4p_modo"]) {
    ok(`persistência: ${pref} continua local`, PREFERENCIAS_LOCAIS.includes(pref));
  }

  // O cache é a QUARTA lista e não se confunde com as outras três: ele fica no
  // dispositivo (como preferência) mas VENCE (como nenhuma delas).
  const cacheMisturado = cacheChaves.filter(
    (c) => CHAVES_DE_NEGOCIO.includes(c) || PREFERENCIAS_LOCAIS.includes(c)
        || PRECISAM_DE_TABELA_PROPRIA.includes(c));
  ok("persistência: cache não se mistura com as outras listas",
     cacheMisturado.length === 0, `ambíguas: ${cacheMisturado.join(", ")}`);
  ok("persistência: todo cache declara validade",
     CACHES_LOCAIS.every((c) => c.ttlDias > 0 && !!c.origem));

  // ⚠️ Toda chave de negócio tem NOME em português. A trilha de auditoria passou
  // a registrar cada gravação de estado; um evento que diz `a4p_close_tasks`
  // obriga quem audita a decifrar o identificador, e auditoria que só o autor lê
  // não é auditoria.
  const semRotulo = [...CHAVES_DE_NEGOCIO, ...cacheChaves].filter((c) => !ROTULO_DA_CHAVE[c]);
  ok("persistência: toda chave de negócio tem nome legível",
     semRotulo.length === 0, `sem rótulo: ${semRotulo.join(", ")}`);
  ok("persistência: chave desconhecida cai em si mesma, não em vazio",
     rotuloDaChave("a4p_inexistente") === "a4p_inexistente");
}


/* ========================================================================== */
/* LINHA 20b — ONDA 8: o cache VENCE, o backup VOLTA, o disco ENXUGA.         */
/* ========================================================================== */
{
  // Estas três funções só agem no navegador. O `localStorage` de mentira abaixo
  // é o que permite prová-las aqui — sem ele elas devolveriam zero e a guarda
  // passaria sem ter testado nada, que é o pior resultado possível.
  const memoriaFalsa = new Map<string, string>();
  const armazem = {
    getItem: (k: string) => memoriaFalsa.get(k) ?? null,
    setItem: (k: string, v: string) => { memoriaFalsa.set(k, v); },
    removeItem: (k: string) => { memoriaFalsa.delete(k); },
    key: (i: number) => Array.from(memoriaFalsa.keys())[i] ?? null,
    clear: () => memoriaFalsa.clear(),
    get length() { return memoriaFalsa.size; },
  };
  const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
  const janelaAntes = g.window, armazemAntes = g.localStorage;
  g.window = g;
  g.localStorage = armazem;

  try {
    const DIA = 24 * 3600 * 1000;
    const agora = 1_700_000_000_000;

    /* --- 1. IGNORAR NÃO É EXPIRAR ------------------------------------------ */
    // ⚠️ O defeito real: os dois caches JÁ tinham validade, e a leitura já
    // ignorava a entrada velha — o que dá a resposta certa e mesmo assim deixa
    // o byte no disco para sempre. Um extrato com 300 fornecedores deixava 300
    // entradas eternas na cota de 5 MB.
    armazem.setItem("a4p_cnpj_cache", JSON.stringify({
      novo: { t: agora - 10 * DIA, d: { nome: "Alfa" } },   // dentro dos 60 dias
      velho: { t: agora - 90 * DIA, d: { nome: "Beta" } },  // vencido
      semCarimbo: { d: { nome: "Gama" } },                  // sem data: some
    }));
    armazem.setItem("a4p_municipios", JSON.stringify({
      SP: { t: agora - 5 * DIA, m: ["São Paulo"] },
    }));

    const expurgo = expurgarCaches(agora);
    const cnpjDepois = JSON.parse(armazem.getItem("a4p_cnpj_cache") ?? "{}") as Record<string, unknown>;
    ok("onda8: o expurgo REMOVE a entrada vencida", expurgo.removidas === 2,
       `removidas: ${expurgo.removidas}`);
    ok("onda8: o expurgo PRESERVA a entrada que ainda vale",
       "novo" in cnpjDepois && !("velho" in cnpjDepois) && !("semCarimbo" in cnpjDepois),
       `restou: ${Object.keys(cnpjDepois).join(", ")}`);
    // ⚠️ Expurgar por ENTRADA, não a chave inteira: jogar tudo fora faria a
    // próxima importação reconsultar centenas de CNPJs que continuavam bons.
    ok("onda8: o cache dentro da validade não é jogado fora inteiro",
       JSON.parse(armazem.getItem("a4p_municipios") ?? "{}").SP != null);
    ok("onda8: o expurgo devolve bytes liberados", expurgo.bytesLiberados > 0);
    // Rodar de novo não pode remover nada — o expurgo roda a cada sessão.
    ok("onda8: expurgar duas vezes é idempotente", expurgarCaches(agora).removidas === 0);

    /* --- 2. O BACKUP VOLTA -------------------------------------------------- */
    armazem.setItem("a4p_orcamentos", JSON.stringify([{ id: "o1", nome: "2026" }]));
    armazem.setItem("a4p_theme", JSON.stringify("dark"));
    const b = exportarEstado();
    ok("onda8: o backup se identifica", backupValido(b));
    ok("onda8: o backup leva o dado de negócio", "a4p_orcamentos" in b.chaves);
    // ⚠️ Preferência FICA DE FORA de propósito: restaurar tema e largura de menu
    // sobrescreveria os ajustes da máquina onde a restauração acontece.
    ok("onda8: o backup NÃO leva preferência de tela", !("a4p_theme" in b.chaves));

    // ⚠️ Um arquivo adulterado não pode virar caminho para escrever qualquer
    // coisa no estado da organização: chave fora da lista é RECUSADA.
    const adulterado = {
      ...b,
      chaves: { ...b.chaves, a4p_theme: "light", a4p_invasor: { x: 1 } },
    };
    const r = await importarEstado(adulterado);
    ok("onda8: a restauração recusa o que não é dado de negócio",
       r.recusadas.includes("a4p_theme") && r.recusadas.includes("a4p_invasor"),
       `recusadas: ${r.recusadas.join(", ")}`);
    ok("onda8: a restauração não grava a chave recusada",
       armazem.getItem("a4p_invasor") === null);
    // ⚠️ O tempo é MEDIDO. "Dá para restaurar" sem tempo de recuperação é
    // palavra; a tela mostra o número que sai daqui.
    ok("onda8: a restauração mede o tempo de recuperação", typeof r.ms === "number" && r.ms >= 0);
    ok("onda8: a restauração devolve o que entrou", r.restauradas === Object.keys(b.chaves).length,
       `${r.restauradas} de ${Object.keys(b.chaves).length}`);

    const naoBackup = [{ formato: "outra-coisa" }, { formato: "all4pay/estado-da-organizacao", versao: 9 }, null, "texto"];
    ok("onda8: arquivo que não é backup é recusado", naoBackup.every((x) => !backupValido(x)));

    /* --- 3. ENXUGAR NÃO PODE APAGAR O QUE SÓ EXISTE AQUI -------------------- */
    // ⚠️ A trava do `enxugarLocal`: sem servidor (ou sem confirmação dele) ele
    // não remove NADA. Apagar antes disso trocaria "o dado só existe no
    // navegador" por "o dado não existe em lugar nenhum".
    const enxugo = enxugarLocal();
    ok("onda8: sem servidor, enxugar não remove nada", enxugo.removidas === 0);
    ok("onda8: o dado de negócio continua no disco depois de enxugar",
       armazem.getItem("a4p_orcamentos") !== null);
  } finally {
    g.window = janelaAntes;
    g.localStorage = armazemAntes;
  }
}


/* ========================================================================== */
/* LINHA 20c — ONDA 9: isolamento, papéis e teto de linhas.                   */
/* ========================================================================== */
{
  /* ---- O teto de linhas: TETO ZERO de consultas sem limite --------------- */
  // ⚠️ A política de acesso por linha garante DE QUEM são as linhas, não
  // QUANTAS. Uma empresa com cinco anos de extrato pedia tudo de uma vez: a
  // tela congelava e o socorro do usuário — recarregar — refazia a consulta.
  // Eram 60 consultas sem teto de 105.
  const semTeto = consultasSemTeto();
  ok("onda9: nenhuma consulta sem teto de linhas", semTeto.length === 0,
     `${semTeto.length} sem limite: ${semTeto.slice(0, 5).join(", ")}`);

  /* ---- O teste de isolamento --------------------------------------------- */
  const limpo = [
    { tabela: "movements", linhasDeOutraOrg: 0, visiveis: 554 },
    { tabela: "parties", linhasDeOutraOrg: 0, visiveis: 20 },
  ];
  ok("onda9: sem vazamento, o isolamento passa", resumoIsolamento(limpo).ok);
  // ⚠️ UMA linha da empresa errada já reprova. Não existe vazamento aceitável
  // entre empresas num produto financeiro.
  const vazando = [...limpo, { tabela: "budgets", linhasDeOutraOrg: 1, visiveis: 3 }];
  const rv = resumoIsolamento(vazando);
  ok("onda9: uma única linha de outra empresa REPROVA", !rv.ok && rv.vazamentos === 1);
  ok("onda9: e a tabela é nomeada", rv.tabelasVazando.includes("budgets"));
  // ⚠️ Não ter testado nada NÃO é aprovação: zero tabelas conferidas reprova,
  // senão uma consulta que falhou em silêncio passaria como "tudo certo".
  ok("onda9: nenhuma tabela conferida não é aprovação", !resumoIsolamento([]).ok);

  /* ---- A auditoria da política ------------------------------------------- */
  const base = {
    rlsLigada: true, politicas: 1, temOrgId: true, politicaPorOrg: true,
    alcancaAnonimo: false, anonPodeTruncar: false,
  };
  // ⚠️ O achado que a ONDA 9 encontrou medindo, não deduzindo: `anon` podia
  // TRUNCATE em 57 de 59 tabelas, e TRUNCATE não passa por política de linha.
  const truncar = achadosDaAuditoria([{ tabela: "movements", ...base, anonPodeTruncar: true }]);
  ok("onda9: 'anônimo pode esvaziar a tabela' é crítico",
     truncar[0]?.gravidade === "critico" && truncar[0].problema.includes("esvaziar"));
  ok("onda9: e o porquê cita que a política não alcança",
     truncar[0]?.porque.includes("TRUNCATE"));
  ok("onda9: RLS desligada é crítico",
     achadosDaAuditoria([{ tabela: "x", ...base, rlsLigada: false }])[0]?.gravidade === "critico");
  // ⚠️ RLS ligada SEM política é o desenho correto das tabelas que só as
  // funções `SECURITY DEFINER` acessam — acusar isso seria gritar lobo.
  ok("onda9: RLS ligada sem política NÃO é achado",
     achadosDaAuditoria([{ tabela: "platform_admins", ...base, politicas: 0, temOrgId: false, politicaPorOrg: false }]).length === 0);
  ok("onda9: coluna de empresa sem política por empresa é alto",
     achadosDaAuditoria([{ tabela: "y", ...base, politicaPorOrg: false }])[0]?.gravidade === "alto");
  ok("onda9: a lista sai do mais grave para o menos",
     achadosDaAuditoria([
       { tabela: "b", ...base, alcancaAnonimo: true },
       { tabela: "a", ...base, rlsLigada: false },
     ])[0].gravidade === "critico");

  /* ---- Segregação de funções --------------------------------------------- */
  const pedido = { id: "s1", solicitanteId: "ana", valor: 5000 };
  const TUDO = ["ler", "lancar", "aprovar"];
  // ⚠️ A MESMA regra que o gatilho `approvals_segregacao` aplica no banco: a
  // tela precisa saber explicar antes do clique o que o banco recusaria depois.
  ok("onda9: quem solicita não aprova a própria solicitação",
     motivoParaNaoAprovar(pedido, "ana", TUDO) === "propria-solicitacao");
  ok("onda9: outra pessoa com o papel aprova",
     podeAprovar(pedido, "bruno", TUDO));
  ok("onda9: sem o papel não aprova nem a dos outros",
     motivoParaNaoAprovar(pedido, "bruno", ["ler", "lancar"]) === "sem-papel");
  // A ordem importa: quem não tem o papel não aprova NADA, então essa é a
  // primeira pergunta — dizer "é a sua própria" a quem nem podia aprovar
  // mandaria a pessoa procurar outro aprovador para um problema que é dela.
  ok("onda9: a falta de papel vem antes da segregação",
     motivoParaNaoAprovar(pedido, "ana", ["ler"]) === "sem-papel");
  ok("onda9: toda recusa tem frase para o usuário",
     !!FRASE_RECUSA["sem-papel"] && !!FRASE_RECUSA["propria-solicitacao"]);

  /* ---- Papéis: vocabulário coerente -------------------------------------- */
  const papeis = PAPEIS.map((p) => p.id);
  ok("onda9: todo papel tem linha na matriz de referência",
     papeis.every((p) => Array.isArray(MATRIZ_DEMO[p])));
  ok("onda9: todo papel lê", papeis.every((p) => MATRIZ_DEMO[p].includes("ler")));
  // ⚠️ `member` é legado e vale como `lancador`: reinterpretá-lo como algo mais
  // poderoso daria poder de aprovação, de uma vez, a todo mundo que já é membro.
  ok("onda9: o papel legado equivale ao lançador",
     JSON.stringify(MATRIZ_DEMO.member) === JSON.stringify(MATRIZ_DEMO.lancador));
  ok("onda9: o leitor não escreve e não exporta",
     !MATRIZ_DEMO.leitor.includes("lancar") && !MATRIZ_DEMO.leitor.includes("exportar"));
  ok("onda9: o lançador não aprova e não fecha",
     !MATRIZ_DEMO.lancador.includes("aprovar") && !MATRIZ_DEMO.lancador.includes("fechar"));
  ok("onda9: só a titularidade mexe em cobrança",
     papeis.filter((p) => MATRIZ_DEMO[p].includes("cobranca")).join() === "owner");
  ok("onda9: toda ação da matriz existe no vocabulário",
     papeis.every((p) => MATRIZ_DEMO[p].every((a) => ACOES.some((x) => x.id === a))));

  /* ---- Revisão do acesso administrativo ---------------------------------- */
  const adminBase = {
    userId: "u1", email: "dono@empresa.com", motivo: "sócio fundador",
    expiraEm: "2027-01-01", revisadoEm: "2026-07-01", exigeMfa: true, fatoresMfa: 1,
    mfaPrazo: null, acessos30d: 4, negados30d: 0, ultimoAcesso: "2026-08-01", pendente: false,
  };
  ok("onda9: administrador em dia não gera pendência",
     pendenciasDeAdmin([adminBase], "2026-08-04").length === 0);
  // ⚠️ "Sem segundo fator" alerta MESMO dentro do prazo: o prazo evita tirar o
  // acesso hoje, não torna a situação aceitável.
  const semMfa = pendenciasDeAdmin([{ ...adminBase, fatoresMfa: 0, mfaPrazo: "2026-09-03" }], "2026-08-04");
  ok("onda9: sem segundo fator alerta antes do prazo vencer",
     semMfa.some((p) => p.gravidade === "alto" && p.problema.includes("segundo fator")));
  ok("onda9: com o prazo vencido vira crítico",
     pendenciasDeAdmin([{ ...adminBase, fatoresMfa: 0, mfaPrazo: "2026-01-01" }], "2026-08-04")
       .some((p) => p.gravidade === "critico"));
  ok("onda9: acesso vencido e ainda na lista é crítico",
     pendenciasDeAdmin([{ ...adminBase, expiraEm: "2026-01-01" }], "2026-08-04")
       .some((p) => p.gravidade === "critico" && p.problema.includes("vencido")));
  ok("onda9: tentativas negadas viram pendência",
     pendenciasDeAdmin([{ ...adminBase, negados30d: 3 }], "2026-08-04")
       .some((p) => p.problema.includes("negadas")));
  ok("onda9: nunca revisado é pendência",
     pendenciasDeAdmin([{ ...adminBase, revisadoEm: null }], "2026-08-04")
       .some((p) => p.problema === "nunca revisado"));
}


/* ========================================================================== */
/* LINHA 20d — ONDA 10: fato × modelo, erro com dono, intervalo invertido.    */
/* ========================================================================== */
{
  /* ---- A natureza de cada indicador --------------------------------------- */
  // ⚠️ A separação existia só como TEXTO ("ESTIMADO — …" grudado na fórmula).
  // Uma frase não deixa a tela marcar nada nem o gerador de planilha recusar
  // nada, e por isso uma projeção de caixa e um saldo de extrato saíam do
  // sistema com a mesma cara.
  ok("onda10: saldo de hoje é FATO", saldo(INPUT, janelaHoje(HOJE)).procedencia.natureza === "fato");
  const futuro = janela(HOJE, "2026-12-31");
  ok("onda10: saldo em data futura é PROJEÇÃO",
     saldo(INPUT, futuro).procedencia.natureza === "projecao",
     saldo(INPUT, futuro).procedencia.natureza);
  // Caixa só conta liquidado — logo é fato. Competência conta o previsto.
  ok("onda10: entradas por caixa são FATO", entradas(INPUT, AGOSTO).procedencia.natureza === "fato");
  ok("onda10: entradas por competência com pendente são PROJEÇÃO",
     entradas(INPUT, AGOSTO, "competencia").procedencia.natureza === "projecao");
  ok("onda10: burn é ESTIMATIVA (é média, não contagem)",
     burn(INPUT).procedencia.natureza === "estimativa");
  ok("onda10: runway é PROJEÇÃO", runway(INPUT).procedencia.natureza === "projecao");
  ok("onda10: runway em meses continua PROJEÇÃO",
     runwayMeses(INPUT).procedencia.natureza === "projecao");
  ok("onda10: MRR com contrato é FATO",
     mrr(INPUT, [{ ativo: true, valorCiclo: 300, mesesCiclo: 1 }]).procedencia.natureza === "fato");
  ok("onda10: MRR sem contrato é ESTIMATIVA", mrr(INPUT).procedencia.natureza === "estimativa");
  // ⚠️ ARR é projeção MESMO saindo de contrato: multiplicar por 12 supõe que a
  // base de hoje se repete o ano inteiro, e é essa suposição que o investidor
  // precisa enxergar como suposição.
  ok("onda10: ARR é PROJEÇÃO mesmo com contrato",
     arr(INPUT, [{ ativo: true, valorCiclo: 300, mesesCiclo: 1 }]).procedencia.natureza === "projecao");
  // Vencido é fato: o título existe e a data passou. Não é previsão de calote.
  ok("onda10: inadimplência é FATO", inadimplencia(INPUT).procedencia.natureza === "fato");

  // Todo indicador do painel declara natureza — `versao`, `janela` e `regime`
  // são metadados do painel, não indicadores, e por isso ficam de fora.
  const doPainel = Object.values(painelIndicadores(INPUT, AGOSTO))
    .filter((i): i is { valor: number; procedencia: { natureza: string } } =>
      !!i && typeof i === "object" && "procedencia" in i);
  ok("onda10: o painel declara natureza em TODOS os indicadores",
     doPainel.length >= 10 && doPainel.every((i) => !!i.procedencia.natureza),
     `${doPainel.length} indicadores`);

  /* ---- O portão do artefato externo --------------------------------------- */
  const pFato = saldo(INPUT, janelaHoje(HOJE)).procedencia;
  const pProj = runway(INPUT).procedencia;
  const soFato = avaliarExportacao([{ rotulo: "Saldo", procedencia: pFato }], "xlsx");
  ok("onda10: só fato exporta sem nota", soFato.pode && soFato.nota === null);
  const comProj = avaliarExportacao(
    [{ rotulo: "Saldo", procedencia: pFato }, { rotulo: "Runway", procedencia: pProj }], "xlsx");
  ok("onda10: projeção exporta MARCADA, não bloqueada", comProj.pode);
  // ⚠️ A nota NOMEIA o item. "Alguns valores são projeções" transfere para o
  // leitor o trabalho de adivinhar quais — e ninguém faz esse trabalho.
  ok("onda10: a nota do arquivo nomeia o item projetado",
     comProj.pode && (comProj.nota ?? "").includes("Runway"),
     comProj.pode ? String(comProj.nota) : "bloqueado");
  ok("onda10: o rótulo exportado carrega o sufixo",
     rotuloExportado({ rotulo: "Runway", procedencia: pProj }) === "Runway (projeção)");
  ok("onda10: fato não ganha sufixo",
     rotuloExportado({ rotulo: "Saldo", procedencia: pFato }) === "Saldo");
  // Indicador inválido (janela impossível) NÃO sai: exportar o zero dele cria
  // um documento afirmando que não houve receita.
  const invalido = entradas(INPUT, janela("2026-09-30", "2026-09-01")).procedencia;
  ok("onda10: indicador com aviso NÃO vira arquivo",
     !avaliarExportacao([{ rotulo: "Receita", procedencia: invalido }], "xlsx").pode);

  /* ---- Intervalo invertido, recusado na ENTRADA --------------------------- */
  ok("onda10: intervalo invertido é recusado com frase",
     (problemaDoIntervalo("2026-08-31", "2026-08-01") ?? "").includes("invertido"));
  ok("onda10: intervalo válido passa", problemaDoIntervalo("2026-08-01", "2026-08-31") === null);
  ok("onda10: mesmo dia é válido", problemaDoIntervalo("2026-08-01", "2026-08-01") === null);
  // Rascunho (metade preenchida) não é erro — recusar aqui faria a mensagem
  // piscar enquanto a pessoa ainda está digitando.
  ok("onda10: metade preenchida não acusa", problemaDoIntervalo("2026-08-01", "") === null);
  // ⚠️ Data futura NÃO é recusada: pedir o previsto é legítimo, e quem marca
  // isso é a natureza do indicador.
  ok("onda10: intervalo no futuro é permitido",
     problemaDoIntervalo("2027-01-01", "2027-12-31") === null);

  /* ---- Falhas com dono ---------------------------------------------------- */
  const agora = "2026-08-15T10:00:00.000Z";
  const f400 = montarFalha({
    origem: "movimentos.embedProjeto",
    erro: { code: "PGRST200", message: "could not find a relationship" },
    impacto: "relatórios sem a dimensão de projeto", degradado: true, quando: agora,
  });
  ok("onda10: a falha do embed de projeto tem dono", f400.dono === "financeiro", f400.dono);
  ok("onda10: 400 do PostgREST é falha de DADOS", f400.categoria === "dados");
  // ⚠️ Degradado AGRAVA: é o erro que o usuário não vê, logo o que ninguém
  // reporta — precisa gritar mais alto para quem mantém, não menos.
  ok("onda10: falha degradada continua sendo alta", f400.gravidade === "alto");
  const rede = montarFalha({
    origem: "ia.responder", erro: Object.assign(new TypeError("Failed to fetch"), {}),
    impacto: "o assistente não responde", quando: agora,
  });
  ok("onda10: falha sem resposta do servidor é de REDE", rede.categoria === "rede", rede.categoria);
  ok("onda10: cada módulo conhecido tem dono declarado",
     ["movimentos", "dre", "importacao", "ia", "vendas", "admin"].every((m) => !!DONO_POR_MODULO[m]));
  // Deduplicado por origem: vinte falhas da mesma consulta são UM problema, e
  // listar as vinte esconde os outros que estão embaixo.
  const muitas = [f400, { ...f400 }, { ...f400 }, rede];
  ok("onda10: o alerta deduplica por origem", paraAlertar(muitas).length === 2,
     `${paraAlertar(muitas).length}`);

  /* ---- Nenhum indicador recalculado dentro de componente ------------------ */
  // ⚠️ A causa estrutural da divergência: cada tela somava os lançamentos do
  // seu jeito. A camada canônica só resolve se ninguém puder contorná-la.
  const recalculos = indicadoresRecalculadosEmTela();
  ok("onda10: nenhuma tela soma lançamentos por conta própria",
     recalculos.length === 0,
     `${recalculos.length}: ${recalculos.slice(0, 6).join(" · ")}`);
}


/* ========================================================================== */
/* LINHA 20e — ONDA 11: uma língua, uma voz, um formato.                      */
/* ========================================================================== */
{
  /* ---- O glossário existe e decide ---------------------------------------- */
  ok("onda11: o glossário publica o que cada palavra significa",
     glossarioPublicado().length >= 8 && glossarioPublicado().every((t) => !!t.significa));
  ok("onda11: toda decisão do glossário tem justificativa",
     TERMOS.every((t) => t.porque.length > 30));
  // ⚠️ Uma palavra não pode ser a canônica de um termo e a proibida de outro:
  // seria uma regra que se contradiz, e regra contraditória não se aplica.
  const canonicas = new Set(TERMOS.map((t) => t.termo.toLowerCase()));
  const conflito = TERMOS.flatMap((t) => t.evitar).filter((e) => canonicas.has(e.toLowerCase()));
  ok("onda11: nenhuma palavra é canônica e proibida ao mesmo tempo",
     conflito.length === 0, conflito.join(", "));

  ok("onda11: 'recebíveis' cede lugar a 'a receber'",
     termosProibidosEm("Total de recebíveis em aberto")[0]?.use === "a receber");
  ok("onda11: 'tesouraria' cede lugar a 'movimentações'",
     termosProibidosEm("Painel de Tesouraria")[0]?.use === "movimentações");
  // ⚠️ A exceção existe para a guarda não virar ruído: "antecipação de
  // recebíveis" é o nome do produto financeiro, não jargão evitável. Uma guarda
  // que acusa o nome certo é desligada na primeira semana.
  ok("onda11: a exceção declarada não é acusada",
     termosProibidosEm("Simulador de antecipação de recebíveis").length === 0);
  ok("onda11: texto limpo não acusa nada",
     termosProibidosEm("Contas a receber vencidas neste mês").length === 0);

  /* ---- Nenhum texto em inglês para o usuário ------------------------------ */
  // ⚠️ A 404 era a página padrão do framework: "This page could not be found",
  // em inglês, sem marca e sem caminho de volta. Ela é a tela que mais aparece
  // para quem clicou num link velho.
  ok("onda11: existe página 404 própria", existe("src/app/not-found.tsx"));
  ok("onda11: existe tela de erro própria", existe("src/app/error.tsx"));
  const t404 = ler("src/app/not-found.tsx");
  ok("onda11: a 404 fala português", /não existe|não encontrada/i.test(t404));
  ok("onda11: a 404 leva de volta", t404.includes('href="/"'));
  ok("onda11: a 404 assina a marca", t404.includes("MARCA"));
  // A tela de erro REGISTRA — senão a falha de render morre no navegador da
  // pessoa, que é a mesma família de defeito da ONDA 10.
  ok("onda11: a tela de erro reporta a falha", ler("src/app/error.tsx").includes("reportar("));

  const emIngles = textoDeInterfaceEmIngles();
  ok("onda11: nenhum texto de interface em inglês", emIngles.length === 0,
     `${emIngles.length}: ${emIngles.slice(0, 5).join(" · ")}`);

  /* ---- Uma grafia da marca ------------------------------------------------ */
  ok("onda11: a marca canônica é minúscula", MARCA === "all4pay");
  // O assistente tem nome próprio — a única variação sancionada.
  ok("onda11: o assistente é a exceção declarada", MARCA_IA === "All 4 Pay AI");
  const grafias = grafiasDaMarcaEmTela();
  ok("onda11: nenhuma grafia da marca fora do padrão", grafias.length === 0,
     `${grafias.length}: ${grafias.slice(0, 4).join(" · ")}`);

  /* ---- Um formato por grandeza -------------------------------------------- */
  ok("onda11: percentual com uma casa e vírgula", pctDeInteiro(12.44) === "12,4%");
  ok("onda11: percentual a partir de fração", pct(0.1244) === "12,4%");
  // ⚠️ Não-número vira travessão, não "NaN%". "NaN" na tela de um financeiro é
  // pior que um espaço vazio: parece um valor.
  ok("onda11: valor impossível não vira NaN na tela", pct(Number.NaN) === "—");
  ok("onda11: data é fatiada da string, não convertida", dataBR("2026-08-01") === "01/08/2026");
  // Este é o teste do fuso: `new Date("2026-08-01")` em UTC−3 cairia em 31/07.
  ok("onda11: o dia 1º continua sendo dia 1º", dataBR("2026-08-01").startsWith("01/"));
  ok("onda11: data inválida vira travessão", dataBR("") === "—");
  ok("onda11: o sinal de menos é o do numeral, não o hífen", MENOS === "−");
  ok("onda11: negativo recebe o sinal certo", comSinal(-5, "R$ 5,00") === "−R$ 5,00");
  ok("onda11: positivo não recebe sinal", comSinal(5, "R$ 5,00") === "R$ 5,00");
  const casas = casasDecimaisDePercentualEmTela();
  ok("onda11: percentual não tem três precisões diferentes na tela",
     casas.length === 0, `${casas.length}: ${casas.slice(0, 5).join(" · ")}`);

  /* ---- A voz: não afirmar o que é estimativa ------------------------------ */
  // ⚠️ O assistente dizia "O runway é de 4 meses". Não é — SERIA, se o ritmo
  // dos últimos 90 dias continuasse. A frase assertiva é a que vira decisão,
  // porque quem lê "é" não confere a base.
  ok("onda11: o fato afirma", VOZ.fato.prefixo === "");
  ok("onda11: a projeção condiciona", VOZ.projecao.prefixo.includes("ritmo atual"));
  ok("onda11: a estimativa declara que é média", VOZ.estimativa.prefixo.includes("média"));
  const frase = comVoz("projecao", "O runway seria de cerca de 4 meses.");
  ok("onda11: a voz prefixa sem emendar maiúscula", frase === "No ritmo atual, o runway seria de cerca de 4 meses.", frase);
  ok("onda11: o fato não ganha prefixo",
     comVoz("fato", "O saldo é de R$ 10,00.") === "O saldo é de R$ 10,00.");
  // ⚠️ E a suavização não pode custar a palavra que a pessoa perguntou: o
  // primeiro rascunho tirou "runway" da resposta sobre runway, e a guarda do
  // corpus pegou.
  ok("onda11: a resposta de runway continua dizendo 'runway'",
     ler("src/core/assistant/engine.ts").includes("O runway seria de cerca de"));

  /* ---- Toda métrica declara origem e período ------------------------------ */
  const p = resultado(INPUT, AGOSTO).procedencia;
  const origem = textoDeOrigem(p);
  ok("onda11: a origem declara o período", origem.includes(AGOSTO.label));
  ok("onda11: a origem declara o regime", /caixa|competência|posição/.test(origem));
  ok("onda11: a origem declara de quantos lançamentos saiu", /\d+ lançamento/.test(origem));
}



/* ========================================================================== */
/* LINHA 20f — ONDA 13: prontidão contábil e fiscal.                          */
/* ========================================================================== */
{
  /* ---- Regime tributário: UMA configuração -------------------------------- */
  // ⚠️ O regime estava em campos diferentes conforme a tela que salvou:
  // `regimeTributario` (cadastro) e `regime` (edição rápida). A mesma empresa
  // aparecia como Simples numa tela e Presumido na outra — divergência de
  // CADASTRO, que é pior que a de cálculo: não há fórmula errada para consertar.
  ok("onda13: o regime sai de uma função só, das duas chaves",
     regimeDaEmpresa({ regimeTributario: "Simples Nacional" }) === "simples"
     && regimeDaEmpresa({ regime: "Lucro Real" }) === "real");
  // A precedência é declarada: o cadastro jurídico vence a edição rápida.
  ok("onda13: o cadastro vence a edição rápida",
     regimeDaEmpresa({ regimeTributario: "simples", regime: "presumido" }) === "simples");
  ok("onda13: sem nada, cai no padrão", regimeDaEmpresa({}) === "presumido");
  ok("onda13: texto desconhecido não vira regime inventado",
     regimeDaEmpresa({ regime: "qualquer coisa" }) === "presumido");
  // ⚠️ Resolver em silêncio conserta o número e ESCONDE o defeito de cadastro:
  // alguém preencheu dois campos com respostas diferentes, e só a empresa sabe
  // qual está certa.
  ok("onda13: o conflito entre as duas chaves é DENUNCIADO",
     regimeEmConflito({ regimeTributario: "simples", regime: "presumido" }).conflito);
  ok("onda13: sem conflito, não acusa",
     !regimeEmConflito({ regimeTributario: "simples", regime: "Simples Nacional" }).conflito);

  /* ---- A base do imposto -------------------------------------------------- */
  // ⚠️ A tela de impostos somava TODA entrada — transferência entre contas
  // próprias, resgate, empréstimo e rendimento entravam na base, e o sistema
  // provisionava tributo sobre dinheiro que a empresa moveu de um bolso ao
  // outro. `receitaTributavel` (canônico) é a base das DUAS telas agora.
  const entradasAgosto = entradas(INPUT, AGOSTO, "competencia").valor;
  const tributavel = receitaTributavel(INPUT, AGOSTO, "competencia").valor;
  ok("onda13: a base tributável é MENOR que todas as entradas",
     tributavel < entradasAgosto, `${tributavel} vs ${entradasAgosto}`);
  ok("onda13: a diferença é exatamente o que não é faturamento",
     cent(entradasAgosto - tributavel) === cent(20_000 + 900 + 15_000),
     `${(entradasAgosto - tributavel).toFixed(2)}`);
  // O perfil sai do regime, não de alíquotas cravadas no arquivo.
  ok("onda13: cada regime tem perfil próprio",
     perfilTributario("presumido").cargaTotal !== perfilTributario("real").cargaTotal);
  // ⚠️ Simples e MEI declaram que NÃO têm tabela fixa em vez de fingir um
  // percentual que não existe.
  ok("onda13: Simples e MEI não fingem tabela fixa",
     perfilTributario("simples").tributos === null && perfilTributario("mei").tributos === null);

  /* ---- Eliminações entre empresas ----------------------------------------- */
  // ⚠️ Somar duas empresas do grupo conta duas vezes o dinheiro que só andou
  // entre elas: o grupo aparece maior do que é, e é esse número que vai ao banco.
  const mkEmpresa = (id: string, nome: string, movs: RiskMovement[], nomes: Record<string, string>) =>
    ({ id, nome, input: { hoje: HOJE, saldoAtual: 0, movements: movs, partyNames: nomes } as RiskInput });
  const holding = mkEmpresa("h", "Holding Alfa",
    [mv("ic1", "entrada", "pago", 10_000, "2026-08-10", "2026-08-10", "Serviços", "p-op")],
    { "p-op": "Operadora Beta" });
  const operadora = mkEmpresa("o", "Operadora Beta",
    [mv("ic2", "saida", "pago", 10_000, "2026-08-12", "2026-08-12", "Serviços", "p-ho"),
     mv("ext", "entrada", "pago", 50_000, "2026-08-05", "2026-08-05", "Vendas", "p-cli")],
    { "p-ho": "Holding Alfa", "p-cli": "Cliente de fora" });

  const elim = eliminacoesIntercompany([holding, operadora]);
  ok("onda13: o par entre empresas do grupo é eliminado", elim.length === 1, `${elim.length}`);
  ok("onda13: e o valor eliminado é o do par", elim[0] && cent(elim[0].valor) === cent(10_000));
  // ⚠️ A venda para TERCEIRO não pode ser eliminada — apagar receita real é
  // erro pior que não eliminar, porque não deixa rastro na soma.
  ok("onda13: a venda a terceiro sobrevive",
     !elim.some((e) => e.entrada.includes("ext") || e.saida.includes("ext")));
  ok("onda13: a eliminação diz entre QUEM foi",
     (elim[0]?.entre ?? "").includes("Holding Alfa") && (elim[0]?.entre ?? "").includes("Operadora Beta"));
  // Uma ponta sem espelho do outro lado não é intercompany.
  const soUmLado = eliminacoesIntercompany([holding, mkEmpresa("o", "Operadora Beta", [], { })]);
  ok("onda13: sem o espelho, nada é eliminado", soUmLado.length === 0);
  // Valores diferentes não pareiam, mesmo entre empresas do grupo.
  const desigual = mkEmpresa("o", "Operadora Beta",
    [mv("ic3", "saida", "pago", 9_999, "2026-08-12", "2026-08-12", "Serviços", "p-ho")],
    { "p-ho": "Holding Alfa" });
  ok("onda13: valor diferente não é o mesmo fato", eliminacoesIntercompany([holding, desigual]).length === 0);
}

/* ========================================================================== */
/* LINHA 21 — ROTAS: aliases documentados, sem ciclo e sem porta lateral.      */
/* ========================================================================== */
{
  // ⚠️ Eram 34 desvios vivos na raiz do domínio: nenhum no menu, nenhum
  // documentado, nenhum testado, e todos feitos no cliente (página em branco +
  // useEffect). Agora vivem num registro só, viram 308 no middleware, e esta
  // guarda cobra o que ninguém cobrava.

  // Nenhum alias aponta para outro alias — um desvio em cadeia é um salto a
  // mais no navegador e, no pior caso, um laço.
  const emCiclo = TODOS_OS_DESVIOS.filter((a) => destinoDe(a.para) !== null);
  ok("rotas: nenhum alias aponta para outro alias", emCiclo.length === 0,
     `em cadeia: ${emCiclo.map((a) => `${a.de}→${a.para}`).join(", ")}`);

  // Nenhum alias aponta para si mesmo.
  const auto = TODOS_OS_DESVIOS.filter((a) => a.de === a.para.split("?")[0]);
  ok("rotas: nenhum alias aponta para si mesmo", auto.length === 0,
     `${auto.map((a) => a.de).join(", ")}`);

  // Origem única: dois desvios com a mesma origem tornam o destino uma questão
  // de ordem no arquivo, que é a pior forma de decidir para onde um link vai.
  const origens = TODOS_OS_DESVIOS.map((a) => a.de);
  ok("rotas: cada endereço antigo aparece uma vez só",
     new Set(origens).size === origens.length);

  // ⚠️ Nenhum alias pode estar no MENU. Se estivesse, o menu levaria a um
  // redirecionamento — um salto visível a cada clique, no caminho mais usado.
  const doMenu = new Set(
    SECTIONS.flatMap((sec) => [sec.href, ...sec.items.map((i) => i.href)])
      .filter((h): h is string => !!h)
      .map((h) => h.split("?")[0]),
  );
  const aliasNoMenu = TODOS_OS_DESVIOS.filter((a) => doMenu.has(a.de));
  ok("rotas: nenhum alias aparece no menu", aliasNoMenu.length === 0,
     `${aliasNoMenu.map((a) => a.de).join(", ")}`);

  // Todo alias carrega o MOTIVO. Sem ele, ninguém daqui a um ano sabe se pode
  // remover — e a lista vira um cemitério que só cresce.
  const semMotivo = TODOS_OS_DESVIOS.filter((a) => !a.motivo || a.motivo.length < 10);
  ok("rotas: todo desvio explica por que existe", semMotivo.length === 0,
     `${semMotivo.map((a) => a.de).join(", ")}`);

  // As rotas REMOVIDAS que ainda aparecem em rastro antigo (marcadores de tour
  // no navegador) têm de estar cobertas: um 404 num sistema recém-comprado
  // lê-se como produto quebrado, não como página aposentada.
  for (const morta of ["/arquitetura", "/infraestrutura", "/orquestracao", "/dados", "/plataforma"]) {
    ok(`rotas: ${morta} (removida) tem destino, não 404`, destinoDe(morta) !== null);
  }

  // ⚠️ PORTA LATERAL: um alias Pro não pode desembocar em rota aberta. O
  // `/consolidado` estava em ROTAS_PRO e o alias o mandava para
  // `/contabilidade?aba=consolidado`, que é do Simples — o redirecionamento
  // virava a porta que o gate deveria fechar.
  const vazamentos = TODOS_OS_DESVIOS.filter((a) => exigePro(a.de) && !exigePro(a.para));
  ok("rotas: alias de rota Pro não desemboca em rota aberta", vazamentos.length === 0,
     `${vazamentos.map((a) => `${a.de}→${a.para}`).join(", ")}`);

  // E a aba paga dentro de hub do Simples continua trancada, sem trancar o hub.
  ok("rotas: a aba paga do hub exige Pro", exigePro("/contabilidade?aba=consolidado"));
  ok("rotas: o hub em si continua aberto", !exigePro("/contabilidade"));
  ok("rotas: outra aba do mesmo hub continua aberta", !exigePro("/contabilidade?aba=razao"));
}

/* ========================================================================== */
/* LINHA 22 — TÍTULO DA ABA: uma grafia da marca, a tela primeiro.             */
/* ========================================================================== */
{
  // ⚠️ Quase todo o sistema anunciava "all4pay — Tesouraria": Clientes,
  // Produtos, DRE, Vendas, todos iguais. Com dez abas abertas, histórico e
  // favoritos ficam indistinguíveis — e trabalhar com várias telas ao mesmo
  // tempo é exatamente o que se faz num fechamento.
  ok("título: a tela vem primeiro", tituloDaAba("Clientes").startsWith("Clientes"));
  ok("título: a marca vem depois", tituloDaAba("Clientes").endsWith(MARCA));
  ok("título: telas diferentes, títulos diferentes",
     tituloDaAba("Clientes") !== tituloDaAba("Produtos"));
  ok("título: sem tela, só a marca", tituloDaAba(null) === MARCA);
  ok("título: string vazia não vira ' · all4pay'", tituloDaAba("   ") === MARCA);
  // Uma grafia só: `all4pay` minúsculo, como no wordmark.
  ok("título: a grafia canônica é minúscula", MARCA === "all4pay");
}


/* ========================================================================== */
/* LINHA 23 — CADASTRO IMPORTADO: nome é nome, documento é documento.         */
/* ========================================================================== */
{
  // ⚠️ Os três casos que a auditoria encontrou na PRIMEIRA linha da lista de
  // clientes. Todo relatório por cliente nasce daqui — DRE por cliente,
  // cobrança, segmentação, score de crédito.

  // 1. CNPJ colado à razão social, com o parêntese invertido.
  const colado = sanearContraparte("ACME COMERCIO LTDA (11.222.333/0001-81");
  ok("cadastro: separa o documento da razão social", colado.documento === "11222333000181");
  ok("cadastro: o nome sai sem o documento", !/\d{4}/.test(colado.nome), `nome = "${colado.nome}"`);
  ok("cadastro: o nome sai sem parêntese órfão", !/[()]/.test(colado.nome), `nome = "${colado.nome}"`);
  ok("cadastro: e continua sendo uma pessoa jurídica", colado.ehPessoa);

  // 2. O nome que é APENAS um CPF.
  const soCpf = sanearContraparte("529.982.247-25");
  ok("cadastro: um CPF solto NÃO vira cliente", !soCpf.ehPessoa);
  ok("cadastro: mas o documento é aproveitado", soCpf.documento === "52998224725");

  // 3. Descrição de cobrança no lugar do favorecido.
  ok("cadastro: 'ANUIDADE DIFERENCIADA' não vira cliente",
     !sanearContraparte("ANUIDADE DIFERENCIADA").ehPessoa);

  // ⚠️ E O QUE **NÃO** PODE SER RECUSADO — recusar um cliente real dói mais
  // que aceitar um nome feio. Um detector que grita lobo é um detector que
  // ninguém lê (a mesma regra do detector de segredos da Central de Ajuda).
  for (const legitimo of [
    "Mensalidade Servicos Ltda",   // começa com palavra de cobrança E é empresa
    "Anuidade Clube SA",
    "Taxa Consultoria EIRELI",
    "Transporte Ipiranga Ltda",
    "Joao da Silva ME",
    "Padaria do Bairro",
  ]) {
    ok(`cadastro: "${legitimo}" é aceito`, sanearContraparte(legitimo).ehPessoa,
       sanearContraparte(legitimo).motivo);
  }

  // Documento INVÁLIDO não é extraído — senão a linha digitável de um boleto
  // vira CNPJ e o nome perde um pedaço.
  const docFalso = sanearContraparte("EMPRESA X 11.111.111/1111-11");
  ok("cadastro: documento com DV inválido não é extraído", docFalso.documento === null);

  // ⚠️ O NOME NÃO É MAIS "O ALIAS MAIS LONGO". O mais longo é justamente o que
  // tem o documento grudado — era essa a causa raiz.
  const escolhido = melhorNome([
    "ACME COMERCIO LTDA (11.222.333/0001-81",
    "ACME",
    "ACME COMERCIO",
  ]);
  ok("cadastro: o alias com documento colado não é escolhido como nome",
     !/\d/.test(escolhido.nome), `escolheu "${escolhido.nome}"`);
  ok("cadastro: mas o documento dele é aproveitado", escolhido.documento === "11222333000181");

  // DEDUPLICAÇÃO: mesmo documento, grafias diferentes = uma contraparte só.
  const dedup = deduplicar([
    sanearContraparte("ACME COMERCIO LTDA 11.222.333/0001-81"),
    sanearContraparte("Acme Comercio 11222333000181"),
    sanearContraparte("Outra Empresa Ltda"),
  ]);
  eq("cadastro: mesmo CNPJ vira uma contraparte só", dedup.length, 2);

  // E nomes diferentes SEM documento não são fundidos por engano.
  eq("cadastro: empresas diferentes não são fundidas",
     deduplicar([sanearContraparte("Alpha Ltda"), sanearContraparte("Beta Ltda")]).length, 2);
}


/* ========================================================================== */
/* LINHA 24 — CRIAR: toda ação tem endereço, e a forma é declarada.           */
/* ========================================================================== */
{
  const todas = [...ACOES_CADASTROS, ...ACOES_MOVIMENTACOES, ACAO_NOVA_EMPRESA];

  // ⚠️ Eram dezesseis `<button>` com navegação por código: nenhuma abria em
  // nova aba, nenhuma respondia a Ctrl+clique, nenhuma tinha endereço para
  // mandar a um colega. Toda ação passa a ter rota.
  const semRota = todas.filter((a) => !a.rota || !a.rota.startsWith("/"));
  ok("criar: toda ação tem endereço próprio", semRota.length === 0,
     `sem rota: ${semRota.map((a) => a.label).join(", ")}`);

  // Endereços únicos: dois itens no mesmo link tornam um deles inalcançável
  // por endereço.
  const rotas = todas.map((a) => a.rota);
  ok("criar: nenhum endereço repetido", new Set(rotas).size === rotas.length,
     `repetidos: ${rotas.filter((r, i) => rotas.indexOf(r) !== i).join(", ")}`);

  // ⚠️ A FORMA é declarada em cada ação. Sem regra visível, "Novo cliente"
  // abria modal e "Nova venda" trocava de tela, e o usuário não tinha como
  // saber se ia perder o contexto ao clicar.
  const semForma = todas.filter((a) => a.forma !== "modal" && a.forma !== "pagina");
  ok("criar: toda ação declara modal ou página", semForma.length === 0);

  // Documento COMPOSTO (itens, totais, impostos) é sempre PÁGINA — um
  // formulário desses num modal é um formulário que não cabe.
  for (const composto of ["Nova venda", "Nova compra", "Novo orçamento"]) {
    const a = todas.find((x) => x.label === composto);
    ok(`criar: "${composto}" abre em página`, a?.forma === "pagina", `forma = ${a?.forma}`);
  }
  // Cadastro simples é sempre MODAL — trocar de tela para digitar três campos
  // custa o contexto por nada.
  for (const simples of ["Novo cliente", "Novo fornecedor", "Novo produto"]) {
    const a = todas.find((x) => x.label === simples);
    ok(`criar: "${simples}" abre em modal`, a?.forma === "modal", `forma = ${a?.forma}`);
  }

  // ⚠️ CRIAR EMPRESA fora das listas: cria uma organização inteira, não um
  // registro. Na mesma lista e com o mesmo peso de "Novo produto", a
  // proximidade convida ao acidente.
  ok("criar: 'Nova empresa' não está entre os cadastros",
     !ACOES_CADASTROS.some((a) => a.label === ACAO_NOVA_EMPRESA.label));
  ok("criar: nem entre as movimentações",
     !ACOES_MOVIMENTACOES.some((a) => a.label === ACAO_NOVA_EMPRESA.label));

  // As lacunas que a auditoria nomeou.
  for (const faltava of [
    "Nova nota fiscal", "Novo link de pagamento",
    "Nova assinatura / recorrência", "Novo usuário",
  ]) {
    ok(`criar: "${faltava}" existe no painel`, todas.some((a) => a.label === faltava));
  }
}


/* ========================================================================== */
/* LINHA 25 — CONSOLIDAÇÃO: não se aposenta rota com pendência de porte.      */
/* ========================================================================== */
{
  // ⚠️ A INVARIANTE QUE DÁ VALOR AO MAPA. Fundir não é apagar: a rota legada
  // quase sempre faz UMA coisa melhor que a canônica, e apagá-la sem portar
  // essa coisa é perda funcional que ninguém registra — o usuário descobre
  // meses depois procurando um painel que sumiu.
  //
  // Enquanto uma fusão tiver item pendente, a rota legada NÃO pode virar alias.
  const desligadasCedo = FUSOES.flatMap((f) =>
    prontaParaAposentar(f)
      ? []
      : f.aposentar
          .filter((r) => destinoDe(r) !== null)
          .map((r) => `${r} (falta: ${pendencias(f).map((p) => p.o_que.slice(0, 40)).join(" · ")})`),
  );
  ok("consolidação: nenhuma rota é aposentada com porte pendente", desligadasCedo.length === 0,
     desligadasCedo.join(" | "));

  // O inverso: uma fusão PRONTA cujos aliases não existem é trabalho feito e
  // não colhido — a canônica já tem tudo e o endereço antigo continua solto.
  const prontasSemAlias = PRONTAS.flatMap((f) =>
    f.aposentar.filter((r) => destinoDe(r) === null).map((r) => `${f.id}:${r}`),
  );
  ok("consolidação: fusão pronta tem o alias criado", prontasSemAlias.length === 0,
     `sem alias: ${prontasSemAlias.join(", ")}`);

  // Cada fusão declara canônico, motivo e ao menos um item de porte — uma
  // fusão sem item declarado é uma que ninguém examinou.
  for (const f of FUSOES) {
    ok(`consolidação: ${f.id} tem canônico`, f.canonico.startsWith("/"));
    ok(`consolidação: ${f.id} explica a escolha`, f.porque.length > 40);
    ok(`consolidação: ${f.id} lista o que portar`, f.portar.length > 0);
    // ⚠️ Todo item diz o CUSTO DE PERDER. Sem isso a lista vira inventário, e
    // inventário é fácil de despachar num "isso ninguém usa".
    const semCusto = f.portar.filter((p) => p.custo_de_perder.length < 40);
    ok(`consolidação: ${f.id} declara o custo de cada perda`, semCusto.length === 0);
  }

  // A canônica de uma fusão não pode ser rota aposentada por OUTRA — seria
  // fundir para dentro de algo que também vai embora.
  const canonicoMorto = FUSOES.filter((f) =>
    ROTAS_A_APOSENTAR.some((r) => r.split("?")[0] === f.canonico.split("?")[0]),
  );
  ok("consolidação: nenhuma canônica está na lista de aposentadas", canonicoMorto.length === 0,
     `${canonicoMorto.map((f) => f.id).join(", ")}`);

  // Nenhuma rota é aposentada por duas fusões diferentes.
  ok("consolidação: cada rota é aposentada uma vez só",
     new Set(ROTAS_A_APOSENTAR).size === ROTAS_A_APOSENTAR.length);

  // O tamanho da dívida em um número — a guarda o publica para não virar
  // conhecimento tribal.
  console.log(`  · consolidação: ${PRONTAS.length}/${FUSOES.length} fusões prontas · ${ITENS_PENDENTES} itens a portar`);
}


/* ========================================================================== */
/* LINHA 26 — INVENTÁRIO DE ROTAS: nenhuma rota viva fora do registro.        */
/* ========================================================================== */
{
  // ⚠️ O CRITÉRIO DE CONCLUSÃO DA ONDA 6, em código: varre `src/app` atrás dos
  // `page.tsx` que o Next realmente publica e confronta com o inventário
  // declarado. Rota que ninguém declarou é rota que quebra sem ninguém ver,
  // duplica uma função sem ninguém notar, e que o suporte não sabe explicar
  // quando alguém a manda num print.
  const publicadas = rotasPublicadas();
  const declaradas = new Set(INVENTARIO.map((i) => i.rota));

  const naoDeclaradas = publicadas.filter((r) => !declaradas.has(r));
  ok("inventário: nenhuma rota publicada fora do inventário", naoDeclaradas.length === 0,
     `${naoDeclaradas.length} não declarada(s): ${naoDeclaradas.join(", ")}`);

  // O inverso: entrada no inventário sem página publicada é rota fantasma —
  // o suporte manda o cliente para um 404.
  const fantasmas = INVENTARIO.map((i) => i.rota).filter((r) => !publicadas.includes(r));
  ok("inventário: nenhuma entrada aponta para rota inexistente", fantasmas.length === 0,
     `fantasmas: ${fantasmas.join(", ")}`);

  // ⚠️ NOME ÚNICO por tela. Dois nomes iguais tornam duas abas abertas
  // indistinguíveis — que é o P1-16 voltando pela porta dos fundos.
  const dupes = nomesDuplicados();
  ok("inventário: cada tela tem um nome único", dupes.length === 0,
     dupes.map((d) => `"${d.nome}" em ${d.rotas.join(" e ")}`).join(" | "));

  // Toda rota tem DONO. Sem dono, uma rota órfã fica anos no ar porque remover
  // parece arriscado e ninguém sabe a quem perguntar.
  const semDono = INVENTARIO.filter((i) => !i.dono || i.dono === "outro");
  ok("inventário: toda rota tem módulo dono", semDono.length === 0,
     `sem dono: ${semDono.map((i) => i.rota).join(", ")}`);

  // ⚠️ `aposentando` SEM DATA é uma intenção que nunca vence.
  const semData = APOSENTANDO.filter((i) => !i.aposentadoriaEm);
  ok("inventário: toda rota em aposentadoria tem data-limite", semData.length === 0,
     `${semData.map((i) => i.rota).join(", ")}`);

  // E as que estão em aposentadoria são EXATAMENTE as que o mapa manda fundir —
  // duas listas discordando é a dívida contada duas vezes com números
  // diferentes.
  const doMapa = new Set(ROTAS_A_APOSENTAR.map((r) => r.split("?")[0]).filter((r) => r !== ""));
  const noInventario = new Set(APOSENTANDO.map((i) => i.rota));
  const soNoInventario = Array.from(noInventario).filter((r) => !doMapa.has(r));
  const soNoMapa = Array.from(doMapa).filter((r) => !noInventario.has(r) && publicadas.includes(r));
  ok("inventário: aposentadorias coincidem com o mapa de consolidação",
     soNoInventario.length === 0 && soNoMapa.length === 0,
     `só no inventário: ${soNoInventario.join(", ")} | só no mapa: ${soNoMapa.join(", ")}`);

  // Nenhuma rota é ao mesmo tempo alias e página publicada — o alias venceria
  // no middleware e a página ficaria morta no repositório, sem ninguém saber.
  const aliasComPagina = TODOS_OS_DESVIOS
    .map((a) => a.de)
    .filter((d) => publicadas.includes(d));
  ok("inventário: nenhum alias tem página publicada por baixo", aliasComPagina.length === 0,
     `${aliasComPagina.join(", ")}`);

  console.log(`  · inventário: ${publicadas.length} rotas publicadas · ${CANONICAS.length} canônicas · ${APOSENTANDO.length} em aposentadoria`);
}


/* ========================================================================== */
/* LINHA 27 — NOMENCLATURA: o menu diz o mesmo que a tela.                    */
/* ========================================================================== */
{
  // ⚠️ O menu dizia "Movimentações" e a tela dizia "Tesouraria"; o menu dizia
  // "Vendas e NFs" e a aba do navegador dizia outra coisa. Clicar num nome e
  // chegar em outro faz a pessoa duvidar de que clicou certo — e, num produto
  // com 81 rotas, duvidar do caminho é perder o caminho.
  const nomePorRota = new Map(INVENTARIO.map((i) => [i.rota, i.nome]));
  const itensDoMenu = [...SECTIONS, CONFIG].flatMap((s) => [
    ...(s.href ? [{ label: s.label, href: s.href }] : []),
    ...s.items.filter((i) => i.href).map((i) => ({ label: i.label, href: i.href as string })),
  ]);

  // Só rotas SEM query: a aba de um hub tem nome próprio, que legitimamente
  // não é o nome do hub.
  const divergentes = itensDoMenu
    .filter((it) => !it.href.includes("?"))
    .map((it) => ({ it, nome: nomePorRota.get(it.href) }))
    .filter((x) => x.nome && x.nome !== x.it.label);
  ok("nomenclatura: o rótulo do menu é o nome da tela", divergentes.length === 0,
     divergentes.map((d) => `"${d.it.label}" → "${d.nome}"`).join(" | "));

  // Todo destino do menu está no inventário — item de menu apontando para rota
  // não declarada é como uma rota nova entra sem ninguém ver.
  const foraDoInventario = itensDoMenu
    .map((it) => it.href.split("?")[0])
    .filter((r) => !nomePorRota.has(r) && destinoDe(r) === null);
  ok("nomenclatura: todo destino do menu está no inventário", foraDoInventario.length === 0,
     `${Array.from(new Set(foraDoInventario)).join(", ")}`);
}


/* ========================================================================== */
/* LINHA 28 — CONTROLES: destino declarado, e destruição com volta.           */
/* ========================================================================== */
{
  // ⚠️ O critério da ONDA 7 é "zero controles sem destino ou sem efeito", e
  // isso só é verificável se alguém escrever qual É o destino esperado. Um
  // botão que não faz nada é indistinguível de um que faz algo invisível.

  const problemas = malDeclarados();
  ok("controles: todo controle declara destino, efeito ou papel", problemas.length === 0,
     problemas.map((p) => `${p.controle.id}: ${p.problema}`).join(" | "));

  // ⚠️ Todo destino de navegação tem de ser rota VIVA. Um botão apontando para
  // rota que não existe é pior que botão sem destino: ele promete e entrega
  // 404, e o usuário conclui que o produto está quebrado.
  const rotas = new Set(INVENTARIO.map((i) => i.rota));
  const destinosMortos = porTipo("navegacao")
    .filter((c) => c.destino && !rotas.has(c.destino.split("?")[0]) && destinoDe(c.destino) === null);
  ok("controles: todo destino de navegação existe", destinosMortos.length === 0,
     destinosMortos.map((c) => `${c.id} → ${c.destino}`).join(", "));

  // ⚠️ Nenhum destino de navegação pode ser um ALIAS: o botão levaria a um
  // redirecionamento, e o salto aparece na barra de endereço a cada clique.
  const viaAlias = porTipo("navegacao").filter((c) => c.destino && destinoDe(c.destino) !== null);
  ok("controles: nenhum botão navega para um endereço aposentado", viaAlias.length === 0,
     viaAlias.map((c) => `${c.id} → ${c.destino}`).join(", "));

  // DESTRUIÇÃO: confirmação é obrigatória; desfazer também, salvo quando a
  // tela mostra o impacto ANTES.
  const destrutivas = porTipo("destrutiva");
  ok("controles: existe ao menos uma destrutiva declarada", destrutivas.length > 0);
  for (const d of destrutivas) {
    ok(`controles: "${d.rotulo}" confirma antes`, d.confirma === true);
    ok(`controles: "${d.rotulo}" desfaz ou mostra o impacto antes`,
       d.desfaz === true || !!d.efeito?.includes("ANTES"));
  }

  // Tudo que abre sobreposto fecha por Esc — sem isso, quem navega por teclado
  // fica preso dentro do modal.
  const sobrepostos = CONTROLES.filter((c) => c.fechaPorEsc !== undefined);
  ok("controles: todo sobreposto declara fechamento por Esc",
     sobrepostos.every((c) => c.fechaPorEsc === true),
     sobrepostos.filter((c) => !c.fechaPorEsc).map((c) => c.id).join(", "));

  // O interruptor do Modo Pro — o controle nomeado pela auditoria.
  const modo = CONTROLES.find((c) => c.id === "sidebar.modoPro");
  ok("controles: o Modo Pro é um switch com papel ARIA", modo?.papel === "switch");

  console.log(`  · controles: ${CONTROLES.length} declarados · ${destrutivas.length} destrutivos · ${porTipo("navegacao").length} de navegação`);
}

console.log(`\n${fails === 0 ? "✓ TODOS" : `✗ ${fails} FALHA(S)`} — matriz de consistência cruzada (${INDICADORES_VERSION})`);
if (fails > 0) process.exit(1);
