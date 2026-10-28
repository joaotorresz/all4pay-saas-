-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DO FUNIL DO CADASTRO NO ADMIN (etapa 3) — migration 20261028140000.
--
-- Prova, contra o banco de verdade e dentro de uma transação DESFEITA:
--   1. quem não é da plataforma não lê o funil nem os documentos;
--   2. a plataforma lê o funil, com a empresa e a contagem de documentos;
--   3. com SÓ A SENHA (aal1), a plataforma lê o funil e NÃO vê documento —
--      a recusa nomeia o segundo fator;
--   4. com o código (aal2), a lista sai SEM o caminho do arquivo;
--   5. abrir devolve o caminho e grava quem abriu em admin_audit;
--   6. anon não executa nenhuma das funções.
-- A montagem é a de `scripts/pinbank.sql` (arreio copiado, não reinventado).
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

begin;

do $montagem$
declare
  ua uuid := gen_random_uuid();   -- titular da empresa A (quem se cadastrou)
  up uuid := gen_random_uuid();   -- administrador da PLATAFORMA
  oa uuid;
  doc uuid := gen_random_uuid();
  jor uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (ua, 'cad-a@guarda.local'), (up, 'cad-plataforma@guarda.local');
  select om.org_id into oa from public.organization_members om where om.user_id = ua limit 1;
  if oa is null then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou a empresa.';
  end if;
  insert into public.platform_admin_permitidos (email, motivo)
  values ('cad-plataforma@guarda.local', 'guarda do funil do cadastro (desfeita no fim)')
  on conflict do nothing;
  insert into public.platform_admins (user_id, exige_mfa) values (up, false)
    on conflict (user_id) do update set exige_mfa = false, expira_em = null;

  insert into public.cadastro_jornadas (id, tipo, etapa, etapas, contato_nome, org_id, concluida_em)
  values (jor, 'pj', 'pronto', '{"tipo":"2026-10-28T10:00:00Z","pronto":"2026-10-28T10:20:00Z"}'::jsonb, 'Guarda', oa, now());
  insert into public.cadastro_documentos (id, org_id, user_id, tipo, caminho, mime, tamanho)
  values (doc, oa, ua, 'selfie', oa::text || '/selfie-' || gen_random_uuid()::text || '.jpg', 'image/jpeg', 1000);

  perform set_config('guarda.ua', ua::text, true);
  perform set_config('guarda.up', up::text, true);
  perform set_config('guarda.oa', oa::text, true);
  perform set_config('guarda.doc', doc::text, true);
  perform set_config('guarda.jor', jor::text, true);
end
$montagem$;

create or replace function pg_temp.como(p_user uuid, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;

-- 1. quem não é da plataforma
do $$
begin
  perform pg_temp.como(current_setting('guarda.ua')::uuid, 'aal2');
  begin
    perform public.admin_cadastro_funil(90);
    raise exception 'FALHOU 1: quem não é da plataforma leu o funil do cadastro.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm not like '%Acesso administrativo negado%' then
      raise exception 'VERMELHO PELO MOTIVO ERRADO (1): "%"', sqlerrm;
    end if;
  end;
  begin
    perform public.admin_cadastro_documento_abrir(current_setting('guarda.doc')::uuid);
    raise exception 'FALHOU 1: quem não é da plataforma abriu um documento.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm not like '%Acesso administrativo negado%' then
      raise exception 'VERMELHO PELO MOTIVO ERRADO (1b): "%"', sqlerrm;
    end if;
  end;
end $$;

-- 2 e 3. a plataforma com SÓ A SENHA
do $$
declare
  f jsonb;
  linha jsonb;
begin
  perform pg_temp.como(current_setting('guarda.up')::uuid, 'aal1');
  f := public.admin_cadastro_funil(90);
  select x into linha from jsonb_array_elements(f) x where x ->> 'id' = current_setting('guarda.jor');
  if linha is null then
    raise exception 'FALHOU 2: a jornada plantada não saiu no funil.';
  end if;
  if (linha ->> 'org_id') is distinct from current_setting('guarda.oa') or (linha ->> 'documentos')::int <> 1 or linha ->> 'empresa' is null then
    raise exception 'FALHOU 2: a jornada saiu sem a empresa ou sem a contagem de documentos: %', linha;
  end if;
  begin
    perform public.admin_cadastro_documentos(current_setting('guarda.oa')::uuid);
    raise exception 'FALHOU 3: com só a senha a plataforma listou documentos.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm not like '%segundo fator%' then
      raise exception 'VERMELHO PELO MOTIVO ERRADO (3): "%"', sqlerrm;
    end if;
  end;
  begin
    perform public.admin_cadastro_documento_abrir(current_setting('guarda.doc')::uuid);
    raise exception 'FALHOU 3: com só a senha a plataforma abriu um documento.';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm not like '%segundo fator%' then
      raise exception 'VERMELHO PELO MOTIVO ERRADO (3b): "%"', sqlerrm;
    end if;
  end;
end $$;

-- 4 e 5. com o código do aplicativo
do $$
declare
  l jsonb;
  caminho text;
  rastro int;
begin
  perform pg_temp.como(current_setting('guarda.up')::uuid, 'aal2');
  l := public.admin_cadastro_documentos(current_setting('guarda.oa')::uuid);
  if jsonb_array_length(l) <> 1 or l -> 0 ->> 'id' is distinct from current_setting('guarda.doc') then
    raise exception 'FALHOU 4: a lista de documentos não trouxe o documento plantado: %', l;
  end if;
  if (l -> 0) ? 'caminho' then
    raise exception 'FALHOU 4: a lista de documentos levou o caminho do arquivo.';
  end if;
  caminho := public.admin_cadastro_documento_abrir(current_setting('guarda.doc')::uuid);
  if caminho is null or caminho not like current_setting('guarda.oa') || '/selfie-%' then
    raise exception 'FALHOU 5: abrir não devolveu o caminho do documento (%).', caminho;
  end if;
  select count(*) into rastro from public.admin_audit
   where admin_id = current_setting('guarda.up')::uuid and action = 'cadastro.documento_aberto'
     and target = current_setting('guarda.oa') and detail ->> 'documento' = current_setting('guarda.doc');
  if rastro <> 1 then
    raise exception 'FALHOU 5: abrir o documento não deixou o rastro em admin_audit (% linhas).', rastro;
  end if;
end $$;

-- 6. anon
do $$
begin
  if has_function_privilege('anon', 'public.admin_cadastro_funil(integer)', 'execute')
     or has_function_privilege('anon', 'public.admin_cadastro_documentos(uuid)', 'execute')
     or has_function_privilege('anon', 'public.admin_cadastro_documento_abrir(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.admin_cadastro_exigir_segundo_fator()', 'execute') then
    raise exception 'FALHOU 6: anon executa uma função do funil (ou a exigência do fator está exposta).';
  end if;
end $$;

\echo '✓ cadastro-admin: só a plataforma lê o funil, e documento só com o segundo fator, com rastro de quem abriu.'

rollback;
