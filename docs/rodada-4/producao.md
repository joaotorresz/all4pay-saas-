# Rodada 4 — Produção de verdade (01/10/2026)

## Passo 1 — prova de carga dos dois robôs (7ª regra)

| Robô | Primeiro disparo | Idempotência | Defeito achado |
| --- | --- | --- | --- |
| `/api/recorrencias/run` | 21 títulos novos (R$ 122.407,65) em 3 empresas; 3 já existiam | insert real 2× em banco local: 2ª passada 0 novas (23505) | recorrência na LIXEIRA seguia gerando fatura (lixeira não desliga `active`); título sem `especie`/`competence_date` |
| `/api/financial-os/run` | 0 mensagens: 0 automações ligadas em 22 empresas | provada por `scripts/automacoes.sql` no CI | — |

Em produção: 0 execuções dos dois na trilha até hoje.

## Passo 2 — defeitos de produção

1. **Central gravava na empresa do primeiro vínculo** (`central/acoes.ts`,
   `lib/central.ts`). O título ia para a empresa mais antiga e o papel/teto era
   lido de lá. Agora o insert não manda `org_id` (padrão `auth_org_id()`) e o
   papel vem de `minhas_organizacoes` (`ativa`). Guarda `org-ativa`, teto ZERO.
2. **Travar o mês não travava o razão.** `check_period_open` só olhava
   `period_id`, nulo em 354/354 lançamentos. Migration `20261001120000`
   resolve o mês pela data. Provada em banco local: travado recusa, aberto
   passa, rascunho passa; sem a migration nada recusa. Guarda `razao-trava`.
3. **Fatura na lixeira travava a reativação.** O índice único `rec:%` via a
   lixeira: reativar devolvia 23505 em cada data pausada e a fatura nunca
   voltava. Migration `20261001130000` (índice só entre vivas). Provada: reativar
   recria; segunda viva na mesma data continua recusada. Guarda `rec-lixeira`.
4. **Depreciação em dobro — DIAGNÓSTICO, sem conserto.** Estrutural: a compra
   do bem entra no razão como despesa operacional cheia e o cronograma lança a
   depreciação por cima. **Medido: 0 casos em produção** (o único cronograma,
   R$ 3.000, não tem a compra lançada). O conserto certo — a compra ligada ao
   cronograma vira ATIVO (imobilizado/despesa antecipada) — é decisão contábil
   do dono.
5. **Venda da maquininha não virava venda.** Gerava títulos e nenhum documento
   (fora da lista, das notas e do imposto). Agora `vendaDaMaquininha` +
   `salvarVendaComTitulos`: o documento nasce com o bruto e a taxa MDR, cada
   título leva `sale_doc_id`, e a recusa desfaz o documento. Guardas
   `vender/pos`.

## Passo 3 — o DRE diz quando classifica por palpite

`Relatorio.porPalpite` (ids que entraram por palavra-chave, sem linha
declarada) + `palpiteDoRelatorio` (quantos, quanto e as categorias que mais
pesam). A tela do DRE mostra o aviso com o link para declarar no plano de
contas. Nenhuma soma muda — o aviso só torna o palpite visível. Guarda `t7`
no `engine-audit`, provada contando tudo como palpite.

## Passo 4 — funções novas, prontas e DESLIGADAS (decisão do dono, 01/10)

### Aprovar título pelo WhatsApp (`WHATSAPP_APROVACAO=ligado` liga)
- Uma porta só: o "SIM" faz o MESMO `update situacao → confirmado` da Central,
  como o aprovador — o gatilho `central_maquina` decide segregação, permissão e
  alçada e carimba `confirmado_por`.
- Código de 6 caracteres, guardado só como SHA-256, uso único, 24 h, preso ao
  telefone. `responder_aprovacao_whatsapp` só executa com a chave de serviço;
  a rota confere a assinatura da Twilio antes de tocar no banco.
- Envio simulado (sem Twilio) é RECUSADO, nunca relatado como enviado.
- Pendência: o pedido sai em texto livre; fora da janela de 24 h da Twilio
  precisa de template aprovado.
- Guardas: `scripts/aprovacao-whatsapp.sql` (7 casos, CI) + bloco `wa:`.

### Caixa de entrada de contas a pagar por e-mail (`CAIXA_EMAIL=ligado` liga)
- O e-mail vira um ITEM da caixa de entrada que já existe (`email:<id>`), nunca
  uma conta: "criar conta" abre o mesmo formulário preenchido.
- Morada própria (`caixa_email_mensagens`, anexos no bucket privado
  `caixa-email`); o webhook não escreve no `org_state`.
- Endereço `contas+<token>@<domínio>` por empresa, gerado/rotacionado só por
  quem administra; reenvio do provedor não duplica (Message-ID único).
- Valor/vencimento só são preenchidos quando o texto traz linha digitável com
  dígito verificador válido; senão ficam vazios ("valor não informado").
- Pendências: domínio e provedor (Postmark inbound) a configurar; anexos XML
  não são lidos; a tela mostra só a contagem de anexos.
- Guardas: `scripts/caixa-email.sql` (8 casos, CI) + bloco `caixa-email`.

As quatro migrations da rodada (120000, 130000, 140000, 150000) aplicam em
sequência num banco limpo sem erro, e as duas guardas de banco ficam verdes
sobre o banco combinado.
