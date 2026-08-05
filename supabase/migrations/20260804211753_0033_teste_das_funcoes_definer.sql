-- ═══════════════════════════════════════════════════════════════════════════
-- O TESTE DE ISOLAMENTO PASSA A COBRIR AS FUNÇÕES QUE ATRAVESSAM A RLS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `teste_isolamento()` (ONDA 9) varre TABELAS: para cada uma com `org_id`,
-- conta quantas linhas de outra empresa o usuário enxerga. Ele prova que a
-- política de linha funciona — e é cego para a única coisa que a política de
-- linha não alcança: **`SECURITY DEFINER`**.
--
-- Uma função `SECURITY DEFINER` roda com os privilégios do DONO e ignora RLS
-- por desenho. Se ela esquecer o filtro de vínculo, vaza o financeiro de todas
-- as organizações — e o teste de isolamento continua devolvendo "0 vazamentos",
-- porque nenhuma tabela vazou. O buraco fica exatamente onde a verificação não
-- olha.
--
-- Medido, não suposto: com uma versão de `org_movements` sem o filtro de
-- vínculo, um usuário passou a enxergar **738 linhas** de outras empresas. A
-- versão correta devolve 0. O teste distingue as duas — que é o que separa uma
-- guarda de um comentário.
--
-- `verificar_isolamento()` passa a somar os dois e a registrar
-- `por_funcao_definer` na trilha: a auditoria precisa poder ler que a classe
-- mais perigosa foi conferida, não só que "deu zero".

create or replace function public.teste_definer()
returns table (funcao text, linhas_de_outra_org bigint, visiveis bigint)
language plpgsql
volatile
-- ⚠️ INVOKER, como o teste de tabelas: precisa rodar com os privilégios de quem
-- pergunta. Um teste DEFINER responderia sempre "está tudo bem", porque o dono
-- enxerga tudo — testaria a si mesmo.
security invoker
set search_path = public
as $$
declare
  v_minhas uuid[];
begin
  select coalesce(array_agg(om.org_id), '{}') into v_minhas
    from public.organization_members om where om.user_id = auth.uid();

  return query
  select 'org_movements(date,date)'::text,
         count(*) filter (where not (m.org_id = any(v_minhas))),
         count(*)
    from public.org_movements('1900-01-01'::date, '2999-12-31'::date) m;

  return query
  select 'org_balances()'::text,
         count(*) filter (where not (b.org_id = any(v_minhas))),
         count(*)
    from public.org_balances() b;
end;
$$;
revoke execute on function public.teste_definer() from public, anon;
grant execute on function public.teste_definer() to authenticated;

create or replace function public.verificar_isolamento()
returns table (tabela text, linhas_de_outra_org bigint, visiveis bigint)
language plpgsql volatile security invoker set search_path = public as $$
declare v_vaz bigint; v_tab int; v_org uuid := public.auth_org_id(); v_def bigint;
begin
  create temp table if not exists _iso (tabela text, linhas_de_outra_org bigint, visiveis bigint) on commit drop;
  delete from _iso;
  insert into _iso select * from public.teste_isolamento();
  insert into _iso select 'fn: ' || d.funcao, d.linhas_de_outra_org, d.visiveis from public.teste_definer() d;

  select coalesce(sum(t.linhas_de_outra_org),0), count(*) into v_vaz, v_tab from _iso t;
  select coalesce(sum(t.linhas_de_outra_org),0) into v_def from _iso t where t.tabela like 'fn: %';

  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (
    v_org, coalesce(auth.uid()::text, 'sistema'),
    case when v_vaz > 0 then 'isolamento.VAZAMENTO' else 'isolamento.verificar' end,
    null,
    jsonb_build_object(
      'tabelas', v_tab, 'linhas_de_outra_org', v_vaz,
      'por_funcao_definer', v_def,
      'vazando', coalesce((select jsonb_agg(t.tabela) from _iso t where t.linhas_de_outra_org > 0), '[]'::jsonb)
    )
  );
  return query select t.tabela, t.linhas_de_outra_org, t.visiveis from _iso t order by t.tabela;
end;
$$;
revoke execute on function public.verificar_isolamento() from public, anon;
grant execute on function public.verificar_isolamento() to authenticated;
