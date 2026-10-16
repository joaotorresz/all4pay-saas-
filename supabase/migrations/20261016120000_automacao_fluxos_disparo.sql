-- ═══════════════════════════════════════════════════════════════════════════
-- FLUXOS DE AUTOMAÇÃO — o disparo no horário (etapa 4)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O cliente monta o fluxo na tela de cards (ou pela conversa com a Quattro AI):
-- gatilho (dias + hora de Brasília) → fonte de dados → envio. O fluxo mora em
-- `org_state` (chave `a4p_automacao_fluxos`). Esta migration dá ao executor o
-- que ele precisa para rodar a cada 15 minutos:
--
--   1. `automacao_envios` aceita o tipo `fluxo` — a MESMA trava das seis
--      automações fixas (índice único org·tipo·chave·canal, gravado ANTES do
--      provedor). Uma segunda trava só para fluxos divergiria da primeira.
--   2. `automacao_fluxos_ligados()` — os fluxos de cada empresa, e se a última
--      gravação veio de quem ADMINISTRA a empresa.
--   3. `automacao_vendas_maquininha(org, dia)` — as vendas da maquininha no dia
--      de Brasília, com forma, parcelas, bandeira e líquido.
--   4. O agendamento no pg_cron a cada 15 minutos.
--
-- ⚠️ **MUDA QUEM PODE CHAMAR O QUÊ** — declarado aqui e no PR:
--   · as duas funções são SECURITY DEFINER e executáveis SÓ por `service_role`
--     (revogadas de public/anon/authenticated). O navegador nunca as vê.
--   · `automacao_vendas_maquininha` reabre para a chave de serviço a leitura de
--     `pinbank_transacoes`, `pinbank_eventos` (só forma/parcelas/bandeira) e
--     `sales_docs` de UMA empresa — o que nenhum grant dava a ela.
--   · O executor só roda fluxo cuja ÚLTIMA gravação veio de titular ou
--     administrador (`salvo_por_administra`). Sem isso, quem só LANÇA poderia
--     montar um fluxo que manda os números da empresa para qualquer telefone,
--     todo dia, sem ninguém que responde pela empresa ter decidido isso. O
--     `org_state` é gravável por quem lança (a tela de fluxos também); a
--     decisão de MANDAR fica com quem administra.
--
-- ⚠️ Pré-requisito do agendamento: o segredo `cron_secret` no Vault (o mesmo do
-- Open Finance). Sem ele a migration para com instrução, sem agendar nada.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O REGISTRO DE ENVIOS ACEITA O FLUXO
-- ───────────────────────────────────────────────────────────────────────────
-- O check nasceu inline (sem nome escolhido); o Postgres o batizou
-- `automacao_envios_tipo_check`. Procura-se pelo CONTEÚDO, não pelo nome, para
-- não depender de como ele foi batizado.
do $tipo$
declare r record;
begin
  for r in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.automacao_envios'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%tipo%regua_cobranca%'
  loop
    execute format('alter table public.automacao_envios drop constraint %I', r.conname);
  end loop;
end $tipo$;

alter table public.automacao_envios
  add constraint automacao_envios_tipo_check
  check (tipo in ('resumo_diario','resumo_semanal','lembrete_pagar',
                  'alerta_caixa','fechamento_pendente','regua_cobranca','fluxo'));

comment on constraint automacao_envios_tipo_check on public.automacao_envios is
  'As seis automações fixas e o fluxo montado pelo cliente (chave fluxo:<id>:<dia>:<destino>).';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. OS FLUXOS DE CADA EMPRESA
-- ───────────────────────────────────────────────────────────────────────────
-- Devolve as empresas que TÊM fluxo guardado (ligado ou não — quem decide o
-- que roda é o núcleo puro, `validarFluxo` + `disparoDevido`). O executor lê
-- tudo a cada 15 minutos: é uma linha por empresa, sem lançamento nenhum.
create or replace function public.automacao_fluxos_ligados()
returns table (org_id uuid, fluxos jsonb, salvo_por uuid, salvo_por_administra boolean, atualizado_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.org_id,
         s.valor,
         s.atualizado_por,
         exists (
           select 1
             from public.organization_members om
             join public.role_permissions rp on rp.papel = om.role and rp.acao = 'administrar'
            where om.org_id = s.org_id and om.user_id = s.atualizado_por),
         s.atualizado_em
    from public.org_state s
   where s.chave = 'a4p_automacao_fluxos'
     and jsonb_typeof(s.valor) = 'array'
     and jsonb_array_length(s.valor) > 0
$$;

revoke all on function public.automacao_fluxos_ligados() from public, anon, authenticated;
grant execute on function public.automacao_fluxos_ligados() to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. AS VENDAS DA MAQUININHA NO DIA
-- ───────────────────────────────────────────────────────────────────────────
-- O dia é o de BRASÍLIA (o servidor roda em UTC: uma venda às 22h de Brasília
-- já é o dia seguinte em UTC). Forma, parcelas e bandeira vêm do evento MAIS
-- RECENTE da transação (o payload é o `data` do webhook, já sem dado sensível);
-- o líquido vem da venda que a transação gerou, quando ela existe — `null`
-- quando não, que a mensagem diz "ainda não calculado", nunca o bruto.
create or replace function public.automacao_vendas_maquininha(p_org uuid, p_dia date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_de timestamptz := (p_dia::timestamp at time zone 'America/Sao_Paulo');
  v_ate timestamptz := ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo');
  v jsonb;
begin
  if p_org is null or p_dia is null then
    raise exception 'automacao_vendas_maquininha: empresa e dia são obrigatórios';
  end if;
  select jsonb_build_object(
    'temMaquininha', exists (
      select 1 from public.pinbank_vinculos pv
       where pv.org_id = p_org and pv.ativo and pv.excluido_em is null),
    'vendas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nsu', t.nsu,
               'status', t.status,
               'valor', t.valor,
               'ocorridoEm', t.ocorrido_em,
               'formaPagamento', ev.payload ->> 'formaPagamento',
               'numeroParcelas', ev.payload ->> 'numeroParcelas',
               'bandeira', ev.payload -> 'cartao' ->> 'bandeira',
               'ehPix', coalesce(ev.event_type ilike 'Compra.Pix%', false),
               'liquido', case when sd.id is null then null
                 else sd.total
                      - coalesce((sd.detalhe -> 'taxaPlataforma' ->> 'valor')::numeric, 0)
                      - coalesce((sd.detalhe -> 'taxaAntecipacao' ->> 'valor')::numeric, 0)
                 end
             ) order by t.ocorrido_em)
        from public.pinbank_transacoes t
        left join lateral (
          select e.payload, e.event_type
            from public.pinbank_eventos e
           where e.org_id = t.org_id and e.nsu = t.nsu
           order by e.ocorrido_em desc
           limit 1) ev on true
        left join public.sales_docs sd
          on sd.id = t.sale_doc_id and sd.excluido_em is null
       where t.org_id = p_org
         and t.ocorrido_em >= v_de and t.ocorrido_em < v_ate
    ), '[]'::jsonb)
  ) into v;
  return v;
end $$;

revoke all on function public.automacao_vendas_maquininha(uuid, date) from public, anon, authenticated;
grant execute on function public.automacao_vendas_maquininha(uuid, date) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. O AGENDAMENTO — a cada 15 minutos, no pg_cron
-- ───────────────────────────────────────────────────────────────────────────
-- O Vercel Hobby só aceita cron DIÁRIO; o pg_cron não tem esse teto (mesmo
-- desenho do Open Finance, `20260819180000`). O segredo vai no cabeçalho
-- `Authorization`, nunca na query string.
--
-- ⚠️ O banco efêmero do CI não tem pg_cron/vault: pula AVISANDO, e a guarda do
-- CI cobra o texto do agendamento no arquivo. Tudo por `execute`, para um ramo
-- não tomado nunca resolver `cron.` nem `vault.`.
--
-- ⚠️ O endereço é `all4pay-saas.vercel.app`, de propósito: ele não pode ganhar
-- "Redirect to" (o pg_cron e a guarda `no-ar` chamam por ele).
do $agendar$
begin
  if to_regnamespace('cron') is null or to_regnamespace('vault') is null then
    raise notice 'pg_cron/vault ausentes (banco efêmero): agendamento dos fluxos de automação PULADO. Em produção estas extensões existem — se este aviso aparecer lá, o agendamento NÃO foi criado.';
    return;
  end if;

  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    raise exception using
      errcode = 'A4P19',
      message = 'O segredo cron_secret nao existe no cofre.',
      hint = 'Crie antes de aplicar: Supabase Dashboard > Project Settings > Vault > New secret, com o NOME exato cron_secret e, como valor, o mesmo CRON_SECRET configurado na Vercel. Nada foi gravado: a transacao inteira foi desfeita.';
  end if;

  begin execute $sql$ select cron.unschedule('automacoes-fluxos') $sql$; exception when others then null; end;

  execute $sql$
    select cron.schedule('automacoes-fluxos', '*/15 * * * *', $cron$
      select net.http_get(
        url := 'https://all4pay-saas.vercel.app/api/automacoes/fluxos/run',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
          'User-Agent', 'All4Pay-Cron/1.0'),
        timeout_milliseconds := 55000);
    $cron$)
  $sql$;

  raise notice 'Fluxos de automação agendados: a cada 15 minutos.';
end $agendar$;
