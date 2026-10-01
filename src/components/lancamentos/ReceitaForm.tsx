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
import { useOpcoesCadastro } from "./opcoes-cadastro";
import { useTipoConta } from "@/components/app/useTipoConta";
import { motivoDaRecusa } from "@/lib/erros";
import { rateioValido } from "@/core/registros";
import type {
  CategoryKind,
  LancamentoInput,
  RecurrenceFreq,
  PaymentMethod,
  SplitLine,
} from "@/lib/types";
import {
  usePartiesByRole,
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
  project_id: string;
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
  project_id: "",
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
  titulo,
  onClose,
  onToast,
}: {
  kind?: CategoryKind;
  /**
   * O cabeçalho do modal. Quem abriu por "Nova conta a pagar" tem de ler o
   * MESMO nome no topo do formulário — clicar num nome e chegar noutro faz a
   * pessoa duvidar de que clicou certo. Sem título, vale "Nova receita/despesa".
   */
  titulo?: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const isReceita = kind === "receita";
  // ⚠️ No modo PESSOAL os campos de empresa somem: fornecedor/cliente, centro
  // de custo, projeto, código de referência e NSU não existem na vida de uma
  // pessoa física — oferecê-los transforma "anotar um gasto" num formulário
  // contábil. Escondido também NÃO é enviado (buildInput zera).
  const { pessoal } = useTipoConta();
  const partyRole = isReceita ? "customer" : "supplier";

  const { data: parties } = usePartiesByRole(partyRole);
  // ⚠️ Categoria, centro, projeto e conta da TABELA (`opcoes-cadastro`) — o
  // projeto vinha do cadastro antigo do navegador (id "5001") e era recusado
  // pelo banco ao salvar. Só o que pode receber lançamento novo aparece.
  const opcoes = useOpcoesCadastro(isReceita ? "entrada" : "saida");
  const create = useCreateLancamento();

  const [f, setF] = React.useState<FormState>(initialState);
  const [tried, setTried] = React.useState(false);
  const set = (patch: Partial<FormState>) => setF((s) => ({ ...s, ...patch }));

  const opts = (arr?: { id: string; name: string }[]): SelectOption[] =>
    (arr ?? []).filter((x) => (x as { ativo?: boolean }).ativo !== false).map((x) => ({ value: x.id, label: x.name }));

  const errors = {
    competence_date: !f.competence_date,
    description: !f.description.trim(),
    amount: f.amount <= 0,
    category_id: !f.category_id,
    due_date: !f.due_date,
    // ⚠️ Baixa imediata sem conta é dinheiro que saiu (ou entrou) de lugar
    // nenhum: em produção o saldo das contas não se move e o DRE conta o
    // título como pago; na demonstração o dataset o jogava na PRIMEIRA conta,
    // calado. A baixa da linha (ModalBaixa) já exige a conta — aqui também.
    account_id: f.settled && !f.account_id,
    // O rateio fecha 100% — senão a fatia gravada não explica o lançamento.
    rateio: f.rateioOn && !rateioValido(f.splits
      .filter((sp) => sp.category_id || sp.cost_center_id)
      .map((sp, i) => ({ id: String(i + 1), percentual: Number(sp.percent) || 0 }))),
  };
  const invalid = (k: keyof typeof errors) => tried && errors[k];

  const buildInput = (): LancamentoInput => ({
    kind,
    party_id: pessoal ? null : f.party_id || null,
    competence_date: f.competence_date,
    description: f.description.trim(),
    amount: f.amount,
    category_id: f.category_id || null,
    cost_center_id: pessoal ? null : f.cost_center_id || null,
    project_id: pessoal ? null : f.project_id || null,
    reference_code: pessoal ? null : f.reference_code.trim() || null,
    splits: f.rateioOn
      ? (pessoal ? f.splits.map((sp) => ({ ...sp, cost_center_id: null })) : f.splits)
      : null,
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
    nsu: !pessoal && f.nsuOn ? f.nsu.trim() || null : null,
  });

  const submit = async (again: boolean) => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) {
      onToast(
        errors.rateio ? "O rateio precisa somar 100%."
        : errors.account_id ? `Escolha a conta de ${isReceita ? "recebimento" : "pagamento"}: a baixa imediata move o saldo de uma conta.`
        : "Revise os campos obrigatórios",
      );
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
    } catch (err) {
      // ⚠️ A mensagem REAL do banco (e o `hint`) vai para a tela: "tente
      // novamente" é o único conselho que não funciona quando o banco recusa.
      onToast(`Não foi possível salvar: ${motivoDaRecusa(err)}`);
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
              {titulo ?? (isReceita ? "Nova receita" : "Nova despesa")}
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

            {!pessoal && (
              <Select
                label={isReceita ? "Cliente" : "Fornecedor"}
                placeholder={`Selecione um ${isReceita ? "cliente" : "fornecedor"} (opcional)`}
                options={opts(parties)}
                value={f.party_id}
                onChange={(v) => set({ party_id: v })}
              />
            )}

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
                  <div key={i} className={`grid ${pessoal ? "grid-cols-[1fr_90px_32px]" : "grid-cols-[1fr_1fr_90px_32px]"} gap-2 items-end`}>
                    <Select
                      label={i === 0 ? "Categoria" : undefined}
                      placeholder="Categoria"
                      options={opcoes.categorias}
                      value={sp.category_id ?? ""}
                      onChange={(v) => setSplit(i, { category_id: v || null })}
                    />
                    {!pessoal && (
                      <Select
                        label={i === 0 ? "Centro de custo" : undefined}
                        placeholder="Centro de custo"
                        options={opcoes.centros}
                        value={sp.cost_center_id ?? ""}
                        onChange={(v) => setSplit(i, { cost_center_id: v || null })}
                      />
                    )}
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
                options={opcoes.categorias}
                value={f.category_id}
                onChange={(v) => set({ category_id: v })}
                invalid={invalid("category_id")}
              />
              {!pessoal && (
                <Select
                  label="Centro de custo"
                  placeholder="Selecione (opcional)"
                  options={opcoes.centros}
                  value={f.cost_center_id}
                  onChange={(v) => set({ cost_center_id: v })}
                />
              )}
              {/* Projeto = centro de resultado TEMPORAL (uma campanha, um
                  lançamento). É o que faz o filtro "Projeto" da DRE/DFC
                  realmente filtrar. */}
              {!pessoal && (
                <Select
                  label="Projeto"
                  placeholder="Selecione (opcional)"
                  options={opcoes.projetos}
                  value={f.project_id}
                  onChange={(v) => set({ project_id: v })}
                />
              )}
            </div>

            {!pessoal && (
              <Input
                label="Código de referência"
                value={f.reference_code}
                onChange={(e) => set({ reference_code: e.target.value })}
              />
            )}

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
                options={opcoes.contas}
                value={f.account_id}
                onChange={(v) => set({ account_id: v })}
                invalid={invalid("account_id")}
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

            {!pessoal && (
              <Switch
                label="Informar NSU?"
                checked={f.nsuOn}
                onChange={(v) => set({ nsuOn: v })}
              />
            )}
            {!pessoal && f.nsuOn && (
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
