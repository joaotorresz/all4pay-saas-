-- ═══════════════════════════════════════════════════════════════════════════
-- O LIMITE DURÁVEL DA CONFERÊNCIA EXTRATO × SISTEMA (D4, 14/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A conferência (`POST /api/pinbank/conferencia`) é o primeiro caminho em que
-- alguém de uma EMPRESA dispara uma chamada à Pinbank com a credencial da
-- PLATAFORMA. Entre duas chamadas da mesma empresa, 60 segundos. Até aqui a
-- espera morava num `Map` no módulo da rota — de UMA instância do servidor:
-- outra instância (ou a mesma, depois de ociosa) começava vazia, e um laço
-- contra o endereço caía em várias. Era o freio do clique repetido, não o
-- limite (D4 em `docs/rodada-10/conferencia.md`).
--
-- Agora quem confere E carimba é o BANCO, numa instrução só:
--
--   `pinbank_conferencia_reservar(p_vinculo)` → { ok: true }
--                                             | { ok: false, restante_ms }
--
-- ⚠️ **A EMPRESA SAI DO VÍNCULO, nunca do pedido.** A função recebe o id do
-- vínculo, lê a empresa dele no banco e exige `tem_permissao('administrar',
-- <empresa do vínculo>)` — a MESMA ação da rota (`ACAO_CONFERENCIA`, decisão
-- D1). Receber a empresa deixaria qualquer pessoa gastar a espera de outra
-- empresa (ou reservar em nome dela).
--
-- ⚠️ **AS MESMAS PRÉ-CONDIÇÕES DA ROTA, conferidas de novo NO BANCO:** o
-- vínculo VIVO (`excluido_em is null`), ATIVO e COM o código do extrato (EC
-- maior que zero). A rota recusa os dois últimos com 409 antes de reservar —
-- mas a função é executável por `authenticated` pelo PostgREST, e sem elas uma
-- chamada direta carimbaria a espera da empresa com uma maquininha que nunca
-- chegaria à Pinbank (e a maquininha desativada entre a leitura da rota e a
-- reserva passaria).
--
-- ⚠️ **CONFERIR E CARIMBAR É UM PASSO SÓ.** `insert … on conflict (org_id) do
-- update … where ultima_em <= now() - espera`: com duas chamadas ao mesmo
-- tempo, a segunda espera a trava da linha e reavalia a condição sobre a linha
-- que a primeira acabou de gravar — só uma passa. Ler e depois gravar, em dois
-- passos, deixaria as duas passarem.
--
-- ⚠️ **A RECUSA NÃO CARIMBA.** Quem insiste antes do prazo não empurra o prazo:
-- ele conta da última chamada que SAIU. E a chamada que falha depois CONTA —
-- ela já saiu com a credencial da plataforma (a reserva é o último passo antes
-- da Pinbank).
--
-- ⚠️ **60 SEGUNDOS, o MESMO valor de `ESPERA_CONFERENCIA_MS`** (a espera do
-- botão depois de uma conferência; na recusa, o 429 leva o `restante_ms` que
-- este banco calculou, e o botão espera ESSE tempo — nunca mais que a regra).
-- A guarda (`engine-audit`, bloco `conferencia-pinbank:`) prova que os dois
-- números batem — trocar um sem o outro reprova.
--
-- ⚠️ **A TABELA NÃO TEM POLÍTICA nem concessão** a anon, authenticated ou
-- service_role: só a função (SECURITY DEFINER) lê e escreve. É o desenho das
-- tabelas só-DEFINER — "RLS ligada sem política" não é achado (ONDA 9).
--
-- ⚠️ **ELA TEM TRILHA** (`zz_auditar_pinbank_conferencia_limite`): cada
-- reserva que passa vira um evento em `audit_log` com quem e quando — e qual
-- maquininha na primeira reserva da empresa e sempre que ela muda (a trilha
-- guarda só o que MUDOU: a reserva repetida da mesma maquininha traz só o novo
-- `ultima_em`). A recusa não grava nada (não muda a linha), então não vira
-- evento.
--
-- ⚠️ **O EVENTO PROVA A RESERVA, NÃO A CHAMADA À PINBANK.** A rota chama a
-- Pinbank logo depois de reservar — mas uma chamada direta a esta função
-- (quem administra a empresa pode fazê-la pelo PostgREST) também reserva, sem
-- Pinbank nenhuma. E a trilha não é prova de autoria: a política de
-- `audit_log` deixa qualquer membro da empresa INSERIR um evento com o
-- `usuario` que quiser (append-only, anterior a esta migration — fechar isso é
-- decisão à parte). O rastro de QUEM CHAMOU a Pinbank com a credencial da
-- plataforma é o registro por chamada no log do SERVIDOR (a rota), que a
-- empresa não escreve.
--
-- ⚠️ **MUDA QUEM PODE CHAMAR O QUÊ** (declarado, para o dono decidir): a RPC
-- nova é executável por `authenticated` e recusa quem não ADMINISTRA a empresa
-- do vínculo. A rota passa a FALHAR FECHADA (503) se a função não existir —
-- então o código no ar antes desta migration recusa toda conferência com
-- "limite_indisponivel" (o interruptor `PINBANK_CONFERENCIA` está desligado,
-- e continua até D2).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A ÚLTIMA CONFERÊNCIA DE CADA EMPRESA
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.pinbank_conferencia_limite (
  org_id uuid not null primary key references public.organizations(id) on delete cascade,
  -- A última chamada que SAIU para a Pinbank (a recusa não a move).
  ultima_em timestamptz not null,
  -- Quem pediu e de qual maquininha — o rastro, junto com a trilha.
  por uuid not null,
  vinculo_id uuid references public.pinbank_vinculos(id) on delete set null
);
alter table public.pinbank_conferencia_limite enable row level security;

comment on table public.pinbank_conferencia_limite is
  'A última conferência extrato × sistema de cada empresa (a espera de 60 s entre duas chamadas à Pinbank). Só pinbank_conferencia_reservar() lê e escreve; sem política e sem concessão.';

revoke all on public.pinbank_conferencia_limite from public, anon, authenticated, service_role;

drop trigger if exists zz_auditar_pinbank_conferencia_limite on public.pinbank_conferencia_limite;
create trigger zz_auditar_pinbank_conferencia_limite
  after insert or update or delete on public.pinbank_conferencia_limite
  for each row execute function public.auditar_escrita();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. CONFERIR E CARIMBAR — numa instrução
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.pinbank_conferencia_reservar(p_vinculo uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  -- ⚠️ O MESMO valor de ESPERA_CONFERENCIA_MS (src/core/pinbank/conferencia-portoes.ts).
  v_espera constant interval := interval '60 seconds';
  v_uid uuid := auth.uid();
  v_org uuid;
  v_ultima timestamptz;
  v_restante bigint;
begin
  if v_uid is not null then
    -- As pré-condições da rota, de novo, no instante da reserva: vivo, ativo e com o EC.
    select v.org_id into v_org
      from public.pinbank_vinculos v
     where v.id = p_vinculo and v.excluido_em is null and v.ativo and v.codigo_cliente > 0;
  end if;
  -- Uma recusa só para "sem sessão", "vínculo que não existe / foi excluído /
  -- está inativo / não tem o EC" e "não administra a empresa do vínculo": a
  -- resposta não diz se o id existe.
  if v_uid is null or v_org is null or not public.tem_permissao('administrar', v_org) then
    raise exception 'A4P-PINBANK-LIMITE: só quem administra a empresa de uma maquininha ativa e com o código do extrato confere com o extrato da Pinbank.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.pinbank_conferencia_limite as l (org_id, ultima_em, por, vinculo_id)
  values (v_org, now(), v_uid, p_vinculo)
  on conflict (org_id) do update
     set ultima_em = excluded.ultima_em, por = excluded.por, vinculo_id = excluded.vinculo_id
   where l.ultima_em <= excluded.ultima_em - v_espera
  returning l.ultima_em into v_ultima;

  if v_ultima is not null then
    return jsonb_build_object('ok', true);
  end if;

  -- Recusada: a linha NÃO mudou. Quanto falta, contado da última que saiu.
  select l.ultima_em into v_ultima from public.pinbank_conferencia_limite l where l.org_id = v_org;
  v_restante := ceil(extract(epoch from (v_ultima + v_espera - now())) * 1000)::bigint;
  -- Relógio que andou para trás não vira espera maior que a regra (nem zero).
  return jsonb_build_object('ok', false,
    'restante_ms', least((extract(epoch from v_espera) * 1000)::bigint, greatest(1, v_restante)));
end;
$$;

comment on function public.pinbank_conferencia_reservar(uuid) is
  'Confere e carimba, numa instrução, a espera de 60 s entre duas conferências da MESMA empresa (a do vínculo vivo, ativo e com o EC). Exige administrar a empresa do vínculo. A recusa não carimba.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. QUEM CHAMA
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ Nem service_role: a chave de serviço não tem sessão (auth.uid() nulo) e
-- seria recusada de qualquer jeito — a concessão só a authenticated diz isso.
revoke all on function public.pinbank_conferencia_reservar(uuid) from public, anon, service_role;
grant execute on function public.pinbank_conferencia_reservar(uuid) to authenticated;
