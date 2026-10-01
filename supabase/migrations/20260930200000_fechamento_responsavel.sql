-- ═══════════════════════════════════════════════════════════════════════════
-- CAMP-A · O CHECKLIST DE FECHAMENTO GANHA DONO, PRAZO E REVISOR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **A tarefa de fechamento morava em DOIS lugares.** `close_tasks` (0010)
-- existia no banco com `status` e `assignee`, e a tela gravava o mesmo fato no
-- navegador (`a4p_close_tasks`), unindo as duas camadas na leitura. Duas
-- moradas para um fato é defeito agendado: a marca feita num computador e
-- desfeita no outro aparecia "feita" para sempre, porque a união das duas
-- camadas nunca deixa um `true` voltar a ser `false`.
--
-- **A morada é o BANCO** (`close_tasks`). O navegador fica só para a
-- demonstração, que não tem banco. Esta migration:
--
--   1. estende `close_tasks` com o mês, a chave da tarefa-modelo, o
--      responsável, o revisor, o prazo e os CARIMBOS de quem concluiu e quem
--      revisou (com a autorrevisão marcada, não escondida);
--   2. põe a MÁQUINA da tarefa num gatilho — pendente → concluída → revisada —
--      porque uma regra de segregação que mora na tela vale para a tela e para
--      mais nada (a mesma lição de R1 na Central);
--   3. faz o PERÍODO recusar a trava com tarefa aberta, a menos que haja um
--      MOTIVO escrito (`accounting_periods.trava_motivo`), em qualquer caminho
--      de escrita — inclusive o `update` direto que a tela fazia.
--
-- ⚠️ **O MODELO das tarefas NÃO mora aqui.** As cinco tarefas-padrão
-- (reconciliar bancos, provisões com estorno, revisar DRE, conferir impostos,
-- exportar ao contador) vivem em `src/core/close/checklist.ts`, que as gera
-- mês a mês e herda responsável e revisor do mês anterior. Uma tabela de
-- modelos por organização exigiria seed + gatilho (5ª regra) para um default
-- que não muda por organização; o que muda — QUEM responde por cada tarefa —
-- já se repete sozinho pela herança do mês anterior. Nenhum default por
-- organização nasce aqui, então não há seed a escrever.
--
-- ⚠️ **Nenhuma função SECURITY DEFINER nova.** Os dois gatilhos são INVOKER:
-- a pergunta "existe OUTRO membro habilitado a revisar?" é feita a
-- `org_members()` (DEFINER já existente, 0012), que é a porta que a RLS de
-- `organization_members` deixa para enxergar os colegas. `fechar_periodo`
-- (DEFINER desde a 0030) é REESCRITA para gravar o motivo — a assinatura e o
-- dono continuam os mesmos.

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. A TAREFA
 * ═══════════════════════════════════════════════════════════════════════════ */

alter table public.close_tasks add column if not exists mes date;
alter table public.close_tasks add column if not exists chave text;
alter table public.close_tasks add column if not exists descricao text;
alter table public.close_tasks add column if not exists href text;
alter table public.close_tasks add column if not exists ordem integer not null default 0;
alter table public.close_tasks add column if not exists responsavel_id uuid;
alter table public.close_tasks add column if not exists revisor_id uuid;
alter table public.close_tasks add column if not exists prazo date;
alter table public.close_tasks add column if not exists concluida_em timestamptz;
alter table public.close_tasks add column if not exists concluida_por uuid;
alter table public.close_tasks add column if not exists revisada_em timestamptz;
alter table public.close_tasks add column if not exists revisada_por uuid;
alter table public.close_tasks add column if not exists autorrevisao boolean not null default false;
alter table public.close_tasks add column if not exists autorrevisao_motivo text;

comment on column public.close_tasks.status is
  'pending = a fazer · review = concluída, aguardando revisão · done = revisada. Só o gatilho close_tasks_maquina move entre elas.';
comment on column public.close_tasks.autorrevisao is
  'Revisada pela mesma pessoa que concluiu, permitida porque a organização não tinha outro membro habilitado a revisar (papel com a ação fechar). O motivo fica em autorrevisao_motivo.';

-- ⚠️ `mes` é o PRIMEIRO dia do mês. Guardar "2026-09-17" deixaria a mesma
-- tarefa existir duas vezes no mês, uma por dia em que alguém abriu a tela.
alter table public.close_tasks drop constraint if exists close_tasks_mes_primeiro_dia;
alter table public.close_tasks add constraint close_tasks_mes_primeiro_dia
  check (mes is null or mes = date_trunc('month', mes)::date);

-- A geração do mês é idempotente POR ESTE ÍNDICE: abrir a tela duas vezes (ou
-- em dois computadores) não cria a tarefa duas vezes. Não é parcial de
-- propósito: as linhas antigas, sem mês, têm `mes` nulo e não colidem (nulos
-- são distintos), e o `upsert` do PostgREST precisa de um índice sem predicado.
create unique index if not exists close_tasks_mes_chave_uniq
  on public.close_tasks (org_id, mes, chave);

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. A MÁQUINA — pendente → concluída → revisada
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Quem concluiu não revisa a própria tarefa — quando existe outro
 * membro habilitado.** É a decisão R1 do dono, a mesma da Central: um controle
 * que liga e desliga conforme o quadro de membros some sem gerar evento, então
 * ele NUNCA desliga. Na empresa de uma pessoa a autorrevisão é PERMITIDA e
 * CARIMBADA — registro, não bloqueio, e o carimbo é a coluna que o auditor lê.
 *
 * ⚠️ **"Habilitado a revisar" sai de `role_permissions` (ação `fechar`)**, a
 * mesma matriz que decide quem trava o período. Revisar uma tarefa de
 * fechamento É um ato de fechamento.
 *
 * ⚠️ **Os carimbos não se editam.** `concluida_por`, `revisada_por` e a
 * autorrevisão só mudam junto com a transição que os produz; um `update` que
 * tente escrever neles sem mudar o status tem os valores antigos devolvidos.
 * Sem isso, bastaria gravar o nome de um colega em `revisada_por` para a
 * segregação existir no papel.
 */
create or replace function public.close_tasks_maquina()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_outro_revisor boolean := false;
begin
  -- ⚠️ O MÊS de uma tarefa não muda, e a CHAVE de uma tarefa do checklist
  -- também não. Esta conferência vem ANTES da saída das linhas antigas, e é
  -- ela que dá sentido a todo o resto: sem ela, `update … set mes = null,
  -- status = 'done'` saía da máquina pela porta das linhas antigas e
  -- devolvia o mês depois — uma tarefa "revisada" sem revisor nem segregação
  -- (medido na revisão: passava). E mover a tarefa para outro mês a tirava da
  -- conta da trava (ou do congelamento de um mês já travado).
  if tg_op = 'UPDATE'
     and (new.mes is distinct from old.mes
          or (old.mes is not null and new.chave is distinct from old.chave)) then
    raise exception 'A4P-FECHAMENTO-TRANSICAO: o mês e a tarefa-modelo de um item do checklist não mudam.'
      using hint = 'Conclua, revise ou reabra a tarefa no mês dela.';
  end if;

  -- As linhas antigas (sem mês) não têm máquina: nasceram antes dela.
  if new.mes is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- ⚠️ Mês travado não ganha tarefa nova: a lista do mês entregue não cresce
    -- depois da entrega (o mesmo congelamento do UPDATE abaixo).
    if public.periodo_fechado(new.mes, new.org_id) then
      raise exception 'A4P-FECHAMENTO-MES-TRAVADO: % está travado; o checklist dele não muda mais.', to_char(new.mes, 'MM/YYYY')
        using hint = 'Reabra o período (com motivo) para alterar o checklist.';
    end if;
    -- ⚠️ Uma tarefa nasce A FAZER. Nascer concluída pularia o carimbo de quem
    -- concluiu, e nascer revisada pularia a segregação inteira.
    if new.status <> 'pending' then
      raise exception 'A4P-FECHAMENTO-TRANSICAO: uma tarefa de fechamento nasce pendente, não "%".', new.status
        using hint = 'Crie a tarefa e depois conclua e revise pelo checklist.';
    end if;
    new.concluida_por := null; new.concluida_em := null;
    new.revisada_por := null;  new.revisada_em := null;
    new.autorrevisao := false; new.autorrevisao_motivo := null;
  else
    -- ⚠️ Mês travado congela o checklist: mexer numa tarefa de um mês fechado
    -- reescreveria a história do fechamento que já foi entregue.
    if public.periodo_fechado(new.mes, new.org_id) then
      raise exception 'A4P-FECHAMENTO-MES-TRAVADO: % está travado; o checklist dele não muda mais.', to_char(new.mes, 'MM/YYYY')
        using hint = 'Reabra o período (com motivo) para alterar o checklist.';
    end if;
    -- ⚠️ Uma tarefa do checklist não vai para a lixeira. A trava do mês só
    -- conta as tarefas que não estão na lixeira; mandar a tarefa aberta para
    -- lá (`excluir_logico`, que só exige o papel de lançar) travaria o mês
    -- sem motivo nenhum — o motivo existe para dizer por que algo ficou
    -- aberto, e a lixeira o apagaria junto com a tarefa.
    if new.excluido_em is not null and old.excluido_em is null then
      raise exception 'A4P-FECHAMENTO-TRANSICAO: uma tarefa do checklist não vai para a lixeira.'
        using hint = 'Conclua e revise a tarefa, ou trave o mês com o motivo escrito.';
    end if;
    -- Os carimbos só se movem com a transição (ver o cabeçalho).
    new.concluida_por := old.concluida_por; new.concluida_em := old.concluida_em;
    new.revisada_por := old.revisada_por;   new.revisada_em := old.revisada_em;
    new.autorrevisao := old.autorrevisao;   new.autorrevisao_motivo := old.autorrevisao_motivo;
  end if;

  -- Responsável e revisor são MEMBROS da organização. Um id solto seria uma
  -- tarefa atribuída a ninguém que parece atribuída a alguém.
  if new.responsavel_id is not null
     and (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id)
     and not exists (select 1 from public.org_members() om where om.user_id = new.responsavel_id) then
    raise exception 'A4P-FECHAMENTO-MEMBRO: o responsável escolhido não é membro desta organização.';
  end if;
  if new.revisor_id is not null
     and (tg_op = 'INSERT' or new.revisor_id is distinct from old.revisor_id)
     and not exists (select 1 from public.org_members() om where om.user_id = new.revisor_id) then
    raise exception 'A4P-FECHAMENTO-MEMBRO: o revisor escolhido não é membro desta organização.';
  end if;

  if tg_op = 'INSERT' or new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'pending' and new.status = 'review' then
    -- CONCLUIR
    new.concluida_por := auth.uid();
    new.concluida_em := now();

  elsif old.status = 'review' and new.status = 'pending' then
    -- REABRIR uma concluída que ninguém revisou ainda
    new.concluida_por := null;
    new.concluida_em := null;

  elsif old.status = 'review' and new.status = 'done' then
    -- REVISAR
    if not public.tem_permissao('fechar', new.org_id) then
      raise exception 'A4P-FECHAMENTO-PERMISSAO: seu papel nesta organização não revisa o fechamento.'
        using hint = 'Peça a quem tem o papel de fechamento (Titular, Administrador, Fechador ou Contador externo).';
    end if;
    if old.concluida_por is not null and old.concluida_por = auth.uid() then
      -- ⚠️ A pergunta não é "a organização é pequena", é "existe ALGUÉM que
      -- poderia revisar no meu lugar". Se existe, a segregação é exigível.
      select exists (
        select 1
          from public.org_members() om
          join public.role_permissions rp on rp.papel = om.role and rp.acao = 'fechar'
         where om.user_id is distinct from auth.uid()
      ) into v_outro_revisor;
      if v_outro_revisor then
        raise exception 'A4P-FECHAMENTO-SEGREGACAO: quem concluiu a tarefa não pode revisá-la.'
          using hint = 'Outra pessoa com o papel de fechamento precisa revisar esta tarefa.';
      end if;
      new.autorrevisao := true;
      new.autorrevisao_motivo := 'organização sem outro membro habilitado a revisar';
    else
      new.autorrevisao := false;
      new.autorrevisao_motivo := null;
    end if;
    new.revisada_por := auth.uid();
    new.revisada_em := now();

  elsif old.status = 'done' and new.status = 'review' then
    -- DESFAZER a revisão
    if not public.tem_permissao('fechar', new.org_id) then
      raise exception 'A4P-FECHAMENTO-PERMISSAO: seu papel nesta organização não revisa o fechamento.';
    end if;
    new.revisada_por := null; new.revisada_em := null;
    new.autorrevisao := false; new.autorrevisao_motivo := null;

  else
    -- ⚠️ Tudo que não está acima é proibido — inclusive pendente → revisada,
    -- que pularia a conclusão e, com ela, a pergunta de quem fez.
    raise exception 'A4P-FECHAMENTO-TRANSICAO: a tarefa não vai de "%" para "%".', old.status, new.status
      using hint = 'Uma tarefa é concluída antes de ser revisada.';
  end if;

  return new;
end;
$$;
revoke execute on function public.close_tasks_maquina() from public, anon;

drop trigger if exists close_tasks_maquina_trg on public.close_tasks;
create trigger close_tasks_maquina_trg
  before insert or update on public.close_tasks
  for each row execute function public.close_tasks_maquina();

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. A TRAVA DO PERÍODO — com tudo revisado, ou com um motivo escrito
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Travar com tarefa aberta não é proibido: é exigir MOTIVO.** Proibir
 * sem saída faria o operador marcar tudo como revisado para conseguir travar —
 * e aí o checklist mente. Com motivo, a trava acontece e a razão fica escrita
 * ao lado dela, na tabela e na trilha.
 *
 * ⚠️ **O gatilho mora no PERÍODO, não na função que trava.** A tela gravava
 * `accounting_periods` direto (sem `fechar_periodo`), então uma regra só na
 * função seria contornada pelo caminho que o próprio produto usa.
 *
 * O motivo precisa de 20 caracteres, o mesmo piso da revisão administrativa:
 * barra o vazio E o de fachada ("ok", "travar").
 */
alter table public.accounting_periods add column if not exists trava_motivo text;

comment on column public.accounting_periods.trava_motivo is
  'Por que o mês foi travado com tarefa de fechamento aberta. Exigido (20+ caracteres) só nesse caso.';

create or replace function public.accounting_periods_trava()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_abertas integer;
begin
  if new.status <> 'locked' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'locked' then
    return new;
  end if;

  select count(*) into v_abertas
    from public.close_tasks ct
   where ct.org_id = new.org_id
     and ct.mes = date_trunc('month', new.period)::date
     and ct.status <> 'done'
     and ct.excluido_em is null;

  if v_abertas > 0 and length(trim(coalesce(new.trava_motivo, ''))) < 20 then
    raise exception 'A4P-FECHAMENTO-TRAVA: % tarefa(s) do checklist de % ainda não foram concluídas e revisadas.',
      v_abertas, to_char(new.period, 'MM/YYYY')
      using hint = 'Conclua e revise as tarefas, ou escreva o motivo da trava (ao menos 20 caracteres).';
  end if;
  return new;
end;
$$;
revoke execute on function public.accounting_periods_trava() from public, anon;

drop trigger if exists accounting_periods_trava_trg on public.accounting_periods;
create trigger accounting_periods_trava_trg
  before insert or update on public.accounting_periods
  for each row execute function public.accounting_periods_trava();

/* ---------------------------------------------------------------------------
 * `fechar_periodo` (0030) passa a GRAVAR o motivo da trava. Mesma assinatura,
 * mesma permissão (`fechar`), mesma trilha — o que muda é que o motivo não é
 * mais só exigido na reabertura: na trava ele vai para `trava_motivo`, onde o
 * gatilho acima o lê.
 * ------------------------------------------------------------------------- */
create or replace function public.fechar_periodo(p_mes text, p_fechar boolean, p_motivo text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_org uuid := public.auth_org_id(); v_id uuid;
begin
  if not public.tem_permissao('fechar') then
    raise exception 'Seu papel nesta organização não fecha período.';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then raise exception 'Mês inválido (use AAAA-MM).'; end if;
  if not p_fechar and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Reabrir um mês fechado exige motivo.';
  end if;

  select id into v_id from public.accounting_periods
   where org_id = v_org and date_trunc('month', period) = (p_mes || '-01')::date limit 1;

  if v_id is null then
    insert into public.accounting_periods (org_id, period, status, closed_at, closed_by, trava_motivo)
    values (v_org, (p_mes || '-01')::date, case when p_fechar then 'locked' else 'open' end,
            case when p_fechar then now() end, auth.uid(),
            case when p_fechar then nullif(trim(p_motivo), '') end);
  else
    update public.accounting_periods
       set status = case when p_fechar then 'locked' else 'open' end,
           closed_at = case when p_fechar then now() else null end,
           closed_by = case when p_fechar then auth.uid() else null end,
           trava_motivo = case when p_fechar then nullif(trim(p_motivo), '') else null end
     where id = v_id;
  end if;

  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (
    v_org, coalesce(auth.uid()::text, 'sistema'),
    case when p_fechar then 'periodo.fechar' else 'periodo.REABRIR' end,
    jsonb_build_object('mes', p_mes),
    jsonb_build_object('mes', p_mes, 'motivo', p_motivo)
  );
end;
$$;
revoke execute on function public.fechar_periodo(text, boolean, text) from public, anon;
grant execute on function public.fechar_periodo(text, boolean, text) to authenticated;
