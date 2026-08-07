import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PLANO_SIMPLES, type EstadoPlano } from "@/core/planos";

/**
 * Refresca a sessão Supabase no middleware (App Router + @supabase/ssr).
 * Se o Supabase não estiver configurado (modo demo), é no-op: `configured`
 * vem false e o app segue aberto, sem exigir login.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { response, user: null, configured: false };

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }[],
      ) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { response, user, configured: true, supabase };
}

/**
 * O plano da organização do usuário logado, lido NO SERVIDOR.
 *
 * ⚠️ É a peça que faltava para o gating deixar de ser cortina. A RPC
 * `meu_plano()` (migration 0022) é `SECURITY DEFINER` escopada ao `auth.uid()`:
 * o cliente não consegue mentir sobre o próprio plano porque não é ele quem
 * responde.
 *
 * Falha de rede/RPC ⇒ trata como **Simples**. Assumir Pro num erro transformaria
 * qualquer instabilidade em liberação geral do produto pago.
 */
export async function planoDoUsuario(
  supabase: ReturnType<typeof createServerClient>,
): Promise<EstadoPlano> {
  try {
    const { data, error } = await supabase.rpc("meu_plano");
    if (error || !data) return PLANO_SIMPLES;
    const linha = (Array.isArray(data) ? data[0] : data) as
      | { plano?: string; status?: string; expira?: string | null; pro?: boolean }
      | undefined;
    if (!linha) return PLANO_SIMPLES;
    return {
      plano: linha.pro ? "pro" : "simples",
      nome: linha.plano ?? "Simples",
      status: linha.status ?? "none",
      expira: linha.expira ?? null,
      aberto: false,
    };
  } catch {
    return PLANO_SIMPLES;
  }
}


/**
 * Conta um acesso a endereço aposentado — fire-and-forget.
 *
 * ⚠️ Falha em silêncio de propósito, e esta é a única exceção sancionada à
 * regra de não engolir erro: um desvio de rota NÃO pode quebrar porque a
 * telemetria caiu. O usuário está tentando abrir uma tela; a contagem é nossa,
 * não dele.
 */
export async function registrarAcessoAlias(rota: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/rpc/registrar_acesso_alias`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_rota: rota }),
    });
  } catch {
    /* telemetria não derruba navegação */
  }
}
