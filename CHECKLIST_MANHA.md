# Checklist da manhã — dia do lançamento

> **Como usar:** de cima para baixo, marcando. Cada item diz ONDE clicar, COMO
> saber que deu certo, e O QUE me dizer para eu avançar a fase que ele destrava.
> Tempo total estimado da sua parte: **~1h30**. O resto é meu.

---

## ☕ BLOCO 1 — Supabase (~25 min) · o que protege os dados

### ☐ 1.1 Assinar o plano Pro
- **Onde:** [supabase.com/dashboard](https://supabase.com/dashboard) → projeto `all4pay-saas` → **Settings → Billing** → Upgrade to Pro (~US$ 25/mês)
- **Deu certo quando:** o plano aparece como "Pro" no billing
- **Por quê:** é o único item da lista inteira **sem conserto se falhar**. Dado financeiro de cliente sem backup está a um `delete` de não existir.

### ☐ 1.2 Confirmar o backup diário
- **Onde:** projeto → **Database → Backups**
- **Deu certo quando:** aparece um backup com data de hoje (pode levar algumas horas após o upgrade — se ainda não apareceu, siga e confira à tarde)
- **➜ Me diga:** *"Pro ativo, backup aparece"* — eu rodo o **teste de restauração** num branch efêmero (US$ 0,32/dia, derrubo no mesmo dia) e registro o tempo de recuperação medido.

### ☐ 1.3 Ligar o autoconfirm de e-mail (por ora)
- **Onde:** projeto → **Authentication → Sign In / Up → Email** → **desmarcar** "Confirm email"
- **Deu certo quando:** a opção fica desligada
- **Por quê (medido ontem):** a confirmação está LIGADA e o e-mail padrão do Supabase estourou o rate limit **no 2º cadastro de teste** (`429`). Sem isto, cliente cadastra e não entra.
- **➜ Me diga:** *"autoconfirm ligado"* — eu dirijo o **cadastro → 1º lançamento** de ponta a ponta e fecho o critério mais importante do portão.

### ☐ 1.4 (Pode ficar para a tarde) SMTP próprio
- **Onde:** **Authentication → SMTP Settings** — usar o Resend (a chave `RESEND_API_KEY` já existe nos secrets das edge functions)
- **Por quê:** com autoconfirm, o cadastro não depende de e-mail — mas **"esqueci a senha" depende**, e bate no mesmo teto de rate limit. Precisa estar resolvido antes de o beta crescer.

---

## 🌿 BLOCO 2 — A linha do produto (~10 min)

### ✅ 2.1 A decisão foi TOMADA — pelo merge do PR #1 (07/08)

Você mergeou o PR #1 e isso **resolveu o item**, por um caminho melhor que o que
eu tinha proposto. Medido agora, não suposto:

- `main` = `fed25aa`, um merge de duas raízes (a linha de junho `6743b5f` + a
  linha viva `d5ff76f`);
- **a árvore de `main` é byte a byte idêntica à da linha viva** — `git diff` entre
  as duas dá **zero arquivos**. O histórico de junho entrou; o conteúdo antigo,
  não;
- **nada ressuscitou**: conferi um a um os alvos que a ONDA 6 removeu de
  propósito (`/arquitetura`, `/dados`, `/orquestracao`, `core/datamoat`,
  `core/orchestration`, `lib/inbox`, `CentralPagamentosView`) — **nenhum voltou**;
  73 rotas nos dois lados;
- **as 12 guardas passam na árvore mergeada** (rodei `npm test` inteiro nela).

⚠️ **NÃO execute mais o `git branch -m` que estava aqui.** Renomear agora
desfaria o merge e recriaria o problema que ele fechou.

*(Nota de higiene, não bloqueia: com o merge, `typecheck` falha até apagar a
pasta `.next` — ela guarda tipos de rotas que o PR #43 excluiu. `rm -rf .next`
resolve. Só afeta build local, nunca a Vercel, que builda do zero.)*

### ☐ 2.2 Vercel: produção sai de `main` ← **agora é o que falta**
- **Onde:** [vercel.com](https://vercel.com) → projeto `all4pay-saas` → **Settings → Git** → Production Branch = `main`
- **Deu certo quando:** o próximo deploy de produção lista `main` como branch — confira em `https://all4pay-saas.vercel.app/api/version` (o campo `branch` tem de dizer `main`)

### ☐ 2.3 GitHub: proteger `main`
- **Onde:** repositório → **Settings → Branches → Add branch protection rule** → pattern `main`
- **Marcar:**
  - ✅ Require status checks to pass → selecionar o check do CI (**verificar**)
  - ✅ Require branches to be up to date
  - ✅ **Do not allow bypassing the above settings** ← sem este, a regra não vale para quem mais mexe
- **Por quê:** foi com 12 guardas verdes e **sem trava** que 29 derivas de esquema conviveram no projeto.

---

## 📱 BLOCO 3 — Duas medições de 2 minutos cada

### ☐ 3.1 DRE Multiempresas
- **Onde:** entrar **logado** em `https://all4pay-saas.vercel.app/dashboard/reports/dre-multi`
- **O que olhar:** o seletor "Empresas (…)"
- **Contexto:** ontem à noite testei as RPCs com o token de um usuário real e **elas devolvem dados** — a camada de dados está sã. Se a tela ainda mostrar `0/0` logado, o defeito é do componente e eu conserto em ~1h.
- **➜ Me diga:** *"multi mostra X/Y"*

### ☐ 3.2 Sanidade visual do cadastro
- **Onde:** `https://all4pay-saas.vercel.app/comecar` numa aba anônima (não conclua — só olhe)
- **O que olhar:** os 7 passos abrem, nada em inglês, nada quebrado no celular

---

## 🎭 BLOCO 4 — O ENSAIO (~1h, VOCÊ + EU) · o item mais importante do dia

Depois dos blocos 1–3, **um cliente de mentira, do zero, você assistindo:**

```
criar conta → importar extrato (use public/exemplos/extrato-exemplo-all4pay.csv)
→ conferir saldo → lançar despesa → dar baixa → fechar o mês
→ exportar para o contador
```

- Se **qualquer** passo travar: é isso que se conserta hoje; o resto espera.
- Se tudo passar: **o portão está aberto.**

---

## 🚦 O PORTÃO — confira antes de divulgar o link

- [ ] Backup ativo **e restauração testada** (1.1 + 1.2 + meu teste)
- [ ] Produção sai de `main` protegida (bloco 2)
- [ ] Cadastro → 1º lançamento ponta a ponta (1.3 + meu drive + o ensaio)
- [ ] `npm run fluxos` — **3 de 4 passam · 1 falha REAL** (ver abaixo)
- [ ] `npm run mobile` — **1 de 7 telas limpa** · 23 falhas de contraste (ver abaixo)
- [x] `npm test` — 12 guardas ✓ (reconferidas na árvore com a navegação nova)

### 🟢 Contraste: 34 → 4 ocorrências. O `R$` e os centavos de TODO valor voltaram a ser legíveis

Com a paleta quente (PR #53) a medição chegou a **7 telas de 7 com problema · 34
ocorrências**. Extraí os pares do axe e **31 das 34 eram a mesma coisa**:
`#a9a6a4` a **2,36:1**, pintando o prefixo `R$` e os **centavos** de todo valor
do produto.

⚠️ **A regra certa já estava escrita — em dois lugares — e o componente não a
seguia.** O `globals.css` do PR #53 diz, com todas as letras: *"Placeholder
#A9A6A4 … serve para o texto-fantasma de um campo vazio e para NADA que precise
ser lido. Quem pinta o prefixo R$ e os centavos é `--color-text-tertiary`."* E o
`tailwind.config.ts` rotula `faint` como *"currency prefix + decimals"*. Só que
`Money.tsx` e `BRL.tsx` usavam **`text-placeholder`**, não `text-faint`.

Não é divergência de gosto: é a decisão registrada na folha de estilo e
contrariada pelo componente que a consome. Por isso **apliquei** — trocar duas
classes em dois arquivos é implementar a regra da outra frente, não sobrepor uma
decisão dela. (E `Money`/`BRL` não estão entre os arquivos que ela vem editando,
então não há conflito a criar.)

**Medido depois, não deduzido:**

```
antes  7 telas com problema · 34 ocorrências
depois 6 telas com problema ·  4 ocorrências   (Aprovações voltou a ficar limpa)
```

`npm test` verde nas **13** guardas, incluindo a `paleta` nova do PR #53.

**O que sobra são decisões de paleta, e essas eu não tomo.** Remedido em
`3c17e58` (depois do PR #56, que trocou as superfícies dos cards — por isso o
número mudou):

| Onde | Hoje | Mínimo que passa |
| --- | --- | --- |
| **texto branco no botão "Design"** (o FAB do Laboratório, PR #54) | **1,03:1** | qualquer cor de texto real — hoje é branco sobre quase-branco |
| **`--color-positive` `#2cd662`** pintando `R$ …` a 17px | **1,92:1** | `#1c863e` (4,53:1) |
| `#a9a6a4` num rótulo de 14px que sobrou | 2,42:1 | `#787675` (4,52:1) |

⚠️ **A primeira é nova e é a pior de todas em número:** 1,03:1 é texto branco
sobre fundo branco — o rótulo "Design" está, para efeitos práticos, **invisível**,
em 5 das 7 telas. Não é sutileza de 4,3 contra 4,5; é um botão sem legenda
legível. (E vale lembrar que o `CLAUDE.md` registra a remoção desse FAB por
outra razão: um sandbox de design fixo por cima do conteúdo, em produção,
convida ao clique de quem não sabe o que ele faz. O PR #54 o trouxe de volta
como "uma de duas portas" — a decisão é de quem o trouxe; o contraste é
mensurável.)

A segunda continua valendo: o commit do PR #53 diz que as semânticas ficaram
*"com o contraste medido"*, e `#2cd662` sobre o branco quente dá **1,92:1**
pintando um valor. Vale reconciliar a frase com o número.

**➜ Me diga: *"pode ajustar as cores que reprovam"*** e aplico as três +
rerodo a medição.

### Nota de método: isto vai continuar acontecendo

Seis PRs visuais entraram em três dias (#48, #49, #51, #53, #54, #56), e cada um
mexeu em cor ou superfície. Como `npm run mobile` exige o app SERVIDO, ele está
**fora do `npm test`** — ou seja, nada reprova uma cor ilegível no caminho até o
`main`. A guarda `paleta` do PR #53 cobra que o hex esteja na paleta, não que
ele seja **legível** onde é usado.

O conserto estrutural seria uma guarda de CONTRASTE sobre os pares
token-texto × token-superfície que o DS declara, rodando offline dentro do
`npm test`. Não escrevi: é decisão de escopo sua, e mexeria num terreno que a
guarda `paleta` já ocupa. **➜ Me diga: *"escreva a guarda de contraste"***.

*(Os estouros de requisições são orçamento de desempenho, não acessibilidade —
vivíveis num beta, mas ficam registrados porque a linha de base era zero.)*

### 🔴 A falha que apareceu ao reconferir: **não há como criar nada a partir do Início**

Medido a 390px **e** a 1280px, na árvore que está no ar:

| Rota | Menu lateral | Botão "Criar" |
| --- | --- | --- |
| `/` (Início) | **0** | **0** |
| `/dashboard/registrations/clients` | 1 | 1 |
| `/dashboard/reports/dre` | 1 | 1 |

**Causa, localizada:** a navegação horizontal (PR #46) transformou a barra
lateral no **segundo nível** do grupo aberto, e `Sidebar.tsx:180` faz
`if (itens.length === 0) return null`. Início é um grupo-folha, sem filhos — a
lateral some, e o botão **Criar**, que mora no topo dela, some junto. O painel
`CriarNovo` continua montado no `AppShell` e as rotas de criação continuam
existindo: **o que sumiu foi a porta**, não os cômodos.

**Por que isso é do portão, e não estética:** o Início é onde todo mundo cai. No
computador ainda há o ⌘K; no telefone não há teclado — a pessoa entra, olha o
saldo e **não tem como lançar uma despesa** sem antes descobrir que precisa
navegar para outro grupo. Foi exatamente isto que o fluxo dirigido pegou e a
medição tela a tela não pega: o botão não está "pequeno" nem "com pouco
contraste", ele **não existe** naquela tela.

**Conserto (não apliquei — o arquivo é de outra frente em andamento, e mexer
nele às cegas cria conflito):** ou o Criar sobe para a `NavHorizontal`/`TopBar`,
onde não depende de o grupo ter filhos, ou a `Sidebar` passa a renderizar o
cabeçalho mesmo com `itens.length === 0`. A primeira é a que eu escolheria: o
Criar é global, e prendê-lo ao segundo nível é o que produziu o defeito.
**➜ Me diga: *"pode consertar o Criar"*** e eu aplico em ~20 min com o fluxo
remedido.

### Nota sobre as outras duas falhas que apareceram e NÃO são defeito

Na primeira execução, 3 dos 4 fluxos falharam. Duas dessas falhas eram **do meu
ambiente**, não do produto: sem `NEXT_PUBLIC_ALL4PAY_DEMO=true` o build local
sobe sem dados de demonstração, e uma tela sem números não tem saldo para
mostrar nem pagamento para aprovar. Com a variável, saldo e aprovação passam
(`R$ 2.187.405,05` visível a 318px do topo, aprovar em 2 toques). Rodei também
contra a árvore **anterior** à navegação horizontal para separar as duas
coisas — só assim dá para dizer qual falha é do produto.

⚠️ E um achado de processo: **`playwright` nunca esteve declarado no
`package.json`**. Os comandos `npm run fluxos` e `npm run mobile` — os dois que
o portão cita — não rodavam num checkout limpo, o que torna "os 4 fluxos
passam" uma afirmação que ninguém além de mim conseguia reproduzir. A
dependência entrou como `devDependency` neste commit.

## 📌 Antes de divulgar AMPLAMENTE (não bloqueia o soft-launch)

- [x] Página de **privacidade** — minuta factual no ar em `/privacidade`, ligada ao cadastro; revisar juridicamente e publicar encarregado/razão social antes da divulgação ampla
- [ ] Canal de **suporte** visível (WhatsApp ou e-mail) com alguém olhando
- [ ] SMTP próprio (item 1.4)
- [ ] Decidir o destino do esquema `maq_*` (outro produto no mesmo banco)

---

## O que EU já deixei pronto esta noite (para você conferir, não fazer)

| Item | Estado |
| --- | --- |
| Backend do cadastro → 1º lançamento, com usuário real | ✅ **medido em produção**: login → conta seed → lançamento criado → leitura → isolamento OK (1 org, zero vazamento) |
| RPCs do DRE multi com token real | ✅ devolvem dados — a dúvida que resta é só de tela |
| Guard do wizard (cadastro sem sessão) | ✅ nos dois wizards |
| P0-08 e P1-10 (números enganosos) | ✅ corrigidos |
| Aviso de beta nos dois wizards + `/privacidade` (minuta LGPD) | ✅ no ar |
| Roadmap completo com estado medido | `ROADMAP_LANCAMENTO.md` |
| Árvore mergeada (`main` = `fed25aa`) conferida | ✅ **12 guardas verdes** · tree idêntica à linha viva · zero arquivo ressuscitado |

### O que mais entrou no repositório enquanto eu trabalhava (não é meu)

Outra linha de trabalho subiu **24 commits** na branch e entrou no merge — vale
saber que existe, porque muda telas que eu não medi:

- **PR #43**: menu de 15 para 6 grupos, painéis curados, "sugestão em vez de
  execução". O inventário agora fecha em **6 grupos · 50 destinos**;
- **CI**: teto de tempo no job e cancelamento de run duplicado;
- **3 migrations novas** em nomenclatura de timestamp (`20260805…`), diferente do
  `00NN_` que eu usava — as duas convenções convivem no diretório;
- a guarda de esquema agora fecha em **57 migrations · 57 arquivos · 0 deriva**
  (manifesto de 05/08, dentro da validade de 7 dias).

⚠️ Eu **não** dirigi as telas do PR #43 no telefone nem no navegador. As
medições da ONDA 12 (7 telas, 4 fluxos) são anteriores a ele. Se o ensaio do
bloco 4 esbarrar em algo de menu/painel, é aí que provavelmente está.
