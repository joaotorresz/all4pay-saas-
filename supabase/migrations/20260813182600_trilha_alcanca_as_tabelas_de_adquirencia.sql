-- ═══════════════════════════════════════════════════════════════════════════
-- A TRILHA ALCANÇA AS TABELAS DE ADQUIRÊNCIA — nove que nasceram fora dela
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **A varredura da ONDA 3 roda UMA VEZ, e quem chega depois não é
-- alcançado.** `20260811012230_trilha_de_negocio_por_gatilho` instala o gatilho
-- em toda tabela de `public` que tem `org_id`; a migration de adquirência
-- (`20260813141800_own_integracao_adquirencia`) foi aplicada ao banco em
-- 13/08 às 14:18, dois dias DEPOIS da varredura. As nove tabelas dela nasceram
-- sem trilha — e não é hipótese: medido em produção, são exatamente estas nove
-- e nenhuma outra.
--
-- ⚠️ **O que tornou o defeito visível foi trazer o arquivo para o repositório.**
-- Enquanto as tabelas existiam só no banco remoto, a guarda `trilha-completa`
-- nunca as via: ela roda contra um banco construído do zero pelas migrations do
-- repositório, e o que não tem arquivo não existe para ela. É o mesmo ponto
-- cego que o manifesto de esquema (`npm run esquema`) foi criado para nomear —
-- e é a segunda vez nesta sessão que a divergência repositório × banco esconde
-- um defeito real, não uma diferença de formalidade.
--
-- A correção é RE-RODAR a varredura, não escrever uma lista com os nove nomes:
-- uma lista à mão envelhece na próxima tabela nova, que é precisamente como
-- este defeito nasceu. O bloco é idempotente (`drop trigger if exists` antes do
-- `create`), então reaplicá-lo sobre as tabelas que já têm gatilho é inócuo.
--
-- ⚠️ **Momento mais barato possível:** as nove estão VAZIAS em produção (0
-- linhas, medido). Instalar o gatilho agora não reescreve nada nem produz um
-- lote de eventos retroativos; a trilha começa junto com o primeiro dado.

-- ---------- 1. As duas exclusões novas, cada uma com motivo ----------
--
-- ⚠️ **Elas não são exceção nova: são as categorias que a ONDA 3 já declarou**,
-- aplicadas a este produto.
--
--  own_webhook_eventos — o que entra BRUTO do adquirente, exatamente o papel de
--                        `raw_events`. O evento de negócio é o `own_transacoes`
--                        / `own_liquidacoes` que sai dele, e esse é auditado.
--  own_sync_execucoes  — log de execução de sincronização: telemetria de alto
--                        volume, o papel de `ddl_log`. E ele já É uma trilha;
--                        auditar trilha é o ruído puro que `admin_audit` evita.
--
-- ⚠️ O que decide as duas é a mesma pergunta, e ela não é de volume: **uma
-- trilha existe para registrar QUEM DECIDIU o quê.** Ninguém decide o corpo de
-- um webhook nem o resultado de uma rodada de sincronização — as duas são
-- escritas por máquina e nunca editadas por uma pessoa. As outras sete têm
-- decisão humana atrás: cadastrar lojista, ativar terminal, revogar uma
-- credencial, antecipar um recebível.
--
-- ⚠️ `own_erp_credenciais` FICA DENTRO da trilha, e a conferência foi
-- necessária: auditar uma tabela de credencial duplicaria o segredo para dentro
-- de `audit_log`, que tem outro recorte de acesso. Ela guarda `chave_prefixo` e
-- `chave_hash` — nunca a chave —, então o antes/depois registra que alguém
-- revogou um acesso sem carregar o acesso junto. É a mesma doutrina do
-- "um segredo se mostra UMA vez".
--
-- ⚠️ **A lista tem de bater com a de `scripts/trilha-completa.sql`**, e a
-- guarda cobra isso no sentido que importa: excluir aqui sem excluir lá faz a
-- guarda apontar a tabela como faltante e o build cai. Uma exclusão que só
-- existe de um lado é uma tabela que perdeu a trilha sem ninguém decidir.

do $$
declare
  r record;
  fora text[] := array[
    'audit_log','org_state','admin_acessos','admin_audit',
    'rota_alias_acessos','ddl_log','raw_events',
    'own_webhook_eventos','own_sync_execucoes'
  ];
begin
  for r in
    select c.relname::text as t
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname <> all (fora)
     order by c.relname
  loop
    execute format('drop trigger if exists %I on public.%I', 'zz_auditar_' || r.t, r.t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.auditar_escrita()',
      'zz_auditar_' || r.t, r.t
    );
  end loop;
end $$;

-- ---------- 2. A conferência, na própria migration ----------
--
-- ⚠️ A guarda de CI confere isto a cada build, e ainda assim vale conferir
-- AQUI: uma migration que instala gatilho e não verifica o resultado pode
-- passar sem instalar nada — bastaria a varredura não casar nenhuma linha (um
-- `where` errado, um schema diferente) para ela terminar com sucesso tendo
-- feito zero. Um "aplicada com sucesso" que não fez nada é pior que uma falha,
-- porque fecha o assunto.

do $$
declare
  faltando text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into faltando
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname like 'own\_%'
     and c.relname <> all (array['own_webhook_eventos','own_sync_execucoes'])
     and not exists (
       select 1 from pg_trigger t
        where t.tgrelid = c.oid and not t.tgisinternal and t.tgname like 'zz_auditar_%'
     );

  if array_length(faltando, 1) > 0 then
    raise exception 'A varredura não alcançou %: %',
      array_length(faltando, 1), array_to_string(faltando, ', ');
  end if;
end $$;
