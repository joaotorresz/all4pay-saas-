-- ═══════════════════════════════════════════════════════════════════════════
-- O PIX OU BOLETO DO LINK FOI PAGO: A COBRANÇA VIRA PAGA E O TÍTULO, RECEBIDO
-- (04/11/2026, pedido do dono: "após o pagamento atualiza a tela do link como
-- pago e atualiza no sistema como recebido")
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Etapa 6 de `docs/rodada-10/cobranca.md`. Esta migration põe de pé o
-- ESCRITOR ÚNICO da liquidação: quem souber que o banco recebeu (o aviso da
-- Pinbank, quando ela disser o formato; uma consulta, depois) chama UMA função,
-- e é ela que decide o que acontece com a cobrança e com o título.
--
--   1. `pinbank_cobrancas` ganha o que o banco disse do pagamento: valor
--      recebido, quando, por qual caminho e a referência do aviso (única: o
--      mesmo aviso duas vezes é UMA liquidação);
--   2. `pinbank_cobranca_liquidar` (só `service_role`): a cobrança vira `paga`
--      e o título a receber vai a `baixado`, com a data do PAGAMENTO no caixa;
--   3. a máquina de estados (`central_maquina`) ganha UMA transição nomeada:
--      a confirmação "pago pelo banco", na trilha com o motivo;
--   4. a leitura pública do link (`pinbank_checkout_ler`) diz "pago" assim que
--      a cobrança é paga — mesmo quando o título não pôde ser baixado.
--
-- ⚠️ **MUDA QUEM PODE BAIXAR** (declarado, para o dono decidir): até aqui só
-- uma PESSOA confirmava um título previsto (segregação, papel `aprovar` e
-- alçada). Na liquidação pelo banco, o SERVIDOR confirma e baixa sem pessoa.
-- O motivo: o dinheiro já está na conta, e é o banco quem diz — a alçada
-- protege a decisão de PAGAR ou de RECONHECER uma receita duvidosa, não a de
-- registrar um Pix que entrou. A porta é estreita de propósito:
--   · só título a RECEBER (`entrada`), ainda previsto ou confirmado;
--   · só sem sessão de pessoa (`auth.uid()` nulo) E com a marca local à
--     transação que só esta função grava, apontando para ESTE título;
--   · a transição vai à trilha (`central_transicoes`) com o motivo, e o
--     `audit_log` recebe a liquidação.
--
-- ⚠️ **A COBRANÇA PAGA É FATO; O TÍTULO SÓ BAIXA QUANDO A CONTA FECHA.** O
-- dinheiro entrou: a cobrança vira `paga` sempre. O título NÃO é baixado (e a
-- resposta diz por quê) quando:
--   · ele foi cancelado, estornado ou excluído (estado terminal não volta);
--   · a cobrança paga estava `a_cancelar` porque o título MUDOU (o cliente
--     pagou o valor velho; dar baixa pelo novo seria inventar);
--   · o valor recebido é menor que o da cobrança.
-- Nesses casos a empresa confere e resolve à mão. Título JÁ recebido (baixa à
-- mão antes do aviso, ou o cliente pagou Pix E boleto) fica como está, e a
-- resposta marca o pagamento em dobro para devolver.
--
-- ⚠️ **A OUTRA FORMA DE PAGAMENTO FICA A CANCELAR.** Pago o Pix, o boleto do
-- mesmo título ainda é pagável no banco. O gatilho que já existe
-- (`pinbank_cobranca_titulo_mudou`) o leva a `a_cancelar` na baixa; aqui só o
-- motivo passa a dizer a verdade ("pago por Pix", não "o título mudou").
--
-- ⚠️ O valor do título não muda: a multa e os juros recebidos (Pix do dia)
-- ficam em `valor_recebido` da cobrança. Lançá-los como receita financeira é
-- passo seguinte, de propósito fora daqui.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O QUE O BANCO DISSE DO PAGAMENTO
-- ───────────────────────────────────────────────────────────────────────────
alter table public.pinbank_cobrancas add column if not exists valor_recebido numeric(14,2);
alter table public.pinbank_cobrancas add column if not exists pago_em timestamptz;
alter table public.pinbank_cobrancas add column if not exists liquidada_por text;
alter table public.pinbank_cobrancas add column if not exists liquidacao_ref text;

alter table public.pinbank_cobrancas drop constraint if exists pinbank_cobranca_valor_recebido_positivo;
alter table public.pinbank_cobrancas add constraint pinbank_cobranca_valor_recebido_positivo
  check (valor_recebido is null or valor_recebido > 0);
alter table public.pinbank_cobrancas drop constraint if exists pinbank_cobranca_liquidada_por_valida;
alter table public.pinbank_cobrancas add constraint pinbank_cobranca_liquidada_por_valida
  check (liquidada_por is null or liquidada_por in ('aviso_do_banco', 'consulta'));
alter table public.pinbank_cobrancas drop constraint if exists pinbank_cobranca_liquidacao_ref_curta;
alter table public.pinbank_cobrancas add constraint pinbank_cobranca_liquidacao_ref_curta
  check (liquidacao_ref is null or length(liquidacao_ref) between 1 and 200);
-- ⚠️ Paga sem valor, sem data ou sem caminho é uma baixa que ninguém consegue
-- conferir. Nada escreveu `paga` nesta tabela antes desta migration (o
-- registrador só aceitava emitida/falhou/incerta), então a restrição valida.
alter table public.pinbank_cobrancas drop constraint if exists pinbank_cobranca_paga_tem_dado;
alter table public.pinbank_cobrancas add constraint pinbank_cobranca_paga_tem_dado
  check (situacao <> 'paga' or (valor_recebido is not null and pago_em is not null and liquidada_por is not null));

-- O mesmo aviso não liquida duas cobranças.
create unique index if not exists pinbank_cobrancas_liquidacao_ref_unica
  on public.pinbank_cobrancas (liquidacao_ref) where liquidacao_ref is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A MÁQUINA DE ESTADOS GANHA A CONFIRMAÇÃO "PAGO PELO BANCO"
-- ───────────────────────────────────────────────────────────────────────────
-- Cópia da versão de 20260825200000 (a vigente), com UM ramo novo no confirmar
-- e o `por` da trilha com a pessoa que emitiu a cobrança quando não há sessão.
create or replace function public.central_maquina()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_papel text;
  v_teto numeric;
  v_outro_aprovador boolean := false;
  v_autoaprovacao boolean := false;
  v_motivo text;
  v_pelo_banco boolean := false;
begin
  if new.situacao is not distinct from old.situacao then
    return new;
  end if;

  if not public.central_transicao_valida(old.situacao, new.situacao) then
    raise exception 'A4P-CENTRAL: transição % → % não é permitida (máquina de estados)',
      old.situacao, new.situacao
      using hint = 'Um título previsto precisa ser CONFIRMADO antes de ser baixado.';
  end if;

  -- ⚠️ A liquidação pelo banco: SEM sessão de pessoa, com a marca que só
  -- `pinbank_cobranca_liquidar` grava (local à transação) apontando para ESTE
  -- título, e só a receber. Uma sessão logada nunca entra aqui, mesmo que
  -- conseguisse gravar a marca: `auth.uid()` não é nulo para ela.
  v_pelo_banco := auth.uid() is null
    and new.type = 'entrada'
    and coalesce(current_setting('a4p.liquidacao_titulo', true), '') = new.id::text;

  if old.situacao = 'previsto' and new.situacao = 'confirmado' then
    if v_pelo_banco then
      v_motivo := 'pago pelo banco: ' || coalesce(nullif(current_setting('a4p.liquidacao_motivo', true), ''), 'cobrança liquidada');
      new.confirmado_por := null;
      new.confirmado_em := now();
    else
      if new.lancado_por is not null and new.lancado_por = auth.uid() then
        select exists (
          select 1
            from public.organization_members om
            join public.role_permissions rp
              on rp.papel = om.role and rp.acao = 'aprovar'
           where om.org_id = new.org_id
             and om.user_id is distinct from auth.uid()
        ) into v_outro_aprovador;

        if v_outro_aprovador then
          raise exception 'A4P-CENTRAL-SEGREGACAO: quem lançou não pode confirmar o próprio título'
            using hint = 'Outra pessoa precisa confirmar este lançamento.';
        end if;

        v_autoaprovacao := true;
        v_motivo := 'org com um único membro habilitado a aprovar';
      end if;

      select role into v_papel from public.organization_members
        where user_id = auth.uid() and org_id = new.org_id limit 1;

      if not public.tem_permissao('aprovar', new.org_id) then
        raise exception 'A4P-CENTRAL-PERMISSAO: o papel % não pode confirmar títulos', coalesce(v_papel, 'sem papel')
          using hint = 'Peça a um Aprovador, Administrador ou Titular. Isto se resolve mudando o PAPEL, não a alçada.';
      end if;

      if not public.central_cabe_na_alcada(coalesce(v_papel, 'leitor'), new.amount, new.org_id) then
        v_teto := public.central_teto(coalesce(v_papel, 'leitor'), new.org_id);
        raise exception 'A4P-CENTRAL-ALCADA: valor % acima da alçada do papel % (teto %)',
          new.amount, coalesce(v_papel, 'sem papel'), v_teto
          using hint = 'Um papel com alçada maior precisa confirmar, ou a alçada deste papel pode ser aumentada nas configurações.';
      end if;

      new.confirmado_por := auth.uid();
      new.confirmado_em := now();
    end if;
  end if;

  -- BAIXAR carimba quem baixou, quando baixou, e A DATA EM QUE O DINHEIRO SE
  -- MOVEU — que é a que o fluxo de caixa lê.
  if new.situacao = 'baixado' then
    new.baixado_por := coalesce(new.baixado_por, auth.uid());
    new.baixado_em  := coalesce(new.baixado_em, now());
    new.paid_date   := coalesce(new.paid_date, (now() at time zone 'America/Sao_Paulo')::date);
    if v_pelo_banco then
      v_motivo := 'pago pelo banco: ' || coalesce(nullif(current_setting('a4p.liquidacao_motivo', true), ''), 'cobrança liquidada');
    end if;
  end if;

  -- ⚠️ `conciliado` também é dinheiro que se moveu. Ele só é alcançável a
  -- partir de `baixado`, então na prática a data já veio — mas depender disso
  -- é depender da ordem, e a ordem muda.
  if new.situacao = 'conciliado' then
    new.paid_date := coalesce(new.paid_date, (now() at time zone 'America/Sao_Paulo')::date);
  end if;

  -- ⚠️ Sem sessão, o `por` da trilha é quem EMITIU a cobrança (a marca), e só
  -- depois quem lançou: `por` não aceita nulo, e a liquidação não pode cair
  -- por um título importado sem `lancado_por`.
  insert into public.central_transicoes (org_id, movement_id, de, para, por, autoaprovacao, motivo)
  values (new.org_id, new.id, old.situacao, new.situacao,
          coalesce(auth.uid(),
                   case when v_pelo_banco then nullif(current_setting('a4p.liquidacao_por', true), '')::uuid end,
                   new.lancado_por),
          v_autoaprovacao, v_motivo);

  return new;
end $function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. O ESCRITOR ÚNICO DA LIQUIDAÇÃO
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.pinbank_cobranca_liquidar(
  p_cobranca uuid,
  p_valor numeric,
  p_pago_em timestamptz,
  p_origem text,
  p_ref text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  c public.pinbank_cobrancas%rowtype;
  m public.movements%rowtype;
  v_ref text := nullif(btrim(coalesce(p_ref, '')), '');
  v_forma text;
  v_titulo text;
  v_motivo text;
  v_dobro boolean := false;
  v_erro text;
begin
  if p_origem is null or p_origem not in ('aviso_do_banco', 'consulta') then
    raise exception 'A4P-LIQUIDACAO: caminho de liquidação inválido (%).', coalesce(p_origem, 'vazio') using errcode = 'invalid_parameter_value';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'A4P-LIQUIDACAO: o valor recebido precisa ser maior que zero.' using errcode = 'invalid_parameter_value';
  end if;
  if p_pago_em is null then
    raise exception 'A4P-LIQUIDACAO: falta a data do pagamento.' using errcode = 'invalid_parameter_value';
  end if;
  if v_ref is null or length(v_ref) > 200 then
    raise exception 'A4P-LIQUIDACAO: falta a referência do aviso (até 200 letras).' using errcode = 'invalid_parameter_value';
  end if;

  select * into c from public.pinbank_cobrancas where id = p_cobranca for update;
  if not found then
    raise exception 'A4P-LIQUIDACAO: cobrança não encontrada.' using errcode = 'no_data_found';
  end if;
  v_forma := case c.tipo when 'pix' then 'Pix' else 'boleto' end;

  -- O MESMO aviso de novo: nada muda, a resposta é a mesma.
  if c.situacao = 'paga' then
    if c.liquidacao_ref is distinct from v_ref then
      raise exception 'A4P-LIQUIDACAO: esta cobrança já foi liquidada por outro aviso; nada foi gravado.' using errcode = 'check_violation';
    end if;
    select situacao into v_titulo from public.movements where id = c.movement_id;
    return jsonb_build_object('cobranca', 'paga', 'duplicado', true, 'titulo', v_titulo);
  end if;
  if exists (select 1 from public.pinbank_cobrancas where liquidacao_ref = v_ref and id <> c.id) then
    raise exception 'A4P-LIQUIDACAO: este aviso já liquidou outra cobrança; nada foi gravado.' using errcode = 'check_violation';
  end if;
  -- Reservada e falhou nunca chegaram ao banco; cancelada não recebe.
  if c.situacao not in ('emitida', 'incerta', 'a_cancelar') then
    raise exception 'A4P-LIQUIDACAO: a cobrança está "%" e não pode ter sido paga.', c.situacao using errcode = 'check_violation';
  end if;

  select * into m from public.movements where id = c.movement_id for update;
  -- Pago o Pix E o boleto, ou baixado à mão antes do aviso.
  v_dobro := exists (select 1 from public.pinbank_cobrancas
                      where movement_id = c.movement_id and id <> c.id and situacao = 'paga');

  -- O FATO: o dinheiro entrou. Antes do título, para o gatilho que leva as
  -- outras cobranças a `a_cancelar` não alcançar esta.
  update public.pinbank_cobrancas set
    situacao = 'paga',
    valor_recebido = round(p_valor, 2),
    pago_em = p_pago_em,
    liquidada_por = p_origem,
    liquidacao_ref = v_ref,
    motivo = null,
    atualizado_em = now()
  where id = c.id;

  if m.situacao in ('baixado', 'conciliado') then
    v_titulo := 'ja_recebido';
    v_motivo := case when v_dobro
      then 'O título já tinha sido pago por outra cobrança: o cliente pagou duas vezes e o valor precisa ser devolvido.'
      else 'O título já estava recebido: confira se a baixa à mão foi deste mesmo pagamento.' end;
  elsif m.excluido_em is not null or m.situacao not in ('previsto', 'confirmado') then
    v_titulo := 'nao_baixado';
    v_motivo := 'O título foi cancelado ou excluído antes do pagamento: o valor entrou e precisa ser devolvido ou relançado.';
  elsif m.type <> 'entrada' then
    v_titulo := 'nao_baixado';
    v_motivo := 'O título não é a receber.';
  elsif c.situacao = 'a_cancelar' then
    v_titulo := 'nao_baixado';
    v_motivo := 'O título mudou depois da emissão e o cliente pagou a cobrança antiga: confira o valor e dê a baixa à mão.';
  elsif round(p_valor, 2) < c.valor then
    v_titulo := 'nao_baixado';
    v_motivo := 'O valor recebido é menor que o da cobrança: confira e dê a baixa à mão.';
  else
    begin
      perform set_config('a4p.liquidacao_titulo', m.id::text, true);
      perform set_config('a4p.liquidacao_por', c.criado_por::text, true);
      perform set_config('a4p.liquidacao_motivo', v_forma || ' da cobrança ' || c.nsu_origem::text, true);
      if m.situacao = 'previsto' then
        update public.movements set situacao = 'confirmado' where id = m.id;
      end if;
      update public.movements
         set situacao = 'baixado',
             paid_date = (p_pago_em at time zone 'America/Sao_Paulo')::date
       where id = m.id;
      v_titulo := 'recebido';
    exception when others then
      v_titulo := 'nao_baixado';
      v_erro := sqlerrm;
      v_motivo := 'O banco recusou a baixa do título: ' || left(sqlerrm, 300);
    end;
    perform set_config('a4p.liquidacao_titulo', '', true);
    perform set_config('a4p.liquidacao_por', '', true);
    perform set_config('a4p.liquidacao_motivo', '', true);
  end if;

  if v_titulo = 'recebido' then
    -- A outra forma (o boleto, se pagou o Pix) foi a `a_cancelar` pelo gatilho
    -- da baixa; o motivo diz o que de fato aconteceu.
    update public.pinbank_cobrancas
       set motivo = 'O título foi pago por ' || v_forma || '; esta cobrança precisa ser cancelada na Pinbank.',
           atualizado_em = now()
     where movement_id = c.movement_id and id <> c.id and situacao = 'a_cancelar';
  else
    update public.pinbank_cobrancas set motivo = left(v_motivo, 500) where id = c.id;
  end if;

  insert into public.audit_log (org_id, usuario, acao, entidade, entidade_id, origem, antes, depois)
  values (c.org_id, coalesce(c.criado_por::text, 'servidor'), 'pinbank_cobranca.liquidar', 'pinbank_cobrancas', c.id::text, p_origem,
          jsonb_build_object('cobranca', c.situacao, 'titulo', m.situacao),
          jsonb_build_object('cobranca', 'paga', 'titulo', v_titulo, 'movimento', m.id, 'valor', round(p_valor, 2),
                             'pago_em', p_pago_em, 'ref', v_ref, 'motivo', v_motivo));

  return jsonb_build_object('cobranca', 'paga', 'duplicado', false, 'titulo', v_titulo, 'motivo', v_motivo, 'dobro', v_dobro);
end;
$$;

revoke all on function public.pinbank_cobranca_liquidar(uuid, numeric, timestamptz, text, text) from public, anon, authenticated, service_role;
grant execute on function public.pinbank_cobranca_liquidar(uuid, numeric, timestamptz, text, text) to service_role;

comment on function public.pinbank_cobranca_liquidar(uuid, numeric, timestamptz, text, text) is
  'O escritor único da liquidação do Pix/boleto do link: a cobrança vira paga (fato) e o título a receber vai a baixado pela transição "pago pelo banco" da central_maquina, salvo título cancelado, mudado, já recebido ou valor menor. Idempotente pela referência do aviso. Só service_role.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. A LEITURA DO LINK: PAGA A COBRANÇA, A PÁGINA DIZ "PAGO"
-- ───────────────────────────────────────────────────────────────────────────
-- Cópia da versão de 20261031140000 (a vigente), com o "pago" também quando
-- uma cobrança do título está paga: quem pagou não pode ver "indisponível" só
-- porque a empresa cancelou o título no meio do caminho.
create or replace function public.pinbank_checkout_ler(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  l public.pinbank_checkout_links%rowtype;
  m public.movements%rowtype;
  v_empresa text;
  v_sit text;
  v_cobrancas jsonb;
  v_db jsonb;
  v_credor jsonb;
  v_comprador text;
  k text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into l from public.pinbank_checkout_links where token = p_token and revogado_em is null;
  if not found then
    return null;
  end if;
  select * into m from public.movements where id = l.movement_id;
  select name into v_empresa from public.organizations where id = l.org_id;

  v_sit := case
    when m.situacao in ('baixado','conciliado') then 'pago'
    when exists (select 1 from public.pinbank_cobrancas c where c.movement_id = m.id and c.situacao = 'paga') then 'pago'
    when m.excluido_em is not null or m.situacao not in ('previsto','confirmado') then 'indisponivel'
    else 'aberto'
  end;

  if v_sit = 'aberto' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'tipo', c.tipo,
             'valor', c.valor,
             'vencimento', c.vencimento,
             'textoQrCode', c.texto_qrcode,
             'linhaDigitavel', c.linha_digitavel,
             'encargos', c.encargos,
             'diaReferencia', c.dia_referencia
           ) order by c.tipo desc, c.dia_referencia nulls first), '[]'::jsonb)
      into v_cobrancas
      from public.pinbank_cobrancas c
     where c.movement_id = m.id and c.situacao = 'emitida'
       -- O Pix do dia só no dia dele: o de ontem não aceita mais pagamento.
       and (c.dia_referencia is null or c.dia_referencia = (now() at time zone 'America/Sao_Paulo')::date);
    if v_cobrancas = '[]'::jsonb then
      v_sit := 'indisponivel';
    end if;
  end if;

  -- A empresa que cobra: só as chaves permitidas do cadastro, texto curto.
  select cp.profile -> 'db' into v_db from public.company_profiles cp where cp.org_id = l.org_id limit 1;
  v_credor := '{}'::jsonb;
  if jsonb_typeof(v_db) = 'object' then
    foreach k in array array['fantasia','razaoSocial','cnpj','cpf','email','telefone','whatsapp','ddi',
                             'rua','numero','complemento','bairro','cidade','estado','cep'] loop
      if jsonb_typeof(v_db -> k) in ('string','number') and btrim(v_db ->> k) <> '' then
        v_credor := v_credor || jsonb_build_object(k, left(btrim(v_db ->> k), 120));
      end if;
    end loop;
  end if;

  if v_sit = 'aberto' and m.party_id is not null then
    select left(btrim(p.name), 120) into v_comprador from public.parties p where p.id = m.party_id and p.org_id = l.org_id;
  end if;

  return jsonb_build_object(
    'situacao', v_sit,
    'empresa', v_empresa,
    'credor', v_credor,
    'comprador', case when v_sit = 'aberto' and coalesce(v_comprador, '') <> '' then jsonb_build_object('nome', v_comprador) end,
    'descricao', case when v_sit = 'aberto' then left(m.description, 120) end,
    'valor', m.amount,
    'vencimento', m.due_date,
    'cobrancas', case when v_sit = 'aberto' then v_cobrancas else '[]'::jsonb end
  );
end;
$$;
revoke all on function public.pinbank_checkout_ler(text) from public, anon, authenticated, service_role;
grant execute on function public.pinbank_checkout_ler(text) to service_role;
