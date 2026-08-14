# Auditoria — o mapa das superfícies de resultado

> **Por que este arquivo existe.** Este repositório é trabalhado por várias
> sessões de agente em paralelo, e a numeração da auditoria (`#1`..`#14` para as
> superfícies, `P-xx` para os prompts, `A4P-xxx` para os defeitos) vivia **fora**
> do repositório. O efeito prático: cada sessão nova redescobre o mesmo terreno,
> e "o item #5" só quer dizer alguma coisa dentro da cabeça de uma pessoa. A
> partir daqui, o mapa é código versionado como o resto.

---

## A REGRA

**Toda superfície que exibe RESULTADO, RECEITA, MARGEM ou EBITDA consome a
`cascataDRE` (`src/core/relatorios/cascata.ts`). Nenhuma agrega por conta
própria.**

`cascataDRE` chama `montarDRE` — a MESMA função que desenha a tabela do
relatório, sobre a `ESTRUTURA_DRE` que o contador reconhece, com as linhas "="
saindo de FÓRMULA sobre as outras e nunca de soma direta. Não são "duas
implementações que concordam": é **uma conta e vários desenhos**.

### Por que a regra é essa, e não "as contas têm de bater"

Duas implementações erradas do mesmo jeito concordam perfeitamente. Foi
exatamente o que aconteceu: a guarda LINHA 31c comparava a cascata canônica com
`dreGerencial`, e os dois compartilhavam a mesma base errada (`receita +=
m.amount` para TODA entrada, inclusive a financeira). A guarda passava, e os
números estavam inflados pelos juros do período nas duas pontas.

### O contrato que torna a regra verificável

`npm run contrato` → `scripts/contrato-resultado.mts`, dentro de `npm test`.

Ele cobra quatro coisas, e cada uma existe por um defeito medido:

1. **Toda superfície exibe o que a cascata diz** — comparando a **string que a
   pessoa lê**, não o número interno. Comparar o número provaria só que a função
   foi chamada; comparar o texto pega quem reintroduzir conta própria na hora de
   montar a frase.
2. **O caso do sinal invertido.** 100k de venda, 130k de folha, 200k de
   rendimento de aplicação: a cascata diz **−R$ 30.000** (queima) e a conta
   antiga dizia **+R$ 170.000** (geração). Só o caso extremo revela — um dataset
   com os dois sinais do mesmo lado faria a diferença parecer questão de
   magnitude.
3. **Quem cita valor de resultado diz de que PERÍODO e sob que REGIME ele saiu.**
4. **Sem número, sem afirmação:** onde a cascata está indisponível, a superfície
   explica por quê em vez de imprimir zero. "R$ 0 de EBITDA" lê como *operou e
   não sobrou nada* quando a verdade é *não houve lançamento* — e as duas mandam
   fazer coisas opostas.

⚠️ **Cada superfície migrada entra no contrato NO MESMO PR da migração.** Migrar
sem nada obrigando a concordar é como a correção não tivesse acontecido: cada
superfície passa no seu próprio teste, o conjunto segue livre para divergir, e a
divergência só aparece em produção.

⚠️ **Nenhum número muda de significado sem mudar de nome.** Onde a migração
troca o regime (caixa → competência), ou o número passa a se chamar outra coisa,
ou a superfície declara o regime na própria tela. É a regra que resolve o caso
`#8` sozinha.

---

## O INVENTÁRIO DAS SUPERFÍCIES

| # | Superfície | Fonte hoje | Estado |
| --- | --- | --- | --- |
| **#1** | `/dashboard/reports/dre` — tabela | `cascataDRE` → `montarDRE` | ✅ **OK** |
| **#2** | `/dashboard/reports/dre` — cartões | `cascataDRE` | ✅ **OK** (4 cartões batem com a tabela, diferença zero, medido em produção) |
| **#3** | `/dre` (`DREView`) — Intelligence Center | `dreGerencial` | ⏳ waterfall, drill-down, por cliente/linha |
| **#4** | Cockpit — `receita-liquida-mes` + widgets | `dreGerencial` via `c.dre.gerencial` | ⏳ |
| **#5** | `core/paineis` — painel de Vendas | `dreGerencial` (`paineis/index.ts:233`) | ⏳ |
| **#6** | `core/indicadores/resultado` — `painelResultado` | **agregação PRÓPRIA** (`base()`) | ⏳ |
| **#7** | IA — `assistant/engine.ts` | `cascataDRE` | ✅ **FEITO** (PR #44) |
| **#8** | `core/quant/indicators` → `/inteligencia` | deriva de `calcularBurnRate` | 🔤 **NÃO migra — RENOMEIA** |
| **#9** | Investor Update (`core/investor`) | consome `quant.indicadores` | ⏳ migra |
| **#10** | `/dashboard/dashboards/sales` | **soma crua** de `movements` | ⏳ |
| **#11** | `core/budget` / Orçamento | `core/relatorios` | ✅ **OK** |
| **#12** | `core/fiscal/apuracao` + `/impostos` | `receitaTributavel` | ✅ **OK** |
| **#13** | Exportações XLSX/DOCX/PDF | `linhasParaPlanilha` | ✅ **OK** |
| **#14** | `core/onboarding` (DNA/maturidade) | `core/fdip` | ⏳ **verificar antes de migrar** |

### São CINCO agregações independentes, não duas

1. **`core/relatorios`** — a referência (`ESTRUTURA_DRE` + `montarDRE`);
2. **`dreGerencial`** (`core/dre/engine.ts`) — #3, #4, #5;
3. **`painelResultado`** (`core/indicadores/resultado.ts`) — #6;
4. ~~a inline da IA~~ — **curada** no PR #44;
5. **`quant`/burn** (`core/quant/indicators`) — #8, e por tabela #9.

Mais **duas somas cruas** sem classificador nenhum: **#10** e **#14**.

---

## A FILA DE MIGRAÇÃO

Um PR por vez, **verde antes do próximo**.

| Ordem | Item | O que decide |
| --- | --- | --- |
| ✅ 1º | **#7** IA | Feito no PR #44, com o contrato nascendo junto |
| 🔜 2º | **#3 · #4 · #5** | `dreGerencial` vira **fachada fina** sobre `cascataDRE`: mesma assinatura, mesmo formato de retorno, zero agregação própria por dentro. Nenhuma das três superfícies muda de chamada |
| 3º | **#6** `painelResultado` | Mantém o contrato da ONDA 4 (`Indicador` com `indisponivel`), mas passa a **ler** a cascata |
| 4º | **#10** `VendasDashboardView` | Soma crua de `movements`, sem classificador |
| 5º | **#14** `core/fdip` | ⚠️ **Verificar ANTES se ele CONSEGUE consumir a cascata.** Roda no onboarding, sobre dado **ainda não classificado**. Se não conseguir, a correção **não é migrar**: é parar de chamar aquilo de *receita* e *EBITDA* e rotular como **estimativa da importação** |
| 6º | **#9** Investor Update | **Migra.** Investidor que lê "margem líquida" espera competência; número derivado de caixa sob esse rótulo aparece contra você numa diligência |
| 7º | **#8** `quant`/score | ⚠️ **NÃO migra.** Mantém o burn como fonte e **RENOMEIA** — *"margem de caixa 90d"*, *"eficiência de caixa"* — ganhando ao lado as métricas de competência vindas da cascata. **Dois regimes, dois nomes** |

---

## O QUE A CASCATA JÁ ENTREGA

`cascataDRE(input, { intervalo })` devolve:

- **`linhas`** — um `Indicador` por linha de `LINHAS_CASCATA`, com
  `procedencia` (regime, janela, fórmula, quantos lançamentos e **quais**);
- **`margemEbitda`** — `Indicador`, **indisponível** quando a receita líquida é
  zero (não "0%");
- **`relatorio`** — o relatório inteiro, com colunas, `filhos` por categoria
  (nível 3) e os ids dos movimentos de cada célula, para drill-down.

E `REGRAS_CASCATA` traz as identidades que a cascata tem de respeitar, **em
código e não só no teste** — uma regra que só existe no teste é uma regra que
ninguém lê ao escrever a próxima tela.

⚠️ **A cascata é sempre COMPETÊNCIA.** `montarDRE` é
`Omit<FiltroRelatorio, "regime">`: a DRE é competência por definição, e é essa
a razão de a migração trocar o regime de algumas superfícies.
