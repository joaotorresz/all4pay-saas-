/**
 * approvalFlow() — mecanismo de lock-in enterprise: o operacional passa
 * a depender do fluxo. Fluxo configurável por faixa de valor, com etapas
 * sequenciais/paralelas, SLA, sugestão de IA, assinatura eletrônica
 * (hash + timestamp + device) e modo de exceção/emergência.
 */
import type {
  ApprovalRule,
  ApprovalRequest,
  ApprovalStepEstado,
  TransacaoContexto,
  AssinaturaEletronica,
  Usuario,
  Role,
  SugestaoIA,
  SLAInfo,
} from "./types";
import { uid } from "./types";
import { sha256 } from "./sha256";

/** Regras padrão (configuráveis por empresa) — replica banco/tesouraria. */
export const REGRAS_PADRAO: ApprovalRule[] = [
  { ateValor: 5000, auto: true, passos: [] },
  {
    ateValor: 50000,
    auto: false,
    passos: [{ ordem: 1, rotulo: "Gerente financeiro", aprovadores: ["financeiro"], modo: "sequencial" }],
  },
  {
    ateValor: 250000,
    auto: false,
    passos: [
      { ordem: 1, rotulo: "Diretoria", aprovadores: ["cfo"], modo: "sequencial" },
      { ordem: 2, rotulo: "Tesouraria", aprovadores: ["tesouraria"], modo: "sequencial" },
    ],
  },
  {
    ateValor: Infinity,
    auto: false,
    exigeBiometria: true,
    passos: [
      { ordem: 1, rotulo: "CFO (biometria)", aprovadores: ["cfo"], modo: "sequencial" },
      { ordem: 2, rotulo: "Compliance + Jurídico", aprovadores: ["auditor", "admin"], modo: "paralelo" },
    ],
  },
];

export function regraParaValor(valor: number, regras: ApprovalRule[] = REGRAS_PADRAO): ApprovalRule {
  return regras.find((r) => valor <= r.ateValor) ?? regras[regras.length - 1];
}

/** Sugestão de IA: consistência com o histórico do favorecido. */
export function sugerirIA(
  transacao: TransacaoContexto,
  historico: { contraparte: string; maxRecebido: number; aprovacoes: number },
): SugestaoIA {
  if (transacao.contraparte !== historico.contraparte || historico.aprovacoes === 0) {
    return { risco: "alto", texto: "Favorecido sem histórico aprovado — revisão recomendada." };
  }
  if (transacao.valor > historico.maxRecebido * 1.5) {
    return {
      risco: "alto",
      texto: `Favorecido nunca recebeu acima de ${fmt(historico.maxRecebido)}. Atual: ${fmt(transacao.valor)}. Necessário revisão.`,
    };
  }
  if (transacao.valor > historico.maxRecebido) {
    return { risco: "medio", texto: "Valor acima do máximo histórico do favorecido — atenção." };
  }
  return {
    risco: "baixo",
    texto: "Pagamento consistente com o histórico aprovado anteriormente. Risco operacional baixo.",
  };
}

/** Instancia uma solicitação de aprovação a partir da regra de valor. */
export function iniciarAprovacao(
  entityId: string,
  transacao: TransacaoContexto,
  sugestao: SugestaoIA,
  regras: ApprovalRule[] = REGRAS_PADRAO,
): ApprovalRequest {
  const regra = regraParaValor(transacao.valor, regras);
  const passos: ApprovalStepEstado[] = regra.passos.map((def) => ({
    def,
    status: "pendente",
    assinaturas: [],
  }));
  return {
    id: uid("appr"),
    entityId,
    transacao,
    criadoEm: new Date().toISOString(),
    passos,
    status: regra.auto ? "auto_aprovado" : "em_aprovacao",
    sugestaoIA: sugestao,
  };
}

/** Gera a assinatura eletrônica institucional (validade jurídica operacional). */
export function assinar(usuario: Usuario, payload: string, device = "web"): AssinaturaEletronica {
  const timestamp = new Date().toISOString();
  return {
    userId: usuario.id,
    userName: usuario.nome,
    role: usuario.role,
    timestamp,
    device,
    hash: sha256(`${usuario.id}|${timestamp}|${device}|${payload}`),
  };
}

/**
 * Aplica uma aprovação de um usuário ao passo corrente. Respeita
 * sequencial (só o passo atual) e paralelo (todos os aprovadores do passo).
 * Retorna a request atualizada (imutável).
 */
export function aprovarPasso(req: ApprovalRequest, usuario: Usuario): ApprovalRequest {
  const passos = req.passos.map((p) => ({ ...p, assinaturas: [...p.assinaturas] }));
  const idx = passos.findIndex((p) => p.status === "pendente");
  if (idx < 0) return req;
  const passo = passos[idx];
  if (!passo.def.aprovadores.includes(usuario.role)) return req; // não é aprovador deste passo

  passo.assinaturas.push(assinar(usuario, `${req.entityId}:${passo.def.ordem}`));
  passo.iniciadoEm ??= new Date().toISOString();

  const rolesAssinados = new Set(passo.assinaturas.map((a) => a.role));
  const completo =
    passo.def.modo === "paralelo"
      ? passo.def.aprovadores.every((r) => rolesAssinados.has(r))
      : true;
  if (completo) {
    passo.status = "aprovado";
    passo.concluidoEm = new Date().toISOString();
  }

  const todosAprovados = passos.every((p) => p.status === "aprovado");
  return { ...req, passos, status: todosAprovados ? "aprovado" : "em_aprovacao" };
}

/** Modo emergência: tesouraria/CFO executa com justificativa obrigatória. */
export function executarEmergencia(
  req: ApprovalRequest,
  usuario: Usuario,
  justificativa: string,
): ApprovalRequest {
  return {
    ...req,
    status: "emergencia",
    emergencia: { por: usuario.nome, justificativa },
  };
}

/** SLA por etapa — inteligência operacional (onde estão os gargalos). */
export function slaPorEtapa(requests: ApprovalRequest[]): SLAInfo[] {
  const acc = new Map<string, { soma: number; n: number }>();
  for (const r of requests) {
    for (const p of r.passos) {
      if (p.iniciadoEm && p.concluidoEm) {
        const min =
          (new Date(p.concluidoEm).getTime() - new Date(p.iniciadoEm).getTime()) / 60000;
        const cur = acc.get(p.def.rotulo) ?? { soma: 0, n: 0 };
        cur.soma += min;
        cur.n += 1;
        acc.set(p.def.rotulo, cur);
      }
    }
  }
  return Array.from(acc.entries()).map(([etapa, { soma, n }]) => ({
    etapa,
    tempoMedioMin: Math.round(soma / n),
  }));
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export type { Role };
