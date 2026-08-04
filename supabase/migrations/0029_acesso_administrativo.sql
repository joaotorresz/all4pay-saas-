-- ═══════════════════════════════════════════════════════════════════════════
-- ONDA 9 (parte 3) — O ACESSO ADMINISTRATIVO DEIXA RASTRO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ A área administrativa enxerga TODAS as organizações da plataforma — nome,
-- faturamento, contagem de lançamentos, contatos dos donos. Treze funções
-- respondem por ela, e **oito são de leitura e não registravam nada**: mudar o
-- plano de um cliente deixava rastro, mas ABRIR a lista de todos os clientes,
-- ler o detalhe cadastral de um usuário ou exportar o panorama de receita não
-- deixava. Numa investigação, a pergunta nunca é "quem alterou" — é "quem viu".
--
-- Três defeitos, três respostas:
--
--  1. **Leitura sem registro** → `admin_acessos` + `admin_exigir_acesso()`, que
--     é ao mesmo tempo o portão e o registro. Quem é portão e não registra
--     produz exatamente o silêncio que existe hoje.
--  2. **Sem reforço de autenticação** → o acesso passa a exigir segundo fator.
--     ⚠️ Com PRAZO, não da noite para o dia: o único administrador da
--     plataforma hoje não tem fator cadastrado, e exigir agora tiraria o acesso
--     de quem precisaria dele para consertar. O prazo é uma data visível na
--     tela, não uma intenção.
--  3. **Sem revisão periódica** → `expira_em` e `revisado_em`. Acesso
--     administrativo que não vence é acesso que ninguém revisita: a lista só
--     cresce, e cada nome que fica é um nome que ninguém decidiu manter.

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. QUEM É ADMINISTRADOR, POR QUÊ, E ATÉ QUANDO
 * ═══════════════════════════════════════════════════════════════════════════ */
alter table public.platform_admins add column if not exists motivo      text;
alter table public.platform_admins add column if not exists expira_em   date;
alter table public.platform_admins add column if not exists revisado_em timestamptz;
alter table public.platform_admins add column if not exists revisado_por uuid;
alter table public.platform_admins add column if not exists exige_mfa   boolean not null default true;
/* O prazo para cadastrar o segundo fator. Depois dele, sem fator não há acesso. */
alter table public.platform_admins add column if not exists mfa_prazo   date;
update public.platform_admins set mfa_prazo = current_date + 30 where mfa_prazo is null;

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. O REGISTRO INDIVIDUAL
 * ═══════════════════════════════════════════════════════════════════════════ */
create table if not exists public.admin_acessos (
  id        bigint generated always as identity primary key,
  admin_id  uuid,
  funcao    text not null,
  alvo      text,
  aal       text,
  permitido boolean not null,
  motivo    text,
  quando    timestamptz not null default now()
);
create index if not exists admin_acessos_quando_idx on public.admin_acessos (quando desc);
create index if not exists admin_acessos_admin_idx  on public.admin_acessos (admin_id, quando desc);

/* RLS ligada e NENHUMA política: a tabela só é alcançável pelas funções
 * `SECURITY DEFINER` abaixo. Um registro de acesso que o próprio acessado pode
 * apagar não é registro. */
alter table public.admin_acessos enable row level security;
revoke all on public.admin_acessos from anon, authenticated;

/* ---------------------------------------------------------------------------
 * O VEREDITO — a regra, sem efeito colateral, num lugar só.
 *
 * Separada do registro e do portão de propósito: as duas funções abaixo
 * precisam decidir *igual*, e duas cópias da regra divergiriam no primeiro
 * ajuste — uma liberando o que a outra nega.
 * ------------------------------------------------------------------------- */
create or replace function public.admin_veredito()
returns table (permitido boolean, motivo text, aal text, exige_mfa boolean, fatores int, mfa_prazo date, expira_em date)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
  v_reg public.platform_admins%rowtype;
  v_fatores int := 0;
  v_motivo text;
begin
  select * into v_reg from public.platform_admins where user_id = v_uid;
  if v_reg.user_id is null then
    v_motivo := 'nao e administrador da plataforma';
  else
    select count(*) into v_fatores
      from auth.mfa_factors f
     where f.user_id = v_uid and f.status = 'verified';
    if v_reg.expira_em is not null and v_reg.expira_em < current_date then
      v_motivo := 'acesso expirado em ' || v_reg.expira_em;
    elsif v_reg.exige_mfa and v_aal is distinct from 'aal2' then
      -- Sem fator cadastrado, o prazo vale. Com fator cadastrado, não há prazo
      -- que justifique entrar sem usá-lo.
      if v_fatores > 0 then
        v_motivo := 'segundo fator cadastrado e nao utilizado nesta sessao';
      elsif v_reg.mfa_prazo is not null and current_date > v_reg.mfa_prazo then
        v_motivo := 'prazo para cadastrar o segundo fator venceu em ' || v_reg.mfa_prazo;
      end if;
    end if;
  end if;
  return query select v_motivo is null, v_motivo, v_aal,
    coalesce(v_reg.exige_mfa, false), v_fatores, v_reg.mfa_prazo, v_reg.expira_em;
end;
$$;
revoke execute on function public.admin_veredito() from public, anon;
grant execute on function public.admin_veredito() to authenticated;

/* ---------------------------------------------------------------------------
 * `admin_posso()` — registra e RESPONDE. `admin_exigir_acesso()` — registra e
 * BARRA. A tela chama a primeira antes de qualquer leitura; as treze funções
 * usam a segunda.
 *
 * ⚠️ **Por que existem as duas.** A tentativa NEGADA é a que mais importa
 * registrar: um acesso concedido é rotina, uma sequência de negados é o começo
 * de um incidente. Só que uma exceção **desfaz a transação inteira**, e com ela
 * o próprio registro da negativa — foi o que o primeiro teste mostrou (duas
 * tentativas, um registro). Não há transação autônoma em PostgreSQL, e a saída
 * por `dblink` foi descartada: ela exige guardar uma senha do banco dentro de
 * uma função, que é um problema maior que o resolvido.
 *
 * Então a responsabilidade se divide: `admin_posso` **nunca levanta exceção**,
 * logo o registro dela COMMITA sempre; e o portão duro continua nas treze
 * funções, onde falhar é obrigatório. Quem passa pelo aplicativo deixa rastro
 * pelas duas; quem chama a RPC direto é barrado pelo portão.
 * ------------------------------------------------------------------------- */
create or replace function public.admin_posso(p_funcao text, p_alvo text default null)
returns table (permitido boolean, motivo text, exige_mfa boolean, fatores int, mfa_prazo date, expira_em date)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v record;
begin
  select * into v from public.admin_veredito();
  insert into public.admin_acessos (admin_id, funcao, alvo, aal, permitido, motivo)
  values (auth.uid(), p_funcao, p_alvo, v.aal, v.permitido, v.motivo);
  return query select v.permitido, v.motivo, v.exige_mfa, v.fatores, v.mfa_prazo, v.expira_em;
end;
$$;
revoke execute on function public.admin_posso(text, text) from public, anon;
grant execute on function public.admin_posso(text, text) to authenticated;

create or replace function public.admin_exigir_acesso(p_funcao text, p_alvo text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v record;
begin
  select * into v from public.admin_veredito();
  insert into public.admin_acessos (admin_id, funcao, alvo, aal, permitido, motivo)
  values (auth.uid(), p_funcao, p_alvo, v.aal, v.permitido, v.motivo);
  if not v.permitido then
    raise exception 'Acesso administrativo negado: %', v.motivo;
  end if;
  return true;
end;
$$;

revoke execute on function public.admin_exigir_acesso(text, text) from public, anon;
grant execute on function public.admin_exigir_acesso(text, text) to authenticated;

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. AS TREZE FUNÇÕES PASSAM A REGISTRAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ A reescrita é MECÂNICA, e de propósito: a chamada `is_platform_admin()`
 * vira `admin_exigir_acesso('<nome>')` e a volatilidade `STABLE` cai. Reescrever
 * treze corpos à mão para acrescentar uma linha em cada é a forma mais provável
 * de mudar, sem querer, a consulta que um deles faz — e um relatório
 * administrativo que muda de número numa migration de segurança é um problema
 * novo no lugar do antigo.
 *
 * `STABLE` precisa cair porque uma função não volátil **não pode gravar**: era
 * essa marcação que tornava impossível registrar a leitura de dentro dela.
 * A semântica do portão não muda — `admin_exigir_acesso` levanta exceção quando
 * nega, então o `raise exception 'forbidden'` original vira inalcançável.
 */
do $$
declare
  r record;
  v_novo text;
begin
  for r in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'admin\_%'
       and pg_get_functiondef(p.oid) like '%is_platform_admin%'
  loop
    v_novo := regexp_replace(
      r.def,
      'public\.is_platform_admin\(\)',
      format('public.admin_exigir_acesso(%L)', r.proname),
      ''  -- só a PRIMEIRA ocorrência: a segunda seria um registro em dobro
    );
    v_novo := replace(v_novo, E'\n STABLE SECURITY DEFINER', E'\n SECURITY DEFINER');
    execute v_novo;
  end loop;
end $$;

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. A REVISÃO PERIÓDICA
 * ═══════════════════════════════════════════════════════════════════════════ */
create or replace function public.admin_revisao()
returns table (
  user_id uuid, email text, motivo text, expira_em date, revisado_em timestamptz,
  exige_mfa boolean, fatores_mfa int, mfa_prazo date,
  acessos_30d bigint, negados_30d bigint, ultimo_acesso timestamptz, pendente boolean
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.admin_exigir_acesso('admin_revisao');
  return query
    select pa.user_id, u.email::text, pa.motivo, pa.expira_em, pa.revisado_em,
      pa.exige_mfa,
      (select count(*)::int from auth.mfa_factors f where f.user_id = pa.user_id and f.status = 'verified'),
      pa.mfa_prazo,
      (select count(*) from public.admin_acessos a where a.admin_id = pa.user_id and a.quando > now() - interval '30 days'),
      (select count(*) from public.admin_acessos a where a.admin_id = pa.user_id and not a.permitido and a.quando > now() - interval '30 days'),
      (select max(a.quando) from public.admin_acessos a where a.admin_id = pa.user_id),
      -- ⚠️ "Pendente" é a pergunta que a tela precisa responder sozinha: nunca
      -- revisado, revisado há mais de 90 dias, ou com acesso já vencido.
      (pa.revisado_em is null
        or pa.revisado_em < now() - interval '90 days'
        or (pa.expira_em is not null and pa.expira_em < current_date))
    from public.platform_admins pa
    left join auth.users u on u.id = pa.user_id
    order by pa.created_at;
end;
$$;
revoke execute on function public.admin_revisao() from public, anon;
grant execute on function public.admin_revisao() to authenticated;

create or replace function public.admin_revisar(p_user uuid, p_meses int default 6)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.admin_exigir_acesso('admin_revisar', p_user::text);
  update public.platform_admins
     set revisado_em = now(),
         revisado_por = auth.uid(),
         expira_em = current_date + (p_meses || ' months')::interval
   where user_id = p_user;
  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'admin.revisar', p_user::text, jsonb_build_object('meses', p_meses));
end;
$$;
revoke execute on function public.admin_revisar(uuid, int) from public, anon;
grant execute on function public.admin_revisar(uuid, int) to authenticated;

/* O histórico de acessos, para a própria tela de administração. */
create or replace function public.admin_acessos_recentes(p_dias int default 30)
returns table (quando timestamptz, admin_id uuid, email text, funcao text, alvo text, aal text, permitido boolean, motivo text)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.admin_exigir_acesso('admin_acessos_recentes');
  return query
    select a.quando, a.admin_id, u.email::text, a.funcao, a.alvo, a.aal, a.permitido, a.motivo
      from public.admin_acessos a
      left join auth.users u on u.id = a.admin_id
     where a.quando > now() - make_interval(days => p_dias)
     order by a.quando desc
     limit 500;
end;
$$;
revoke execute on function public.admin_acessos_recentes(int) from public, anon;
grant execute on function public.admin_acessos_recentes(int) to authenticated;
