# O segundo fator da conta: o aplicativo autenticador (07/10/2026)

## Por quê

A conta de administrador da plataforma **exige** segundo fator: `platform_admins.exige_mfa`, conferido por `admin_veredito` pelo `aal` do token. O prazo para cadastrar (`mfa_prazo`) venceu em **03/09/2026**. O app não tinha tela para cadastrar o aplicativo nem passo para digitar o código. Desde então, o administrador ficou fora do `/admin` inteiro, sem como cumprir a regra. A função que adia o prazo (`admin_definir_prazo_mfa`) também exige o acesso que estava travado.

Em 07/10/2026, com autorização do dono, o prazo foi para **06/11/2026**. Foi um UPDATE único em produção, ensaiado antes em transação desfeita e registrado em `admin_audit` com o motivo por extenso. Este pacote constrói o que faltava dentro desse prazo.

> **Decisão tomada e não executada volta como defeito em produção** (CLAUDE.md). A exigência foi decidida sem o executor, e o executor é este pacote.

## O caminho

```
entrar com a senha ──▶ sessão aal1
  ├─ sem aplicativo ──▶ o sistema (nada muda para quem não cadastrou)
  └─ com aplicativo ──▶ /segundo-fator ── código certo ──▶ aal2 ──▶ destino FIXO
                                                                  ├─ veio do "esqueci a senha" → /redefinir-senha
                                                                  └─ o resto → /
```

| Peça | Onde |
| --- | --- |
| Regras puras (código, quem precisa, destino, nome do aparelho, lista) | `src/core/segundo-fator` |
| A **porta única** do `auth.mfa.*` | `src/lib/entrada.ts` (mesma porta da senha) |
| Quem precisa do código | `exigeCodigo` em `src/lib/supabase/middleware.ts` |
| O desvio | `src/middleware.ts`, antes do perímetro da plataforma |
| O passo do código | `/segundo-fator` (`SegundoFatorEntradaView`) |
| Cadastrar, ver e remover | `/configuracoes/seguranca`, "Segurança da conta" (⋮ da barra, ⌘K, aviso na Segurança da plataforma) |
| O campo de 6 dígitos | `CampoCodigo` em `src/components/ui` (primitivo do DS) |

## As decisões, com o motivo

- **Quem decide é o middleware, pelo `user.factors` que o `getUser` acabou de trazer do servidor.** A cópia do usuário guardada no cookie não sabe de um aplicativo cadastrado noutro aparelho depois da entrada. Decidir por ela deixaria passar com a senha só. O nível sai do próprio token, sem rede.
- **Falha fechada.** Com aplicativo cadastrado, um nível que não pôde ser lido pede o código, como `ehDonoDaPlataforma`.
- **Sem laço.** Quem já está em aal2 nunca é mandado ao código. Quem não precisa dele e abre `/segundo-fator` vai ao início, e a tela nunca pede um código que não existe.
- **Antes do perímetro da plataforma.** Sem isso, o administrador com aplicativo veria "área exclusiva do administrador", a frase errada, em vez do pedido do código.
- **`/api` fica fora do desvio.** As rotas respondem JSON, a rota de retorno do "esqueci a senha" troca o código sem sessão, e quem recusa o administrador sem o código é o banco.
- **O token renovado vai junto no desvio.** Um redirecionamento que perde o cookie novo faria o navegador reapresentar o token antigo, já trocado.
- **Destino fixo, decidido pela sessão** (`destinoDepoisDoCodigo`). Um `?next=` seria redirecionamento aberto com sessão.
- **O cadastro apaga os abandonados antes.** Medido: um cadastro não confirmado com o mesmo nome trava o próximo (`mfa_factor_name_conflict`, inclusive com o nome vazio). Cada aparelho ganha um nome único (`nomeDoNovoAparelho`).
- **`issuer: MARCA`.** Sem ele, o aplicativo da pessoa mostra o endereço do site no lugar de "Quattro".
- **Mais de um aparelho vale.** O código de qualquer aparelho cadastrado entra. O segundo aparelho é a reserva recomendada na tela.
- **A chave aparece uma vez.** Só durante o cadastro, sem log, sem armazenamento do navegador, sem `reportar` e sem atributo de acessibilidade. O exemplo da documentação do Supabase põe o endereço com a chave no `alt` da imagem; não copiar.
- **O QR é desenhado pela casa** (`lib/qrcode`, cores da paleta, rótulo próprio de acessibilidade). Não usamos o SVG que o Supabase devolve, que vem em preto puro, fora do sistema e invisível para a guarda da paleta. Endereço longo demais para o QR cai na chave manual.
- **Remover não promete desfazer.** `AcaoDestrutiva` ganhou `desfaz={false}`, e a confirmação diz "Esta ação não pode ser desfeita.". A promessa de "8 segundos" era incondicional, e a chave morre com o cadastro.
- **Confirmar o aplicativo encerra as outras sessões da conta** (comportamento do Auth). A tela avisa antes.

## Medido no Auth local (GoTrue v2.197)

- Trocar a senha **sem o código** (aal1) com aplicativo cadastrado dá `insufficient_aal`. Por isso o "esqueci a senha" de quem tem aplicativo passa pelo código antes da tela da senha nova. Depois do código, a marca da recuperação continua na sessão (`amr`), e o destino fixo leva de volta a `/redefinir-senha`.
- Remover um aplicativo verificado **sem o código** dá `insufficient_aal`. Quem só tem a senha não desliga a proteção.
- O mesmo código, num desafio novo dentro da mesma janela de 30 s, é **aceito**. Nenhuma asserção afirma "código já usado é recusado".

## Guardas

- **`engine-audit`, bloco `segundo-fator:`**, com defeito plantado em cada guarda:
  - as regras puras;
  - o **teto ZERO** do `auth.mfa.*` fora de `lib/entrada` (o nível só pode ser lido também no middleware);
  - a ordem do middleware: antes do perímetro e do plano, fora de `/api`, sem laço, com o token renovado;
  - "tem aplicativo" decidido pelo usuário fresco, e a leitura que falha pede o código;
  - o cadastro limpo e com a marca;
  - o destino que sai da sessão e nunca da URL;
  - a chave que não vaza;
  - as telas sem rede na montagem;
  - o texto sem "TOTP/MFA/aal";
  - a remoção que não promete desfazer;
  - o login que passa pelo código.

  A prova de que o bloco roda: três defeitos plantados no código de verdade (o laço, o cadastro sem a marca, a regra sem o aal2) deram três reprovações nomeadas.
- **`npm run segundo-fator -- --api`** (CI, job `isolamento`): é o primeiro passo daquele job a falar com o Auth, um arreio novo. Prova que o `config.toml` commitado liga o aplicativo e que o código certo sobe para aal2. Prova também que o banco recusa o administrador que entrou só com a senha, com o motivo exato. Por fim, que trocar a senha ou remover o aplicativo sem o código é recusado. O gerador de código da prova se confere contra as âncoras literais da RFC 6238 antes de medir qualquer coisa.
- **`npm run segundo-fator`**: a jornada no navegador contra o build real, fora do CI. Cobre:
  - cadastro com QR e chave;
  - cadastro abandonado e retomado;
  - código errado e código certo;
  - sessão de outro aparelho que não entra só com a senha;
  - a entrada pelo passo do código, sem laço;
  - o administrador levado ao código antes da recusa;
  - remover e voltar à entrada de um passo;
  - nenhum erro de página.

## O que NÃO está resolvido, declarado

- ⚠️ **O segundo fator protege as TELAS e a área administrativa, não a API de dados.** Nenhuma das políticas de linha olha o `aal`. Uma sessão aal1, aberta com a senha roubada direto contra o Supabase, ainda lê e escreve o que a política da empresa permite. Só o portão da plataforma (`admin_veredito`) exige aal2. Para valer em tudo, é preciso uma política **restritiva** que exija aal2 de quem tem aplicativo cadastrado: decisão do dono e migration à parte, com prova de banco.
- **Sem o celular e sem segundo aparelho, só o suporte destrava** (`auth.admin.mfa.deleteFactor` com a chave de serviço, depois de conferir a identidade). O Supabase não tem código de reserva. A tela recomenda cadastrar um segundo aparelho.
- **Personificar ("logar como") um dono que tenha aplicativo para no passo do código.** O link de acesso abre sessão aal1. É o comportamento correto para uma conta protegida, mas muda quem pode chamar o quê, e o dono decide no merge.
- **Produção:** o Supabase hospedado liga o aplicativo autenticador por padrão, mas **conferir no painel** (Authentication → Multi-Factor) antes de depender disso. O `config.toml` só vale para o Supabase local e o do CI.
