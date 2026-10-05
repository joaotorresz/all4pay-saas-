# O `/copiloto` órfão — conferido bloco a bloco (05/10/2026)

Pendência declarada na Rodada 9 (`ia-numero-clicavel.md`): `CopilotoView`,
`CopilotoChat` e `InteligenciaShell` ficaram sem rota quando o `/copiloto` foi
aposentado e redirecionado para `/quattro-ai`. Pela regra "fundir não é apagar",
cada bloco foi conferido contra a Quattro AI (`components/ia/AssistenteShell.tsx`
e abas) e a Home (`components/visao-geral/`) antes de qualquer arquivo sair.

## O veredito, bloco a bloco

| Bloco do `CopilotoView` | Equivalente vivo | Decisão |
| --- | --- | --- |
| `BriefingCard` (saldo, runway, alertas, oportunidades, risco de ruptura) | Decisão → "brief executivo" (`DecisaoView`); Risco → score e probabilidade de ruptura (`RiscoView`); Home → `oportunidades-briefing` e `acoes-briefing` (`cockpit.tsx`, catálogo). Os alertas e oportunidades do briefing são DERIVADOS das leituras, que vieram junto. | Não portado |
| `InsightsCard` (leituras priorizadas) | **Nenhum inteiro.** A Home só tem a primeira (`radar-insight-critico`) e a soma do impacto (`impacto-insights-exec`), as duas no catálogo desligado por padrão. | **Portado** → aba Sugestões (`autonomo/LeiturasPriorizadas.tsx`) |
| `AnomaliasCard` | Parcial: a política `anomalia_despesa` põe as TRÊS maiores nas Sugestões, sempre com "renegociar"; Home → `radar_anomalias` e `maior-anomalia-exec` (catálogo). | **Portado** → aba Sugestões (`autonomo/AnomaliasParaRevisar.tsx`) |
| `ForecastCard` (`motorPreditivo`) | Decisão → Monte Carlo (prob. de caixa negativo, p10/p50/p90); Risco → liquidez projetada 60 dias; Home → `radar-forecast-30d`. | Não portado — seria a quarta projeção, por outra fórmula, na mesma Quattro AI |
| `SimuladorCard` | Fluxo de caixa → What-If (`WhatIfView` em `FluxoCaixaView.tsx`): o MESMO `simularCenario`, com folha a mais. | Não portado |
| `PlannerCard` | Quant → "Score preditivo · cenários" (`QuantView`); Fluxo de caixa → `CenariosView` (seis cenários, mesmo `simularCenario`); Decisão → recomendações com impacto. | Não portado |
| `MemoriaCard` | Home → `padroes-ia` (catálogo). Cada padrão tem casa mais rica: recorrentes em `/contas-a-pagar/recorrentes`, concentração no Risco, sazonalidade no Quant. | Não portado |
| `CopilotoChat` | A conversa da Quattro AI (`IAView` + `useChatIA`). | Apagado — terceiro chat da IA, com o rótulo "Ação sugerida" e caminho de escrita no razão, que a Rodada 9 tirou do chat |
| `InteligenciaShell` | `AssistenteShell` (as mesmas abas). | Apagado |

### Por que as leituras e as anomalias, e não o resto

**Medido, não suposto.** Os dois motores rodados sobre o seed da demonstração e
as duas fixtures canônicas (`scripts/fixture.mts`): as leituras do executivo e as
"Sugestões por prioridade" do autônomo **não tiveram um item em comum**. A
sugestão diz o que FAZER (cobrar, antecipar recebíveis, bloquear pagamento); a
leitura diz o que está ACONTECENDO — concentração de receita, margem
comprimida, crescimento, pressão de caixa prevista — e nada disso estava em tela
depois da aposentadoria. Por isso as duas listas convivem na aba Sugestões sem se
repetir.

**A anomalia que some.** O detector devolve até oito anomalias; a política e as
leituras pegam as três de maior valor. Um pagamento duplicado pequeno fica abaixo
de um gasto de categoria alto e sai das duas — o dinheiro sai pela conta duas
vezes e nenhuma tela diz. O cartão portado mostra todas e diz ONDE conferir cada
classe (DRE para despesa, Títulos a pagar para duplicidade e pagamento atípico);
a política manda "renegociar" até uma duplicidade.

O que não foi portado tem a mesma pergunta respondida em outra tela viva —
portar seria dar à Quattro AI uma segunda resposta para ela.

## O defeito achado no caminho: id de contador no motor executivo

Leituras e anomalias eram numeradas por `uid()`, um contador de módulo, e o
motor roda de novo a cada renderização. Medido: duas execuções sobre a mesma
entrada deram `anom_0` e `anom_7`. Isso tornava inertes, sem erro nenhum, dois
controles do `/copiloto`:

- o **"Marcar revisada"** gravava o selo sob um id que já não existia no
  redesenho seguinte — o selo nunca apareceu;
- a **narração por IA** (`/api/ai/narrar`) casava o texto pelo id — nunca casou.

O conserto é a regra que a Rodada 9 já aplicou em `core/autonomous`: o id sai do
CONTEÚDO (`chaveDeTexto` em `core/executive/types`), com contraparte e valor na
anomalia (duas duplicidades de mesmo título não colidem) e `semIdRepetido` como
última defesa. A leitura nascida de uma anomalia carrega o id dela. O contador
saiu do arquivo.

`useCentroInteligencia` passou a memorizar o resultado pelo dado: a aba Sugestões
tem agora dois cartões que o consomem.

## O que NÃO veio, de propósito

- **"Marcar revisada"**: nunca funcionou (acima), e funcionando seria um aviso
  dispensado que volta ao recarregar. A anomalia sai quando a CAUSA sai — a
  mesma regra do banner de amostra. Uma revisão de verdade precisaria de morada
  no banco e de quem revisou.
- **A narração por IA** por cima do texto do motor, e a rota `/api/ai/narrar`,
  que só o `CopilotoView` chamava. O texto que fica é o do motor, que é o que tem
  procedência.

## Guardas (`npm run ia-origem`)

- **8b** — leitura e anomalia com id ESTÁVEL: a fixture exercita duas classes e
  duas duplicidades de mesmo valor e título; duas execuções dão os mesmos ids;
  ids únicos. Provada plantando o contador de volta e a chave sem contraparte.
- **9** — os órfãos continuam apagados; teto ZERO de importação deles (e da
  narração) em `src/`; a aba Sugestões monta os dois cartões; as linhas usam o id
  do motor como chave; o "Marcar revisada" não voltou; os destinos de "onde
  conferir" são rotas canônicas do inventário, nunca alias. Provada plantando
  cinco defeitos, um por asserção.
- `engine-audit` (`pagar-r3`): o `CopilotoView` saiu da lista de telas que
  exibem runway de cenário; o What-If e os Cenários do `FluxoCaixaView`, que são
  o equivalente vivo, continuam cobrados.

## Pendências declaradas

- **`/api/ledger/assistant` ficou sem consumidor.** Era a metade de servidor do
  rascunho de lançamento contábil por IA ("Aprovar e postar" no `CopilotoChat`).
  A Rodada 9 tirou do chat o caminho de escrita; a casa natural da função é o
  lançamento manual do Razão, não a Quattro AI. Decisão do dono: portar para o
  Razão ou aposentar a rota.
- **`ResumoHojeCard`** (`visao-geral/cockpit.tsx`, "Hoje · briefing executivo")
  está exportado e nenhuma tela o monta — outro órfão, achado nesta conferência
  e fora do escopo dela.
