-- ═══════════════════════════════════════════════════════════════════════════
-- ONDA 3 · ESTORNO DA BAIXA E DA TRANSFERÊNCIA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ ESTORNAR A BAIXA NÃO É ESTORNAR O LANÇAMENTO, e confundir os dois é o
-- defeito que esta função existe para não cometer. `estornar_lancamento`
-- (0030) cria uma contrapartida: o dinheiro entrou, agora sai, e as duas linhas
-- ficam. É o certo para uma despesa lançada errado.
--
-- A BAIXA é outra coisa: o título continua devido. Desfazer a baixa tem de
-- (a) desfazer o efeito em caixa e (b) devolver o título para "a receber" /
-- "a pagar". Tratá-la como estorno de lançamento deixaria o título quitado
-- para sempre e uma contrapartida solta explicando o caixa — o cliente
-- continuaria devendo e o sistema não cobraria.
--
-- ⚠️ E aqui há uma TENSÃO REAL com a regra "estorno nunca altera o original".
-- Ela vale para o VALOR: nada do que foi lançado é reescrito (medido: o
-- `amount` do título segue 1000,00 depois do estorno). Mas `status` e
-- `paid_date` não são fatos históricos, são o ESTADO ATUAL da obrigação — e uma
-- obrigação que voltou a ser devida tem de dizer isso, senão nenhum relatório
-- de inadimplência a enxerga. O fato histórico (baixado no dia X, por fulano,
-- estornado no dia Y) não se perde: está na trilha, com o antes e o depois, e
-- na contrapartida que fica.
--
-- ⚠️ O SALDO da conta é restaurado aqui, e não deixado para a tela. Foi a tela
-- que moveu o saldo na baixa; se ela também fosse responsável por devolvê-lo, a
-- reversão feita por qualquer outro caminho (RPC, lote, importação) deixaria o
-- saldo torto — e saldo torto é o defeito que ninguém percebe até conciliar.

create or replace function public.estornar_baixa(p_id uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_orig  public.movements%rowtype;
  v_novo  uuid;
  v_hoje  date := current_date;
  v_sinal numeric;
begin
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do estorno da baixa.' using errcode = 'check_violation';
  end if;
  if not public.tem_permissao('baixar') then
    raise exception 'Seu papel nesta empresa não dá baixa nem estorna baixa.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_orig from public.movements where id = p_id and org_id = public.auth_org_id();
  if v_orig.id is null then
    raise exception 'Título não encontrado nesta empresa.' using errcode = 'no_data_found';
  end if;
  if v_orig.status <> 'pago' then
    raise exception 'Este título não está baixado — não há baixa para estornar.'
      using errcode = 'check_violation';
  end if;
  -- ⚠️ A competência manda, não a data do pagamento: um título de março pago em
  -- agosto pertence a março, e é março que o fechamento tranca.
  if public.periodo_fechado(v_orig.due_date, v_orig.org_id) then
    raise exception 'A competência deste título está em mês fechado. Reabra o mês para estornar a baixa.'
      using errcode = 'check_violation';
  end if;
  if public.periodo_fechado(v_hoje, v_orig.org_id) then
    raise exception 'O mês corrente está fechado — reabra-o para registrar o estorno.'
      using errcode = 'check_violation';
  end if;

  -- A contrapartida: mesmo valor, sentido oposto, liquidada hoje. É ela que
  -- desfaz o caixa e é ela que fica como registro do estorno.
  insert into public.movements (
    org_id, account_id, type, status, amount, due_date, paid_date,
    party_id, category, description, estorno_de, estorno_motivo
  ) values (
    v_orig.org_id, v_orig.account_id,
    (case when v_orig.type = 'entrada' then 'saida' else 'entrada' end)::movement_type,
    'pago', v_orig.amount, v_hoje, v_hoje,
    v_orig.party_id, v_orig.category,
    'Estorno da baixa de ' || coalesce(v_orig.description, 'título')
      || ' (' || to_char(v_orig.due_date, 'DD/MM/YYYY') || ')',
    v_orig.id, p_motivo
  ) returning id into v_novo;

  -- O título volta a ser devido. O gatilho de auditoria grava
  -- {status: pago→pendente, paid_date: X→null}, que é a frase que explica.
  update public.movements
     set status = 'pendente', paid_date = null
   where id = v_orig.id;

  -- O saldo volta ao que era antes da baixa.
  if v_orig.account_id is not null then
    v_sinal := case when v_orig.type = 'entrada' then -1 else 1 end;
    update public.financial_accounts
       set balance = coalesce(balance, 0) + (v_sinal * v_orig.amount)
     where id = v_orig.account_id and org_id = v_orig.org_id;
  end if;

  insert into public.audit_log (org_id, usuario, acao, antes, depois, entidade, entidade_id, origem)
  values (v_orig.org_id, coalesce(auth.uid()::text, 'sistema'), 'movements.estornar_baixa',
          jsonb_build_object('status', 'pago', 'paid_date', v_orig.paid_date, 'valor', v_orig.amount),
          jsonb_build_object('status', 'pendente', 'contrapartida', v_novo, 'motivo', p_motivo),
          'movements', v_orig.id::text, 'estorno');

  return v_novo;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- TRANSFERÊNCIA — um fato com DOIS lados
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ Estornar UM dos lados deixaria o dinheiro no meio do caminho: saiu de uma
-- conta e não voltou para nenhuma. Por isso o estorno da transferência acha o
-- par pelo `reference_code` e reverte OS DOIS numa transação — o mesmo motivo
-- pelo qual apagar uma transferência sempre apagou os dois lançamentos.
create or replace function public.estornar_transferencia(p_id uuid, p_motivo text)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_orig public.movements%rowtype;
  v_ref  text;
  r      record;
  n      int := 0;
begin
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do estorno da transferência.' using errcode = 'check_violation';
  end if;

  select * into v_orig from public.movements where id = p_id and org_id = public.auth_org_id();
  if v_orig.id is null then
    raise exception 'Transferência não encontrada nesta empresa.' using errcode = 'no_data_found';
  end if;
  v_ref := v_orig.reference_code;
  if v_ref is null or v_ref not like 'transf:%' then
    raise exception 'Este lançamento não é uma transferência. Use o estorno de lançamento.'
      using errcode = 'check_violation';
  end if;

  -- ⚠️ Os dois lados, sempre. Um `for` sobre o par em vez de duas chamadas: se
  -- a segunda falhasse por qualquer motivo, a primeira já teria acontecido e o
  -- dinheiro ficaria no meio do caminho. Aqui as duas vivem na mesma transação.
  for r in
    select * from public.movements
     where org_id = v_orig.org_id and reference_code = v_ref and estornado_em is null
  loop
    perform public.estornar_lancamento(r.id, p_motivo);
    n := n + 1;
  end loop;

  if n = 0 then
    raise exception 'Esta transferência já foi estornada.' using errcode = 'check_violation';
  end if;
  return n;
end;
$$;

revoke all on function public.estornar_baixa(uuid, text) from public;
grant execute on function public.estornar_baixa(uuid, text) to authenticated;
revoke all on function public.estornar_transferencia(uuid, text) from public;
grant execute on function public.estornar_transferencia(uuid, text) to authenticated;
