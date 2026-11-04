/**
 * O OPT-IN DO CONTADOR — o destinatário confirma o próprio e-mail (Fase 3.4).
 *
 * O pacote mensal leva a escrituração fiscal da empresa; quem prova que o
 * endereço é dele é o contador, clicando no link que chega na caixa dele.
 * Em produção, o "verificado" vem SÓ de `contador_confirmacoes.confirmado_em`,
 * que só a rota do link grava (pelo token, que o app nunca lê). A lista de
 * destinatários continua na empresa; o campo `verificado` dela vale só na
 * demonstração ("Simular confirmação").
 */
import type { DestinatarioContador } from "./index";

/** O link vale uma semana; depois, a empresa pede outro. */
export const PRAZO_LINK_DIAS = 7;
/** Pedir o link de novo para o mesmo destinatário: no máximo a cada 10 minutos. */
export const INTERVALO_REENVIO_MIN = 10;

/** O interruptor (leitor único): sem `CONTADOR_OPTIN=ligado`, nenhum link sai. */
export function optinContadorLigado(env: Record<string, string | undefined> = process.env): boolean {
  return env.CONTADOR_OPTIN === "ligado";
}

export interface ConfirmacaoContador {
  dest_id: string;
  email: string;
  pedido_em: string;
  confirmado_em: string | null;
}

/**
 * A lista que a tela mostra em PRODUÇÃO: o `verificado` sai da confirmação do
 * MESMO destinatário com o MESMO e-mail (trocar o e-mail exige confirmar de
 * novo). O valor gravado na lista é ignorado.
 */
export function mesclarConfirmacoes(
  destinatarios: readonly DestinatarioContador[],
  confirmacoes: readonly ConfirmacaoContador[],
): (DestinatarioContador & { linkPedidoEm: string | null })[] {
  return destinatarios.map((d) => {
    const c = confirmacoes.find((x) => x.dest_id === d.id && x.email.toLowerCase() === d.email.toLowerCase());
    return {
      ...d,
      verificado: !!c?.confirmado_em,
      verificadoEm: c?.confirmado_em ?? null,
      linkPedidoEm: c?.pedido_em ?? null,
    };
  });
}

/** O e-mail do link. Texto puro: nada da empresa além do nome. */
export function emailDoLink(empresa: string, link: string): { assunto: string; texto: string } {
  return {
    assunto: `Confirme o envio das notas fiscais de ${empresa}`,
    texto: [
      `${empresa} cadastrou este e-mail como destinatário das notas fiscais da empresa (XML de entrada e de saída) no Quattro.`,
      "",
      "Se você é o contador ou trabalha no escritório que atende a empresa, confirme pelo link abaixo:",
      link,
      "",
      `O link vale ${PRAZO_LINK_DIAS} dias. Se você não reconhece este pedido, ignore este e-mail: sem a confirmação, nada é enviado para cá.`,
    ].join("\n"),
  };
}
