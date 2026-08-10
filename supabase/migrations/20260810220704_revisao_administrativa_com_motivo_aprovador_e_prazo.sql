-- ONDA 2 · A REVISÃO DE ACESSO ADMINISTRATIVO VIRA PROCESSO
--
-- ⚠️ `admin_revisar(user, meses)` carimbava `revisado_em` E empurrava
-- `expira_em` no mesmo gesto. Ou seja: revisar era o mesmo ato que renovar, e
-- uma revisão que só sabe renovar não é revisão — é um botão de prorrogar com
-- outro nome. As duas perguntas são diferentes e agora têm campos diferentes:
--
--   expira_em       — quando o acesso MORRE se ninguém fizer nada
--   proxima_revisao — quando alguém PRECISA olhar de novo
--
-- E não havia motivo: `revisado_em` sozinho diz que alguém clicou, não o que
-- foi decidido. Numa auditoria a pergunta nunca é "foi revisado?", é "com base
-- em quê?".

alter table public.platform_admins
  add column if not exists proxima_revisao date;

update public.platform_admins
   set proxima_revisao = (revisado_em::date + interval '6 months')::date
 where revisado_em is not null and proxima_revisao is null;

drop function if exists public.admin_revisar(uuid, integer);

create or replace function public.admin_revisar(
  p_user uuid, p_motivo text, p_meses integer default 6
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_auto boolean;
begin
  perform public.admin_exigir_acesso('admin_revisar', p_user::text);

  -- ⚠️ Barra o motivo vazio E o motivo de fachada. "ok", "revisado", "." passam
  -- por um `not null` e não dizem nada — o campo existiria preenchido e a
  -- auditoria continuaria sem resposta. Vinte caracteres não garantem
  -- qualidade, mas garantem que alguém teve de escrever uma frase.
  if p_motivo is null or length(btrim(p_motivo)) < 20 then
    raise exception 'A revisão precisa de um motivo com ao menos 20 caracteres. Sem o porquê, a revisão vira uma lista de nomes que ninguém sabe avaliar.'
      using errcode = 'check_violation';
  end if;

  if p_meses is null or p_meses < 1 or p_meses > 12 then
    raise exception 'O intervalo da próxima revisão fica entre 1 e 12 meses.'
      using errcode = 'check_violation';
  end if;

  v_auto := (p_user = auth.uid());

  update public.platform_admins
     set revisado_em = now(),
         revisado_por = auth.uid(),
         motivo = btrim(p_motivo),
         proxima_revisao = (current_date + (p_meses || ' months')::interval)::date
   where user_id = p_user;

  if not found then
    raise exception 'Não existe administrador de plataforma com esse identificador.'
      using errcode = 'no_data_found';
  end if;

  -- ⚠️ A autorrevisão NÃO é bloqueada, e isso é decisão registrada: hoje há UM
  -- administrador, e proibi-la deixaria o acesso sem revisão possível para
  -- sempre — a regra produziria exatamente o estado que ela existe para evitar.
  -- O que se faz é MARCAR: `admin_revisao()` devolve o campo e a tela a mostra
  -- como pendência. Segregação que não pode ser cumprida vira exceção
  -- silenciosa; segregação declarada vira dívida visível.
  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(),
          case when v_auto then 'admin.revisar.AUTOREVISAO' else 'admin.revisar' end,
          p_user::text,
          jsonb_build_object('meses', p_meses, 'motivo', btrim(p_motivo), 'auto', v_auto));
end;
$$;

-- ⚠️ A assinatura antiga volta, e volta LEVANTANDO. Deixá-la fora faria o botão
-- da versão publicada devolver "function does not exist" — erro de
-- infraestrutura para quem só deixou de informar um campo. Ela explica o que
-- mudou, em português, e não grava nada.
create or replace function public.admin_revisar(p_user uuid, p_meses integer default 6)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  raise exception 'A revisão passou a exigir um motivo escrito. Atualize a tela e informe por que este acesso continua.'
    using errcode = 'check_violation';
end;
$$;

-- ⚠️ O teto de 90 dias é o que separa prazo de intenção. Sem ele,
-- "configurável" significaria que quem não quer cadastrar o segundo fator
-- empurra a data para sempre, um clique por vez, e o bloqueio nunca chega —
-- com a aparência de que existe um controle.
create or replace function public.admin_definir_prazo_mfa(
  p_user uuid, p_prazo date, p_motivo text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_antes date;
begin
  perform public.admin_exigir_acesso('admin_definir_prazo_mfa', p_user::text);

  if p_motivo is null or length(btrim(p_motivo)) < 20 then
    raise exception 'Adiar o segundo fator precisa de um motivo com ao menos 20 caracteres.'
      using errcode = 'check_violation';
  end if;
  if p_prazo is null or p_prazo > current_date + interval '90 days' then
    raise exception 'O prazo para o segundo fator não passa de 90 dias a partir de hoje. Prazo que se empurra sem limite não é prazo.'
      using errcode = 'check_violation';
  end if;

  select mfa_prazo into v_antes from public.platform_admins where user_id = p_user;

  update public.platform_admins set mfa_prazo = p_prazo where user_id = p_user;
  if not found then
    raise exception 'Não existe administrador de plataforma com esse identificador.'
      using errcode = 'no_data_found';
  end if;

  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'admin.prazo_mfa', p_user::text,
          jsonb_build_object('de', v_antes, 'para', p_prazo, 'motivo', btrim(p_motivo)));
end;
$$;

drop function if exists public.admin_revisao();

create function public.admin_revisao()
returns table(
  user_id uuid, email text, motivo text, expira_em date,
  revisado_em timestamp with time zone, revisado_por uuid, revisado_por_email text,
  auto_revisao boolean, proxima_revisao date,
  exige_mfa boolean, fatores_mfa integer, mfa_prazo date,
  acessos_30d bigint, negados_30d bigint,
  ultimo_acesso timestamp with time zone, pendente boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.admin_exigir_acesso('admin_revisao');
  return query
    select pa.user_id, u.email::text, pa.motivo, pa.expira_em,
      pa.revisado_em, pa.revisado_por, rv.email::text,
      (pa.revisado_por is not null and pa.revisado_por = pa.user_id),
      pa.proxima_revisao,
      pa.exige_mfa,
      (select count(*)::int from auth.mfa_factors f where f.user_id = pa.user_id and f.status='verified'),
      pa.mfa_prazo,
      (select count(*) from public.admin_acessos a where a.admin_id = pa.user_id and a.quando > now() - interval '30 days'),
      (select count(*) from public.admin_acessos a where a.admin_id = pa.user_id and not a.permitido and a.quando > now() - interval '30 days'),
      (select max(a.quando) from public.admin_acessos a where a.admin_id = pa.user_id),
      -- ⚠️ Pendente passa a olhar `proxima_revisao`, e não mais "90 dias desde
      -- a última". A data agendada é uma decisão de quem revisou; a janela fixa
      -- era um palpite do código, igual para o titular e para um terceiro.
      (pa.revisado_em is null
        or (pa.proxima_revisao is not null and pa.proxima_revisao < current_date)
        or (pa.expira_em is not null and pa.expira_em < current_date)
        or pa.motivo is null)
    from public.platform_admins pa
    left join auth.users u  on u.id = pa.user_id
    left join auth.users rv on rv.id = pa.revisado_por
    order by pa.created_at;
end;
$$;

revoke all on function public.admin_revisao() from public;
grant execute on function public.admin_revisao() to authenticated;
revoke all on function public.admin_revisar(uuid, text, integer) from public;
grant execute on function public.admin_revisar(uuid, text, integer) to authenticated;
revoke all on function public.admin_revisar(uuid, integer) from public;
grant execute on function public.admin_revisar(uuid, integer) to authenticated;
revoke all on function public.admin_definir_prazo_mfa(uuid, date, text) from public;
grant execute on function public.admin_definir_prazo_mfa(uuid, date, text) to authenticated;
