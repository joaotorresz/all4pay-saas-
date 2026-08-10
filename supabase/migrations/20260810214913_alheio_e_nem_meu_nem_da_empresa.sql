-- ═══════════════════════════════════════════════════════════════════════════
-- ONDA 2 · CORREÇÃO MEDIDA: "alheio" não é "de outra empresa"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A primeira versão de `teste_isolamento_completo()` (migration anterior)
-- tratava toda linha com `org_id <> a minha` como vazamento. Rodada com o JWT
-- de um usuário real, ela ACUSOU `organization_members` em `ler` e `agregar`.
--
-- Conferido linha a linha: eram os vínculos DO PRÓPRIO USUÁRIO na outra
-- empresa dele — que é exatamente o que faz o seletor de empresa existir.
-- Apagar essa visibilidade quebraria a troca de empresa; chamá-la de
-- vazamento faria a tela de segurança nascer com um achado falso.
--
-- ⚠️ Ou seja: o teste caiu na MESMA armadilha que foi escrito para denunciar no
-- auditor — confundir "recortado por outro critério" com "não recortado". Em
-- `organization_members` e `user_active_org` o dono da linha é o USUÁRIO, não
-- a empresa.
--
-- A regra, agora explícita: **uma linha é alheia quando não é da minha empresa
-- E não é minha.** O predicado é montado a partir da própria tabela — se ela
-- tem `user_id`, a linha do próprio usuário nunca conta como alheia.
--
-- Isto vale como lembrete para quem escrever a próxima varredura: um teste de
-- isolamento que grita lobo treina quem o lê a ignorá-lo, e aí o dia em que
-- ele estiver certo é o dia em que ninguém olha.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.teste_isolamento_completo()
returns table(
  tabela text,
  verbo text,
  resultado text,
  vazou boolean,
  detalhe text
)
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  r          record;
  v_minha    uuid := public.auth_org_id();
  v_alheia   uuid := public._org_alheia();
  n          bigint;
  n_total    bigint;
  v_modelo   jsonb;
  v_cols     text;
  v_tem_user boolean;
  p_alheia   text;
  p_minha    text;
begin
  if v_minha is null then
    tabela := '—'; verbo := '—'; vazou := false;
    resultado := 'sem empresa ativa';
    detalhe := 'auth_org_id() devolveu nulo nesta sessão: não há de quem isolar. Isto NÃO é aprovação.';
    return next;
    return;
  end if;

  for r in
    select c.relname::text as t, c.oid as oid
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      join pg_attribute a  on a.attrelid = c.oid
                          and a.attname = 'org_id'
                          and not a.attisdropped
     where ns.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  loop
    tabela := r.t;

    select exists (
      select 1 from pg_attribute a
       where a.attrelid = r.oid and a.attname = 'user_id' and not a.attisdropped
    ) into v_tem_user;

    p_alheia := 'org_id is distinct from $1'
             || case when v_tem_user then ' and user_id is distinct from auth.uid()' else '' end;
    p_minha  := 'org_id is not distinct from $1'
             || case when v_tem_user then ' or user_id is not distinct from auth.uid()' else '' end;

    verbo := 'ler';
    begin
      execute format('select count(*) from public.%I where (%s)', r.t, p_alheia)
        into n using v_minha;
      vazou := n > 0;
      resultado := case when n > 0 then 'VAZOU' else 'negado' end;
      detalhe := n::text || ' linha(s) alheias visíveis';
    exception
      when insufficient_privilege then
        vazou := false; resultado := 'sem privilégio';
        detalhe := 'authenticated não tem SELECT aqui — fechada por concessão, não por política';
      when others then
        vazou := false; resultado := 'erro';
        detalhe := sqlstate || ' — ' || sqlerrm;
    end;
    return next;

    verbo := 'agregar';
    begin
      execute format('select count(*) from public.%I', r.t) into n_total;
      execute format('select count(*) from public.%I where (%s)', r.t, p_minha)
        into n using v_minha;
      vazou := n_total <> n;
      resultado := case when n_total <> n then 'VAZOU' else 'negado' end;
      detalhe := n_total::text || ' no total contra ' || n::text || ' que são suas';
    exception
      when insufficient_privilege then
        vazou := false; resultado := 'sem privilégio';
        detalhe := 'authenticated não tem SELECT aqui';
      when others then
        vazou := false; resultado := 'erro';
        detalhe := sqlstate || ' — ' || sqlerrm;
    end;
    return next;

    verbo := 'inserir';
    if v_alheia is null then
      vazou := false; resultado := 'sem alvo';
      detalhe := 'não há outra empresa neste banco para tentar gravar';
      return next;
    else
      begin
        execute format('select to_jsonb(t) from public.%I t where org_id = $1 limit 1', r.t)
          into v_modelo using v_minha;

        if v_modelo is null then
          vazou := false; resultado := 'sem molde';
          detalhe := 'a sua empresa não tem linha aqui para servir de molde';
        else
          select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
            into v_cols
            from pg_attribute a
            left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
           where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
             and (d.adbin is null or a.attname = 'org_id');

          v_modelo := v_modelo || jsonb_build_object('org_id', v_alheia);

          execute format(
            'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
            r.t, v_cols, v_cols, r.t
          ) using v_modelo;

          vazou := true; resultado := 'VAZOU';
          detalhe := 'gravei uma linha na empresa alheia';
          raise exception using errcode = 'A4P01', message = 'desfazendo a tentativa';
        end if;
      exception
        when sqlstate 'A4P01' then null;
        when insufficient_privilege then
          vazou := false; resultado := 'negado';
          detalhe := 'a política ou a concessão recusou a escrita';
        when others then
          vazou := false; resultado := 'negado';
          detalhe := sqlstate || ' — ' || sqlerrm;
      end;
      return next;
    end if;

    verbo := 'atualizar';
    begin
      execute format('update public.%I set org_id = org_id where (%s)', r.t, p_alheia)
        using v_minha;
      get diagnostics n = row_count;
      vazou := n > 0;
      resultado := case when n > 0 then 'VAZOU' else 'negado' end;
      detalhe := n::text || ' linha(s) alheias alteráveis';
      raise exception using errcode = 'A4P01', message = 'desfazendo a tentativa';
    exception
      when sqlstate 'A4P01' then null;
      when insufficient_privilege then
        vazou := false; resultado := 'sem privilégio';
        detalhe := 'authenticated não tem UPDATE aqui';
      when others then
        vazou := false; resultado := 'negado';
        detalhe := sqlstate || ' — ' || sqlerrm;
    end;
    return next;

    verbo := 'apagar';
    begin
      execute format('delete from public.%I where (%s)', r.t, p_alheia)
        using v_minha;
      get diagnostics n = row_count;
      vazou := n > 0;
      resultado := case when n > 0 then 'VAZOU' else 'negado' end;
      detalhe := n::text || ' linha(s) alheias apagáveis';
      raise exception using errcode = 'A4P01', message = 'desfazendo a tentativa';
    exception
      when sqlstate 'A4P01' then null;
      when insufficient_privilege then
        vazou := false; resultado := 'sem privilégio';
        detalhe := 'authenticated não tem DELETE aqui';
      when others then
        vazou := false; resultado := 'negado';
        detalhe := sqlstate || ' — ' || sqlerrm;
    end;
    return next;

  end loop;

  begin
    for r in select d.funcao::text as t, d.linhas_de_outra_org as n from public.teste_definer() d
    loop
      tabela := 'função ' || r.t;
      verbo := 'definer';
      vazou := r.n > 0;
      resultado := case when r.n > 0 then 'VAZOU' else 'negado' end;
      detalhe := r.n::text || ' linha(s) de outra empresa devolvidas pela função';
      return next;
    end loop;
  exception when others then
    tabela := 'funções definer'; verbo := 'definer'; vazou := false;
    resultado := 'erro'; detalhe := sqlstate || ' — ' || sqlerrm;
    return next;
  end;
end;
$$;

revoke all on function public.teste_isolamento_completo() from public;
grant execute on function public.teste_isolamento_completo() to authenticated;
