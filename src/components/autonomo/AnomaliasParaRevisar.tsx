"use client";

/**
 * ANOMALIAS PARA REVISAR — toda despesa, duplicidade e pagamento fora do padrão
 * que o detector achou, cada uma com o lugar onde se confere. Veio do antigo
 * `/copiloto` (o `AnomaliasCard` do `CopilotoView`, órfão desde que a rota foi
 * aposentada) e mora na aba Sugestões da Quattro AI.
 *
 * ⚠️ O que só este cartão faz, e por que ele não é repetição:
 *  - mostra TODAS as anomalias (o detector devolve até oito). A política de
 *    anomalia das Sugestões e as Leituras pegam as TRÊS de maior valor — e um
 *    pagamento duplicado pequeno fica abaixo de um gasto de categoria alto,
 *    some das duas listas e sai pela conta duas vezes sem ninguém ver;
 *  - diz ONDE conferir conforme a classe. A política manda "renegociar" para
 *    toda anomalia, inclusive para um pagamento duplicado, em que o que se faz
 *    é abrir os títulos e conferir.
 *
 * ⚠️ O "Marcar revisada" do original NÃO veio, e não é perda: ele guardava o
 * selo sob o id de contador do motor, que mudava a cada redesenho, e o selo
 * nunca apareceu. E mesmo funcionando seria um aviso dispensado que volta ao
 * recarregar a página — a anomalia sai daqui quando a CAUSA sai (o lançamento
 * corrigido), a mesma regra do banner de amostra. A conferência acontece na
 * tela do link.
 */
import Link from "next/link";
import { BRL, Card, Icon, Skeleton } from "@/components/ui";
import { useCentroInteligencia } from "@/components/visao-geral/hooks";
import type { Anomalia } from "@/core/executive/types";
import { SEV_COR } from "./severidade";

/** Onde se confere cada classe — rotas canônicas do inventário, nunca alias. */
export const ONDE_CONFERIR: Record<Anomalia["classe"], { label: string; href: string }> = {
  despesa: { label: "Revisar despesa", href: "/dashboard/reports/dre" },
  duplicidade: { label: "Verificar duplicidade", href: "/contas-a-pagar/titulos" },
  fraude: { label: "Investigar pagamento", href: "/contas-a-pagar/titulos" },
};

export function AnomaliasParaRevisar() {
  const { data, isLoading, isError } = useCentroInteligencia();
  if (isLoading) return <Skeleton className="h-[240px] lg:col-span-1" rounded="card" />;
  if (isError || !data) {
    return <Card className="lg:col-span-1"><p className="m-0 text-muted">Não foi possível conferir as anomalias agora.</p></Card>;
  }
  return <AnomaliasCard anomalias={data.anomalias} />;
}

function AnomaliasCard({ anomalias }: { anomalias: Anomalia[] }) {
  return (
    <Card className="lg:col-span-1 flex flex-col gap-3" info={{ titulo: "Anomalias", oQue: "Aponta despesas, duplicidades e pagamentos fora do padrão para você conferir antes que virem problema, e diz onde conferir cada um.", comoCalcula: "Compara cada gasto com o histórico da categoria (z-score) e cruza valores para achar duplicidade e pagamento atípico." }}>
      <div className="flex items-center gap-2">
        <Icon name="triangle-alert" size={16} color="var(--color-text-secondary)" />
        <span className="text-label font-medium text-muted">Anomalias para revisar</span>
      </div>
      {anomalias.length === 0 ? (
        <span className="text-caption text-faint">Nenhuma anomalia detectada — despesas e pagamentos dentro do padrão histórico.</span>
      ) : (
        anomalias.map((a) => {
          const onde = ONDE_CONFERIR[a.classe] ?? ONDE_CONFERIR.despesa;
          return (
            <div key={a.id} className="flex flex-col gap-1 rounded-md border border-border-soft p-3">
              <span className="inline-flex items-center gap-[6px] text-label font-medium" style={{ color: SEV_COR[a.severidade] }}>
                <span className="w-2 h-2 rounded-pill" style={{ background: SEV_COR[a.severidade] }} />{a.titulo}
              </span>
              <span className="text-caption text-muted">{a.descricao}</span>
              <span className="text-caption text-faint tabular-nums"><BRL value={a.valor} /></span>
              <Link href={onde.href} className="mt-1 self-start text-caption font-medium text-ink underline">{onde.label} →</Link>
            </div>
          );
        })
      )}
    </Card>
  );
}
