-- ═══════════════════════════════════════════════════════════════════════════
-- A TRILHA DE AUDITORIA VIRA APPEND-ONLY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ O ACHADO. `audit_log` tinha RLS ligada e UMA política — `org rw audit`,
-- PERMISSIVA, comando ALL, papel `authenticated` — mais os quatro privilégios
-- (SELECT, INSERT, UPDATE, DELETE). Ou seja: qualquer membro autenticado da
-- organização podia reescrever e apagar os próprios eventos, pelo PostgREST,
-- sem nada além do JWT que ele já tem para usar o produto.
--
-- Medido antes deste arquivo, com o papel `authenticated` de verdade e a linha
-- na própria organização do usuário:
--
--     UPDATE: 1 linha(s) REESCRITAS      ('valor 1000 → 10000' virou outra coisa)
--     DELETE: sobraram 0 linha(s)        (a trilha inteira)
--
-- O encadeamento SHA-256 de `core/institutional` torna a adulteração
-- DETECTÁVEL, e isso continua valendo — mas detectar não é impedir, e não há o
-- que detectar quando a cadeia inteira sai. A ONDA 9 aplicou políticas
-- restritivas em `movements`, `financial_accounts` e `org_state`, e deixou de
-- fora justamente a tabela cuja razão de existir é resistir a alteração.
--
-- ── AS QUATRO CAMADAS, E POR QUE NENHUMA SOZINHA BASTA ─────────────────────
--
--  1. POLÍTICAS RESTRITIVAS (update/delete → false). Permissiva só amplia;
--     restritiva é a única que TIRA. Sozinha não basta: `service_role` ignora
--     RLS por completo.
--
--  2. REVOGAÇÃO DOS PRIVILÉGIOS de update/delete/truncate de `authenticated`.
--     Sozinha não basta: uma política permissiva nova, ou um `grant` de default
--     privileges numa tabela recriada, devolve o acesso sem ninguém notar. É a
--     redundância que faz o buraco precisar de dois erros para voltar.
--
--  3. GATILHO DE LINHA (before update or delete). É esta camada que vale
--     TAMBÉM para `service_role` e para qualquer portador da chave de serviço —
--     que é quem, na prática, teria motivo e meio para reescrever história. RLS
--     não os alcança; gatilho alcança.
--
--  4. GATILHO DE TRUNCATE (before truncate, por comando). ⚠️ TRUNCATE NÃO
--     dispara gatilho de LINHA e NÃO é filtrado por RLS — foi exatamente esse o
--     achado da ONDA 9, quando `anon` podia esvaziar 57 tabelas sem violar
--     política nenhuma. Sem esta camada, a camada 3 daria a impressão de
--     imutabilidade com um `truncate` de distância.
--
-- ── A ÚNICA PORTA DE SAÍDA ─────────────────────────────────────────────────
--
-- Retenção continua existindo, e continua sendo a ÚNICA forma de uma linha sair
-- daqui: `audit_log_expurgar(dias)`, que já era `SECURITY DEFINER` gateada por
-- `is_platform_admin()`. O gatilho reconhece esse caminho perguntando pelo
-- MESMO portão, em vez de por um sinalizador de sessão: um `set_config` é
-- gravável por qualquer um que consiga executar SQL, e um portão que o próprio
-- invasor liga não é portão. `is_platform_admin()` responde pelo `auth.uid()`,
-- então uma chamada sem usuário (service_role puro, sem JWT) devolve falso e a
-- exclusão é recusada — que é o comportamento desejado.

/* ── 1. políticas restritivas ─────────────────────────────────────────────── */
drop policy if exists audit_log_sem_update on public.audit_log;
create policy audit_log_sem_update on public.audit_log
  as restrictive for update to authenticated
  using (false) with check (false);

drop policy if exists audit_log_sem_delete on public.audit_log;
create policy audit_log_sem_delete on public.audit_log
  as restrictive for delete to authenticated
  using (false);

/* ── 2. privilégios ───────────────────────────────────────────────────────── */
revoke update, delete, truncate on table public.audit_log from authenticated;
revoke truncate on table public.audit_log from service_role;

/* ── 3. gatilho de linha: vale inclusive para quem ignora RLS ─────────────── */
create or replace function public.audit_log_imutavel()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Alterar um evento é indistinguível de forjá-lo. Não há caminho sancionado.
  if tg_op = 'UPDATE' then
    raise exception 'A trilha de auditoria e append-only: alterar um evento nao e permitido.'
      using hint = 'Um evento errado se corrige com um evento novo, nao reescrevendo o antigo.';
  end if;

  -- Apagar tem UM caminho: a retenção, gateada por administrador da plataforma.
  if not public.is_platform_admin() then
    raise exception 'A trilha de auditoria e append-only: apagar eventos exige administrador da plataforma.'
      using hint = 'Use audit_log_expurgar(dias) — a retencao e o unico caminho sancionado.';
  end if;

  return old;
end;
$fn$;

drop trigger if exists audit_log_imutavel_trg on public.audit_log;
create trigger audit_log_imutavel_trg
  before update or delete on public.audit_log
  for each row execute function public.audit_log_imutavel();

/* ── 4. gatilho de TRUNCATE: a porta que RLS e gatilho de linha não fecham ── */
create or replace function public.audit_log_sem_truncate()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  raise exception 'A trilha de auditoria e append-only: TRUNCATE nao e permitido em audit_log.'
    using hint = 'Retencao por audit_log_expurgar(dias), que apaga por data e deixa o resto.';
end;
$fn$;

drop trigger if exists audit_log_sem_truncate_trg on public.audit_log;
create trigger audit_log_sem_truncate_trg
  before truncate on public.audit_log
  for each statement execute function public.audit_log_sem_truncate();

comment on table public.audit_log is
  'Trilha de auditoria APPEND-ONLY. Update e truncate sao recusados por gatilho (inclusive para service_role); delete so pela retencao audit_log_expurgar(dias), gateada por administrador da plataforma.';
