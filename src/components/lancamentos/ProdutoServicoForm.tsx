"use client";

import * as React from "react";
import { Input, Select, CurrencyInput, Switch, type SelectOption } from "@/components/ui";
import { FormModal } from "./FormModal";
import {
  useCategories,
  useUnits,
  useBrands,
  useCreateProduct,
  useCreateService,
} from "./hooks";

/** Cadastro compacto de Produto ou Serviço (mesma base). */
export function ProdutoServicoForm({
  kind,
  onClose,
  onToast,
}: {
  kind: "produto" | "servico";
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const isProduct = kind === "produto";
  const { data: categories } = useCategories("receita");
  const { data: units } = useUnits();
  const { data: brands } = useBrands();
  const createProduct = useCreateProduct();
  const createService = useCreateService();
  const saving = createProduct.isPending || createService.isPending;

  const [tried, setTried] = React.useState(false);
  const [f, setF] = React.useState({
    name: "",
    code: "",
    category_id: "",
    unit_id: "",
    brand_id: "",
    sale_price: 0,
    cost_price: 0,
    track_stock: false,
    stock_initial: 0,
  });
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));

  const catOpts: SelectOption[] = (categories ?? []).map((c) => ({ value: c.id, label: c.name }));
  const unitOpts: SelectOption[] = (units ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.abbrev})` }));
  const brandOpts: SelectOption[] = (brands ?? []).map((b) => ({ value: b.id, label: b.name }));

  const errors = { name: !f.name.trim(), price: f.sale_price <= 0 };
  const bad = (k: keyof typeof errors) => tried && errors[k];

  const submit = async (again: boolean) => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) {
      onToast("Revise os campos obrigatórios");
      return;
    }
    try {
      if (isProduct) {
        await createProduct.mutateAsync({
          name: f.name.trim(),
          sku: f.code.trim() || null,
          category_id: f.category_id || null,
          unit_id: f.unit_id || null,
          brand_id: f.brand_id || null,
          sale_price: f.sale_price,
          cost_price: f.cost_price || null,
          track_stock: f.track_stock,
          stock_initial: f.track_stock ? f.stock_initial : null,
        });
      } else {
        await createService.mutateAsync({
          name: f.name.trim(),
          code: f.code.trim() || null,
          category_id: f.category_id || null,
          unit_id: f.unit_id || null,
          price: f.sale_price,
        });
      }
      onToast(`${isProduct ? "Produto" : "Serviço"} salvo`);
      if (again) {
        setF((s) => ({ ...s, name: "", code: "", sale_price: 0, cost_price: 0 }));
        setTried(false);
      } else onClose();
    } catch {
      onToast("Erro ao salvar — tente novamente");
    }
  };

  return (
    <FormModal
      title={isProduct ? "Novo produto" : "Novo serviço"}
      size="compact"
      onClose={onClose}
      onSave={() => submit(false)}
      onSaveAgain={() => submit(true)}
      saving={saving}
    >
      <Input label="Nome *" value={f.name} onChange={(e) => set({ name: e.target.value })} invalid={bad("name")} />
      <div className="grid grid-cols-2 gap-4">
        <Input
          label={isProduct ? "Código / SKU" : "Código"}
          value={f.code}
          onChange={(e) => set({ code: e.target.value })}
        />
        <Select label="Unidade" placeholder="Selecione" options={unitOpts} value={f.unit_id} onChange={(v) => set({ unit_id: v })} />
      </div>
      <Select label="Categoria" placeholder="Selecione" options={catOpts} value={f.category_id} onChange={(v) => set({ category_id: v })} />
      <div className="grid grid-cols-2 gap-4">
        <CurrencyInput
          label={isProduct ? "Preço de venda" : "Preço"}
          required
          value={f.sale_price}
          onValueChange={(v) => set({ sale_price: v })}
          invalid={bad("price")}
        />
        {isProduct && (
          <CurrencyInput label="Preço de custo" value={f.cost_price} onValueChange={(v) => set({ cost_price: v })} />
        )}
      </div>
      {isProduct && (
        <>
          <Select label="Marca" placeholder="Selecione (opcional)" options={brandOpts} value={f.brand_id} onChange={(v) => set({ brand_id: v })} />
          <Switch label="Controla estoque?" checked={f.track_stock} onChange={(v) => set({ track_stock: v })} />
          {f.track_stock && (
            <Input
              label="Estoque inicial"
              inputMode="numeric"
              value={f.stock_initial}
              onChange={(e) => set({ stock_initial: Number(e.target.value) || 0 })}
            />
          )}
        </>
      )}
    </FormModal>
  );
}
