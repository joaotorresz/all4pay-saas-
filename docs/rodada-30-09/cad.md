# PACOTE CAD — parte 1 de 2: a hierarquia de cadastros no banco

Branch `r2/cad-1` (a partir de `a1fd216`). Migration
`supabase/migrations/20260930180000_cadastros_hierarquia.sql` — **só arquivo**:
quem aplica é o CI no merge, depois do dono.

## O defeito

Contas bancárias, centros de custo, projetos, plano de contas e o "Uso padrão"
moravam em `org_state`/`localStorage` com id NUMÉRICO próprio, enquanto os
lançamentos apontam para tabelas com UUID. As duas moradas só se encontravam
pelo nome — ou não se encontravam:

- a tela **Contas bancárias** dizia "Nenhuma conta cadastrada" numa empresa com
  quatro contas no banco;
- um projeto ou centro escolhido num lançamento em produção era recusado
  (`"5001"` não é UUID), com a mensagem "abra Cadastros e crie-o de novo" — e
  Cadastros gravava no mesmo navegador. Não havia saída;
- o plano de contas deixava lançar em GRUPO, e nada impedia uma categoria com
  lançamento de virar grupo ou ir para a lixeira.

## O que mudou

### No banco (a migration)

| Tabela | Ganhou |
| --- | --- |
| `financial_accounts` | `tipo`, `agencia`, `numero`, `codigo_contabil`, `dia_fechamento`, `dia_vencimento`, `saldo_inicial`, `data_saldo_inicial`, `saldo_inicial_conferido`, `ativo` (padrão `true`); CHECK dos dois dias quando `tipo = 'cartao'`; nome único por empresa entre as vivas |
| `cost_centers` | `code`, `codigo_contabil`, `parent_id` (mesma empresa, sem ciclo), `description` |
| `projects` | `party_id`, `cost_center_id` (da mesma empresa), `status` (`ativo` · `encerrado`) |
| `categories` | `code`; único por (empresa, grupo, nome) entre as vivas |
| `parties` | índice do documento POR EMPRESA no lugar do global; `ativo`; `default_category_id` (folha da mesma empresa) |
| `categoria_uso_padrao` (nova) | função automática → categoria, uma por empresa; RLS por organização, sem DELETE |

Regras que o banco passa a recusar (errcode `A4P05`, mensagem em português e
o que fazer no `hint`):

- lançamento, rateio e recorrência em categoria que é **grupo**;
- categoria com lançamento virar grupo; categoria com lançamento ir para a
  lixeira; grupo com subcategoria viva ir para a lixeira;
- lançamento **novo** em conta inativa ou em projeto encerrado (o estorno passa:
  ele corrige o passado, não abre movimento novo).

⚠️ **Natureza trocada NÃO é recusada, de propósito.** Uma entrada numa
categoria de despesa é o estorno legítimo de uma despesa, e o DRE já a trata
(abate a linha). Recusar barraria o caso certo.

⚠️ **A migration se RECUSA, nomeando, quando a unicidade nova reprovaria dado
existente**: conta com nome repetido na mesma empresa, contato com o mesmo
documento na mesma empresa, cópia de categoria que alguém usa. Ela não escolhe
sozinha qual cadastro com dinheiro deixa de existir.

### Medido em produção (só SELECT, 30/09)

| Pergunta | Resposta |
| --- | --- |
| Contas com nome repetido na mesma empresa | **0** |
| Contatos com o mesmo documento na mesma empresa | **0** (o índice global `parties_doc_unique` confirmado: `(doc_digits) where doc_digits <> ''`) |
| Categorias repetidas por (empresa, nome) | **16 grupos** em 2 organizações (criadas em 10 e 15/06), **todas** sem lançamento, rateio, recorrência, produto, serviço, filha ou `dre_linha` divergente → as cópias vão para a lixeira com o motivo escrito; a mais antiga fica |
| Categoria com pai / lançamento em categoria não-folha | **0 / 0** |
| Volume | 31 contas · 117 centros (10 grupos de nome repetido — **sem** unicidade nova, de propósito) · 0 projetos · 338 categorias |
| Rastro em `org_state` | 1 organização com `a4p_plano_contas` (1 item) e 1 com `a4p_plano_usos` (1 chave); nenhuma com `a4p_contas_bancarias` |

### Provado em Postgres local (`begin … rollback` + base semeada)

- recusa com dado ruim, nomeando o caso (conta repetida, documento repetido,
  cópia de categoria referenciada);
- aplica sobre organizações criadas pelo gatilho de signup + categorias
  duplicadas injetadas: 3 cópias para a lixeira, a original com lançamento fica;
- reaplica sem erro e sem mexer em nada (0 cópias na segunda vez);
- as guardas de banco que já existiam continuam verdes: taxonomia,
  isolamento-par, trilha-completa, matriz-permissao, cadastro-nome,
  central-autorizacao, central-maquina, assinatura-bloqueio, estado-unico;
- RLS como cliente (`set local role authenticated`) prova que a regra de mesma
  empresa vale para quem chama.

### No código

- `lib/cadastros-hierarquia` é o **único leitor e escritor** das quatro telas:
  demo grava no dataset (`importedCadastros`/`gravarCadastrosDemo`/
  `gravarContaDemo`), produção grava na tabela e **LANÇA** o erro do banco
  traduzido (`erroDoBanco`: A4P05 passa inteiro, restrição única vira frase).
- `core/registros/hierarquia` traduz tela ⇄ linha (ida e volta no mesmo
  arquivo), valida, e repete as frases do banco para a tela explicar antes.
- As telas `bank-accounts`, `cost-centers`, `projects`, `chart-of-accounts`
  leem e gravam por `components/registros/hooks`. O rastro antigo aparece no
  bloco **"Cadastros antigos deste navegador"**, com o botão **"Trazer para o
  cadastro"** — nunca automático.
- `getCategories` devolve só as **folhas ativas**, com `parent_id`, `code`,
  `dre_linha` e o caminho; com a coluna ainda ausente (janela entre o deploy e
  o job `migrar`), cai na leitura plana e **reporta** a queda.
- A linha do DRE declarada no banco **vence** a do plano local
  (`linhasDeclaradasDasCategorias`).
- **A "primeira conta" dos escritores automáticos** (reembolso, recorrência,
  documento do upload, importação, NFS-e, POS, Central, cron) passou a ser a
  primeira conta **ativa** (`lib/conta-padrao.primeiraContaAtiva`, com queda
  para a coluna ausente). Sem isso, a primeira conta desativada derrubaria a
  importação inteira com "A conta … está inativa" — o defeito que a própria
  trava nova criaria.
- O onboarding deduplica as contas **dentro do lote** (o nome agora é único).

## Guardas

- `scripts/cadastros-hierarquia.sql` (job de isolamento no CI): 10 casos em
  savepoint, cada recusa conferida pela MENSAGEM; o bloco negativo derruba o
  gatilho de folha e exige que a asserção reprove nomeando `A4P-CAD-FOLHA`.
  Provada também plantando a falta do gatilho de conta inativa
  (→ `A4P-CAD-CONTA-INATIVA`).
- `engine-audit`, bloco `/* ── CAD ── */`: ida e volta, frases iguais na tela e
  no banco, pendências antigas (criar × completar), **teto zero** de tela lendo
  o plano/contas locais, escritores antigos removidos, escritor que engole erro,
  gravação de demonstração fora de `isDemo`, `getCategories` só com folhas, o
  conteúdo da migration, a guarda de banco ligada no CI e a "primeira conta"
  só entre as ativas. Cada varredura com o seu teste negativo; provadas
  plantando cinco defeitos (tela importando o leitor antigo, escritor com
  `if (error) return`, gatilho renomeado na migration, `getCategories` sem o
  filtro de folha, `limit(1)` cru em `financial_accounts`).
- `scripts/e2e/cad.mjs`: a jornada — conta criada chega à transferência; o
  rastro antigo só entra pelo botão e não volta; grupo com subcategoria não é
  oferecido no lançamento; a categoria com lançamento é recusada dizendo
  quantos (antes de qualquer confirmação); a sem lançamento vai depois da
  confirmação; centro filho sob o grupo; projeto encerrado.

## Decisões que valem para o CLAUDE.md (no estilo ⚠️)

- ⚠️ **O CADASTRO MORA NA TABELA; o navegador só é LIDO como "antigo".** O que
  ficou em `org_state`/`localStorage` aparece num bloco próprio com o botão que
  traz — trazer cria um cadastro que lançamentos vão referenciar, então é
  decisão da pessoa, nunca automático (mesma regra de `a4p_vendas_docs`).
- ⚠️ **SÓ A FOLHA RECEBE LANÇAMENTO — e quem cobra é o BANCO.** A tela filtra
  (`categoriasSelecionaveis`), mas o gatilho alcança importação, cron, RPC e
  `psql`. Um grupo que recebesse lançamento faria o DRE somar o pai e os filhos
  sem regra de qual vence.
- ⚠️ **INATIVAR ≠ EXCLUIR.** Conta inativa e projeto encerrado saem das escolhas
  e recusam lançamento NOVO, mas o histórico fica e o estorno passa. Categoria
  com lançamento não vai para a lixeira: a tela CONTA antes e diz quantos, e
  oferece desativar.
- ⚠️ **"PRIMEIRA CONTA" É SEMPRE A PRIMEIRA ATIVA.** Toda trava nova no banco
  pergunta: quem escreve sem a pessoa escolher, e o que ele escolhe? Os seis
  `limit(1)` crus eram o defeito que a própria trava de conta inativa criaria.
- ⚠️ **NATUREZA TROCADA NÃO É ERRO.** Entrada em categoria de despesa é estorno.
- ⚠️ **UNICIDADE NOVA SE RECUSA SOBRE DADO EXISTENTE, nomeando** — a migration
  não escolhe qual cadastro com dinheiro some. Onde o dado repetido é provadamente
  inerte (categorias sem nada pendurado), vai para a lixeira com o motivo.

## Para a parte 2 (os formulários)

Use estes leitores/escritores — **não** os de `lib/registros` e
`lib/iuli-cadastros`, que ficaram só como leitores do rastro antigo:

| Precisa de | Use |
| --- | --- |
| Contas para escolher | `useContasBancarias()` / `listarContasBancarias()` — **filtrar `ativo`** para o select (inativa não recebe lançamento novo) |
| Categorias para o lançamento | `useCategories(kind)` / `getCategories(kind)` — já devolve só FOLHAS ativas, com `caminho` ("Grupo › Folha") para rotular |
| A árvore inteira (tela) | `useCategoriasArvore()` / `listarCategorias()` |
| Centros de custo | `useCentrosCusto()` / `listarCentrosCusto()` — filtrar `ativo`; `caminhoDe` para o rótulo |
| Projetos | `useProjetos()` / `listarProjetos()` — oferecer só `status === "ativo"` |
| Uso padrão | `useUsosPadrao()` / `listarUsosPadrao()` e `definirUsoPadrao(funcao, categoriaId)` |
| Conta automática (sem escolha da pessoa) | `primeiraContaAtiva(cliente, orgId?)` em `lib/conta-padrao` |
| Traduzir erro do banco | `erroDoBanco(error)` |

Onde ainda se lê o cadastro antigo (a trocar na parte 2):

- `listProjetos`/`listCentrosCusto` (`lib/iuli-cadastros`) em `TituloForm`,
  `ReceitaForm`, `CompraForm`, `VendaForm`, `ContratosView`, `OrcamentosView`,
  `OutrasViews`, `TitulosView`, `ExtratoTransacoes` e `lib/data.getRiscoInput`
  (nome do projeto);
- `listPlanoContas`/`listUsosPadrao`/`listContasBancarias` (`lib/registros`) nos
  mesmos formulários e em `PartesView`;
- `extraParty().categoriaPadrao` em `PartesView`: passar a gravar
  `parties.default_category_id` (a coluna já existe, com gatilho de folha da
  mesma empresa) e `parties.ativo`;
- `lib/projeto-vinculo` (movimento → projeto no navegador): trocar por
  `movements.project_id`;
- `getParties`/`listParties` ainda não filtram `ativo`;
- `getAccountsList` (saldos) não filtra `ativo` — de propósito: é leitura de
  SALDO, e uma conta inativa com saldo continua sendo dinheiro. O select de
  escolha é que deve filtrar.

Depois que a parte 2 trocar os formulários, **congelar** as chaves antigas
(`a4p_contas_bancarias`, `a4p_plano_contas`, `a4p_plano_usos`,
`a4p_centros_custo`, `a4p_projetos`) em `CHAVES_CONGELADAS`. Congelar agora
esconderia o bloco de "cadastros antigos" em produção (o `ler` devolve o
padrão para chave congelada), e ninguém conseguiria trazer o que ficou lá.

## Fora do escopo desta parte

- Os formulários de lançamento (TituloForm, ReceitaForm, VendaForm,
  ContratosView, OrcamentosView, OutrasViews, CompraForm, PartesView).
- Folha obrigatória também em **centro de custo** e em produto/serviço
  (`products.category_id`/`services.category_id`) — o gatilho existe só para
  movimento, rateio e recorrência.
- Unicidade de nome de centro de custo: produção tem 10 grupos de nome
  repetido, e decidir qual fica é trabalho de gente.
- Políticas por PAPEL nas tabelas de cadastro (hoje é a política de
  organização, como `categories`).
- O consumidor do "Uso padrão" (a classificação automática ainda não lê
  `categoria_uso_padrao`).

## Validação (retomada, 30/09)

- `tsc --noEmit` e `next lint --quiet`: limpos.
- `npm test`: verde (EXIT 0). Na retomada ele reprovou uma vez em
  `onda9: nenhuma consulta sem teto de linhas` — `lib/conta-padrao` montava a
  consulta numa função e punha o `.limit(1)` depois, fora do alcance da
  varredura. Consertado escrevendo as quatro consultas por extenso, cada uma
  com o seu `.limit(1)` (a guarda não foi afrouxada).
- `NEXT_PUBLIC_ALL4PAY_DEMO=true npm run build`: verde.
- `smoke-rotas` (porta 3131): 81 rotas canônicas verdes.
- `e2e` (porta 3131): 5 jornadas verdes, inclusive a nova `scripts/e2e/cad.mjs`
  (22 verificações).
- ⚠️ **Banco local:** a prova da migration e da guarda de banco foi feita antes
  do reinício do contêiner (os arquivos provados em `/tmp/pgharness/cad1/`
  são idênticos, byte a byte, aos commitados). Na retomada o ambiente recusou
  `su postgres`, então não foi possível REEXECUTAR a prova nem apagar o banco
  `pkg_cad*` desta sessão — fica para o orquestrador apagar.

---

# PACOTE CAD — parte 2 de 2: os formulários usam os cadastros do banco + hub

Branch `r2/cad` (a partir de `r2/cad-1`). **Sem migration nova** — esta parte
só passa a USAR as colunas da `20260930180000` (parte 1) e da `0019`
(`movement_splits.project_id`).

## O que mudou

### 1. Os formulários oferecem e gravam os cadastros da TABELA

Um hook só para as escolhas de cadastro de todo formulário de lançamento:
`components/lancamentos/opcoes-cadastro.ts` (`useOpcoesCadastro(lado)`), sobre o
mesmo critério puro de `core/registros/hierarquia`:

| Escolha | Critério |
| --- | --- |
| Conta | só ATIVA (`contasSelecionaveis`) — queda para a lista plana se a coluna ainda não existir |
| Categoria | `getCategories` — FOLHA ativa da natureza do LADO (entrada → receita, saída → despesa), rotulada "Grupo › Folha" |
| Centro de custo | ativo e ANALÍTICO (`centrosSelecionaveis`) |
| Projeto | situação "ativo" (`projetosSelecionaveis`) |

Consumido por `TituloForm`, `ReceitaForm`, `VendaForm`, `ContratosView`,
`OutrasViews` (impostos) e `CompraForm`; `OrcamentosView` e `PartesView` leem os
hooks de cadastro direto (o orçamento guarda o NOME, que é por onde o DRE
recorta; a alocação deixou de ser texto livre e virou seleção das folhas do
plano). Nenhum deles lê mais `listPlanoContas`/`listProjetos`/
`listCentrosCusto`/`lib/iuli-cadastros` (guarda de teto zero).

- **Categoria padrão do contato** = `parties.default_category_id` (UUID), e só
  preenche quando continua selecionável daquele lado (`categoriaPadraoValida`).
- **Projeto do lançamento** = `movements.project_id` em produção; em
  demonstração o dataset guarda `project_id` no PRÓPRIO movimento.
  `lib/projeto-vinculo` perdeu o escritor e virou leitura de queda só da
  demonstração (lançamentos antigos). `lib/data.definirProjetoDoMovimento` é o
  único escritor do vínculo depois de lançado (ficha do título), e a recusa do
  banco vai para a tela.
- **Rateio GRAVADO** em `movement_splits` (antes: validado em 100% e
  descartado com `splits: null`). Projeto e centro são duas dimensões que
  fecham 100% cada; a linha é o CRUZAMENTO (percentual = produto das fatias),
  valor em centavos com o resto na última (`linhasDoRateio`). Vai para CADA
  parcela (antes só a primeira). O lançamento guarda o projeto/centro de maior
  fatia (`principalDoRateio`). A ficha do título mostra centro, projeto e o
  rateio (`RiskMovement.rateio`, lido pelo embed `rateio:movement_splits(...)`).
- `ReceitaForm` passou a validar o rateio em 100% (não validava) e a mostrar a
  mensagem real do banco no lugar de "Erro ao salvar — tente novamente".
- **Venda**: o recebível leva `cost_center_id`, `project_id` e o rateio.
- **Compra**: guarda `categoriaId` (UUID) ao lado do nome; os títulos da
  demonstração levam categoria, centro e projeto.
- **Impostos**: categoria do banco (UUID) na chave e o NOME no texto (gravava
  o id no texto). ⚠️ E em produção `criarContasDeImpostos` **não gravava
  nada** (`if (!isDemo) return 0`) e a tela dizia "Nada a criar neste
  período" — agora grava por `criarTitulos`, idempotente pela
  `reference_code` `imp:<mês>:<imposto>` (o que já existe fica; o que falta
  nasce; a tela diz quantos já existiam).

### 2. `ativo` e `default_category_id` saíram de `a4p_party_extra`

`PartesView` grava as duas colunas em `parties` (o resto do extra — PIX, bloco
PJ — continua no `org_state`) e mostra a recusa do banco no modal. `getParties`
(seletores) filtra `ativo = true`, com queda REPORTADA para a coluna ausente;
`listParties` (lista de cadastro) traz as duas colunas. Em demonstração
`createParty` passou a GRAVAR o contato (`gravarParteDemo`) — antes era
`return void delay()`: "Fornecedor criado" sem fornecedor nenhum. `createParty`
devolve o id, e `useCreateParty` invalida também `parties-list`.

### 3. Toda chave de `CHAVES_ORG` passa por `store-org`

22 arquivos escreviam chave de negócio com `localStorage.setItem` cru (perfil
da empresa, compras, NFs/boletos recebidos, configuração de impostos, links,
fechamentos, dashboards, regras, comprovantes, memória da IA, tarefas de
fechamento…). Convertidos para `ler`/`gravar` de `store-org`.

- **Preferência ≠ negócio.** `store-org` ganhou `lerPreferencia`/
  `gravarPreferencia` — o caminho sancionado para o navegador, que **recusa**
  chave de negócio. `ajuda-store` escolhe pelo tipo da chave (tours e anúncios
  lidos são preferência; chamados e conversa são da empresa).
- **Sete chaves CONGELADAS** (`CHAVES_CONGELADAS`): `a4p_recorrencias`,
  `a4p_nfse`, `a4p_ledger`, `a4p_revrec`, `a4p_cronogramas`, `a4p_tags`
  (entidades cuja morada em produção é TABELA e que só a demonstração grava no
  navegador) e `a4p_movimento_projeto` (sem escritor). Sem o congelamento,
  passar a escrita por `store-org` as mandaria também para `org_state`.
- `a4p_vendas_docs` (já congelada) continua LIDA crua em produção — é o rastro
  que a lista oferece "enviar"; o `ler` de chave congelada devolveria vazio.

### 4. Hub "Estrutura e cadastros" (`/dashboard/registrations`)

`core/registros/estrutura` (`niveisDaEstrutura`, `pendenciasDaEstrutura`) +
`components/registros/EstruturaCadastrosView`. Os sete níveis na ordem de
dependência (empresa → contas → plano de contas → centros/projetos →
clientes/fornecedores → produtos/serviços → contratos), cada um com contagem e
link; e o checklist "o que falta para lançar" separando **impede** (sem conta
ativa, sem folha de receita, sem folha de despesa) de **atenção** (folha sem
linha do DRE, regime não declarado, conta sem abertura conferida, sem
cliente/fornecedor). Uma entrada em Configurações (menu 56 → 57, tetos
intactos; justificativa no bloco `CAD` de `consistencia.mts`), linha no
inventário, e `/cadastros` agora leva ao hub. As nove telas de cadastro
ganharam o link "Estrutura e cadastros ›" no cabeçalho (o `crumb="Cadastros"`
não era exibido e nomeava um grupo que o menu não tem; virou "Estrutura e
cadastros").

## Guardas (bloco `/* ── CAD-2 ── */` do `engine-audit` + `CAD` da `consistencia`)

Teto zero, cada uma com o NEGATIVO dentro do arquivo:

- nenhum formulário de lançamento lê o cadastro antigo (`listPlanoContas`,
  `listProjetos`, `iuli-cadastros`, `extraParty(...).categoriaPadrao`,
  `vincularProjeto`…);
- nenhum formulário oferece a árvore crua (`useCategoriasArvore`/
  `listarCategorias`) como categoria; o seletor só oferece FOLHA da natureza do
  lado (fixture com grupo, folha inativa e folha da outra natureza);
- nenhuma chave de `CHAVES_ORG` com `localStorage.setItem` cru no `src/`;
  `gravarPreferencia` recusa chave de negócio; as sete chaves estão congeladas;
- o rateio fecha (60/40 × 50/50 de R$ 1.000 = 4 fatias, R$ 1.000,00, 100%;
  100 ÷ 3 sem perder centavo) e não é descartado (`splits: null` fixo);
- `getParties` filtra ativo; `PartesView` grava as duas colunas; o vínculo de
  projeto não tem escritor no navegador; em produção o nome do projeto sai só
  do embed;
- o hub: empresa vazia bloqueia, estrutura completa não tem pendência, folha
  sem linha do DRE é atenção, níveis na ordem, uma porta no menu.

**Provadas plantando seis defeitos** (formulário lendo `listPlanoContas`,
`categoriasDoLado` sem o filtro de folha, `opcoes-cadastro` com
`useCategoriasArvore`, `company.ts` com `setItem` cru, `splits: null` no
título, `getParties` sem `.eq("ativo", true)`): cada um reprovou nomeando a
asserção; restaurados, tudo verde.

## Jornada `scripts/e2e/cadastros.mjs` (27 verificações)

Contas bancárias soma o mesmo que o "Saldo em conta hoje" da Visão geral, e
uma conta nova com R$ 1.000 de abertura move a Home em R$ 1.000 · cria conta,
centro, dois projetos e categoria nas telas de cadastro · cada um aparece no
formulário de conta a pagar (que não oferece categoria de receita) · o título
salvo mostra centro, projeto e categoria · o título rateado 60/40 mostra
R$ 600 e R$ 400 · o fornecedor com categoria padrão a preenche; desativado, some
do formulário; a conta desativada também · o hub conta o que foi criado.
`scripts/e2e/cad.mjs` (parte 1) foi ajustado ao rótulo "Grupo › Folha".

## Decisões que valem para o CLAUDE.md (no estilo ⚠️)

- ⚠️ **UM CRITÉRIO DE ESCOLHA PARA TODOS OS FORMULÁRIOS.** Conta ativa,
  categoria FOLHA ativa da natureza do LADO, centro ativo e analítico, projeto
  ativo — num hook só (`useOpcoesCadastro`). Cada formulário filtrava do seu
  jeito (um mostrava só subcategorias, outro só raízes), e o que um oferecia o
  banco recusava no outro.
- ⚠️ **RATEIO VALIDADO E DESCARTADO É PROMESSA DE TELA.** Projeto e centro são
  duas dimensões de 100% cada: a linha de `movement_splits` é o cruzamento, e
  vai para CADA parcela. Somadas por dimensão, as fatias devolvem o que a
  pessoa digitou.
- ⚠️ **PREFERÊNCIA FICA NO DISPOSITIVO; NEGÓCIO PASSA POR `store-org`.**
  `gravarPreferencia` recusa chave de negócio — `setItem` cru foi como o perfil
  da empresa e a configuração de impostos deixaram de subir ao servidor.
- ⚠️ **CONVERTER A ESCRITA NÃO PODE CRIAR A SEGUNDA MORADA.** Entidade que tem
  TABELA e só é gravada no navegador pela demonstração é CONGELADA antes de
  passar por `store-org`; senão o conserto do `setItem` cru a mandaria para
  `org_state`.
- ⚠️ **INATIVO SAI DA ESCOLHA, NÃO DA HISTÓRIA.** O seletor filtra; a lista de
  cadastro e os relatórios continuam vendo o contato/conta inativos (e o
  formulário de um documento antigo ainda mostra o seu contato).

## Fora do escopo / pendências declaradas

- **Compra em produção não gera título** (`lib/compras-store.sincronizar` só
  age em demonstração) — escritor morto pré-existente; a compra agora guarda o
  UUID da categoria, mas ela só chega a `movements` em demonstração. Precisa de
  escritor com reversão na reprovação (exclusão lógica dos títulos).
- **`ReceitaForm` em demonstração não grava nada** (`createLancamento` faz
  `return` em demo) — pré-existente, não tocado.
- **Rateio de venda EDITADA** não é reescrito (as fatias da primeira gravação
  ficam); só o projeto/centro principal é atualizado no título previsto.
- **`ativo`/categoria padrão antigos em `a4p_party_extra` não migram
  sozinhos**: a tela usa a coluna quando ela vem; um contato desativado só no
  navegador antes desta parte volta a aparecer ativo depois da migration (a
  coluna nasce `true`). Sem tela de "trazer" para esse caso.
- As chaves antigas de cadastro (`a4p_contas_bancarias`, `a4p_plano_contas`,
  `a4p_plano_usos`, `a4p_centros_custo`, `a4p_projetos`) **não** foram
  congeladas: o bloco "Cadastros antigos" lê o que veio do SERVIDOR
  (`org_state`), e o `ler` de chave congelada devolveria vazio em produção —
  ninguém conseguiria trazer o que ficou lá. Congelar exige ler o rastro por
  outro caminho primeiro.
- **Prova contra Postgres não feita nesta parte**: o ambiente recusou `su
  postgres` (e a autenticação por senha/peer), então as gravações em
  `movement_splits` com `project_id`, o `update` de `movements.project_id` e o
  filtro `parties.ativo` foram provados só no build de demonstração e pelas
  guardas estáticas. Nenhuma migration nova; nenhum banco `pkg_*` criado nesta
  parte.

---

# PACOTE CAD — revisão adversarial (branch `r2/cad-rev`, a partir de `r2/cad`)

## Achados e o que foi feito

| # | Onde | Achado | Feito |
| --- | --- | --- | --- |
| 1 | `src/lib/data.ts` (`createLancamento`, `criarTitulos`) | Título e rateio são DUAS gravações. Se o rateio fosse recusado (ou `exigirUUID` lançasse depois do insert), os títulos ficavam gravados SEM rateio e a tela dizia "não foi possível salvar" — salvar de novo DUPLICAVA o dinheiro no contas a pagar, no fluxo e no DRE. | `gravarRateioOuDesfazer`: na recusa, os títulos recém-criados vão para a lixeira (`excluirLogico`) e a mensagem diz o motivo; se o desfazer falhar, diz quantos títulos ficaram. Guarda `CAD-rev` com negativo. |
| 2 | `src/lib/vendas-store.ts` + `OutrasViews.tsx` | "Criar contas a pagar" dos impostos passou a gravar em produção com idempotência por CONSULTA — dois cliques (ou duas abas) leem "não existe" juntos e gravam a guia DUAS vezes. Não havia índice para `imp:%`. | Índice único parcial `movements_imp_ref_uniq (org_id, reference_code) where reference_code like 'imp:%'` na migration `20260930180000` (com recusa nomeada se já houver repetição — medido em produção, só SELECT: **0** linhas `imp:%`); botão desabilitado enquanto grava. Guardas `CAD-rev` (escritor morto teto zero, índice no arquivo, botão). |
| 3 | `src/lib/fdip.ts` | Com o nome de conta único por empresa, uma "Conta consolidada" DESATIVADA faz `primeiraContaAtiva` devolver nada e o insert da nova ser recusado — o erro era descartado e a importação terminava com ZERO lançamentos, sem explicação. | A recusa vira erro com a frase do que fazer (reativar a conta). Guarda com negativo. |
| 4 | `src/lib/fdip.ts` | Categorias novas do extrato: sem dedup DENTRO do lote ("Folha" e "folha " derrubariam o insert inteiro pela unicidade nova) e erro do insert engolido. | Dedup por nome normalizado no lote; recusa vai para `reportar` (o lançamento entra pelo nome mesmo sem a categoria). |

Provas: as quatro guardas novas reprovaram com o defeito plantado (rateio sem
desfazer, escritor de impostos só em demonstração, índice trocado, erro da conta
descartado) e voltaram ao verde restaurado. A migration foi aplicada (2×, idempotente) e a
guarda `scripts/cadastros-hierarquia.sql` rodada inteira num Postgres 17
embutido (PGlite, com as 98 migrations do `/tmp/pgharness/migrations` + o stub)
— o `su postgres` do harness é recusado neste ambiente. Teste do índice:
positivo (outro imposto / outra competência passam) e negativo conferindo a
MENSAGEM (`movements_imp_ref_uniq`); a recusa com repetição pré-existente
também conferida pela mensagem. Com o gatilho de folha derrubado, a guarda de
banco reprova nomeando `A4P-CAD-FOLHA`.

## Pendências declaradas (não bloqueiam)

- ⚠️ **A unicidade de categoria ignora a NATUREZA** (`categories_org_pai_nome_unico`
  é por empresa + grupo + nome). "Juros" como receita E como despesa na raiz é
  recusado. Medido em produção: 0 nomes em naturezas diferentes hoje — mas o
  dedup do `fdip` e a tela seguem a mesma regra, então mudar é decisão de
  produto (incluir `kind` no índice, na tela e no `fdip` ao mesmo tempo).
- O caminho de PRODUÇÃO do rateio (`createLancamento`/`criarTitulos` →
  `movement_splits`) não é exercido pelo e2e (que roda em demonstração) nem
  provado contra PostgREST; a guarda é estática.
- `getCostCenters` (usado pelo `ConfirmacaoModal` e pelo `ContratoForm` de
  lançamentos) ainda oferece centro-grupo; centro não tem trava de folha no
  banco, então não há recusa — só classificação no nível do grupo.
- `primeiraContaAtiva` devolve `null` em erro que não seja coluna ausente (o
  escritor então tenta criar conta) — comportamento herdado.

## Decisões para o CLAUDE.md

- ⚠️ **DUAS GRAVAÇÕES PARA UM LANÇAMENTO: A SEGUNDA RECUSADA DESFAZ A PRIMEIRA.**
  Título + rateio, venda + título: sem desfazer, o "tente de novo" da tela é
  quem duplica o dinheiro.
- ⚠️ **IDEMPOTÊNCIA POR CONSULTA NÃO SEGURA DOIS CLIQUES.** Toda chave de
  origem que impede duplicata (`rec:`, `pluggy:`, `imp:`) tem índice único
  parcial no banco; a consulta prévia é só para a tela dizer "já existia".
- ⚠️ **UNICIDADE NOVA CRIA RECUSA NOVA EM QUEM ESCREVE SOZINHO.** Ao tornar um
  nome único, procure os escritores automáticos que criam aquele cadastro (a
  "Conta consolidada" da importação, as categorias do extrato) e confira que a
  recusa chega à tela em vez de sumir.
