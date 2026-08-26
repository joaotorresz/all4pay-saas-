-- ═══════════════════════════════════════════════════════════════════════════
-- TRANSCRIÇÃO NÃO É FATO — o DEFAULT que decidia confiança sai do banco
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **`movements.review_status` tinha `DEFAULT 'confirmado'`**, e o caminho do
-- OCR (`lib/upload-doc.ts`) gravava sem defini-lo. O efeito: uma foto ruim
-- virava lançamento CONFIRMADO, sem passar pela fila de revisão e sem nenhuma
-- marca de baixa confiança — dentro do DRE de um cliente.
--
-- É a mesma família de "inventar procedência" (a Central afirmando
-- `origem: importação` sobre uma coluna nula) e de "inventar autoria"
-- (`lancado_por` preenchido por palpite). Aqui é pior: o palpite entra como
-- dinheiro.
--
-- ⚠️ **DEFAULT QUE DECIDE CONFIANÇA É DECISÃO ESCONDIDA NUMA COLUNA.** Quem
-- escreve a linha sabe se produziu uma AFIRMAÇÃO (uma pessoa digitou, uma venda
-- gerou) ou um PALPITE (OCR, parser de extrato). O default tirava essa pergunta
-- de quem tinha a resposta e a respondia sozinho, sempre com a opção mais
-- otimista.
--
-- Duas travas, e elas são diferentes:
--
--   1. **O DEFAULT SAI.** Com `not null` e sem default, o Postgres RECUSA a
--      linha que não disser. Um escritor esquecido falha ALTO, na hora, em vez
--      de herdar `confirmado` em silêncio — que é como este defeito nasceu.
--   2. **ORIGEM QUE ADIVINHA NÃO NASCE CONFIRMADA.** Um gatilho `before insert`
--      recusa `origem` de adivinhação (`importacao`, `extrato`, `conciliacao`)
--      com `review_status = 'confirmado'`. É a regra do produto imposta pelo
--      banco: nenhum caminho novo, nem RPC, nem `psql` na mão, contorna.
--
-- ⚠️ Só no INSERT. A fila de revisão promove `pendente → confirmado` por UPDATE,
-- e é ela que existe para isso: quem promove suspeita a fato é uma PESSOA. Um
-- CHECK pegaria também a promoção e trancaria a porta que a regra depende.
--
-- Medido em produção antes desta migration: 1.772 lançamentos ·
-- `origem='importacao'` = **0** (o caminho do OCR nunca gravou desde que a
-- coluna de procedência existe) · 803 sem procedência nenhuma e confirmados,
-- todos de 09/06 a 08/07, a era anterior às colunas. O defeito era AGENDADO:
-- dispararia na primeira foto enviada.

alter table public.movements alter column review_status drop default;

comment on column public.movements.review_status is
  'Se a linha é AFIRMAÇÃO (confirmado) ou SUSPEITA à espera de uma pessoa (pendente). '
  'Sem default de propósito: quem escreve sabe a resposta, e o banco recusa quem não disser.';

create or replace function public.transcricao_nao_e_fato()
returns trigger
language plpgsql
as $$
begin
  -- As origens que ADIVINHAM. `manual`, `venda` e `contrato` são afirmações:
  -- alguém digitou, ou um documento com assinatura as gerou.
  if new.origem in ('importacao', 'extrato', 'conciliacao')
     and new.review_status = 'confirmado' then
    raise exception using
      errcode = 'A4P09',
      message = 'Transcrição não é fato: um lançamento de origem ' || new.origem
              || ' não pode nascer confirmado.',
      hint =
        'OCR, leitura de extrato e casamento aproximado ADIVINHAM. O que eles '
        'produzem entra como `pendente` e vai para a fila de revisão; quem '
        'promove suspeita a fato é uma pessoa, e isso acontece por UPDATE.';
  end if;
  return new;
end $$;

drop trigger if exists movements_transcricao_nao_e_fato on public.movements;
create trigger movements_transcricao_nao_e_fato
  before insert on public.movements
  for each row execute function public.transcricao_nao_e_fato();
