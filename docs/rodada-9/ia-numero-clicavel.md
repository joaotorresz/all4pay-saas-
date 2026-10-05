# Rodada 9 — IA com número clicável (02/10/2026)

Pendência declarada desde a ONDA 14: *"o link clicável de cada número para a
tela de origem"* e *"a separação visual entre o que a IA sugere e o que ela
executa"*.

## 1. O número leva à origem — dita por quem calcula

**Medido antes:** a Rodada 5 deduzia a origem pelo RÓTULO do número, num mapa
de rótulos fixos. Sobre o corpus de 247 perguntas, só **123 de 636** números
ganhavam link (19%). Rótulos que mudam a cada empresa ("Marketing", "Loja
Alpha", "Em julho") nunca casavam. E o mapa errava calado: o "Custo fixo" da
calculadora de ponto de equilíbrio levava à tela de Contas recorrentes, que
mostra OUTRO número.

**Agora** o motor diz a origem no momento em que calcula
(`src/core/assistant/numero.ts`). Cada número cai num de quatro casos:

| Caso | Construtor | Na bolha |
| --- | --- | --- |
| soma de lançamentos | `deLancamentos` (`L`) | botão que abre a GAVETA com as linhas; o total da gaveta É o número |
| calculado sobre lançamentos (média, razão, contagem) | `sobreLancamentos` (`B`) | gaveta com a BASE de cálculo, e o total dela, não o do número |
| número de tela (linha "=" do DRE, índice) | `naTela` (`T`) | link para a tela |
| calculadora / simulação | `simulado` (`S` na resposta inteira) | marcado "simulação", sem link |

**Medido depois:** 636 de 636 números com destino (508 com origem, 128
simulações). Nos dois conjuntos de dados da guarda, **314 e 342 somas** com a
gaveta fechando com o número, centavo a centavo.

- A gaveta é a MESMA do drill-down do DRE (`GavetaTransacoes`), com um pé
  "Abrir {tela}". Uma segunda gaveta divergiria da primeira no primeiro ajuste.
- ⚠️ **O número que vem do Claude perde qualquer origem que o modelo
  escrevesse** (`numerosDeFora`): um link escrito pelo modelo seria uma rota
  que ninguém conferiu. Esses números passam só pelo mapa de rótulos fixos.
- ⚠️ **O histórico guardado não leva a lista de lançamentos.** Ela pode ter
  centenas de ids por número, e reabrir a conversa amanhã mostraria os
  lançamentos de hoje sob um número de ontem. Guardado, o número leva à tela.

## 2. A IA sugere; quem executa é a pessoa, numa seção que diz isso

**Três defeitos, achados ao dirigir a aba Sugestões:**

1. **O card que separava sugerir de executar estava ÓRFÃO.** `AcoesCopiloto`
   (que diz, antes do clique, o que o clique faz, e manda o que passa da
   alçada para aprovação) morava no `/copiloto`, e a fusão na Quattro AI não o
   levou junto. A aba Sugestões dizia *"quem age é uma pessoa, no card de
   sugestões do copiloto"*, um card que não aparecia em tela nenhuma.
2. **Um disparo cru no lugar dele.** O card de cobrança tinha um botão próprio
   "Disparar no WhatsApp", sem confirmação, que lia o resultado errado: em
   demonstração mostrava `falha: undefined` (a resposta simulada não trazia o
   nome do cliente) e em produção pintava o envio SIMULADO de vermelho como
   falha. Eram duas portas para o mesmo ato.
3. **O id da sugestão mudava a cada redesenho.** Ele saía de um contador
   global (`uid("dec")`), e o motor roda a cada renderização. A confirmação
   sumia no instante em que abria, e o selo "Em aprovação" sumia no redesenho
   seguinte, **devolvendo o botão: a mesma sugestão podia ir duas vezes para a
   alçada.** O id agora é derivado do conteúdo (política, tipo e título).

**O que ficou:**

- A aba Sugestões monta `AcoesCopiloto` como a seção **Executar**, a única da
  tela em que um clique faz algo fora dela. O resto só lê.
- A cobrança, a única linha que sai do sistema, pede **confirmação com os
  nomes** de quem recebe (`alvosDeCobranca`, a mesma conta de
  `dispararCobranca`).
- O selo sai do STATUS que a execução devolveu, nunca de procurar palavras na
  mensagem. Na cobrança, tudo o que não é "executada" é **Não enviada**:
  simulação, recusa e falha.
- No chat, o rótulo "Ação:" virou **Sugestão**, com a frase *"A IA não executa
  nada"*. O chat não tem caminho de escrita, e a guarda cobra isso.
- A resposta de demonstração da rota de cobrança tem o mesmo formato da de
  produção, e o envio relata os telefones recusados.

## Guardas

- **`npm run ia-origem`** (`scripts/ia-origem.mts`, dentro de `npm test`).
  Roda o corpus inteiro em dois conjuntos de dados (o do corpus e um com
  vencidos, transferência, cancelado e lançamento de hoje) e cobra:
  - teto zero de número sem destino;
  - a gaveta fechando com o número;
  - tela no inventário e não alias;
  - calculadora sempre simulação;
  - número do Claude sem a origem que o modelo escrevesse;
  - histórico sem a lista de lançamentos;
  - o chat sem escrita;
  - a seção Executar, com a confirmação e o selo pelo status;
  - o id da sugestão estável.
  
  O conjunto de perguntas virou `scripts/fixtures/corpus-ia.mts`,
  compartilhado com o `corpus`.
- **Teste negativo dentro do arquivo:** quatro números plantados à mão (sem
  origem, lista errada, contagem errada, id inexistente) têm de reprovar
  NOMEANDO o defeito.
- **Provada plantando os defeitos no código:**
  - a lista errada no "a receber";
  - uma calculadora sem a marca de simulação;
  - o disparo cru de volta na aba;
  - o histórico gravando a lista;
  - o id da sugestão aleatório.
  
  Cada um reprova pela asserção certa.
- **Jornada `scripts/e2e/ia-origem.mjs`:**
  - EBITDA leva ao DRE, e runway ao Fluxo de caixa;
  - "quanto gastei esse mês?" abre a gaveta, e a soma das linhas é o número
    (R$ 38.395,49 nas 3 linhas da demonstração), com o pé levando ao Extrato;
  - a calculadora aparece marcada como simulação;
  - a aba Sugestões não tem mais o disparo cru;
  - a cobrança pede confirmação;
  - a sugestão enviada à alçada continua marcada e o botão não volta.

## Pendência declarada

- **O `CopilotoView` inteiro segue órfão** (`components/copiloto/`:
  `CopilotoView`, `CopilotoChat`, `InteligenciaShell`). Ele tinha briefing,
  leituras priorizadas, anomalias, previsão, simulador e memória, e nenhuma
  rota o monta desde a aposentadoria do `/copiloto`. Pela regra "fundir não é
  apagar", cada bloco precisa ser conferido contra o que a Quattro AI já
  mostra antes de apagar ou portar. Fica para uma rodada própria.
  - **Resolvida em 05/10/2026** — ver `copiloto-orfao.md`: leituras e
    anomalias portadas para a aba Sugestões, o resto com equivalente vivo, os
    três arquivos apagados.
