/**
 * O FUNIL DO CADASTRO — regras puras da leitura do admin (28/10/2026, etapa 3
 * do plano "documentos e funil do cadastro no admin").
 *
 * A jornada (`./jornada`) grava só QUANDO a pessoa chegou a cada passo; aqui
 * isso vira as três respostas do dono: quantos terminaram, quantos pararam e
 * em que passo. Puro, sem relógio próprio (`agora` entra por parâmetro).
 *
 * ⚠️ **A FASE É "ALCANÇOU", não "está".** Uma jornada concluída conta em todas
 * as fases do funil; a que parou nos documentos conta até ali. Por isso a fase
 * olha os passos DELA E das seguintes: quem pulou um passo (o e-mail do Google
 * já vem respondido) não pode sumir do meio do funil e reaparecer no fim.
 */
import { PERGUNTAS } from "./conversa";
import { estadoDaJornada, podeRecuperar, type EstadoJornada } from "./jornada";

export const VERSAO_FUNIL = "cadastro-funil/1.1.0";

export interface JornadaAdmin {
  id: string;
  tipo: "pf" | "pj" | null;
  etapa: string;
  /** A primeira chegada a cada passo: `{ passo: ISO }`. */
  etapas: Record<string, string>;
  nome: string | null;
  whatsapp: string | null;
  email: string | null;
  orgId: string | null;
  empresa: string | null;
  iniciadaEm: string;
  atualizadaEm: string;
  concluidaEm: string | null;
  documentos: number;
  /** Os lembretes de recuperação já reservados ou enviados (etapa 5). */
  lembretes: LembreteAdmin[];
}

export interface LembreteAdmin {
  canal: "whatsapp" | "email";
  situacao: "reservado" | "enviado" | "falhou";
  em: string;
}

/** O nome dos passos que não são pergunta (as etapas da tela de cadastro). */
const PASSOS_ESPECIAIS: Record<string, string> = {
  tipo: "Tipo de conta",
  documento: "CPF ou CNPJ",
  buscando: "CPF ou CNPJ",
  confirmar: "CPF ou CNPJ",
  senha: "Senha",
  termos: "Termos de uso",
  facial: "Foto do rosto",
  docIdentidade: "Documento de identidade",
  docEmpresa: "Documento da empresa",
  criando: "Criando a conta",
  confirme: "Confirmar o e-mail",
  erro: "Erro ao criar a conta",
  pronto: "Concluído",
};

/** O nome legível de um passo; o identificador cru só quando ninguém o conhece. */
export function nomeDoPasso(passo: string): string {
  if (PASSOS_ESPECIAIS[passo]) return PASSOS_ESPECIAIS[passo];
  const p = PERGUNTAS.find((q) => q.id === passo);
  return p ? `${p.grupo} · ${p.rotulo}` : passo;
}

/** As fases do funil, na ordem da conversa. */
export const FASES_FUNIL: readonly { id: string; rotulo: string; passos: readonly string[] }[] = [
  { id: "inicio", rotulo: "Começaram", passos: ["tipo"] },
  { id: "documento", rotulo: "Informaram CPF ou CNPJ", passos: ["documento", "buscando", "confirmar"] },
  { id: "contato", rotulo: "Deixaram o contato", passos: ["repTelefone", "repEmail", "emailPf"] },
  { id: "verificacao", rotulo: "Chegaram à senha e aos documentos", passos: ["senha", "termos", "facial", "docIdentidade", "docEmpresa", "criando", "confirme"] },
  { id: "pronto", rotulo: "Concluíram", passos: ["pronto"] },
];

/** Quantas fases a jornada alcançou (0 a 5): a mais adiantada com passo registrado. */
export function faseAlcancada(j: Pick<JornadaAdmin, "etapas" | "concluidaEm">): number {
  if (j.concluidaEm) return FASES_FUNIL.length;
  const passos = new Set(Object.keys(j.etapas ?? {}));
  let fase = 0;
  FASES_FUNIL.forEach((f, i) => { if (f.passos.some((p) => passos.has(p))) fase = i + 1; });
  // Uma jornada registrada começou, mesmo que o primeiro passo não tenha chegado.
  return Math.max(fase, 1);
}

export interface ResumoFunil {
  total: number;
  concluidas: number;
  emAndamento: number;
  pararam: number;
  /** Pararam há mais de 24 h e deixaram um contato (a fila da etapa 5). */
  recuperaveis: number;
  /** `null` sem nenhuma jornada: 0% diria que ninguém termina, quando ninguém começou. */
  taxaConclusao: number | null;
  fases: { id: string; rotulo: string; alcancaram: number; fracao: number | null }[];
  /** Onde as que PARARAM estão, do passo mais comum ao menos. */
  ondeParam: { passo: string; rotulo: string; quantas: number }[];
  /** Quanto tempo leva (etapa 4): medianas em minutos, `null` sem base. */
  tempos: TemposFunil;
}

export interface TemposFunil {
  /** Do primeiro passo à conclusão, entre as que concluíram. */
  ateConcluir: { mediana: number | null; base: number };
  /** Do primeiro passo ao último, entre as que PARARAM: quanto a pessoa tentou antes de desistir. */
  ateParar: { mediana: number | null; base: number };
  /** De uma fase à seguinte, entre as jornadas que registraram as duas. */
  entreFases: { de: string; para: string; rotulo: string; mediana: number | null; base: number }[];
  /** A passagem com a maior mediana (com base de pelo menos 3): onde o cadastro é lento. */
  maisLenta: string | null;
}

/** Mediana; `null` com a lista vazia (zero minutos seria "instantâneo", não "sem dado"). */
export function mediana(v: readonly number[]): number | null {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b), m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

const ms = (iso: string | null | undefined) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};
/** Minutos entre dois instantes; `null` se faltar um ou se o relógio andar para trás. */
const minutosEntre = (a: number | null, b: number | null) => (a === null || b === null || b < a ? null : (b - a) / 60_000);

/** A PRIMEIRA chegada a uma fase: o menor instante entre os passos dela (a conclusão vale pelo "pronto"). */
export function chegadaNaFase(j: Pick<JornadaAdmin, "etapas" | "concluidaEm">, i: number): number | null {
  const f = FASES_FUNIL[i];
  const ts = f.passos.map((p) => ms(j.etapas?.[p])).filter((t): t is number => t !== null);
  if (f.id === "pronto") { const c = ms(j.concluidaEm); if (c !== null) ts.push(c); }
  return ts.length ? Math.min(...ts) : null;
}

/** "45 s", "12 min", "2 h 10 min", "3 dias": a duração como se diz. */
export function duracaoLegivel(min: number | null): string {
  if (min === null || !Number.isFinite(min) || min < 0) return "—";
  if (min < 1) return `${Math.max(1, Math.round(min * 60))} s`;
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 48 * 60) {
    const h = Math.floor(min / 60), r = Math.round(min - h * 60);
    return r ? `${h} h ${r} min` : `${h} h`;
  }
  return `${Math.round(min / 1440)} dias`;
}

export function temposDoFunil(jornadas: readonly JornadaAdmin[], agora: Date): TemposFunil {
  const inicio = (j: JornadaAdmin) => ms(j.iniciadaEm);
  const concl = jornadas.map((j) => minutosEntre(inicio(j), ms(j.concluidaEm))).filter((m): m is number => m !== null);
  const paradas = jornadas.filter((j) => estadoDaJornada(j, agora) === "parou")
    .map((j) => minutosEntre(inicio(j), ms(j.atualizadaEm))).filter((m): m is number => m !== null);
  const entreFases = FASES_FUNIL.slice(0, -1).map((f, i) => {
    const prox = FASES_FUNIL[i + 1];
    const v = jornadas.map((j) => minutosEntre(chegadaNaFase(j, i), chegadaNaFase(j, i + 1))).filter((m): m is number => m !== null);
    return { de: f.id, para: prox.id, rotulo: `${f.rotulo} → ${prox.rotulo}`, mediana: mediana(v), base: v.length };
  });
  const candidatas = entreFases.filter((e) => e.base >= 3 && e.mediana !== null);
  const maisLenta = candidatas.length ? candidatas.reduce((a, b) => (b.mediana! > a.mediana! ? b : a)).rotulo : null;
  return {
    ateConcluir: { mediana: mediana(concl), base: concl.length },
    ateParar: { mediana: mediana(paradas), base: paradas.length },
    entreFases,
    maisLenta,
  };
}

export function resumirFunil(jornadas: readonly JornadaAdmin[], agora: Date): ResumoFunil {
  const estado = (j: JornadaAdmin): EstadoJornada => estadoDaJornada(j, agora);
  const total = jornadas.length;
  const concluidas = jornadas.filter((j) => estado(j) === "concluida").length;
  const paradas = jornadas.filter((j) => estado(j) === "parou");
  const alcance = jornadas.map(faseAlcancada);
  const fases = FASES_FUNIL.map((f, i) => {
    const alcancaram = alcance.filter((a) => a >= i + 1).length;
    return { id: f.id, rotulo: f.rotulo, alcancaram, fracao: total ? alcancaram / total : null };
  });
  const porPasso = new Map<string, number>();
  for (const j of paradas) {
    const r = nomeDoPasso(j.etapa);
    porPasso.set(r, (porPasso.get(r) ?? 0) + 1);
  }
  const ondeParam = Array.from(porPasso.entries())
    .map(([rotulo, quantas]) => ({ passo: paradas.find((j) => nomeDoPasso(j.etapa) === rotulo)!.etapa, rotulo, quantas }))
    .sort((a, b) => b.quantas - a.quantas || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  return {
    total,
    concluidas,
    emAndamento: jornadas.filter((j) => estado(j) === "em_andamento").length,
    pararam: paradas.length,
    recuperaveis: jornadas.filter((j) => podeRecuperar(j, agora)).length,
    taxaConclusao: total ? concluidas / total : null,
    fases,
    ondeParam,
    tempos: temposDoFunil(jornadas, agora),
  };
}

/** Lê uma linha de `admin_cadastro_funil`, descartando o que não tem forma. */
export function jornadaDaLinha(r: Record<string, unknown>): JornadaAdmin | null {
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const id = s(r.id), etapa = s(r.etapa), iniciadaEm = s(r.iniciada_em), atualizadaEm = s(r.atualizada_em);
  if (!id || !etapa || !iniciadaEm || !atualizadaEm) return null;
  const etapas: Record<string, string> = {};
  if (r.etapas && typeof r.etapas === "object") {
    for (const [k, v] of Object.entries(r.etapas as Record<string, unknown>)) if (typeof v === "string") etapas[k] = v;
  }
  return {
    id, etapa, etapas, iniciadaEm, atualizadaEm,
    tipo: r.tipo === "pf" || r.tipo === "pj" ? r.tipo : null,
    nome: s(r.nome), whatsapp: s(r.whatsapp), email: s(r.email),
    orgId: s(r.org_id), empresa: s(r.empresa),
    concluidaEm: s(r.concluida_em),
    documentos: Number.isFinite(Number(r.documentos)) ? Number(r.documentos) : 0,
    lembretes: (Array.isArray(r.lembretes) ? r.lembretes : []).flatMap((l): LembreteAdmin[] => {
      const x = (l ?? {}) as Record<string, unknown>;
      const canal = x.canal === "whatsapp" || x.canal === "email" ? x.canal : null;
      const situacao = x.situacao === "reservado" || x.situacao === "enviado" || x.situacao === "falhou" ? x.situacao : null;
      return canal && situacao && typeof x.em === "string" ? [{ canal, situacao, em: x.em }] : [];
    }),
  };
}
