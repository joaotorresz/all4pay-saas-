"use client";

/**
 * `/planos` — a tela para onde o middleware manda quem pediu um recurso Pro
 * sem ter o plano.
 *
 * ⚠️ Ela existe porque bloquear sem oferecer caminho é pior que não bloquear.
 * O gating anterior (esconder do menu) tinha ao menos a virtude de não dar erro;
 * um bloqueio de servidor sem tela de upgrade só produziria um redirect que
 * ninguém entende.
 *
 * Diz três coisas, nesta ordem: **o que você pediu**, **por que não abriu** e
 * **o que o Pro inclui**.
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { Card, Button, Icon, StatusBadge } from "@/components/ui";
import { BENEFICIOS_PRO } from "@/core/planos";
import { usePlano } from "@/lib/plano";
import { isDemo } from "@/lib/demo";

/** Rótulo humano da rota pedida — ninguém lê caminho de URL. */
const NOME_DA_ROTA: Record<string, string> = {
  "/copiloto": "Copiloto e motores de decisão",
  "/inadimplencia": "Inteligência de inadimplência",
  "/investidores": "Investor update",
  "/contratacoes": "Plano de contratações",
  "/impostos": "Apuração de impostos",
  "/aprovacoes": "Solicitações e aprovações",
  "/governanca": "Governança e auditoria",
  "/automacoes": "Automações",
  "/consolidado": "Consolidado multiempresa",
  "/decisao": "Motor de decisão",
  "/risco": "Motor de risco de caixa",
  "/autonomo": "Operação autônoma",
  "/inteligencia": "Camada quantitativa",
};

function rotuloDe(rota: string | null): string | null {
  if (!rota) return null;
  const base = `/${rota.split("?")[0].split("/").filter(Boolean)[0] ?? ""}`;
  return NOME_DA_ROTA[base] ?? null;
}

export function PlanosView() {
  const router = useRouter();
  const params = useSearchParams();
  const { estado } = usePlano();
  const de = params.get("de");
  const pedido = rotuloDe(de);

  return (
    <AppShell title="Planos" crumb="Assinatura">
      <div className="flex flex-col gap-5 pb-6 max-w-[840px]">
        {pedido && (
          <Card className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Icon name="shield-check" size={18} color="var(--color-warning)" />
              <span className="text-h3 text-ink">{pedido} faz parte do Pro</span>
            </div>
            <p className="m-0 text-label text-muted max-w-[62ch]">
              Você pediu uma tela que o seu plano atual não inclui. Nada foi perdido —
              volte quando quiser, ou faça o upgrade e siga direto para lá.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <Button onClick={() => router.push("/dashboard/administration/subscription")}>
                Ver assinatura
              </Button>
              <Button variant="ghost" onClick={() => router.push("/")}>Voltar ao início</Button>
            </div>
          </Card>
        )}

        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-label font-medium text-muted">Seu plano</span>
            <StatusBadge tone={estado.plano === "pro" ? "positive" : "neutral"}>
              {estado.aberto ? "Demonstração — tudo liberado" : estado.nome}
            </StatusBadge>
          </div>
          {isDemo && (
            <p className="m-0 text-caption text-faint max-w-[62ch]">
              Em demonstração o gating fica desligado: todas as telas abrem para você
              conhecer o produto inteiro. Em produção, o bloqueio acontece no servidor.
            </p>
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <span className="text-label font-medium text-muted">O que o Pro inclui</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {BENEFICIOS_PRO.map((b) => (
              <div key={b.titulo} className="flex gap-3">
                <span className="mt-[3px] shrink-0">
                  <Icon name="check" size={15} color="var(--color-positive)" />
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] text-ink">{b.titulo}</div>
                  <div className="text-caption text-faint">{b.descricao}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
