"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Icon, BRL, Button, Input, Select, Switch } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { listParties } from "@/lib/cadastros";
import { getCategories, getCostCenters } from "@/lib/data";
import {
  confirmMovement, ignoreMovement, findOrCreateParty, normalizarNome,
  type PendingMovement,
} from "@/lib/confirmacao";
import type { Party } from "@/lib/types";

const fmtDia = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };

/**
 * Box de confirmação que aparece APÓS conectar o banco e conciliar: revisa as
 * transações UMA A UMA. Como é cadastro novo, confirma o nome do remetente e já
 * registra em /contatos (parties). Live-only.
 */
export function ConfirmacaoModal({ itens, onClose }: { itens: PendingMovement[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const parties = useQuery({ queryKey: ["parties-list"], queryFn: listParties });
  const cats = useQuery({ queryKey: ["categories-all"], queryFn: async () => [...(await getCategories("receita")), ...(await getCategories("despesa"))] });
  const centros = useQuery({ queryKey: ["cost-centers"], queryFn: getCostCenters });

  const [idx, setIdx] = React.useState(0);
  const m = itens[idx];

  const fechar = async () => { await qc.invalidateQueries(); onClose(); };
  const avancar = async () => {
    if (idx + 1 < itens.length) setIdx(idx + 1);
    else { show("Conciliação concluída — contatos cadastrados"); await fechar(); }
  };

  if (!m) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-start justify-center z-[80] p-6 overflow-y-auto" onClick={() => fechar()}>
      <div className="w-[480px] max-w-full my-auto" onClick={(e) => e.stopPropagation()}>
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center"><Icon name="check" size={14} color="var(--color-on-lime)" /></span>
              <span className="text-h3 font-medium text-ink">Revisar conexão</span>
            </div>
            <span className="text-caption text-faint tabular-nums">{idx + 1} de {itens.length}</span>
          </div>

          <StepCard
            key={m.id}
            m={m}
            parties={parties.data ?? []}
            categorias={(cats.data ?? []).filter((c) => c.kind === (m.type === "entrada" ? "receita" : "despesa"))}
            centros={centros.data ?? []}
            onDone={(msg) => { show(msg); avancar(); }}
          />

          <div className="flex items-center justify-between border-t border-border-soft pt-3">
            <span className="text-caption text-faint">As demais transações entram em seguida, uma a uma.</span>
            <button onClick={() => fechar()} className="text-caption text-muted hover:text-ink">Concluir depois</button>
          </div>
        </Card>
      </div>
      {node}
    </div>
  );
}

function StepCard({
  m, parties, categorias, centros, onDone,
}: {
  m: PendingMovement;
  parties: Party[];
  categorias: { id: string; name: string }[];
  centros: { id: string; name: string }[];
  onDone: (msg: string) => void;
}) {
  const sugestao = React.useMemo(
    () => (m.description ? parties.find((p) => normalizarNome(p.name) === normalizarNome(m.description!)) : undefined),
    [m.description, parties],
  );
  const [editar, setEditar] = React.useState(false);
  const [nome, setNome] = React.useState((m.description || "").trim());
  const [tipo, setTipo] = React.useState<"pf" | "pj">("pj");
  const [isCustomer, setIsCustomer] = React.useState(m.type === "entrada");
  const [isSupplier, setIsSupplier] = React.useState(m.type === "saida");
  const [categoryId, setCategoryId] = React.useState("");
  const [centroId, setCentroId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const confirmar = async () => {
    setBusy(true);
    try {
      let partyId: string;
      if (editar) {
        const r = await findOrCreateParty({ name: nome.trim() || "Sem descrição", type: tipo, isCustomer, isSupplier });
        partyId = r.id;
      } else if (sugestao) {
        partyId = sugestao.id;
      } else {
        const r = await findOrCreateParty({ name: (m.description || "Sem descrição").trim(), type: "pj", isCustomer: m.type === "entrada", isSupplier: m.type === "saida" });
        partyId = r.id;
      }
      await confirmMovement(m.id, { party_id: partyId, category_id: categoryId || undefined, cost_center_id: centroId || undefined });
      onDone("Contato confirmado e cadastrado");
    } catch {
      onDone("Não foi possível confirmar");
    } finally { setBusy(false); }
  };
  const ignorar = async () => {
    setBusy(true);
    try { await ignoreMovement(m.id); onDone("Transação ignorada"); }
    catch { onDone("Não foi possível ignorar"); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Transação */}
      <div className="rounded-md border border-border-soft p-3 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] text-ink truncate">{m.description || "Sem descrição"}</span>
          <span className="text-body tabular-nums shrink-0" style={{ color: m.type === "entrada" ? "var(--color-positive)" : "var(--color-negative)" }}>
            {m.type === "entrada" ? "+" : "−"}<BRL value={m.amount} />
          </span>
        </div>
        <span className="text-caption text-faint">{fmtDia(m.paid_date ?? m.due_date)} · {m.category || "sem categoria"}</span>
      </div>

      {/* Contato */}
      {!editar ? (
        <div className="flex items-center justify-between gap-3 rounded-md bg-surface-1 px-3 py-2">
          <span className="text-caption text-muted">
            {sugestao ? <>Vincular a <b className="text-ink font-medium">{sugestao.name}</b></> : <>Cadastrar contato <b className="text-ink font-medium">{(m.description || "—").trim()}</b></>}
          </span>
          <button onClick={() => setEditar(true)} className="text-caption font-medium text-muted hover:text-ink shrink-0">Editar</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border border-border-soft p-3">
          <Input label="Nome do remetente / contato" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do contato" />
          <div className="flex flex-wrap items-center gap-4">
            <Select label="Tipo" value={tipo} onChange={(v) => setTipo(v as "pf" | "pj")} options={[{ value: "pj", label: "Pessoa jurídica" }, { value: "pf", label: "Pessoa física" }]} containerClassName="min-w-[160px]" />
            <label className="flex items-center gap-2 cursor-pointer"><Switch checked={isCustomer} onChange={() => setIsCustomer((v) => !v)} /><span className="text-label text-ink">Cliente</span></label>
            <label className="flex items-center gap-2 cursor-pointer"><Switch checked={isSupplier} onChange={() => setIsSupplier((v) => !v)} /><span className="text-label text-ink">Fornecedor</span></label>
          </div>
          <div className="flex flex-wrap gap-3">
            <Select label="Categoria" value={categoryId} onChange={setCategoryId} options={[{ value: "", label: "— manter —" }, ...categorias.map((c) => ({ value: c.id, label: c.name }))]} containerClassName="min-w-[170px]" />
            <Select label="Centro de custo" value={centroId} onChange={setCentroId} options={[{ value: "", label: "— nenhum —" }, ...centros.map((c) => ({ value: c.id, label: c.name }))]} containerClassName="min-w-[170px]" />
          </div>
          <span className="text-caption text-faint">No sandbox o contato nasce sem CPF/CNPJ (o banco só envia o texto); em produção, o documento vem do Pix.</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={ignorar}>Ignorar</Button>
        <Button variant="primary" size="sm" disabled={busy} onClick={confirmar}>{busy ? "Salvando…" : "Confirmar e cadastrar"}</Button>
      </div>
    </div>
  );
}
