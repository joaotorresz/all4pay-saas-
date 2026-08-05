alter table public.recurrences
  add column if not exists itens jsonb not null default '[]'::jsonb;