"use client";

/**
 * Assistente (Razão) — Fase 6. Conversa sobre o GL: o modelo recebe um contexto
 * numérico (não o banco cru), responde citando os números e pode RASCUNHAR um
 * lançamento balanceado que só é postado com aprovação humana. Trilha em
 * ai_actions. Usa Claude com ANTHROPIC_API_KEY; sem chave, modo básico.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, BRL, Button, Icon, Skeleton } from "@/components/ui";
import { contextoRazao, responderBasico, registrarAcaoIA, postarLancamento, type ContextoRazao } from "@/lib/ledger";
import { exigirBalanceado, type LedgerEntryInput } from "@/core/ledger";
import { nomeConta } from "@/core/ledger/chart";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { AppShell } from "@/components/app/AppShell";

const SUGESTOES = [
  "Qual o resultado do período?",
  "O razão está balanceado?",
  "Qual a maior conta de despesa?",
  "Rascunhe um lançamento de R$ 1.000 de despesa operacional paga em caixa.",
];

interface Turno { pergunta: string; resposta: string; fontes?: string[]; rascunho?: LedgerEntryInput | null; modo: "ia" | "basico" }

export function AssistenteView() {
  const qc = useQueryClient();
  const [ctx, setCtx] = React.useState<ContextoRazao | null>(null);
  const [pergunta, setPergunta] = React.useState("");
  const [turnos, setTurnos] = React.useState<Turno[]>([]);
  const [pensando, setPensando] = React.useState(false);
  const [postandoIdx, setPostandoIdx] = React.useState<number | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  React.useEffect(() => { contextoRazao().then(setCtx).catch(() => setCtx(null)); }, []);

  const perguntar = async (q: string) => {
    const pq = q.trim();
    if (!pq || !ctx || pensando) return;
    setPergunta(""); setPensando(true); setMsg(null);
    try {
      let turno: Turno;
      const cfg = await fetch("/api/ledger/assistant").then((r) => r.json()).catch(() => ({ configured: false }));
      if (cfg?.configured) {
        const j = await fetch("/api/ledger/assistant", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ pergunta: pq, contexto: ctx }),
        }).then((r) => r.json());
        if (j?.ok) {
          let rascunho: LedgerEntryInput | null = j.rascunho ?? null;
          if (rascunho) { try { exigirBalanceado(rascunho.lines); } catch { rascunho = null; } } // só rascunho válido/balanceado
          turno = { pergunta: pq, resposta: j.resposta ?? "(sem resposta)", fontes: j.fontes, rascunho, modo: "ia" };
        } else {
          turno = { pergunta: pq, resposta: responderBasico(pq, ctx), modo: "basico" };
        }
      } else {
        turno = { pergunta: pq, resposta: responderBasico(pq, ctx), modo: "basico" };
      }
      setTurnos((t) => [turno, ...t]);
      void registrarAcaoIA("read", pq, { resposta: turno.resposta, modo: turno.modo });
    } catch (e) {
      setMsg(`Falha: ${(e as Error).message}`);
    } finally { setPensando(false); }
  };

  const aprovar = async (idx: number) => {
    const t = turnos[idx];
    if (!t.rascunho) return;
    setPostandoIdx(idx); setMsg(null);
    try {
      await postarLancamento(t.rascunho);
      void registrarAcaoIA("draft_entry", t.pergunta, t.rascunho);
      setTurnos((arr) => arr.map((x, i) => (i === idx ? { ...x, rascunho: null, resposta: x.resposta + "\n\n✓ Lançamento postado no razão." } : x)));
      setCtx(await contextoRazao());
      await qc.invalidateQueries();
    } catch (e) { setMsg(`Falha ao postar: ${(e as Error).message}`); }
    finally { setPostandoIdx(null); }
  };

  return (
    <AppShell title="Assistente (Razão)" crumb="Contabilidade" actions={isDemo ? <DemoBadge /> : null}>
      <div className="flex flex-col gap-4 pb-4 max-w-3xl">
        {ctx === null ? (
          <Card><Skeleton className="h-12 w-full" /></Card>
        ) : (
          <>
            <Card className="flex flex-col gap-3">
              <span className="text-label font-medium text-muted inline-flex items-center gap-2">
                <Icon name="sparkles" size={15} color="var(--color-lime)" /> Pergunte sobre o razão
              </span>
              <div className="flex items-center gap-2">
                <input
                  value={pergunta}
                  onChange={(e) => setPergunta(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") perguntar(pergunta); }}
                  placeholder="Ex.: qual o resultado do período? rascunhe um lançamento…"
                  className="flex-1 h-10 px-3 rounded-md bg-white border border-border text-body text-ink outline-none focus:border-faint"
                />
                <Button onClick={() => perguntar(pergunta)} disabled={pensando || !pergunta.trim()}>{pensando ? "…" : "Perguntar"}</Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {SUGESTOES.map((s) => (
                  <button key={s} onClick={() => perguntar(s)} className="text-caption text-muted bg-surface-2 rounded-pill px-3 py-1 hover:text-ink">{s}</button>
                ))}
              </div>
              {msg && <span className="text-caption text-negative">{msg}</span>}
              <span className="text-caption text-faint">
                {ctx.lancamentos === 0 ? "Razão vazio — faça o Backfill em /razao para o assistente ter dados." : `${ctx.lancamentos} lançamento(s) no contexto · resultado ${"R$ " + Math.round(ctx.resultado).toLocaleString("pt-BR")}.`}
              </span>
            </Card>

            {turnos.map((t, idx) => (
              <Card key={idx} className="flex flex-col gap-2">
                <span className="text-caption font-medium text-faint">{t.pergunta}</span>
                <p className="m-0 text-body leading-[1.5] text-ink whitespace-pre-wrap">{t.resposta}</p>
                {t.fontes && t.fontes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {t.fontes.map((f, i) => <span key={i} className="text-[12px] text-muted bg-surface-2 rounded-pill px-2 py-[1px]">{f}</span>)}
                  </div>
                )}
                {t.modo === "basico" && <span className="text-[12px] text-faint">modo básico (sem ANTHROPIC_API_KEY)</span>}
                {t.rascunho && (
                  <div className="rounded-md border border-border-soft p-3 flex flex-col gap-2 bg-surface-1/40">
                    <span className="text-caption font-medium text-muted">Rascunho de lançamento — requer sua aprovação</span>
                    <div className="text-caption text-faint">{t.rascunho.description} · {t.rascunho.entryDate}</div>
                    {t.rascunho.lines.map((l, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-caption">
                        <span className="text-muted truncate">{l.accountId} · {nomeConta(l.accountId)}</span>
                        <span className="flex items-center gap-4 tabular-nums">
                          <span className="w-[90px] text-right text-ink">{l.debit ? <BRL value={l.debit} /> : "—"}</span>
                          <span className="w-[90px] text-right text-ink">{l.credit ? <BRL value={l.credit} /> : "—"}</span>
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => setTurnos((arr) => arr.map((x, i) => (i === idx ? { ...x, rascunho: null } : x)))} className="text-caption text-muted hover:text-ink px-2 py-1">Descartar</button>
                      <Button size="sm" onClick={() => aprovar(idx)} disabled={postandoIdx === idx}>{postandoIdx === idx ? "Postando…" : "Aprovar e postar"}</Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </>
        )}
      </div>
    </AppShell>
  );
}
