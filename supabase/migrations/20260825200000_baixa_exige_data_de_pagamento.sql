-- ═══════════════════════════════════════════════════════════════════════════
-- BAIXA SEM DATA DE PAGAMENTO NÃO É BAIXA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **Medido:** o PRIMEIRO título baixado pela Central nova (Teste123,
-- R$2.000, 25/08 15:18) ficou com `paid_date` NULO. Um baixado em 1675.
--
-- ⚠️ **A máquina carimbava QUEM e QUANDO baixou (`baixado_por`, `baixado_em`)
-- e não carimbava a data em que o DINHEIRO se moveu.** São coisas diferentes:
-- `baixado_em` é o instante do clique — auditoria; `paid_date` é a data do
-- fato — contabilidade. O caixa se conta pela segunda.
--
-- ⚠️ **A consequência é de RELATÓRIO, e ela é assimétrica:** o DRE apura por
-- competência e continua enxergando o título; o DFC apura por caixa e depende
-- da data. Um baixado sem data aparece no resultado e some do fluxo — os dois
-- relatórios passam a discordar sobre dinheiro que a mesma pessoa acabou de
-- baixar, e nenhum dos dois parece quebrado.
--
-- ⚠️ **PREENCHE, não recusa.** Recusar exigiria que toda porta de baixa
-- mandasse a data, inclusive as que ainda não existem, e uma recusa aqui
-- derruba a baixa inteira. O padrão é o dia da própria baixa — que é a
-- verdade na esmagadora maioria dos casos — e uma data INFORMADA vence o
-- padrão, para a baixa retroativa continuar possível.
--
-- ⚠️ Fuso de São Paulo, não UTC: `now()` às 21h de Brasília já é o dia
-- seguinte em UTC, e a baixa cairia no caixa do dia errado.

create or replace function public.central_maquina()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_papel text;
  v_teto numeric;
  v_outro_aprovador boolean := false;
  v_autoaprovacao boolean := false;
  v_motivo text;
begin
  if new.situacao is not distinct from old.situacao then
    return new;
  end if;

  if not public.central_transicao_valida(old.situacao, new.situacao) then
    raise exception 'A4P-CENTRAL: transição % → % não é permitida (máquina de estados)',
      old.situacao, new.situacao
      using hint = 'Um título previsto precisa ser CONFIRMADO antes de ser baixado.';
  end if;

  if old.situacao = 'previsto' and new.situacao = 'confirmado' then
    if new.lancado_por is not null and new.lancado_por = auth.uid() then
      select exists (
        select 1
          from public.organization_members om
          join public.role_permissions rp
            on rp.papel = om.role and rp.acao = 'aprovar'
         where om.org_id = new.org_id
           and om.user_id is distinct from auth.uid()
      ) into v_outro_aprovador;

      if v_outro_aprovador then
        raise exception 'A4P-CENTRAL-SEGREGACAO: quem lançou não pode confirmar o próprio título'
          using hint = 'Outra pessoa precisa confirmar este lançamento.';
      end if;

      v_autoaprovacao := true;
      v_motivo := 'org com um único membro habilitado a aprovar';
    end if;

    select role into v_papel from public.organization_members
      where user_id = auth.uid() and org_id = new.org_id limit 1;

    if not public.tem_permissao('aprovar', new.org_id) then
      raise exception 'A4P-CENTRAL-PERMISSAO: o papel % não pode confirmar títulos', coalesce(v_papel, 'sem papel')
        using hint = 'Peça a um Aprovador, Administrador ou Titular. Isto se resolve mudando o PAPEL, não a alçada.';
    end if;

    if not public.central_cabe_na_alcada(coalesce(v_papel, 'leitor'), new.amount, new.org_id) then
      v_teto := public.central_teto(coalesce(v_papel, 'leitor'), new.org_id);
      raise exception 'A4P-CENTRAL-ALCADA: valor % acima da alçada do papel % (teto %)',
        new.amount, coalesce(v_papel, 'sem papel'), v_teto
        using hint = 'Um papel com alçada maior precisa confirmar, ou a alçada deste papel pode ser aumentada nas configurações.';
    end if;

    new.confirmado_por := auth.uid();
    new.confirmado_em := now();
  end if;

  -- BAIXAR carimba quem baixou, quando baixou, e A DATA EM QUE O DINHEIRO SE
  -- MOVEU — que é a que o fluxo de caixa lê.
  if new.situacao = 'baixado' then
    new.baixado_por := coalesce(new.baixado_por, auth.uid());
    new.baixado_em  := coalesce(new.baixado_em, now());
    new.paid_date   := coalesce(new.paid_date, (now() at time zone 'America/Sao_Paulo')::date);
  end if;

  -- ⚠️ `conciliado` também é dinheiro que se moveu. Ele só é alcançável a
  -- partir de `baixado`, então na prática a data já veio — mas depender disso
  -- é depender da ordem, e a ordem muda.
  if new.situacao = 'conciliado' then
    new.paid_date := coalesce(new.paid_date, (now() at time zone 'America/Sao_Paulo')::date);
  end if;

  insert into public.central_transicoes (org_id, movement_id, de, para, por, autoaprovacao, motivo)
  values (new.org_id, new.id, old.situacao, new.situacao,
          coalesce(auth.uid(), new.lancado_por), v_autoaprovacao, v_motivo);

  return new;
end $function$;
