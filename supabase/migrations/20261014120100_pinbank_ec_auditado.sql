-- ═══════════════════════════════════════════════════════════════════════════
-- O EC VISÍVEL, AUDITADO E DE UMA EMPRESA SÓ (D10, 14/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O `codigo_cliente` do vínculo (o EC — o código do estabelecimento no extrato
-- consolidado da Pinbank) é o que a conferência extrato × sistema manda à
-- Pinbank. Ele é DIGITADO pela plataforma no `/admin`, e a credencial da
-- plataforma lê o extrato de QUALQUER EC do canal: um dígito trocado deixaria
-- uma empresa ler o extrato de outra loja. Até aqui:
--   · o painel do `/admin` não mostrava o EC de cada vínculo (ninguém via o erro);
--   · o `admin_audit` do vínculo não guardava o EC (ninguém sabia quem o digitou);
--   · nada impedia o MESMO EC vivo em duas empresas;
--   · e o desvínculo da plataforma — o caminho para corrigir um EC errado — a
--     própria EMPRESA desfazia: a lixeira genérica (`restaurar_logico`, com o
--     papel de lançador) devolvia à vida o vínculo que a plataforma tirou, com
--     o EC dentro, sem passar pelo rastro da plataforma.
--
-- Esta migration fecha as quatro:
--   (a) `admin_pinbank_painel` devolve o `codigo_cliente` de cada vínculo
--       (mesma assinatura, mesmo portão `admin_exigir_acesso`);
--   (b) `admin_pinbank_vincular` grava o `codigo_cliente` no `admin_audit`, e
--       `admin_pinbank_desvincular` também (o rastro diz qual EC saiu);
--   (c) o BANCO recusa o EC vivo repetido ENTRE EMPRESAS — por uma RESTRIÇÃO
--       DE EXCLUSÃO, que vale para qualquer escritor E em qualquer nível de
--       isolamento — e o EC que não é positivo (gatilho);
--   (d) o CICLO do vínculo é da PLATAFORMA: o vínculo desvinculado não volta
--       (religar é vincular de novo, com o rastro), só o desvincular da
--       plataforma o exclui, ele só se apaga junto com a empresa, e a lixeira
--       da empresa não o lista.
--
-- ⚠️ **A MESMA EMPRESA com várias maquininhas no mesmo EC continua permitida.**
-- É o caso legítimo das irmãs (`vinculosDoEstabelecimento` na conferência): um
-- EC é UMA loja, e uma loja pode ter várias maquininhas. O que se recusa é o EC
-- em DUAS empresas — isso é sempre o extrato de uma lida pela outra.
--
-- ⚠️ **A TRAVA É A RESTRIÇÃO, NÃO O GATILHO.** `exclude using gist
-- (codigo_cliente with =, org_id with <>)` sobre os vínculos VIVOS com EC: o
-- Postgres confere contra as linhas que outras transações acabaram de gravar
-- (inclusive as ainda não confirmadas, esperando por elas), seja qual for o
-- nível de isolamento de quem grava. O gatilho, sozinho, não bastava: ele
-- confere com o RETRATO da transação, e em REPEATABLE READ (medido com duas
-- sessões) a segunda transação não via a linha que a primeira tinha acabado de
-- gravar — as duas empresas ficavam com o EC. O gatilho fica para DIZER o
-- motivo: a frase nomeada ("já está vinculado a outra empresa"), o EC que não
-- é positivo, e — em READ COMMITTED, o das RPCs — a trava pelo EC
-- (`pg_advisory_xact_lock`), que faz a segunda gravação esperar a primeira e
-- receber a FRASE em vez do erro cru da restrição (23P01).
--
-- ⚠️ **`btree_gist`** (extensão do próprio Postgres, liberada no Supabase) é o
-- que dá ao índice GiST a igualdade de `bigint` e o "diferente" de `uuid`. Ela
-- vai para o esquema `extensions`, nunca para `public`: em `public` as
-- funções dela entrariam no inventário de objetos como se fossem nossas. Se o
-- papel que aplica as migrations não puder criá-la, esta migration FALHA,
-- nomeada — nunca pula a trava em silêncio.
--
-- ⚠️ **O vínculo EXCLUÍDO não conta** (`excluido_em is null`), na mesma regra
-- dos índices únicos do estabelecimento e da chave: desvincular libera o EC.
--
-- ⚠️ **O ACERVO É CONFERIDO ANTES** e a migration se RECUSA se já houver EC
-- vivo repetido entre empresas ou EC vivo que não é positivo. Não apaga nada e
-- não pula em silêncio: decidir qual vínculo está errado é trabalho de gente.
-- ⚠️ A recusa diz a CLASSE e QUANTOS, nunca o EC nem as empresas: quem aplica
-- é o job `migrar` do CI, e o log dele é PÚBLICO. As consultas que nomeiam
-- cada conflito estão em `docs/rodada-10/conferencia.md` (decisão D2, "Conferir
-- o acervo ANTES do merge"), para rodar no SQL Editor do Supabase com a
-- credencial certa.
--
-- ⚠️ **FORA DE ESCOPO, declarado:** não há RPC de EDIÇÃO do EC. Corrigir um EC
-- errado continua sendo desvincular (com motivo, auditado) e vincular de novo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 0. O ACERVO — recusa pela classe e pela contagem, nunca limpeza calada
-- ───────────────────────────────────────────────────────────────────────────
do $acervo$
declare
  v_repetidos bigint;
  v_invalidos bigint;
begin
  select count(*) into v_repetidos
    from (select v.codigo_cliente
            from public.pinbank_vinculos v
           where v.excluido_em is null and v.codigo_cliente is not null
           group by v.codigo_cliente
          having count(distinct v.org_id) > 1) x;
  if v_repetidos > 0 then
    raise exception 'A4P-PINBANK: há % código(s) do estabelecimento (EC) vivo(s) em mais de uma empresa. Esta migration não apaga nada e não escreve os códigos nem as empresas (o log do CI é público): rode a consulta "EC vivo em mais de uma empresa" de docs/rodada-10/conferencia.md (decisão D2, "Conferir o acervo ANTES do merge") no SQL Editor do Supabase, desvincule no /admin o vínculo errado (com motivo) e aplique de novo.', v_repetidos
      using errcode = 'unique_violation';
  end if;

  select count(*) into v_invalidos
    from public.pinbank_vinculos v
   where v.excluido_em is null and v.codigo_cliente is not null and v.codigo_cliente <= 0;
  if v_invalidos > 0 then
    raise exception 'A4P-PINBANK: há % vínculo(s) vivo(s) com o código do estabelecimento (EC) que não é positivo. Esta migration não apaga nada e não escreve os vínculos (o log do CI é público): rode a consulta "EC vivo que não é positivo" de docs/rodada-10/conferencia.md (decisão D2, "Conferir o acervo ANTES do merge") no SQL Editor do Supabase, desvincule no /admin e vincule de novo com o EC certo.', v_invalidos
      using errcode = 'check_violation';
  end if;
end
$acervo$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. UM EC VIVO, UMA EMPRESA — a restrição (a trava) e o gatilho (a frase)
-- ───────────────────────────────────────────────────────────────────────────
create extension if not exists btree_gist with schema extensions;

alter table public.pinbank_vinculos drop constraint if exists pinbank_vinculos_ec_uma_empresa_excl;
alter table public.pinbank_vinculos
  add constraint pinbank_vinculos_ec_uma_empresa_excl
  exclude using gist (codigo_cliente with =, org_id with <>)
  where (excluido_em is null and codigo_cliente is not null);
-- ⚠️ Sem `comment on constraint`: o registro de DDL anota a restrição como "<nome> on public.<tabela>",
-- forma que a guarda de DDL sem migration (`npm run ddl`) não reconhece — e o `esquema-prod` do `main`
-- reprovaria por um comentário. O porquê da restrição mora aqui, no arquivo.

-- SECURITY DEFINER: a busca tem de enxergar os vínculos de TODAS as empresas,
-- seja quem for o escritor (a política de linha recortaria pela empresa aberta).
create or replace function public.pinbank_vinculo_ec_uma_empresa()
returns trigger
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  -- Excluído, ou sem EC: nada a conferir (desvincular libera o EC).
  if new.excluido_em is not null or new.codigo_cliente is null then
    return new;
  end if;
  if new.codigo_cliente <= 0 then
    raise exception 'A4P-PINBANK: o código do estabelecimento no extrato (EC) % não é válido: tem de ser um número maior que zero.', new.codigo_cliente
      using errcode = 'check_violation';
  end if;
  -- Em READ COMMITTED, a segunda gravação do MESMO EC espera a primeira terminar e, ao conferir, já a
  -- enxerga — e recebe a frase abaixo em vez do erro cru da restrição (que é quem trava de fato).
  perform pg_advisory_xact_lock(hashtext('a4p.pinbank_vinculos.codigo_cliente'), hashint8(new.codigo_cliente));
  if exists (
    select 1 from public.pinbank_vinculos v
     where v.codigo_cliente = new.codigo_cliente
       and v.excluido_em is null
       and v.org_id <> new.org_id
       and v.id <> new.id
  ) then
    raise exception 'A4P-PINBANK: o código do estabelecimento no extrato (EC) % já está vinculado a outra empresa.', new.codigo_cliente
      using errcode = 'unique_violation',
            hint = 'Um EC é o extrato de UMA loja. Confira o número com a Pinbank; se a maquininha mudou de empresa, desvincule-a na outra primeiro.';
  end if;
  return new;
end;
$$;

revoke all on function public.pinbank_vinculo_ec_uma_empresa() from public, anon, authenticated, service_role;

-- ⚠️ Só as colunas que decidem o conflito disparam: configurar taxas e conta
-- (`pinbank_configurar_vinculo`) não toca nelas e não paga a trava.
drop trigger if exists pinbank_vinculos_ec_uma_empresa on public.pinbank_vinculos;
create trigger pinbank_vinculos_ec_uma_empresa
  before insert or update of codigo_cliente, org_id, excluido_em on public.pinbank_vinculos
  for each row execute function public.pinbank_vinculo_ec_uma_empresa();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. O CICLO DO VÍNCULO É DA PLATAFORMA — para qualquer escritor
-- ───────────────────────────────────────────────────────────────────────────
-- Só a plataforma liga um estabelecimento a uma empresa (`admin_pinbank_vincular`)
-- e só ela o desliga (`admin_pinbank_desvincular`, com motivo e rastro). A
-- lixeira genérica (`excluir_logico`, `restaurar_logico`, `lixeira_expurgar`)
-- alcança toda tabela com `excluido_em` — e alcançava esta, com o papel de
-- LANÇADOR: a empresa desfazia o desvínculo da plataforma (o EC errado voltava
-- vivo, a espera da conferência voltava a aceitar o vínculo, o webhook voltava
-- a lançar as vendas daquela loja na empresa) e tirava a maquininha sem o
-- rastro da plataforma. Aqui, na tabela — vale para a lixeira, para a chave de
-- serviço, para o `psql` na mão e para a função que ainda não foi escrita:
--   · REATIVAR (`excluido_em` → nulo): nunca. Religar é vincular de novo, com
--     uma linha nova e o rastro (o vínculo antigo fica como registro);
--   · EXCLUIR (`excluido_em` ← data): só dentro de `admin_pinbank_desvincular`,
--     que liga a marca `a4p.pinbank_desvincular` (local à transação, com o id
--     do vínculo) só durante o UPDATE dela — nenhuma outra função a liga, e o
--     PostgREST não deixa o cliente ligá-la;
--   · APAGAR: só junto com a empresa (a cascata de `organizations`, quando ela
--     já não existe). Desvinculado, o vínculo é o registro de quem desligou a
--     loja, quando e por quê.
-- SECURITY DEFINER: a conferência da empresa (no apagar) não pode depender do
-- que a política de linha de `organizations` mostra a quem grava.
create or replace function public.pinbank_vinculo_ciclo_da_plataforma()
returns trigger
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.organizations o where o.id = old.org_id) then
      raise exception 'A4P-PINBANK: o vínculo da maquininha é registro da plataforma e não se apaga: desvinculado, ele guarda quem o desligou, quando e por quê.'
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;
  if old.excluido_em is not null and new.excluido_em is null then
    raise exception 'A4P-PINBANK: vínculo desvinculado não volta: para religar a maquininha, a plataforma vincula de novo (com o rastro).'
      using errcode = 'insufficient_privilege';
  end if;
  if old.excluido_em is null and new.excluido_em is not null
     and current_setting('a4p.pinbank_desvincular', true) is distinct from old.id::text then
    raise exception 'A4P-PINBANK: só a plataforma desvincula a maquininha (com motivo e rastro): a lixeira da empresa não alcança o vínculo.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function public.pinbank_vinculo_ciclo_da_plataforma() from public, anon, authenticated, service_role;

drop trigger if exists pinbank_vinculos_ciclo_da_plataforma on public.pinbank_vinculos;
create trigger pinbank_vinculos_ciclo_da_plataforma
  before update of excluido_em or delete on public.pinbank_vinculos
  for each row execute function public.pinbank_vinculo_ciclo_da_plataforma();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. O VÍNCULO GRAVA O EC NO RASTRO DA PLATAFORMA
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.admin_pinbank_vincular(
  p_org uuid, p_estabelecimento_id bigint, p_chave_gateway text, p_nome text, p_codigo_cliente bigint default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  perform public.admin_exigir_acesso('admin_pinbank_vincular', p_org::text);
  if not exists (select 1 from public.organizations o where o.id = p_org) then
    raise exception 'A4P-PINBANK: empresa % não existe.', p_org using errcode = 'no_data_found';
  end if;
  insert into public.pinbank_vinculos (org_id, estabelecimento_id, chave_gateway, nome, codigo_cliente, criado_por)
  values (p_org, p_estabelecimento_id, nullif(btrim(coalesce(p_chave_gateway, '')), ''),
          nullif(btrim(coalesce(p_nome, '')), ''), p_codigo_cliente, auth.uid())
  returning id into v_id;

  -- A quarentena desse estabelecimento passa a esperar a ATIVAÇÃO da empresa.
  update public.pinbank_eventos e
     set org_id = p_org, vinculo_id = v_id, situacao = 'aguardando_ativacao',
         motivo = 'Vinculado pela plataforma; aguardando a empresa ativar.'
   where e.situacao = 'sem_vinculo'
     and ((p_estabelecimento_id is not null and e.estabelecimento_id = p_estabelecimento_id)
       or (p_chave_gateway is not null and e.chave_gateway = btrim(p_chave_gateway)));

  -- ⚠️ O EC entra no rastro: é ele que a conferência manda à Pinbank, e um EC
  -- errado é o extrato de outra loja — o rastro diz quem o digitou e quando.
  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'pinbank.vincular', p_org::text,
          jsonb_build_object('vinculo', v_id, 'estabelecimento_id', p_estabelecimento_id,
                             'chave_gateway', p_chave_gateway, 'nome', p_nome,
                             'codigo_cliente', p_codigo_cliente));
  return v_id;
end;
$$;

create or replace function public.admin_pinbank_desvincular(p_vinculo uuid, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
  v_ec bigint;
begin
  perform public.admin_exigir_acesso('admin_pinbank_desvincular', p_vinculo::text);
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'A4P-PINBANK: desvincular exige motivo (10+ caracteres).' using errcode = 'check_violation';
  end if;
  -- ⚠️ A marca que o gatilho do ciclo confere: só esta função exclui o vínculo
  -- (local à transação, ligada só durante o UPDATE e com o id DESTE vínculo).
  perform set_config('a4p.pinbank_desvincular', p_vinculo::text, true);
  update public.pinbank_vinculos
     set ativo = false, excluido_em = now(), excluido_por = auth.uid(), excluido_motivo = btrim(p_motivo)
   where id = p_vinculo and excluido_em is null
  returning org_id, codigo_cliente into v_org, v_ec;
  perform set_config('a4p.pinbank_desvincular', '', true);
  if v_org is null then
    raise exception 'A4P-PINBANK: vínculo % não encontrado.', p_vinculo using errcode = 'no_data_found';
  end if;
  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'pinbank.desvincular', v_org::text,
          jsonb_build_object('vinculo', p_vinculo, 'motivo', btrim(p_motivo), 'codigo_cliente', v_ec));
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. O PAINEL MOSTRA O EC DE CADA VÍNCULO
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.admin_pinbank_painel()
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  perform public.admin_exigir_acesso('admin_pinbank_painel', null);
  return jsonb_build_object(
    'vinculos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'org_id', v.org_id, 'empresa', o.name,
               'estabelecimento_id', v.estabelecimento_id, 'chave_gateway', v.chave_gateway,
               'codigo_cliente', v.codigo_cliente,
               'nome', v.nome, 'ativo', v.ativo, 'criado_em', v.criado_em) order by v.criado_em desc)
        from public.pinbank_vinculos v join public.organizations o on o.id = v.org_id
       where v.excluido_em is null), '[]'::jsonb),
    'quarentena', coalesce((
      select jsonb_agg(s.q order by s.ultimo desc)
        from (
          select jsonb_build_object(
                   'estabelecimento_id', e.estabelecimento_id, 'chave_gateway', e.chave_gateway,
                   'nome', max(e.estabelecimento_nome), 'eventos', count(*),
                   'ultimo', max(e.recebido_em)) as q,
                 max(e.recebido_em) as ultimo
            from public.pinbank_eventos e
           where e.situacao = 'sem_vinculo'
           group by e.estabelecimento_id, e.chave_gateway
           limit 200
        ) s), '[]'::jsonb));
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. A LIXEIRA DA EMPRESA NÃO LISTA O VÍNCULO DA PLATAFORMA
-- ───────────────────────────────────────────────────────────────────────────
-- A mesma função de 20260811013123, com UMA mudança: as tabelas cujo ciclo é
-- da PLATAFORMA saem da varredura. O vínculo desvinculado aparecia na lixeira
-- de todo membro da empresa (até do leitor), com o e-mail do administrador da
-- plataforma e o motivo dele, ao lado de um "Restaurar" que o gatilho do ciclo
-- agora recusa. A lixeira lista o que a EMPRESA tirou e pode devolver.
create or replace function public.lixeira_listar(p_dias int default 90)
returns table(
  entidade text, id text, excluido_em timestamptz,
  excluido_por uuid, excluido_por_email text, motivo text, resumo text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record; v_org uuid := public.auth_org_id(); v_sql text; v_partes text[] := '{}';
        -- ⚠️ O ciclo destas é da PLATAFORMA (o gatilho `*_ciclo_da_plataforma` recusa restaurar e apagar).
        v_da_plataforma constant text[] := array['pinbank_vinculos'];
begin
  if v_org is null then return; end if;
  for r in
    select c.relname::text as t, c.oid
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'excluido_em' and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'r'
       and exists (select 1 from pg_attribute b
                    where b.attrelid = c.oid and b.attname = 'id' and not b.attisdropped)
       and c.relname <> all (v_da_plataforma)
     order by c.relname
  loop
    -- ⚠️ O "resumo" tenta `description` e depois `name`: sem ele a lixeira
    -- lista identificadores, e ninguém reconhece o que apagou por um uuid.
    v_partes := v_partes || format(
      'select %L::text, t.id::text, t.excluido_em, t.excluido_por, t.excluido_motivo,
              coalesce(%s, %s, %L)::text
         from public.%I t
        where t.org_id = %L and t.excluido_em is not null
          and t.excluido_em > now() - make_interval(days => %s)',
      r.t,
      case when exists (select 1 from pg_attribute a where a.attrelid=r.oid and a.attname='description' and not a.attisdropped)
           then 't.description' else 'null' end,
      case when exists (select 1 from pg_attribute a where a.attrelid=r.oid and a.attname='name' and not a.attisdropped)
           then 't.name' else 'null' end,
      r.t, r.t, v_org, greatest(1, coalesce(p_dias, 90))
    );
  end loop;

  if array_length(v_partes, 1) is null then return; end if;
  v_sql := array_to_string(v_partes, ' union all ');

  return query execute format(
    'select x.entidade, x.id, x.excluido_em, x.excluido_por, u.email::text, x.motivo, x.resumo
       from (%s) as x(entidade, id, excluido_em, excluido_por, motivo, resumo)
       left join auth.users u on u.id = x.excluido_por
      order by x.excluido_em desc', v_sql);
end;
$$;

-- `create or replace` mantém as concessões; reafirmadas para o arquivo dizer quem chama.
-- (As de `lixeira_listar` ficam como 20260811013123 as deixou: esta migration
-- muda o que ela lista, não quem a chama.)
revoke all on function public.admin_pinbank_vincular(uuid, bigint, text, text, bigint) from public, anon;
revoke all on function public.admin_pinbank_desvincular(uuid, text) from public, anon;
revoke all on function public.admin_pinbank_painel() from public, anon;
grant execute on function public.admin_pinbank_vincular(uuid, bigint, text, text, bigint) to authenticated;
grant execute on function public.admin_pinbank_desvincular(uuid, text) to authenticated;
grant execute on function public.admin_pinbank_painel() to authenticated;
