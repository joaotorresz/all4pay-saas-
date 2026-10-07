# A saída fixa para a Pinbank: dois IPs, uma porta (07/10/2026)

A Pinbank libera em produção os IPs de onde **nós** chamamos a API dela (o dev
confirmou: "os dois IPs serão para o ambiente de produção, precisam ser IPs
fixos"). As funções da Vercel não têm IP fixo de saída. O Static IPs da própria
Vercel custa US$ 100/mês por projeto e só existe no Pro (par compartilhado com
outros clientes dela). O dono escolheu **dois servidores próprios na AWS**.

```
função da Vercel ── src/lib/pinbank/saida.ts ──┬─ servidor 1 (IP fixo 1) ─┐
   (sem IP fixo)     a ÚNICA porta             └─ servidor 2 (IP fixo 2) ─┴─▶ Pinbank (só libera os 2 IPs)
```

## A infraestrutura (`infra/saida-pinbank/`)

| O quê | Como |
| --- | --- |
| Servidores | 2 × Amazon Lightsail, **São Paulo** (`sa-east-1`), Ubuntu 24.04 LTS, plano de US$ 5/mês (IPv4 incluso), em **zonas diferentes** |
| IP fixo | Um **Static IP** do Lightsail por servidor. Grátis enquanto anexado. O endereço é do RECURSO, não da máquina: recriar o servidor e reanexar mantém o IP que a Pinbank liberou. ⚠️ **Nunca apagar os static IPs** (`ip-saida-1`/`ip-saida-2`). |
| Proxy | Squid só **CONNECT**, só porta **443**, só `*.pinbank.com.br` e `checkip.amazonaws.com` (o eco de IP do teste), só com **usuário e senha** (bcrypt). Todo o resto: 403/407. |
| Firewall | Entrada só TCP **31280** (de qualquer origem: a Vercel não tem IP fixo — por isso a senha é obrigatória) e SSH só pelo navegador do console. HTTP 80 apagado, IPv6 desligado. |
| Custo | US$ 10/mês os dois, sem impostos. |

`instalar.sh` roda uma vez em cada servidor, pelo **launch script** que
`gerar-launch-script.sh <1|2>` produz. As decisões dele, cada uma com o defeito
que evita:

- ⚠️ **Usuário e senha nascem NO SERVIDOR** (`openssl rand`) e moram em
  `/root/quattro-saida/credencial` (0600). Nunca passam por console, user-data,
  log ou chat. O usuário também é aleatório: com usuário previsível, qualquer um
  manda senha errada nele e enfileira o bcrypt (medido: o túnel legítimo foi de
  ~0 s para 1,2–4,8 s).
- ⚠️ **Só IPv4, em três camadas**: o domínio da Pinbank tem AAAA (Cloudflare), e
  o Squid poderia sair por IPv6 — a Pinbank veria um endereço que não liberou.
  O `sysctl` sozinho não sobrevive ao boot (o systemd-networkd reescreve o
  `disable_ipv6` da interface), então: (1) o **console** do Lightsail tira o
  IPv6 da instância — sem endereço da AWS não há rota IPv6; (2) o `sysctl` na
  instalação; (3) o serviço do Squid o **reaplica a cada partida** (drop-in),
  inclusive depois do reboot das atualizações. Sobrando IPv6 global, a
  instalação PARA e o `quattro-saida-url` avisa. `ipv6.disable=1` no GRUB foi
  descartado: mexer no boot de uma máquina que só se alcança pelo SSH do
  navegador troca "IPv6 que volta" por "servidor que pode não voltar".
- ⚠️ **O apt espera a trava das listas**: no primeiro boot o `apt-daily` do
  Ubuntu costuma estar rodando, e `DPkg::Lock::Timeout` não cobre a trava das
  LISTAS — `apt-get update` saía na hora com "Could not get lock" (medido). O
  instalador repete enquanto o motivo for trava, por até 10 minutos.
- ⚠️ **Temporários numa pasta privada que some inteira na saída**: a versão
  anterior perdia os nomes dentro de um subshell e deixava cópias da credencial
  em `/tmp` (medido: 12 arquivos em três rotações).
- ⚠️ **A senha é conferida ANTES da lista por endereço**: aquela lista faz o Squid
  resolver o nome, e antes da senha qualquer um faria o servidor consultar DNS.
- ⚠️ **O `squid.conf` do pacote NÃO é tocado**: ele é "conffile", e editá-lo faria
  o unattended-upgrades pular as correções de segurança do Squid em silêncio. A
  configuração mora em `/etc/squid/quattro-saida.conf`, apontada por drop-in.
- **Atualizações automáticas** com reinício em horas DIFERENTES (servidor 1
  04:10, servidor 2 04:40 de Brasília): os dois nunca caem juntos.
- ⚠️ **Nada de `set -x`**: a saída do launch script vai para o log do cloud-init.
- O **launch script** é sh POSIX (o Lightsail mistura conteúdo próprio no
  user-data e não documenta em que shell roda), **compactado** (o user-data tem
  teto de 16 KB; o script comentado tem 22 KB; compactado, ~12,7 KB) e
  **conferido por SHA-256**. ⚠️ **Colagem cortada em QUALQUER ponto diz "chegou
  CORTADO"**: o embrulho só define coisas até a última linha (a única que age),
  e quem decide é um `trap` de saída armado na segunda linha. Antes, um corte
  no meio do texto compactado morria num erro de sintaxe que ninguém associaria
  à colagem. O gerador é portável (Linux e macOS: `openssl` no lugar de
  `base64 -w`/`sha256sum`) e só escreve a saída no fim.
- `sudo quattro-saida-url` mede o IP de saída PASSANDO pelo próprio proxy e
  mostra o valor da variável da Vercel (`PINBANK_SAIDA_<n>`).

## O código

- **`src/lib/pinbank/saida.ts` é a ÚNICA porta.** `requisicaoPinbank` (a API,
  com credencial) **exige** os servidores: sem `PINBANK_SAIDA_<n>` ela recusa, e
  com elas **nunca sai direto** — se os dois falharem, a chamada falha (sair por
  um IP não liberado só trocaria o erro de lugar). `buscarPinbank` (GET simples)
  sai direto quando não há servidor configurado (local, preview, antes de
  ligar) e **diz** que saiu direto (`via: "direto"`).
- ⚠️ **A reserva direta é só para o que é PÚBLICO** (`PUBLICOS`, hoje só a chave
  do webhook, e só com `publico: true`): com os dois servidores fora — ou a
  variável ilegível —, a chave pública ainda vem direto, conferida pelo TLS de
  `pinbank.com.br` (`via: "direto-reserva"`, motivo no log). Sem ela, servidor
  fora por mais tempo que a fila de reenvio da Pinbank = webhook em 503 até ela
  desistir = venda perdida. Para qualquer outra URL, `publico` é recusado.
- ⚠️ **O túnel não come a reserva do envio** (`minEnvioMs`, 1 s): um túnel que
  abrisse no último instante mandaria o pedido com 1 ms de prazo, e "não saiu,
  repita" viraria "pode ter chegado".
- ⚠️ **A regra de troca de servidor é a FRONTEIRA DE FASE.** Fase 1 (TCP →
  CONNECT → TLS com a Pinbank): nada do pedido saiu, falha aqui tenta o outro
  servidor. Fase 2 (o pedido pelo túnel): **nunca se repete** — o pedido pode ter
  chegado, e repetir um POST de dinheiro pelo outro servidor pode duplicá-lo.
  Resposta 4xx/5xx da Pinbank é resposta, não falha de saída.
- ⚠️ **Sem `undici`, de propósito.** Medido: com o `ProxyAgent`, proxy fora, 407
  e conexão caída DEPOIS do envio chegam todos como `TypeError: fetch failed` —
  decidir a troca por texto de erro é casar substring. E o `ProxyAgent` de outra
  versão quebra o `fetch` do Node (Node 22 + undici 8). O cliente é
  `node:net`/`node:tls`/`node:https`, testado em Node 22 e 24.
- A **chave pública do webhook** passa pela porta (`buscarPinbank`). E o webhook
  ficou mais seguro no caminho: **chave que não vem é 503** (a Pinbank reenvia),
  nunca 401 (que ela não reenvia e perderia a venda). Antes, uma falha na busca
  durante a rotação de chave devolvia o cache velho → 401; e uma
  `PINBANK_WEBHOOK_JWKS` com JSON ilegível virava "nenhuma chave" → 401 em toda
  entrega. O motivo vai para o log, não para a resposta pública (ele cita o
  endereço dos servidores).
- ⚠️ **Busca que falha com o cache vencido usa a chave já conhecida (até 24 h)**
  — uma chave Ed25519 não estraga em uma hora; a hora é só a cadência de
  aprender chave nova. E o **401 só sai logo depois de uma busca BEM-SUCEDIDA
  na mesma chamada** que não trouxe o `kid`: rotação repetida em menos de 5 min
  é sempre 503. (Uma versão intermediária decidia o 401 comparando com a hora
  da assinatura — que vem do relógio da Pinbank, e a janela de ±5 min já admite
  que ele difere do nosso.)
- **`/api/admin/saida-fixa`** (só administrador da plataforma) prova, DE DENTRO
  da função da Vercel e com as variáveis de produção, o IP de saída de CADA
  servidor (sem troca: um fora aparece fora), e confere que o IP medido é o da
  própria variável. ⚠️ É rota nova — muda quem pode chamar o quê; o merge
  espera o OK do dono.

## As provas

- **`npm run saida-pinbank`** (no `npm test`): três proxies CONNECT de mentira
  (um por TLS), uma "Pinbank" HTTPS local com CA de teste e um impostor com
  certificado válido de OUTRO nome — 33 casos (troca na fase 1 por recusa,
  travamento, 407, certificado de outro nome e CA do proxy errada; quarentena;
  500 sem troca; queda e silêncio depois do envio sem repetição, no prazo
  total; túnel lento que não manda o pedido sem prazo; os dois fora sem saída
  direta; a reserva direta só para a chave pública; destino fora da lista;
  nenhuma mensagem, tentativa ou log com a senha ou o base64 dela) e **10
  defeitos plantados**, cada um derrubando o caso que o nomeia.
- **`engine-audit`, bloco `saida-fixa:`** — teto ZERO do endereço da Pinbank e de
  socket próprio fora da porta (inclusive em `supabase/functions`), fetch de URL
  vinda de variável nas pastas da Pinbank, rota que chega à porta em runtime
  Node, a lista de destinos do Squid IGUAL à da função, instalador sem `set -x`
  e com `bash -n`, os 503 do webhook (JSON ilegível, busca falhando na rotação,
  rotação repetida em menos de 5 min — sem rede: os servidores apontam para
  portas fechadas), a ordem dos portões da rota de prova e as variáveis no
  `.env.example`. Defeitos plantados em cada metade.
- **O instalador, num Ubuntu 24.04 do zero** (fora do CI: precisa de root e
  apt): 68 casos — recusas antes de instalar (sem servidor, senha-marcador,
  senha fraca), launch script pelo `dash`, colagem cortada (linhas faltando no
  meio, no fim, no meio de uma linha, sem a última linha, um caractere
  trocado), senha fora de todo log, nenhum temporário sobrando depois de duas
  execuções, idempotência, rotação (a senha velha morre na hora), o apt
  esperando a trava das listas presa por outro processo (com o defeito
  plantado: sem a espera, morre na hora) e a política do proxy (407 sem senha,
  403 fora da lista, em outra porta, por IP literal, para nome que resolve à
  rede interna e em GET simples). À parte, o launch script cortado em **1.085
  pontos**, no `dash` e no `bash`: todos dizem "chegou CORTADO", nenhum instala.

## Em produção (07/10/2026)

| Servidor | Zona | Static IP | IP de saída medido (`quattro-saida-url`) |
| --- | --- | --- | --- |
| `quattro-saida-1` | São Paulo A | `ip-saida-1` = **54.232.7.164** | 54.232.7.164 ✅ |
| `quattro-saida-2` | São Paulo B | `ip-saida-2` = **56.126.71.195** | 56.126.71.195 ✅ |

Enviados à Pinbank para liberação, junto com o webhook
`https://app.quattro.finance/api/pinbank/webhook`. Os IPs provisórios da
criação (18.229.132.246 e 56.125.1.154) sumiram ao anexar os static IPs e não
servem para nada.

- **O console de hoje não é o da documentação.** Não há a caixa "Restrict to IP
  address": o SSH 22 foi restrito removendo as origens "Anywhere" e mantendo o
  acesso pelo navegador — a linha aparece como **"Lightsail browser SSH only"**.
  O firewall é UM só para IPv4 e IPv6 (a documentação ainda descreve dois), e o
  IPv6 se desliga pelo botão **"Disable IPv6 networking"** da aba Networking.
  ⚠️ Nunca "Change networking type": vira IPv6-only, perde o IPv4 e solta o
  static IP (static IP não se anexa a instância IPv6-only).
- ⚠️ **O terminal não prova o IPv6 do console.** `ip -6 addr show scope global`
  vazio e a falta do "ATENÇÃO" no `quattro-saida-url` acontecem MESMO com o IPv6
  ligado no console, porque o `sysctl` do instalador já o desliga no sistema. E o
  `checkip.amazonaws.com` não tem AAAA (medido), então o IP medido prova só a
  saída IPv4 — a Pinbank tem AAAA. A prova da camada (1) é o console dizer
  "IPv6 networking is disabled"; é ela que segura o IPv6 depois de um boot,
  quando o netplan do primeiro boot (`dhcp6: true`) volta a pedir endereço.
- O `quattro-saida-url` testa pelo proxy LOCAL (`127.0.0.1`), então não
  atravessa o firewall do Lightsail: uma regra 31280 errada só aparece no
  `/api/admin/saida-fixa`. O reinício automático não é diário — só quando uma
  atualização o pede, no horário de cada servidor.

## O que NÃO está provado aqui, e onde se prova

- **A instância Lightsail de verdade** — systemd, o IPv6 desligado pelo `sysctl`
  (o contêiner de teste não tem IPv6) e o IP fixo. Prova-se com
  `sudo quattro-saida-url` em cada servidor e, de ponta a ponta, com
  `/api/admin/saida-fixa` em produção.
- **A API da Pinbank em si** (OAuth2 + AES, `ExtratoPos`): o cliente ainda não
  existe e as credenciais não chegaram. Quando chegar, ele chama
  `requisicaoPinbank` — nunca outra porta.

## Riscos aceitos, declarados

- **A senha do proxy vai em texto no trecho Vercel → servidor** (proxy HTTP com
  autenticação básica, como Fixie e QuotaGuard fazem). O conteúdo para a Pinbank
  continua TLS ponta a ponta dentro do túnel, e quem pegasse a senha só abriria
  túnel para `*.pinbank.com.br:443` a partir dos nossos IPs — ainda sem a
  credencial OAuth2/AES. A troca para TLS até o proxy está pronta no cliente
  (`https://` + `PINBANK_SAIDA_CA`) e testada; no servidor é trocar `http_port`
  por `https_port` com um certificado — fazer se a Pinbank ou uma auditoria
  pedir cifra em todo trecho, ou ao primeiro sinal de vazamento.
- **A Pinbank está atrás da Cloudflare**: com a senha, alguém poderia abrir túnel
  para o IP dela e pedir OUTRO site da Cloudflare por dentro (domain fronting),
  saindo pelos nossos IPs. Exige a senha; mitigado por senha e usuário
  aleatórios e por servidor.
- **O servidor não guarda dado** e se refaz do script em minutos: sem snapshot
  automático. O que precisa de proteção é o **Static IP** (nunca apagar).
