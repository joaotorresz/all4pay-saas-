-- ═══════════════════════════════════════════════════════════════════════════
-- RODADA 7 — O LANÇAMENTO APONTA PARA A CATEGORIA DO CADASTRO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Medido em produção (01/10/2026): 1.685 lançamentos reais (fora da amostra)
-- carregam a categoria só no TEXTO livre (`movements.category`), com
-- `category_id` nulo — a dupla morada da categoria. Desses, 1.418 têm o nome
-- igual (sem diferença de caixa/espaço) a UMA categoria do cadastro da mesma
-- empresa; 267 (20 nomes) não têm categoria nenhuma com aquele nome.
--
-- O DRE já casava o texto com a linha declarada PELO NOME, então ligar a chave
-- NÃO move número nenhum: o nome que o relatório lê passa a vir do cadastro
-- (`nomeDaDimensao(categoria)`), e ele é o mesmo texto a menos de maiúscula —
-- que a chave do DRE ignora. O que muda é a integridade: renomear a categoria
-- passa a renomear o lançamento, a lixeira e a regra de folha passam a
-- enxergá-lo, e a conta "quantos lançamentos usam esta categoria" fica certa.
--
-- ⚠️ CONSERVADOR, e cada corte tem motivo:
--   · nome que casa com MAIS de uma categoria → fica (escolher seria chutar);
--   · categoria que não é FOLHA → fica (o gatilho `lancamento_categoria_folha`
--     recusaria, e ligar ao grupo diria que o lançamento é de todas as filhas);
--   · categoria inativa ou na lixeira → fica;
--   · lançamento em mês FECHADO → fica (o gatilho de período recusaria, e mexer
--     em mês fechado é exatamente o que o fechamento existe para impedir);
--   · lançamento da AMOSTRA → fica (a purga o leva embora);
--   · os 267 sem categoria → ficam: criar cadastro é decisão da empresa, e a
--     tela do DRE já oferece (Revisar e declarar cria a categoria que falta).
-- Medido: dos 1.418, nenhum cai em mês fechado, em grupo ou em inativa.
--
-- ⚠️ É uma FUNÇÃO, não um UPDATE solto, para a guarda poder provar os cortes
-- (scripts/categoria-vinculo.sql) e para a próxima leva de legado não exigir
-- outra migration. Ela só liga; nunca troca uma chave já preenchida.
--
-- O gatilho de auditoria registra cada linha alterada — de propósito: a
-- trilha diz que o vínculo foi feito por migration, e quando.

create or replace function public.vincular_categorias_por_nome(p_org uuid default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_n integer;
begin
  with candidatos as (
    select m.id as movimento, (array_agg(c.id))[1] as categoria
    from public.movements m
    join public.categories c
      on c.org_id = m.org_id
     and c.excluido_em is null
     and coalesce(c.active, true)
     and lower(btrim(c.name)) = lower(btrim(m.category))
    where m.category_id is null
      and m.category is not null
      and btrim(m.category) <> ''
      and m.excluido_em is null
      and not m.is_sample
      and (p_org is null or m.org_id = p_org)
    group by m.id
    having count(*) = 1
  )
  update public.movements m
     set category_id = cand.categoria
    from candidatos cand
   where m.id = cand.movimento
     and not exists (
       select 1 from public.categories f
        where f.parent_id = cand.categoria and f.excluido_em is null)
     and not public.periodo_fechado(coalesce(m.competence_date, m.due_date), m.org_id);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.vincular_categorias_por_nome(uuid) from public, anon, authenticated;

do $$
declare
  v_n integer;
begin
  v_n := public.vincular_categorias_por_nome(null);
  raise notice 'vincular_categorias_por_nome: % lançamento(s) ligados à categoria do cadastro', v_n;
end;
$$;
