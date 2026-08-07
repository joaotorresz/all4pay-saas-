"use client";

/**
 * SUGESTÕES do copiloto — o que o motor autônomo recomenda, com a fronteira
 * entre sugerir e fazer visível na própria linha.
 *
 * ⚠️ Este card dizia "a All 4 Pay AI pode agir", oferecia um botão "Executar" e
 * carimbava "Feita" — para uma chamada cujo efeito inteiro era escrever uma
 * linha na trilha. O motor é bom e a priorização é real; o que era falso era o
 * VERBO. E um verbo falso aqui não é exagero de marketing: quem lê "Feita" ao
 * lado de "cobrar cliente X" para de cobrar o cliente X.
 *
 * Cada sugestão declara agora o que acontece ao clicar, ANTES do clique:
 *   - cobrança → sai de verdade por WhatsApp (simulada, e dito, sem chave);
 *   - acima da alçada → abre uma solicitação em /aprovações;
 *   - o resto → fica registrada na trilha, e nada mais acontece.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, BRL, Button, Icon, StatusBadge, Skeleton, InfoHint } from "@/components/ui";
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
          <Icon name="sparkles" size={15} color="var(--color-lime)" /> Sugestões da All 4 Pay AI
          <InfoHint
            titulo="Sugestões da All 4 Pay AI"
            oQue="O que o motor recomenda fazer agora, em ordem de impacto. São SUGESTÕES: nada é executado sem você clicar, e cada linha diz o que o clique faz."
            comoCalcula="O motor autônomo prioriza cada sugestão por impacto e confiança. Só duas coisas saem daqui de verdade: a cobrança por WhatsApp e a abertura de uma solicitação na alçada. As demais ficam registradas na trilha."
          />
        </span>
        {data?.hitl && (
          <span className="text-caption text-faint">
            acima de <BRL value={data.hitl.limiteAutomatico} />, a sugestão só segue por aprovação
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
            // A cobrança é a ÚNICA que sai do sistema — o rótulo do botão tem
            // de separá-la das demais antes do clique, não depois.
            const cobra = d.tipo === "cobranca" && auto;
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
                  // ⚠️ "Feita" some. O selo repete o que a mensagem do motor
                  // disse ter acontecido — e ela agora distingue enviada de
                  // registrada, que é a distinção inteira.
                  <StatusBadge tone={done.includes("Nenhuma ação") || done.startsWith("Simulação") ? "neutral" : "positive"}>
                    {done.includes("aprovação") ? "Em aprovação" : done.includes("enviada") ? "Enviada" : "Registrada"}
                  </StatusBadge>
                ) : (
                  <Button size="sm" variant="secondary" disabled={busy === d.id} onClick={() => agir(d)}>
                    {busy === d.id ? "…" : cobra ? "Enviar cobrança" : auto ? "Registrar sugestão" : "Enviar p/ aprovação"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {trail.length > 0 && (
        <div className="border-t border-border-soft pt-3 flex flex-col gap-1">
          <span className="text-caption font-medium text-faint">Trilha das sugestões</span>
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
