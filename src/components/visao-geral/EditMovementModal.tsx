"use client";

import * as React from "react";
import { CurrencyInput, DateField, Input } from "@/components/ui";
import { FormModal, SectionTitle } from "@/components/lancamentos/FormModal";
import { updateMovement } from "@/lib/data";
import type { Movement } from "@/lib/types";

/**
 * Editar um lançamento ainda EM ABERTO (pendente): valor, vencimento e
 * descrição. Só edição — não liquida nem mexe em saldo. Demo-safe (a data layer
 * decide imported × Supabase). Chama `onSaved` para o chamador invalidar a lista.
 */
export function EditMovementModal({
  movement,
  onClose,
  onSaved,
}: {
  movement: Movement;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [amount, setAmount] = React.useState(movement.amount);
  const [due, setDue] = React.useState(movement.due_date);
  const [desc, setDesc] = React.useState(movement.description ?? "");
  const [saving, setSaving] = React.useState(false);

  const salvar = async () => {
    if (amount <= 0 || !due) return;
    setSaving(true);
    try {
      await updateMovement(movement.id, { amount, due_date: due, description: desc.trim() || null });
      onSaved("Lançamento atualizado");
      onClose();
    } catch {
      onSaved("Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal title="Editar lançamento" size="compact" onClose={onClose} onSave={salvar} saving={saving}>
      <SectionTitle>Informações do lançamento</SectionTitle>
      <Input label="Descrição" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Fornecedor X" />
      <CurrencyInput label="Valor" value={amount} onValueChange={setAmount} />
      <DateField label="Vencimento" value={due} onChange={setDue} />
    </FormModal>
  );
}
