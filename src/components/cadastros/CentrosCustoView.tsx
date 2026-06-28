"use client";

/**
 * Cadastros › Centros de Custo (modelo IULI) — áreas/departamentos para rateio
 * de resultado: nome, código, código contábil (Domínio, usado no TXT contábil),
 * descrição e status ativo. Store local, demo-safe (§3.4 do relatório).
 */
import * as React from "react";
import { AppShell } from "@/components/app/AppShell";
import { Card, Button, Input, Textarea, Switch, StatusBadge, Icon } from "@/components/ui";
import { FormModal, SectionTitle } from "@/components/lancamentos/FormModal";
import { listCentrosCusto, addCentroCusto, type CentroCusto } from "@/lib/iuli-cadastros";

export function CentrosCustoView() {
  const [itens, setItens] = React.useState<CentroCusto[]>([]);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { setItens(listCentrosCusto()); }, []);

  return (
    <AppShell title="Centros de Custo" actions={<Button variant="primary" leftIcon={<Icon name="plus" size={15} />} onClick={() => setOpen(true)}>Novo centro de custo</Button>}>
      <div className="flex flex-col gap-5 pb-6">
        {itens.length === 0 ? (
          <Card className="flex flex-col items-start gap-2">
            <span className="text-h3 font-medium text-ink">Nenhum centro de custo ainda</span>
            <span className="text-caption text-muted">Centros de custo representam áreas/departamentos para rateio do resultado e integram a exportação contábil (Domínio).</span>
            <Button variant="secondary" className="mt-1" onClick={() => setOpen(true)}>Criar primeiro centro de custo</Button>
          </Card>
        ) : (
          <Card padded={false}>
            <div className="hidden sm:grid grid-cols-[1.6fr_0.8fr_1fr_0.8fr] gap-3 px-5 py-3 border-b border-border-soft text-caption font-medium text-muted">
              <span>Nome</span><span>Código</span><span>Cód. contábil (Domínio)</span><span className="text-right">Status</span>
            </div>
            {itens.map((c, i) => (
              <div key={c.id} className={`grid grid-cols-1 sm:grid-cols-[1.6fr_0.8fr_1fr_0.8fr] gap-1 sm:gap-3 sm:items-center px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-ink truncate">{c.nome}</div>
                  {c.descricao && <div className="text-caption text-faint truncate">{c.descricao}</div>}
                </div>
                <span className="text-caption text-muted tabular-nums">{c.codigo || "—"}</span>
                <span className="text-caption text-muted tabular-nums">{c.codigoContabil || "—"}</span>
                <span className="sm:text-right"><StatusBadge tone={c.ativo ? "positive" : "neutral"}>{c.ativo ? "Ativo" : "Inativo"}</StatusBadge></span>
              </div>
            ))}
          </Card>
        )}
      </div>
      {open && <CentroCustoForm onClose={() => setOpen(false)} onSaved={(c) => { setItens((xs) => [c, ...xs]); setOpen(false); }} />}
    </AppShell>
  );
}

function CentroCustoForm({ onClose, onSaved }: { onClose: () => void; onSaved: (c: CentroCusto) => void }) {
  const [f, setF] = React.useState({ nome: "", codigo: "", codigoContabil: "", descricao: "", ativo: true });
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const salvar = () => { onSaved(addCentroCusto(f)); };
  return (
    <FormModal title="Novo centro de custo" onClose={onClose} onSave={salvar}>
      <SectionTitle>Identificação</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Nome *" value={f.nome} onChange={(e) => set("nome", e.target.value)} />
        <Input label="Código *" value={f.codigo} onChange={(e) => set("codigo", e.target.value)} placeholder="CC-COM" />
        <Input label="Código contábil (Domínio)" value={f.codigoContabil} onChange={(e) => set("codigoContabil", e.target.value)} placeholder="100" />
      </div>
      <Textarea label="Descrição" value={f.descricao} onChange={(e) => set("descricao", e.target.value)} rows={2} />
      <div className="flex items-center gap-2 pt-1">
        <Switch checked={f.ativo} onChange={(v) => set("ativo", v)} /><span className="text-label text-muted">Centro de custo ativo</span>
      </div>
    </FormModal>
  );
}
