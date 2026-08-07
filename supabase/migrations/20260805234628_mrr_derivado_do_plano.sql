-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 2 — O MRR DEIXA DE SER UM NÚMERO QUE ALGUÉM INFORMA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Métrica que se digita não é métrica: é opinião com casa decimal. E o defeito
-- não estava onde parecia. A TELA já derivava — `mrr = status ativo && plano
-- ? plano.precoMes : 0`. O buraco é mais difícil de contar e pior de viver:
-- `admin_set_subscription(p_org, p_plan, p_status, p_mrr, p_period_end)` aceita
-- o MRR como PARÂMETRO vindo do cliente. A derivação era convenção de tela, e
-- convenção de tela é o que se perde na primeira refatoração — ninguém precisa
-- ser mal-intencionado para o número passar a mentir, basta escrever um script
-- de correção em lote que informe o valor "certo".
--
-- Dois consertos, e o segundo é o que resolve:
--
--  1. O parâmetro SAI da função. Quem não pode ser informado não é informado.
--  2. ⚠️ Um GATILHO recalcula `mrr` em toda escrita em `subscriptions`,
--     qualquer que seja o caminho — a função, um `insert` direto com a chave de
--     serviço, uma futura rotina de webhook do provedor de pagamento. Sem ele,
--     o item 1 seria só uma porta trancada num prédio com outras portas: o
--     valor continuaria gravável por quem não passasse pela função.
--
-- A regra, escrita uma vez: **o MRR de uma assinatura é o preço do plano quando
-- ela está ATIVA, e zero em qualquer outro estado.** Trial não é receita
-- recorrente — é a aposta de que vai virar. Inadimplente também não: o título
-- existe, o dinheiro não entrou, e contá-lo no MRR é o erro que faz um SaaS
-- descobrir tarde demais que a receita que ele reportava não era caixa.
--
-- Isto NÃO é a integração com o provedor de pagamento (o passo 3), e não finge
-- ser: enquanto a fonte da verdade for a tabela de planos, o MRR é o que o
-- catálogo diz, não o que foi cobrado. A diferença fica registrada aqui para
-- não ser confundida com precisão que ainda não existe.

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. A REGRA, NO BANCO, VALENDO PARA TODO CAMINHO DE ESCRITA
 * ═══════════════════════════════════════════════════════════════════════════ */
create or replace function public.subscriptions_mrr_derivado()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  new.mrr := case
    when new.status = 'active'
      then coalesce((select p.price_month from public.plans p where p.id = new.plan_id), 0)
    else 0
  end;
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists subscriptions_mrr_derivado_trg on public.subscriptions;
create trigger subscriptions_mrr_derivado_trg
  before insert or update on public.subscriptions
  for each row execute function public.subscriptions_mrr_derivado();

comment on column public.subscriptions.mrr is
  'DERIVADO — preco do plano quando a assinatura esta ativa, zero nos demais estados. Escrito pelo gatilho subscriptions_mrr_derivado_trg; qualquer valor informado e ignorado.';

/* Realinha o que já está gravado: sem isto a regra passaria a valer só para o
 * futuro, e o painel continuaria somando um passado que ninguém consegue
 * explicar. */
update public.subscriptions set updated_at = updated_at;

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. O PARÂMETRO SAI DA FUNÇÃO
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ `drop` e não `create or replace`: mudar a lista de parâmetros cria uma
 * SEGUNDA função com o mesmo nome, e a antiga — a que aceita o MRR — continuaria
 * publicada no PostgREST. Uma sobrecarga esquecida é exatamente o tipo de porta
 * que ninguém lembra de conferir. */
drop function if exists public.admin_set_subscription(uuid, uuid, text, numeric, date);

create or replace function public.admin_set_subscription(
  p_org uuid, p_plan uuid, p_status text, p_period_end date default null
) returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.admin_exigir_acesso('admin_set_subscription', p_org::text);

  insert into public.subscriptions (org_id, plan_id, status, current_period_end, updated_at)
  values (p_org, p_plan, p_status, p_period_end, now())
  on conflict (org_id) do update
    set plan_id = excluded.plan_id,
        status = excluded.status,
        current_period_end = excluded.current_period_end,
        updated_at = now();

  /* O evento registra o que foi DECIDIDO (plano e estado) e, junto, o MRR que
   * a decisão produziu — lido de volta da tabela, não recebido de fora. */
  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'subscription.set', p_org::text,
          jsonb_build_object(
            'plan_id', p_plan,
            'status', p_status,
            'period_end', p_period_end,
            'mrr_derivado', (select s.mrr from public.subscriptions s where s.org_id = p_org)));
end;
$$;
revoke execute on function public.admin_set_subscription(uuid, uuid, text, date) from public, anon;
grant execute on function public.admin_set_subscription(uuid, uuid, text, date) to authenticated;

comment on function public.admin_set_subscription(uuid, uuid, text, date) is
  'Define plano e estado da assinatura de uma organizacao. NAO recebe MRR: ele e derivado pelo gatilho a partir do preco do plano e do estado.';