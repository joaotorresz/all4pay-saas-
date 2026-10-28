-- ═══════════════════════════════════════════════════════════════════════════
-- A JORNADA DO CADASTRO (27/10/2026, etapa 1 do plano "documentos e funil")
--
-- O dono quer saber, no admin, quem terminou a abertura de conta, quem parou
-- no meio e em que passo — para recuperar o cliente e medir se o cadastro está
-- longo. Até aqui nada disso existia: a conversa de /criar-conta vivia só no
-- navegador e, quem fechava a aba, sumia sem rastro.
--
-- ⚠️ **A CONTA AINDA NÃO EXISTE enquanto a pessoa conversa.** Ela só nasce no
-- passo da senha, depois dos documentos. Por isso a jornada é identificada por
-- um TOKEN do navegador (uuid gerado lá), não por usuário nem empresa, e quem
-- grava é a rota pública `/api/cadastro/jornada` com o service_role. A empresa
-- entra no fim, por `cadastro_jornada_concluir`, chamada COM a sessão nova.
--
-- ⚠️ **SÓ ESCREVE.** Nenhuma função devolve dado da jornada a quem chama: a rota
-- é pública, e uma rota que devolvesse o que gravou seria um oráculo de nomes e
-- telefones de quem começou um cadastro. Quem LÊ é o admin da plataforma, na
-- etapa 3, pelas funções `admin_*` com o portão de sempre.
--
-- ⚠️ **TETO POR ORIGEM.** A rota é aberta: sem teto, um laço criaria milhões de
-- jornadas falsas e o funil viraria ruído. 30 jornadas NOVAS por hora por
-- origem (o hash do IP, nunca o IP). Atualizar uma jornada que já existe não
-- conta — é a mesma pessoa avançando.
--
-- ⚠️ **FORA DA TRILHA genérica, e de propósito** (a razão de `raw_events` e de
-- `pinbank_eventos`): ela própria é o registro bruto do que aconteceu, e a
-- jornada sem conta NÃO TEM empresa — a trilha exige uma. Declarado também em
-- `scripts/trilha-completa.sql`.
--
-- ⚠️ **O QUE NÃO ENTRA:** documento, CPF, CNPJ, senha e foto. Só o passo, o
-- tipo de conta e o contato que a pessoa já deu (nome, WhatsApp, e-mail) — o
-- mínimo para a recuperação. Os documentos vão para o cofre (etapa 2).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.cadastro_jornadas (
  id uuid primary key,
  tipo text check (tipo in ('pf', 'pj')),
  -- o passo mais recente
  etapa text not null check (etapa ~ '^[A-Za-z]{1,40}$'),
  -- a PRIMEIRA vez em que a pessoa chegou a cada passo: { "tipo": "2026-…", … }
  etapas jsonb not null default '{}'::jsonb,
  contato_nome text check (contato_nome is null or char_length(contato_nome) between 1 and 120),
  contato_whatsapp text check (contato_whatsapp is null or contato_whatsapp ~ '^[0-9]{10,13}$'),
  contato_email text check (contato_email is null or (char_length(contato_email) <= 254 and contato_email like '%_@_%')),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{16,64}$'),
  org_id uuid references public.organizations(id) on delete set null,
  iniciada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  concluida_em timestamptz
);

create index if not exists cadastro_jornadas_atualizada_idx on public.cadastro_jornadas (atualizada_em desc);
create index if not exists cadastro_jornadas_ip_idx on public.cadastro_jornadas (ip_hash, iniciada_em desc);

-- RLS ligada e SEM política: ninguém do cliente lê nem escreve direto.
alter table public.cadastro_jornadas enable row level security;
revoke all on public.cadastro_jornadas from anon, authenticated;

-- ── registrar um passo (só a rota, com service_role) ───────────────────────
create or replace function public.cadastro_jornada_registrar(
  p_id uuid,
  p_etapa text,
  p_tipo text default null,
  p_nome text default null,
  p_whatsapp text default null,
  p_email text default null,
  p_ip_hash text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existe boolean;
  novas int;
begin
  if p_id is null or p_etapa is null or p_etapa !~ '^[A-Za-z]{1,40}$' then
    return 'invalido';
  end if;

  select true into existe from public.cadastro_jornadas where id = p_id;

  if existe is null then
    if p_ip_hash is not null then
      select count(*) into novas from public.cadastro_jornadas
       where ip_hash = p_ip_hash and iniciada_em > now() - interval '1 hour';
      if novas >= 30 then
        return 'limite';
      end if;
    end if;
    insert into public.cadastro_jornadas (id, tipo, etapa, etapas, contato_nome, contato_whatsapp, contato_email, ip_hash)
    values (p_id, p_tipo, p_etapa, jsonb_build_object(p_etapa, clock_timestamp()), p_nome, p_whatsapp, p_email, p_ip_hash)
    on conflict (id) do nothing;
    return 'ok';
  end if;

  -- ⚠️ Depois de concluída, a jornada não volta a "em andamento": o evento
  -- atrasado (aba antiga, rede lenta) não desfaz quem já terminou.
  update public.cadastro_jornadas
     set etapa = p_etapa,
         -- só a PRIMEIRA chegada a cada passo: voltar com "Alterar" não apaga o tempo medido
         etapas = case when etapas ? p_etapa then etapas else etapas || jsonb_build_object(p_etapa, clock_timestamp()) end,
         tipo = coalesce(p_tipo, tipo),
         contato_nome = coalesce(p_nome, contato_nome),
         contato_whatsapp = coalesce(p_whatsapp, contato_whatsapp),
         contato_email = coalesce(p_email, contato_email),
         atualizada_em = now()
   where id = p_id and concluida_em is null;
  return 'ok';
end;
$$;

-- ── concluir (a pessoa, com a sessão que acabou de nascer) ─────────────────
-- ⚠️ A empresa sai de `auth_org_id()` — a aberta de QUEM chama —, nunca do
-- pedido. Só uma vez: a jornada concluída não troca de empresa depois.
create or replace function public.cadastro_jornada_concluir(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid := public.auth_org_id();
  n int;
begin
  if auth.uid() is null or org is null or p_id is null then
    return false;
  end if;
  if not exists (
    select 1 from public.organization_members m where m.org_id = org and m.user_id = auth.uid()
  ) then
    return false;
  end if;
  update public.cadastro_jornadas
     set org_id = org,
         concluida_em = now(),
         etapa = 'pronto',
         etapas = case when etapas ? 'pronto' then etapas else etapas || jsonb_build_object('pronto', clock_timestamp()) end,
         atualizada_em = now()
   where id = p_id and concluida_em is null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.cadastro_jornada_registrar(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.cadastro_jornada_registrar(uuid, text, text, text, text, text, text) to service_role;
revoke all on function public.cadastro_jornada_concluir(uuid) from public, anon;
grant execute on function public.cadastro_jornada_concluir(uuid) to authenticated;
