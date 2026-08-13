-- ═══════════════════════════════════════════════════════════════════════════
-- DADO DE DEMONSTRAÇÃO TEM MARCA — `is_sample` nas tabelas de lançamento
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **O defeito:** `aplicarOnboarding` grava `origem = 'extrato'` tanto para um
-- extrato de banco de verdade quanto para o botão "Carregar amostra" da tela
-- `/upload`. No banco as duas coisas são a MESMA linha — não há campo que as
-- separe. Quem importa a amostra para conhecer o produto fica com ela dentro do
-- DRE, do fluxo de caixa e dos títulos a receber, sem nada dizendo isso.
--
-- Medido em produção antes desta migration: **458 lançamentos, R$ 6,18 milhões**
-- em 3 organizações reais batem com as contrapartes fixas de
-- `src/core/fdip/sample.ts` — e as 458 têm `origem`, `chave` e
-- `descritivo_bruto` NULOS, porque foram gravadas por uma versão de
-- `aplicarOnboarding` anterior às colunas de procedência.
--
-- ⚠️ **A marca é uma COLUNA, não uma convenção de nome.** Reconhecer amostra
-- pelo texto da descrição é o que esta migration precisa fazer UMA vez, para o
-- histórico que nasceu sem marca; fazer disso a regra permanente significaria
-- que um cliente com um fornecedor chamado "Distribuidora Sul" teria a receita
-- dele apagada do relatório. Daqui para a frente quem escreve a linha declara.
--
-- ⚠️ **`default false` e `not null` juntos, de propósito.** Com `null` no meio,
-- `is_sample = false` deixaria de fora as linhas nulas e o filtro do relatório
-- esconderia dado real — um filtro de relatório que perde lançamento é pior que
-- a contaminação que ele existe para tirar.

-- ---------- 1. A coluna, nas cinco tabelas que carregam dinheiro ----------
--
-- `movements` é o lançamento; `movement_splits` é o rateio dele; `sales_docs` é
-- a venda (o documento-mãe) e `sale_items` são as linhas dela; `recurrences` é
-- a regra que MATERIALIZA título. As cinco entram porque as cinco alimentam
-- relatório. Cadastro (categoria, centro de custo, conta, contato) fica de fora
-- desta migration — ver a nota no fim do arquivo.

alter table public.movements        add column if not exists is_sample boolean not null default false;
alter table public.movement_splits  add column if not exists is_sample boolean not null default false;
alter table public.sales_docs       add column if not exists is_sample boolean not null default false;
alter table public.sale_items       add column if not exists is_sample boolean not null default false;
alter table public.recurrences      add column if not exists is_sample boolean not null default false;

comment on column public.movements.is_sample is
  'Lançamento de demonstração (botão "Carregar amostra" ou seed). Excluído de todo relatório por padrão — ver src/lib/supabase/consulta.ts.';

-- ---------- 2. O índice que o filtro usa ----------
--
-- ⚠️ Parcial (`where is_sample`) porque a esmagadora maioria das linhas é
-- `false`: um índice completo sobre uma coluna booleana quase toda igual não é
-- usado pelo planejador e ainda custa escrita. O que se pergunta com frequência
-- é "esta organização TEM alguma amostra?" — que é a pergunta do banner, e essa
-- o índice parcial responde lendo pouquíssimas linhas.

create index if not exists movements_amostra_idx       on public.movements (org_id)       where is_sample;
create index if not exists movement_splits_amostra_idx on public.movement_splits (org_id) where is_sample;
create index if not exists sales_docs_amostra_idx      on public.sales_docs (org_id)      where is_sample;
create index if not exists sale_items_amostra_idx      on public.sale_items (org_id)      where is_sample;
create index if not exists recurrences_amostra_idx     on public.recurrences (org_id)     where is_sample;

-- ---------- 3. O histórico que nasceu sem marca ----------
--
-- As 14 contrapartes fixas de `src/core/fdip/sample.ts`. Manter esta lista em
-- sincronia com o arquivo é cobrado por guarda (`amostra:` em
-- scripts/consistencia.mts) — sem isso, acrescentar um nome à amostra deixaria
-- o histórico correspondente sem marca e ninguém veria.
--
-- ⚠️ **Só alcança quem NÃO declarou procedência.** `origem is null` é a
-- assinatura de "gravado antes de as colunas existirem". Sem essa condição, a
-- regra por texto passaria a valer para sempre e alcançaria um lançamento
-- manual futuro que por acaso cite um desses nomes.

with assinatura(nome) as (
  values
    -- clientes inventados: nomes que só existem na amostra
    ('NORTHWIND LOGISTICA'), ('ATLAS CLOUD'), ('MERIDIAN DESIGN'),
    ('AURORA VAREJO'), ('COSTA & FILHOS'),
    -- fornecedores inventados
    ('FORNECEDOR TEXTIL'), ('DISTRIBUIDORA SUL'), ('POSTO SHELL CENTRO'),
    ('PAPELARIA UNIAO'),
    -- ⚠️ assinaturas de software: estas EXISTEM no mundo real. Entram por
    -- decisão explícita (a alternativa deixaria ~1/3 da amostra sem marca), e
    -- é por isso que a condição `origem is null` acima é obrigatória — ela é o
    -- que impede a regra de alcançar uma assinatura verdadeira lançada hoje.
    ('AWS AMAZON WEB SERVICES'), ('ADOBE CREATIVE CLOUD'), ('OPENAI CHATGPT'),
    ('GOOGLE WORKSPACE'), ('MICROSOFT OFFICE365')
)
update public.movements m
   set is_sample = true
 where m.origem is null
   and m.is_sample = false
   and exists (select 1 from assinatura a where upper(m.description) like '%' || a.nome || '%');

-- O rateio acompanha o lançamento que ele reparte: um split marcado de um lado
-- e não do outro faria a soma por projeto discordar da soma por categoria.
update public.movement_splits s
   set is_sample = true
  from public.movements m
 where s.movement_id = m.id
   and m.is_sample
   and s.is_sample = false;

-- ---------- 4. A decisão nomeada ----------
--
-- ⚠️ Este lançamento NÃO é amostra e NÃO é seed: é MANUAL, descrição "Teste",
-- R$ 500.000,00 de "Juros recebidos" com competência em 23/06/2026, gravado em
-- 23/06/2026 na organização `835278a9` ("joaov.yoshimi"). `seed_org` insere
-- categorias, centros de custo, unidades e uma conta — nunca movimento; o que
-- vem do seed é o NOME da categoria "Juros recebidos" (migration 0005), e é só
-- isso que o faz parecer dado de demonstração.
--
-- Ele entra aqui por decisão explícita do dono do produto, pelo id, e não por
-- regra: nenhuma regra de procedência o alcança, e uma regra por texto
-- ("descrição contém Teste") alcançaria a descrição legítima de um cliente
-- amanhã. Marcar é reversível — basta `is_sample = false` no mesmo id.

update public.movements
   set is_sample = true
 where id = '1a333df9-308f-4a19-b604-ad162f0e604e'
   and amount = 500000
   and description = 'Teste';

-- ---------- 5. O que esta migration NÃO faz, e por quê ----------
--
-- ⚠️ **Cadastro não recebeu a coluna.** A importação da amostra também cria
-- CONTATOS (`parties`) e uma conta chamada "Conta consolidada"
-- (`financial_accounts`). Eles continuam na lista de contatos e no seletor de
-- conta depois desta migration. Ficaram de fora porque o escopo pedido foi
-- "transação, título e lançamento", e porque apagar contato é diferente de
-- esconder lançamento: um contato pode ter sido editado pelo usuário e ter
-- virado cadastro de verdade. Fica registrado como pendência VISÍVEL, não como
-- esquecimento.
