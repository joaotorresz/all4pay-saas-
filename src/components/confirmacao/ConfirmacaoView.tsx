"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Icon, BRL, Button, Input, Select, Switch, Skeleton } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { listParties } from "@/lib/cadastros";
import { getCategories, getCostCenters } from "@/lib/data";
import {
  getPendingMovements, confirmMovement, ignoreMovement, findOrCreateParty, normalizarNome,
  type PendingMovement,
} from "@/lib/confirmacao";
import type { Party } from "@/lib/types";
import { EmptyState } from "@/components/visao-geral/shared";

const fmtDia = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };

/** Fila de Confirmação — revisa lançamentos pendentes (Open Finance/import),
 *  classifica e cria/vincula um contato (parties). UX híbrida: confirmação rápida
 *  inline + painel de detalhe. Live-only (em demo a fila fica vazia). */
export function ConfirmacaoView() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const fila = useQuery({ queryKey: ["pending-movements"], queryFn: getPendingMovements });
  const parties = useQuery({ queryKey: ["parties-list"], queryFn: listParties });
  const cats = useQuery({ queryKey: ["categories-all"], queryFn: async () => [...(await getCategories("receita")), ...(await getCategories("despesa"))] });
  const centros = useQuery({ queryKey: ["cost-centers"], queryFn: getCostCenters });

  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [expandido, setExpandido] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const lista = fila.data ?? [];
  const sugerirContato = React.useCallback((desc: string | null): Party | undefined => {
    if (!desc) return undefined;
    return (parties.data ?? []).find((p) => normalizarNome(p.name) === normalizarNome(desc));
  }, [parties.data]);

  const reload = async () => { await qc.invalidateQueries(); };

  // Resolve o contato (sugestão existente OU cria novo do description) e confirma.
  const resolverEConfirmar = async (m: PendingMovement, extra?: { category_id?: string; cost_center_id?: string }) => {
    const sug = sugerirContato(m.description);
    let partyId = sug?.id;
    let reused = !!sug;
    if (!partyId) {
      const r = await findOrCreateParty({
        name: (m.description || "Sem descrição").trim(), type: "pj",
        isCustomer: m.type === "entrada", isSupplier: m.type === "saida",
      });
      partyId = r.id; reused = r.reused;
    }
    await confirmMovement(m.id, { party_id: partyId, ...extra });
    return reused;
  };

  const confirmarInline = async (m: PendingMovement) => {
    setBusy(m.id);
    try {
      const reused = await resolverEConfirmar(m);
      show(reused ? "Confirmado — vinculado a contato existente" : "Confirmado — contato criado");
      await reload();
    } catch { show("Não foi possível confirmar"); }
    finally { setBusy(null); }
  };
  const ignorar = async (m: PendingMovement) => {
    setBusy(m.id);
    try { await ignoreMovement(m.id); show("Ignorado"); await reload(); }
    catch { show("Não foi possível ignorar"); }
    finally { setBusy(null); }
  };

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const todosSel = lista.length > 0 && lista.every((m) => sel.has(m.id));
  const toggleAll = () => setSel(todosSel ? new Set() : new Set(lista.map((m) => m.id)));

  const confirmarLote = async () => {
    if (!sel.size) return;
    setBusy("lote");
    try {
      // sequencial → o match por nome reaproveita o contato recém-criado do MESMO description
      for (const m of lista.filter((x) => sel.has(x.id))) await resolverEConfirmar(m);
      show(`${sel.size} confirmado(s)`);
      setSel(new Set());
      await reload();
    } catch { show("Falha ao confirmar em lote"); }
    finally { setBusy(null); }
  };

  if (fila.isLoading) return <Skeleton className="h-[280px] w-full" rounded="md" />;
  if (fila.isError) return <Card><EmptyState title="Não foi possível carregar a fila" /></Card>;
  if (lista.length === 0) return <Card><EmptyState icon="inbox" title="Fila vazia" hint="Lançamentos do Open Finance / importação aguardando revisão aparecem aqui. Em demonstração a fila fica vazia." /></Card>;

  return (
    <div className="flex flex-col gap-3 pb-4">
      <Card className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Icon name="list-checks" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">{lista.length} lançamento(s) para revisar · confirme o contato e a categoria</span>
        </div>
        <button onClick={toggleAll} className="text-caption font-medium text-ink inline-flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-sm border" style={{ borderColor: todosSel ? "var(--color-ink)" : "var(--color-border)", background: todosSel ? "var(--color-ink)" : "transparent" }}>
            {todosSel && <Icon name="check" size={12} color="#ffffff" />}
          </span>
          Selecionar tudo
        </button>
      </Card>

      <Card padded={false}>
        {lista.map((m, i) => {
          const sug = sugerirContato(m.description);
          const on = sel.has(m.id);
          const aberto = expandido === m.id;
          return (
            <div key={m.id} className={i ? "border-t border-border-soft" : ""}>
              <div className="flex items-center gap-3 px-5 py-3">
                <button onClick={() => toggle(m.id)} className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-sm border shrink-0" style={{ borderColor: on ? "var(--color-ink)" : "var(--color-border)", background: on ? "var(--color-ink)" : "transparent" }} aria-label="Selecionar">
                  {on && <Icon name="check" size={12} color="#ffffff" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] text-ink truncate">{m.description || "Sem descrição"}</div>
                  <div className="text-caption text-faint truncate">
                    {fmtDia(m.paid_date ?? m.due_date)} · {m.category || "sem categoria"} · {sug ? `contato: ${sug.name}` : "novo contato"}
                  </div>
                </div>
                <span className="text-caption tabular-nums w-[110px] text-right" style={{ color: m.type === "entrada" ? "var(--color-positive)" : "var(--color-negative)" }}>
                  {m.type === "entrada" ? "+" : "−"}<BRL value={m.amount} />
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => confirmarInline(m)} disabled={busy === m.id} className="text-caption font-medium text-on-lime bg-lime rounded-pill px-3 py-[4px] disabled:opacity-45">
                    {busy === m.id ? "…" : "Confirmar"}
                  </button>
                  <button onClick={() => setExpandido(aberto ? null : m.id)} className="text-caption text-muted hover:text-ink px-2 py-1 rounded-sm hover:bg-surface-2">{aberto ? "Fechar" : "Detalhe"}</button>
                  <button onClick={() => ignorar(m)} disabled={busy === m.id} className="text-caption text-negative px-2 py-1 rounded-sm hover:bg-surface-2 disabled:opacity-45">Ignorar</button>
                </div>
              </div>
              {aberto && (
                <DetalheConfirmacao
                  m={m}
                  parties={parties.data ?? []}
                  categorias={(cats.data ?? []).filter((c) => c.kind === (m.type === "entrada" ? "receita" : "despesa"))}
                  centros={centros.data ?? []}
                  sugestao={sug}
                  onClose={() => setExpandido(null)}
                  onConfirmado={(msg) => { show(msg); setExpandido(null); reload(); }}
                />
              )}
            </div>
          );
        })}
      </Card>

      {sel.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] inline-flex items-center gap-4 rounded-pill bg-ink text-white shadow-popover px-5 py-3">
          <span className="text-caption">{sel.size} selecionado(s)</span>
          <button onClick={confirmarLote} disabled={busy === "lote"} className="text-caption font-medium text-on-lime bg-lime rounded-pill px-3 py-[6px] disabled:opacity-45">
            {busy === "lote" ? "Confirmando…" : "Confirmar selecionados"}
          </button>
          <button onClick={() => setSel(new Set())} className="text-caption text-white/70 hover:text-white">Limpar</button>
        </div>
      )}
      {node}
    </div>
  );
}

function DetalheConfirmacao({
  m, parties, categorias, centros, sugestao, onClose, onConfirmado,
}: {
  m: PendingMovement;
  parties: Party[];
  categorias: { id: string; name: string }[];
  centros: { id: string; name: string }[];
  sugestao?: Party;
  onClose: () => void;
  onConfirmado: (msg: string) => void;
}) {
  const [modo, setModo] = React.useState<"existente" | "novo">(sugestao ? "existente" : "novo");
  const [contatoId, setContatoId] = React.useState(sugestao?.id ?? "");
  const [nome, setNome] = React.useState((m.description || "").trim());
  const [tipo, setTipo] = React.useState<"pf" | "pj">("pj");
  const [isCustomer, setIsCustomer] = React.useState(m.type === "entrada");
  const [isSupplier, setIsSupplier] = React.useState(m.type === "saida");
  const [categoryId, setCategoryId] = React.useState("");
  const [centroId, setCentroId] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  const salvar = async () => {
    setSalvando(true);
    try {
      let partyId = contatoId;
      if (modo === "novo") {
        const r = await findOrCreateParty({ name: nome.trim() || "Sem descrição", type: tipo, isCustomer, isSupplier });
        partyId = r.id;
      }
      await confirmMovement(m.id, { party_id: partyId || null, category_id: categoryId || undefined, cost_center_id: centroId || undefined });
      onConfirmado("Confirmado");
    } catch {
      onConfirmado("Não foi possível confirmar");
    } finally { setSalvando(false); }
  };

  return (
    <div className="px-5 pb-4 pt-1 bg-surface-1 flex flex-col gap-3">
      <div className="inline-flex rounded-md bg-surface-2 p-[3px] self-start">
        {(["existente", "novo"] as const).map((mo) => (
          <button key={mo} onClick={() => setModo(mo)} className={`rounded-[7px] px-3 py-[5px] text-caption ${modo === mo ? "bg-white text-ink font-medium shadow-pill" : "text-muted hover:text-ink"}`}>
            {mo === "existente" ? "Contato existente" : "Criar contato"}
          </button>
        ))}
      </div>

      {modo === "existente" ? (
        <Select label="Contato" value={contatoId} onChange={setContatoId} options={[{ value: "", label: "— escolher —" }, ...parties.map((p) => ({ value: p.id, label: p.name }))]} />
      ) : (
        <div className="flex flex-col gap-3">
          <Input label="Nome do contato" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (do texto do banco)" />
          <div className="flex flex-wrap items-center gap-4">
            <Select label="Tipo" value={tipo} onChange={(v) => setTipo(v as "pf" | "pj")} options={[{ value: "pj", label: "Pessoa jurídica" }, { value: "pf", label: "Pessoa física" }]} containerClassName="min-w-[170px]" />
            <label className="flex items-center gap-2 cursor-pointer"><Switch checked={isCustomer} onChange={() => setIsCustomer((v) => !v)} /><span className="text-label text-ink">Cliente</span></label>
            <label className="flex items-center gap-2 cursor-pointer"><Switch checked={isSupplier} onChange={() => setIsSupplier((v) => !v)} /><span className="text-label text-ink">Fornecedor</span></label>
          </div>
          <span className="text-caption text-faint">No sandbox o contato nasce sem CPF/CNPJ (o banco só envia o texto). Em produção, o documento vem do Pix.</span>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Select label="Categoria" value={categoryId} onChange={setCategoryId} options={[{ value: "", label: "— manter —" }, ...categorias.map((c) => ({ value: c.id, label: c.name }))]} containerClassName="min-w-[180px]" />
        <Select label="Centro de custo" value={centroId} onChange={setCentroId} options={[{ value: "", label: "— nenhum —" }, ...centros.map((c) => ({ value: c.id, label: c.name }))]} containerClassName="min-w-[180px]" />
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button size="sm" variant="primary" disabled={salvando || (modo === "existente" && !contatoId)} onClick={salvar}>{salvando ? "Confirmando…" : "Confirmar"}</Button>
        </div>
      </div>
    </div>
  );
}
