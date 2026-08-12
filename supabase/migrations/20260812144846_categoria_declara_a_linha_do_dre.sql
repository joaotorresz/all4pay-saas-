-- ⚠️ A LINHA DO DRE deixa de ser adivinhada pelo NOME da categoria.
--
-- Até aqui, em que linha do resultado um lançamento entrava saía de regex sobre
-- o texto da categoria (`core/relatorios`, `core/dre/engine`): "Taxa Plataforma"
-- cai em Despesas Variáveis porque contém "taxa". Isso funciona enquanto as
-- categorias são as de fábrica e o nome segue o padrão que o regex espera, e
-- quebra EM SILÊNCIO na primeira categoria que a empresa cria com o nome dela
-- ("Ferramentas do time"), que passa a cair na linha genérica sem nada na tela
-- parecendo defeito. A cascata sempre fecha — é aritmética —, só que na linha
-- errada, e é a linha que o contador lê.
--
-- Nulo continua valendo: é o palpite por palavra-chave, que mantém de pé tudo
-- que já foi lançado. Preenchido, VENCE — quem cadastrou a categoria sabe onde
-- ela entra; o regex, não.
alter table public.categories
  add column if not exists dre_linha text;

comment on column public.categories.dre_linha is
  'Id da linha de SOMA do DRE (core/relatorios ESTRUTURA_DRE) em que os '
  'lançamentos desta categoria entram. Nulo = classificar por palavra-chave. '
  'Linhas de TOTAL (=) nunca entram aqui: elas saem de fórmula, e apontar uma '
  'categoria para uma delas contaria o mesmo valor duas vezes.';
