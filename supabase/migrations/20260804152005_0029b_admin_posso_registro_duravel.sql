drop extension if exists dblink;

create or replace function public.admin_veredito()
returns table (permitido boolean, motivo text, aal text, exige_mfa boolean, fatores int, mfa_prazo date, expira_em date)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
  v_reg public.platform_admins%rowtype;
  v_fatores int := 0;
  v_motivo text;
begin
  select * into v_reg from public.platform_admins where user_id = v_uid;
  if v_reg.user_id is null then
    v_motivo := 'nao e administrador da plataforma';
  else
    select count(*) into v_fatores from auth.mfa_factors f
     where f.user_id = v_uid and f.status = 'verified';
    if v_reg.expira_em is not null and v_reg.expira_em < current_date then
      v_motivo := 'acesso expirado em ' || v_reg.expira_em;
    elsif v_reg.exige_mfa and v_aal is distinct from 'aal2' then
      if v_fatores > 0 then
        v_motivo := 'segundo fator cadastrado e nao utilizado nesta sessao';
      elsif v_reg.mfa_prazo is not null and current_date > v_reg.mfa_prazo then
        v_motivo := 'prazo para cadastrar o segundo fator venceu em ' || v_reg.mfa_prazo;
      end if;
    end if;
  end if;
  return query select v_motivo is null, v_motivo, v_aal,
    coalesce(v_reg.exige_mfa,false), v_fatores, v_reg.mfa_prazo, v_reg.expira_em;
end;
$fn$;
revoke execute on function public.admin_veredito() from public, anon;
grant execute on function public.admin_veredito() to authenticated;

create or replace function public.admin_posso(p_funcao text, p_alvo text default null)
returns table (permitido boolean, motivo text, exige_mfa boolean, fatores int, mfa_prazo date, expira_em date)
language plpgsql volatile security definer set search_path = public as $fn$
declare v record;
begin
  select * into v from public.admin_veredito();
  insert into public.admin_acessos (admin_id, funcao, alvo, aal, permitido, motivo)
  values (auth.uid(), p_funcao, p_alvo, v.aal, v.permitido, v.motivo);
  return query select v.permitido, v.motivo, v.exige_mfa, v.fatores, v.mfa_prazo, v.expira_em;
end;
$fn$;
revoke execute on function public.admin_posso(text, text) from public, anon;
grant execute on function public.admin_posso(text, text) to authenticated;

create or replace function public.admin_exigir_acesso(p_funcao text, p_alvo text default null)
returns boolean language plpgsql volatile security definer set search_path = public as $fn$
declare v record;
begin
  select * into v from public.admin_veredito();
  insert into public.admin_acessos (admin_id, funcao, alvo, aal, permitido, motivo)
  values (auth.uid(), p_funcao, p_alvo, v.aal, v.permitido, v.motivo);
  if not v.permitido then
    raise exception 'Acesso administrativo negado: %', v.motivo;
  end if;
  return true;
end;
$fn$;
revoke execute on function public.admin_exigir_acesso(text, text) from public, anon;
grant execute on function public.admin_exigir_acesso(text, text) to authenticated;