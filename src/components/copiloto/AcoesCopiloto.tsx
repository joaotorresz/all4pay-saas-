"use client";

/**
 * Ações do Copiloto — o que faz o /copiloto AGIR (não só informar). Lê as
 * decisões priorizadas do motor autônomo (que já une decisão/crédito/anomalias/
 * tesouraria) e deixa o operador EXECUTAR a ação reversível ou ENVIAR para a
 * alçada — tudo registrado na trilha `ai_actions` (demo + live).
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, BRL, Button, Icon, StatusBadge, Skeleton } from "@/components/ui";
import { useOperacaoAutonoma } from "@/components/visao-geral/hooks";
import { listParties } from "@/lib/cadastros";
import { TIPO_LABEL, type FinancialDecision } from "@/core/autonomous/types";
import { executarDecisao, dispararCobranca, listAcoesIA, type AcaoIA } from "@/lib/ai-copilot";

export function AcoesCopiloto() {
  const qc = useQueryClient();
  const { data, isLoading } = useOperacaoAutonoma();
  const { data: parties } = useQuery({ queryKey: ["parties"], queryFn: listParties });
  const [trail, setTrail] = React.useState<AcaoIA[]>([]);
  const [feito, setFeito] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => { listAcoesIA().then(setTrail).catch(() => setTrail([])); }, []);

  const agir = async (d: FinancialDecision) => {
    setBusy(d.id);
    try {
      // Cobrança reversível dentro da alçada → dispara de verdade (WhatsApp).
      const r = d.tipo === "cobranca" && d.modo === "automatico"
        ? await dispararCobranca(data?.collections ?? [], parties ?? [])
        : await executarDecisao(d);
      setFeito((f) => ({ ...f, [d.id]: r.mensagem }));
      setTrail(await listAcoesIA());
      await qc.invalidateQueries({ queryKey: ["aprovacoes"] }).catch(() => {});
    } finally { setBusy(null); }
  };

  const decisoes = (data?.decisoes ?? []).slice(0, 6);

  return (
    <Card className="lg:col-span-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-label font-medium text-muted inline-flex items-center gap-2">
          <Icon name="sparkles" size={15} color="var(--color-lime)" /> Ações recomendadas — o copiloto pode agir
        </span>
        {data?.hitl && (
          <span className="text-caption text-faint">
            executa sozinho até <BRL value={data.hitl.limiteAutomatico} /> · acima disso, vai para aprovação
          </span>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : decisoes.length === 0 ? (
        <span className="text-caption text-faint">Operação estável — nenhuma ação acionável agora.</span>
      ) : (
        <div className="flex flex-col">
          {decisoes.map((d, i) => {
            const auto = d.modo === "automatico";
            const done = feito[d.id];
            return (
              <div key={d.id} className={`flex items-start gap-3 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                <span className="text-caption font-medium text-faint tabular-nums w-[20px] pt-[2px]">#{d.prioridade}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-muted bg-surface-2 rounded-pill px-[6px] py-[1px]">{TIPO_LABEL[d.tipo]}</span>
                    <span className="text-[16px] font-medium text-ink">{d.titulo}</span>
                  </div>
                  <div className="text-caption text-muted mt-[2px]">{d.recomendacao}</div>
                  <div className="flex items-center gap-3 text-caption text-faint tabular-nums mt-[2px]">
                    {d.impactoEsperado > 0 && <span>impacto ≈ <BRL value={d.impactoEsperado} /></span>}
                    <span>confiança {Math.round(d.confianca * 100)}%</span>
                  </div>
                  {done && <div className="text-caption text-positive mt-1">✓ {done}</div>}
                </div>
                {done ? (
                  <StatusBadge tone="positive">{feito[d.id]?.includes("aprovação") ? "Enviada" : "Feita"}</StatusBadge>
                ) : (
                  <Button size="sm" variant={auto ? "primary" : "secondary"} disabled={busy === d.id} onClick={() => agir(d)}>
                    {busy === d.id ? "…" : auto ? "Executar" : "Enviar p/ aprovação"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {trail.length > 0 && (
        <div className="border-t border-border-soft pt-3 flex flex-col gap-1">
          <span className="text-caption font-medium text-faint">Histórico de ações da IA</span>
          {trail.slice(0, 6).map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 text-caption">
              <span className="text-muted truncate">{a.titulo}</span>
              <StatusBadge tone={a.status === "executada" ? "positive" : a.status === "proposta" ? "warning" : "neutral"}>{a.status}</StatusBadge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
