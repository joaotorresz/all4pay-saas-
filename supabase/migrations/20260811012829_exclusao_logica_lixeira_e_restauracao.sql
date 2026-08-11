-- ═══════════════════════════════════════════════════════════════════════════
-- ONDA 3 · EXCLUSÃO LÓGICA, LIXEIRA E RESTAURAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ Duas camadas, e as duas são necessárias por razões diferentes:
--
--  1. A política RESTRITIVA de SELECT esconde o que foi excluído. Isso torna
--     "a tela não mostra lixo" verdade POR CONSTRUÇÃO — nenhuma consulta do
--     produto precisa lembrar de filtrar, e não existe tela nova que esqueça.
--     Filtrar no acessor seria o mesmo defeito que a ONDA 10 encontrou nos
--     cálculos: a regra vive em 40 lugares e falha no quadragésimo primeiro.
--
--  2. O privilégio de DELETE é REVOGADO. Sem isso, "nenhuma exclusão física"
--     é uma regra que o código respeita enquanto alguém lembra — e o cliente
--     fala PostgREST direto, então bastaria uma chamada. Revogado, o caminho
--     não existe.
--
-- ⚠️ E é por isso que a lixeira e a restauração são funções `SECURITY DEFINER`:
-- a política de SELECT esconde a linha até de quem quer restaurá-la. Sem uma
-- porta declarada, a exclusão lógica viraria exclusão definitiva com outro nome.
--
-- ⚠️ ESTA MIGRATION FOI CORRIGIDA TRÊS VEZES nas migrations seguintes, e as
-- correções ficam na história de propósito. A varredura ampla que serve bem à
-- TRILHA (todo write importa) serve MAL aqui: só quem é ENTIDADE precisa de
-- lixeira. Ver `lixeira_so_para_quem_e_entidade` e as duas seguintes.

do $$
declare
  r record;
  -- Exclusões, cada uma com motivo:
  --  audit_log, org_state, raw_events  — já fora da trilha, pelos mesmos motivos.
  --  movement_tags                     — é VÍNCULO, não entidade. "Tirar a
  --                                      etiqueta" tem de tirar mesmo; guardar
  --                                      etiquetas removidas para sempre é
  --                                      lixo que ninguém vai à lixeira buscar.
  --  ai_actions, rule_executions,
  --  admin_acessos, admin_audit        — REGISTRO de execução, não entidade.
  --                                      Um log com lixeira é um log editável.
  fora text[] := array[
    'audit_log','org_state','raw_events','movement_tags',
    'ai_actions','rule_executions','admin_acessos','admin_audit'
  ];
begin
  for r in
    select c.relname::text as t, c.oid
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'r' and c.relname <> all (fora)
     order by c.relname
  loop
    execute format(
      'alter table public.%I
         add column if not exists excluido_em  timestamptz,
         add column if not exists excluido_por uuid,
         add column if not exists excluido_motivo text', r.t);

    -- ⚠️ Índice PARCIAL sobre o que foi excluído: a lixeira é sempre a minoria
    -- e é o único lugar que pergunta por ela. Um índice sobre a coluna inteira
    -- pesaria em toda escrita para servir uma tela que se abre uma vez por mês.
    execute format(
      'create index if not exists %I on public.%I (org_id, excluido_em desc) where excluido_em is not null',
      r.t || '_lixeira_idx', r.t);

    -- ⚠️ RESTRITIVA, não permissiva: permissiva só AMPLIA, e o que se quer aqui
    -- é subtrair. Ela se soma à política de empresa em vez de substituí-la.
    execute format('drop policy if exists %I on public.%I', r.t || '_esconde_excluido', r.t);
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using (excluido_em is null)',
      r.t || '_esconde_excluido', r.t);

    -- O caminho da exclusão física deixa de existir para o cliente.
    execute format('revoke delete on table public.%I from anon, authenticated', r.t);
  end loop;
end $$;
