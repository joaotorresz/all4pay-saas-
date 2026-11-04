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
