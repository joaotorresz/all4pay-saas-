"use client";

import * as React from "react";
import { Select, DateField, CurrencyInput, Input, type SelectOption } from "@/components/ui";
import { isoDay } from "@/lib/aggregations";
import { FormModal } from "./FormModal";
import { useAccountsList, useCreateTransferencia } from "./hooks";

/** Transferência entre contas — cria 2 movements vinculados. */
export function TransferenciaForm({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const { data: accounts } = useAccountsList();
  const create = useCreateTransferencia();
  const [tried, setTried] = React.useState(false);
  const [f, setF] = React.useState({
    from: "",
    to: "",
    date: isoDay(new Date()),
    amount: 0,
    description: "",
  });
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));
  const opts: SelectOption[] = (accounts ?? []).map((a) => ({ value: a.id, label: a.name }));

  const errors = {
    from: !f.from,
    to: !f.to || f.to === f.from,
    amount: f.amount <= 0,
  };
  const bad = (k: keyof typeof errors) => tried && errors[k];

  const submit = async () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) {
      onToast("Revise os campos obrigatórios");
      return;
    }
    try {
      await create.mutateAsync({
        from_account_id: f.from,
        to_account_id: f.to,
        date: f.date,
        amount: f.amount,
        description: f.description.trim() || null,
      });
      onToast("Transferência registrada");
      onClose();
    } catch {
      onToast("Erro ao salvar — tente novamente");
    }
  };

  return (
    <FormModal title="Nova transferência" size="medium" onClose={onClose} onSave={submit} saving={create.isPending}>
      <Select
        label="Conta de origem"
        required
        placeholder="Selecione a conta"
        options={opts}
        value={f.from}
        onChange={(v) => set({ from: v })}
        invalid={bad("from")}
      />
      <Select
        label="Conta de destino"
        required
        placeholder="Selecione a conta (≠ origem)"
        options={opts.filter((o) => o.value !== f.from)}
        value={f.to}
        onChange={(v) => set({ to: v })}
        invalid={bad("to")}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DateField label="Data" required value={f.date} onChange={(v) => set({ date: v })} />
        <CurrencyInput label="Valor" required value={f.amount} onValueChange={(v) => set({ amount: v })} invalid={bad("amount")} />
      </div>
      <Input
        label="Descrição"
        value={f.description}
        onChange={(e) => set({ description: e.target.value })}
        placeholder="Opcional"
      />
    </FormModal>
  );
}
