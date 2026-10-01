/**
 * O CONTEXTO DE UMA EMPRESA para o núcleo das automações — montado a partir do
 * que a RPC `automacao_contexto` devolve (runner, sem sessão) OU do que a tela
 * já tem na mão (prévia). Puro: sem Supabase, sem `window`.
 *
 * ⚠️ O `RiskInput` sai do MAPEADOR ÚNICO (`lib/risco-linhas`) — o mesmo que a
 * Visão geral usa. É isso que garante que o saldo do e-mail das 9h é o mesmo
 * saldo que a pessoa vê ao abrir o app às 9h05.
 */
import { linhasParaRiskInput, type LinhaMovimento } from "@/lib/risco-linhas";
import type {
  ConfigAutomacao, ContextoAutomacao, Contato, Membro, EnvioHistorico, ContaSaldo, TipoAutomacao,
  CanalEnvio, Destinatario, ParametrosAutomacao, StatusEnvio,
} from "@/core/automacoes";
import { TIPOS_AUTOMACAO, configPadrao } from "@/core/automacoes";
import type { Credor } from "@/core/cobranca";

/** O JSON que `automacao_contexto(p_org)` devolve. */
export interface ContextoBruto {
  org?: { id?: string; nome?: string } | null;
  perfil?: Record<string, unknown> | null;
  contas?: { id: string; nome?: string | null; saldo?: number | string | null }[] | null;
  movimentos?: LinhaMovimento[] | null;
  truncado?: boolean | null;
  partes?: { id: string; nome?: string | null; telefone?: string | null; email?: string | null }[] | null;
  membros?: { userId: string; papel: string; nome?: string | null; email?: string | null }[] | null;
  aprovacoesPendentes?: number | string | null;
  mesesTravados?: string[] | null;
  envios?: { tipo: string; chave: string; canal: string; status: string; em: string }[] | null;
}

const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** O credor a partir do nome da organização + o cadastro jurídico (`company_profiles.profile.db`). */
export function credorDe(nomeOrg: string | null | undefined, perfil: Record<string, unknown> | null | undefined): Credor {
  const p = perfil ?? {};
  return {
    nome: txt(p.fantasia) ?? txt(nomeOrg) ?? txt(p.razaoSocial) ?? "Minha empresa",
    razaoSocial: txt(p.razaoSocial),
    documento: txt(p.cnpj),
  };
}

export function contextoDaRpc(orgId: string, bruto: ContextoBruto, hoje: string, appUrl: string): ContextoAutomacao {
  const contas: ContaSaldo[] = (bruto.contas ?? []).map((c) => ({ id: String(c.id), nome: c.nome ?? "Conta", saldo: Number(c.saldo ?? 0) }));
  const input = linhasParaRiskInput({
    hoje,
    saldosDasContas: contas.map((c) => c.saldo),
    linhas: bruto.movimentos ?? [],
    partes: (bruto.partes ?? []).map((p) => ({ id: p.id, nome: p.nome })),
  });
  const contatos: Record<string, Contato> = {};
  for (const p of bruto.partes ?? []) contatos[String(p.id)] = { id: String(p.id), nome: p.nome ?? "", telefone: p.telefone ?? null, email: p.email ?? null };
  return {
    orgId,
    hoje,
    credor: credorDe(bruto.org?.nome, bruto.perfil),
    input,
    contas,
    contatos,
    membros: (bruto.membros ?? []).map((m) => ({ userId: String(m.userId), papel: m.papel, nome: m.nome ?? null, email: m.email ?? null })),
    aprovacoesPendentes: bruto.aprovacoesPendentes == null ? null : Number(bruto.aprovacoesPendentes),
    mesesTravados: bruto.mesesTravados ?? [],
    envios: (bruto.envios ?? []).map((e) => ({
      tipo: e.tipo as TipoAutomacao, chave: e.chave, canal: e.canal as CanalEnvio | "manual", status: e.status as StatusEnvio, em: e.em,
    })),
    appUrl,
    truncado: !!bruto.truncado,
  };
}

/** Uma linha de `automacoes` → a configuração que o núcleo lê (com os padrões por baixo). */
export function configDaLinha(r: {
  tipo: string; ativo?: boolean | null; canais?: string[] | null; destinatarios?: unknown; parametros?: unknown;
}): ConfigAutomacao | null {
  if (!TIPOS_AUTOMACAO.includes(r.tipo as TipoAutomacao)) return null;
  const base = configPadrao(r.tipo as TipoAutomacao);
  const canais = (r.canais ?? base.canais).filter((c): c is CanalEnvio => c === "email" || c === "whatsapp");
  return {
    tipo: base.tipo,
    ativo: !!r.ativo,
    canais: canais.length ? canais : base.canais,
    destinatarios: Array.isArray(r.destinatarios) ? (r.destinatarios as Destinatario[]).filter((d) => d && typeof d.userId === "string") : [],
    parametros: { ...base.parametros, ...((r.parametros && typeof r.parametros === "object") ? (r.parametros as ParametrosAutomacao) : {}) },
  };
}

export type { ContextoAutomacao, Membro, EnvioHistorico };
