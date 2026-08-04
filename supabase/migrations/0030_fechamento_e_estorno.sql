-- ═══════════════════════════════════════════════════════════════════════════
-- ONDA 13 — MÊS FECHADO É IMUTÁVEL (no banco, não no aviso)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ O fechamento existia e não fechava nada. `isPeriodLocked` era lido no
-- render de uma tabela — um AVISO na tela, que qualquer outro caminho de
-- escrita ignora: a importação em lote, a baixa em lote, a recorrência que
-- projeta faturas, a API, o próprio PostgREST com o endereço na mão. O mês
-- "fechado" continuava aceitando lançamento retroativo, e o contador descobria
-- no mês seguinte, quando o balancete não batia com o que ele já tinha
-- entregue.
--
-- Isto é a mesma lição da ONDA 9 aplicada à contabilidade: **quem tranca é o
-- servidor**. A tela pode explicar; ela não pode ser a fechadura.
--
-- E a regra não é "proibir": é **exigir ESTORNO RASTREADO**. Proibir sem saída
-- faz o operador reabrir o mês, lançar e fechar de novo — o que produz
-- exatamente o buraco que o fechamento existe para impedir, agora sem rastro.
-- Com estorno, a correção acontece no mês ABERTO, apontando para o lançamento
-- original: o histórico do mês fechado permanece, e a diferença fica explicada.

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. O QUE É UM ESTORNO
 * ═══════════════════════════════════════════════════════════════════════════ */

alter table public.movements add column if not exists estorno_de uuid references public.movements(id);
alter table public.movements add column if not exists estorno_motivo text;
alter table public.movements add column if not exists estornado_em timestamptz;

create index if not exists movements_estorno_de_idx on public.movements (estorno_de) where estorno_de is not null;

comment on column public.movements.estorno_de is
  'Aponta para o lançamento que este estorna. Preenchido só por estornar_lancamento().';

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. O PERÍODO FECHADO
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ `accounting_periods` já existia (0010) e guardava `status`. O que faltava
 * era alguém CONSULTAR isso do lado do banco.
 */
create or replace function public.periodo_fechado(p_data date, p_org uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.accounting_periods ap
     where ap.org_id = coalesce(p_org, public.auth_org_id())
       and ap.status = 'locked'
       -- ⚠️ `period` é DATE (o primeiro dia do mês), não texto. Comparar com
       -- `to_char` casaria string com data e nunca daria verdadeiro — o
       -- bloqueio existiria e não bloquearia nada, que é o defeito de origem
       -- com outra roupa.
       and date_trunc('month', ap.period) = date_trunc('month', p_data)
  );
$$;
revoke execute on function public.periodo_fechado(date, uuid) from public, anon;
grant execute on function public.periodo_fechado(date, uuid) to authenticated;

/* ---------------------------------------------------------------------------
 * O GATILHO — a fechadura de verdade.
 *
 * ⚠️ A data que decide é a de **COMPETÊNCIA** (`due_date`), não a de caixa: o
 * fechamento contábil fecha um mês de competência, e um pagamento feito hoje de
 * um título de competência antiga pertence ao mês antigo. Usar `paid_date`
 * deixaria passar exatamente o lançamento que desarruma o balancete entregue.
 *
 * O estorno é a ÚNICA exceção, e ele não entra no mês fechado: ele entra no mês
 * aberto apontando para lá. Por isso a exceção aqui é para o lançamento que
 * ESTORNA (tem `estorno_de`), não para o mês fechado.
 * ------------------------------------------------------------------------- */
create or replace function public.movements_periodo_fechado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data date;
  v_org  uuid;
begin
  if (tg_op = 'DELETE') then
    v_data := old.due_date; v_org := old.org_id;
  else
    v_data := new.due_date; v_org := new.org_id;
  end if;

  if v_data is null then return coalesce(new, old); end if;
  if not public.periodo_fechado(v_data, v_org) then return coalesce(new, old); end if;

  -- Um estorno PODE referenciar o mês fechado, mas a linha dele fica no mês
  -- aberto; se chegou aqui com data de mês fechado, é lançamento comum.
  if (tg_op <> 'DELETE') and new.estorno_de is not null then
    return new;
  end if;

  -- Marcar o ORIGINAL como estornado é permitido: é o outro lado do estorno, e
  -- sem isso o rastro fica só de um lado.
  if (tg_op = 'UPDATE')
     and old.estornado_em is null and new.estornado_em is not null
     and new.amount = old.amount and new.due_date = old.due_date and new.type = old.type then
    return new;
  end if;

  raise exception
    'O mês % está fechado. Lançamento retroativo exige ESTORNO rastreado: use estornar_lancamento() para registrar a correção no mês aberto.',
    to_char(v_data, 'MM/YYYY')
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists movements_periodo_fechado_trg on public.movements;
create trigger movements_periodo_fechado_trg
  before insert or update or delete on public.movements
  for each row execute function public.movements_periodo_fechado();

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. O ESTORNO RASTREADO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ O estorno é um lançamento NOVO, de sinal oposto, no mês ABERTO. Ele não
 * apaga nem edita o original — apagar é o que faz o balancete entregue deixar
 * de existir. O original ganha só o carimbo de que foi estornado, e os dois
 * ficam ligados pelo `estorno_de`.
 */
create or replace function public.estornar_lancamento(p_id uuid, p_motivo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_orig public.movements%rowtype;
  v_novo uuid;
  v_hoje date := current_date;
begin
  if coalesce(trim(p_motivo), '') = '' then
    -- Estorno sem motivo é um lançamento a menos e uma pergunta a mais para
    -- quem audita: "por que este valor sumiu do mês?".
    raise exception 'Informe o motivo do estorno.';
  end if;
  if not public.tem_permissao('lancar') then
    raise exception 'Seu papel nesta organização não lança nem estorna.';
  end if;

  select * into v_orig from public.movements where id = p_id;
  if v_orig.id is null then raise exception 'Lançamento não encontrado.'; end if;
  if v_orig.estornado_em is not null then raise exception 'Este lançamento já foi estornado.'; end if;
  if public.periodo_fechado(v_hoje, v_orig.org_id) then
    raise exception 'O mês corrente também está fechado — reabra-o para registrar o estorno.';
  end if;

  insert into public.movements (
    org_id, account_id, type, status, amount, due_date, paid_date,
    party_id, category, description, estorno_de, estorno_motivo
  ) values (
    v_orig.org_id, v_orig.account_id,
    -- Sinal oposto: o estorno de uma entrada é uma saída.
    case when v_orig.type = 'entrada' then 'saida' else 'entrada' end,
    v_orig.status, v_orig.amount, v_hoje,
    case when v_orig.paid_date is null then null else v_hoje end,
    v_orig.party_id, v_orig.category,
    'Estorno de ' || coalesce(v_orig.description, 'lançamento') || ' (' || to_char(v_orig.due_date, 'DD/MM/YYYY') || ')',
    v_orig.id, p_motivo
  ) returning id into v_novo;

  update public.movements set estornado_em = now() where id = v_orig.id;

  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (
    v_orig.org_id, coalesce(auth.uid()::text, 'sistema'), 'lancamento.estornar',
    jsonb_build_object('id', v_orig.id, 'valor', v_orig.amount, 'competencia', v_orig.due_date),
    jsonb_build_object('estorno', v_novo, 'motivo', p_motivo, 'competencia', v_hoje)
  );
  return v_novo;
end;
$$;
revoke execute on function public.estornar_lancamento(uuid, text) from public, anon;
grant execute on function public.estornar_lancamento(uuid, text) to authenticated;

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. FECHAR E REABRIR — com registro dos dois lados
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ REABRIR é a operação perigosa, não fechar. Ela desfaz uma entrega já feita
 * ao contador, e por isso exige o papel de fechamento, um MOTIVO, e deixa
 * rastro — sem isso, "reabrir, lançar e fechar de novo" vira o caminho normal e
 * o fechamento não significa nada.
 */
create or replace function public.fechar_periodo(p_mes text, p_fechar boolean, p_motivo text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_org uuid := public.auth_org_id(); v_id uuid;
begin
  if not public.tem_permissao('fechar') then
    raise exception 'Seu papel nesta organização não fecha período.';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then raise exception 'Mês inválido (use AAAA-MM).'; end if;
  if not p_fechar and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Reabrir um mês fechado exige motivo.';
  end if;

  select id into v_id from public.accounting_periods
   where org_id = v_org and date_trunc('month', period) = (p_mes || '-01')::date limit 1;

  if v_id is null then
    insert into public.accounting_periods (org_id, period, status, closed_at, closed_by)
    values (v_org, (p_mes || '-01')::date, case when p_fechar then 'locked' else 'open' end,
            case when p_fechar then now() end, auth.uid());
  else
    update public.accounting_periods
       set status = case when p_fechar then 'locked' else 'open' end,
           closed_at = case when p_fechar then now() else null end,
           closed_by = case when p_fechar then auth.uid() else null end
     where id = v_id;
  end if;

  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (
    v_org, coalesce(auth.uid()::text, 'sistema'),
    case when p_fechar then 'periodo.fechar' else 'periodo.REABRIR' end,
    jsonb_build_object('mes', p_mes),
    jsonb_build_object('mes', p_mes, 'motivo', p_motivo)
  );
end;
$$;
revoke execute on function public.fechar_periodo(text, boolean, text) from public, anon;
grant execute on function public.fechar_periodo(text, boolean, text) to authenticated;

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. O CONTADOR EXTERNO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ Ele NÃO é um administrador com outro nome. O contador externo precisa ler
 * tudo, exportar e fechar o período — e não pode lançar, aprovar pagamento nem
 * administrar usuários. Dar-lhe o papel de admin "porque é mais fácil" é o que
 * põe um terceiro, fora da empresa, com poder de mover dinheiro.
 *
 * `fechar` sem `lancar` é a combinação que define a função: ele responde pelo
 * resultado do mês, não pelos lançamentos que o formam.
 */
alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('owner','admin','member','leitor','lancador','aprovador','fechador','contador_externo'));

delete from public.role_permissions where papel = 'contador_externo';
insert into public.role_permissions (papel, acao) values
  ('contador_externo','ler'),
  ('contador_externo','exportar'),
  ('contador_externo','fechar');
