"use client";

/**
 * Transferências entre contas — lista, filtros e o formulário.
 *
 * A transferência não é receita nem despesa: é o mesmo dinheiro mudando de
 * lugar. Por isso ela tem cards próprios e colunas próprias no fluxo de caixa —
 * misturá-la com entradas e saídas inflaria o faturamento com dinheiro que já
 * era da empresa.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card, Button, Icon, Input, Select, DateField, CurrencyInput, Checkbox, BRL, Skeleton,
} from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { useAccounts, useRiscoInput } from "@/components/visao-geral/hooks";
import { baixarXLSX } from "@/lib/xlsx";
import {
  filtrarTransferencias, resumoTransferencias, validarTransferencia,
  type Transferencia, type FiltroTransferencias,
} from "@/core/movimentacoes";
import {
  listarTransferencias, criarTransferencia, removerTransferencia,
  marcarConciliacaoTransferencia, novoIdMov,
} from "@/lib/movimentacoes";

const hoje = () => new Date().toISOString().slice(0, 10);
const fmtDia = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");

export function TransferenciasView() {
  const qc = useQueryClient();
  const { data: contas } = useAccounts();
  const { data: input } = useRiscoInput();
  const { show, node } = useToast();

  const [lista, setLista] = React.useState<Transferencia[] | null>(null);
  const [filtro, setFiltro] = React.useState<FiltroTransferencias>({ conciliacao: "todas" });
  const [nova, setNova] = React.useState(false);

  React.useEffect(() => { setLista(listarTransferencias()); }, []);

  const visiveis = React.useMemo(
    () => filtrarTransferencias(lista ?? [], filtro),
    [lista, filtro],
  );
  const resumo = React.useMemo(
    () => resumoTransferencias(visiveis, input?.hoje ?? hoje()),
    [visiveis, input],
  );

  const nomeConta = (id: string) => (contas?.accounts ?? []).find((c) => c.id === id)?.name ?? "—";
  const opcoesConta = (contas?.accounts ?? []).map((c) => ({ value: c.id, label: c.name }));

  const linhasXLSX = React.useMemo(() => [
    ["ID", "Data", "Chegada", "Origem", "Destino", "Valor", "Descrição", "Conciliada origem", "Conciliada destino"],
    ...visiveis.map((t) => [
      t.id, t.data, t.dataChegada ?? t.data, nomeConta(t.contaOrigem), nomeConta(t.contaDestino),
      t.valor, t.descricao, t.conciliadaOrigem ? "Sim" : "Não", t.conciliadaDestino ? "Sim" : "Não",
    ]),
  ], [visiveis, contas]); // eslint-disable-line react-hooks/exhaustive-deps

  if (nova) {
    return (
      <FormTransferencia
        contas={opcoesConta}
        onCancelar={() => setNova(false)}
        onSalvo={async (t) => {
          setLista(await criarTransferencia(t));
          setNova(false);
          // A transferência mexe no saldo das duas contas — invalidar aqui é o
          // que faz o extrato e o fluxo reagirem sem recarregar a página.
          qc.invalidateQueries();
          show("Transferência registrada.");
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted">Movimentações entre as suas próprias contas bancárias.</p>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="primary" onClick={() => setNova(true)}>
            <Icon name="plus" size={15} color="currentColor" />
            Nova transferência
          </Button>
          <Button
            variant="ghost" disabled={visiveis.length === 0}
            onClick={() => baixarXLSX("transferencias", [{ nome: "Transferências", linhas: linhasXLSX }])}
          >
            <Icon name="arrow-down-to-line" size={15} color="currentColor" />
            Exportar XLSX
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Numero label="Total de transferências" valor={String(resumo.total)} />
        <Numero label="Valor total" valor={<BRL value={resumo.valor} />} />
        <Numero label="Este mês" valor={String(resumo.noMes)} />
      </div>

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Campo label="Data de">
            <DateField value={filtro.de ?? ""} onChange={(v) => setFiltro((f) => ({ ...f, de: v || null }))} />
          </Campo>
          <Campo label="Data até">
            <DateField value={filtro.ate ?? ""} onChange={(v) => setFiltro((f) => ({ ...f, ate: v || null }))} />
          </Campo>
          <Campo label="Conta de origem">
            <Select
              value={filtro.origem ?? ""}
              onChange={(v) => setFiltro((f) => ({ ...f, origem: v || null }))}
              options={[{ value: "", label: "Todas" }, ...opcoesConta]}
            />
          </Campo>
          <Campo label="Conta de destino">
            <Select
              value={filtro.destino ?? ""}
              onChange={(v) => setFiltro((f) => ({ ...f, destino: v || null }))}
              options={[{ value: "", label: "Todas" }, ...opcoesConta]}
            />
          </Campo>
          <Campo label="Conciliação">
            <Select
              value={filtro.conciliacao ?? "todas"}
              onChange={(v) => setFiltro((f) => ({ ...f, conciliacao: v as FiltroTransferencias["conciliacao"] }))}
              options={[
                { value: "todas", label: "Todas" },
                { value: "sim", label: "Conciliadas (os dois lados)" },
                { value: "nao", label: "Falta conciliar" },
              ]}
            />
          </Campo>
        </div>
      </Card>

      {lista === null ? (
        <Card><Skeleton className="h-[200px]" /></Card>
      ) : visiveis.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-surface-2">
              <Icon name="arrow-left-right" size={20} color="var(--color-text-tertiary)" />
            </span>
            <p className="m-0 text-label text-muted max-w-[44ch]">
              {(lista ?? []).length === 0
                ? "Nenhuma transferência registrada. Ela move o saldo entre as suas contas sem virar receita nem despesa."
                : "Nenhuma transferência encontrada com esses filtros."}
            </p>
            <Button variant="primary" onClick={() => setNova(true)}>Nova transferência</Button>
          </div>
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  <Th>Data</Th>
                  <Th>Origem → Destino</Th>
                  <Th>Descrição</Th>
                  <Th direita>Valor</Th>
                  <Th>Conciliação</Th>
                  <Th direita>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((t) => (
                  <tr key={t.id} className="border-b border-border-soft last:border-0 hover:bg-surface-2/60 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex flex-col">
                        <span className="text-label text-ink tabular-nums">{fmtDia(t.data)}</span>
                        {t.dataChegada && t.dataChegada !== t.data && (
                          <span className="text-caption text-faint tabular-nums">chega {fmtDia(t.dataChegada)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center gap-2 text-label text-ink">
                        {nomeConta(t.contaOrigem)}
                        <Icon name="arrow-up-right" size={13} color="var(--color-text-tertiary)" />
                        {nomeConta(t.contaDestino)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-label text-muted">{t.descricao || "—"}</td>
                    <td className="px-6 py-3 text-right text-label text-ink tabular-nums"><BRL value={t.valor} /></td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={t.conciliadaOrigem}
                          onChange={(e) => setLista(marcarConciliacaoTransferencia(t.id, "origem", e.target.checked))}
                          label="Origem"
                        />
                        <Checkbox
                          checked={t.conciliadaDestino}
                          onChange={(e) => setLista(marcarConciliacaoTransferencia(t.id, "destino", e.target.checked))}
                          label="Destino"
                        />
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            if (!window.confirm("Excluir a transferência? Os dois lançamentos que ela gerou saem junto.")) return;
                            setLista(removerTransferencia(t.id));
                            qc.invalidateQueries();
                            show("Transferência removida.");
                          }}
                          aria-label="Excluir"
                          className="p-[6px] rounded-md text-muted hover:text-negative hover:bg-surface-2"
                        >
                          <Icon name="trash-2" size={15} color="currentColor" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {node}
    </div>
  );
}

/* ------------------------------- formulário ------------------------------- */

function FormTransferencia({
  contas, onCancelar, onSalvo,
}: {
  contas: { value: string; label: string }[];
  onCancelar: () => void;
  onSalvo: (t: Transferencia) => void;
}) {
  const [f, setF] = React.useState({
    contaOrigem: "", contaDestino: "", data: hoje(),
    chegadaDiferente: false, dataChegada: hoje(), valor: 0, descricao: "",
  });
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const salvar = () => {
    const t: Transferencia = {
      id: novoIdMov("tr"),
      contaOrigem: f.contaOrigem, contaDestino: f.contaDestino, data: f.data,
      dataChegada: f.chegadaDiferente ? f.dataChegada : null,
      valor: f.valor, descricao: f.descricao.trim(),
      conciliadaOrigem: false, conciliadaDestino: false,
      criadoEm: hoje(),
    };
    const e = validarTransferencia(t);
    setErros(e);
    if (Object.keys(e).length > 0) return;
    onSalvo(t);
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      <p className="m-0 text-label text-muted">Realize uma transferência entre contas bancárias.</p>

      <Card>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Conta bancária de origem</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
          <Campo label="Conta bancária" obrigatorio erro={erros.contaOrigem}>
            <Select
              value={f.contaOrigem} onChange={(v) => set("contaOrigem", v)}
              placeholder="Selecione uma conta" options={contas}
            />
          </Campo>
          <Campo label="Data da transferência" erro={erros.data}>
            <DateField value={f.data} onChange={(v) => set("data", v)} />
          </Campo>
        </div>

        <div className="mt-6 pt-6 border-t border-border-soft">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Conta bancária de destino</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 items-start">
            <Campo label="Conta bancária" obrigatorio erro={erros.contaDestino}>
              <Select
                value={f.contaDestino} onChange={(v) => set("contaDestino", v)}
                placeholder="Selecione uma conta" options={contas}
              />
            </Campo>
            <div className="flex flex-col gap-3 pt-6">
              {/* TED entre bancos costuma chegar no dia seguinte: sem esta chave
                  o saldo do destino subiria antes de o dinheiro existir lá. */}
              <Checkbox
                checked={f.chegadaDiferente}
                onChange={(e) => set("chegadaDiferente", e.target.checked)}
                label="Data de chegada diferente"
              />
              {f.chegadaDiferente && (
                <Campo label="Data de chegada" erro={erros.dataChegada}>
                  <DateField value={f.dataChegada} onChange={(v) => set("dataChegada", v)} />
                </Campo>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-border-soft">
          <Campo label="Valor da transferência" obrigatorio erro={erros.valor}>
            <CurrencyInput value={f.valor} onValueChange={(v) => set("valor", v)} />
          </Campo>
          <Campo label="Descrição">
            <Input
              value={f.descricao} onChange={(e) => set("descricao", e.target.value)}
              placeholder="Ex.: Transferência para investimento"
            />
          </Campo>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border-soft">
          <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button variant="primary" onClick={salvar} disabled={contas.length < 2}>
            <Icon name="check" size={15} color="currentColor" />
            Salvar transferência
          </Button>
        </div>
        {contas.length < 2 && (
          <p className="m-0 mt-3 text-caption text-warning">
            É preciso ter ao menos duas contas bancárias cadastradas para transferir.
          </p>
        )}
      </Card>
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

function Numero({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <Card>
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{label}</span>
      <span className="block mt-2 text-[24px] leading-none font-semibold text-ink tabular-nums">{valor}</span>
    </Card>
  );
}

function Th({ children, direita }: { children: React.ReactNode; direita?: boolean }) {
  return (
    <th className={`px-6 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-faint ${direita ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Campo({
  label, obrigatorio, erro, children,
}: { label: string; obrigatorio?: boolean; erro?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-caption font-medium text-muted">
        {label}{obrigatorio && <span className="text-negative"> *</span>}
      </label>
      {children}
      {erro && <span className="text-caption text-negative">{erro}</span>}
    </div>
  );
}
