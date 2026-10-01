## ⚠️ PLATAFORMA — conta pessoal, onboarding, painéis e administração (30/09/2026)

Rodada dirigindo como usuário: cadastro (empresa e pessoa física), modo
pessoal, dashboards customizados, Relatório ao investidor, Administração,
`/comece`, `/lixeira`, `/metodologia`. Jornadas em `scripts/e2e/plataforma-*.mjs`;
guardas no bloco `PLATAFORMA` do `engine-audit`, todas provadas plantando o
defeito de volta.

### O cadastro da empresa tem UMA morada — `identidadeDoCadastro` / `cadastroParaGravar`

"Dados da empresa" (Administração) gravava `documento` e `nomeFantasia` —
chaves que nenhuma outra tela lê — e só no cache do navegador (`saveCompany`).
Trocar o CNPJ ali não mudava o CNPJ do arquivo do contador nem a chave PIX; a
consulta seguinte recarregava do servidor e a edição sumia. E o regime gravado
pelo onboarding ("Lucro Presumido", rótulo) abria o seletor vazio, e o salvar
seguinte APAGAVA o regime declarado.

- As chaves canônicas são as que o sistema CONSOME: `cnpj`/`cpf`, `fantasia`,
  `razaoSocial`, e o regime nas duas chaves que `regimeDoCadastro` lê
  (`regimeTributario` vence `regime` — gravar só uma deixava o regime antigo
  valendo depois do "salvo").
- ⚠️ A segunda morada é APAGADA ao salvar (`CHAVES_HISTORICAS_DO_CADASTRO`),
  não conciliada. Depois de um salvar, cada fato tem um endereço só.
- A tela grava por `persistCompany` e mostra a recusa do banco.

### O Relatório ao investidor é do ÚLTIMO MÊS FECHADO

No dia 1º de outubro ele dizia "Fechamos outubro de 2026" — um mês de um dia —,
com a receita de competência do mês inteiro (títulos que ainda vão vencer) e o
MoM tirado da série de CAIXA do motor quantitativo. Agora: mês de referência =
mês anterior ao de hoje; receita e MoM saem da MESMA cascata (competência);
sem receita no mês anterior, MoM é "—" (ONDA 4); MRR indisponível no canônico
vira "—", nunca R$ 0,00. O Caixa continua sendo o de hoje e o diz.
(O "runway 0 meses" para quem não queima é consertado no galho `r3/ia`.)

### Os widgets do dashboard customizado leem `core/indicadores`

O cabeçalho do módulo prometia "widget e DRE nunca divergem", e cada fonte
tinha a sua conta: o **Burn** era a média BRUTA das saídas (uma empresa que
gera caixa via "Burn R$ 38 mil" no dashboard e "burn zero" no Fluxo de caixa);
o **Runway** dava 0 meses sem despesa; receita/despesa/resultado do mês davam
R$ 0,00 sem lançamento. Agora saldo, entradas, saídas, resultado, burn e runway
são os canônicos, e a ausência atravessa até o widget (o motivo no lugar do
número). A guarda antiga que cobrava "burn = média das saídas" FIXAVA o defeito
e foi invertida.

⚠️ A lista de dashboards gravava em `localStorage` cru, fora do `store-org`,
embora a chave esteja em `CHAVES_ORG`: o painel "Empresa" só existia no
navegador e a hidratação ("o servidor vence") sobrescrevia as edições da
sessão seguinte. Agora passa por `ler`/`gravar`; o painel **pessoal** guarda o
`dono` e só aparece para ele.

### Modo pessoal: o "Adicionar" mora na Visão geral

Os grupos do menu pessoal não têm ação, o painel de Vendas não existe para a
pessoa física, e o `NovoDeposito` (com os atalhos Alt+letra) só era montado no
painel de Vendas: no modo pessoal NÃO havia botão para lançar um gasto. O
`InicioActions` monta o `NovoDeposito` quando `pessoal`.

O "Saldo atual" do cadastro pessoal era perguntado e descartado: agora vai para
a primeira carteira (`Estrutura.contas[].saldo` → `financial_accounts.balance`).

### Cancelado é terminal — a Lixeira LANÇA DE NOVO, não restaura

"Restaurar" fazia `situacao: cancelado → previsto`. A máquina de estados do
banco declara `cancelado` terminal (decisão do dono), então em produção o
gatilho recusava SEMPRE — e o `catch` trocava a recusa por "Não foi possível
restaurar". Em demonstração funcionava. O gesto agora é o que a regra manda:
`relancarCancelado` (`lib/lixeira-relancar`) cria um título NOVO com os mesmos
dados de negócio e procedência `manual`, e manda o cancelado para a lixeira
lógica. Não copia `chave` nem `reference_code` (índices únicos que o cancelado
ainda ocupa).

### Onboarding: nenhuma recusa engolida

`aplicarEstrutura` fazia `if (!error) out.x = n` e as duas telas de cadastro a
envolviam em `try {} catch {}`: a pessoa entrava num ambiente sem as contas que
escolheu. Agora a recusa lança, a tela a mostra, e "Concluir" de novo tenta
outra vez sem duplicar (a conta já existe, o perfil é upsert, a estrutura
deduplica por nome).

### Logs: o "de X para Y" se busca como uma pessoa escreve

O resumo falava a língua do código ("valor: de 25000 para 78000") e o campo de
busca convidava a procurar "de 1.000 para 10.000…", que não casava com nada.
`resumoDeMudanca` põe o campo em português e o número em pt-BR; `paraBusca`
normaliza os dois lados (sem acento, sem "R$", sem ponto de milhar, sem ",00").

### Rótulo solto não nomeia campo

`Dados da empresa`, o convite de usuário e as fontes do dashboard tinham
`<label>` irmão do campo, sem `htmlFor`: nenhum nome acessível (26 campos numa
tela só). O rótulo agora ENVOLVE o campo (ou vai pela prop `label` do `Input`).

### Não feito, declarado

- **Defeitos em arquivos reservados** (ver o relatório da rodada): o escritor
  da demonstração `createLancamento` não grava nada (a despesa do "Adicionar"
  não aparece em lugar nenhum na demo); `restoreMovement` em `lib/data.ts`
  ainda pede a transição recusada; o menu pessoal (`nav-data`) chama o perfil
  de "Configurações da empresa"; o formulário de despesa no modo pessoal
  mostra Fornecedor, Centro de custo, Projeto, Código de referência e NSU.
- O orçamento mensal e as categorias de gasto do cadastro pessoal continuam
  guardados no perfil e não viram orçamento nem categorias.
- No cadastro de empresa, só o PRIMEIRO banco escolhido vira conta.
- "Lançar de novo" não é exercitado por jornada: a demonstração não tem tela
  que cancele um lançamento.

## ⚠️ Revisão adversarial (r3/plataforma-rev, 01/10/2026)

Cada guarda nova do bloco `PLATAFORMA` foi plantada de volta e reprovou —
com uma exceção, que virou o primeiro achado.

### A guarda do onboarding era cega a meio conserto

`aplicarEstrutura não transforma recusa…` só procurava a forma antiga
(`if (!error)`). Apagar UMA das seis conferências (`if (error) falhou(...)`)
passava verde. Agora a guarda CONTA: cada `await s.from(` do arquivo tem a sua
conferência. Provada apagando a das contas e a das unidades.

### "Lançar de novo" SUMIA com o título na demonstração

O conserto do caçador acrescentava o título novo e só depois removia o
cancelado. `appendImported` deduplica pela chave de idempotência (conta ·
data · valor · sinal · descritivo) — e o novo tem exatamente os dados do
cancelado. O novo era descartado como repetido, o cancelado era removido, e a
tela dizia "Lançado de novo" sobre um título que não existia mais. A jornada
`plataforma-lixeira` pegou pelo DINHEIRO: o total de Contas a pagar caía
R$ 29.166,91 no cancelamento e não voltava. Agora: remove, acrescenta e
CONFERE que o novo entrou (senão devolve o cancelado e diz por quê). Em
produção o caminho não tinha o defeito (o insert não leva a chave).

### "Nova empresa" reescrevia a empresa ABERTA

`/empresas/nova` ("Abrir outra empresa") não criava organização nenhuma: o
botão gravava os dados da "nova" por cima do cadastro da organização aberta —
razão social, documento nas chaves históricas e o regime em BRANCO (o regime
declarado sumia) — e levava a `/configuracoes`, que passava a anunciar
"Organização: <a nova>". Medido no navegador. O banco não tem porta para o
cliente criar a segunda organização (nenhuma política de INSERT em
`organizations`; ela nasce no gatilho de signup), então a tela agora não grava
nada e diz o caminho que existe: uma conta para a nova empresa, e o convite da
conta atual para alternar pelo seletor.

**Proposta (exige migration — não escrita):** `criar_organizacao(nome, cnpj)`
`SECURITY DEFINER`, que insere a organização, o vínculo `owner` do
`auth.uid()`, roda `seed_org`, dispara os gatilhos de assinatura e alçada e
chama `trocar_organizacao` — com a guarda de isolamento cobrindo a org criada
por ela.

### O título do widget acompanha a fonte

O KPI nasce "Saldo em caixa"; trocar a fonte para runway deixava o cartão com
o título do saldo e o prazo embaixo. `tituloAoTrocarFonte`: o título segue a
fonte enquanto a pessoa não o escreveu; título escrito à mão nunca é
sobrescrito. E os cinco rótulos soltos que sobraram no editor (Título,
Largura, Formato, Conteúdo, Mostrar) agora envolvem o campo — a correção de
acessibilidade da rodada tinha parado nas fontes.

### Cadastro só com CPF é pessoa física

`identidadeDoCadastro` tratava todo cadastro sem `tipoPessoa` como jurídica;
o salvar seguinte movia o CPF para `cnpj`. E `lib/qualidade` lia
`cnpj ?? documento`, chaves que o salvar novo apaga para pessoa física — agora
lê `identidadeDoCadastro`.

### A jornada de dashboards passava sobre o vazio

"O runway não diz 0 meses" passava se o widget não existisse. Agora ela lê o
CARTÃO e exige o motivo da ausência ou um prazo positivo — e foi isso que
expôs o título errado.
