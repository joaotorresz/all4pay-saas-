-- ═══════════════════════════════════════════════════════════════════════════
-- ONDA 3 · A TRILHA DE NEGÓCIO VEM DO BANCO, NÃO DA TELA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Existia trilha do acesso ADMINISTRATIVO e eventos avulsos escritos à mão por
-- algumas funções. Não existia trilha da OPERAÇÃO: dar baixa num título,
-- corrigir o valor de um lançamento e apagar um cliente não deixavam registro
-- nenhum com o valor de antes e o de depois.
--
-- ⚠️ **A instrumentação é por GATILHO, e isso é a decisão central.** Um evento
-- escrito pelo código de tela depende de alguém lembrar de escrevê-lo em cada
-- caminho novo — e o caminho que ninguém lembra é justamente o que a auditoria
-- precisa. Este produto tem baixa em lote, importação de extrato, recorrência
-- que gera fatura, conciliação, RPC e o PostgREST direto: seis portas para o
-- mesmo movimento. O gatilho não esquece: se a linha mudou, o evento existe.
-- É a mesma escolha que a ONDA 8 fez para `org_state`, agora generalizada.
--
-- ⚠️ **Uma tabela só** (`audit_log`), estendida — e não uma segunda tabela ao
-- lado. `core/institutional` encadeia os eventos por SHA-256 e é essa cadeia
-- que denuncia adulteração; uma trilha paralela discordaria da primeira, e duas
-- trilhas que discordam não provam nada.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.audit_log
  add column if not exists entidade    text,
  add column if not exists entidade_id text,
  add column if not exists origem      text,
  add column if not exists ip          inet,
  add column if not exists correlacao  text;

comment on column public.audit_log.entidade is
  'Tabela de origem do evento. É por ela que a aba de histórico de um registro encontra os seus eventos.';
comment on column public.audit_log.correlacao is
  'Identificador da requisição. Uma baixa em lote de 300 títulos são 300 eventos de UMA decisão; sem ele a trilha vira 300 decisões.';

-- ⚠️ O índice é por (org, entidade, id): a pergunta que a tela faz é sempre
-- "o que aconteceu COM ESTE registro". Sem ele, abrir a aba de histórico de um
-- título varre a trilha inteira da empresa.
create index if not exists audit_log_entidade_idx
  on public.audit_log (org_id, entidade, entidade_id, created_at desc)
  where entidade is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- O GATILHO GENÉRICO
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ `origem`, `ip` e `correlacao` saem dos cabeçalhos da própria requisição,
-- não de um parâmetro que a tela passa. Parâmetro é preenchido por quem lembra;
-- cabeçalho vem sempre. Quando não há requisição (cron, psql, migration), os
-- três ficam nulos e `origem` diz 'servidor' — que é a verdade, e é diferente
-- de fingir um endereço.
--
-- ⚠️ No UPDATE só entram os campos que MUDARAM. Guardar a linha inteira duas
-- vezes a cada correção de centavo faria a trilha crescer mais rápido que o
-- dado que ela descreve — e a auditoria pergunta "o que mudou", não "como era
-- tudo". A identidade da linha vai à parte, em `entidade_id`.
create or replace function public.auditar_escrita()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_antes   jsonb;
  v_depois  jsonb;
  v_id      text;
  v_org     uuid;
  v_acao    text;
  v_hdr     json;
  v_ip      inet;
  v_corr    text;
  v_origem  text;
  k         text;
begin
  begin
    v_hdr := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_hdr := null;
  end;

  if v_hdr is null then
    v_origem := 'servidor';
  else
    v_origem := coalesce(v_hdr ->> 'x-client-info', 'aplicativo');
    -- O primeiro endereço do encadeamento é o do cliente; os seguintes são
    -- procuradores. Pegar o último registraria a borda da CDN em toda linha.
    v_ip   := nullif(split_part(coalesce(v_hdr ->> 'x-forwarded-for', ''), ',', 1), '')::inet;
    v_corr := coalesce(v_hdr ->> 'x-request-id', v_hdr ->> 'cf-ray');
  end if;

  if tg_op = 'DELETE' then
    v_antes  := to_jsonb(old);
    v_depois := null;
    v_acao   := tg_table_name || '.excluir';
    v_id     := (to_jsonb(old) ->> 'id');
    v_org    := (to_jsonb(old) ->> 'org_id')::uuid;
  elsif tg_op = 'INSERT' then
    v_antes  := null;
    v_depois := to_jsonb(new);
    v_acao   := tg_table_name || '.criar';
    v_id     := (to_jsonb(new) ->> 'id');
    v_org    := (to_jsonb(new) ->> 'org_id')::uuid;
  else
    v_antes  := '{}'::jsonb;
    v_depois := '{}'::jsonb;
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if to_jsonb(new) -> k is distinct from to_jsonb(old) -> k then
        v_antes  := v_antes  || jsonb_build_object(k, to_jsonb(old) -> k);
        v_depois := v_depois || jsonb_build_object(k, to_jsonb(new) -> k);
      end if;
    end loop;
    -- ⚠️ Um UPDATE que não muda nada não vira evento. Sem isto, um "salvar" sem
    -- alteração enche a trilha de linhas que dizem que nada aconteceu — e é
    -- justamente entre elas que a alteração real se esconde.
    if v_depois = '{}'::jsonb then
      return coalesce(new, old);
    end if;
    v_acao := tg_table_name || '.alterar';
    v_id   := (to_jsonb(new) ->> 'id');
    v_org  := (to_jsonb(new) ->> 'org_id')::uuid;
  end if;

  insert into public.audit_log
    (org_id, usuario, acao, antes, depois, entidade, entidade_id, origem, ip, correlacao)
  values
    (v_org, coalesce(auth.uid()::text, 'sistema'), v_acao, v_antes, v_depois,
     tg_table_name, v_id, v_origem, v_ip, v_corr);

  return coalesce(new, old);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ONDE ELE ENTRA — e por que algumas ficam de fora
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ A instalação é por VARREDURA, não por lista escrita à mão: uma lista
-- envelhece na primeira tabela nova, e envelhecer aqui significa uma entidade
-- de negócio sem trilha, em silêncio. A guarda cobra o contrário — toda tabela
-- de negócio com gatilho — e é a varredura que a mantém verdadeira.
do $$
declare
  r record;
  -- As exclusões, cada uma com motivo:
  --  audit_log        — recursão infinita.
  --  org_state        — a ONDA 8 já lhe deu gatilho PRÓPRIO, que grava tamanho
  --                     e versão em vez do valor; o valor chega a 380 kB e
  --                     duplicá-lo a cada gravação faria a trilha crescer mais
  --                     rápido que o dado.
  --  admin_acessos,
  --  admin_audit      — já SÃO trilha. Auditar a auditoria é ruído puro.
  --  rota_alias_acessos,
  --  ddl_log          — telemetria de alto volume, sem valor de negócio.
  --  raw_events       — o que entra bruto da ingestão; o evento de negócio é o
  --                     `movements` que sai dela.
  fora text[] := array[
    'audit_log','org_state','admin_acessos','admin_audit',
    'rota_alias_acessos','ddl_log','raw_events'
  ];
begin
  for r in
    select c.relname::text as t
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname <> all (fora)
     order by c.relname
  loop
    execute format('drop trigger if exists %I on public.%I', 'zz_auditar_' || r.t, r.t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.auditar_escrita()',
      'zz_auditar_' || r.t, r.t
    );
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- A LEITURA POR REGISTRO
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ `SECURITY INVOKER`: a política de `audit_log` já recorta por empresa, e é
-- ela que deve decidir. Uma função `DEFINER` aqui entregaria o histórico de
-- qualquer registro de qualquer empresa a quem soubesse um identificador.
create or replace function public.historico_do_registro(
  p_entidade text, p_id text, p_limite int default 100
)
returns table(
  id uuid, quando timestamptz, usuario text, acao text,
  antes jsonb, depois jsonb, origem text, ip inet, correlacao text
)
language sql
security invoker
stable
set search_path to 'public'
as $$
  select a.id, a.created_at, a.usuario, a.acao,
         a.antes, a.depois, a.origem, a.ip, a.correlacao
    from public.audit_log a
   where a.entidade = p_entidade
     and a.entidade_id = p_id
   order by a.created_at desc
   limit greatest(1, least(coalesce(p_limite, 100), 500));
$$;

revoke all on function public.historico_do_registro(text, text, int) from public;
grant execute on function public.historico_do_registro(text, text, int) to authenticated;
