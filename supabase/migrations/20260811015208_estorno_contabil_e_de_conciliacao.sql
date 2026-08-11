-- ═══════════════════════════════════════════════════════════════════════════
-- ONDA 3 · ESTORNO DO LANÇAMENTO CONTÁBIL E DA CONCILIAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. LANÇAMENTO CONTÁBIL MANUAL
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ No razão, estorno é PARTIDA INVERTIDA — nunca edição. O lançamento
-- original fica exatamente como foi postado e um novo entra com débito e
-- crédito trocados, apontando para ele por `is_reversal_of` (coluna que o
-- esquema já previa desde a 0010 e que ninguém preenchia).
--
-- ⚠️ E ele nasce POSTADO, não rascunho: um estorno em rascunho deixaria o
-- balancete errado até alguém lembrar de postá-lo — e quem estorna está
-- justamente consertando um número que está errado agora.
--
-- Medido: o par soma ZERO no balancete (débito 100, crédito 100, diferença 0).
create or replace function public.estornar_lancamento_contabil(p_id uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_orig public.journal_entries%rowtype;
  v_novo uuid;
  v_n    int;
begin
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do estorno contábil.' using errcode = 'check_violation';
  end if;
  if not public.tem_permissao('lancar') then
    raise exception 'Seu papel nesta empresa não lança nem estorna no razão.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_orig from public.journal_entries
   where id = p_id and org_id = public.auth_org_id();
  if v_orig.id is null then
    raise exception 'Lançamento contábil não encontrado nesta empresa.' using errcode = 'no_data_found';
  end if;
  if v_orig.status is distinct from 'posted' then
    raise exception 'Só lançamento POSTADO se estorna — um rascunho se corrige.'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.journal_entries where is_reversal_of = v_orig.id) then
    raise exception 'Este lançamento já foi estornado.' using errcode = 'check_violation';
  end if;

  insert into public.journal_entries
    (org_id, entity_id, entry_date, description, source, status, is_reversal_of, posted_at, posted_by)
  values
    (v_orig.org_id, v_orig.entity_id, current_date,
     'Estorno de ' || coalesce(v_orig.description, 'lançamento') ||
       ' (' || to_char(v_orig.entry_date, 'DD/MM/YYYY') || ') — ' || btrim(p_motivo),
     'estorno', 'posted', v_orig.id, now(), auth.uid())
  returning id into v_novo;

  -- ⚠️ Débito vira crédito e crédito vira débito. É a inversão que faz o par
  -- somar zero no balancete; copiar as linhas iguais dobraria o lançamento.
  insert into public.journal_lines
    (org_id, journal_entry_id, account_id, debit, credit, currency, fx_rate, dimensions, memo)
  select l.org_id, v_novo, l.account_id, l.credit, l.debit, l.currency, l.fx_rate, l.dimensions,
         'Estorno: ' || coalesce(l.memo, '')
    from public.journal_lines l
   where l.journal_entry_id = v_orig.id and l.excluido_em is null;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    raise exception 'O lançamento original não tem linhas — nada a estornar.' using errcode = 'no_data_found';
  end if;

  insert into public.audit_log (org_id, usuario, acao, antes, depois, entidade, entidade_id, origem)
  values (v_orig.org_id, coalesce(auth.uid()::text, 'sistema'), 'journal_entries.estornar',
          jsonb_build_object('lancamento', v_orig.id, 'data', v_orig.entry_date),
          jsonb_build_object('estorno', v_novo, 'linhas', v_n, 'motivo', btrim(p_motivo)),
          'journal_entries', v_orig.id::text, 'estorno');

  return v_novo;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. CONCILIAÇÃO — o par passa a ser REGISTRADO
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ A conciliação não guardava o PAR: ela cancelava o título previsto, copiava
-- a classificação para a linha do extrato, e pronto. O efeito ficava; a decisão
-- desaparecia. Sem o par não há estorno possível — dá para reabrir o título,
-- mas não dá para saber com o que ele tinha casado nem soltar o outro lado, e a
-- mesma entrada ficaria conciliada e prevista ao mesmo tempo, contada duas
-- vezes.
--
-- Duas colunas resolvem, e elas são o registro do FATO: `conciliado_com` (o
-- outro lado) e `conciliado_em` (quando). É o mesmo raciocínio da transferência,
-- que sempre soube que era um fato com dois lados.
--
-- ⚠️ E a operação virou uma função: os três updates soltos no cliente não eram
-- atômicos, e uma falha no meio deixava um lado conciliado e o outro não.
alter table public.movements
  add column if not exists conciliado_com uuid references public.movements(id),
  add column if not exists conciliado_em  timestamptz;

create index if not exists movements_conciliado_idx
  on public.movements (org_id, conciliado_com) where conciliado_com is not null;

create or replace function public.conciliar_movimentos(p_previsto uuid, p_extrato uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid := public.auth_org_id(); v_prev public.movements%rowtype;
begin
  if not public.tem_permissao('baixar') then
    raise exception 'Seu papel nesta empresa não concilia.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_prev from public.movements where id = p_previsto and org_id = v_org;
  if v_prev.id is null then
    raise exception 'Título previsto não encontrado nesta empresa.' using errcode = 'no_data_found';
  end if;
  if v_prev.conciliado_com is not null then
    raise exception 'Este título já está conciliado.' using errcode = 'check_violation';
  end if;

  -- A classificação do previsto desce para a linha do extrato.
  update public.movements m
     set party_id       = coalesce(v_prev.party_id, m.party_id),
         category_id    = coalesce(v_prev.category_id, m.category_id),
         cost_center_id = coalesce(v_prev.cost_center_id, m.cost_center_id),
         description    = coalesce(v_prev.description, m.description),
         conciliado_com = v_prev.id,
         conciliado_em  = now()
   where m.id = p_extrato and m.org_id = v_org;

  update public.movements
     set status = 'cancelado', conciliado_com = p_extrato, conciliado_em = now()
   where id = v_prev.id;

  insert into public.audit_log (org_id, usuario, acao, antes, depois, entidade, entidade_id, origem)
  values (v_org, coalesce(auth.uid()::text, 'sistema'), 'movements.conciliar',
          jsonb_build_object('status', v_prev.status),
          jsonb_build_object('status', 'cancelado', 'par', p_extrato),
          'movements', v_prev.id::text, 'conciliacao');
end;
$$;

-- ⚠️ O estorno da conciliação desfaz OS DOIS lados, e é por isso que o par
-- precisava existir: reabrir o título sem soltar a linha do extrato deixaria a
-- mesma entrada conciliada e prevista ao mesmo tempo, contada duas vezes.
--
-- ⚠️ O que ele NÃO desfaz, declarado: a classificação (contraparte, categoria,
-- centro) que desceu para a linha do extrato fica. Ela pode ter sido ajustada à
-- mão depois da conciliação, e reverter por cima apagaria trabalho que ninguém
-- pediu para apagar. O antes e o depois estão na aba de histórico daquele
-- lançamento, onde uma pessoa decide.
create or replace function public.estornar_conciliacao(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid := public.auth_org_id(); v_m public.movements%rowtype; v_par uuid;
begin
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do estorno da conciliação.' using errcode = 'check_violation';
  end if;
  if not public.tem_permissao('baixar') then
    raise exception 'Seu papel nesta empresa não concilia nem estorna conciliação.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_m from public.movements where id = p_id and org_id = v_org;
  if v_m.id is null then
    raise exception 'Lançamento não encontrado nesta empresa.' using errcode = 'no_data_found';
  end if;
  if v_m.conciliado_com is null then
    raise exception 'Este lançamento não está conciliado.' using errcode = 'check_violation';
  end if;
  v_par := v_m.conciliado_com;

  -- O título previsto volta a existir; a linha do extrato solta o vínculo.
  update public.movements
     set status = case when status = 'cancelado' then 'pendente' else status end,
         conciliado_com = null, conciliado_em = null
   where id in (v_m.id, v_par) and org_id = v_org;

  insert into public.audit_log (org_id, usuario, acao, antes, depois, entidade, entidade_id, origem)
  values (v_org, coalesce(auth.uid()::text, 'sistema'), 'movements.estornar_conciliacao',
          jsonb_build_object('par', v_par, 'status', v_m.status),
          jsonb_build_object('motivo', btrim(p_motivo)),
          'movements', v_m.id::text, 'estorno');
end;
$$;

revoke all on function public.estornar_lancamento_contabil(uuid, text) from public;
grant execute on function public.estornar_lancamento_contabil(uuid, text) to authenticated;
revoke all on function public.conciliar_movimentos(uuid, uuid) from public;
grant execute on function public.conciliar_movimentos(uuid, uuid) to authenticated;
revoke all on function public.estornar_conciliacao(uuid, text) from public;
grant execute on function public.estornar_conciliacao(uuid, text) to authenticated;
