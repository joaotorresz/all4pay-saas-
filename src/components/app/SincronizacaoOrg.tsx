"use client";

/**
 * A sincronização do estado da organização — montada uma vez no `AppShell`.
 *
 * Faz duas coisas, nesta ordem, e a ordem importa:
 *  1. **Migra** para o servidor o que já está neste navegador e ainda não subiu
 *     (só o que o servidor não tem — sobrescrever com o local de um segundo
 *     dispositivo desfaria o trabalho de quem entrou primeiro);
 *  2. **Hidrata** da nuvem, e o servidor vence. É isso que faz dois usuários da
 *     mesma empresa passarem a ver o mesmo estado.
 */
import * as React from "react";
import { hidratar, migrarParaServidor, CHAVES_DE_NEGOCIO } from "@/lib/store-org";
import { definirUsuarioDasConversas } from "@/lib/ia-conversas";
import { isDemo } from "@/lib/demo";

export function SincronizacaoOrg() {
  React.useEffect(() => {
    let vivo = true;
    (async () => {
      // ⚠️ Identifica o usuário ANTES de hidratar: o histórico da IA é um mapa
      // `usuário → conversas` dentro do estado da organização, e hidratar sem
      // saber quem é leria o balde errado.
      if (!isDemo && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const { data } = await createClient().auth.getUser();
          definirUsuarioDasConversas(data.user?.id);
        } catch { /* sem sessão: cai no balde local, nunca no de outro usuário */ }
      }
      if (!vivo) return;
      await migrarParaServidor(CHAVES_DE_NEGOCIO);
      if (!vivo) return;
      await hidratar(CHAVES_DE_NEGOCIO);
    })();
    return () => { vivo = false; };
  }, []);
  return null;
}
