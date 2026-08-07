-- 0023 — Idempotência da ingestão no BANCO, não só no app.
--
-- A chave determinística (conta · data · valor · sinal · descritivo
-- normalizado) é calculada em `core/ingestao`. Guardá-la aqui, com índice
-- ÚNICO, é o que transforma "o app tenta não duplicar" em "o banco não deixa".
-- Um bug no cliente, duas abas abertas ou um retry de rede param no índice.

alter table public.movements
  add column if not exists chave text,
  -- ⚠️ O descritivo BRUTO em campo PRÓPRIO. `description` é editável pelo
  -- usuário e `category` é uma classificação nossa; nenhum dos dois serve de
  -- evidência de origem. Este não é sobrescrito por ninguém.
  add column if not exists descritivo_bruto text,
  add column if not exists origem text;

-- ⚠️ ÚNICO POR ORGANIZAÇÃO, e apenas onde a chave existe (`where chave is not
-- null`): o histórico anterior à ONDA 2 não tem chave, e um índice único sobre
-- NULLs impediria qualquer inserção legada de conviver com a nova.
create unique index if not exists movements_org_chave_unique
  on public.movements (org_id, chave)
  where chave is not null;

create index if not exists movements_origem_idx
  on public.movements (org_id, origem)
  where origem is not null;

comment on column public.movements.chave is
  'Chave de idempotência da ingestão (core/ingestao.chaveIdempotencia): sha256 de conta|data|centavos|tipo|descritivo normalizado. Única por org.';
comment on column public.movements.descritivo_bruto is
  'Descritivo original da origem, preservado. Nunca sobrescrito pela normalização nem pela categoria.';