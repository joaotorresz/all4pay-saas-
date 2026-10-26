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

/**
 * ⚠️ A trilha mostra SÓ os campos que têm nome em português. O registro do
 * banco carrega dezenas de colunas de infraestrutura (ids, chaves, marcas de
 * amostra, carimbos de conciliação), e despejá-las na tela transformava a
 * criação de um título de R$ 1,00 numa lista de trinta linhas com UUIDs — que
 * ninguém lê, e que esconde a única mudança que importava. Campo que guarda
 * um id (`*_id`) fica de fora: o número da chave não diz qual conta é. A
 * trilha completa continua no banco e em Administração › Logs.
 */
const ROTULO: Record<string, string> = {
  amount: "Valor",
  status: "Situação",
  situacao: "Situação",
  due_date: "Vencimento",
  paid_date: "Pagamento",
  competence_date: "Competência",
  description: "Descrição",
  category: "Categoria",
  type: "Tipo",
  name: "Nome",
  installment_no: "Parcela",
  installment_total: "Total de parcelas",
  baixado_em: "Baixado em",
  confirmado_em: "Confirmado em",
  conciliado_em: "Conciliado em",
  excluido_em: "Excluído em",
  excluido_motivo: "Motivo da exclusão",
  estornado_em: "Estornado em",
  estorno_motivo: "Motivo do estorno",
};

export const rotuloDoCampo = (c: string): string => ROTULO[c] ?? c;

const VALOR: Record<string, string> = {
  entrada: "entrada", saida: "saída", pendente: "pendente", pago: "pago",
  cancelado: "cancelado", previsto: "previsto", confirmado: "confirmado",
  baixado: "baixado", conciliado: "conciliado", estornado: "estornado",
};

/**
 * Formata o valor de um campo para a trilha.
 *
 * ⚠️ Dinheiro sai com `formatBRL` e não cru. É o mesmo motivo pelo qual o
 * produto inteiro tem um `<Money>`: `1000.00` e `R$ 1.000,00` são o mesmo
 * número e não são a mesma leitura — e uma auditoria é exatamente o lugar onde
 * confundir 1000 com 10,00 custa caro. Data sai em dd/mm/aaaa, fatiada da
 * string (em UTC−3 um `Date` mudaria o dia).
 */
export function valorDoCampo(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (campo === "amount" || campo === "balance" || campo === "valor") {
    const n = Number(v);
    if (Number.isFinite(n)) return formatBRL(n);
  }
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  const d = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(s);
  if (d) return `${d[3]}/${d[2]}/${d[1]}${d[4] ? ` ${d[4]}` : ""}`;
  return VALOR[s] ?? s;
}

/**
 * As mudanças de um evento, já filtradas e traduzidas. Só entra o campo que
 * MUDOU — na criação, o que nasceu preenchido; numa alteração, o que tem antes
 * e depois diferentes. `antes` vem nulo na criação: a tela mostra só o valor.
 */
export function mudancasDoEvento(
  e: EventoDoRegistro,
): { campo: string; rotulo: string; antes: string | null; depois: string }[] {
  const chaves = new Set<string>([
    ...Object.keys(e.antes ?? {}),
    ...Object.keys(e.depois ?? {}),
  ]);
  const criacao = !e.antes || e.acao.endsWith("criar");
  return Array.from(chaves)
    .filter((c) => c in ROTULO)
    .sort((a, b) => Object.keys(ROTULO).indexOf(a) - Object.keys(ROTULO).indexOf(b))
    .map((campo) => ({
      campo,
      rotulo: rotuloDoCampo(campo),
      antes: criacao ? null : valorDoCampo(campo, (e.antes ?? {})[campo]),
      depois: valorDoCampo(campo, (e.depois ?? {})[campo]),
    }))
    .filter((m) => (m.antes === null ? m.depois !== "—" : m.antes !== m.depois));
}
