-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 1 — IDENTIDADE DE PLATAFORMA COM PRAZO, E A TRILHA DO ADMINISTRADOR
--            VIRA APPEND-ONLY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ O ACHADO QUE ORDENA ESTE ARQUIVO: a imutabilidade estava INVERTIDA.
-- `audit_log` — a trilha do CLIENTE — virou append-only ontem, com política
-- restritiva, gatilho de linha, gatilho de TRUNCATE e revogação de privilégio.
-- `admin_audit` e `admin_acessos` — a trilha de quem enxerga TODAS as
-- organizações — não têm política nenhuma, gatilho nenhum, e `service_role`
-- pode UPDATE e DELETE nas duas. Medido antes deste arquivo:
--
--     admin_audit    · rls=true · politicas=0 · gatilhos=0 · service_role UPDATE e DELETE
--     admin_acessos  · rls=true · politicas=0 · gatilhos=0 · service_role UPDATE e DELETE
--
-- Quem mais precisa de trilha resistente é justamente quem não tinha — e a rota
-- de impersonação roda com a chave de serviço, que é exatamente o portador que
-- teria meio e motivo para reescrever a própria passagem.
--
-- E o segundo achado, da mesma família: existem DOIS portões com nomes
-- parecidos e forças diferentes. `admin_veredito()` (ONDA 9) confere segundo
-- fator, prazo e expiração; `is_platform_admin()` confere só se o `user_id`
-- está numa tabela. As treze funções administrativas usam o primeiro; o expurgo
-- da trilha do cliente, o gatilho de imutabilidade dela e a própria tela usam o
-- segundo. Um portão fraco ao lado de um forte não é redundância: é a porta
-- pela qual se entra.
--
-- ── O QUE ESTE ARQUIVO NÃO RESOLVE, E POR QUÊ ──────────────────────────────
--
-- Ele NÃO separa a identidade do administrador da identidade do inquilino —
-- isso exige domínio e build próprios (o "passo 0"), e mudar de casa antes de
-- trancar as portas é trocar a ordem do trabalho, não o resultado. O que ele
-- faz é tornar a promoção CARA e RASTREÁVEL: virar administrador passa a exigir
-- duas tabelas e deixa registro indelével na trilha. Com a chave de serviço em
-- mãos ainda é possível fazer as duas coisas — e é por isso que a separação
-- continua na lista, não porque este arquivo a substitua.

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. A LISTA DE ENDEREÇOS PERMITIDOS
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ Ser dono de uma organização não pode virar administrador de plataforma por
 * alteração de UMA linha. Com a lista, a promoção exige duas escritas em duas
 * tabelas, e a segunda (item 2) grava na trilha — o que antes era um `insert`
 * silencioso passa a ser um evento que alguém consegue ver depois. */
create table if not exists public.platform_admin_permitidos (
  email      text primary key check (email = lower(email)),
  motivo     text not null,
  criado_em  timestamptz not null default now(),
  criado_por uuid
);
alter table public.platform_admin_permitidos enable row level security;
revoke all on public.platform_admin_permitidos from anon, authenticated;

comment on table public.platform_admin_permitidos is
  'Enderecos que PODEM ser administradores da plataforma. Estar aqui nao concede acesso; nao estar aqui impede a concessao (gatilho em platform_admins).';

/* Semeia com quem já é administrador — sem isto, a primeira gravação em
 * `platform_admins` (uma revisão de prazo, por exemplo) derrubaria o acesso do
 * único administrador que existe. Trancar a porta com a pessoa do lado de fora
 * é o modo mais comum de um controle de segurança ser desligado na semana
 * seguinte. */
insert into public.platform_admin_permitidos (email, motivo)
select lower(u.email), 'ja era administrador quando a lista foi criada'
  from public.platform_admins p
  join auth.users u on u.id = p.user_id
 where u.email is not null
on conflict (email) do nothing;

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. NINGUÉM VIRA ADMINISTRADOR FORA DA LISTA — E NUNCA EM SILÊNCIO
 * ═══════════════════════════════════════════════════════════════════════════ */
create or replace function public.platform_admins_so_permitidos()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare v_email text;
begin
  select lower(u.email) into v_email from auth.users u where u.id = new.user_id;
  if v_email is null then
    raise exception 'Administrador de plataforma: o usuario % nao existe.', new.user_id;
  end if;
  if not exists (select 1 from public.platform_admin_permitidos a where a.email = v_email) then
    raise exception 'Administrador de plataforma: % nao esta na lista de enderecos permitidos.', v_email
      using hint = 'Inclua o endereco em platform_admin_permitidos, com motivo, antes de conceder o acesso.';
  end if;
  return new;
end;
$fn$;

drop trigger if exists platform_admins_so_permitidos_trg on public.platform_admins;
create trigger platform_admins_so_permitidos_trg
  before insert or update on public.platform_admins
  for each row execute function public.platform_admins_so_permitidos();

/* ⚠️ A lista também deixa rastro. Sem isto, quem tem a chave de serviço se
 * inclui na lista e se promove sem que nada apareça — a lista teria virado
 * burocracia, que é o pior resultado possível para um controle. */
create or replace function public.registrar_mudanca_de_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_antes  jsonb;
  v_depois jsonb;
  v_alvo   text;
begin
  /* ⚠️ Em PL/pgSQL, `old` NÃO existe num gatilho de INSERT e `new` não existe
   * num de DELETE — tocar no que não foi atribuído levanta "record is not
   * assigned yet" e derruba a operação. Um gatilho de auditoria que quebra a
   * escrita que ele deveria apenas observar é pior que auditoria nenhuma. */
  if tg_op <> 'INSERT' then v_antes  := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_depois := to_jsonb(new); end if;

  v_alvo := case tg_table_name
    when 'platform_admin_permitidos' then coalesce(v_depois ->> 'email', v_antes ->> 'email')
    else coalesce(v_depois ->> 'user_id', v_antes ->> 'user_id')
  end;

  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(),
          tg_table_name || '.' || lower(tg_op),
          v_alvo,
          jsonb_build_object('antes', v_antes, 'depois', v_depois));

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$fn$;

drop trigger if exists platform_admins_registro_trg on public.platform_admins;
create trigger platform_admins_registro_trg
  after insert or update or delete on public.platform_admins
  for each row execute function public.registrar_mudanca_de_admin();

drop trigger if exists platform_admin_permitidos_registro_trg on public.platform_admin_permitidos;
create trigger platform_admin_permitidos_registro_trg
  after insert or update or delete on public.platform_admin_permitidos
  for each row execute function public.registrar_mudanca_de_admin();

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. UM PORTÃO SÓ — `is_platform_admin()` passa a responder pelo VEREDITO
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ Os dois portões conferiam coisas diferentes, e o fraco governava o expurgo
 * da trilha do cliente. Agora os dois respondem pela MESMA regra: estar na
 * tabela, dentro do prazo de revisão, e com o segundo fator conforme o prazo de
 * adoção. Nada muda hoje para quem está em dia — o veredito só nega quando o
 * prazo vence, que é o comportamento que a ONDA 9 declarou.
 *
 * Sem JWT (chamada com a chave de serviço pura) `auth.uid()` é nulo, o veredito
 * nega, e o expurgo da trilha continua recusado — que é o desejado. */
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select v.permitido from public.admin_veredito() v), false);
$$;

comment on function public.is_platform_admin() is
  'Portao unico do administrador da plataforma: delega a admin_veredito() (tabela + prazo de revisao + segundo fator conforme prazo).';

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. AS DUAS TRILHAS DO ADMINISTRADOR VIRAM APPEND-ONLY
 * ═══════════════════════════════════════════════════════════════════════════
 * As mesmas quatro camadas de `audit_log`, pelas mesmas razões:
 *   1. políticas restritivas — permissiva só amplia; restritiva é a única que
 *      tira. Não bastam: `service_role` ignora RLS.
 *   2. revogação de privilégio — a redundância que faz o buraco precisar de
 *      dois erros para voltar.
 *   3. gatilho de LINHA — a única camada que alcança `service_role`, que é
 *      quem, na prática, teria meio e motivo para reescrever história.
 *   4. gatilho de TRUNCATE — não dispara gatilho de linha nem passa por RLS.
 *      Sem ele, a camada 3 daria a impressão de imutabilidade com um `truncate`
 *      de distância; foi assim que `anon` esvaziava 57 tabelas na ONDA 9.
 *
 * ⚠️ AQUI EU DIVIRJO DA ESPECIFICAÇÃO DE PROPÓSITO. Ela dizia "sem exclusão
 * para qualquer papel que não seja de serviço". Mas o papel de serviço é
 * exatamente quem executa a impersonação, e uma trilha que o portador da chave
 * pode apagar não registra o acesso que mais importa registrar. A exclusão fica
 * bloqueada TAMBÉM para ele, e a única saída é a retenção do item 5 — gateada,
 * por data, e ela mesma registrada. */
create or replace function public.trilha_admin_imutavel()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Trilha do administrador e append-only: alterar % nao e permitido.', tg_table_name
      using hint = 'Um registro errado se corrige com um registro novo, nao reescrevendo o antigo.';
  end if;
  if not public.is_platform_admin() then
    raise exception 'Trilha do administrador e append-only: apagar em % exige administrador da plataforma em dia.', tg_table_name
      using hint = 'Use admin_trilha_expurgar(dias) — a retencao e o unico caminho sancionado.';
  end if;
  return old;
end;
$fn$;

create or replace function public.trilha_admin_sem_truncate()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  raise exception 'Trilha do administrador e append-only: TRUNCATE nao e permitido em %.', tg_table_name
    using hint = 'Retencao por admin_trilha_expurgar(dias), que apaga por data e deixa o resto.';
end;
$fn$;

/* --- admin_audit --- */
drop policy if exists admin_audit_sem_update on public.admin_audit;
create policy admin_audit_sem_update on public.admin_audit
  as restrictive for update to authenticated using (false) with check (false);
drop policy if exists admin_audit_sem_delete on public.admin_audit;
create policy admin_audit_sem_delete on public.admin_audit
  as restrictive for delete to authenticated using (false);
revoke select, insert, update, delete, truncate on table public.admin_audit from anon, authenticated;
revoke truncate on table public.admin_audit from service_role;

drop trigger if exists admin_audit_imutavel_trg on public.admin_audit;
create trigger admin_audit_imutavel_trg
  before update or delete on public.admin_audit
  for each row execute function public.trilha_admin_imutavel();

drop trigger if exists admin_audit_sem_truncate_trg on public.admin_audit;
create trigger admin_audit_sem_truncate_trg
  before truncate on public.admin_audit
  for each statement execute function public.trilha_admin_sem_truncate();

/* --- admin_acessos --- */
drop policy if exists admin_acessos_sem_update on public.admin_acessos;
create policy admin_acessos_sem_update on public.admin_acessos
  as restrictive for update to authenticated using (false) with check (false);
drop policy if exists admin_acessos_sem_delete on public.admin_acessos;
create policy admin_acessos_sem_delete on public.admin_acessos
  as restrictive for delete to authenticated using (false);
revoke truncate on table public.admin_acessos from service_role;

drop trigger if exists admin_acessos_imutavel_trg on public.admin_acessos;
create trigger admin_acessos_imutavel_trg
  before update or delete on public.admin_acessos
  for each row execute function public.trilha_admin_imutavel();

drop trigger if exists admin_acessos_sem_truncate_trg on public.admin_acessos;
create trigger admin_acessos_sem_truncate_trg
  before truncate on public.admin_acessos
  for each statement execute function public.trilha_admin_sem_truncate();

comment on table public.admin_audit is
  'Trilha das ACOES do administrador da plataforma. APPEND-ONLY: update e truncate recusados por gatilho (inclusive para service_role); delete so por admin_trilha_expurgar(dias).';
comment on table public.admin_acessos is
  'Trilha dos ACESSOS do administrador da plataforma (inclusive os negados). APPEND-ONLY, mesmas regras de admin_audit.';

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. A ÚNICA SAÍDA: retenção por data, gateada e registrada
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ Sem retenção, a trilha cresce até a consulta ficar lenta, e resposta lenta
 * vira resposta que não se pede. Mas a retenção também é a única porta de
 * saída, então ela é gateada pelo veredito e deixa o próprio registro — apagar
 * a trilha sem que o apagamento apareça nela é a fraude que a imutabilidade
 * existe para impedir.
 *
 * NÃO há agendamento aqui, de propósito: prometer uma retenção que ninguém roda
 * é o defeito que a tela de Logs já tem (ela diz 30 dias e nada expurga). */
create or replace function public.admin_trilha_expurgar(p_dias int default 365)
returns table (tabela text, removidas bigint)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare n_audit bigint; n_acessos bigint;
begin
  perform public.admin_exigir_acesso('admin_trilha_expurgar', p_dias::text);
  if p_dias < 90 then
    raise exception 'Retencao minima da trilha do administrador e de 90 dias (pedido: %).', p_dias;
  end if;

  with fora as (
    delete from public.admin_audit where created_at < now() - make_interval(days => p_dias) returning 1
  ) select count(*) into n_audit from fora;

  with fora as (
    delete from public.admin_acessos where quando < now() - make_interval(days => p_dias) returning 1
  ) select count(*) into n_acessos from fora;

  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'trilha.expurgo', p_dias::text,
          jsonb_build_object('dias', p_dias, 'admin_audit', n_audit, 'admin_acessos', n_acessos));

  return query values ('admin_audit', n_audit), ('admin_acessos', n_acessos);
end;
$$;
revoke execute on function public.admin_trilha_expurgar(int) from public, anon;
grant execute on function public.admin_trilha_expurgar(int) to authenticated;

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. DEFESA EM PROFUNDIDADE nas tabelas da plataforma
 * ═══════════════════════════════════════════════════════════════════════════
 * As três já negam por RLS sem política. O privilégio de tabela continuava
 * concedido a `authenticated` — não é buraco hoje, é o segundo erro que
 * bastaria para virar um. `admin_acessos` já tinha sido revogada na ONDA 9;
 * estas ficaram para trás. */
revoke all on table public.platform_admins from anon, authenticated;
revoke all on table public.subscriptions   from anon, authenticated;
revoke all on table public.plans           from anon, authenticated;