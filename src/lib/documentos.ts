"use client";

/**
 * TABELA DE DOCUMENTOS — o caminho único das entidades que saíram da lista
 * inteira em `org_state` para uma tabela com UMA LINHA POR ITEM (Fase 3 do
 * plano, 03/11/2026).
 *
 * Toda tabela daqui tem a mesma forma (ver as migrations `*_morada_unica`):
 * `(org_id, id, dados jsonb, … colunas geradas de dados, excluido_em …)`. O
 * documento é `dados`, e é ele que a tela lê e grava; as colunas geradas são o
 * que o banco confere.
 *
 *  • produção → a tabela. A empresa vem do banco (`auth_org_id()`), a escrita
 *    exige o papel (`tem_permissao('lancar')`) e excluir é LÓGICO
 *    (`excluir_logico`, a lixeira). A recusa do banco sobe com a mensagem real.
 *  • demonstração → o navegador, pela chave antiga de `store-org` (congelada:
 *    em produção ela não é lida nem gravada).
 *
 * ⚠️ Gravar é UM item por vez. A lista inteira nunca é regravada: era isso
 * que fazia a última gravação vencer quando duas pessoas mexiam ao mesmo tempo.
 */
import { isDemo } from "@/lib/demo";
import { ler, gravar } from "@/lib/store-org";
import { TETO_LINHAS } from "@/lib/supabase/consulta";
import { excluirLogico, restaurarLogico } from "@/lib/exclusao";

/** As tabelas com esta forma. Uma nova entra aqui E na guarda `documentos-morada`. */
export type TabelaDocumento = "contratos" | "colaboradores";

async function cliente() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient();
}

const mensagem = (e: unknown): string => {
  const x = e as { message?: string; hint?: string } | null;
  return x?.message ? `${x.message}${x.hint ? ` ${x.hint}` : ""}` : "o banco recusou a gravação";
};

export interface Documentos<T extends { id: string }> {
  listar(): Promise<T[]>;
  gravar(doc: T): Promise<void>;
  excluir(id: string, motivo: string): Promise<void>;
  restaurar(doc: T): Promise<void>;
}

export function documentos<T extends { id: string }>(tabela: TabelaDocumento, chaveDemo: string): Documentos<T> {
  const lerDemo = () => ler<T[]>(chaveDemo, []);
  return {
    async listar() {
      if (isDemo) return lerDemo();
      const s = await cliente();
      const { data, error } = await s.from(tabela).select("dados").limit(TETO_LINHAS);
      if (error) throw new Error(mensagem(error));
      return ((data ?? []) as { dados: T }[]).map((r) => r.dados);
    },
    async gravar(doc) {
      if (!doc.id) throw new Error("o item não tem identificador");
      if (isDemo) {
        gravar(chaveDemo, [doc, ...lerDemo().filter((x) => x.id !== doc.id)]);
        return;
      }
      const s = await cliente();
      const { error } = await s.from(tabela).upsert({ id: doc.id, dados: doc }, { onConflict: "org_id,id" });
      if (error) throw new Error(mensagem(error));
    },
    async excluir(id, motivo) {
      if (isDemo) {
        gravar(chaveDemo, lerDemo().filter((x) => x.id !== id));
        return;
      }
      await excluirLogico(tabela, id, motivo);
    },
    async restaurar(doc) {
      if (isDemo) {
        gravar(chaveDemo, [doc, ...lerDemo().filter((x) => x.id !== doc.id)]);
        return;
      }
      await restaurarLogico(tabela, doc.id);
    },
  };
}
