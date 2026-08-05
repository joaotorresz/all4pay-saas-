-- 0021 — Frequências de recorrência que faltavam.
--
-- O enum nasceu com semanal/mensal/anual, mas a tela de conta a receber/pagar
-- oferece seis: diária, semanal, mensal, bimestral, trimestral e anual. Sem
-- estes valores o formulário teria de mentir sobre o que consegue gravar.
--
-- `ADD VALUE IF NOT EXISTS` é idempotente — reaplicar a migration não quebra.
--
-- ⚠️ GERADA COMO ARQUIVO — aplicar ao remoto.

alter type recurrence_freq add value if not exists 'diaria';
alter type recurrence_freq add value if not exists 'bimestral';
alter type recurrence_freq add value if not exists 'trimestral';
