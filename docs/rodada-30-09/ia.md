## ⚠️ QUATTRO AI E CENTRAL DE AJUDA — a IA responde o número da TELA (30/09/2026)

**A pergunta desta área não é "a IA calcula certo?", é "a pessoa, com a IA de
um lado e a tela do outro, lê o MESMO número?".** Dirigida como um dono de
empresa (saldo, receita, despesa, resultado, a receber/a pagar, o que vence na
semana, maior cliente, gastos, margem, runway, "posso gastar 20 mil?") e cada
resposta conferida contra a tela que responde a mesma pergunta, ela divergia
em nove lugares. Nenhuma divergência era erro de aritmética: era a IA com uma
regra PRÓPRIA onde a tela já tinha uma canônica.

| Pergunta | A IA dizia | A tela dizia | Causa |
| --- | --- | --- | --- |
| saldo / runway / burn / saúde | "cobre cerca de **0 meses**" | "— não há queima" | o quant copiava o `.valor` (0) de um runway **ausente** |
| margem do mês | **39%** (caixa) | **56,4%** (DRE) | margem de caixa com o nome de margem |
| lucro do mês | R$ 278.810 (caixa) | R$ 391.829 (DRE) | "lucro" caía no bloco de resultado de caixa |
| origem do EBITDA | "**0 lançamentos**" | — | a linha "=" do DRE não tem movimento próprio |
| posso gastar 20 mil? | reserva de **R$ 1.011.982** | reserva de R$ 245.836 | burn zero ⇒ a IA INVENTAVA um burn de 15% do saldo |
| o que vence esta semana | domingo a sábado | segunda a domingo | duas definições de semana (perdia o vencimento de domingo) |
| clientes pagam em dia? | "0 dia(s) **no do** vencimento" | — | frase montada com média zero |
| chance de ruptura | "em **90** dias" | 60 dias (risk-engine) | rótulo do motor errado |
| onde economizar | "Fornecedor **subiu R$ 179 mil**" | — | sem mês anterior, a categoria inteira lida como aumento |

⚠️ **A AUSÊNCIA atravessa o derivado — agora também no quant.** `IndicadoresFinanceiros.runwayMeses`
virou `number | null` com `runwayMotivo` (o código canônico). O quant lia
`runwayMesesCanonico(input).valor` sem perguntar `indisponivel`, e o zero de
"não sei" virou "runway curto" em cinco lugares: a tela Quant ("Runway 0m"), a
Decisão ("Risco de liquidez 100%"), o pilar de runway do score (Financial Score
75 → 90 depois do conserto), o Investor Update e o planejador de contratações
("Runway 0 → 33,3 meses": contratar parecia AUMENTAR o fôlego). A regra de ouro
da ONDA 4 vale para todo consumidor: `sem_queima` pontua como folga máxima,
`caixa_negativo` como risco máximo, `sem_base` como neutro — e **nenhum deles
vira número**. `rotuloRunway`/`fraseRunway`/`saudeDoRunway` (`core/quant/score`)
e `FORMA_CURTA` (`core/indicadores`) são a única forma de dizer isso.

⚠️ **A IA não tem regra própria para número que já tem tela.** Margem e lucro
leem `cascataDRE` (competência, a mesma do relatório); runway e burn leem o
canônico de 90 dias (o do Fluxo de caixa); "posso gastar?" passa pelo
`simularAquisicao` sobre `situacaoDe` (reserva = `RESERVA_IDEAL` × despesa
média, a da tela "Posso comprar?"); a semana é `periodoSemana` (a dos painéis);
a faixa de saúde é `classificar` (a da tela Quant). Quando a IA fala de caixa ao
lado de competência, ela DIZ qual é qual ("pelo caixa — o que efetivamente
entrou e saiu — sobraram…"), porque os dois estão certos e a pessoa precisa
saber por que não batem.

⚠️ **Frase de origem de linha "=" soma as linhas que a formam** (`origemDaCascata`).
A procedência de EBITDA/resultado vem vazia por construção (sai de fórmula), e
"0 lançamentos" embaixo de R$ 391 mil é a origem mentindo.

### Central de Ajuda

- ⚠️ **O detector de segredos pega o formato que se COLA, não só o que se
  formata.** CPF sem pontuação ("meu cpf é 52998224725"), CPF seguido de um
  valor e cartão com espaços colado junto da validade passavam inteiros. O
  bloco numérico agora tokeniza, agrupa por corrida separada por espaço e testa
  janelas da mais longa para a mais curta (linha digitável → CNPJ → CPF →
  cartão com Luhn e agrupamento de cartão). Os casos negativos (valor, NF, data,
  11 dígitos com DV inválido) continuam limpos — não gritar lobo segue sendo a
  regra que decide se o detector presta.
- ⚠️ **Chamado e conversa de ajuda passam pelo `store-org`.** Estavam em
  `CHAVES_ORG` e eram gravados direto no `localStorage`: em produção a
  `SincronizacaoOrg` subia a chave UMA vez e depois hidratava do servidor a cada
  tela — o chamado aberto depois da primeira sessão nunca subia e era apagado na
  navegação seguinte. A conversa virou mapa `usuário → mensagens` (como o
  histórico da IA), para o "Nova conversa" de um colega não apagar a sua.
- ⚠️ **A tela não promete o que não existe.** Ela dizia que o chamado "chega ao
  suporte" e que "alguém do suporte olha o caso". Não há canal nenhum: o
  chamado fica no estado da empresa. O texto agora diz onde ele fica e que o
  envio ao suporte não está ligado.

### O chat

- **O botão Enviar era lime-less**: `bg-ink` com a seta em `on-lime` — os dois
  tokens valem `#3B4332` e a seta era invisível. Primário = lime + verde-base.
- **"Copiado" só quando copiou**: a escrita na área de transferência não era
  aguardada; permissão negada ou `navigator.clipboard` ausente e o rótulo mentia
  do mesmo jeito. Agora a falha aparece ("Não copiou — selecione o texto").
- **O feedback entra na conversa salva e não conta duas vezes** (era estado de
  tela: sumia ao retomar e somava outro voto ao clicar de novo).
- **A conversa do painel flutuante entra no MESMO histórico da página.** O
  painel é remontado a cada tela; seguir o "Abrir tela ↗" da própria resposta
  apagava a conversa.
- **O rodapé do histórico diz a verdade do ambiente** (em produção a conversa
  acompanha a pessoa entre máquinas; a frase dizia o contrário) e a lista OUVE a
  hidratação (nascia vazia numa máquina nova).
- **`logAcaoIA` não engole a recusa do banco**: o cliente do Supabase devolve
  `error` em vez de lançar, e o `try/catch` sozinho deixava a trilha `ai_actions`
  vazia sem ninguém saber. Continua best-effort, com dono (`reportar`).

### Guardas

- `engine-audit`, bloco **IA E AJUDA**: fixture de uma empresa que GERA caixa e
  tem receita do mês ainda a receber (é o caso que separa margem de caixa, 50%,
  de margem do DRE, 64%), com vencimentos no domingo da semana e no domingo
  anterior. **22 defeitos plantados, 22 reprovados**, cada um nomeado.
- `consistencia`: a asserção "quant == canônico" era tautológica sobre a
  fixture; agora prova que a AUSÊNCIA se propaga (quant `null` + mesmo código).
- Jornadas `ia-numeros`, `ia-historico`, `ajuda-central` — a IA contra Home,
  Fluxo de caixa, painéis de contas a pagar/receber (semana), DRE (célula do
  mês) e a ficha do contato; e depois de CRIAR uma conta a pagar que vence no
  domingo, a IA e o painel sobem o mesmo R$ 4.321,77.

### O que ficou declarado, não feito

- **~35 chaves de `CHAVES_ORG` ainda são gravadas por fora do `store-org`**
  (comprovantes, fechamento, regras, dashboards, compras, vendas locais, NFS-e,
  receita reconhecida, cronogramas, razão, tags, administração, contabilidade,
  aprendizado do FDIP, memória da IA…). Em produção, cada uma é o mesmo defeito
  do chamado: some na primeira hidratação depois da primeira sessão. O
  conserto é mecânico, arquivo a arquivo; vários são reservados de outras áreas.
- **`a4p_ia_memory` tem duas moradas** (`CHAVES_ORG` e a tabela `ai_learning`).
- **O histórico da IA por usuário mora numa linha só de `org_state`**: todo
  membro lê o mapa inteiro (RLS é por empresa) e duas pessoas escrevendo ao
  mesmo tempo perdem atualização. Precisa de tabela própria (`ia_conversas`,
  RLS por `user_id`) — migration, decisão do dono.
- **O chamado não chega a ninguém.** Falta a tabela `chamados` + RPC para o
  `/admin` da plataforma ler — migration e produto.
- **A aba Risco ainda mostra "Runway (base) 24+ meses / 999 dias"** (o teto do
  risk-engine como número) e os cenários do Fluxo de caixa saturam em 33,3
  meses — telas reservadas de outra área.
