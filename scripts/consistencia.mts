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
import { ehReceitaOperacional } from "@/core/relatorios";
import {
  saldo, saldoInicial, entradas, saidas, resultado, burn, runway, runwayMeses,
  runwayDeFluxo,
  geracaoCaixaMensal, mrr, arr, inadimplencia, inadimplenciaTaxa, receitaTributavel,
  painelIndicadores, reconciliarSaldo, foraDaBaseTributavel, pontePosicaoFluxo,
  janela, janelaMes, janelaUltimosDias, janelaHoje, janelaDoMesDe, janelaAnterior,
  diasDe, dentro, contemHoje, saldoEm, saldoAbertura, assinado, magnitude,
  liquidado, dataDe, INDICADORES_VERSION, temValor, valorOuNulo,
  painelResultado, receitaBruta, deducoes, receitaLiquida, custo,
  despesaOperacional, ebitda, margem, estoqueDeTitulos, churn, posicaoConsolidada,
} from "@/core/indicadores";
import { calcularBurnRate } from "@/core/risk-engine/burn.engine";
import { calcularRunway } from "@/core/risk-engine/liquidez.engine";
import { scoreRiscoCaixa } from "@/core/risk-engine";
import { analisarQuantitativo } from "@/core/quant";
import { dreGerencial, movimentosNoPeriodo } from "@/core/dre/engine";
import {
  valoresBemFormados, valoresSemRotulo, pareceIngles, traduzirCategoria,
  ehOrigemDeTitulo,
} from "@/core/dominio";
import {
  mesmoDocumento, contraparteSuspeita, contraparteNoLadoErrado, motivoSemScore,
} from "@/core/dominio/contraparte";
import { auditarQualidade, planejarFusao } from "@/core/qualidade";
import {
  regimeDoCadastro, divergenciaDeRegime, PERFIL_NAO_DECLARADO, perfilEm,
  problemasDoHistorico, calcularFatorR, explicarFatorR,
} from "@/core/fiscal/perfil";
import { apurar } from "@/core/fiscal/apuracao";
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
  resumoPorVerbo, ABERTURAS_DECLARADAS, COMANDOS,
  type LinhaAuditoriaRLS, type TentativaIsolamento, type Comando, type AdminRevisao,
} from "@/core/seguranca";
import { avaliarExportacao, rotuloExportado } from "@/core/artefatos";
import { montarFalha, paraAlertar, DONO_POR_MODULO } from "@/core/erros";
import { problemaDoIntervalo } from "@/core/indicadores";
import { regimeDaEmpresa, regimeEmConflito, perfilTributario } from "@/core/tax/regime";
import { eliminacoesIntercompany, montarDRE } from "@/core/relatorios";
import { cascataDRE, REGRAS_CASCATA } from "@/core/relatorios/cascata";
import { classificarReceita } from "@/core/indicadores/classificacao";
import { ponteRupturaRunway, contradicoesSemPonte } from "@/core/ia/coerencia";
import { calcularConfianca } from "@/core/ia/confianca";
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
import { SECTIONS, CONFIG, menuDoPlano } from "@/components/dashboard/nav-data";
import {
  CHAVES_ORG, CHAVES_CONGELADAS, estaCongelada,
  CHAVES_DE_NEGOCIO, PREFERENCIAS_LOCAIS, PRECISAM_DE_TABELA_PROPRIA,
  CACHES_LOCAIS, ROTULO_DA_CHAVE, rotuloDaChave,
  expurgarCaches, enxugarLocal, exportarEstado, importarEstado, backupValido,
} from "@/lib/store-org";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { tetoDaFaixa, papelDoParticipante, alcadaDoOnboarding } from "@/core/seguranca/alcada";
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
 * ⚠️ **A QUARTA GUARDA DA FAMÍLIA DA DUPLA MORADA.** O mesmo número — "quanto
 * fulano pode aprovar" — morava em TRÊS lugares e só um decidia:
 *
 *   central_alcada.teto_valor            por PAPEL    ← o gatilho da Central lê
 *   organization_members.approval_limit  por PESSOA      ninguém lia
 *   a4p_company.participantes[].limite   por PESSOA      ninguém lia
 *
 * As duas mortas nasceram do mesmo jeito: uma tela escreve, ninguém lê. Esta
 * varredura existe para a quarta não nascer — e ela vale mais que o conserto,
 * porque o conserto é de hoje e a porta fica aberta para sempre.
 *
 * Devolve os pontos do código que ESCREVEM alçada fora de `central_alcada`.
 */
function escritasDeAlcadaForaDaMorada(): string[] {
  const achados: string[] = [];
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      const st = statSync(caminho);
      if (st.isDirectory()) { varrer(caminho); continue; }
      if (!/\.(ts|tsx)$/.test(nome)) continue;
      const txt = readFileSync(caminho, "utf8");
      const linhas = txt.split("\n");
      linhas.forEach((linha, i) => {
        // ⚠️ Comentário fora ANTES da busca: este repositório documenta cada
        // defeito citando o identificador que o causou, e uma guarda que
        // reprova a própria documentação da regra treina quem a lê a ignorá-la
        // (a lição da guarda de exclusão física e da varredura da ONDA 14).
        const semComentario = linha.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
        if (/^\s*\*/.test(linha)) return;

        // (a) approval_limit recebendo QUALQUER valor que não seja null literal.
        const mAppr = semComentario.match(/p_approval_limit\s*:\s*(.+?)[,)]/);
        if (mAppr && mAppr[1].trim() !== "null") {
          achados.push(`${caminho}:${i + 1} grava p_approval_limit (${mAppr[1].trim()})`);
        }
        if (/\bapproval_limit\s*:/.test(semComentario) && !/approval_limit\s*:\s*null/.test(semComentario)) {
          achados.push(`${caminho}:${i + 1} grava approval_limit`);
        }

        // ⚠️ **NÃO acusar estado de UI.** A primeira versão desta varredura
        // reprovou `limite: ""` e `limite: "R$50 mil"` nos DEFAULTS das telas —
        // que é a PERGUNTA sendo feita, não a resposta sendo persistida. Uma
        // guarda que reprova o código certo é desligada na primeira semana, ou
        // "consertada" arrancando o campo da tela. O risco real é a resposta
        // voltar a ser GRAVADA no perfil; isso é cobrado por asserção positiva
        // (o strip antes de `persistCompany`), logo abaixo.
      });
    }
  };
  varrer("src");
  return achados;
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
        // ⚠️ **OLHAR PARA TRÁS.** `comTeto(q)` é o helper SANCIONADO e aplica
        // `.limit()` — mas ele envolve a consulta, então fica ANTES do
        // `.from(` e uma varredura que só olha para a frente não o vê. É o
        // mesmo defeito de direção da guarda de `origem` (ONDA 5) e do teto de
        // cálculo em tela (ONDA 10): a terceira vez que ele aparece aqui.
        // Sem isto a guarda reprovava justamente quem usou o helper certo —
        // e `comTeto` não tinha um único consumidor, o que explica o ponto
        // cego ter sobrevivido.
        const antes = txt.slice(Math.max(0, (m.index ?? 0) - 200), m.index);
        if (/comTeto\(\s*$|comTeto\([\s\S]*$/.test(antes) && /comTeto\(/.test(antes)) continue;
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

/**
 * Varre uma pasta inteira, com o filtro de extensão que o chamador quiser.
 *
 * ⚠️ Existe separada de `varrerTelas` porque aquela só olha `.tsx` em
 * `components`/`app` — e os ESCRITORES do banco vivem em `src/lib/*.ts` e nas
 * rotas de API. Uma guarda sobre escritores que varre só telas passaria sem
 * olhar exatamente onde o defeito mora.
 */
function varrerArquivos(raiz: string, filtro: RegExp): string[] {
  const out: string[] = [];
  const anda = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { anda(caminho); continue; }
      if (filtro.test(nome)) out.push(caminho);
    }
  };
  anda(raiz);
  return out;
}

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
 * Nome de variável de provedor de modelo em texto que o USUÁRIO lê.
 *
 * ⚠️ A tela mandava "configure a ANTHROPIC_API_KEY". Quem opera o caixa não tem
 * acesso ao servidor, não pode agir sobre o aviso, e o nome da chave ainda
 * revela qual provedor está por trás. Isso é assunto de quem administra a
 * instalação — e o lugar disso é o painel de administração, não o chat.
 */
function credenciaisEmTela(): string[] {
  const out: string[] = [];
  const proibidas = /ANTHROPIC_API_KEY|OPENAI_API_KEY|GEMINI_API_KEY|sk-[a-zA-Z0-9]{8}/;
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { varrer(caminho); continue; }
      if (!/\.tsx$/.test(nome)) continue;
      // ⚠️ COMENTÁRIOS FORA. A primeira versão desta guarda acusou o próprio
      // comentário que explica por que a chave saiu da tela — e uma guarda que
      // reprova a documentação da correção treina quem a lê a ignorá-la. O que
      // interessa é o que o usuário LÊ, não o que o desenvolvedor escreveu.
      const txt = readFileSync(caminho, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|\s)\/\/[^\n]*/g, " ");
      for (const m of txt.matchAll(/>\s*([^<>{}\n]{3,120})</g)) {
        if (proibidas.test(m[1])) out.push(`${caminho}: "${m[1].trim().slice(0, 50)}"`);
      }
      for (const m of txt.matchAll(/"([^"\n]{10,160})"/g)) {
        if (proibidas.test(m[1]) && /config|informe|defina|adicione/i.test(m[1])) {
          out.push(`${caminho}: "${m[1].slice(0, 50)}"`);
        }
      }
    }
  };
  varrer("src/components");
  varrer("src/app");
  return out;
}

/**
 * TEXTO DE DESENVOLVEDOR VAZANDO PARA A TELA — A4P-013.
 *
 * O produto explica os próprios defeitos citando o código que os causou, e essa
 * prosa às vezes escorrega da documentação para a interface. Quem opera o caixa
 * não tem o que fazer com `selector`, `hook` ou o nome de uma função: são
 * palavras que só significam algo para quem tem o repositório aberto.
 *
 * ⚠️ **COMENTÁRIOS FORA**, pela mesma lição da guarda de credenciais: este
 * repositório documenta cada regra citando o identificador que a implementa, e
 * uma guarda que reprova a própria documentação da correção treina quem a lê a
 * ignorá-la. O alvo é o que o usuário LÊ.
 *
 * ⚠️ E o alvo é a REFERÊNCIA A CÓDIGO, não a palavra solta. "Função de
 * tesouraria" é português correto (papel, não `function`); "a mesma função de
 * saldo" fala do módulo que soma — por isso o padrão exige o contexto que
 * transforma a palavra em referência técnica.
 */
function textoDeDevEmTela(): string[] {
  const out: string[] = [];
  const padroes: { re: RegExp; oQue: string }[] = [
    // Identificador entre crases dentro de prosa: `montarRelatorio`, `useDRE`.
    { re: /`[A-Za-z_$][A-Za-z0-9_$]*(\(\)|[A-Z][A-Za-z0-9_$]*)`/, oQue: "identificador entre crases" },
    { re: /\bselectors?\b/i, oQue: "selector" },
    { re: /\bhooks?\b/i, oQue: "hook" },
    { re: /\bendpoints?\b/i, oQue: "endpoint" },
    // A frase medida no A4P-013: fala da FUNÇÃO do código, não do papel.
    { re: /mesma fun[çc][ãa]o de saldo/i, oQue: "cita a função de saldo do código" },
    { re: /\bcore\/[a-z-]+/i, oQue: "caminho de módulo" },
  ];
  varrerTelas((caminho, txt) => {
    const limpo = txt
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|\s)\/\/[^\n]*/g, " ");
    // Só o que sai renderizado: texto entre tags e strings de prosa longa.
    const candidatos: string[] = [];
    /*
     * ⚠️ A quebra de linha É PERMITIDA no texto capturado, e essa foi a
     * diferença entre guarda e decoração. A primeira versão usava
     * `[^<>{}\n]`, e quase todo texto de JSX fica na PRÓPRIA linha entre as
     * tags — então ela varria o produto inteiro e não achava nada, inclusive o
     * vazamento medido em `BaseDoSaldo`. Passou verde com o defeito na tela.
     */
    for (const m of limpo.matchAll(/>\s*([^<>{}]{8,300})</g)) {
      candidatos.push(m[1].replace(/\s+/g, " ").trim());
    }
    for (const m of limpo.matchAll(/"([^"\n]{16,200})"/g)) {
      // Prosa tem espaço e acento/pontuação de frase; `className` e chaves não.
      if (/\s/.test(m[1]) && /[a-zà-ú]{3}\s+[a-zà-ú]{3}/i.test(m[1])) candidatos.push(m[1]);
    }
    for (const frase of candidatos) {
      for (const { re, oQue } of padroes) {
        if (re.test(frase)) {
          out.push(`${caminho}: ${oQue} — "${frase.trim().slice(0, 60)}"`);
          break;
        }
      }
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
  // ⚠️ O intervalo é FECHADO em hoje (`>= HOJE`). Era `> HOJE`, e o teste de
  // coerência achou a diferença pela identidade: o título que vence hoje e não
  // foi pago ficava de fora de TODA projeção, deixando o saldo projetado
  // otimista pelo valor do vencimento do dia — todos os dias.
  const fim = saldoEm(INPUT, "2026-08-31");
  const previstosAteFim = DATASET
    .filter((m) => m.status === "pendente" && m.due_date >= HOJE && m.due_date <= "2026-08-31")
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

  const dre = dreGerencial(rows, "competencia");
  /**
   * ⚠️ **ESTA ASSERÇÃO EXIGIA O DEFEITO, e por isso ele sobreviveu.**
   *
   * Ela afirmava `receita bruta == todas as entradas`. Isso só é verdade numa
   * empresa que nunca teve rendimento de aplicação — e é falso por construção:
   * *entradas* é um conceito de CAIXA (tudo que entrou) e *receita bruta* é um
   * conceito de RESULTADO (o que a operação faturou). Juros recebidos entram no
   * caixa e não são faturamento.
   *
   * Enquanto ela existiu nesta forma, corrigir `dreGerencial` REPROVAVA a
   * matriz — a guarda protegia o número inflado. Esta fixture tem R$ 900 de
   * receita financeira, e foi ela que denunciou a troca.
   *
   * A identidade correta não perde nada: as duas partes somadas têm de dar as
   * entradas. Nada some, nada é contado duas vezes.
   */
  /*
   * ⚠️ **A PARTIÇÃO CRESCEU, e a asserção acompanhou em vez de ser afrouxada.**
   *
   * Ela dizia `receita bruta + receita FINANCEIRA == entradas`, e isso valia
   * enquanto a única entrada não-operacional reconhecida eram os juros. A
   * fixture também tem R$ 20.000 de transferência e R$ 15.000 de EMPRÉSTIMO
   * BANCÁRIO — dinheiro que entra e não é faturamento. Com `dreGerencial` lendo
   * a cascata, o empréstimo saiu da receita bruta (certo) e a identidade
   * quebrou por R$ 15.000 (Δ exato do empréstimo).
   *
   * A identidade certa é a PARTIÇÃO: toda entrada é operacional ou não é, e as
   * duas partes somadas dão as entradas do período. Nada some, nada conta duas
   * vezes. E o predicado é o MESMO que monta a linha de Receita Bruta — se
   * fosse um regex copiado aqui, a guarda passaria a proteger a cópia.
   */
  const naoOperacional = rows
    .filter((m) => m.type === "entrada" && !ehReceitaOperacional(m))
    .reduce((s, m) => s + Math.abs(m.amount), 0);
  ok("cruzado: a fixture TEM entrada não operacional (senão esta linha não prova nada)",
     naoOperacional > 0, `naoOperacional=${naoOperacional}`);
  eq("cruzado: receita bruta do DRE + entradas não operacionais == entradas canônicas",
     dre.receitaBruta + naoOperacional, compE);

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

  // ⚠️ ONDA 4 — ESTAS TRÊS ASSERÇÕES FORAM REESCRITAS, e a razão é a doença que
  // a onda persegue. Antes elas comparavam NÚMERO com NÚMERO, e por isso
  // exigiam que todo caminho inventasse um runway mesmo quando não existe um:
  // era assim que "33 meses" saía ao lado de um caixa negativo.
  //
  // A comparação certa tem duas partes. Primeiro a FÓRMULA: todo caminho tem de
  // usar a mesma conta (`runwayDeFluxo`), e é isso que mata o `CAP = 999` que
  // vivia dentro do risk-engine. Depois a DISPONIBILIDADE: quando o canônico
  // diz que não há resposta, nenhum caminho pode apresentar um número como se
  // houvesse — que é a regra dura desta onda.
  const re = calcularRunway(INPUT.saldoAtual, be);
  const rc = runway(INPUT);
  eq("cruzado: runway do risk-engine == a fórmula única",
     re.base, runwayDeFluxo(INPUT.saldoAtual, be.liquidoMensal));

  const risco = scoreRiscoCaixa(INPUT);
  eq("cruzado: runway do score == a fórmula única",
     risco.runway.base, runwayDeFluxo(INPUT.saldoAtual, be.liquidoMensal));
  eq("cruzado: runwayDias do score == runway do score", risco.runwayDias, risco.runway.base);
  ok("cruzado: se o canônico tem número, ele bate com os demais",
     rc.indisponivel !== undefined || rc.valor === re.base,
     `canônico ${rc.valor} × risk-engine ${re.base}`);
  eq("cruzado: burn do score de risco == burn canônico", risco.burn.burnMensal, b);

  const q = analisarQuantitativo(INPUT);
  eq("cruzado: burn do quant == burn canônico", q.indicadores.burnRate, b);
  eq("cruzado: runway do quant (meses) == runway canônico (meses)",
     Math.round(q.indicadores.runwayMeses * 10) / 10, runwayMeses(INPUT).valor);

  // ⚠️ ONDA 4 — ASSERÇÃO REESCRITA. A anterior dizia "quem gera caixa tem runway
  // no TETO", e o teto era 999 dias. Estava errada por dentro: quem gera caixa
  // não tem runway longo, tem runway INDEFINIDO — não há taxa de queima pela
  // qual dividir. Devolver o teto respondia "33 meses" a uma pergunta sem
  // resposta numérica, e foi assim que o número apareceu ao lado de um burn
  // zero na tela de fluxo de caixa.
  //
  // A proteção que ela carregava continua: zero também é resposta errada, e por
  // isso o teste cobra que NÃO seja zero exibido como fato.
  const gerador: RiskInput = {
    ...INPUT,
    movements: [mv("g1", "entrada", "pago", 50_000, "2026-08-01", "2026-08-01")],
  };
  ok("ritmo: quem gera caixa tem burn 0", burn(gerador).valor === 0);
  const rGer = runway(gerador);
  ok("ritmo→onda4: quem gera caixa NÃO recebe um número de runway",
     rGer.indisponivel !== undefined, `veio ${rGer.valor}`);
  ok("ritmo→onda4: e o motivo diz que não houve queima",
     (rGer.indisponivel?.motivo ?? "").includes("queima"),
     rGer.indisponivel?.motivo ?? "sem motivo");

  // ⚠️ O caso que a auditoria mediu: caixa NEGATIVO e sem queima. Antes saía o
  // teto — fôlego anunciado para quem já está no vermelho.
  const negativoSemQueima: RiskInput = {
    ...INPUT, saldoAtual: -31_000,
    movements: [mv("n1", "entrada", "pago", 50_000, "2026-08-01", "2026-08-01")],
  };
  const rNeg = runway(negativoSemQueima);
  ok("onda4: caixa negativo não tem runway, e o motivo o diz",
     rNeg.indisponivel !== undefined && rNeg.indisponivel.motivo.includes("negativo"),
     rNeg.indisponivel?.motivo ?? `veio ${rNeg.valor}`);

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
  /**
   * ⚠️ **ERA TAUTOLÓGICA — A4P-073.** Cobrava `rec.fecha`, e `fecha` saía de um
   * resíduo calculado como `x − x`: zero para qualquer saldo. Plantar
   * +R$ 12.345,67 no saldo, sem lançamento correspondente, passava.
   *
   * Agora ela cobra as duas metades do contrato: sem fonte independente para a
   * abertura NADA fecha, e com fonte `fecha` é uma medição.
   */
  ok("reconciliação: sem fonte independente, NÃO afirma que fecha",
     !rec.aberturaVerificada && !rec.fecha,
     `aberturaVerificada=${rec.aberturaVerificada} fecha=${rec.fecha}`);
  const aberturaOk = { valor: 0, data: "2000-01-01", fonte: "informada" as const };
  const liquidoTotal = INPUT.movements
    .filter((m) => m.status === "pago")
    .reduce((t, m) => t + (m.type === "entrada" ? m.amount : -m.amount), 0);
  const conferido = reconciliarSaldo({
    ...INPUT, saldoAtual: liquidoTotal, aberturaVerificada: aberturaOk,
  });
  ok("reconciliação: com fonte e saldo coerente, fecha com resíduo zero",
     conferido.fecha && conferido.residuo === 0, `residuo ${conferido.residuo}`);
  // O teste NEGATIVO, guardado junto: o saldo movido sem o lançamento.
  const torto = reconciliarSaldo({
    ...INPUT, saldoAtual: liquidoTotal + 12_345.67, aberturaVerificada: aberturaOk,
  });
  ok("reconciliação: saldo movido sem lançamento é ACUSADO (12.345,67)",
     Math.abs(torto.residuo - 12_345.67) < 0.01 && !torto.fecha,
     `residuo ${torto.residuo} fecha=${torto.fecha}`);
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
  // ⚠️ A marca de plano passou a ser do ITEM, não do grupo (o menu voltou a ser
  // por assunto). A conferência acompanha: `menuDoPlano(..., false)` é
  // LITERALMENTE o que o Simples enxerga — a mesma função que a barra lateral
  // chama. Conferir contra uma segunda implementação diria que o Simples está
  // coberto olhando uma lista que o Simples nunca vê.
  const TODOS_OS_GRUPOS = [...SECTIONS, CONFIG];
  const rotasDe = (secs: typeof TODOS_OS_GRUPOS) => secs
    .flatMap((sec) => [sec.href, ...sec.items.map((i) => i.href)])
    .filter((h): h is string => !!h);

  const noSimples = new Set(rotasDe(menuDoPlano(TODOS_OS_GRUPOS, false)));
  const soNoPro = rotasDe(menuDoPlano(TODOS_OS_GRUPOS, true)).filter((h) => !noSimples.has(h));

  const semGate = soNoPro.filter((h) => !exigePro(h));
  ok("planos: toda rota Pro do menu é bloqueada no servidor", semGate.length === 0,
     `sem gate: ${semGate.join(", ")}`);

  // E o inverso: a lista do servidor não pode trancar o que o menu entrega no
  // Simples — bloquear o que a pessoa já tem é o outro lado do mesmo defeito.
  const trancadoAToa = [...noSimples].filter((h) => exigePro(h));
  ok("planos: nenhuma rota do Simples é trancada", trancadoAToa.length === 0,
     `trancadas à toa: ${trancadoAToa.join(", ")}`);

  // ⚠️ OS CINCO ITENS PAGOS, NOMEADOS. A conferência acima é estrutural (o que
  // está em grupo `pro` tem gate); esta é NOMINAL. As duas não se substituem:
  // mover um item para um grupo do Simples faria a estrutural continuar
  // passando — ela só confere o que está no grupo pago com o que está trancado,
  // e um item que saiu dos dois lados sai da conferência junto. É exatamente
  // assim que um recurso pago vira grátis sem ninguém notar.
  const PAGOS = [
    "/aprovacoes",
    "/governanca",
    "/investidores",
    "/contratacoes",
    "/dashboard/dashboards/custom",
  ];
  for (const rota of PAGOS) {
    ok(`planos: ${rota} exige plano`, exigePro(rota));
    ok(`planos: ${rota} não abre no Simples`, !podeAbrir(rota, PLANO_SIMPLES));
  }

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
  /**
   * ⚠️ A LISTA DE CANDIDATOS MUDOU JUNTO COM A PORTA, e é isso que mantém a
   * guarda viva.
   *
   * Ela nasceu apontando para `/recebimentos` e para a aba `tab=receivables`,
   * que eram as duas portas da época. Com a fusão de "Receber" e "Vender", a
   * porta canônica virou `/contas-a-receber/titulos` e a aba virou desvio — se
   * eu tivesse deixado a lista velha, a guarda passaria a contar ZERO e
   * reprovaria o estado correto, o que a faria ser desligada em vez de
   * corrigida. O que ela protege continua igual: UMA porta por leitura.
   */
  const PORTAS_DE_RECEBER = ["/recebimentos", "/contas-a-receber/titulos"];
  const rotulos = SECTIONS
    .flatMap((sec) => sec.items)
    .filter((i) => PORTAS_DE_RECEBER.includes(i.href ?? "") || i.href?.includes("tab=receivables"))
    .map((i) => i.label);
  ok("telas: as duas entradas de menu têm nomes distintos",
     new Set(rotulos).size === rotulos.length, `rótulos: ${rotulos.join(" | ")}`);
  /*
   * ⚠️ A PROIBIÇÃO DO NOME GENÉRICO SAIU, e a premissa dela é que morreu.
   *
   * Ela existia porque havia DUAS telas de "a receber" — `/recebimentos`
   * (posição) e a aba de títulos (fluxo) —, e um rótulo genérico apontando
   * para uma delas deixava a outra indistinguível. `/recebimentos` foi
   * aposentada na consolidação e não está mais no inventário: com uma porta
   * só, "Contas a receber" deixou de ser ambíguo e passou a ser o nome que um
   * dono de PME usa.
   *
   * O que fica no lugar protege o MESMO defeito pela raiz: se alguém
   * reintroduzir uma segunda porta para o mesmo lado, isto reprova — e aí a
   * discussão de nome volta com ela.
   */
  ok("telas: existe UMA porta de menu para 'a receber'", rotulos.length === 1,
     `rótulos: ${rotulos.join(" | ")}`);
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
    recorte: "empresa",
    comandos: { select: "empresa", insert: "empresa", update: "empresa", delete: "empresa" },
    privilegios: { select: true, insert: true, update: true, delete: true },
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
  // ⚠️ ESTA ASSERÇÃO FOI REESCRITA NA ONDA 2, e a versão anterior era:
  //   "coluna de empresa sem política por empresa é alto"
  // — a mesma regra de casamento de string que produzia os dois achados Altos
  // falsos em `organization_members` e `user_active_org`. Ela não foi apagada,
  // foi CORRIGIDA: a proteção que ela carrega (tabela multiempresa alcançável
  // sem recorte é grave) continua valendo; o que mudou é o que conta como
  // "sem recorte" — hoje é a condição em si, não a ausência de um nome de
  // função no texto dela.
  ok("onda9→2: coluna de empresa alcançável SEM RECORTE é alto",
     achadosDaAuditoria([{
       ...base, tabela: "y", politicaPorOrg: false, recorte: "ABERTO",
       comandos: { select: "ABERTO", insert: "empresa", update: "empresa", delete: "empresa" },
     }])[0]?.gravidade === "alto");
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
  // ⚠️ A projeção vem de quem QUEIMA. Sobre a fixture principal o runway agora
  // é indisponível (a empresa gera caixa), e indisponível não é "projeção que
  // sai marcada" — é ausência, que não vira arquivo nenhum. Usar o INPUT aqui
  // testaria o portão errado e daria a impressão de que a marcação foi perdida.
  const pProj = runway(FIXTURE.INPUT_QUEIMANDO).procedencia;
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
  // ONDA 4: e a AUSÊNCIA também não. Um runway indisponível carrega `valor: 0`,
  // e é exatamente esse zero que não pode virar linha de planilha — do outro
  // lado ele lê como "zero dias de fôlego", que é o oposto do que aconteceu.
  const ausente = runway(INPUT);
  ok("onda4: indicador indisponível não vira arquivo",
     !!ausente.indisponivel
     && !avaliarExportacao([{ rotulo: "Runway", procedencia: ausente.procedencia }], "xlsx").pode);

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
/* LINHA 20g — ONDA 14: a IA não pode se contradizer nem afirmar palpite.     */
/* ========================================================================== */
{
  // ⚠️ O caso que a auditoria nomeou: "ruptura de caixa em zero dias" ao lado
  // de "runway de vinte e quatro meses". NENHUMA das duas está errada — elas
  // respondem perguntas diferentes (o agendado por data × o ritmo médio), e é
  // a tela que as apresenta como se fossem a mesma medida. Mesmo defeito que a
  // ONDA 1 achou entre posição e fluxo.
  // ⚠️ A contradição mudou de forma com a ONDA 4 e ficou MAIS nítida: antes era
  // "ruptura em 2 dias × runway de 33 meses" (o teto como fato); agora é
  // "ruptura em 2 dias × não há queima a medir". A ponte tem de reconhecer as
  // duas — é a mesma pergunta com e sem número.
  const p = ponteRupturaRunway(INPUT, 2);
  ok("onda14: a contradição aparente é detectada", p.pareceContradicao);
  ok("onda14: e vem com a frase que reconcilia", p.explicacao.length > 60);
  ok("onda14: a frase diz o que fazer, não só o que é", /antecipar|adiar/i.test(p.explicacao));
  // ⚠️ `null` não é zero: tratar "sem ruptura no horizonte" como "ruptura no
  // dia zero" é como o zero foi parar ao lado de um runway longo.
  ok("onda14: ausência de ruptura não vira ruptura no dia zero",
     !ponteRupturaRunway(INPUT, null).ruptura.existe);
  ok("onda14: cada leitura declara o que NÃO enxerga",
     !!p.ruptura.naoEnxerga && !!p.runway.naoEnxerga);
  ok("onda14: duas frases opostas sem ponte são acusadas",
     contradicoesSemPonte([
       { id: "a", texto: "Ruptura de caixa em 0 dias.", cita: ["ruptura"] },
       { id: "b", texto: "Runway de 24 meses.", cita: ["runway"] },
     ]).length === 1);

  // Confiança com CRITÉRIO — um número solto empresta autoridade sem dar como
  // conferir, e é sobre essas respostas que se decide sem checar.
  const alta = calcularConfianca({ lancamentos: 120, diasDesdeODado: 5, natureza: "fato", cobertura: 1 });
  const baixa = calcularConfianca({ lancamentos: 2, diasDesdeODado: 200, natureza: "projecao", cobertura: 0.5 });
  ok("onda14: a confiança separa fato recente de projeção rasa",
     alta.nivel === "alta" && baixa.nivel === "baixa");
  ok("onda14: todo fator de confiança explica o próprio valor",
     alta.fatores.every((f) => f.porque.length > 8));
  // ⚠️ Nenhuma quantidade de dado transforma suposição sobre o futuro em fato.
  ok("onda14: projeção farta não supera fato modesto",
     calcularConfianca({ lancamentos: 5000, diasDesdeODado: 1, natureza: "projecao", cobertura: 1 }).valor
     < calcularConfianca({ lancamentos: 30, diasDesdeODado: 20, natureza: "fato", cobertura: 1 }).valor);

  // Configuração de provedor de modelo não é assunto do usuário final.
  const vazamentos = credenciaisEmTela();
  ok("onda14: nenhuma chave de provedor citada ao usuário", vazamentos.length === 0,
     vazamentos.slice(0, 3).join(" · "));

  /*
   * A4P-013 — texto de DESENVOLVEDOR na tela. Mesma família do de cima: o que
   * o usuário lê tem de ser acionável por ele. `selector`, `hook`, um caminho
   * de módulo ou um identificador entre crases só significam algo para quem
   * tem o repositório aberto.
   */
  const dev = textoDeDevEmTela();
  ok("a4p013: nenhum texto de desenvolvedor renderizado ao usuário",
     dev.length === 0, dev.slice(0, 4).join(" · "));

  /*
   * A4P-019 — TETO ZERO: um formatador de BRL só, o de `lib/format`.
   *
   * ⚠️ Medido: havia 36 formatadores avulsos em 32 arquivos, 18 deles com
   * `maximumFractionDigits: 0`. Eles divergiam em DUAS coisas ao mesmo tempo —
   * as casas decimais (o DAS de R$3.988,80 saía "R$3.989", sumindo com 20
   * centavos de imposto) e o espaço não separável que o `Intl` põe depois do
   * "R$", que `formatBRL` remove. O mesmo dinheiro saía com duas grafias
   * conforme o caminho.
   *
   * O `scripts/` entra na varredura porque o contrato de resultado compara
   * STRINGS: um `fmt` próprio ali já fez a guarda discordar da IA por grafia,
   * não por valor.
   */
  const avulsos: string[] = [];
  const varrerBRL = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { varrerBRL(caminho); continue; }
      if (!/\.(ts|tsx|mts)$/.test(nome)) continue;
      if (caminho === join("src", "lib", "format.ts")) continue;   // a fonte única
      const txt = readFileSync(caminho, "utf8");
      for (const m of txt.matchAll(/style:\s*"currency"[^}]*currency:\s*"BRL"/g)) {
        avulsos.push(`${caminho}:${txt.slice(0, m.index).split("\n").length}`);
      }
    }
  };
  varrerBRL("src");
  varrerBRL("scripts");
  ok("a4p019: um formatador de BRL só — nenhum avulso fora de lib/format",
     avulsos.length === 0, avulsos.slice(0, 5).join(" · "));
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
/* ========================================================================== */
/* LINHA 26b — REGIME: uma pergunta, uma resposta, um lugar.                   */
/* ========================================================================== */
{
  /*
   * ⚠️ O regime tributário é a entrada de TODO cálculo de imposto e do custo de
   * aquisição de estoque. Ele estava gravado em duas chaves com formatos
   * diferentes (`regimeTributario`, texto de exibição; `regime`, o enum) e LIDO
   * por precedência reescrita à mão em cada tela — quatro cópias, uma delas
   * esquecendo o MEI e devolvendo "presumido" para quem é MEI.
   *
   * Não é divergência de cálculo, é de CADASTRO: a mesma empresa aparecia como
   * Simples numa tela e Presumido na outra, e não há fórmula errada para
   * consertar. Esta guarda existe porque a quinta cópia entra na próxima tela
   * nova, e ninguém vê no diff.
   */
  const raiz = "src";
  const arquivos: string[] = [];
  (function varrer(d: string) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = `${d}/${e.name}`;
      if (e.isDirectory()) varrer(f);
      else if (/\.tsx?$/.test(e.name)) arquivos.push(f);
    }
  })(raiz);

  // A assinatura da precedência reescrita à mão: as duas chaves na mesma
  // expressão, fora do resolvedor.
  const copias = arquivos.filter((f) => {
    if (f.endsWith("core/tax/regime.ts")) return false;   // o resolvedor
    const txt = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    return /regimeTributario\s*\?\?\s*[\w.]*\bregime\b/.test(txt);
  });
  ok("regime: nenhuma tela reescreve a precedência das duas chaves", copias.length === 0,
     copias.join(" | "));

  // E o resolvedor conhece os quatro regimes — foi o MEI que a cópia perdeu.
  ok("regime: MEI é reconhecido", regimeDaEmpresa({ regimeTributario: "MEI" }) === "mei");
  ok("regime: Simples pelo texto do onboarding", regimeDaEmpresa({ regimeTributario: "Simples Nacional" }) === "simples");
  ok("regime: o cadastro jurídico vence a edição rápida",
     regimeDaEmpresa({ regimeTributario: "Simples Nacional", regime: "presumido" }) === "simples");
  ok("regime: desacordo entre as duas chaves é DENUNCIADO",
     regimeEmConflito({ regimeTributario: "Simples Nacional", regime: "presumido" }).conflito === true);
  ok("regime: acordo não vira alarme falso",
     regimeEmConflito({ regimeTributario: "Simples Nacional", regime: "simples" }).conflito === false);
}


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


/* ========================================================================== */
/* LINHA 20d — DUPLA MORADA: aprovação e reembolso têm UMA casa em live.       */
/* ========================================================================== */
{
  /*
   * ⚠️ O MESMO DEFEITO DAS TELAS DUPLICADAS, AGORA NOS DADOS. Aprovações e
   * reembolsos existiam ao mesmo tempo como tabela (`approvals`,
   * `reembolsos`) e como chave de estado (`a4p_aprovacoes`, `a4p_reembolsos`,
   * que o caminho genérico ainda subia para `org_state`). Duas cópias do mesmo
   * fato divergem no primeiro ajuste — e aqui o fato é quem autorizou um
   * pagamento. Divergência ali é o pagamento autorizado duas vezes, ou o que
   * ninguém autorizou.
   *
   * A decisão: a TABELA é o caminho único de leitura, a escrita na chave
   * PAROU, e o dado antigo fica parado onde está. ⚠️ A MIGRAÇÃO do que já subiu
   * continua BLOQUEADA até haver restauração de backup testada e datada —
   * mexer no dado que só tem uma cópia, sem ensaio de volta, é a operação que
   * não se desfaz. Esta guarda cobra a parada de sangrar, não a operação.
   */
  ok("dupla morada: as duas chaves estão congeladas",
     estaCongelada("a4p_aprovacoes") && estaCongelada("a4p_reembolsos"));
  ok("dupla morada: o congelamento não vazou para as outras chaves",
     !estaCongelada("a4p_orcamentos") && !estaCongelada("a4p_comprovantes"));

  // ⚠️ Congelada continua CLASSIFICADA. Tirá-la de `CHAVES_ORG` a esconderia da
  // guarda de classificação, e uma chave fora das listas é exatamente como
  // este defeito nasceu — sem ninguém para perguntar onde ela mora.
  const classificadas = new Set<string>(Object.values(CHAVES_ORG));
  ok("dupla morada: chave congelada continua classificada",
     CHAVES_CONGELADAS.every((c) => classificadas.has(c)),
     CHAVES_CONGELADAS.filter((c) => !classificadas.has(c)).join(", "));

  /*
   * E a varredura, com teto ZERO: nenhum caminho grava as duas chaves fora da
   * demonstração. A trava do `store-org` já recusa a escrita, mas ela é uma
   * função que alguém pode contornar chamando `gravarLocal` direto — e a
   * segunda cópia não precisa de duas chamadas para existir, precisa de uma.
   */
  const donos = ["src/lib/aprovacoes.ts", "src/lib/reembolsos.ts"];
  for (const arquivo of donos) {
    const txt = readFileSync(arquivo, "utf8");
    const corpo = txt.slice(txt.indexOf("function saveLocal"));
    ok(`dupla morada: ${arquivo} não grava a chave em live`,
       /function saveLocal[^}]*if \(!isDemo\) return;/.test(corpo),
       "o `saveLocal` precisa sair cedo quando não é demonstração");
  }
  const arquivosDeSrc: string[] = [];
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { varrer(caminho); continue; }
      if (/\.(ts|tsx)$/.test(nome)) arquivosDeSrc.push(caminho);
    }
  };
  varrer("src");
  const fora = arquivosDeSrc
    .filter((f) => !donos.includes(f) && !f.endsWith("store-org.ts"))
    .filter((f) => /a4p_aprovacoes|a4p_reembolsos/.test(readFileSync(f, "utf8")));
  ok("dupla morada: só os donos e o registro citam as duas chaves", fora.length === 0,
     fora.join(", "));
}


/* ========================================================================== */
/* LINHA 30 — MÉTRICA NÃO SE DIGITA: o MRR não sai do cliente.                 */
/* ========================================================================== */
{
  /*
   * ⚠️ Métrica que se digita não é métrica: é opinião com casa decimal. O
   * defeito não estava onde parecia — a TELA já derivava o MRR do preço do
   * plano; a FUNÇÃO é que aceitava o número como parâmetro. Derivação feita na
   * tela é convenção, e convenção se perde na primeira refatoração: ninguém
   * precisa ser mal-intencionado para o número passar a mentir, basta um
   * script de correção em lote informar o valor "certo".
   *
   * Quem calcula agora é um gatilho no banco (migration
   * `20260805234628_mrr_derivado_do_plano`), e ele vale para TODO caminho de
   * escrita — inclusive o webhook do provedor de pagamento, que ainda não
   * existe. Esta guarda cobra o lado que o banco não alcança: que nenhum
   * arquivo do cliente volte a mandar o número.
   */
  const arquivos: string[] = [];
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { varrer(caminho); continue; }
      if (/\.(ts|tsx)$/.test(nome)) arquivos.push(caminho);
    }
  };
  varrer("src");

  /*
   * ⚠️ O padrão é ESTREITO de propósito, e a primeira versão não era: ela
   * casava `mrr:` em qualquer objeto e acusou `core/indicadores` e
   * `core/paineis`, que CALCULAM o MRR — que é o trabalho deles. Uma guarda
   * que reprova o certo é pior que guarda nenhuma: ela treina quem a lê a
   * ignorá-la. O que não pode existir é o PARÂMETRO (`p_mrr`) e a escrita
   * direta na tabela de assinaturas.
   */
  const mandamMrr = arquivos.filter((f) => {
    const txt = readFileSync(f, "utf8");
    return /p_mrr/.test(txt) || /from\("subscriptions"\)[\s\S]{0,200}?(insert|update|upsert)/.test(txt);
  });
  ok("mrr: nenhuma tela informa o MRR ao servidor", mandamMrr.length === 0,
     mandamMrr.join(", "));

  // E a assinatura da função no cliente não pode ter o parâmetro de volta.
  const admin = readFileSync("src/lib/admin.ts", "utf8");
  const assinatura = admin.match(/export async function setSubscription\(([^)]*)\)/)?.[1] ?? "";
  ok("mrr: setSubscription não recebe MRR", !/mrr/i.test(assinatura), assinatura);

  // ⚠️ E a regra escrita, para quem for mexer nisso daqui a um ano: trial e
  // inadimplente NÃO entram no MRR. Trial é a aposta de que vai virar receita;
  // inadimplente é o título que existe sem o dinheiro ter entrado. Contar
  // qualquer um dos dois é como um SaaS descobre tarde que a receita reportada
  // não era caixa.
  const migration = readFileSync(
    "supabase/migrations/20260805234628_mrr_derivado_do_plano.sql", "utf8");
  ok("mrr: a regra do gatilho é preço do plano SÓ quando ativa",
     /new\.status = 'active'/.test(migration) && /else 0/.test(migration));
}


/* ========================================================================== */
/* LINHA 29 — NAVEGAÇÃO: o teto do menu e a justificativa de toda rota.        */
/* ========================================================================== */
{
  /*
   * ⚠️ AS DUAS GUARDAS QUE IMPEDEM O MENU DE VOLTAR A QUINZE GRUPOS.
   *
   * A entropia aqui não é figura de linguagem: já aconteceu duas vezes neste
   * repositório. Ninguém acrescentou quinze grupos de uma vez — cada um entrou
   * sozinho, defensável, com um dono que precisava daquilo hoje. O que faltava
   * era o momento em que alguém teria de OLHAR O TOTAL, e é ele que estas duas
   * criam.
   *
   * Os tetos estão ancorados no MEDIDO, não num número redondo com folga. Um
   * teto com folga é um teto que já nasce autorizando o próximo item, e a folga
   * some sem discussão nenhuma; um teto no medido obriga quem quer acrescentar
   * a dizer o que sai. É a mesma decisão dos orçamentos de desempenho da
   * ONDA 12 — teto ancorado no que existe, subir exige justificativa escrita.
   */
  /*
   * ⚠️ OS TRÊS TETOS SUBIRAM, e a justificativa é a que a própria regra exige.
   *
   * A divisão anterior (6 grupos) agrupava por FORMATO e escondia o ciclo do
   * dinheiro: "Movimentações" misturava títulos em aberto com extrato,
   * "Entradas" colidia semanticamente com receita, e "Cadastros" juntava
   * cliente, plano de contas e orçamento — três coisas usadas em três lugares
   * diferentes. A divisão nova é pelo CICLO (Caixa e bancos · Receber · Pagar
   * · Vender) e por DOMÍNIO (Contábil · Análise · Inteligência), e isso custa
   * dois grupos a mais.
   *
   * O que NÃO mudou é o princípio: teto ancorado no medido, não num número
   * redondo com folga, para que o próximo item obrigue alguém a dizer o que
   * sai. Estes três valores são exatamente o que a estrutura tem hoje.
   *
   * O custo aceito, escrito para não ser esquecido: 8 grupos é mais do que a
   * regra dos ~7 confortáveis, e 66 destinos é um menu grande. O que torna
   * isso operável é que a lateral mostra só o grupo em que você está — nunca
   * os 66 de uma vez.
   */
  /*
   * ⚠️ NONO GRUPO: "Contas a pagar" — a justificativa que o teto exige.
   *
   * A regra manda dizer O QUE SAI. Saiu: a linha "Contas a pagar" deixou o
   * grupo "Pagar" e virou a área. "Pagar" continua com o que CERCA a
   * obrigação — compra que precisa de aprovação, NF de entrada, boleto que
   * chegou, reembolso, fornecedor — e a obrigação em si passou a ter casa
   * própria, com a leitura agregada (dashboard) e a leitura título a título
   * lado a lado.
   *
   * O teto de destinos NÃO subiu junto, e isso é o ponto: o dashboard é uma
   * pergunta que ninguém respondia (quanto já saiu, quanto vai vencer, quanto
   * venceu, em que dia), mas a linha herdada não é destino novo — mudou de
   * grupo. O total sobe de 66 para 67 por um destino, um só.
   *
   * O custo aceito, escrito para não ser esquecido: 9 grupos passa dos ~7
   * confortáveis, e agora existem dois grupos cujo nome fala de pagar. O que
   * os separa é a pergunta — "Pagar" é o fluxo de trabalho até a obrigação
   * existir; "Contas a pagar" é a obrigação depois de existir. Se o próximo
   * item não couber claramente de um dos dois lados, o sinal é de fundir, não
   * de subir o teto de novo.
   *
   * ⚠️ +1 destino: "Contas recorrentes". A justificativa é a pergunta que
   * nenhuma tela respondia — *quanto a empresa compromete todo mês só para
   * continuar existindo*. Ela não é a soma do mês (que mistura o aluguel que
   * volta com a compra avulsa que não volta) nem sai do painel (que é sobre
   * situação, não sobre repetição).
   *
   * ⚠️ +1 destino: "Folha salarial". A pergunta é outra e nenhuma das três
   * anteriores a responde: *quanto a equipe custa de verdade*. A folha não é
   * uma conta recorrente — um CLT gera TRÊS títulos por mês em duas datas mais
   * duas parcelas de 13º por ano, e o valor do salário depende de tabela legal
   * e de quantos dependentes a pessoa tem. Enfiá-la em "Contas recorrentes"
   * misturaria o que se calcula com o que se observa.
   *
   * O grupo continua com 4 itens, dentro do teto por grupo, e o teto total
   * sobe pelos dois destinos que realmente entraram.
   */
  /**
   * ⚠️ O teto CAIU de 9 para 8, e o que ele mede continua sendo o mesmo.
   *
   * "Receber" e "Vender" viraram um grupo só ("Contas a receber"), porque eram
   * o mesmo ciclo cortado ao meio. Deixar o teto em 9 depois de reduzir os
   * grupos guardaria uma folga que ninguém pediu, e a folga é exatamente por
   * onde o menu volta a crescer.
   */
  /**
   * ⚠️ +1 destino: "Central financeira" (P-10), no grupo Caixa e bancos. A
   * justificativa que o teto exige: nenhum dos destinos existentes CONFIRMA um
   * título. Contas a Pagar/Receber e Upload ENTRAM dados; a confirmação e a
   * baixa — com alçada e segregação de funções — acontecem num lugar só, e é
   * esse lugar que faltava. Não é arrumação de menu: é a porta que impede a
   * baixa direta (A4P-052) e onde o previsto vira confirmado.
   */
  const TETO_GRUPOS = 8;            // Visão geral · Caixa e bancos · Contas a receber · Pagar · Contas a pagar · Contábil e fiscal · Análise e relatórios · Inteligência
  const TETO_ITENS_POR_GRUPO = 12;  // Contábil e fiscal e o rodapé de Configurações, os maiores
  const TETO_ITENS_TOTAL = 70;      // +1: Central financeira (P-10)

  ok(`nav: no máximo ${TETO_GRUPOS} grupos de primeiro nível`,
     SECTIONS.length <= TETO_GRUPOS,
     `${SECTIONS.length} grupos: ${SECTIONS.map((s) => s.label).join(" · ")}`);

  const gordos = [...SECTIONS, CONFIG].filter((s) => s.items.length > TETO_ITENS_POR_GRUPO);
  ok(`nav: nenhum grupo passa de ${TETO_ITENS_POR_GRUPO} itens`, gordos.length === 0,
     gordos.map((s) => `${s.label} (${s.items.length})`).join(", "));

  const total = [...SECTIONS, CONFIG].reduce((n, s) => n + s.items.length + (s.href ? 1 : 0), 0);
  ok(`nav: o menu inteiro não passa de ${TETO_ITENS_TOTAL} destinos`, total <= TETO_ITENS_TOTAL,
     `${total} destinos`);

  // ⚠️ E o que a soma esconde: um menu dentro do teto ainda pode ter um grupo
  // com um item só, que é uma linha de menu fingindo ser uma categoria. `href`
  // presente é o caso legítimo (o grupo É o destino, como Início).
  const magros = SECTIONS.filter((s) => !s.href && s.items.length < 2);
  ok("nav: nenhum grupo existe para abrigar um item só", magros.length === 0,
     magros.map((s) => s.label).join(", "));

  /*
   * A segunda: ROTA NOVA EXIGE LINHA COM DONO E CRITÉRIO.
   *
   * A guarda da LINHA 26 já cobra que toda rota publicada tenha linha. O que
   * ela não cobrava é a linha DIZER ALGUMA COISA: `dono` respondia "a quem
   * perguntar" e nada respondia "por que isto existe". Sem essa segunda
   * pergunta, uma rota entra porque alguém precisava dela hoje e fica para
   * sempre, porque remover parece arriscado e ninguém sabe o que ela custa.
   */
  const CRITERIOS = ["nucleo", "diferencial", "travada", "ferramenta"];
  const semCriterio = INVENTARIO.filter((i) => !CRITERIOS.includes(i.criterio));
  ok("inventário: toda rota declara o critério pelo qual existe", semCriterio.length === 0,
     semCriterio.map((i) => i.rota).join(", "));
  const semDono = INVENTARIO.filter((i) => !i.dono);
  ok("inventário: toda rota tem dono", semDono.length === 0,
     semDono.map((i) => i.rota).join(", "));

  // ⚠️ Coerência entre o critério e o gate: o que está declarado como TRAVADA
  // tem de estar trancado no servidor, e o que está trancado tem de estar
  // declarado. As duas listas divergirem é o defeito da cortina de novo —
  // agora com uma declaração escrita dizendo que está tudo certo.
  const travadasSemGate = INVENTARIO.filter((i) => i.criterio === "travada" && !exigePro(i.rota));
  ok("inventário: rota declarada travada é bloqueada no servidor", travadasSemGate.length === 0,
     travadasSemGate.map((i) => i.rota).join(", "));
  const gateSemDeclaracao = INVENTARIO.filter((i) => i.criterio !== "travada" && exigePro(i.rota));
  ok("inventário: rota bloqueada no servidor está declarada travada", gateSemDeclaracao.length === 0,
     gateSemDeclaracao.map((i) => i.rota).join(", "));

  const porCriterio = CRITERIOS.map(
    (c) => `${INVENTARIO.filter((i) => i.criterio === c).length} ${c}`,
  ).join(" · ");
  console.log(`  · nav: ${SECTIONS.length} grupos · ${total} destinos · inventário: ${porCriterio}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   LINHA 29 — ONDA 2: o auditor de isolamento não pode gritar lobo
   ═══════════════════════════════════════════════════════════════════════════

   ⚠️ Esta linha existe por causa de um defeito que só aparece quando alguém
   confere: a tela de segurança reportava dois achados ALTOS
   (`organization_members`, `user_active_org`) que não existiam. O auditor
   decidia "tem política por empresa" com um `like '%auth_org_id()%'` — e as
   duas tabelas são recortadas por `user_id = auth.uid()`, que é MAIS ESTREITO.

   E o conserto que a tela sugeria pioraria a segurança: uma política por
   empresa em `organization_members` deixaria qualquer membro enumerar os
   colegas — que é o que a RPC `org_members` existe para controlar.

   As duas metades são cobradas: o achado verdadeiro tem de aparecer, e o falso
   tem de sumir. Uma guarda que só checasse a segunda passaria com o auditor
   desligado.
*/
{
  const linha = (over: Partial<LinhaAuditoriaRLS>): LinhaAuditoriaRLS => ({
    tabela: "t", rlsLigada: true, politicas: 1, temOrgId: true, politicaPorOrg: false,
    recorte: "empresa",
    comandos: { select: "empresa", insert: "empresa", update: "empresa", delete: "empresa" },
    privilegios: { select: true, insert: true, update: true, delete: true },
    alcancaAnonimo: false, anonPodeTruncar: false,
    ...over,
  });

  // O FALSO que abriu a onda: recorte por usuário, escrita negada por ausência.
  const porUsuario = linha({
    tabela: "organization_members", recorte: "usuário",
    comandos: { select: "usuário", insert: "nenhuma", update: "nenhuma", delete: "nenhuma" },
  });
  ok("segurança: recorte por usuário NÃO é achado",
     achadosDaAuditoria([porUsuario]).length === 0,
     JSON.stringify(achadosDaAuditoria([porUsuario])));

  // O VERDADEIRO: `using (true)` num comando que o cliente tem privilégio de usar.
  const aberta = linha({
    tabela: "movements", recorte: "ABERTO",
    comandos: { select: "ABERTO", insert: "empresa", update: "empresa", delete: "empresa" },
  });
  const achadosAberta = achadosDaAuditoria([aberta]);
  ok("segurança: política `using (true)` VIRA achado alto",
     achadosAberta.length === 1 && achadosAberta[0].gravidade === "alto",
     JSON.stringify(achadosAberta));

  // ⚠️ Sem privilégio a política sequer é avaliada: a tabela está fechada uma
  // camada antes. Acusá-la aqui seria o mesmo ruído, com outro nome.
  const abertaSemPrivilegio = linha({
    tabela: "subscriptions", recorte: "ABERTO",
    comandos: { select: "ABERTO", insert: "nenhuma", update: "nenhuma", delete: "nenhuma" },
    privilegios: { select: false, insert: false, update: false, delete: false },
  });
  ok("segurança: sem concessão, política aberta não é achado",
     achadosDaAuditoria([abertaSemPrivilegio]).length === 0);

  // A abertura declarada some — mas só no comando declarado.
  const declaradaLinha = linha({
    tabela: "role_permissions", temOrgId: false, recorte: "ABERTO",
    comandos: { select: "ABERTO", insert: "ABERTO", update: "nenhuma", delete: "nenhuma" },
  });
  const achadosDeclarada = achadosDaAuditoria([declaradaLinha]);
  ok("segurança: abertura declarada some, e SÓ no comando declarado",
     achadosDeclarada.length === 1 && achadosDeclarada[0].problema.includes("inserir"),
     JSON.stringify(achadosDeclarada));

  // ⚠️ Toda exceção carrega MOTIVO — sem isso a lista vira o lugar onde se
  // esconde o que incomoda, e a guarda passa a proteger o silêncio.
  const semMotivo = ABERTURAS_DECLARADAS.filter((a) => (a.porque ?? "").trim().length < 40);
  ok("segurança: toda abertura declarada tem motivo escrito", semMotivo.length === 0,
     semMotivo.map((a) => `${a.tabela}.${a.comando}`).join(", "));
  const comandoInvalido = ABERTURAS_DECLARADAS.filter(
    (a) => !COMANDOS.includes(a.comando as Comando),
  );
  ok("segurança: abertura declarada aponta um comando real", comandoInvalido.length === 0);

  /* ── o teste de isolamento por verbo ────────────────────────────────────── */

  const t = (o: Partial<TentativaIsolamento>): TentativaIsolamento =>
    ({ tabela: "movements", verbo: "ler", resultado: "negado", vazou: false, detalhe: "", ...o });

  // ⚠️ Lista vazia NUNCA é aprovação. É o defeito que esta onda encontrou:
  // `teste_isolamento()` abortava em `subscriptions` (42501) e a tela ficava
  // sem resposta — um resumo que somasse zero de nada diria "aprovado".
  ok("isolamento: nada testado NÃO é aprovado", resumoPorVerbo([]).ok === false);

  ok("isolamento: uma tentativa que passou reprova o conjunto",
     resumoPorVerbo([t({}), t({ verbo: "apagar", resultado: "VAZOU", vazou: true })]).ok === false);

  // "Sem privilégio" é resposta legítima e forte (fechada por concessão), mas
  // precisa aparecer contada — senão o placar conta como conferido o que não foi.
  const comSemPriv = resumoPorVerbo([t({}), t({ tabela: "subscriptions", resultado: "sem privilégio" })]);
  ok("isolamento: sem privilégio não reprova, mas é contado",
     comSemPriv.ok === true && comSemPriv.naoTentadas === 1);

  /* ── a revisão de acesso administrativo ─────────────────────────────────── */

  const adm = (o: Partial<AdminRevisao>): AdminRevisao => ({
    userId: "u", email: "a@b.c", motivo: "Responde pelo suporte de plataforma.",
    expiraEm: null, revisadoEm: "2026-06-01T00:00:00Z",
    revisadoPor: "outro", revisadoPorEmail: "chefe@b.c", autoRevisao: false,
    proximaRevisao: "2026-12-01",
    exigeMfa: true, fatoresMfa: 1, mfaPrazo: null,
    acessos30d: 3, negados30d: 0, ultimoAcesso: null, pendente: false,
    ...o,
  });
  const HOJE = "2026-08-10";

  ok("admin: em dia não gera pendência",
     pendenciasDeAdmin([adm({})], HOJE).length === 0,
     JSON.stringify(pendenciasDeAdmin([adm({})], HOJE)));

  // ⚠️ Vencida é ALTO e "nunca revisado" é MÉDIO, nesta ordem: nunca revisado é
  // uma pendência que ninguém prometeu resolver; vencida é uma data que alguém
  // escolheu e deixou passar — o controle existe, foi agendado, e falhou.
  const vencida = pendenciasDeAdmin([adm({ proximaRevisao: "2026-07-01" })], HOJE);
  ok("admin: revisão vencida é alto",
     vencida.some((p) => p.gravidade === "alto" && p.problema.includes("vencida")),
     JSON.stringify(vencida));
  const nunca = pendenciasDeAdmin([adm({ revisadoEm: null, proximaRevisao: null })], HOJE);
  ok("admin: nunca revisado é médio",
     nunca.some((p) => p.gravidade === "medio" && p.problema === "nunca revisado"));

  // ⚠️ A autorrevisão NÃO é bloqueada no banco (com um administrador só, o
  // bloqueio travaria a revisão inteira) — então ela precisa APARECER. Uma
  // segregação que não se pode cumprir vira exceção silenciosa; declarada, vira
  // dívida visível, e some sozinha no dia em que houver um segundo nome.
  ok("admin: revisão assinada pela própria pessoa aparece",
     pendenciasDeAdmin([adm({ autoRevisao: true })], HOJE)
       .some((p) => p.problema.includes("por si mesmo")));

  ok("admin: sem motivo registrado continua sendo pendência",
     pendenciasDeAdmin([adm({ motivo: null })], HOJE).some((p) => p.problema.includes("motivo")));

  /* ── ONDA 3: nenhuma exclusão física no código ──────────────────────────── */
  //
  // ⚠️ O banco já revogou o `DELETE` do papel do cliente, então uma exclusão
  // física nem funcionaria — mas falharia em PRODUÇÃO, na mão do usuário, com
  // "permission denied". Esta guarda a pega no commit, que é onde custa barato.
  //
  // ⚠️ A exceção é DECLARADA e é uma só: `movement_tags` é VÍNCULO, não
  // entidade. "Tirar a etiqueta" tem de tirar mesmo — guardar etiquetas
  // removidas para sempre é lixo que ninguém vai à lixeira buscar. Sem a lista,
  // a guarda seria desligada na primeira exceção legítima.
  {
    const EXCECOES: { arquivo: string; tabela: string; porque: string }[] = [
      {
        arquivo: "src/lib/tags.ts",
        tabela: "movement_tags",
        porque: "Etiqueta é vínculo, não entidade: remover tem de remover. Uma lixeira de etiquetas seria lixo que ninguém busca.",
      },
      {
        arquivo: "src/lib/amostra.ts",
        tabela: "as cinco tabelas com is_sample",
        porque:
          "Dado de demonstração não é dado do cliente: mandá-lo para a lixeira mantém dentro da base exatamente aquilo que a purga existe para tirar, num canto que nenhum relatório varre e que ninguém vai revisar. A exclusão lógica da ONDA 3 protege o registro do cliente contra o clique errado — aqui não há registro do cliente a proteger, e o impacto é mostrado ANTES (a contagem por tabela está na tela no momento da confirmação).",
      },
    ];
    const infratores: string[] = [];
    const varrerDeletes = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) { varrerDeletes(caminho); continue; }
        if (!/\.(ts|tsx)$/.test(nome)) continue;
        // ⚠️ Os comentários saem ANTES da busca. A primeira versão desta guarda
        // acusaria o próprio arquivo que documenta a regra — e guarda que
        // reprova a documentação da regra treina quem a lê a ignorá-la.
        const txt = readFileSync(caminho, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "")
          .replace(/^\s*\*.*$/gm, "");
        if (!/\.delete\(\)/.test(txt)) continue;
        if (EXCECOES.some((e) => caminho.replace(/\\/g, "/").endsWith(e.arquivo))) continue;
        infratores.push(caminho.replace(/\\/g, "/"));
      }
    };
    varrerDeletes("src");
    ok("onda3: nenhuma exclusão física fora da exceção declarada",
       infratores.length === 0, infratores.join(", "));
    const semPorque = EXCECOES.filter((e) => (e.porque ?? "").trim().length < 40);
    ok("onda3: toda exceção de exclusão física tem motivo escrito", semPorque.length === 0,
       semPorque.map((e) => e.arquivo).join(", "));
  }
}


/* ========================================================================== */
/* LINHA 31 — ONDA 4: zero é um valor, não a ausência de valor.               */
/* ========================================================================== */
{
  // ⚠️ A guarda inteira existe porque o defeito é INVISÍVEL na tela: um zero
  // legítimo e um zero de ignorância são pixel por pixel o mesmo. Só o contrato
  // os separa, e só um teste impede o contrato de ser desfeito por um `?? 0`.
  const VAZIA = janela("2026-09-30", "2026-09-01");
  const semNada: RiskInput = { ...INPUT, movements: [] };
  // Agosto sem nada liquidado — o caso EXATO da Home: saldo negativo ao lado de
  // entradas, saídas e resultado em R$ 0.
  const agostoSeco: RiskInput = {
    ...INPUT, saldoAtual: -31_000,
    movements: [mv("j1", "saida", "pago", 9_000, "2026-07-28", "2026-07-28")],
  };

  /* ---- Janela impossível --------------------------------------------------- */
  for (const [nome, ind] of [
    ["entradas", entradas(INPUT, VAZIA)],
    ["saídas", saidas(INPUT, VAZIA)],
    ["resultado", resultado(INPUT, VAZIA)],
    ["saldo", saldo(INPUT, VAZIA)],
    ["burn", burn(INPUT, VAZIA)],
    ["runway", runway(INPUT, VAZIA)],
  ] as const) {
    ok(`onda4: ${nome} sobre janela impossível é indisponível, não zero`,
       ind.indisponivel?.codigo === "janela_invalida",
       `veio ${ind.indisponivel?.codigo ?? "com valor"}`);
  }

  /* ---- Janela legítima, nada dentro --------------------------------------- */
  const eAgo = entradas(agostoSeco, AGOSTO);
  const sAgo = saidas(agostoSeco, AGOSTO);
  const rAgo = resultado(agostoSeco, AGOSTO);
  ok("onda4: o caso da Home — entradas de um mês sem movimento não são R$ 0",
     eAgo.indisponivel?.codigo === "sem_lancamentos", String(eAgo.valor));
  ok("onda4: idem saídas", sAgo.indisponivel?.codigo === "sem_lancamentos");
  ok("onda4: idem resultado", rAgo.indisponivel?.codigo === "sem_lancamentos");
  // ⚠️ E o saldo CONTINUA sendo número: ele é posição, não período. Marcá-lo
  // indisponível junto seria trocar um erro por outro — apagar o único número
  // verdadeiro da tela.
  ok("onda4: mas o saldo do mesmo instante continua respondendo",
     temValor(saldo(agostoSeco, janelaHoje(HOJE))) && saldo(agostoSeco, janelaHoje(HOJE)).valor === -31_000);
  ok("onda4: cada ausência diz o que fazer",
     [eAgo, sAgo, rAgo].every((i) => (i.indisponivel?.comoResolver ?? "").length > 20));

  /* ---- Zero por empate É resposta ----------------------------------------- */
  const empate: RiskInput = {
    ...INPUT,
    movements: [
      mv("e1", "entrada", "pago", 5_000, "2026-08-04", "2026-08-04"),
      mv("e2", "saida", "pago", 5_000, "2026-08-05", "2026-08-05"),
    ],
  };
  const rEmp = resultado(empate, AGOSTO);
  ok("onda4: zero por EMPATE não é ausência — entrou e saiu o mesmo tanto",
     temValor(rEmp) && rEmp.valor === 0, `${rEmp.valor} / ${rEmp.indisponivel?.codigo ?? "ok"}`);

  /* ---- Silêncio não é boa notícia ----------------------------------------- */
  const bSeco = burn(semNada);
  ok("onda4: sem lançamento nenhum o burn não é zero", bSeco.indisponivel?.codigo === "sem_lancamentos");
  const rwSeco = runway(semNada);
  // ⚠️ A ordem dentro de `runway` decide qual frase sai. Com burn zerado por
  // AUSÊNCIA, um `burn <= 0` conferido antes responderia "a empresa gerou
  // caixa" — uma afirmação sobre a operação, construída a partir de nada.
  ok("onda4: e o runway não diz 'a empresa gerou caixa' quando não sabe de nada",
     rwSeco.indisponivel?.codigo === "sem_lancamentos",
     rwSeco.indisponivel?.codigo ?? "com valor");

  /* ---- Razão sem denominador ---------------------------------------------- */
  const taxaSemBase = inadimplenciaTaxa(semNada);
  ok("onda4: 0% de inadimplência sem nada vencido é ausência de base",
     taxaSemBase.indisponivel?.codigo === "sem_base", String(taxaSemBase.valor));

  /* ---- A ausência atravessa o derivado ------------------------------------ */
  const rwm = runwayMeses(semNada);
  ok("onda4: dividir a ausência por 30 não a transforma em número",
     rwm.indisponivel?.codigo === "sem_lancamentos");
  const arrSeco = arr(semNada);
  ok("onda4: nem multiplicá-la por 12", !!arrSeco.indisponivel);
  ok("onda4: MRR estimado sem receita nenhuma é indisponível",
     mrr(semNada).indisponivel?.codigo === "sem_lancamentos");

  /* ---- As duas leituras da ausência --------------------------------------- */
  // ⚠️ `sem_queima` e `caixa_negativo` produzem o mesmo runway ausente e são o
  // oposto um do outro. Um consumidor que só tivesse a frase precisaria casar
  // substring de português — a fragilidade que este repositório já pagou três
  // vezes. Por isso o CÓDIGO.
  ok("onda4: quem gera caixa recebe 'sem_queima'",
     runway(INPUT).indisponivel?.codigo === "sem_queima");
  const noVermelho: RiskInput = {
    ...INPUT, saldoAtual: -31_000,
    movements: [mv("v1", "entrada", "pago", 50_000, "2026-08-01", "2026-08-01")],
  };
  ok("onda4: quem está no vermelho recebe 'caixa_negativo'",
     runway(noVermelho).indisponivel?.codigo === "caixa_negativo");
  ok("onda4: e a ponte da IA distingue os dois — só o primeiro é contradição",
     ponteRupturaRunway(INPUT, 2).pareceContradicao
     && !ponteRupturaRunway(noVermelho, 2).pareceContradicao);

  /* ---- valorOuNulo é a fronteira ------------------------------------------ */
  ok("onda4: valorOuNulo devolve null, nunca 0, na ausência",
     valorOuNulo(runway(semNada)) === null && valorOuNulo(saldo(INPUT)) === 42_000);
}


/* ========================================================================== */
/* LINHA 31b — ONDA 4: nenhuma TELA lê `.valor` sem perguntar se ele existe.  */
/* ========================================================================== */
{
  // ⚠️ Esta é a guarda que impede a onda de se desfazer sozinha. O contrato
  // está na camada canônica, mas quem o honra é a tela — e o gesto que o
  // desfaz é de UMA linha: `indicador.valor` em vez de `<ValorIndicador>`.
  // Ninguém decide fazer isso; é o que os dedos escrevem, exatamente como o
  // `#fff` que a guarda da paleta persegue.
  //
  // A exceção existe e é declarada COM MOTIVO, porque há usos legítimos: um
  // gráfico precisa de número para desenhar altura de barra, e "sem movimento"
  // num eixo é uma barra ausente — que já é a leitura correta.
  const CANONICOS = [
    "saldo", "saldoInicial", "entradas", "saidas", "resultado", "burn", "runway",
    "runwayMeses", "geracaoCaixaMensal", "mrr", "arr", "inadimplencia",
    "inadimplenciaTaxa", "receitaTributavel", "previstoNaJanela", "previstoDaConta",
  ];
  const EXCECOES_VALOR: { arquivo: string; porque: string }[] = [
    {
      arquivo: "src/components/visao-geral/HomeQuatro.tsx",
      porque: "As barras dos três meses e o saldo-herói. A barra de um mês sem movimento é uma barra AUSENTE, que já é a leitura certa; e saldo é posição, que sempre existe. As três leituras do lado (entradas/saídas/resultado) passaram por ValorIndicador.",
    },
    {
      arquivo: "src/components/relatorios/DemonstrativoView.tsx",
      porque: "Só o saldo, que é posição das contas e não tem estado de ausência. O runway do mesmo cartão já lê o indicador inteiro.",
    },
    {
      arquivo: "src/components/movimentacoes/ConciliacaoView.tsx",
      porque: "previstoDaConta alimenta a comparação por conta na conciliação; ali zero significa 'esta conta não tem previsto', que é o fato e é o que a linha precisa dizer.",
    },
    {
      arquivo: "src/components/boletos/BoletosView.tsx",
      porque: "previstoNaJanela soma boletos a vencer no mês; zero é a resposta certa (nenhum boleto a vencer) e a tela já mostra a lista vazia ao lado.",
    },
    {
      arquivo: "src/components/fiscal/ImpostosView.tsx",
      porque: "A série de 12 meses da base tributável. Um mês sem receita deve mesmo somar zero de imposto — o imposto é sobre o que se faturou, e não faturar nada é a razão certa para não dever nada. Aqui zero é resposta, não ignorância.",
    },
    {
      arquivo: "src/components/vendas/ProjecaoCarga.tsx",
      porque: "A base da projeção de imposto sobre 365 dias; a tela recusa projetar quando a base é zero, com frase própria.",
    },
  ];

  const infratores: string[] = [];
  const padrao = new RegExp(`\\b(${CANONICOS.join("|")})(De)?\\s*\\([^;]*?\\)\\.valor\\b`);
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { varrer(caminho); continue; }
      if (!/\.tsx?$/.test(nome)) continue;
      const rel = caminho.replace(/\\/g, "/");
      if (EXCECOES_VALOR.some((e) => rel.endsWith(e.arquivo))) continue;
      // Comentários fora: este repositório documenta cada defeito citando o
      // código que o causou, e uma guarda que reprova a própria documentação
      // treina quem a lê a ignorá-la.
      const txt = readFileSync(caminho, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      if (padrao.test(txt)) infratores.push(rel);
    }
  };
  varrer("src/components");
  ok("onda4: nenhuma tela lê o valor sem perguntar se ele existe",
     infratores.length === 0, infratores.join(", "));
  const semPorque = EXCECOES_VALOR.filter((e) => e.porque.trim().length < 60);
  ok("onda4: toda exceção de leitura direta tem motivo escrito",
     semPorque.length === 0, semPorque.map((e) => e.arquivo).join(", "));
  // ⚠️ E a exceção tem de apontar para um arquivo que EXISTE: uma lista de
  // dispensas para arquivos apagados vira licença silenciosa quando alguém
  // recria o nome.
  const fantasmas = EXCECOES_VALOR.filter((e) => !existsSync(e.arquivo));
  ok("onda4: nenhuma exceção aponta para arquivo inexistente",
     fantasmas.length === 0, fantasmas.map((e) => e.arquivo).join(", "));
}


/* ========================================================================== */
/* LINHA 31c — ONDA 4: a cascata canônica × o motor do DRE.                  */
/* ========================================================================== */
{
  // ⚠️ Esta é a guarda que impede o remédio de virar a doença. `core/indicadores/
  // resultado` acrescenta o CONTRATO à cascata (dizer quando não sabe), e
  // acrescentar contrato exigiu reescrever a aritmética num segundo lugar —
  // que é exatamente o padrão que a ONDA 1 existe para matar. As duas
  // implementações compartilham o classificador (mesmo módulo, mesmos regex),
  // mas nada além disso as obriga a concordar. Isto obriga.
  const J = janelaMes(2026, 7);
  const rowsDRE = INPUT.movements.filter(
    (m) => m.status !== "cancelado" && (m.due_date ?? "") >= J.de && (m.due_date ?? "") <= J.ate,
  );
  const g = dreGerencial(rowsDRE, "competencia");
  const p = painelResultado(INPUT, J, "competencia");

  const par = (nome: string, canonico: typeof p.ebitda, doDRE: number) => {
    ok(`onda4: ${nome} existe nos dois caminhos`, !canonico.indisponivel,
       canonico.indisponivel?.motivo ?? "");
    if (canonico.indisponivel) return;
    eq(`cruzado: ${nome} canônico == ${nome} do dreGerencial`, canonico.valor, doDRE);
  };
  par("receita bruta", p.receitaBruta, g.receitaBruta);
  par("receita líquida", p.receitaLiquida, g.receitaLiquida);
  par("lucro bruto", p.lucroBruto, g.lucroBruto);
  par("EBITDA", p.ebitda, g.ebitda);
  par("lucro líquido", p.lucroLiquido, g.lucroLiquido);

  /* ─────────────────────────────────────────────────────────────────────────
   * ⚠️ **A RECEITA FINANCEIRA — o dado que faltava para esta guarda provar algo**
   * ─────────────────────────────────────────────────────────────────────────
   *
   * As asserções acima confrontam `painelResultado` com `dreGerencial`, e
   * passavam com os DOIS errados: ambos somavam a receita financeira dentro da
   * receita bruta, então ela atravessava receita líquida, lucro bruto e o
   * **EBITDA** — que por definição exclui o resultado financeiro. Duas
   * implementações só divergem no dado que as separa; sem uma única entrada
   * financeira na fixture, comparar as duas não prova nada.
   *
   * `core/relatorios` sempre esteve certo (a `receita_bruta` exclui o
   * financeiro e o `resultado_financeiro` entra com o sinal do movimento), e é
   * contra ele que as outras duas passam a ser conferidas — com juros no
   * meio, que é a única forma de a comparação ter conteúdo.
   *
   * Provado plantando: devolvendo `receita += m.amount` para toda entrada, as
   * três primeiras asserções deste bloco reprovam.
   */
  {
    const HOJE = "2026-07-15";
    const J2 = janelaMes(2026, 6); // julho — janelaMes é 0-indexado
    const mv = (o: Partial<RiskMovement>): RiskMovement =>
      ({ id: Math.random().toString(36).slice(2), type: "entrada", amount: 1000,
         due_date: "2026-07-10", paid_date: "2026-07-10", status: "pago",
         category: "Vendas", party_id: null, ...o }) as RiskMovement;
    const movs = [
      mv({ amount: 100_000, category: "Vendas de produtos" }),
      mv({ amount: 30_000, category: "Rendimento de aplicação" }),   // receita FINANCEIRA
      mv({ type: "saida", amount: 20_000, category: "Fornecedores" }),
      mv({ type: "saida", amount: 10_000, category: "Folha de pagamento" }),
      mv({ type: "saida", amount: 2_000, category: "Tarifas bancárias" }), // despesa financeira
    ];
    const inp = { hoje: HOJE, saldoAtual: 0, partyNames: {}, movements: movs } as unknown as RiskInput;

    const cas = cascataDRE(inp, { intervalo: { de: J2.de, ate: J2.ate } });
    const gf = dreGerencial(movs);
    const pf = painelResultado(inp, J2, "competencia");

    eq("financeira: receita bruta do dreGerencial == a de core/relatorios (100k, sem os juros)",
       gf.receitaBruta, cas.linhas.receita_bruta.valor);
    eq("financeira: receita bruta canônica == a de core/relatorios",
       pf.receitaBruta.valor, cas.linhas.receita_bruta.valor);
    // ⚠️ A asserção que nomeia o defeito: EBITDA exclui o resultado financeiro.
    // Com o juros dentro da receita, ele saía 30.000 maior.
    eq("financeira: EBITDA do dreGerencial == o de core/relatorios (juros FORA)",
       gf.ebitda, cas.linhas.ebitda.valor);
    ok("financeira: os juros não estão dentro da receita bruta",
       Math.abs(gf.receitaBruta - 100_000) < 1e-6, `receitaBruta=${gf.receitaBruta}`);
    // E a contrapartida: eles não somem — aparecem no resultado financeiro,
    // com os dois lados (30.000 de receita − 2.000 de tarifa = +28.000).
    eq("financeira: o resultado financeiro tem os DOIS lados (+28.000)",
       cas.linhas.resultado_financeiro.valor, 28_000);
  }
  /*
   * ⚠️ As margens do `dreGerencial` viraram `Indicador` — sem receita líquida
   * não existe margem, e o tipo passou a poder dizer isso. A comparação
   * continua a mesma, agora nos dois lados: os DOIS caminhos têm de concordar
   * inclusive sobre EXISTIR.
   */
  const parMargem = (nome: string, canonico: typeof p.ebitda, doDRE: typeof g.margemEbitda) => {
    ok(`onda4: ${nome} concorda sobre EXISTIR nos dois caminhos`,
       !!canonico.indisponivel === !!doDRE.indisponivel,
       `canônico=${canonico.indisponivel?.codigo ?? "tem"} dre=${doDRE.indisponivel?.codigo ?? "tem"}`);
    if (canonico.indisponivel || doDRE.indisponivel) return;
    eq(`cruzado: ${nome} canônico == ${nome} do dreGerencial`, canonico.valor, doDRE.valor);
  };
  parMargem("margem EBITDA", p.margemEbitda, g.margemEbitda);
  parMargem("margem bruta", p.margemBruta, g.margemBruta);

  // E a cascata canônica fecha sobre si mesma — as identidades por escrito.
  eq("onda4: receita líquida == bruta − deduções",
     p.receitaLiquida.valor, p.receitaBruta.valor - p.deducoes.valor);
  eq("onda4: lucro bruto == receita líquida − custo",
     p.lucroBruto.valor, p.receitaLiquida.valor - p.custo.valor);
  eq("onda4: EBITDA == lucro bruto − despesa operacional",
     p.ebitda.valor, p.lucroBruto.valor - p.despesaOperacional.valor);

  /* ---- E o contrato, nos casos que a especificação nomeia ---------------- */
  const semNada: RiskInput = { ...INPUT, movements: [] };
  for (const [nome, ind] of [
    ["receita bruta", receitaBruta(semNada)],
    ["deduções", deducoes(semNada)],
    ["receita líquida", receitaLiquida(semNada)],
    ["custo", custo(semNada)],
    ["despesa operacional", despesaOperacional(semNada)],
    ["EBITDA", ebitda(semNada)],
  ] as const) {
    ok(`onda4: ${nome} sem lançamento é ausência, não R$ 0`,
       ind.indisponivel?.codigo === "sem_lancamentos", String(ind.valor));
  }

  // ⚠️ A MARGEM é o caso mais perigoso da onda: "0%" lê como "vendeu e não
  // sobrou nada" — a notícia ruim — quando a verdade é "não vendeu". As duas
  // mandam o dono fazer coisas OPOSTAS: cortar custo × vender.
  const soDespesa: RiskInput = {
    ...INPUT,
    movements: [mv("d1", "saida", "pago", 12_000, "2026-08-05", "2026-08-05", "Folha", "F")],
  };
  const mg = margem(soDespesa, "ebitda", AGOSTO);
  ok("onda4: margem sem receita é ausência de BASE, não 0%",
     mg.indisponivel?.codigo === "sem_base", `${mg.valor} / ${mg.indisponivel?.codigo ?? "com valor"}`);
  ok("onda4: e o motivo explica que prejuízo não é margem negativa",
     /raz[ãa]o sobre a receita/i.test(mg.indisponivel?.motivo ?? ""), mg.indisponivel?.motivo ?? "");

  /* ---- Estoque de títulos: POSIÇÃO, e zero é resposta -------------------- */
  const est = estoqueDeTitulos(INPUT, "entrada");
  ok("onda4: o estoque de títulos existe e é projeção", !est.indisponivel && est.procedencia.natureza === "projecao");
  eq("cruzado: estoque de títulos == soma dos previstos de entrada",
     est.valor,
     DATASET.filter((m) => m.type === "entrada" && m.status === "pendente")
       .reduce((s, m) => s + magnitude(m), 0));
  ok("onda4: sem título nenhum daquele lado, é ausência",
     estoqueDeTitulos(semNada, "entrada").indisponivel?.codigo === "sem_lancamentos");

  /* ---- Churn: sem base anterior, retenção perfeita é MENTIRA ------------- */
  const jJul = janelaMes(2026, 6), jAgo = janelaMes(2026, 7);
  const primeiroMes: RiskInput = {
    ...INPUT,
    movements: [mv("c1", "entrada", "pago", 3_000, "2026-08-04", "2026-08-04", "Vendas", "A")],
  };
  const ch = churn(primeiroMes, jAgo, jJul);
  ok("onda4: churn sem carteira anterior é ausência, não 0% de perda",
     ch.indisponivel?.codigo === "sem_base", String(ch.valor));
  // Com carteira dos dois lados, ele responde — e responde o que se espera.
  const carteira: RiskInput = {
    ...INPUT,
    movements: [
      mv("k1", "entrada", "pago", 1_000, "2026-07-05", "2026-07-05", "Vendas", "A"),
      mv("k2", "entrada", "pago", 1_000, "2026-07-06", "2026-07-06", "Vendas", "B"),
      mv("k3", "entrada", "pago", 1_000, "2026-08-05", "2026-08-05", "Vendas", "A"),
    ],
  };
  eq("onda4: churn de 1 em 2 clientes é 0,5", churn(carteira, jAgo, jJul).valor, 0.5);

  /* ---- Posição consolidada: empresa que não respondeu não vale zero ------ */
  const grupo = [
    { nome: "Holding", input: INPUT },
    { nome: "Operadora", input: { ...INPUT, saldoAtual: 10_000 } as RiskInput },
  ];
  eq("onda4: consolidado == soma dos saldos", posicaoConsolidada(grupo).valor, SALDO + 10_000);
  // ⚠️ É o defeito na forma mais cara: o consolidado sai menor que a realidade
  // com a cara de completo, e é esse número que vai ao banco pedir crédito.
  const faltando = posicaoConsolidada(grupo, ["Operadora"]);
  ok("onda4: empresa que não respondeu não vale zero no consolidado",
     faltando.indisponivel?.codigo === "sem_base", String(faltando.valor));
  ok("onda4: e o motivo NOMEIA quem faltou",
     (faltando.indisponivel?.motivo ?? "").includes("Operadora"), faltando.indisponivel?.motivo ?? "");
}


/* ========================================================================== */
/* LINHA 31e — PERÍMETRO: a área da plataforma nega em TRÊS camadas.         */
/* ========================================================================== */
{
  /**
   * ⚠️ **O relato era "abri /admin de uma sessão comum e vi tudo".** Ele não se
   * confirmou como vazamento: a conta usada no teste É o único dono de
   * plataforma cadastrado. Medido em produção com um `member` de verdade, e
   * repetido para cinco perfis × cinco alvos, **25 de 25 negados** — o banco
   * sempre trancou.
   *
   * ⚠️ **O que faltava era o 403 no PERÍMETRO.** `/admin` respondia 200 para
   * qualquer autenticado, entregava o pacote do painel e deixava o CLIENTE
   * decidir mostrar "Acesso restrito". Decisão de acesso no cliente é
   * apresentação, não controle: quem baixou o pacote leva a planta da área
   * (nomes de RPC, campos, forma da tela) sem ter a chave.
   *
   * Esta guarda cobra as TRÊS camadas. Nenhuma é redundante: o middleware pode
   * deixar de cobrir uma rota nova, o server component pega o que escapar dele,
   * e o banco é o único que continua valendo se os dois falharem.
   */
  const mw = ler("src/middleware.ts");
  ok("plataforma: o middleware bloqueia /admin e /api/admin",
     /pathname === "\/admin"/.test(mw) && /\/api\/admin\//.test(mw)
     && /ehDonoDaPlataforma/.test(mw));
  ok("plataforma: e responde 403, não redirecionamento",
     /status: 403/.test(mw),
     "um redirect esconde a recusa e sugere que outra sessão resolveria");

  const pag = ler("src/app/admin/page.tsx");
  ok("plataforma: a página de /admin confere no SERVIDOR",
     !/^"use client"/m.test(pag) && /is_platform_admin/.test(pag),
     "a página era 'use client' e só o cliente decidia");

  /**
   * ⚠️ **Falha FECHADA nas duas camadas.** Um perímetro que abre quando a
   * checagem falha abre exatamente quando o sistema está pior.
   */
  const mwHelper = ler("src/lib/supabase/middleware.ts");
  ok("plataforma: a checagem falha FECHADA (erro ⇒ nega)",
     /export async function ehDonoDaPlataforma[\s\S]{0,600}?catch \{\s*return false;/.test(mwHelper)
     && /catch \{ dono = false; \}/.test(pag));

  /**
   * ⚠️ **Os DOIS papéis precisam ter nomes diferentes na tela.** São 16
   * admins/owners de organização e 1 dono de plataforma, em tabelas separadas —
   * mas ambos se chamavam "admin", e foi essa ambiguidade que fez a auditoria
   * concluir invasão onde havia acesso legítimo. Um controle que ninguém
   * consegue nomear é um controle que ninguém consegue auditar.
   */
  const nav = ler("src/components/dashboard/nav-data.ts");
  const av = ler("src/components/admin/AdminView.tsx");
  ok("plataforma: o menu distingue dono da plataforma de admin de organização",
     /Dono da plataforma/.test(nav) && !/label: "Administração", desc: "Todos os clientes/.test(nav));
  ok("plataforma: a recusa na tela EXPLICA que são papéis diferentes",
     /papel diferente de administrador da sua empresa/i.test(av));
}

/* ========================================================================== */
/* LINHA 31d — CONTRATO: o cartão do DRE == a linha da tabela.               */
/* ========================================================================== */
{
  /**
   * ⚠️ **O defeito que esta guarda fixa.** Na tela `/dashboard/reports/dre`, os
   * cartões do topo e a tabela abaixo discordavam: os cartões saíam de
   * `painelResultado`, cuja base soma TODA entrada em `receita` — inclusive a
   * financeira — enquanto a tabela sempre excluiu o financeiro da Receita Bruta.
   * Receita Líquida e EBITDA dos cartões vinham inflados **exatamente pela
   * receita financeira do período**.
   *
   * ⚠️ **Por que nenhuma guarda pegou.** A LINHA 31c compara a cascata canônica
   * com `dreGerencial` — e os dois compartilham a MESMA base errada
   * (`core/dre/engine.ts:65`, `receita += m.amount`). Duas implementações
   * erradas do mesmo jeito concordam perfeitamente. É a terceira guarda desta
   * base a passar por coincidência, e a mais cara: ela cobria a tela em que o
   * número vira decisão.
   *
   * ⚠️ **E o Lucro Líquido BATIA**, o que fazia a divergência parecer
   * impossível: os cartões somavam a receita financeira em cima e subtraíam a
   * despesa financeira embaixo; a tabela deixava as duas no meio. Os dois
   * chegam ao mesmo fim por caminhos diferentes.
   */
  const linhaDaTabela = (r: ReturnType<typeof montarDRE>, id: string) =>
    r.linhas.find((l) => l.id === id)?.total.valor ?? NaN;

  /* ---- 1. Para QUALQUER período e filtro, cartão == linha ---------------- */
  const PERIODOS = [
    { de: "2026-08-01", ate: "2026-08-31" },
    { de: "2025-09-01", ate: "2026-08-31" },
    { de: "2026-01-01", ate: "2026-12-31" },
    { de: "2026-06-01", ate: "2026-06-30" },
  ];
  const FILTROS: { nome: string; f: Record<string, unknown> }[] = [
    { nome: "sem filtro", f: {} },
    { nome: "por conta", f: { conta: "acc-1" } },
    { nome: "por centro", f: { centro: "Comercial" } },
  ];
  const PARES: [string, string][] = [
    ["Receita líquida", "receita_liquida"],
    ["EBITDA", "ebitda"],
    ["Lucro líquido", "resultado_liquido"],
  ];
  for (const intervalo of PERIODOS) {
    for (const { nome, f } of FILTROS) {
      // ⚠️ `regime` explícito: a cascata declara que ele é obrigatório e sem
      // padrão, e omiti-lo aqui atravessava o tipo pelo spread.
      const c = cascataDRE(INPUT, { intervalo, regime: "competencia", ...f });
      const tab = montarDRE(INPUT, { intervalo, tipo: "vertical", ...f });
      for (const [rotulo, id] of PARES) {
        const doCartao = c.linhas[id as keyof typeof c.linhas];
        if (doCartao.indisponivel) continue;
        eq(`contrato-dre: cartão "${rotulo}" == linha da tabela (${intervalo.de}..${intervalo.ate}, ${nome})`,
           doCartao.valor, linhaDaTabela(tab, id));
      }
    }
  }

  /* ---- 2. As regras que a especificação nomeia --------------------------- */
  const cRef = cascataDRE(INPUT, { intervalo: { de: "2025-09-01", ate: "2026-08-31" } });
  for (const r of REGRAS_CASCATA) {
    eq(`contrato-dre: ${r.nome}`, r.diferenca(cRef), 0);
  }

  /* ---- 3. O CASO QUE O DEFEITO ESCONDIA: financeiro inverte o sinal ------ */
  /**
   * ⚠️ Este é o caso que dá valor à guarda inteira. Uma operação que PERDE
   * dinheiro (EBITDA negativo) mas tem uma receita financeira grande — resgate
   * de aplicação, juros de um caixa parado — aparecia com **EBITDA positivo**
   * nos cartões. O dono lia "a operação deu lucro" quando ela deu prejuízo, e
   * o número que o desmentiria (a tabela) estava logo abaixo, discordando.
   */
  const OPERACAO_NO_PREJUIZO: RiskMovement[] = [
    mv("v1", "entrada", "pago", 100_000, "2026-08-05", "2026-08-05", "Vendas", "C1"),
    mv("f1", "saida", "pago", 260_000, "2026-08-05", "2026-08-05", "Folha de pagamento", "F1"),
    // A receita financeira, sozinha, maior que o buraco da operação.
    mv("j1", "entrada", "pago", 400_000, "2026-08-10", "2026-08-10", "Juros recebidos", "B1"),
  ];
  const inputPrejuizo: RiskInput = { ...INPUT, movements: OPERACAO_NO_PREJUIZO };
  const jan = { de: "2026-08-01", ate: "2026-08-31" };
  const cp = cascataDRE(inputPrejuizo, { intervalo: jan });
  const tp = montarDRE(inputPrejuizo, { intervalo: jan, tipo: "vertical" });

  eq("contrato-dre: com juros grandes, EBITDA do cartão == o da tabela",
     cp.linhas.ebitda.valor, linhaDaTabela(tp, "ebitda"));
  eq("contrato-dre: e vale −160.000 (100k de venda − 260k de folha)",
     cp.linhas.ebitda.valor, -160_000);
  ok("contrato-dre: o EBITDA continua NEGATIVO apesar dos R$ 400.000 de juros",
     cp.linhas.ebitda.valor < 0, String(cp.linhas.ebitda.valor));
  eq("contrato-dre: a receita financeira está na linha dela, não na receita",
     cp.linhas.resultado_financeiro.valor, 400_000);
  eq("contrato-dre: e a Receita Bruta NÃO a contém",
     cp.linhas.receita_bruta.valor, 100_000);
  // E o lucro líquido continua fechando — é ele que sempre batia.
  eq("contrato-dre: lucro líquido == EBITDA + resultado financeiro",
     cp.linhas.resultado_liquido.valor, -160_000 + 400_000);

  /**
   * A fórmula ANTIGA, reproduzida aqui para mostrar o que se perdia: somando a
   * receita financeira na receita, o EBITDA sairia +240.000 — POSITIVO — sobre
   * a mesma operação que perdeu R$ 160.000.
   */
  const comoEra = (100_000 + 400_000) - 260_000;
  ok("contrato-dre: a fórmula antiga inverteria o sinal (prova do que se corrigiu)",
     comoEra > 0 && cp.linhas.ebitda.valor < 0, `antiga ${comoEra} × atual ${cp.linhas.ebitda.valor}`);

  /* ---- 4. Margem: denominador zero é ausência, não 0% -------------------- */
  const soDespesaDRE: RiskInput = {
    ...INPUT,
    movements: [mv("d9", "saida", "pago", 5_000, "2026-08-05", "2026-08-05", "Folha de pagamento", "F")],
  };
  const cm = cascataDRE(soDespesaDRE, { intervalo: jan });
  ok("contrato-dre: margem EBITDA sem receita líquida é AUSÊNCIA, não 0%",
     cm.margemEbitda.indisponivel?.codigo === "sem_base",
     String(cm.margemEbitda.indisponivel?.codigo ?? cm.margemEbitda.valor));

  /* ---- 5. A tela não pode voltar a ter duas contas ----------------------- */
  const telaDRE = ler("src/components/relatorios/DemonstrativoView.tsx");
  ok("contrato-dre: os cartões leem a cascata única, não uma segunda agregação",
     /cascataDRE\(/.test(telaDRE) && !/painelResultado\(/.test(telaDRE));
  ok("contrato-dre: todo cartão de valor recebe a cor de prejuízo",
     (telaDRE.match(/tom: tomDe\(/g) ?? []).length >= 5);
}


/* ========================================================================== */
/* LINHA 32 — ONDA 5: taxonomia, catálogo e higiene de dados.                */
/* ========================================================================== */
{
  /* ---- O vocabulário é único e está em português ------------------------ */
  ok("onda5: todo valor de domínio é chave bem formada",
     valoresBemFormados().length === 0, valoresBemFormados().join(", "));
  ok("onda5: todo valor de domínio tem rótulo em português",
     valoresSemRotulo().length === 0, valoresSemRotulo().join(", "));

  // ⚠️ EMPRÉSTIMO LINGUÍSTICO NÃO É INGLÊS. O primeiro detector acusou
  // "Assinaturas / software" — e um detector que grita lobo é um detector que
  // ninguém lê, que é o mesmo defeito do detector de segredos da Ajuda. Estas
  // são as frases que um financeiro escreve o dia inteiro.
  //
  // ⚠️ E a lista de empréstimos precisa fazer TRABALHO, não decorar. Medido: a
  // primeira versão desta guarda só testava "software" e "marketing", que
  // sequer estão no vocabulário inglês — desligar `EMPRESTIMOS` inteiro não
  // fazia a guarda falhar, então ela não testava nada. A palavra que a lista
  // realmente protege é `internet`: ela É chave do de-para (Utilidades) e É
  // português corrente. É por ela que a guarda tem de passar.
  for (const bom of [
    "Internet", "Telefone e internet", "Provedor de internet",
    "Assinaturas / software", "Marketing digital", "Site e e-mail",
    "Design e layout", "Delivery", "Notebook", "Backup em cloud",
  ]) {
    ok(`onda5: "${bom}" NÃO é acusado de inglês`, !pareceIngles(bom));
  }
  for (const ruim of ["Salary", "Electricity", "Telecommunications", "Bank Fees", "Other Expenses"]) {
    ok(`onda5: "${ruim}" é acusado de inglês`, pareceIngles(ruim));
  }
  ok("onda5: o de-para traduz o que conhece",
     traduzirCategoria("Electricity") === "Utilidades"
     && traduzirCategoria("Salary") === "Folha de pagamento");
  // ⚠️ E NÃO inventa: um palpite de tradução numa categoria contábil move
  // dinheiro de linha no DRE.
  ok("onda5: o de-para não inventa tradução",
     traduzirCategoria("Zorblax Holdings") === null);

  /* ---- Extrato não é título --------------------------------------------- */
  ok("onda5: extrato NÃO é origem de título", !ehOrigemDeTitulo("extrato"));
  for (const o of ["venda", "contrato", "importacao", "manual", "conciliacao"]) {
    ok(`onda5: "${o}" é origem de título`, ehOrigemDeTitulo(o));
  }

  /*
   * ⚠️ TETO ZERO: NENHUM ESCRITOR DE `movements` SEM `origem`.
   *
   * A ONDA 5 pôs a fechadura no BANCO — `titulo_exige_origem()` recusa com
   * `A4P05` — e não conferiu quem tinha a chave. Dois escritores ficaram sem
   * ela, e o custo foi assimétrico: `createLancamento` derrubava TODA gravação
   * manual em produção (o formulário de nova conta a pagar, o painel Criar,
   * receita e despesa), e o gerador de faturas recorrentes falhava dentro de um
   * cron, onde o vestígio é um contador que ninguém abre.
   *
   * Uma regra que vive só no banco é meia regra: o servidor recusa, mas nada no
   * repositório reprova o escritor que nasce sem o campo — e a recusa aparece
   * meses depois, na tela de um cliente, como "o botão não funciona".
   *
   * ⚠️ A varredura pega o `.insert(` em `movements` e exige `origem` no MESMO
   * bloco. `upsert` de ingestão fica de fora porque a ingestão já carrega a sua
   * (`fdip`/`ingestao`), e um `update` não dispara o gatilho — ele é `BEFORE
   * INSERT`, de propósito: exigir retroativamente reprovaria toda edição de
   * lançamento antigo.
   */
  {
    /*
     * ⚠️ A JANELA É A FUNÇÃO INTEIRA, não o que vem DEPOIS do `.insert(`.
     *
     * A primeira versão olhava 1400 caracteres à frente e acusou três
     * escritores CORRETOS (`cadastros`, `pos-venda`, `reembolsos`): os três
     * montam a linha em cima e passam `rows` para o insert, então a `origem`
     * está ATRÁS do ponto de casamento. É o mesmo defeito de direção que a
     * ONDA 10 já tinha cometido na varredura de cálculo em tela — e uma guarda
     * que reprova o código certo é desligada na primeira semana.
     *
     * Uma janela simétrica em torno do `.insert(` resolveria a direção e abriria
     * um falso NEGATIVO: um escritor sem `origem` passaria emprestado a do
     * vizinho. Recortar pela função dá o escopo exato.
     */
    const INICIO_FUNCAO = /\n(?:export\s+)?(?:async\s+)?function\s|\n(?:export\s+)?const\s+\w+\s*=/g;
    const escopoDe = (txt: string, ate: number): string => {
      let de = 0;
      INICIO_FUNCAO.lastIndex = 0;
      for (const m of txt.matchAll(INICIO_FUNCAO)) {
        if ((m.index ?? 0) >= ate) break;
        de = m.index ?? 0;
      }
      return txt.slice(de, ate + 900);
    };
    /**
     * A ÚNICA exceção, declarada com motivo: `createLancamento` insere um
     * `rows` vindo de `buildMovementRows`, que é outra função — e ela é
     * conferida pelo nome na asserção seguinte, que é mais forte que a
     * varredura.
     */
    const DECLARADAS = new Set(["src/lib/data.ts"]);
    const semOrigem: string[] = [];
    for (const arq of varrerArquivos("src", /\.(ts|tsx)$/)) {
      if (DECLARADAS.has(arq.replace(/\\/g, "/"))) continue;
      const txt = ler(arq);
      for (const m of txt.matchAll(/from\("movements"\)[\s\S]{0,120}?\.insert\(/g)) {
        const fim = (m.index ?? 0) + m[0].length;
        if (!/\borigem\s*:/.test(escopoDe(txt, fim))) {
          semOrigem.push(`${arq}:${txt.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    const rows = /function buildMovementRows[\s\S]{0,3200}?\n}/.exec(ler("src/lib/data.ts"));
    ok("onda5: nenhum escritor de movements grava sem origem",
       semOrigem.length === 0, semOrigem.join(" | "));
    ok("onda5: buildMovementRows carrega a origem",
       !!rows && /\borigem\s*:/.test(rows[0]));
  }

  /* ---- A4P-077: o webhook da OWN, endurecido no que não depende dela ------ */
  {
    const wh = ler("supabase/functions/own-webhook/index.ts");
    // ⚠️ Comentários fora ANTES da busca: este arquivo EXPLICA o defeito citando
    // o nome da variável que o causou, e uma guarda que reprova a documentação
    // da correção treina quem a lê a ignorá-la.
    const codigo = wh.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

    ok("a4p077: o webhook não lê segredo da query string",
       !/searchParams\.get\(\s*["']secret["']\s*\)/.test(codigo) &&
       !/OWN_WEBHOOK_SECRET/.test(codigo),
       "o ?secret= voltou — query string vaza em log, proxy e Referer");

    ok("a4p077: o segredo é comparado em tempo constante",
       /igualEmTempoConstante\(/.test(codigo) && !/atob\(h\.slice\(6\)\)\s*===/.test(codigo));

    // ⚠️ **A POSIÇÃO É MEDIDA DENTRO DO HANDLER, não no arquivo.** A primeira
    // versão comparava `indexOf("origemBloqueada(")` no arquivo inteiro — e o
    // nome aparece antes de tudo, na DEFINIÇÃO da função. A asserção passava
    // com a chamada em qualquer lugar: media a definição, não o call site.
    // Descoberto plantando o defeito e vendo a guarda NÃO falhar.
    const handler = codigo.slice(codigo.indexOf("Deno.serve("));
    const iLimite = handler.indexOf("origemBloqueada(origem)");
    const iCorpo = handler.indexOf("await req.text()");
    ok("a4p077: o limite por origem é cobrado ANTES de ler o corpo",
       iLimite >= 0 && iCorpo >= 0 && iLimite < iCorpo,
       `limite=${iLimite} corpo=${iCorpo}`);
    ok("a4p077: só a tentativa que FALHA é contada (tráfego legítimo não paga)",
       /registrarFalha\(/.test(codigo));

    ok("a4p077: o caminho HMAC existe e assina corpo + timestamp",
       /crypto\.subtle\.sign\("HMAC"/.test(codigo) && /x-own-timestamp/.test(codigo));
    ok("a4p077: o HMAC desliga por AUSÊNCIA de segredo (não por flag solta)",
       /OWN_WEBHOOK_HMAC_SECRET/.test(codigo) && /if \(!segredo\) return null/.test(codigo));
    ok("a4p077: a assinatura tem janela de replay (não vale para sempre)",
       /5 \* 60_000|300_000/.test(codigo));
    ok("a4p077: o HMAC assina os BYTES recebidos, não um objeto reserializado",
       /await req\.text\(\)/.test(codigo));
  }

  /* ---- UMA MORADA SÓ PARA A ALÇADA (a 4ª guarda da dupla morada) --------- */
  {
    const fora = escritasDeAlcadaForaDaMorada();
    ok("alcada: teto ZERO — ninguém escreve alçada fora de central_alcada",
       fora.length === 0, fora.join(" | "));

    // A conversão de faixa que estava errada, fixada por VALOR — era ela que
    // fazia "R$50 mil" virar 50 e "Sem limite" virar 0 (a inversão exata).
    ok("alcada: R$50 mil vale 50.000, não 50", tetoDaFaixa("R$50 mil") === 50_000,
       String(tetoDaFaixa("R$50 mil")));
    ok("alcada: R$10 mil vale 10.000", tetoDaFaixa("R$10 mil") === 10_000);
    ok("alcada: R$500 mil vale 500.000", tetoDaFaixa("R$500 mil") === 500_000);
    ok("alcada: 'Sem limite' é NULL (sem teto), nunca 0",
       tetoDaFaixa("Sem limite") === null, String(tetoDaFaixa("Sem limite")));
    // ⚠️ A ausência é FECHADA: rótulo desconhecido não pode virar "sem teto".
    ok("alcada: rótulo desconhecido fecha (0), não abre",
       tetoDaFaixa("qualquer coisa") === 0 && tetoDaFaixa(undefined) === 0);

    // "Pode aprovar" define o PAPEL — com a Blindagem B é ele que decide QUEM.
    ok("alcada: quem aprova vira 'aprovador'; quem não, 'lancador'",
       papelDoParticipante({ aprovaPagamentos: true }) === "aprovador" &&
       papelDoParticipante({ aprovaPagamentos: false }) === "lancador");

    // O onboarding só define teto para QUEM APROVA.
    const so = alcadaDoOnboarding([
      { aprovaPagamentos: false, limite: "R$500 mil" },
      { aprovaPagamentos: true, limite: "R$10 mil" },
    ]);
    ok("alcada: limite de quem NÃO aprova é ignorado (não vira morada nova)",
       so.tetos.length === 1 && so.tetos[0].papel === "aprovador" && so.tetos[0].teto === 10_000,
       JSON.stringify(so.tetos));

    // ⚠️ Dois aprovadores com limites diferentes não cabem numa alçada por
    // papel: fica o MAIOR (o menor bloquearia quem o dono quis liberar) e o
    // conflito é DEVOLVIDO — escolha silenciosa é a pessoa descobrindo o teto
    // no dia em que precisa aprovar.
    const dois = alcadaDoOnboarding([
      { aprovaPagamentos: true, limite: "R$10 mil" },
      { aprovaPagamentos: true, limite: "R$500 mil" },
    ]);
    ok("alcada: dois aprovadores → fica o MAIOR teto",
       dois.tetos[0]?.teto === 500_000, JSON.stringify(dois.tetos));
    ok("alcada: e o conflito é DEVOLVIDO, não resolvido em silêncio",
       dois.conflitos.length === 1 && dois.conflitos[0].ignorados.length === 1,
       JSON.stringify(dois.conflitos));
    const semTeto = alcadaDoOnboarding([
      { aprovaPagamentos: true, limite: "R$500 mil" },
      { aprovaPagamentos: true, limite: "Sem limite" },
    ]);
    ok("alcada: 'Sem limite' vence qualquer número",
       semTeto.tetos[0]?.teto === null, JSON.stringify(semTeto.tetos));

    // ⚠️ A asserção que substitui a varredura larga: a resposta do onboarding
    // NÃO pode voltar ao perfil. Cobra o strip no ponto exato onde ele importa.
    const wiz = ler("src/components/onboarding/OnboardingWizard.tsx");
    ok("alcada: o onboarding REMOVE limite antes de persistir o perfil",
       /limite:\s*_limite,\s*\.\.\.resto/.test(wiz) && /persistCompany\(\{[^}]*participantes:\s*semLimite/.test(wiz),
       "o strip antes de persistCompany sumiu");
    ok("alcada: o onboarding grava a alçada em central_alcada",
       /aplicarAlcadaDoOnboarding\(alcadaDoOnboarding\(participantes\)\)/.test(wiz));
    const tipo = ler("src/core/onboarding/index.ts");
    ok("alcada: Participante.limite está deprecado e opcional",
       /@deprecated/.test(tipo) && /limite\?:\s*string/.test(tipo));
    const gov = ler("src/lib/governance.ts");
    ok("alcada: a tela de Usuários não converte mais faixa para approval_limit",
       !/parseLimite/.test(gov.replace(/\/\/.*$/gm, "")));

    // A coluna aposentada tem de estar DECLARADA como tal no banco.
    const mig = ler("supabase/migrations/20260819140000_alcada_morada_unica.sql");
    ok("alcada: approval_limit está marcada como deprecada na migration",
       /comment on column public\.organization_members\.approval_limit/.test(mig) &&
       /DEPRECADA/.test(mig));
    ok("alcada: a RPC org_member_update NÃO grava mais approval_limit",
       /org_member_update/.test(mig) && !/set[\s\S]{0,400}approval_limit\s*=/.test(mig));
  }

  /* ---- O EXTRATO PRECISA ENTRAR: todo conector tem AGENDAMENTO ----------- */
  {
    // ⚠️ **O achado que motivou esta guarda.** Medido em 19/08: 3 pluggy_items
    // com status UPDATED (saudável), última sincronização em 23/06 — quase dois
    // meses parada — e as 52 bank_transactions são exatamente a janela de UMA
    // sincronização, a do dia da conexão. A integração não estava quebrada:
    // **rodou uma vez e nunca mais**, porque o caminho ativo só é invocado no
    // `onSuccess` do widget e não havia cron nenhum para o Open Finance.
    //
    // ⚠️ E é isso que explica a conciliação em 5,5%: 889 lançamentos
    // liquidados contra 52 transações. O casador não tem com o que casar.
    const vercel = JSON.parse(ler("vercel.json")) as { crons?: { path: string; schedule: string }[] };
    const caminhos = (vercel.crons ?? []).map((c) => c.path);
    ok("extrato: o Open Finance tem cron declarado (senão o extrato para de entrar)",
       caminhos.includes("/api/openfinance/sync"), caminhos.join(" | "));

    // ⚠️ **A CADÊNCIA É DÍVIDA DECLARADA, NÃO ESCOLHA.** O dono pediu duas vezes
    // ao dia — extrato de ontem faz o cliente conferir no banco antes de confiar,
    // e aí o ERP virou a segunda opinião em vez da fonte. A Vercel RECUSOU o
    // deploy: "Hobby accounts are limited to daily cron jobs".
    //
    // ⚠️ A guarda passou a cobrar o que É invariante (o extrato TEM de ser
    // puxado) em vez do que a plataforma proíbe. Manter a asserção da cadência
    // deixaria o CI vermelho por um limite de plano — e guarda que reprova o
    // possível é desligada na primeira semana. A cadência volta quando o plano
    // subir para Pro ou quando o agendamento migrar para o pg_cron do Supabase,
    // que não tem esse teto.
    const doOF = (vercel.crons ?? []).find((c) => c.path === "/api/openfinance/sync");
    ok("extrato: o cron do Open Finance existe e é diário no mínimo",
       !!doOF && /^0 \d/.test(doOF.schedule), doOF?.schedule ?? "(sem cron)");

    // ⚠️ **O ETL PRECISA DIZER QUE É EXTRATO, senão o banco RECUSA cada linha.**
    // Medido em 19/08: nenhum dos dois ETLs do Pluggy mandava `especie` nem
    // `origem`, e `titulo_exige_origem()` (ONDA 5) recusa com A4P05 todo
    // lançamento sem procedência. Os 52 movements que existem nasceram em 23/06,
    // ANTES da trava — e desde então nenhum lançamento novo do Open Finance
    // conseguia entrar. Pior: o `catch` do ETL só trata 23505, então o A4P05
    // caía num console.error dentro de uma Edge Function que ninguém abre.
    for (const f of ["supabase/functions/pluggy-sync-item/index.ts",
                     "supabase/functions/pluggy-webhook/index.ts"]) {
      const etl = ler(f);
      const insert = etl.slice(etl.indexOf('from("movements").insert'));
      ok(`extrato: ${f.split("/")[2]} declara especie=extrato no insert`,
         /especie:\s*["']extrato["']/.test(insert.slice(0, 1500)),
         "o ETL voltaria a ser recusado pela trava de procedência");
    }

    const rota = ler("src/app/api/openfinance/sync/route.ts");
    // ⚠️ Não reimplementa o ETL: chama a MESMA Edge Function que o widget usa.
    // Um segundo ETL divergiria no dia em que o Pluggy mudasse um campo, e o
    // extrato entraria diferente conforme a hora do dia.
    ok("extrato: o cron reusa o ETL do widget, não reimplementa",
       /functions\.invoke\(\s*["']pluggy-sync-item["']/.test(rota));
    // ⚠️ Falha silenciosa foi o que deixou dois meses passarem sem ninguém
    // notar — a mesma família do materializador parado por oito dias.
    ok("extrato: a falha por item é RELATADA, não engolida",
       /falhas/.test(rota) && /audit_log/.test(rota) &&
       /resultados\.push\(\{ item: id, ok: false/.test(rota),
       "o sync voltou a engolir falha");
    ok("extrato: o cron é protegido por CRON_SECRET quando definido",
       /CRON_SECRET/.test(rota) && /Bearer \$\{secret\}/.test(rota));
  }

  /* ---- O CONTADOR EXTERNO: lê e exporta, não escreve e não vê cobrança ---- */
  {
    // ⚠️ Metade deste item JÁ ESTAVA FEITA e foi refutada em vez de refeita: a
    // guarda de banco `matriz-permissao.sql` (no CI) já cobra
    // `contador_externo = exportar,fechar,ler` nos DOIS sentidos — sem
    // `lancar`, sem `aprovar`, sem `cobranca`. Escrever é barrado pelas
    // políticas restritivas da ONDA 9, que leem essa mesma matriz.
    const matriz = ler("scripts/matriz-permissao.sql");
    ok("contador: a matriz de banco fixa exportar/fechar/ler — e nada mais",
       /\['contador_externo',\s*'exportar,fechar,ler'\]/.test(matriz),
       "a linha do contador saiu da matriz de banco");

    // ⚠️ O que FALTAVA: a tela de cobrança não perguntava permissão nenhuma, e
    // o contador — um TERCEIRO, de fora da empresa — via plano, valor e
    // vencimento. A ação `cobranca` existe na matriz e só o titular a tem;
    // faltava alguém PERGUNTAR.
    const adm = ler("src/components/administracao/AdministracaoViews.tsx");
    const corpo = adm.slice(adm.indexOf("export function AssinaturaView"));
    ok("contador: a tela de assinatura pergunta pela ação 'cobranca'",
       /pode\(\s*["']cobranca["']\s*\)/.test(corpo.slice(0, 1200)),
       "a tela de cobrança voltou a abrir para qualquer papel");

    // ⚠️ **O TOTAL DO ARQUIVO NÃO PODE DIVERGIR DA TELA**, e o jeito de
    // garantir isso não é comparar dois números: é o arquivo sair do MESMO
    // objeto que a tela renderiza. Uma segunda consulta para exportar é como
    // as duas respostas passam a diferir.
    const kit = ler("src/components/relatorios/kit.tsx");
    ok("contador: a planilha sai do MESMO Relatorio que a tela renderiza",
       /function linhasParaPlanilha\(r: Relatorio/.test(kit),
       "o export deixou de receber o relatório pronto");
    ok("contador: e o botão passa o relatório renderizado, não refaz a consulta",
       /linhasParaPlanilha\(relatorio,/.test(kit),
       "o botão de exportar passou a montar os dados por conta própria");
  }

  /* ---- O ESCRITOR MORTO: gravar onde, em produção, ninguém lê ------------- */
  {
    /**
     * ═════════════════════════════════════════════════════════════════════
     * TETO ZERO — nenhuma gravação cai só no dataset da DEMONSTRAÇÃO.
     * ═════════════════════════════════════════════════════════════════════
     *
     * ⚠️ `appendImported` escreve no dataset de demonstração, e TODO acessor só
     * o consulta dentro de `if (isDemo)` (`lib/data.ts`: `importedMovements()
     * ?? DEMO_MOVEMENTS`, sempre atrás do desvio). Chamá-lo sem esse desvio faz
     * a linha ir, em produção, para um `localStorage` que nada lê: o título não
     * aparece no contas a pagar, nem no fluxo, nem no DRE, nem no razão.
     *
     * **E é SILENCIOSO**, que é o que o torna caro: escrever no `localStorage`
     * não falha, então a tela anuncia sucesso. Foi assim que a folha salarial
     * disse "6 títulos agendados" e o sistema não mostrou nenhum, e assim que
     * a Nova venda disse "gerou recebível" sem gerar.
     *
     * É primo do defeito de `origem` da ONDA 5 — escritor que não alcança o
     * banco — com uma diferença que piora o diagnóstico: lá o banco RECUSAVA e
     * a tela escondia a recusa; aqui não havia recusa para esconder, porque a
     * gravação nunca foi tentada. Nenhuma guarda anterior via isto: a de
     * `origem` só olha quem já fala com `movements`, e quem grava só no
     * dataset nunca chega lá.
     *
     * A varredura recorta pela FUNÇÃO, não por uma janela de linhas — mesma
     * técnica (e mesma lição) da guarda de `origem`: uma janela só para a
     * frente reprova quem monta a linha acima da chamada.
     */
    const INICIO = /\n(?:export\s+)?(?:async\s+)?function\s|\n(?:export\s+)?const\s+\w+\s*=|\n\s{2}const\s+\w+\s*=\s*React\.useCallback/g;
    const escopo = (txt: string, ate: number): string => {
      let de = 0;
      for (const m of txt.matchAll(INICIO)) {
        if ((m.index ?? 0) >= ate) break;
        de = m.index ?? 0;
      }
      return txt.slice(de, ate);
    };
    const cegos: string[] = [];
    for (const arq of varrerArquivos("src", /\.(ts|tsx)$/)) {
      const caminho = arq.replace(/\\/g, "/");
      // O próprio store é quem implementa o dataset — ele não se desvia de si.
      if (caminho === "src/lib/imported.ts") continue;
      const txt = ler(arq);
      for (const m of txt.matchAll(/\bappendImported\s*\(/g)) {
        if (!/\bisDemo\b/.test(escopo(txt, m.index ?? 0))) {
          cegos.push(`${caminho}:${txt.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    /**
     * ⚠️ **TETO ZERO: a projeção não entra no painel nem na lista de títulos.**
     *
     * A tela de contas recorrentes soma o compromisso da REGRA — inclusive nos
     * meses que ainda não viraram título. O painel de contas a pagar e a lista
     * de títulos somam o que EXISTE. Somar a projeção em qualquer um dos dois
     * criaria um segundo significado de "a pagar" na tela que mais precisa de
     * um só, e o número resultante não bateria nem com o extrato nem com a
     * lista logo abaixo dele.
     *
     * Medido em produção quando esta regra foi escrita: outubro/26 tem
     * R$ 20.640 em títulos e R$ 40.802,55 de compromisso recorrente, sem um
     * centavo em comum. Somados, dariam R$ 61.442 de uma dívida que não existe.
     *
     * A guarda é por IMPORTAÇÃO: quem consome `core/contas-pagar/projecao`
     * precisa estar declarado aqui, com motivo. É a mesma técnica do mapa de
     * consolidação — a dívida existe declarada, ou não existe.
     */
    const CONSUMIDORES_DA_PROJECAO: Record<string, string> = {
      "src/components/contas-pagar/ContasRecorrentes.tsx":
        "a tela da projeção — é ela que a pergunta existe para responder",
      "src/lib/data.ts":
        "só o TIPO da regra, para o acessor devolver o formato que o motor pede",
      "src/components/visao-geral/hooks.ts":
        "o hook que carrega as regras, sem somar nada",
    };
    const intrusos: string[] = [];
    for (const arq of varrerArquivos("src", /\.(ts|tsx)$/)) {
      const caminho = arq.replace(/\\/g, "/");
      if (caminho.startsWith("src/core/contas-pagar/")) continue; // o motor e seus vizinhos
      if (!/from "@\/core\/contas-pagar\/projecao"/.test(ler(arq))) continue;
      if (!(caminho in CONSUMIDORES_DA_PROJECAO)) intrusos.push(caminho);
    }
    ok("projecao: só quem está declarado consome a projeção de recorrentes",
       intrusos.length === 0, intrusos.join(" | "));
    // E a declaração não pode apontar para arquivo que não existe: uma exceção
    // órfã é uma permissão que ninguém usa e que ninguém revoga.
    const orfas = Object.keys(CONSUMIDORES_DA_PROJECAO).filter((f) => !existe(f));
    ok("projecao: nenhum consumidor declarado aponta para arquivo inexistente",
       orfas.length === 0, orfas.join(" | "));
    /**
     * ⚠️ E as duas telas de título DIZEM o que contam. Sem a frase, quem abre
     * as duas conclui que uma está errada — e é a pergunta "qual dos dois está
     * certo" que a guarda existe para nunca mais deixar aparecer.
     */
    ok("projecao: a lista de títulos declara que conta só o já lançado",
       /já lançados/.test(ler("src/components/movimentacoes/TitulosView.tsx")));
    ok("projecao: o painel de contas a pagar declara o mesmo",
       /já lançados/.test(ler("src/components/contas-pagar/DashboardContasPagar.tsx")));

    /**
     * ⚠️ **NENHUM ID DE CADASTRO LOCAL VAI PARA UMA COLUNA UUID.**
     *
     * `movements.category_id` (e `cost_center_id`, `project_id`, `party_id`) é
     * UUID com chave estrangeira. O plano de contas, os projetos e os centros
     * de custo moram em `org_state` com id PRÓPRIO, numérico. Mandar aquele id
     * para esta coluna produz `22P02 invalid input syntax for type uuid:
     * "217290"` — reproduzido contra o banco de produção, e era o que derrubava
     * TODA gravação de conta a pagar com categoria escolhida.
     *
     * A trava é `exigirUUID` no montador de linhas: ela falha ANTES da rede,
     * nomeando o campo em português. A mensagem do Postgres não nomeia campo
     * nenhum e cita um número que não aparece em lugar nenhum da interface.
     */
    const dadosTxt = ler("src/lib/data.ts");
    const montador = /function buildMovementRows[\s\S]{0,3000}?\n}/.exec(dadosTxt)?.[0] ?? "";
    const semTrava = ["category_id", "cost_center_id", "project_id", "party_id"]
      .filter((c) => !new RegExp(`${c}: exigirUUID\\(`).test(montador));
    ok("uuid: todo id de cadastro passa pela trava antes de virar linha",
       montador.length > 0 && semTrava.length === 0, semTrava.join(" | "));
    ok("uuid: a trava recusa o que não é UUID e nomeia o campo",
       /invalid input syntax|não existe no banco/.test(dadosTxt)
       && /function exigirUUID/.test(dadosTxt));
    /**
     * E o formulário de lançamento NÃO pode voltar a alimentar a categoria pelo
     * plano de contas local — é de lá que o id numérico vinha.
     */
    ok("uuid: o formulário de título não tira a categoria do plano local",
       !/listPlanoContas/.test(ler("src/components/movimentacoes/TituloForm.tsx")));

    /**
     * ⚠️ **TETO ZERO: NENHUMA LEITURA DE DINHEIRO VÊ DADO DE DEMONSTRAÇÃO.**
     *
     * O botão "Carregar amostra" grava lançamentos de mentira no banco de
     * verdade, e até a migration `20260813141626` eles eram indistinguíveis de
     * um extrato importado — os dois gravam `origem = 'extrato'`. Medido em
     * produção: 458 lançamentos, R$ 6,18 milhões, em 3 organizações reais.
     *
     * `semAmostra` conserta isso, mas só enquanto TODA leitura passar por ele.
     * Sem esta guarda a regra é convenção: basta a próxima tela nova esquecer
     * o filtro e a contaminação volta por uma porta que ninguém revisou — e
     * volta em SILÊNCIO, porque um DRE com dado de amostra dentro não parece
     * quebrado, parece um DRE.
     *
     * ⚠️ A varredura olha só para `.select(`. `insert`/`update`/`delete` por id
     * não podem ser filtrados: a purga precisa justamente ALCANÇAR a amostra, e
     * filtrá-la ali faria o botão "Remover dados de demonstração" não remover
     * nada — o defeito mais cruel possível, porque a tela diria que limpou.
     */
    const TABELAS_AMOSTRA = ["movements", "movement_splits", "sales_docs", "sale_items", "recurrences"];
    /**
     * As saídas declaradas COM MOTIVO. Cada uma vê a amostra de propósito.
     * ⚠️ A lista é por ARQUIVO + motivo: uma exceção sem motivo escrito é
     * indistinguível de um esquecimento, e é assim que a lista cresce até virar
     * a regra.
     */
    const VEEM_AMOSTRA: Record<string, string> = {
      "src/lib/amostra.ts": "é quem CONTA e PURGA a amostra — filtrar aqui a tornaria invisível para si mesma",
    };
    const semFiltro: string[] = [];
    for (const bruto of varrerArquivos("src", /\.(ts|tsx)$/)) {
      const arq = bruto.replace(/\\/g, "/");
      if (VEEM_AMOSTRA[arq]) continue;
      const txt = ler(bruto);
      for (const tbl of TABELAS_AMOSTRA) {
        const rx = new RegExp(`\\.from\\("${tbl}"\\)\\s*\\.select\\(`, "g");
        let m: RegExpExecArray | null;
        while ((m = rx.exec(txt))) {
          // O `semAmostra(` precisa estar ANTES, na mesma expressão. Olhar para
          // trás (e não para a frente) foi a lição da guarda de `origem`: o
          // montador da linha costuma vir antes do `.from(`.
          const antes = txt.slice(Math.max(0, m.index - 400), m.index);
          if (!/semAmostra\(/.test(antes)) {
            semFiltro.push(`${arq}: .from("${tbl}").select(`);
          }
        }
      }
    }
    ok("amostra: nenhuma leitura de dinheiro escapa do filtro de demonstração",
       semFiltro.length === 0, semFiltro.slice(0, 8).join(" | "));

    /**
     * A saída é uma PALAVRA, não um booleano. `semAmostra(q, true)` seria
     * ilegível no ponto de chamada e um `true` vindo de variável desligaria o
     * filtro sem a revisão perceber.
     */
    const consultaTxt = ler("src/lib/supabase/consulta.ts");
    ok("amostra: a saída do filtro é explícita e pesquisável",
       /"incluir-amostra"/.test(consultaTxt) && /export function semAmostra/.test(consultaTxt));

    /**
     * ⚠️ **A assinatura da amostra tem de bater com a amostra.** A migration
     * reconheceu o histórico sem marca pelos nomes fixos de
     * `core/fdip/sample.ts`. Acrescentar um cliente à amostra sem acrescentá-lo
     * à migration deixaria o próximo lote importado sem marca, e ninguém veria.
     */
    const amostraTxt = ler("src/core/fdip/sample.ts");
    const migracao = ler("supabase/migrations/20260813141626_dado_de_demonstracao_tem_marca.sql");
    const nomesDaAmostra = [
      ...(amostraTxt.match(/const CLIENTES = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g),
      ...(amostraTxt.match(/const FORN = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g),
      ...(amostraTxt.match(/const ASSIN = \[([\s\S]*?)\];/)?.[1] ?? "").matchAll(/"([^"]+)"/g),
    ].map((m) => m[1]);
    const foraDaMigracao = nomesDaAmostra.filter((n) => {
      // A migration guarda o PREFIXO do nome (sem o sufixo societário), que é o
      // que o descritivo de extrato preserva.
      const nucleo = n.replace(/\s+(LTDA|SA|ME)$/i, "").toUpperCase();
      return !migracao.toUpperCase().includes(nucleo);
    });
    ok("amostra: todo nome da amostra é reconhecido pela migration",
       nomesDaAmostra.length >= 14 && foraDaMigracao.length === 0,
       `${nomesDaAmostra.length} nomes · fora: ${foraDaMigracao.join(", ")}`);

    /**
     * O banner não pode ter como ser fechado: um aviso com "x" é fechado por
     * reflexo e nunca mais visto, e quem abre o DRE três semanas depois não
     * sabe que aqueles números têm dado de mentira dentro.
     */
    /**
     * ⚠️ **Os comentários saem ANTES da busca** — e isto foi provado quebrando:
     * a primeira versão desta guarda REPROVOU o próprio banner, porque o
     * comentário que explica a regra usa a palavra "fechado" ("um aviso com 'x'
     * é fechado por reflexo"). Guarda que reprova a documentação da regra
     * treina quem a lê a ignorá-la — é a mesma lição da guarda de exclusão
     * física logo acima e da varredura de texto da ONDA 14.
     */
    const semComentario = (s: string) => s
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/^\s*\*.*$/gm, "");
    /**
     * ⚠️ **A DÍVIDA TÉCNICA TEM DE CONTINUAR VISÍVEL.** `lancamento_teste` é um
     * valor PROVISÓRIO do enum: ele existe porque hoje não há estado Cancelado
     * de primeira classe, e vence quando a Central Financeira (P-10) chegar.
     *
     * Sem esta guarda, a nota que explica isso é um comentário como outro
     * qualquer — some numa refatoração e o provisório vira permanente sem
     * ninguém decidir. Ela cobra que os dois lados (o motor e a migration)
     * continuem citando a origem (P-01) e o vencimento (P-10).
     */
    const debitoOndeVive = [
      "src/lib/supabase/consulta.ts",
      "supabase/migrations/20260813150045_amostra_declara_o_motivo.sql",
    ];
    const semDivida = debitoOndeVive.filter((f) => {
      const t = ler(f);
      return !(/lancamento_teste/.test(t) && /P-01/.test(t) && /P-10/.test(t));
    });
    ok("amostra: a dívida de `lancamento_teste` continua declarada com origem e vencimento",
       semDivida.length === 0, semDivida.join(" | "));

    /**
     * ⚠️ **O BOTÃO APAGA O QUE O BOTÃO DIZ — e só isso.**
     *
     * `is_sample` marca duas coisas de destinos opostos, e o vocabulário já
     * dizia isso desde que nasceu: `onboarding_demo` não é dado de ninguém e
     * purga em lote; `lancamento_teste` é um registro que EXISTIU na operação
     * de uma empresa, marcado à mão pelo id, e o desfecho correto dele é ser
     * cancelado com trilha. A purga apagava os dois (`.eq("is_sample", true)`
     * e nada mais).
     *
     * Medido em produção (14/08/26): o clique levaria junto **1 lançamento de
     * R$ 500.000,00** com descrição "Teste", debaixo de um aviso que anuncia
     * "dados de demonstração". 146 `onboarding_demo` + 1 `lancamento_teste` na
     * organização auditada; 168 e 144 nas outras duas, sem nenhum de teste.
     *
     * Provada quebrando: tirando o `sample_reason` do `delete`, esta reprova.
     */
    const libAmostra = ler("src/lib/amostra.ts");
    const purga = /export async function purgarAmostra[\s\S]{0,2500}?\n}/.exec(libAmostra);
    ok("amostra: a purga remove só o motivo purgável, nunca o marcado à mão",
       !!purga
       && /\.eq\("sample_reason", MOTIVO_PURGAVEL\)/.test(purga[0])
       && /MOTIVO_PURGAVEL[^\n]*=\s*"onboarding_demo"/.test(libAmostra),
       purga ? "predicado sem sample_reason" : "purgarAmostra não encontrada");
    /**
     * E a contrapartida, sem a qual a guarda acima se "resolve" pelo lado
     * errado: a contagem tem de saber separar os dois, senão o banner conta
     * 147 ao lado de um botão que apaga 146 — e um aviso que discorda do
     * botão ao lado ensina a não confiar no aviso.
     */
    const contagem = /export async function contarAmostra[\s\S]{0,3500}?\n}/.exec(libAmostra);
    ok("amostra: a contagem separa o que a purga leva do que ela deixa",
       !!contagem
       // A contagem do purgável sai do MESMO predicado da purga — duas contas
       // para a mesma pergunta é como o banner e o botão passam a discordar.
       && /\.eq\("sample_reason", MOTIVO_PURGAVEL\)/.test(contagem[0])
       && /preservadas: total - purgaveis/.test(contagem[0]),
       contagem ? "a contagem não usa o predicado da purga" : "contarAmostra não encontrada");

    const bannerTxt = ler("src/components/app/BannerAmostra.tsx");
    ok("amostra: o banner diz o que fica, não só o que sai",
       /purgaveis/.test(bannerTxt) && /preservadas/.test(bannerTxt)
       && /ficam/.test(bannerTxt));
    ok("amostra: o banner não tem como ser dispensado",
       /Esta organização contém dados de demonstração/.test(bannerTxt)
       && !/dispensar|setFechado|onClose|onDismiss/i.test(semComentario(bannerTxt)));

    ok("escritor: nenhuma gravação cai só no dataset de demonstração",
       cegos.length === 0, cegos.join(" | "));
    /**
     * E a contrapartida: o escritor único precisa MESMO ter os dois caminhos.
     * Sem esta asserção, alguém "resolveria" a guarda acima apagando a chamada
     * em vez de gravar no banco — e o título voltaria a sumir, agora sem nem o
     * dataset para guardá-lo.
     */
    const dados = ler("src/lib/data.ts");
    const escritor = /export async function criarTitulos[\s\S]{0,4000}?\n}/.exec(dados);
    ok("escritor: criarTitulos grava no dataset em demo E no banco em live",
       !!escritor
       && /if \(isDemo\)/.test(escritor[0])
       && /appendImported/.test(escritor[0])
       && /from\("movements"\)[\s\S]{0,200}?\.insert\(/.test(escritor[0]));
    // ⚠️ E LANÇA quando o banco recusa: um escritor de dinheiro que engole erro
    // é indistinguível de um que funciona — foi assim que o defeito durou.
    /**
     * ⚠️ **LANÇAMENTO DE VALOR ZERO NÃO É LANÇAMENTO.**
     *
     * Achado ao levantar o de-para das categorias (14/08): duas ENTRADAS de
     * "Tarifas bancárias" com `amount = 0,00` e um "Planilha" de saída, também
     * zero. Não classificam errado — não deveriam existir. É lacuna de
     * VALIDAÇÃO, não de classificação.
     *
     * O custo não é o zero: é que ele ocupa linha em toda contagem, entra na
     * média por lançamento e no ticket médio puxando os dois para baixo, e
     * aparece na lista de títulos como obrigação a conferir que não existe.
     *
     * ⚠️ A trava tem de existir nos DOIS escritores. Validar só no formulário
     * deixa a porta aberta pela metade — e a metade aberta é sempre a menos
     * olhada: por `criarTitulos` entra a folha, que ninguém digita linha a
     * linha. Provada quebrando cada um dos dois.
     */
    const temTrava = /function exigirValor\([\s\S]{0,900}?valor === 0[\s\S]{0,900}?valor < 0/.test(dadosTxt);
    ok("valor: a trava de valor zero existe e também recusa negativo", temTrava);
    const construtor = /function buildMovementRows[\s\S]{0,2500}?\n}/.exec(dadosTxt);
    ok("valor: o formulário não grava lançamento de valor zero",
       !!construtor && /exigirValor\(input\.amount\)/.test(construtor[0]));
    const titulos = /export async function criarTitulos[\s\S]{0,4000}?\n}/.exec(dadosTxt);
    ok("valor: o escritor de títulos também não grava valor zero",
       !!titulos && /exigirValor\(l\.amount\)/.test(titulos[0]));
    // ⚠️ E a mensagem é para quem OPERA: sem nomear o campo e sem dizer o que
    // fazer, ela é "erro ao salvar" com outro texto (lição do `exigirUUID`).
    ok("valor: a recusa diz o que fazer, não só que recusou",
       /não pode ser zero/.test(dadosTxt) && /Informe quanto entrou ou saiu/.test(dadosTxt));

    ok("escritor: criarTitulos não engole a recusa do banco",
       !!escritor && /if \(error\) throw error;/.test(escritor[0]));
  }

  /* ---- O painel que se apaga sozinho -------------------------------------- */
  {
    /**
     * ⚠️ A varredura é o par da asserção de VALOR no `engine-audit`
     * ("filtrar por X não mexe nos cards"). Ela existe porque a de valor prova
     * a regra sobre o motor, e o defeito estava na TELA: era ela que entregava
     * a lista errada. Uma sem a outra deixa metade do caminho descoberta.
     */
    const tela = ler("src/components/movimentacoes/TitulosView.tsx");
    const memo = /const baseDosCards[\s\S]{0,400}?\);/.exec(tela);
    ok("titulos: os cards saem de uma base SEM o filtro de status",
       !!memo && /status:\s*"todos"/.test(memo[0]),
       memo ? "sem status: todos" : "não achei baseDosCards");
    // ⚠️ E `resumoTitulos` não pode voltar a receber a lista já filtrada.
    ok("titulos: resumoTitulos não recebe a lista filtrada",
       !/resumoTitulos\(\s*titulos\b/.test(tela));
    // O período do gráfico precisa CHEGAR ao filtro — senão a cápsula pinta e
    // nada muda, que é o estado anterior.
    ok("titulos: o período do gráfico entra na janela dos títulos",
       /de:\s*janela\.de/.test(tela) && /ate:\s*janela\.ate/.test(tela));
    // O card selecionado precisa se declarar (cinza + aria-pressed).
    ok("titulos: o card selecionado é anunciado",
       /aria-pressed=\{selecionado\}/.test(tela) && /bg-surface-2/.test(tela));
  }

  /* ---- Contraparte -------------------------------------------------------- */
  ok("onda5: o CNPJ próprio é reconhecido mesmo mascarado",
     mesmoDocumento("12.345.678/0001-95", "12345678000195"));
  ok("onda5: documento curto não casa por acidente",
     !mesmoDocumento("123", "123"));
  ok("onda5: ESTORNO TARIFA não é contraparte",
     contraparteSuspeita("ESTORNO TARIFA")?.natureza === "estorno");
  ok("onda5: IOF ROTATIVO não é contraparte",
     contraparteSuspeita("IOF ROTATIVO")?.natureza === "financeiro");
  // ⚠️ E o detector NÃO pode recusar contraparte real — recusar cliente
  // legítimo dói mais que aceitar nome feio, como já ficou decidido na ONDA 3
  // da ingestão.
  for (const real of ["Alpha Comércio Ltda", "Mensalidade Serviços Ltda", "DISNEY PLUS", "WIX"]) {
    ok(`onda5: "${real}" NÃO é acusado de ser tarifa`, contraparteSuspeita(real) === null);
  }
  // ⚠️ DISNEY PLUS e WIX são pegos por OUTRA regra: a do lado. Foi a medição
  // que separou as duas — o detector de nomes nunca acharia isto.
  ok("onda5: fornecedor no a receber é pego pela regra do LADO",
     contraparteNoLadoErrado({ nome: "DISNEY PLUS", saidas: 7, entradas: 0 }, "entrada")?.codigo
       === "fornecedor_como_cliente");
  ok("onda5: quem compra E vende não é acusado",
     contraparteNoLadoErrado({ nome: "Beta", saidas: 4, entradas: 9 }, "entrada") === null);
  ok("onda5: sem histórico não há acusação",
     contraparteNoLadoErrado({ nome: "Nova", saidas: 0, entradas: 0 }, "entrada") === null);

  /* ---- Score de crédito --------------------------------------------------- */
  ok("onda5: assinatura de streaming não recebe score",
     motivoSemScore({ tipo: "cliente", nome: "IOF ROTATIVO" })?.codigo === "contraparte_suspeita");
  ok("onda5: fornecedor não recebe score",
     motivoSemScore({ tipo: "fornecedor", nome: "Alpha" })?.codigo === "nao_e_cliente");
  ok("onda5: cliente identificado recebe score",
     motivoSemScore({ tipo: "cliente", nome: "Alpha", documento: "12345678901" }) === null);

  /* ---- O relatório de qualidade ------------------------------------------- */
  const sujo = auditarQualidade({
    documentoDaOrganizacao: "12.345.678/0001-95",
    nomeDaOrganizacao: "all4pay",
    contrapartes: [
      { id: "c1", nome: "all4pay Ltda", documento: "12345678000195" },
      { id: "c2", nome: "ESTORNO TARIFA" },
    ],
    categorias: [
      { id: "k1", nome: "Salary", natureza: "despesa" },
      { id: "k3", nome: "Receita bruta", natureza: "receita" },
      { id: "k4", nome: "Aluguel", natureza: "despesa", paiId: "k3" },
      { id: "k5", nome: "Aluguel", natureza: "despesa" },
    ],
    produtos: [
      { id: "p1", nome: "Garrafa", codigo: "223321" },
      { id: "p4", nome: "Outra", codigo: "223321" },
      { id: "p2", nome: "Teste telesena" },
      { id: "p3", nome: "Teste telesena" },
    ],
    lancamentos: [
      { id: "m1", tipo: "entrada", situacao: "pendente", valor: 500_000, categoria: "Juros", contraparteId: "c1" },
    ],
  });
  const cod = (c: string) => sujo.achados.find((a) => a.codigo === c);
  for (const c of [
    "titulo_sem_origem", "titulo_com_cnpj_proprio", "contraparte_suspeita",
    "categoria_em_ingles", "categoria_duplicada", "arvore_invalida",
    "produto_codigo_duplicado", "produto_nome_duplicado",
  ]) {
    ok(`onda5: a auditoria acha "${c}"`, !!cod(c), "não achou");
  }
  ok("onda5: nome duplicado é ATENÇÃO, código duplicado é CRÍTICO",
     cod("produto_nome_duplicado")?.gravidade === "atencao"
     && cod("produto_codigo_duplicado")?.gravidade === "critico");
  ok("onda5: todo achado diz a CONSEQUÊNCIA, não só o sintoma",
     sujo.achados.every((a) => a.porQueImporta.length > 80),
     sujo.achados.filter((a) => a.porQueImporta.length <= 80).map((a) => a.codigo).join(", "));
  ok("onda5: base suja não passa no portão", !sujo.limpo);

  // ⚠️ E o oposto: base limpa tem de dar ZERO. Uma auditoria que sempre acha
  // algo é uma auditoria que ninguém consegue zerar — e um portão inalcançável
  // é um portão abandonado.
  const limpa = auditarQualidade({
    documentoDaOrganizacao: "12.345.678/0001-95",
    contrapartes: [{ id: "c1", nome: "Alpha Comércio", documento: "98765432000110" }],
    categorias: [{ id: "k1", nome: "Aluguel", natureza: "despesa" }],
    produtos: [{ id: "p1", nome: "Garrafa", codigo: "A1" }],
    lancamentos: [
      { id: "m1", tipo: "saida", situacao: "pago", valor: 100, categoria: "Aluguel",
        contraparteId: "c1", centroCustoId: "cc1", origem: "manual" },
    ],
  });
  ok("onda5: base limpa dá zero crítico", limpa.limpo && limpa.criticos === 0,
     `${limpa.criticos} críticos`);

  /* ---- Fusão: o primeiro fica, e os vínculos são reapontados -------------- */
  const plano = planejarFusao(["p1", "p2", "p3"], { p2: 4, p3: 7 });
  ok("onda5: a fusão mantém o PRIMEIRO (id que o histórico já referencia)",
     plano?.mantido === "p1" && plano.absorvidos.length === 2);
  ok("onda5: a fusão conta os vínculos a reapontar", plano?.vinculos === 11);
  ok("onda5: fundir um produto sozinho não é fusão", planejarFusao(["p1"]) === null);
}


/* ========================================================================== */
/* LINHA 33 — ONDA 6: regime único, e nenhuma apuração por omissão.          */
/* ========================================================================== */
{
  /* ---- A ausência NÃO vira Lucro Presumido ------------------------------ */
  // ⚠️ ESTA é a asserção central da onda. `regimeDaEmpresa(db, padrao =
  // "presumido")` transformava um localStorage vazio em R$ 284.823,41 de
  // imposto apurado — a doença da ONDA 4 no domínio fiscal, onde a ausência
  // não vira R$ 0 numa tela, vira guia com valor e vencimento.
  ok("onda6: cadastro vazio é 'não declarado', nunca presumido",
     regimeDoCadastro(null) === "nao_declarado"
     && regimeDoCadastro({}) === "nao_declarado"
     && regimeDoCadastro({ regime: "" }) === "nao_declarado");
  ok("onda6: o que está declarado é lido das DUAS chaves históricas",
     regimeDoCadastro({ regime: "Simples Nacional" }) === "simples"
     && regimeDoCadastro({ regimeTributario: "Lucro Presumido" }) === "presumido");
  const div = divergenciaDeRegime({ regimeTributario: "Simples Nacional", regime: "Lucro Presumido" });
  ok("onda6: duas chaves em desacordo são DENUNCIADAS, não resolvidas em silêncio",
     div.conflito && div.cadastro === "simples" && div.edicao === "presumido");

  /* ---- Nenhuma apuração sem regime -------------------------------------- */
  const L = Array.from({ length: 13 }, (_, i) => ({
    id: `m${i}`, tipo: "entrada" as const, valor: 100_000,
    categoria: "Receita de serviços",
    competencia: `2026-${String(i + 1).padStart(2, "0")}-15`.replace("2026-13", "2027-01"),
    liquidado: true,
  }));
  const semRegime = apurar(PERFIL_NAO_DECLARADO, L, "2026-12");
  ok("onda6: regime não declarado não apura imposto nenhum",
     !!semRegime.indisponivel && semRegime.total === 0 && semRegime.tributos.length === 0);
  ok("onda6: e diz o que fazer a respeito",
     (semRegime.indisponivel?.comoResolver ?? "").length > 40);

  /* ---- Simples: a memória reproduz a conta ------------------------------ */
  const perfilIII = { ...PERFIL_NAO_DECLARADO, regime: "simples" as const, anexo: "III" as const };
  const ap = apurar(perfilIII, L, "2026-12");
  // Conferência INDEPENDENTE, refeita à mão: RBT12 = 11 × 100.000 = 1.100.000,
  // faixa 4 do Anexo III (nominal 16%, dedução 35.640).
  const efetivaEsperada = (1_100_000 * 0.16 - 35_640) / 1_100_000;
  eq("cruzado: DAS do Simples == a conta refeita à mão", ap.total, 100_000 * efetivaEsperada);
  ok("onda6: a memória tem os cinco passos e cada um traz a fórmula",
     ap.tributos[0].memoria.length >= 5
     && ap.tributos[0].memoria.every((m) => m.formula.length > 10),
     `${ap.tributos[0].memoria.length} passos`);
  // ⚠️ Reprodutibilidade não é a frase, são os IDs: "12 lançamentos" é um
  // número sobre o número; o que fecha a conta é poder ver os 12.
  ok("onda6: a memória aponta QUAIS lançamentos formaram a base",
     (ap.tributos[0].memoria[0].movimentos ?? []).length > 0);
  ok("onda6: Simples sem anexo não apura — 6% e 15,5% não têm meio-termo a assumir",
     !!apurar({ ...perfilIII, anexo: null }, L, "2026-12").indisponivel);

  /* ---- Presumido: as efetivas SAEM da base presumida --------------------- */
  const perfilLP = { ...PERFIL_NAO_DECLARADO, regime: "presumido" as const };
  const lp = apurar(perfilLP, L, "2026-12");
  const irpj = lp.tributos.find((t) => t.sigla === "IRPJ")!;
  const csll = lp.tributos.find((t) => t.sigla === "CSLL")!;
  // 15% e 9% sobre base presumida de 32% dão as efetivas conhecidas de 4,8% e
  // 2,88% — mas só na parte BÁSICA: o adicional é progressivo e entra por cima.
  eq("cruzado: base presumida de serviços == 32% da receita", irpj.base, 100_000 * 0.32);
  eq("cruzado: CSLL == 9% sobre a base presumida", csll.valor, 100_000 * 0.32 * 0.09);
  // ⚠️ O ADICIONAL É O QUE UMA ALÍQUOTA FIXA NÃO CONSEGUE REPRESENTAR: 10%
  // sobre o que excede R$ 20.000 de base POR MÊS. Com 32.000 de base, o
  // excedente é 12.000. Uma carga única de 16,33% ignora isso e erra conforme
  // a receita se distribui pelos meses.
  eq("cruzado: IRPJ == 15% da base + 10% do que excede R$ 20.000",
     irpj.valor, 100_000 * 0.32 * 0.15 + (100_000 * 0.32 - 20_000) * 0.10);
  ok("onda6: sem alíquota de ISS declarada, o ISS NÃO entra com palpite",
     !lp.tributos.some((t) => t.sigla === "ISS") && !!lp.indisponivel,
     "o total sairia incompleto sem dizer");
  const lpIss = apurar({ ...perfilLP, issAliquota: 0.05, municipio: "São Paulo" }, L, "2026-12");
  eq("cruzado: com ISS declarado, ele entra pela alíquota do município",
     lpIss.tributos.find((t) => t.sigla === "ISS")!.valor, 100_000 * 0.05);

  /* ---- Lucro Real: modelado, não habilitado ------------------------------ */
  ok("onda6: Lucro Real pode ser declarado e NÃO apura por receita",
     !!apurar({ ...PERFIL_NAO_DECLARADO, regime: "real" as const }, L, "2026-12").indisponivel);

  /* ---- Fator R: o anexo como consequência do dado ------------------------ */
  const comFolha = [
    ...L,
    { id: "f1", tipo: "saida" as const, valor: 40_000, categoria: "Folha de pagamento",
      competencia: "2026-06-05", liquidado: true },
  ];
  const fr = calcularFatorR(comFolha, "2026-01-01", "2026-12-31");
  ok("onda6: o fator R decide o anexo, e a frase explica o porquê",
     fr.anexoIndicado !== null && explicarFatorR(fr).includes("%"));
  // ⚠️ O resgate FORA da base: sem esta exclusão o denominador infla, o fator R
  // cai e a empresa vai parar no Anexo V — que custa mais que o dobro.
  const comResgate = calcularFatorR([
    { id: "r", tipo: "entrada", valor: 100_000, categoria: "Receita de serviços", competencia: "2026-03-01", liquidado: true },
    { id: "g", tipo: "entrada", valor: 900_000, categoria: "Resgate de aplicação", competencia: "2026-03-02", liquidado: true },
    { id: "f", tipo: "saida", valor: 32_000, categoria: "Folha de pagamento", competencia: "2026-03-05", liquidado: true },
  ], "2026-01-01", "2026-12-31");
  eq("cruzado: o resgate fica FORA do denominador do fator R", comResgate.receita12m, 100_000);
  ok("onda6: e por isso o anexo indicado continua o III", comResgate.anexoIndicado === "III");
  ok("onda6: sem receita não há fator R — 0% leria como 'não tem folha'",
     calcularFatorR([{ id: "f", tipo: "saida", valor: 1, categoria: "Folha", competencia: "2026-03-01", liquidado: true }],
       "2026-01-01", "2026-12-31").valor === null);

  /* ---- Vigência: o passado não é recalculado com a regra de hoje --------- */
  const hist = { perfis: [
    { ...PERFIL_NAO_DECLARADO, regime: "simples" as const, anexo: "III" as const,
      vigenteDe: "2025-01-01", vigenteAte: "2025-12-31" },
    { ...PERFIL_NAO_DECLARADO, regime: "presumido" as const, vigenteDe: "2026-01-01", vigenteAte: null },
  ] };
  ok("onda6: a apuração de 2025 usa o regime de 2025",
     perfilEm(hist, "2025-06-15").regime === "simples");
  ok("onda6: e a de 2026 usa o de 2026", perfilEm(hist, "2026-06-15").regime === "presumido");
  ok("onda6: data sem perfil não inventa regime",
     perfilEm(hist, "2024-06-15").regime === "nao_declarado");
  // Sobreposição é o defeito mais perigoso do histórico: a apuração passa a
  // depender de qual perfil a função escolheu.
  const sobreposto = { perfis: [
    { ...PERFIL_NAO_DECLARADO, regime: "simples" as const, vigenteDe: "2025-01-01", vigenteAte: null },
    { ...PERFIL_NAO_DECLARADO, regime: "presumido" as const, vigenteDe: "2026-01-01", vigenteAte: null },
  ] };
  ok("onda6: dois regimes cobrindo a mesma data são denunciados",
     problemasDoHistorico(sobreposto).some((p) => p.includes("Dois regimes")));
}

console.log(`\n${fails === 0 ? "✓ TODOS" : `✗ ${fails} FALHA(S)`} — matriz de consistência cruzada (${INDICADORES_VERSION})`);
if (fails > 0) process.exit(1);
