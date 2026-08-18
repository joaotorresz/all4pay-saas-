"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CENTRAL FINANCEIRA — a tela: a fila única de confirmação, com origem visível
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Contas a Pagar/Receber e Upload ENTRAM dados; a confirmação e a baixa
 * acontecem AQUI. Esta tela mostra tudo que aguarda confirmação (situacao =
 * previsto), de onde veio, e distingue o CONFIRMADO do PREVISTO no topo.
 *
 * ⚠️ Toda a lógica — máquina de estados, alçada, segregação — mora em
 * `core/central`; esta tela só APRESENTA e chama. A confirmação real (o
 * gatilho `central_maquina` no banco) entra na fase live; aqui em demo a fila é
 * derivada do `RiskInput` e a confirmação é otimista.
 */
import * as React from "react";
import { Card, BRL, Icon, Skeleton, StatusBadge } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import {
  montarFila, situacaoDe, ehConfirmado, rotuloSituacao,
  type ItemFila, type Origem, type Situacao,
} from "@/core/central";
import type { RiskMovement } from "@/core/risk-engine/types";

const ROTULO_ORIGEM: Record<Origem, string> = {
  "contas-a-pagar": "Contas a pagar",
  "contas-a-receber": "Contas a receber",
  "upload": "Upload de dados",
};

/**
 * Origem do título pelo LADO — entrada é receber, saída é pagar.
 * ⚠️ A origem "upload" não é distinguível do `RiskMovement` (ele não carrega
 * `origem`); ela aparece de verdade quando a Central lê a coluna `origem` do
 * banco na fase live. Aqui a fila mostra as duas portas que dá para derivar.
 */
function origemDe(m: RiskMovement): Origem {
  return m.type === "entrada" ? "contas-a-receber" : "contas-a-pagar";
}

export function CentralView() {
  const { data: input, isLoading } = useRiscoInput();
  // Confirmações otimistas desta sessão (demo): id → nova situação.
  const [confirmadosLocal, setConfirmadosLocal] = React.useState<Record<string, Situacao>>({});

  const { fila, totais } = React.useMemo(() => {
    const movs = input?.movements ?? [];
    const itens: ItemFila[] = movs.map((m) => ({
      id: m.id,
      descricao: m.descricao || m.category || "Lançamento",
      contraparte: input?.partyNames?.[m.party_id ?? ""] ?? m.party_id ?? "—",
      valor: m.amount,
      direcao: m.type,
      vencimento: m.due_date,
      situacao: confirmadosLocal[m.id] ?? situacaoDe(m),
      origem: origemDe(m),
      lancadoPor: "—",
    }));
    const f = montarFila(itens);
    // Totais confirmado × previsto (só o que não saiu do resultado).
    let confirmado = 0, previsto = 0;
    for (const i of itens) {
      if (i.situacao === "cancelado" || i.situacao === "estornado") continue;
      if (ehConfirmado(i.situacao)) confirmado += i.valor;
      else if (i.situacao === "previsto") previsto += i.valor;
    }
    return { fila: f, totais: { confirmado, previsto } };
  }, [input, confirmadosLocal]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-6 pb-6">
      {/* Confirmado × Previsto — a distinção que a Central cria */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card
          className="flex flex-col gap-1"
          info={{
            titulo: "Aguardando confirmação",
            oQue: "Títulos que entraram por Contas a Pagar, Contas a Receber ou Upload e ainda não foram confirmados por alguém com alçada.",
            comoCalcula: "Contagem dos títulos em situação 'previsto'. Nada entra no resultado confirmado sem passar por aqui.",
          }}
        >
          <span className="text-caption text-faint">Aguardando confirmação</span>
          <span className="text-h3 font-medium tabular-nums text-ink">{fila.totalAguardando}</span>
        </Card>
        <Card
          className="flex flex-col gap-1"
          info={{
            titulo: "Confirmado",
            oQue: "Total dos títulos que já foram confirmados, baixados ou conciliados — compromisso firme.",
            comoCalcula: "Soma dos valores em situação confirmado/baixado/conciliado. É o que o DRE mostra na visão 'confirmado'.",
          }}
        >
          <span className="text-caption text-faint">Confirmado</span>
          <span className="text-h3 font-medium tabular-nums text-ink"><BRL value={totais.confirmado} /></span>
        </Card>
        <Card
          className="flex flex-col gap-1"
          info={{
            titulo: "Previsto",
            oQue: "Total dos títulos ainda não confirmados — pode não acontecer, e por isso é mostrado separado do confirmado.",
            comoCalcula: "Soma dos valores em situação 'previsto'. O relatório só o inclui na visão 'com previsto'.",
          }}
        >
          <span className="text-caption text-faint">Previsto (a confirmar)</span>
          <span className="text-h3 font-medium tabular-nums text-warning"><BRL value={totais.previsto} /></span>
        </Card>
      </div>

      {/* A fila única */}
      <Card padded={false}>
        <div className="px-5 py-3 border-b border-border-soft flex items-baseline justify-between gap-3 flex-wrap">
          <span className="text-label font-medium text-muted">Fila de confirmação</span>
          <span className="text-caption text-faint">
            {(["contas-a-pagar", "contas-a-receber", "upload"] as Origem[])
              .filter((o) => fila.porOrigem[o] > 0)
              .map((o) => `${ROTULO_ORIGEM[o]}: ${fila.porOrigem[o]}`)
              .join(" · ") || "nada aguardando"}
          </span>
        </div>

        {fila.aguardando.length === 0 ? (
          <div className="p-8 flex flex-col items-center gap-2 text-center">
            <Icon name="check" size={20} color="var(--color-positive)" />
            <span className="text-caption text-muted">Nada aguardando confirmação — a fila está limpa.</span>
          </div>
        ) : (
          <ul className="m-0 p-0 list-none">
            {fila.aguardando.slice(0, 100).map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-3 px-5 py-3 border-b border-border-soft last:border-0"
              >
                <span
                  className="inline-flex items-center justify-center w-7 h-7 rounded-[10px] shrink-0"
                  style={{ background: i.direcao === "entrada" ? "color-mix(in srgb, var(--color-positive) 14%, var(--color-white))" : "color-mix(in srgb, var(--color-negative) 14%, var(--color-white))" }}
                >
                  <Icon name={i.direcao === "entrada" ? "arrow-down" : "arrow-up"} size={14}
                    color={i.direcao === "entrada" ? "var(--color-positive)" : "var(--color-negative)"} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-caption text-ink truncate">{i.descricao}</div>
                  <div className="text-[11px] text-faint">{i.contraparte} · {ROTULO_ORIGEM[i.origem]}</div>
                </div>
                <span className="text-caption tabular-nums text-ink shrink-0"><BRL value={i.valor} /></span>
                <StatusBadge tone="warning">{rotuloSituacao(i.situacao)}</StatusBadge>
                <button
                  type="button"
                  onClick={() => setConfirmadosLocal((c) => ({ ...c, [i.id]: "confirmado" }))}
                  className="shrink-0 text-caption font-medium text-ink px-3 h-8 rounded-md bg-surface-2 hover:bg-surface-3 transition-colors"
                >
                  Confirmar
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="m-0 text-caption text-faint max-w-[80ch]">
        A confirmação exige alçada e segregação de funções — quem lançou não confirma o próprio
        título. Em produção, a regra é aplicada pelo banco; aqui na demonstração a fila é derivada
        dos lançamentos e a confirmação é local.
      </p>
    </div>
  );
}
