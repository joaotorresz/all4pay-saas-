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
| **#8** | `core/quant/indicators` → `/inteligencia` | `calcularBurnRate` (CAIXA) | 🔤 **NÃO MIGROU — RENOMEADO.** `margemOperacional`→`margemCaixa90d`, `margemLiquida`→`eficienciaDeCaixa`. O regime é dito na tela. Guarda de vocabulário no contrato |
| **#9** | Investor Update (`core/investor`) | `cascataDRE` (receita do mês, margem líquida) | ✅ **FEITO** |
| **#10** | `/dashboard/dashboards/sales` | `cascataDRE` (receita, MC, EBITDA) | ✅ **FEITO** |
| **#11** | `core/budget` / Orçamento | `core/relatorios` | ✅ **OK** |
| **#12** | `core/fiscal/apuracao` + `/impostos` | `receitaTributavel` | ✅ **OK** |
| **#13** | Exportações XLSX/DOCX/PDF | `linhasParaPlanilha` | ✅ **OK** |
| **#14** | `core/onboarding` (DNA/maturidade) | `core/fdip` | 🔤 **NÃO MIGROU — RENOMEADO.** Verificado: não CONSEGUE consumir a cascata (sem categoria, classificação de confiança 0.4, extrato sem competência). Virou *estimativa da importação*, com aviso na tela |

### São CINCO agregações independentes, não duas

1. **`core/relatorios`** — a referência (`ESTRUTURA_DRE` + `montarDRE`);
2. ~~**`dreGerencial`**~~ — **curada**: virou FACHADA FINA da cascata (#4, #5). Zero agregação própria;
3. ~~**`painelResultado`**~~ — **curada**: lê a cascata e veste o contrato da ONDA 4 (dizer quando não sabe). Zero agregação própria;
4. ~~a inline da IA~~ — **curada** no PR #44;
5. **`quant`/burn** (`core/quant/indicators`) — #8. **Permanece, por desenho**: mede CAIXA, e o score de saúde pergunta "o caixa aguenta?". O que mudou foi o NOME.

As duas somas cruas foram fechadas: **#10** migrou; **#14** foi renomeado (não consegue migrar).

---

## A FILA DE MIGRAÇÃO

Um PR por vez, **verde antes do próximo**.

| Ordem | Item | O que decide |
| --- | --- | --- |
| ✅ 1º | **#7** IA | Feito no PR #44, com o contrato nascendo junto |
| ✅ 2º | **#3 · #4 · #5** | #3 removido (morto). `dreGerencial` virou **fachada fina** sobre `cascataDRE`, com `regime` obrigatório. Contrato estendido aos **dois regimes** |
| ✅ 3º | **#6** `painelResultado` | Lê a cascata mantendo o contrato da ONDA 4. `ehReceitaOperacional` é a única definição de receita operacional no código |
| ✅ 4º | **#10** `VendasDashboardView` | Receita, MC e EBITDA da cascata. `RE.variavel` e `RE.foraEbitda` removidos; `RE.marketing` fica (CAC não é linha do DRE) |
| ✅ 5º | **#14** `core/fdip` | **Não consegue** — verificado. Renomeado para *estimativa da importação*, com aviso na tela |
| ✅ 6º | **#9** Investor Update | Migrado. Receita do mês e margem líquida em competência; a margem é `null` sem receita |
| ✅ 7º | **#8** `quant`/score | **Não migrou, renomeou.** `margemCaixa90d` e `eficienciaDeCaixa`, com o regime dito em cada cartão. Guarda de vocabulário no contrato impede o nome de voltar |

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


---

## MEDIDO NA APLICAÇÃO PUBLICADA (`d1a4668`)

Código publicado sobre o dado de produção, org `835278a9`, 01/09/2025 a
31/08/2026, 261 lançamentos, com o `linhaPorCategoria` que
`getLinhasDeCategoria()` devolve para esta organização:

| Linha | Medido | Esperado |
| --- | --- | --- |
| Deduções | R$ 46.800,00 | ✓ |
| Receita Líquida | R$ 476.347,94 | ✓ |
| Despesas Operacionais | R$ 1.129.397,25 | ✓ |
| EBITDA | −R$ 707.466,92 | ✓ |
| Impostos sobre o Lucro | R$ 75.982,66 | ✓ |
| **Resultado Líquido** | **−R$ 784.743,23** | ✓ **inalterado** |
| Margem EBITDA | −148,5% | ✓ |

### ⚠️ A janela PARCIAL que existiu entre a reclassificação e o merge

O dado foi reclassificado no banco **antes** de o código que o interpreta estar
publicado. Nessa janela, produção mostrou deduções de **R$ 204.068,69** (39,0%
da receita) — o palpite por palavra-chave soltou o **FGTS** e segurou INSS,
IRPJ e Simples.

⚠️ **O resultado líquido não se mexeu por SORTE**, não por desenho: as três
categorias presas caíram em linhas que se anulam na cascata. Numa separação em
que o regex soltasse duas das quatro, o fundo teria mudado. A regra está no
`CONTRIBUTING.md`: **reclassificação de dado é expand/contract — o código que
interpreta vai antes.**


---

## FOLHA — o que se reproduziu do relatório de 13/08, e o que não

Medido chamando `calcularCLT` direto, dois CLT de R$ 10.000 e R$ 2.500, sem
dependentes e sem outros descontos:

| | INSS | IRRF | Líquido | Custo | Fator |
| --- | --- | --- | --- | --- | --- |
| R$ 10.000 | 951,63 *(teto)* | 1.579,57 | **7.468,80** | 16.244,44 | 1,62× |
| R$ 2.500 | 202,23 | 0,00 | **2.297,77** | 4.061,11 | 1,62× |
| **total** | | | **R$ 9.766,57** | R$ 20.305,55 | |

**Desconto de 21,9%** — a faixa esperada. Não reproduzi os R$ 7.966 (36,3%).

### ❌ "Fator idêntico é matematicamente impossível" — não é. É correto.

`custoTotal` = bruto + FGTS + patronal + provisões, e **todas** essas parcelas
são proporcionais ao bruto. INSS e IRRF do empregado são **desconto** — saem do
bolso dele e não entram no custo do empregador. Logo o fator de custo é o mesmo
para qualquer salário; o que a progressividade muda é o **líquido**, e ele muda:
R$ 7.468,80 × R$ 2.297,77.

Há uma asserção no `engine-audit` para impedir que alguém "conserte" isso.

### ❌ "36,3% de desconto" — não reproduz

O motor dá 21,9%. Um líquido menor exigiria `valeTransporte`, `planoSaude`,
pensão ou `outrosDescontos` no cadastro — que entram em `outros` legitimamente.

### ✅ "O número grande é o custo, com rótulo de bruto" — real, corrigido

O cartão exibia `custoTotal` em destaque e "bruto R$ 10.000" abaixo. Invertido:
**bruto em destaque, custo como métrica secundária rotulada como custo.**

### ✅ Anexo IV é tratado

`encargosPatronais`: `noDAS = simples && anexo !== null && anexo !== "IV"`. No
Anexo IV o patronal é recolhido **fora** do DAS (1,62×); no Anexo III entra no
DAS (1,29×). Medido nos três regimes.

---

## RECONCILIAÇÃO: o projetado × o efetivamente pago

Só ficou possível depois da separação de categorias. Org `835278a9`,
out/2025 a jun/2026 (os 9 meses em que as três categorias coexistem):

| | Pago | % da folha paga | A lei manda |
| --- | --- | --- | --- |
| Folha de pagamento | R$ 734.970,10 | — | — |
| FGTS | R$ 44.639,24 | **6,1%** | 8% |
| INSS patronal (GPS) | R$ 81.286,03 | **11,1%** | 27,8% (CPP 20 + RAT 2 + terceiros 5,8) |

**Não fecha, e a divergência é grande:** o FGTS pago é R$ 14.158,37 **menor** que
8% da folha; o INSS pago é R$ 123.035,66 menor que 27,8%.

E as duas pontas **também não concordam entre si**, o que descarta uma explicação
única:

- base implícita pelo FGTS (÷ 8%) → **R$ 557.990,50**
- base implícita pelo INSS (÷ 27,8%) → **R$ 292.395,79**
- folha efetivamente paga → **R$ 734.970,10**

Três bases diferentes para os mesmos meses. Não atribuo a causa — as
possibilidades que os números admitem: "Folha de pagamento" mistura CLT com PJ e
pró-labore (que não geram FGTS nem CPP); parte do valor é líquido e parte é
bruto; ou o dado semeado não é internamente consistente.

⚠️ **E um achado independente da alíquota:** INSS e FGTS **param em junho/2026**,
enquanto a folha segue até agosto. Dois meses de folha sem encargo nenhum — isso
sozinho impede qualquer reconciliação de fechar, e nenhuma calculadora conserta.


---

## ACHADO DE NEGÓCIO — encargos de folha · **REQUER CONTADOR**

⚠️ **Não é defeito de cálculo, e não deve ser "corrigido" no código.** A
calculadora foi verificada valor a valor contra as tabelas legais; o que não
fecha é o DADO.

Org `835278a9`, out/2025 a jun/2026 (os 9 meses em que as três categorias
coexistem):

| | Pago | % da folha paga | A lei manda |
| --- | --- | --- | --- |
| Folha de pagamento | R$ 734.970,10 | — | — |
| FGTS | R$ 44.639,24 | **6,1%** | 8% |
| INSS patronal (GPS) | R$ 81.286,03 | **11,1%** | 27,8% |

E as duas pontas **não concordam entre si**, o que descarta explicação única:

- base implícita pelo FGTS (÷ 8%) → **R$ 557.990,50**
- base implícita pelo INSS (÷ 27,8%) → **R$ 292.395,79**
- folha efetivamente paga → **R$ 734.970,10**

⚠️ **A lacuna de dois meses:** INSS e FGTS **param em junho/2026** enquanto a
folha segue até **agosto**. Dois meses de folha sem encargo nenhum — isso sozinho
impede qualquer reconciliação de fechar, e nenhuma calculadora conserta.

**O que o sistema passou a fazer:** a tela da folha avisa quando os encargos
lançados divergem mais de **20%** do projetado, dizendo os dois números e as
causas possíveis. O sistema saber e não avisar já foi achado (A4P-072).

**O que fica para o contador:** dizer se a divergência é quadro de pessoal
diferente do cadastrado, regime diferente do declarado, guia não lançada, ou
mistura de CLT com PJ/pró-labore na mesma categoria "Folha de pagamento".

---

# LOTE P-06B — os quatro defeitos remanescentes (14/08/2026)

Medidos de novo antes de qualquer correção, contra a organização
`835278a9-2e4f-447f-b2e2-2aedb6daa9c6` e, onde a pergunta era global, contra as
seis organizações do banco. Um PR por item, verde antes do próximo.

## ⚠️ 1. "O extrato não fecha" — **DIAGNÓSTICO TROCADO**, não refutado

O achado é **REAL**. Ele não estava onde foi procurado, e não estava onde eu o
procurei — são erros diferentes, e cada um custou uma rodada.

**Onde o defeito NÃO está:** no extrato do produto. `extratoDaConta` e
`fluxoCaixaMensal` acumulam o fechamento a partir da abertura sobre as MESMAS
linhas que somam nos agregados; a identidade vale por construção e não há como
divergirem.

**Onde ele ESTÁ:** no relatório de linha de base (`scratchpad/linha-base.mts`).
Ele emite o DFC — que está certo — e o DFC, corretamente, **exclui o financeiro
das Saídas Operacionais**, porque essa linha se chama *operacionais* e o
financeiro sai na sua própria (`Fluxo de Financiamentos`). Quem lê os três
números mais salientes e faz a conta de cabeça não chega ao Saldo Final:

```
680.884,72 + 519.976,29 − 1.230.567,52 = −29.706,51
saldo real                             = −31.000,16
resíduo                                =   1.293,65   ← o Resultado Financeiro
```

E o relatório **piorava a armadilha**: emitia duas "Saídas" diferentes para a
mesma janela de caixa, trinta linhas apart, sem dizer que diferiam — `Saídas
Operacionais` (R$ 1.230.567,52, sem financeiro) e `Saídas liquidadas`
(R$ 1.231.861,17, com tudo). Dois números com o mesmo rótulo curto na mesma
página é como uma leitura vira a outra sem ninguém perceber.

**A origem do R$ 1.293,65, conferida no banco** (org 835278a9, sem amostra):

| Categoria | Lanç. (carteira) | Valor (carteira) | Na janela 09/25–08/26 |
| --- | --- | --- | --- |
| Tarifas bancárias | 26 | R$ 1.881,99 | R$ 1.254,25 |
| Tarifas de adquirência | 10 | R$ 39,40 | R$ 39,40 |
| **Resultado Financeiro** | | | **−R$ 1.293,65** |

**A correção:** o relatório ganhou o bloco `DECOMPOSIÇÃO DO CAIXA`, com os
agregados TOTAIS (nome que diz que são totais), o resíduo **impresso**, e a
diferença para as Saídas Operacionais **nomeada** como Resultado Financeiro. O
resíduo não é só exibido: ele **derruba** o relatório (`exit 1`) — linha de base
que sai com resíduo é pior que nenhuma, porque quem a lê a toma por conferida.

Guarda no `engine-audit` (bloco `caixa:`), com as duas metades:

- a decomposição TOTAL fecha ao centavo, resíduo zero;
- o par ingênuo (só operacionais) **não** fecha, e o que sobra é exatamente o
  financeiro. ⚠️ Esta segunda existe para o próximo auditor encontrar a
  explicação em vez de perseguir o fantasma — **e** para impedir o conserto
  errado: se um dia o par ingênuo fechar, alguém somou o financeiro dentro de
  `saidas_operacionais`, e ele passou a contar duas vezes porque já sai em
  `fluxo_financiamento`. Provada quebrando os dois lados.

### ⚠️ POR QUE ISTO NÃO É "REFUTADO" — e por que o nome importa

Achado mal nomeado custa **duas rodadas**: uma para persegui-lo no lugar errado
e outra para reencontrá-lo. "Refutado" é veredito terminal — autoriza fechar o
item e diz ao próximo auditor para não voltar. Aplicado a um defeito que existe,
não conserta nada e ainda apaga o rastro que levaria à causa. "Diagnóstico
trocado" mantém o achado vivo e move só o endereço.

⚠️ É o oposto do A4P-028 e do A4P-036, e por isso os três ficam escritos juntos:
lá o veredito terminal estava certo e escrevê-lo impede o achado de voltar; aqui
ele estaria errado e escrevê-lo faria o defeito sumir do mapa. **O que decide
não é a força da medição, é se ela mediu o que a conclusão afirma.**

### ⚠️ O MEU ERRO DE MÉTODO — a regra R1 aplicada a mim mesmo

**Medi uma superfície e concluí sobre outra.** Consultei o banco juntando
`movements` a `categories` por `category_id`, e as 36 linhas de tarifa desta
organização têm **`category_id` NULO**, com o nome no campo TEXTO
`movements.category` — que é exatamente o que a classificação lê (`cat(m) =
m.category`). Todas caíram em `(sem categoria)`, `ehFinanceiro` não casou com
nada, e eu li um zero produzido pelo meu JOIN como se fosse um zero do negócio.

Sobre esse zero afirmei que o Resultado Financeiro era R$ 0,00 **em toda
organização e toda janela** — afirmação forte que a medição não sustentava, e a
distância entre as duas é o defeito.

É a **mesma família** do erro do A4P-036, pelo avesso: lá o motor foi alimentado
com colaboradores sem benefício e comparado com a tela alimentada pelo cadastro
real, e a conclusão foi divergência onde havia duas entradas diferentes. Aqui a
medição usou um caminho que a aplicação não percorre, e a conclusão foi ausência
onde havia junção errada.

**A regra, agora com dois casos:** *meça com o dado que a superfície usa* — e o
teste de que ela foi respeitada é conseguir dizer, ANTES de concluir, por qual
campo a superfície classifica. Se a resposta for "presumi", a medição ainda não
começou.

## ✅ 2. A projeção ignorava o vencido — **REPRODUZ**, corrigido

| Pendente, fora amostra, em 14/08/26 | Nº | Valor |
| --- | --- | --- |
| Saídas **vencidas** (mais antiga: 05/05/2023) | 5 | **R$ 74.248,59** |
| Saídas a vencer | 121 | R$ 332.754,37 |
| Entradas **vencidas** | 14 | **R$ 3.162,12** |
| Entradas a vencer | 31 | R$ 4.162,81 |

O recorte era `due_date >= hoje`, então **R$ 71.086,47 líquidos** ficavam fora da
projeção de caixa, sempre a favor da empresa.

**Regra de expectativa, explícita e rotulada:** o vencido em aberto é esperado a
partir de HOJE — a data mais cedo em que ainda pode se mover. Vale num lugar só
(`dataEsperada`), para cartões, árvore e calendário. O número mudou, então o nome
mudou: `entradasProjetadas`/`saidasProjetadas`, e `projetadoNaJanela` ao lado de
`previstoNaJanela` (a agenda de vencimentos continua respondível).

## ✅ 3. Cancelados invisíveis — **REPRODUZ**, e é PREEXISTENTE

| Cancelados, fora amostra | Nº | Valor |
| --- | --- | --- |
| Carteira inteira — entrada | 59 | R$ 189.960,40 |
| Carteira inteira — saída | 60 | R$ 389.401,01 |
| **Total** | **119** | **R$ 579.361,41** |
| No período do relatório (venc. 09/25–08/26) | 62 | R$ 395.722,13 |

⚠️ **Não é deriva recente.** Antes de escrever uma linha: **nenhum** evento da
trilha alterou `status` em momento algum — os únicos eventos que carregam esse
campo são os 123 `movements.criar` de 11/08, todos nascidos `pendente` (122) ou
`pago` (1). Os 342 `movements.alterar` de 13–14/08 são a reclassificação de
categoria do PR #100 (`antes: {category: "Impostos"}` → `depois: {category:
"Simples Nacional"}`), sem tocar em status. Os cancelamentos datam de junho/26 e
antecedem a trilha. **Documenta-se, não se desfaz.**

Excluir o cancelado do resultado está certo; o defeito era o silêncio. Virou
**rodapé** (`NotaCancelados`) no DRE, no DFC e no painel de títulos — nunca linha,
porque somá-lo devolveria ao resultado dinheiro que ninguém deve nem receberá.

## ✅ 4. A purga apagava o que não anuncia — **REPRODUZ**, corrigido

| `sample_reason` | Organização | Nº | Valor |
| --- | --- | --- | --- |
| `onboarding_demo` | 835278a9 | 146 | R$ 1.933.289,21 |
| `lancamento_teste` | 835278a9 | **1** | **R$ 500.000,00** |
| `onboarding_demo` | 17d99b37 | 168 | R$ 2.318.136,00 |
| `onboarding_demo` | b82aa9c5 | 144 | R$ 1.933.266,99 |

O botão anunciava "dados de demonstração" e apagava `is_sample = true` — levando
junto o lançamento de R$ 500.000,00 marcado à mão pelo id. Agora a purga exige
`sample_reason = 'onboarding_demo'`, e o banner diz quantos saem e quantos ficam.

## Defeito novo encontrado no caminho

**Um, e foi meu:** a conclusão do item 1 assentada numa medição que não media o
que eu disse que media (acima). Corrigida na mesma rodada, com o relatório de
linha de base fechando ao centavo e a guarda que impede o fantasma de voltar.

Fora isso, um ponto de fiação: o
calendário do fluxo de caixa recortava por `dataRef` enquanto os cartões
passariam a recortar por `dataEsperada` — com a correção do item 2 aplicada só
aos cartões, a agenda do mês passaria a discordar do KPI logo acima. Pego pela
própria fixture, antes de sair do galho, e corrigido no mesmo PR: a regra de
expectativa mora num lugar só.


---

# LOTE P-07 — de-para das categorias · ETAPAS 1 a 3 (14/08/2026)

Org `835278a9`, sem amostra. **A Etapa 4 (aplicar o de-para) não foi executada.**

## ETAPA 1 — `categories` deduplicada: 29 → 18 linhas

Antes de escrever, duas medições:

1. **Toda linha removida tem ZERO referências** — movimentos, rateios,
   recorrências, produtos, serviços, filhos e texto órfão, todos zero nas 11.
   Não houve repontamento a fazer: a consolidação é um no-op de relacionamento.
2. **Declarar `dre_linha` nos sobreviventes não move nenhuma linha do DRE.**
   Rodado com o motor real, comparando o estado de produção (só as quatro já
   declaradas) contra o proposto: as 15 linhas de nível 1 saem idênticas ao
   centavo. É o que separa deduplicação de de-para — se uma linha se mexesse, a
   declaração seria Etapa 4 e entraria sob outra aprovação.

**Removidas (11):** 7 duplicatas de nome exato — Aluguel, Folha de pagamento,
Marketing, Outras despesas, Tarifas bancárias ×2, Vendas ×2 — e **4 variantes**,
que eram o risco real que você apontou: `Utilidades (água, luz, internet)`,
`Fornecedores`, `Impostos e taxas`. Sobreviventes escolhidos pela referência:
`Vendas` ficou com a que tem 5 produtos e 1 serviço; `Aluguel`, com a que tem o
lançamento.

**Declaradas (12 novas + 4 que já eram):** todas as que hoje o palpite já
acertava. **`Marketing` e `Impostos` ficaram SEM declaração de propósito** — são
exatamente as duas que a Etapa 4 move de linha, e declará-las agora seria
aplicar o de-para fora de ordem.

## ETAPA 2 — as cinco alterações

- **(a)** `Housing` não funde com `Aluguel`. Acatado.
- **(b)** Categoria **"A classificar — possível pessoal"** criada, natureza
  `nao_operacional`. Nenhum lançamento movido (isso é Etapa 4).
- **(c)** `Tarifas de adquirência` → `despesa_variavel`: aprovado, **e a fixture
  do item 1 foi trocada antes**. Ela não fixa mais R$ 1.293,65 — asserta a
  IDENTIDADE: *o resíduo do par ingênuo é o resultado financeiro que a cascata
  apurou, seja ele qual for*. Provada nos dois sentidos: trocando o valor do
  financeiro na fixture ela continua passando; removendo o financeiro ela
  reprova (R2).
- **(d)** `Mensalidade` aprovada como `receita_bruta`, marcada para o **P-13**.
- **(e)** Os dois de R$ 0,00 saíram do de-para e viraram achado próprio, abaixo.

### ⚠️ ACHADO NOVO — o sistema aceitava lançamento de valor zero

Não é classificação, é **validação**. Medido: duas entradas de "Tarifas
bancárias" e um "Planilha" de saída, todos R$ 0,00.

O custo não é o zero — ele não move caixa nem resultado. É que ele **ocupa linha
em toda contagem**: "26 lançamentos de tarifa" vira 28, a média por lançamento e
o ticket médio caem, e a lista de títulos mostra uma obrigação a conferir que não
existe. Um número que ninguém consegue explicar faz duvidar dos vizinhos.

`exigirValor` recusa zero **e negativo** — o negativo por outra razão: `amount` é
MAGNITUDE nesta base, a direção mora em `type`, e um valor negativo inverteria o
sinal duas vezes em todo motor que usa `assinado()`. A trava está nos **dois**
escritores (`buildMovementRows` e `criarTitulos`); validar só um deixa aberta a
porta menos olhada, que é por onde entra a folha. Guardas provadas quebrando
cada um dos dois.

**Fica declarado como não feito:** os três lançamentos de valor zero JÁ gravados
continuam na base. Eles aparecem na fila de revisão (motivo `valor_zero`), para
saírem por decisão, não por varredura.

## ETAPA 3 — a fila de revisão, como tela

`core/revisao` (`revisao/1.0.0`) + `/upload?aba=revisao`. **Nada aqui é
classificado — a fila SEPARA** e mostra as três fontes lado a lado (descrição ·
categoria que o relatório lê · categoria que a chave diz), porque é a
discordância entre elas que exige gente.

Seis motivos: classificação não propagada · sem categoria · entrada com nome de
salário · descrição ilegível · valor zero · **regra recorrente contraditória**.

⚠️ **A regra recorrente entra na fila, não só os títulos que ela gera** — ver a
resposta à pergunta do A4P-018 abaixo. Corrigir os filhos e deixar a regra viva
a faz materializar o mesmo defeito no mês seguinte, e quem corrigiu conclui que
o sistema desfez o trabalho dela.

⚠️ **O detector de "descrição ilegível" nasceu errado nos DOIS sentidos, e a
fixture pegou.** Ele media proporção de letras: `! [=]E?s rica NE Bro,` tem 65%
e passava; `NF-e 123/45` tem 30% e era acusado. Deixava passar exatamente o caso
medido e acusava o que um financeiro escreve o dia inteiro. O critério agora é
marca de leitura ótica (colchete, chave, igual — duas ou mais) ou pontuação
dentro de palavra (`E?s`). A guarda cobra os dois lados: o que tem de ser pego,
e o que não pode ser.

## ⚠️ A4P-018 FECHA — mas com causa diferente da hipótese

**São os mesmos lançamentos.** `party_id` idêntico (`31b10574`) nos quatro de
R$ 35.000: contraparte **GOOGLE ADS CAMPANHA**, categoria **Assinaturas /
software**, descrição **"Salário"**.

**Mas a tela NÃO estava lendo a contraparte como descrição.** Ela agrupa por
contraparte + categoria por desenho, e foi isso que exibiu. Dado o dado, ela
estava certa.

A causa é o **cadastro da recorrência `d9439421`**, que já nasce contraditório:
`description = "Salário"`, `party_id → GOOGLE ADS CAMPANHA`, `category_id →
Assinaturas / software`, R$ 35.000/mês, mensal, **ativa e sem data de fim**. Os
quatro títulos são filhos fiéis dela — três carregam `reference_code`
`rec:d9439421:…`. Não há defeito de código na tela de recorrentes.

⚠️ **E ela continua projetando.** Sendo ativa e sem fim, esse único cadastro
responde por R$ 35.000/mês da projeção de compromisso recorrente — a maior
parcela dos R$ 40.802,55 de outubro/26 já registrados neste arquivo. Por isso
ela está na fila com a ação "Desativar a regra", e não só os títulos dela.

**Hipótese que caiu:** "a tela lia a contraparte como descrição". Como no item 1
do lote anterior, o achado é real e o endereço estava errado — **diagnóstico
trocado**, não refutado.


---

# ETAPA 4 APLICADA (14/08/2026) — e a invariante SE MOVEU

**81 lançamentos reclassificados.** `venda`→`Vendas` (64) · `Internet / telecom`,
`Electricity`, `Telecommunications`→`Utilidades` (7) · `Housing`, `Gyms`,
`Video streaming`, `Music streaming`→**A classificar — possível pessoal** (8) ·
`Impostos` (entrada)→**Restituição de impostos** (2). Mais 10 categorias criadas
com linha declarada e `Marketing`→`despesas_operacionais`.

## ⚠️ O RESULTADO LÍQUIDO MUDOU — +R$ 267,70, e a causa é uma só

| | Valor |
| --- | ---: |
| Antes | −R$ 784.743,23 |
| Depois | **−R$ 784.475,53** |
| Diferença | **+R$ 267,70** |

**Isolado, não deduzido.** Rodando a MESMA apuração com um único parâmetro
trocado — a transferência voltando a contar como despesa operacional — o
resultado dá **exatamente −R$ 784.743,23**. Ou seja: *toda* a Etapa 4 é neutra
no fundo, **exceto** tirar as transferências do DRE, e essa parte move o
resultado pelo valor exato delas (fatura de cartão R$ 167,70 + boleto de
transferência R$ 100,00).

Não é defeito: é a correção fazendo efeito. Uma transferência nunca foi despesa,
e enquanto ela estava lá o custo da empresa carregava dinheiro que só mudou de
bolso. Mas **fica declarado**, porque a regra é parar e dizer quando o fundo se
mexe — e porque a invariante "o resultado líquido não muda" foi formulada para
reclassificação PURA, e esta operação não é só isso.

## Os sete valores, medidos (12 meses, competência, sem amostra)

| Linha | Antes | Depois |
| --- | ---: | ---: |
| Receita Bruta Operacional | 523.147,94 | **522.492,64** |
| Deduções | 248.707,93 | **46.144,70** |
| Despesas Variáveis | 54.417,61 | **39,40** |
| **Margem de Contribuição** | 220.022,40 | **476.308,54** |
| Despesas Operacionais | 1.003.471,98 | **1.181.611,76** |
| EBITDA | −783.449,58 | **−705.303,22** |
| **Resultado Financeiro** | −1.293,65 | **−1.254,25** |
| Impostos sobre o Lucro | 0,00 | **75.982,66** |
| Resultado não Operacional | 0,00 | **−1.935,40** |
| **Resultado Líquido** | −784.743,23 | **−784.475,53** |

⚠️ A Margem de Contribuição sobe **R$ 256.286,14**, não os R$ 71.043,14 do
Marketing: a dedução caiu R$ 202.563,23 junto, porque INSS patronal e IRPJ/CSLL
saíram dela na Etapa 1 e a restituição passou a reduzi-la. Os R$ 71.043,14 são
só a parcela do Marketing.

## Duas regras novas no motor, e as duas mexem no resultado

- **`LINHA_TRANSFERENCIA`** — `transferencia` não é linha, é a ausência de linha
  DITA. Antes, a única forma de tirar um pagamento de fatura do resultado era
  não declará-lo, e aí o palpite o punha em despesa operacional. Declaração
  desconhecida cai no palpite **em silêncio** — era esse o risco.
- **ENTRADA em linha de sinal "-" é ESTORNO** e entra negativa. Em magnitude, a
  restituição AUMENTARIA a dedução: o contribuinte recebe de volta e o DRE
  registra que pagou mais imposto.

Guardas no `engine-audit`, provadas quebrando as duas.

## ⚠️ A4P-018 — REESCRITO: a linha NÃO é fabricada

**Refutada a hipótese de linha fabricada.** Medido: existem **4** lançamentos com
`party_id` → GOOGLE ADS CAMPANHA, todos R$ 35.000, todos com a chave apontando
para *Assinaturas / software*, em 4 meses distintos. O widget agrupa por
contraparte + categoria e a média sai de 140.000 ÷ 4 = R$ 35.000/mês. **Todos os
campos da linha vêm do MESMO conjunto coerente.**

⚠️ **O que explica a sua medição:** os 12 "GOOGLE ADS CAMPANHA" e 12 "META ADS"
de R$ 1.763,92–5.089,43 têm o nome do fornecedor na **descrição** e
`party_id` **NULO**. São população diferente. E `getRiscoInput` resolve
`category` pela CHAVE antes do texto (`embedName(m.categoria) ?? m.category`),
então o app enxerga "Assinaturas / software" onde o texto está vazio.

### ⚠️ Mas há um defeito real ao lado, e ele é novo

`contraparte: nomes[party_id] ?? ultimo.category ?? "Sem contraparte"` — **quando
não há contraparte, o widget usa a CATEGORIA como nome dela**. Os 24 lançamentos
de Google e Meta (R$ 71.043,14) não têm `party_id`, então aparecem numa única
linha chamada **"Marketing"**, fundindo dois fornecedores distintos e ignorando
o nome que está na descrição. Um campo ocupando o lugar de outro — a mesma
família que a hipótese suspeitava, no fallback e não no agrupamento.

**Não corrigido nesta rodada.** Fica na fila.

## ⚠️ `competence_date` — MEDIDO, e é pior que fallback silencioso

| | |
| --- | --- |
| Lançamentos reais | 530 |
| Com `competence_date` | **123 (23,2%)** |
| Desses, iguais ao vencimento | 121 |
| Desses, diferentes | **2** |

⚠️ **Não há fallback: o motor NUNCA lê `competence_date`.**
`dataDe(m, "competencia")` devolve `m.due_date`, ponto
(`core/indicadores/convencoes.ts`), e `RiskMovement` sequer declara o campo —
`getRiscoInput` não o seleciona. **A coluna é inerte.** "DRE por competência" é
DRE por vencimento, por definição escrita, não por acidente.

**Exposição hoje: zero.** Os 2 lançamentos em que competência ≠ vencimento
diferem por dias DENTRO do mesmo mês (11→12/06 e 10→15/06), e a apuração é
mensal. O risco é estrutural: no dia em que alguém lançar uma compra de março
para vencer em abril, o DRE a põe em abril e não avisa.

**Não corrigido, como instruído.** É decisão de produto: ou a competência passa a
ser lida (e aí `RiskMovement` ganha o campo, com `?? due_date` explícito), ou o
sistema para de chamar de competência o que apura por vencimento.
