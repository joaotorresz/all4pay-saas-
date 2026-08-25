-- ═══════════════════════════════════════════════════════════════════════════
-- R1 PARA A EMPRESA DE UMA PESSOA — autoaprovação PERMITIDA e CARIMBADA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **O caminho ouro estava fechado por desenho para o cliente típico.**
-- Medido: a organização de teste tem UM membro (`owner`) e zero movimentos. R1
-- diz que quem lança não confirma; com uma pessoa só, `lançar → confirmar` é
-- impossível. E o cliente típico deste produto é o dono sozinho — a Central
-- seria um beco sem saída justamente para a maioria.
--
-- **A regra decidida pelo dono, e o que ela NÃO é:**
--
--   · existe OUTRO membro habilitado a aprovar  → autoaprovação RECUSADA
--   · não existe nenhum                         → PERMITIDA e CARIMBADA
--
-- ⚠️ **R1 nunca fica desligado, e não existe interruptor por organização.**
-- Um controle que liga e desliga conforme o quadro de membros não é controle:
-- ele some sem gerar evento, e um fraudador o desativa por uma ação que nada
-- tem a ver com aprovar — remover um colega. O teto honesto para a empresa de
-- uma pessoa é REGISTRO, não bloqueio.
--
-- ⚠️ **O carimbo não é metadado escondido: é a linha que o auditor lê.** Ele
-- vai para `central_transicoes` com o motivo por extenso, aparece na tela do
-- movimento e em toda exportação. Autoaprovação silenciosa seria pior que a
-- recusa — o registro existiria e ninguém saberia procurá-lo.
--
-- ⚠️ **"Habilitado a aprovar" sai de `role_permissions`, não da alçada.** É a
-- mesma fonte que a máquina já usa para decidir QUEM aprova; a alçada responde
-- QUANTO. Perguntar à alçada aqui faria um `fechador` com teto herdado contar
-- como aprovador, e a autoaprovação seria recusada por causa de alguém que não
-- pode aprovar coisa nenhuma.

alter table public.central_transicoes
  add column if not exists autoaprovacao boolean not null default false;

comment on column public.central_transicoes.autoaprovacao is
  'Confirmação feita pela mesma pessoa que lançou, permitida porque a organização não tem outro membro habilitado a aprovar. O motivo fica em `motivo`.';

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
  -- Só age quando a situação MUDA.
  if new.situacao is not distinct from old.situacao then
    return new;
  end if;

  -- ⚠️ 1. A transição tem de estar na máquina. Tudo que não está é proibido —
  -- não há caminho lateral, e é isto que mata a baixa direta (previsto→baixado).
  if not public.central_transicao_valida(old.situacao, new.situacao) then
    raise exception 'A4P-CENTRAL: transição % → % não é permitida (máquina de estados)',
      old.situacao, new.situacao
      using hint = 'Um título previsto precisa ser CONFIRMADO antes de ser baixado.';
  end if;

  -- ⚠️ 2. CONFIRMAR (previsto→confirmado) exige segregação, PERMISSÃO e alçada.
  if old.situacao = 'previsto' and new.situacao = 'confirmado' then
    -- R1: quem lançou não confirma o próprio. `lancado_por` é quem inseriu.
    if new.lancado_por is not null and new.lancado_por = auth.uid() then
      -- ⚠️ A pergunta não é "esta org é pequena", é "existe ALGUÉM que poderia
      -- aprovar no meu lugar". Se existe, a segregação é possível e portanto
      -- exigível; se não existe, exigi-la é impedir a operação.
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

    -- ⚠️ **QUEM APROVA sai de `role_permissions`, não da alçada.** Uma fonte só,
    -- e ela é completa por construção (é a matriz que `tem_permissao` lê). A
    -- alçada responde outra pergunta: QUANTO. Misturar as duas foi o que deixou
    -- o `fechador` com teto de 50.000 sem ter a ação `aprovar`.
    if not public.tem_permissao('aprovar', new.org_id) then
      raise exception 'A4P-CENTRAL-PERMISSAO: o papel % não pode confirmar títulos', coalesce(v_papel, 'sem papel')
        using hint = 'Peça a um Aprovador, Administrador ou Titular. Isto se resolve mudando o PAPEL, não a alçada.';
    end if;

    -- ⚠️ As duas recusas têm mensagem DIFERENTE de propósito: "você não pode
    -- aprovar" e "o valor não cabe na sua alçada" se resolvem de jeitos
    -- opostos, e uma mensagem genérica vira chamado de suporte.
    if not public.central_cabe_na_alcada(coalesce(v_papel, 'leitor'), new.amount, new.org_id) then
      v_teto := public.central_teto(coalesce(v_papel, 'leitor'), new.org_id);
      raise exception 'A4P-CENTRAL-ALCADA: valor % acima da alçada do papel % (teto %)',
        new.amount, coalesce(v_papel, 'sem papel'), v_teto
        using hint = 'Um papel com alçada maior precisa confirmar, ou a alçada deste papel pode ser aumentada nas configurações.';
    end if;

    new.confirmado_por := auth.uid();
    new.confirmado_em := now();
  end if;

  -- 3. BAIXAR carimba quem baixou.
  if new.situacao = 'baixado' then
    new.baixado_por := coalesce(new.baixado_por, auth.uid());
    new.baixado_em := coalesce(new.baixado_em, now());
  end if;

  -- 4. A transição fica na trilha, sempre — e o carimbo vai JUNTO com ela.
  insert into public.central_transicoes (org_id, movement_id, de, para, por, autoaprovacao, motivo)
  values (new.org_id, new.id, old.situacao, new.situacao,
          coalesce(auth.uid(), new.lancado_por), v_autoaprovacao, v_motivo);

  return new;
end $function$;
