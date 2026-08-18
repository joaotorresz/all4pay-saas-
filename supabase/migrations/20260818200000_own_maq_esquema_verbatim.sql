-- ═══════════════════════════════════════════════════════════════════════════
-- A4P-076 — O SUBSISTEMA QUE VIVIA FORA DO REPOSITÓRIO, TRAZIDO PARA DENTRO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Estes objetos foram criados DIRETO em produção pelas sessões que construíram
-- a integração de adquirência (OWN/Agilli) e a maquininha — nenhuma migration
-- os criava. O custo é o de sempre: um banco montado do zero nasce sem eles, e
-- "o schema" passa a ser duas coisas conforme quem pergunta.
--
-- ⚠️ **MÉTODO — de onde saiu cada definição, porque "verbatim" tem grau:**
--   · FUNÇÕES: `pg_get_functiondef(oid)` — o texto LITERAL do catálogo de
--     produção, sem transcrição minha (18/08/2026).
--   · VIEW: `pg_get_viewdef(oid, true)` — idem, literal do catálogo.
--   · TABELAS: o Postgres não tem `pg_get_tabledef`; o CREATE foi montado
--     MECANICAMENTE do catálogo (`pg_attribute` + `format_type` +
--     `pg_get_expr` para defaults + `pg_get_constraintdef`), na ordem de
--     `attnum`. É derivação do catálogo, não memória de sessão — e a guarda
--     `npm run objetos` confere a assinatura resultante contra o retrato de
--     produção, então uma divergência de transcrição reprova o CI.
--
-- Idempotente de propósito: em produção os objetos JÁ existem (`if not
-- exists` não faz nada; `or replace` recria idêntico); no banco efêmero do CI
-- eles passam a nascer daqui — que é o ponto.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. own_token_cache — o cache de token OAuth da OWN, com lease e bloqueio
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.own_token_cache (
  chave text not null,
  access_token text,
  expira_em timestamp with time zone,
  obtido_em timestamp with time zone,
  bloqueado_ate timestamp with time zone,
  lease_ate timestamp with time zone,
  ultimo_erro text,
  autenticacoes_hoje integer not null default 0,
  dia_contagem date,
  atualizado_em timestamp with time zone not null default now(),
  constraint own_token_cache_pkey primary key (chave)
);

comment on table public.own_token_cache is
  'Um registro por ambiente da OWN (sandbox/producao). Guarda o token vivo, a janela de bloqueio do perímetro e o lease de quem está autenticando agora.';
comment on column public.own_token_cache.bloqueado_ate is
  'Enquanto for futuro, ninguém tenta falar com a OWN. Escrito ao receber 429 ou 403-HTML. Medido em sandbox: o bloqueio dura ~7 minutos.';
comment on column public.own_token_cache.lease_ate is
  'Reserva de curta duração dada a um chamador para autenticar. Impede que duas invocações concorrentes façam dois logins — que é o gatilho do 429.';
comment on column public.own_token_cache.autenticacoes_hoje is
  'Telemetria. Se subir muito acima de (1440 / intervalo_do_job), há reautenticação indevida em algum lugar.';

-- RLS ligada SEM política: só função DEFINER (own_token_pegar/gravar/bloquear)
-- alcança — é onde um token de terceiro deve morar.
alter table public.own_token_cache enable row level security;
-- ⚠️ Em produção `authenticated` NÃO tem grant nesta tabela; no banco efêmero
-- os privilégios-padrão dariam. Revogar aqui é o que faz o efêmero espelhar
-- produção — e é o certo: o token da OWN não é assunto do papel do navegador.
revoke all on public.own_token_cache from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. maq_cnpj_cache — cache das consultas de CNPJ da maquininha (get-rate)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.maq_cnpj_cache (
  cnpj text not null,
  cnae bigint,
  razao_social text,
  nome_fantasia text,
  cnae_descricao text,
  situacao text,
  cached_at timestamp with time zone not null default now(),
  constraint maq_cnpj_cache_pkey primary key (cnpj)
);
-- RLS ligada sem política, como em produção. O grant residual de
-- `authenticated` que produção carrega é INERTE (RLS nega tudo) e fica
-- reproduzido pelos privilégios-padrão do efêmero — mesma família do A4P-070,
-- anotado lá; não é o assunto desta migration.
alter table public.maq_cnpj_cache enable row level security;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. As quatro funções — literal de pg_get_functiondef (produção, 18/08/2026)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.own_token_pegar(p_chave text DEFAULT 'sandbox'::text, p_margem integer DEFAULT 45)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.own_token_gravar(p_chave text, p_token text, p_expires_in integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.own_token_bloquear(p_chave text, p_segundos integer DEFAULT 420, p_erro text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.own_token_cache
     set bloqueado_ate = now() + make_interval(secs => p_segundos),
         lease_ate     = null,
         access_token  = null,
         ultimo_erro   = p_erro,
         atualizado_em = now()
   where chave = p_chave;
end $function$;

CREATE OR REPLACE FUNCTION public.own_saude()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'ultima_sincronizacao', (select max(concluido_em) from public.own_sync_execucoes where status = 'ok'),
    'atraso_minutos', (select floor(extract(epoch from now() - max(concluido_em))/60)
                         from public.own_sync_execucoes where status = 'ok'),
    'ultimo_status',  (select status from public.own_sync_execucoes order by iniciado_em desc limit 1),
    'perimetro_bloqueado_ate', (select bloqueado_ate from public.own_token_cache
                                 where bloqueado_ate > now() order by bloqueado_ate desc limit 1),
    'eventos_webhook_pendentes', (select count(*) from public.own_webhook_eventos where processado_em is null)
  );
$function$;

-- ⚠️ Os EXECUTEs destas funções ficam como produção os tem HOJE (PUBLIC — o
-- default do Postgres, que ninguém revogou). Esta migration é o retrato
-- verbatim; o CONSERTO desse buraco — own_token_pegar devolve o token da OWN a
-- qualquer papel — mora na migration de grants mínimos, ao lado, com o P0
-- explicado. Retrato e conserto separados: um arquivo que descreve E muda o
-- estado no mesmo gesto esconde qual metade fez o quê.

-- ───────────────────────────────────────────────────────────────────────────
-- 4. own_extrato_lojista — a view que o ERP do lojista enxerga
-- ───────────────────────────────────────────────────────────────────────────
-- Literal de pg_get_viewdef. ⚠️ `security_invoker = true` é parte do contrato:
-- sem ele a view rodaria como o dono e IGNORARIA a RLS de own_transacoes.
create or replace view public.own_extrato_lojista
  with (security_invoker = true) as
 SELECT t.org_id,
    t.lojista_id,
    l.doc_parceiro,
    t.identificador_transacao,
    t.data_transacao,
    t.valor AS valor_bruto,
    t.mdr AS taxa_mdr,
    t.valor - COALESCE(t.mdr, 0::numeric) AS valor_liquido_previsto,
    t.quantidade_parcelas,
    t.status_transacao,
    t.bandeira,
    t.modalidade,
    t.numero_cartao,
    t.numero_serie,
    t.codigo_autorizacao,
    ( SELECT count(*) AS count
           FROM own_parcelas p
          WHERE p.transacao_id = t.id AND p.status_pagamento ~~* 'pago'::text) AS parcelas_pagas,
    ( SELECT COALESCE(sum(p.valor_parcela), 0::numeric) AS "coalesce"
           FROM own_parcelas p
          WHERE p.transacao_id = t.id AND p.status_pagamento ~~* 'pago'::text) AS valor_ja_liquidado,
    ( SELECT min(p.data_pagamento_prevista) AS min
           FROM own_parcelas p
          WHERE p.transacao_id = t.id AND p.data_pagamento_real IS NULL) AS proximo_vencimento
   FROM own_transacoes t
     JOIN own_lojistas l ON l.id = t.lojista_id;

comment on view public.own_extrato_lojista is
  'Forma estável que o ERP do lojista enxerga. Não expõe cnpj_cliente da Privilege nem estrutura da adquirente — se a OWN mudar de schema amanhã, esta view absorve a mudança e o contrato com o ERP não quebra.';
