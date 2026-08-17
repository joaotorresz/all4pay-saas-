/**
 * permissoesGranulares() — RBAC institucional + Policy Engine.
 * Sai do "login simples" para controle de acesso baseado em papéis,
 * com permissões por ação, por valor, por método, por módulo, por
 * contexto (país, horário, IP) — o que bancos e tesourarias fazem.
 */
import type {
  Role,
  Permission,
  Usuario,
  TransacaoContexto,
  AmbienteContexto,
  ResultadoPolitica,
  DecisaoPolitica,
} from "./types";

import { formatBRL } from "@/lib/format";
/** Matriz de permissões por papel (RBAC). */
const MATRIZ: Record<Role, Permission[]> = {
  admin: [
    "payment.create", "payment.approve", "payment.execute", "audit.view",
    "audit.export", "rules.edit", "report.export", "credit.manage", "antifraud.view",
  ],
  cfo: [
    "payment.create", "payment.approve", "payment.execute", "audit.view",
    "audit.export", "rules.edit", "report.export", "credit.manage", "antifraud.view",
  ],
  tesouraria: ["payment.create", "payment.approve", "payment.execute", "audit.view", "report.export"],
  financeiro: ["payment.create", "audit.view", "report.export"],
  aprovador: ["payment.approve", "audit.view"],
  auditor: ["audit.view", "audit.export", "report.export", "antifraud.view"],
  operador: ["payment.create"],
  visualizador: ["audit.view"],
};

/** O papel tem a permissão? */
export function temPermissao(role: Role, perm: Permission): boolean {
  return MATRIZ[role].includes(perm);
}

/** O usuário (no contexto) pode realizar a permissão? */
export function pode(usuario: Usuario, perm: Permission): boolean {
  return temPermissao(usuario.role, perm);
}

export function permissoesDe(role: Role): Permission[] {
  return [...MATRIZ[role]];
}

export function todosOsPapeis(): Role[] {
  return Object.keys(MATRIZ) as Role[];
}

/** Faixas de valor que exigem escalonamento (replica banco/tesouraria). */
function aprovadoresPorValor(valor: number): Role[] {
  if (valor <= 5000) return [];
  if (valor <= 50000) return ["financeiro"];
  if (valor <= 250000) return ["tesouraria", "cfo"];
  return ["cfo"];
}

/**
 * Policy Engine — o que bancos fazem: avalia usuário + transação +
 * ambiente + risco e decide aprovar / rejeitar / exigir MFA / escalar /
 * bloquear. Determinístico e explicável.
 */
export function avaliarPolitica(args: {
  usuario: Usuario;
  transacao: TransacaoContexto;
  ambiente: AmbienteContexto;
  risco?: number; // 0..100 (do motor de inadimplência/antifraude)
}): ResultadoPolitica {
  const { usuario, transacao, ambiente, risco = 0 } = args;
  const motivos: string[] = [];
  let decisao: DecisaoPolitica = "aprovar";
  const eleva = (d: DecisaoPolitica) => {
    const ordem: DecisaoPolitica[] = ["aprovar", "exigir_mfa", "escalar", "rejeitar", "bloquear"];
    if (ordem.indexOf(d) > ordem.indexOf(decisao)) decisao = d;
  };

  // Permissão básica
  if (!pode(usuario, "payment.approve")) {
    eleva("escalar");
    motivos.push(`Papel ${usuario.role} não aprova pagamentos — escalar.`);
  }

  // Método permitido
  if (usuario.metodos && !usuario.metodos.includes(transacao.metodo)) {
    eleva("rejeitar");
    motivos.push(`Usuário não pode aprovar ${transacao.metodo.toUpperCase()}.`);
  }

  // Limite individual de aprovação
  if (usuario.limiteAprovacao != null && transacao.valor > usuario.limiteAprovacao) {
    eleva("escalar");
    motivos.push(
      `Valor acima do limite individual (${fmt(usuario.limiteAprovacao)}) — escalar.`,
    );
  }

  // Faixa de valor → aprovadores adicionais
  const aprovadoresNecessarios = aprovadoresPorValor(transacao.valor);
  if (aprovadoresNecessarios.length > 0 && !aprovadoresNecessarios.includes(usuario.role)) {
    eleva("escalar");
    motivos.push(
      `Faixa de ${fmt(transacao.valor)} exige ${aprovadoresNecessarios.join(" + ")}.`,
    );
  }

  // Geográfico
  if (usuario.pais && ambiente.pais !== usuario.pais) {
    eleva("bloquear");
    motivos.push(`Aprovação fora do país de operação (${ambiente.pais}) — bloquear.`);
  }

  // Horário comercial
  if (usuario.apenasHorarioComercial && (ambiente.horaLocal < 8 || ambiente.horaLocal >= 18)) {
    eleva("exigir_mfa");
    motivos.push("Operação fora do horário comercial — exigir MFA.");
  }

  // IP suspeito / MFA
  if (ambiente.ipSuspeito && !ambiente.mfaPresente) {
    eleva("exigir_mfa");
    motivos.push("IP suspeito sem MFA — exigir 2FA.");
  }

  // Risco elevado
  if (risco >= 75) {
    eleva("escalar");
    motivos.push(`Risco ${risco}/100 elevado — revisão adicional.`);
  }

  if (motivos.length === 0) motivos.push("Dentro de todas as políticas — aprovar.");
  return { decisao, motivos, aprovadoresNecessarios };
}

function fmt(v: number) {
  return formatBRL(v);
}
