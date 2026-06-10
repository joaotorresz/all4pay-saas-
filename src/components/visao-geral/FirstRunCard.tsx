"use client";

import { useRouter } from "next/navigation";
import { Card, Button, Icon } from "@/components/ui";
import { useFirstRun } from "./hooks";

/**
 * Estado de primeiro acesso (live, organização ainda sem lançamentos).
 * Em vez de widgets vazios, orienta o usuário a popular o sistema:
 * importar um extrato (caminho mais rápido), criar a empresa ou lançar
 * manualmente. Some sozinho quando o primeiro dado entra (não há o que
 * dispensar). Nunca aparece em demonstração.
 */
export function FirstRunCard() {
  const { vazio } = useFirstRun();
  const router = useRouter();
  if (!vazio) return null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="w-[34px] h-[34px] rounded-md bg-lime inline-flex items-center justify-center shrink-0">
          <Icon name="sparkles" size={18} color="var(--color-on-lime)" />
        </span>
        <div className="min-w-0">
          <h2 className="m-0 text-h3 font-medium text-ink">Vamos dar vida ao seu painel</h2>
          <p className="m-0 mt-1 text-body text-muted leading-[1.5]">
            Sua organização ainda não tem lançamentos. Importe um extrato e o all4pay
            reconstrói recebíveis, contas, fluxo de caixa, DRE e risco automaticamente —
            ou comece lançando manualmente.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-[10px]">
        <Button variant="primary" leftIcon={<Icon name="upload" size={15} />} onClick={() => router.push("/import")}>
          Importar dados
        </Button>
        <Button variant="secondary" onClick={() => router.push("/comecar")}>
          Configurar empresa
        </Button>
        <span className="text-caption text-faint">
          ou use <b className="font-medium text-muted">Novo lançamento</b> no topo para registrar à mão.
        </span>
      </div>

      <div className="flex flex-col gap-2 border-t border-border-soft pt-3">
        <Step n={1} t="Importe (OFX/CSV)" d="Onboarding inteligente lê o extrato, classifica e detecta clientes/fornecedores." />
        <Step n={2} t="O sistema se popula" d="Dashboard, DRE, risco, inadimplência e cópiloto passam a refletir seus dados." />
        <Step n={3} t="Opere" d="Cobre inadimplentes, acompanhe o caixa e automatize regras." />
      </div>
    </Card>
  );
}

function Step({ n, t, d }: { n: number; t: string; d: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-5 h-5 rounded-pill bg-surface-2 text-caption font-medium text-muted inline-flex items-center justify-center shrink-0 tabular-nums">
        {n}
      </span>
      <p className="m-0 text-caption text-muted leading-[1.45]">
        <b className="font-medium text-ink">{t}.</b> {d}
      </p>
    </div>
  );
}
