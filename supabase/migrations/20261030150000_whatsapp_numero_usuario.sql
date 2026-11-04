-- ═══════════════════════════════════════════════════════════════════════════
-- IA NO WHATSAPP · ETAPA 1 — O CELULAR DE QUEM PERGUNTA, CONFIRMADO POR CÓDIGO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A Quattro AI vai responder pelo número da plataforma ("quanto tenho a pagar
-- essa semana?"). Para isso o número que pergunta precisa ser de ALGUÉM: o
-- titular ou o administrador cadastra o celular em Segurança da conta e
-- confirma com um código de 6 dígitos que chega POR WHATSAPP.
--
-- ⚠️ SEM O CÓDIGO, QUALQUER PESSOA CADASTRARIA O NÚMERO DE OUTRA e leria o
-- caixa dela pela conversa. Por isso:
--   · quem GERA o código é só a chave de serviço (a rota que o envia): se a
--     pessoa pudesse pedir o código ao banco pela própria sessão, ela o leria
--     sem nunca ter o celular na mão;
--   · quem CONFERE é a sessão da pessoa (`auth.uid()`), com 5 tentativas por
--     código e validade de 10 minutos;
--   · no máximo 3 códigos por hora por PESSOA e por TELEFONE — sem o segundo
--     teto, várias contas usariam o número da plataforma para importunar o
--     celular de um estranho;
--   · telefone que pediu SAIR não recebe código (só volta respondendo VOLTAR);
--   · um telefone CONFIRMADO pertence a UMA pessoa (índice único parcial):
--     a conversa precisa saber de quem é o caixa.
--
-- ⚠️ O número é da PESSOA, não da empresa: a mesma pessoa pode administrar
-- duas empresas, e escolher qual por mensagem é a etapa 3. Quem pode
-- cadastrar é quem tem `administrar` em ao menos uma empresa; QUAIS empresas
-- a conversa alcança é pergunta da etapa 2, feita na hora de cada mensagem
-- (o papel pode mudar depois do cadastro).
--
-- ⚠️ Nasce DESLIGADO: sem `WHATSAPP_IA=ligado`, a tela não aparece e a rota
-- não envia nada. Esta migration só cria a fechadura.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.whatsapp_numeros_usuario (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- O confirmado (canônico: só dígitos, sem o 55). Nulo até a 1ª confirmação.
  telefone text check (telefone is null or telefone ~ '^\d{10,11}$'),
  confirmado_em timestamptz,
  -- O cadastro EM ANDAMENTO: trocar de número não apaga o confirmado até o
  -- novo ser confirmado (senão um código perdido derrubaria o que funcionava).
  pendente_telefone text check (pendente_telefone is null or pendente_telefone ~ '^\d{10,11}$'),
  codigo_hash text,
  codigo_expira_em timestamptz,
  tentativas int not null default 0,
  atualizado_em timestamptz not null default now(),
  check ((telefone is null) = (confirmado_em is null))
);
alter table public.whatsapp_numeros_usuario enable row level security;

-- Um telefone confirmado é de uma pessoa só.
create unique index if not exists whatsapp_numeros_usuario_telefone_unico
  on public.whatsapp_numeros_usuario (telefone) where telefone is not null;

comment on table public.whatsapp_numeros_usuario is
  'O celular de cada pessoa para conversar com a Quattro AI pelo WhatsApp. Só vale CONFIRMADO por código enviado ao próprio número. Sem política: só as funções leem e escrevem.';

-- Os envios de código (o teto por hora). Sem `org_id` como `whatsapp_saidas`:
-- o código é da pessoa, não de uma empresa.
create table if not exists public.whatsapp_numero_envios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  telefone text not null check (telefone ~ '^\d{10,11}$'),
  enviado_em timestamptz not null default now()
);
alter table public.whatsapp_numero_envios enable row level security;
create index if not exists whatsapp_numero_envios_usuario on public.whatsapp_numero_envios (user_id, enviado_em);
create index if not exists whatsapp_numero_envios_telefone on public.whatsapp_numero_envios (telefone, enviado_em);

-- Nenhuma política: só as funções SECURITY DEFINER leem e escrevem.
revoke all on public.whatsapp_numeros_usuario from public, anon, authenticated, service_role;
revoke all on public.whatsapp_numero_envios from public, anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- A empresa onde o evento entra na trilha: a ABERTA, se a pessoa a administra;
-- senão a primeira que ela administra. Nula = ela não administra nenhuma.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.whatsapp_numero_org_admin(p_usuario uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select om.org_id
    from public.organization_members om
    join public.role_permissions rp on rp.papel = om.role and rp.acao = 'administrar'
    left join public.user_active_org ua on ua.user_id = om.user_id and ua.org_id = om.org_id
   where om.user_id = p_usuario
   order by (ua.org_id is not null) desc, om.org_id
   limit 1
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. PEDIR O CÓDIGO — só a chave de serviço (a rota que o envia por WhatsApp)
-- ───────────────────────────────────────────────────────────────────────────
-- Devolve o código EM CLARO só para a rota, que o põe na mensagem. O banco
-- guarda o hash. Recusas com prefixo `A4P-WAN-*` (a rota tira o prefixo).
create or replace function public.whatsapp_numero_pedir_codigo(p_usuario uuid, p_telefone text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_tel text := public.telefone_canonico(p_telefone);
  v_org uuid;
  v_bytes bytea;
  v_codigo text;
  n int;
begin
  if p_usuario is null then
    raise exception 'A4P-WAN-SESSAO: sessão ausente — entre de novo.';
  end if;
  v_org := public.whatsapp_numero_org_admin(p_usuario);
  if v_org is null then
    raise exception 'A4P-WAN-PAPEL: só o titular ou um administrador da empresa pode cadastrar o celular para a Quattro AI.';
  end if;
  if v_tel is null or v_tel !~ '^\d{10,11}$' then
    raise exception 'A4P-WAN-TELEFONE: celular inválido — informe DDD e número.';
  end if;

  if exists (select 1 from public.whatsapp_numeros_usuario
              where telefone = v_tel and user_id <> p_usuario) then
    raise exception 'A4P-WAN-OCUPADO: este celular já está confirmado em outra conta. Peça à pessoa que o remova em Segurança da conta.';
  end if;

  if exists (select 1 from public.whatsapp_saidas where telefone = v_tel and voltou_em is null) then
    raise exception 'A4P-WAN-SAIU: este celular pediu para não receber mensagens. Mande VOLTAR para o número da Quattro e peça o código de novo.';
  end if;

  select count(*) into n from public.whatsapp_numero_envios
   where user_id = p_usuario and enviado_em > now() - interval '1 hour';
  if n >= 3 then
    raise exception 'A4P-WAN-LIMITE: você já pediu 3 códigos na última hora. Espere um pouco e peça de novo.';
  end if;
  select count(*) into n from public.whatsapp_numero_envios
   where telefone = v_tel and enviado_em > now() - interval '1 hour';
  if n >= 3 then
    raise exception 'A4P-WAN-LIMITE: este celular já recebeu 3 códigos na última hora. Espere um pouco e peça de novo.';
  end if;

  -- 6 dígitos de 4 bytes aleatórios (o viés de 2^32 mod 10^6 é desprezível).
  v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_codigo := lpad(((
      (get_byte(v_bytes, 0)::bigint << 24) | (get_byte(v_bytes, 1)::bigint << 16)
    | (get_byte(v_bytes, 2)::bigint << 8)  |  get_byte(v_bytes, 3)::bigint) % 1000000)::text, 6, '0');

  insert into public.whatsapp_numeros_usuario as w
    (user_id, pendente_telefone, codigo_hash, codigo_expira_em, tentativas, atualizado_em)
  values
    (p_usuario, v_tel,
     encode(sha256(convert_to(p_usuario::text || ':' || v_codigo, 'UTF8')), 'hex'),
     now() + interval '10 minutes', 0, now())
  on conflict (user_id) do update
     set pendente_telefone = excluded.pendente_telefone,
         codigo_hash = excluded.codigo_hash,
         codigo_expira_em = excluded.codigo_expira_em,
         tentativas = 0,
         atualizado_em = now();

  insert into public.whatsapp_numero_envios (user_id, telefone) values (p_usuario, v_tel);

  -- ⚠️ A trilha NÃO leva o código nem o número inteiro.
  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (v_org, p_usuario::text, 'whatsapp_numero.pedir_codigo', null,
          jsonb_build_object('telefone_final', right(v_tel, 4)));

  return v_codigo;
end $fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. CONFIRMAR — a sessão da própria pessoa
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.whatsapp_numero_confirmar(p_codigo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_cod text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g');
  v_w record;
  v_org uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'motivo', 'Sessão ausente — entre de novo.');
  end if;

  select * into v_w from public.whatsapp_numeros_usuario where user_id = v_uid for update;
  if not found or v_w.codigo_hash is null then
    return jsonb_build_object('ok', false, 'motivo', 'Nenhum código pendente. Peça um código novo.');
  end if;

  if v_w.codigo_expira_em <= now() then
    update public.whatsapp_numeros_usuario
       set codigo_hash = null, codigo_expira_em = null, pendente_telefone = null, atualizado_em = now()
     where user_id = v_uid;
    return jsonb_build_object('ok', false, 'motivo', 'O código venceu (vale 10 minutos). Peça um código novo.');
  end if;

  if v_w.tentativas >= 5 then
    update public.whatsapp_numeros_usuario
       set codigo_hash = null, codigo_expira_em = null, pendente_telefone = null, atualizado_em = now()
     where user_id = v_uid;
    return jsonb_build_object('ok', false, 'motivo', 'Tentativas esgotadas. Peça um código novo.');
  end if;

  if encode(sha256(convert_to(v_uid::text || ':' || v_cod, 'UTF8')), 'hex') is distinct from v_w.codigo_hash then
    update public.whatsapp_numeros_usuario
       set tentativas = tentativas + 1, atualizado_em = now()
     where user_id = v_uid;
    return jsonb_build_object('ok', false,
      'motivo', format('Código incorreto. Restam %s tentativa(s).', greatest(0, 4 - v_w.tentativas)));
  end if;

  -- O número pode ter sido confirmado por OUTRA conta enquanto o código
  -- esperava: o índice único recusaria; a frase vem antes.
  if exists (select 1 from public.whatsapp_numeros_usuario
              where telefone = v_w.pendente_telefone and user_id <> v_uid) then
    update public.whatsapp_numeros_usuario
       set codigo_hash = null, codigo_expira_em = null, pendente_telefone = null, atualizado_em = now()
     where user_id = v_uid;
    return jsonb_build_object('ok', false, 'motivo', 'Este celular acabou de ser confirmado em outra conta.');
  end if;

  update public.whatsapp_numeros_usuario
     set telefone = v_w.pendente_telefone, confirmado_em = now(),
         pendente_telefone = null, codigo_hash = null, codigo_expira_em = null,
         tentativas = 0, atualizado_em = now()
   where user_id = v_uid;

  v_org := public.whatsapp_numero_org_admin(v_uid);
  if v_org is not null then
    insert into public.audit_log (org_id, usuario, acao, antes, depois)
    values (v_org, v_uid::text, 'whatsapp_numero.confirmar',
            case when v_w.telefone is null then null
                 else jsonb_build_object('telefone_final', right(v_w.telefone, 4)) end,
            jsonb_build_object('telefone_final', right(v_w.pendente_telefone, 4)));
  end if;

  return jsonb_build_object('ok', true, 'telefone', v_w.pendente_telefone);
end $fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. VER E REMOVER — a sessão da própria pessoa
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.whatsapp_numero_meu()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'telefone', w.telefone,
    'confirmado_em', w.confirmado_em,
    'pendente_telefone', case when w.codigo_expira_em > now() then w.pendente_telefone end,
    'pode_cadastrar', public.whatsapp_numero_org_admin(auth.uid()) is not null)
    from (select 1) um
    left join public.whatsapp_numeros_usuario w on w.user_id = auth.uid()
   where auth.uid() is not null
$$;

create or replace function public.whatsapp_numero_remover()
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_tel text;
  v_org uuid;
begin
  if v_uid is null then return false; end if;
  delete from public.whatsapp_numeros_usuario where user_id = v_uid returning telefone into v_tel;
  if not found then return false; end if;
  v_org := public.whatsapp_numero_org_admin(v_uid);
  if v_org is not null and v_tel is not null then
    insert into public.audit_log (org_id, usuario, acao, antes, depois)
    values (v_org, v_uid::text, 'whatsapp_numero.remover',
            jsonb_build_object('telefone_final', right(v_tel, 4)), null);
  end if;
  return true;
end $fn$;

revoke all on function public.whatsapp_numero_org_admin(uuid) from public, anon, authenticated, service_role;
revoke all on function public.whatsapp_numero_pedir_codigo(uuid, text) from public, anon, authenticated;
grant execute on function public.whatsapp_numero_pedir_codigo(uuid, text) to service_role;
revoke all on function public.whatsapp_numero_confirmar(text) from public, anon, service_role;
revoke all on function public.whatsapp_numero_meu() from public, anon, service_role;
revoke all on function public.whatsapp_numero_remover() from public, anon, service_role;
grant execute on function public.whatsapp_numero_confirmar(text) to authenticated;
grant execute on function public.whatsapp_numero_meu() to authenticated;
grant execute on function public.whatsapp_numero_remover() to authenticated;
