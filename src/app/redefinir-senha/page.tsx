import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RedefinirSenhaView } from "@/components/entrada/RedefinirSenhaView";
import { MARCA } from "@/core/marca";
import { sessaoDeRecuperacaoValida } from "@/core/recuperacao";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `Nova senha · ${MARCA}`,
  description: "Escolha a nova senha da sua conta.",
};

// Lê a sessão a cada visita: a decisão depende de QUEM está abrindo, agora.
export const dynamic = "force-dynamic";

/**
 * ⚠️ **Só abre com a sessão que o LINK DO E-MAIL acabou de criar.** O
 * middleware só confere se há sessão — e uma sessão comum, num computador em
 * que o dono deixou o sistema aberto, trocaria a senha dele sem pedir a atual
 * (e a troca derruba as outras sessões). A marca `recovery` no token, com o
 * horário dela, é o que separa "veio do e-mail há pouco" de "estava logado".
 * `getClaims` confere a assinatura do token antes de ler a marca.
 *
 * Sem Supabase (demonstração), não há sessão a conferir e a tela só explica.
 */
export default async function RedefinirSenhaPage() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const { data } = await createClient().auth.getClaims();
    if (!sessaoDeRecuperacaoValida(data?.claims?.amr, Math.floor(Date.now() / 1000))) redirect("/");
  }
  return <RedefinirSenhaView />;
}
