"use client";

/**
 * Vendas — a lista, com os dois painéis de status do print.
 *
 * A venda é o documento-mãe: ela propaga para o recebível, ampara a NF e é a
 * base do imposto. Por isso a tela tem DOIS painéis — o status comercial da
 * venda e o status fiscal da nota. São perguntas diferentes: uma venda completa
 * com a NF a emitir é trabalho pendente, e um painel só esconderia isso.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Icon, Input, Select, BRL, Skeleton } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { baixarXLSX } from "@/lib/xlsx";
import {
  filtrarVendas, painelStatusVendas, painelStatusNF, valorLiquido,
  STATUS_VENDA, STATUS_NF, PLATAFORMAS,
  type Venda, type FiltroVendas, type CardVenda, type StatusVenda, type StatusNF,
} from "@/core/vendas";
import { listarVendas, removerVenda } from "@/lib/vendas-store";
import { Painel, CardAnel } from "@/components/paineis/shared";

const fmtDia = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const PAGINAS = [50, 100, 250, 500, 1000];

const COR_NF: Record<StatusNF, string> = {
  emitida: "var(--color-positive)",
  processando: "var(--color-warning)",
  a_emitir: "var(--color-placeholder)",
  cancelada: "var(--color-muted)",
  negada: "var(--color-negative)",
};

export function VendasView() {
  const router = useRouter();
  const { show, node } = useToast();
  const [lista, setLista] = React.useState<Venda[] | null>(null);
  const [busca, setBusca] = React.useState("");
  const [filtro, setFiltro] = React.useState<FiltroVendas>({ status: "todos", statusNF: "todos" });
  const [abrirFiltro, setAbrirFiltro] = React.useState(false);
  const [layout, setLayout] = React.useState<"resumida" | "detalhada">("resumida");
  const [porPagina, setPorPagina] = React.useState(50);
  const [pagina, setPagina] = React.useState(1);

  React.useEffect(() => { setLista(listarVendas()); }, []);

  const vendas = React.useMemo(
    () => filtrarVendas(lista ?? [], { ...filtro, busca }),
    [lista, filtro, busca],
  );
  const cardsVenda = React.useMemo(() => painelStatusVendas(vendas), [vendas]);
  const cardsNF = React.useMemo(() => painelStatusNF(vendas), [vendas]);

  const totalPaginas = Math.max(1, Math.ceil(vendas.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = vendas.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);

  const linhasXLSX = React.useMemo(() => [
    ["Número", "Competência", "Vencimento", "Cliente", "Produtos", "Valor total", "Líquido", "Status", "Status NF", "Plataforma", "ID externo"],
    ...vendas.map((v) => [
      v.numero, v.competencia, v.vencimento, v.clienteNome,
      v.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(" · "),
      v.valorTotal, valorLiquido(v),
      STATUS_VENDA.find((s) => s.id === v.status)?.label ?? v.status,
      STATUS_NF.find((s) => s.id === v.statusNF)?.label ?? v.statusNF,
      v.plataforma, v.idExterno,
    ]),
  ], [vendas]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted">Controle de vendas e notas fiscais.</p>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="primary" onClick={() => router.push("/dashboard/sales-invoices/new")}>
            <Icon name="plus" size={15} color="currentColor" />
            Nova venda
          </Button>
          <Button variant="ghost" disabled={vendas.length === 0}
            onClick={() => baixarXLSX("vendas", [{ nome: "Vendas", linhas: linhasXLSX }])}>
            <Icon name="arrow-down-to-line" size={15} color="currentColor" />
            Exportar XLSX
          </Button>
          <Button variant="ghost" disabled={vendas.length === 0} onClick={() => window.print()}>
            <Icon name="file-text" size={15} color="currentColor" />
            Exportar PDF
          </Button>
          <Button variant="ghost" onClick={() => router.push("/dashboard/financial/import?tipo=receber")}>
            <Icon name="upload" size={15} color="currentColor" />
            Importar vendas
          </Button>
        </div>
      </div>

      <Painel titulo="Painel status da venda" cards={cardsVenda}
        onEscolher={(id) => { setFiltro((f) => ({ ...f, status: (id === "total" ? "todos" : id) as StatusVenda | "todos" })); setPagina(1); }} />
      <Painel titulo="Painel status das notas fiscais" cards={cardsNF}
        onEscolher={(id) => {
          const mapa: Record<string, StatusNF | "todos"> = { emitidas: "emitida", a_emitir: "a_emitir", erro: "negada", total: "todos" };
          setFiltro((f) => ({ ...f, statusNF: mapa[id] ?? "todos" }));
          setPagina(1);
        }} />

      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-caption text-muted">Layout da tabela</span>
            <Select
              value={layout} onChange={(v) => setLayout(v as "resumida" | "detalhada")}
              options={[{ value: "resumida", label: "Resumida" }, { value: "detalhada", label: "Detalhada" }]}
              containerClassName="w-[150px]"
            />
          </div>
          <Input
            value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
            placeholder="Número, cliente…" containerClassName="flex-1 min-w-[200px]"
          />
          <Button variant="ghost" onClick={() => setAbrirFiltro((v) => !v)}>
            <Icon name="list-checks" size={15} color="currentColor" />
            Filtro
          </Button>
        </div>

        {abrirFiltro && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 pt-4 border-t border-border-soft">
            <Campo label="Status da venda">
              <Select
                value={filtro.status ?? "todos"}
                onChange={(v) => setFiltro((f) => ({ ...f, status: v as StatusVenda | "todos" }))}
                options={[{ value: "todos", label: "Todos" }, ...STATUS_VENDA.map((s) => ({ value: s.id, label: s.label }))]}
              />
            </Campo>
            <Campo label="Status da NF">
              <Select
                value={filtro.statusNF ?? "todos"}
                onChange={(v) => setFiltro((f) => ({ ...f, statusNF: v as StatusNF | "todos" }))}
                options={[{ value: "todos", label: "Todos" }, ...STATUS_NF.map((s) => ({ value: s.id, label: s.label }))]}
              />
            </Campo>
            <Campo label="Plataforma">
              <Select
                value={filtro.plataforma ?? ""}
                onChange={(v) => setFiltro((f) => ({ ...f, plataforma: v || null }))}
                options={[{ value: "", label: "Todas" }, ...PLATAFORMAS.map((p) => ({ value: p, label: p }))]}
              />
            </Campo>
          </div>
        )}
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border-soft flex-wrap">
          <div className="flex items-center gap-2 text-caption text-muted">
            Por página
            <Select
              value={String(porPagina)} onChange={(v) => { setPorPagina(Number(v)); setPagina(1); }}
              options={PAGINAS.map((n) => ({ value: String(n), label: String(n) }))}
              containerClassName="w-[92px]"
            />
            de <b className="text-ink tabular-nums">{vendas.length}</b>
          </div>
          <div className="flex items-center gap-1">
            <Seta label="Anterior" icone="chevron-left" disabled={paginaAtual <= 1} onClick={() => setPagina((p) => p - 1)} />
            <span className="text-caption text-muted tabular-nums px-2">{paginaAtual} / {totalPaginas}</span>
            <Seta label="Próxima" icone="chevron-right" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina((p) => p + 1)} />
          </div>
        </div>

        {lista === null ? (
          <div className="p-6"><Skeleton className="h-[200px]" /></div>
        ) : visiveis.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-surface-2">
              <Icon name="shopping-cart" size={20} color="var(--color-text-tertiary)" />
            </span>
            <p className="m-0 text-label text-muted max-w-[46ch]">
              {(lista ?? []).length === 0
                ? "Nenhuma venda registrada. A venda gera o recebível, ampara a nota fiscal e entra no cálculo do imposto."
                : "Nenhuma venda encontrada com esses filtros."}
            </p>
            <Button variant="primary" onClick={() => router.push("/dashboard/sales-invoices/new")}>Nova venda</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  <Th>Data</Th>
                  <Th>Nº</Th>
                  <Th>Cliente</Th>
                  <Th>Produtos</Th>
                  {layout === "detalhada" && <><Th>Plataforma</Th><Th direita>Líquido</Th></>}
                  <Th direita>Valor total</Th>
                  <Th>Status</Th>
                  <Th>NF</Th>
                  <Th direita>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((v) => (
                  <tr key={v.id} className="border-b border-border-soft last:border-0 hover:bg-surface-2/60 transition-colors">
                    <td className="px-6 py-3 text-label text-ink tabular-nums">{fmtDia(v.competencia)}</td>
                    <td className="px-6 py-3 text-caption text-faint tabular-nums">{v.numero}</td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => v.clienteId && window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: v.clienteId } }))}
                        className="text-label text-ink hover:underline decoration-dotted underline-offset-4 text-left"
                      >
                        {v.clienteNome || "—"}
                      </button>
                    </td>
                    <td className="px-6 py-3 text-label text-muted truncate max-w-[28ch]">
                      {v.itens.filter((i) => i.nome).map((i) => `${i.quantidade}× ${i.nome}`).join(" · ") || "—"}
                    </td>
                    {layout === "detalhada" && (
                      <>
                        <td className="px-6 py-3 text-label text-muted">{v.plataforma || "—"}</td>
                        <td className="px-6 py-3 text-right text-label text-muted tabular-nums"><BRL value={valorLiquido(v)} /></td>
                      </>
                    )}
                    <td className="px-6 py-3 text-right text-label text-ink tabular-nums"><BRL value={v.valorTotal} /></td>
                    <td className="px-6 py-3">
                      <span className="text-caption text-muted">{STATUS_VENDA.find((s) => s.id === v.status)?.label}</span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center gap-[6px] text-caption text-muted">
                        <span className="w-[7px] h-[7px] rounded-pill" style={{ background: COR_NF[v.statusNF] }} />
                        {STATUS_NF.find((s) => s.id === v.statusNF)?.label}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => router.push(`/dashboard/sales-invoices/new?id=${v.id}`)}
                          aria-label="Editar" className="p-[6px] rounded-md text-muted hover:text-ink hover:bg-surface-2"
                        >
                          <Icon name="edit" size={15} color="currentColor" />
                        </button>
                        <button
                          onClick={() => {
                            if (!window.confirm(`Excluir a venda ${v.numero}? O recebível que ela gerou sai junto.`)) return;
                            setLista(removerVenda(v.id));
                            show("Venda removida.");
                          }}
                          aria-label="Excluir" className="p-[6px] rounded-md text-muted hover:text-negative hover:bg-surface-2"
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
        )}
      </Card>
      {node}
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

function Th({ children, direita }: { children: React.ReactNode; direita?: boolean }) {
  return (
    <th className={`px-6 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-faint ${direita ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-caption font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

function Seta({ label, icone, onClick, disabled }: { label: string; icone: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick} disabled={disabled} aria-label={label}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-35 transition-colors"
    >
      <Icon name={icone} size={15} color="currentColor" />
    </button>
  );
}
