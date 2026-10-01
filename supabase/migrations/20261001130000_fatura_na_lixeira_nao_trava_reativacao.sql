-- ═══════════════════════════════════════════════════════════════════════════
-- FATURA NA LIXEIRA NÃO TRAVA A REATIVAÇÃO (Rodada 4, 01/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ Pausar uma assinatura manda as faturas futuras para a lixeira (exclusão
-- LÓGICA, a linha fica). O índice único `movements_rec_ref_uniq` não olhava a
-- lixeira: ao reativar, cada data já usada voltava 23505 e a fatura NUNCA era
-- recriada — a assinatura ficava "ativa" sem as cobranças daqueles meses, e o
-- cron (que trata 23505 como "já existe") também não as gerava.
--
-- A unicidade passa a valer só entre faturas VIVAS. A idempotência que importa
-- continua inteira: duas faturas vivas da mesma regra na mesma data seguem
-- impossíveis. Restaurar da lixeira uma fatura cuja data já ganhou outra viva é
-- RECUSADO pelo mesmo índice — que é o certo, seria a duplicata.
--
-- Sem `concurrently`: a migration roda em transação (job `migrar`).
drop index if exists public.movements_rec_ref_uniq;
create unique index movements_rec_ref_uniq
  on public.movements (org_id, reference_code)
  where reference_code like 'rec:%' and excluido_em is null;
