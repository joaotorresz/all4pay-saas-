"use client";

import * as React from "react";
import { isDemo } from "@/lib/demo";

const SUPA_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Quem está logado — nome e e-mail, para o cartão "Sua conta" do menu.
 * Em demonstração (ou sem Supabase) devolve o rótulo da demonstração.
 */
export function useUsuario(): { nome: string; email: string } {
  const [usuario, setUsuario] = React.useState<{ nome: string; email: string } | null>(null);
  React.useEffect(() => {
    if (isDemo || !SUPA_CONFIGURED) return;
    let ativo = true;
    import("@/lib/supabase/client").then(async ({ createClient }) => {
      const { data } = await createClient().auth.getUser();
      if (!ativo || !data.user) return;
      const email = data.user.email ?? "";
      const meta = data.user.user_metadata as { name?: string; full_name?: string } | undefined;
      setUsuario({ nome: meta?.name || meta?.full_name || (email ? email.split("@")[0] : "Usuário"), email });
    });
    return () => { ativo = false; };
  }, []);
  if (isDemo) return { nome: "Demonstração", email: "modo demonstração" };
  return usuario ?? { nome: "Sua conta", email: "" };
}

/** Sai da conta e volta ao login. */
export async function sairDaConta(router: { push: (h: string) => void; refresh: () => void }) {
  const { createClient } = await import("@/lib/supabase/client");
  await createClient().auth.signOut();
  router.push("/login");
  router.refresh();
}

export const SAIR_DISPONIVEL = SUPA_CONFIGURED;
