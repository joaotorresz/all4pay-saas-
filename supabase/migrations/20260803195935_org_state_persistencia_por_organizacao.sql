-- 0024 — `org_state`: a casa no SERVIDOR do que hoje mora no navegador.
--
-- ⚠️ 74 chaves de localStorage carregavam ENTIDADES DE NEGÓCIO inteiras:
-- aprovações, orçamento, reembolsos, comprovantes, tarefas de fechamento,
-- taxas de POS, dados da empresa. As consequências não são de conforto:
--
--  * trocar de navegador, de máquina ou limpar o cache PERDE tudo;
--  * dois usuários da mesma empresa NUNCA veem o mesmo estado;
--  * a trilha de auditoria fica em zero, porque nada passa pelo servidor;
--  * não há backup, restauração nem histórico;
--  * o teto de ~5 MB já estava perto de 9% com UMA empresa e poucos meses.
--
-- Um key-value por organização não é a modelagem final de cada entidade (uma
-- aprovação merece a sua tabela, com as suas colunas e os seus índices). É a
-- ponte que tira o dado do navegador HOJE, sem reescrever quinze telas de uma
-- vez, e sem inventar quinze schemas antes de saber quais campos sobrevivem.

create table if not exists public.org_state (
  org_id      uuid not null default public.auth_org_id(),
  chave       text not null,
  valor       jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  -- Contador de versão: quem grava por cima de uma versão que não leu recebe
  -- conflito em vez de apagar o trabalho do colega em silêncio. Dois usuários
  -- na mesma empresa era exatamente o cenário que não existia antes.
  versao      bigint not null default 1,
  primary key (org_id, chave)
);

create index if not exists org_state_org_idx on public.org_state (org_id);

alter table public.org_state enable row level security;

drop policy if exists org_state_rw on public.org_state;
create policy org_state_rw on public.org_state
  for all
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

revoke all on table public.org_state from anon;
grant select, insert, update, delete on table public.org_state to authenticated;

-- Grava incrementando a versão e carimbando quem/quando. `SECURITY INVOKER`:
-- a RLS acima continua valendo, então ninguém escreve na org alheia.
create or replace function public.org_state_set(p_chave text, p_valor jsonb)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare v bigint;
begin
  insert into public.org_state (chave, valor)
  values (p_chave, p_valor)
  on conflict (org_id, chave) do update
    set valor = excluded.valor,
        atualizado_em = now(),
        atualizado_por = auth.uid(),
        versao = public.org_state.versao + 1
  returning versao into v;
  return v;
end;
$$;

revoke all on function public.org_state_set(text, jsonb) from anon;
grant execute on function public.org_state_set(text, jsonb) to authenticated;

comment on table public.org_state is
  'Estado de negócio por organização — a ponte que tira do localStorage o que precisa ser multiusuário, sobreviver a troca de máquina e entrar em backup.';