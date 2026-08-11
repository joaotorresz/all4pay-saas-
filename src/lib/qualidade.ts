"use client";

/**
 * A PONTE ENTRE O MOTOR DE QUALIDADE E OS DADOS REAIS.
 *
 * ⚠️ Ela monta a base a auditar a partir dos MESMOS acessores que o resto do
 * produto usa (`getRiscoInput`, `listParties`, `listProducts`), e não de uma
 * consulta própria. Uma auditoria que lê por um caminho diferente do que a tela
 * lê audita outra coisa — e a divergência aparece como "a tela mostra o
 * problema, o painel diz que está limpo", que é pior que não auditar.
 */
import { getRiscoInput } from "@/lib/data";
import { listParties, listProducts } from "@/lib/cadastros";
import { loadCompany } from "@/lib/company";
import {
  auditarQualidade, type BaseParaAuditar, type RelatorioQualidade,
} from "@/core/qualidade";

/** Categorias e centros vêm resolvidos por NOME no `RiskInput`. */
export async function montarBaseDeQualidade(): Promise<BaseParaAuditar> {
  const [input, partes, produtos] = await Promise.all([
    getRiscoInput(),
    listParties().catch(() => []),
    listProducts().catch(() => []),
  ]);
  const empresa = loadCompany();
  const db = (empresa?.db ?? {}) as Record<string, string>;

  // ⚠️ As categorias saem dos PRÓPRIOS lançamentos, por nome, e não de uma
  // consulta a `categories`: é assim que o DRE as enxerga, e é a leitura do DRE
  // que produz o número que vai para fora. Auditar a tabela e não o uso deixaria
  // de fora exatamente a categoria órfã que ninguém cadastrou e que a
  // importação criou no ato de gravar o lançamento.
  const nomes = new Map<string, "receita" | "despesa">();
  for (const m of input.movements) {
    const c = (m.category ?? "").trim();
    if (!c) continue;
    nomes.set(c, m.type === "entrada" ? "receita" : "despesa");
  }

  return {
    lancamentos: input.movements.map((m) => ({
      id: m.id,
      tipo: m.type,
      situacao: m.status,
      valor: Math.abs(m.amount),
      categoria: m.category ?? null,
      contraparteId: m.party_id ?? null,
      centroCustoId: m.costCenter ? String(m.costCenter) : null,
      origem: (m as { origem?: string | null }).origem ?? null,
      especie: (m as { especie?: string | null }).especie ?? null,
    })),
    contrapartes: partes.map((p) => ({
      id: p.id,
      nome: p.name,
      documento: p.doc ?? null,
      ehCliente: p.is_customer ?? undefined,
      ehFornecedor: p.is_supplier ?? undefined,
    })),
    categorias: Array.from(nomes.entries()).map(([nome, natureza]) => ({
      id: `cat:${nome}`, nome, natureza,
    })),
    produtos: produtos.map((p) => ({
      id: p.id,
      nome: p.name,
      codigo: (p as { sku?: string | null }).sku ?? null,
    })),
    documentoDaOrganizacao: db.cnpj ?? db.documento ?? null,
    nomeDaOrganizacao: db.razaoSocial ?? db.nomeFantasia ?? null,
  };
}

export async function auditarOrganizacao(): Promise<RelatorioQualidade> {
  return auditarQualidade(await montarBaseDeQualidade());
}
