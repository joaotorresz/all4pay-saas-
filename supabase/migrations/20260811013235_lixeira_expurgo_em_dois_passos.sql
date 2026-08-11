-- ⚠️ Uma lixeira precisa de fundo — mas o fundo não pode ser um atalho.
--
-- `lixeira_expurgar` só age sobre o que JÁ ESTÁ na lixeira. Não existe caminho
-- de "apagar de vez" em um passo: quem quer sumir com um registro tem de
-- excluí-lo (evento na trilha), e só depois expurgá-lo (segundo evento). Dois
-- atos, dois registros, e uma janela entre eles em que dá para voltar atrás —
-- que é a definição prática de reversível.
--
-- ⚠️ E exige `administrar`, não `lancar`. Excluir é operação do dia a dia;
-- destruir é decisão de quem responde pela empresa. Fossem a mesma permissão, a
-- lixeira seria um passo a mais para a mesma pessoa fazer a mesma coisa.
--
-- ⚠️ O evento é gravado ANTES do delete, com a linha inteira em `antes`. O
-- gatilho de auditoria também dispara, mas ele grava no mesmo instante em que a
-- linha morre; este registro é o que explica POR QUE ela morreu, e é o único
-- lugar onde o conteúdo sobrevive à própria exclusão.
create or replace function public.lixeira_expurgar(
  p_entidade text, p_id text, p_motivo text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid := public.auth_org_id(); v_linha jsonb; n int;
begin
  if not public.tem_permissao('administrar') then
    raise exception 'Só quem administra a empresa apaga definitivamente.' using errcode = 'insufficient_privilege';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 10 then
    raise exception 'Apagar em definitivo precisa de um motivo escrito.' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relkind='r' and c.relname = p_entidade
       and exists (select 1 from pg_attribute a
                    where a.attrelid=c.oid and a.attname='excluido_em' and not a.attisdropped)
  ) then
    raise exception 'Entidade % não tem lixeira.', p_entidade using errcode = 'undefined_table';
  end if;

  execute format(
    'select to_jsonb(t) from public.%I t where t.id::text = $1 and t.org_id = $2 and t.excluido_em is not null',
    p_entidade) into v_linha using p_id, v_org;

  if v_linha is null then
    raise exception 'Este registro não está na lixeira. Exclua-o primeiro — não há caminho direto para apagar em definitivo.'
      using errcode = 'no_data_found';
  end if;

  insert into public.audit_log (org_id, usuario, acao, antes, depois, entidade, entidade_id, origem)
  values (v_org, coalesce(auth.uid()::text, 'sistema'), p_entidade || '.expurgar',
          v_linha, jsonb_build_object('motivo', btrim(p_motivo)), p_entidade, p_id, 'lixeira');

  execute format('delete from public.%I where id::text = $1 and org_id = $2', p_entidade)
    using p_id, v_org;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Nada foi apagado.' using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function public.lixeira_expurgar(text, text, text) from public;
grant execute on function public.lixeira_expurgar(text, text, text) to authenticated;
