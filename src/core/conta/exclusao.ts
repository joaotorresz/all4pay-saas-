/**
 * EXCLUIR A PRÓPRIA CONTA — a regra (exigência das lojas: Apple 5.1.1(v)).
 *
 * ⚠️ Excluir a CONTA não é excluir a EMPRESA. O que se apaga é o acesso da
 * pessoa (o usuário do Auth e os vínculos). Os lançamentos são da empresa e
 * a lei fiscal manda guardá-los: a empresa em que a pessoa era a única
 * participante fica guardada, sem acesso de ninguém, e a tela DIZ isso antes.
 *
 * ⚠️ Titular de empresa com outros participantes é RECUSADO: a empresa
 * ficaria sem quem administra plano, cobrança e convites. Transferir a
 * titularidade vem antes.
 */

export const CONFIRMACAO_EXCLUSAO = "EXCLUIR";

export type VinculoDaConta = {
  orgId: string;
  nome: string;
  papel: string;
  /** Quantas pessoas a empresa tem, contando quem pede. */
  participantes: number;
};

export type DecisaoExclusao =
  | { ok: true; empresasGuardadas: string[] }
  | { ok: false; codigo: "titular_com_equipe" | "administrador_da_plataforma" | "confirmacao"; motivo: string };

export function decidirExclusao(entrada: {
  vinculos: VinculoDaConta[];
  administradorDaPlataforma: boolean;
  confirmacao: string;
}): DecisaoExclusao {
  if (entrada.confirmacao.trim().toUpperCase() !== CONFIRMACAO_EXCLUSAO) {
    return { ok: false, codigo: "confirmacao", motivo: `Digite ${CONFIRMACAO_EXCLUSAO} para confirmar.` };
  }
  if (entrada.administradorDaPlataforma) {
    return {
      ok: false,
      codigo: "administrador_da_plataforma",
      motivo: "Esta conta administra a plataforma e não pode ser excluída por aqui. Fale com o suporte.",
    };
  }
  const travadas = entrada.vinculos.filter((v) => v.papel === "owner" && v.participantes > 1);
  if (travadas.length > 0) {
    const nomes = travadas.map((v) => v.nome).join(", ");
    return {
      ok: false,
      codigo: "titular_com_equipe",
      motivo: `Você é titular de ${nomes}, que tem outros participantes. Transfira a titularidade em Usuários antes de excluir a conta.`,
    };
  }
  return {
    ok: true,
    empresasGuardadas: entrada.vinculos.filter((v) => v.participantes <= 1).map((v) => v.nome),
  };
}
