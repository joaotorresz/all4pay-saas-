"use client";

import * as React from "react";
import { Input, Select, CurrencyInput, BancoLogo } from "@/components/ui";
import { FormModal, SectionTitle } from "@/components/lancamentos/FormModal";
import { updateAccount } from "@/lib/data";
import type { FinancialAccount } from "@/lib/types";

const BANCOS = [
  { value: "itau", label: "Itaú" }, { value: "bradesco", label: "Bradesco" },
  { value: "nubank", label: "Nubank" }, { value: "inter", label: "Inter" },
  { value: "caixa", label: "Caixa" }, { value: "santander", label: "Santander" },
  { value: "bb", label: "Banco do Brasil" }, { value: "btg", label: "BTG" },
  { value: "outro", label: "Outro" },
];

/** Editar uma conta financeira (nome, banco, saldo). Demo-safe — a data layer
 *  decide imported × Supabase. Destrava o "não consigo editar" do /contas. */
export function EditAccountModal({
  conta,
  onClose,
  onSaved,
}: {
  conta: FinancialAccount;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = React.useState(conta.name);
  const [bank, setBank] = React.useState(BANCOS.some((b) => b.value === conta.bank) ? conta.bank : "outro");
  const [balance, setBalance] = React.useState(conta.balance);
  const [saving, setSaving] = React.useState(false);

  const salvar = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateAccount(conta.id, { name: name.trim(), bank, balance });
      onSaved("Conta atualizada");
      onClose();
    } catch {
      onSaved("Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal title="Editar conta" size="compact" onClose={onClose} onSave={salvar} saving={saving}>
      <SectionTitle>Dados da conta</SectionTitle>
      <Input label="Nome da conta" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Conta corrente" />
      <div className="flex items-end gap-2">
        <BancoLogo banco={bank} nome={BANCOS.find((b) => b.value === bank)?.label} size={40} />
        <Select label="Banco" value={bank} onChange={setBank} options={BANCOS} containerClassName="flex-1 min-w-0" />
      </div>
      <CurrencyInput label="Saldo atual" value={balance} onValueChange={setBalance} />
    </FormModal>
  );
}
