/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O FLUXO PELA CONVERSA — o pedido em português vira um fluxo
 * (automacoes-pedido/1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Toda segunda às 8h me manda no WhatsApp o que tenho a pagar na semana"
 * vira uma PROPOSTA (dias, hora, fonte, canal, destinatários) e a proposta
 * vira o MESMO `Fluxo` que a tela de cards edita (`./fluxo`). A conversa não
 * tem um segundo caminho de criação: ela só preenche as peças.
 *
 * Duas leituras, o mesmo contrato:
 * - `interpretarPedidoFluxo` — as REGRAS, sem rede. É o que vale sem a chave
 *   da IA, sem sessão ou com erro.
 * - a Quattro AI (`/api/ai/automacao`) devolve uma proposta em JSON, e ela só
 *   entra pelo `normalizarProposta`: fonte fora do catálogo, dia fora de 0–6,
 *   hora torta e canal desconhecido SAEM. A IA escolhe peças; não inventa.
 *
 * ⚠️ O fluxo criado pela conversa nasce DESLIGADO, como os modelos: mensagem
 * que sai da empresa é decisão de alguém, e quem decide é o interruptor.
 *
 * ⚠️ Puro: sem relógio, sem banco. Quem é "eu" (o telefone de quem conversa)
 * entra por parâmetro.
 */
import {
  FONTES_FLUXO, NOME_CANAL, descreverGatilho,
  type DestinoEnvio, type DiaSemana, type FonteFluxo, type Fluxo,
} from "./fluxo";
import type { CanalEnvio } from "./tipos";

export const PEDIDO_VERSION = "automacoes-pedido/1.0.0";

/** O que se sabe até agora. Campo ausente = a conversa ainda não disse. */
export interface PropostaFluxo {
  fonte?: FonteFluxo;
  dias?: DiaSemana[];
  hora?: string;
  canal?: CanalEnvio;
  destinos: DestinoEnvio[];
  /** "me manda", "pra mim": quem conversa também recebe. */
  paraMim?: boolean;
  /** Pediu para mandar à base de clientes — o fluxo ainda não faz isso. */
  paraClientes?: boolean;
  nome?: string;
}

export const PROPOSTA_VAZIA: PropostaFluxo = { destinos: [] };

/* ========================================================================== */
/* Ler o texto — as regras                                                     */
/* ========================================================================== */

/** Minúsculas e sem acento: "Terça" e "terca" são o mesmo dia. */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const DIA_POR_NOME: [RegExp, DiaSemana][] = [
  [/\bdomingos?\b/, 0],
  [/\bsegundas?(-feiras?)?\b/, 1],
  [/\btercas?(-feiras?)?\b/, 2],
  [/\bquartas?(-feiras?)?\b/, 3],
  [/\bquintas?(-feiras?)?\b/, 4],
  [/\bsextas?(-feiras?)?\b/, 5],
  [/\bsabados?\b/, 6],
];
const NOME_DO_DIA = "(domingo|segunda|terca|quarta|quinta|sexta|sabado)";
const NUMERO_DO_DIA: Record<string, DiaSemana> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

/** Os dias do pedido, ou `undefined` quando ele não fala de dia. */
export function lerDias(t: string): DiaSemana[] | undefined {
  if (/\b(todo dia|todos os dias|diariamente|diario|diaria|cada dia|toda noite|todas as noites|toda manha|todas as manhas|fim de cada dia|final de cada dia)\b/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  if (/\bdias? uteis\b/.test(t)) return [1, 2, 3, 4, 5];
  if (/\b(fim|fins|finais) de semana\b/.test(t)) return [0, 6];
  // "de segunda a sexta", "segunda a quinta": um intervalo, não dois dias.
  const faixa = t.match(new RegExp(`\\b(?:de |da )?${NOME_DO_DIA}(?:-feira)? (?:a|ate) (?:a )?${NOME_DO_DIA}\\b`));
  if (faixa) {
    const a = NUMERO_DO_DIA[faixa[1]];
    const b = NUMERO_DO_DIA[faixa[2]];
    const dias: DiaSemana[] = [];
    for (let d = a; ; d = ((d + 1) % 7) as DiaSemana) { dias.push(d); if (d === b || dias.length > 7) break; }
    return dias;
  }
  const dias = DIA_POR_NOME.filter(([re]) => re.test(t)).map(([, d]) => d);
  return dias.length ? dias : undefined;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A hora do pedido em "HH:MM", ou `undefined`. "8h", "8h30", "19:00", "às 7 da noite", "meio-dia". */
export function lerHora(t: string): string | undefined {
  if (/\bmeio[- ]dia\b/.test(t)) return "12:00";
  if (/\bmeia[- ]noite\b/.test(t)) return "00:00";
  const m =
    t.match(/\b(\d{1,2})\s*(?:h|:|hs|horas?)\s*(\d{2})?\b(?:\s*(?:min(?:utos)?)?)?/) ??
    t.match(/\bas (\d{1,2})(?!\d|\/|[.,]\d)\b/);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const resto = t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 16);
  if (/^\s*(da|de) (tarde|noite)/.test(resto) && h >= 1 && h < 12) h += 12;
  if (/^\s*(da|de) manha/.test(resto) && h === 12) h = 0;
  if (h > 23 || min > 59) return undefined;
  return `${pad(h)}:${pad(min)}`;
}

/** A fonte do pedido. A ordem decide: maquininha é mais específica que "vendas". */
export function lerFonte(t: string): FonteFluxo | undefined {
  if (/\b(maquininha|maquina de cartao|pos|pinbank|debito|credito|bandeiras?|vendas? (no|do|de) cartao|passou no cartao|vendi (hoje|no dia))\b/.test(t)) return "maquininha_dia";
  if (/\b(contas? a pagar|pagamentos?|o que (eu )?tenho (a|que|pra|para) pagar|vencimentos?|vence|vencem|boletos?|fornecedores?|despesas? da semana|a pagar)\b/.test(t)) return "contas_pagar_semana";
  if (/\bvendas?\b/.test(t)) return "maquininha_dia";
  return undefined;
}

const TELEFONE = /(?:\+?55[\s-]?)?\(?\b\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}\b/g;
const EMAIL = /[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}/gi;

/** Telefones e e-mails escritos no pedido (no texto ORIGINAL, sem normalizar). */
export function lerDestinos(original: string): { telefones: string[]; emails: string[] } {
  const emails = Array.from(new Set((original.match(EMAIL) ?? []).map((e) => e.trim())));
  const semEmail = original.replace(EMAIL, " ");
  const telefones = Array.from(new Set((semEmail.match(TELEFONE) ?? []).map((t) => t.trim())))
    .filter((t) => t.replace(/\D/g, "").length >= 10);
  return { telefones, emails };
}

/** Lê um pedido (ou uma resposta curta da conversa) com as regras. */
export function interpretarPedidoFluxo(texto: string): PropostaFluxo {
  const t = normalizar(texto);
  const { telefones, emails } = lerDestinos(texto);
  const querEmail = /\b(e-?mail|email)\b/.test(t) || (emails.length > 0 && telefones.length === 0 && !/\bwhats/.test(t));
  const canal: CanalEnvio | undefined = querEmail ? "email" : /\b(whats|zap|wpp|whatsapp|celular)\b/.test(t) || telefones.length ? "whatsapp" : undefined;
  const enderecos = canal === "email" ? emails : telefones;
  return {
    fonte: lerFonte(t),
    dias: lerDias(t),
    hora: lerHora(t),
    canal,
    destinos: enderecos.map((endereco) => ({ endereco })),
    paraMim: /\b(pra mim|para mim|me (mand|avis|envi|notifi|lembr)\w*|(mand|envi|avis)\w*-me|meu (whats\w*|celular|numero|telefone|zap|e-?mail))\b/.test(t) || undefined,
    paraClientes: /\b(meus clientes|para os clientes|pros clientes|aos clientes|base de clientes|minha base|todos os clientes)\b/.test(t) || undefined,
  };
}

/**
 * Este texto PEDE uma automação? É a porta do chat geral para a tela de
 * Automações. ⚠️ Conservadora de propósito: "quanto vou pagar na segunda?" é
 * PERGUNTA sobre número e tem de continuar no motor de respostas. Exige o
 * pedido de AGENDAR um envio (verbo de envio + quando) ou a palavra automação
 * com um verbo de criar.
 */
export function ehPedidoDeAutomacao(texto: string): boolean {
  const t = normalizar(texto);
  if (/\b(cri\w+|mont\w+|configur\w+|faz\w*|quero|preciso de|nova|novo|ligar?|program\w+) (uma |um |a |o )?(automac\w+|fluxo de automac\w+|alerta automatico|lembrete automatico|rotina automatica)\b/.test(t)) return true;
  const enviar = /\b(me (mand|envi|avis|notifi|lembr)\w*|(mand|envi|dispar|avis|notifi)\w*|quero receber|gostaria de receber)\b/.test(t);
  const quando = lerDias(t) !== undefined || /\b(toda|todo|todas|todos) (as |os )?(semana|segunda|terca|quarta|quinta|sexta|sabado|domingo|dia|manha|noite|tarde)/.test(t);
  const hora = lerHora(t) !== undefined;
  const meio = /\b(whats\w*|zap|wpp|e-?mail|mensagem|relatorio|resumo|projecao)\b/.test(t);
  return enviar && quando && (hora || meio);
}

/* ========================================================================== */
/* A resposta da IA — só entra o que passa aqui                                */
/* ========================================================================== */

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TETO_DESTINOS = 10;

/** A proposta vinda de fora (a IA). O que não é do catálogo SAI, calado. */
export function normalizarProposta(x: unknown): PropostaFluxo {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const fonte = typeof o.fonte === "string" && o.fonte in FONTES_FLUXO ? (o.fonte as FonteFluxo) : undefined;
  const dias = Array.isArray(o.dias)
    ? Array.from(new Set(o.dias.filter((d): d is DiaSemana => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))).sort((a, b) => a - b)
    : [];
  const hora = typeof o.hora === "string" && HORA.test(o.hora) ? o.hora : undefined;
  const canal = o.canal === "whatsapp" || o.canal === "email" ? o.canal : undefined;
  const destinos = Array.isArray(o.destinos)
    ? o.destinos
        .map((d) => (typeof d === "string" ? d : d && typeof d === "object" ? (d as { endereco?: unknown }).endereco : null))
        .filter((e): e is string => typeof e === "string" && e.trim().length > 0 && e.length <= 120)
        .slice(0, TETO_DESTINOS)
        .map((endereco) => ({ endereco: endereco.trim() }))
    : [];
  const nome = typeof o.nome === "string" ? o.nome.replace(/\s+/g, " ").trim().slice(0, 80) || undefined : undefined;
  return {
    fonte,
    dias: dias.length ? dias : undefined,
    hora,
    canal,
    destinos,
    paraMim: o.paraMim === true || undefined,
    paraClientes: o.paraClientes === true || undefined,
    nome,
  };
}

/** A resposta nova soma à que já se tinha: o que ela não diz, fica. */
export function mesclarProposta(atual: PropostaFluxo, nova: PropostaFluxo): PropostaFluxo {
  const destinos = [...atual.destinos];
  for (const d of nova.destinos) if (!destinos.some((x) => x.endereco === d.endereco)) destinos.push(d);
  return {
    fonte: nova.fonte ?? atual.fonte,
    dias: nova.dias ?? atual.dias,
    hora: nova.hora ?? atual.hora,
    canal: nova.canal ?? atual.canal,
    destinos: destinos.slice(0, TETO_DESTINOS),
    paraMim: nova.paraMim ?? atual.paraMim,
    paraClientes: nova.paraClientes ?? atual.paraClientes,
    nome: nova.nome ?? atual.nome,
  };
}

/* ========================================================================== */
/* Da proposta ao fluxo                                                        */
/* ========================================================================== */

export type Falta = "fonte" | "quando" | "destino";

/** "eu" = quem conversa, com o telefone e o e-mail que a conta conhece. */
export interface QuemConversa {
  userId?: string;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
}

/** Os destinatários finais: os escritos + "eu", quando pedido e conhecido. */
export function destinosDaProposta(p: PropostaFluxo, eu?: QuemConversa): DestinoEnvio[] {
  const canal = p.canal ?? "whatsapp";
  const lista = [...p.destinos];
  const meu = canal === "email" ? eu?.email : eu?.telefone;
  // Sem número escrito, "me manda" é "manda para mim".
  const incluirEu = p.paraMim || (lista.length === 0 && !p.paraClientes);
  if (incluirEu && meu && !lista.some((d) => d.endereco === meu)) {
    lista.unshift({ endereco: meu, nome: eu?.nome ?? null, ...(eu?.userId ? { userId: eu.userId } : {}) });
  }
  return lista;
}

/** O que ainda falta perguntar, na ordem em que se pergunta. */
export function faltaNaProposta(p: PropostaFluxo, eu?: QuemConversa): Falta[] {
  const f: Falta[] = [];
  if (!p.fonte) f.push("fonte");
  if (!p.dias || !p.hora) f.push("quando");
  if (destinosDaProposta(p, eu).length === 0) f.push("destino");
  return f;
}

export const PERGUNTA: Record<Falta, string> = {
  fonte: "O que a mensagem deve contar? Por enquanto sei mandar as contas a pagar da semana ou as vendas da maquininha no dia.",
  quando: "Em que dias e a que horas? Por exemplo: toda segunda às 8h, ou todo dia às 19h.",
  destino: "Para qual número de WhatsApp eu mando? Escreva com DDD.",
};

/**
 * Monta o fluxo (desligado) com o que a proposta tem. Só se monta com a fonte
 * e o quando: sem eles não há corrente. Destinatário faltando NÃO impede —
 * o card de envio nasce vazio e a tela diz o que falta para ligar.
 */
export function fluxoDaProposta(p: PropostaFluxo, id: string, eu?: QuemConversa): Fluxo | null {
  if (!p.fonte || !p.dias || !p.dias.length || !p.hora) return null;
  const canal = p.canal ?? "whatsapp";
  const envioId = `envio-${canal}`;
  const gatilho = { tipo: "agenda" as const, dias: Array.from(new Set(p.dias)).sort((a, b) => a - b) as DiaSemana[], hora: p.hora };
  return {
    id,
    nome: p.nome ?? FONTES_FLUXO[p.fonte].nome,
    ativo: false,
    nos: [
      { id: "gatilho", tipo: "gatilho", gatilho },
      { id: "dados", tipo: "dados", fonte: p.fonte },
      { id: envioId, tipo: "envio", canal, destinos: destinosDaProposta(p, eu) },
    ],
    ligacoes: [{ de: "gatilho", para: "dados" }, { de: "dados", para: envioId }],
  };
}

/** A frase que a conversa mostra: o que foi entendido + a próxima pergunta. */
export function respostaDaProposta(p: PropostaFluxo, eu?: QuemConversa): string {
  const partes: string[] = [];
  const falta = faltaNaProposta(p, eu);
  const entendi: string[] = [];
  if (p.fonte) entendi.push(FONTES_FLUXO[p.fonte].nome.toLowerCase());
  if (p.dias && p.hora) entendi.push(descreverGatilho({ tipo: "agenda", dias: p.dias, hora: p.hora }));
  else if (p.dias) entendi.push(descreverGatilho({ tipo: "agenda", dias: p.dias, hora: "--:--" }).replace(" às --:--", ""));
  else if (p.hora) entendi.push(`às ${p.hora}`);
  const destinos = destinosDaProposta(p, eu);
  if (destinos.length) entendi.push(`no ${NOME_CANAL[p.canal ?? "whatsapp"]} para ${destinos.map((d) => d.nome || d.endereco).join(", ")}`);
  if (entendi.length) partes.push(`Entendi: ${entendi.join(", ")}.`);
  if (p.paraClientes) {
    partes.push("Mandar para a base de clientes ainda não está disponível aqui: por enquanto o fluxo manda para os números que você informar.");
  }
  if (falta.length === 0) {
    partes.push("Montei o fluxo abaixo. Ele está desligado: confira a prévia da mensagem e ligue quando quiser.");
  } else if (!falta.includes("fonte") && !falta.includes("quando")) {
    partes.push(`Montei o fluxo abaixo. ${PERGUNTA.destino}`);
  } else {
    partes.push(PERGUNTA[falta[0]]);
  }
  return partes.join(" ");
}
