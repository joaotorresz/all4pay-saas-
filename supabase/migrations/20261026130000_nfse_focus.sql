-- NFS-e REAL pela Focus NFe (26/10/2026).
--
-- A nota passa a ser emitida por um provedor: a referência da tentativa na
-- Focus (`provedor_ref`) é o que liga a linha à nota na prefeitura — sem ela a
-- consulta não acha a nota, e reenviar com outra referência poderia emitir a
-- MESMA nota duas vezes. Os links do PDF (DANFSe) e do XML vêm da prefeitura
-- autorizada; o motivo da recusa vem dos erros dela.
--
-- `ambiente` separa a nota de TESTE (homologação, sem valor fiscal) da de
-- produção: uma nota de homologação na lista com a mesma cara de uma real é a
-- forma mais curta de alguém mandá-la a um cliente.

alter table public.nfse add column if not exists provedor_ref text;
alter table public.nfse add column if not exists ambiente text;
alter table public.nfse add column if not exists url_pdf text;
alter table public.nfse add column if not exists url_xml text;
alter table public.nfse add column if not exists url_nota text;
alter table public.nfse add column if not exists motivo_rejeicao text;

do $$ begin
  alter table public.nfse add constraint nfse_ambiente_valido
    check (ambiente is null or ambiente in ('homologacao', 'producao'));
exception when duplicate_object then null; end $$;

-- Uma referência aponta para UMA nota (a Focus também a trata como única).
create unique index if not exists nfse_provedor_ref_unico
  on public.nfse (provedor_ref) where provedor_ref is not null;
