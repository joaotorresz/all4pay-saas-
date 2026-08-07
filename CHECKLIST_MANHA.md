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

### 🔴 A nova paleta reprovou em contraste — inclusive num VALOR

`npm run mobile` a 390×844. Era **7 telas · 0 com problema** na ONDA 12.
Medido em **`654903a`** (depois dos PRs #48 e #49, ou seja: os números abaixo
**sobreviveram** às duas passadas visuais seguintes, não são de uma árvore
velha):

```
✓ Início            1632ms                  ✓ Aprovações
✗ Fluxo de caixa    66 req · contraste ×10  ✗ Títulos a receber   contraste ×7
✗ Extrato           contraste ×1            ✗ Entrada de dados    66 req · contraste ×5
✗ DRE               63 req

7 telas · 5 com problema · 23 ocorrências de contraste
```

**Duas causas, as duas do PR #48**, extraídas do axe (par de cores, não
impressão minha):

| Onde | Hoje | Precisa |
| --- | --- | --- |
| `text-muted`/`text-faint` = **`#6a7282`** sobre `#f3f1ee` | **4,29:1** | `#666e7d` (4,55:1) |
| o mesmo cinza sobre `#f7f6ef` | **4,46:1** | `#697181` (4,53:1) |
| **`--color-positive` `#2cd662`** como TEXTO de valor, sobre branco | **1,92:1** | `#1c883e` (4,53:1) |
| `--color-negative` `#d62c2c` sobre o canvas `#f4f3f0` | 4,45:1 | `#d42c2c` (4,51:1) |

⚠️ **A terceira linha é a grave**, e é a ONDA 12 voltando pela mesma porta: o
`#2cd662` está pintando **`R$ …` a 17px** — o número, que é a razão da tela
existir — a **1,92:1**. Não é um rótulo decorativo; é o valor. As duas primeiras
linhas erram por pouco (4,29 e 4,46 contra 4,5) e explicam a maior parte das 23
ocorrências, porque esse cinza é o texto de aba e de micro-rótulo do produto
inteiro.

O `#6f6d62` que a ONDA 12 consertou **sobreviveu** — o problema é o cinza NOVO,
que veio junto com a paleta.

**Também não apliquei:** é o mesmo `globals.css` que a outra frente está
editando, e dois editores no mesmo arquivo hoje é conflito garantido. Os quatro
valores acima já estão calculados no mínimo escurecimento que passa — é
substituição direta.
**➜ Me diga: *"pode ajustar a paleta"*** e aplico os quatro + rerodo a medição.

*(Os estouros de requisições e o tempo do Início são orçamento de desempenho,
não acessibilidade — vivíveis num beta, mas ficam registrados porque a linha de
base da ONDA 12 era zero.)*

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
