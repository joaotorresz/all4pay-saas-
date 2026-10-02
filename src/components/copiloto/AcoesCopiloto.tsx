"use client";

/**
 * SUGESTÕES do copiloto — o que o motor autônomo recomenda, com a fronteira
 * entre sugerir e fazer visível na própria linha.
 *
 * ⚠️ Este card dizia "a Quattro AI pode agir", oferecia um botão "Executar" e
 * carimbava "Feita" — para uma chamada cujo efeito inteiro era escrever uma
 * linha na trilha. O motor é bom e a priorização é real; o que era falso era o
 * VERBO. E um verbo falso aqui não é exagero de marketing: quem lê "Feita" ao
 * lado de "cobrar cliente X" para de cobrar o cliente X.
 *
 * Cada sugestão declara agora o que acontece ao clicar, ANTES do clique:
 *   - cobrança → sai de verdade por WhatsApp (simulada, e dito, sem chave);
 *   - acima da alçada → abre uma solicitação em /aprovações;
 *   - o resto → fica registrada na trilha, e nada mais acontece.
 *
 * ⚠️ RODADA 9 — este card estava ÓRFÃO. Ele morava no `/copiloto`, e a fusão
 * na Quattro AI não o levou junto: a aba "Sugestões" passou a dizer "quem age
 * é uma pessoa, no card de sugestões do copiloto" — um card que não aparecia
 * em tela nenhuma — e ganhou um disparo de WhatsApp próprio, cru, que chamava
 * simulado de "falha". Agora ele é a seção EXECUTAR da aba Sugestões, e a
 * cobrança — a única linha que sai do sistema — pede CONFIRMAÇÃO com os nomes
 * de quem vai receber antes de enviar.
 */
import * as React from "react";

/** ⚠️ O valor da coluna não é o que a pessoa lê — `proposta` é a palavra do
 *  modelo, não do produto. */
const ROTULO_ACAO: Record<string, string> = {
  executada: "Executada",
  proposta: "Aguardando aprovação",
  registrada: "Registrada",
};
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, BRL, Button, Icon, StatusBadge, Skeleton, InfoHint } from "@/components/ui";
import { useOperacaoAutonoma } from "@/components/visao-geral/hooks";
import { listParties } from "@/lib/cadastros";
import { TIPO_LABEL, type FinancialDecision } from "@/core/autonomous/types";
import { executarDecisao, dispararCobranca, alvosDeCobranca, listAcoesIA, type AcaoIA, type ResultadoExecucao } from "@/lib/ai-copilot";
import { credorDe } from "@/lib/automacoes-contexto";
import { fetchCompany, getOrganizationName } from "@/lib/company";

export function AcoesCopiloto() {
  const qc = useQueryClient();
  const { data, isLoading } = useOperacaoAutonoma();
  const { data: parties } = useQuery({ queryKey: ["parties"], queryFn: listParties });
  // O credor (razão social + CNPJ) vai na mensagem de cobrança — o cliente
  // precisa saber QUEM cobra, não qual software mandou.
  const { data: credor } = useQuery({
    queryKey: ["credor-da-regua"],
    queryFn: async () => credorDe(await getOrganizationName(), ((await fetchCompany())?.db ?? null) as Record<string, unknown> | null),
  });
  const [trail, setTrail] = React.useState<AcaoIA[]>([]);
  const [feito, setFeito] = React.useState<Record<string, ResultadoExecucao>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  /** A cobrança à espera da confirmação (o id da sugestão). */
  const [confirmando, setConfirmando] = React.useState<string | null>(null);
  const alvos = alvosDeCobranca(data?.collections ?? [], parties ?? []);

  React.useEffect(() => { listAcoesIA().then(setTrail).catch(() => setTrail([])); }, []);

  const agir = async (d: FinancialDecision) => {
    setBusy(d.id);
    try {
      // Cobrança reversível dentro da alçada → dispara de verdade (WhatsApp).
      const r = d.tipo === "cobranca" && d.modo === "automatico"
        ? await dispararCobranca(data?.collections ?? [], parties ?? [], credor)
        : await executarDecisao(d);
      setFeito((f) => ({ ...f, [d.id]: r }));
      setTrail(await listAcoesIA());
      await qc.invalidateQueries({ queryKey: ["aprovacoes"] }).catch(() => {});
    } finally { setBusy(null); setConfirmando(null); }
  };

  const decisoes = (data?.decisoes ?? []).slice(0, 6);

  return (
    <Card className="lg:col-span-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-label font-medium text-muted inline-flex items-center gap-2">
          <Icon name="sparkles" size={15} color="var(--color-lime)" /> Sugestões da Quattro AI
          <InfoHint
            titulo="Sugestões da Quattro AI"
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
                  {/* O texto do resultado fica em tinta: "enviada" × "simulação" ×
                      "registrada" é dito em palavras e no selo — um ✓ verde ao lado
                      de "Simulação: nenhuma enviada" afirmava o contrário do texto. */}
                  {done && <div className="text-caption text-muted mt-1" data-resultado-execucao={done.status}>{done.mensagem}</div>}
                  {cobra && confirmando === d.id && !done && (
                    <div className="mt-2 rounded-md bg-surface-1 p-3 flex flex-col gap-2" data-confirmar-cobranca>
                      <span className="text-caption text-ink">
                        {alvos.length > 0
                          ? `Envia WhatsApp de verdade para ${alvos.length} cliente(s): ${alvos.map((c) => c.cliente).join(", ")}.`
                          : "Nenhum cliente em cobrança tem WhatsApp cadastrado — nada seria enviado."}
                      </span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="primary" disabled={busy === d.id || alvos.length === 0} onClick={() => agir(d)}>
                          {busy === d.id ? "Enviando…" : "Confirmar envio"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmando(null)}>Cancelar</Button>
                      </div>
                    </div>
                  )}
                </div>
                {done ? (
                  // ⚠️ O selo sai do STATUS que a execução devolveu, não de
                  // procurar palavras na mensagem.
                  // Na cobrança, tudo o que não é "executada" é NÃO ENVIADA (simulação,
                  // recusa, falha) — "Em aprovação" ali seria inventar um trâmite.
                  <StatusBadge tone={done.status === "executada" ? "positive" : !cobra && done.status === "proposta" ? "warning" : "neutral"}>
                    {done.status === "executada" ? "Enviada" : cobra ? "Não enviada" : done.status === "proposta" ? "Em aprovação" : "Registrada"}
                  </StatusBadge>
                ) : (
                  <Button size="sm" variant="secondary" disabled={busy === d.id || (cobra && confirmando === d.id)}
                    onClick={() => (cobra ? setConfirmando(d.id) : agir(d))} data-executa={cobra ? "envia" : auto ? "registra" : "aprovacao"}>
                    {busy === d.id ? "…" : cobra ? `Enviar cobrança (${alvos.length})` : auto ? "Registrar sugestão" : "Enviar p/ aprovação"}
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
              <StatusBadge tone={a.status === "executada" ? "positive" : a.status === "proposta" ? "warning" : "neutral"}>{ROTULO_ACAO[a.status] ?? a.status}</StatusBadge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
