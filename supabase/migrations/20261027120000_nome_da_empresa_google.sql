-- ═══════════════════════════════════════════════════════════════════════════
-- O NOME DA EMPRESA DE QUEM ENTROU PELO GOOGLE (27/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Entrar com Google" sem conta cria o usuário no Auth na hora, e o gatilho
-- `handle_new_user` cria a empresa com o último recurso dele, 'Minha empresa':
-- o Google não manda `company` nos metadados (o `signUp` manda, por
-- `options.data`). A volta do Google (`/api/auth/google`) leva essa conta ao
-- cadastro, e o cadastro termina aqui, dando à empresa o nome respondido.
--
-- ⚠️ **Não é "renomear empresa".** Só funciona:
--   · com sessão;
--   · para o DONO (`owner`) da empresa ABERTA (`auth_org_id()`);
--   · enquanto ela ainda tem o nome provisório — depois do primeiro nome, a
--     função recusa, e mudar o nome de uma empresa de verdade é outro gesto.
-- Sem isso, a função viraria uma porta para qualquer membro trocar o nome da
-- empresa (o que aparece no topo, no relatório e na nota).
--
-- ⚠️ O nome passa pelas mesmas regras do gatilho: espaços aparados e teto de
-- 200 letras; vazio é recusado (o gatilho cai no recurso; aqui há alguém para
-- responder).

create or replace function public.org_nomear_provisoria(p_nome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid := public.auth_org_id();
  v_nome text := btrim(coalesce(p_nome, ''));
begin
  if auth.uid() is null then
    raise exception 'Entre na conta antes de nomear a empresa.' using errcode = '42501';
  end if;
  if length(v_nome) < 2 then
    raise exception 'Informe o nome da empresa.' using errcode = '22023';
  end if;
  if v_org is null or not exists (
    select 1 from public.organization_members m
     where m.org_id = v_org and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'Só o dono da empresa pode dar o nome a ela.' using errcode = '42501';
  end if;

  update public.organizations
     set name = left(v_nome, 200)
   where id = v_org and name = 'Minha empresa';
  if not found then
    raise exception 'Esta empresa já tem nome.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.org_nomear_provisoria(text) from public, anon;
grant execute on function public.org_nomear_provisoria(text) to authenticated;
