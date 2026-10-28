-- ═══════════════════════════════════════════════════════════════════════════
-- A RÉGUA MANDA O LINK DE PAGAMENTO (28/10/2026, etapa 5 de
-- `docs/rodada-10/cobranca.md`, primeira metade)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O executor da régua (`/api/financial-os/run`, chave de serviço) precisa
-- saber, para os títulos que vai cobrar HOJE, qual link `/pagar?t=` cada um já
-- tem. A tabela do link não concede nada à chave de serviço (de propósito,
-- desde a 20261022120000), então a leitura é uma função com a MESMA regra do
-- leitor público: só entra o link VIVO de um título a receber EM ABERTO que
-- tem ao menos uma cobrança EMITIDA — o link que abriria a página com Pix ou
-- boleto. Link de título pago, cancelado, na lixeira ou só com cobrança
-- `a_cancelar` não vai na mensagem: o cliente cairia em "indisponível".
--
-- ⚠️ Só o servidor executa (service_role). A empresa já lê os próprios links
-- pela política de linha; esta função não abre nada a ninguém além do runner.
-- ⚠️ Recebe a empresa E os títulos: o runner pede só o que vai cobrar, e um
-- título de outra empresa passado por engano não volta.
-- ⚠️ Não cria link nem cobrança. Gerar a cobrança sozinha no primeiro envio é
-- a segunda metade da etapa, e espera decisão do dono.

create or replace function public.regua_links_de_pagamento(p_org uuid, p_movements uuid[])
returns table (movement_id uuid, token text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select l.movement_id, l.token
    from public.pinbank_checkout_links l
    join public.movements m on m.id = l.movement_id
   where l.org_id = p_org
     and m.org_id = p_org
     and l.revogado_em is null
     and l.movement_id = any (coalesce(p_movements, '{}'::uuid[]))
     and m.excluido_em is null
     and not m.is_sample
     and m.type = 'entrada'
     and m.situacao in ('previsto','confirmado')
     and exists (
       select 1 from public.pinbank_cobrancas c
        where c.movement_id = m.id and c.situacao = 'emitida'
     )
   limit 1000;
$$;

comment on function public.regua_links_de_pagamento(uuid, uuid[]) is
  'Os links /pagar vivos (com cobrança emitida) dos títulos que a régua vai cobrar. Só service_role.';

revoke all on function public.regua_links_de_pagamento(uuid, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.regua_links_de_pagamento(uuid, uuid[]) to service_role;
