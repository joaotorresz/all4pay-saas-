-- ============================================================
-- 0012 — Gestão de membros da organização (convite por e-mail)
-- ------------------------------------------------------------
-- A RLS de organization_members (0005) só deixa o usuário ler a PRÓPRIA linha
-- (`user_id = auth.uid()`), então listar/gerir a equipe pelo cliente não
-- funciona. Estas funções SECURITY DEFINER operam sobre a org do chamador
-- (auth_org_id()), com guarda de papel (owner/admin), e o convite resolve o
-- e-mail em auth.users (que o cliente não enxerga). Não altera as policies base.
-- ============================================================

-- Caller é owner/admin da própria org?
create or replace function public.org_is_admin()
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where org_id = public.auth_org_id() and user_id = auth.uid() and role in ('owner','admin')
  );
$$;

-- Lista os membros da org do chamador (qualquer membro pode ver a equipe).
create or replace function public.org_members()
returns table (user_id uuid, role text, display_name text, email text, permissions jsonb, approval_limit numeric, can_cancel boolean)
language sql security definer stable set search_path = public as $$
  select m.user_id, m.role, m.display_name, m.email, m.permissions, m.approval_limit, m.can_cancel
  from public.organization_members m
  where m.org_id = public.auth_org_id()
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.display_name nulls last;
$$;

-- Adiciona um usuário EXISTENTE (por e-mail) à org do chamador. Owner/admin.
create or replace function public.org_invite_by_email(p_email text, p_role text default 'member', p_display_name text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_org uuid := public.auth_org_id();
begin
  if not public.org_is_admin() then raise exception 'Apenas owner/admin podem adicionar membros.'; end if;
  if coalesce(p_email, '') = '' then raise exception 'Informe o e-mail do usuário.'; end if;
  if p_role not in ('member','admin') then p_role := 'member'; end if;
  select id into v_uid from auth.users where lower(email) = lower(p_email) limit 1;
  if v_uid is null then
    raise exception 'Nenhuma conta com o e-mail %. Peça para a pessoa criar a conta primeiro.', p_email;
  end if;
  insert into public.organization_members (org_id, user_id, role, display_name, email)
  values (v_org, v_uid, p_role, coalesce(p_display_name, p_email), p_email)
  on conflict (org_id, user_id) do update
    set role = excluded.role,
        display_name = coalesce(excluded.display_name, organization_members.display_name),
        email = excluded.email;
  return v_uid;
end; $$;

-- Atualiza o perfil/permissões de um membro da org do chamador. Owner/admin.
create or replace function public.org_member_update(p_user_id uuid, p_display_name text, p_email text, p_permissions jsonb, p_approval_limit numeric, p_can_cancel boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.org_is_admin() then raise exception 'Sem permissão para alterar membros.'; end if;
  update public.organization_members
     set display_name = p_display_name,
         email = p_email,
         permissions = coalesce(p_permissions, '{}'::jsonb),
         approval_limit = p_approval_limit,
         can_cancel = coalesce(p_can_cancel, false)
   where org_id = public.auth_org_id() and user_id = p_user_id;
end; $$;

-- Remove um membro da org do chamador (não o owner, não a si mesmo). Owner/admin.
create or replace function public.org_member_remove(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.org_is_admin() then raise exception 'Sem permissão para remover membros.'; end if;
  if p_user_id = auth.uid() then raise exception 'Você não pode remover a si mesmo.'; end if;
  if exists (select 1 from public.organization_members where org_id = public.auth_org_id() and user_id = p_user_id and role = 'owner') then
    raise exception 'Não é possível remover o proprietário da organização.';
  end if;
  delete from public.organization_members where org_id = public.auth_org_id() and user_id = p_user_id;
end; $$;

revoke all on function public.org_is_admin() from public;
revoke all on function public.org_members() from public;
revoke all on function public.org_invite_by_email(text, text, text) from public;
revoke all on function public.org_member_update(uuid, text, text, jsonb, numeric, boolean) from public;
revoke all on function public.org_member_remove(uuid) from public;
grant execute on function public.org_is_admin() to authenticated;
grant execute on function public.org_members() to authenticated;
grant execute on function public.org_invite_by_email(text, text, text) to authenticated;
grant execute on function public.org_member_update(uuid, text, text, jsonb, numeric, boolean) to authenticated;
grant execute on function public.org_member_remove(uuid) to authenticated;

-- O Supabase concede EXECUTE a anon/authenticated por padrão; o anon NÃO deve
-- chamar estas RPCs (mesmo protegidas por auth.uid()/org_is_admin internamente).
revoke execute on function public.org_is_admin() from anon;
revoke execute on function public.org_members() from anon;
revoke execute on function public.org_invite_by_email(text, text, text) from anon;
revoke execute on function public.org_member_update(uuid, text, text, jsonb, numeric, boolean) from anon;
revoke execute on function public.org_member_remove(uuid) from anon;
