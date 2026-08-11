-- ⚠️ TERCEIRO ACHADO DA MESMA VARREDURA: nem todo `id` deste schema é `uuid`.
-- `financial_rules.id` é `text`, e o `union all` da lixeira quebrou:
--
--   ERROR: 42804: UNION types uuid and text cannot be matched
--
-- Poderia ter excluído a tabela e seguido com `uuid`. Seria esconder o
-- problema: a próxima entidade com chave textual quebraria a lixeira de novo, e
-- o sintoma apareceria como "a lixeira não abre".
--
-- A API passa a falar IDENTIFICADOR em `text` — que é exatamente o que
-- `audit_log.entidade_id` já faz, e pela mesma razão. As duas superfícies que
-- endereçam "um registro qualquer de uma tabela qualquer" agora falam o mesmo
-- tipo, o que é o que permite ligar a lixeira à trilha sem conversão.
--
-- ⚠️ É esta migration que CRIA as três funções na forma final. As versões com
-- `uuid` viveram minutos e não sobrevivem a um banco reconstruído do zero — os
-- `drop ... if exists` abaixo existem só para o banco que já as tinha.

drop function if exists public.excluir_logico(text, uuid, text);
drop function if exists public.restaurar_logico(text, uuid);
drop function if exists public.lixeira_listar(int);

create function public.excluir_logico(
  p_entidade text, p_id text, p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid := public.auth_org_id(); n int;
begin
  if not public.tem_permissao('lancar') then
    raise exception 'Seu papel nesta empresa não exclui registros.' using errcode = 'insufficient_privilege';
  end if;
  -- ⚠️ O nome da tabela vem de fora e entra em SQL dinâmico. Sem esta
  -- conferência contra o catálogo, o parâmetro seria injeção pronta.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname = p_entidade
       and exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'excluido_em' and not a.attisdropped)
  ) then
    raise exception 'Entidade % não aceita exclusão lógica.', p_entidade using errcode = 'undefined_table';
  end if;

  execute format(
    'update public.%I set excluido_em = now(), excluido_por = $1, excluido_motivo = $3
      where id::text = $2 and org_id = $4 and excluido_em is null', p_entidade)
    using auth.uid(), p_id, nullif(btrim(coalesce(p_motivo, '')), ''), v_org;
  get diagnostics n = row_count;

  if n = 0 then
    raise exception 'Registro não encontrado nesta empresa, ou já estava na lixeira.' using errcode = 'no_data_found';
  end if;
end;
$$;

create function public.lixeira_listar(p_dias int default 90)
returns table(
  entidade text, id text, excluido_em timestamptz,
  excluido_por uuid, excluido_por_email text, motivo text, resumo text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record; v_org uuid := public.auth_org_id(); v_sql text; v_partes text[] := '{}';
begin
  if v_org is null then return; end if;
  for r in
    select c.relname::text as t, c.oid
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'excluido_em' and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'r'
       and exists (select 1 from pg_attribute b
                    where b.attrelid = c.oid and b.attname = 'id' and not b.attisdropped)
     order by c.relname
  loop
    -- ⚠️ O "resumo" tenta `description` e depois `name`: sem ele a lixeira
    -- lista identificadores, e ninguém reconhece o que apagou por um uuid.
    v_partes := v_partes || format(
      'select %L::text, t.id::text, t.excluido_em, t.excluido_por, t.excluido_motivo,
              coalesce(%s, %s, %L)::text
         from public.%I t
        where t.org_id = %L and t.excluido_em is not null
          and t.excluido_em > now() - make_interval(days => %s)',
      r.t,
      case when exists (select 1 from pg_attribute a where a.attrelid=r.oid and a.attname='description' and not a.attisdropped)
           then 't.description' else 'null' end,
      case when exists (select 1 from pg_attribute a where a.attrelid=r.oid and a.attname='name' and not a.attisdropped)
           then 't.name' else 'null' end,
      r.t, r.t, v_org, greatest(1, coalesce(p_dias, 90))
    );
  end loop;

  if array_length(v_partes, 1) is null then return; end if;
  v_sql := array_to_string(v_partes, ' union all ');

  return query execute format(
    'select x.entidade, x.id, x.excluido_em, x.excluido_por, u.email::text, x.motivo, x.resumo
       from (%s) as x(entidade, id, excluido_em, excluido_por, motivo, resumo)
       left join auth.users u on u.id = x.excluido_por
      order by x.excluido_em desc', v_sql);
end;
$$;

create function public.restaurar_logico(p_entidade text, p_id text)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.auth_org_id();
  v_em timestamptz; n int; total int := 0; f record;
begin
  if not public.tem_permissao('lancar') then
    raise exception 'Seu papel nesta empresa não restaura registros.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relkind='r' and c.relname = p_entidade
       and exists (select 1 from pg_attribute a
                    where a.attrelid=c.oid and a.attname='excluido_em' and not a.attisdropped)
  ) then
    raise exception 'Entidade % não tem lixeira.', p_entidade using errcode = 'undefined_table';
  end if;

  execute format('select excluido_em from public.%I where id::text = $1 and org_id = $2', p_entidade)
    into v_em using p_id, v_org;
  if v_em is null then
    raise exception 'Registro não está na lixeira desta empresa.' using errcode = 'no_data_found';
  end if;

  execute format(
    'update public.%I set excluido_em = null, excluido_por = null, excluido_motivo = null
      where id::text = $1 and org_id = $2', p_entidade) using p_id, v_org;
  get diagnostics n = row_count;
  total := n;

  -- ⚠️ A restauração REPÕE OS VÍNCULOS: os filhos que foram para a lixeira NO
  -- MESMO INSTANTE voltam junto. Os que já estavam lá antes seguem lá, porque
  -- foram excluídos por outra decisão — trazê-los de volta seria desfazer algo
  -- que ninguém pediu para desfazer.
  for f in
    select tf.relname::text as filho, af.attname::text as coluna
      from pg_constraint con
      join pg_class tf on tf.oid = con.conrelid
      join pg_class tp on tp.oid = con.confrelid
      join pg_namespace n on n.oid = tf.relnamespace
      join pg_attribute af on af.attrelid = tf.oid and af.attnum = con.conkey[1]
     where con.contype = 'f' and n.nspname = 'public'
       and tp.relname = p_entidade and array_length(con.conkey, 1) = 1
       and exists (select 1 from pg_attribute a
                    where a.attrelid = tf.oid and a.attname = 'excluido_em' and not a.attisdropped)
  loop
    execute format(
      'update public.%I set excluido_em = null, excluido_por = null, excluido_motivo = null
        where %I::text = $1 and org_id = $2 and excluido_em = $3', f.filho, f.coluna)
      using p_id, v_org, v_em;
    get diagnostics n = row_count;
    total := total + n;
  end loop;

  insert into public.audit_log (org_id, usuario, acao, antes, depois, entidade, entidade_id, origem)
  values (v_org, coalesce(auth.uid()::text, 'sistema'), p_entidade || '.restaurar',
          jsonb_build_object('excluido_em', v_em), jsonb_build_object('restaurado', total),
          p_entidade, p_id, 'lixeira');

  return total;
end;
$$;

revoke all on function public.excluir_logico(text, text, text) from public;
grant execute on function public.excluir_logico(text, text, text) to authenticated;
revoke all on function public.lixeira_listar(int) from public;
grant execute on function public.lixeira_listar(int) to authenticated;
revoke all on function public.restaurar_logico(text, text) from public;
grant execute on function public.restaurar_logico(text, text) to authenticated;
