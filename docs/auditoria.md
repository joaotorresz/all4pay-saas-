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
| ~~**#3**~~ | ~~`/dre` (`DREView`)~~ | — | 🗑️ **CÓDIGO MORTO, REMOVIDO.** Nenhuma rota o renderizava: `src/app/dre/` não existe, `/dre` é alias 308 para `/dashboard/reports/dre`, e **zero arquivos** importavam `DREView`. Superfície sem entrada é candidata a remoção, não a migração |
| **#4** | Cockpit — `receita-liquida-mes` + widgets | `cascataDRE` via a fachada | ✅ **FEITO** |
| **#5** | `core/paineis` — painel de Vendas | `cascataDRE` via a fachada | ✅ **FEITO** |
| **#6** | `core/indicadores/resultado` — `painelResultado` | `cascataDRE` (mantendo o contrato ONDA 4) | ✅ **FEITO** |
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
2. ~~**`dreGerencial`**~~ — **curada**: virou FACHADA FINA da cascata (#4, #5). Zero agregação própria;
3. ~~**`painelResultado`**~~ — **curada**: lê a cascata e veste o contrato da ONDA 4 (dizer quando não sabe). Zero agregação própria;
4. ~~a inline da IA~~ — **curada** no PR #44;
5. **`quant`/burn** (`core/quant/indicators`) — #8, e por tabela #9.

Mais **duas somas cruas** sem classificador nenhum: **#10** e **#14**.

---

## A FILA DE MIGRAÇÃO

Um PR por vez, **verde antes do próximo**.

| Ordem | Item | O que decide |
| --- | --- | --- |
| ✅ 1º | **#7** IA | Feito no PR #44, com o contrato nascendo junto |
| ✅ 2º | **#3 · #4 · #5** | #3 removido (morto). `dreGerencial` virou **fachada fina** sobre `cascataDRE`, com `regime` obrigatório. Contrato estendido aos **dois regimes** |
| ✅ 3º | **#6** `painelResultado` | Lê a cascata mantendo o contrato da ONDA 4. `ehReceitaOperacional` é a única definição de receita operacional no código |
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

## O REGIME NA CASCATA — a decisão, e as três condições que a tornam segura

`cascataDRE` **aceita** `regime`, e ele é **parâmetro obrigatório sem valor
padrão**. Com padrão, alguém chama sem pensar e recebe o regime errado em
silêncio — a mesma classe do `is_sample`, resolvida fazendo o filtro excluir por
omissão: a decisão tem de ser explícita no ponto da chamada.

As três condições que acompanham a decisão:

1. **`regime` obrigatório, sem default.** ✅
2. **O contrato roda OS DOIS REGIMES para toda superfície.** ✅ Aceitar regime e
   testar um só dobraria a superfície da função canônica e cortaria a cobertura
   pela metade — e o regime não coberto é justamente aquele em que ninguém olha.
   Superfície que só existe em competência (a IA responde sobre o DRE) **declara**
   isso em vez de ganhar uma leitura de caixa inventada para satisfazer o teste.
3. **O TÍTULO MUDA COM O REGIME.** ✅ Um DRE é, por definição, competência.
   Em caixa a tela passa a dizer **"Resultado — regime de caixa"**. Aplicado no
   waterfall do `/fluxo-caixa`, que é hoje a única superfície viva que renderiza
   a cascata em caixa (`core/cashflow` → `financialDRE`).

## AS MARGENS SÃO `Indicador`, NUNCA `number`

`margemBruta`, `margemEbitda` e `margemLiquida` podem **não existir**. O caminho
antigo dividia por `receitaLiquida > 0 ? receitaLiquida : 1` — e dividir por 1
não aproxima nada: apresenta o valor ABSOLUTO em reais com um "%" ao lado (um
EBITDA de −R$ 30.000 vira "−3.000.000%").

Sem receita líquida não existe margem. As telas exibem o motivo ou um traço;
**nunca 0%, nunca número**. Não é caso hipotético: a organização auditada tem
Custos Variáveis zerados e meses sem movimento.

## DOIS DEFEITOS QUE A MIGRAÇÃO DESENTERROU

**A linha `impostos_lucro` era INALCANÇÁVEL.** A atribuição é "a primeira linha
que casa leva o movimento", e `ehImpostoVenda` (`/imposto|tribut|…|irpj|csll/`) é
um superconjunto de `ehImpostoLucro`. Como `deducoes` vem antes na estrutura,
IRPJ e CSLL caíam como **dedução da receita** — acima do EBITDA. Efeito: receita
líquida, lucro bruto e EBITDA menores pelo valor do IR, ou seja, a DRE afirmando
que a OPERAÇÃO vai pior do que vai. Descoberto ao escrever a fixture que deveria
travar a diferença de `lair`: ela passava sem exercitar nada.

**`painelResultado` (#6) contava EMPRÉSTIMO como receita.** A matriz de
reconciliação já trazia essa divergência DECLARADA, com valor (R$ 15.000) e
causa. Agora existe **um** predicado — `ehReceitaOperacional`, exportado de
`core/relatorios` — e os quatro caminhos o compartilham. Segue aberto, na mesma
nota, o defeito em que os quatro concordam e todos erram: **R$ 20.000 de
"Transferência entre contas" contam como receita bruta**.

⚠️ Corrigir esse último muda a taxonomia `LinhaReceita`, espinha do drill-down do
DRE inteiro — fica declarado com número, não corrigido de passagem.


---

## MEDIÇÃO: as deduções de 47,54% NÃO eram defeito de código

Organização `835278a9…`, 01/09/2025 a 31/08/2026, com o filtro de amostra ativo,
261 lançamentos. Deduções ÷ Receita Bruta, **antes e depois** da correção da
ordem de regex (`deducoes` deixando de engolir `impostos_lucro`):

| | Receita Bruta | Deduções | % | Impostos s/ Lucro |
| --- | --- | --- | --- | --- |
| **antes** | R$ 523.147,94 | R$ 248.707,93 | **47,54%** | R$ 0,00 |
| **depois** | R$ 523.147,94 | R$ 248.707,93 | **47,54%** | R$ 0,00 |

**Idêntico.** A correção é real e não alcança este dado: ela separa por
CATEGORIA, e aqui nenhuma categoria se chama IRPJ ou CSLL.

As 36 saídas que formam a dedução estão todas numa categoria genérica
**"Impostos"**, e são quatro coisas diferentes:

| Descrição | n | Total | O que é |
| --- | --- | --- | --- |
| INSS GPS GUIA PREVIDÊNCIA | 9 | R$ 81.286,03 | encargo de **folha** |
| DARF **IRPJ** | 9 | R$ 75.982,66 | imposto sobre o **lucro** |
| SIMPLES NACIONAL | 9 | R$ 46.800,00 | **dedução da receita** ✔ |
| FGTS CONECTIVIDADE SOCIAL | 9 | R$ 44.639,24 | encargo de **folha** |

Só o Simples é dedução: **R$ 46.800 ÷ R$ 523.147,94 = 8,94%**, plausível. Os
outros três quartos estão na linha errada — INSS e FGTS deveriam engrossar a
folha (abaixo do lucro bruto), e o IRPJ deveria ir para `impostos_lucro`
(abaixo do EBITDA).

⚠️ **O conserto é de DADO, não de mais regex.** O classificador olha o nome da
CATEGORIA, e "IRPJ" aqui está só na descrição. O caminho desenhado para isto já
existe: `linhaPorCategoria` — a linha DECLARADA de cada categoria, que **vence**
o palpite por palavra-chave. Quem cadastrou a categoria sabe em que linha ela
entra; o regex, não. Separar "Impostos" em Simples · INSS · FGTS · IRPJ resolve
os quatro de uma vez.


---

## PRIMEIRA PARCELA DA MIGRAÇÃO DO PLANO DE CONTAS — aplicada

A categoria genérica **"Impostos"** virou quatro, **com natureza fixa**, no
formato que a migração maior vai herdar (`categories.dre_linha`):

| Categoria | `dre_linha` | Por quê |
| --- | --- | --- |
| Simples Nacional | `deducoes` | é o único que é dedução da receita |
| INSS patronal (GPS) | `despesas_operacionais` | encargo de **folha** |
| FGTS | `despesas_operacionais` | encargo de **folha** |
| IRPJ / CSLL | `impostos_lucro` | imposto sobre o **lucro** |

**48 lançamentos** reclassificados (12 de cada) — a janela auditada tem 36; os
outros 12 estão fora dela e ficaram consistentes de graça.

### O efeito, medido antes e depois

| Linha | Antes | Depois |
| --- | --- | --- |
| Deduções | R$ 248.707,93 | **R$ 46.800,00** |
| Receita Líquida | R$ 274.440,01 | **R$ 476.347,94** |
| Despesas Operacionais | R$ 1.003.471,98 | **R$ 1.129.397,25** |
| EBITDA | −R$ 783.449,58 | **−R$ 707.466,92** |
| Impostos s/ Lucro | R$ 0,00 | **R$ 75.982,66** |
| **Resultado Líquido** | **−R$ 784.743,23** | **−R$ 784.743,23** |
| Margem EBITDA | −285,5% | **−148,5%** |

⚠️ **O resultado líquido NÃO se mexeu** — é reclassificação, não alteração de
valor. Essa é a asserção que prova que ninguém errou a mão, e ela está travada
no contrato (`reclassificação · o RESULTADO LÍQUIDO não muda`).

### A fiação que faltava

`linhaPorCategoria` só era alimentado pelo plano de contas **local**
(`lib/registros`). Quem nunca abriu a tela de Cadastros não tinha linha
declarada nenhuma, e o motor caía no palpite por palavra-chave sem nada dizer.
Agora `getLinhasDeCategoria()` (`lib/data`) lê **`categories.dre_linha`** — a
tabela que os lançamentos referenciam — e o relatório mescla as duas fontes.

⚠️ **Sem a linha declarada, "INSS patronal (GPS)" volta para a dedução**, porque
`ehImpostoVenda` casa `\binss\b`. O contrato tem um caso que falha se isso
deixar de ser verdade — é ele que impede alguém de concluir que o regex bastava.

### ⚠️ DÚVIDA REGISTRADA, para o contador confirmar

A empresa está cadastrada como **Simples Nacional** e pagou **DARF IRPJ** no
mesmo período (R$ 75.982,66 em 9 guias). **No Simples o IRPJ está dentro do
DAS.** Isso pode indicar (a) mudança de regime no período, (b) outra entidade do
grupo pagando pela mesma conta, ou (c) recolhimento indevido.

A classificação escolhida — `impostos_lucro` — é a correta **para o que o
documento diz que é**. Ela não resolve a dúvida, e não deve dar a impressão de
que resolveu: quem decide é o contador, e a decisão pode mudar a categoria.
