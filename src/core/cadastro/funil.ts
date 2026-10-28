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

export const VERSAO_FUNIL = "cadastro-funil/1.0.0";

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
  };
}
