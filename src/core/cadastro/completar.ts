/**
 * "VAMOS COMPLETAR SEU CADASTRO" — a conversa depois da primeira entrada
 * (Fase 4.2 do plano, 04/11/2026).
 *
 * A abertura de conta ficou curta em 27/10/2026 e o que ela deixou de pedir
 * foi para `PARA_COMPLETAR_DEPOIS`. Só que nenhuma conversa pedia: a lista era
 * dado sem leitor, e ICMS, inscrição municipal, frequência da receita, meios
 * de recebimento e a estrutura nunca chegavam ao perfil.
 *
 * Aqui mora o roteiro: um passo por item da lista (a guarda
 * `npm run completar-cadastro` reprova item sem passo e passo sem item).
 *
 *   - passo "pergunta": a Quattro AI pergunta na conversa e a resposta vai ao
 *     perfil da empresa (o mesmo `a4p_company` que Configurações lê e edita);
 *   - passo "tela": o que tem escritor próprio (a alçada de pagamento mora em
 *     `central_alcada`, a equipe é convite com papel) a conversa NÃO grava,
 *     ela leva à tela que grava.
 *
 * ⚠️ Pergunta sem resposta não vira `false` nem lista vazia: "não é
 * contribuinte de ICMS" é uma afirmação, e ninguém a fez.
 */
import {
  PARA_COMPLETAR_DEPOIS, FUNCOES, FREQ, MEIOS, DESPESAS, TIPOS_CONTA, CENTROS, UNIDADES, DRE_OPTS, FLUXO_OPTS,
} from "./conversa";

/** O perfil, só no formato que este roteiro lê e escreve (o `StoredCompany`). */
export interface PerfilParaCompletar {
  db?: Record<string, string | boolean | undefined>;
  perfil?: { frequencia?: string; meiosRecebimento?: string[]; despesas?: string[]; [k: string]: unknown };
  estrutura?: {
    contas?: { banco: string; tipo: string; saldo?: number }[];
    centrosCusto?: string[]; unidades?: string[]; dre?: string[]; fluxoCaixa?: string;
  };
  pessoal?: { saldoInicial?: number; categoriasGasto?: string[]; orcamentoMensal?: number; [k: string]: unknown };
  /** Os passos que a pessoa já respondeu nesta conversa (os de valor padrão não se distinguem sem isto). */
  completados?: string[];
}

export type Publico = "pj" | "pf";
export type Resposta = string | string[] | number | boolean;

interface Base {
  id: string;
  /** O item de `PARA_COMPLETAR_DEPOIS`, com a mesma grafia. */
  item: string;
  publico: Publico;
  /** A frase da Quattro AI. */
  pergunta: string;
}
export interface PassoPergunta extends Base {
  tipo: "sim-nao" | "escolha" | "multi" | "texto" | "moeda";
  opcoes?: readonly string[];
  /** Resposta curta que dispensa digitar ("Não tenho"). */
  atalho?: string;
  quando?: (p: PerfilParaCompletar) => boolean;
  respondido: (p: PerfilParaCompletar) => boolean;
  aplicar: (p: PerfilParaCompletar, r: Resposta) => PerfilParaCompletar;
}
export interface PassoTela extends Base {
  tipo: "tela";
  rota: string;
  rotuloRota: string;
}
export type PassoCompletar = PassoPergunta | PassoTela;

const feito = (p: PerfilParaCompletar, id: string) => (p.completados ?? []).includes(id);
const marcar = (p: PerfilParaCompletar, id: string): PerfilParaCompletar =>
  ({ ...p, completados: Array.from(new Set([...(p.completados ?? []), id])) });
const texto = (r: Resposta) => (typeof r === "string" ? r.trim() : String(r ?? "").trim());
const lista = (r: Resposta) => (Array.isArray(r) ? r.map((x) => x.trim()).filter(Boolean) : texto(r) ? [texto(r)] : []);
const simNao = (r: Resposta) => r === true || /^sim$/i.test(texto(r));
const numero = (r: Resposta) => (typeof r === "number" ? r : Number(texto(r).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")));
const comDb = (p: PerfilParaCompletar, campos: Record<string, string | boolean>) => ({ ...p, db: { ...(p.db ?? {}), ...campos } });
const comPerfil = (p: PerfilParaCompletar, campos: Record<string, unknown>) => ({ ...p, perfil: { ...(p.perfil ?? {}), ...campos } });
const comEstrutura = (p: PerfilParaCompletar, campos: Record<string, unknown>) => ({ ...p, estrutura: { ...(p.estrutura ?? {}), ...campos } });
const comPessoal = (p: PerfilParaCompletar, campos: Record<string, unknown>) => ({ ...p, pessoal: { ...(p.pessoal ?? {}), ...campos } });

export const NAO_TENHO = "Não tenho";

/** A resposta não serve para o passo: a tela mostra a mensagem e pergunta de novo. */
export class RespostaInvalida extends Error {}
/** Valor em reais. Texto que não é número é recusado: não vira R$ 0,00. */
const valorDe = (r: Resposta) => {
  const v = numero(r);
  if ((typeof r !== "number" && !/\d/.test(texto(r))) || !Number.isFinite(v)) {
    throw new RespostaInvalida("Não entendi o valor. Escreva só o número, como 2.500,00.");
  }
  return Math.round(v * 100) / 100;
};

export const PASSOS_COMPLETAR: readonly PassoCompletar[] = [
  /* ── empresa ───────────────────────────────────────────────────────────── */
  {
    id: "icms", item: "Contribuinte de ICMS e inscrição estadual", publico: "pj", tipo: "sim-nao",
    pergunta: "A empresa é contribuinte de ICMS?",
    respondido: (p) => typeof p.db?.contribuinteIcms === "boolean",
    aplicar: (p, r) => marcar(comDb(p, { contribuinteIcms: simNao(r) }), "icms"),
  },
  {
    id: "ie", item: "Contribuinte de ICMS e inscrição estadual", publico: "pj", tipo: "texto",
    pergunta: "Qual é a inscrição estadual?",
    quando: (p) => p.db?.contribuinteIcms === true,
    respondido: (p) => !!texto(String(p.db?.ie ?? "")),
    aplicar: (p, r) => marcar(comDb(p, { ie: texto(r) }), "ie"),
  },
  {
    id: "im", item: "Inscrição municipal", publico: "pj", tipo: "texto", atalho: NAO_TENHO,
    pergunta: "Qual é a inscrição municipal da empresa?",
    respondido: (p) => !!texto(String(p.db?.im ?? "")),
    // "Não tenho" é resposta, mas não é inscrição: o campo fica vazio.
    aplicar: (p, r) => (texto(r) === NAO_TENHO ? marcar(p, "im") : marcar(comDb(p, { im: texto(r) }), "im")),
  },
  {
    id: "exporta", item: "Se exporta", publico: "pj", tipo: "sim-nao",
    pergunta: "A empresa vende para fora do Brasil?",
    respondido: (p) => typeof p.db?.exportadora === "boolean",
    aplicar: (p, r) => marcar(comDb(p, { exportadora: simNao(r) }), "exporta"),
  },
  {
    id: "funcao", item: "Sua função na empresa", publico: "pj", tipo: "escolha", opcoes: FUNCOES,
    pergunta: "Qual é a sua função na empresa?",
    respondido: (p) => !!texto(String(p.db?.repCargo ?? "")),
    aplicar: (p, r) => marcar(comDb(p, { repCargo: texto(r) }), "funcao"),
  },
  {
    id: "alcada", item: "Limite de aprovação de pagamentos", publico: "pj", tipo: "tela",
    pergunta: "O limite de quem aprova pagamentos é definido por papel, na tela de alçadas.",
    rota: "/configuracoes", rotuloRota: "Definir as alçadas",
  },
  {
    id: "equipe", item: "Outras pessoas da equipe", publico: "pj", tipo: "tela",
    pergunta: "As outras pessoas da equipe entram por convite, cada uma com o seu papel.",
    rota: "/configuracoes", rotuloRota: "Convidar a equipe",
  },
  {
    id: "frequencia", item: "Frequência da receita", publico: "pj", tipo: "escolha", opcoes: FREQ,
    pergunta: "Com que frequência a receita entra?",
    respondido: (p) => !!texto(String(p.perfil?.frequencia ?? "")),
    aplicar: (p, r) => marcar(comPerfil(p, { frequencia: texto(r) }), "frequencia"),
  },
  {
    id: "meios", item: "Meios de recebimento", publico: "pj", tipo: "multi", opcoes: MEIOS,
    pergunta: "Como os clientes pagam a empresa?",
    respondido: (p) => (p.perfil?.meiosRecebimento ?? []).length > 0,
    aplicar: (p, r) => marcar(comPerfil(p, { meiosRecebimento: lista(r) }), "meios"),
  },
  {
    id: "despesas", item: "Principais despesas", publico: "pj", tipo: "multi", opcoes: DESPESAS,
    pergunta: "Quais são as principais despesas?",
    respondido: (p) => (p.perfil?.despesas ?? []).length > 0,
    aplicar: (p, r) => marcar(comPerfil(p, { despesas: lista(r) }), "despesas"),
  },
  /*
   * ⚠️ Estes cinco nascem com um valor PADRÃO na abertura (conta operacional,
   * Matriz, DRE gerencial, fluxo híbrido): o valor existir não quer dizer que
   * alguém respondeu. Só `completados` diz.
   */
  {
    id: "contas", item: "Tipos de conta", publico: "pj", tipo: "multi", opcoes: TIPOS_CONTA,
    pergunta: "Que tipos de conta bancária a empresa usa?",
    respondido: (p) => feito(p, "contas"),
    aplicar: (p, r) => {
      const tipos = lista(r);
      const banco = p.estrutura?.contas?.[0]?.banco ?? "—";
      const atuais = p.estrutura?.contas ?? [];
      // A conta que já existe fica (com o saldo dela); entram as dos tipos que faltam.
      const novas = tipos.filter((t) => !atuais.some((c) => c.tipo === t)).map((t) => ({ banco, tipo: t }));
      return marcar(comEstrutura(p, { contas: [...atuais, ...novas] }), "contas");
    },
  },
  {
    id: "centros", item: "Centros de custo", publico: "pj", tipo: "multi", opcoes: CENTROS, atalho: NAO_TENHO,
    pergunta: "A empresa separa os gastos por centro de custo? Quais?",
    respondido: (p) => feito(p, "centros"),
    aplicar: (p, r) => marcar(comEstrutura(p, { centrosCusto: lista(r).filter((x) => x !== NAO_TENHO) }), "centros"),
  },
  {
    id: "unidades", item: "Unidades de negócio", publico: "pj", tipo: "multi", opcoes: UNIDADES,
    pergunta: "Quais unidades de negócio a empresa tem?",
    respondido: (p) => feito(p, "unidades"),
    aplicar: (p, r) => marcar(comEstrutura(p, { unidades: lista(r).length ? lista(r) : ["Matriz"] }), "unidades"),
  },
  {
    id: "dre", item: "Visão do DRE", publico: "pj", tipo: "multi", opcoes: DRE_OPTS,
    pergunta: "Como você quer ler o resultado (DRE)?",
    respondido: (p) => feito(p, "dre"),
    aplicar: (p, r) => marcar(comEstrutura(p, { dre: lista(r).length ? lista(r) : ["Gerencial"] }), "dre"),
  },
  {
    id: "fluxo", item: "Visão do fluxo de caixa", publico: "pj", tipo: "escolha", opcoes: FLUXO_OPTS,
    pergunta: "E o fluxo de caixa, em que visão?",
    respondido: (p) => feito(p, "fluxo"),
    aplicar: (p, r) => marcar(comEstrutura(p, { fluxoCaixa: texto(r) }), "fluxo"),
  },
  /* ── pessoa física ─────────────────────────────────────────────────────── */
  {
    id: "saldo", item: "Saldo atual", publico: "pf", tipo: "moeda",
    pergunta: "Quanto você tem hoje na conta principal?",
    respondido: (p) => feito(p, "saldo"),
    aplicar: (p, r) => {
      const valor = valorDe(r);
      const contas = (p.estrutura?.contas ?? []).map((c, k) => (k === 0 ? { ...c, saldo: valor } : c));
      return marcar(comEstrutura(comPessoal(p, { saldoInicial: valor }), { contas }), "saldo");
    },
  },
  {
    id: "categorias", item: "Categorias de gasto", publico: "pf", tipo: "multi", opcoes: DESPESAS,
    pergunta: "Com o que você mais gasta?",
    respondido: (p) => (p.pessoal?.categoriasGasto ?? []).length > 0,
    aplicar: (p, r) => marcar(comPessoal(p, { categoriasGasto: lista(r) }), "categorias"),
  },
  {
    id: "orcamento", item: "Orçamento mensal", publico: "pf", tipo: "moeda",
    pergunta: "Quanto você quer gastar por mês, no máximo?",
    respondido: (p) => feito(p, "orcamento") || (p.pessoal?.orcamentoMensal ?? 0) > 0,
    aplicar: (p, r) => {
      const valor = valorDe(r);
      if (valor <= 0) throw new RespostaInvalida("O orçamento precisa ser um valor maior que zero.");
      return marcar(comPessoal(p, { orcamentoMensal: valor }), "orcamento");
    },
  },
];

export const publicoDoPerfil = (p: PerfilParaCompletar | null | undefined): Publico =>
  p?.db?.tipoConta === "pessoal" ? "pf" : "pj";

/** As perguntas que ainda faltam, na ordem do roteiro. */
export function perguntasPendentes(p: PerfilParaCompletar | null | undefined): PassoPergunta[] {
  const perfil = p ?? {};
  const publico = publicoDoPerfil(perfil);
  return PASSOS_COMPLETAR.filter((s): s is PassoPergunta => s.tipo !== "tela" && s.publico === publico)
    .filter((s) => (s.quando ? s.quando(perfil) : true) && !s.respondido(perfil) && !feito(perfil, s.id));
}

/** As telas que a conversa indica (o que ela não grava). */
export function telasDoRoteiro(p: PerfilParaCompletar | null | undefined): PassoTela[] {
  const publico = publicoDoPerfil(p);
  return PASSOS_COMPLETAR.filter((s): s is PassoTela => s.tipo === "tela" && s.publico === publico);
}

export function proximaPergunta(p: PerfilParaCompletar | null | undefined): PassoPergunta | null {
  return perguntasPendentes(p)[0] ?? null;
}

/** Aplica a resposta ao passo indicado. Passo fora do roteiro é recusado. */
export function responder(p: PerfilParaCompletar, id: string, r: Resposta): PerfilParaCompletar {
  const passo = PASSOS_COMPLETAR.find((s) => s.id === id);
  if (!passo || passo.tipo === "tela") throw new Error(`passo fora do roteiro: ${id}`);
  // A resposta que não responde é recusada antes de chegar ao perfil: "talvez"
  // não vira "não", e lista vazia não vira "nenhum".
  if (passo.tipo === "sim-nao" && typeof r !== "boolean" && !/^(sim|n[aã]o)$/i.test(texto(r))) {
    throw new RespostaInvalida("Responda sim ou não.");
  }
  if (passo.tipo === "escolha" && !(passo.opcoes ?? []).includes(texto(r))) {
    throw new RespostaInvalida("Escolha uma das opções.");
  }
  if (passo.tipo === "multi" && !lista(r).length) throw new RespostaInvalida("Escolha pelo menos uma opção.");
  if (passo.tipo === "texto" && !texto(r)) throw new RespostaInvalida("Escreva a resposta ou pule esta.");
  return passo.aplicar(p, r);
}

/** "Pula esta": a pergunta sai da conversa sem gravar resposta nenhuma no perfil. */
export function pular(p: PerfilParaCompletar, id: string): PerfilParaCompletar {
  return marcar(p, id);
}

/** Os itens da lista, para a guarda conferir que todos têm passo. */
export const ITENS_DA_LISTA = { pj: PARA_COMPLETAR_DEPOIS.pj, pf: PARA_COMPLETAR_DEPOIS.pf };

/** A frase que abre a conversa (o atalho da jornada pergunta isto). */
export const PERGUNTA_COMPLETAR = "Vamos completar meu cadastro";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** A pergunta pede a conversa do cadastro? */
export function pedeCompletarCadastro(q: string): boolean {
  return /\b(completar|terminar|finalizar|preencher) (o |meu |nosso |o meu )?cadastro\b/.test(semAcento(q));
}
