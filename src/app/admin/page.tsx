/**
 * ⚠️ **SERVER COMPONENT, de propósito — o segundo cadeado.**
 *
 * Esta página era `"use client"` e só renderizava `<AdminView />`. O painel
 * inteiro (MRR, ARR, 16 organizações, usuários e o controle de plano de
 * terceiros) era baixado pelo navegador de QUALQUER usuário autenticado, e a
 * decisão de mostrar ou não ficava com o cliente, que exibia "Acesso restrito".
 *
 * ⚠️ **Decisão de acesso no cliente é apresentação, não controle.** O banco
 * negava os dados — medido em produção com o papel de um usuário comum, todas
 * as RPCs de plataforma respondem "Acesso administrativo negado" —, então não
 * havia vazamento. Mas quem baixou o pacote tem o mapa da área: nomes de RPC,
 * campos, a forma da tela. Servir isso a quem não entra é dar a planta da casa
 * a quem não tem a chave.
 *
 * São três cadeados, e nenhum é redundante:
 *   1. o middleware devolve **403** antes de servir byte nenhum;
 *   2. este componente confere de novo no servidor — o middleware pode ser
 *      contornado por uma rota que o `matcher` não cubra amanhã;
 *   3. o banco nega os dados, que é o único que continua valendo se os dois
 *      primeiros falharem.
 *
 * ⚠️ Em demonstração a área continua aberta: `NEXT_PUBLIC_ALL4PAY_DEMO` só
 * serve dado sintético, e trancá-la ali esconderia o modo administrador de quem
 * está avaliando o produto — sem nenhum dado real do outro lado.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { AdminView } from "@/components/admin/AdminView";

export default async function AdminPage() {
  if (!isDemo) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    // ⚠️ Falha FECHADA: erro de rede ou RPC ausente nega. Um painel que abre
    // quando a checagem falha abre exatamente quando o sistema está pior.
    let dono = false;
    try {
      const { data, error } = await supabase.rpc("is_platform_admin");
      dono = !error && data === true;
    } catch { dono = false; }
    if (!dono) {
      // A rota já devolve 403 no middleware; isto cobre o caso de ela ser
      // alcançada por um caminho que o matcher não veja.
      redirect("/");
    }
  }
  return <AdminView />;
}
