-- ============================================================
-- 0018 — Aprendizado do assistente (All 4 Pay AI) por ORGANIZAÇÃO
-- ------------------------------------------------------------
-- O assistente aprende com o uso: frequência + recência + feedback (👍/👎) das
-- perguntas reordenam as sugestões. Até aqui isso vivia só no localStorage (por
-- navegador). Esta tabela promove o aprendizado para a ORG: agrega as perguntas
-- de todos os usuários da organização, isolada por RLS (mesmo padrão do 0010/0011).
-- O cliente usa isto como camada best-effort — o localStorage segue como fonte
-- síncrona; o Supabase hidrata/sincroniza quando disponível (não-demo).
--
-- GERADA COMO ARQUIVO — aplicar ao remoto e então a sincronização liga sozinha
-- (o código já é tolerante à ausência da tabela/rpc: cai no localStorage).
-- ============================================================
create table if not exists public.ai_learning (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id(),
  q_norm text not null,          -- pergunta normalizada (chave)
  q text not null,               -- pergunta como exibida (casing da 1ª vez)
  n integer not null default 0,  -- quantas vezes foi perguntada
  up integer not null default 0, -- feedback positivo
  down integer not null default 0, -- feedback negativo
  last timestamptz not null default now(),
  unique (org_id, q_norm)
);

alter table public.ai_learning enable row level security;
drop policy if exists ai_learning_org on public.ai_learning;
create policy ai_learning_org on public.ai_learning
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());
create index if not exists ai_learning_org_idx on public.ai_learning (org_id);

-- Incremento atômico da frequência (upsert). SECURITY INVOKER: respeita a RLS
-- (o DEFAULT de org_id resolve a org do usuário logado).
create or replace function public.ai_learning_bump(p_norm text, p_q text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into public.ai_learning (q_norm, q, n, last)
  values (p_norm, p_q, 1, now())
  on conflict (org_id, q_norm) do update
    set n = public.ai_learning.n + 1, q = excluded.q, last = now();
end;
$$;

-- Feedback 👍/👎 do usuário sobre a resposta.
create or replace function public.ai_learning_feedback(p_norm text, p_dir text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.ai_learning
    set up   = up   + (case when p_dir = 'up'   then 1 else 0 end),
        down = down + (case when p_dir = 'down' then 1 else 0 end)
  where org_id = public.auth_org_id() and q_norm = p_norm;
end;
$$;

grant execute on function public.ai_learning_bump(text, text) to authenticated;
grant execute on function public.ai_learning_feedback(text, text) to authenticated;
