"use client";

/**
 * Persistência dos orçamentos.
 *
 * ⚠️ Migrado do localStorage puro para `store-org` (tabela `org_state`): o
 * orçamento é ENTIDADE DE NEGÓCIO e vivia só no navegador — quem trocasse de
 * máquina ou limpasse o cache perdia o planejamento do ano, e dois usuários da
 * mesma empresa nunca viam o mesmo. O cache local continua, agora como cache.
 *
 * Síncrono de propósito: o select de orçamento do DRE/DFC precisa da lista na
 * hora, sem um estado de carregando que piscaria a cada troca de filtro.
 */
import type { Orcamento } from "@/core/orcamento";
import { ler, gravar as gravarOrg, CHAVES_ORG } from "@/lib/store-org";

const CHAVE = CHAVES_ORG.orcamentos;

export function listarOrcamentos(): Orcamento[] {
  return [...ler<Orcamento[]>(CHAVE, [])].sort((a, b) => b.periodo.de.localeCompare(a.periodo.de));
}

function gravar(l: Orcamento[]): void {
  gravarOrg(CHAVE, l);
}

export const orcamentoPorId = (id: string): Orcamento | null =>
  listarOrcamentos().find((o) => o.id === id) ?? null;

export function salvarOrcamento(o: Orcamento): Orcamento[] {
  const out = [o, ...listarOrcamentos().filter((x) => x.id !== o.id)];
  gravar(out);
  return out.sort((a, b) => b.periodo.de.localeCompare(a.periodo.de));
}

export function removerOrcamento(id: string): Orcamento[] {
  const out = listarOrcamentos().filter((o) => o.id !== id);
  gravar(out);
  return out;
}

export function duplicarOrcamento(id: string): Orcamento | null {
  const orig = orcamentoPorId(id);
  if (!orig) return null;
  const copia: Orcamento = {
    ...orig,
    id: `orc_${Date.now().toString(36)}`,
    nome: `${orig.nome} (cópia)`,
    criadoEm: new Date().toISOString().slice(0, 10),
  };
  salvarOrcamento(copia);
  return copia;
}
