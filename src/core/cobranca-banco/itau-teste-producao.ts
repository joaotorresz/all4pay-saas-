import { problemasDoPedido, type PedidoCobrancaBanco } from "@/core/cobranca-banco";

/**
 * O TESTE EM PRODUÇÃO do Itaú — decisão do dono em 06/11/2026: o sandbox não
 * tem o cenário de emissão ligado ("cenário de teste não mapeado" até com o
 * JSON literal da doc), então o caminho se prova com UM boleto de verdade,
 * do valor mínimo, pago pelo próprio dono e baixado em seguida.
 *
 * Regras puras (a rota `/api/admin/itau-teste` só aplica):
 *  - o valor é SEMPRE o mínimo (R$ 2,50) e não vem do link;
 *  - o pagador vem do link (é o próprio dono) e passa pela conferência normal;
 *  - nada sai sem `confirmo=sim` no link (emitir e baixar).
 */
export const VALOR_DO_TESTE_EM_PRODUCAO = 2.5;
export const CONFIRMACAO_DO_TESTE_EM_PRODUCAO = "sim";

export function confirmouTesteEmProducao(param: (k: string) => string | null): boolean {
  return (param("confirmo") ?? "").trim().toLowerCase() === CONFIRMACAO_DO_TESTE_EM_PRODUCAO;
}

function somaDias(data: string, n: number): string {
  return new Date(Date.parse(`${data}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
}

/** O pedido do teste em produção, ou o que falta (em frase). */
export function pedidoDoTesteEmProducao(
  param: (k: string) => string | null,
  nossoNumero: string,
  hoje: string,
): { pedido: PedidoCobrancaBanco } | { erro: string } {
  if (!confirmouTesteEmProducao(param)) {
    return { erro: "Em produção o boleto é de verdade: acrescente confirmo=sim ao link para emitir." };
  }
  const v = (k: string) => (param(k) ?? "").trim();
  const faltam = ["nome", "documento", "cep", "logradouro", "numero_endereco", "bairro", "cidade", "uf"].filter((k) => !v(k));
  if (faltam.length) return { erro: `Falta no link: ${faltam.join(", ")}.` };
  const pedido: PedidoCobrancaBanco = {
    tipo: "boleto_pix",
    seuNumero: `TQ${nossoNumero}`,
    valor: VALOR_DO_TESTE_EM_PRODUCAO,
    vencimento: somaDias(hoje, 3),
    descricao: "Teste de integracao Quattro",
    devedor: {
      nome: v("nome"),
      documento: v("documento").replace(/\D/g, ""),
      email: null,
      telefone: null,
      cep: v("cep").replace(/\D/g, ""),
      logradouro: v("logradouro"),
      numero: v("numero_endereco"),
      complemento: null,
      bairro: v("bairro"),
      cidade: v("cidade"),
      uf: v("uf").toUpperCase(),
    },
  };
  const problemas = problemasDoPedido(pedido);
  return problemas.length ? { erro: problemas.join(" ") } : { pedido };
}
