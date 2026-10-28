-- ═══════════════════════════════════════════════════════════════════════════
-- PEDIDO DE CONTA QUATTRO PARA COBRAR POR PIX E BOLETO (28/10/2026, decisão do dono)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Na baixa de um título a receber, a empresa que ainda NÃO tem conta Pinbank
-- não via o bloco "Gerar Pix": ele sumia inteiro. Agora ela pede a conta ali
-- mesmo, e o pedido chega ao funil Comercial da plataforma — o MESMO de
-- `maquininha_pedidos`, decisão do dono ("Pedido ao comercial"): não há API de
-- abertura de conta na Pinbank, e quem abre a conta e põe o código no vínculo
-- é a plataforma.
--
-- ⚠️ O pedido não abre conta nem liga cobrança nenhuma. Só a plataforma digita
-- o código da conta no vínculo (`admin_pinbank_vincular`), e só a empresa liga
-- a cobrança (`pinbank_cobranca_configurar`). O pedido é o recado.
--
-- O que muda: o tipo `conta_pix` e a origem `cobranca`. A função de pedir não
-- muda (o mesmo papel — administrar —, o mesmo teto de 5 em aberto): ela já
-- grava o tipo e a origem que vierem, e as restrições abaixo decidem.

alter table public.maquininha_pedidos drop constraint if exists maquininha_pedidos_tipo_check;
alter table public.maquininha_pedidos
  add constraint maquininha_pedidos_tipo_check check (tipo in ('pedir', 'vincular', 'conta_pix'));

alter table public.maquininha_pedidos drop constraint if exists maquininha_pedidos_origem_valida;
alter table public.maquininha_pedidos
  add constraint maquininha_pedidos_origem_valida check (origem in ('formulario', 'economia', 'consultor', 'cobranca'));

comment on column public.maquininha_pedidos.tipo is
  'pedir (maquininha nova) · vincular (a maquininha que a empresa já tem) · conta_pix (conta Quattro para cobrar por Pix e boleto, pedida na baixa do título).';
