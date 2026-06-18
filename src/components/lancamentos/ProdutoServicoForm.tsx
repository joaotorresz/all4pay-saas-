"use client";

import * as React from "react";
import { Input, Select, CurrencyInput, Switch, Icon, type SelectOption } from "@/components/ui";
import { FormModal } from "./FormModal";
import { setProdutoImagem, getProdutoImagem, removeProdutoImagem, fileParaDataUrl } from "@/lib/produto-imagem";
import { getProduct } from "@/lib/cadastros";
import type { Product } from "@/lib/types";
import {
  useCategories,
  useUnits,
  useBrands,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useCreateService,
} from "./hooks";

/** Cadastro/edição compacto de Produto ou Serviço (mesma base). */
export function ProdutoServicoForm({
  kind,
  produto,
  onClose,
  onToast,
}: {
  kind: "produto" | "servico";
  produto?: Product; // presente = edição (só produto)
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const isProduct = kind === "produto";
  const editando = isProduct && !!produto;
  const { data: categories } = useCategories("receita");
  const { data: units } = useUnits();
  const { data: brands } = useBrands();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const createService = useCreateService();
  const saving = createProduct.isPending || updateProduct.isPending || deleteProduct.isPending || createService.isPending;

  const remover = async () => {
    if (!editando || !produto) return;
    if (!window.confirm(`Remover o produto "${produto.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteProduct.mutateAsync(produto.id);
      removeProdutoImagem(produto.name);
      onToast("Produto removido");
      onClose();
    } catch {
      onToast("Não foi possível remover (pode estar em uso em vendas)");
    }
  };

  const [tried, setTried] = React.useState(false);
  const [imagem, setImagem] = React.useState<string | null>(null);
  const imgRef = React.useRef<HTMLInputElement>(null);
  const escolherImagem = async (file?: File) => {
    if (!file) return;
    try { setImagem(await fileParaDataUrl(file)); } catch { onToast("Não foi possível ler a imagem"); }
  };
  const [f, setF] = React.useState({
    name: produto?.name ?? "",
    code: produto?.sku ?? "",
    category_id: "",
    unit_id: "",
    brand_id: "",
    sale_price: produto?.sale_price ?? 0,
    cost_price: 0,
    track_stock: false,
    stock_initial: 0,
  });
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));

  // Edição: prefill da imagem + busca os campos completos (categoria/unidade/marca/custo/estoque).
  React.useEffect(() => {
    if (!editando || !produto) return;
    setImagem(getProdutoImagem(produto.name));
    getProduct(produto.id).then((full) => {
      if (!full) return;
      setF((s) => ({
        ...s,
        category_id: full.category_id ?? "",
        unit_id: full.unit_id ?? "",
        brand_id: full.brand_id ?? "",
        cost_price: full.cost_price ?? 0,
        track_stock: !!full.track_stock,
        stock_initial: full.stock_initial ?? 0,
      }));
    }).catch(() => {});
  }, [editando, produto]);

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
        const input = {
          name: f.name.trim(),
          sku: f.code.trim() || null,
          category_id: f.category_id || null,
          unit_id: f.unit_id || null,
          brand_id: f.brand_id || null,
          sale_price: f.sale_price,
          cost_price: f.cost_price || null,
          track_stock: f.track_stock,
          stock_initial: f.track_stock ? f.stock_initial : null,
        };
        if (editando && produto) await updateProduct.mutateAsync({ id: produto.id, input });
        else await createProduct.mutateAsync(input);
        if (imagem) setProdutoImagem(f.name.trim(), imagem); // foto do "cardápio"
      } else {
        await createService.mutateAsync({
          name: f.name.trim(),
          code: f.code.trim() || null,
          category_id: f.category_id || null,
          unit_id: f.unit_id || null,
          price: f.sale_price,
        });
      }
      onToast(editando ? "Produto atualizado" : `${isProduct ? "Produto" : "Serviço"} salvo`);
      if (again) {
        setF((s) => ({ ...s, name: "", code: "", sale_price: 0, cost_price: 0 }));
        setImagem(null);
        setTried(false);
      } else onClose();
    } catch {
      onToast("Erro ao salvar — tente novamente");
    }
  };

  return (
    <FormModal
      title={editando ? "Editar produto" : isProduct ? "Novo produto" : "Novo serviço"}
      size="compact"
      onClose={onClose}
      onSave={() => submit(false)}
      onSaveAgain={editando ? undefined : () => submit(true)}
      saving={saving}
      extraAction={editando ? (
        <button type="button" onClick={remover} disabled={saving} className="text-caption font-medium text-negative hover:opacity-80 px-3 py-[7px] disabled:opacity-45">
          Remover
        </button>
      ) : undefined}
    >
      <Input label="Nome *" value={f.name} onChange={(e) => set({ name: e.target.value })} invalid={bad("name")} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label={isProduct ? "Código / SKU" : "Código"}
          value={f.code}
          onChange={(e) => set({ code: e.target.value })}
        />
        <Select label="Unidade" placeholder="Selecione" options={unitOpts} value={f.unit_id} onChange={(v) => set({ unit_id: v })} />
      </div>
      <Select label="Categoria" placeholder="Selecione" options={catOpts} value={f.category_id} onChange={(v) => set({ category_id: v })} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          {/* Imagem do produto (visual de cardápio) */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => imgRef.current?.click()}
              className="w-[64px] h-[64px] rounded-md border border-dashed border-border bg-surface-1 overflow-hidden inline-flex items-center justify-center shrink-0 hover:border-ink/30"
              aria-label="Adicionar imagem do produto"
            >
              {imagem
                // eslint-disable-next-line @next/next/no-img-element -- preview de dataURL local
                ? <img src={imagem} alt="" className="w-full h-full object-cover" />
                : <Icon name="scan-line" size={20} color="var(--color-text-tertiary)" />}
            </button>
            <div className="flex flex-col gap-1">
              <span className="text-label text-ink">Imagem do produto</span>
              <span className="text-caption text-faint">Aparece no cardápio em Produtos.</span>
              {imagem && <button type="button" onClick={() => setImagem(null)} className="text-caption text-negative text-left">Remover imagem</button>}
            </div>
            <input ref={imgRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/*" onChange={(e) => escolherImagem(e.target.files?.[0])} />
          </div>
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
