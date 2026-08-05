-- Captura do formulário /cadastro-maquininha
create table public.maq_leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  telefone_digits text generated always as (regexp_replace(coalesce(telefone,''), '\D', '', 'g')) stored,
  email text,
  cnpj text,
  razao_social text,
  nome_fantasia text,
  consentimento_whatsapp boolean not null default false,
  status text not null default 'novo' check (status in ('novo','contatado','qualificado','descartado')),
  created_at timestamptz not null default now()
);

comment on table public.maq_leads is 'Leads capturados no form /cadastro-maquininha do site Framer. Escrita apenas via service role (Edge Function submit-cadastro).';

alter table public.maq_leads enable row level security;
-- Sem policies de leitura/escrita pra anon/authenticated: só service_role (Edge Functions) acessa.
-- Isso segue o mesmo padrao ja usado no dbWrite() do get-rate para maq_cnpj_cache.

create table public.maq_whatsapp_log (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.maq_leads(id) on delete cascade,
  template_name text not null,
  status text not null check (status in ('enviado','falhou')),
  meta_message_id text,
  erro_detalhe text,
  created_at timestamptz not null default now()
);

comment on table public.maq_whatsapp_log is 'Log de tentativas de envio de WhatsApp via Meta Cloud API, para auditoria e retry.';

alter table public.maq_whatsapp_log enable row level security;
