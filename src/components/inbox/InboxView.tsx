"use client";

import * as React from "react";
import { Card, Icon, BRL, Button } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useToast } from "@/components/listas/ListChrome";
import { analisarImportacao } from "@/core/fdip";
import {
  DEMO_INBOX, INBOX_CANAIS, STATUS_META,
  type InboxDoc, type DocStatus,
} from "@/lib/inbox";

const EMAIL = "financeiro@suaempresa.all4pay.com";

/** Atualizações que um documento confirmado propaga pelo ecossistema. */
const ECOSSISTEMA = [
  "Contas a pagar", "Contas a receber", "Fluxo de caixa", "DRE", "Tesouraria",
  "Forecast", "Runway", "Burn", "Dashboard", "IA", "Auditoria", "Eventos",
  "Calendário financeiro", "Aprovações", "Recorrências", "Contatos",
  "Centros de custo", "Benchmark", "Feature Store",
];

const tipoFromName = (name: string): string => {
  const n = name.toLowerCase();
  if (n.endsWith(".ofx")) return "Extrato OFX";
  if (n.endsWith(".csv") || n.endsWith(".xlsx") || n.endsWith(".xls")) return "Planilha";
  if (n.endsWith(".xml")) return "NF-e / XML";
  if (n.match(/\.(png|jpg|jpeg)$/)) return "Imagem / comprovante";
  if (n.endsWith(".pdf")) return "PDF";
  return "Documento";
};

const confColor = (c: number) => (c >= 0.95 ? "var(--color-positive)" : c >= 0.85 ? "var(--color-warning)" : "var(--color-negative)");

export function InboxView() {
  const { show, node } = useToast();
  const [docs, setDocs] = React.useState<InboxDoc[]>(DEMO_INBOX);
  const [selId, setSelId] = React.useState<string>(DEMO_INBOX[0]?.id ?? "");
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const sel = docs.find((d) => d.id === selId) ?? docs[0];

  const ingerir = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const f of arr) {
      const id = `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      let valor = 0;
      let cross = "Recebido — IA classificando…";
      let status: DocStatus = "analise";
      try {
        if (/\.(ofx|csv|txt)$/i.test(f.name)) {
          const texto = await f.text();
          const rep = analisarImportacao(texto);
          valor = rep.records.reduce((s, r) => s + Math.abs(r.valor), 0);
          cross = `${rep.records.length} lançamentos lidos · ${rep.entidades.length} contrapartes · ${rep.plano.categorias.length} categorias detectadas.`;
          status = "pronto";
        }
      } catch { /* mantém em análise */ }
      const doc: InboxDoc = {
        id, tipo: tipoFromName(f.name), canal: "Upload", beneficiario: f.name,
        valor, data: new Date().toISOString().slice(0, 10), status,
        confianca: status === "pronto" ? 0.9 : 0.5, acao: "Revisar e classificar",
        acaoTipo: "a_pagar", crossCheck: cross,
        matriz: [{ campo: "Documento", confianca: 0.95 }, { campo: "Ação financeira", confianca: 0.6 }],
      };
      setDocs((d) => [doc, ...d]);
      setSelId(id);
    }
    show(`${arr.length} documento(s) na caixa de entrada`);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    if (e.dataTransfer.files?.length) ingerir(e.dataTransfer.files);
  };

  const confirmar = (d: InboxDoc) => {
    setDocs((ds) => ds.map((x) => (x.id === d.id ? { ...x, status: "processado" } : x)));
    show("Confirmado — atualizou contas, fluxo, DRE, tesouraria e o resto do ecossistema");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* Canais de entrada */}
      <Card className="lg:col-span-3 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
            <Icon name="inbox" size={14} color="var(--color-on-lime)" />
          </span>
          <span className="text-label font-medium text-muted">Canais de entrada — tudo cai aqui, como um e-mail</span>
          <span className="ml-auto inline-flex items-center gap-2 text-caption text-muted bg-surface-2 rounded-pill px-3 py-1">
            <Icon name="mail" size={13} color="var(--color-text-secondary)" />
            {EMAIL}
          </span>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`rounded-card border border-dashed p-6 text-center cursor-pointer transition-colors ${drag ? "border-lime bg-lime-tint" : "border-border hover:border-ink/30"}`}
        >
          <Icon name="upload" size={22} color="var(--color-text-secondary)" />
          <p className="m-0 mt-2 text-[15px] text-ink">Arraste documentos aqui ou clique para enviar</p>
          <p className="m-0 text-caption text-faint">PDF · PNG · JPG · OFX · Excel · CSV · XML · DANFE · NFS-e · boleto · comprovante</p>
          <input ref={inputRef} type="file" multiple hidden onChange={(e) => e.target.files && ingerir(e.target.files)} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {INBOX_CANAIS.map((c) => (
            <div key={c.titulo} className="rounded-md border border-border-soft p-3 flex flex-col gap-1">
              <Icon name={c.icon} size={16} color="var(--color-text-secondary)" />
              <span className="text-[13px] font-medium text-ink">{c.titulo}</span>
              <span className="text-caption text-faint leading-[1.35]">{c.desc}</span>
              {!c.pronto && <span className="text-caption text-faint mt-[2px]">em breve</span>}
            </div>
          ))}
        </div>
      </Card>

      {/* Inbox list */}
      <Card padded={false} className="lg:col-span-1">
        <div className="px-5 pt-[18px] pb-2 flex items-center justify-between">
          <span className="text-body font-medium text-ink">Caixa de entrada</span>
          <span className="text-caption text-faint">{docs.length}</span>
        </div>
        <div className="flex flex-col max-h-[560px] overflow-y-auto">
          {docs.map((d) => {
            const st = STATUS_META[d.status];
            const on = d.id === sel?.id;
            return (
              <button
                key={d.id}
                onClick={() => setSelId(d.id)}
                className={`flex items-start gap-3 px-5 py-3 text-left border-t border-border-soft first:border-t-0 ${on ? "bg-surface-2" : "hover:bg-surface-1"}`}
              >
                <span className="w-2 h-2 rounded-pill mt-[6px] shrink-0" style={{ background: st.dot }} title={st.label} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] text-ink truncate">{d.beneficiario}</div>
                  <div className="text-caption text-faint truncate">{d.tipo} · {d.canal} · {st.label}</div>
                </div>
                {d.valor > 0 && <span className="text-caption text-muted tabular-nums shrink-0"><BRL value={d.valor} /></span>}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Workbench do documento selecionado */}
      {sel && (
        <Card className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Icon name="paperclip" size={15} color="var(--color-text-secondary)" />
              <span className="text-h3 font-medium text-ink">{sel.beneficiario}</span>
              <span className="text-caption text-muted bg-surface-2 rounded-pill px-2 py-[1px]">{sel.tipo}</span>
            </div>
            <span className="inline-flex items-center gap-1 text-caption font-medium" style={{ color: confColor(sel.confianca) }}>
              confiança {Math.round(sel.confianca * 100)}%
            </span>
          </div>

          {/* Campos extraídos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            <Campo label="Valor" value={sel.valor > 0 ? formatBRL(sel.valor) : "—"} />
            <Campo label="Recebido" value={fmt(sel.data)} />
            {sel.vencimento && <Campo label="Vencimento" value={fmt(sel.vencimento)} />}
            <Campo label="Ação detectada" value={sel.acao} />
            {sel.categoria && <Campo label="Categoria" value={sel.categoria} />}
            {sel.centroCusto && <Campo label="Centro de custo" value={sel.centroCusto} />}
            {sel.recorrencia && <Campo label="Recorrência" value={sel.recorrencia} />}
            {sel.conta && <Campo label="Conta" value={sel.conta} />}
          </div>

          {/* Cross-check inteligente */}
          {sel.crossCheck && (
            <div className="rounded-md p-3 flex items-start gap-2" style={{ background: "var(--color-surface-2)" }}>
              <Icon name="sparkles" size={15} color="var(--color-text-secondary)" className="mt-[2px]" />
              <span className="text-caption text-muted leading-[1.5]">{sel.crossCheck}</span>
            </div>
          )}

          {/* Beneficiário novo → sugestões */}
          {sel.novoBeneficiario && (
            <div className="flex flex-wrap gap-2">
              {["Criar fornecedor", "Criar categoria", "Criar recorrência"].map((s) => (
                <button key={s} onClick={() => show(`${s} — sugerido pela IA`)} className="text-caption font-medium text-ink bg-surface-2 rounded-pill px-3 py-1 hover:bg-surface-3">
                  + {s}
                </button>
              ))}
            </div>
          )}

          {/* Matriz de confiança */}
          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium text-faint tracking-wide">Matriz de confiança — campos ≥ 95% podem aprovar sozinhos</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-[6px]">
              {sel.matriz.map((m) => (
                <div key={m.campo} className="flex items-center gap-3">
                  <span className="text-caption text-muted w-[130px] truncate">{m.campo}</span>
                  <div className="flex-1 h-[6px] rounded-pill bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-pill" style={{ width: `${m.confianca * 100}%`, background: confColor(m.confianca) }} />
                  </div>
                  <span className="text-caption tabular-nums w-[38px] text-right" style={{ color: confColor(m.confianca) }}>{Math.round(m.confianca * 100)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border-soft pt-3 flex-wrap">
            <span className="text-caption text-faint">Ao confirmar, o documento alimenta todo o ecossistema (contas, fluxo, DRE, tesouraria, forecast…).</span>
            {sel.status === "processado" ? (
              <span className="inline-flex items-center gap-1 text-caption font-medium text-positive"><Icon name="check" size={14} color="var(--color-positive)" /> Processado</span>
            ) : (
              <Button variant="primary" size="sm" onClick={() => confirmar(sel)}>Confirmar e processar</Button>
            )}
          </div>
        </Card>
      )}

      {/* Digital Twin */}
      <Card className="lg:col-span-3 flex flex-col gap-2" elevated={false} style={{ background: "var(--color-surface-2)" }}>
        <div className="flex items-center gap-2">
          <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
            <Icon name="cpu" size={14} color="var(--color-on-lime)" />
          </span>
          <span className="text-label font-medium text-muted">Financial Digital Twin</span>
        </div>
        <p className="m-0 text-body text-ink leading-[1.5] max-w-[90ch]">
          A IA mantém um <b className="font-medium">gêmeo digital</b> das obrigações da empresa — aprende que todo dia 10 chega a internet,
          dia 5 a folha, dia 20 o fornecedor X. Quando um documento novo chega, ela compara com esse modelo vivo e conclui, por exemplo:
        </p>
        <p className="m-0 text-caption text-muted leading-[1.6] max-w-[90ch] border-l-2 border-border pl-3">
          “Este boleto corresponde à internet recorrente da unidade Campinas. Está 22% acima da média de 12 meses, há orçamento disponível,
          o fornecedor está cadastrado e há saldo na conta BTG. Posso criar o compromisso, agendar o pagamento na data ótima de caixa,
          atualizar o fluxo projetado e registrar a obrigação na DRE.”
        </p>
        <span className="text-caption text-faint">OCR, e-mail, WhatsApp e Open Finance são conectores de ingestão que plugam nesta mesma esteira — o upload de extratos (OFX/CSV) já roda hoje pelo motor de onboarding inteligente.</span>
      </Card>

      {node}
    </div>
  );
}

function Campo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[15px] text-ink">{value}</span>
    </div>
  );
}

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}
