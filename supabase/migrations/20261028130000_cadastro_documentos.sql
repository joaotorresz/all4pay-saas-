-- ═══════════════════════════════════════════════════════════════════════════
-- O COFRE DOS DOCUMENTOS DO CADASTRO (27/10/2026, etapa 2 do plano
-- "documentos e funil do cadastro no admin")
--
-- A abertura de conta pede a foto do rosto, o RG ou a CNH e, na empresa, o
-- contrato social ou o comprovante de endereço. Até aqui nada disso saía do
-- aparelho: o cadastro guardava só QUAL documento foi enviado. A Quattro é
-- fintech, e o dono decidiu (27/10/2026) que os arquivos ficam guardados.
--
-- As decisões dele, e o que as executa:
--
--   · guardar por 5 ANOS                → `guardar_ate`, preenchido pelo banco
--   · só o DONO DA PLATAFORMA vê, com o
--     segundo fator                     → o bucket não tem política de leitura
--                                          para ninguém; a leitura será da chave
--                                          de serviço, atrás do portão do /admin
--                                          (etapa 3). A empresa NÃO relê os seus.
--
-- ⚠️ O ARQUIVO SOBE DO NAVEGADOR, direto ao Storage, com a sessão que acabou
-- de nascer: o limite de corpo das funções da Vercel (4,5 MB) recusaria o
-- documento de 10 MB que a tela aceita. Por isso a política de ESCRITA existe e
-- é estreita: só neste bucket, só na pasta da empresa aberta de quem envia, e
-- só criar (sem ler, sem trocar, sem apagar — um documento enviado não se
-- reescreve).
--
-- ⚠️ O REGISTRO NÃO CONFIA NO NAVEGADOR. `cadastro_documento_registrar` recebe
-- só o tipo e o caminho; tamanho, formato e dono saem do objeto que o Storage
-- gravou. Caminho fora da pasta da empresa, objeto que não existe ou objeto de
-- OUTRA pessoa são recusados.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.cadastro_documentos (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  user_id      uuid not null default auth.uid(),
  tipo         text not null check (tipo in ('selfie', 'rg', 'cnh', 'contrato', 'comprovante')),
  caminho      text not null unique,
  mime         text,
  tamanho      bigint check (tamanho is null or (tamanho > 0 and tamanho <= 10485760)),
  enviado_em   timestamptz not null default now(),
  guardar_ate  date not null default (current_date + interval '5 years')::date
);

create index if not exists cadastro_documentos_org_idx on public.cadastro_documentos (org_id, enviado_em desc);

-- Cada documento que entra fica na trilha da empresa (quem enviou, quando).
drop trigger if exists zz_auditar_cadastro_documentos on public.cadastro_documentos;
create trigger zz_auditar_cadastro_documentos
  after insert or update or delete on public.cadastro_documentos
  for each row execute function public.auditar_escrita();

-- RLS ligada e SEM política: ninguém lê nem escreve direto. A escrita é a RPC
-- abaixo; a leitura será da plataforma (etapa 3).
alter table public.cadastro_documentos enable row level security;
revoke all on public.cadastro_documentos from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- O REGISTRO — depois de o arquivo subir
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.cadastro_documento_registrar(p_tipo text, p_caminho text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  org  uuid := public.auth_org_id();
  quem uuid := auth.uid();
  v_mime text;
  v_tamanho bigint;
  v_dono uuid;
  achou boolean := false;
begin
  if quem is null or org is null then return 'sem_sessao'; end if;
  if p_tipo is null or p_tipo not in ('selfie', 'rg', 'cnh', 'contrato', 'comprovante') then return 'invalido'; end if;
  -- `<org>/<tipo>-<uuid>.<ext>`: a pasta é a empresa ABERTA de quem chama, e
  -- nada de `..` nem de subpasta.
  if p_caminho is null or p_caminho !~ ('^' || org::text || '/' || p_tipo || '-[0-9a-f-]{36}\.(jpg|png|webp|heic|pdf)$') then
    return 'invalido';
  end if;
  -- Teto por empresa: o cadastro manda no máximo três; trinta é folga para
  -- refazer, e impede o cofre de virar depósito.
  if (select count(*) from public.cadastro_documentos d where d.org_id = org) >= 30 then return 'limite'; end if;

  -- O objeto tem de existir, neste bucket, e ser de quem registra.
  if to_regclass('storage.objects') is not null then
    execute $q$
      select true, o.metadata->>'mimetype', nullif(o.metadata->>'size', '')::bigint, o.owner
        from storage.objects o
       where o.bucket_id = 'cadastro-documentos' and o.name = $1
    $q$ into achou, v_mime, v_tamanho, v_dono using p_caminho;
    if not coalesce(achou, false) then return 'sem_arquivo'; end if;
    if v_dono is distinct from quem then return 'invalido'; end if;
  end if;

  insert into public.cadastro_documentos (org_id, user_id, tipo, caminho, mime, tamanho)
  values (org, quem, p_tipo, p_caminho, v_mime, v_tamanho)
  on conflict (caminho) do nothing;
  return 'ok';
end;
$$;

revoke all on function public.cadastro_documento_registrar(text, text) from public, anon;
grant execute on function public.cadastro_documento_registrar(text, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- O BUCKET PRIVADO — pulado COM AVISO onde não há Storage
-- ───────────────────────────────────────────────────────────────────────────
do $storage$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'cadastro-documentos: NÃO foram criados o bucket privado "cadastro-documentos" nem a política de envio em storage.objects — este banco não tem o Storage do Supabase. Em PRODUÇÃO este aviso significa que os documentos do cadastro não têm onde morar: o envio falha e o cadastro segue, com a falha reportada.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('cadastro-documentos', 'cadastro-documentos', false, 10485760,
          array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
  on conflict (id) do update
    set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  -- Só CRIAR, só na pasta da empresa aberta. Nenhuma política de leitura,
  -- troca ou exclusão: nem a própria empresa relê o documento.
  execute 'drop policy if exists cadastro_documentos_envio on storage.objects';
  execute $p$
    create policy cadastro_documentos_envio on storage.objects
      for insert to authenticated
      with check (bucket_id = 'cadastro-documentos'
                  and split_part(name, '/', 1) = public.auth_org_id()::text)
  $p$;
end
$storage$;
