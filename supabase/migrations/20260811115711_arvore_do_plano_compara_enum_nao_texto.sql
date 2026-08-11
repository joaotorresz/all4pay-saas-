-- ⚠️ `categories.kind` é o ENUM `category_kind`, não `text`. A primeira versão
-- declarou a variável como text e o gatilho morria com 42883 (operador
-- inexistente) ANTES de chegar à regra — então ele reprovava tudo, inclusive o
-- caso legítimo, e pelo motivo errado.
--
-- Isso importa mais do que o conserto: o meu primeiro teste capturou a exceção
-- com `when others` e reportou "OK", porque QUALQUER erro parecia a recusa que
-- eu esperava. Um teste que aceita qualquer falha como sucesso é o mesmo
-- defeito da guarda que não reprova o defeito plantado. Daí o errcode próprio
-- A4P05: o teste passou a exigir a recusa CERTA, não uma recusa qualquer.

create or replace function public.categoria_arvore_coerente()
returns trigger language plpgsql as $$
declare
  v_kind_pai public.category_kind;
  v_filhos_divergentes int;
begin
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
