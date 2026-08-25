-- ═══════════════════════════════════════════════════════════════════════════
-- ESTORNO DE CONCILIAÇÃO — desfaz o passo da conciliação, e SÓ ele
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **`estornar_conciliacao` estava errada, e o erro tinha nome: ela
-- RESSUSCITAVA CANCELADO.** Ela fazia
-- `status = case when status='cancelado' then 'pendente' else status end`,
-- ou seja, trazia de volta o título que a conciliação havia cancelado.
--
-- **Decisão do dono: `cancelado` continua TERMINAL.** Título cancelado não
-- ressuscita — em sistema financeiro não se revive documento, lança-se contra.
-- Uma função que devolve um estado terminal ao início transforma o terminal em
-- transitório sem que ninguém tenha decidido isso: **estado terminal que uma
-- função contorna deixou de ser terminal.**
--
-- ⚠️ **O que o estorno de conciliação É:** desfazer o casamento com o extrato.
-- O título volta ao passo anterior da esteira — `conciliado → baixado` —, e o
-- vínculo some dos dois lados. Nada mais.
--
-- ⚠️ **E `conciliado → baixado` NÃO EXISTIA na máquina** (só
-- `conciliado → estornado`), o que tornava o estorno impossível de expressar em
-- `situacao`. Ela entra aqui NOMEADA, como a inversa exata de
-- `baixado → conciliado` — não como efeito colateral de uma função.
--
-- ⚠️ **O título que a conciliação cancelou NÃO volta**, e isso é a decisão, não
-- um esquecimento: quem precisa dele de novo LANÇA de novo, com procedência
-- própria. É a diferença entre desfazer um passo e apagar a história.

create or replace function public.central_transicao_valida(de text, para text)
returns boolean
language sql
immutable
as $function$
  select case de
    when 'previsto'   then para in ('confirmado','cancelado')
    when 'confirmado' then para in ('baixado','cancelado','previsto')
    when 'baixado'    then para in ('conciliado','estornado')
    -- ⚠️ `baixado` é a INVERSA de `baixado → conciliado`: desfazer o casamento
    -- com o extrato devolve o título ao passo anterior. `estornado` continua
    -- sendo a saída definitiva.
    when 'conciliado' then para in ('baixado','estornado')
    else false  -- cancelado e estornado são terminais
  end;
$function$;

create or replace function public.estornar_conciliacao(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid := public.auth_org_id(); v_m public.movements%rowtype; v_par uuid;
begin
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do estorno da conciliação.' using errcode = 'check_violation';
  end if;
  if not public.tem_permissao('baixar') then
    raise exception 'Seu papel nesta empresa não concilia nem estorna conciliação.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_m from public.movements where id = p_id and org_id = v_org;
  if v_m.id is null then
    raise exception 'Lançamento não encontrado nesta empresa.' using errcode = 'no_data_found';
  end if;
  if v_m.conciliado_com is null then
    raise exception 'Este lançamento não está conciliado.' using errcode = 'check_violation';
  end if;
  v_par := v_m.conciliado_com;

  -- ⚠️ Desfaz o VÍNCULO nos dois lados. Nenhum estado terminal é tocado: quem
  -- estava `cancelado` continua cancelado.
  update public.movements
     set conciliado_com = null, conciliado_em = null
   where id in (v_m.id, v_par) and org_id = v_org;

  -- ⚠️ E devolve ao passo anterior SÓ quem estava conciliado. A máquina valida
  -- a transição e registra em `central_transicoes` — o estorno passa a ter
  -- trilha, que é o que faltava.
  update public.movements
     set situacao = 'baixado'
   where id in (v_m.id, v_par) and org_id = v_org and situacao = 'conciliado';

  insert into public.audit_log (org_id, usuario, acao, antes, depois, entidade, entidade_id, origem)
  values (v_org, coalesce(auth.uid()::text, 'sistema'), 'movements.estornar_conciliacao',
          jsonb_build_object('par', v_par, 'situacao', v_m.situacao),
          jsonb_build_object('motivo', btrim(p_motivo)),
          'movements', v_m.id::text, 'estorno');
end;
$function$;
