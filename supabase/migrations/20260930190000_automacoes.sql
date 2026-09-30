-- ═══════════════════════════════════════════════════════════════════════════
-- AUTOMAÇÕES DE E-MAIL E WHATSAPP, POR EMPRESA (30/09/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O produto vendia "Automações … com notificação por WhatsApp e e-mail" e não
-- tinha executor: o runner diário (`/api/financial-os/run`) lia com o cliente
-- do NAVEGADOR, sem sessão, e morria em "permission denied" antes da primeira
-- regra; o destinatário era uma variável GLOBAL (o alerta de qualquer empresa
-- iria para o número do dono da plataforma); e nada impedia a mesma mensagem de
-- sair duas vezes.
--
-- Esta migration é a FUNDAÇÃO. Três peças:
--
--   1. `automacoes` — o que cada empresa ligou, por quais canais, para quem e
--      com que parâmetros. Uma linha por (empresa, tipo).
--   2. `automacao_envios` — o REGISTRO de cada envio, com índice ÚNICO em
--      (org_id, tipo, chave, canal). ⚠️ É ele, e não o código, que garante que
--      reexecutar o runner não manda de novo: o runner grava a linha ANTES de
--      chamar o provedor, e a segunda execução bate no índice. Uma trava no
--      código protege o código que existe hoje; a do banco protege também o
--      cron que alguém disparar à mão amanhã.
--   3. `automacao_contexto(p_org)` — a leitura que o runner precisa para montar
--      as mensagens de UMA empresa, sem sessão de usuário.
--
-- ⚠️ **TUDO NASCE DESLIGADO.** Mensagem que sai da empresa (inclusive para o
-- próprio dono) é decisão de alguém, não efeito colateral de uma migration.
-- Os padrões nascem por SEED (as empresas de hoje) **e** por GATILHO (as de
-- amanhã) — a 5ª regra: seed cobre o passado, gatilho cobre o futuro, e os dois
-- leem a MESMA função (`automacoes_padrao`), para não divergirem.
--
-- ⚠️ **MUDA QUEM PODE CHAMAR O QUÊ** — declarado aqui e no relatório:
--   · `automacao_contexto` é SECURITY DEFINER e lê, de uma empresa inteira,
--     lançamentos, contatos, membros (com e-mail) e aprovações. Ela é
--     executável SÓ por `service_role` (revogada de public/anon/authenticated).
--     Quem tem a chave de serviço passa a conseguir ler o contexto de qualquer
--     empresa por esta porta — o que ela já conseguia pelas tabelas antes da
--     A4P-076, e deixou de conseguir por grant mínimo. A função reabre ESSA
--     leitura, e só essa, para o runner de automações.
--   · `service_role` ganha SELECT em `automacoes` e SELECT/INSERT/UPDATE em
--     `automacao_envios` (o runner é o consumidor novo; ver a lista de
--     consumidores de `20260818200100`).
--
-- O registro local da régua (`org_state` chave `a4p_regua_envios`) é COPIADO
-- para `automacao_envios` no fim deste arquivo: o "Marcar como avisado" manual
-- e o envio automático passam a gravar no mesmo lugar.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. AS CONFIGURAÇÕES
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.automacoes (
  -- `id` existe para a trilha genérica (`auditar_escrita` lê `->> 'id'`):
  -- ligar a régua que fala com o cliente é exatamente o que uma auditoria
  -- pergunta "quem ligou, e quando".
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null default public.auth_org_id()
    references public.organizations(id) on delete cascade,
  tipo text not null
    check (tipo in ('resumo_diario','resumo_semanal','lembrete_pagar',
                    'alerta_caixa','fechamento_pendente','regua_cobranca')),
  ativo boolean not null default false,
  canais text[] not null default array['email']::text[]
    check (canais <@ array['email','whatsapp']::text[]),
  -- [{ userId, nome, email?, telefone?, email_ativo, whatsapp_ativo }]
  -- ⚠️ O runner só manda para quem AINDA é titular/admin da empresa (conferido
  -- em `automacao_contexto`, a cada execução) — a lista guarda a escolha, não
  -- concede acesso.
  destinatarios jsonb not null default '[]'::jsonb
    check (jsonb_typeof(destinatarios) = 'array'),
  parametros jsonb not null default '{}'::jsonb
    check (jsonb_typeof(parametros) = 'object'),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  unique (org_id, tipo)
);
alter table public.automacoes enable row level security;

comment on table public.automacoes is
  'O que cada empresa ligou de automação (e-mail/WhatsApp). Tudo nasce DESLIGADO, por seed e por gatilho.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. O REGISTRO DOS ENVIOS
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.automacao_envios (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null default public.auth_org_id()
    references public.organizations(id) on delete cascade,
  tipo text not null
    check (tipo in ('resumo_diario','resumo_semanal','lembrete_pagar',
                    'alerta_caixa','fechamento_pendente','regua_cobranca')),
  -- A chave de DEDUPLICAÇÃO, montada pelo núcleo puro (`core/automacoes`):
  --   régua ........ titulo:<movimento>:<etapa>  ·  cliente:<contato>:<dia>
  --   resumo ....... dia:<YYYY-MM-DD>:<destino>  ·  semana:<YYYY-MM-DD>:<destino>
  --   lembrete ..... dia:<YYYY-MM-DD>:<destino>
  --   alerta ....... faixa:<faixa>:<dia>:<destino>
  --   fechamento ... mes:<YYYY-MM>:du<N>:<destino>
  --   teste ........ teste:<id>
  chave text not null check (length(chave) between 1 and 300),
  canal text not null check (canal in ('email','whatsapp','manual')),
  -- ⚠️ MASCARADO, nunca o endereço inteiro: o registro é lido por todo mundo
  -- da empresa, e o telefone do cliente não precisa estar em cada linha.
  destino_mascarado text,
  -- pendente  = gravado ANTES de chamar o provedor (a trava);
  -- enviado   = o provedor ACEITOU (Twilio 201 / Resend 200) — não é "entregue";
  -- simulado  = sem credencial, nada saiu. ⚠️ NUNCA conta como avisado;
  -- falhou    = o provedor recusou (o motivo vai em `erro`);
  -- manual    = uma PESSOA declarou o contato ("Marcar como avisado").
  status text not null default 'pendente'
    check (status in ('pendente','enviado','simulado','falhou','manual')),
  provedor_msg_id text,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);
alter table public.automacao_envios enable row level security;

-- ⚠️ A TRAVA. Reexecutar o runner — pelo cron, à mão, ou dois ao mesmo tempo —
-- bate aqui antes de chegar ao provedor.
create unique index if not exists automacao_envios_unico
  on public.automacao_envios (org_id, tipo, chave, canal);
create index if not exists automacao_envios_recentes
  on public.automacao_envios (org_id, criado_em desc);

comment on table public.automacao_envios is
  'Registro de cada envio de automação. Índice único (org_id, tipo, chave, canal): reexecutar não envia de novo. Simulado nunca conta como avisado.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. A TRILHA — as duas tabelas são de negócio (guarda `trilha-completa`)
-- ───────────────────────────────────────────────────────────────────────────
drop trigger if exists zz_auditar_automacoes on public.automacoes;
create trigger zz_auditar_automacoes
  after insert or update or delete on public.automacoes
  for each row execute function public.auditar_escrita();

drop trigger if exists zz_auditar_automacao_envios on public.automacao_envios;
create trigger zz_auditar_automacao_envios
  after insert or update or delete on public.automacao_envios
  for each row execute function public.auditar_escrita();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. QUEM LÊ E QUEM ESCREVE
-- ───────────────────────────────────────────────────────────────────────────
revoke all on public.automacoes from public, anon, authenticated, service_role;
revoke all on public.automacao_envios from public, anon, authenticated, service_role;
-- ⚠️ Sem DELETE para o cliente: desligar é `ativo = false`, e um registro de
-- envio apagado é a prova de contato que some antes de um protesto.
grant select, insert, update on public.automacoes to authenticated;
grant select, insert, update on public.automacao_envios to authenticated;
-- O runner (chave de serviço): lê as configurações e escreve o registro.
grant select on public.automacoes to service_role;
grant select, insert, update on public.automacao_envios to service_role;

drop policy if exists automacoes_org on public.automacoes;
create policy automacoes_org on public.automacoes
  for all to authenticated
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

-- ⚠️ Ligar uma automação que fala com o CLIENTE em nome da empresa é ato de
-- quem administra (mesma regra da alçada). A restritiva TIRA a escrita de quem
-- não administra; a leitura continua da empresa inteira.
drop policy if exists automacoes_escrita_admin on public.automacoes;
create policy automacoes_escrita_admin on public.automacoes
  as restrictive for all to authenticated
  using (true)
  with check (public.tem_permissao('administrar'));

drop policy if exists automacao_envios_org on public.automacao_envios;
create policy automacao_envios_org on public.automacao_envios
  for all to authenticated
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

-- ⚠️ Registrar um contato (inclusive o "Marcar como avisado") é de quem lança,
-- dá baixa ou administra — o mesmo recorte da rota de cobrança. O leitor e o
-- contador externo leem o registro e não escrevem nele.
drop policy if exists automacao_envios_escrita on public.automacao_envios;
create policy automacao_envios_escrita on public.automacao_envios
  as restrictive for all to authenticated
  using (true)
  with check (
    public.tem_permissao('lancar') or public.tem_permissao('baixar')
    or public.tem_permissao('administrar')
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 5. O PADRÃO — uma função só, lida pelo seed E pelo gatilho
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.automacoes_padrao()
returns table (tipo text, canais text[], parametros jsonb)
language sql immutable set search_path = public as $$
  values
    ('resumo_diario'::text,     array['email']::text[],             '{}'::jsonb),
    ('resumo_semanal',          array['email']::text[],             '{}'::jsonb),
    ('lembrete_pagar',          array['email']::text[],             '{}'::jsonb),
    ('alerta_caixa',            array['email']::text[],             '{"horizonteDias": 15, "saldoMinimo": 0}'::jsonb),
    ('fechamento_pendente',     array['email']::text[],             '{"diasUteis": [3, 8]}'::jsonb),
    -- ⚠️ A régua fala com o CLIENTE. Multa e juros começam em ZERO: cobrar
    -- encargo que a empresa não combinou é o pior jeito de começar.
    ('regua_cobranca',          array['whatsapp','email']::text[],  '{"multaPct": 0, "jurosMesPct": 0, "pausas": []}'::jsonb);
$$;

-- As empresas de hoje (todas DESLIGADAS).
insert into public.automacoes (org_id, tipo, ativo, canais, parametros)
select o.id, p.tipo, false, p.canais, p.parametros
  from public.organizations o
  cross join public.automacoes_padrao() p
on conflict (org_id, tipo) do nothing;

-- As de amanhã.
create or replace function public.automacoes_inicial()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.automacoes (org_id, tipo, ativo, canais, parametros)
  select new.id, p.tipo, false, p.canais, p.parametros
    from public.automacoes_padrao() p
  on conflict (org_id, tipo) do nothing;
  return new;
end $$;
revoke all on function public.automacoes_inicial() from public, anon, authenticated;

drop trigger if exists organizations_automacoes on public.organizations;
create trigger organizations_automacoes
  after insert on public.organizations
  for each row execute function public.automacoes_inicial();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. O CONTEXTO DE UMA EMPRESA, PARA O RUNNER (sem sessão)
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ SECURITY DEFINER passa por fora da RLS — então os recortes que a RLS faria
-- estão ESCRITOS aqui: só a empresa pedida, sem amostra de demonstração
-- (`is_sample`), sem o que foi para a lixeira (`excluido_em`). Esquecer um
-- deles faria o resumo do caixa contar o dado que as telas escondem.
--
-- ⚠️ Os nomes de categoria, centro e projeto vêm ACHATADOS (texto), no mesmo
-- formato de `org_movements` — é o que o mapeador único
-- (`lib/risco-linhas.ts`) lê, tanto aqui quanto na tela.
create or replace function public.automacao_contexto(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  n_mov bigint;
begin
  if p_org is null or not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'automacao_contexto: a organização % não existe', p_org;
  end if;

  select count(*) into n_mov
    from public.movements m
   where m.org_id = p_org and not m.is_sample and m.excluido_em is null;

  select jsonb_build_object(
    'org', (select jsonb_build_object('id', o.id, 'nome', o.name)
              from public.organizations o where o.id = p_org),
    'perfil', (select cp.profile -> 'db' from public.company_profiles cp
                where cp.org_id = p_org limit 1),
    'contas', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.name, 'saldo', a.balance) order by a.name)
        from public.financial_accounts a
       where a.org_id = p_org and a.excluido_em is null), '[]'::jsonb),
    'movimentos', coalesce((
      select jsonb_agg(to_jsonb(x))
        from (
          select m.id, m.account_id, m.type, m.status, m.situacao, m.amount,
                 m.due_date, m.paid_date, m.competence_date, m.description,
                 m.party_id, m.category, m.origem, m.reference_code,
                 m.installment_no, m.installment_total,
                 c.name as categoria, cc.name as centro, p.name as projeto
            from public.movements m
            left join public.categories   c  on c.id  = m.category_id
            left join public.cost_centers cc on cc.id = m.cost_center_id
            left join public.projects     p  on p.id  = m.project_id
           where m.org_id = p_org and not m.is_sample and m.excluido_em is null
           order by m.due_date desc nulls last
           limit 5000
        ) x), '[]'::jsonb),
    -- ⚠️ Teto declarado, nunca calado (mesma regra do `conferirTeto` da tela).
    'truncado', n_mov > 5000,
    'partes', coalesce((
      select jsonb_agg(jsonb_build_object('id', pt.id, 'nome', pt.name, 'telefone', pt.phone, 'email', pt.email))
        from (select * from public.parties
               where org_id = p_org and excluido_em is null
               order by name limit 5000) pt), '[]'::jsonb),
    -- Os que PODEM receber o que é da empresa: titular e administradores de
    -- HOJE. Quem saiu da empresa sai da lista na execução seguinte.
    'membros', coalesce((
      select jsonb_agg(jsonb_build_object(
               'userId', om.user_id, 'papel', om.role,
               'nome', coalesce(nullif(om.display_name, ''), u.raw_user_meta_data ->> 'name'),
               'email', coalesce(nullif(om.email, ''), u.email)))
        from public.organization_members om
        left join auth.users u on u.id = om.user_id
       where om.org_id = p_org and om.role in ('owner', 'admin')), '[]'::jsonb),
    'aprovacoesPendentes', (
      select count(*) from public.approvals ap
       where ap.org_id = p_org and ap.status::text = 'pending' and ap.excluido_em is null),
    'mesesTravados', coalesce((
      select jsonb_agg(to_char(ap.period, 'YYYY-MM'))
        from public.accounting_periods ap
       where ap.org_id = p_org and ap.status = 'locked' and ap.excluido_em is null), '[]'::jsonb),
    -- O histórico recente: é com ele que o núcleo decide "já avisado" e "a faixa
    -- do alerta mudou". Sessenta dias bastam para as duas perguntas.
    'envios', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', e.tipo, 'chave', e.chave, 'canal', e.canal,
                                          'status', e.status, 'em', e.criado_em))
        from (select * from public.automacao_envios
               where org_id = p_org and criado_em > now() - interval '60 days'
               order by criado_em desc limit 3000) e), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- ⚠️ A porta é SÓ do runner. O navegador nunca a vê.
revoke all on function public.automacao_contexto(uuid) from public, anon, authenticated;
grant execute on function public.automacao_contexto(uuid) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. O REGISTRO LOCAL DA RÉGUA VAI PARA A TABELA
-- ───────────────────────────────────────────────────────────────────────────
--
-- `org_state.a4p_regua_envios` era um array de {movimentoId, etapaId, em,
-- canal}. ⚠️ Ele NÃO distinguia "a Twilio aceitou" de "alguém clicou em
-- Marcar como avisado" — então tudo entra como `manual` (uma pessoa declarou o
-- contato), que é o que o registro antigo consegue afirmar sem inventar. As
-- duas contam como avisado; nenhuma passa a dizer "enviado pelo sistema".
-- Idempotente: reaplicar bate no índice único e não duplica.
insert into public.automacao_envios (org_id, tipo, chave, canal, status, erro, criado_em, criado_por)
select s.org_id,
       'regua_cobranca',
       'titulo:' || (e ->> 'movimentoId') || ':' || (e ->> 'etapaId'),
       case when e ->> 'canal' in ('email', 'whatsapp', 'manual') then e ->> 'canal' else 'manual' end,
       'manual',
       'registrado antes da automação — a origem (envio pelo sistema ou marcação à mão) não foi guardada',
       coalesce(nullif(e ->> 'em', '')::timestamptz, s.atualizado_em),
       s.atualizado_por
  from public.org_state s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.valor) = 'array' then s.valor else '[]'::jsonb end) e
 where s.chave = 'a4p_regua_envios'
   and coalesce(e ->> 'movimentoId', '') <> ''
   and coalesce(e ->> 'etapaId', '') <> ''
on conflict (org_id, tipo, chave, canal) do nothing;
