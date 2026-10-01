-- ═══════════════════════════════════════════════════════════════════════════
-- CAIXA DE ENTRADA DE CONTAS A PAGAR — A PORTA DO E-MAIL (01/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O fornecedor manda o boleto e a nota por e-mail, e hoje o papel fica na
-- caixa de correio de quem recebeu: ninguém mais sabe que ele chegou, e é
-- assim que uma conta vence sem ter virado conta. Esta migration dá à caixa de
-- entrada de contas a pagar (`core/caixa-entrada`, aba de "Títulos a pagar") um
-- ENDEREÇO de e-mail por empresa: o que chega nele aparece na mesma fila em que
-- já estão o documento lido por OCR, o boleto do DDA e a nota da SEFAZ.
--
-- ⚠️ **O E-MAIL É UMA FONTE, NUNCA UM ESCRITOR DE CONTAS.** Nada aqui toca em
-- `movements`. A mensagem entra na fila; quem decide é uma pessoa, e "Criar
-- conta a pagar" abre o MESMO formulário de sempre, preenchido. Uma segunda
-- porta de criação divergiria da primeira no dia em que um campo mudasse.
--
-- ⚠️ **POR QUE TABELA PRÓPRIA, e não a chave `a4p_caixa_entrada` do
-- `org_state`.** Aquela chave é UM documento JSON por empresa, reescrito
-- inteiro a cada gravação (ler → mudar → gravar). O webhook do provedor de
-- e-mail chega sem sessão, a qualquer hora, e às vezes dois ao mesmo tempo;
-- fazer ler-mudar-gravar ali faria uma mensagem apagar a outra, ou apagar a
-- decisão que alguém acabou de tomar na tela. Uma linha por mensagem não tem
-- corrida: o INSERT de uma não reescreve nada da outra. As DECISÕES sobre a
-- mensagem (descartar com motivo, virou conta) continuam em `a4p_caixa_entrada`,
-- como as de qualquer outra fonte — uma decisão, uma morada.
--
-- ⚠️ **A IDEMPOTÊNCIA É DO BANCO.** O provedor reenvia o webhook quando não
-- recebe 200 a tempo. O índice único (org_id, mensagem_id) — o Message-ID do
-- e-mail — faz o reenvio cair em `on conflict do nothing`: a mesma mensagem
-- entra uma vez, por mais vezes que chegue. Uma trava no código protege o
-- código de hoje; a do banco protege também o reenvio de amanhã.
--
-- ⚠️ **MUDA QUEM PODE CHAMAR O QUÊ** (declarado, para o dono decidir):
--   · `registrar_email_caixa` é SECURITY DEFINER e escreve na empresa dona do
--     endereço. Executável SÓ por `service_role` — é a rota do webhook
--     (`/api/caixa-email/entrada`), que além disso exige o segredo do provedor
--     e está DESLIGADA por padrão (`CAIXA_EMAIL` ≠ "ligado" → 503).
--   · `gerar_endereco_caixa_email` é SECURITY DEFINER, executável por
--     `authenticated`, e recusa quem não ADMINISTRA a empresa ativa.
--   · `authenticated` ganha SELECT nas duas tabelas (recortado por empresa).
--     Ninguém do cliente insere, altera ou apaga direto: as escritas só existem
--     pelas duas RPCs (e pela lixeira, `excluir_logico`, que já é DEFINER).
--
-- ⚠️ **O token não é o segredo do webhook.** Quem sabe o endereço consegue
-- mandar e-mail para ele — que é exatamente o uso pretendido, e o pior que
-- acontece é um papel a mais na fila esperando decisão humana. Quem chama a
-- rota é o PROVEDOR, com `CAIXA_EMAIL_SEGREDO`; o token só diz de qual empresa
-- é o envelope. Vazou o endereço? Gerar de novo troca o token e o antigo deixa
-- de existir.
--
-- O arquivo do anexo vai para o bucket PRIVADO `caixa-email`, em
-- `<org_id>/<id da mensagem>/<nome>`: a primeira pasta é a empresa, e é ela que
-- a política de leitura confere. Onde o Storage não existe (o banco de prova
-- local), o bucket e a política são PULADOS COM AVISO — nunca em silêncio.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O ENDEREÇO DE CADA EMPRESA
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.caixa_email_enderecos (
  org_id uuid not null primary key
    references public.organizations(id) on delete cascade,
  -- `id` existe para a trilha genérica (`auditar_escrita` lê `->> 'id'`):
  -- "quem gerou o endereço, e quando" é a pergunta de quem investiga um
  -- documento que entrou pela porta errada.
  id uuid not null default gen_random_uuid() unique,
  -- ⚠️ Minúsculo e sem ambiguidade: o endereço vira a parte local de um e-mail,
  -- e há provedor que muda a caixa do destinatário no caminho. Um token com
  -- maiúsculas deixaria de casar sem que ninguém soubesse por quê.
  token text not null unique check (token ~ '^[a-z0-9_-]{16,64}$'),
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);
alter table public.caixa_email_enderecos enable row level security;

comment on table public.caixa_email_enderecos is
  'Endereço de e-mail da caixa de entrada de contas a pagar, um por empresa. Gerado/rotacionado só por gerar_endereco_caixa_email() (quem administra).';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. AS MENSAGENS QUE CHEGARAM
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.caixa_email_mensagens (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  recebido_em timestamptz not null default now(),
  remetente text check (remetente is null or length(remetente) <= 320),
  assunto text check (assunto is null or length(assunto) <= 500),
  -- ⚠️ Teto de 20 mil caracteres: o corpo de um e-mail com histórico citado
  -- cresce sem limite, e a fila precisa do começo dele, não do fio inteiro.
  texto text check (texto is null or length(texto) <= 20000),
  -- [{ nome, tipo, tamanho, caminho }] — o arquivo mora no Storage; aqui fica
  -- o que a tela precisa para listar e abrir.
  anexos jsonb not null default '[]'::jsonb check (jsonb_typeof(anexos) = 'array'),
  -- Message-ID do e-mail, para a idempotência (índice abaixo).
  mensagem_id text check (mensagem_id is null or length(mensagem_id) <= 998),
  -- A convenção da lixeira (exclusão lógica, ONDA 3): ninguém apaga uma
  -- mensagem; ela vai para a lixeira com quem, quando e por quê.
  excluido_em timestamptz,
  excluido_por uuid,
  excluido_motivo text
);
alter table public.caixa_email_mensagens enable row level security;

-- ⚠️ A TRAVA DO REENVIO. Parcial porque um e-mail sem Message-ID (raro, mas
-- existe) não tem com que ser deduplicado — e recusá-lo perderia o papel.
create unique index if not exists caixa_email_mensagens_unica
  on public.caixa_email_mensagens (org_id, mensagem_id) where mensagem_id is not null;
create index if not exists caixa_email_mensagens_recentes
  on public.caixa_email_mensagens (org_id, recebido_em desc);
create index if not exists caixa_email_mensagens_lixeira_idx
  on public.caixa_email_mensagens (org_id, excluido_em desc) where excluido_em is not null;

comment on table public.caixa_email_mensagens is
  'E-mails recebidos no endereço da caixa de entrada de contas a pagar. Escritos só por registrar_email_caixa() (service_role). Índice único (org_id, mensagem_id): o reenvio do webhook não duplica.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. A TRILHA — as duas são de negócio (guarda `trilha-completa`)
-- ───────────────────────────────────────────────────────────────────────────
drop trigger if exists zz_auditar_caixa_email_enderecos on public.caixa_email_enderecos;
create trigger zz_auditar_caixa_email_enderecos
  after insert or update or delete on public.caixa_email_enderecos
  for each row execute function public.auditar_escrita();

drop trigger if exists zz_auditar_caixa_email_mensagens on public.caixa_email_mensagens;
create trigger zz_auditar_caixa_email_mensagens
  after insert or update or delete on public.caixa_email_mensagens
  for each row execute function public.auditar_escrita();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. QUEM LÊ (e ninguém escreve direto)
-- ───────────────────────────────────────────────────────────────────────────
revoke all on public.caixa_email_enderecos from public, anon, authenticated, service_role;
revoke all on public.caixa_email_mensagens from public, anon, authenticated, service_role;
grant select on public.caixa_email_enderecos to authenticated;
grant select on public.caixa_email_mensagens to authenticated;

drop policy if exists caixa_email_enderecos_org on public.caixa_email_enderecos;
create policy caixa_email_enderecos_org on public.caixa_email_enderecos
  for select to authenticated
  using (org_id = public.auth_org_id());

drop policy if exists caixa_email_mensagens_org on public.caixa_email_mensagens;
create policy caixa_email_mensagens_org on public.caixa_email_mensagens
  for select to authenticated
  using (org_id = public.auth_org_id());

-- RESTRITIVA, como em toda tabela com lixeira: o excluído some da leitura por
-- construção, sem a tela precisar lembrar de filtrar.
drop policy if exists caixa_email_mensagens_esconde_excluido on public.caixa_email_mensagens;
create policy caixa_email_mensagens_esconde_excluido on public.caixa_email_mensagens
  as restrictive for select to authenticated
  using (excluido_em is null);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. GERAR (OU TROCAR) O ENDEREÇO — quem administra
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.gerar_endereco_caixa_email()
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.auth_org_id();
  v_token text;
begin
  if v_org is null then
    raise exception 'A4P-CAIXA-EMAIL: nenhuma empresa aberta nesta sessão.'
      using errcode = 'insufficient_privilege';
  end if;
  if not public.tem_permissao('administrar', v_org) then
    raise exception 'A4P-CAIXA-EMAIL: só quem administra a empresa gera ou troca o endereço de e-mail da caixa de entrada.'
      using errcode = 'insufficient_privilege';
  end if;
  -- 32 caracteres hexadecimais = 122 bits aleatórios. `gen_random_uuid` é do
  -- núcleo do Postgres (não depende de pgcrypto) e já sai minúsculo.
  v_token := replace(gen_random_uuid()::text, '-', '');
  -- ⚠️ TROCAR é sobrescrever: o token antigo deixa de existir no mesmo gesto,
  -- e um e-mail mandado para ele passa a ser recusado. A troca fica na trilha
  -- (`caixa_email_enderecos.alterar`, com quem e quando) pelo gatilho acima.
  insert into public.caixa_email_enderecos (org_id, token, criado_em, criado_por)
  values (v_org, v_token, now(), auth.uid())
  on conflict (org_id) do update
    set token = excluded.token, criado_em = excluded.criado_em, criado_por = excluded.criado_por;
  return v_token;
end;
$$;

revoke all on function public.gerar_endereco_caixa_email() from public, anon;
grant execute on function public.gerar_endereco_caixa_email() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. REGISTRAR UMA MENSAGEM — só a rota do webhook (service_role)
-- ───────────────────────────────────────────────────────────────────────────
-- `p_id` vem da rota: é o id que a mensagem terá, e por isso a rota já sabe a
-- pasta do anexo. O CAMINHO, porém, é montado AQUI (`<org>/<id>/<nome>`): a
-- empresa só é conhecida depois de resolver o token, e quem resolve é o banco.
-- No reenvio (`duplicada`), a função devolve o id e os caminhos da mensagem
-- QUE JÁ EXISTE — a rota regrava os arquivos ali (upsert), então um reenvio
-- causado por falha de upload completa o que faltou em vez de perder o anexo.
create or replace function public.registrar_email_caixa(
  p_token text,
  p_remetente text,
  p_assunto text,
  p_texto text,
  p_anexos jsonb,
  p_mensagem_id text,
  p_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_anexos jsonb := '[]'::jsonb;
  v_a jsonb;
  v_nome text;
  v_novo uuid;
  v_exist record;
begin
  -- ⚠️ Token desconhecido, malformado ou vazio recebem a MESMA mensagem: dizer
  -- "token com formato errado" para um e "não existe" para outro ensinaria a
  -- quem tenta adivinhar qual metade acertou.
  select e.org_id into v_org
    from public.caixa_email_enderecos e
   where e.token = lower(coalesce(p_token, ''));
  if v_org is null then
    raise exception 'A4P-CAIXA-EMAIL: destinatário não reconhecido.'
      using errcode = 'no_data_found';
  end if;

  if p_anexos is not null and jsonb_typeof(p_anexos) = 'array' then
    if jsonb_array_length(p_anexos) > 10 then
      raise exception 'A4P-CAIXA-EMAIL: mais de 10 anexos numa mensagem.'
        using errcode = 'check_violation';
    end if;
    for v_a in select * from jsonb_array_elements(p_anexos) loop
      -- O nome entra no caminho do Storage: nada de barra, nada de "..".
      v_nome := left(regexp_replace(coalesce(v_a ->> 'nome', 'anexo'), '[^A-Za-z0-9._-]', '_', 'g'), 120);
      if v_nome = '' or v_nome ~ '^\.+$' then v_nome := 'anexo'; end if;
      v_anexos := v_anexos || jsonb_build_array(jsonb_build_object(
        'nome', v_nome,
        'tipo', left(coalesce(v_a ->> 'tipo', ''), 120),
        'tamanho', coalesce((v_a ->> 'tamanho')::bigint, 0),
        'caminho', v_org::text || '/' || v_id::text || '/' || v_nome
      ));
    end loop;
  end if;

  insert into public.caixa_email_mensagens
    (id, org_id, remetente, assunto, texto, anexos, mensagem_id)
  values
    (v_id, v_org,
     left(nullif(btrim(coalesce(p_remetente, '')), ''), 320),
     left(nullif(btrim(coalesce(p_assunto, '')), ''), 500),
     left(p_texto, 20000),
     v_anexos,
     left(nullif(btrim(coalesce(p_mensagem_id, '')), ''), 998))
  on conflict (org_id, mensagem_id) where mensagem_id is not null do nothing
  returning id into v_novo;

  if v_novo is null then
    select m.id, m.anexos into v_exist
      from public.caixa_email_mensagens m
     where m.org_id = v_org and m.mensagem_id = left(nullif(btrim(coalesce(p_mensagem_id, '')), ''), 998);
    return jsonb_build_object('ok', true, 'id', v_exist.id, 'org_id', v_org,
                              'duplicada', true, 'anexos', v_exist.anexos);
  end if;
  return jsonb_build_object('ok', true, 'id', v_novo, 'org_id', v_org,
                            'duplicada', false, 'anexos', v_anexos);
end;
$$;

revoke all on function public.registrar_email_caixa(text, text, text, text, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.registrar_email_caixa(text, text, text, text, jsonb, text, uuid)
  to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. O BUCKET DOS ANEXOS (privado) — pulado COM AVISO onde não há Storage
-- ───────────────────────────────────────────────────────────────────────────
do $storage$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'caixa-email: NÃO foram criados o bucket privado "caixa-email" nem a política de leitura em storage.objects — este banco não tem o Storage do Supabase. Em PRODUÇÃO este aviso significa que os anexos dos e-mails não têm onde morar: a rota grava a mensagem e reporta cada anexo como falha.';
    return;
  end if;
  insert into storage.buckets (id, name, public)
  values ('caixa-email', 'caixa-email', false)
  on conflict (id) do nothing;
  -- A primeira pasta do caminho é a empresa (`<org_id>/<mensagem>/<nome>`).
  -- Sem política de escrita: só a chave de serviço (a rota) grava ali.
  execute 'drop policy if exists caixa_email_anexos_leitura on storage.objects';
  execute $p$
    create policy caixa_email_anexos_leitura on storage.objects
      for select to authenticated
      using (bucket_id = 'caixa-email'
             and split_part(name, '/', 1) = public.auth_org_id()::text)
  $p$;
end
$storage$;
