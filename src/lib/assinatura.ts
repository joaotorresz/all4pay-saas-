"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A ASSINATURA VISTA PELO CLIENTE — o relógio do lado de cá
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O prazo existia só no `/admin`, e prazo que o cliente não vê é corte que
 * chega de surpresa.** Medido em 18/08: das 16 organizações, 14 não tinham nem
 * linha de assinatura e as 2 que tinham estavam com `current_period_end` NULO.
 * Não havia o que mostrar porque não havia relógio.
 *
 * ⚠️ **Quem AUTORIZA é o banco** (`org_pode_escrever()`, política restritiva).
 * Isto aqui é para APRESENTAR: dizer quantos dias faltam e, quando venceu,
 * explicar o que aconteceu antes de a pessoa esbarrar num erro de gravação.
 * Confiar nisto para liberar tela repetiria o defeito do Modo Pro cortina.
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import { reportar } from "@/lib/erros";
import { estadoDaAssinatura, type Assinatura, type EstadoDaAssinatura, type StatusAssinatura } from "@/core/billing";

export type { EstadoDaAssinatura };

/** Hoje em `YYYY-MM-DD` local — a mesma regra de fuso do resto do sistema. */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * ⚠️ Em demonstração NÃO existe cobrança: devolver um teste vencido faria a
 * demo abrir com um banner de bloqueio, que é a pior primeira tela possível.
 */
export async function getAssinatura(): Promise<EstadoDaAssinatura | null> {
  if (isDemo) return null;
  const sb = createClient();
  const { data, error } = await sb.rpc("assinatura_da_org");
  if (error) {
    /*
     * ⚠️ Falha de rede NÃO vira bloqueio. O banco continua sendo a autoridade —
     * se a assinatura venceu de verdade, a política restritiva recusa a escrita
     * de qualquer jeito. Um banner de "venceu" por causa de um 500 seria o
     * sistema acusando o cliente de inadimplência por defeito nosso.
     */
    reportar("billing.assinatura_da_org", error,
      "O cliente não vê os dias restantes do teste; a autoridade continua sendo a política do banco.", true);
    return null;
  }
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return null;
  const a: Assinatura = {
    orgId: "",
    status: (linha.status ?? "none") as StatusAssinatura,
    plano: linha.plano ?? null,
    mrr: Number(linha.mrr ?? 0),
    inicio: linha.inicio ?? null,
    fim: linha.fim ?? null,
  };
  return estadoDaAssinatura(a, hojeISO());
}
