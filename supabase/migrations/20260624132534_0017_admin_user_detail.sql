-- ============================================================
-- 0017 — Admin: detalhe cadastral do usuário (drill-in)
-- ------------------------------------------------------------
-- Ao clicar num usuário no /admin, o super-admin vê os dados cadastrais:
-- contato (e-mail/telefone do auth), metadados de signup, e — por organização —
-- papel, e o perfil da empresa (representante: nome/CPF/e-mail/telefone, CNPJ,
-- razão social, cidade/UF) vindo de company_profiles.profile->db. Gateado.
-- ============================================================
create or replace function public.admin_user_detail(p_user uuid)
returns json language plpgsql security definer stable set search_path = public as $$
declare r json;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  select json_build_object(
    'user_id', u.id,
    'email', u.email,
    'telefone', u.phone,
    'criado', u.created_at,
    'ultimo_acesso', u.last_sign_in_at,
    'confirmado', (u.email_confirmed_at is not null),
    'anonimo', u.is_anonymous,
    'provedor', coalesce(u.raw_app_meta_data->>'provider', 'email'),
    'nome_meta', coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
    'telefone_meta', u.raw_user_meta_data->>'phone',
    'orgs', (
      select coalesce(json_agg(json_build_object(
        'org_id', o.id,
        'nome', o.name,
        'role', m.role,
        'display_name', m.display_name,
        'email_membro', m.email,
        'aprova_ate', m.approval_limit,
        'perfil', (select cp.profile->'db' from public.company_profiles cp where cp.org_id = o.id)
      ) order by m.role), '[]'::json)
      from public.organization_members m
      join public.organizations o on o.id = m.org_id
      where m.user_id = u.id
    )
  ) into r
  from auth.users u
  where u.id = p_user;
  return r;
end; $$;

revoke all on function public.admin_user_detail(uuid) from public, anon;
grant execute on function public.admin_user_detail(uuid) to authenticated;
