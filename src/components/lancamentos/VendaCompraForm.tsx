"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Select,
  Input,
  DateField,
  CurrencyInput,
  Textarea,
  Switch,
  Button,
  Icon,
  BRL,
  type SelectOption,
} from "@/components/ui";
import { isoDay } from "@/lib/aggregations";
import { formatBRL } from "@/lib/format";
import { findOrCreateParty } from "@/lib/confirmacao";
import { FormModal, SectionTitle } from "./FormModal";
import {
  usePartiesByRole,
  useCostCenters,
  useSalespeople,
  useProducts,
  useServices,
  useAccountsList,
  useCreateSaleDoc,
} from "./hooks";
import type { SaleDocKind, ItemKind, PaymentMethod } from "@/lib/types";

const PAYMENT_METHODS: SelectOption[] = [
  { value: "pix", label: "Pix" },
  { value: "boleto", label: "Boleto" },
  { value: "cartao", label: "Cartão" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "transferencia", label: "Transferência" },
];

type ItemRow = { ref_id: string; qty: number; unit_price: number; discount: number };
const emptyRow = (): ItemRow => ({ ref_id: "", qty: 1, unit_price: 0, discount: 0 });

export function VendaCompraForm({
  docKind,
  itemKind,
  onClose,
  onToast,
}: {
  docKind: SaleDocKind;
  itemKind: ItemKind;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const isOrcamento = docKind === "orcamento";
  const isCompra = docKind === "compra";
  const partyRole = isCompra ? "supplier" : "customer";

  const { data: parties } = usePartiesByRole(partyRole);
  const { data: salespeople } = useSalespeople();
  const { data: costCenters } = useCostCenters();
  const { data: products } = useProducts();
  const { data: services } = useServices();
  const { data: accounts } = useAccountsList();
  const create = useCreateSaleDoc();
  const qc = useQueryClient();
  const rotuloParte = isCompra ? "fornecedor" : "cliente";

  // "Novo cliente/fornecedor" inline
  const [novoNome, setNovoNome] = React.useState("");
  const [novoTipo, setNovoTipo] = React.useState<"pf" | "pj">("pj");
  const [salvarContato, setSalvarContato] = React.useState(true);

  const refSource = itemKind === "produto" ? products : services;
  const refOpts: SelectOption[] = (refSource ?? []).map((x) => ({ value: x.id, label: x.name }));
  const refLabel = (id: string) => refOpts.find((o) => o.value === id)?.label ?? "";

  const [tried, setTried] = React.useState(false);
  const [f, setF] = React.useState({
    party_id: "",
    doc_date: isoDay(new Date()),
    validity: "",
    salesperson_id: "",
    cost_center_id: "",
    discount: 0,
    notes: "",
    due_date: isoDay(new Date()),
    payment_method: "",
    account_id: "",
    settled: false,
  });
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));
  const [items, setItems] = React.useState<ItemRow[]>([emptyRow()]);
  const setItem = (i: number, p: Partial<ItemRow>) =>
    setItems((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

  const opts = (a?: { id: string; name: string }[]): SelectOption[] =>
    (a ?? []).map((x) => ({ value: x.id, label: x.name }));

  const lineTotal = (r: ItemRow) => Math.max(0, r.qty * r.unit_price - r.discount);
  const subtotal = items.reduce((s, r) => s + lineTotal(r), 0);
  const total = Math.max(0, subtotal - f.discount);

  const novoContato = f.party_id === "__novo__";
  const validItems = items.filter((r) => r.ref_id && r.qty > 0 && r.unit_price > 0);
  const errors = {
    party: !f.party_id || (novoContato && !novoNome.trim()),
    items: validItems.length === 0,
    validity: isOrcamento && !f.validity,
  };
  const bad = (k: keyof typeof errors) => tried && errors[k];

  const titles: Record<string, string> = {
    "venda-produto": "Nova venda de produto",
    "venda-servico": "Nova venda de serviço",
    "compra-produto": "Nova compra de produto",
    "compra-servico": "Nova compra de serviço",
    orcamento: "Novo orçamento",
  };
  const title = isOrcamento ? titles.orcamento : titles[`${docKind}-${itemKind}`];

  const submit = async (opts?: { asVenda?: boolean; again?: boolean }) => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) {
      onToast("Revise os campos obrigatórios");
      return;
    }
    const kind: SaleDocKind = opts?.asVenda ? "venda" : docKind;
    try {
      // Novo cliente/fornecedor inline: salva no cadastro (se marcado) ou fica avulso.
      let partyId: string | null = f.party_id || null;
      let notas = f.notes.trim();
      if (novoContato) {
        if (salvarContato) {
          const r = await findOrCreateParty({ name: novoNome.trim(), type: novoTipo, isCustomer: !isCompra, isSupplier: isCompra });
          partyId = r.id;
          qc.invalidateQueries({ queryKey: ["parties"] });
          qc.invalidateQueries({ queryKey: ["parties-list"] });
        } else {
          partyId = null;
          notas = [`${isCompra ? "Fornecedor" : "Cliente"}: ${novoNome.trim()}`, notas].filter(Boolean).join(" · ");
        }
      }
      await create.mutateAsync({
        kind,
        item_kind: itemKind,
        party_id: partyId,
        salesperson_id: f.salesperson_id || null,
        cost_center_id: f.cost_center_id || null,
        doc_date: f.doc_date,
        validity: isOrcamento && !opts?.asVenda ? f.validity || null : null,
        discount: f.discount,
        notes: notas || null,
        items: validItems.map((r) => ({
          ref_id: r.ref_id,
          description: refLabel(r.ref_id),
          qty: r.qty,
          unit_price: r.unit_price,
          discount: r.discount,
        })),
        due_date: kind === "orcamento" ? null : f.due_date,
        payment_method: kind === "orcamento" ? null : (f.payment_method as PaymentMethod) || null,
        account_id: kind === "orcamento" ? null : f.account_id || null,
        settled: kind === "orcamento" ? false : f.settled,
      });
      onToast(opts?.asVenda ? "Orçamento convertido em venda" : `${title.replace("Nova ", "").replace("Novo ", "")} salvo`);
      if (opts?.again) {
        setItems([emptyRow()]);
        set({ party_id: "", discount: 0, notes: "" });
        setTried(false);
      } else onClose();
    } catch {
      onToast("Erro ao salvar — tente novamente");
    }
  };

  return (
    <FormModal
      title={title}
      size="large"
      onClose={onClose}
      onSave={() => submit()}
      onSaveAgain={() => submit({ again: true })}
      saving={create.isPending}
      extraAction={
        isOrcamento ? (
          <Button variant="secondary" disabled={create.isPending} onClick={() => submit({ asVenda: true })}>
            Converter em venda
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Select
          label={isCompra ? "Fornecedor" : "Cliente"}
          required
          placeholder="Selecione"
          options={[{ value: "__novo__", label: isCompra ? "+ Novo fornecedor" : "+ Novo cliente" }, ...opts(parties)]}
          value={f.party_id}
          onChange={(v) => set({ party_id: v })}
          invalid={bad("party")}
        />
        <DateField
          label={isOrcamento ? "Data" : isCompra ? "Data da compra" : "Data da venda"}
          required
          value={f.doc_date}
          onChange={(v) => set({ doc_date: v })}
        />
      </div>

      {novoContato && (
        <div className="flex flex-col gap-3 rounded-md border border-border-soft p-3">
          <Input label={`Nome do ${rotuloParte}`} value={novoNome} onChange={(e) => setNovoNome(e.target.value)} invalid={bad("party")} />
          <div className="flex flex-wrap items-center gap-4">
            <Select label="Tipo" options={[{ value: "pj", label: "Pessoa jurídica" }, { value: "pf", label: "Pessoa física" }]} value={novoTipo} onChange={(v) => setNovoTipo(v as "pf" | "pj")} containerClassName="min-w-[170px]" />
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={salvarContato} onChange={() => setSalvarContato((v) => !v)} />
              <span className="text-label text-ink">Salvar este {rotuloParte} no cadastro de contatos?</span>
            </label>
          </div>
          {!salvarContato && <span className="text-caption text-faint">Sem salvar: a {isCompra ? "compra" : "venda"} fica registrada e o nome vai nas observações, mas o contato não entra em Contatos.</span>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {!isCompra && (
          <Select label="Vendedor" placeholder="Selecione (opcional)" options={opts(salespeople)} value={f.salesperson_id} onChange={(v) => set({ salesperson_id: v })} />
        )}
        <Select label="Centro de custo" placeholder="Selecione (opcional)" options={opts(costCenters)} value={f.cost_center_id} onChange={(v) => set({ cost_center_id: v })} />
        {isOrcamento && (
          <DateField label="Validade" required value={f.validity} onChange={(v) => set({ validity: v })} invalid={bad("validity")} />
        )}
      </div>

      <SectionTitle>Itens {itemKind === "produto" ? "(produtos)" : "(serviços)"}</SectionTitle>
      {bad("items") && <span className="text-caption text-negative -mt-2">Adicione ao menos um item válido.</span>}
      <div className="flex flex-col gap-2">
        {items.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_70px_110px_100px_90px_28px] gap-2 items-end">
            <Select
              label={i === 0 ? (itemKind === "produto" ? "Produto" : "Serviço") : undefined}
              placeholder="Selecione"
              options={refOpts}
              value={r.ref_id}
              onChange={(v) => {
                // ao escolher o produto/serviço, já preenche o valor unitário (preço de venda)
                const sel = ((refSource ?? []) as { id: string; sale_price?: number; price?: number }[]).find((x) => x.id === v);
                setItem(i, { ref_id: v, unit_price: sel?.sale_price ?? sel?.price ?? r.unit_price });
              }}
            />
            <Input
              label={i === 0 ? "Qtd" : undefined}
              inputMode="numeric"
              value={r.qty}
              onChange={(e) => setItem(i, { qty: Number(e.target.value) || 0 })}
            />
            <CurrencyInput label={i === 0 ? "Vlr unit." : undefined} value={r.unit_price} onValueChange={(v) => setItem(i, { unit_price: v })} />
            <CurrencyInput label={i === 0 ? "Desconto" : undefined} value={r.discount} onValueChange={(v) => setItem(i, { discount: v })} />
            <div className={i === 0 ? "pb-[10px]" : ""}>
              <span className="text-label tabular-nums text-ink"><BRL value={lineTotal(r)} /></span>
            </div>
            <button
              type="button"
              aria-label="Remover item"
              className="h-10 inline-flex items-center justify-center text-faint hover:text-ink"
              onClick={() => setItems((rows) => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows))}
            >
              <Icon name="x" size={15} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="self-start inline-flex items-center gap-1 text-label font-medium text-muted hover:text-ink"
          onClick={() => setItems((rows) => [...rows, emptyRow()])}
        >
          <Icon name="plus" size={14} /> Adicionar item
        </button>
      </div>

      {/* Totais */}
      <div className="flex flex-col gap-2 items-end pt-2 border-t border-border-soft">
        <Row label="Subtotal" value={<BRL value={subtotal} />} />
        <div className="flex items-center gap-3">
          <span className="text-label text-muted">Desconto geral</span>
          <div className="w-[140px]">
            <CurrencyInput value={f.discount} onValueChange={(v) => set({ discount: v })} />
          </div>
        </div>
        <Row label="Total geral" value={<BRL value={total} />} strong />
      </div>

      {!isOrcamento && (
        <>
          <SectionTitle>Condição de pagamento</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <DateField label="Vencimento" value={f.due_date} onChange={(v) => set({ due_date: v })} />
            <Select label="Forma de pagamento" placeholder="Selecione" options={PAYMENT_METHODS} value={f.payment_method} onChange={(v) => set({ payment_method: v })} />
          </div>
          <Select label={isCompra ? "Conta de pagamento" : "Conta de recebimento"} placeholder="Selecione a conta" options={opts(accounts)} value={f.account_id} onChange={(v) => set({ account_id: v })} />
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={f.settled} onChange={(e) => set({ settled: e.target.checked })} className="w-[18px] h-[18px] accent-ink" />
            <span className="text-[17px] text-ink">{isCompra ? "Pago" : "Recebido"} (baixa imediata)</span>
          </label>
        </>
      )}

      <Textarea label="Observações" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
    </FormModal>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center gap-4 tabular-nums">
      <span className="text-label text-muted">{label}</span>
      <span className={strong ? "text-h3 font-medium text-ink" : "text-body text-ink"}>{value}</span>
    </div>
  );
}
