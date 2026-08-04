-- ═══════════════════════════════════════════════════════════════════════════
-- ONDA 9 (parte 1) — ISOLAMENTO GARANTIDO PELO BANCO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A auditoria formal da política de acesso por linha encontrou QUATRO defeitos.
-- Os três primeiros não vazam dado hoje; o quarto apaga o produto inteiro.
--
--  1. ⚠️ **`anon` pode TRUNCATE em 57 das 59 tabelas** — e a política de acesso
--     por linha NÃO cobre TRUNCATE. Isto foi verificado, não deduzido: numa
--     tabela de teste com RLS ligada e política `using (false)` para `anon`, o
--     `truncate` executado como `anon` levou 2 linhas a 0 sem erro nenhum. A
--     chave `anon` viaja no pacote do navegador, então ela é pública por
--     construção. Uma linha de SQL apagaria `movements` de TODAS as
--     organizações, e nenhuma política teria sido violada no caminho.
--  2. ⚠️ **`auth_org_id()` devolvia "a organização mais ANTIGA"** do usuário.
--     Toda a RLS pende dessa função, então multiempresa não existia de fato:
--     quem entra numa segunda empresa continua vendo a primeira, sem escolha e
--     sem aviso.
--  3. ⚠️ **O plano vinha de OUTRA organização.** `meu_plano()` escolhia a
--     assinatura mais favorável entre TODAS as organizações do usuário
--     (`order by status active/trial desc limit 1`) enquanto `auth_org_id()`
--     escolhia a mais antiga. Um membro de uma empresa Pro operava numa empresa
--     Simples **com direitos de Pro**. O portão existia e mirava a fechadura
--     errada.
--  4. Políticas declaradas para `public` (que inclui `anon`) em vez de
--     `authenticated`, e seis tabelas com a mesma política duplicada.
--
-- O que esta migration faz: fecha o buraco de privilégio, torna a organização
-- ativa uma ESCOLHA validada contra o vínculo, amarra o plano à organização em
-- uso, e entrega o teste de leitura cruzada que qualquer usuário pode rodar em
-- produção.

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. PRIVILÉGIO — o que a política de linha não alcança
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ `TRUNCATE`, `TRIGGER` e `REFERENCES` não são operações de LINHA, e por
 * isso nenhuma política as filtra. Contra elas só existe uma defesa: não
 * conceder. `TRIGGER` deixaria pendurar um gatilho numa tabela alheia;
 * `REFERENCES` deixaria criar chave estrangeira para descobrir o que existe do
 * outro lado por tentativa e erro.
 */
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

/* ⚠️ `anon` não tem nenhuma tabela para acessar — o pouco que a sessão anônima
 * precisa (registrar o acesso a um endereço antigo) passa por função
 * `SECURITY DEFINER`, que não depende de concessão na tabela. Manter as
 * concessões porque "a RLS segura" é apostar o produto numa única camada. */
revoke all on all tables in schema public from anon;

/* E as tabelas do FUTURO. Sem isto, a próxima tabela criada nasce com o mesmo
 * privilégio, e o defeito volta em silêncio — que é como ele chegou aqui. */
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;
alter default privileges in schema public revoke all on tables from anon;
do $$
begin
  -- O papel que cria as tabelas pode variar por ambiente; o que não pode é a
  -- concessão voltar sem ninguém ver.
  execute 'alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from authenticated';
  execute 'alter default privileges for role postgres in schema public revoke all on tables from anon';
exception when others then
  raise notice 'privilégios padrão do papel postgres não ajustados: %', sqlerrm;
end $$;

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. A ORGANIZAÇÃO ATIVA — uma ESCOLHA, validada contra o vínculo
 * ═══════════════════════════════════════════════════════════════════════════ */

create table if not exists public.user_active_org (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  trocada_em timestamptz not null default now()
);

alter table public.user_active_org enable row level security;

drop policy if exists user_active_org_dono on public.user_active_org;
create policy user_active_org_dono on public.user_active_org
  for select to authenticated using (user_id = auth.uid());

/* ⚠️ Só leitura pela tabela. A ESCRITA passa obrigatoriamente por
 * `trocar_organizacao()`, que confere o vínculo: um `update` direto aqui seria
 * o caminho mais curto para se declarar membro de qualquer empresa. */
revoke all on public.user_active_org from anon, authenticated;
grant select on public.user_active_org to authenticated;

/* ---------------------------------------------------------------------------
 * `auth_org_id()` — a função de que TODA a RLS depende.
 *
 * ⚠️ Ela nunca pode devolver uma organização de que o usuário não é membro. Por
 * isso a escolha é lida com JOIN no vínculo: se a pessoa foi removida da
 * empresa que estava usando, a linha de escolha continua lá e o JOIN não casa —
 * a função cai no vínculo mais antigo em vez de continuar entregando dados da
 * empresa que ela deixou.
 *
 * O `coalesce` também é a compatibilidade: sem nenhuma escolha registrada, o
 * comportamento é exatamente o anterior, e nenhum usuário existente muda de
 * organização por causa desta migration.
 * ------------------------------------------------------------------------- */
create or replace function public.auth_org_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select a.org_id
       from public.user_active_org a
       join public.organization_members om
         on om.user_id = a.user_id and om.org_id = a.org_id
      where a.user_id = auth.uid()),
    (select om.org_id
       from public.organization_members om
      where om.user_id = auth.uid()
      order by om.created_at
      limit 1)
  );
$$;

/* A troca. Validada, registrada e idempotente. */
create or replace function public.trocar_organizacao(p_org uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_anterior uuid;
begin
  if not exists (
    select 1 from public.organization_members
     where user_id = auth.uid() and org_id = p_org
  ) then
    -- ⚠️ A mensagem não diz se a organização EXISTE. Distinguir "não existe" de
    -- "existe e você não entra" entrega um oráculo para descobrir empresas.
    raise exception 'Organização indisponível para este usuário.';
  end if;

  select org_id into v_anterior from public.user_active_org where user_id = auth.uid();

  insert into public.user_active_org (user_id, org_id, trocada_em)
  values (auth.uid(), p_org, now())
  on conflict (user_id) do update set org_id = excluded.org_id, trocada_em = now();

  -- ⚠️ Trocar de empresa é trocar de universo de dados; sem registro, uma
  -- consulta feita "na empresa errada" não tem como ser explicada depois.
  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (
    p_org,
    coalesce(auth.uid()::text, 'sistema'),
    'organizacao.trocar',
    case when v_anterior is null then null else jsonb_build_object('org_id', v_anterior) end,
    jsonb_build_object('org_id', p_org)
  );

  return p_org;
end;
$$;

revoke execute on function public.trocar_organizacao(uuid) from public, anon;
grant execute on function public.trocar_organizacao(uuid) to authenticated;

/* As organizações de que sou membro — a lista do seletor. */
create or replace function public.minhas_organizacoes()
returns table (org_id uuid, nome text, papel text, ativa boolean, desde timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, om.role, o.id = public.auth_org_id(), om.created_at
    from public.organization_members om
    join public.organizations o on o.id = om.org_id
   where om.user_id = auth.uid()
   order by om.created_at;
$$;

revoke execute on function public.minhas_organizacoes() from public, anon;
grant execute on function public.minhas_organizacoes() to authenticated;

/* ⚠️ A política de `organizations` era `id = auth_org_id()`: o usuário só
 * enxergava a organização ATIVA, então o seletor não teria como listar as
 * outras — e "escolher" entre opções invisíveis não é escolher. A leitura passa
 * a ser por VÍNCULO, que é a verdade: ele é membro de todas elas. */
drop policy if exists "orgs read own" on public.organizations;
create policy orgs_das_quais_sou_membro on public.organizations
  for select to authenticated
  using (id in (select om.org_id from public.organization_members om where om.user_id = auth.uid()));

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. O PLANO É DA ORGANIZAÇÃO EM USO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ O defeito nº 3: a assinatura escolhida era a MELHOR entre as organizações
 * do usuário, e os dados vinham da mais antiga. Quem é sócio de uma empresa Pro
 * usava qualquer outra empresa com direitos de Pro. Agora a pergunta é uma só:
 * *a organização que está aberta tem plano?*
 */
drop function if exists public.meu_plano();
create or replace function public.meu_plano()
returns table (plano text, status text, expira date, pro boolean, org_id uuid)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(p.name, 'Simples')   as plano,
    coalesce(s.status, 'none')    as status,
    s.current_period_end          as expira,
    (
      coalesce(s.status, 'none') in ('active', 'trial')
      and coalesce(p.name, '') ilike '%pro%'
      and (s.current_period_end is null or s.current_period_end >= current_date)
    )                             as pro,
    o.id                          as org_id
  from public.organizations o
  left join public.subscriptions s on s.org_id = o.id
  left join public.plans p on p.id = s.plan_id
  where o.id = public.auth_org_id();
$$;

revoke execute on function public.meu_plano() from public, anon;
grant execute on function public.meu_plano() to authenticated;

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. AS POLÍTICAS — para quem está autenticado, e uma por tabela
 * ═══════════════════════════════════════════════════════════════════════════ */

/* Política declarada para `public` alcança `anon`. Hoje ela não entrega nada
 * (`auth_org_id()` é nulo sem sessão, e `org_id = null` não é verdadeiro), mas
 * a proteção fica dependendo de como o NULO se comporta numa comparação — e
 * isso é sorte, não desenho. */
do $$
declare r record;
begin
  for r in
    select c.relname as tabela, p.polname as politica
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and p.polroles = '{0}'::oid[]
  loop
    execute format('alter policy %I on public.%I to authenticated', r.politica, r.tabela);
  end loop;
end $$;

/* Seis tabelas carregavam a MESMA política duas vezes, com nomes diferentes.
 * Políticas permissivas se somam por OU: duas idênticas não mudam o resultado,
 * só o custo de conferir — e uma auditoria que precisa ler o dobro de linhas
 * encontra menos. */
drop policy if exists approvals_org         on public.approvals;
drop policy if exists bank_accounts_org     on public.bank_accounts;
drop policy if exists bank_transactions_org on public.bank_transactions;
drop policy if exists nfse_org              on public.nfse;
drop policy if exists pluggy_items_org      on public.pluggy_items;
drop policy if exists reembolsos_org        on public.reembolsos;

/* ⚠️ `maq_is_admin()` é `SECURITY DEFINER` **sem `search_path` fixo** e podia
 * ser executada por `anon`. Uma função definer sem `search_path` resolve os
 * nomes pelo caminho de quem chama: basta um esquema no caminho com uma tabela
 * `platform_admins` própria para a função responder "sim". */
create or replace function public.maq_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins p where p.user_id = auth.uid());
$$;
revoke execute on function public.maq_is_admin() from public, anon;
grant execute on function public.maq_is_admin() to authenticated;

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. O TESTE DE LEITURA CRUZADA — o critério de conclusão, executável
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ `SECURITY INVOKER` de propósito, e é isso que dá valor ao teste: ele roda
 * com os privilégios de QUEM CHAMA, contra as políticas de verdade, na base de
 * verdade. Cada tabela multiempresa é consultada pedindo explicitamente as
 * linhas de OUTRA organização. A resposta correta é zero em todas; qualquer
 * número diferente de zero é um vazamento, e a linha aparece nomeada.
 *
 * Uma função `SECURITY DEFINER` aqui responderia sempre "está tudo bem",
 * porque o dono da função enxerga tudo — ela testaria a si mesma.
 *
 * A varredura é DINÂMICA: toda tabela com `org_id` entra automaticamente. Uma
 * lista escrita à mão deixaria de fora exatamente a tabela criada depois deste
 * arquivo, que é a que ninguém lembra de conferir.
 */
create or replace function public.teste_isolamento()
returns table (tabela text, linhas_de_outra_org bigint, visiveis bigint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  v_org uuid := public.auth_org_id();
  n bigint;
  v bigint;
begin
  for r in
    select c.relname as t
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
     where ns.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  loop
    execute format(
      'select count(*) filter (where org_id is distinct from $1), count(*) from public.%I',
      r.t
    ) into n, v using v_org;
    tabela := r.t;
    linhas_de_outra_org := n;
    visiveis := v;
    return next;
  end loop;
end;
$$;

revoke execute on function public.teste_isolamento() from public, anon;
grant execute on function public.teste_isolamento() to authenticated;

/* ---------------------------------------------------------------------------
 * `verificar_isolamento()` — o mesmo teste, **registrado**.
 *
 * ⚠️ A política de linha bloqueia a leitura cruzada e **não deixa rastro**: uma
 * linha filtrada é indistinguível de uma linha que não existe, e o PostgreSQL
 * não tem como registrar o que a política escondeu sem transformar cada
 * consulta do produto num registro. Fingir o contrário seria pior que admitir.
 *
 * Então o que fica registrado não é a tentativa — é a VERIFICAÇÃO: quem
 * conferiu, quando, quantas tabelas e com que resultado. É isso que uma
 * auditoria consegue ler depois, e é a diferença entre "o isolamento está certo"
 * e "o isolamento foi conferido no dia tal e estava certo".
 *
 * A ação muda de NOME quando o resultado muda (`isolamento.VAZAMENTO`): um
 * achado desses não pode ficar escondido dentro de um registro de rotina, com o
 * mesmo rótulo dos dias em que estava tudo certo.
 *
 * Continua `SECURITY INVOKER` — ela chama o teste, e o teste tem de rodar com os
 * privilégios de quem pergunta.
 * ------------------------------------------------------------------------- */
create or replace function public.verificar_isolamento()
returns table (tabela text, linhas_de_outra_org bigint, visiveis bigint)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare v_vaz bigint; v_tab int; v_org uuid := public.auth_org_id();
begin
  create temp table if not exists _iso (tabela text, linhas_de_outra_org bigint, visiveis bigint) on commit drop;
  delete from _iso;
  insert into _iso select * from public.teste_isolamento();
  select coalesce(sum(t.linhas_de_outra_org), 0), count(*) into v_vaz, v_tab from _iso t;

  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (
    v_org,
    coalesce(auth.uid()::text, 'sistema'),
    case when v_vaz > 0 then 'isolamento.VAZAMENTO' else 'isolamento.verificar' end,
    null,
    jsonb_build_object(
      'tabelas', v_tab,
      'linhas_de_outra_org', v_vaz,
      'tabelas_vazando', coalesce((select jsonb_agg(t.tabela) from _iso t where t.linhas_de_outra_org > 0), '[]'::jsonb)
    )
  );
  return query select t.tabela, t.linhas_de_outra_org, t.visiveis from _iso t order by t.tabela;
end;
$$;

revoke execute on function public.verificar_isolamento() from public, anon;
grant execute on function public.verificar_isolamento() to authenticated;

/* O inventário da política de acesso por linha, tabela a tabela. */
create or replace function public.rls_auditoria()
returns table (
  tabela text, rls_ligada boolean, politicas int, tem_org_id boolean,
  politica_por_org boolean, alcanca_anonimo boolean, anon_pode_truncar boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.relname::text,
    c.relrowsecurity,
    (select count(*)::int from pg_policy p where p.polrelid = c.oid),
    exists (select 1 from pg_attribute a
             where a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped),
    exists (select 1 from pg_policy p
             where p.polrelid = c.oid
               and pg_get_expr(p.polqual, p.polrelid) like '%auth_org_id()%'),
    exists (select 1 from pg_policy p
             where p.polrelid = c.oid
               and (p.polroles = '{0}'::oid[]
                 or 'anon' = any (select r.rolname from pg_roles r where r.oid = any (p.polroles)))),
    has_table_privilege('anon', c.oid, 'TRUNCATE')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname;
$$;

revoke execute on function public.rls_auditoria() from public, anon;
grant execute on function public.rls_auditoria() to authenticated;
