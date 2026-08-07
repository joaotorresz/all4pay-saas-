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
-- APLICADA em 04/08/2026, com as quatro condições de segurança conferidas:
-- search_path fixo, EXECUTE fora de public/anon, sem parâmetro de organização,
-- e dois usuários de organizações diferentes provando que nenhum enxerga o
-- aprendizado do outro.
--
-- ⚠️ Ela ficou DOIS MESES como arquivo sem aplicação, e ninguém soube: o cliente
-- é tolerante à ausência da tabela e cai no localStorage em silêncio. O
-- aprendizado por organização simplesmente nunca funcionou em produção — o
-- mesmo padrão de falha degradada que a ONDA 10 existe para denunciar.
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
-- ⚠️ `to authenticated` explícito: sem a cláusula, a política vale para PUBLIC,
-- e uma política que se aplica a todo mundo é uma política que não escolheu
-- ninguém. Aqui o efeito prático era pequeno (anon não tem concessão de tabela
-- desde a ONDA 9), mas o padrão do projeto passou a ser este e a exceção
-- silenciosa é como a próxima tabela nasce frouxa.
create policy ai_learning_org on public.ai_learning
  to authenticated
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

-- ⚠️ REVOGAR DE `public` ANTES DE CONCEDER.
--
-- A versão anterior só concedia a `authenticated`. O PostgreSQL concede
-- `EXECUTE` a **PUBLIC** por padrão em toda função criada — então conceder a
-- `authenticated` não retira nada de ninguém, e `anon` continuava podendo
-- chamar as duas. Estas são `SECURITY INVOKER` e a RLS as segurava, mas o
-- padrão do projeto é fechar por concessão E por política: depender só de uma
-- das duas é o que transforma um erro de RLS num vazamento.
--
-- É o mesmo furo encontrado no 0020, e antes dele no `anon` com TRUNCATE da
-- ONDA 9: a porta parecia trancada porque alguém trancou a fechadura errada.
revoke execute on function public.ai_learning_bump(text, text) from public, anon;
revoke execute on function public.ai_learning_feedback(text, text) from public, anon;
grant execute on function public.ai_learning_bump(text, text) to authenticated;
grant execute on function public.ai_learning_feedback(text, text) to authenticated;
revoke all on table public.ai_learning from public, anon;
grant select, insert, update on table public.ai_learning to authenticated;
