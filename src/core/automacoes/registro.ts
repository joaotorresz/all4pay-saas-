/**
 * O registro de envios EM MEMÓRIA — a demonstração (sem banco) e as guardas.
 *
 * ⚠️ Mesma semântica do banco, e só ela: chave única (org, tipo, chave, canal),
 * reserva que responde "já existe" em vez de sobrescrever, e retomada APENAS de
 * `falhou`/`simulado`. A trava de verdade, em produção, é o índice único de
 * `automacao_envios`; este espelho existe para a demonstração se comportar
 * igual e para a guarda poder plantar o defeito sem banco.
 */
import type { RegistroEnvios, ChaveEnvio } from "./index";
import type { StatusEnvio, TipoAutomacao, CanalEnvio } from "./tipos";

export interface LinhaEnvio {
  orgId: string;
  tipo: TipoAutomacao;
  chave: string;
  canal: CanalEnvio | "manual";
  destinoMascarado: string;
  status: StatusEnvio;
  provedorMsgId?: string | null;
  erro?: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

const RETOMAVEIS: StatusEnvio[] = ["falhou", "simulado"];
export const mesmaChave = (a: ChaveEnvio | LinhaEnvio, b: ChaveEnvio | LinhaEnvio) =>
  a.orgId === b.orgId && a.tipo === b.tipo && a.chave === b.chave && a.canal === b.canal;

export function registroEmMemoria(linhas: LinhaEnvio[], agora: () => string = () => new Date().toISOString()): RegistroEnvios {
  return {
    async reservar(k) {
      const existente = linhas.find((l) => mesmaChave(l, k));
      if (!existente) {
        const t = agora();
        linhas.push({ ...k, status: "pendente", criadoEm: t, atualizadoEm: t });
        return "reservado";
      }
      if (RETOMAVEIS.includes(existente.status)) {
        existente.status = "pendente";
        existente.erro = null;
        existente.atualizadoEm = agora();
        return "reservado";
      }
      return "ja_existe";
    },
    async concluir(k, r) {
      const l = linhas.find((x) => mesmaChave(x, k) && x.status === "pendente");
      if (!l) return;
      l.status = r.status;
      l.provedorMsgId = r.provedorMsgId ?? null;
      l.erro = r.erro ?? null;
      l.atualizadoEm = agora();
    },
  };
}
