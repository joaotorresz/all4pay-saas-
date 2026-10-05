"use client";

/**
 * LEITURAS PRIORIZADAS — o que merece atenção agora, por impacto × urgência,
 * cada uma com a sua recomendação. Veio do antigo `/copiloto` (o `InsightsCard`
 * do `CopilotoView`, órfão desde que a rota foi aposentada) e mora na aba
 * Sugestões da Quattro AI.
 *
 * ⚠️ Fica AO LADO de "Sugestões por prioridade" e não a repete. As duas listas
 * saem de motores diferentes — esta do executivo (`core/executive`), aquela do
 * autônomo (`core/autonomous`) — e, medido sobre o seed da demonstração e as
 * duas fixtures canônicas, não tiveram um item em comum: a sugestão diz o que
 * FAZER (cobrar, antecipar, bloquear pagamento); a leitura diz o que está
 * ACONTECENDO (concentração de receita, margem comprimida, pressão de caixa
 * prevista). Depois da aposentadoria, a lista inteira não estava em tela
 * nenhuma — a Home só tem a primeira (`radar-insight-critico`) e a soma do
 * impacto, as duas no catálogo desligado por padrão.
 *
 * ⚠️ A chave da linha é o id do motor, que é DERIVADO DO CONTEÚDO
 * (`core/executive/types`). Enquanto era contador, cada redesenho criava ids
 * novos e a linha remontava inteira.
 *
 * ⚠️ A narração por IA que o `/copiloto` punha por cima do texto do motor NÃO
 * veio junto: ela casava pelo id de contador e nunca casou com nada. O texto
 * aqui é o do motor, que é o que tem procedência.
 */
import { BRL, Card, Skeleton } from "@/components/ui";
import { useCentroInteligencia } from "@/components/visao-geral/hooks";
import type { ExecutiveInsight } from "@/core/executive/types";
import { SEV_COR } from "./severidade";

export function LeiturasPriorizadas() {
  const { data, isLoading, isError } = useCentroInteligencia();
  if (isLoading) return <Skeleton className="h-[240px] lg:col-span-2" rounded="card" />;
  if (isError || !data) {
    return <Card className="lg:col-span-2"><p className="m-0 text-muted">Não foi possível montar as leituras agora.</p></Card>;
  }
  return <LeiturasCard insights={data.insights} />;
}

function LeiturasCard({ insights }: { insights: ExecutiveInsight[] }) {
  return (
    <Card className="lg:col-span-2 flex flex-col gap-3" info={{ titulo: "Leituras priorizadas", oQue: "Lista o que merece sua atenção agora, do mais relevante para o menos, com a recomendação de cada leitura. É leitura, não execução: agir é na seção Executar.", comoCalcula: "Cada leitura é ordenada por impacto em reais, urgência, probabilidade e criticidade calculados sobre os seus dados." }}>
      <span className="text-label font-medium text-muted">Leituras priorizadas · impacto × urgência</span>
      {insights.length === 0 && <span className="text-caption text-faint">Nenhuma leitura relevante no momento.</span>}
      <div className="flex flex-col">
        {insights.map((i) => (
          <div key={i.id} className="flex gap-3 py-[10px] border-t border-border-soft first:border-t-0">
            <span className="text-caption font-medium text-faint tabular-nums w-[20px] pt-[2px]">#{i.prioridade}</span>
            <span className="w-2 h-2 rounded-pill mt-[6px] shrink-0" style={{ background: SEV_COR[i.severidade] }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[17px] font-medium text-ink">{i.titulo}</span>
                {i.impactoCentavos > 0 && (
                  <span className="text-caption text-muted tabular-nums shrink-0"><BRL value={i.impactoCentavos / 100} /></span>
                )}
              </div>
              <span className="text-caption text-muted">{i.descricao}</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {i.recomendacoes.map((r) => (
                  <span key={r} className="text-caption text-faint bg-surface-2 rounded-pill px-2 py-[2px]">{r}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
