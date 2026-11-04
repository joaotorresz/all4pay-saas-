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
 * proposta. O erro do banco sobe com a mensagem real.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { ler, gravar, CHAVES_ORG } from "@/lib/store-org";
import {
  IDS_AGENTE, configPadrao, type ConfigAgente, type EstadoProposta, type IdAgente, type NivelAgente,
  type PropostaAgente,
} from "@/core/agentes";

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
}

/** As propostas mais recentes (as pendentes primeiro na tela). */
export async function listarPropostas(): Promise<PropostaAgente[]> {
  if (isDemo) return ler<PropostaAgente[]>(K_PROPOSTAS, []);
  const { data, error } = await createClient()
    .from("agente_propostas")
    .select("id,agente,titulo,porque,valor,estado,criada_em,decidida_em,motivo")
    .order("criada_em", { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as LinhaProposta[]).map((l) => ({
    id: l.id, agente: l.agente as IdAgente, titulo: l.titulo, porque: l.porque,
    valor: l.valor == null ? null : Number(l.valor), estado: l.estado as EstadoProposta,
    criadaEm: l.criada_em, decididaEm: l.decidida_em, motivo: l.motivo,
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
