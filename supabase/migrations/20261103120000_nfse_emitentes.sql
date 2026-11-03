-- ═══════════════════════════════════════════════════════════════════════════
-- O EMITENTE DA NFS-e MORA NO BANCO, e só a PLATAFORMA o escreve (03/11/2026)
--
-- O cadastro fiscal de cada empresa que emite nota pela Focus (CNPJ,
-- inscrição, município, item de serviço, NBS, classificação do IBS/CBS…)
-- morava só na variável FOCUS_NFE_EMITENTES da Vercel: cada ajuste de código
-- era editar o JSON à mão e refazer o deploy — e um JSON quebrado desligava a
-- emissão sem aviso. Agora mora aqui; a variável vira RESERVA (vale quando a
-- empresa não tem linha nesta tabela). Os TOKENS continuam só na Vercel.
--
-- ⚠️ Nenhuma concessão a `anon` nem a `authenticated`, e nenhuma política: a
-- empresa nunca lê nem escreve o próprio emitente. O CNPJ, a inscrição e o
-- município do prestador são da PLATAFORMA — a rota de transmitir chama a
-- Focus com a credencial da Quattro, e um emitente que a empresa editasse
-- emitiria nota em nome de outro CNPJ. Quem lê é o servidor (service_role).
--
-- ⚠️ `config` é o MESMO objeto de um emitente do FOCUS_NFE_EMITENTES, conferido
-- pela MESMA função (`lerEmitentes`, core/nfse/focus) ao ler: um campo fora de
-- forma é ignorado com aviso, nunca enviado à prefeitura.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.nfse_emitentes (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  -- a trilha (`auditar_escrita`) identifica a linha pelo `id`.
  id uuid not null default gen_random_uuid() unique,
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);

alter table public.nfse_emitentes enable row level security;

revoke all on table public.nfse_emitentes from public, anon, authenticated;
grant select, insert, update, delete on table public.nfse_emitentes to service_role;

drop trigger if exists zz_auditar_nfse_emitentes on public.nfse_emitentes;
create trigger zz_auditar_nfse_emitentes
  after insert or update or delete on public.nfse_emitentes
  for each row execute function public.auditar_escrita();
