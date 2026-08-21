> ## ⚠️ A LIÇÃO DA AUDITORIA INTEIRA
>
> **"Escrevi a rota com o mesmo padrão das três que já existiam, sem questionar o
> padrão — ausência de configuração virando permissão, e ninguém olhando porque
> é assim que as outras fazem."**
>
> Dito ao fim do A4P-078 (19/08/2026), quando o dono descobriu que `CRON_SECRET`
> nunca existira e as quatro rotas de cron respondiam a qualquer chamada — a
> mais antiga desde 09/06.
>
> ⚠️ **O defeito não foi escrever errado: foi COPIAR sem perguntar.** A rota nova
> nasceu com o padrão das vizinhas, e o padrão era a porta aberta. É assim que
> um defeito deixa de ser um caso e vira o jeito da casa — e é por isso que a
> pergunta *"por que assim?"* vale mais, numa base madura, do que a pergunta
> *"está igual às outras?"*.
>
> Vale para toda sessão futura: **consistência com o código existente não é
> evidência de correção.** Quando o padrão decide segurança, ele se justifica ou
> se troca.

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


---

# CORREÇÕES DE 14/08 (noite) — invariante, contraparte, competência

## 1. A invariante do fundo, na forma geral

`Δ Resultado Líquido = −(total do que SAIU do DRE)`, zero quando nada sai. A
asserção do contrato foi trocada: antes cobrava "não pode mudar", o que
reprovaria toda remoção legítima. Agora há dois casos lado a lado —
reclassificação pura (Δ = 0) e remoção (Δ = valor do removido) — e o segundo
tem asserção de que os dois cenários DISCORDAM, senão o caso não testa nada.

## 2. A4P-018 — REFUTADA a acusação de linha fabricada

Os 4 lançamentos de R$ 35.000 têm `party_id` → GOOGLE ADS CAMPANHA **de
verdade**, todos com a chave apontando para *Assinaturas / software*, em 4 meses
distintos. A média de R$ 35.000/mês sai deles. Todos os campos da linha vêm do
mesmo conjunto coerente. **A linha não é fabricada.**

O que explicava a leitura contrária: os 12 "GOOGLE ADS CAMPANHA" e 12 "META ADS"
de R$ 1.763,92–5.089,43 têm o nome na **descrição** e `party_id` NULO — população
diferente, medida por um caminho que a tela não usa.

### O defeito real, corrigido

`nomes[party_id] ?? ultimo.category ?? "Sem contraparte"` — sem cadastro, a
CATEGORIA virava o nome da contraparte. E como a **chave do agrupamento** sai
daí, os 24 lançamentos de Google e Meta (R$ 71.043,14) colapsavam num único
compromisso chamado "Marketing", com as médias somadas.

Agora: cadastro → descrição normalizada (`nucleoContraparte`) → "Sem
contraparte". **A categoria não entra em nenhum degrau.** Guarda provada
quebrando: com a categoria de volta, os dois fornecedores viram um grupo só.

## 3. `competence_date` — o motor passou a ler

**Medido ANTES de aplicar, como instruído:** zero diferença nas sete linhas do
DRE entre apurar por vencimento e por competência. Confirmado o esperado.

| | |
| --- | --- |
| Lançamentos reais | 530 |
| Com competência | 123 (23,2%) |
| Diferentes do vencimento | 2 — e no mesmo mês |

**Quem preenche, medido por origem:**

| `origem` | total | com competência |
| --- | ---: | ---: |
| `manual` (o formulário) | 121 | **121 — 100%** |
| nula (importação / onboarding) | 407 | **2** |
| `venda` | 2 | 0 |

⚠️ **Não é o formulário: é a importação.** O modelo de planilha em lote
(`ImportacaoView`) **não tem coluna de competência** — não é que ela não seja
exigida, ela não existe. E o extrato/onboarding grava sem. É por aí que entram
os 77%.

### ⚠️ A correção desenterrou uma SEGUNDA implementação da regra de data

`core/relatorios.dataDoRegime` repetia a regra por conta própria. Foi por isso
que ligar a competência em `dataDe` não mudou nada no DRE na primeira tentativa:
**o relatório nunca chamava a função canônica.** Agora delega.

⚠️ **E a delegação trocou o regime em silêncio, num caso que a guarda pegou.**
Com `regime` indefinido, a expressão antiga caía em competência por acidente do
ternário e a delegação caía em caixa pelo acidente inverso — R$ 5.000 de
diferença entre o cartão e a tabela na fixture. A normalização passou a ser
DITA, e a chamada que omitia o regime foi corrigida.

### A fixture que separa os dois regimes

Uma compra com competência em **março** e vencimento/pagamento em **abril** cai
em março no DRE e em abril no DFC — e a guarda exige que os dois **discordem**
sobre ela. Era esse caso que não existia no sistema.


---

# ETAPA C — MULTI-TENANT (17/08/2026)

## 9. Isolamento por organização

**O que já existe e roda:** o job `isolamento` do CI sobe um Postgres do zero
pelas migrations, cria **duas organizações e dois usuários pelo gatilho de
signup** (não por INSERT à mão, que testaria um caminho que nenhum cliente
percorre), tenta o cruzamento nos dois sentidos em **ler, agregar, inserir,
atualizar e apagar**, e termina em ROLLBACK. Verde em todo push.

Foto estática de produção, medida em 17/08: **55 tabelas com `org_id`, todas com
RLS ligada, `anon` sem SELECT em nenhuma.** A única sem política é
`subscriptions`, de propósito — é só-DEFINER desde a migration 0014.

### ⚠️ GAP ABERTO — pendência do DONO DO REPOSITÓRIO, não da sessão

> **O teste roda contra um banco EFÊMERO. Rodar contra PRODUÇÃO com dois
> usuários reais, cada um com o próprio papel, segue ABERTO.**

Por que importa: `teste_isolamento_completo()` é `SECURITY INVOKER` de propósito
— ela roda com os privilégios de QUEM CHAMA, contra as políticas de verdade.
Chamá-la por uma conexão privilegiada responde sempre "está tudo bem", porque o
dono enxerga tudo: **testaria a si mesma**. Foi exatamente esse o defeito da
ONDA 9, cujo placar de "44 tabelas, 0 vazamentos" foi medido com papel
privilegiado.

Fechar o gap exige credenciais de dois usuários reais de organizações
diferentes. Uma sessão de agente **não deve inventá-las nem criá-las**, e por
isso o item fica registrado aqui em vez de ser declarado feito.

## 10. Matriz de permissão

**A matriz VIGENTE, medida em `role_permissions` em 17/08:**

| Papel | ler | exportar | lançar | baixar | aprovar | fechar | administrar | cobrança |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **owner** (Titular) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **admin** (Administrador) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | |
| **fechador** (Contador) | ✔ | ✔ | ✔ | ✔ | | ✔ | | |
| **aprovador** | ✔ | ✔ | ✔ | ✔ | ✔ | | | |
| **lancador** (Lançador) | ✔ | ✔ | ✔ | ✔ | | | | |
| **member** (legado ≡ lançador) | ✔ | ✔ | ✔ | ✔ | | | | |
| **contador_externo** | ✔ | ✔ | | | | ✔ | | |
| **leitor** | ✔ | | | | | | | |

⚠️ **São OITO papéis, não os quatro do enunciado** (Leitura, Operacional,
Financeiro, Admin). Não remapeei: reduzir oito para quatro é decisão de produto
com migration de dados atrás — `owner`, `admin` e `member` estão em uso hoje
(15, 1 e 1 vínculos). O mapa natural seria Leitura←`leitor`,
Operacional←`lancador`/`member`, Financeiro←`aprovador`+`fechador`,
Admin←`admin`/`owner` — e ele **perde** o `contador_externo`, que é o único
papel desenhado para um terceiro fora da empresa.

### ⚠️ ACHADO — o banco tinha oito papéis e o cliente conhecia sete

`role_permissions` tem `contador_externo` (ler, exportar, fechar) desde a ONDA
13. O tipo `Papel` em `src/core/seguranca` tinha **sete** valores e não o
incluía. Consequência: a tela de usuários não conseguia oferecê-lo, e um usuário
que o recebesse por SQL apareceria com a **string crua**, porque `nomeDoPapel`
não o encontrava.

A decisão da ONDA 9 — "a matriz mora no servidor e a interface PERGUNTA" —
continua certa. O que faltava é a outra metade: **perguntar só funciona se o
cliente souber nomear a resposta.**

Corrigido, com guarda dos dois lados: `scripts/matriz-permissao.sql` cobra o
banco (no job `isolamento`) e o bloco `permissao:` do `engine-audit` cobra o
cliente. Ambas provadas quebrando.

## 11. A4P-070 — o grant residual

⚠️ **Minha ampliação do escopo estava errada, e aplicá-la teria quebrado a
aplicação da maquininha.** Medi 10 tabelas `maq_*` com os quatro verbos
concedidos a `authenticated` e propus revogar em todas. **Sete delas** têm a
política `maq_admin_all` (`FOR ALL ... USING maq_is_admin()`) aplicada ao papel
`authenticated` — ou seja, `authenticated` é o papel por onde o administrador da
maquininha opera, e o grant ali **serve** a política.

O alvo certo são as **três** do enunciado original — as que têm RLS ligada e
**zero políticas**, onde o grant não serve a nada e só engana quem audita:
`maq_cnpj_cache`, `maq_leads`, `maq_whatsapp_log`.

## A4P-074 — as 19 tabelas que este repositório não lê

**O que consigo provar:**

- **As 19 têm migration NESTE repositório.** Não são schema órfão:
  `maq_pricing_engine_schema`, `maq_grants_authenticated`,
  `create_maq_leads_and_whatsapp_log`, `own_integracao_adquirencia` e
  `trilha_alcanca_as_tabelas_de_adquirencia`.
- **Nenhuma tem `org_id`** — não aparecem nas 55 tabelas do modelo multiempresa,
  então estão fora do escopo da RLS por organização por construção.
- **As 9 `own_*` estão TODAS VAZIAS.** Schema preparado para uma integração que
  não foi ligada.
- **8 das 10 `maq_*` têm dados**, e uma delas prova escrita ativa:
  `maq_cnpj_cache` tem 25 linhas gravadas em **11 dias distintos**, entre
  14/07 e 13/08. Um seed cai numa transação, num dia. **Isto é uso.**
- **Este repositório não lê nenhuma delas** (`grep -rn "maq_\|own_" src/`
  devolve só um comentário).

**Conclusão que o dado sustenta:** existe código FORA deste repositório
escrevendo em `maq_cnpj_cache`. E ele **não usa `authenticated`** — a tabela tem
RLS ligada com zero políticas, o que já nega esse papel; logo o escritor é
`service_role` ou o dono do banco.

**O que NÃO consigo provar daqui:** qual é esse código, onde ele roda, e se ele
também lê as sete `maq_*` com política. Isso exige acesso ao outro repositório
ou aos logs de conexão, e eu não os tenho — não vou adivinhar.

**Consequência para a Etapa C, honesta:** o teste de isolamento **não** está
medindo metade do sistema em termos de risco de vazamento entre organizações,
porque as 19 tabelas não têm `org_id` e não participam do modelo. Mas ele
também não diz nada sobre elas — e se a maquininha vier a guardar dado de
cliente, elas entram no modelo e o teste precisa alcançá-las.


---

# A4P-074 RESPONDIDO — e A4P-076, um achado que a falha do CI revelou

## A pergunta: há código lendo essas tabelas fora deste repositório?

**Sim, e é provável.** O projeto Supabase tem **8 Edge Functions ATIVAS**, e
**5 delas não existem neste repositório**:

| Função | Está no repo? | Família |
| --- | --- | --- |
| `pluggy-connect-token` | ✔ | Open Finance |
| `pluggy-webhook` | ✔ | Open Finance |
| `pluggy-sync-item` | ✔ | Open Finance |
| **`get-rate`** | ✗ | maquininha |
| **`submit-cadastro`** | ✗ | maquininha (leads) |
| **`send-lead-email`** | ✗ | maquininha (leads) |
| **`own-webhook`** | ✗ | adquirência |
| **`own-sync`** | ✗ | adquirência |

⚠️ E a ligação com `maq_cnpj_cache` está **escrita numa migration deste
repositório** desde 15/07: *"Isso segue o mesmo padrao ja usado no dbWrite() do
get-rate para maq_cnpj_cache"*. Ou seja: `get-rate` é o escritor das 25 linhas
em 11 dias distintos, e alguém já sabia disso ao escrever a migration.

**Consequência para o teste de isolamento:** as 19 tabelas não têm `org_id` e
não participam do modelo multiempresa, então não são um vazamento entre
organizações hoje. Mas **cinco funções escrevem no mesmo banco sem passar por
nada que este repositório teste** — nem a RLS por organização, nem as guardas,
nem o CI. Quando a maquininha guardar dado de cliente, isso deixa de ser
inofensivo.

## ⚠️ A4P-076 — `maq_cnpj_cache` é SCHEMA ÓRFÃO

Descoberto pelo CI ao reprovar a migration do A4P-070 com
`relation "public.maq_cnpj_cache" does not exist (SQLSTATE 42P01)`: num banco
construído do ZERO pelas migrations, **a tabela não existe**. Ela existe só em
produção. As duas ocorrências do nome no repositório são comentários.

É a mesma classe do PR #91, e mostra o limite da guarda `npm run esquema`: ela
compara **nomes de migration**, não **objetos**. Uma tabela criada à mão em
produção passa despercebida enquanto ninguém tentar tocá-la por migration.

⚠️ **Não usei `if exists` para contornar.** A migration ficaria verde no CI sem
fazer nada e faria efeito só em produção — comportamento divergente entre
ambientes é exatamente o que a guarda de esquema existe para impedir, e
esconderia o órfão em vez de denunciá-lo. `maq_cnpj_cache` entra quando o CREATE
dela vier para o repositório.

**Fica ABERTO:** trazer o CREATE de `maq_cnpj_cache` e as 5 Edge Functions para o
repositório, e estender `npm run esquema` para comparar OBJETOS, não só nomes de
migration.


---

# A4P-076 — A GUARDA DE OBJETOS (17/08/2026)

## O que `npm run esquema` não alcança

Ele confronta a **lista de migrations aplicadas** com os arquivos do
repositório. Isso pega migration aplicada sem arquivo — e deixa passar o defeito
que o nome não alcança: **um objeto criado à mão em produção**. `maq_cnpj_cache`
viveu meses assim, com a guarda verde o tempo todo.

## A ferramenta

`npm run objetos` compara dois inventários de **430 objetos** (medidos em
produção em 17/08): 77 tabelas, 95 funções, 112 policies e 146 grants.

- **o que as MIGRATIONS produzem** — extraído do banco efêmero do job
  `isolamento`, que nasce do zero das migrations;
- **o que PRODUÇÃO tem** — o retrato em `supabase/objetos-producao.json`,
  gerado por `npm run objetos:sync`.

Três classes de divergência, todas reprovando:

| Classe | Significa |
| --- | --- |
| **ÓRFÃO** | existe em produção, nenhuma migration o cria — é o A4P-076 |
| **ausente** | está nas migrations e não em produção |
| **DERIVA** | existe nos dois com definição diferente — o mais silencioso |

A assinatura é um md5 do que **define** o objeto (colunas/tipos/nulidade;
`SECURITY DEFINER`/`search_path`/volatilidade; comando + `USING` + `WITH CHECK`;
privilégios), não do texto — reformatação não vira divergência, mudança de
comportamento vira.

**Provada quebrando** com um par sintético de inventários: um órfão, um ausente
e uma deriva, cada um acusado com o nome.

### ⚠️ NÃO ESTÁ LIGADA NO CI, e o motivo é declarado

O retrato precisa ser gerado com o `SUPABASE_DB_URL` de **produção**, que uma
sessão de agente não tem e não deve inventar. Ligar sem o retrato deixaria o job
vermelho em todo merge; ligar com `if exists` seria pior — verde sem medir nada.

**Para ligar, uma linha por quem tem a credencial:**

```
SUPABASE_DB_URL=… npm run objetos:sync && git add supabase/objetos-producao.json
```

e descomentar o passo já escrito em `.github/workflows/ci.yml`.

---

# ⚠️ OS CAMINHOS DE ESCRITA NO BANCO QUE NÃO PASSAM POR ESTE REPOSITÓRIO

> **Enquanto esta lista não estiver vazia ou inteiramente justificada, o produto
> não está pronto para auditoria de cliente.** Um auditor pergunta "quem pode
> escrever aqui?", e a resposta hoje inclui coisas que este repositório não vê.

| # | Caminho | O que se sabe | O que NÃO se sabe |
| --- | --- | --- | --- |
| 1 | **Edge Function `get-rate`** | Ativa, versão 5, `verify_jwt: true`. Escreve em `maq_cnpj_cache` — a ligação está escrita numa migration deste repo desde 15/07 ("o mesmo padrao ja usado no dbWrite() do get-rate"). 25 linhas em 11 dias distintos. | Onde mora o código, quem faz deploy, que outras tabelas toca, se usa `service_role` |
| 2 | **Edge Function `submit-cadastro`** | Ativa, versão 2, `verify_jwt: true`. Família `maq_leads` (hoje vazia). | Código, dono, escopo |
| 3 | **Edge Function `send-lead-email`** | Ativa, versão 2, `verify_jwt: true`. Família de leads. | Código, dono, se escreve ou só lê |
| 4 | **Edge Function `own-webhook`** | Ativa, versão 1, **`verify_jwt: false`** — aceita chamada sem autenticação. Família `own_*` (todas vazias). | Código, dono, como valida o remetente |
| 5 | **Edge Function `own-sync`** | Ativa, versão 1, **`verify_jwt: false`**. | Idem |
| 6 | **`service_role`** | 73 tabelas com grant. É a chave que ignora RLS. | Quem a possui fora da Vercel; não há inventário de portadores |
| 7 | **Acesso direto ao banco** | O painel do Supabase permite DDL e DML sem passar por PR — foi assim que `own_integracao_adquirencia` entrou em 13/08 e como `maq_cnpj_cache` nasceu. | Quem tem acesso hoje |
| 8 | **`pg_cron`** | Há policies `job` e `job_run_details` no inventário. | Que jobs existem e o que escrevem |

⚠️ **Três das cinco funções estão no repositório** (`pluggy-connect-token`,
`pluggy-webhook`, `pluggy-sync-item`); **cinco não estão**. E duas delas
(`own-webhook`, `own-sync`) rodam com `verify_jwt: false`.

⚠️ **Achado adicional do inventário:** existem **11** tabelas `own_*`, não 9 —
`own_token_cache` e `own_extrato_lojista` não apareceram na contagem anterior,
que partiu da lista de tabelas com `org_id`. Essas duas não têm `org_id`.

⚠️ **E há uma guarda de DDL no banco que o repositório não usa:** o inventário
tem `tabela:ddl_log`, `funcao:registrar_ddl()` e `funcao:ddl_recentes(p_dias)`.
Ou seja, o registro de DDL **existe** — o que falta é alguém lê-lo. Isso muda o
item 14 do P-18: não é "criar o secret", nem "escrever o workflow do zero", é
**ligar um consumidor ao que já grava**.

## O que NÃO consigo fazer, e por quê

**Trazer as 5 Edge Functions para o repositório: não consigo.** O MCP do Supabase
expõe `list_edge_functions` e `get_edge_function`, mas o `entrypoint_path` aponta
para um caminho efêmero do runtime (`/tmp/user_fn_…`), não para o fonte. Baixar o
código exige a CLI autenticada (`supabase functions download`) com um token de
acesso que esta sessão não tem.

**Quem é o dono:** não sei, e não vou supor. As três `pluggy-*` estão no
repositório, o que sugere um caminho de deploy conhecido; as cinco restantes
foram publicadas por fora dele. Descobrir quem as publicou exige o painel do
Supabase (Logs → Edge Functions → deployments).

**`maq_cnpj_cache`:** consigo reconstruir o CREATE a partir do catálogo do banco,
mas isso é o mesmo padrão do PR #91 (recuperação verbatim) e merece o mesmo
cuidado — o SQL literal, não a minha transcrição. Fica declarado como próximo
passo, não como feito.


---

# A4P-077 — REBAIXADO PARA P2, com a evidência que o rebaixou

## O que a medição mostrou (17/08, base das 11 tabelas `own_*` zerada antes e depois)

| Sonda, SEM token | own-webhook | own-sync |
| --- | --- | --- |
| `GET` | 405 `{"erro":"somente POST"}` | 401 `{"erro":"nao autorizado"}` |
| `POST` | **401 `{"erro":"nao autorizado"}`** | **401 `{"erro":"nao autorizado"}`** |
| `POST` Bearer inválido | 401 | — |
| Efeito no banco | **nenhum** | **nenhum** |

⚠️ **`verify_jwt: false` = gateway de JWT desligado, NÃO ausência de verificação.**
As duas funções executam (`x-served-by: supabase-edge-runtime`) e recusam com
uma mensagem do próprio handler, em português — não o 401 padrão do gateway.

⚠️ **Registro exato, como pedido:** *own-webhook recusa chamada sem credencial
(medido). O mecanismo da verificação é desconhecido porque o fonte não está no
repositório.* Não se escreve "seguro" em lugar nenhum — o 401 prova que há
fechadura, não que ela não seja um segredo estático já vazado nem que resista a
replay.

## A guarda (`npm run portas`, no SCHEDULE)

Roda no job `no-ar` (schedule 15 min + após cada deploy no main), não no
`npm test`: depende de rede, e o que mede é estado contínuo de produção. Caso
negativo (recusa sem credencial → 401) e positivo (a função está no ar e aplica
a própria regra → 405 no GET) juntos, pela regra. **Medido verde agora.**

## O QUE SOBRA DE VERDADE: o `service_role`

Inventário medido: **76 tabelas** com grant a `service_role` (não 73 — minha
contagem anterior estava baixa). Dessas, **8 só-service_role** (nenhum acesso
por `authenticated`): `admin_acessos`, `admin_audit`, `own_token_cache`,
`plans`, `platform_admin_permitidos`, `platform_admins`, `rota_alias_acessos`,
`subscriptions`.

### Processos que usam a chave — o que consigo provar

| Consumidor | Onde a chave está | No repo? |
| --- | --- | --- |
| `src/lib/supabase/admin.ts` (`createAdmin`) | `process.env.SUPABASE_SERVICE_ROLE_KEY` (Vercel) | ✔ |
| `/api/admin/impersonate` | idem | ✔ |
| `/api/recorrencias/run` | idem | ✔ |
| Edge `pluggy-webhook`, `pluggy-sync-item` | secret da função (Supabase) | ✔ |
| Edge `get-rate`, `submit-cadastro`, `send-lead-email`, `own-webhook`, `own-sync` | secret da função | **✗** |

### ⚠️ POR QUE NÃO REDUZI O GRANT, e é o ponto inteiro

**Reduzir de 76 tabelas para o mínimo por consumidor exige saber que tabelas
cada consumidor toca — e 5 dos consumidores não estão no repositório.** Cortar
o grant de uma tabela que `own-sync` escreve, sem ver o fonte de `own-sync`,
quebra a integração em produção sem aviso. É exatamente o recorte cego que esta
auditoria vem punindo.

Então, honestamente:

- **A redução está BLOQUEADA no A4P-076** (trazer as 5 funções para o
  repositório). Antes disso, qualquer corte é aposta.
- **NÃO SEI** quem, fora da Vercel e do Supabase, possui a `SUPABASE_SERVICE_ROLE_KEY`.
  Não há inventário de portadores, e não há como derivá-lo do banco — a chave
  não deixa rastro de "de onde veio", só de "o que fez". Se ela vazou, o
  `service_role` ignora toda a RLS que fechamos hoje.
- **O que dá para fazer agora, e não fiz por ser mudança de acesso sem o dono
  presente:** as 5 funções fora do repo sugerem que o corte seguro começa pelas
  8 tabelas só-service_role — nenhuma delas é tocada por `own-*` (são de
  plataforma e admin). Mas "sugere" não é "provei", e mexer em grant de
  produção é a operação que mais pede o dono na sala.

---

# ITEM 14 DO P-18 — o consumidor do `ddl_log` (`npm run ddl`)

O registro de DDL **já existe e grava**: `ddl_log`, o gatilho `registrar_ddl()`
e `ddl_recentes()`. Faltava quem lê e reprova. `npm run ddl` é isso.

⚠️ **É o PAR do `npm run objetos`, não o substituto — um mede estado, o outro
mede evento.** `npm run objetos` não vê objeto criado-e-dropado; some do estado.
Medido: o `ddl_log` guardou `CREATE TABLE own_probe2`, `own_q`, `own_prod`,
`own_d` — quatro tabelas de sondagem criadas à mão em 13/08 e já removidas. O
estado não tem rastro; o log tem.

⚠️ **O campo `contexto` NÃO separa migration de DDL manual.** Medido: os 305
eventos são TODOS `mgmt-api`, porque neste projeto as migrations são aplicadas
pelo management API (via MCP), o mesmo canal do editor de SQL. O sinal honesto é
o NOME do objeto: se migration nenhuma o menciona, é DDL sem procedência.
Provado: `own_probe2`/`own_q`/`own_prod`/`own_d` têm 0 migrations; `movements`
tem 34, `own_lojistas` e `own_integracao` têm 1 cada.

**Limite declarado:** o casamento é por nome, então uma coluna nova numa tabela
conhecida passa (o nome da tabela aparece em alguma migration). É deliberado — o
alvo é o objeto ÓRFÃO; a deriva fina de coluna é território do `npm run objetos`
pela assinatura.

⚠️ **Nem `npm run objetos` nem `npm run ddl` estão ligados no CI ainda**, e o
motivo é o mesmo: os dois precisam do `SUPABASE_DB_URL` de produção. Ambos ficam
comentados no workflow, com a linha exata para ligar. Corrigindo o que se disse
antes: o secret `SUPABASE_DDL_URL` nunca existiu — foi invenção. O secret certo
é `SUPABASE_DB_URL`, um só, que liga as duas guardas.

## ⚠️ A4P-076 LIGADO — o que o esquema-prod achou, medido (17/08 tarde)

O job `esquema-prod` (schedule, papel `ci_leitor`) rodou e reprovou. O sinal
bruto: **77 DERIVA + 1 ausente**. A leitura, medida — não deduzida:

- **Mascaramento de privilégio: DESCARTADO.** `aclexplode`, `pg_get_expr` e as
  colunas de catálogo (`prosecdef`/`proconfig`/`provolatile`) são independentes
  de papel. Reli produção pela leitura privilegiada e bate com o que o `anon`
  vê. O retrato é fiel.

- **~65 `grant:*.service_role` eram RUÍDO, não deriva.** `grep` nas migrations:
  **ZERO** concedem a `service_role` — todo grant a esse papel é da PLATAFORMA
  do Supabase. Como a guarda compara o banco EFÊMERO (supabase local) com o
  retrato de PRODUÇÃO, e os defaults de `service_role` do local divergem do
  hospedado, incluí-lo despejava deriva de plataforma que a guarda não cria nem
  controla — soterrando o sinal real. `objetos.sql` passou a olhar só `anon` e
  `authenticated`, os papéis que chegam pelo navegador e que as migrations
  gerenciam.

- **`org_balances()` era DERIVA REAL.** Medido no catálogo de produção:
  `provolatile='s'` (STABLE); a migration 0020 a define num `language sql` SEM
  palavra de volatilidade → default VOLATILE. Alguém a tornou STABLE em produção
  fora de migration — a classe exata que o A4P-076 existe para pegar. STABLE é o
  certo para um `security definer` que só lê. Migration nova
  (`20260817193000_org_balances_stable_alinha_producao`) alinha o repositório;
  em produção é no-op. Declarada como sem-aplicação no manifesto do esquema.

- **O "1 ausente" era o eco dos `\pset` do `psql`** (`Field separator is "|".`)
  entrando no inventário porque contém `|`. O leitor de `esquema-objetos.mjs`
  agora aceita só linhas com os quatro prefixos (`tabela|funcao|policy|grant`).

- **Os órfãos REAIS ficam DECLARADOS (9):** as tabelas `own_token_cache`,
  `own_extrato_lojista`, `maq_cnpj_cache`; as funções `own_saude`,
  `own_token_pegar/gravar/bloquear`; e os dois grants `authenticated` que as
  acompanham. É o subsistema de adquirência/maquininha que as Edge Functions
  criam fora do repositório (A4P-074). `grep` confirmou que o resto do
  `own_*`/`maq_*` (18 tabelas, `own_touch`, `maq_is_admin`) É criado por
  migration — não são órfãos. Retrato regerado do catálogo (351 objetos),
  byte-idêntico ao que o `ci_leitor` produz; o `esquema-prod` revalida a
  paridade contra o efêmero.

⚠️ **A fiação anterior estava errada em dois pontos, corrigidos:** `objetos`
apontava para o secret de produção (devia comparar o EFÊMERO com o retrato), e
as duas guardas moravam no job de PR (guarda de comparação-com-produção no gate
de PR trava o próprio merge que a conserta). Agora vivem no job `esquema-prod`,
event-gated: só `main`-push, schedule e dispatch, nunca PR.

---

# ⚠️ APLICAÇÃO DE MIGRATION EM PRODUÇÃO — MANUAL, com dono (P-19, 18/08/2026)

**Enquanto o portão de CI do Bloco A não existir, produção recebe migration por
COLAGEM MANUAL, e isso é dívida declarada — não paisagem.**

- **Responsável:** joão (dono do repositório). Cola o arquivo do repositório
  **verbatim** no SQL Editor do Supabase, na ordem cronológica dos nomes.
- **Validação:** depois da colagem, a sessão relê o catálogo de produção via MCP
  objeto a objeto, re-sincroniza os três retratos (`objetos-producao.json`, a
  linha de base de `service_role`, os `orfaos_declarados`) e remove o aplicado
  das `pendentes` em `supabase/esquema.json`. É o `npm run objetos` (deriva
  ZERO) que valida a colagem, não a atenção de quem colou.
- **O que impede o esquecimento:** as `arquivo_sem_aplicacao` em
  `supabase/esquema.json` são a lista viva do que falta aplicar, com `resolver_ate`.
  Uma migration que fica pendente além do prazo aparece no diff da próxima
  sessão.

⚠️ **A dívida tem PRAZO: o portão automático (Bloco A do P-19).** Um job de CI
que aplica as pendentes em push no `main`, transacional (meia-migration é pior
que nenhuma), com credencial de ESCRITA separada do `ci_leitor`, e rodando
`objetos`+`ddl` depois. O desenho está na conversa do P-19, aguardando três
decisões do dono (papel dedicado × Management API; transação por-migration ×
lote-único; quem guarda o segredo). Até ele existir, o parágrafo acima é o
processo, e este registro é o dono.

**Pendentes na data (6):** `maq_revoga_grant_residual_sem_politica` ·
`funcoes_definer_stable_alinha_producao` · `trial_com_prazo_e_bloqueio_suave` ·
`own_maq_esquema_verbatim` · `service_role_grants_minimos` ·
`central_maquina_de_estados`.

---

# ⚠️ COBERTURA DE MOTOR NÃO É COBERTURA DE PRODUTO (P-19 Bloco D, 18/08/2026)

**O Bloco D nasceu como "refactor de duas portas de importação". A medição
mostrou outra coisa: o BACKEND estava ~80% pronto e a UI, 0% — e ninguém sabia,
porque todo o inventário deste repositório mede CÓDIGO, não o CAMINHO do
usuário.**

O que a medição achou, item a item:

| Item do Bloco D | Estado real |
| --- | --- |
| dedup (conta+data+valor+hash) | pronto — `core/ingestao/chaveIdempotencia` |
| ler `<LEDGERBAL>` do OFX → abertura | pronto — `core/fdip` + `aberturaDoExtrato` |
| classificação camadas 1–2 (regra + histórico) | pronto — `taxonomia` + `regras` + aprendizado |
| correção → regra da organização | pronto — `sugerirRegra` |
| is_sample | pronto |
| **a UI que junta tudo num fluxo usável** | **não existia** |

⚠️ **O diagnóstico "produto sem porta de entrada" era de UX, não de engine.** A
prova está na produção: nos últimos 90 dias, **ZERO lançamentos por extrato/OCR**
(os 833 "sem origem" são legado de jun–jul). O motor de ingestão existe há
meses e não gerou um único lançamento — porque o caminho do usuário até ele é
dois pipelines incompatíveis e uma fila que ninguém desenhou para 500 linhas.

⚠️ **A lição de método, e ela vale para toda auditoria futura deste repositório:**
o `npm run smoke`, o `engine-audit`, o `reconciliacao` — todos medem se o MOTOR
está certo. Nenhum mede se o usuário CONSEGUE chegar até ele. Um sistema pode ter
100% dos motores verdes e 0% de uso, e as guardas ficam todas verdes. A cobertura
de produto é outra coisa: quantos toques até a tarefa terminar, quanto tempo
para 500 linhas, o que acontece quando a pessoa abandona no meio. Isso não sai de
uma guarda pura — sai de dirigir o fluxo (`npm run fluxos`, a ONDA 12) e de
cronometrar. O Bloco D só fecha quando a fila 1-a-1 for medida a 500 linhas em
menos de 10 minutos, não quando o motor passar no teste.

**O que a Fatia 2 fez (mecânica, sem UX):** unificou os dois formatos —
`.xlsx` entra pelo mesmo pipeline do extrato, o `/dashboard/financial/import`
depreciou com redirect permanente (A4P-040 fechado). **A fila 1-a-1 (a UX que
importa) fica para uma leva própria, com briefing de UX antes** — construída às
cegas no fim de uma sessão longa, passaria no teste e continuaria ruim de usar.

---

## ⚠️ A4P-077 — P0: o webhook da OWN autentica por SEGREDO ESTÁTICO, sem HMAC nem janela de replay

**Medido no fonte** (`supabase/functions/own-webhook/index.ts`, 19/08/2026),
não deduzido. A função `autenticado(req)` aceita **duas** formas, as duas
estáticas:

- **Basic Auth** — `OWN_WEBHOOK_BASIC` = `"usuario:senha"`, comparado com
  `atob(header.slice(6)) === basic`;
- **segredo na URL** — `?secret=<OWN_WEBHOOK_SECRET>`.

Não há **assinatura do corpo** (HMAC), não há **timestamp**, não há **janela de
replay**. A varredura por `hmac|signature|assinat|x-hub|timestamp|replay|nonce`
no arquivo devolve **zero** ocorrências fora do comentário de cabeçalho.

**O que isso significa, em ordem de gravidade:**

1. **Quem tiver o segredo forja QUALQUER evento.** Sem HMAC, o corpo não é
   verificado contra nada: dá para inventar uma transação, uma liquidação ou um
   cadastro e o sistema grava como se a OWN tivesse mandado. É dinheiro
   entrando no ERP do lojista por uma porta que só confere uma senha.
2. **O segredo na URL vaza por caminhos que ninguém audita.** Query string
   aparece em log de acesso, em proxy, em histórico e em `Referer`. O Basic
   Auth (header) é menos ruim; a variante `?secret=` é a pior das duas e as
   duas estão ligadas ao mesmo tempo.
3. **Rotacionar exige a OWN.** O segredo é compartilhado: trocá-lo do nosso
   lado sozinho derruba a entrega.
4. **A comparação não é de tempo constante** (`===` sobre string). É o menor
   dos problemas aqui, mas some junto no conserto.

⚠️ **O que JÁ protege, e é preciso dizer para não exagerar o achado:** o replay
de um payload **idêntico** é barrado por `chaveIdempotencia` (SHA-256 sobre os
campos que identificam o fato) com **índice único** — o insert devolve `23505`
e a função conta como duplicado. Ou seja: **reenviar o mesmo evento não
duplica**. O que não existe é defesa contra um evento **novo e forjado**, que é
o caso que importa.

**Conserto (não feito nesta leva — é decisão do dono):** HMAC-SHA256 do corpo
com segredo dedicado + header de timestamp + janela de ±5 min, comparação por
`crypto.subtle.timingSafeEqual`. **Depende da OWN suportar assinatura**: se
ela não assinar, a mitigação possível é tirar o `?secret=` (ficar só no Basic
sobre TLS), restringir por IP de origem se a OWN publicar a faixa, e rotacionar.

⚠️ **A lição de método, que é a que fica:** este achado só apareceu porque o
fonte foi LIDO. Ele esteve declarado como "NÃO SEI" por uma sessão inteira com
base na suposição de que as Edge Functions viviam fora do repositório — e
`own-sync` e `own-webhook` estavam versionadas o tempo todo. **"Não tenho o
fonte" é uma afirmação que se verifica com `ls`, não se assume.**

---

## Erro #17 — supor a ausência do fonte em vez de conferir

**Do joão, registrado a pedido dele:** ao cobrar a prova do revoke de
`service_role`, a instrução dizia *"você não tem o fonte dessas funções para
conferir"*. As oito Edge Functions — inclusive `own-sync` e `own-webhook` —
estão em `supabase/functions/`, versionadas.

O custo não foi o engano em si: foi que a suposição **quase virou decisão**. A
regra "o que você não conseguir atribuir a um consumidor, MANTENHA e declare
como NÃO SEI" é boa, e teria mandado manter `own_token_cache` na superfície da
service key **para sempre**, por falta de uma leitura de trinta segundos. Com o
fonte na mão a resposta é definitiva: `own-sync` fala com o token **só** por
RPC `SECURITY DEFINER` (`own_token_pegar`/`gravar`/`bloquear`), nunca por
`.from("own_token_cache")` — e o revoke é seguro.

⚠️ **A regra que sai daí:** *"NÃO SEI" é um estado que se declara depois de
procurar, não antes.* Declarado cedo demais, ele congela a dívida com aparência
de prudência — e a prudência de verdade era abrir o arquivo.

---

## ⚠️ A4P-077 (parte 2) — o que dá para endurecer SEM a OWN, e duas guardas que nasceram cegas

Feito em 19/08/2026, enquanto a pergunta sobre assinatura seguia com a OWN:

1. **O `?secret=` saiu.** Query string entra em log de acesso, proxy e `Referer`
   — o segredo vazava para lugares que ninguém audita, e bastava um print de
   URL. `OWN_WEBHOOK_SECRET` deixou de ser lido; quem o usava migra para o Basic
   (mesmo segredo, no cabeçalho).
2. **Comparação em tempo constante.** `===` de string curto-circuita no primeiro
   byte diferente e vaza o prefixo correto por tempo.
3. **Limite de tentativas por origem, cobrado só de quem FALHA.** O tráfego
   legítimo nunca toca o contador. ⚠️ É por *isolate* e isso está DITO no
   código: quem distribuir a força bruta contorna. Não é a defesa final — é o
   que encarece o ataque de uma origem sem custar nada a quem está certo.
4. **O caminho HMAC pronto e DESLIGADO**, com janela de replay de ±5 min. ⚠️ Ele
   desliga por **ausência de segredo**, não por um booleano: um flag separado
   poderia ser ligado sem o segredo existir, e aí toda entrega seria recusada em
   produção.

⚠️ **O corpo passou a ser lido como TEXTO** (`req.text()`), porque o HMAC assina
os BYTES. Reserializar um objeto já parseado muda espaço e ordem de chaves, e a
assinatura falha por um motivo que ninguém encontra olhando o payload.

**O P0 continua de pé:** sem assinatura, quem tem o segredo forja qualquer
evento. Estes quatro reduzem superfície; não substituem o HMAC.

### As duas guardas que nasceram cegas — e o que as denunciou

⚠️ **A primeira nem existia.** O bloco foi inserido por um `str.replace` cuja
âncora estava em OUTRA branch: sem match, o replace devolve o texto intacto e
**não dá erro**. A guarda "passou" nas quatro plantas porque não estava lá. É
exatamente o defeito do `perl` que interpolou `${origem}` — já registrado neste
arquivo — cometido de novo, três seções abaixo de onde ele está descrito.
**Conserto: `assert` na âncora ANTES de editar, sempre.**

⚠️ **A segunda estava lá e não podia falhar.** A asserção "o limite é cobrado
antes de ler o corpo" comparava `indexOf("origemBloqueada(")` no arquivo
inteiro — e o nome aparece antes de tudo, na **definição da função**. Ela media
a definição, não o call site, e passava com a chamada em qualquer lugar. Só
apareceu porque plantar o defeito **não** a fez falhar. Conserto: medir a
posição DENTRO do handler (`Deno.serve(` em diante) e casar a chamada com o
argumento (`origemBloqueada(origem)`).

⚠️ **A lição de método, que vale mais que as duas correções:** *plantar o
defeito é o único jeito de saber se a guarda existe.* Uma passou por ausência,
a outra por tautologia — e as duas ficariam verdes para sempre, dando a
aparência de cobertura sobre um webhook que recebe dinheiro.
## ⚠️ CASO EXEMPLAR — INSTRUÇÃO DO DONO RECUSADA COM RAZÃO (19/08/2026)

**A instrução:** *"O teto é editável por organização. No onboarding, pergunte na
etapa fiscal em vez de assumir — é uma pergunta que o cliente entende."*

**A recusa:** a pergunta **já era feita**, na etapa de Governança do onboarding
("Pode aprovar pagamentos" + "Limite de aprovação", faixas de 10k/50k/500k/sem
limite). Não havia lacuna de UX. O defeito era o **destino da resposta**.

**Medido antes de recusar:**

| onde o número mora | granularidade | quem escreve | quem LÊ para decidir |
| --- | --- | --- | --- |
| `central_alcada.teto_valor` | por PAPEL | a migration | **o gatilho da Central** |
| `organization_members.approval_limit` | por PESSOA | tela de Usuários | **ninguém** (1 de 17 preenchido) |
| `a4p_company.participantes[].limite` | por PESSOA | onboarding | **ninguém** |

`aplicarEstrutura` não toca `organization_members` (varredura vazia), e
`finalizar()` manda `participantes` inteiro para `persistCompany` — perfil, não
regra. Ou seja: **a pessoa respondia e a resposta não chegava a mecanismo
nenhum.**

⚠️ **Cumprir a instrução ao pé da letra criaria a QUARTA morada do mesmo
número** — e a mais nova costuma parecer a certa para quem chega depois.
Passaríamos a perguntar em dois lugares e a continuar decidindo por um terceiro,
que é uma piora do defeito que a instrução queria evitar (assumir em vez de
perguntar).

**O que foi feito no lugar:** uma morada só (`central_alcada`). A pergunta ficou
onde já estava — ao lado do switch que a torna relevante, e com a Blindagem B as
duas viraram irmãs: *quem* aprova (papel, de `role_permissions`) e *quanto*
(teto, de `central_alcada`).

⚠️ **E a recusa achou um defeito que ninguém procurava.** Ao conferir a
conversão, `parseLimite` tirava as LETRAS da faixa antes de converter:
**"R$50 mil" virava 50** (mil vezes menor) e **"Sem limite" virava 0** — a
inversão exata do que a pessoa escolheu. A coluna nunca teve leitor, então nunca
doeu; a conversão viajava pronta para o dia em que alguém a ligasse.

⚠️ **A regra que sai daí, e vale para toda sessão futura:** *quando a instrução
manda ACRESCENTAR uma pergunta, meça primeiro se ela já é feita — e siga a
resposta até o mecanismo que decide.* Pergunta duplicada não é redundância
inofensiva: ela cria uma segunda fonte para o mesmo número, e a segunda fonte é
como as duas moradas mortas nasceram. **Um campo que uma tela escreve e ninguém
lê é uma morada esperando alguém acreditar nela.**

O dono confirmou a recusa e escolheu a opção A (uma morada só, por papel).

---

## ⚠️ A4P-077 — DÍVIDA DECLARADA, com dono e motivo (19/08/2026)

**Dono: joão.** **Estado: aberta, congelada por decisão de fase.**

A adquirência (OWN/Agilli) foi ARQUIVADA nesta fase do produto — "zero tempo em
adquirência daqui pra frente". O P0 do webhook fica registrado aqui, não
resolvido, e **não deve consumir sessão** até o dono reabrir.

**O que continua verdadeiro:** o `own-webhook` autentica por **segredo estático**
(Basic Auth). Não há assinatura do corpo, então **quem tiver o segredo forja
qualquer evento** — transação, liquidação ou cadastro entram como se a OWN os
tivesse mandado. O `chaveIdempotencia` barra o replay de um payload IDÊNTICO
(índice único → 23505), mas não um evento novo e inventado.

**O que já foi feito e está no ar** (reduz superfície, não fecha o buraco):
o `?secret=` saiu da URL · comparação em tempo constante · limite de tentativas
por origem cobrado só de quem falha · e o caminho HMAC **pronto e desligado**
(`OWN_WEBHOOK_HMAC_SECRET`), com janela de replay de ±5 min.

**O que falta, e por que não dá para fazer sozinho:** ligar o HMAC exige que a
OWN ASSINE o corpo. A pergunta foi enviada a eles pelo dono; sem a resposta, o
caminho fica desligado — ligá-lo unilateralmente recusaria toda entrega em
produção.

⚠️ **Se a OWN não suportar assinatura**, a mitigação possível (também dependente
deles) é restringir por faixa de IP de origem. Fica anotado para a hora em que a
fase reabrir; **não é trabalho para agora.**

⚠️ **Por que uma dívida com DONO e não um "aceito":** sem dono e sem motivo
escrito, ela vira paisagem — foi assim que 29 divergências de esquema chegaram
até aqui. O motivo aqui não é técnico, é de PRIORIDADE, e isso é decisão do
dono, não da sessão.

---

## ⚠️ `next lint` PASSA onde o BUILD reprova — e é o build que vale (19/08/2026)

Ao gatear a tela de assinatura por `tem_permissao('cobranca')`, o `return`
antecipado ficou ANTES de `useRouter`, dos três `useQuery`, de dois `useState` e
de um `useEffect`. Isso torna os hooks **condicionais**, e o React exige a mesma
ordem em todo render — é defeito real, não estilo.

⚠️ **`npm run lint` (next lint) passou limpo. `npm run build` reprovou com sete
erros `react-hooks/rules-of-hooks`.** São configurações diferentes de ESLint, e
o build é o que decide se o produto sobe. Rodar só o `lint` e concluir "está
limpo" é o mesmo engano de rodar `typecheck` e concluir que o comportamento está
certo.

**A regra prática:** para mudança em COMPONENTE, `npm run build` faz parte da
conferência — não só `typecheck` e `lint`. Foi o preview da Vercel que reprovou
primeiro, e ele só existe porque o PR sobe antes de mergear.

**E o conserto certo do gate:** todos os hooks primeiro, o `return` condicional
depois. O gate continua valendo — o que muda é o LUGAR.
## ⚠️ RESOLVER CONFLITO CONCATENANDO OS DOIS LADOS QUEBRA SINTAXE — duas vezes (19/08)

Dois blocos ADITIVOS no mesmo ponto do arquivo parecem o caso fácil do merge:
fica-se com os dois. Mas o marcador `=======` cai **no meio da estrutura**, e a
concatenação crua come a linha que fecha um bloco ou abre o outro. Aconteceu
**duas vezes no mesmo dia**, no mesmo arquivo:

1. `scripts/consistencia.mts` — sumiu o `}` que fechava o bloco do `a4p077`;
2. `scripts/engine-audit.mts` — sumiu o `import {` que abria o bloco da fila,
   **e** o `}` que fechava o bloco da conciliação.

⚠️ **O typecheck não pega, o `npm test` pega tarde.** Nos dois casos o erro
apareceu como `Expected '}' got '<eof>'` na execução — a centenas de linhas de
onde o dano estava, porque um bloco não fechado só falha no fim do arquivo.

**O método que funciona, e custa trinta segundos:** depois de resolver
conflito por concatenação, **conte as chaves** antes de rodar qualquer coisa:

```
node -e 'const l=require("fs").readFileSync(ARQ,"utf8").split("\n");let b=0;
l.forEach((x,i)=>{const s=x.replace(/"[^"]*"/g,"").replace(/`[^`]*`/g,"").replace(/\/\/.*$/,"");
for(const c of s){if(c==="{")b++;else if(c==="}")b--;} if(MARCADOR.test(x))console.log(i+1,b);});
console.log("final",b)'
```

O balanço final tem de ser 0, e imprimir o balanço nos cabeçalhos de seção
mostra **em qual** seção ele desandou — foi assim que o segundo caso foi
localizado em uma tentativa, contra três no primeiro.

⚠️ E a lição de fundo é a de sempre: **a concatenação silenciosa é da mesma
família do `replace` sem match.** As duas "funcionam" (não dão erro), as duas
produzem um arquivo plausível, e as duas só se denunciam quando algo executa.

---

## ⚠️ O ETL DO OPEN FINANCE ERA RECUSADO PELO BANCO — em silêncio (19/08/2026)

Achado ao provar a deduplicação **antes** do primeiro disparo do cron, a pedido
do dono. A prova de dedup passou; o caminho até ela é que revelou o defeito.

**Nenhum dos dois ETLs do Pluggy** (`pluggy-sync-item`, `pluggy-webhook`)
mandava `especie` ou `origem` no insert de `movements`. E
`titulo_exige_origem()` (ONDA 5) recusa com **A4P05** todo lançamento sem
procedência — a menos que `especie = 'extrato'`, caso em que a própria trava
carimba `origem` e libera.

**Medido contra o banco real:** os 52 movements do Pluggy têm `origem` **NULA**
porque nasceram em **23/06**, ANTES da trava. Desde então, **nenhum lançamento
novo do Open Finance conseguia entrar**.

⚠️ **E a falha era silenciosa por DOIS motivos somados**, que é o que a fez
sobreviver: (1) o `catch` do ETL trata só `23505` (duplicata) — o A4P05 caía num
`console.error` dentro de uma Edge Function que ninguém abre; e (2) o sync em si
não rodava desde junho, então nem o log existia. Dois silêncios em série: o
primeiro esconderia o defeito, o segundo escondeu que havia o que esconder.

⚠️ **A ordem dos consertos importava, e por pouco.** O cron do Open Finance foi
mergeado ANTES desta descoberta. Se ele tivesse disparado assim, as transações
chegariam a `bank_transactions` e **nenhuma viraria lançamento** — e o placar da
conciliação pioraria, porque o denominador cresce e o numerador não. O pedido do
dono ("prove a dedup antes do primeiro disparo") é o que abriu o caminho até
aqui: a pergunta era sobre duplicação e a resposta foi sobre ausência.

⚠️ **A Edge Function não sobe pelo deploy da Vercel.** O conserto está no
repositório; produção só o recebe quando alguém publicar a função pelo painel do
Supabase. **Enquanto isso não acontecer, o cron roda e não cria lançamento
nenhum** — fica declarado, não presumido.

---

## ⚠️ PARAR POR TAXA DE ERRO SUBINDO É UMA MEDIÇÃO, NÃO UMA DESCULPA

Registro a pedido do dono, 19/08/2026.

Ao fim de dois dias de rodada, **três medições minhas nasceram erradas em poucas
horas**: a fixture do aging datada dentro da janela do DRE; o filtro de estados
vazios que devolveu 56 incluindo modal, chat e cabeçalho; e o verificador que
leu `AppShell` achando que lia a tela. As três foram pegas — duas por guarda,
uma por conferência à mão — mas a **taxa** estava subindo.

⚠️ **O que decidiu a parada não foi o cansaço: foi a NATUREZA do que sobrava.**
Os itens restantes (cronômetro de onboarding, página de metodologia, varredura
de copy, estados vazios) são de TEXTO e de VARREDURA — neles o erro não estoura,
ele é **publicado**. Um número errado num relatório de auditoria e uma frase
errada numa página pública não falham no CI: saem para o cliente com cara de
medida.

**A regra que fica:** quando a taxa de erro sobe E o trabalho restante é do tipo
que publica em vez de estourar, parar é a decisão correta — e nomear a razão faz
parte dela. Quatro blocos que reprovam valem mais que seis de aparência; a
sessão que não sabe parar é a que produz guarda decorativa.

---

## ⚠️ DÍVIDA: a cadência do sync do Open Finance é limite de PLANO, não escolha

**Dono: joão. Aberta.**

O dono decidiu **duas vezes ao dia** (08:00 e 20:00 UTC), com a razão certa: um
ERP financeiro que mostra o extrato de ontem é um ERP que o cliente confere no
banco antes de confiar — e aí ele deixou de ser a fonte e virou a segunda
opinião.

**A Vercel recusou o deploy**, literalmente: *"Hobby accounts are limited to
daily cron jobs. This cron expression (0 8,20 * * *) would run more than once
per day."*

⚠️ **Reverti para diário para não deixar produção sem deploy** — e a guarda
passou a cobrar o que É invariante (o extrato TEM de ser puxado) em vez do que a
plataforma proíbe. Manter a asserção da cadência deixaria o CI vermelho por um
limite de plano, e **guarda que reprova o possível é desligada na primeira
semana**.

⚠️ **Isto NÃO é contornar guarda que achou defeito** — a distinção importa e é
fácil de confundir com a sexta regra. Não há defeito escondido aqui: a asserção
cobrava uma configuração que o ambiente torna inalcançável. A regra continua
valendo integralmente para o caso oposto, que é o dela: quando a guarda expõe
defeito, o defeito é o trabalho.

**Os dois caminhos para pagar, quando o dono decidir:** subir o plano da Vercel
para Pro, ou mover o agendamento para o `pg_cron` do Supabase, que não tem esse
teto — e que tem a vantagem de ficar do lado do banco, junto do dado.

---

## ⚠️ SQL NOVO SE PARSEIA ANTES DE EMPURRAR — e o CI não é o lugar de descobrir

19/08/2026. A primeira versão da migration do `pg_cron` derrubou o job
`isolamento` com `ERROR: schema "cron" does not exist (SQLSTATE 3F000)`.

**A causa é de ambiente, não de sintaxe:** `pg_cron`, `pg_net` e `vault` são
extensões do Supabase hospedado; o Postgres de contêiner que a guarda de
isolamento sobe não as tem. O SQL estava certo — e inaplicável ali.

⚠️ **O erro de método foi meu:** escrevi uma migration que fala com extensões de
plataforma e a empurrei sem executá-la em lugar nenhum. Havia um Postgres real
disponível o tempo todo, e bastava `begin … rollback` para saber.

**O conserto tem duas metades, e a segunda é a que importa:**

1. O agendamento vai por `execute` dentro de um `do` guardado por
   `to_regnamespace('cron')` — o plpgsql resolve SQL de dentro de `execute` só
   na hora de rodar, então o ramo não tomado nunca tenta resolver `cron.`.
2. ⚠️ **O pulo AVISA** (`raise notice`). Um `return` mudo faria a migration
   "passar" em produção caso a extensão sumisse, e o agendamento desapareceria
   sem ninguém saber — trocaria um CI vermelho por um cron inexistente, que é
   pior. E a guarda do CI continua cobrando os dois horários **no arquivo**: o
   texto do agendamento é verificado mesmo onde ele não pode rodar.

**Validado depois do conserto**, contra o Postgres real em transação desfeita:
os dois jobs entram com `0 9 * * *` e `0 21 * * *`, ativos, com o segredo no
cabeçalho `Authorization` e **não** na query string.

**A regra:** migration que usa extensão de plataforma (`cron`, `net`, `vault`,
`http`) é executada contra um banco de verdade em `begin … rollback` ANTES do
push — e é escrita para pular COM AVISO onde a extensão não existe.

---

## ⚠️ A4P-078 — QUATRO ROTAS DE CRON ABERTAS, pela ausência de uma variável

**Achado do dono, 19/08/2026**, ao criar o `CRON_SECRET`: a busca por "cron" nas
Environment Variables do projeto `all4pay-saas` devolveu **No Results Found** —
a variável **nunca existiu**.

**Por que isso abre a porta:** as rotas traziam, cada uma, a sua cópia de

```ts
const secret = process.env.CRON_SECRET;
if (secret) { …exige Authorization: Bearer… }
```

Ou seja: **sem a variável, sem exigência.** Uma rota que só pede credencial
QUANDO a configuração existe é uma porta que se abre sozinha por esquecimento —
e o esquecimento é o estado natural de uma variável que ninguém criou.

⚠️ **Não era uma rota: eram QUATRO**, e a mais antiga está aberta desde junho.

| rota | aberta desde | o que responde sem credencial |
| --- | --- | --- |
| `/api/financial-os/run` | **09/06/2026** | roda as regras e dispara alertas |
| `/api/notificacoes/teste` | **10/06/2026** | **envia WhatsApp** (queima quota) |
| `/api/recorrencias/run` | **01/07/2026** | **cria títulos** no banco |
| `/api/openfinance/sync` | 19/08/2026 | sincroniza extrato |

⚠️ **QUATRO CÓPIAS DA MESMA REGRA É A RAZÃO DE O DEFEITO SER QUÁDRUPLO.**
Consertar as quatro à mão deixaria a quinta rota nascer errada, porque quem a
escreve copia a vizinha. A regra passou a viver em `src/lib/cron-auth.ts`, uma
só, e há varredura de **teto ZERO**: nenhuma rota lê `CRON_SECRET` por conta
própria.

**O conserto — falhar FECHADO:** sem a variável, a rota devolve **503**, nunca
200. E 503 (não 401) porque o problema é de CONFIGURAÇÃO do servidor, não da
credencial de quem chamou — "não autorizado" mandaria o operador procurar o erro
no lugar errado.

**Provado quebrando** (`npm run cron-auth`, dentro do `npm test`): os quatro
casos travados por valor — sem variável **503** · sem bearer **401** · bearer
errado **401** · bearer certo **200**. Com o defeito antigo restaurado, o
primeiro devolve **200** e a prova reprova.

**O dono criou a variável e redeployou.** As rotas antigas ficam com a janela de
exposição registrada acima; não há trilha que permita saber se alguém as chamou.

⚠️ **A regra geral, que vale para toda configuração de segurança:** *ausência de
configuração nunca pode virar permissão.* O padrão certo é o inverso do que
estava: sem a variável, recusa tudo — e o erro aparece no primeiro deploy, que é
quando custa barato.

---

## ⚠️ A4P-081 — PR COM CONFLITO NÃO GERA EXECUÇÃO DE CI, e o silêncio é o defeito

**Diagnosticado em 21/08/2026, e ele derruba a hipótese que eu mesmo sustentei
por duas rodadas.**

O GitHub executa `pull_request` contra o **merge ref** (`refs/pull/N/merge`) — a
fusão hipotética do galho com a base. Quando o PR tem conflito esse ref **não
existe**, e o GitHub **não cria execução nenhuma**. Não há falha, não há
"pendente", não há aviso no PR: há a AUSÊNCIA da verificação, indistinguível de
"o CI ainda não começou".

| PR | estado | execuções |
| --- | --- | --- |
| #133 | conflitou às ~13:58, quando o #132 foi mergeado ESMAGADO | pushes das 14:06 às 21:37 → **nenhuma** |
| #133 | 22:06 — trouxe o `main` para dentro e resolvi os conflitos | **execução criada no mesmo segundo, e passou** |
| #131 | `mergeable_state: "dirty"` desde que nasceu | **nunca executou** |

⚠️ **A causa do conflito é o merge ESMAGADO.** Um `squash merge` reescreve a
história: os commits do galho deixam de existir na base com aquela identidade, e
todo galho irmão que os continha passa a conflitar. Nada disso aparece para quem
só observa "o CI não rodou".

⚠️ **O meu erro de método é a parte que fica.** Observei que o #131 tocava
`.github/workflows/ci.yml`, vi que PRs abertos pelo app não rodavam, e conclui
*"falta a permissão `workflows` ao app"* — plausível, coerente com o que eu via,
e **errada**. Cheguei a recomendar ao dono que mudasse uma permissão no painel.

O dado que refutava estava a uma chamada de distância o tempo todo: o campo
`mergeable_state` do próprio PR. Duas rodadas defendendo uma hipótese sem
consultar o campo que a decidia — a mesma família de "meça com o dado que a
superfície usa", agora aplicada à infraestrutura em vez de a uma tela.

**A regra prática:** quando um PR não tiver CI, antes de qualquer teoria sobre
permissão, cota ou incidente, **leia `mergeable_state`**. `dirty` explica o
silêncio inteiro, e o conserto é trazer a base para dentro do galho.

⚠️ **E isto corrige o meu próprio relatório do merge do #133:** ele NÃO foi um
merge sem CI. A execução do commit `f712422` foi criada às 22:06:38 e PASSOU —
no mesmo instante do merge, e por isso não apareceu quando consultei as
verificações. "O CI nunca executou" era verdade até 21:37 e deixou de ser às
22:06.

---

## ⚠️ A4P-078 (parte 2) — EXPOSTO × EXPLORADO: o que dá para provar, e o que é JANELA CEGA

**A pergunta do dono, e ela é a certa:** *"exposto é diferente de explorado, e só
o log separa os dois. Preciso poder dizer a um cliente 'exposto por 71 dias, zero
chamada externa registrada' — ou saber que não posso."*

**A resposta curta: NÃO PODE DIZER ISSO.** O que dá para dizer é mais estreito e
é verdadeiro — está no fim desta seção. O caminho até lá vale mais que a frase.

### O que eu NÃO consigo fazer, e por quê

⚠️ **Não tenho acesso aos logs da Vercel nesta sessão.** Não há credencial da
Vercel no ambiente; a metade "log de plataforma" da pergunta não é respondida por
mim, e escrever qualquer coisa sobre ela seria inventar. Fica declarado assim, e
não como "não encontrei nada".

E há um limite que nem o acesso resolveria: **no plano Hobby a retenção de
Runtime Logs é de cerca de UMA HORA.** Junho não existe mais em lugar nenhum da
Vercel — não é uma busca que eu deixei de fazer, é um dado que já foi
descartado. Só um Log Drain (Pro+) ligado ANTES teria guardado, e não havia.

**Fica registrado como janela cega nº 1: 09/06 → 19/08, plataforma. Irrecuperável.**

### O que o BANCO sabe — e ele sabe a parte que decide

⚠️ **A pergunta que importa não é "alguém chamou?", é "alguma coisa ACONTECEU?"**
— e essa o dado responde sozinho, sem depender de log nenhum, porque um título
criado fica no banco para sempre.

**`/api/recorrencias/run` (aberta 01/07 → 19/08, 49 dias) — ZERO títulos criados.**

| medida | valor |
| --- | --- |
| movimentos com `reference_code like 'rec:%'` (só o materializador cria) | **9** |
| criados em | **16/06 a 19/06** — antes de a rota existir |
| criados desde 01/07 | **0** |
| `origem` desses 9 | **NULL** nos 9 — a rota grava `origem: 'contrato'` |
| eventos `materializar_recorrencias` na trilha | **0**, em toda a base |
| recorrências ativas hoje | **8** |

Os 9 são assinatura de `ativarRecorrencia` (a tela), não do cron: são anteriores
à rota e não têm a procedência que a rota grava. E a rota escreve **um evento de
trilha por organização em toda execução** que encontre recorrência — com 8
ativas, uma execução bem-sucedida teria deixado rastro. Não deixou nenhum.

⚠️ **Isto não prova "ninguém chamou".** Prova algo melhor para o cliente: **nada
foi criado.** Uma chamada que tenha caído no 503 por falta de
`SUPABASE_SERVICE_ROLE_KEY` é indistinguível de nenhuma chamada — e as duas dão
o mesmo resultado no que se pergunta a um fornecedor de software.

### ⚠️ JANELA CEGA Nº 2 — a auditoria do `financial-os` é um NO-OP

Eu ia escrever que as 80 linhas de `rule_executions` provavam que o cron nunca
disparou, porque nenhuma cai no minuto do agendamento (`0 12 * * *`; as mais
próximas são 12:49 e 12:51). **Fui medir a superfície antes de concluir, e a
conclusão caiu.**

`logExecucoes` grava com o **cliente do NAVEGADOR** (`createClient`, chave anon)
numa tabela cujo `org_id` tem `default auth_org_id()` e cuja política exige
`org_id = auth_org_id()`. Chamada de dentro de uma rota de servidor não há
sessão: `auth_org_id()` volta nulo, o insert viola o `not null`, e o erro é
engolido (`try/catch` na rota, `.catch(() => {})` na tela).

**Ou seja: `rule_executions` NÃO CONSEGUE registrar execução da rota.** As 80
linhas (10/06 a 03/08, 18 dias, todas em horário humano) vêm da tela
`/automacoes` aberta no navegador. Como evidência sobre a rota, a tabela é
**cega** — ausência ali não é ausência de chamada.

⚠️ **E isso é um defeito por si só, não só um limite de medição:** a única
auditoria que a rota de cron tem nunca escreveu uma linha. Entra na fila com
nome — o registro do cron precisa do cliente admin com `org_id` explícito, como
`/api/recorrencias/run` já faz.

### ⚠️ JANELA CEGA Nº 3 — envio de WhatsApp não deixa rastro NENHUM no banco

`notifications.server.ts` não tem uma escrita sequer: nem tabela, nem trilha. A
`maq_whatsapp_log` está **zerada** e é de outro subsistema (o fluxo de leads da
maquininha), não do `/api/notificacoes/teste`.

**Então o banco não pode responder se alguém disparou mensagem.** Quem pode é o
**Twilio**: o console guarda o log de mensagens (retenção da ordem de meses, bem
além de junho) com data, destino e custo. É lá, e só lá, que a pergunta *"saiu
WhatsApp que eu não pedi?"* se responde — filtrando por período e comparando os
destinos com o `ALERTS_WHATSAPP_TO`. Fica como verificação do dono, porque a
credencial é dele.

⚠️ Vale notar o que reduz o dano: mesmo aberta, a rota só enviava para o destino
travado em `ALERTS_WHATSAPP_TO` (o anti-relay). Um terceiro conseguia **queimar
quota e encher o telefone do dono**, não usar o sistema como relay para números
próprios.

### ⚠️ JANELA CEGA Nº 4 — `origem`/`ip` na trilha cobrem 18 HORAS, não o período

| medida | valor |
| --- | --- |
| `audit_log` total | 1.281 |
| com `ip` preenchido | **132** |
| janela coberta | **11/08 20:24 → 12/08 14:26 UTC** (≈18 h) |
| IPs distintos | **1** — `201.6.226.70` (uso humano) |
| eventos com `usuario like 'cron:%'` | **0** |

A instrumentação de procedência entrou em agosto e não retroage. Dentro das 18
horas em que ela existe, tudo veio de um IP só e é uso do dono.

### A frase que DÁ para dizer a um cliente

Não esta: *"exposto por 71 dias, zero chamada externa registrada"* — ela afirma
sobre um registro que não existe.

Esta:

> **"Quatro rotas de automação ficaram acessíveis sem credencial entre 09/06 e
> 19/08 (a mais antiga, 71 dias). Nenhum lançamento foi criado por elas no
> período — verificado no próprio dado, não em log: os únicos títulos de
> recorrência da base são de junho, anteriores à rota, e a trilha não tem uma
> execução do materializador. O log de plataforma que diria se houve chamada não
> existe mais (retenção de ~1 h no plano), e o envio de mensagem não era
> registrado em banco; essas duas verificações ficam declaradas como não
> cobertas. A falha foi corrigida em 19/08: sem credencial configurada a rota
> recusa (503), com guarda que reprova o comportamento antigo."**

⚠️ **A diferença entre as duas frases é a diferença entre auditoria e marketing.**
A primeira soa melhor e cai no primeiro pedido de evidência; a segunda entrega o
que tem, nomeia o que falta, e é a única que sobrevive a alguém conferir.

### A lição de instrumentação, que é a mesma três vezes

Nas três janelas cegas o padrão é idêntico: **existia um lugar com cara de
registro, e ele não registrava.** `rule_executions` grava com o cliente errado;
`notifications.server` não grava; `origem`/`ip` chegaram tarde. Nenhuma das três
apareceu como problema até alguém precisar responder uma pergunta com elas.

É a regra de "instrumentação sem consumidor não conta como feita" pelo avesso:
**registro que nunca foi LIDO não conta como registro** — ninguém descobre que
ele está vazio enquanto ninguém o abre, e quem o abre é sempre a auditoria, que
é a hora mais cara para descobrir.

---

## ⚠️ CLASSE: TEXTO COM CAMPO PARA PREENCHER SEGUE ADIANTE PARECENDO COMPLETO

Duas ocorrências no mesmo dia, uma de cada lado da mesa — e é por isso que vale
como classe, não como descuido:

1. **O meu placeholder.** O lote trazia
   `COLE_AQUI_O_MESMO_VALOR_DO_CRON_SECRET_DA_VERCEL` para o dono substituir.
   Foi colado **duas vezes** sem a troca. Tinha trava (`A4P19`), então o
   resultado foi um erro e nada gravado.
2. **O template do dono.** A mensagem que pedia o relatório veio com
   `Resultado: [cole a mensagem]` e `O CRON_SECRET [ja existia / eu criei
   agora]` por preencher. Não tinha trava — e, sem medir o banco, eu teria
   escrito um relatório inteiro sobre um estado que não existia.

⚠️ **O que separa as duas é só a trava.** Um texto que depende de alguém lembrar
de substituir vai seguir adiante com a lacuna, cedo ou tarde, e ele parece
completo enquanto segue — que é o que o torna caro.

**As duas saídas, nesta ordem de preferência:**
1. **Eliminar o campo.** Foi o que o redesenho do vault fez: o segredo deixou de
   existir no arquivo e virou pré-requisito criado no painel. Sem campo, sem
   lacuna — e de quebra o segredo parou de trafegar por um arquivo de texto.
2. **Se o campo tem de existir, ele TRAVA** — falha alto e reverte tudo, nunca
   segue com o valor de exemplo.

E a regra de leitura que fica para mim: **campo não preenchido é ausência de
informação, não confirmação.** Diante de um, medir — nunca completar com o que
parecia provável.
