-- ═══════════════════════════════════════════════════════════════════════════
-- ONDA 8.0 — TODO DDL DEIXA RASTRO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ A auditoria pediu para "congelar DDL manual antes de reconstruir". No
-- nível de PAPEL não há a quem revogar: `anon`, `authenticated` e
-- `service_role` já não criam nada em `public`, e só `postgres` e
-- `supabase_admin` podem — que são exatamente os papéis usados pelo único
-- caminho que aplica migrations. Revogar deles congelaria o DDL legítimo junto
-- com o manual.
--
-- Então o congelamento possível não é impedir: é **tornar atribuível**. Toda
-- alteração de esquema passa a deixar quem, quando e o quê. É a mesma decisão
-- da ONDA 9 sobre o acesso administrativo — não dá para impedir quem precisa
-- entrar, dá para saber que entrou.
--
-- E é isto que fecha o buraco do `0030b`: uma alteração aplicada à mão continua
-- possível, mas passa a existir uma fonte contra a qual a guarda de diff
-- (repositório × banco) pode reclamar com nome e data.

create table if not exists public.ddl_log (
  id bigserial primary key,
  quando timestamptz not null default now(),
  quem text not null,
  comando text not null,
  tipo_objeto text,
  objeto text,
  contexto text
);

comment on table public.ddl_log is
  'Registro de toda alteracao de esquema. Nao impede DDL manual - torna cada uma atribuivel.';

-- ⚠️ RLS ligada e SEM política: ninguém lê a tabela direto. A leitura é pela
-- função abaixo, gateada por administrador de plataforma — o mesmo desenho das
-- tabelas só-DEFINER da 0014.
alter table public.ddl_log enable row level security;

create or replace function public.registrar_ddl()
returns event_trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare r record;
begin
  for r in select * from pg_event_trigger_ddl_commands() loop
    -- Só o esquema do produto: o Supabase mexe em `auth`, `storage` e
    -- `realtime` o tempo todo, e registrar isso afogaria o que interessa.
    if r.schema_name is distinct from 'public' then continue; end if;
    insert into public.ddl_log (quem, comando, tipo_objeto, objeto, contexto)
    values (
      coalesce(current_setting('request.jwt.claims', true), session_user),
      r.command_tag, r.object_type, r.object_identity,
      coalesce(current_setting('application_name', true), '')
    );
  end loop;
exception when others then
  -- ⚠️ Instrumentação NUNCA derruba a operação que observa. Um gatilho de
  -- evento que lança aborta a migration inteira — e a primeira vez que isso
  -- acontecesse, alguém o removeria, junto com o rastro.
  null;
end;
$fn$;

drop event trigger if exists registrar_ddl_trg;
create event trigger registrar_ddl_trg on ddl_command_end execute function public.registrar_ddl();

create or replace function public.ddl_recentes(p_dias int default 30)
returns table (quando timestamptz, quem text, comando text, objeto text)
language sql stable security definer set search_path = public as $fn$
  select l.quando, l.quem, l.comando, l.objeto
    from public.ddl_log l
   where l.quando >= now() - make_interval(days => greatest(1, p_dias))
     and public.is_platform_admin()
   order by l.quando desc;
$fn$;
revoke execute on function public.ddl_recentes(int) from public, anon;
grant execute on function public.ddl_recentes(int) to authenticated;
