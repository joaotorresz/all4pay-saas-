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
pela origem da página: o "esqueci a senha" (`login/page.tsx`) e o "Logar como"
do `/admin` (`api/admin/impersonate`). `http://localhost:3000/**` só faz falta
para testar esses dois rodando o sistema na própria máquina contra o banco de
produção — e o certo, nesse caso, é o banco local (`supabase start`).

## Pendências

- **Verificação do titular na Hostinger** até **21/10/2026** (15 dias do
  registro). Sem ela a Hostinger suspende o domínio e troca os nameservers —
  o sistema sai do ar em `app.quattro.finance`.
- **Renovação:** o `.finance` custa US$ 6,99 no primeiro ano e US$ 74,99/ano
  depois, com renovação automática ligada. Domínio vencido derruba o sistema.
- ⚠️ **"Esqueci a senha" não tem onde definir a senha nova** (achado em
  07/10/2026, ao mapear os `redirectTo`). O e-mail sai e o link volta para a
  tela de login, mas nenhum código do app trata a recuperação: nada escuta o
  evento `PASSWORD_RECOVERY`, nada chama `updateUser`, e não há tela de nova
  senha. Defeito anterior ao domínio; independe dele.
