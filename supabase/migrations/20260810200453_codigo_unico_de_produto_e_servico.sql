-- ============================================================================
-- CÓDIGO DE ITEM ÚNICO POR EMPRESA — a pré-condição de qualquer saldo
-- ============================================================================
-- Sem unicidade, "saldo do item 223321" não é uma pergunta respondível: hoje
-- cinco PRODUTOS DIFERENTES carregam esse código (garrafa, camiseta, três
-- telesenas). Não é duplicata de registro — é o mesmo código reaproveitado,
-- que é pior: fundir os registros apagaria produtos reais, um deles com quatro
-- vendas ligadas.
--
-- ⚠️ NADA É APAGADO, NADA É FUNDIDO. O código fica com quem tem VENDAS (e, no
-- empate, com o mais antigo); os demais ficam com o campo VAZIO, para ser
-- preenchido. Vazio diz "falta preencher"; um `223321-3` inventado diria "este
-- é o código", o que seria falso.
--
-- Seguro porque o SKU não é chave de nada no app: ele é exibido e entra na
-- busca por texto, e nenhuma consulta casa por ele (verificado no código).
-- ============================================================================

-- 1. String vazia e NULL são a mesma coisa aqui — sem isto, dois itens "sem
--    código" colidiriam no índice, que é o oposto do que se quer.
update public.products set sku = null where sku is not null and btrim(sku) = '';
update public.services set code = null where code is not null and btrim(code) = '';

-- 2. Produtos: mantém o código em quem tem mais vendas; empate, o mais antigo.
with ranqueado as (
  select p.id,
         row_number() over (
           partition by p.org_id, btrim(p.sku)
           order by (select count(*) from public.sale_items si where si.product_id = p.id) desc,
                    p.created_at asc,
                    p.id asc
         ) as posicao
  from public.products p
  where p.sku is not null
)
update public.products p set sku = null
from ranqueado r where r.id = p.id and r.posicao > 1;

-- 3. Serviços: mesma regra.
with ranqueado as (
  select s.id,
         row_number() over (
           partition by s.org_id, btrim(s.code)
           order by (select count(*) from public.sale_items si where si.service_id = s.id) desc,
                    s.created_at asc,
                    s.id asc
         ) as posicao
  from public.services s
  where s.code is not null
)
update public.services s set code = null
from ranqueado r where r.id = s.id and r.posicao > 1;

-- 4. Normaliza o que sobrou (espaço nas pontas conta como código diferente).
update public.products set sku = btrim(sku) where sku is not null and sku <> btrim(sku);
update public.services set code = btrim(code) where code is not null and code <> btrim(code);

-- 5. A trava. PARCIAL de propósito: item sem código é legítimo (serviço avulso,
--    cadastro em andamento), e um índice total impediria o segundo deles.
create unique index if not exists products_org_sku_unico
  on public.products (org_id, sku) where sku is not null;
create unique index if not exists services_org_code_unico
  on public.services (org_id, code) where code is not null;

comment on index public.products_org_sku_unico is
  'Código do produto único por empresa. Parcial: itens sem código são permitidos.';
comment on index public.services_org_code_unico is
  'Código do serviço único por empresa. Parcial: itens sem código são permitidos.';
