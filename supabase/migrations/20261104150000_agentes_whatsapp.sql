-- ═══════════════════════════════════════════════════════════════════════════
-- OS AGENTES · ETAPA 3 — APROVAR PELO WHATSAPP (04/11/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A proposta do agente chega no WhatsApp de quem pode aprová-la, com um
-- código: "SIM K7P2QX" aprova, "NÃO K7P2QX" recusa. É a MESMA máquina da
-- aprovação de título por WhatsApp (20261001140000): código de 6 símbolos sem
-- 0/O/1/I, guardado só como SHA-256, 24 horas, uso único, casado com o
-- telefone de quem recebeu.
--
-- ⚠️ UMA REGRA DE DECISÃO SÓ. A regra de quem decide a proposta (a empresa
-- da proposta, a permissão `aprovar` ou `administrar` NAQUELA empresa, só
-- pendente) sai de `agente_decidir` e vai para `agente_decidir_na_empresa`,
-- que as duas portas chamam:
--   · a tela: `agente_decidir` (a empresa é a ABERTA da sessão);
--   · o WhatsApp: `agente_responder_whatsapp`, como o aprovador (a empresa é
--     a do PEDIDO, gravada quando o pedido saiu; a mensagem não escolhe nada).
-- A identidade "como o aprovador" usa o mesmo mecanismo da aprovação de
-- título: `request.jwt.claim(s)` locais à transação, devolvidos em seguida.
--
-- ⚠️ QUEM RECEBE: só quem tem o número CONFIRMADO (`whatsapp_numeros_usuario`,
-- 20261030150000) e papel com `aprovar` ou `administrar` na empresa. Número
-- digitado em tela não recebe pedido de agente.
--
-- ⚠️ MUDA QUEM PODE CHAMAR O QUÊ — declarado:
--   · `agente_pedir_whatsapp` e `agente_responder_whatsapp`: só a chave de
--     serviço (o runner e a rota de entrada, que conferiu a assinatura da
--     Twilio). Ninguém logado responde em nome de outro.
--   · `agente_decidir_na_empresa`: ninguém executa direto; só as duas
--     funções acima (SECURITY DEFINER) a chamam.
--   · `agente_decidir` continua para `authenticated`, com o MESMO
--     comportamento.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A REGRA DE DECISÃO, num lugar só
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.agente_decidir_na_empresa(
  p_id uuid, p_aprovar boolean, p_motivo text, p_org uuid
) returns text
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v record;
begin
  if auth.uid() is null then
    raise exception 'agente_decidir: é preciso estar conectado.';
  end if;
  select * into v from public.agente_propostas where id = p_id for update;
  if not found or p_org is null or v.org_id is distinct from p_org then
    raise exception 'agente_decidir: proposta não encontrada nesta empresa.';
  end if;
  if not (public.tem_permissao('aprovar', v.org_id) or public.tem_permissao('administrar', v.org_id)) then
    raise exception 'Seu papel nesta empresa não decide o que os agentes propõem.';
  end if;
  if v.estado <> 'pendente' then
    raise exception 'agente_decidir: a proposta já foi decidida (%).', v.estado;
  end if;
  update public.agente_propostas
     set estado = case when p_aprovar then 'aprovada' else 'recusada' end,
         decidida_por = auth.uid(),
         decidida_em = now(),
         motivo = nullif(trim(coalesce(p_motivo, '')), '')
   where id = p_id;
  return case when p_aprovar then 'aprovada' else 'recusada' end;
end $fn$;

revoke all on function public.agente_decidir_na_empresa(uuid, boolean, text, uuid)
  from public, anon, authenticated, service_role;

-- A porta da tela: a empresa é a ABERTA da sessão.
create or replace function public.agente_decidir(p_id uuid, p_aprovar boolean, p_motivo text default null)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  return public.agente_decidir_na_empresa(p_id, p_aprovar, p_motivo, public.auth_org_id());
end $fn$;

revoke all on function public.agente_decidir(uuid, boolean, text) from public, anon;
grant execute on function public.agente_decidir(uuid, boolean, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. OS PEDIDOS
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.agente_pedidos_whatsapp (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  proposta_id uuid not null references public.agente_propostas(id) on delete cascade,
  aprovador_id uuid not null,
  -- só dígitos, com o 55 (é como a Twilio entrega a resposta)
  telefone text not null check (telefone ~ '^[0-9]{12,13}$'),
  codigo_hash text not null check (codigo_hash ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  respondido_em timestamptz,
  resposta text check (resposta in ('sim','nao')),
  resultado text check (resultado is null or length(resultado) <= 500)
);
alter table public.agente_pedidos_whatsapp enable row level security;

comment on table public.agente_pedidos_whatsapp is
  'Pedidos de decisão de proposta de agente pelo WhatsApp. Código com hash, 24h, uso único, só para número confirmado. Só as funções escrevem.';

create unique index if not exists agente_pedidos_whatsapp_um_aberto
  on public.agente_pedidos_whatsapp (proposta_id, aprovador_id)
  where respondido_em is null;
create index if not exists agente_pedidos_whatsapp_por_hash
  on public.agente_pedidos_whatsapp (codigo_hash)
  where respondido_em is null;

drop policy if exists agente_pedidos_whatsapp_ler on public.agente_pedidos_whatsapp;
create policy agente_pedidos_whatsapp_ler on public.agente_pedidos_whatsapp
  for select to authenticated
  using (org_id = public.auth_org_id());

revoke all on public.agente_pedidos_whatsapp from public, anon, authenticated, service_role;
grant select on public.agente_pedidos_whatsapp to authenticated;

drop trigger if exists zz_auditar_agente_pedidos_whatsapp on public.agente_pedidos_whatsapp;
create trigger zz_auditar_agente_pedidos_whatsapp
  after insert or update or delete on public.agente_pedidos_whatsapp
  for each row execute function public.auditar_escrita();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. PEDIR — o servidor do agente, para cada aprovador com número confirmado
-- ───────────────────────────────────────────────────────────────────────────
-- Devolve (aprovador, fone, código) para a mensagem. O código em texto
-- só existe nesta resposta; a trilha não o leva.
create or replace function public.agente_pedir_whatsapp(p_proposta uuid)
returns table (aprovador uuid, fone text, codigo text)
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_p record;
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32, sem 0/O/1/I
  v_bytes bytea;
  v_codigo text;
  v_tel text;
  a record;
  i int;
begin
  select id, org_id, estado into v_p from public.agente_propostas where id = p_proposta;
  if not found then
    raise exception 'agente_pedir_whatsapp: proposta não encontrada.';
  end if;
  if v_p.estado <> 'pendente' then
    return;   -- decidida: não há o que pedir
  end if;

  for a in
    select distinct om.user_id, n.telefone as tel
      from public.organization_members om
      join public.role_permissions rp on rp.papel = om.role and rp.acao in ('aprovar', 'administrar')
      join public.whatsapp_numeros_usuario n on n.user_id = om.user_id
     where om.org_id = v_p.org_id
       and n.telefone is not null and n.confirmado_em is not null
  loop
    v_tel := '55' || a.tel;
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_codigo := '';
    for i in 0..5 loop
      v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;

    -- O pedido anterior do mesmo par é FECHADO, não apagado.
    update public.agente_pedidos_whatsapp
       set respondido_em = now(), resultado = 'substituído'
     where proposta_id = p_proposta and agente_pedidos_whatsapp.aprovador_id = a.user_id
       and respondido_em is null;

    insert into public.agente_pedidos_whatsapp
      (org_id, proposta_id, aprovador_id, telefone, codigo_hash, expira_em)
    values
      (v_p.org_id, p_proposta, a.user_id, v_tel,
       encode(sha256(convert_to(upper(v_codigo), 'UTF8')), 'hex'), now() + interval '24 hours');

    aprovador := a.user_id; fone := v_tel; codigo := v_codigo;
    return next;
  end loop;
end $fn$;

revoke all on function public.agente_pedir_whatsapp(uuid) from public, anon, authenticated;
grant execute on function public.agente_pedir_whatsapp(uuid) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. RESPONDER — só a chave de serviço (a rota que conferiu a Twilio)
-- ───────────────────────────────────────────────────────────────────────────
-- `encontrado = false` diz à rota que o código não é de agente (ela tenta a
-- aprovação de título em seguida). A mensagem é a mesma para "não existe",
-- "é de outro telefone" e "já usado".
create or replace function public.agente_responder_whatsapp(
  p_telefone text, p_codigo text, p_decisao text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g');
  v_hash text := encode(sha256(convert_to(upper(trim(coalesce(p_codigo, ''))), 'UTF8')), 'hex');
  v_dec text := lower(trim(coalesce(p_decisao, '')));
  v_p record;
  v_claims_antes text := current_setting('request.jwt.claims', true);
  v_sub_antes text := current_setting('request.jwt.claim.sub', true);
  v_r text;
  v_erro text;
begin
  if v_dec not in ('sim', 'nao') then
    return jsonb_build_object('encontrado', false, 'ok', false, 'motivo', 'Resposta não reconhecida.');
  end if;

  select * into v_p
    from public.agente_pedidos_whatsapp
   where codigo_hash = v_hash and telefone = v_tel and respondido_em is null
   order by criado_em desc
   limit 1
   for update;
  if not found then
    return jsonb_build_object('encontrado', false, 'ok', false,
      'motivo', 'Código inválido ou já utilizado para este telefone.');
  end if;

  if v_p.expira_em <= now() then
    update public.agente_pedidos_whatsapp set respondido_em = now(), resultado = 'expirado' where id = v_p.id;
    return jsonb_build_object('encontrado', true, 'ok', false,
      'motivo', 'Código expirado: o pedido valia 24 horas. A proposta continua na tela de Automações.');
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_p.aprovador_id, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_p.aprovador_id::text, true);
    v_r := public.agente_decidir_na_empresa(v_p.proposta_id, v_dec = 'sim', 'Pelo WhatsApp.', v_p.org_id);
  exception when others then
    v_erro := sqlerrm;
  end;

  perform set_config('request.jwt.claims', coalesce(v_claims_antes, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub_antes, ''), true);

  -- Uso único também na recusa do banco.
  update public.agente_pedidos_whatsapp
     set respondido_em = now(), resposta = v_dec, resultado = coalesce(v_erro, v_r)
   where id = v_p.id;

  if v_erro is not null then
    return jsonb_build_object('encontrado', true, 'ok', false,
      'motivo', regexp_replace(v_erro, '^agente_decidir:\s*', ''));
  end if;

  -- Decidida: os pedidos dos outros aprovadores para a mesma proposta fecham.
  update public.agente_pedidos_whatsapp
     set respondido_em = now(), resultado = 'decidida por outra pessoa'
   where proposta_id = v_p.proposta_id and respondido_em is null;

  return jsonb_build_object('encontrado', true, 'ok', true, 'decisao', v_dec,
    'estado', v_r, 'proposta', v_p.proposta_id, 'org', v_p.org_id);
end $fn$;

revoke all on function public.agente_responder_whatsapp(text, text, text) from public, anon, authenticated;
grant execute on function public.agente_responder_whatsapp(text, text, text) to service_role;
