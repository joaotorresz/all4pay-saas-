-- ═══════════════════════════════════════════════════════════════════════════
-- UM ESTADO SÓ — `status` é DERIVADA, e a trava é do Postgres
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **NÃO HÁ MAIS GREP AQUI, e isso é deliberado.** A versão anterior desta
-- ideia varria `UPDATE ... status` no repositório. Quando a trava passou para o
-- banco — `generated always as (…) stored` —, a varredura de texto virou
-- ruído: ela pega o código que existe hoje, e o Postgres pega o que ainda não
-- foi escrito, inclusive o que vier de uma RPC, de um cron ou de um `psql` na
-- mão. Manter as duas ensinaria que o grep é a proteção, e alguém o reforçaria
-- achando que reforça o controle.
--
-- O que se prova aqui é que **a TRAVA continua existindo**.
begin;

-- ─────────────────────────────── a semente ──────────────────────────────────
-- ⚠️ **A GUARDA PRECISA DE MATERIAL, e o efêmero do CI nasce com `movements`
-- vazia.** Sem um título baixado, o caso 2 cai no ramo "banco sem movimentos" e
-- o teste negativo reprova com "o plantio não plantou nada" — vermelho pelo
-- motivo errado, que é pior que guarda nenhuma.
--
-- ⚠️ O arreio é COPIADO do bloco que já passa (`central-autorizacao.sql`), não
-- escrito do zero: o usuário entra por `auth.users` e a org e a conta nascem do
-- gatilho de signup. Arreio escrito à mão é hipótese sobre como o banco é;
-- arreio copiado é medida do que ele aceita — e as três vezes que escrevi o meu
-- ficaram verdes aqui e vermelhas no CI.
--
-- ⚠️ E ele grava `situacao`, NUNCA `status`: `status` é gerada, e um `insert`
-- que a mencione é recusado pelo Postgres. É a própria trava que esta guarda
-- audita, exercitada de graça no setup.
do $semente$
declare u uuid := gen_random_uuid(); o uuid; c uuid;
begin
  insert into auth.users (id, email, aud, role)
  values (u, 'estado-unico@guarda.local', 'authenticated', 'authenticated');
  select om.org_id into o from public.organization_members om where om.user_id = u limit 1;
  select id into c from public.financial_accounts where org_id = o limit 1;
  insert into public.movements (org_id, account_id, type, amount, description,
                                due_date, paid_date, origem, situacao)
  values (o, c, 'entrada', 2000, 'semente do estado único',
          current_date, current_date, 'manual', 'baixado');
end
$semente$;

do $guarda$
declare
  m uuid; msg text; gerada char;
begin
  ---------------------------------------------------------------- 1. a trava --
  select attgenerated into gerada from pg_attribute
   where attrelid = 'public.movements'::regclass and attname = 'status';
  if coalesce(gerada, '') <> 's' then
    raise exception 'ESTADO ÚNICO: `movements.status` DEIXOU de ser coluna gerada — a trava saiu do banco e voltou a existir um segundo escritor.';
  end if;

  ------------------------------------------------- 2. a escrita é recusada --
  select id into m from public.movements limit 1;
  if m is null then
    -- ⚠️ Banco vazio: sem linha não há o que tentar escrever, e "não deu erro"
    -- seria verde sobre o nada. Distinguido de propósito.
    raise notice 'estado-único: banco sem movimentos — a trava foi conferida pelo catálogo, não pela escrita';
  else
    begin
      update public.movements set status = 'pendente' where id = m;
      raise exception 'ESTADO ÚNICO: o Postgres ACEITOU escrever em `status` — a coluna não está mais gerada.';
    exception when generated_always then msg := SQLERRM;
    end;
    if msg is null then
      raise exception 'ESTADO ÚNICO: a escrita em `status` não foi recusada.';
    end if;
  end if;

  ------------------------------------- 3. nenhuma linha com os dois tortos --
  -- Impossível por construção; a asserção existe para o dia em que alguém
  -- remover o GENERATED numa migration futura.
  if exists (
    select 1 from public.movements
     where status::text is distinct from (case situacao
       when 'previsto' then 'pendente' when 'confirmado' then 'pendente'
       when 'baixado' then 'pago' when 'conciliado' then 'pago'
       when 'cancelado' then 'cancelado' when 'estornado' then 'cancelado' end)
  ) then
    raise exception 'ESTADO ÚNICO: existe linha com `status` e `situacao` DISCORDANDO — o mesmo fato voltou a ter duas fontes.';
  end if;

  --------------------------------- 4. baixado sem data de pagamento não é baixa --
  if exists (select 1 from public.movements
              where situacao in ('baixado','conciliado') and paid_date is null) then
    raise exception 'ESTADO ÚNICO: existe título BAIXADO sem `paid_date` — ele aparece no DRE (competência) e some do DFC (caixa), e os dois relatórios passam a discordar.';
  end if;

  raise notice 'estado-único OK — status é gerada, a escrita é recusada, nenhuma linha discorda, nenhum baixado sem data';
end
$guarda$;

-- ═══════════════════════════════════════════════════════════════════════════
-- O TESTE NEGATIVO — devolve `status` a coluna COMUM e grava divergência
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ Guarda que nunca reprovou não conta, e **vermelho pelo motivo errado é
-- pior que guarda nenhuma**. Este bloco planta o defeito, roda a MESMA
-- asserção, e exige que a mensagem NOMEIE o que ela audita.
do $negativo$
declare
  m uuid; msg text := null;
begin
  drop index if exists public.movements_paid_date_idx;
  alter table public.movements drop column status;
  alter table public.movements add column status public.movement_status not null default 'pendente';

  select id into m from public.movements where situacao = 'baixado' limit 1;
  if m is null then
    raise exception 'TESTE NEGATIVO INVÁLIDO: não há título baixado para tornar divergente — o plantio não plantou nada.';
  end if;
  update public.movements set status = 'pendente' where id = m;   -- agora DIVERGE

  begin
    if exists (
      select 1 from public.movements
       where status::text is distinct from (case situacao
         when 'previsto' then 'pendente' when 'confirmado' then 'pendente'
         when 'baixado' then 'pago' when 'conciliado' then 'pago'
         when 'cancelado' then 'cancelado' when 'estornado' then 'cancelado' end)
    ) then
      raise exception 'ESTADO ÚNICO: existe linha com `status` e `situacao` DISCORDANDO — o mesmo fato voltou a ter duas fontes.';
    end if;
  exception when others then msg := SQLERRM;
  end;

  if msg is null then
    raise exception 'GUARDA CEGA: com `status` de volta a coluna comum E uma linha divergente gravada, a asserção NÃO reprovou.';
  end if;
  if msg not like '%DISCORDANDO%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO: a guarda reprovou com "%", que não é a asserção do estado único.', msg;
  end if;
  raise notice 'teste negativo OK — o vermelho nomeia o defeito: %', msg;
end
$negativo$;

rollback;
