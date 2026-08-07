"use client";

/**
 * Compras — a lista, com o fluxo de aprovação do print.
 *
 * O que separa esta tela de "contas a pagar" é o botão: aqui a compra é um
 * PEDIDO, e é a decisão de aprovar que a transforma em dinheiro saindo. Por
 * isso os cards não são "pago/a pagar" e sim "aprovadas / aguardando /
 * reprovadas ou canceladas" — a pergunta da tela é sobre autorização.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Button, Icon, Input, Select, DateField, BRL } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { Painel } from "@/components/paineis/shared";
import { baixarXLSX } from "@/lib/xlsx";
import {
  filtrarCompras, painelCompras, parcelasDaCompra,
  STATUS_COMPRA,
  type Compra, type FiltroCompras, type StatusCompra,
} from "@/core/compras";
import { listarCompras, decidirCompra, removerCompra } from "@/lib/compras-store";

const fmtDia = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const COR_STATUS: Record<StatusCompra, string> = {
  aprovada: "var(--color-positive)",
  aguardando: "var(--color-warning)",
  reprovada: "var(--color-negative)",
  cancelada: "var(--color-placeholder)",
};

function primeiroDoMes(): string {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-01`;
}
function ultimoDoMes(): string {
  const h = new Date();
  const u = new Date(h.getFullYear(), h.getMonth() + 1, 0);
  return `${u.getFullYear()}-${String(u.getMonth() + 1).padStart(2, "0")}-${String(u.getDate()).padStart(2, "0")}`;
}

export function ComprasView() {
  const router = useRouter();
  const qc = useQueryClient();
  const { show: toast, node } = useToast();
  const [compras, setCompras] = React.useState<Compra[]>([]);
  const [carregando, setCarregando] = React.useState(true);

  const [vencDe, setVencDe] = React.useState(primeiroDoMes());
  const [vencAte, setVencAte] = React.useState(ultimoDoMes());
  const [compDe, setCompDe] = React.useState(primeiroDoMes());
  const [compAte, setCompAte] = React.useState(ultimoDoMes());
  const [status, setStatus] = React.useState<StatusCompra | "todos">("todos");
  const [criadoPor, setCriadoPor] = React.useState("todos");
  const [busca, setBusca] = React.useState("");
  const [aberta, setAberta] = React.useState<string | null>(null);

  React.useEffect(() => {
    setCompras(listarCompras());
    setCarregando(false);
  }, []);

  const autores = React.useMemo(
    () => Array.from(new Set(compras.map((c) => c.criadoPor).filter(Boolean))),
    [compras],
  );

  // O filtro é montado DENTRO do memo: um objeto literal no corpo do
  // componente nasce novo a cada render e faria o memo recalcular sempre.
  const lista = React.useMemo(() => {
    const filtro: FiltroCompras = { vencDe, vencAte, compDe, compAte, status, criadoPor, busca };
    return filtrarCompras(compras, filtro);
  }, [compras, vencDe, vencAte, compDe, compAte, status, criadoPor, busca]);
  const cards = React.useMemo(() => painelCompras(lista), [lista]);

  function decidir(id: string, novo: StatusCompra) {
    setCompras(decidirCompra(id, novo));
    // Aprovar/reprovar mexe no caixa — o resto do sistema precisa reler.
    qc.invalidateQueries();
    const rotulo = STATUS_COMPRA.find((s) => s.id === novo)?.label ?? novo;
    toast(
      novo === "aprovada"
        ? "Compra aprovada — os títulos entraram em contas a pagar."
        : `Compra marcada como ${rotulo.toLowerCase()} — os títulos saíram do fluxo.`,
    );
  }

  function excluir(id: string) {
    setCompras(removerCompra(id));
    qc.invalidateQueries();
    toast("Compra excluída.");
  }

  const linhasXLSX = [
    ["Número", "Fornecedor", "Categoria", "Vencimento", "Competência", "Parcelas", "Status", "Valor"],
    ...lista.map((c) => [
      c.numero, c.fornecedor, c.categoria, fmtDia(c.vencimento), fmtDia(c.competencia),
      c.tipoPagamento === "parcelado" ? c.parcelas : 1,
      STATUS_COMPRA.find((s) => s.id === c.status)?.label ?? c.status,
      c.valor,
    ]),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted">Controle de compras e recebimentos</p>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="primary" onClick={() => router.push("/dashboard/purchases/new")}>
            <Icon name="plus" size={15} color="currentColor" />
            Nova compra
          </Button>
          <Button
            variant="ghost"
            disabled={lista.length === 0}
            onClick={() => baixarXLSX("compras", [{ nome: "Compras", linhas: linhasXLSX }])}
          >
            <Icon name="arrow-down-to-line" size={15} color="currentColor" />
            Exportar XLSX
          </Button>
        </div>
      </div>

      <Painel cards={cards} onEscolher={(id) => setStatus(id === "total" ? "todos" : (id as StatusCompra))} />

      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-h3 font-semibold text-ink">Filtros</span>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Faixa
              titulo="Data de vencimento/pagamento"
              ajuda="A janela do CAIXA: quando o dinheiro sai. Compra paga entra pela data do pagamento."
              de={vencDe} ate={vencAte} setDe={setVencDe} setAte={setVencAte}
            />
            <Faixa
              titulo="Data de competência"
              ajuda="A janela do RESULTADO: de que mês é a despesa, independentemente de quando se paga."
              de={compDe} ate={compAte} setDe={setCompDe} setAte={setCompAte}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              label="Status" value={status} onChange={(v) => setStatus(v as StatusCompra | "todos")}
              options={[{ value: "todos", label: "Todos" }, ...STATUS_COMPRA.map((s) => ({ value: s.id, label: s.label }))]}
            />
            <Select
              label="Criado por" value={criadoPor} onChange={setCriadoPor}
              options={[{ value: "todos", label: "Todos" }, ...autores.map((a) => ({ value: a, label: a }))]}
            />
            <div className="flex flex-col gap-[6px]">
              <label className="text-label font-medium text-muted">Buscar</label>
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Fornecedor, número ou documento…" />
            </div>
          </div>
        </div>
      </Card>

      {carregando ? (
        <Card><p className="m-0 text-label text-muted">Carregando compras…</p></Card>
      ) : lista.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-surface-2">
              <Icon name="shopping-cart" size={20} color="var(--color-text-tertiary)" />
            </span>
            <p className="m-0 text-label text-muted max-w-[44ch]">
              {compras.length === 0
                ? "Nenhuma compra registrada. Um pedido de compra só vira conta a pagar depois de aprovado."
                : "Nenhuma compra no filtro. Amplie as datas ou limpe o status."}
            </p>
            <Button variant="primary" onClick={() => router.push("/dashboard/purchases/new")}>
              <Icon name="plus" size={15} color="currentColor" />
              Nova compra
            </Button>
          </div>
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  <Th>Número</Th>
                  <Th>Fornecedor</Th>
                  <Th>Categoria</Th>
                  <Th>Vencimento</Th>
                  <Th>Competência</Th>
                  <Th>Pagamento</Th>
                  <Th>Status</Th>
                  <Th direita>Valor</Th>
                  <Th direita>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const parcelas = parcelasDaCompra(c);
                  return (
                    <React.Fragment key={c.id}>
                      <tr className="border-b border-border-soft last:border-0 hover:bg-surface-2/60 transition-colors">
                        <td className="px-6 py-3 text-label text-ink tabular-nums">{c.numero}</td>
                        <td className="px-6 py-3 text-label text-ink">{c.fornecedor}</td>
                        <td className="px-6 py-3 text-label text-muted">{c.categoria}</td>
                        <td className="px-6 py-3 text-label text-muted tabular-nums">{fmtDia(c.vencimento)}</td>
                        <td className="px-6 py-3 text-label text-muted tabular-nums">{fmtDia(c.competencia)}</td>
                        <td className="px-6 py-3 text-label text-muted">
                          {c.tipoPagamento === "parcelado" ? (
                            <button
                              onClick={() => setAberta(aberta === c.id ? null : c.id)}
                              className="inline-flex items-center gap-[6px] text-muted hover:text-ink transition-colors"
                            >
                              {c.parcelas}× <Icon name={aberta === c.id ? "chevron-left" : "chevron-right"} size={12} color="currentColor" />
                            </button>
                          ) : "À vista"}
                          {c.pago && <span className="ml-2 text-caption text-positive">pago</span>}
                        </td>
                        <td className="px-6 py-3">
                          <span className="inline-flex items-center gap-[6px] text-caption text-muted">
                            <span className="w-[7px] h-[7px] rounded-pill" style={{ background: COR_STATUS[c.status] }} />
                            {STATUS_COMPRA.find((s) => s.id === c.status)?.label}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right text-label text-ink tabular-nums"><BRL value={c.valor} /></td>
                        <td className="px-6 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {c.status === "aguardando" && (
                              <>
                                <Acao label="Aprovar" icone="check" onClick={() => decidir(c.id, "aprovada")} />
                                <Acao label="Reprovar" icone="x" onClick={() => decidir(c.id, "reprovada")} perigo />
                              </>
                            )}
                            {c.status === "aprovada" && (
                              <Acao label="Cancelar compra" icone="x" onClick={() => decidir(c.id, "cancelada")} perigo />
                            )}
                            <Acao label="Excluir" icone="trash-2" onClick={() => excluir(c.id)} perigo />
                          </div>
                        </td>
                      </tr>
                      {aberta === c.id && (
                        <tr className="border-b border-border-soft bg-surface-2/40">
                          <td colSpan={9} className="px-6 py-4">
                            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                              Parcelas geradas
                            </span>
                            <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
                              {parcelas.map((p) => (
                                <span key={p.numero} className="text-caption text-muted tabular-nums">
                                  {p.numero}/{parcelas.length} · {fmtDia(p.vencimento)} · <BRL value={p.valor} />
                                </span>
                              ))}
                            </div>
                            {c.status !== "aprovada" && (
                              <p className="m-0 mt-3 text-caption text-faint max-w-[68ch]">
                                Estas parcelas ainda não existem no fluxo de caixa. Um pedido só vira
                                conta a pagar quando aprovado.
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {node}
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

function Faixa({
  titulo, ajuda, de, ate, setDe, setAte,
}: {
  titulo: string; ajuda: string;
  de: string; ate: string; setDe: (v: string) => void; setAte: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-label font-medium text-muted">{titulo}</label>
      <div className="flex items-center gap-2">
        <DateField value={de} onChange={setDe} containerClassName="flex-1" />
        <Icon name="chevron-right" size={14} color="var(--color-text-tertiary)" />
        <DateField value={ate} onChange={setAte} containerClassName="flex-1" />
      </div>
      <span className="text-caption text-faint">{ajuda}</span>
    </div>
  );
}

function Th({ children, direita }: { children: React.ReactNode; direita?: boolean }) {
  return (
    <th className={`px-6 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-faint ${direita ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Acao({ label, icone, onClick, perigo }: { label: string; icone: string; onClick: () => void; perigo?: boolean }) {
  return (
    <button
      onClick={onClick} aria-label={label} title={label}
      className={`p-[6px] rounded-md text-muted transition-colors hover:bg-surface-2 ${perigo ? "hover:text-negative" : "hover:text-positive"}`}
    >
      <Icon name={icone} size={15} color="currentColor" />
    </button>
  );
}
