"use client";

/**
 * AUTOMAÇÕES — leitura e escrita pela TELA (configuração, registro manual,
 * prévia e teste).
 *
 * ⚠️ Uma morada por ambiente, e nunca as duas: em produção as configurações e o
 * registro moram em `automacoes` / `automacao_envios` (RLS por empresa); na
 * demonstração, que não tem banco, no navegador. As chaves locais estão
 * CONGELADAS em produção (`store-org`), então a cópia do navegador não vira
 * segunda fonte.
 *
 * ⚠️ O "Marcar como avisado" da régua, o envio pelo botão, o copiloto e o
 * runner gravam no MESMO registro. Antes eram duas moradas (`a4p_regua_envios`
 * e nada, no caso do copiloto) e o cliente podia ser cobrado pelas duas portas
 * no mesmo dia sem que uma soubesse da outra.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { TETO_LINHAS } from "@/lib/supabase/consulta";
import { ler, gravar, CHAVES_ORG } from "@/lib/store-org";
import { reportar } from "@/lib/erros";
import {
  TIPOS_AUTOMACAO, configPadrao, registroEmMemoria, hojeEm, chaveDoTitulo, contaComoAvisado,
  type ConfigAutomacao, type ContextoAutomacao, type EnvioHistorico, type LinhaEnvio, type TipoAutomacao,
  type CanalEnvio, type StatusEnvio, type Membro,
} from "@/core/automacoes";
import { configDaLinha, credorDe } from "@/lib/automacoes-contexto";
import type { EnvioRegistrado, Canal } from "@/core/cobranca";
import { getRiscoInput, getAccountsList } from "@/lib/data";
import { listParties } from "@/lib/cadastros";
import { listMembers } from "@/lib/governance";
import { fetchCompany, getOrganizationName } from "@/lib/company";
import { hydrateAprovacoes, listSolicitacoes } from "@/lib/aprovacoes";
import { hydrateClose, lockedPeriods } from "@/lib/close";

const K_CONFIG = CHAVES_ORG.automacoes;
const K_ENVIOS = CHAVES_ORG.automacaoEnvios;

/* ────────────────────────── configurações ────────────────────────── */

export async function listarAutomacoes(): Promise<ConfigAutomacao[]> {
  let linhas: ConfigAutomacao[] = [];
  if (isDemo) {
    linhas = ler<ConfigAutomacao[]>(K_CONFIG, []);
  } else {
    const { data, error } = await createClient()
      .from("automacoes").select("tipo,ativo,canais,destinatarios,parametros").limit(TETO_LINHAS);
    if (error) throw error;
    linhas = ((data ?? []) as Parameters<typeof configDaLinha>[0][]).map(configDaLinha).filter((c): c is ConfigAutomacao => !!c);
  }
  // As seis sempre aparecem: a que não tem linha ainda é a padrão (desligada).
  return TIPOS_AUTOMACAO.map((t) => linhas.find((l) => l.tipo === t) ?? configPadrao(t));
}

/** Grava UMA automação. ⚠️ O erro do banco sobe com a mensagem real. */
export async function salvarAutomacao(cfg: ConfigAutomacao): Promise<void> {
  if (isDemo) {
    const atuais = ler<ConfigAutomacao[]>(K_CONFIG, []);
    gravar(K_CONFIG, [...atuais.filter((c) => c.tipo !== cfg.tipo), cfg]);
    return;
  }
  const { error } = await createClient().from("automacoes").upsert({
    tipo: cfg.tipo, ativo: cfg.ativo, canais: cfg.canais,
    destinatarios: cfg.destinatarios, parametros: cfg.parametros,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: "org_id,tipo" });
  if (error) throw error;
}

/* ────────────────────────── registro ────────────────────────── */

export interface EnvioVisivel extends EnvioHistorico {
  destinoMascarado: string;
  erro?: string | null;
}

const doLocal = (l: LinhaEnvio): EnvioVisivel => ({
  tipo: l.tipo, chave: l.chave, canal: l.canal, status: l.status, em: l.criadoEm,
  destinoMascarado: l.destinoMascarado, erro: l.erro ?? null,
});

export async function listarEnvios(limite = 200): Promise<EnvioVisivel[]> {
  if (isDemo) {
    return ler<LinhaEnvio[]>(K_ENVIOS, []).map(doLocal).sort((a, b) => b.em.localeCompare(a.em)).slice(0, limite);
  }
  const { data, error } = await createClient()
    .from("automacao_envios").select("tipo,chave,canal,status,criado_em,destino_mascarado,erro")
    .order("criado_em", { ascending: false }).limit(Math.min(limite, TETO_LINHAS));
  if (error) throw error;
  return ((data ?? []) as { tipo: TipoAutomacao; chave: string; canal: CanalEnvio | "manual"; status: StatusEnvio; criado_em: string; destino_mascarado: string | null; erro: string | null }[])
    .map((r) => ({ tipo: r.tipo, chave: r.chave, canal: r.canal, status: r.status, em: r.criado_em, destinoMascarado: r.destino_mascarado ?? "—", erro: r.erro }));
}

/** Os envios da régua que CONTAM como avisado (enviado ou manual) — o que `montarRegua` lê. */
export async function enviosDaReguaRegistrados(): Promise<EnvioRegistrado[]> {
  const envios = await listarEnvios(TETO_LINHAS);
  const out: EnvioRegistrado[] = [];
  for (const e of envios) {
    if (e.tipo !== "regua_cobranca" || !contaComoAvisado(e.status)) continue;
    const m = /^titulo:(.+):([^:]+)$/.exec(e.chave);
    if (m) out.push({ movimentoId: m[1], etapaId: m[2], em: e.em, canal: e.canal as Canal });
  }
  return out;
}

/**
 * "Marcar como avisado" — uma PESSOA declara o contato. Grava `manual`, nunca
 * `enviado`: o registro diz quem afirmou o quê. Devolve `false` quando a etapa
 * já estava avisada.
 */
export async function registrarAvisoManual(e: { movimentoId: string; etapaId: string; canal: Canal }): Promise<boolean> {
  const chave = chaveDoTitulo(e.movimentoId, e.etapaId);
  const canal = e.canal;
  if (isDemo) {
    const linhas = ler<LinhaEnvio[]>(K_ENVIOS, []);
    if (linhas.some((l) => l.tipo === "regua_cobranca" && l.chave === chave && contaComoAvisado(l.status))) return false;
    const agora = new Date().toISOString();
    const outras = linhas.filter((l) => !(l.tipo === "regua_cobranca" && l.chave === chave && l.canal === canal));
    gravar(K_ENVIOS, [...outras, { orgId: "demo", tipo: "regua_cobranca", chave, canal, destinoMascarado: "—", status: "manual", criadoEm: agora, atualizadoEm: agora }]);
    return true;
  }
  const db = createClient();
  const { data: ja, error: e0 } = await db.from("automacao_envios").select("status")
    .eq("tipo", "regua_cobranca").eq("chave", chave).in("status", ["enviado", "manual"]).limit(1);
  if (e0) throw e0;
  if (ja && ja.length) return false;
  const { count, error } = await db.from("automacao_envios")
    .upsert({ tipo: "regua_cobranca", chave, canal, status: "manual" }, { onConflict: "org_id,tipo,chave,canal", ignoreDuplicates: true, count: "exact" });
  if (error) throw error;
  if ((count ?? 0) > 0) return true;
  // Havia um registro SIMULADO ou FALHO nesse canal: a pessoa afirmou o contato.
  const { count: up, error: e2 } = await db.from("automacao_envios")
    .update({ status: "manual", erro: null, atualizado_em: new Date().toISOString() }, { count: "exact" })
    .match({ tipo: "regua_cobranca", chave, canal }).in("status", ["simulado", "falhou"]);
  if (e2) throw e2;
  return (up ?? 0) > 0;
}

/** Demonstração: o registro local de um envio de teste (sempre simulado — não há provedor). */
export async function registrarTesteLocal(tipo: TipoAutomacao, canal: CanalEnvio, destinoMascarado: string): Promise<void> {
  const linhas = ler<LinhaEnvio[]>(K_ENVIOS, []);
  const reg = registroEmMemoria(linhas);
  const chave = `teste:${Date.now().toString(36)}`;
  if ((await reg.reservar({ orgId: "demo", tipo, chave, canal, destinoMascarado })) === "reservado") {
    await reg.concluir({ orgId: "demo", tipo, chave, canal }, { status: "simulado", erro: "demonstração: nada é enviado" });
  }
  gravar(K_ENVIOS, linhas);
}

/* ────────────────────────── prévia ────────────────────────── */

/**
 * O contexto da PRÓPRIA empresa, montado com o que a tela lê — para a prévia
 * mostrar a mensagem com os números reais. O runner monta o mesmo contexto pela
 * RPC; os dois passam pelo mesmo mapeador e pelo mesmo núcleo.
 */
export async function contextoDaEmpresa(): Promise<ContextoAutomacao> {
  const [input, contas, partes, membros, company, nomeOrg, envios] = await Promise.all([
    getRiscoInput(),
    getAccountsList().catch((e) => { reportar("automacoes.contas", e, "a prévia não confere o saldo por conta", true); return []; }),
    listParties().catch((e) => { reportar("automacoes.contatos", e, "a prévia da régua não acha os contatos", true); return []; }),
    listMembers().catch((e) => { reportar("automacoes.membros", e, "a lista de destinatários abre vazia", true); return []; }),
    fetchCompany(),
    getOrganizationName(),
    listarEnvios(TETO_LINHAS).catch((e) => { reportar("automacoes.envios", e, "o histórico de envios não aparece", true); return [] as EnvioVisivel[]; }),
  ]);
  let aprovacoes: number | null = null;
  try { await hydrateAprovacoes(); aprovacoes = listSolicitacoes().filter((s) => s.statusFinal === "em_analise").length; } catch { aprovacoes = null; }
  let travados: string[] = [];
  try { await hydrateClose(); travados = lockedPeriods(); } catch { travados = []; }
  const titulares: Membro[] = membros
    .filter((m) => m.isOwner || m.papel === "administrador")
    .map((m) => ({ userId: m.id, papel: m.isOwner ? "owner" : "admin", nome: m.nome || null, email: m.email || null }));
  return {
    orgId: "sessao",
    hoje: input.hoje || hojeEm(new Date()),
    credor: credorDe(nomeOrg, (company?.db ?? null) as Record<string, unknown> | null),
    input,
    contas: contas.map((c) => ({ id: c.id, nome: c.name, saldo: Number(c.balance ?? 0) })),
    contatos: Object.fromEntries(partes.map((p) => [p.id, { id: p.id, nome: p.name, telefone: p.phone ?? null, email: p.email ?? null }])),
    membros: titulares,
    aprovacoesPendentes: aprovacoes,
    mesesTravados: travados,
    envios,
    appUrl: typeof window !== "undefined" ? window.location.origin : "",
  };
}

/* ────────────────────────── teste ────────────────────────── */

export interface ResultadoTeste { ok: boolean; situacao: "enviado" | "simulado" | "falhou" | "recusado"; destino: string; motivo?: string }

/** "Enviar teste para mim": a mensagem da prévia, só para quem clicou. */
export async function enviarTeste(p: {
  tipo: TipoAutomacao; canal: CanalEnvio; assunto: string; texto: string; html: string;
  finalidade: string; variaveis: Record<string, string>; telefone?: string | null;
}): Promise<ResultadoTeste> {
  const r = await fetch("/api/automacoes/teste", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
  });
  const j = (await r.json().catch(() => null)) as (ResultadoTeste & { motivo?: string }) | null;
  if (!j) return { ok: false, situacao: "falhou", destino: "—", motivo: `resposta inválida (${r.status})` };
  if (isDemo && j.situacao === "simulado") await registrarTesteLocal(p.tipo, p.canal, j.destino);
  return j;
}

export type { ConfigAutomacao, EnvioHistorico };
