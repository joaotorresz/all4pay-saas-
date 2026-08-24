-- ═══════════════════════════════════════════════════════════════════════════
-- A4P-085 — O NOME DIGITADO CHEGA A `organizations.name`, LITERAL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **Os usuários entram por `auth.users`, NUNCA por INSERT em
-- `organizations`.** Quem escreve o nome é o gatilho `on_auth_user_created`;
-- montar a organização à mão testaria um caminho que nenhum cliente percorre e
-- deixaria o escritor real sem vigia. `raw_user_meta_data` é exatamente o que o
-- `auth.signUp({ options: { data } })` da tela grava — é o dado que a
-- superfície usa.
--
-- ⚠️ **Termina em ROLLBACK**, então roda com segurança contra qualquer banco.
-- ⚠️ Falha com EXCEÇÃO: com `ON_ERROR_STOP=1` é isso que reprova o build. Um
-- script que imprime "falhou" e sai com zero é um relatório, não uma guarda.
begin;

do $guarda$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid();
  u4 uuid := gen_random_uuid();
  ESPERADO constant text := 'Açaí do João LTDA';
  nome text;
begin
  ------------------------------------------------------------------ caso 1 ---
  -- Acento, espaço interno e caixa: o nome chega LITERAL.
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (u1, 'cadastro-nome-1@guarda.local', 'authenticated', 'authenticated',
          jsonb_build_object('company', ESPERADO));

  select o.name into nome
  from public.organizations o
  join public.organization_members m on m.org_id = o.id
  where m.user_id = u1;

  -- ⚠️ Sem esta conferência a guarda vira teatro: se o provisionamento parar de
  -- criar a empresa, `nome` seria NULL e "não divergiu" seria indistinguível de
  -- "não havia nada para divergir".
  if nome is null then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou empresa para o usuário. Nada abaixo prova coisa alguma.';
  end if;
  if nome <> ESPERADO then
    raise exception 'A4P-085: o nome digitado não chegou LITERAL. esperado=% obtido=%', ESPERADO, nome;
  end if;

  ------------------------------------------------------------------ caso 2 ---
  -- As BORDAS caem; o miolo (acento, espaço interno, caixa) fica intacto.
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (u2, 'cadastro-nome-2@guarda.local', 'authenticated', 'authenticated',
          jsonb_build_object('company', '   ' || ESPERADO || '   '));
  select o.name into nome from public.organizations o
  join public.organization_members m on m.org_id = o.id where m.user_id = u2;
  if nome <> ESPERADO then
    raise exception 'A4P-085: as bordas não foram aparadas no servidor. obtido=[%]', nome;
  end if;

  ------------------------------------------------------------------ caso 3 ---
  -- ⚠️ **A ASSERÇÃO QUE PROVA O PROIBIDO.** A regra é "o nome NUNCA vem do
  -- e-mail". Conferir que ele vale 'Minha empresa' passaria igualzinho se
  -- alguém derivasse do e-mail um valor que por acaso fosse esse. Então a
  -- guarda afirma sobre o DEFEITO: o nome não pode ser o local-part, nem
  -- conter o e-mail, para nenhum dos casos em que `company` não veio.
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (u3, 'joao+teste1@all4pay.com.br', 'authenticated', 'authenticated', '{}'::jsonb);
  select o.name into nome from public.organizations o
  join public.organization_members m on m.org_id = o.id where m.user_id = u3;
  if nome = split_part('joao+teste1@all4pay.com.br', '@', 1) or nome like '%joao%' then
    raise exception 'A4P-085: o nome foi DERIVADO DO E-MAIL — o defeito voltou. obtido=%', nome;
  end if;
  if btrim(nome) = '' then
    raise exception 'A4P-085: a organização nasceu com nome em branco. obtido=[%]', nome;
  end if;

  ------------------------------------------------------------------ caso 4 ---
  -- `company` só com espaço não pode virar um nome de espaços.
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (u4, 'joao+teste2@all4pay.com.br', 'authenticated', 'authenticated',
          jsonb_build_object('company', '   '));
  select o.name into nome from public.organizations o
  join public.organization_members m on m.org_id = o.id where m.user_id = u4;
  if btrim(nome) = '' or nome like '%joao%' then
    raise exception 'A4P-085: `company` em branco produziu nome inválido. obtido=[%]', nome;
  end if;

  raise notice 'cadastro-nome: 4 casos OK — o nome chega literal e nunca vem do e-mail';
end
$guarda$;

-- ═══════════════════════════════════════════════════════════════════════════
-- O TESTE NEGATIVO, GUARDADO JUNTO — guarda que nunca reprovou não conta
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Reintroduz a derivação do e-mail (a versão exata que estava em produção) e
-- exige que a asserção do caso 3 REPROVE. Se ela passar aqui, ela não guarda
-- nada — e é melhor descobrir isso agora do que na próxima auditoria.
do $negativo$
declare
  u uuid := gen_random_uuid();
  nome text;
  reprovou boolean := false;
begin
  create or replace function public.handle_new_user()
  returns trigger language plpgsql security definer set search_path to 'public'
  as $antigo$
  declare v_org uuid; v_name text;
  begin
    v_name := coalesce(
      nullif(new.raw_user_meta_data->>'company', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Minha empresa');
    insert into public.organizations (name) values (v_name) returning id into v_org;
    insert into public.organization_members (org_id, user_id, role) values (v_org, new.id, 'owner');
    perform public.seed_org(v_org);
    return new;
  end;
  $antigo$;

  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (u, 'joao+teste1@all4pay.com.br', 'authenticated', 'authenticated', '{}'::jsonb);
  select o.name into nome from public.organizations o
  join public.organization_members m on m.org_id = o.id where m.user_id = u;

  -- A MESMA condição do caso 3, aplicada ao defeito plantado.
  if nome = split_part('joao+teste1@all4pay.com.br', '@', 1) or nome like '%joao%' then
    reprovou := true;
  end if;

  if not reprovou then
    raise exception 'GUARDA CEGA: com a derivação do e-mail REINTRODUZIDA, a asserção do caso 3 continuou passando (obtido=%). Ela não guarda nada.', nome;
  end if;
  raise notice 'cadastro-nome: teste negativo OK — com o defeito plantado a guarda REPROVA (obtido=%)', nome;
end
$negativo$;

rollback;
