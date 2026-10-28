-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DA FICHA DO LEAD DA MAQUININHA (CRM etapa 3) — migration 20261029130000.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/maquininha-leads.sql
--
-- Prova, contra o banco de verdade e dentro de uma transação DESFEITA:
--   1. quem não é da plataforma (o titular da empresa do pedido) não lê, não
--      salva e não anota a ficha — e não lê as tabelas da ficha direto;
--   2. a plataforma salva (responsável, próximo contato, taxas propostas),
--      anota duas vezes e lê de volta, com o rastro em admin_audit;
--   3. o banco recusa responsável fora da plataforma, forma inventada, taxa
--      acima de 20%, motivo de perda inventado, data a mais de um ano e
--      anotação vazia — cada recusa conferida pela MENSAGEM;
--   4. a anotação é histórico: nenhuma função a altera ou apaga;
--   5. o resumo do funil (admin_maquininha_pedidos) leva o responsável, o
--      próximo contato e a contagem de anotações.
-- O arreio é o de `cadastro-admin.sql` (copiado, não reinventado). ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.como(p_user uuid, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;

do $montagem$
declare
  ua uuid := gen_random_uuid();   -- titular da empresa que pediu a maquininha
  up uuid := gen_random_uuid();   -- administrador da PLATAFORMA
  oa uuid;
  ped uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'lead-empresa@guarda.local', 'authenticated', 'authenticated'),
    (up, 'lead-plataforma@guarda.local', 'authenticated', 'authenticated');
  select om.org_id into oa from public.organization_members om where om.user_id = ua limit 1;
  if oa is null then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou a empresa.';
  end if;
  insert into public.platform_admin_permitidos (email, motivo)
  values ('lead-plataforma@guarda.local', 'guarda da ficha do lead (desfeita no fim)')
  on conflict do nothing;
  insert into public.platform_admins (user_id, exige_mfa) values (up, false)
    on conflict (user_id) do update set exige_mfa = false, expira_em = null;

  perform pg_temp.como(ua, 'aal1');
  ped := public.maquininha_pedido_criar(
    'pedir', 1, 'Comércio', 30000, null, 'Marina Alves', '11987654321', null,
    'Rua das Flores, 100 - Centro', 'guarda da ficha');
  if ped is null then
    raise exception 'GUARDA INVÁLIDA: o pedido não foi criado.';
  end if;

  perform set_config('guarda.ua', ua::text, true);
  perform set_config('guarda.up', up::text, true);
  perform set_config('guarda.oa', oa::text, true);
  perform set_config('guarda.ped', ped::text, true);
end
$montagem$;

-- 1. a empresa do pedido não alcança a ficha
do $$
declare
  ped uuid := current_setting('guarda.ped')::uuid;
begin
  perform pg_temp.como(current_setting('guarda.ua')::uuid, 'aal2');
  begin
    perform public.admin_maquininha_lead(ped);
    raise exception 'FALHOU 1: a empresa leu a ficha do próprio pedido.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm not like '%Acesso administrativo negado%' then raise exception 'VERMELHO PELO MOTIVO ERRADO (1): "%"', sqlerrm; end if;
  end;
  begin
    perform public.admin_maquininha_lead_salvar(ped, null, null, null, null, null);
    raise exception 'FALHOU 1: a empresa salvou a ficha.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm not like '%Acesso administrativo negado%' then raise exception 'VERMELHO PELO MOTIVO ERRADO (1b): "%"', sqlerrm; end if;
  end;
  begin
    perform public.admin_maquininha_lead_anotar(ped, 'nota da empresa');
    raise exception 'FALHOU 1: a empresa anotou na ficha.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm not like '%Acesso administrativo negado%' then raise exception 'VERMELHO PELO MOTIVO ERRADO (1c): "%"', sqlerrm; end if;
  end;
  -- As tabelas da ficha não têm concessão a authenticated: ler direto é recusado.
  set local role authenticated;
  begin
    perform 1 from public.maquininha_leads limit 1;
    raise exception 'FALHOU 1: authenticated leu maquininha_leads direto.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.maquininha_lead_notas limit 1;
    raise exception 'FALHOU 1: authenticated leu maquininha_lead_notas direto.';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

-- 2 e 3. a plataforma salva, anota, lê; e o banco recusa o lixo
do $$
declare
  up uuid := current_setting('guarda.up')::uuid;
  ped uuid := current_setting('guarda.ped')::uuid;
  f jsonb;
  rastro int;
  casos text[][] := array[
    ['responsavel', 'responsável tem de ser alguém da plataforma'],
    ['forma', 'forma de pagamento boleto não existe'],
    ['taxa', 'tem de ficar entre 0% e 20%'],
    ['data', 'passa de um ano'],
    ['motivo', 'maquininha_leads_motivo_perda_check']
  ];
  c text[];
begin
  perform pg_temp.como(up, 'aal2');
  perform public.admin_maquininha_lead_salvar(ped, up, current_date + 3, null, null,
    jsonb_build_object('debito', 0.0119, 'credito', 0.0189));
  perform public.admin_maquininha_lead_anotar(ped, 'Primeira ligação: quer proposta no crédito.');
  perform public.admin_maquininha_lead_anotar(ped, 'Mandei a proposta por e-mail.');
  f := public.admin_maquininha_lead(ped);
  if (f -> 'lead' ->> 'responsavel') is distinct from up::text
     or (f -> 'lead' ->> 'proximo_contato')::date is distinct from current_date + 3
     or (f -> 'lead' -> 'taxas_propostas' ->> 'credito')::numeric is distinct from 0.0189 then
    raise exception 'FALHOU 2: a ficha não voltou como foi salva: %', f;
  end if;
  if jsonb_array_length(f -> 'notas') <> 2 or (f -> 'notas' -> 0 ->> 'autor_email') is distinct from 'lead-plataforma@guarda.local' then
    raise exception 'FALHOU 2: as anotações não voltaram (duas, com o autor): %', f -> 'notas';
  end if;
  if not exists (select 1 from jsonb_array_elements(f -> 'responsaveis') r where r ->> 'id' = up::text) then
    raise exception 'FALHOU 2: a lista de responsáveis não traz a plataforma.';
  end if;
  select count(*) into rastro from public.admin_audit
   where admin_id = up and action in ('maquininha.lead_salvar', 'maquininha.lead_anotar')
     and target = current_setting('guarda.oa');
  if rastro <> 3 then
    raise exception 'FALHOU 2: salvar e anotar deixaram % rastros em admin_audit, não 3.', rastro;
  end if;

  foreach c slice 1 in array casos loop
    begin
      case c[1]
        when 'responsavel' then perform public.admin_maquininha_lead_salvar(ped, current_setting('guarda.ua')::uuid, null, null, null, null);
        when 'forma' then perform public.admin_maquininha_lead_salvar(ped, null, null, null, null, '{"boleto":0.01}'::jsonb);
        when 'taxa' then perform public.admin_maquininha_lead_salvar(ped, null, null, null, null, '{"credito":3.5}'::jsonb);
        when 'data' then perform public.admin_maquininha_lead_salvar(ped, null, current_date + 400, null, null, null);
        when 'motivo' then perform public.admin_maquininha_lead_salvar(ped, null, null, 'caro demais', null, null);
      end case;
      raise exception 'FALHOU 3: o caso % foi aceito.', c[1];
    exception when others then
      if sqlerrm like 'FALHOU%' then raise; end if;
      if sqlerrm not like '%' || c[2] || '%' then
        raise exception 'VERMELHO PELO MOTIVO ERRADO (3, %): "%"', c[1], sqlerrm;
      end if;
    end;
  end loop;
  begin
    perform public.admin_maquininha_lead_anotar(ped, '   ');
    raise exception 'FALHOU 3: anotação vazia foi aceita.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm not like '%anotação está vazia%' then raise exception 'VERMELHO PELO MOTIVO ERRADO (3, vazia): "%"', sqlerrm; end if;
  end;
  -- A recusa não pode ter mexido no que estava salvo.
  if (public.admin_maquininha_lead(ped) -> 'lead' ->> 'responsavel') is distinct from up::text then
    raise exception 'FALHOU 3: uma recusa alterou a ficha salva.';
  end if;
end $$;

-- 4. a anotação é histórico: nenhuma função a altera ou apaga
do $$
declare
  n int;
begin
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.prosrc ~* '(update|delete\s+from)\s+(public\.)?maquininha_lead_notas';
  if n <> 0 then
    raise exception 'FALHOU 4: % função(ões) alteram ou apagam anotações — a anotação deixou de ser histórico.', n;
  end if;
end $$;

-- 5. o resumo do funil leva a ficha
do $$
declare
  l jsonb;
begin
  perform pg_temp.como(current_setting('guarda.up')::uuid, 'aal2');
  select x into l from jsonb_array_elements(public.admin_maquininha_pedidos()) x
   where x ->> 'id' = current_setting('guarda.ped');
  if l is null then
    raise exception 'FALHOU 5: o pedido não saiu no funil.';
  end if;
  if (l ->> 'notas')::int <> 2 or l ->> 'responsavel_email' is distinct from 'lead-plataforma@guarda.local'
     or (l ->> 'proximo_contato')::date is distinct from current_date + 3 then
    raise exception 'FALHOU 5: o card do funil não leva a ficha: %', l;
  end if;
  raise notice 'ficha do lead: recusa da empresa, salvar e anotar, recusas, histórico e resumo do funil — OK';
end $$;

rollback;
