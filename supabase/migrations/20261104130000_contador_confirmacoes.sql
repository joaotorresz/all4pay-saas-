-- ═══════════════════════════════════════════════════════════════════════════
-- O OPT-IN DO CONTADOR — `contador_confirmacoes` (04/11/2026, Fase 3.4)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O pacote mensal de NFs leva a escrituração fiscal da empresa. Um e-mail
-- digitado errado entregaria os XMLs a um estranho todo mês. Por isso quem
-- confirma o endereço é o DESTINATÁRIO, clicando no link que chega na caixa
-- dele (double opt-in). Até aqui, em produção, nada mandava o link: o e-mail
-- ficava "aguardando" para sempre.
--
-- ⚠️ UM ESCRITOR SÓ para "confirmado": a rota pública do link
-- (`/api/contador/confirmar`), com a chave de serviço, pelo token. O cliente
-- do app LÊ a situação da própria empresa e NUNCA o token: sem o token, quem
-- cadastrou o e-mail não consegue se confirmar sozinho. Nenhuma escrita para
-- `authenticated`; quem pede o link é a rota do servidor, que confere o papel.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.contador_confirmacoes (
  org_id uuid not null references public.organizations(id) on delete cascade,
  dest_id text not null,
  email text not null,
  token uuid not null default gen_random_uuid(),
  pedido_em timestamptz not null default now(),
  confirmado_em timestamptz,
  primary key (org_id, dest_id),
  constraint contador_confirmacoes_token_unico unique (token),
  constraint contador_confirmacoes_email check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  constraint contador_confirmacoes_ordem check (confirmado_em is null or confirmado_em >= pedido_em)
);

comment on table public.contador_confirmacoes is
  'Double opt-in do envio de NFs ao contador: um pedido por destinatário. confirmado_em só é gravado pela rota do link (chave de serviço, pelo token). O app lê a situação, nunca o token.';

alter table public.contador_confirmacoes enable row level security;
revoke all on table public.contador_confirmacoes from public, anon, authenticated;
-- Só as colunas da situação; o token fica de fora.
grant select (org_id, dest_id, email, pedido_em, confirmado_em) on table public.contador_confirmacoes to authenticated;
grant select, insert, update, delete on table public.contador_confirmacoes to service_role;

drop policy if exists contador_confirmacoes_leitura on public.contador_confirmacoes;
create policy contador_confirmacoes_leitura on public.contador_confirmacoes
  for select to authenticated
  using (org_id = public.auth_org_id());

-- ─── A trilha, sem o token ─────────────────────────────────────────────────
-- ⚠️ Toda tabela de negócio leva um gatilho `zz_auditar_*` (guarda
-- `scripts/trilha-completa.sql`). O genérico (`auditar_escrita`) grava a linha
-- inteira em `audit_log`, e a trilha é lida por quem administra a empresa:
-- o token iria junto, e quem cadastrou o e-mail poderia se confirmar sozinho.
-- Este gatilho grava o mesmo evento, com o token removido dos dois lados.
create or replace function public.auditar_contador_confirmacao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_antes  jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) - 'token' end;
  v_depois jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) - 'token' end;
  v_linha  jsonb := coalesce(to_jsonb(new), to_jsonb(old));
begin
  -- Trocar só o token (pedir o link de novo) também é evento: o pedido mudou.
  insert into public.audit_log (org_id, usuario, acao, antes, depois, entidade, entidade_id, origem)
  values (
    (v_linha ->> 'org_id')::uuid,
    coalesce(auth.uid()::text, 'sistema'),
    tg_table_name || case tg_op when 'INSERT' then '.criar' when 'DELETE' then '.excluir' else '.alterar' end,
    v_antes, v_depois, tg_table_name, v_linha ->> 'dest_id', 'servidor'
  );
  return coalesce(new, old);
end;
$$;
revoke all on function public.auditar_contador_confirmacao() from public, anon, authenticated;

drop trigger if exists zz_auditar_contador_confirmacoes on public.contador_confirmacoes;
create trigger zz_auditar_contador_confirmacoes
  after insert or update or delete on public.contador_confirmacoes
  for each row execute function public.auditar_contador_confirmacao();
