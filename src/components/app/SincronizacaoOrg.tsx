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

export function SincronizacaoOrg() {
  React.useEffect(() => {
    let vivo = true;
    (async () => {
      await migrarParaServidor(CHAVES_DE_NEGOCIO);
      if (!vivo) return;
      await hidratar(CHAVES_DE_NEGOCIO);
    })();
    return () => { vivo = false; };
  }, []);
  return null;
}
