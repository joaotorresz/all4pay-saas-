-- ═══════════════════════════════════════════════════════════════════════════
-- A4P-085 — O NOME DIGITADO CHEGA A `organizations.name`, LITERAL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **Os usuários entram por `auth.users`, NUNCA por INSERT em
-- `organizations`.** Quem escreve o nome é o gatilho `on_auth_user_created`;
-- montar a organização à mão testaria um caminho que nenhum cliente percorre.
-- `raw_user_meta_data` é exatamente o que `auth.signUp({options:{data}})`
-- grava — é o dado que a superfície usa.
--
-- ⚠️ **CADA CASO RODA EM ESTADO LIMPO — savepoint próprio, desfeito no fim.**
-- A primeira versão deixava os casos compartilharem a transação e, com ela, o
-- estado: o bloco negativo reusou o e-mail do caso 3 e a guarda reprovou por
-- `duplicate key`, não pela asserção que ela audita. Dar outro endereço ao
-- bloco teria consertado o SINTOMA — a próxima colisão seria noutra coluna
-- única, e a rodada se pagaria de novo.
--
-- ⚠️ **E os casos usam DE PROPÓSITO o MESMO e-mail.** Reusar o valor único é o
-- que torna o isolamento auto-verificável: se um `rollback to savepoint`
-- deixar de acontecer, o caso seguinte colide na hora, em vez de passar por
-- acidente de ordem. Isolamento que só funciona porque os dados são
-- diferentes é ordem de execução disfarçada de asserção.
--
-- ⚠️ Falha com EXCEÇÃO: com `ON_ERROR_STOP=1` é isso que reprova o build.

begin;

-- ─────────────────────────────────────────────────────── caso 1: literal ───
savepoint caso1;
do $c1$
declare
  u uuid := gen_random_uuid();
  ESPERADO constant text := 'Açaí do João LTDA';
  nome text;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (u, 'joao+teste1@all4pay.com.br', 'authenticated', 'authenticated',
          jsonb_build_object('company', ESPERADO));
  select o.name into nome from public.organizations o
  join public.organization_members m on m.org_id = o.id where m.user_id = u;

  -- ⚠️ Sem esta linha a guarda vira teatro: se o provisionamento parar de criar
  -- a empresa, `nome` seria NULL e "não divergiu" seria indistinguível de
  -- "não havia nada para divergir".
  if nome is null then
    raise exception 'A4P-085 GUARDA INVÁLIDA: o provisionamento não criou empresa. Nada abaixo prova coisa alguma.';
  end if;
  if nome <> ESPERADO then
    raise exception 'A4P-085 NOME: esperado "%", recebido "%"', ESPERADO, nome;
  end if;
  raise notice 'caso 1 OK — acento, espaço e caixa chegam literais: "%"', nome;
end
$c1$;
rollback to savepoint caso1;

-- ──────────────────────────────────────── caso 2: as bordas são aparadas ───
savepoint caso2;
do $c2$
declare
  u uuid := gen_random_uuid();
  ESPERADO constant text := 'Açaí do João LTDA';
  nome text;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (u, 'joao+teste1@all4pay.com.br', 'authenticated', 'authenticated',
          jsonb_build_object('company', '   ' || ESPERADO || '   '));
  select o.name into nome from public.organizations o
  join public.organization_members m on m.org_id = o.id where m.user_id = u;
  if nome <> ESPERADO then
    raise exception 'A4P-085 NOME: bordas não aparadas no servidor. esperado "%", recebido "%"', ESPERADO, nome;
  end if;
  raise notice 'caso 2 OK — bordas aparadas, miolo intacto: "%"', nome;
end
$c2$;
rollback to savepoint caso2;

-- ──────────────────────── caso 3: o nome NUNCA vem do e-mail (o proibido) ───
-- ⚠️ **A ASSERÇÃO QUE PROVA O PROIBIDO.** A regra é "o nome nunca vem do
-- e-mail". Conferir que ele vale 'Minha empresa' passaria igualzinho se alguém
-- derivasse do e-mail um valor que por acaso fosse esse. Esta afirma sobre o
-- DEFEITO, e é ela que o teste negativo lá embaixo tem de fazer disparar.
savepoint caso3;
do $c3$
declare
  u uuid := gen_random_uuid();
  EMAIL constant text := 'joao+teste1@all4pay.com.br';
  nome text;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (u, EMAIL, 'authenticated', 'authenticated', '{}'::jsonb);
  select o.name into nome from public.organizations o
  join public.organization_members m on m.org_id = o.id where m.user_id = u;
  if nome = split_part(EMAIL, '@', 1) or nome like '%joao%' then
    raise exception 'A4P-085 NOME DERIVADO DO E-MAIL: esperado um nome que não venha do e-mail, recebido "%" (o local-part de %)', nome, EMAIL;
  end if;
  if btrim(coalesce(nome, '')) = '' then
    raise exception 'A4P-085 NOME: a organização nasceu em branco. recebido "[%]"', nome;
  end if;
  raise notice 'caso 3 OK — sem `company`, o nome não veio do e-mail: "%"', nome;
end
$c3$;
rollback to savepoint caso3;

-- ─────────────────────────── caso 4: `company` só com espaço não vira nome ───
savepoint caso4;
do $c4$
declare
  u uuid := gen_random_uuid();
  EMAIL constant text := 'joao+teste1@all4pay.com.br';
  nome text;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (u, EMAIL, 'authenticated', 'authenticated', jsonb_build_object('company', '   '));
  select o.name into nome from public.organizations o
  join public.organization_members m on m.org_id = o.id where m.user_id = u;
  if btrim(coalesce(nome, '')) = '' or nome like '%joao%' then
    raise exception 'A4P-085 NOME: `company` em branco produziu nome inválido. recebido "[%]"', nome;
  end if;
  raise notice 'caso 4 OK — `company` em branco cai no recurso declarado: "%"', nome;
end
$c4$;
rollback to savepoint caso4;

-- ═══════════════════════════════════════════════════════════════════════════
-- O TESTE NEGATIVO — e ele cobra que o VERMELHO NOMEIE o defeito
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ Guarda que nunca reprovou não conta — e **vermelho pelo motivo errado é
-- pior que guarda nenhuma**, porque quem lê só o código de saída arquiva
-- "o teste negativo funcionou". Foi o que aconteceu na primeira execução: o
-- vermelho veio de `duplicate key`, não da asserção do nome.
--
-- Então este bloco não se contenta em ver a exceção: ele **lê a mensagem** e
-- exige que ela nomeie o defeito auditado.
savepoint negativo;
do $neg$
declare
  u uuid := gen_random_uuid();
  EMAIL constant text := 'joao+teste1@all4pay.com.br';
  nome text;
  msg text := null;
begin
  create or replace function public.handle_new_user()
  returns trigger language plpgsql security definer set search_path to 'public'
  as $antigo$
  declare v_org uuid; v_name text;
  begin
    v_name := coalesce(
      nullif(new.raw_user_meta_data->>'company', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),   -- o defeito A4P-085
      'Minha empresa');
    insert into public.organizations (name) values (v_name) returning id into v_org;
    insert into public.organization_members (org_id, user_id, role) values (v_org, new.id, 'owner');
    perform public.seed_org(v_org);
    return new;
  end;
  $antigo$;

  begin
    insert into auth.users (id, email, aud, role, raw_user_meta_data)
    values (u, EMAIL, 'authenticated', 'authenticated', '{}'::jsonb);
    select o.name into nome from public.organizations o
    join public.organization_members m on m.org_id = o.id where m.user_id = u;
    -- A MESMA asserção do caso 3, palavra por palavra.
    if nome = split_part(EMAIL, '@', 1) or nome like '%joao%' then
      raise exception 'A4P-085 NOME DERIVADO DO E-MAIL: esperado um nome que não venha do e-mail, recebido "%" (o local-part de %)', nome, EMAIL;
    end if;
  exception when others then
    msg := SQLERRM;
  end;

  if msg is null then
    raise exception 'GUARDA CEGA: com a derivação do e-mail REINTRODUZIDA, a asserção do caso 3 não disparou (recebido "%").', nome;
  end if;
  -- ⚠️ E o vermelho tem de NOMEAR o defeito. Sem esta conferência, um
  -- `duplicate key` — ou qualquer outro acidente — passaria por "o negativo
  -- funcionou", que é exatamente o defeito que esta guarda acabou de cometer.
  if msg not like '%NOME DERIVADO DO E-MAIL%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO: a guarda reprovou com "%", que não é a asserção do nome.', msg;
  end if;
  raise notice 'teste negativo OK — o vermelho nomeia o defeito: %', msg;
end
$neg$;
rollback to savepoint negativo;

rollback;
