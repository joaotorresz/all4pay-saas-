/**
 * Conciliação Open Finance — casa transações do banco (movements de origem OF,
 * reference_code 'pluggy:%', já pagas) com TÍTULOS PENDENTES lançados (a receber/
 * a pagar) por valor + data + tipo + contraparte. Ao conciliar, o movimento do
 * banco HERDA a classificação do título (categoria/centro/contato) e o título
 * previsto é CANCELADO (vai para a Lixeira) — evita contar o mesmo dinheiro 2x.
 * Live-only (em demo não há Open Finance). Multi-tenant via RLS.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { TETO_LINHAS, semAmostra } from "@/lib/supabase/consulta";
import { reportar } from "@/lib/erros";
import { casarExtrato, type MovimentoParaCasar, type ParConciliacao } from "@/core/conciliacao/pares";

export type MatchConc = ParConciliacao;
export interface ConciliacaoOF { matches: MatchConc[]; pendentesSemMatch: number; ofSemMatch: number }

export type RecomendacaoIA = "conciliar" | "revisar" | "rejeitar";
export interface AvaliacaoIA { recomendacao: RecomendacaoIA; confiancaIA: number; motivo: string }

/** IA disponível para desempatar pares ambíguos? */
export async function iaConciliacaoAtiva(): Promise<boolean> {
  try { return !!(await fetch("/api/ai/conciliar").then((r) => r.json()))?.configured; } catch (e) {
    reportar("conciliacao.openfinance", e, "a conciliação abre sem as transações do banco", true); return false; }
}

/** Avalia com IA os pares ambíguos (confiança média) → mapa ofId→avaliação. */
export async function avaliarComIA(matches: MatchConc[]): Promise<Map<string, AvaliacaoIA>> {
  const out = new Map<string, AvaliacaoIA>();
  if (matches.length === 0) return out;
  const pares = matches.map((m) => ({
    ofId: m.ofId, ofDesc: m.ofDesc, ofData: m.ofData,
    pendDesc: m.pendDesc, dueDate: m.dueDate, valor: m.amount, tipo: m.tipo, confianca: m.confianca,
  }));
  try {
    const j = await fetch("/api/ai/conciliar", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pares }),
    }).then((r) => r.json());
    if (j?.ok && Array.isArray(j.avaliacoes)) {
      for (const a of j.avaliacoes as Array<AvaliacaoIA & { ofId: string }>) {
        if (a?.ofId && a.recomendacao) out.set(a.ofId, { recomendacao: a.recomendacao, confiancaIA: Number(a.confiancaIA ?? 0), motivo: String(a.motivo ?? "") });
      }
    }
  } catch (e) {
    reportar("conciliacao.openfinance", e, "a conciliação abre sem as transações do banco", true); /* sem IA: segue só o determinístico */ }
  return out;
}


/** Amostra determinística (demo) — mostra a confirmação profissional mesmo sem
 *  banco conectado. Em live os pares vêm do matching real abaixo. */
const DEMO_CONC: ConciliacaoOF = {
  matches: [
    { ofId: "of-1", ofDesc: "PIX recebido · ACME Ltda", ofData: "2026-06-12", pendId: "p-1", pendDesc: "NF 1042 · ACME Ltda", dueDate: "2026-06-12", tipo: "entrada", amount: 4800, confianca: 98, criterios: { valorExato: true, dias: 0, mesmoContato: true } },
    { ofId: "of-2", ofDesc: "TED · Distribuidora Sul", ofData: "2026-06-10", pendId: "p-2", pendDesc: "Boleto fornecedor · Distribuidora Sul", dueDate: "2026-06-11", tipo: "saida", amount: 2350.9, confianca: 88, criterios: { valorExato: true, dias: 1, mesmoContato: true } },
    { ofId: "of-3", ofDesc: "Débito · Posto Ipiranga", ofData: "2026-06-09", pendId: "p-3", pendDesc: "Combustível (previsto)", dueDate: "2026-06-07", tipo: "saida", amount: 520, confianca: 72, criterios: { valorExato: true, dias: 2, mesmoContato: false } },
    { ofId: "of-4", ofDesc: "PIX recebido · João Mendes", ofData: "2026-06-08", pendId: "p-4", pendDesc: "Serviço · João Mendes", dueDate: "2026-06-05", tipo: "entrada", amount: 1200, confianca: 64, criterios: { valorExato: true, dias: 3, mesmoContato: false } },
  ],
  pendentesSemMatch: 3,
  ofSemMatch: 5,
};

type MovRow = MovimentoParaCasar;

/** A consulta do navegador; o casamento é a regra única de `core/conciliacao/pares`. */
export async function getConciliacaoOF(): Promise<ConciliacaoOF | null> {
  if (isDemo) return DEMO_CONC;
  const supabase = createClient();
  const cols = "id,type,amount,due_date,paid_date,party_id,description";
  const [pendRes, ofRes] = await Promise.all([
    semAmostra(supabase.from("movements").select(cols)).eq("status", "pendente").limit(TETO_LINHAS),
    semAmostra(supabase.from("movements").select(cols)).eq("status", "pago").like("reference_code", "pluggy:%").is("conciliado_com", null).limit(TETO_LINHAS),
  ]);
  if (pendRes.error) throw pendRes.error;
  if (ofRes.error) throw ofRes.error;
  const r = casarExtrato((pendRes.data ?? []) as MovRow[], (ofRes.data ?? []) as MovRow[]);
  return { matches: r.pares, pendentesSemMatch: r.pendentesSemPar, ofSemMatch: r.extratoSemPar };
}

/** Concilia um par: o movimento do banco (OF) herda a classificação do título e
 *  o título previsto é cancelado (Lixeira). Não duplica nem re-cria no próximo sync
 *  (o movimento OF segue vinculado à bank_transaction pelo reference_code). */
/**
 * Concilia um título previsto com a linha do extrato.
 *
 * ⚠️ Passou a chamar `conciliar_movimentos` no servidor, e não a fazer os três
 * updates aqui. O motivo não é elegância: a versão anterior aplicava o EFEITO
 * (cancelava o previsto, copiava a classificação) e não guardava o PAR. Sem o
 * par não existe estorno possível — dá para reabrir o título, mas não dá para
 * saber com o que ele casou nem soltar o outro lado, e a mesma entrada ficaria
 * conciliada e prevista ao mesmo tempo, contada duas vezes.
 *
 * E os três updates soltos não eram atômicos: uma falha no meio deixava um
 * lado conciliado e o outro não.
 */
export async function conciliar(pendId: string, ofId: string): Promise<void> {
  if (isDemo) return;
  const { error } = await createClient()
    .rpc("conciliar_movimentos", { p_previsto: pendId, p_extrato: ofId });
  if (error) throw new Error(error.message);
}

/**
 * Desfaz a conciliação, soltando OS DOIS lados.
 *
 * ⚠️ A classificação que desceu para a linha do extrato NÃO volta atrás, e é
 * decisão: ela pode ter sido ajustada à mão depois, e reverter por cima
 * apagaria trabalho que ninguém pediu para apagar. O antes e o depois estão na
 * aba de histórico daquele lançamento, onde uma pessoa decide.
 */
export async function estornarConciliacao(id: string, motivo: string): Promise<void> {
  if (isDemo) return;
  const { error } = await createClient()
    .rpc("estornar_conciliacao", { p_id: id, p_motivo: motivo });
  if (error) throw new Error(error.message);
}
