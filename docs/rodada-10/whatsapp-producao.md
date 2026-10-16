# WhatsApp em produção — autorização, SAIR e templates da Meta

Etapa 5 das automações (15/10/2026). Três peças: o cliente só recebe com
autorização registrada, quem responde SAIR para de receber, e os textos que
saem fora da janela de 24 horas são templates aprovados pela Meta.

## 1. Autorização do cliente (decisão do dono, 15/10/2026)

- Cliente **sem autorização registrada não recebe WhatsApp**. A cobrança dele
  segue pelo e-mail do cadastro; sem e-mail, ele aparece na lista de pulados
  com o motivo.
- A empresa registra em **Cadastros › Clientes**: "Registrar autorização de
  WhatsApp" (em lote, com "Marcar todos") ou na linha do cliente. A
  **evidência** é obrigatória (10 a 500 letras: como o cliente autorizou) e vai
  para a trilha. Revogar fica na mesma linha.
- Quem pode: os papéis que lançam, dão baixa ou administram
  (`whatsapp_autorizar` recusa o leitor e o contador externo).
- Banco: `whatsapp_autorizacoes` (por empresa, só leitura para a sessão) e a
  migration `20261016130000_whatsapp_autorizacao_saida`.

## 2. SAIR e VOLTAR

- Quem responde **SAIR** (ou PARAR, PARE, STOP, CANCELAR, DESCADASTRAR, "NÃO
  QUERO MAIS") ao número da plataforma **para de receber de todas as
  empresas**: o número é um só, e é dele que a pessoa pediu para não ouvir.
  **VOLTAR** desfaz. A empresa não desfaz um SAIR.
- Só a mensagem inteira conta: "vou sair mais cedo" não cala ninguém
  (`core/whatsapp/saida`).
- O SAIR é atendido **sempre**, mesmo com a aprovação por WhatsApp desligada.
- Todo executor pergunta quem saiu antes de despachar; se a pergunta falhar,
  **nenhum WhatsApp sai** naquela leva (o e-mail segue).

### Configurar na Twilio (dono)

1. Console da Twilio › Messaging › Senders › o número de WhatsApp.
2. Em "A message comes in", Webhook, método **POST**:
   `https://app.quattro.finance/api/whatsapp/entrada`
3. Se o endereço antigo (`/api/whatsapp/aprovacao`) já estiver lá, pode ficar:
   ele é a mesma porta. Trocar para `/entrada` é só organização.
4. `TWILIO_AUTH_TOKEN` precisa estar na Vercel (Production): sem ele a entrada
   responde 503, porque não há como conferir que a mensagem veio da Twilio.

⚠️ Mudança de comportamento: antes, sem `WHATSAPP_APROVACAO=ligado`,
`/api/whatsapp/aprovacao` respondia 503 a tudo. Agora, com a assinatura da
Twilio conferida, ela registra o SAIR/VOLTAR e responde o texto padrão.

## 3. Templates para a Meta aprovar

Fora da janela de 24 horas (a pessoa não escreveu para o número no último dia)
a Meta só entrega **template aprovado**. Sem o SID configurado, a mensagem sai
como texto livre e a Meta a recusa fora da janela.

**Como criar cada um (dono):**

1. Console da Twilio › Messaging › Content Template Builder › Create new.
2. Nome (o da tabela), idioma **Portuguese (BR)**, tipo **Text**.
3. Colar o corpo exatamente como abaixo (as variáveis são `{{1}}`, `{{2}}`…).
4. Preencher os exemplos das variáveis (a Meta exige) e enviar para aprovação
   como **Utility** (cobrança e aviso de conta são utilidade, não marketing).
5. Aprovado, copiar o SID (`HX…`) para a variável da Vercel indicada.
6. Novo deploy (variável de ambiente só vale no deploy seguinte).

⚠️ Os templates de cobrança levam a linha do SAIR no corpo: com template, o
texto que o sistema monta não é usado, e o rodapé tem de estar no próprio
template.

### Cobrança (variáveis: 1 cliente · 2 credor · 3 valor · 4 vencimento · 5 dias de atraso)

**`quattro_cobranca_lembrete`** → `TWILIO_TEMPLATE_COBRANCA_LEMBRETE_SID`

```
Olá, {{1}}. Aqui é {{2}}. Lembramos que o pagamento de {{3}} vence em {{4}}. Se já pagou, desconsidere esta mensagem.

Para não receber mais mensagens por aqui, responda SAIR.
```
Exemplos: Maria Souza · Padaria Aurora Ltda (CNPJ 12.345.678/0001-95) · R$1.250,00 · 20/10/2026 · 0

**`quattro_cobranca_atraso`** → `TWILIO_TEMPLATE_COBRANCA_ATRASO_SID`

```
Olá, {{1}}. Aqui é {{2}}. Não identificamos o pagamento de {{3}}, vencido em {{4}} ({{5}} dias). Pode nos confirmar a previsão? Se já pagou, desconsidere esta mensagem.

Para não receber mais mensagens por aqui, responda SAIR.
```

**`quattro_cobranca_formal`** → `TWILIO_TEMPLATE_COBRANCA_FORMAL_SID`

```
Prezado(a) {{1}}, {{2}} informa que consta em aberto o valor de {{3}}, vencido em {{4}} ({{5}} dias). Solicitamos a regularização. Se já pagou, desconsidere esta mensagem.

Para não receber mais mensagens por aqui, responda SAIR.
```

### Avisos para a própria empresa (variável 1 = o texto curto, numa linha)

| Nome | Variável da Vercel | Corpo |
| --- | --- | --- |
| `quattro_resumo` | `TWILIO_TEMPLATE_RESUMO_SID` | `Resumo do dia na Quattro: {{1}}` |
| `quattro_lembrete_pagar` | `TWILIO_TEMPLATE_LEMBRETE_PAGAR_SID` | `Contas a pagar na Quattro: {{1}}` |
| `quattro_alerta_caixa` | `TWILIO_TEMPLATE_ALERTA_SID` | `Alerta de caixa na Quattro: {{1}}` |
| `quattro_fechamento` | `TWILIO_TEMPLATE_FECHAMENTO_SID` | `Fechamento do mês na Quattro: {{1}}` |

### Fluxos montados pela Quattro AI (variáveis: 1 título · 2 resumo curto)

**`quattro_fluxo`** → `TWILIO_TEMPLATE_FLUXO_SID`

```
{{1}}

{{2}}

Para não receber mais mensagens por aqui, responda SAIR.
```
Exemplo: "Contas a pagar da semana" · "6 contas, R$18.400,00 no total; a maior vence na quarta."

## 4. Ordem para ligar em produção

1. Merge do PR (o job `migrar` aplica a migration).
2. Webhook da Twilio apontando para `/api/whatsapp/entrada` (seção 2).
3. Templates aprovados e SIDs na Vercel (seção 3), depois um deploy.
4. Registrar a autorização dos clientes que já autorizaram (seção 1).
5. Testar com o próprio celular: receber uma cobrança, responder SAIR, conferir
   que a seguinte não chega; responder VOLTAR.

Guardas: `scripts/whatsapp-autorizacao.sql` (CI, cinco casos) e os blocos
`aut-wa:`, `wa:` e `wa-saida:` do `engine-audit`, cada um provado plantando o
defeito.
