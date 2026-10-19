/**
 * O RECORTE DE SEGUIMENTO: "meu fluxo de caixa dos últimos 3 meses" e, logo
 * depois, "e só a última semana?".
 *
 * O motor nativo responde uma pergunta por vez, sem memória: a segunda frase
 * não tem assunto nenhum, então não casava intenção e ia para a IA genérica,
 * que não devolvia o recorte. Aqui a pergunta curta que só troca o PERÍODO
 * herda o assunto da pergunta anterior: tira o período velho dela e põe o
 * novo, e o motor responde a pergunta inteira.
 *
 * ⚠️ Só herda quando a frase nova é SÓ período (mais palavras de ligação). Uma
 * pergunta com assunto próprio ("quanto gastei na última semana") é nova, e
 * herdar o assunto anterior responderia outra coisa.
 */
import { numerosPorExtenso } from "./engine";

const MESES = "janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";

/** As expressões de período que a janela do motor (`janela`) entende. */
const PERIODO = new RegExp([
  "\\bhoje\\b", "\\bontem\\b", "\\bamanh[ãa]\\b",
  "[úu]ltim[oa]s?\\s+(\\d+\\s+)?(dias?|semanas?|m[êe]s(es)?|anos?|trimestres?|semestres?|quinzenas?)",
  "[úu]ltimos sete dias",
  "semana (passada|anterior|que vem)", "pr[óo]xima semana",
  "m[êe]s (passado|anterior|atual|que vem)", "pr[óo]ximo m[êe]s",
  "(est[ea]|ess[ea]|nest[ea]|ness[ea])\\s+(semana|m[êe]s|ano|trimestre|semestre)",
  "\\bsemana\\b", "\\bm[êe]s\\b", "\\bquinzena\\b", "\\btrimestre\\b", "\\bsemestre\\b", "\\bano\\b", "12 meses",
  "\\b\\d+\\s+(dias|semanas|meses)\\b",
  `(${MESES})(\\s+de\\s+\\d{4})?`,
].join("|"), "gi");

/** O que sobra numa frase de seguimento além do período — nenhuma é assunto. */
const LIGACAO = new Set([
  "e", "agora", "só", "so", "apenas", "somente", "na", "no", "nos", "nas", "da", "do", "dos", "das", "de", "em",
  "para", "pra", "o", "a", "os", "as", "se", "recorte", "corte", "recorta", "filtra", "filtrar", "mostra", "mostre",
  "me", "quero", "ver", "veja", "mesmo", "mesma", "coisa", "isso", "então", "entao", "olhando", "período",
  "periodo", "janela", "faz", "faça", "faca", "refaz", "refaça", "novo", "também", "tambem", "mas", "quanto",
  "considerando", "sobre", "pelo", "pela", "com", "um", "uma", "cortando", "focando", "foca", "foque", "traz",
  "traga", "compara", "e?", "ok", "certo", "beleza", "valeu", "aí", "ai", "tá", "ta",
]);

function semPeriodo(texto: string): string {
  return numerosPorExtenso(texto.toLowerCase()).replace(PERIODO, " ");
}

/** O período escrito na frase, ou `null` quando ela não cita nenhum. */
export function periodoCitado(texto: string): string | null {
  const achados = numerosPorExtenso(texto.toLowerCase()).match(PERIODO);
  return achados?.length ? achados.join(" ") : null;
}

/** A frase só troca o período — não tem assunto próprio. */
export function ehSeguimentoDePeriodo(pergunta: string): boolean {
  if (!periodoCitado(pergunta)) return false;
  const resto = semPeriodo(pergunta).replace(/[?!.,;:]/g, " ").split(/\s+/).filter(Boolean);
  return resto.every((w) => LIGACAO.has(w));
}

/**
 * A pergunta que o motor responde: o assunto da anterior com o período da
 * nova. `null` quando não é seguimento ou não há pergunta anterior.
 */
export function perguntaComPeriodoNovo(anterior: string | undefined, pergunta: string): string | null {
  if (!anterior || !ehSeguimentoDePeriodo(pergunta)) return null;
  const periodo = periodoCitado(pergunta);
  const assunto = semPeriodo(anterior).replace(/[?!.]/g, " ").replace(/\b(d[oa]s?|n[oa]s?|em|de)\s*$/, "").replace(/\s+/g, " ").trim();
  if (!assunto || !periodo) return null;
  return `${assunto} ${periodo}`;
}
