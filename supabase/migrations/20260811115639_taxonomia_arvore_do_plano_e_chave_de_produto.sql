-- ═══════════════════════════════════════════════════════════════════════════
-- ONDA 5 — TAXONOMIA E HIGIENE: as travas que faltavam no BANCO.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ Medido antes de escrever: hoje NÃO há despesa filha de receita (0 casos) e
-- NÃO há SKU repetido (0 casos). Isso não torna as travas desnecessárias — ao
-- contrário, é o melhor momento para pô-las: uma restrição só entra sem dor
-- quando o dado ainda está limpo, e o produto tem cinco caminhos que criam
-- categoria e três que criam produto. O que estava faltando não era o conserto,
-- era o que IMPEDE a próxima ocorrência.

/* ─────────────────────────────────────────────────────────────────────────────
   1. A ÁRVORE DO PLANO DE CONTAS — despesa não pode ser filha de receita.

   ⚠️ Não pode ser CHECK: uma CHECK só enxerga a própria linha, e a regra
   depende do PAI. Tem de ser gatilho.

   ⚠️ E o gatilho precisa olhar para os DOIS lados. Barrar só o filho deixa a
   porta dos fundos aberta: basta criar a subcategoria sob um pai de receita e
   depois mudar a natureza do PAI para despesa — a árvore fica inválida sem
   nenhuma linha inválida ter sido inserida. É o mesmo defeito de olhar para o
   estado e não para a transição.
   ────────────────────────────────────────────────────────────────────────── */

create or replace function public.categoria_arvore_coerente()
returns trigger language plpgsql as $$
declare
  v_kind_pai text;
  v_filhos_divergentes int;
begin
  -- (a) O FILHO herda a natureza do pai.
  if new.parent_id is not null then
    select kind into v_kind_pai from public.categories where id = new.parent_id;
    if v_kind_pai is not null and v_kind_pai <> new.kind then
      raise exception using
        errcode = 'A4P05',
        message = format(
          'A categoria "%s" é de %s e o grupo escolhido é de %s.',
          new.name, new.kind, v_kind_pai),
        hint =
          'Uma despesa dentro de um grupo de receita faz o valor entrar na linha '
          'errada do DRE — é assim que despesa aparece dentro de Receita Bruta '
          'Operacional. Escolha um grupo da mesma natureza ou crie a categoria '
          'na raiz.';
    end if;
  end if;

  -- (b) O PAI não pode mudar de natureza deixando filhos divergentes.
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
    select count(*) into v_filhos_divergentes
      from public.categories where parent_id = new.id and kind <> new.kind;
    if v_filhos_divergentes > 0 then
      raise exception using
        errcode = 'A4P05',
        message = format(
          'A categoria "%s" tem %s subcategoria(s) de outra natureza.',
          new.name, v_filhos_divergentes),
        hint =
          'Mudar a natureza do grupo deixaria a árvore inválida sem nenhuma '
          'subcategoria ter sido tocada. Mova ou converta as subcategorias antes.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists categorias_arvore on public.categories;
create trigger categorias_arvore
  before insert or update of parent_id, kind on public.categories
  for each row execute function public.categoria_arvore_coerente();

/* ─────────────────────────────────────────────────────────────────────────────
   2. CHAVE ÚNICA DE PRODUTO E DE SERVIÇO.

   ⚠️ PARCIAL em três sentidos, e cada um por um motivo:
     · `where sku is not null and sku <> ''` — SKU vazio é legítimo (5 dos 8
       produtos reais não têm código) e não deve competir por unicidade;
     · `where excluido_em is null` — um produto na lixeira não pode impedir que
       o código dele seja reaproveitado, senão a exclusão lógica vira um
       bloqueio permanente que ninguém entende;
     · `lower(trim(...))` — "223321 " e "223321" são o mesmo código para quem
       digita, e é a diferença invisível que deixa a duplicata passar.
   ────────────────────────────────────────────────────────────────────────── */

create unique index if not exists produtos_sku_unico
  on public.products (org_id, lower(trim(sku)))
  where sku is not null and trim(sku) <> '' and excluido_em is null;

create unique index if not exists servicos_codigo_unico
  on public.services (org_id, lower(trim(code)))
  where code is not null and trim(code) <> '' and excluido_em is null;

/* ─────────────────────────────────────────────────────────────────────────────
   3. ORIGEM — o vocabulário fechado, e a exigência só para o NOVO.

   ⚠️ Medido: `origem` está preenchida em 0 de 1.292 linhas, e 1.226 delas não
   têm pista nenhuma de onde vieram (sem chave de ingestão, sem descritivo
   bruto, sem código de referência). Carimbar todas como "importacao" seria
   FABRICAR PROCEDÊNCIA — exatamente a doença que esta onda combate, cometida
   pela mão de quem a conserta.

   Então: o CHECK fecha o vocabulário (null continua aceito, para o histórico),
   o gatilho exige origem em título NOVO, e a tela de qualidade conta os
   antigos como dívida com correção em massa. Dívida visível é dívida que se
   paga; dívida carimbada é dívida que vira fato falso.
   ────────────────────────────────────────────────────────────────────────── */

alter table public.movements drop constraint if exists movements_origem_valida;
alter table public.movements add constraint movements_origem_valida
  check (origem is null or origem in
    ('venda','contrato','importacao','manual','conciliacao','extrato'));

alter table public.movements drop constraint if exists movements_especie_valida;
alter table public.movements add column if not exists especie text;
alter table public.movements add constraint movements_especie_valida
  check (especie is null or especie in ('extrato','titulo','nota'));

create or replace function public.titulo_exige_origem()
returns trigger language plpgsql as $$
begin
  -- ⚠️ Só para linhas NOVAS. Uma exigência retroativa reprovaria toda edição de
  -- lançamento antigo — e a pessoa que só queria corrigir uma descrição levaria
  -- a culpa por uma dívida que não criou.
  if tg_op <> 'INSERT' then return new; end if;

  if new.especie = 'extrato' then
    -- Extrato não é título: ele não precisa de origem de título, e ganha a sua.
    new.origem := coalesce(new.origem, 'extrato');
    return new;
  end if;

  if new.origem is null or new.origem = '' then
    raise exception using
      errcode = 'A4P05',
      message = 'Este título não diz de onde veio.',
      hint =
        'Informe a origem: venda, contrato, importacao, manual ou conciliacao. '
        'Sem ela não há como responder por que o título existe, que é a primeira '
        'pergunta de quem encontra um título estranho na lista de cobrança.';
  end if;

  if new.origem = 'extrato' then
    raise exception using
      errcode = 'A4P05',
      message = 'Um lançamento de extrato não é um título.',
      hint =
        'O extrato registra dinheiro que JÁ passou pela conta; um título é uma '
        'obrigação que ainda vai vencer. Marque a espécie como extrato, ou crie '
        'o título a partir da venda ou do contrato que o originou.';
  end if;

  return new;
end $$;

drop trigger if exists movements_origem on public.movements;
create trigger movements_origem
  before insert on public.movements
  for each row execute function public.titulo_exige_origem();

comment on column public.movements.especie is
  'extrato | titulo | nota — os três conceitos que se misturavam. Ver core/dominio.';
comment on column public.movements.origem is
  'venda | contrato | importacao | manual | conciliacao | extrato. Obrigatória em título novo.';
