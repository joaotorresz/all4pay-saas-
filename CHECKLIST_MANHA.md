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
- [ ] `npm run fluxos` — 4 fluxos essenciais ✓ (já passam; reconfiro após o deploy final)
- [ ] `npm test` — 12 guardas ✓ (já passam)

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
