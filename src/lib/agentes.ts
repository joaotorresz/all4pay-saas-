"use client";

/**
 * AGENTES — leitura e escrita pela TELA (configuração e a fila de aprovação).
 *
 * ⚠️ Uma morada por ambiente, e nunca as duas: em produção a configuração e a
 * fila moram em `agentes` / `agente_propostas` (RLS por empresa); na
 * demonstração, que não tem banco, no navegador. As chaves locais estão
 * CONGELADAS em produção (`store-org`).
 *
 * ⚠️ A tela NÃO cria proposta: só o servidor de cada agente cria. A pessoa só
 * decide, pela função `agente_decidir`, que confere a permissão na empresa da
 * proposta. O erro do banco sobe com a mensagem real. Depois do "Aprovar",
 * a tela pede ao servidor que ENVIE na hora o que já está aprovado
 * (`/api/agentes/executar`); se essa chamada falhar, o runner diário envia.
 *
 * ⚠️ Na demonstração, que não tem servidor de agente, `simularCobrancaNaDemo`
 * faz o papel do runner com o MESMO núcleo (`propostasDeCobranca`) sobre os
 * dados da demonstração. Nada é enviado: aprovar deixa a proposta aprovada.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { ler, gravar, CHAVES_ORG } from "@/lib/store-org";
import {
  IDS_AGENTE, configPadrao, type ConfigAgente, type EstadoProposta, type IdAgente, type NivelAgente,
  type PropostaAgente,
} from "@/core/agentes";
import { propostasDeCobranca, propostaDoDia, MOTIVO_EXPIRADA } from "@/core/agentes/cobranca";
import { configPadrao as configPadraoAutomacao } from "@/core/automacoes";
import { contextoDaEmpresa, listarAutomacoes } from "@/lib/automacoes";
import { propostasDeConciliacao } from "@/core/agentes/conciliacao";
import { getConciliacaoOF } from "@/lib/conciliacao-of";
import { propostasDeContasPagar, desfechoDoDocumento, MOTIVO_DOCUMENTO } from "@/core/agentes/contas-pagar";
import { montarCaixaEntrada } from "@/core/caixa-entrada";
import { documentosDaCaixa, lerEstadoCaixa } from "@/lib/caixa-entrada";
import { propostasDeCaixa, propostaDeCaixaVale } from "@/core/agentes/caixa";

const K_CONFIG = CHAVES_ORG.agentes;
const K_PROPOSTAS = CHAVES_ORG.agentePropostas;

interface LinhaAgente { agente: string; ativo: boolean; nivel: number; limite_valor: number | string; limite_dia: number }

const daLinha = (l: LinhaAgente): ConfigAgente | null =>
  (IDS_AGENTE as readonly string[]).includes(l.agente)
    ? {
        agente: l.agente as IdAgente, ativo: !!l.ativo,
        nivel: Math.max(0, Math.min(3, Number(l.nivel) || 0)) as NivelAgente,
        limiteValor: Number(l.limite_valor) || 0, limiteDia: Number(l.limite_dia) || 0,
      }
    : null;

/** Os cinco, sempre: o que não tem linha ainda é o padrão (desligado). */
export async function listarAgentes(): Promise<ConfigAgente[]> {
  let linhas: ConfigAgente[] = [];
  if (isDemo) {
    linhas = ler<ConfigAgente[]>(K_CONFIG, []);
  } else {
    const { data, error } = await createClient()
      .from("agentes").select("agente,ativo,nivel,limite_valor,limite_dia").limit(20);
    if (error) throw error;
    linhas = ((data ?? []) as LinhaAgente[]).map(daLinha).filter((c): c is ConfigAgente => !!c);
  }
  return IDS_AGENTE.map((id) => linhas.find((l) => l.agente === id) ?? configPadrao(id));
}

/** Grava UM agente. ⚠️ O banco recusa o nível acima do máximo; a mensagem sobe. */
export async function salvarAgente(cfg: ConfigAgente): Promise<void> {
  if (isDemo) {
    const atuais = ler<ConfigAgente[]>(K_CONFIG, []);
    gravar(K_CONFIG, [...atuais.filter((c) => c.agente !== cfg.agente), cfg]);
    return;
  }
  const { error } = await createClient().from("agentes").upsert({
    agente: cfg.agente, ativo: cfg.ativo, nivel: cfg.nivel,
    limite_valor: cfg.limiteValor, limite_dia: cfg.limiteDia,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: "org_id,agente" });
  if (error) throw error;
}

interface LinhaProposta {
  id: string; agente: string; titulo: string; porque: string; valor: number | string | null;
  estado: string; criada_em: string; decidida_em: string | null; motivo: string | null;
  dados: Record<string, unknown> | null;
}

/** As propostas mais recentes (as pendentes primeiro na tela). */
export async function listarPropostas(): Promise<PropostaAgente[]> {
  if (isDemo) {
    await simularCobrancaNaDemo().catch(() => undefined);
    await simularConciliacaoNaDemo().catch(() => undefined);
    await simularContasPagarNaDemo().catch(() => undefined);
    await simularCaixaNaDemo().catch(() => undefined);
    return ler<PropostaAgente[]>(K_PROPOSTAS, []);
  }
  const { data, error } = await createClient()
    .from("agente_propostas")
    .select("id,agente,titulo,porque,valor,estado,criada_em,decidida_em,motivo,dados")
    .order("criada_em", { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as LinhaProposta[]).map((l) => ({
    id: l.id, agente: l.agente as IdAgente, titulo: l.titulo, porque: l.porque,
    valor: l.valor == null ? null : Number(l.valor), estado: l.estado as EstadoProposta,
    criadaEm: l.criada_em, decididaEm: l.decidida_em, motivo: l.motivo, dados: l.dados ?? null,
  }));
}

/** Aprovar ou recusar UMA proposta. */
export async function decidirProposta(id: string, aprovar: boolean, motivo?: string): Promise<void> {
  if (isDemo) {
    const atuais = ler<PropostaAgente[]>(K_PROPOSTAS, []);
    gravar(K_PROPOSTAS, atuais.map((p) => (p.id === id && p.estado === "pendente"
      ? { ...p, estado: aprovar ? "aprovada" : "recusada", decididaEm: new Date().toISOString(), motivo: motivo ?? null }
      : p)));
    return;
  }
  const { error } = await createClient().rpc("agente_decidir", { p_id: id, p_aprovar: aprovar, p_motivo: motivo ?? null });
  if (error) throw error;
}

/**
 * Depois do "Aprovar": pede o envio NA HORA. Devolve a frase do resultado.
 * ⚠️ Falha aqui não desfaz a aprovação: o runner diário envia o que ficou.
 */
export async function executarAprovada(id: string, agente: IdAgente = "cobranca"): Promise<string> {
  if (isDemo) {
    if (agente === "caixa") {
      gravar(K_PROPOSTAS, ler<PropostaAgente[]>(K_PROPOSTAS, []).map((p) => (p.id === id && p.estado === "aprovada" ? { ...p, estado: "executada" as const } : p)));
      return "Abri a conta para você.";
    }
    return agente === "conciliacao" ? "Aprovada. Na demonstração nada é conciliado." : "Aprovada. Na demonstração nada é enviado.";
  }
  try {
    const r = await fetch("/api/agentes/executar", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; estado?: string; erro?: string | null; motivo?: string };
    if (!r.ok || !j.ok) return `Aprovada. O envio fica para a execução diária: ${j.motivo ?? "o servidor não respondeu"}.`;
    if (j.estado === "executada") {
      if (agente === "caixa") return "Abri a conta para você.";
      return j.erro ? `Feita. ${j.erro}` : (agente === "conciliacao" ? "Feita: o título foi conciliado com o extrato." : "Feita: a cobrança saiu.");
    }
    if (j.estado === "falhou") return `Não deu certo. ${j.erro ?? ""}`.trim();
    return "Aprovada.";
  } catch {
    return "Aprovada. O envio fica para a execução diária.";
  }
}

/**
 * O "runner" da demonstração: com o agente de cobrança ligado, propõe a
 * cobrança do dia com o mesmo núcleo do servidor e expira a de outro dia.
 */
async function simularCobrancaNaDemo(): Promise<void> {
  if (!isDemo) return;
  const cfg = (await listarAgentes()).find((c) => c.agente === "cobranca");
  if (!cfg?.ativo || cfg.nivel === 0) return;
  const [ctx, automacoes] = await Promise.all([contextoDaEmpresa(), listarAutomacoes()]);
  const regua = automacoes.find((a) => a.tipo === "regua_cobranca") ?? configPadraoAutomacao("regua_cobranca");
  const { propostas } = propostasDeCobranca(regua, ctx);
  const atuais = ler<(PropostaAgente & { chave?: string })[]>(K_PROPOSTAS, []);
  const vistas = new Set(atuais.map((p) => p.chave));
  const agora = new Date().toISOString();
  const expiradas = atuais.map((p) => (p.agente === "cobranca" && p.estado === "pendente" && p.chave && !propostaDoDia(p.chave, ctx.hoje)
    ? { ...p, estado: "expirada" as const, motivo: MOTIVO_EXPIRADA } : p));
  const novas = propostas.filter((p) => !vistas.has(p.chave)).map((p) => ({
    id: `demo-${p.chave}`, chave: p.chave, agente: "cobranca" as const, titulo: p.titulo, porque: p.porque, valor: p.valor,
    estado: "pendente" as const, criadaEm: agora, decididaEm: null, motivo: null,
  }));
  if (novas.length || expiradas.some((p, i) => p !== atuais[i])) gravar(K_PROPOSTAS, [...novas, ...expiradas]);
}

/**
 * O "runner" da demonstração para a conciliação: os MESMOS pares da aba
 * Conciliar viram propostas pelo mesmo núcleo do servidor. Nada é conciliado.
 */
async function simularConciliacaoNaDemo(): Promise<void> {
  if (!isDemo) return;
  const cfg = (await listarAgentes()).find((c) => c.agente === "conciliacao");
  if (!cfg?.ativo || cfg.nivel === 0) return;
  const conc = await getConciliacaoOF();
  if (!conc) return;
  const atuais = ler<(PropostaAgente & { chave?: string })[]>(K_PROPOSTAS, []);
  const vistas = new Set(atuais.map((p) => p.chave));
  const agora = new Date().toISOString();
  const novas = propostasDeConciliacao(conc.matches, { previstos: new Set(), extratos: new Set() })
    .filter((p) => !vistas.has(p.chave))
    .map((p) => ({
      id: `demo-${p.chave}`, chave: p.chave, agente: "conciliacao" as const, titulo: p.titulo, porque: p.porque, valor: p.valor,
      estado: "pendente" as const, criadaEm: agora, decididaEm: null, motivo: null,
    }));
  if (novas.length) gravar(K_PROPOSTAS, [...novas, ...atuais]);
}


/**
 * CONTAS A PAGAR: o fim da proposta aprovada, depois que o cadastro salvou.
 * Quem decide o desfecho é o BANCO, pela caixa de entrada gravada
 * (`agente_contas_pagar_concluir`). A caixa sobe para o servidor logo depois
 * de salvar (`store-org`), então a tela tenta de novo por alguns segundos; se
 * ainda não chegou, a proposta fica aprovada e o runner diário conclui.
 */
export async function concluirContaPagar(id: string, tentativas = 4): Promise<string> {
  if (isDemo) {
    concluirContaPagarNaDemo(id);
    return "Feita: a conta a pagar foi agendada.";
  }
  for (let i = 0; i < tentativas; i++) {
    const { data, error } = await createClient().rpc("agente_contas_pagar_concluir", { p_proposta: id });
    if (error) return `A conta foi salva, mas não consegui fechar a proposta: ${error.message}`;
    const r = (data ?? {}) as { estado?: string; erro?: string | null };
    if (r.estado === "executada") return "Feita: a conta a pagar foi agendada.";
    if (r.estado === "falhou") return `Não deu certo. ${r.erro ?? ""}`.trim();
    if (i < tentativas - 1) await new Promise((ok) => setTimeout(ok, 1500));
  }
  return "A conta foi salva. Fecho a proposta na próxima execução.";
}

function concluirContaPagarNaDemo(id: string): void {
  const atuais = ler<PropostaAgente[]>(K_PROPOSTAS, []);
  gravar(K_PROPOSTAS, atuais.map((p) => (p.id === id && p.estado === "aprovada"
    ? { ...p, estado: "executada" as const } : p)));
}

/**
 * O "runner" da demonstração para contas a pagar: o MESMO núcleo do servidor
 * (`propostasDeContasPagar`) sobre a caixa de entrada da demonstração.
 */
async function simularContasPagarNaDemo(): Promise<void> {
  if (!isDemo) return;
  const cfg = (await listarAgentes()).find((c) => c.agente === "contas_pagar");
  if (!cfg?.ativo || cfg.nivel === 0) return;
  const { decisoes } = lerEstadoCaixa();
  const pendentes = montarCaixaEntrada(documentosDaCaixa(), decisoes, "pendentes").itens.map((i) => i.documento);
  const chaves = new Set(pendentes.map((d) => d.chave));
  const atuais = ler<(PropostaAgente & { chave?: string })[]>(K_PROPOSTAS, []);
  let mudou = false;
  const revistas = atuais.map((p) => {
    if (p.agente !== "contas_pagar" || p.estado !== "pendente") return p;
    const entrada = typeof p.dados?.entrada === "string" ? p.dados.entrada : "";
    const desfecho = desfechoDoDocumento(entrada, chaves, decisoes);
    if (desfecho === "pendente") return p;
    mudou = true;
    return { ...p, estado: "expirada" as const, motivo: MOTIVO_DOCUMENTO[desfecho] };
  });
  const vistas = new Set(revistas.map((p) => p.chave));
  const agora = new Date().toISOString();
  const novas = propostasDeContasPagar(pendentes, vistas as Set<string>, agora.slice(0, 10)).map((p) => ({
    id: `demo-${p.chave}`, chave: p.chave, agente: "contas_pagar" as const, titulo: p.titulo, porque: p.porque, valor: p.valor,
    estado: "pendente" as const, criadaEm: agora, decididaEm: null, motivo: null, dados: p.dados as unknown as Record<string, unknown>,
  }));
  if (novas.length || mudou) gravar(K_PROPOSTAS, [...novas, ...revistas]);
}

/**
 * O "runner" da demonstração para o caixa: o MESMO núcleo do servidor
 * (`propostasDeCaixa`) sobre os dados da demonstração.
 */
async function simularCaixaNaDemo(): Promise<void> {
  if (!isDemo) return;
  const cfg = (await listarAgentes()).find((c) => c.agente === "caixa");
  if (!cfg?.ativo || cfg.nivel === 0) return;
  const ctx = await contextoDaEmpresa();
  const atuais = ler<(PropostaAgente & { chave?: string })[]>(K_PROPOSTAS, []);
  const { furo } = propostasDeCaixa(ctx.input, ctx.hoje, new Set());
  let mudou = false;
  const revistas = atuais.map((p) => {
    if (p.agente !== "caixa" || p.estado !== "pendente" || !p.chave) return p;
    const motivo = propostaDeCaixaVale(p.chave, furo, ctx.input);
    if (!motivo) return p;
    mudou = true;
    return { ...p, estado: "expirada" as const, motivo };
  });
  const vistas = new Set(revistas.map((p) => p.chave).filter((c): c is string => !!c));
  const agora = new Date().toISOString();
  const novas = propostasDeCaixa(ctx.input, ctx.hoje, vistas).propostas.map((p) => ({
    id: `demo-${p.chave}`, chave: p.chave, agente: "caixa" as const, titulo: p.titulo, porque: p.porque, valor: p.valor,
    estado: "pendente" as const, criadaEm: agora, decididaEm: null, motivo: null, dados: p.dados as unknown as Record<string, unknown>,
  }));
  if (novas.length || mudou) gravar(K_PROPOSTAS, [...novas, ...revistas]);
}
