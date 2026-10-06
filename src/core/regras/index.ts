/**
 * REGRAS DE CATEGORIZAÇÃO — conciliação automática por regra (puro, tipado).
 *
 * O aprendizado do FDIP (`fdip/learning`) já memoriza contraparte → categoria,
 * mas só por correspondência EXATA: "POSTO SHELL 042" e "POSTO SHELL 118" são
 * dois aprendizados diferentes. Regra resolve isso: *contém "posto" → Combustível*
 * pega os dois e todos os próximos.
 *
 * A regra é a intenção EXPLÍCITA do dono, então ela vence todo o resto da
 * cascata (aprendizado, CNAE, palavra-chave). Cada aplicação é contada, para o
 * dono ver quais regras estão trabalhando e quais viraram letra morta.
 *
 * Versão regras/1.0.0.
 */

import { sanearContraparte } from "@/core/ingestao/contraparte";

export const REGRAS_VERSION = "regras/1.0.0";

export type OperadorTexto = "contem" | "igual" | "comeca";

export interface CondicaoRegra {
  /** Casa contra a contraparte (nome do pagador/beneficiário). */
  contraparte?: { op: OperadorTexto; valor: string };
  /** Casa contra a descrição/histórico do lançamento. */
  descricao?: { op: OperadorTexto; valor: string };
  /** Restringe a entradas ou saídas. */
  tipo?: "entrada" | "saida";
  /** Faixa de valor (magnitude, sempre positiva). */
  valorMin?: number;
  valorMax?: number;
  /** Prefixo de CNAE — integra com a consulta de CNPJ. Ex.: "47" = varejo. */
  cnaePrefixo?: string;
}

export interface AcaoRegra {
  categoria?: string;
  centroCusto?: string;
  /** Dar baixa/conciliar sem perguntar quando a regra casar. */
  conciliarAuto?: boolean;
}

export interface RegraCategorizacao {
  id: string;
  nome: string;
  ativa: boolean;
  quando: CondicaoRegra;
  entao: AcaoRegra;
  criadaEm: string;
  /** "aprendida" = nasceu de uma correção do usuário; "manual" = ele escreveu. */
  origem: "manual" | "aprendida";
}

/** Lançamento mínimo que a regra sabe avaliar. */
export interface AlvoRegra {
  id: string;
  tipo: "entrada" | "saida";
  valor: number;
  descricao?: string;
  contraparte?: string;
  /** CNAE já resolvido do CNPJ, quando houver. */
  cnae?: string;
}

const norm = (s: string): string =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

function casaTexto(alvo: string | undefined, cond: { op: OperadorTexto; valor: string } | undefined): boolean {
  if (!cond || !cond.valor) return true; // condição vazia não restringe
  const a = norm(alvo ?? "");
  const v = norm(cond.valor);
  if (!v) return true;
  if (!a) return false;
  switch (cond.op) {
    case "igual": return a === v;
    case "comeca": return a.startsWith(v);
    default: return a.includes(v);
  }
}

/** Uma regra casa quando TODAS as condições preenchidas casam (E lógico). */
export function regraCasa(r: RegraCategorizacao, alvo: AlvoRegra): boolean {
  if (!r.ativa) return false;
  const q = r.quando;
  if (q.tipo && q.tipo !== alvo.tipo) return false;
  const v = Math.abs(alvo.valor);
  if (q.valorMin != null && v < q.valorMin) return false;
  if (q.valorMax != null && v > q.valorMax) return false;
  if (q.cnaePrefixo && !(alvo.cnae ?? "").replace(/\D/g, "").startsWith(q.cnaePrefixo.replace(/\D/g, ""))) return false;
  if (!casaTexto(alvo.contraparte, q.contraparte)) return false;
  if (!casaTexto(alvo.descricao, q.descricao)) return false;
  // Uma regra sem NENHUMA condição pegaria tudo — isso é sempre engano.
  const temCondicao =
    !!q.tipo || q.valorMin != null || q.valorMax != null || !!q.cnaePrefixo ||
    !!q.contraparte?.valor || !!q.descricao?.valor;
  return temCondicao;
}

export interface ResultadoRegra {
  alvoId: string;
  regraId: string;
  regraNome: string;
  categoria?: string;
  centroCusto?: string;
  conciliarAuto: boolean;
}

/**
 * Aplica o conjunto de regras a uma lista. A PRIMEIRA regra que casa vence
 * (ordem = prioridade), como num firewall — assim o dono controla o desempate
 * movendo a regra para cima, sem precisar de pesos.
 */
export function aplicarRegras(alvos: AlvoRegra[], regras: RegraCategorizacao[]): ResultadoRegra[] {
  const ativas = regras.filter((r) => r.ativa);
  if (ativas.length === 0) return [];
  const out: ResultadoRegra[] = [];
  for (const alvo of alvos) {
    for (const r of ativas) {
      if (!regraCasa(r, alvo)) continue;
      out.push({
        alvoId: alvo.id,
        regraId: r.id,
        regraNome: r.nome,
        categoria: r.entao.categoria,
        centroCusto: r.entao.centroCusto,
        conciliarAuto: !!r.entao.conciliarAuto,
      });
      break; // primeira que casa manda
    }
  }
  return out;
}

/** Quantas vezes cada regra pegou (para mostrar o que trabalha e o que é letra morta). */
export function contarAplicacoes(res: ResultadoRegra[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const r of res) c[r.regraId] = (c[r.regraId] ?? 0) + 1;
  return c;
}

/**
 * Sugere uma regra a partir de uma CORREÇÃO do usuário ("isto não é Marketing,
 * é Combustível"). Extrai o núcleo do nome da contraparte — sem números de
 * loja/terminal, que são justamente o que faz a memória exata falhar.
 */
export function sugerirRegra(alvo: AlvoRegra, categoria: string): RegraCategorizacao | null {
  const base = nucleoContraparte(alvo.contraparte ?? alvo.descricao ?? "");
  if (base && !soCobranca(base)) return regra("contraparte", base);
  /*
   * ⚠️ NÚCLEO QUE É SÓ A PALAVRA DA COBRANÇA não vira regra de contraparte. O
   * extrato tira a marca da contraparte ("TARIFA CIELO" → "TARIFA"), e corrigir
   * essa linha para "Tarifas de adquirência" propunha "contraparte contém
   * 'tarifa' → Tarifas de adquirência": aceita, a regra vale para a empresa
   * inteira, roda ANTES de tudo, e levava TODA tarifa bancária para a despesa
   * variável. A descrição ainda tem a marca ("tarifa cielo") — a regra sai
   * dela; se nem ela identifica nada, não há regra a propor.
   */
  const porDescricao = nucleoContraparte(alvo.descricao ?? "");
  if (porDescricao && !soCobranca(porDescricao)) return regra("descricao", porDescricao);
  return null;

  function regra(campo: "contraparte" | "descricao", valor: string): RegraCategorizacao {
    return {
      id: `r_${valor.replace(/\s+/g, "_")}_${alvo.tipo}`,
      nome: `${valor} → ${categoria}`,
      ativa: true,
      quando: { [campo]: { op: "contem", valor }, tipo: alvo.tipo },
      entao: { categoria },
      criadaEm: "",
      origem: "aprendida",
    };
  }
}

/** Uma palavra só, e ela não identifica ninguém ("tarifa", "taxa", "mdr", "juros"). */
const soCobranca = (nucleo: string): boolean => !nucleo.includes(" ") && !sanearContraparte(nucleo).ehPessoa;

/**
 * Núcleo do nome: tira números, sufixos de filial/terminal e ruído de extrato
 * ("PIX ENVIADO", "TED", "COMPRA CARTAO"). "POSTO SHELL 042 SP" → "posto shell".
 */
export function nucleoContraparte(bruto: string): string {
  const limpo = norm(bruto)
    .replace(/\b(pix|ted|doc|tev|compra|cartao|debito|credito|enviado|recebido|pagamento|pgto|transferencia|boleto|deb|cred)\b/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\b(ltda|me|epp|eireli|sa|s\/a|filial|loja|unid|terminal)\b/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // 2 primeiras palavras costumam ser a marca ("posto shell", "supermercado x")
  const partes = limpo.split(" ").filter((w) => w.length > 2);
  return partes.slice(0, 2).join(" ");
}
