"use client";

/**
 * O plano da organização, do lado do cliente — **para APRESENTAR, nunca para
 * autorizar**.
 *
 * ⚠️ A autorização acontece no `middleware.ts`, no servidor. Este módulo existe
 * só para o menu esconder o que não está incluso e para a tela de upgrade dizer
 * o nome do plano. Qualquer valor daqui é palpite de cliente: quem confia nele
 * para liberar tela repete exatamente o defeito que a ONDA 2 corrigiu.
 */
import * as React from "react";
import { isDemo } from "@/lib/demo";
import { PLANO_ABERTO, PLANO_SIMPLES, type EstadoPlano } from "@/core/planos";
import { reportar } from "@/lib/erros";

const SUPA_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/** Cache de sessão: o plano não muda entre duas navegações. */
let cache: EstadoPlano | null = null;

export async function carregarPlano(): Promise<EstadoPlano> {
  if (cache) return cache;
  // Em demo (ou sem Supabase) não há o que cobrar, e oferecer upgrade de um
  // plano que não existe é pior que não bloquear.
  if (isDemo || !SUPA_CONFIGURED) { cache = PLANO_ABERTO; return cache; }
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const { data, error } = await createClient().rpc("meu_plano");
    if (error || !data) { cache = PLANO_SIMPLES; return cache; }
    const l = (Array.isArray(data) ? data[0] : data) as
      | { plano?: string; status?: string; expira?: string | null; pro?: boolean } | undefined;
    cache = l
      ? { plano: l.pro ? "pro" : "simples", nome: l.plano ?? "Simples", status: l.status ?? "none", expira: l.expira ?? null, aberto: false }
      : PLANO_SIMPLES;
  } catch (e) {
    reportar("plano.carregar", e, "a tela assume o plano Simples e pode esconder o que a empresa contratou", true);
    cache = PLANO_SIMPLES;
  }
  return cache;
}

export function usePlano(): { estado: EstadoPlano; carregando: boolean } {
  const [estado, setEstado] = React.useState<EstadoPlano>(cache ?? PLANO_SIMPLES);
  const [carregando, setCarregando] = React.useState(!cache);
  React.useEffect(() => {
    let vivo = true;
    carregarPlano().then((e) => { if (vivo) { setEstado(e); setCarregando(false); } });
    return () => { vivo = false; };
  }, []);
  return { estado, carregando };
}
