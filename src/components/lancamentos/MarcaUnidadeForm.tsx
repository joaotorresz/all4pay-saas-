"use client";

import * as React from "react";
import { Input, Textarea } from "@/components/ui";
import { FormModal } from "./FormModal";
import { useCreateBrand, useCreateUnit } from "./hooks";

/** Cadastro mínimo de Marca. */
export function MarcaForm({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const create = useCreateBrand();
  const [tried, setTried] = React.useState(false);
  const [f, setF] = React.useState({ name: "", description: "" });

  const submit = async (again: boolean) => {
    setTried(true);
    if (!f.name.trim()) {
      onToast("Informe o nome da marca");
      return;
    }
    try {
      await create.mutateAsync({ name: f.name.trim(), description: f.description.trim() || null });
      onToast("Marca salva");
      if (again) {
        setF({ name: "", description: "" });
        setTried(false);
      } else onClose();
    } catch {
      onToast("Erro ao salvar — tente novamente");
    }
  };

  return (
    <FormModal title="Nova marca" size="compact" onClose={onClose} onSave={() => submit(false)} onSaveAgain={() => submit(true)} saving={create.isPending}>
      <Input label="Nome *" value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} invalid={tried && !f.name.trim()} />
      <Textarea label="Descrição" value={f.description} onChange={(e) => setF((s) => ({ ...s, description: e.target.value }))} />
    </FormModal>
  );
}

/** Cadastro mínimo de Unidade de medida. */
export function UnidadeForm({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const create = useCreateUnit();
  const [tried, setTried] = React.useState(false);
  const [f, setF] = React.useState({ name: "", abbrev: "" });
  const errors = { name: !f.name.trim(), abbrev: !f.abbrev.trim() };

  const submit = async (again: boolean) => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) {
      onToast("Revise os campos obrigatórios");
      return;
    }
    try {
      await create.mutateAsync({ name: f.name.trim(), abbrev: f.abbrev.trim() });
      onToast("Unidade salva");
      if (again) {
        setF({ name: "", abbrev: "" });
        setTried(false);
      } else onClose();
    } catch {
      onToast("Erro ao salvar — tente novamente");
    }
  };

  return (
    <FormModal title="Nova unidade de medida" size="compact" onClose={onClose} onSave={() => submit(false)} onSaveAgain={() => submit(true)} saving={create.isPending}>
      <Input label="Nome *" value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} invalid={tried && errors.name} placeholder="Ex.: Quilograma" />
      <Input label="Sigla *" value={f.abbrev} onChange={(e) => setF((s) => ({ ...s, abbrev: e.target.value }))} invalid={tried && errors.abbrev} placeholder="Ex.: kg" />
    </FormModal>
  );
}
