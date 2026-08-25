-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ ESTE ARQUIVO CHEGOU DOZE DIAS DEPOIS DO DDL — e é isso que ele conserta.
--
-- O DDL abaixo rodou em PRODUÇÃO em 13/08/2026 e ficou registrado em
-- `supabase_migrations.schema_migrations` com a version `20260813144459`.
-- O ARQUIVO nunca entrou no repositório: o `create` saiu das Edge Functions,
-- fora daqui — a mesma dívida que o `ddl-declarado.json` já nomeava.
--
-- ⚠️ O CUSTO só apareceu quando o passo de migrar passou a existir (A4P-086).
-- Medido no `main` em 25/08, run 32875913004, job `migrar`:
--
--     Remote migration versions not found in local migrations directory.
--     supabase migration repair --status reverted 20260813144459
--
-- A CLI compara a history table do banco com a pasta e RECUSA empurrar quando
-- o banco carrega uma version que a pasta não tem. Não era credencial (a etapa
-- anterior passou), não era porta e não era usuário: eram 94 arquivos contra
-- 95 linhas de history, com exatamente uma órfã. E o passo seguinte do job
-- ("conferir que o banco alcançou o repositório") compara essas duas contagens
-- — ou seja, o mesmo defeito reprovaria duas vezes.
--
-- ⚠️ POR QUE ADOTAR O ARQUIVO EM VEZ DE `migration repair --status reverted`.
-- O `repair` apaga a linha da history do BANCO DE PRODUÇÃO. Ele deixaria o
-- verde no CI e a mentira de pé: a history passaria a dizer que este DDL nunca
-- rodou, quando ele rodou e os objetos estão lá. Adotar o arquivo é o inverso —
-- o repositório passa a dizer a verdade sobre produção, e nenhuma escrita é
-- feita no banco. Os bytes abaixo são os que produção aplicou, conferidos por
-- md5 contra `statements[1]`: bce8aa294ed07378f64dfdd874941c12, 6770 bytes.
--
-- ⚠️ ELE CONVIVE COM `20260818200000_own_maq_esquema_verbatim.sql`, e isso não
-- é duas moradas para o mesmo fato: aquela é a REDEFINIÇÃO verbatim que trouxe
-- o subsistema para o repositório em 18/08; esta é o REGISTRO HISTÓRICO do que
-- rodou em 13/08. Tudo aqui é `if not exists` / `create or replace`, e as duas
-- tabelas que `own_saude` consulta (`own_sync_execucoes`, `own_webhook_eventos`)
-- nascem em `20260813141800`, que ordena ANTES — então o banco construído do
-- zero pelas migrations replaya as duas na ordem sem tropeçar.
-- ═══════════════════════════════════════════════════════════════════════════

-- Cache de token da OWN no banco, não em memória.
--
-- Motivo: com a arquitetura pull-first, quem chama a OWN é uma Edge Function
-- acordada de 5 em 5 minutos. O isolate morre entre invocações, então cache em
-- variável de módulo re-autentica TODO ciclo — que é exatamente o padrão que o
-- perímetro da OWN pune com 429. O token precisa sobreviver ao processo.
--
-- Sem policy nenhuma e com RLS ligada: só service_role enxerga. Um token de
-- adquirente não deve ser legível por usuário autenticado do dashboard.

create table if not exists public.own_token_cache (
  chave                text primary key,
  access_token         text,
  expira_em            timestamptz,
  obtido_em            timestamptz,
  bloqueado_ate        timestamptz,
  lease_ate            timestamptz,
  ultimo_erro          text,
  autenticacoes_hoje   integer not null default 0,
  dia_contagem         date,
  atualizado_em        timestamptz not null default now()
);

comment on table public.own_token_cache is
  'Um registro por ambiente da OWN (sandbox/producao). Guarda o token vivo, a janela de bloqueio do perímetro e o lease de quem está autenticando agora.';
comment on column public.own_token_cache.bloqueado_ate is
  'Enquanto for futuro, ninguém tenta falar com a OWN. Escrito ao receber 429 ou 403-HTML. Medido em sandbox: o bloqueio dura ~7 minutos.';
comment on column public.own_token_cache.lease_ate is
  'Reserva de curta duração dada a um chamador para autenticar. Impede que duas invocações concorrentes façam dois logins — que é o gatilho do 429.';
comment on column public.own_token_cache.autenticacoes_hoje is
  'Telemetria. Se subir muito acima de (1440 / intervalo_do_job), há reautenticação indevida em algum lugar.';

alter table public.own_token_cache enable row level security;
revoke all on public.own_token_cache from authenticated, anon;

-- ── Pegar token ─────────────────────────────────────────────────────────────
-- Devolve um dos quatro estados. O chamador nunca decide sozinho se pode
-- autenticar: essa decisão é serializada aqui, no banco.

create or replace function public.own_token_pegar(
  p_chave   text default 'sandbox',
  p_margem  integer default 45
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.own_token_cache;
begin
  insert into public.own_token_cache(chave) values (p_chave) on conflict (chave) do nothing;
  select * into r from public.own_token_cache where chave = p_chave for update;

  if r.bloqueado_ate is not null and r.bloqueado_ate > now() then
    return jsonb_build_object('estado','bloqueado','ate',r.bloqueado_ate,
                              'segundos', ceil(extract(epoch from r.bloqueado_ate - now())));
  end if;

  if r.access_token is not null and r.expira_em > now() + make_interval(secs => p_margem) then
    return jsonb_build_object('estado','ok','token',r.access_token,'expira_em',r.expira_em);
  end if;

  if r.lease_ate is not null and r.lease_ate > now() then
    return jsonb_build_object('estado','aguarde','ate',r.lease_ate);
  end if;

  update public.own_token_cache
     set lease_ate = now() + interval '20 seconds', atualizado_em = now()
   where chave = p_chave;

  return jsonb_build_object('estado','autentique');
end $$;

comment on function public.own_token_pegar is
  'Estados: ok (usa o token), autentique (você ganhou o lease, faça o login), aguarde (outro está autenticando), bloqueado (perímetro fechado, nem tente).';

-- ── Gravar token novo ───────────────────────────────────────────────────────

create or replace function public.own_token_gravar(
  p_chave text, p_token text, p_expires_in integer
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.own_token_cache
     set access_token = p_token,
         expira_em    = now() + make_interval(secs => greatest(p_expires_in, 30)),
         obtido_em    = now(),
         lease_ate    = null,
         bloqueado_ate = null,
         ultimo_erro  = null,
         autenticacoes_hoje = case when dia_contagem = current_date
                                   then autenticacoes_hoje + 1 else 1 end,
         dia_contagem = current_date,
         atualizado_em = now()
   where chave = p_chave;
end $$;

-- ── Registrar bloqueio de perímetro ─────────────────────────────────────────

create or replace function public.own_token_bloquear(
  p_chave text, p_segundos integer default 420, p_erro text default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.own_token_cache
     set bloqueado_ate = now() + make_interval(secs => p_segundos),
         lease_ate     = null,
         access_token  = null,
         ultimo_erro   = p_erro,
         atualizado_em = now()
   where chave = p_chave;
end $$;

comment on function public.own_token_bloquear is
  'Default de 420s vem de medição em sandbox (13/08/2026): bloqueio observado de ~7 minutos após 429. Ajustar se a medição em produção divergir.';

revoke execute on function public.own_token_pegar(text,integer)   from anon, authenticated;
revoke execute on function public.own_token_gravar(text,text,integer) from anon, authenticated;
revoke execute on function public.own_token_bloquear(text,integer,text) from anon, authenticated;

-- ── Estado do pipeline, para o endpoint /saude do contrato com o ERP ────────

create or replace function public.own_saude()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'ultima_sincronizacao', (select max(concluido_em) from public.own_sync_execucoes where status = 'ok'),
    'atraso_minutos', (select floor(extract(epoch from now() - max(concluido_em))/60)
                         from public.own_sync_execucoes where status = 'ok'),
    'ultimo_status',  (select status from public.own_sync_execucoes order by iniciado_em desc limit 1),
    'perimetro_bloqueado_ate', (select bloqueado_ate from public.own_token_cache
                                 where bloqueado_ate > now() order by bloqueado_ate desc limit 1),
    'eventos_webhook_pendentes', (select count(*) from public.own_webhook_eventos where processado_em is null)
  );
$$;

comment on function public.own_saude is
  'Alimenta GET /saude da API do ERP. Existe para o cliente distinguir "não vendi hoje" de "a integração parou" sem abrir chamado.';