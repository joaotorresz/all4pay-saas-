-- ═══════════════════════════════════════════════════════════════════════════
-- AS VENDAS ANTIGAS GANHAM NÚMERO (30/09/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A coluna `sales_docs.numero` nasceu em 20260930150000. As vendas gravadas
-- antes dela (pelo lançamento rápido) ficaram sem número, e a tela mostrava um
-- pedaço do uuid no lugar — que não se fala ao cliente, não se procura na busca
-- e não aparece em nota nenhuma.
--
-- Cada venda viva sem número recebe o próximo do ANO dela, por empresa, na
-- ordem em que foi criada — continuando depois do maior número que já exista
-- (máximo + 1, a mesma regra de `proximoNumeroDe`). Idempotente: só toca quem
-- não tem número, então reaplicar não renumera nada.

with maiores as (
  select org_id,
         extract(year from doc_date)::int as ano,
         max(nullif(split_part(numero, '-', 2), '')::int) as maior
    from public.sales_docs
   where kind = 'venda' and numero ~ '^\d{4}-\d+$' and excluido_em is null
   group by 1, 2
), sem_numero as (
  select d.id, d.org_id,
         extract(year from d.doc_date)::int as ano,
         row_number() over (partition by d.org_id, extract(year from d.doc_date)
                            order by d.created_at, d.id) as ordem
    from public.sales_docs d
   where d.kind = 'venda' and d.numero is null and d.excluido_em is null
)
update public.sales_docs s
   set numero = sn.ano::text || '-' || lpad((coalesce(m.maior, 0) + sn.ordem)::text, 4, '0')
  from sem_numero sn
  left join maiores m on m.org_id = sn.org_id and m.ano = sn.ano
 where s.id = sn.id;
