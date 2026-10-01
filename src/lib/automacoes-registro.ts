/**
 * O REGISTRO DOS ENVIOS no banco (`automacao_envios`) — o adaptador que o
 * runner (chave de serviço) e as rotas com sessão usam.
 *
 * ⚠️ `reservar` é um INSERT com `on conflict do nothing` sobre o índice único
 * (org_id, tipo, chave, canal). Não há "ler antes para ver se existe": entre a
 * leitura e a escrita dois runners passariam juntos. Quem responde "já existe"
 * é o índice.
 *
 * ⚠️ A ÚNICA retomada permitida é de `falhou` ou `simulado` → `pendente`, num
 * UPDATE condicional (atômico por linha). `enviado`, `manual` e `pendente` não
 * se retomam: o primeiro já saiu, o segundo é a palavra de uma pessoa, e o
 * terceiro pode estar saindo agora noutro processo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegistroEnvios, ChaveEnvio } from "@/core/automacoes";

const RETOMAVEIS = ["falhou", "simulado"];

/**
 * `orgId` vazio = cliente COM SESSÃO: o `org_id` sai do padrão do banco
 * (`auth_org_id()`) e a RLS recorta a empresa. Com a chave de serviço, o
 * `orgId` é obrigatório — ela passa por fora da RLS.
 */
export function registroSupabase(db: SupabaseClient): RegistroEnvios {
  const filtro = (k: ChaveEnvio) => ({ ...(k.orgId ? { org_id: k.orgId } : {}), tipo: k.tipo, chave: k.chave, canal: k.canal });
  return {
    async reservar(k) {
      const linha = { ...filtro(k), destino_mascarado: k.destinoMascarado, status: "pendente" };
      // `count` (não `select`): a pergunta é SÓ "quantas linhas entraram".
      const { count, error } = await db.from("automacao_envios")
        .upsert(linha, { onConflict: "org_id,tipo,chave,canal", ignoreDuplicates: true, count: "exact" });
      if (error) throw error;
      if ((count ?? 0) > 0) return "reservado";
      const { count: retomadas, error: e2 } = await db.from("automacao_envios")
        .update({ status: "pendente", erro: null, destino_mascarado: k.destinoMascarado, atualizado_em: new Date().toISOString() }, { count: "exact" })
        .match(filtro(k)).in("status", RETOMAVEIS);
      if (e2) throw e2;
      return (retomadas ?? 0) > 0 ? "reservado" : "ja_existe";
    },
    async concluir(k, r) {
      const { error } = await db.from("automacao_envios")
        .update({ status: r.status, provedor_msg_id: r.provedorMsgId ?? null, erro: r.erro ?? null, atualizado_em: new Date().toISOString() })
        .match(filtro(k)).eq("status", "pendente");
      if (error) throw error;
    },
  };
}
