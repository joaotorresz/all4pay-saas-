-- ═══════════════════════════════════════════════════════════════════════════
-- O LEITOR DORMENTE — `situacao` gravada × derivada do `status`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **O achado que motivou esta guarda.** `core/central.situacaoDe` faz:
--
--     if (m.situacao) return m.situacao;   // usa a COLUNA se ela vier
--     ...senão deriva de `status`
--
-- e `CentralView` a consome. Hoje `getRiscoInput` NÃO seleciona `situacao`, então
-- a coluna nunca chega ao app e a derivação sempre vence. Medido em 21/08: as
-- duas concordam em 530 de 530 lançamentos da organização auditada.
--
-- O risco é o dia em que alguém acrescentar `situacao` ao `select`: a Central
-- muda de comportamento **sem ninguém pedir**, e a mudança só aparece no primeiro
-- título em que as duas divergirem. Esta guarda faz a divergência aparecer ANTES
-- do usuário.
--
-- ⚠️ **POR QUE ELA NÃO É "QUALQUER DIVERGÊNCIA", que foi o pedido literal.**
-- A coluna tem SEIS estados (previsto·confirmado·baixado·conciliado·cancelado·
-- estornado) e a derivação produz TRÊS (baixado·cancelado·previsto). Um título
-- que a máquina moveu para `confirmado` diverge do derivado **por construção** —
-- é a Central funcionando. Uma guarda que reprovasse isso reprovaria o
-- comportamento correto, e guarda que reprova o certo é desligada na primeira
-- semana.
--
-- Então ela cobra só o que é INCOERENTE: quando a situação gravada é um dos três
-- estados DERIVÁVEIS e mesmo assim discorda do `status`. Aí não há máquina de
-- estados explicando — há dois campos contando histórias diferentes sobre o
-- mesmo título.
\set ON_ERROR_STOP on

do $$
declare
  n_incoerente int;
  exemplo text;
begin
  select count(*), min(format('%s: status=%s situacao=%s', id, status, situacao))
    into n_incoerente, exemplo
  from public.movements
  where situacao in ('previsto','baixado','cancelado')
    and situacao is distinct from (case
      when status = 'pago' then 'baixado'
      when status = 'cancelado' then 'cancelado'
      else 'previsto' end);

  if n_incoerente > 0 then
    raise exception
      'situacao: % lançamento(s) com situação DERIVÁVEL incoerente com o status. Exemplo → %',
      n_incoerente, exemplo
      using hint = 'A coluna e o status contam histórias diferentes sobre o mesmo título. '
                   'Enquanto `situacaoDe` preferir a coluna, ligar `situacao` no select muda '
                   'a Central em silêncio — conserte a linha antes de ligar.';
  end if;

  raise notice 'situacao: nenhuma incoerência entre a coluna e o status derivável';
end $$;

-- ⚠️ **O OUTRO LADO: a guarda tem de estar OLHANDO alguma coisa** — uma
-- verificação que roda sobre o vazio fica verde provando nada.
--
-- ⚠️ **Mas "vazio" tem DOIS significados, e a primeira versão desta asserção
-- confundiu os dois — reprovando o certo no primeiro CI.** Ela exigia que
-- houvesse linha com `situacao` preenchida, e o job `isolamento` roda contra um
-- Supabase EFÊMERO montado do zero pelas migrations, onde `movements` está
-- legitimamente vazia. Reprovar ali é reprovar um banco recém-criado por estar
-- recém-criado, e guarda que reprova o correto é desligada na primeira semana.
--
-- A distinção que importa:
--   • `movements` VAZIA           → banco novo. Não há incoerência possível.
--   • linhas SEM `situacao`       → cegueira REAL: a coluna sumiu ou o backfill
--                                   não rodou, e a verificação acima passou por
--                                   não ter o que comparar.
do $$
declare n_total bigint; n_com bigint;
begin
  select count(*), count(situacao) into n_total, n_com from public.movements;

  if n_total = 0 then
    raise notice 'situacao: base sem lançamentos (banco novo) — nada a conferir, e isso é legítimo';
    return;
  end if;

  if n_com = 0 then
    raise exception
      'situacao: % lançamento(s) e NENHUM com situação — a coluna sumiu ou o backfill não rodou', n_total
      using hint = 'A verificação de coerência acima passou por não ter o que comparar. Isto é cegueira, não aprovação.';
  end if;

  raise notice 'situacao: % de % lançamento(s) conferidos', n_com, n_total;
end $$;
