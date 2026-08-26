-- ═══════════════════════════════════════════════════════════════════════════
-- A TRAVA DE "TRANSCRIÇÃO NÃO É FATO" CONTINUA NO BANCO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ A guarda de código (`npm run transcricao`) prova que nenhum ESCRITOR do
-- repositório deixa o palpite nascer confirmado. Esta prova que o BANCO recusa —
-- e é a metade que alcança o que ainda não foi escrito: uma RPC nova, um cron,
-- um `psql` na mão. Manter só a varredura ensinaria que o `grep` é a proteção.
--
-- Quatro asserções, e a última é a que dá sentido às outras três: a fila TEM de
-- conseguir promover. Uma trava que impedisse a promoção trancaria a porta que
-- a regra inteira depende — quem transforma suspeita em fato é uma pessoa.
begin;

do $guarda$
declare msg text; est text;
begin
  ------------------------------------------------ 1. o default NÃO existe --
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'movements'
       and column_name = 'review_status' and column_default is not null
  ) then
    raise exception 'TRANSCRIÇÃO: `movements.review_status` VOLTOU a ter default — a decisão de confiança está escondida na coluna de novo.';
  end if;

  --------------------------------- 2. quem não diz é RECUSADO pelo banco --
  begin
    insert into public.movements (org_id, type, amount, due_date, origem, especie)
    values (gen_random_uuid(), 'saida', 1, current_date, 'manual', 'titulo');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null then
    raise exception 'TRANSCRIÇÃO: um insert SEM `review_status` passou — o banco deixou de exigir a resposta.';
  end if;

  ------------------------ 3. origem que ADIVINHA não nasce confirmada --
  msg := null;
  begin
    insert into public.movements (org_id, type, amount, due_date, origem, especie, review_status)
    values (gen_random_uuid(), 'saida', 1, current_date, 'importacao', 'titulo', 'confirmado');
  exception when others then msg := SQLERRM; est := SQLSTATE;
  end;
  if msg is null then
    raise exception 'TRANSCRIÇÃO: um lançamento de OCR NASCEU CONFIRMADO — o gatilho sumiu.';
  end if;
  /*
   * ⚠️ Vermelho pelo motivo errado é pior que guarda nenhuma: sem esta linha, a
   * recusa poderia vir de uma chave estrangeira (o `org_id` inventado acima) e
   * a guarda registraria sucesso sobre a asserção que nem chegou a rodar.
   */
  if msg not like '%não pode nascer confirmado%' then
    raise exception 'TRANSCRIÇÃO — VERMELHO PELO MOTIVO ERRADO: esperava a recusa da transcrição, veio "%" (%)', msg, est;
  end if;

  raise notice 'transcrição: sem default · quem não diz é recusado · OCR não nasce confirmado (% )', est;
end
$guarda$;

/*
 * ⚠️ **A PORTA QUE A REGRA DEPENDE.** Num banco recém-criado não há linha para
 * promover, e afirmar sobre o vazio seria verde provando nada — então a
 * asserção CRIA a linha pelo caminho legítimo (pendente) e só então promove.
 */
do $promocao$
declare o uuid; c uuid; t uuid; depois text;
begin
  select om.org_id into o from public.organization_members om limit 1;
  if o is null then
    raise notice 'transcrição: banco sem organização — a promoção não pôde ser exercitada';
    return;
  end if;
  select id into c from public.financial_accounts where org_id = o limit 1;
  insert into public.movements (org_id, account_id, type, amount, due_date, origem, especie, review_status, situacao)
  values (o, c, 'saida', 1, current_date, 'importacao', 'titulo', 'pendente', 'previsto')
  returning id into t;

  update public.movements set review_status = 'confirmado' where id = t;
  select review_status into depois from public.movements where id = t;
  if depois is distinct from 'confirmado' then
    raise exception 'TRANSCRIÇÃO: a FILA não consegue promover — a trava fechou a porta que a regra depende.';
  end if;
  raise notice 'transcrição: a fila promove pendente -> confirmado por UPDATE';
end
$promocao$;

rollback;
