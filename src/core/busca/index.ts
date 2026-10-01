/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUSCA GLOBAL DE TÍTULOS E LANÇAMENTOS — o casamento por texto e por VALOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quem procura um pagamento quase nunca lembra o nome da tela: lembra "aquele
 * de mil duzentos e pouco", "o da Padaria", "a nota 4471". A busca da paleta
 * (⌘K) só achava páginas e cadastros; o dinheiro em si ficava fora dela.
 *
 * ⚠️ **O VALOR SE CASA EM CENTAVOS, e a grafia é a brasileira.** "1.234,56" é
 * mil duzentos e trinta e quatro reais e cinquenta e seis centavos; lido com a
 * regra americana vira 1,23456 e não acha nada. E "1.234" (sem vírgula) é mil
 * duzentos e trinta e quatro — o ponto é MILHAR quando vem seguido de três
 * dígitos. Comparar texto ("1234.56" contém "1234"?) acharia R$ 11.234,00 ao
 * procurar R$ 1.234,00; por isso a comparação é por centavos inteiros, exata.
 *
 * ⚠️ **TETO DECLARADO.** A paleta mostra no máximo `TETO_TITULOS` resultados e
 * DIZ quantos existem ("8 de 23"). Cortar calado faria a pessoa concluir que o
 * título que ela procura não existe, quando ele é só o nono.
 *
 * Puro, sem I/O. `busca/1.0.0`.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

export const BUSCA_VERSION = "busca/1.0.0";

/** Quantos títulos/lançamentos a paleta mostra — o resto é contado e dito. */
export const TETO_TITULOS = 8;
/** Texto curto demais casa com tudo; abaixo disto só o valor é procurado. */
export const MINIMO_TEXTO = 3;

const semAcento = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Lê um VALOR digitado em grafia brasileira. Devolve `null` quando o texto não
 * é um valor — e é esse `null` que impede "abril" ou "NF" de virarem número.
 *
 *   "1.234,56" · "1234,56" · "R$ 1.234,56" → 1234.56
 *   "1.234"    → 1234   (ponto seguido de três dígitos é milhar)
 *   "1234.5"   → 1234.5 (ponto com uma ou duas casas é decimal)
 *   "1234"     → 1234
 */
export function interpretarValor(q: string): number | null {
  const s = q.trim().replace(/^r\$\s*/i, "").replace(/\s+/g, "");
  if (!s) return null;
  let n: string;
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s) || /^\d+,\d{1,2}$/.test(s)) {
    n = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    n = s.replace(/\./g, "");
  } else if (/^\d+(\.\d{1,2})?$/.test(s)) {
    n = s;
  } else {
    return null;
  }
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Centavos inteiros — a única comparação de dinheiro que não erra no float. */
export const centavos = (v: number) => Math.round(Math.abs(v) * 100);

export type MotivoCasamento = "valor" | "contraparte" | "descricao" | "documento" | "categoria" | "id";

export interface ResultadoTitulo {
  id: string;
  /** "titulo" = ainda em aberto; "lancamento" = já liquidado. */
  grupo: "titulo" | "lancamento";
  direcao: "pagar" | "receber";
  contraparte: string;
  descricao: string | null;
  valor: number;
  vencimento: string;
  pagamento: string | null;
  motivo: MotivoCasamento;
  /** A tela que responde — já filtrada no título. */
  rota: string;
}

export interface ResultadoBusca {
  itens: ResultadoTitulo[];
  /** Quantos casaram ANTES do teto — é o que a paleta diz ao cortar. */
  total: number;
  /** O valor lido da busca, quando ela era um valor. */
  valor: number | null;
}

/**
 * A rota que abre o título já filtrado. A lista de títulos aceita `busca=` e,
 * com ela, abre o período INTEIRO — senão um título de março, procurado em
 * setembro, cairia fora da janela do mês corrente e a tela diria "nenhum".
 */
export function rotaDoTitulo(m: Pick<RiskMovement, "id" | "type">): string {
  const base = m.type === "entrada" ? "/contas-a-receber/titulos" : "/contas-a-pagar/titulos";
  return `${base}?busca=${encodeURIComponent(m.id)}`;
}

/** Diz se o movimento casa com a busca e por quê — ou `null`. */
export function casar(
  m: RiskMovement,
  q: string,
  nomes: Record<string, string>,
): MotivoCasamento | null {
  const v = interpretarValor(q);
  if (v !== null && centavos(m.amount) === centavos(v)) return "valor";
  const t = semAcento(q.trim());
  if (t.length < MINIMO_TEXTO) return null;
  const has = (s: string | null | undefined) => !!s && semAcento(s).includes(t);
  if (has(m.referenceCode)) return "documento";
  if (has(m.party_id ? nomes[m.party_id] : null)) return "contraparte";
  if (has(m.descricao)) return "descricao";
  if (has(m.category)) return "categoria";
  if (semAcento(m.id).startsWith(t)) return "id";
  return null;
}

/**
 * Procura nos títulos e lançamentos. A ordem é: primeiro os que casam por
 * VALOR ou DOCUMENTO (a busca mais específica que existe), depois os abertos
 * antes dos liquidados, e dentro de cada grupo o vencimento mais recente.
 */
export function buscarTitulos(input: RiskInput, q: string, teto = TETO_TITULOS): ResultadoBusca {
  const nomes = input.partyNames ?? {};
  const valor = interpretarValor(q);
  const peso: Record<MotivoCasamento, number> = { valor: 0, documento: 0, id: 1, contraparte: 2, descricao: 2, categoria: 3 };
  const achados: ResultadoTitulo[] = [];
  for (const m of input.movements) {
    if (m.status === "cancelado") continue;
    const motivo = casar(m, q, nomes);
    if (!motivo) continue;
    achados.push({
      id: m.id,
      grupo: m.status === "pago" ? "lancamento" : "titulo",
      direcao: m.type === "entrada" ? "receber" : "pagar",
      contraparte: (m.party_id && nomes[m.party_id]) || m.category || "—",
      descricao: m.descricao ?? null,
      valor: Math.abs(m.amount),
      vencimento: (m.due_date ?? "").slice(0, 10),
      pagamento: m.paid_date ? m.paid_date.slice(0, 10) : null,
      motivo,
      rota: rotaDoTitulo(m),
    });
  }
  achados.sort((a, b) =>
    peso[a.motivo] - peso[b.motivo]
    || (a.grupo === b.grupo ? 0 : a.grupo === "titulo" ? -1 : 1)
    || b.vencimento.localeCompare(a.vencimento));
  return { itens: achados.slice(0, Math.max(0, teto)), total: achados.length, valor };
}
