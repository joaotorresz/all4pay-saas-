-- 0025 — Registro de acesso aos endereços APOSENTADOS.
--
-- ⚠️ "Remover o alias quando ninguém mais usar" só é possível se alguém contar.
-- Sem esta tabela, desligar um endereço antigo é uma aposta: ou se remove cedo
-- e um cliente perde o link que tinha no favorito, ou se mantém para sempre por
-- precaução — e a lista de aliases vira um cemitério que só cresce.
--
-- Um contador por rota e por dia. Não guarda usuário nem IP: a pergunta é
-- "este endereço ainda é usado?", e responder isso não exige saber por quem.

create table if not exists public.rota_alias_acessos (
  rota  text not null,
  dia   date not null default current_date,
  acessos bigint not null default 0,
  primary key (rota, dia)
);

create index if not exists rota_alias_acessos_dia_idx on public.rota_alias_acessos (dia desc);

alter table public.rota_alias_acessos enable row level security;

-- Ninguém lê nem escreve direto: só pela RPC abaixo (que é `SECURITY DEFINER`)
-- e pelo painel de admin. A tabela não é multi-tenant de propósito — a
-- pergunta é sobre o PRODUTO, não sobre uma organização.
revoke all on table public.rota_alias_acessos from anon, authenticated;

create or replace function public.registrar_acesso_alias(p_rota text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.rota_alias_acessos (rota, dia, acessos)
  values (p_rota, current_date, 1)
  on conflict (rota, dia) do update set acessos = public.rota_alias_acessos.acessos + 1;
$$;

-- ⚠️ `anon` PODE registrar: o acesso a um alias acontece muitas vezes ANTES do
-- login (o link chega por e-mail, a pessoa clica, o middleware desvia e só
-- depois ela entra). Exigir sessão para contar deixaria de fora justamente o
-- caso mais comum. A função só incrementa um contador — não lê nada.
grant execute on function public.registrar_acesso_alias(text) to anon, authenticated;

create or replace function public.uso_dos_aliases(p_dias int default 30)
returns table (rota text, acessos bigint, ultimo_dia date)
language sql
security definer
set search_path = public
as $$
  select rota, sum(acessos)::bigint as acessos, max(dia) as ultimo_dia
  from public.rota_alias_acessos
  where dia >= current_date - p_dias
  group by rota
  order by acessos desc;
$$;

revoke all on function public.uso_dos_aliases(int) from anon;
grant execute on function public.uso_dos_aliases(int) to authenticated;

comment on table public.rota_alias_acessos is
  'Quantas vezes cada endereço aposentado ainda foi acessado. É o que permite remover um alias com evidência em vez de com palpite.';