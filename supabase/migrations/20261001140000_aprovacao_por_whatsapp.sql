-- ═══════════════════════════════════════════════════════════════════════════
-- APROVAR TÍTULO PELA WHATSAPP — o MESMO caminho de aprovação, por outra porta
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O aprovador recebe no WhatsApp o resumo de um título PREVISTO e responde
-- "SIM <código>" ou "NÃO <código>". A resposta chega à rota
-- `/api/whatsapp/aprovacao` (assinada pela Twilio), que chama
-- `responder_aprovacao_whatsapp` com a chave de serviço.
--
-- ⚠️ **UM CAMINHO DE APROVAÇÃO SÓ.** O "SIM" não confirma o título por conta
-- própria: ele faz o MESMO `update movements set situacao = 'confirmado'` que a
-- Central faz, como o aprovador, e é o gatilho `central_maquina` que decide —
-- segregação (quem lançou não confirma havendo outro aprovador), permissão
-- (`tem_permissao('aprovar')`), alçada e o carimbo `confirmado_por`. Uma
-- segunda regra aqui seria a segunda morada da aprovação, que é o defeito que
-- este repositório passou dias matando: no primeiro ajuste da alçada, a porta
-- do WhatsApp aprovaria o que a Central recusa.
--
-- ⚠️ **O "como o aprovador" é feito pelo mesmo mecanismo que a sessão usa.**
-- `auth.uid()` lê `request.jwt.claim.sub` e `request.jwt.claims`; a função
-- grava os dois com `set_config(..., true)` (local à transação) só durante o
-- UPDATE e devolve os valores anteriores em seguida. A identidade sai do
-- PEDIDO (gravado por quem pediu, conferido no momento do pedido), nunca de
-- algo que a mensagem do WhatsApp diga.
--
-- ⚠️ **O CÓDIGO.** Seis caracteres de um alfabeto sem ambiguidade (sem 0/O/1/I),
-- gerado por `gen_random_uuid()` (aleatório criptográfico, nativo — não depende
-- do esquema onde o pgcrypto foi instalado). O banco guarda só o SHA-256; o
-- texto sai UMA vez, para a mensagem. Vale 24 horas e é de USO ÚNICO: a
-- resposta marca o pedido como respondido mesmo quando a confirmação é
-- recusada — repetir o mesmo "SIM" não pode virar tentativa de força bruta nem
-- uma segunda aprovação.
--
-- ⚠️ **QUEM PODE RESPONDER: só a chave de serviço.** `responder_...` não é
-- executável por `authenticated`: um usuário logado que soubesse o código e o
-- telefone de um colega aprovaria em nome dele. A rota só chama depois de
-- validar a assinatura da Twilio.
--
-- ⚠️ **NASCE DESLIGADA.** Nada aqui envia mensagem: a rota e a ação do
-- servidor só funcionam com `WHATSAPP_APROVACAO=ligado` no ambiente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.aprovacao_whatsapp_pedidos (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  movement_id uuid not null references public.movements(id) on delete cascade,
  aprovador_id uuid not null,
  -- só dígitos, 10 a 13 (DDD + número, com ou sem o 55)
  telefone text not null check (telefone ~ '^[0-9]{10,13}$'),
  -- SHA-256 (hex) do código em caixa alta. O código em texto nunca é gravado.
  codigo_hash text not null check (codigo_hash ~ '^[0-9a-f]{64}$'),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  respondido_em timestamptz,
  resposta text check (resposta in ('sim','nao')),
  resultado text
);
alter table public.aprovacao_whatsapp_pedidos enable row level security;

comment on table public.aprovacao_whatsapp_pedidos is
  'Pedidos de aprovação de título por WhatsApp. Código com hash, 24h, uso único. Só as RPCs escrevem; o SIM passa pelo gatilho central_maquina.';

-- Um pedido EM ABERTO por (título, aprovador): pedir de novo substitui o anterior.
create unique index if not exists aprovacao_whatsapp_um_aberto
  on public.aprovacao_whatsapp_pedidos (movement_id, aprovador_id)
  where respondido_em is null;
create index if not exists aprovacao_whatsapp_por_hash
  on public.aprovacao_whatsapp_pedidos (codigo_hash)
  where respondido_em is null;

-- Leitura pelos membros da empresa; NENHUMA política de escrita: só as RPCs
-- (SECURITY DEFINER) gravam.
drop policy if exists aprovacao_whatsapp_ler on public.aprovacao_whatsapp_pedidos;
create policy aprovacao_whatsapp_ler on public.aprovacao_whatsapp_pedidos
  for select to authenticated
  using (org_id = public.auth_org_id());

revoke all on public.aprovacao_whatsapp_pedidos from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.aprovacao_whatsapp_pedidos from authenticated;
grant select on public.aprovacao_whatsapp_pedidos to authenticated;

-- A trilha genérica (guarda `trilha-completa`): é tabela de negócio.
drop trigger if exists zz_auditar_aprovacao_whatsapp_pedidos on public.aprovacao_whatsapp_pedidos;
create trigger zz_auditar_aprovacao_whatsapp_pedidos
  after insert or update or delete on public.aprovacao_whatsapp_pedidos
  for each row execute function public.auditar_escrita();

-- ───────────────────────────────────────────────────────────────────────────
-- PEDIR — quem pode lançar pede a um aprovador da MESMA empresa
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.pedir_aprovacao_whatsapp(
  p_movement uuid, p_aprovador uuid, p_telefone text
) returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org uuid := public.auth_org_id();
  v_mov record;
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g');
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32, sem 0/O/1/I
  v_bytes bytea;
  v_codigo text := '';
  v_id uuid;
  i int;
begin
  if auth.uid() is null or v_org is null then
    raise exception 'A4P-WA-SESSAO: sessão ausente — entre de novo para pedir a aprovação.';
  end if;

  select id, org_id, situacao, description, amount into v_mov
    from public.movements where id = p_movement;
  if not found or v_mov.org_id is distinct from v_org then
    raise exception 'A4P-WA-TITULO: título não encontrado nesta empresa.';
  end if;
  if v_mov.situacao is distinct from 'previsto' then
    raise exception 'A4P-WA-SITUACAO: só um título PREVISTO pode ser enviado para aprovação (situação atual: %).', v_mov.situacao;
  end if;

  if not public.tem_permissao('lancar', v_org) then
    raise exception 'A4P-WA-PERMISSAO: seu papel nesta empresa não pode pedir aprovação de títulos.';
  end if;

  if not exists (
    select 1 from public.organization_members om
      join public.role_permissions rp on rp.papel = om.role and rp.acao = 'aprovar'
     where om.org_id = v_org and om.user_id = p_aprovador
  ) then
    raise exception 'A4P-WA-APROVADOR: a pessoa escolhida não é membro desta empresa com permissão de aprovar.';
  end if;

  if length(v_tel) not between 10 and 13 then
    raise exception 'A4P-WA-TELEFONE: telefone inválido — informe DDD e número (10 a 13 dígitos).';
  end if;

  -- 6 bytes aleatórios de um UUID v4 (os bytes 0–5 não carregam versão/variante);
  -- 256 é múltiplo de 32, então `% 32` não enviesa o alfabeto.
  v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  for i in 0..5 loop
    v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;

  -- O pedido anterior do mesmo par é FECHADO (não apagado): fica o rastro.
  update public.aprovacao_whatsapp_pedidos
     set respondido_em = now(), resultado = 'substituído'
   where movement_id = p_movement and aprovador_id = p_aprovador and respondido_em is null;

  insert into public.aprovacao_whatsapp_pedidos
    (org_id, movement_id, aprovador_id, telefone, codigo_hash, criado_por, expira_em)
  values
    (v_org, p_movement, p_aprovador, v_tel,
     encode(sha256(convert_to(upper(v_codigo), 'UTF8')), 'hex'),
     auth.uid(), now() + interval '24 hours')
  returning id into v_id;

  -- ⚠️ A trilha NÃO leva o código.
  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (v_org, auth.uid()::text, 'aprovacao_whatsapp.pedir', null,
          jsonb_build_object('pedido', v_id, 'movimento', p_movement,
                             'aprovador', p_aprovador,
                             'telefone_final', right(v_tel, 4)));

  return v_codigo;
end $fn$;

revoke execute on function public.pedir_aprovacao_whatsapp(uuid, uuid, text) from public, anon;
grant execute on function public.pedir_aprovacao_whatsapp(uuid, uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- RESPONDER — só a chave de serviço (a rota que validou a assinatura da Twilio)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.responder_aprovacao_whatsapp(
  p_telefone text, p_codigo text, p_decisao text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g');
  v_hash text := encode(sha256(convert_to(upper(trim(coalesce(p_codigo, ''))), 'UTF8')), 'hex');
  v_dec text := lower(trim(coalesce(p_decisao, '')));
  v_p record;
  v_claims_antes text := current_setting('request.jwt.claims', true);
  v_sub_antes text := current_setting('request.jwt.claim.sub', true);
  v_n int;
  v_erro text;
begin
  if v_dec not in ('sim', 'nao') then
    return jsonb_build_object('ok', false, 'motivo', 'Resposta não reconhecida: responda SIM ou NÃO seguido do código.');
  end if;

  -- ⚠️ Código E telefone juntos: a mensagem de recusa é a MESMA para "código
  -- inexistente", "código de outro telefone" e "já respondido" — não revela
  -- se o código existe para outra pessoa.
  select * into v_p
    from public.aprovacao_whatsapp_pedidos
   where codigo_hash = v_hash and telefone = v_tel and respondido_em is null
   order by criado_em desc
   limit 1
   for update;
  if not found then
    return jsonb_build_object('ok', false,
      'motivo', 'Código inválido ou já utilizado para este telefone.');
  end if;

  if v_p.expira_em <= now() then
    update public.aprovacao_whatsapp_pedidos
       set respondido_em = now(), resultado = 'expirado'
     where id = v_p.id;
    return jsonb_build_object('ok', false,
      'motivo', 'Código expirado: o pedido valia 24 horas. Peça uma nova aprovação.');
  end if;

  if v_dec = 'nao' then
    update public.aprovacao_whatsapp_pedidos
       set respondido_em = now(), resposta = 'nao', resultado = 'recusado pelo aprovador'
     where id = v_p.id;
    insert into public.audit_log (org_id, usuario, acao, antes, depois)
    values (v_p.org_id, v_p.aprovador_id::text, 'aprovacao_whatsapp.recusar', null,
            jsonb_build_object('pedido', v_p.id, 'movimento', v_p.movement_id));
    return jsonb_build_object('ok', true, 'decisao', 'nao');
  end if;

  -- SIM: o MESMO UPDATE da Central, como o aprovador. Quem decide é o gatilho.
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_p.aprovador_id, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_p.aprovador_id::text, true);

    update public.movements
       set situacao = 'confirmado'
     where id = v_p.movement_id and situacao = 'previsto';
    get diagnostics v_n = row_count;
    if v_n = 0 then
      raise exception 'A4P-WA-SITUACAO: o título já não está previsto.';
    end if;
  exception when others then
    v_erro := sqlerrm;
  end;

  -- devolve a identidade de quem chamou (a da rota), qualquer que tenha sido o fim
  perform set_config('request.jwt.claims', coalesce(v_claims_antes, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub_antes, ''), true);

  if v_erro is not null then
    -- Uso único também na recusa: o pedido fica respondido, com o motivo.
    update public.aprovacao_whatsapp_pedidos
       set respondido_em = now(), resposta = 'sim', resultado = v_erro
     where id = v_p.id;
    insert into public.audit_log (org_id, usuario, acao, antes, depois)
    values (v_p.org_id, v_p.aprovador_id::text, 'aprovacao_whatsapp.recusada', null,
            jsonb_build_object('pedido', v_p.id, 'movimento', v_p.movement_id, 'motivo', v_erro));
    return jsonb_build_object('ok', false, 'decisao', 'sim', 'motivo', v_erro);
  end if;

  update public.aprovacao_whatsapp_pedidos
     set respondido_em = now(), resposta = 'sim', resultado = 'confirmado'
   where id = v_p.id;
  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (v_p.org_id, v_p.aprovador_id::text, 'aprovacao_whatsapp.confirmar', null,
          jsonb_build_object('pedido', v_p.id, 'movimento', v_p.movement_id));
  return jsonb_build_object('ok', true, 'decisao', 'sim');
end $fn$;

revoke execute on function public.responder_aprovacao_whatsapp(text, text, text) from public, anon, authenticated;
grant execute on function public.responder_aprovacao_whatsapp(text, text, text) to service_role;
