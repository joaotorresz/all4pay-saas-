"use server";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS AÇÕES DA CENTRAL — no SERVIDOR, e é ele quem fala com a máquina
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Estas são as primeiras server actions do projeto**, e a razão é de
 * autoridade: o navegador falando direto com o PostgREST funciona, mas espalha
 * pela rede a superfície que decide dinheiro. Aqui a sessão fica no cookie, a
 * chamada sai do servidor, e o cliente recebe só o veredito já traduzido.
 *
 * ⚠️ **O CLIENTE NÃO REIMPLEMENTA A REGRA.** Quem autoriza é o gatilho
 * `central_maquina`. Estas funções pedem e traduzem — nada mais. Repetir a
 * alçada aqui criaria a segunda morada da regra, que é o defeito que este
 * repositório passou dois dias matando.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { traduzirRecusa, type RecusaCentral } from "@/lib/central";
import type { Situacao } from "@/core/central";

export type ResultadoAcao = { ok: true } | { ok: false; recusa: RecusaCentral };

/**
 * Move o título na esteira. O UPDATE toca `situacao` — é ele que acorda o
 * gatilho. Qualquer outra coluna de estado passaria por fora da máquina.
 */
export async function moverTituloAction(id: string, para: Situacao): Promise<ResultadoAcao> {
  const s = createClient();
  const { error } = await s.from("movements").update({ situacao: para }).eq("id", id);
  if (error) {
    /*
     * ⚠️ As recusas da máquina chegam como SQLSTATE **P0001** com o código no
     * PREFIXO DA MENSAGEM (`A4P-CENTRAL-*`) — não há errcode próprio por
     * recusa. É acoplamento a texto, declarado como dívida em
     * docs/auditoria.md: errcode por recusa é o certo e não é agora.
     */
    return { ok: false, recusa: traduzirRecusa(`${error.message} ${error.details ?? ""} ${error.hint ?? ""}`) };
  }
  revalidatePath("/central");
  return { ok: true };
}

export interface NovoTitulo {
  descricao: string;
  valor: number;
  vencimento: string;
  categoria: string;
  tipo: "entrada" | "saida";
}

/**
 * Lança um título. ⚠️ Ele **nasce `previsto`** — é o começo da esteira, e é o
 * que torna a Central um caminho e não uma lista.
 *
 * ⚠️ `origem: 'manual'` não é decoração: `titulo_exige_origem` RECUSA com
 * `A4P05` todo título sem procedência. Foi o defeito de gravação da ONDA 5 —
 * todo lançamento manual em produção era recusado pelo banco porque o escritor
 * não mandava este campo.
 */
export async function lancarTituloAction(t: NovoTitulo): Promise<ResultadoAcao & { id?: string }> {
  const s = createClient();
  const { data: sessao } = await s.auth.getUser();
  const uid = sessao.user?.id ?? null;
  if (!uid) {
    return { ok: false, recusa: { codigo: "permissao", motivo: "Sua sessão expirou.", comoResolver: "Entre de novo e repita o lançamento." } };
  }
  const { data: vinculo } = await s
    .from("organization_members").select("org_id").eq("user_id", uid).limit(1).maybeSingle();
  const orgId = (vinculo as { org_id?: string } | null)?.org_id ?? null;

  const { data: conta } = await s
    .from("financial_accounts").select("id").limit(1).maybeSingle();

  const { data, error } = await s.from("movements").insert({
    org_id: orgId,
    account_id: (conta as { id?: string } | null)?.id ?? null,
    type: t.tipo,
    amount: Math.abs(t.valor),
    description: t.descricao.trim(),
    category: t.categoria.trim() || null,
    due_date: t.vencimento,
    competence_date: t.vencimento,
    status: "pendente",
    situacao: "previsto",
    origem: "manual",
    especie: "titulo",
  }).select("id").maybeSingle();

  if (error) {
    return { ok: false, recusa: traduzirRecusa(`${error.message} ${error.details ?? ""} ${error.hint ?? ""}`) };
  }
  revalidatePath("/central");
  return { ok: true, id: (data as { id?: string } | null)?.id };
}
