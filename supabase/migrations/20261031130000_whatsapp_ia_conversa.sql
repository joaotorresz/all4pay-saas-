-- ═══════════════════════════════════════════════════════════════════════════
-- IA NO WHATSAPP · ETAPAS 2 A 4 — QUEM PERGUNTA, DE QUAL EMPRESA, QUANTO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A etapa 1 (20261030150000) confirmou o celular de cada pessoa. Esta dá ao
-- webhook da Twilio as três perguntas que ele faz a cada mensagem:
--
--   1. `whatsapp_ia_quem(telefone)` — de quem é este número, e quais empresas
--      essa pessoa pode LER. ⚠️ O papel é lido NA HORA de cada mensagem, nunca
--      no cadastro: quem perdeu o acesso ontem não lê o caixa hoje pelo celular.
--   2. `whatsapp_ia_escolher(telefone, org)` — a pessoa com várias empresas
--      escolhe por mensagem ("2"). Só vale empresa que ela pode ler.
--   3. `whatsapp_ia_reservar(telefone, org, pergunta)` — antes de responder:
--      confere de novo o número e o papel, aplica o TETO POR HORA e põe a
--      pergunta na TRILHA da empresa. Recusa = nada é lido.
--
-- ⚠️ SÓ LEITURA: nenhuma destas funções grava dado financeiro. Lançar pela
-- conversa é a etapa 5, com o "Confirmar" de sempre.
--
-- ⚠️ Só a chave de serviço (o webhook, depois da assinatura da Twilio)
-- executa. Uma sessão comum que pudesse chamar `whatsapp_ia_quem` com um
-- telefone qualquer descobriria de quem é cada número.
--
-- ⚠️ Nasce DESLIGADO: sem `WHATSAPP_IA=ligado` o webhook nem pergunta.
-- ═══════════════════════════════════════════════════════════════════════════

-- A empresa escolhida pela conversa. Nula = ainda não escolheu (com uma
-- empresa só, a conversa usa ela sem perguntar).
alter table public.whatsapp_numeros_usuario
  add column if not exists org_escolhida uuid references public.organizations (id) on delete set null;

-- As perguntas (o teto por hora). Sem o TEXTO: o texto vai para a trilha da
-- empresa, que tem dono; esta tabela só conta.
-- ⚠️ FORA DA TRILHA genérica, e de propósito: cada pergunta já vai à trilha
-- pela própria `whatsapp_ia_reservar` (`whatsapp_ia.pergunta`), e o gatilho
-- genérico a registraria duas vezes. Declarado também em
-- `scripts/trilha-completa.sql`.
create table if not exists public.whatsapp_ia_perguntas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  perguntada_em timestamptz not null default now()
);
alter table public.whatsapp_ia_perguntas enable row level security;
create index if not exists whatsapp_ia_perguntas_usuario on public.whatsapp_ia_perguntas (user_id, perguntada_em);
revoke all on public.whatsapp_ia_perguntas from public, anon, authenticated, service_role;

comment on table public.whatsapp_ia_perguntas is
  'Uma linha por pergunta à Quattro AI pelo WhatsApp (o teto por hora). Sem o texto. Sem política: só as funções leem e escrevem.';

-- ───────────────────────────────────────────────────────────────────────────
-- As empresas que a pessoa pode LER, em ordem estável.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.whatsapp_ia_empresas(p_usuario uuid)
returns table (org_id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, coalesce(nullif(trim(o.name), ''), 'Empresa sem nome')
    from public.organization_members om
    join public.role_permissions rp on rp.papel = om.role and rp.acao = 'ler'
    join public.organizations o on o.id = om.org_id
   where om.user_id = p_usuario
   order by o.name, o.id
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. QUEM É — o número confirmado, as empresas legíveis e a escolhida
-- ───────────────────────────────────────────────────────────────────────────
-- Devolve nulo quando o número não está confirmado: o webhook segue para a
-- resposta padrão sem saber de mais nada.
create or replace function public.whatsapp_ia_quem(p_telefone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_tel text := public.telefone_canonico(p_telefone);
  v_w record;
  v_orgs jsonb;
begin
  if v_tel is null then return null; end if;
  select * into v_w from public.whatsapp_numeros_usuario where telefone = v_tel;
  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', e.org_id, 'nome', e.nome)), '[]'::jsonb)
    into v_orgs
    from public.whatsapp_ia_empresas(v_w.user_id) e;

  return jsonb_build_object(
    'orgs', v_orgs,
    -- A escolhida só volta se a pessoa AINDA pode lê-la.
    'escolhida', (select e.org_id from public.whatsapp_ia_empresas(v_w.user_id) e
                   where e.org_id = v_w.org_escolhida),
    'saiu', exists (select 1 from public.whatsapp_saidas where telefone = v_tel and voltou_em is null));
end $fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. ESCOLHER A EMPRESA — por mensagem
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.whatsapp_ia_escolher(p_telefone text, p_org uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_tel text := public.telefone_canonico(p_telefone);
  v_uid uuid;
begin
  select user_id into v_uid from public.whatsapp_numeros_usuario where telefone = v_tel;
  if v_uid is null then return false; end if;
  if not exists (select 1 from public.whatsapp_ia_empresas(v_uid) e where e.org_id = p_org) then
    return false;
  end if;
  update public.whatsapp_numeros_usuario
     set org_escolhida = p_org, atualizado_em = now()
   where user_id = v_uid;
  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (p_org, v_uid::text, 'whatsapp_ia.escolher_empresa', null,
          jsonb_build_object('telefone_final', right(v_tel, 4)));
  return true;
end $fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RESERVAR A PERGUNTA — número, papel, teto e trilha, numa instrução só
-- ───────────────────────────────────────────────────────────────────────────
-- Teto: 20 perguntas por hora por pessoa (somando as empresas). A recusa não
-- conta e não vai à trilha (a trilha não pode virar o lugar de um abuso).
create or replace function public.whatsapp_ia_reservar(p_telefone text, p_org uuid, p_pergunta text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_tel text := public.telefone_canonico(p_telefone);
  v_uid uuid;
  n int;
  teto constant int := 20;
begin
  select user_id into v_uid from public.whatsapp_numeros_usuario where telefone = v_tel;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'codigo', 'sem_numero');
  end if;
  if exists (select 1 from public.whatsapp_saidas where telefone = v_tel and voltou_em is null) then
    return jsonb_build_object('ok', false, 'codigo', 'saiu');
  end if;
  if not exists (select 1 from public.whatsapp_ia_empresas(v_uid) e where e.org_id = p_org) then
    return jsonb_build_object('ok', false, 'codigo', 'sem_acesso');
  end if;

  -- Serializa as perguntas da mesma pessoa: duas mensagens no mesmo instante
  -- não passam juntas pelo teto.
  perform 1 from public.whatsapp_numeros_usuario where user_id = v_uid for update;
  select count(*) into n from public.whatsapp_ia_perguntas
   where user_id = v_uid and perguntada_em > now() - interval '1 hour';
  if n >= teto then
    return jsonb_build_object('ok', false, 'codigo', 'limite', 'teto', teto);
  end if;

  insert into public.whatsapp_ia_perguntas (user_id, org_id) values (v_uid, p_org);
  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (p_org, v_uid::text, 'whatsapp_ia.pergunta', null,
          jsonb_build_object('telefone_final', right(v_tel, 4),
                             'pergunta', left(coalesce(p_pergunta, ''), 300)));

  return jsonb_build_object('ok', true, 'restantes', teto - n - 1);
end $fn$;

revoke all on function public.whatsapp_ia_empresas(uuid) from public, anon, authenticated, service_role;
revoke all on function public.whatsapp_ia_quem(text) from public, anon, authenticated;
revoke all on function public.whatsapp_ia_escolher(text, uuid) from public, anon, authenticated;
revoke all on function public.whatsapp_ia_reservar(text, uuid, text) from public, anon, authenticated;
grant execute on function public.whatsapp_ia_quem(text) to service_role;
grant execute on function public.whatsapp_ia_escolher(text, uuid) to service_role;
grant execute on function public.whatsapp_ia_reservar(text, uuid, text) to service_role;
