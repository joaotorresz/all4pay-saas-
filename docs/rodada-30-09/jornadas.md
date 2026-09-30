## ⚠️ JORNADAS DE USUÁRIO (`npm run e2e`) E A VARREDURA DE BOTÕES (30/09/2026)

**"A tela abre" e "a tarefa termina com o dinheiro no lugar certo" são perguntas
diferentes.** O smoke de rotas responde a primeira; as jornadas em
`scripts/e2e/` respondem a segunda. Cada jornada CRIA algo como um usuário cria
(clicando, digitando, com a máscara de centavos) e confere que ele chegou em
TODOS os lugares onde deveria aparecer — lista, títulos, saldo, DRE, arquivo do
contador — e em nenhum onde não deveria. Roda contra o build de DEMONSTRAÇÃO
servido (`ALVO=` muda o endereço); cada jornada num contexto de navegador novo,
porque o dataset da demonstração vive no `localStorage`.

**O que elas acharam, e que nenhuma guarda via:**

| Jornada | Defeito |
| --- | --- |
| venda | não salvava (categoria obrigatória sem opção); total ignorava os itens; título com o CÓDIGO da categoria |
| contas a pagar | a Visão geral cortava os centavos por CSS e mostrava um número que não é o saldo |
| transferência | R$ 500 entre contas próprias viravam R$ 500 de **Receita Bruta**; em produção a tela de Transferências **só gravava no navegador** |
| importação | na demonstração, o 2º extrato **apagava o 1º** e tudo o que a pessoa tinha criado; a prévia prometia N linhas e gravava N−4 (as transferências eram descartadas, e o saldo não batia com o banco) |
| exportação | o arquivo do contador trazia contagem como dinheiro ("Lançamentos: 58,00") e a AV sem dizer a base |

⚠️ **TRANSFERÊNCIA ENTRE CONTAS PRÓPRIAS tem categoria canônica**
(`CATEGORIA_TRANSFERENCIA` + `ehTransferenciaEntreContas` em
`core/indicadores/convencoes`). As três cascatas de resultado a tiram do DRE, e
`ehReceitaOperacional` também — ela move o caixa e não é receita nem despesa.
Declaração explícita da categoria para outra linha continua vencendo. O
predicado é ESTREITO (casa o nome da categoria, nunca uma palavra solta):
"Boleto de transferência bancária" de fornecedor é despesa.

⚠️ **O modal de transferência e a tela de Transferências tinham escritores
diferentes** — o modal só gravava lançamentos (e em demonstração, nada); a tela
só gravava o registro (e em produção, nenhum lançamento). Os dois passam por
`criarTransferencia` → `createTransferencia` (escritor único, `group_id` nos
dois lados), e o registro só é guardado DEPOIS de o banco aceitar.

⚠️ **A importação na demonstração MESCLA** (`mesclarImportacao`, chave de
idempotência igual à de produção). O seed sai na primeira importação; o que a
pessoa criou fica.

**A AV do DRE é sobre a RECEITA LÍQUIDA** (`BaseVertical`, padrão declarado em
`core/relatorios`) — a frase antiga desta casa ("% sobre a receita bruta")
estava desatualizada. O arquivo do contador diz a base no cabeçalho da coluna.

**`npm run varredura-botoes`** — cada tela canônica, cada botão visível (menos
os destrutivos, que têm jornada própria), um clique, e reprova em `pageerror`
ou erro de console da aplicação. O prefetch do Next cancelado pela própria
navegação ("Failed to fetch RSC payload") é artefato da varredura, declarado no
filtro.

⚠️ **DÍVIDA DECLARADA — "pago" e "conciliado" são o mesmo fato em dois
campos.** Toda baixa (`pagarLote`, `receberLote`, boleto, upload) grava
`reconciled: true` junto, e a máquina da Central tem `situacao = 'conciliado'`
como estado próprio depois de `baixado`. Por isso as abas Quadros e Fechamentos
da conciliação bancária contam "pago" como "conciliado": não é erro da tela, é
o modelo que não separa "baixei" de "o banco confirmou". Separar exige decidir
qual escritor marca a confirmação do banco (o casamento OFX/Open Finance) e
parar de gravar `reconciled` na baixa manual — decisão de modelo, na fila.
