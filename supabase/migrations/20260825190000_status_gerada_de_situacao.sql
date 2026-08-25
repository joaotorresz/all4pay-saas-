-- ═══════════════════════════════════════════════════════════════════════════
-- `status` VIRA COLUNA GERADA — a trava, não a guarda por grep
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **DOIS CAMPOS QUE GUARDAM O MESMO FATO NÃO ESTAVAM COERENTES — ESTAVAM
-- PARADOS.** Por 2230 linhas `status` e `situacao` concordavam, e isso não era
-- saúde: era imobilidade. No dia em que a Central rodou pela primeira vez —
-- 25/08, 15:18 — o PRIMEIRO título criado por ela já nasceu divergente:
-- `situacao='baixado'` escrita pela máquina, `status='pendente'` porque o
-- segundo escritor nunca rodou. Um título em 2231.
--
-- ⚠️ **Coluna gerada não é meio-termo: é a trava mais forte disponível**,
-- porque o Postgres RECUSA a escrita. Um `grep` de `UPDATE ... status` pega o
-- código que existe hoje; a coluna gerada pega o que ainda não foi escrito —
-- inclusive o que vier de uma RPC, de um cron ou de um `psql` na mão.
--
-- ⚠️ **A derivação reproduz o acervo EXATAMENTE**: conferida linha a linha
-- antes desta migration, 2231 de 2231, zero divergências. Então o hash de
-- `digest_do_periodo` — que assina o fechamento COM o status — não muda.
--
-- ⚠️ **O `case` NÃO tem `else`, de propósito.** Uma `situacao` nova produziria
-- NULL e bateria no `not null`, falhando ALTO na primeira escrita. Um `else`
-- mapearia o estado novo para 'pendente' em silêncio, que é exatamente a
-- família de defeito que esta migration existe para matar.

-- ── 1. Os dois índices que dependem da coluna precisam sair e voltar ────────
-- ⚠️ `movements_paid_date_idx` é PARCIAL (`where status='pago'`) e serve as
-- consultas de caixa. Recriá-lo não é opcional.
drop index if exists public.movements_type_status_due_idx;
drop index if exists public.movements_paid_date_idx;

alter table public.movements drop column status;

alter table public.movements
  add column status public.movement_status
  -- ⚠️ CADA RAMO tipado, e não o resultado. `(case … end)::movement_status`
  -- reprova com `generation expression is not immutable`: o cast de TEXTO para
  -- enum é STABLE (os rótulos do enum podem mudar), e coluna gerada exige
  -- imutabilidade. Com literais já tipados, o planejador dobra a constante.
  generated always as (
    case situacao
      when 'previsto'   then 'pendente'::public.movement_status
      when 'confirmado' then 'pendente'::public.movement_status
      when 'baixado'    then 'pago'::public.movement_status
      when 'conciliado' then 'pago'::public.movement_status
      when 'cancelado'  then 'cancelado'::public.movement_status
      when 'estornado'  then 'cancelado'::public.movement_status
    end
  ) stored;

alter table public.movements alter column status set not null;

create index movements_type_status_due_idx on public.movements (type, status, due_date);
create index movements_paid_date_idx on public.movements (paid_date) where status = 'pago';

comment on column public.movements.status is
  'DERIVADA de `situacao` — leitura apenas. Escrever aqui é recusado pelo Postgres; mova `situacao` e a máquina de estados decide.';

-- ── 2. As RPCs que escreviam `status` passam a mover `situacao` ─────────────
-- ⚠️ Sem isto elas quebrariam em execução com `cannot insert a non-DEFAULT
-- value into column "status"` — e quebrariam CALADAS até alguém conciliar.

-- ⚠️ `conciliar_movimentos` marca o PREVISTO como absorvido pela linha do
-- extrato. Passa a mover `situacao`, então a MÁQUINA valida: previsto→cancelado
-- e confirmado→cancelado são legais; um título já BAIXADO seria recusado — e
-- deve ser, porque um baixado não é uma previsão a descartar.
create or replace function public.conciliar_movimentos(p_previsto uuid, p_extrato uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid := public.auth_org_id(); v_prev public.movements%rowtype;
begin
  if not public.tem_permissao('baixar') then
    raise exception 'Seu papel nesta empresa não concilia.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_prev from public.movements where id = p_previsto and org_id = v_org;
  if v_prev.id is null then
    raise exception 'Título previsto não encontrado nesta empresa.' using errcode = 'no_data_found';
  end if;
  if v_prev.conciliado_com is not null then
    raise exception 'Este título já está conciliado.' using errcode = 'check_violation';
  end if;

  update public.movements m
     set party_id       = coalesce(v_prev.party_id, m.party_id),
         category_id    = coalesce(v_prev.category_id, m.category_id),
         cost_center_id = coalesce(v_prev.cost_center_id, m.cost_center_id),
         description    = coalesce(v_prev.description, m.description),
         conciliado_com = v_prev.id,
         conciliado_em  = now()
   where m.id = p_extrato and m.org_id = v_org;

  update public.movements
     set situacao = 'cancelado', conciliado_com = p_extrato, conciliado_em = now()
   where id = v_prev.id;

  insert into public.audit_log (org_id, usuario, acao, antes, depois, entidade, entidade_id, origem)
  values (v_org, coalesce(auth.uid()::text, 'sistema'), 'movements.conciliar',
          jsonb_build_object('situacao', v_prev.situacao),
          jsonb_build_object('situacao', 'cancelado', 'par', p_extrato),
          'movements', v_prev.id::text, 'conciliacao');
end;
$function$;

-- ⚠️ `estornar_lancamento` INSERIA com `status`. A contrapartida espelha o
-- ESTADO do original: se o dinheiro já se moveu, o estorno também nasce
-- baixado; se não, nasce previsto e passa pela Central como qualquer título.
create or replace function public.estornar_lancamento(p_id uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_orig public.movements%rowtype; v_novo uuid; v_hoje date := current_date;
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno.'; end if;
  if not public.tem_permissao('lancar') then
    raise exception 'Seu papel nesta organizacao nao lanca nem estorna.';
  end if;
  select * into v_orig from public.movements where id = p_id;
  if v_orig.id is null then raise exception 'Lancamento nao encontrado.'; end if;
  if v_orig.estornado_em is not null then raise exception 'Este lancamento ja foi estornado.'; end if;
  if public.periodo_fechado(v_hoje, v_orig.org_id) then
    raise exception 'O mes corrente tambem esta fechado - reabra-o para registrar o estorno.';
  end if;
  insert into public.movements (
    org_id, account_id, type, situacao, amount, due_date, paid_date,
    party_id, category, description, estorno_de, estorno_motivo, origem
  ) values (
    v_orig.org_id, v_orig.account_id,
    (case when v_orig.type = 'entrada' then 'saida' else 'entrada' end)::movement_type,
    (case when v_orig.situacao in ('baixado','conciliado') then 'baixado' else 'previsto' end),
    v_orig.amount, v_hoje,
    case when v_orig.paid_date is null then null else v_hoje end,
    v_orig.party_id, v_orig.category,
    'Estorno de ' || coalesce(v_orig.description, 'lancamento') || ' (' || to_char(v_orig.due_date, 'DD/MM/YYYY') || ')',
    v_orig.id, p_motivo, coalesce(v_orig.origem, 'manual')
  ) returning id into v_novo;
  update public.movements set estornado_em = now() where id = v_orig.id;
  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (v_orig.org_id, coalesce(auth.uid()::text, 'sistema'), 'lancamento.estornar',
    jsonb_build_object('id', v_orig.id, 'valor', v_orig.amount, 'competencia', v_orig.due_date),
    jsonb_build_object('estorno', v_novo, 'motivo', p_motivo, 'competencia', v_hoje));
  return v_novo;
end;
$function$;
