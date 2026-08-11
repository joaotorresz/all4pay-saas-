"use client";

/**
 * O HISTÓRICO DE UM REGISTRO — quem fez o quê, quando, com qual valor antes e
 * qual depois.
 *
 * ⚠️ Ele lê a MESMA trilha que o gatilho do banco escreve, e não uma segunda
 * fonte montada pela tela. Duas trilhas discordam no primeiro caminho que
 * alguém esquece de instrumentar — e a que a tela monta é sempre a que esquece,
 * porque ela só sabe do que passou por ela.
 */
import { isDemo } from "@/lib/demo";
import { formatBRL } from "@/lib/format";

export interface EventoDoRegistro {
  id: string;
  quando: string;
  usuario: string;
  acao: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  origem: string | null;
  ip: string | null;
  correlacao: string | null;
}

export async function historicoDoRegistro(
  entidade: string, id: string, limite = 100,
): Promise<EventoDoRegistro[] | null> {
  // ⚠️ `null` = não deu para consultar, e é diferente de `[]` = nada aconteceu.
  // A tela precisa dizer as duas coisas com frases diferentes; um vazio mudo
  // faria "não perguntei" parecer "ninguém mexeu".
  if (isDemo) return null;
  const { createClient } = await import("@/lib/supabase/client");
  const { data, error } = await createClient()
    .rpc("historico_do_registro", { p_entidade: entidade, p_id: id, p_limite: limite });
  if (error || !data) return null;
  return (data as Record<string, unknown>[]).map((l) => ({
    id: String(l.id),
    quando: String(l.quando),
    usuario: String(l.usuario ?? "sistema"),
    acao: String(l.acao),
    antes: (l.antes as Record<string, unknown>) ?? null,
    depois: (l.depois as Record<string, unknown>) ?? null,
    origem: (l.origem as string) ?? null,
    ip: (l.ip as string) ?? null,
    correlacao: (l.correlacao as string) ?? null,
  }));
}

/* -------------------------------------------------------------------------- */
/* Tradução — o evento em português                                           */
/* -------------------------------------------------------------------------- */

const VERBO: Record<string, string> = {
  criar: "Criou",
  alterar: "Alterou",
  excluir: "Excluiu",
  restaurar: "Restaurou",
  expurgar: "Apagou em definitivo",
  estornar_baixa: "Estornou a baixa",
  estornar: "Estornou",
};

/**
 * ⚠️ A ação chega como `movements.alterar` — nome de tabela mais verbo. Mostrar
 * isso cru obrigaria quem lê a auditoria a conhecer o esquema do banco para
 * saber o que aconteceu com o próprio dinheiro.
 */
export function verboDoEvento(acao: string): string {
  const sufixo = acao.includes(".") ? acao.slice(acao.lastIndexOf(".") + 1) : acao;
  return VERBO[sufixo] ?? sufixo;
}

/** Campos que ninguém quer ler numa trilha — ruído de infraestrutura. */
const OCULTOS = new Set([
  "id", "org_id", "created_at", "updated_at", "search_vector", "chave",
]);

const ROTULO: Record<string, string> = {
  amount: "Valor",
  status: "Situação",
  due_date: "Vencimento",
  paid_date: "Pagamento",
  description: "Descrição",
  category: "Categoria",
  type: "Tipo",
  account_id: "Conta",
  party_id: "Contraparte",
  name: "Nome",
  excluido_em: "Excluído em",
  excluido_motivo: "Motivo da exclusão",
  estornado_em: "Estornado em",
  estorno_motivo: "Motivo do estorno",
};

export const rotuloDoCampo = (c: string): string => ROTULO[c] ?? c;

/**
 * Formata o valor de um campo para a trilha.
 *
 * ⚠️ Dinheiro sai com `formatBRL` e não cru. É o mesmo motivo pelo qual o
 * produto inteiro tem um `<Money>`: `1000.00` e `R$1.000,00` são o mesmo
 * número e não são a mesma leitura — e uma auditoria é exatamente o lugar onde
 * confundir 1000 com 10,00 custa caro.
 */
export function valorDoCampo(campo: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (campo === "amount" || campo === "balance" || campo === "valor") {
    const n = Number(v);
    if (Number.isFinite(n)) return formatBRL(n);
  }
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** As mudanças de um evento, já filtradas e traduzidas. */
export function mudancasDoEvento(
  e: EventoDoRegistro,
): { campo: string; rotulo: string; antes: string; depois: string }[] {
  const chaves = new Set<string>([
    ...Object.keys(e.antes ?? {}),
    ...Object.keys(e.depois ?? {}),
  ]);
  return Array.from(chaves)
    .filter((c) => !OCULTOS.has(c))
    .sort()
    .map((campo) => ({
      campo,
      rotulo: rotuloDoCampo(campo),
      antes: valorDoCampo(campo, (e.antes ?? {})[campo]),
      depois: valorDoCampo(campo, (e.depois ?? {})[campo]),
    }));
}
