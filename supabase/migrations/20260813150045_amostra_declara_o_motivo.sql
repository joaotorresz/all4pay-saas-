-- ═══════════════════════════════════════════════════════════════════════════
-- A AMOSTRA DECLARA O MOTIVO — `sample_reason` separa duas coisas diferentes
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **`is_sample` estava significando duas coisas.** A migration anterior
-- (`20260813141626`) marcou, com a mesma flag:
--
--   1. **458 lançamentos que vieram do botão "Carregar amostra"** — dado de
--      demonstração de verdade, gerado por `core/fdip/sample.ts`, reconhecível
--      por regra;
--   2. **1 lançamento manual de R$ 500.000 com descrição "Teste"** — lixo de
--      teste que nenhuma regra de procedência alcança, marcado À MÃO pelo id.
--
-- São situações com destinos DIFERENTES, e é isso que torna a distinção
-- necessária e não cosmética: a amostra se purga em lote sem pensar duas vezes
-- (não é dado de ninguém); o lançamento de teste é um registro que EXISTIU na
-- operação de uma empresa e cujo desfecho correto é ser cancelado com trilha,
-- não sumir. Com uma flag só, a purga levaria os dois pelo mesmo caminho.

create type public.sample_reason as enum ('onboarding_demo', 'lancamento_teste');

alter table public.movements        add column if not exists sample_reason public.sample_reason;
alter table public.movement_splits  add column if not exists sample_reason public.sample_reason;
alter table public.sales_docs       add column if not exists sample_reason public.sample_reason;
alter table public.sale_items       add column if not exists sample_reason public.sample_reason;
alter table public.recurrences      add column if not exists sample_reason public.sample_reason;

comment on column public.movements.sample_reason is
  'Por que a linha esta marcada: onboarding_demo (veio do botao "Carregar amostra") ou lancamento_teste (lixo de teste marcado por id). Preenchido se e somente se is_sample.';

-- ⚠️ **A restrição é BICONDICIONAL, de propósito.** "Marcado sem motivo" faria
-- a coluna nova nascer opcional na prática e reproduziria o problema que ela
-- veio resolver — com a diferença de que agora haveria um campo dizendo que o
-- problema estava resolvido. E "motivo sem marca" é a linha que o filtro NÃO
-- esconde mas que alguém acha que está escondida, que é pior.
--
-- `not valid` primeiro e `validate` no fim: a checagem só vale depois do
-- preenchimento abaixo, senão o próprio `alter` recusaria as 459 linhas que
-- ainda não têm motivo.
alter table public.movements add constraint movements_sample_reason_ck
  check ((is_sample and sample_reason is not null) or (not is_sample and sample_reason is null))
  not valid;

-- ⚠️ **A ordem importa:** o caso NOMEADO primeiro, o caso por REGRA depois.
-- Invertendo, o `where sample_reason is null` do segundo comando alcançaria o
-- R$ 500.000 e o etiquetaria como demonstração — apagando exatamente a
-- distinção que esta migration existe para criar.
update public.movements set sample_reason = 'lancamento_teste'
 where id = '1a333df9-308f-4a19-b604-ad162f0e604e' and is_sample;

update public.movements set sample_reason = 'onboarding_demo'
 where is_sample and sample_reason is null;

-- O rateio herda o motivo do lançamento que ele reparte.
update public.movement_splits s set sample_reason = m.sample_reason
  from public.movements m where s.movement_id = m.id and s.is_sample;

alter table public.movements validate constraint movements_sample_reason_ck;

-- ---------------------------------------------------------------------------
-- ⚠️ DÍVIDA TÉCNICA DECLARADA — `lancamento_teste` é PROVISÓRIO
-- ---------------------------------------------------------------------------
--
-- Origem: prompt **P-01** (isolamento do dado de amostra, 13/08/2026).
-- Vence com: prompt **P-10** (Central Financeira).
--
-- `lancamento_teste` existe porque hoje não há onde pôr um lançamento que
-- aconteceu e não vale. Quando a Central Financeira tiver o estado
-- **Cancelado** de primeira classe, o R$ 500.000 passa a ser um lançamento
-- CANCELADO — com autor, data e motivo — e sai desta flag.
--
-- ⚠️ **Por que não esperar por P-10 e deixá-lo no DRE até lá:** ele é a receita
-- INTEIRA de junho/2026 daquela organização (R$ 500.000 → zero quando marcado).
-- Um número errado que se sabe errado não fica na tela esperando a refatoração
-- certa chegar.
--
-- ⚠️ **Por que não usar `is_sample` sozinho e resolver depois:** porque a purga
-- em lote apagaria o registro em vez de cancelá-lo, e aí não haveria mais o que
-- migrar para o estado Cancelado — a decisão de P-10 seria tomada por omissão.
--
-- Ao fazer P-10: converter a linha para Cancelado, limpar `is_sample` e
-- `sample_reason`, e REMOVER o valor `lancamento_teste` do enum. Se o enum
-- ainda tiver esse valor depois de P-10, esta dívida não foi paga — ela só
-- mudou de lugar. A guarda `amostra:` (scripts/consistencia.mts) cobra a
-- referência a este comentário.
