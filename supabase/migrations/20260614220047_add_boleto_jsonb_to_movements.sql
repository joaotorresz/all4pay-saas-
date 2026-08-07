-- Onda 1.3 — Boleto: anexa o boleto ao recebível, sem tabela nova e sem poluir
-- a espinha com 6 colunas. nullable, sem default = metadata-only (instantâneo, sem lock).
alter table public.movements add column if not exists boleto jsonb;

comment on column public.movements.boleto is
  'Boleto do recebível (RECEBER/Onda 1.3). Estrutura: {status, nosso_numero, '
  'linha_digitavel, conta_recebimento, multa, juros, desconto, instrucoes, '
  'emitido_em, paid_date}. Null em movements sem boleto (todas as saidas e '
  'recebiveis nao-boleto).';