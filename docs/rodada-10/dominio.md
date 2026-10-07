# O domínio oficial: `app.quattro.finance` (07/10/2026)

O sistema respondia só em `all4pay-saas.vercel.app`. O webhook da Pinbank tinha
de ser cadastrado no endereço definitivo antes de tudo, porque na Pinbank quem
cadastra e troca a URL é o suporte (não é autoatendimento): cadastrar no
endereço provisório custaria um segundo chamado.

## O que foi configurado (pelo dono, conferido aqui)

| Onde | O quê | Conferido |
| --- | --- | --- |
| Hostinger (registro) | `quattro.finance` comprado em 06/10/2026, nameservers da Hostinger (`hermes`/`artemis.dns-parking.com`), sem DNSSEC | RDAP do `.finance` |
| Hostinger (DNS) | CNAME `app` → `e195a9396bb3fbbd.vercel-dns-017.com.` (o alvo é ÚNICO do projeto) | Google e Cloudflare resolvem |
| Vercel | `app.quattro.finance` no projeto, em Production, "Valid Configuration", certificado automático | `/api/versao` no domínio novo responde o commit de `main` |
| Supabase Auth | Redirect URLs: `https://app.quattro.finance/**` e `https://all4pay-saas.vercel.app/**`; Site URL: `https://app.quattro.finance` | tela recarregada pelo dono |

⚠️ **A Site URL era `http://localhost:3000`.** Todo link de e-mail do Auth cujo
`redirectTo` não estivesse liberado caía ali — em produção, num endereço que
só existe na máquina de quem desenvolve. Agora cai no domínio oficial.

⚠️ **A ordem no Supabase importa:** primeiro as Redirect URLs, depois a Site
URL. O Auth só libera sem lista o host da própria Site URL; trocá-la antes
deixaria o endereço antigo recusado no meio do caminho.

## O que continua no endereço antigo, de propósito

`all4pay-saas.vercel.app` continua respondendo o mesmo deploy, e **não pode
ganhar "Redirect to"** na Vercel:

- o agendamento do Open Finance (pg_cron, migration `20260819180000`) chama
  `https://all4pay-saas.vercel.app/api/openfinance/sync` (`net.http_get`) — é
  chamada interna, ninguém vê o endereço, e assim ela não depende do DNS novo
  nem de um redirecionamento no meio;
- a guarda `no-ar` lê `/api/versao` por ele (trocável por `A4P_URL_VERSAO`);
- quem tem link antigo nos favoritos continua chegando.

A sessão vale por domínio: quem entrou pelo endereço antigo entra de novo no
novo.

## O localhost nas Redirect URLs — não é preciso para entrar

O login é por e-mail e senha (`signInWithPassword`) e **não passa por
redirecionamento** do Auth. Só dois caminhos usam `redirectTo`, ambos montados
pela origem da página: o "esqueci a senha" (`pedirRedefinicao` em
`lib/entrada`, que volta para `/api/auth/recuperar`) e o "Logar como" do
`/admin` (`api/admin/impersonate`). `http://localhost:3000/**` só faz falta
para testar esses dois rodando o sistema na própria máquina contra o banco de
produção — e o certo, nesse caso, é o banco local (`supabase start`).

## Pendências

- **Verificação do titular na Hostinger** até **21/10/2026** (15 dias do
  registro). Sem ela a Hostinger suspende o domínio e troca os nameservers —
  o sistema sai do ar em `app.quattro.finance`.
- **Renovação:** o `.finance` custa US$ 6,99 no primeiro ano e US$ 74,99/ano
  depois, com renovação automática ligada. Domínio vencido derruba o sistema.
- ~~"Esqueci a senha" não tem onde definir a senha nova~~ — **resolvido em
  07/10/2026** (achado ao mapear os `redirectTo`; defeito anterior ao domínio).
  O caminho e a prova estão na seção abaixo.

## "Esqueci a senha" — o caminho inteiro (07/10/2026)

O e-mail saía e o link voltava para `/login?code=…`, onde nada trocava o
código pela sessão: não havia tela de senha nova nem chamada a `updateUser`.

```
login ── pedirRedefinicao (lib/entrada) ──▶ e-mail
link ──▶ /api/auth/recuperar   troca o código pela sessão, NO SERVIDOR
         ├─ certo  ──▶ /redefinir-senha   senha nova + repetida → redefinirSenha
         └─ errado ──▶ /login?recuperacao=expirado | outro-navegador | invalido | falha
```

- **As regras moram num lugar só** (`core/recuperacao`): mínimo de senha (o
  mesmo do cadastro), os destinos, o motivo de cada falha e a frase dele.
- ⚠️ **A rota fica sob `/api`**, que o middleware já deixa passar sem sessão —
  nenhuma rota nova foi aberta no portão. A tela `/redefinir-senha` NÃO é
  pública: sem sessão, o middleware devolve ao login.
- ⚠️ **E uma sessão COMUM também não a abre** (achado da revisão adversarial).
  O middleware só pergunta se há sessão; quem estivesse diante do computador
  em que o dono deixou o sistema aberto trocaria a senha dele sem saber a
  atual — e a troca derruba as outras sessões do dono. A página confere NO
  SERVIDOR (`getClaims`, que verifica a assinatura) a marca `recovery` que o
  Auth põe na sessão vinda do link, com menos de 1 hora
  (`sessaoDeRecuperacaoValida`); sem ela, manda para `/`.
- **Já logado, a volta de um link fica no login.** O middleware mandava todo
  `/login` com sessão para a Home, e o motivo (`?recuperacao=`) ou o código
  (`?code=`) sumiam; agora só a volta de link é exceção.
- ⚠️ **Destino fixo e RELATIVO** (`Location: /redefinir-senha`, 303). Nada lê
  `?next=` (seria redirecionamento aberto), e o relativo existe porque, medido
  com `next start`, a origem absoluta saía `localhost` para quem abriu
  `127.0.0.1` — trocar de domínio no meio deixa para trás o cookie da sessão.
- ⚠️ **O link só vale no navegador que pediu.** É PKCE: a prova de que foi a
  mesma pessoa fica num cookie dele. Aberto noutro aparelho, a tela diz isso
  (motivo `outro-navegador`), em vez de mandar pedir outro link e repetir a
  falha.
- **Um `?code=` parado no login é encaminhado à rota** — os links enviados
  antes do conserto e a queda do Auth no endereço padrão.
- **Trocar a senha encerra as outras sessões.** Medido: o Auth já faz isso
  sozinho; a chamada `signOut({ scope: "others" })` é a segunda trava.
- **Entrar recarrega a página inteira** (`go` no login). O `router.push` +
  `router.refresh` deixava o endereço parado em `/login` com a Home na tela.

**Prova:** `npm run senha` (`scripts/redefinir-senha.mjs`) dirige o navegador
contra o Supabase LOCAL com o servidor de e-mail e abre o e-mail de verdade —
19 passos verdes; vermelha com o defeito original plantado (link para `/login`
sem encaminhamento) e com a página sem a conferência da sessão. Fica fora do
CI porque o CI sobe o Supabase sem o servidor de e-mail. As regras e as portas
únicas estão no bloco "ESQUECI A SENHA" do `engine-audit`, provado plantando
dez defeitos.

**Pendência registrada (revisão):** a confirmação de e-mail está desligada.
Se for religada, o link de confirmação de cadastro também cairia nesta rota
(o cadastro não passa `emailRedirectTo`, o Auth usa o endereço padrão e o
login encaminha o `?code=`) — dê ao cadastro a sua própria marca de volta
antes de religar.

⚠️ **O que só a produção responde:** o mínimo de senha do painel do Supabase
(o app supõe 6), se o modelo de e-mail "Reset password" foi personalizado, e o
SMTP — o padrão do Supabase é limitado e não entrega de forma confiável.
