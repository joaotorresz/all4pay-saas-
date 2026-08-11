-- ═══════════════════════════════════════════════════════════════════════════
-- CORREÇÃO MEDIDA: lixeira é para ENTIDADE, não para configuração
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ A migration anterior instalou a exclusão lógica por VARREDURA sobre toda
-- tabela com `org_id` — o mesmo desenho que serve bem para a TRILHA (todo
-- write importa) e serve MAL aqui. `lixeira_listar()` quebrou na hora:
--
--   ERROR: 42703: column t.id does not exist
--
-- Cinco tabelas não têm `id` porque não são entidades: `company_profiles` e
-- `pos_rates` são configuração da empresa (uma linha por org), `subscriptions`
-- é o estado da cobrança, `organization_members` e `user_active_org` são
-- vínculo e preferência (chaveados por usuário).
--
-- ⚠️ E o defeito não era só a coluna faltando. "Excluir" nenhuma delas é a
-- operação que a lixeira modela: tirar um membro é `org_member_remove`, trocar
-- de empresa é `trocar_organizacao`, e as duas já têm função própria, regra
-- própria e registro próprio. Uma lixeira ao lado seria um SEGUNDO caminho para
-- a mesma coisa — que é o defeito que o mapa de consolidação existe para
-- impedir.
--
-- A regra, agora explícita: **exclusão lógica onde há IDENTIDADE** (`id`), que
-- é a mesma coisa que dizer "onde existe um registro que uma pessoa criou e
-- pode querer de volta".
--
-- ⚠️ O que NÃO volta atrás: o `DELETE` continua revogado nas cinco. Não é
-- descuido herdado da varredura — é a regra da onda ("nenhuma exclusão
-- física"), e nenhuma delas é apagada pelo cliente: as duas que têm remoção
-- real passam por função `SECURITY DEFINER`, que não depende de concessão.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare r record;
begin
  for r in
    select c.relname::text as t
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'excluido_em' and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'r'
       and not exists (
         select 1 from pg_attribute b
          where b.attrelid = c.oid and b.attname = 'id' and not b.attisdropped)
  loop
    execute format('drop policy if exists %I on public.%I', r.t || '_esconde_excluido', r.t);
    execute format('drop index if exists public.%I', r.t || '_lixeira_idx');
    execute format(
      'alter table public.%I
         drop column if exists excluido_em,
         drop column if exists excluido_por,
         drop column if exists excluido_motivo', r.t);
  end loop;
end $$;
