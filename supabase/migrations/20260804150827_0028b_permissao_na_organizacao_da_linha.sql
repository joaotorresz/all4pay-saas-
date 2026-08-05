create or replace function public.tem_permissao(p_acao text, p_org uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.organization_members om
      join public.role_permissions rp on rp.papel = om.role and rp.acao = p_acao
     where om.user_id = auth.uid() and om.org_id = p_org
  );
$fn$;
revoke execute on function public.tem_permissao(text, uuid) from public, anon;
grant execute on function public.tem_permissao(text, uuid) to authenticated;

create or replace function public.tem_permissao(p_acao text)
returns boolean language sql stable security definer set search_path = public as $fn$
  select public.tem_permissao(p_acao, public.auth_org_id());
$fn$;

create or replace function public.approvals_segregacao()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected','returned') then
    if not public.tem_permissao('aprovar', new.org_id) then
      raise exception 'Seu papel nesta organizacao nao decide solicitacoes.';
    end if;
    new.approver_id := auth.uid();
    if new.requester_id is not distinct from auth.uid() then
      raise exception 'Segregacao de funcoes: quem solicita nao decide a propria solicitacao.';
    end if;
    new.decided_at := now();
  end if;
  return new;
end;
$fn$;