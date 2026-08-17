-- ═══════════════════════════════════════════════════════════════════════════
-- O INVENTÁRIO DE OBJETOS — A4P-076
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `npm run esquema` compara NOMES DE MIGRATION. Isso deixa passar o defeito que
-- o nome não alcança: um objeto criado à mão em produção, que migration nenhuma
-- produz. Foi assim que `maq_cnpj_cache` viveu meses no banco sem estar no
-- repositório — descoberta só quando uma migration tentou tocá-la e o CI
-- reprovou com `relation does not exist`.
--
-- Este arquivo emite o inventário CANÔNICO, uma linha por objeto, no formato
-- `tipo:nome|assinatura`. A assinatura é um md5 do que define o objeto — não do
-- seu texto — para que reformatação não vire divergência e mudança de
-- comportamento vire.
--
--   · tabela  → colunas, tipos e nulidade, na ordem
--   · funcao  → assinatura de argumentos, SECURITY DEFINER, search_path, volatilidade
--   · policy  → comando, USING e WITH CHECK
--   · grant   → os privilégios de anon / authenticated / service_role
--
-- ⚠️ `anon`, `authenticated` e `service_role` são os únicos papéis olhados de
-- propósito: são os que chegam pela rede. Um grant a `postgres` não é superfície
-- de ataque; um grant a `anon` é.

\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'

with tabelas as (
  select 'tabela:' || c.relname as obj,
         md5(string_agg(
           a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text,
           ',' order by a.attnum)) as sig
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where n.nspname = 'public' and c.relkind in ('r','v','m','p')
  group by c.relname
), funcoes as (
  select 'funcao:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as obj,
         md5(p.prosecdef::text || coalesce(p.proconfig::text,'') || p.provolatile::text) as sig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
), pols as (
  select 'policy:' || c.relname || '.' || p.polname as obj,
         md5(p.polcmd::text
             || coalesce(pg_get_expr(p.polqual, p.polrelid), '')
             || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) as sig
  from pg_policy p join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
), grants as (
  -- ⚠️ **LÊ O ACL DO CATÁLOGO, não `information_schema.role_table_grants`.**
  --
  -- Aquela view é FILTRADA por privilégio: só mostra grants onde o papel
  -- corrente é grantor, grantee ou membro. Medido em 17/08: como `anon` (sem
  -- SELECT em tabela de cliente, o mesmo perfil do `ci_leitor` do CI), ela volta
  -- ZERO linhas — e a guarda acusaria todos os grants como ausentes.
  --
  -- `aclexplode(relacl)` sobre `pg_class` é catálogo puro: qualquer papel que
  -- enxerga `pg_class` lê o ACL inteiro. Testado como `anon`: os grants de
  -- `authenticated` aparecem idênticos ao que `postgres` vê. É o que torna o
  -- retrato gerado como admin igual ao que o `ci_leitor` produz — sem dar a ele
  -- SELECT em dado de cliente.
  --
  -- ⚠️ **`service_role` ENTRA, e tirá-lo foi um erro que ficou registrado.**
  --
  -- Ele chegou a sair daqui por um raciocínio correto com efeito errado:
  -- nenhuma migration deste repositório concede a `service_role` (`grep`
  -- devolve ZERO — todo grant a ele é da PLATAFORMA), e como esta consulta
  -- alimenta uma comparação com o banco EFÊMERO, cujos defaults de plataforma
  -- divergem do hospedado, os 77 grants apareciam como DERIVA e soterravam o
  -- sinal real. A conclusão de tirá-los estava errada: `service_role` é **a
  -- chave que passa POR FORA do RLS**, e é o que sobrou aberto do A4P-077.
  -- Tirá-lo da guarda faz mudança nesses grants virar INVISÍVEL — e a próxima
  -- porta aberta seria exatamente ali.
  --
  -- ⚠️ Medido em 17/08, e é isto que dá conteúdo à linha de base: os 77 têm
  -- **duas** assinaturas, não uma. `audit_log`, `admin_audit` e `admin_acessos`
  -- não têm **TRUNCATE** (a revogação da ONDA 9); as outras 74 têm. Ou seja: o
  -- dia em que `audit_log.service_role` recuperar TRUNCATE, a trilha de
  -- auditoria vira apagável pela chave que ignora RLS — e é precisamente essa
  -- mudança que o filtro teria escondido.
  --
  -- O ruído vira LINHA DE BASE, não cegueira: o comparador não confronta estes
  -- grants com o efêmero (ali eles são default de plataforma, e a comparação não
  -- diz nada); confronta com a lista DECLARADA em `grants_service_role` do
  -- retrato, e reprova quando um aparece, some ou muda de privilégio.
  select 'grant:' || c.relname || '.' || acl.grantee::regrole::text as obj,
         md5(string_agg(acl.privilege_type, ',' order by acl.privilege_type)) as sig
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  cross join lateral aclexplode(c.relacl) acl
  where c.relkind in ('r','v','m','p')
    and acl.grantee::regrole::text in ('anon','authenticated','service_role')
  group by c.relname, acl.grantee::regrole::text
)
select obj || '|' || sig
from (select * from tabelas union all select * from funcoes
      union all select * from pols union all select * from grants) t
order by obj;
