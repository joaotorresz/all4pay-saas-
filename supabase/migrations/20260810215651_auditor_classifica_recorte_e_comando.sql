-- ONDA 2 · O AUDITOR PARA DE CASAR STRING
--
-- rls_auditoria() decidia "tem política por empresa" com
--   pg_get_expr(polqual) like '%auth_org_id()%'
-- e por isso acusava organization_members e user_active_org — recortadas por
-- user_id = auth.uid(), que é MAIS ESTREITO que por empresa, e com política só
-- de SELECT (escrita negada pelo padrão do PostgreSQL). Duas tabelas fechadas
-- reportadas como abertas, num painel de segurança. Guarda que grita lobo
-- treina quem a lê a ignorá-la.
--
-- Agora ela responde DUAS coisas que a string não sabia: COMO o acesso é
-- recortado, e POR QUAL COMANDO — porque uma política de ALL e uma de
-- só-SELECT não protegem a mesma coisa, e `with check` não cobre exclusão.
--
-- O drop é necessário (o tipo de retorno muda) e é seguro: migration roda em
-- transação, então não existe instante em que a função não exista. As colunas
-- antigas foram MANTIDAS para o app publicado continuar lendo enquanto o
-- deploy novo não sai.

drop function if exists public.rls_auditoria();

create or replace function public._recorte(expr text)
returns text
language sql
immutable
as $$
  select case
    when expr is null                              then 'sem condição'
    when expr ilike '%auth_org_id()%'              then 'empresa'
    when expr ilike '%organization_members%'       then 'vínculo'
    when expr ilike '%auth.uid()%'                 then 'usuário'
    when expr ilike '%is_platform_admin%'
      or expr ilike '%admin_veredito%'             then 'administrador'
    when expr ilike '%tem_permissao%'              then 'papel'
    when btrim(lower(expr)) = 'true'               then 'ABERTO'
    when btrim(lower(expr)) = 'false'              then 'fechado'
    else 'outro'
  end;
$$;

create function public.rls_auditoria()
returns table(
  tabela text,
  rls_ligada boolean,
  politicas integer,
  tem_org_id boolean,
  politica_por_org boolean,
  recorte text,
  comandos jsonb,
  privilegios jsonb,
  alcanca_anonimo boolean,
  anon_pode_truncar boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with t as (
    select c.oid, c.relname::text as nome, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  ),
  -- Uma política com polcmd '*' vale para os quatro comandos; as demais valem
  -- só para o seu. Sem esta expansão, "tem política" esconde qual verbo ficou
  -- sem cobertura — que é justamente a pergunta.
  pol as (
    select p.polrelid, p.polpermissive,
           unnest(case p.polcmd
                    when '*' then array['select','insert','update','delete']
                    when 'r' then array['select']
                    when 'a' then array['insert']
                    when 'w' then array['update']
                    when 'd' then array['delete']
                    else array['select'] end) as cmd,
           public._recorte(coalesce(pg_get_expr(p.polqual, p.polrelid),
                                    pg_get_expr(p.polwithcheck, p.polrelid))) as recorte
      from pg_policy p
  )
  select
    t.nome,
    t.rls,
    (select count(*)::int from pg_policy p where p.polrelid = t.oid),
    exists (select 1 from pg_attribute a
             where a.attrelid = t.oid and a.attname = 'org_id' and not a.attisdropped),
    exists (select 1 from pol where pol.polrelid = t.oid and pol.recorte = 'empresa'),
    coalesce((
      select string_agg(distinct pol.recorte, ' · ' order by pol.recorte)
        from pol where pol.polrelid = t.oid and pol.polpermissive
    ), 'nega tudo'),
    -- Por comando: o recorte das políticas PERMISSIVAS que o cobrem. Sem
    -- nenhuma, o padrão do PostgreSQL é negar — e "negado por ausência" é uma
    -- proteção legítima que precisa aparecer com esse nome.
    (select jsonb_object_agg(c.cmd, coalesce((
        select string_agg(distinct pol.recorte, ' · ' order by pol.recorte)
          from pol where pol.polrelid = t.oid and pol.polpermissive and pol.cmd = c.cmd
      ), 'nenhuma'))
      from unnest(array['select','insert','update','delete']) as c(cmd)),
    -- O que o papel do cliente pode SEQUER tentar. Uma tabela sem concessão
    -- está fechada por privilégio, que é mais duro que fechada por política —
    -- e sem esta coluna o auditor não distingue as duas.
    jsonb_build_object(
      'select', has_table_privilege('authenticated', t.oid, 'SELECT'),
      'insert', has_table_privilege('authenticated', t.oid, 'INSERT'),
      'update', has_table_privilege('authenticated', t.oid, 'UPDATE'),
      'delete', has_table_privilege('authenticated', t.oid, 'DELETE')
    ),
    exists (select 1 from pg_policy p where p.polrelid = t.oid
             and (p.polroles = '{0}'::oid[]
                  or exists (select 1 from pg_roles r
                              where r.oid = any (p.polroles) and r.rolname = 'anon'))),
    has_table_privilege('anon', t.oid, 'TRUNCATE')
  from t
  order by t.nome;
$$;

revoke all on function public.rls_auditoria() from public;
grant execute on function public.rls_auditoria() to authenticated;
revoke all on function public._recorte(text) from public;
grant execute on function public._recorte(text) to authenticated;
