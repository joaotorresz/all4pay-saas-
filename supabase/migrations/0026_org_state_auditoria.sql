-- ═══════════════════════════════════════════════════════════════════════════
-- ONDA 8 — A TRILHA DE AUDITORIA LIGADA NA ORIGEM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ O achado era "registro de auditoria com ZERO eventos", e a causa não era o
-- registro: era que nada passava pelo servidor. Todo dado de negócio vivia no
-- `localStorage`, e o navegador não tem como assinar nada. Com `org_state`
-- (0024) o dado passou a subir — falta o evento.
--
-- **Por que TRIGGER e não uma chamada no aplicativo:** um evento escrito pelo
-- código de tela depende de alguém lembrar de escrevê-lo em cada caminho novo,
-- e o caminho que ninguém lembra é justamente o que a auditoria precisa. O
-- gatilho não se esquece: se a linha mudou, o evento existe.
--
-- **Por que não guardar o valor inteiro** em `antes`/`depois`: um estado pode
-- ter megabytes (o razão, os fechamentos), e duplicá-lo a cada gravação faria a
-- trilha crescer mais rápido que o dado. O evento guarda o que uma auditoria
-- pergunta — qual chave, quem, quando, que versão, quanto mudou de tamanho — e
-- o valor continua em `org_state`, versionado.

create or replace function public.org_state_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb;
begin
  if (tg_op = 'UPDATE') then
    v_antes := jsonb_build_object(
      'versao', old.versao,
      'bytes', length(old.valor::text),
      'atualizado_em', old.atualizado_em
    );
  end if;

  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (
    new.org_id,
    coalesce(auth.uid()::text, 'sistema'),
    case when tg_op = 'INSERT' then 'estado.criar' else 'estado.gravar' end,
    v_antes,
    jsonb_build_object(
      'org_id', new.org_id,
      'chave', new.chave,
      'versao', new.versao,
      'bytes', length(new.valor::text)
    )
  );
  return new;
end;
$$;

revoke execute on function public.org_state_auditar() from public, anon;

drop trigger if exists org_state_auditoria on public.org_state;
create trigger org_state_auditoria
  after insert or update on public.org_state
  for each row execute function public.org_state_auditar();

-- ---------------------------------------------------------------------------
-- RETENÇÃO — a política escrita como função, não como intenção.
-- ---------------------------------------------------------------------------
-- ⚠️ Trilha sem retenção é trilha que ninguém consulta: em um ano ela fica
-- grande demais para responder rápido, e a resposta lenta vira resposta que
-- não se pede. 180 dias cobre um exercício fiscal fechado com folga; o que sai
-- daqui já foi para o pacote do contador, que é onde o histórico longo mora.
create or replace function public.audit_log_expurgar(p_dias int default 180)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not public.is_platform_admin() then
    raise exception 'apenas administradores da plataforma';
  end if;
  delete from public.audit_log where created_at < now() - make_interval(days => p_dias);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.audit_log_expurgar(int) from public, anon;

-- ---------------------------------------------------------------------------
-- BACKUP — ler o estado inteiro da organização de uma vez.
-- ---------------------------------------------------------------------------
-- A tela de armazenamento monta o arquivo com isto. `SECURITY INVOKER` de
-- propósito: a RLS de `org_state` já escopa por organização, e uma função
-- DEFINER aqui abriria um caminho para ler o estado de outra empresa se algum
-- dia o filtro saísse do lugar.
create or replace function public.org_state_backup()
returns table (chave text, valor jsonb, versao bigint, atualizado_em timestamptz)
language sql
security invoker
set search_path = public
as $$
  select s.chave, s.valor, s.versao, s.atualizado_em from public.org_state s;
$$;

revoke execute on function public.org_state_backup() from anon;
