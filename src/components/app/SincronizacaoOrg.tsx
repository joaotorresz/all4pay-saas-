"use client";

/**
 * A sincronização do estado da organização — montada uma vez no `AppShell`.
 *
 * Faz três coisas, nesta ordem, e a ordem importa:
 *  0. **Confere de quem é o cache** (`reconciliarDonoDoCache`): cache de outra
 *     organização (ou sem marca) é descartado e não sobe;
 *  1. **Migra** para o servidor o que já está neste navegador e ainda não subiu
 *     (só o que o servidor não tem — sobrescrever com o local de um segundo
 *     dispositivo desfaria o trabalho de quem entrou primeiro);
 *  2. **Hidrata** da nuvem, e o servidor vence. É isso que faz dois usuários da
 *     mesma empresa passarem a ver o mesmo estado.
 */
import * as React from "react";
import { sincronizarComServidor, expurgarCaches, CHAVES_DE_NEGOCIO } from "@/lib/store-org";
import { reportar } from "@/lib/erros";
import { definirUsuarioDasConversas } from "@/lib/ia-conversas";
import { isDemo } from "@/lib/demo";

export function SincronizacaoOrg() {
  React.useEffect(() => {
    let vivo = true;
    // ⚠️ O expurgo do cache roda SEMPRE, inclusive em demonstração e sem
    // servidor: entrada vencida é lixo em qualquer modo, e ela disputa a mesma
    // cota de 5 MB que o dado de verdade precisa quando a rede cai.
    expurgarCaches();
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
      // ⚠️ Envio e hidratação passam pela conferência do DONO do cache: antes
      // daqui, o que estava no navegador subia para a organização ABERTA mesmo
      // quando era de outra (trocar de empresa, outro login na mesma máquina).
      const r = await sincronizarComServidor(CHAVES_DE_NEGOCIO);
      if (r.descartadas > 0) {
        reportar(
          "organizacao.cache",
          new Error(`${r.descartadas} item(ns) de negócio no navegador não eram da organização aberta (${r.dono})`),
          "o cache de outra empresa foi descartado deste navegador e NÃO subiu; o que é desta empresa volta do servidor",
        );
      }
    })();
    return () => { vivo = false; };
  }, []);
  return null;
}
