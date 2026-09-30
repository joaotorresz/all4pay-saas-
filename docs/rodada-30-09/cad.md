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
