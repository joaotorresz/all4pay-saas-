create or replace function public.verificar_isolamento()
returns table (tabela text, linhas_de_outra_org bigint, visiveis bigint)
language plpgsql volatile security invoker set search_path = public as $fn$
declare v_vaz bigint; v_tab int; v_org uuid := public.auth_org_id();
begin
  create temp table if not exists _iso (tabela text, linhas_de_outra_org bigint, visiveis bigint) on commit drop;
  delete from _iso;
  insert into _iso select * from public.teste_isolamento();
  select coalesce(sum(t.linhas_de_outra_org),0), count(*) into v_vaz, v_tab from _iso t;

  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (
    v_org,
    coalesce(auth.uid()::text, 'sistema'),
    case when v_vaz > 0 then 'isolamento.VAZAMENTO' else 'isolamento.verificar' end,
    null,
    jsonb_build_object(
      'tabelas', v_tab,
      'linhas_de_outra_org', v_vaz,
      'tabelas_vazando', coalesce((select jsonb_agg(t.tabela) from _iso t where t.linhas_de_outra_org > 0), '[]'::jsonb)
    )
  );
  return query select t.tabela, t.linhas_de_outra_org, t.visiveis from _iso t order by t.tabela;
end;
$fn$;
revoke execute on function public.verificar_isolamento() from public, anon;
grant execute on function public.verificar_isolamento() to authenticated;