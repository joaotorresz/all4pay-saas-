-- Blinda a idempotência do Cron N6 NO BANCO (não só no código).
-- Índice parcial: protege só as faturas de recorrência (rec:<id>:<data>),
-- sem tocar outros usos de reference_code. Seguro: 0 linhas 'rec:%' hoje.
create unique index if not exists movements_rec_ref_uniq
on public.movements (org_id, reference_code)
where reference_code like 'rec:%';