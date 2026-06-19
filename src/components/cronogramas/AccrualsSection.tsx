"use client";

/**
 * Provisões / accruals sugeridos (competência). Detecta despesas recorrentes
 * ainda não lançadas no mês e propõe provisioná-las; a IA pode refinar. Postar
 * gera um lançamento balanceado no razão (débito despesa · crédito provisões).
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, BRL, Button, Icon, StatusBadge, Skeleton } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { getRiscoInput } from "@/lib/data";
import { sugerirAccruals, type AccrualSugerido } from "@/lib/accruals";
import { postarLancamento } from "@/lib/ledger";
import { nomeConta } from "@/core/ledger/chart";

const PROVISAO = "2.1.99"; // Provisões a pagar (crédito)

export function AccrualsSection() {
  const { show, node } = useToast();
  const q = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  const mes = (q.data?.hoje ?? new Date().toISOString().slice(0, 10)).slice(0, 7);
  const base = React.useMemo(() => (q.data ? sugerirAccruals(q.data) : []), [q.data]);

  const [iaOn, setIaOn] = React.useState(false);
  const [refino, setRefino] = React.useState<Map<string, { valor: number; motivo: string; provisionar: boolean }>>(new Map());
  const [postados, setPostados] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => { fetch("/api/ai/accruals").then((r) => r.json()).then((j) => setIaOn(!!j?.configured)).catch(() => setIaOn(false)); }, []);

  const refinar = async () => {
    if (!base.length) return;
    setBusy("ia");
    try {
      const j = await fetch("/api/ai/accruals", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mes, candidatos: base.map((a) => ({ categoria: a.categoria, valor: a.valor, mesesPresentes: a.mesesPresentes })) }),
      }).then((r) => r.json());
      if (j?.ok && Array.isArray(j.sugestoes)) {
        const m = new Map<string, { valor: number; motivo: string; provisionar: boolean }>();
        for (const s of j.sugestoes as Array<{ categoria: string; provisionar: boolean; valor: number; motivo: string }>) {
          m.set(s.categoria, { valor: Number(s.valor) || 0, motivo: String(s.motivo ?? ""), provisionar: !!s.provisionar });
        }
        setRefino(m);
        show("Provisões refinadas pela IA");
      } else show("IA indisponível — mantida a sugestão determinística.");
    } catch { show("Falha ao refinar com IA."); }
    finally { setBusy(null); }
  };

  const lancar = async (a: AccrualSugerido) => {
    const r = refino.get(a.categoria);
    const valor = r?.valor ?? a.valor;
    setBusy(a.categoria);
    try {
      await postarLancamento({
        entryDate: `${mes}-01`,
        description: `Provisão ${a.categoria} · ${mes}`,
        source: "accrual",
        externalKey: `accrual:${mes}:${a.categoria}`,
        lines: [{ accountId: a.conta, debit: valor }, { accountId: PROVISAO, credit: valor }],
      });
      setPostados((s) => new Set(s).add(a.categoria));
      show(`Provisão de ${a.categoria} lançada no razão`);
    } catch (e) { show(`Falha ao lançar: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  // a IA pode marcar provisionar:false → some da lista
  const lista = base.filter((a) => refino.get(a.categoria)?.provisionar !== false);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-label font-medium text-muted inline-flex items-center gap-2">
          <Icon name="repeat" size={15} color="var(--color-text-secondary)" /> Provisões sugeridas · competência ({mes})
        </span>
        {iaOn && base.length > 0 && (
          <Button size="sm" variant="ghost" disabled={busy === "ia"} onClick={refinar} leftIcon={<Icon name="sparkles" size={14} color="var(--color-lime)" />}>
            {busy === "ia" ? "Refinando…" : "Refinar com IA"}
          </Button>
        )}
      </div>

      {q.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : lista.length === 0 ? (
        <span className="text-caption text-faint">Nenhuma provisão sugerida — as despesas recorrentes já estão lançadas no mês corrente.</span>
      ) : (
        <div className="flex flex-col">
          {lista.map((a, i) => {
            const r = refino.get(a.categoria);
            const valor = r?.valor ?? a.valor;
            const feito = postados.has(a.categoria);
            return (
              <div key={a.categoria} className={`flex items-start gap-3 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium text-ink">{a.categoria}</div>
                  <div className="text-caption text-faint">{r?.motivo ?? a.motivo}</div>
                  <div className="text-caption text-faint tabular-nums mt-[2px]">débito {a.conta} · {nomeConta(a.conta)} → crédito {nomeConta(PROVISAO)}</div>
                </div>
                <span className="tabular-nums text-ink shrink-0 w-[110px] text-right"><BRL value={valor} /></span>
                {feito ? (
                  <StatusBadge tone="positive">provisionada</StatusBadge>
                ) : (
                  <Button size="sm" variant="secondary" disabled={busy === a.categoria} onClick={() => lancar(a)}>{busy === a.categoria ? "…" : "Lançar no razão"}</Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <span className="text-caption text-faint">Despesa incorrida recorrente ainda não lançada no mês vira provisão (débito da despesa · crédito Provisões a pagar). Some sozinha quando o lançamento real entra.</span>
      {node}
    </Card>
  );
}
