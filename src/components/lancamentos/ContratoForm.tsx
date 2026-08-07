"use client";

import * as React from "react";
import { Select, Input, CurrencyInput, DateField, type SelectOption } from "@/components/ui";
import { isoDay } from "@/lib/aggregations";
import { FormModal } from "./FormModal";
import {
  useCategories,
  useCostCenters,
  usePartiesByRole,
  useCreateContrato,
} from "./hooks";
import type { CategoryKind, RecurrenceFreq } from "@/lib/types";

/** Contrato — gera recorrência (lançamentos futuros). */
export function ContratoForm({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const create = useCreateContrato();
  const [tried, setTried] = React.useState(false);
  const [f, setF] = React.useState({
    kind: "receita" as CategoryKind,
    party_id: "",
    description: "",
    amount: 0,
    freq: "mensal" as RecurrenceFreq,
    start_date: isoDay(new Date()),
    end_date: "",
    category_id: "",
    cost_center_id: "",
    due_day: 5,
  });
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));

  const { data: parties } = usePartiesByRole(f.kind === "receita" ? "customer" : "supplier");
  const { data: categories } = useCategories(f.kind);
  const { data: costCenters } = useCostCenters();

  const opts = (a?: { id: string; name: string }[]): SelectOption[] =>
    (a ?? []).map((x) => ({ value: x.id, label: x.name }));

  const errors = {
    party: !f.party_id,
    description: !f.description.trim(),
    amount: f.amount <= 0,
    category: !f.category_id,
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
        party_id: f.party_id || null,
        type: f.kind === "receita" ? "entrada" : "saida",
        description: f.description.trim(),
        amount: f.amount,
        freq: f.freq,
        start_date: f.start_date,
        end_date: f.end_date || null,
        category_id: f.category_id || null,
        cost_center_id: f.cost_center_id || null,
        due_day: f.due_day || null,
      });
      onToast("Contrato salvo");
      onClose();
    } catch {
      onToast("Erro ao salvar — tente novamente");
    }
  };

  return (
    <FormModal title="Novo contrato" size="large" onClose={onClose} onSave={submit} saving={create.isPending}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Tipo"
          options={[
            { value: "receita", label: "Receita" },
            { value: "despesa", label: "Despesa" },
          ]}
          value={f.kind}
          onChange={(v) => set({ kind: v as CategoryKind, party_id: "", category_id: "" })}
        />
        <Select
          label={f.kind === "receita" ? "Cliente" : "Fornecedor"}
          required
          placeholder="Selecione"
          options={opts(parties)}
          value={f.party_id}
          onChange={(v) => set({ party_id: v })}
          invalid={bad("party")}
        />
      </div>
      <Input label="Descrição *" value={f.description} onChange={(e) => set({ description: e.target.value })} invalid={bad("description")} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CurrencyInput label="Valor recorrente" required value={f.amount} onValueChange={(v) => set({ amount: v })} invalid={bad("amount")} />
        <Select
          label="Periodicidade"
          required
          options={[
            { value: "mensal", label: "Mensal" },
            { value: "anual", label: "Anual" },
            { value: "semanal", label: "Semanal" },
          ]}
          value={f.freq}
          onChange={(v) => set({ freq: v as RecurrenceFreq })}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <DateField label="Data início" required value={f.start_date} onChange={(v) => set({ start_date: v })} />
        <DateField label="Data fim" value={f.end_date} onChange={(v) => set({ end_date: v })} />
        <Input label="Dia de vencimento" inputMode="numeric" value={f.due_day} onChange={(e) => set({ due_day: Number(e.target.value) || 1 })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select label="Categoria" required placeholder="Selecione" options={opts(categories)} value={f.category_id} onChange={(v) => set({ category_id: v })} invalid={bad("category")} />
        <Select label="Centro de custo" placeholder="Selecione (opcional)" options={opts(costCenters)} value={f.cost_center_id} onChange={(v) => set({ cost_center_id: v })} />
      </div>
    </FormModal>
  );
}
