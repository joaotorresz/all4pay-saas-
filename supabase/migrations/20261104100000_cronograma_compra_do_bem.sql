-- ═══════════════════════════════════════════════════════════════════════════
-- O CRONOGRAMA SABE QUAL COMPRA ELE DEPRECIA — `schedules.movement_id`
-- (04/11/2026, Fase 3.4 do plano)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A depreciação em dobro (risco declarado na Rodada 4): a compra do bem entrava
-- no razão como despesa cheia e o cronograma lançava a depreciação por cima.
-- Um notebook de R$ 18.000 virava R$ 36.000 de despesa ao fim da vida útil.
--
-- O conserto: o cronograma aponta a COMPRA (o lançamento de saída que pagou o
-- bem). O razão lê esse vínculo e leva a compra ao ATIVO (imobilizado ou
-- despesa antecipada); a despesa passa a ser só a parcela mensal.
--
-- ⚠️ O BANCO RECUSA o que dobraria de outro jeito:
--   · uma compra ligada a dois cronogramas vivos (seria depreciada duas vezes);
--   · um vínculo com lançamento de outra empresa ou que não é saída.
-- `movement_id` nulo quer dizer "o bem já existia antes do sistema": não há
-- compra no razão para levar ao ativo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.schedules
  add column if not exists movement_id uuid references public.movements(id) on delete set null;

comment on column public.schedules.movement_id is
  'A compra (lançamento de saída) que este cronograma deprecia ou amortiza. O razão leva essa compra ao ativo em vez da despesa. Nulo: o bem é anterior ao sistema.';

create unique index if not exists schedules_uma_compra_por_cronograma
  on public.schedules (org_id, movement_id)
  where movement_id is not null and excluido_em is null;

create or replace function public.schedules_confere_compra()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
  v_tipo text;
begin
  if new.movement_id is null then
    return new;
  end if;
  select m.org_id, m.type::text into v_org, v_tipo
    from public.movements m where m.id = new.movement_id;
  if v_org is distinct from new.org_id then
    raise exception 'A compra ligada ao cronograma não é desta empresa.'
      using errcode = '23514';
  end if;
  if v_tipo <> 'saida' then
    raise exception 'O cronograma só pode ser ligado a um lançamento de saída (a compra do bem).'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.schedules_confere_compra() from public, anon, authenticated;

drop trigger if exists schedules_confere_compra on public.schedules;
create trigger schedules_confere_compra
  before insert or update of movement_id, org_id on public.schedules
  for each row execute function public.schedules_confere_compra();
