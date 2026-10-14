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

export interface PreferenciasHome {
  /** `null` = a pergunta do primeiro acesso nunca foi respondida; `[]` = "pulei". */
  interesses: string[] | null;
  /** id da sugestão → vezes clicada. */
  cliques: Record<string, number>;
}

export type MapaPreferencias = Record<string, PreferenciasHome & { atualizadoEm?: string }>;

/** Teto de entradas guardadas (o catálogo tem 47 perguntas e 11 prioridades). */
const TETO_IDS = 80;
/** Teto de cliques por sugestão — o peso já para em 4; guardar mais não muda nada. */
const TETO_CLIQUES = 1000;

const idValido = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 60;

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
  const cliques: Record<string, number> = {};
  if (b.cliques && typeof b.cliques === "object" && !Array.isArray(b.cliques)) {
    for (const [id, n] of Object.entries(b.cliques as Record<string, unknown>).slice(0, TETO_IDS)) {
      if (!idValido(id) || typeof n !== "number" || !Number.isFinite(n) || n < 1) continue;
      cliques[id] = Math.min(TETO_CLIQUES, Math.floor(n));
    }
  }
  return { interesses, cliques };
}

/** A entrada de UM usuário no mapa, ou `null` se ele ainda não tem nenhuma. */
export function preferenciasDoUsuario(mapa: unknown, usuario: string | null): PreferenciasHome | null {
  if (!usuario || !mapa || typeof mapa !== "object" || Array.isArray(mapa)) return null;
  return normalizarPreferencias((mapa as Record<string, unknown>)[usuario]);
}

/** O mapa com a entrada deste usuário trocada — e SÓ ela: os colegas ficam como estavam. */
export function comPreferencias(mapa: unknown, usuario: string, p: PreferenciasHome, agora: string): MapaPreferencias {
  const base = mapa && typeof mapa === "object" && !Array.isArray(mapa) ? (mapa as MapaPreferencias) : {};
  return { ...base, [usuario]: { ...(normalizarPreferencias(p) ?? { interesses: null, cliques: {} }), atualizadoEm: agora } };
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
  return ka.join(",") === kb.join(",") && ka.every((k) => a.cliques[k] === b.cliques[k]);
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
  return { interesses: servidor.interesses ?? dispositivo.interesses, cliques };
}
