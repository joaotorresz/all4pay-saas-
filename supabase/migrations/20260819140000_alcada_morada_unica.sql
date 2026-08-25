-- ═══════════════════════════════════════════════════════════════════════════
-- UMA MORADA SÓ PARA A ALÇADA — `approval_limit` aposentada NO SERVIDOR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **O MESMO NÚMERO MORAVA EM TRÊS LUGARES**, e só um decidia:
--
--   | onde                                  | granularidade | quem LÊ para decidir |
--   | central_alcada.teto_valor             | por PAPEL     | o gatilho da Central |
--   | organization_members.approval_limit   | por PESSOA    | NINGUÉM              |
--   | a4p_company.participantes[].limite    | por PESSOA    | NINGUÉM              |
--
-- É a família da DUPLA MORADA (a do `category_id`), agora em três. E a terceira
-- nasceu exatamente assim: uma coluna que uma tela escreve e ninguém lê.
--
-- ⚠️ **E ela não estava só sem leitor — estava sendo escrita ERRADA.** Medido:
-- `parseLimite` (lib/governance.ts) tira as letras da faixa antes de converter,
-- então **"R$50 mil" virava 50**, não 50.000 — mil vezes menor. Pior:
-- **"Sem limite" virava 0**, `Number("")`, que é a inversão exata do que a
-- pessoa escolheu: "sem teto" gravado como "não aprova nada". Se algum dia
-- alguém tivesse LIGADO esta coluna numa decisão, o titular que escolheu "sem
-- limite" seria o único sem poder aprovar coisa nenhuma.
--
-- ⚠️ **A escrita para NO SERVIDOR, não na tela.** Tirar só do cliente deixa a
-- porta aberta para o próximo formulário — e é assim que uma coluna morta volta
-- a receber valor sem ninguém perceber. O parâmetro CONTINUA na assinatura (de
-- propósito: mudar assinatura de RPC quebra o cliente publicado que ainda a
-- chama), mas é IGNORADO.

create or replace function public.org_member_update(p_user_id uuid, p_display_name text, p_email text, p_permissions jsonb, p_approval_limit numeric, p_can_cancel boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.org_is_admin() then raise exception 'Sem permissão para alterar membros.'; end if;
  -- ⚠️ `p_approval_limit` é recebido e DESCARTADO. A alçada mora em
  -- `central_alcada` (por papel) e é lida pelo gatilho da Central. Aceitar o
  -- parâmetro e não gravar é o que mantém compatível o cliente já publicado
  -- sem deixar a coluna morta receber valor novo.
  update public.organization_members
     set display_name = p_display_name,
         email = p_email,
         permissions = coalesce(p_permissions, '{}'::jsonb),
         can_cancel = coalesce(p_can_cancel, false)
   where org_id = public.auth_org_id() and user_id = p_user_id;
end; $$;

comment on column public.organization_members.approval_limit is
  'DEPRECADA em 19/08/2026 (P-19). A alçada mora em central_alcada.teto_valor, por PAPEL, e é lida pelo gatilho central_maquina. Esta coluna nunca teve leitor e era escrita errada: parseLimite convertia "R$50 mil" em 50 e "Sem limite" em 0. org_member_update deixou de gravá-la; os valores existentes ficam como dívida declarada até decisão do dono. Não voltar a escrever — há guarda com teto ZERO.';

comment on column public.central_alcada.teto_valor is
  'A ÚNICA morada do teto de aprovação. NULL = sem teto (owner/admin). 0 = não confirma nada. Por PAPEL, editável por organização em Configurações. Quem pode aprovar sai de role_permissions; esta coluna responde só QUANTO.';
