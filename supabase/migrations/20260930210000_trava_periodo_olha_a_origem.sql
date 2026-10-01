-- ═══════════════════════════════════════════════════════════════════════════
-- A TRAVA DO MÊS FECHADO OLHA TAMBÉM DE ONDE O TÍTULO SAI (CAMP-B, 30/09/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O gatilho `movements_periodo_fechado` (0030) decidia pela data NOVA da linha
-- (`new.due_date`). Isso pega o lançamento que ENTRA num mês fechado — e deixa
-- passar o que SAI dele: um UPDATE que troca o vencimento de 20/08 (agosto
-- fechado) para 05/09 (setembro aberto) era aceito, e o título sumia do
-- balancete de agosto que já tinha sido entregue ao contador.
--
-- ⚠️ MEDIDO, não deduzido (banco local com as 98 migrations, em transação
-- desfeita): com agosto travado, `update movements set due_date = '2026-09-05'`
-- num título de 20/08 PASSAVA. A edição em massa de vencimento (CAMP-B) recusa
-- esse caso na tela (`destino_fechado`/`mes_fechado`), mas a tela não é a
-- fechadura — a regra da ONDA 13 é que quem tranca é o banco, porque a
-- importação em lote, o PostgREST e um `psql` na mão não passam pela tela.
--
-- O que muda: no UPDATE, as DUAS datas são conferidas — a de origem e a de
-- destino. Nada mais:
--  · o estorno (`estorno_de`) continua passando, como antes;
--  · marcar o ORIGINAL como estornado continua passando (a mesma exceção, que
--    exige vencimento, valor e tipo iguais — então ela nunca move o título);
--  · INSERT e DELETE seguem idênticos (só há uma data em cada um).
-- Pagar ou editar um título de mês fechado JÁ era recusado antes (a data nova
-- é a mesma da antiga); só o caso "sair do mês" muda de comportamento.
--
-- Não muda quem pode chamar o quê: a função é a mesma (mesmo nome, mesmo
-- SECURITY DEFINER e search_path da 0030), redefinida no lugar; nenhuma
-- concessão é dada ou retirada.

create or replace function public.movements_periodo_fechado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data date;
  v_org  uuid;
begin
  if (tg_op = 'DELETE') then
    v_data := old.due_date; v_org := old.org_id;
  else
    v_data := new.due_date; v_org := new.org_id;
  end if;

  -- Um estorno PODE referenciar o mês fechado, mas a linha dele fica no mês
  -- aberto; se chegou aqui com data de mês fechado, é lançamento comum.
  if (tg_op <> 'DELETE') and new.estorno_de is not null then
    return new;
  end if;

  -- ⚠️ NOVO: no UPDATE, a data de ORIGEM também decide. Sem isto, trocar o
  -- vencimento para fora de um mês fechado tirava o título do balancete
  -- entregue — a correção de mês fechado é ESTORNO, não mudança de data.
  if (tg_op = 'UPDATE') and old.due_date is not null
     and old.due_date is distinct from new.due_date
     and public.periodo_fechado(old.due_date, old.org_id) then
    raise exception
      'O mês % está fechado. Lançamento retroativo exige ESTORNO rastreado: use estornar_lancamento() para registrar a correção no mês aberto.',
      to_char(old.due_date, 'MM/YYYY')
      using errcode = 'check_violation';
  end if;

  if v_data is null then return coalesce(new, old); end if;
  if not public.periodo_fechado(v_data, v_org) then return coalesce(new, old); end if;

  -- Marcar o ORIGINAL como estornado é permitido: é o outro lado do estorno, e
  -- sem isso o rastro fica só de um lado.
  if (tg_op = 'UPDATE')
     and old.estornado_em is null and new.estornado_em is not null
     and new.amount = old.amount and new.due_date = old.due_date and new.type = old.type then
    return new;
  end if;

  raise exception
    'O mês % está fechado. Lançamento retroativo exige ESTORNO rastreado: use estornar_lancamento() para registrar a correção no mês aberto.',
    to_char(v_data, 'MM/YYYY')
    using errcode = 'check_violation';
end;
$$;
