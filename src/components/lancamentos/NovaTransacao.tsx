"use client";

import * as React from "react";
import { FormModal, SectionTitle } from "./FormModal";
import { Input, Select, CurrencyInput, DateField } from "@/components/ui";
import { useCreateLancamento, useCategories, useAccountsList, usePartiesByRole } from "./hooks";
import { isoDay } from "@/lib/aggregations";
import { cn } from "@/lib/utils";
import type { LancamentoInput } from "@/lib/types";

/**
 * "Nova transação" — porta ÚNICA de cadastro (relatório de melhorias, item 4).
 * Em vez de o usuário escolher a tela certa (a pagar / a receber / lançar /
 * baixar), ele responde "entrou, saiu ou é previsto?" e um formulário
 * progressivo cria o lançamento. Monta no AppShell e abre pelo evento
 * `a4p:open-nova-transacao` (item "Nova transação" da Sidebar / "+").
 * Demo-safe: reusa `useCreateLancamento` (mesma fonte do ReceitaForm).
 */

type Tipo = "recebi" | "paguei" | "a_receber" | "a_pagar";
const TIPOS: { id: Tipo; label: string; hint: string; kind: "receita" | "despesa"; settled: boolean }[] = [
  { id: "recebi", label: "Recebi", hint: "entrada já realizada", kind: "receita", settled: true },
  { id: "paguei", label: "Paguei", hint: "saída já realizada", kind: "despesa", settled: true },
  { id: "a_receber", label: "Vou receber", hint: "entrada prevista", kind: "receita", settled: false },
  { id: "a_pagar", label: "Vou pagar", hint: "saída prevista", kind: "despesa", settled: false },
];

export function NovaTransacao() {
  const [aberto, setAberto] = React.useState(false);
  const [tipo, setTipo] = React.useState<Tipo | null>(null);

  React.useEffect(() => {
    const open = () => { setTipo(null); setAberto(true); };
    window.addEventListener("a4p:open-nova-transacao", open);
    return () => window.removeEventListener("a4p:open-nova-transacao", open);
  }, []);

  if (!aberto) return null;
  return (
    <FormModalShell
      tipo={tipo}
      onPickTipo={setTipo}
      onClose={() => setAberto(false)}
    />
  );
}

function FormModalShell({ tipo, onPickTipo, onClose }: { tipo: Tipo | null; onPickTipo: (t: Tipo) => void; onClose: () => void }) {
  const cfg = TIPOS.find((t) => t.id === tipo) ?? null;
  const kind = cfg?.kind ?? "receita";

  const create = useCreateLancamento();
  const { data: categorias } = useCategories(kind);
  const { data: contas } = useAccountsList();
  const { data: contatos } = usePartiesByRole(kind === "receita" ? "customer" : "supplier");

  const [valor, setValor] = React.useState(0);
  const [data, setData] = React.useState(isoDay(new Date()));
  const [partyId, setPartyId] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [descricao, setDescricao] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);

  // conta padrão = primeira
  React.useEffect(() => {
    if (!accountId && contas && contas.length) setAccountId(contas[0].id);
  }, [contas, accountId]);

  function salvar() {
    if (!cfg) return;
    if (!(valor > 0)) { setErro("Informe um valor maior que zero."); return; }
    const input: LancamentoInput = {
      kind: cfg.kind,
      party_id: partyId || null,
      competence_date: data,
      description: descricao || (cfg.kind === "receita" ? "Entrada" : "Saída"),
      amount: valor,
      category_id: categoryId || null,
      cost_center_id: null,
      reference_code: null,
      splits: null,
      repeat: null,
      installments: 1,
      due_date: data,
      payment_method: null,
      account_id: accountId || (contas?.[0]?.id ?? null),
      settled: cfg.settled,
      nsu: null,
    };
    create.mutate(input, { onSuccess: onClose, onError: () => setErro("Não foi possível salvar — tente novamente.") });
  }

  // Passo 1: escolher o tipo.
  if (!cfg) {
    return (
      <FormModal title="Nova transação" size="medium" onClose={onClose} onSave={() => { /* sem passo */ }} saving={false}>
        <SectionTitle>O que aconteceu?</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              onClick={() => onPickTipo(t.id)}
              className="flex flex-col items-start gap-1 rounded-md border border-border bg-white p-4 text-left hover:border-ink/40"
            >
              <span className="text-body font-medium text-ink">{t.label}</span>
              <span className="text-caption text-faint">{t.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-caption text-faint mt-3">
          Uma porta só: escolha e o sistema decide o destino (lançamento, título a vencer ou baixa).
        </p>
      </FormModal>
    );
  }

  // Passo 2: formulário progressivo.
  return (
    <FormModal title={`Nova transação · ${cfg.label}`} size="medium" onClose={onClose} onSave={salvar} saving={create.isPending}>
      <div className="flex flex-col gap-4">
        <CurrencyInput label="Valor" value={valor} onValueChange={setValor} />
        <DateField label={cfg.settled ? "Data" : "Vencimento"} value={data} onChange={setData} />
        <Select
          label={kind === "receita" ? "Cliente (opcional)" : "Fornecedor (opcional)"}
          value={partyId}
          onChange={setPartyId}
          placeholder="Selecionar contato"
          options={(contatos ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
        <Select
          label="Categoria (opcional)"
          value={categoryId}
          onChange={setCategoryId}
          placeholder="Selecionar categoria"
          options={(categorias ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          label="Conta"
          value={accountId}
          onChange={setAccountId}
          placeholder="Selecionar conta"
          options={(contas ?? []).map((a) => ({ value: a.id, label: a.name }))}
        />
        <Input label="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Venda balcão, aluguel…" />
        {erro && <p className={cn("text-caption text-negative")}>{erro}</p>}
      </div>
    </FormModal>
  );
}
