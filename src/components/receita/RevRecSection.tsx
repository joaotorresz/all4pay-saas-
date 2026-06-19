"use client";

/**
 * Reconhecimento de receita (CPC 47 / IFRS 15) — contratos com receita diferida.
 * Cria o contrato, gera o cronograma (linear por padrão; a IA pode propor o
 * perfil conforme o modelo) e reconhece período a período. Persiste em
 * revenue_contracts/_schedule (live) / localStorage (demo).
 */
import * as React from "react";
import { Card, BRL, Button, Icon, Input, Select, CurrencyInput, DatePicker, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import {
  listRevRec, criarRevRec, reconhecerParcela, cronogramaLinear, mesesEntre, resumoRevRec,
  type RevRecContrato, type RevRecParcela, type ModeloReceita,
} from "@/lib/revrec";

const MODELOS: { value: ModeloReceita; label: string }[] = [
  { value: "subscription", label: "Assinatura (linear)" },
  { value: "usage", label: "Uso / consumo" },
  { value: "milestone", label: "Marcos (milestone)" },
];
const fmtMes = (iso: string) => { const [y, m] = iso.split("-"); return `${m}/${y}`; };
const round2 = (n: number) => Math.round(n * 100) / 100;
const hojeISO = () => new Date().toISOString().slice(0, 10);
const emMeses = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };

export function RevRecSection() {
  const { show, node } = useToast();
  const [contratos, setContratos] = React.useState<RevRecContrato[] | null>(null);
  const [iaOn, setIaOn] = React.useState(false);
  const [form, setForm] = React.useState(false);

  const [customer, setCustomer] = React.useState("");
  const [total, setTotal] = React.useState(0);
  const [model, setModel] = React.useState<ModeloReceita>("subscription");
  const [start, setStart] = React.useState(hojeISO());
  const [end, setEnd] = React.useState(emMeses(11));
  const [parcelas, setParcelas] = React.useState<RevRecParcela[]>([]);
  const [racional, setRacional] = React.useState<string | null>(null);
  const [aiBusy, setAiBusy] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);

  const recarregar = React.useCallback(async () => { try { setContratos(await listRevRec()); } catch { setContratos([]); } }, []);
  React.useEffect(() => { recarregar(); }, [recarregar]);
  React.useEffect(() => { fetch("/api/ai/revrec").then((r) => r.json()).then((j) => setIaOn(!!j?.configured)).catch(() => setIaOn(false)); }, []);

  // Recalcula o cronograma linear sempre que total/datas mudam (preview).
  React.useEffect(() => {
    if (total > 0 && start && end) { setParcelas(cronogramaLinear(total, start, end)); setRacional(null); }
    else setParcelas([]);
  }, [total, start, end]);

  const proporIA = async () => {
    if (total <= 0 || !start || !end) return;
    setAiBusy(true); setRacional(null);
    try {
      const periodos = mesesEntre(start, end);
      const j = await fetch("/api/ai/revrec", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ customer, total, model, periodos }),
      }).then((r) => r.json());
      if (j?.ok && Array.isArray(j.parcelas)) {
        const validos = new Set(periodos);
        const mapa = new Map<string, number>();
        for (const p of j.parcelas as Array<{ period: string; amount: number }>) {
          if (validos.has(p.period)) mapa.set(p.period, round2(Number(p.amount) || 0));
        }
        let novas = periodos.map((period) => ({ period, amount: mapa.get(period) ?? 0, recognized: false }));
        const soma = novas.reduce((s, p) => s + p.amount, 0);
        // ajuste de arredondamento: última parcela absorve a diferença p/ bater o total
        const diff = round2(total - soma);
        if (Math.abs(diff) >= 0.01 && novas.length) novas[novas.length - 1] = { ...novas[novas.length - 1], amount: round2(novas[novas.length - 1].amount + diff) };
        setParcelas(novas);
        setRacional(typeof j.racional === "string" ? j.racional : null);
        show("Cronograma proposto pela IA");
      } else { show("IA indisponível — mantido o cronograma linear."); }
    } catch { show("Falha ao propor com IA — mantido o linear."); }
    finally { setAiBusy(false); }
  };

  const salvar = async () => {
    if (!customer.trim() || total <= 0 || parcelas.length === 0) { show("Informe cliente, valor e vigência."); return; }
    setSalvando(true);
    try {
      await criarRevRec({ customer: customer.trim(), total, model, startDate: start, endDate: end, parcelas });
      await recarregar();
      setForm(false); setCustomer(""); setTotal(0); setRacional(null);
      show("Contrato de receita criado");
    } catch (e) { show((e as Error)?.message ?? "Não foi possível salvar"); }
    finally { setSalvando(false); }
  };

  const reconhecer = async (c: RevRecContrato, period: string) => {
    try { await reconhecerParcela(c.id, period); await recarregar(); show(`Receita de ${fmtMes(period)} reconhecida`); }
    catch { show("Não foi possível reconhecer"); }
  };

  const resumo = contratos ? resumoRevRec(contratos) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="m-0 text-h3 font-medium text-ink">Contratos de receita · CPC 47</h2>
        <Button size="sm" variant="secondary" leftIcon={<Icon name="plus" size={14} />} onClick={() => setForm((f) => !f)}>
          {form ? "Fechar" : "Novo contrato"}
        </Button>
      </div>

      {resumo && (
        <div className="grid grid-cols-3 gap-4">
          <Mini label="Contratado" v={resumo.total} />
          <Mini label="Reconhecido" v={resumo.reconhecido} tone="var(--color-positive)" />
          <Mini label="Diferido (a reconhecer)" v={resumo.diferido} tone="var(--color-warning)" />
        </div>
      )}

      {form && (
        <Card className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input label="Cliente" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Tomador do serviço" containerClassName="lg:col-span-2" />
            <CurrencyInput label="Valor total do contrato" value={total} onValueChange={setTotal} />
            <Select label="Modelo" value={model} onChange={(v) => setModel(v as ModeloReceita)} options={MODELOS} />
            <DatePicker label="Início" value={start} onChange={setStart} />
            <DatePicker label="Fim" value={end} onChange={setEnd} min={start} />
          </div>

          {parcelas.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-label font-medium text-muted">Cronograma de apropriação ({parcelas.length} meses)</span>
                {iaOn && (
                  <Button size="sm" variant="ghost" disabled={aiBusy} onClick={proporIA} leftIcon={<Icon name="sparkles" size={14} color="var(--color-lime)" />}>
                    {aiBusy ? "Propondo…" : "Propor cronograma (IA)"}
                  </Button>
                )}
              </div>
              {racional && <span className="text-caption text-faint inline-flex items-start gap-2"><Icon name="sparkles" size={13} color="var(--color-lime)" />{racional}</span>}
              <div className="flex flex-wrap gap-2">
                {parcelas.map((p) => (
                  <span key={p.period} className="text-caption tabular-nums bg-surface-2 rounded-pill px-3 py-1">
                    {fmtMes(p.period)} · <span className="text-ink"><BRL value={p.amount} /></span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setForm(false)}>Cancelar</Button>
            <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar contrato"}</Button>
          </div>
        </Card>
      )}

      {contratos && contratos.length === 0 && !form && (
        <Card><span className="text-caption text-faint">Nenhum contrato de receita ainda. Crie um para apropriar a receita ao longo da vigência (CPC 47).</span></Card>
      )}

      {(contratos ?? []).map((c) => (
        <Card key={c.id} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-col">
              <span className="text-[17px] font-medium text-ink">{c.customer}</span>
              <span className="text-caption text-faint">{MODELOS.find((m) => m.value === c.model)?.label} · {fmtMes(c.startDate)}–{fmtMes(c.endDate)} · total <BRL value={c.total} /></span>
            </div>
          </div>
          <div className="flex flex-col">
            {c.parcelas.map((p, i) => (
              <div key={p.period} className={`flex items-center gap-3 py-2 text-caption ${i ? "border-t border-border-soft" : ""}`}>
                <span className="text-muted w-[80px] tabular-nums">{fmtMes(p.period)}</span>
                <span className="tabular-nums text-ink flex-1"><BRL value={p.amount} /></span>
                {p.recognized ? (
                  <StatusBadge tone="positive">reconhecida</StatusBadge>
                ) : (
                  <button onClick={() => reconhecer(c, p.period)} className="text-caption font-medium text-ink underline">Reconhecer</button>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
      {node}
    </div>
  );
}

function Mini({ label, v, tone = "var(--color-ink)" }: { label: string; v: number; tone?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[18px] font-semibold tabular-nums" style={{ color: tone }}><BRL value={v} /></span>
    </Card>
  );
}
