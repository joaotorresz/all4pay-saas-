/**
 * O LANÇAMENTO DITO NA CONVERSA: "gastei 100 reais de gasolina", falado no
 * microfone ou digitado, vira uma PROPOSTA de lançamento — tipo, valor, data,
 * descrição e a categoria sugerida. Puro, sem I/O e sem relógio (`hoje` entra).
 *
 * ⚠️ Isto PROPÕE, não grava. A conversa mostra a proposta com a categoria
 * escolhida e só o botão "Confirmar" leva ao escritor único
 * (`confirmarDocumento`). Uma frase mal transcrita que gravasse sozinha
 * colocaria no caixa um valor que ninguém disse.
 *
 * ⚠️ Pergunta não é lançamento: "quanto gastei de gasolina?" fica com o motor
 * de respostas. Só entra aqui a frase AFIRMATIVA com verbo de fato
 * (gastei, paguei, recebi) ou de compromisso (vou pagar, tenho que pagar).
 */
import { classificar, CATEGORIAS_TODAS } from "@/core/ingestao/taxonomia";

export interface PropostaFalada {
  tipo: "entrada" | "saida";
  /** Já aconteceu (gastei, recebi) ou ainda vai acontecer (vou pagar). */
  pago: boolean;
  valor: number;
  /** ISO: o dia em que aconteceu, ou o vencimento quando ainda vai acontecer. */
  data: string;
  descricao: string;
  categoria: string;
  /** 0..1 — da classificação; abaixo de 0.6 a conversa pede para conferir. */
  confianca: number;
}

const PERGUNTA = /^(quanto|qual|quais|quando|onde|como|por que|porque|o que|quem|ser[áa]|posso|consigo|devo|me (mostra|diz|fala))\b/;
const FATO_SAIDA = /\b(gastei|paguei|comprei|torrei|desembolsei|saiu|sa[íi]ram|abasteci)\b/;
const FATO_ENTRADA = /\b(recebi|entrou|entraram|vendi|faturei|caiu)\b/;
const COMPROMISSO_SAIDA = /\b(vou pagar|tenho que pagar|preciso pagar|devo pagar|agend(a|ar|e)|lan[çc]a(r)? (uma )?(conta|despesa)|anota(r)? (uma )?(conta|despesa))\b/;
const COMPROMISSO_ENTRADA = /\b(vou receber|tenho a receber|lan[çc]a(r)? (uma )?receita|anota(r)? (uma )?receita)\b/;

const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Os valores escritos na frase, na ordem. "25, 25 não, vai, 100" → só o 100. */
function valorDaFrase(p: string): number | null {
  const re = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(mil\b)?(\s*(?:reais|real|conto|pila))?/g;
  const achados: { v: number; fim: number; temMoeda: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(p))) {
    const antes = p.slice(Math.max(0, m.index - 5), m.index);
    // "dia 10", "10/11" e "12x" não são valor.
    if (/\bdia\s*$/.test(antes) || /^\d+\s*[\/x]/.test(p.slice(m.index)) || /\/\s*$/.test(antes)) continue;
    let v = Number(m[1].replace(/\./g, "")) + (m[2] ? Number(m[2].padEnd(2, "0")) / 100 : 0);
    if (m[3]) v *= 1000;
    achados.push({ v, fim: m.index + m[0].length, temMoeda: /r\$/.test(m[0]) || !!m[4] });
  }
  // Correção falada: o valor seguido de "não" foi desdito.
  const validos = achados.filter((a) => !/^\s*,?\s*(n[ãa]o|nada|errei)\b/.test(p.slice(a.fim)));
  const ult = validos[validos.length - 1];
  return ult && ult.v > 0 ? Math.round(ult.v * 100) / 100 : null;
}

function dataDaFrase(p: string, hoje: string, futuro: boolean): string {
  if (/\banteontem\b/.test(p)) return somaDias(hoje, -2);
  if (/\bontem\b/.test(p)) return somaDias(hoje, -1);
  if (/\bamanh[ãa]\b/.test(p)) return somaDias(hoje, 1);
  const dm = p.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (dm) {
    const ano = dm[3] ? (dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : hoje.slice(0, 4);
    return `${ano}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
  }
  const dia = p.match(/\bdia (\d{1,2})\b/);
  if (dia) {
    const d = Number(dia[1]);
    const [a, mes] = hoje.split("-").map(Number);
    // Dia 31 num mês de 30 vira o último dia — nunca o 1º do mês seguinte.
    const noMes = (ano: number, m: number) => {
      const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
      return `${ano}-${String(m).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
    };
    const mesmo = noMes(a, mes);
    // O dia citado já passou neste mês: no futuro é o do mês que vem; no passado, este.
    if (futuro && mesmo < hoje) return mes === 12 ? noMes(a + 1, 1) : noMes(a, mes + 1);
    if (!futuro && mesmo > hoje) return mes === 1 ? noMes(a - 1, 12) : noMes(a, mes - 1);
    return mesmo;
  }
  return hoje;
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** O que foi: as palavras depois de "de/com/em/no/na", sem valor nem data. */
function descricaoDaFrase(p: string): string {
  const limpo = p
    .replace(/\bdia \d{1,2}\b|\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ")
    .replace(/(?:r\$\s*)?\d[\d.,]*\s*(mil\b)?\s*(reais|real|conto|pila)?/g, " ")
    .replace(/\b(hoje|ontem|anteontem|amanh[ãa]|n[ãa]o|vai|ok|tipo|tá|ta|né|ne)\b/g, " ")
    .replace(/[,.;!]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const m = limpo.match(/\b(?:de|do|da|dos|das|com|em|no|na|pro|pra|para o|para a|ao|à)\s+(.+)$/);
  let d = (m ? m[1] : limpo)
    .replace(FATO_SAIDA, "").replace(FATO_ENTRADA, "").replace(COMPROMISSO_SAIDA, "").replace(COMPROMISSO_ENTRADA, "")
    .trim()
    .replace(/^(de|do|da|dos|das|com|em|no|na|o|a|os|as|um|uma)\s+/, "")
    .replace(/\s+(de|do|da|com|em|no|na|para|pra|pro)$/, "")
    .replace(/\s+(como|tipo)\s+/g, " · ")
    .replace(/\s+/g, " ")
    .trim();
  return d ? d.charAt(0).toUpperCase() + d.slice(1) : "";
}

/** A frase é um lançamento? Devolve a proposta, ou `null` para seguir como pergunta. */
export function interpretarLancamento(frase: string, hoje: string): PropostaFalada | null {
  const p = frase.toLowerCase().trim();
  if (!p || p.endsWith("?") || PERGUNTA.test(p)) return null;
  const compSai = COMPROMISSO_SAIDA.test(p), compEnt = COMPROMISSO_ENTRADA.test(p);
  const fatoSai = FATO_SAIDA.test(p), fatoEnt = FATO_ENTRADA.test(p);
  if (!compSai && !compEnt && !fatoSai && !fatoEnt) return null;
  const valor = valorDaFrase(p);
  if (valor == null) return null;

  const tipo: "entrada" | "saida" = compEnt || (fatoEnt && !fatoSai && !compSai) ? "entrada" : "saida";
  const pago = !(compSai || compEnt);
  const data = dataDaFrase(p, hoje, !pago);
  const descricao = descricaoDaFrase(p);
  const c = classificar(sem(`${descricao} ${p}`), tipo);
  // Sem descrição ("abasteci 80 reais"), o nome da categoria descreve o gasto.
  return { tipo, pago, valor, data, descricao: descricao || c.categoria, categoria: c.categoria, confianca: c.confianca };
}

/** As categorias que a conversa oferece para trocar, do lado certo. */
export function categoriasDoLado(tipo: "entrada" | "saida"): string[] {
  return CATEGORIAS_TODAS
    .filter((c) => (tipo === "entrada" ? c.natureza === "receita" : c.natureza !== "receita" && c.natureza !== "transferencia"))
    .map((c) => c.id);
}
