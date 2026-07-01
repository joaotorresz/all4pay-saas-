"use client";

/**
 * Cadastros › Projetos (modelo IULI) — centros de resultado temporais: nome,
 * código, descrição, data inicial/final (obrigatórias) e previsões de receita e
 * despesa. Permitem medir o realizado contra o previsto. Store local, demo-safe.
 */
import * as React from "react";
import { AppShell } from "@/components/app/AppShell";
import { Card, Button, Input, Textarea, DateField, CurrencyInput, Icon } from "@/components/ui";
import { FormModal, SectionTitle } from "@/components/lancamentos/FormModal";
import { listProjetos, addProjeto, type Projeto } from "@/lib/iuli-cadastros";
import { formatBRL } from "@/lib/format";

const fmtDia = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");

export function ProjetosView() {
  const [itens, setItens] = React.useState<Projeto[]>([]);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { setItens(listProjetos()); }, []);

  return (
    <AppShell title="Projetos" actions={<Button variant="primary" leftIcon={<Icon name="plus" size={15} />} onClick={() => setOpen(true)}>Novo projeto</Button>}>
      <div className="flex flex-col gap-5 pb-6">
        {itens.length === 0 ? (
          <Card className="flex flex-col items-start gap-2">
            <span className="text-h3 font-medium text-ink">Nenhum projeto ainda</span>
            <span className="text-caption text-muted">Projetos são centros de resultado temporais (um lançamento, uma campanha) com previsão de receita e despesa.</span>
            <Button variant="secondary" className="mt-1" onClick={() => setOpen(true)}>Criar primeiro projeto</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {itens.map((p) => {
              const resultado = p.previsaoReceita - p.previsaoDespesa;
              return (
                <Card
                  key={p.id}
                  className="flex flex-col gap-2"
                  info={{
                    titulo: "Projeto",
                    oQue: "Um centro de resultado temporal (um lançamento, uma campanha) para medir o realizado contra o previsto.",
                    comoCalcula: "Resultado previsto = previsão de receita − previsão de despesa informadas no cadastro do projeto.",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] font-semibold text-ink flex-1">{p.nome}</span>
                    {p.codigo && <span className="text-caption text-faint">{p.codigo}</span>}
                  </div>
                  <span className="text-caption text-muted">{fmtDia(p.dataInicial)} → {fmtDia(p.dataFinal)}</span>
                  {p.descricao && <span className="text-caption text-faint">{p.descricao}</span>}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 pt-2 border-t border-border-soft mt-1">
                    <Prev label="Previsão receita" v={p.previsaoReceita} cor="var(--color-positive)" />
                    <Prev label="Previsão despesa" v={p.previsaoDespesa} cor="var(--color-negative)" />
                    <Prev label="Resultado previsto" v={resultado} cor="var(--color-ink)" />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      {open && <ProjetoForm onClose={() => setOpen(false)} onSaved={(p) => { setItens((xs) => [p, ...xs]); setOpen(false); }} />}
    </AppShell>
  );
}

function Prev({ label, v, cor }: { label: string; v: number; cor: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[15px] font-semibold tabular-nums" style={{ color: cor }}>{formatBRL(v)}</span>
    </div>
  );
}

function ProjetoForm({ onClose, onSaved }: { onClose: () => void; onSaved: (p: Projeto) => void }) {
  const [f, setF] = React.useState({ nome: "", codigo: "", descricao: "", dataInicial: "", dataFinal: "", previsaoReceita: 0, previsaoDespesa: 0 });
  const set = (k: keyof typeof f, v: string | number) => setF((s) => ({ ...s, [k]: v }));
  const salvar = () => { onSaved(addProjeto(f)); };
  return (
    <FormModal title="Novo projeto" onClose={onClose} onSave={salvar}>
      <SectionTitle>Identificação</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Nome *" value={f.nome} onChange={(e) => set("nome", e.target.value)} containerClassName="sm:col-span-2" />
        <Input label="Código" value={f.codigo} onChange={(e) => set("codigo", e.target.value)} placeholder="PRJ-2026" />
      </div>
      <Textarea label="Descrição" value={f.descricao} onChange={(e) => set("descricao", e.target.value)} rows={2} />
      <SectionTitle>Período do projeto</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DateField label="Data inicial *" value={f.dataInicial} onChange={(v) => set("dataInicial", v)} />
        <DateField label="Data final *" value={f.dataFinal} onChange={(v) => set("dataFinal", v)} />
      </div>
      <SectionTitle>Previsões</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CurrencyInput label="Previsão de receita" value={f.previsaoReceita} onValueChange={(v) => set("previsaoReceita", v)} />
        <CurrencyInput label="Previsão de despesa" value={f.previsaoDespesa} onValueChange={(v) => set("previsaoDespesa", v)} />
      </div>
    </FormModal>
  );
}
