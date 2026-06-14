"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Icon, BRL, Button, Input, Select, CurrencyInput, DateField, Textarea } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { lerDocumento } from "@/lib/ocr-ingest";
import {
  listReembolsos, solicitarReembolso, sincronizarReembolsos,
  type Reembolso, type ItemReembolso, type StatusReembolso,
} from "@/lib/reembolsos";

const CATEGORIAS = ["Alimentação", "Transporte", "Hospedagem", "Combustível", "Material", "Outros"];
const STATUS: Record<StatusReembolso, { label: string; cor: string }> = {
  em_aprovacao: { label: "Em aprovação", cor: "var(--color-warning)" },
  aprovado: { label: "Aprovado", cor: "var(--color-positive)" },
  rejeitado: { label: "Rejeitado", cor: "var(--color-negative)" },
  a_pagar: { label: "A pagar (na Central)", cor: "var(--color-positive)" },
};
type Aba = "meus" | "aprovacao" | "pagar";
const hoje = () => new Date().toISOString().slice(0, 10);
const novoItem = (): ItemReembolso => ({ descricao: "", valor: 0, data: hoje(), categoria: "Alimentação" });

export function ReembolsosView() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const [lista, setLista] = React.useState<Reembolso[]>([]);
  const [aba, setAba] = React.useState<Aba>("meus");

  // form
  const [colaborador, setColaborador] = React.useState("");
  const [chavePix, setChavePix] = React.useState("");
  const [justificativa, setJustificativa] = React.useState("");
  const [itens, setItens] = React.useState<ItemReembolso[]>([novoItem()]);
  const [lendo, setLendo] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(async () => {
    await sincronizarReembolsos();
    setLista(listReembolsos());
    await qc.invalidateQueries();
  }, [qc]);

  React.useEffect(() => { refresh(); }, [refresh]);

  const total = itens.reduce((s, it) => s + it.valor, 0);
  const setItem = (i: number, patch: Partial<ItemReembolso>) =>
    setItens((arr) => arr.map((it, k) => (k === i ? { ...it, ...patch } : it)));

  const lerComprovante = async (file: File) => {
    setLendo(true);
    try {
      const r = await lerDocumento(file, false); // OCR local (mesmo pipeline da Caixa de Entrada)
      if (r.kind === "doc") {
        setItens((arr) => [...arr, {
          descricao: r.fields.beneficiario || file.name,
          valor: r.fields.valor ?? 0,
          data: r.fields.data || hoje(),
          categoria: "Outros",
        }]);
        show("Comprovante lido — item adicionado, revise valor/categoria");
      } else show("Não consegui ler o comprovante — adicione o item manualmente");
    } finally { setLendo(false); }
  };

  const solicitar = async () => {
    const validos = itens.filter((it) => it.valor > 0 && it.descricao.trim());
    if (!colaborador.trim() || !validos.length) { show("Informe colaborador e ao menos um item com valor"); return; }
    await solicitarReembolso({ colaborador: colaborador.trim(), chavePix: chavePix.trim(), itens: validos, justificativa: justificativa.trim() || undefined });
    setColaborador(""); setChavePix(""); setJustificativa(""); setItens([novoItem()]);
    await refresh();
    show("Reembolso solicitado — roteado para aprovação conforme a alçada");
  };

  const filtradas = lista.filter((r) =>
    aba === "meus" ? true
      : aba === "aprovacao" ? (r.status === "em_aprovacao" || r.status === "aprovado")
        : r.status === "a_pagar");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* Solicitar reembolso */}
      <Card className="lg:col-span-1 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Solicitar reembolso</span>
        <Input value={colaborador} onChange={(e) => setColaborador(e.target.value)} placeholder="Colaborador" />
        <Input value={chavePix} onChange={(e) => setChavePix(e.target.value)} placeholder="Chave Pix do colaborador" />

        <div className="flex items-center justify-between">
          <span className="text-caption font-medium text-faint tracking-wide">Itens de despesa</span>
          <button onClick={() => fileRef.current?.click()} disabled={lendo} className="text-caption font-medium text-ink bg-surface-2 rounded-pill px-2 py-1 hover:bg-surface-3 inline-flex items-center gap-1">
            <Icon name="scan-line" size={12} color="var(--color-text-secondary)" />{lendo ? "Lendo…" : "Ler comprovante"}
          </button>
          <input ref={fileRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.pdf,image/*" onChange={(e) => e.target.files?.[0] && lerComprovante(e.target.files[0])} />
        </div>

        {itens.map((it, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-border-soft p-2">
            <Input value={it.descricao} onChange={(e) => setItem(i, { descricao: e.target.value })} placeholder="Descrição (ex.: almoço cliente)" />
            <div className="grid grid-cols-2 gap-2">
              <CurrencyInput value={it.valor} onValueChange={(v) => setItem(i, { valor: v })} />
              <DateField value={it.data} onChange={(v) => setItem(i, { data: v })} />
            </div>
            <Select value={it.categoria} onChange={(v) => setItem(i, { categoria: v })} options={CATEGORIAS.map((c) => ({ value: c, label: c }))} />
            {itens.length > 1 && <button onClick={() => setItens((a) => a.filter((_, k) => k !== i))} className="text-caption text-faint hover:text-negative self-end">remover</button>}
          </div>
        ))}
        <button onClick={() => setItens((a) => [...a, novoItem()])} className="text-caption font-medium text-muted hover:text-ink self-start">+ adicionar item</button>

        <Textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Justificativa (opcional)" rows={2} />
        <div className="flex items-center justify-between border-t border-border-soft pt-2">
          <span className="text-caption text-faint">Total <span className="text-ink tabular-nums font-medium"><BRL value={total} /></span></span>
          <Button variant="primary" size="sm" onClick={solicitar}>Solicitar</Button>
        </div>
      </Card>

      {/* Lista */}
      <Card padded={false} className="lg:col-span-2">
        <div className="flex items-center gap-1 px-5 pt-[14px] border-b border-border-soft">
          {([["meus", "Meus reembolsos"], ["aprovacao", "Aguardando aprovação"], ["pagar", "A pagar"]] as [Aba, string][]).map(([id, label]) => {
            const on = aba === id;
            return <button key={id} onClick={() => setAba(id)} className={`relative px-3 py-2 text-caption ${on ? "text-ink font-medium" : "text-muted hover:text-ink"}`}>{label}{on && <span className="absolute left-0 -bottom-px w-full h-[2px] bg-ink rounded-pill" />}</button>;
          })}
        </div>
        <div className="flex flex-col max-h-[560px] overflow-y-auto">
          {filtradas.length === 0 ? (
            <p className="text-caption text-faint text-center py-8">Nenhum reembolso aqui. Aprovações ficam em <b className="text-muted font-medium">Solicitações &amp; aprovações</b>.</p>
          ) : filtradas.map((r) => (
            <div key={r.id} className="flex items-start gap-3 px-5 py-3 border-t border-border-soft first:border-t-0">
              <span className="w-2 h-2 rounded-pill mt-[6px] shrink-0" style={{ background: STATUS[r.status].cor }} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-ink truncate">{r.colaborador} · {r.itens.length} item(ns)</div>
                <div className="text-caption text-faint truncate">{r.itens.map((i) => i.categoria).filter((v, k, a) => a.indexOf(v) === k).join(", ")} · {STATUS[r.status].label}{r.chavePix ? ` · Pix ${r.chavePix}` : ""}</div>
              </div>
              <span className="text-caption text-ink tabular-nums shrink-0"><BRL value={r.total} /></span>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-border-soft">
          <span className="text-caption text-faint">Aprovados viram movimento de saída (1 por item → categoria certa na DRE) e entram na <b className="text-muted font-medium">Central de Pagamentos</b> para o Pix ao colaborador.</span>
        </div>
      </Card>
      {node}
    </div>
  );
}
