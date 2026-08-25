/**
 * A alçada por papel — leitura e escrita. Demo-safe.
 *
 * ⚠️ Quem DECIDE é o banco (o gatilho `central_maquina` lê `central_alcada`).
 * Esta camada só apresenta e edita; confiar nela para liberar repetiria o
 * defeito do Modo Pro cortina.
 */
import { createClient } from "@/lib/supabase/client";
import { comTeto } from "@/lib/supabase/consulta";
import { isDemo } from "@/lib/demo";
import { ler, gravar, CHAVES_ORG } from "@/lib/store-org";
import { PAPEIS, type Papel } from "@/core/seguranca";
import { type AlcadaDoOnboarding } from "@/core/seguranca/alcada";

export type LinhaAlcada = { papel: Papel; teto: number | null };

/** O mesmo padrão da migration (`central_alcada_padrao`), para a demonstração. */
const PADRAO: Record<string, number | null> = {
  owner: null, admin: null, aprovador: 10_000,
};
const padraoDe = (papel: string): number | null =>
  papel in PADRAO ? PADRAO[papel] : 0;

const todasAsLinhas = (guardado: Record<string, number | null>): LinhaAlcada[] =>
  PAPEIS.map((p) => ({
    papel: p.id,
    teto: p.id in guardado ? guardado[p.id] : padraoDe(p.id),
  }));

export async function listarAlcada(): Promise<LinhaAlcada[]> {
  if (isDemo) return todasAsLinhas(ler<Record<string, number | null>>(CHAVES_ORG.centralAlcada, {}));
  const { data, error } = await comTeto(
    createClient().from("central_alcada").select("papel, teto_valor"),
  );
  // ⚠️ Antes da migration a tabela não existe: cai no padrão em vez de derrubar
  // a tela. Sem isto, Configurações quebraria inteira por causa de uma seção.
  if (error || !data) return todasAsLinhas({});
  const mapa: Record<string, number | null> = {};
  for (const r of data as { papel: string; teto_valor: number | null }[]) mapa[r.papel] = r.teto_valor;
  return todasAsLinhas(mapa);
}

export async function salvarAlcada(papel: Papel, teto: number | null): Promise<void> {
  if (isDemo) {
    const atual = ler<Record<string, number | null>>(CHAVES_ORG.centralAlcada, {});
    gravar(CHAVES_ORG.centralAlcada, { ...atual, [papel]: teto });
    return;
  }
  const { error } = await createClient()
    .from("central_alcada")
    .upsert({ papel, teto_valor: teto, atualizado_em: new Date().toISOString() }, { onConflict: "org_id,papel" });
  // ⚠️ NÃO engole: a política restritiva recusa quem não tem `administrar`, e
  // uma recusa silenciosa faria a tela mostrar um teto que o banco não aceitou.
  if (error) throw new Error(error.message);
}

/** Grava o que a etapa de Governança do onboarding decidiu. Best-effort. */
export async function aplicarAlcadaDoOnboarding(a: AlcadaDoOnboarding): Promise<void> {
  for (const { papel, teto } of a.tetos) {
    try { await salvarAlcada(papel, teto); } catch { /* o onboarding não pode falhar por isto */ }
  }
}
