"use client";

import * as React from "react";
import {
  Card,
  Button,
  Input,
  Select,
  DateField,
  CurrencyInput,
  Switch,
  SplitButton,
  Icon,
  type SelectOption,
} from "@/components/ui";
import { isoDay } from "@/lib/aggregations";
import type {
  CategoryKind,
  LancamentoInput,
  RecurrenceFreq,
  PaymentMethod,
  SplitLine,
} from "@/lib/types";
import {
  useCategories,
  useCostCenters,
  usePartiesByRole,
  useAccountsList,
  useCreateLancamento,
} from "./hooks";

const PAYMENT_METHODS: SelectOption[] = [
  { value: "pix", label: "Pix" },
  { value: "boleto", label: "Boleto" },
  { value: "cartao", label: "Cartão" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "transferencia", label: "Transferência" },
];

const FREQ_OPTIONS: SelectOption[] = [
  { value: "mensal", label: "Mensal" },
  { value: "semanal", label: "Semanal" },
  { value: "anual", label: "Anual" },
];

type FormState = {
  party_id: string;
  competence_date: string;
  description: string;
  amount: number;
  rateioOn: boolean;
  splits: SplitLine[];
  category_id: string;
  cost_center_id: string;
  reference_code: string;
  repeatOn: boolean;
  repeatFreq: RecurrenceFreq;
  repeatMode: "count" | "until";
  repeatCount: number;
  repeatUntil: string;
  installmentsMode: "avista" | "parcelado";
  installments: number;
  due_date: string;
  payment_method: string;
  account_id: string;
  settled: boolean;
  nsuOn: boolean;
  nsu: string;
};

const initialState = (): FormState => ({
  party_id: "",
  competence_date: isoDay(new Date()),
  description: "",
  amount: 0,
  rateioOn: false,
  splits: [{ category_id: null, cost_center_id: null, percent: null }],
  category_id: "",
  cost_center_id: "",
  reference_code: "",
  repeatOn: false,
  repeatFreq: "mensal",
  repeatMode: "count",
  repeatCount: 12,
  repeatUntil: "",
  installmentsMode: "avista",
  installments: 2,
  due_date: isoDay(new Date()),
  payment_method: "",
  account_id: "",
  settled: false,
  nsuOn: false,
  nsu: "",
});

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-caption font-medium tracking-[0.04em] text-faint pt-2">
      {children}
    </div>
  );
}

export function ReceitaForm({
  kind = "receita",
  onClose,
  onToast,
}: {
  kind?: CategoryKind;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const isReceita = kind === "receita";
  const partyRole = isReceita ? "customer" : "supplier";

  const { data: parties } = usePartiesByRole(partyRole);
  const { data: categories } = useCategories(kind);
  const { data: costCenters } = useCostCenters();
  const { data: accounts } = useAccountsList();
  const create = useCreateLancamento();

  const [f, setF] = React.useState<FormState>(initialState);
  const [tried, setTried] = React.useState(false);
  const set = (patch: Partial<FormState>) => setF((s) => ({ ...s, ...patch }));

  const opts = (arr?: { id: string; name: string }[]): SelectOption[] =>
    (arr ?? []).map((x) => ({ value: x.id, label: x.name }));

  const errors = {
    competence_date: !f.competence_date,
    description: !f.description.trim(),
    amount: f.amount <= 0,
    category_id: !f.category_id,
    due_date: !f.due_date,
  };
  const invalid = (k: keyof typeof errors) => tried && errors[k];

  const buildInput = (): LancamentoInput => ({
    kind,
    party_id: f.party_id || null,
    competence_date: f.competence_date,
    description: f.description.trim(),
    amount: f.amount,
    category_id: f.category_id || null,
    cost_center_id: f.cost_center_id || null,
    reference_code: f.reference_code.trim() || null,
    splits: f.rateioOn ? f.splits : null,
    repeat: f.repeatOn
      ? {
          freq: f.repeatFreq,
          count: f.repeatMode === "count" ? f.repeatCount : null,
          until: f.repeatMode === "until" ? f.repeatUntil || null : null,
        }
      : null,
    installments: f.installmentsMode === "parcelado" ? Math.max(2, f.installments) : 1,
    due_date: f.due_date,
    payment_method: (f.payment_method as PaymentMethod) || null,
    account_id: f.account_id || null,
    settled: f.settled,
    nsu: f.nsuOn ? f.nsu.trim() || null : null,
  });

  const submit = async (again: boolean) => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) {
      onToast("Revise os campos obrigatórios");
      return;
    }
    try {
      await create.mutateAsync(buildInput());
      onToast(`${isReceita ? "Receita" : "Despesa"} salva`);
      if (again) {
        setF(initialState());
        setTried(false);
      } else {
        onClose();
      }
    } catch {
      onToast("Erro ao salvar — tente novamente");
    }
  };

  const setSplit = (i: number, patch: Partial<SplitLine>) =>
    setF((s) => ({
      ...s,
      splits: s.splits.map((sp, idx) => (idx === i ? { ...sp, ...patch } : sp)),
    }));

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-start justify-center z-50 p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div className="w-[600px] max-w-full my-auto" onClick={(e) => e.stopPropagation()}>
        <Card padded={false} className="flex flex-col max-h-[88vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-border-soft">
            <span className="text-h3 font-medium">
              {isReceita ? "Nova receita" : "Nova despesa"}
            </span>
            <button
              className="inline-flex bg-transparent cursor-pointer p-[2px]"
              onClick={onClose}
              aria-label="Fechar"
            >
              <Icon name="x" size={18} color="var(--color-text-secondary)" />
            </button>
          </div>

          {/* Body (scroll) */}
          <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
            <SectionTitle>Informações do lançamento</SectionTitle>

            <Select
              label={isReceita ? "Cliente" : "Fornecedor"}
              placeholder={`Selecione um ${isReceita ? "cliente" : "fornecedor"} (opcional)`}
              options={opts(parties)}
              value={f.party_id}
              onChange={(v) => set({ party_id: v })}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DateField
                label="Data de competência"
                required
                value={f.competence_date}
                onChange={(v) => set({ competence_date: v })}
                invalid={invalid("competence_date")}
              />
              <CurrencyInput
                label="Valor"
                required
                value={f.amount}
                onValueChange={(v) => set({ amount: v })}
                invalid={invalid("amount")}
              />
            </div>

            <Input
              label="Descrição *"
              value={f.description}
              onChange={(e) => set({ description: e.target.value })}
              invalid={invalid("description")}
              placeholder="Ex.: Mensalidade · pedido #1234"
            />

            <Switch
              label="Habilitar rateio"
              checked={f.rateioOn}
              onChange={(v) => set({ rateioOn: v })}
            />

            {f.rateioOn && (
              <div className="flex flex-col gap-2 rounded-md border border-border-soft p-3">
                {f.splits.map((sp, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_90px_32px] gap-2 items-end">
                    <Select
                      label={i === 0 ? "Categoria" : undefined}
                      placeholder="Categoria"
                      options={opts(categories)}
                      value={sp.category_id ?? ""}
                      onChange={(v) => setSplit(i, { category_id: v || null })}
                    />
                    <Select
                      label={i === 0 ? "Centro de custo" : undefined}
                      placeholder="Centro de custo"
                      options={opts(costCenters)}
                      value={sp.cost_center_id ?? ""}
                      onChange={(v) => setSplit(i, { cost_center_id: v || null })}
                    />
                    <Input
                      label={i === 0 ? "%" : undefined}
                      inputMode="numeric"
                      value={sp.percent ?? ""}
                      onChange={(e) =>
                        setSplit(i, {
                          percent: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                    <button
                      type="button"
                      aria-label="Remover linha"
                      className="h-10 inline-flex items-center justify-center text-faint hover:text-ink"
                      onClick={() =>
                        setF((s) => ({
                          ...s,
                          splits: s.splits.filter((_, idx) => idx !== i),
                        }))
                      }
                    >
                      <Icon name="x" size={15} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="self-start inline-flex items-center gap-1 text-label font-medium text-muted hover:text-ink"
                  onClick={() =>
                    setF((s) => ({
                      ...s,
                      splits: [
                        ...s.splits,
                        { category_id: null, cost_center_id: null, percent: null },
                      ],
                    }))
                  }
                >
                  <Icon name="plus" size={14} /> Adicionar linha
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Categoria"
                required
                placeholder="Selecione a categoria"
                options={opts(categories)}
                value={f.category_id}
                onChange={(v) => set({ category_id: v })}
                invalid={invalid("category_id")}
              />
              <Select
                label="Centro de custo"
                placeholder="Selecione (opcional)"
                options={opts(costCenters)}
                value={f.cost_center_id}
                onChange={(v) => set({ cost_center_id: v })}
              />
            </div>

            <Input
              label="Código de referência"
              value={f.reference_code}
              onChange={(e) => set({ reference_code: e.target.value })}
            />

            <Switch
              label="Repetir lançamento?"
              checked={f.repeatOn}
              onChange={(v) => set({ repeatOn: v })}
            />
            {f.repeatOn && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-md border border-border-soft p-3">
                <Select
                  label="Frequência"
                  options={FREQ_OPTIONS}
                  value={f.repeatFreq}
                  onChange={(v) => set({ repeatFreq: v as RecurrenceFreq })}
                />
                <Select
                  label="Terminar por"
                  options={[
                    { value: "count", label: "Nº de repetições" },
                    { value: "until", label: "Data final" },
                  ]}
                  value={f.repeatMode}
                  onChange={(v) => set({ repeatMode: v as "count" | "until" })}
                />
                {f.repeatMode === "count" ? (
                  <Input
                    label="Repetições"
                    inputMode="numeric"
                    value={f.repeatCount}
                    onChange={(e) => set({ repeatCount: Number(e.target.value) || 1 })}
                  />
                ) : (
                  <DateField
                    label="Data final"
                    value={f.repeatUntil}
                    onChange={(v) => set({ repeatUntil: v })}
                  />
                )}
              </div>
            )}

            <SectionTitle>Condição de pagamento</SectionTitle>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Parcelamento"
                required
                options={[
                  { value: "avista", label: "À vista" },
                  { value: "parcelado", label: "Parcelado" },
                ]}
                value={f.installmentsMode}
                onChange={(v) =>
                  set({ installmentsMode: v as "avista" | "parcelado" })
                }
              />
              {f.installmentsMode === "parcelado" ? (
                <Input
                  label="Nº de parcelas"
                  inputMode="numeric"
                  value={f.installments}
                  onChange={(e) => set({ installments: Number(e.target.value) || 2 })}
                />
              ) : (
                <DateField
                  label="Vencimento"
                  required
                  value={f.due_date}
                  onChange={(v) => set({ due_date: v })}
                  invalid={invalid("due_date")}
                />
              )}
            </div>

            {f.installmentsMode === "parcelado" && (
              <DateField
                label="Vencimento da 1ª parcela"
                required
                value={f.due_date}
                onChange={(v) => set({ due_date: v })}
                invalid={invalid("due_date")}
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Forma de pagamento"
                placeholder="Selecione"
                options={PAYMENT_METHODS}
                value={f.payment_method}
                onChange={(v) => set({ payment_method: v })}
              />
              <Select
                label={isReceita ? "Conta de recebimento" : "Conta de pagamento"}
                placeholder="Selecione a conta"
                options={opts(accounts)}
                value={f.account_id}
                onChange={(v) => set({ account_id: v })}
              />
            </div>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={f.settled}
                onChange={(e) => set({ settled: e.target.checked })}
                className="w-[18px] h-[18px] accent-ink"
              />
              <span className="text-[17px] text-ink">
                {isReceita ? "Recebido" : "Pago"} (baixa imediata)
              </span>
            </label>

            <Switch
              label="Informar NSU?"
              checked={f.nsuOn}
              onChange={(v) => set({ nsuOn: v })}
            />
            {f.nsuOn && (
              <Input
                label="NSU"
                value={f.nsu}
                onChange={(e) => set({ nsu: e.target.value })}
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border-soft">
            <Button variant="ghost" onClick={onClose}>
              Voltar
            </Button>
            <SplitButton
              label={create.isPending ? "Salvando…" : "Salvar"}
              disabled={create.isPending}
              onClick={() => submit(false)}
              items={[{ id: "again", label: "Salvar e criar outro" }]}
              onSelect={() => submit(true)}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
