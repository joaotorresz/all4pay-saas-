-- ═══════════════════════════════════════════════════════════════════════════
-- ONDA 2 · O TESTE DE ISOLAMENTO QUE REALMENTE TENTA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ O QUE ESTA MIGRATION CORRIGE, E COMO FOI MEDIDO
--
-- `teste_isolamento()` (0028) varre toda tabela com `org_id` e faz
-- `execute ... count(*)`. A tabela `subscriptions` tem `org_id` e o papel
-- `authenticated` NÃO tem SELECT nela — de propósito, desde a 0014: ela só é
-- alcançada por funções `SECURITY DEFINER`. O `execute` levanta `42501`, o
-- plpgsql não trata, e **a função inteira aborta**. Reproduzido:
--
--   set local role authenticated; select public.teste_isolamento();
--   → 42501 — permission denied for table subscriptions
--
-- Consequência: o `.rpc()` da tela devolvia erro, e
-- `/dashboard/administration/security` imprimia "Não foi possível testar"
-- desde o dia em que a função foi escrita. O placar "44 tabelas, 0 vazamentos"
-- registrado na época foi medido com um papel privilegiado, não com o papel do
-- cliente — e é por isso que ele passava.
--
-- A parte que estava CERTA e continua: `resumoIsolamento` exige
-- `linhas.length > 0`, então "não testei" nunca virou "aprovado". O instrumento
-- estava mudo, não mentindo.
--
-- ⚠️ E o teste antigo respondia menos do que o nome promete: contava linhas
-- visíveis. Isso é UM verbo. Não respondia se dá para INSERIR na empresa
-- alheia, ATUALIZAR, APAGAR, nem se uma AGREGAÇÃO devolve o número mesmo com as
-- linhas escondidas — que é a mais perigosa das quatro, porque vaza o fato sem
-- vazar a linha, e nenhuma contagem de linhas a enxerga.
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. DE QUEM ISOLAR
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ Por que uma função à parte, e `DEFINER`: para tentar GRAVAR numa empresa
-- alheia é preciso um `org_id` que exista de verdade. Um uuid inventado seria
-- recusado pela chave estrangeira (`23503`) e a recusa NÃO provaria nada sobre
-- a política de linha — provaria só que a empresa não existe. Um teste que
-- passa pelo motivo errado é pior que teste nenhum.
--
-- E não, isto não vaza nada: um `org_id` não é uma credencial. A política
-- escopa por VÍNCULO (`organization_members`), não por conhecer o
-- identificador — se conhecer o uuid bastasse para ler os dados, seria esse o
-- defeito a consertar, e é exatamente isso que o teste abaixo verifica.
create or replace function public._org_alheia()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select o.id
    from public.organizations o
   where not exists (
     select 1 from public.organization_members m
      where m.org_id = o.id and m.user_id = auth.uid()
   )
   order by o.created_at
   limit 1;
$$;

revoke all on function public._org_alheia() from public;
grant execute on function public._org_alheia() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. O TESTE — POR TABELA E POR VERBO
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ `SECURITY INVOKER` (o padrão, declarado aqui por ser a decisão e não o
-- acaso): roda com os privilégios de QUEM CHAMA, contra as políticas de
-- verdade. Uma função `DEFINER` responderia "está tudo bem" sempre, porque o
-- dono enxerga tudo — ela testaria a si mesma.
--
-- ⚠️ Cada tentativa vive no PRÓPRIO subbloco `begin/exception`. Em plpgsql um
-- bloco com `exception` é uma subtransação: o que ele escreveu é desfeito ao
-- capturar. É assim que este teste TENTA GRAVAR de verdade sem deixar nada
-- para trás — e é a diferença entre perguntar "a política parece certa?" e
-- "o banco me deixou?".
--
-- ⚠️ E as variáveis do plpgsql NÃO voltam com o rollback do subbloco (é
-- documentado, "the values of local variables will not be reverted"). É o que
-- permite marcar VAZOU dentro do bloco e ainda assim desfazer a escrita: a
-- gravação some, o veredicto fica.
--
-- ⚠️ Tabela sem privilégio vira LINHA DE RESULTADO ("sem privilégio"), nunca
-- exceção. Foi exatamente uma dessas que desligou o teste anterior inteiro, e
-- "não consegui nem tentar" é uma resposta legítima — que precisa aparecer,
-- não derrubar as outras 44.
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
  p_alheia   text;   -- predicado "esta linha não é minha nem da minha empresa"
  p_minha    text;   -- o complemento dele
begin
  -- ⚠️ Sem empresa ativa não há de quem isolar, e responder "0 vazamentos"
  -- seria aprovar por ausência de dado. Devolve UMA linha que diz isso —
  -- `resumoIsolamento` já trata "não testei" como reprovação.
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

    -- ⚠️ ALHEIO É "NEM MEU NEM DA MINHA EMPRESA" — não "de outra empresa".
    --
    -- A primeira versão deste teste equiparava as duas coisas e ACUSOU
    -- `organization_members` de vazar, em `ler` e em `agregar`. Conferido linha
    -- a linha: eram os vínculos DO PRÓPRIO USUÁRIO na outra empresa dele, que
    -- é exatamente o que faz o seletor de empresa existir. Ou seja, o teste
    -- caiu na MESMA armadilha que ele foi escrito para denunciar no auditor —
    -- confundir "recortado por outro critério" com "não recortado".
    --
    -- Em `organization_members` e `user_active_org` o dono da linha é o
    -- USUÁRIO, não a empresa. Por isso o predicado é montado da tabela: quando
    -- existe `user_id`, a linha do próprio usuário nunca é alheia.
    select exists (
      select 1 from pg_attribute a
       where a.attrelid = r.oid and a.attname = 'user_id' and not a.attisdropped
    ) into v_tem_user;

    p_alheia := 'org_id is distinct from $1'
             || case when v_tem_user then ' and user_id is distinct from auth.uid()' else '' end;
    p_minha  := 'org_id is not distinct from $1'
             || case when v_tem_user then ' or user_id is not distinct from auth.uid()' else '' end;

    -- ───────────────── LEITURA ─────────────────
    -- "Existe linha visível para mim que não é minha nem da minha empresa?"
    verbo := 'ler';
    begin
      execute format(
        'select count(*) from public.%I where (%s)', r.t, p_alheia
      ) into n using v_minha;
      vazou := n > 0;
      resultado := case when n > 0 then 'VAZOU' else 'negado' end;
      detalhe := n::text || ' linha(s) de outra empresa visíveis';
    exception
      when insufficient_privilege then
        vazou := false; resultado := 'sem privilégio';
        detalhe := 'authenticated não tem SELECT aqui — fechada por concessão, não por política';
      when others then
        vazou := false; resultado := 'erro';
        detalhe := sqlstate || ' — ' || sqlerrm;
    end;
    return next;

    -- ───────────────── AGREGAÇÃO ─────────────────
    -- ⚠️ Pergunta DIFERENTE da leitura, e é a que ninguém faz: uma agregação
    -- pode devolver o NÚMERO sem devolver a LINHA. "Quantos lançamentos a
    -- empresa B tem" e "quanto ela faturou" são respostas que vazam fato sem
    -- vazar registro — e nenhum teste de contagem de linhas as enxerga.
    -- Aqui o total visível é confrontado com o total da própria empresa: se
    -- divergirem, a agregação está enxergando o que a leitura esconde.
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

    -- ───────────────── ESCRITA ─────────────────
    -- Tenta gravar uma linha PERTENCENTE a outra empresa, usando uma linha da
    -- própria empresa como molde.
    --
    -- ⚠️ As colunas com DEFAULT ficam de fora da lista (id, created_at, …)
    -- para o banco as regenerar — `org_id` é a exceção declarada, porque é
    -- justamente ele que o teste precisa forçar. Sem isso, o `id` copiado
    -- colidiria com a chave primária e a recusa (23505) seria confundida com
    -- recusa da política.
    verbo := 'inserir';
    if v_alheia is null then
      vazou := false; resultado := 'sem alvo';
      detalhe := 'não há outra empresa neste banco para tentar gravar';
      return next;
    else
      begin
        execute format(
          'select to_jsonb(t) from public.%I t where org_id = $1 limit 1', r.t
        ) into v_modelo using v_minha;

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
          -- Força o rollback do subbloco. O veredicto acima sobrevive; a linha,
          -- não. Código próprio para não ser confundido com falha de verdade.
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

    -- ───────────────── ATUALIZAÇÃO ─────────────────
    -- `set org_id = org_id` não muda nada: o que interessa é QUANTAS linhas de
    -- outra empresa o banco deixou tocar.
    verbo := 'atualizar';
    begin
      execute format(
        'update public.%I set org_id = org_id where (%s)', r.t, p_alheia
      ) using v_minha;
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

    -- ───────────────── EXCLUSÃO ─────────────────
    -- ⚠️ Precisa de teste próprio porque `with check` NÃO cobre exclusão:
    -- uma tabela pode recusar a escrita e ainda assim aceitar o apagamento, e
    -- apagar é a forma mais completa de alterar.
    verbo := 'apagar';
    begin
      execute format(
        'delete from public.%I where (%s)', r.t, p_alheia
      ) using v_minha;
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

  -- ───────────────── FUNÇÕES `SECURITY DEFINER` ─────────────────
  -- ⚠️ Elas rodam com os privilégios do DONO e por isso **passam por cima da
  -- política de linha** — são o caminho mais curto para um vazamento que
  -- nenhuma varredura de tabela enxerga. `teste_definer()` (0033) já as
  -- confronta uma a uma; o que faltava era o resultado dela aparecer no MESMO
  -- painel, em vez de num relatório separado que ninguém abre.
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

-- ───────────────────────────────────────────────────────────────────────────
-- 3. O MESMO TESTE, REGISTRADO
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ Abrir a tela só LÊ; o botão "Testar agora" é que grava. Registrar a cada
-- montagem encheria a trilha de eventos que ninguém pediu, e trilha com ruído
-- é trilha que não se lê.
--
-- ⚠️ O rótulo do evento MUDA quando há achado (`isolamento.VAZAMENTO`): um
-- vazamento não pode ficar com o mesmo nome dos dias em que estava tudo certo,
-- senão a busca que procura o incidente devolve trezentos dias normais.
--
-- E o que fica registrado é a VERIFICAÇÃO, não a tentativa: a política de
-- linha esconde SEM deixar rastro — uma linha filtrada é indistinguível de uma
-- que não existe, e o PostgreSQL não tem como registrar o que a política
-- escondeu sem transformar cada consulta do produto num registro. É a
-- diferença entre "o isolamento está certo" e "o isolamento foi conferido no
-- dia tal e estava certo"; a segunda é a que uma auditoria consegue ler.
create or replace function public.verificar_isolamento_completo()
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
  v_res     jsonb;
  v_linhas  jsonb;
  v_vazou   int;
  v_tabelas int;
begin
  -- ⚠️ O resultado é materializado UMA vez, num jsonb, e não recalculado para
  -- o registro e de novo para a resposta. Rodar duas vezes deixaria a trilha
  -- afirmando um resultado que não é o que a tela mostrou — e são justamente
  -- as tentativas de escrita que não podem acontecer duas vezes por clique.
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    into v_res
    from public.teste_isolamento_completo() t;

  select count(*) filter (where (e ->> 'vazou')::boolean),
         count(distinct (e ->> 'tabela'))
    into v_vazou, v_tabelas
    from jsonb_array_elements(v_res) e;

  select coalesce(jsonb_agg(jsonb_build_object(
           'tabela', e ->> 'tabela', 'verbo', e ->> 'verbo', 'detalhe', e ->> 'detalhe'
         )), '[]'::jsonb)
    into v_linhas
    from jsonb_array_elements(v_res) e
   where (e ->> 'vazou')::boolean;

  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (
    public.auth_org_id(),
    coalesce(auth.uid()::text, 'desconhecido'),
    case when v_vazou > 0 then 'isolamento.VAZAMENTO' else 'isolamento.verificar' end,
    null,
    jsonb_build_object(
      'tabelas', v_tabelas,
      'tentativas', jsonb_array_length(v_res),
      'vazamentos', v_vazou,
      'onde', v_linhas
    )
  );

  return query
    select e ->> 'tabela', e ->> 'verbo', e ->> 'resultado',
           (e ->> 'vazou')::boolean, e ->> 'detalhe'
      from jsonb_array_elements(v_res) e;
end;
$$;

revoke all on function public.verificar_isolamento_completo() from public;
grant execute on function public.verificar_isolamento_completo() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. AS ANTIGAS PARAM DE ABORTAR
-- ───────────────────────────────────────────────────────────────────────────
--
-- Elas continuam existindo porque endereços antigos e a tela em produção
-- ainda as chamam enquanto o deploy não sai. O conserto é o mesmo: uma tabela
-- sem privilégio vira linha, não exceção.
create or replace function public.teste_isolamento()
returns table(tabela text, linhas_de_outra_org bigint, visiveis bigint)
language plpgsql
security invoker
set search_path to 'public'
as $$
declare r record; v_org uuid := public.auth_org_id(); n bigint; v bigint;
begin
  for r in
    select c.relname as t
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
     where ns.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  loop
    begin
      execute format(
        'select count(*) filter (where org_id is distinct from $1), count(*) from public.%I', r.t
      ) into n, v using v_org;
      tabela := r.t; linhas_de_outra_org := n; visiveis := v;
      return next;
    exception when insufficient_privilege then
      -- Sem SELECT: nada a conferir e nada a esconder. Continua a varredura.
      null;
    end;
  end loop;
end;
$$;
