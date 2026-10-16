/**
 * As preferências de cada pessoa nas sugestões da Quattro AI (etapa 4 da Home
 * adaptativa): as prioridades que ela marcou e quantas vezes clicou em cada
 * sugestão. Moram no estado da EMPRESA (`org_state`, chave
 * `a4p_home_preferencias`) num mapa `usuário → preferências` — seguem a pessoa
 * entre computadores, e cada empresa tem as suas.
 *
 * Este arquivo é a parte PURA: ler a entrada de um usuário sem confiar no que
 * veio do servidor, mesclar sem tocar nos colegas e decidir se pode enviar.
 * Quem fala com o servidor é `lib/home-preferencias`.
 *
 * ⚠️ O mapa é lido e regravado INTEIRO (`org_state` guarda um valor por
 * chave). Por isso duas travas: só se grava depois de o servidor RESPONDER
 * (gravar sobre um mapa que nunca veio de lá apagaria as entradas dos colegas)
 * e só com o usuário conhecido (sem ele, a preferência cairia num balde comum).
 */

import { mesmoLayout, normalizarLayout, type LayoutHome } from "./itens";

export interface PreferenciasHome {
  /** `null` = a pergunta do primeiro acesso nunca foi respondida; `[]` = "pulei". */
  interesses: string[] | null;
  /** id da sugestão → vezes clicada. */
  cliques: Record<string, number>;
  /**
   * id da sugestão → por quantos dias ela apareceu sem clique, e o último dia
   * (etapa 5: o que a pessoa ignora desce). Opcional: entrada gravada antes da
   * etapa 5 não tem, e ler sem ela é ler "nada ignorado".
   */
  exibidas?: Record<string, Exibicao>;
  /**
   * A ordem e o que está escondido entre os itens da Home (`./itens`), que a
   * pessoa arruma arrastando ou pedindo no chat. Ausente = o arranjo padrão.
   */
  layout?: LayoutHome | null;
  /**
   * Do que a pessoa mais pergunta no chat, por TEMA (caixa, folha, impostos…):
   * tema → vezes. Soma o clique numa pílula e a pergunta digitada que se
   * reconhece num tema (`core/home/rodizio`). É o "com o que ela se preocupa"
   * que faz o rodízio de pílulas puxar mais do mesmo assunto.
   */
  temas?: Record<string, number>;
  /**
   * Pílula do chat já respondida → o dia da resposta. Ela some do "Veja tudo
   * o que eu faço" e só volta depois de alguns dias (`DIAS_FORA_RESPONDIDA`).
   */
  respondidas?: Record<string, string>;
}

export interface Exibicao { dias: number; ultimo: string }

export type MapaPreferencias = Record<string, PreferenciasHome & { atualizadoEm?: string }>;

/** Teto de entradas guardadas (o catálogo tem 177 perguntas e 11 prioridades). */
const TETO_IDS = 240;
/** Teto de cliques por sugestão — o peso já para em 4; guardar mais não muda nada. */
const TETO_CLIQUES = 1000;

const idValido = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 60;
/** Teto de dias contados — o desconto para bem antes; guardar mais não muda nada. */
const TETO_DIAS = 365;
const dataValida = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);

function normalizarExibidas(bruto: unknown): Record<string, Exibicao> {
  const out: Record<string, Exibicao> = {};
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return out;
  for (const [id, e] of Object.entries(bruto as Record<string, unknown>).slice(0, TETO_IDS)) {
    if (!idValido(id) || !e || typeof e !== "object") continue;
    const { dias, ultimo } = e as { dias?: unknown; ultimo?: unknown };
    if (typeof dias !== "number" || !Number.isFinite(dias) || dias < 0 || !dataValida(ultimo)) continue;
    out[id] = { dias: Math.min(TETO_DIAS, Math.floor(dias)), ultimo };
  }
  return out;
}

function normalizarContagens(bruto: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return out;
  for (const [id, n] of Object.entries(bruto as Record<string, unknown>).slice(0, TETO_IDS)) {
    if (!idValido(id) || typeof n !== "number" || !Number.isFinite(n) || n < 1) continue;
    out[id] = Math.min(TETO_CLIQUES, Math.floor(n));
  }
  return out;
}

function normalizarRespondidas(bruto: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return out;
  for (const [id, d] of Object.entries(bruto as Record<string, unknown>).slice(0, TETO_IDS)) {
    if (idValido(id) && dataValida(d)) out[id] = d;
  }
  return out;
}

/**
 * Normaliza o que veio de fora (servidor, cache, versão antiga): interesses só
 * texto, sem repetir; cliques só contagens inteiras positivas. O que não serve
 * vira AUSENTE — `interesses: null` —, nunca "pulei", que esconderia para
 * sempre a pergunta do primeiro acesso.
 */
export function normalizarPreferencias(bruto: unknown): PreferenciasHome | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const b = bruto as { interesses?: unknown; cliques?: unknown };
  const interesses = Array.isArray(b.interesses)
    ? b.interesses.filter(idValido).filter((x, i, a) => a.indexOf(x) === i).slice(0, TETO_IDS)
    : null;
  const cliques = normalizarContagens(b.cliques);
  const o = bruto as { exibidas?: unknown; layout?: unknown; temas?: unknown; respondidas?: unknown };
  return {
    interesses, cliques,
    exibidas: normalizarExibidas(o.exibidas),
    layout: normalizarLayout(o.layout),
    temas: normalizarContagens(o.temas),
    respondidas: normalizarRespondidas(o.respondidas),
  };
}

/** A entrada de UM usuário no mapa, ou `null` se ele ainda não tem nenhuma. */
export function preferenciasDoUsuario(mapa: unknown, usuario: string | null): PreferenciasHome | null {
  if (!usuario || !mapa || typeof mapa !== "object" || Array.isArray(mapa)) return null;
  return normalizarPreferencias((mapa as Record<string, unknown>)[usuario]);
}

/** O mapa com a entrada deste usuário trocada — e SÓ ela: os colegas ficam como estavam. */
export function comPreferencias(mapa: unknown, usuario: string, p: PreferenciasHome, agora: string): MapaPreferencias {
  const base = mapa && typeof mapa === "object" && !Array.isArray(mapa) ? (mapa as MapaPreferencias) : {};
  return { ...base, [usuario]: { ...(normalizarPreferencias(p) ?? { interesses: null, cliques: {}, exibidas: {}, layout: null, temas: {}, respondidas: {} }), atualizadoEm: agora } };
}

/**
 * Pode enviar ao servidor? Só com o mapa CONFERIDO (o servidor respondeu nesta
 * sessão) e com o usuário identificado. Fora disso a preferência fica no
 * dispositivo e sobe na próxima conferência.
 */
export function podeEnviarPreferencias(conferido: boolean, usuario: string | null): boolean {
  return conferido && !!usuario && usuario !== "local";
}

/** As duas fontes concordam? (Evita regravar — e auditar — o que não mudou.) */
export function mesmasPreferencias(a: PreferenciasHome | null, b: PreferenciasHome | null): boolean {
  if (!a || !b) return a === b;
  const ia = a.interesses === null ? null : [...a.interesses].sort().join(",");
  const ib = b.interesses === null ? null : [...b.interesses].sort().join(",");
  if (ia !== ib) return false;
  const ka = Object.keys(a.cliques).sort(), kb = Object.keys(b.cliques).sort();
  if (ka.join(",") !== kb.join(",") || !ka.every((k) => a.cliques[k] === b.cliques[k])) return false;
  if (!mesmoLayout(a.layout, b.layout)) return false;
  if (!mesmoMapa(a.temas ?? {}, b.temas ?? {}) || !mesmoMapa(a.respondidas ?? {}, b.respondidas ?? {})) return false;
  const ea = a.exibidas ?? {}, eb = b.exibidas ?? {};
  const xa = Object.keys(ea).sort(), xb = Object.keys(eb).sort();
  return xa.join(",") === xb.join(",") && xa.every((k) => ea[k].dias === eb[k].dias && ea[k].ultimo === eb[k].ultimo);
}

function mesmoMapa(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.join(",") === kb.join(",") && ka.every((k) => a[k] === b[k]);
}

/**
 * Quando a mesma pessoa tem preferência no servidor E no dispositivo (a cópia
 * antiga, de antes da etapa 4), qual vale? O servidor — é a que acompanha a
 * pessoa —, com os cliques somados pelo MAIOR de cada lado (somar contaria
 * duas vezes o clique que já tinha subido). Prioridade que só o dispositivo
 * tem entra quando o servidor ainda não tem resposta nenhuma.
 */
export function mesclarComDispositivo(servidor: PreferenciasHome | null, dispositivo: PreferenciasHome | null): PreferenciasHome | null {
  if (!servidor) return dispositivo;
  if (!dispositivo) return servidor;
  const cliques: Record<string, number> = { ...servidor.cliques };
  for (const [id, n] of Object.entries(dispositivo.cliques)) cliques[id] = Math.max(cliques[id] ?? 0, n);
  // Exibição: vale a MAIS RECENTE de cada lado (ela já carrega o clique que
  // zerou a contagem); no mesmo dia, a de mais dias.
  const exibidas: Record<string, Exibicao> = { ...(servidor.exibidas ?? {}) };
  for (const [id, e] of Object.entries(dispositivo.exibidas ?? {})) {
    const s = exibidas[id];
    if (!s || e.ultimo > s.ultimo || (e.ultimo === s.ultimo && e.dias > s.dias)) exibidas[id] = e;
  }
  // O arranjo segue a regra das prioridades: o do servidor vence; o do
  // dispositivo só entra quando o servidor ainda não tem nenhum.
  // Temas: o MAIOR de cada lado (como os cliques). Respondidas: a data mais recente.
  const temas: Record<string, number> = { ...(servidor.temas ?? {}) };
  for (const [t, n] of Object.entries(dispositivo.temas ?? {})) temas[t] = Math.max(temas[t] ?? 0, n);
  const respondidas: Record<string, string> = { ...(servidor.respondidas ?? {}) };
  for (const [id, d] of Object.entries(dispositivo.respondidas ?? {})) if (!respondidas[id] || d > respondidas[id]) respondidas[id] = d;
  return { interesses: servidor.interesses ?? dispositivo.interesses, cliques, exibidas, layout: servidor.layout ?? dispositivo.layout ?? null, temas, respondidas };
}

/**
 * A Home mostrou estas sugestões HOJE. Cada uma ganha um dia de exibição sem
 * clique — uma vez por dia, por mais que a Home seja aberta (abrir dez vezes
 * não é ignorar dez vezes). Devolve o MESMO objeto quando nada muda, para quem
 * chama não regravar à toa.
 */
export function registrarExibicao(exibidas: Record<string, Exibicao> | undefined, ids: string[], hoje: string): Record<string, Exibicao> {
  const base = exibidas ?? {};
  if (!dataValida(hoje)) return base;
  let out: Record<string, Exibicao> | null = null;
  for (const id of ids) {
    if (!idValido(id) || base[id]?.ultimo === hoje) continue;
    out ??= { ...base };
    out[id] = { dias: Math.min(TETO_DIAS, (base[id]?.dias ?? 0) + 1), ultimo: hoje };
  }
  return out ?? base;
}

/** Clicou: a contagem de dias ignorados ZERA — e o dia de hoje não conta como ignorado. */
export function registrarClique(exibidas: Record<string, Exibicao> | undefined, id: string, hoje: string): Record<string, Exibicao> {
  const base = exibidas ?? {};
  if (!idValido(id) || !dataValida(hoje)) return base;
  return { ...base, [id]: { dias: 0, ultimo: hoje } };
}
