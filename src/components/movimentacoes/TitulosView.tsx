"use client";

/**
 * Contas a Receber / a Pagar — a lista operacional dos títulos.
 *
 * Um componente só com `direcao`: receber e pagar são o mesmo problema
 * espelhado (um título, um vencimento, um status), e o que muda é o
 * vocabulário — Cliente × Fornecedor, Recebido × Pago.
 *
 * Os 4 cards do topo, a busca, o filtro, as ações em lote e a paginação são a
 * ferramenta de trabalho de quem opera cobrança e pagamento o dia inteiro.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Button, Icon, Input, Select, DateField, Checkbox, BRL, Skeleton } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { useRiscoInput, useAccounts } from "@/components/visao-geral/hooks";
import { baixarXLSX } from "@/lib/xlsx";
import { pagarLote } from "@/lib/pagamentos";
import { receberLote } from "@/lib/recebimentos";
import {
  filtrarTitulos, resumoTitulos, statusDoTitulo,
  type Direcao, type FiltroTitulos, type StatusTitulo, type CardResumo,
} from "@/core/movimentacoes";

const fmtDia = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const PAGINAS = [50, 100, 250, 500, 1000, 5000];

const COR_STATUS: Record<StatusTitulo, string> = {
  liquidado: "var(--color-positive)",
  aberto: "var(--color-warning)",
  atrasado: "var(--color-negative)",
};

export function TitulosView({ direcao }: { direcao: Direcao }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: input, isLoading } = useRiscoInput();
  const { data: contas } = useAccounts();
  const { show, node } = useToast();

  const [busca, setBusca] = React.useState("");
  const [filtro, setFiltro] = React.useState<FiltroTitulos>({ status: "todos" });
  const [abrirFiltro, setAbrirFiltro] = React.useState(false);
  const [porPagina, setPorPagina] = React.useState(50);
  const [pagina, setPagina] = React.useState(1);
  const [marcados, setMarcados] = React.useState<Set<string>>(new Set());
  const [executando, setExecutando] = React.useState(false);

  const parte = direcao === "receber" ? "Cliente" : "Fornecedor";
  const liquidado = direcao === "receber" ? "Recebido" : "Pago";

  const titulos = React.useMemo(
    () => (input ? filtrarTitulos(input, direcao, { ...filtro, busca }) : []),
    [input, direcao, filtro, busca],
  );
  const cards = React.useMemo(
    () => (input ? resumoTitulos(titulos, direcao, input.hoje) : []),
    [titulos, direcao, input],
  );

  const totalPaginas = Math.max(1, Math.ceil(titulos.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = titulos.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);

  const nomes = React.useMemo(() => input?.partyNames ?? {}, [input]);
  const nomeConta = (id?: string | null) =>
    (contas?.accounts ?? []).find((c) => c.id === id)?.name ?? "—";

  // Só faz sentido dar baixa no que ainda está ABERTO — marcar um liquidado e
  // "confirmar" de novo não moveria dinheiro (a operação é idempotente), mas
  // daria a impressão de que moveu.
  const marcadosAbertos = React.useMemo(
    () => titulos.filter((m) => marcados.has(m.id) && m.status !== "pago"),
    [titulos, marcados],
  );

  const alternar = (id: string) =>
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const executarBaixa = async () => {
    if (marcadosAbertos.length === 0) return;
    const conta = filtro.conta || (contas?.accounts ?? [])[0]?.id;
    if (!conta) { show("Cadastre uma conta bancária primeiro."); return; }
    setExecutando(true);
    try {
      // `pagarLote`/`receberLote` são IDEMPOTENTES (reusam o motor de
      // pagamento do core/platform): reenviar o mesmo título não move dinheiro
      // duas vezes.
      const base = marcadosAbertos.map((m) => ({
        id: m.id,
        amount: Math.abs(m.amount),
        contraparte: (m.party_id && nomes[m.party_id]) || m.category || "—",
        due_date: (m.due_date ?? "").slice(0, 10),
        category: m.category ?? null,
      }));
      const r = direcao === "receber"
        ? await receberLote(base.map(({ contraparte, ...b }) => ({ ...b, pagador: contraparte })), conta)
        : await pagarLote(base.map(({ contraparte, ...b }) => ({ ...b, beneficiario: contraparte })), conta, "pix");
      const n = "recebidos" in r ? r.recebidos : r.liquidados;
      show(`${n} ${direcao === "receber" ? "recebidos" : "pagos"}.`);
      setMarcados(new Set());
      qc.invalidateQueries();
    } finally {
      setExecutando(false);
    }
  };

  const linhasXLSX = React.useMemo(() => [
    ["ID", "Vencimento", "Data de " + liquidado.toLowerCase(), "Status", "Categoria", parte, "Valor", liquidado],
    ...titulos.map((m) => [
      m.id, m.due_date?.slice(0, 10) ?? "", m.paid_date?.slice(0, 10) ?? "",
      input ? statusDoTitulo(m, input.hoje) : "",
      m.category ?? "", (m.party_id && nomes[m.party_id]) || "",
      Math.abs(m.amount), m.status === "pago" ? Math.abs(m.amount) : 0,
    ]),
  ], [titulos, input, nomes, parte, liquidado]);

  const rotaNovo = direcao === "receber"
    ? "/dashboard/financial/receivables/new"
    : "/dashboard/financial/payables/new";

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted">
          {direcao === "receber" ? "Valores a receber dos seus clientes." : "Valores a pagar aos seus fornecedores."}
        </p>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="primary" onClick={() => router.push(rotaNovo)}>
            <Icon name="plus" size={15} color="currentColor" />
            Nova conta a {direcao}
          </Button>
          <Button
            variant="ghost"
            disabled={titulos.length === 0}
            onClick={() => baixarXLSX(`contas-a-${direcao}`, [{ nome: `Contas a ${direcao}`, linhas: linhasXLSX }])}
          >
            <Icon name="arrow-down-to-line" size={15} color="currentColor" />
            Exportar XLSX
          </Button>
          <Button variant="ghost" disabled={titulos.length === 0} onClick={() => window.print()}>
            <Icon name="file-text" size={15} color="currentColor" />
            Exportar PDF
          </Button>
          <Button variant="ghost" onClick={() => router.push(`/dashboard/financial/import?tipo=${direcao}`)}>
            <Icon name="upload" size={15} color="currentColor" />
            Importar
          </Button>
        </div>
      </div>

      {/* --------------------------------- cards --------------------------------- */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((k) => <Card key={k}><Skeleton className="h-[70px]" /></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map((c) => <CardTitulo key={c.id} c={c} onClick={() => {
            setFiltro((f) => ({ ...f, status: c.id === "total" ? "todos" : (c.id as StatusTitulo) }));
            setPagina(1);
          }} />)}
        </div>
      )}

      {/* ------------------------------ barra de ações ------------------------------ */}
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" onClick={() => setAbrirFiltro((v) => !v)}>
            <Icon name="list-checks" size={15} color="currentColor" />
            Filtro
            {(filtro.conta || filtro.categoria || filtro.de || filtro.ate || (filtro.status && filtro.status !== "todos")) && (
              <span className="ml-1 rounded-pill bg-ink text-white text-[10px] px-[6px] py-[1px] tabular-nums">ativo</span>
            )}
          </Button>
          <Input
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
            placeholder="Buscar por ID, categoria ou contraparte…"
            containerClassName="flex-1 min-w-[220px]"
          />
          <Button variant="ghost" disabled={marcadosAbertos.length === 0 || executando} onClick={executarBaixa}>
            <Icon name="check" size={15} color="currentColor" />
            {executando
              ? "Confirmando…"
              : `Dar baixa${marcadosAbertos.length ? ` (${marcadosAbertos.length})` : ""}`}
          </Button>
        </div>

        {abrirFiltro && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border-soft">
            <Campo label="Vencimento de">
              <DateField value={filtro.de ?? ""} onChange={(v) => setFiltro((f) => ({ ...f, de: v || null }))} />
            </Campo>
            <Campo label="Vencimento até">
              <DateField value={filtro.ate ?? ""} onChange={(v) => setFiltro((f) => ({ ...f, ate: v || null }))} />
            </Campo>
            <Campo label="Conta bancária">
              <Select
                value={filtro.conta ?? ""}
                onChange={(v) => setFiltro((f) => ({ ...f, conta: v || null }))}
                options={[{ value: "", label: "Todas as contas" }, ...(contas?.accounts ?? []).map((c) => ({ value: c.id, label: c.name }))]}
              />
            </Campo>
            <Campo label="Status">
              <Select
                value={filtro.status ?? "todos"}
                onChange={(v) => setFiltro((f) => ({ ...f, status: v as StatusTitulo | "todos" }))}
                options={[
                  { value: "todos", label: "Todos" },
                  { value: "liquidado", label: direcao === "receber" ? "Recebido" : "Pago" },
                  { value: "aberto", label: "Em aberto" },
                  { value: "atrasado", label: "Atrasado" },
                ]}
              />
            </Campo>
          </div>
        )}
      </Card>

      {/* --------------------------------- tabela --------------------------------- */}
      <Card padded={false} className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border-soft flex-wrap">
          <div className="flex items-center gap-2 text-caption text-muted">
            Mostrando
            <Select
              value={String(porPagina)}
              onChange={(v) => { setPorPagina(Number(v)); setPagina(1); }}
              options={PAGINAS.map((n) => ({ value: String(n), label: String(n) }))}
              containerClassName="w-[92px]"
            />
            de <b className="text-ink tabular-nums">{titulos.length}</b>
          </div>
          <div className="flex items-center gap-1">
            <Seta label="Página anterior" icone="chevron-left" disabled={paginaAtual <= 1} onClick={() => setPagina((p) => p - 1)} />
            <span className="text-caption text-muted tabular-nums px-2">{paginaAtual} / {totalPaginas}</span>
            <Seta label="Próxima página" icone="chevron-right" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina((p) => p + 1)} />
          </div>
        </div>

        {isLoading ? (
          <div className="p-6"><Skeleton className="h-[220px]" /></div>
        ) : visiveis.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-surface-2">
              <Icon name="inbox" size={20} color="var(--color-text-tertiary)" />
            </span>
            <p className="m-0 text-label text-muted max-w-[44ch]">
              {titulos.length === 0 && !busca
                ? `Nenhuma conta a ${direcao} cadastrada.`
                : "Nenhum título encontrado com esses filtros."}
            </p>
            <Button variant="primary" onClick={() => router.push(rotaNovo)}>Nova conta a {direcao}</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  <Th className="w-[46px]">
                    <Checkbox
                      checked={visiveis.every((m) => marcados.has(m.id)) && visiveis.length > 0}
                      onChange={(e) => setMarcados(e.target.checked
                        ? new Set([...Array.from(marcados), ...visiveis.map((m) => m.id)])
                        : new Set())}
                    />
                  </Th>
                  <Th>ID</Th>
                  <Th>Vencimento / {liquidado.toLowerCase()}</Th>
                  <Th>Conta</Th>
                  <Th>Categoria</Th>
                  <Th>{parte}</Th>
                  <Th direita>Valor</Th>
                  <Th direita>{liquidado}</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((m) => {
                  const st = input ? statusDoTitulo(m, input.hoje) : "aberto";
                  return (
                    <tr key={m.id} className="border-b border-border-soft last:border-0 hover:bg-surface-2/60 transition-colors">
                      <td className="px-6 py-3">
                        <Checkbox checked={marcados.has(m.id)} onChange={() => alternar(m.id)} />
                      </td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-[7px] h-[7px] rounded-pill shrink-0" style={{ background: COR_STATUS[st] }} title={st} />
                          <span className="text-caption text-faint tabular-nums">{m.id.slice(0, 10)}</span>
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex flex-col">
                          <span className="text-label text-ink tabular-nums">{fmtDia(m.due_date)}</span>
                          {m.paid_date && <span className="text-caption text-positive tabular-nums">{fmtDia(m.paid_date)}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-label text-muted">{nomeConta(m.accountId)}</td>
                      <td className="px-6 py-3 text-label text-muted">{m.category ?? "—"}</td>
                      <td className="px-6 py-3">
                        {m.party_id ? (
                          <button
                            onClick={() => window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: m.party_id } }))}
                            className="text-label text-ink hover:underline decoration-dotted underline-offset-4"
                          >
                            {nomes[m.party_id] ?? m.party_id}
                          </button>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-6 py-3 text-right text-label text-ink tabular-nums"><BRL value={Math.abs(m.amount)} /></td>
                      <td className="px-6 py-3 text-right text-label tabular-nums">
                        {m.status === "pago"
                          ? <span className="text-positive"><BRL value={Math.abs(m.amount)} /></span>
                          : <span className="text-faint">—</span>}
                      </td>
                    </tr>
                  );
                })}
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

/** O card com o anel: o percentual é a fatia do total, não uma meta. */
function CardTitulo({ c, onClick }: { c: CardResumo; onClick: () => void }) {
  const cor = c.id === "total" ? "var(--color-ink)" : COR_STATUS[c.id as StatusTitulo];
  const r = 22, circ = 2 * Math.PI * r;
  return (
    <Card className="cursor-pointer hover:bg-surface-2/40 transition-colors" onClick={onClick}>
      <div className="flex items-center gap-4">
        <svg width="56" height="56" viewBox="0 0 56 56" className="shrink-0" aria-hidden>
          <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth="5" />
          <circle
            cx="28" cy="28" r={r} fill="none" stroke={cor} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${(circ * c.percentual) / 100} ${circ}`}
            transform="rotate(-90 28 28)"
          />
          <text x="28" y="31" textAnchor="middle" className="tabular-nums" style={{ fontSize: 11, fill: "var(--color-text-secondary)" }}>
            {c.percentual.toFixed(0)}%
          </text>
        </svg>
        <div className="min-w-0">
          <div className="text-caption text-muted">
            {c.label} <span className="text-faint tabular-nums">({c.quantidade})</span>
          </div>
          <div className="text-[22px] leading-none font-semibold tabular-nums mt-1" style={{ color: cor }}>
            <BRL value={c.valor} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function Th({ children, direita, className }: { children?: React.ReactNode; direita?: boolean; className?: string }) {
  return (
    <th className={`px-6 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-faint ${direita ? "text-right" : "text-left"} ${className ?? ""}`}>
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
      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
    >
      <Icon name={icone} size={15} color="currentColor" />
    </button>
  );
}
