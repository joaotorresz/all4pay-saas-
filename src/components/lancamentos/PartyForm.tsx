"use client";

import * as React from "react";
import { Select, Input } from "@/components/ui";
import { FormModal, SectionTitle } from "./FormModal";
import { useCreateParty, useUpdateParty } from "./hooks";
import { validateDoc, maskDoc, maskCep } from "@/lib/validators";
import { lookupCep } from "@/lib/viacep";
import type { PartyType, Party, PartyInput } from "@/lib/types";

type Role = "customer" | "supplier" | "carrier";
const TITLES: Record<Role, string> = {
  customer: "Novo cliente",
  supplier: "Novo fornecedor",
  carrier: "Nova transportadora",
};

/** Deriva o papel a partir das flags da party (para o modo edição). */
function roleDe(p?: Party): Role {
  if (p?.is_supplier) return "supplier";
  if (p?.is_carrier) return "carrier";
  return "customer";
}

export function PartyForm({
  role: roleProp,
  party,
  onClose,
  onToast,
}: {
  role?: Role;
  party?: Party;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const editing = !!party;
  const role: Role = roleProp ?? roleDe(party);
  const create = useCreateParty();
  const update = useUpdateParty();
  const [tried, setTried] = React.useState(false);
  const [cepLoading, setCepLoading] = React.useState(false);
  const [f, setF] = React.useState({
    type: (party?.type ?? "pj") as PartyType,
    doc: party?.doc ?? "",
    name: party?.name ?? "",
    email: party?.email ?? "",
    phone: party?.phone ?? "",
    zip: "",
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
    antt: "",
  });
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));

  const docValid = f.doc.trim() === "" ? true : validateDoc(f.type, f.doc);
  const errors = {
    name: !f.name.trim(),
    doc: !f.doc.trim() || !validateDoc(f.type, f.doc),
  };
  const bad = (k: keyof typeof errors) => tried && errors[k];

  const onCep = async (raw: string) => {
    const masked = maskCep(raw);
    set({ zip: masked });
    if (masked.replace(/\D/g, "").length === 8) {
      setCepLoading(true);
      const addr = await lookupCep(masked);
      setCepLoading(false);
      if (addr)
        set({
          street: addr.street,
          district: addr.district,
          city: addr.city,
          state: addr.state,
        });
    }
  };

  const submit = async (again: boolean) => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) {
      onToast("Revise os campos obrigatórios");
      return;
    }
    try {
      if (editing) {
        // Atualiza só os campos de contato/identificação; campos de endereço só
        // entram quando preenchidos, para não apagar o que já existe no cadastro.
        const patch: Partial<PartyInput> = {
          type: f.type,
          name: f.name.trim(),
          doc: f.doc.trim() || null,
          email: f.email.trim() || null,
          phone: f.phone.trim() || null,
        };
        const addr: Record<string, string> = {
          zip: f.zip, street: f.street, number: f.number, complement: f.complement,
          district: f.district, city: f.city, state: f.state, antt: f.antt,
        };
        for (const [k, v] of Object.entries(addr)) if (v.trim()) (patch as Record<string, unknown>)[k] = v.trim();
        await update.mutateAsync({ id: party!.id, patch });
        onToast("Contato atualizado");
        onClose();
        return;
      }
      await create.mutateAsync({
        type: f.type,
        name: f.name.trim(),
        doc: f.doc.trim() || null,
        email: f.email.trim() || null,
        phone: f.phone.trim() || null,
        zip: f.zip.trim() || null,
        street: f.street.trim() || null,
        number: f.number.trim() || null,
        complement: f.complement.trim() || null,
        district: f.district.trim() || null,
        city: f.city.trim() || null,
        state: f.state.trim() || null,
        is_customer: role === "customer",
        is_supplier: role === "supplier",
        is_carrier: role === "carrier",
        antt: role === "carrier" ? f.antt.trim() || null : null,
      });
      onToast(`${TITLES[role].replace("Novo ", "").replace("Nova ", "")} salvo`);
      if (again) {
        setF((s) => ({ ...s, doc: "", name: "", email: "", phone: "" }));
        setTried(false);
      } else onClose();
    } catch {
      onToast("Erro ao salvar — documento já cadastrado?");
    }
  };

  return (
    <FormModal
      title={editing ? "Editar contato" : TITLES[role]}
      size="medium"
      onClose={onClose}
      onSave={() => submit(false)}
      onSaveAgain={editing ? undefined : () => submit(true)}
      saving={create.isPending || update.isPending}
    >
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Tipo"
          required
          options={[
            { value: "pf", label: "Pessoa física (CPF)" },
            { value: "pj", label: "Pessoa jurídica (CNPJ)" },
          ]}
          value={f.type}
          onChange={(v) => set({ type: v as PartyType, doc: "" })}
        />
        <Input
          label={f.type === "pf" ? "CPF *" : "CNPJ *"}
          value={f.doc}
          onChange={(e) => set({ doc: maskDoc(f.type, e.target.value) })}
          invalid={bad("doc") || !docValid}
          placeholder={f.type === "pf" ? "000.000.000-00" : "00.000.000/0000-00"}
        />
      </div>
      {!docValid && (
        <span className="text-caption text-negative -mt-2">
          {f.type === "pf" ? "CPF" : "CNPJ"} inválido.
        </span>
      )}

      <Input
        label={f.type === "pf" ? "Nome *" : "Razão social *"}
        value={f.name}
        onChange={(e) => set({ name: e.target.value })}
        invalid={bad("name")}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input label="E-mail" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
        <Input label="Telefone" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
      </div>

      {role === "carrier" && (
        <Input label="ANTT" value={f.antt} onChange={(e) => set({ antt: e.target.value })} placeholder="Registro ANTT (opcional)" />
      )}

      <SectionTitle>Endereço</SectionTitle>
      <div className="grid grid-cols-[160px_1fr] gap-4">
        <Input
          label="CEP"
          value={f.zip}
          onChange={(e) => onCep(e.target.value)}
          suffix={cepLoading ? "…" : undefined}
          placeholder="00000-000"
        />
        <Input label="Logradouro" value={f.street} onChange={(e) => set({ street: e.target.value })} />
      </div>
      <div className="grid grid-cols-[120px_1fr] gap-4">
        <Input label="Número" value={f.number} onChange={(e) => set({ number: e.target.value })} />
        <Input label="Complemento" value={f.complement} onChange={(e) => set({ complement: e.target.value })} />
      </div>
      <div className="grid grid-cols-[1fr_1fr_80px] gap-4">
        <Input label="Bairro" value={f.district} onChange={(e) => set({ district: e.target.value })} />
        <Input label="Cidade" value={f.city} onChange={(e) => set({ city: e.target.value })} />
        <Input label="UF" value={f.state} onChange={(e) => set({ state: e.target.value })} />
      </div>
    </FormModal>
  );
}
