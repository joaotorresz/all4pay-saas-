"use client";

import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import type { EventoJornada } from "@/core/cadastro/jornada";

/**
 * O lado do navegador da jornada do cadastro (`core/cadastro/jornada`).
 *
 * ⚠️ **Nada aqui pode travar o cadastro.** Os envios são "dispare e esqueça"
 * (`keepalive`, para o último passo sair mesmo com a aba fechando) e toda falha
 * é engolida de propósito — é telemetria, a mesma exceção sancionada do
 * registro de acesso aos aliases. Em demonstração nada sai.
 *
 * O token (`a4p_cadastro_jornada`) é do DISPOSITIVO: identifica esta conversa
 * enquanto a conta não existe, e some quando ela conclui.
 */
const CHAVE = "a4p_cadastro_jornada";

export function tokenDaJornada(): string | null {
  try {
    const salvo = window.localStorage.getItem(CHAVE);
    if (salvo) return salvo;
    const novo = crypto.randomUUID();
    window.localStorage.setItem(CHAVE, novo);
    return novo;
  } catch {
    return null;
  }
}

export function registrarPasso(ev: Omit<EventoJornada, "id">): void {
  if (isDemo) return;
  const id = tokenDaJornada();
  if (!id) return;
  try {
    void fetch("/api/cadastro/jornada", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...ev }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* telemetria não derruba o cadastro */
  }
}

/** Liga a jornada à empresa que acabou de nascer. Chamar só COM a sessão nova. */
export async function concluirJornada(): Promise<void> {
  if (isDemo) return;
  let id: string | null = null;
  try { id = window.localStorage.getItem(CHAVE); } catch { /* sem token, nada a ligar */ }
  if (!id) return;
  try {
    const { error } = await createClient().rpc("cadastro_jornada_concluir", { p_id: id });
    if (!error) window.localStorage.removeItem(CHAVE);
  } catch {
    /* telemetria não derruba o cadastro */
  }
}
