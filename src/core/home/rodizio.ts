/**
 * O RODÍZIO DAS PÍLULAS DO CHAT (16/10/2026, pedido do dono).
 *
 * "Veja tudo o que eu faço", no chat da Quattro AI, mostrava sempre as mesmas
 * doze pílulas. Agora ele é um rodízio sobre o catálogo inteiro (as 47 da Home
 * e as 130 do banco ampliado, `./banco-sugestoes`), com três regras:
 *
 *  1. A pílula RESPONDIDA some — na conversa e por `DIAS_FORA_RESPONDIDA` dias
 *     depois dela. Mostrar de novo o que acabou de ser respondido é gastar a
 *     vaga de uma pergunta que a pessoa ainda não conhece.
 *  2. A lista MUDA a cada resposta: cada rodada sorteia de novo (sorteio
 *     determinístico por rodada e dia — a mesma rodada desenha a mesma lista,
 *     então nada troca de lugar diante de quem está olhando) e a pílula que
 *     estava na tela perde um pouco de peso, para a próxima trazer novidade.
 *  3. A lista APRENDE: o tema que a pessoa mais pergunta (pílula clicada ou
 *     pergunta digitada que se reconhece num tema), as prioridades que ela
 *     marcou na Home e o assunto da última pergunta puxam mais do mesmo
 *     assunto. Os sinais da Home (o que está urgente hoje) entram como
 *     `prioridade`.
 *
 * ⚠️ O rodízio só ESCOLHE ids do catálogo — nunca escreve pergunta. O teto de
 * três por tema mantém a variedade: doze pílulas não podem virar doze jeitos
 * de perguntar sobre o caixa, por mais que a pessoa só pergunte do caixa.
 *
 * Puro, tipado, sem relógio (o dia vem de `hoje`).
 */

import { CATALOGO_SUGESTOES, INTERESSES, ROTULOS, type Sugestao, type TemaSugestao } from "./sugestoes";

export const RODIZIO_VERSION = "rodizio/1.0.0";

/** Quantas pílulas o "Veja tudo o que eu faço" mostra. */
export const PILULAS_NO_CHAT = 12;
/** No máximo três do mesmo tema na tela. */
export const MAX_POR_TEMA_CHAT = 3;
/** Por quantos dias a pílula respondida fica fora do rodízio. */
export const DIAS_FORA_RESPONDIDA = 3;

/** Pesos do placar. A variedade (`PESO_SORTEIO`) é da ordem do aprendizado: as duas coisas valem. */
const PESO_AFINIDADE = 2;
const PESO_INTERESSE = 0.8;
const PESO_PRIORIDADE = 1.6;
const PESO_CLIQUE = 0.3;
const TETO_CLIQUES = 4;
const PESO_ULTIMO_TEMA = 1.2;
const PESO_SORTEIO = 1.6;
const PENALIDADE_ANTERIOR = 0.9;

export interface EntradaRodizio {
  tipoConta: "empresa" | "pessoal";
  hoje: string;
  /** As sugestões do contexto de hoje (a Home manda as suas), na ordem dela. */
  prioridade?: string[];
  cliques?: Record<string, number>;
  /** tema → vezes perguntado. */
  temas?: Record<string, number>;
  interesses?: string[] | null;
  /** Respondidas antes (id → dia). */
  respondidas?: Record<string, string>;
  /** Respondidas NESTA conversa — fora, sempre. */
  respondidasAgora?: string[];
  /** As que estavam na tela na rodada anterior: perdem peso, para a lista mudar. */
  anteriores?: string[];
  /** Cresce a cada resposta; muda o sorteio. */
  rodada: number;
  /** O tema da última pergunta: puxa perguntas do mesmo assunto. */
  ultimoTema?: TemaSugestao | null;
  limite?: number;
}

export interface Pilula {
  id: string;
  texto: string;
  curto: string;
  icone: string;
  tema: TemaSugestao;
  motivo: string;
}

const NOME_TEMA: Record<TemaSugestao, string> = {
  fechamento: "fechamento", caixa: "caixa", despesa: "despesas", receber: "recebimentos", pagar: "pagamentos",
  recorrencia: "receita recorrente", vendas: "vendas", inicio: "primeiros passos", pessoal: "suas finanças",
  contabil: "resultado e contabilidade", impostos: "impostos", folha: "folha", simulacao: "simulações",
  risco: "risco", operacao: "operação",
};

/** Hash FNV-1a em [0, 1): o sorteio repetível de cada rodada. */
function sorteio(chave: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < chave.length; i++) {
    h ^= chave.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4_294_967_296;
}

const diasEntre = (de: string, ate: string): number | null => {
  const ok = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x);
  if (!ok(de) || !ok(ate)) return null;
  const t = (x: string) => Date.UTC(Number(x.slice(0, 4)), Number(x.slice(5, 7)) - 1, Number(x.slice(8, 10)));
  return Math.round((t(ate) - t(de)) / 86_400_000);
};

/** Respondida há menos de `DIAS_FORA_RESPONDIDA` dias? (Data ilegível não exclui nada.) */
export function respondidaRecente(dia: string | undefined, hoje: string): boolean {
  if (!dia) return false;
  const d = diasEntre(dia, hoje);
  return d !== null && d >= 0 && d < DIAS_FORA_RESPONDIDA;
}

/** Quanto a pessoa pergunta de cada tema: os temas contados + os cliques das pílulas do tema. */
export function afinidadePorTema(e: Pick<EntradaRodizio, "tipoConta" | "cliques" | "temas">): Map<TemaSugestao, number> {
  const out = new Map<TemaSugestao, number>();
  for (const [t, n] of Object.entries(e.temas ?? {})) out.set(t as TemaSugestao, (out.get(t as TemaSugestao) ?? 0) + n);
  for (const [id, n] of Object.entries(e.cliques ?? {})) {
    const c = CATALOGO_SUGESTOES.find((x) => x.id === id && x.publico === e.tipoConta);
    if (c) out.set(c.tema, (out.get(c.tema) ?? 0) + n);
  }
  return out;
}

/**
 * As pílulas desta rodada. Nunca devolve repetida, respondida nesta conversa
 * ou respondida há pouco; respeita o teto por tema e só completa além dele
 * quando o público não tem variedade suficiente.
 */
export function girarPilulas(e: EntradaRodizio): Pilula[] {
  const limite = e.limite ?? PILULAS_NO_CHAT;
  const agora = new Set(e.respondidasAgora ?? []);
  const anteriores = new Set(e.anteriores ?? []);
  const prioridade = e.prioridade ?? [];
  const afinidade = afinidadePorTema(e);
  const maior = Math.max(1, ...Array.from(afinidade.values()));
  const marcadas = new Set(
    INTERESSES.filter((i) => i.publico === e.tipoConta && e.interesses?.includes(i.id)).flatMap((i) => i.sugestoes),
  );
  const temasMarcados = new Set(
    CATALOGO_SUGESTOES.filter((c) => marcadas.has(c.id)).map((c) => c.tema),
  );

  const candidatas = CATALOGO_SUGESTOES
    .filter((c) => c.publico === e.tipoConta)
    .filter((c) => !agora.has(c.id) && !respondidaRecente(e.respondidas?.[c.id], e.hoje));

  const avaliadas = candidatas.map((c) => {
    const motivos: [number, string][] = [];
    const af = afinidade.get(c.tema) ?? 0;
    if (af > 0) motivos.push([PESO_AFINIDADE * (af / maior), `você pergunta bastante sobre ${NOME_TEMA[c.tema]}`]);
    if (marcadas.has(c.id)) motivos.push([PESO_INTERESSE, "você marcou este assunto como prioridade"]);
    else if (temasMarcados.has(c.tema)) motivos.push([PESO_INTERESSE / 2, "é do assunto que você marcou como prioridade"]);
    const ip = prioridade.indexOf(c.id);
    if (ip >= 0) motivos.push([PESO_PRIORIDADE * (1 - ip / Math.max(1, prioridade.length)), "os seus números de hoje pedem atenção aqui"]);
    const vezes = Math.min(TETO_CLIQUES, e.cliques?.[c.id] ?? 0);
    if (vezes > 0) motivos.push([PESO_CLIQUE * vezes, "você costuma perguntar isto"]);
    if (e.ultimoTema && c.tema === e.ultimoTema) motivos.push([PESO_ULTIMO_TEMA, "segue o assunto da sua última pergunta"]);
    motivos.sort((a, b) => b[0] - a[0]);
    const pontos = motivos.reduce((t, [p]) => t + p, 0)
      + PESO_SORTEIO * sorteio(`${c.id}|${e.rodada}|${e.hoje}`)
      - (anteriores.has(c.id) ? PENALIDADE_ANTERIOR : 0);
    return { c, pontos, motivo: motivos[0]?.[1] ?? "para você conhecer o que eu faço" };
  }).sort((a, b) => b.pontos - a.pontos || a.c.id.localeCompare(b.c.id));

  const out: typeof avaliadas = [];
  const porTema = new Map<TemaSugestao, number>();
  for (const a of avaliadas) {
    if (out.length >= limite) break;
    const k = porTema.get(a.c.tema) ?? 0;
    if (k >= MAX_POR_TEMA_CHAT) continue;
    porTema.set(a.c.tema, k + 1);
    out.push(a);
  }
  for (const a of avaliadas) {
    if (out.length >= limite) break;
    if (!out.includes(a)) out.push(a);
  }
  return out.map(({ c, motivo }) => paraPilula(c, motivo));
}

function paraPilula(c: Sugestao, motivo: string): Pilula {
  const r = ROTULOS[c.id] ?? { curto: c.texto, icone: "sparkles" };
  return { id: c.id, texto: c.texto, curto: r.curto, icone: r.icone, tema: c.tema, motivo };
}

/* ------------------------------ a pergunta digitada ------------------------------ */

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * O tema de uma pergunta DIGITADA. ⚠️ A ordem é regra: o mais específico
 * primeiro — "imposto da folha" é folha antes de ser imposto, e "caixa"
 * aparece em quase toda pergunta, então fica por último.
 */
const TEMAS_DO_TEXTO: [TemaSugestao, RegExp][] = [
  ["folha", /\b(folha|salari\w*|funcionari\w*|clt|pj\b|ferias|13o?|decimo|rescis\w*|fgts|contrat(ar|acao))/],
  ["impostos", /\b(impost\w*|tribut\w*|simples nacional|das\b|darf|iss\b|icms|pis\b|cofins|irpj|csll|nota fiscal|notas fiscais|nf-?e|nfs-?e)/],
  ["simulacao", /\b(simul\w*|e se\b|posso comprar|financ\w*|parcela de|preco|precific\w*|rende|render|investir|juros compostos)/],
  ["risco", /\b(risco|ruptura|score|liquidez|chance|aperto|monte carlo|setor)/],
  ["recorrencia", /\b(mrr|arr\b|assinant\w*|assinatura|recorren\w*|churn|cancelament\w*|contrato)/],
  ["receber", /\b(receber|recebi\w*|recebiment\w*|cobr\w*|inadimpl\w*|devendo|deve\b|devem|boleto emitido|vencid)/],
  ["pagar", /\b(pagar|paguei|pagament\w*|fornecedor\w*|compra\w*|boleto|dda|reembols\w*|fatura)/],
  ["vendas", /\b(vend\w*|fatur\w*|cliente\w*|ticket|ltv|cac|maquininha|chargeback)/],
  ["contabil", /\b(dre|ebitda|margem|lucro|prejuizo|balanco|dfc|razao|contador|contabil\w*|resultado|equilibrio)/],
  ["fechamento", /\b(fech\w*|concili\w*|competencia|provis\w*|duplicad\w*)/],
  ["despesa", /\b(gast\w*|despesa\w*|custo\w*|economiz\w*|cortar|burn|aluguel|tarifa\w*|orcament\w*)/],
  ["operacao", /\b(automac\w*|open finance|conectar|regra\w*|painel|plano de contas|importar|extrato)/],
  ["caixa", /\b(caixa|saldo|runway|aguent\w*|fluxo|entrou|saiu|conta bancaria)/],
];

export function temaDaPergunta(texto: string): TemaSugestao | null {
  const t = semAcento(texto);
  for (const [tema, re] of TEMAS_DO_TEXTO) if (re.test(t)) return tema;
  return null;
}

/** O id da pílula cuja pergunta é exatamente esta (digitada ou colada), no público certo. */
export function pilulaDaPergunta(texto: string, publico: "empresa" | "pessoal"): string | null {
  const t = semAcento(texto).replace(/[?.!\s]+$/g, "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const c = CATALOGO_SUGESTOES.find((x) => x.publico === publico && semAcento(x.texto).replace(/[?.!\s]+$/g, "") === t);
  return c?.id ?? null;
}
