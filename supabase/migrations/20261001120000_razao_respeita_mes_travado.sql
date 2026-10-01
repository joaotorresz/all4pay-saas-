-- ═══════════════════════════════════════════════════════════════════════════
-- O RAZÃO RESPEITA O MÊS TRAVADO (Rodada 4, 01/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `check_period_open()` só olhava `journal_entries.period_id` — e NENHUM
-- escritor o preenche. Medido em produção: 354 de 354 lançamentos contábeis
-- com `period_id` nulo. A trava existia, rodava em todo INSERT/UPDATE e não
-- podia falhar: travar o mês pela RPC `fechar_periodo` não impedia postar
-- nem estornar no razão daquele mês. É a família do `resíduo = x − x`.
--
-- Agora o período é resolvido pela DATA do lançamento (org + mês de
-- `entry_date`) quando `period_id` vem nulo — a mesma chave que
-- `fechar_periodo` usa. O estorno contábil (`estornar_lancamento_contabil`)
-- nasce com `entry_date = current_date`, então com o mês corrente travado ele
-- é recusado com o motivo, em vez de entrar calado.
--
-- Sem backfill de `period_id`: a resolução por data cobre o acervo inteiro.
create or replace function public.check_period_open()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare st text;
begin
  if new.status is distinct from 'posted' then
    return new;
  end if;
  if new.period_id is not null then
    select status into st from public.accounting_periods where id = new.period_id;
  else
    select status into st from public.accounting_periods
     where org_id = new.org_id
       and date_trunc('month', period) = date_trunc('month', new.entry_date)
       and excluido_em is null
     order by (status in ('closed','locked')) desc
     limit 1;
  end if;
  if st in ('closed','locked') then
    raise exception 'O mês de % está travado: não é possível postar nem estornar nele. Reabra o mês (com motivo) ou lance no mês aberto.',
      to_char(new.entry_date, 'MM/YYYY')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
