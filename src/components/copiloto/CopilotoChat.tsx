"use client";

/**
 * Chat do Copiloto — UM chat que RESPONDE e AGE (fusão do antigo copiloto
 * executivo + assistente do razão). Perguntas de negócio são respondidas pelo
 * motor executivo (determinístico, com números e fontes, funciona sem chave);
 * pedidos de lançamento ("rascunhe…/poste…") usam o LLM (ANTHROPIC_API_KEY) para
 * propor um lançamento BALANCEADO que só é postado com aprovação humana. Toda
 * interação é registrada na trilha `ai_actions` (demo + live).
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, BRL, Button, Icon, Input } from "@/components/ui";
import { copilotoFinanceiro, PERGUNTAS_SUGERIDAS } from "@/core/executive";
import type { RespostaCopiloto } from "@/core/executive/types";
import { contextoRazao, postarLancamento, type ContextoRazao } from "@/lib/ledger";
import { exigirBalanceado, type LedgerEntryInput } from "@/core/ledger";
import { nomeConta } from "@/core/ledger/chart";
import { logAcaoIA } from "@/lib/ai-copilot";

type Ctx = Parameters<typeof copilotoFinanceiro>[1];

interface Turno {
  pergunta: string;
  exec?: RespostaCopiloto;
  texto?: string;
  fontes?: string[];
  acao?: string | null;
  rascunho?: LedgerEntryInput | null;
  modo: "executivo" | "ia" | "basico";
}

const QUER_LANCAMENTO = /lan[çc]ament|rascunh|d[eé]bit|cr[eé]dit|\bposte\b|registr(e|ar)|estorn|provis|partida/i;
const SUGESTOES_ACAO = ["Rascunhe um lançamento de R$ 1.000 de despesa operacional paga em caixa."];

export function CopilotoChat({ ctx, anomalias, insights }: { ctx: Ctx; anomalias?: unknown[]; insights?: unknown[] }) {
  const qc = useQueryClient();
  const [pergunta, setPergunta] = React.useState("");
  const [turnos, setTurnos] = React.useState<Turno[]>([]);
  const [pensando, setPensando] = React.useState(false);
  const [postandoIdx, setPostandoIdx] = React.useState<number | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [iaConfig, setIaConfig] = React.useState(false);
  const ctxGL = React.useRef<ContextoRazao | null>(null);

  React.useEffect(() => {
    fetch("/api/ledger/assistant").then((r) => r.json()).then((j) => setIaConfig(!!j?.configured)).catch(() => setIaConfig(false));
  }, []);

  const perguntar = async (q: string) => {
    const pq = q.trim();
    if (!pq || pensando) return;
    setPergunta(""); setMsg(null);

    // Caminho de AÇÃO: rascunhar lançamento (precisa do LLM + contexto do razão).
    if (QUER_LANCAMENTO.test(pq)) {
      if (!iaConfig) {
        setTurnos((t) => [{ pergunta: pq, texto: "Para rascunhar e postar lançamentos, configure a ANTHROPIC_API_KEY. Posso responder perguntas de negócio normalmente.", modo: "basico" }, ...t]);
        return;
      }
      setPensando(true);
      try {
        if (!ctxGL.current) ctxGL.current = await contextoRazao();
        const j = await fetch("/api/ledger/assistant", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ pergunta: pq, contexto: ctxGL.current }),
        }).then((r) => r.json());
        let rascunho: LedgerEntryInput | null = j?.rascunho ?? null;
        if (rascunho) { try { exigirBalanceado(rascunho.lines); } catch { rascunho = null; } }
        const turno: Turno = j?.ok
          ? { pergunta: pq, texto: j.resposta ?? "(sem resposta)", fontes: j.fontes, rascunho, modo: "ia" }
          : { pergunta: pq, texto: "Não consegui processar agora.", modo: "basico" };
        setTurnos((t) => [turno, ...t]);
        void logAcaoIA({ kind: "chat", titulo: pq, detalhe: turno.texto, status: "lida" });
      } catch (e) { setMsg(`Falha: ${(e as Error).message}`); }
      finally { setPensando(false); }
      return;
    }

    // Caminho de RESPOSTA. Com chave: copiloto Claude ANCORADO no contexto
    // numérico (Ember-style). Sem chave: motor executivo determinístico.
    if (iaConfig) {
      setPensando(true);
      // memória de conversa: turnos mais recentes primeiro no estado → reverte
      const historico = turnos.slice(0, 4).reverse()
        .map((t) => ({ q: t.pergunta, a: t.exec?.resposta ?? t.texto ?? "" }))
        .filter((h) => h.a);
      try {
        const j = await fetch("/api/ai/copiloto", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ pergunta: pq, contexto: ctx, anomalias, insights, historico }),
        }).then((r) => r.json());
        if (j?.ok) {
          const exec: RespostaCopiloto = {
            resposta: j.resposta ?? "(sem resposta)",
            numeros: Array.isArray(j.numeros) ? j.numeros : [],
            fontes: Array.isArray(j.fontes) ? j.fontes : [],
            confianca: 0.92,
          };
          setTurnos((t) => [{ pergunta: pq, exec, acao: j.acao ?? null, modo: "ia" }, ...t]);
          void logAcaoIA({ kind: "chat", titulo: pq, detalhe: exec.resposta, status: "lida" });
        } else {
          const exec = copilotoFinanceiro(pq, ctx);
          setTurnos((t) => [{ pergunta: pq, exec, modo: "executivo" }, ...t]);
        }
      } catch {
        const exec = copilotoFinanceiro(pq, ctx);
        setTurnos((t) => [{ pergunta: pq, exec, modo: "executivo" }, ...t]);
      } finally { setPensando(false); }
      return;
    }
    const exec = copilotoFinanceiro(pq, ctx);
    setTurnos((t) => [{ pergunta: pq, exec, modo: "executivo" }, ...t]);
    void logAcaoIA({ kind: "chat", titulo: pq, detalhe: exec.resposta, status: "lida" });
  };

  const aprovar = async (idx: number) => {
    const t = turnos[idx];
    if (!t.rascunho) return;
    setPostandoIdx(idx); setMsg(null);
    try {
      await postarLancamento(t.rascunho);
      void logAcaoIA({ kind: "draft_entry", titulo: t.pergunta, detalhe: `${t.rascunho.description} — postado no razão`, status: "executada" });
      setTurnos((arr) => arr.map((x, i) => (i === idx ? { ...x, rascunho: null, texto: (x.texto ?? "") + "\n\n✓ Lançamento postado no razão." } : x)));
      ctxGL.current = await contextoRazao();
      await qc.invalidateQueries();
    } catch (e) { setMsg(`Falha ao postar: ${(e as Error).message}`); }
    finally { setPostandoIdx(null); }
  };

  const sugestoes = [...PERGUNTAS_SUGERIDAS, ...(iaConfig ? SUGESTOES_ACAO : [])];

  return (
    <Card className="lg:col-span-2 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
          <Icon name="sparkles" size={14} color="var(--color-on-lime)" />
        </span>
        <span className="text-label font-medium text-muted">All 4 Pay AI</span>
        <span className="text-caption text-faint ml-auto">{iaConfig ? "responde e age" : "responde · ações com ANTHROPIC_API_KEY"}</span>
      </div>

      <div className="flex gap-2">
        <Input
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && perguntar(pergunta)}
          placeholder="Pergunte sobre caixa, contratação, clientes… ou peça um lançamento"
          containerClassName="flex-1"
        />
        <Button variant="primary" onClick={() => perguntar(pergunta)} disabled={pensando || !pergunta.trim()}>{pensando ? "…" : "Perguntar"}</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {sugestoes.map((q) => (
          <button key={q} onClick={() => perguntar(q)} className="text-caption text-muted bg-surface-2 hover:text-ink rounded-pill px-3 py-1">{q}</button>
        ))}
      </div>
      {msg && <span className="text-caption text-negative">{msg}</span>}

      {turnos.map((t, idx) => (
        <div key={idx} className="rounded-md bg-surface-1 p-4 flex flex-col gap-3">
          <span className="text-caption font-medium text-faint">{t.pergunta}</span>

          {t.exec ? (
            <>
              <p className="m-0 text-body leading-[1.55] text-ink">{t.exec.resposta}</p>
              {t.exec.numeros.length > 0 && (
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {t.exec.numeros.map((n, i) => (
                    <div key={i}>
                      <div className="text-caption text-faint">{n.label}</div>
                      <div className="text-h3 font-medium tabular-nums text-ink">{n.valor}</div>
                    </div>
                  ))}
                </div>
              )}
              {t.acao && (
                <div className="flex items-start gap-2 rounded-md bg-white border border-border-soft p-2">
                  <Icon name="sparkles" size={14} color="var(--color-lime)" />
                  <span className="text-caption text-ink"><b className="font-medium">Ação sugerida:</b> {t.acao}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-caption text-faint">
                <span>Fontes: {t.exec.fontes.join(" · ")}{t.modo === "ia" ? " · Claude" : ""}</span>
                <span className="ml-auto">confiança {Math.round(t.exec.confianca * 100)}%</span>
              </div>
            </>
          ) : (
            <>
              <p className="m-0 text-body leading-[1.5] text-ink whitespace-pre-wrap">{t.texto}</p>
              {t.fontes && t.fontes.length > 0 && (
                <div className="flex flex-wrap gap-1">{t.fontes.map((f, i) => <span key={i} className="text-[12px] text-muted bg-surface-2 rounded-pill px-2 py-[1px]">{f}</span>)}</div>
              )}
              {t.modo === "basico" && <span className="text-[12px] text-faint">modo básico</span>}
            </>
          )}

          {t.rascunho && (
            <div className="rounded-md border border-border-soft p-3 flex flex-col gap-2 bg-white">
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
        </div>
      ))}
    </Card>
  );
}
