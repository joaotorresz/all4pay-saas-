import { problemasDoDevedor, type DevedorCobranca } from "@/core/pinbank/cobranca";

/**
 * COBRANÇA PELA CONTA BANCÁRIA DA EMPRESA — o contrato NEUTRO
 * (`cobranca-banco/1.0.0`), comum a todo banco que emite boleto e Pix.
 *
 * A Pinbank foi o primeiro provedor (`core/pinbank/cobranca`); o Inter é o
 * segundo (`./inter`) e o Itaú o terceiro (`docs/rodada-11/cobranca-itau.md`). Todos
 * recebem o MESMO pedido (o que a reserva leu do título) e devolvem o MESMO
 * resultado, para a tela, a régua e a baixa não saberem qual banco cobrou.
 *
 * ⚠️ **Valor, vencimento e pagador vêm da RESERVA, nunca da tela** — a mesma
 * regra da Pinbank: o pedido da tela só diz QUAL título e QUAL tipo.
 *
 * ⚠️ **As quatro respostas que importam, e o que cada uma deixa fazer:**
 *   - `emitida`     → o dado para o cliente pagar existe; mostrar e mandar.
 *   - `processando` → o banco ACEITOU e deu o id, mas ainda monta o boleto;
 *                     consultar de novo pelo id, NUNCA pedir outra.
 *   - `incerta`     → o pedido pode ter criado algo e não sabemos o id;
 *                     procurar pelo nosso número antes de qualquer coisa.
 *   - `falhou`      → recusa clara; nada foi criado, pode tentar de novo.
 * Tratar `processando` ou `incerta` como `falhou` cobraria o cliente duas vezes.
 */

export const VERSAO_COBRANCA_BANCO = "cobranca-banco/1.0.0";

/** Quem emite. Novo provedor entra aqui E ganha o seu leitor puro. */
export type ProvedorCobranca = "pinbank" | "inter" | "itau";
export const PROVEDORES_COBRANCA: readonly ProvedorCobranca[] = ["pinbank", "inter", "itau"];

export const NOME_DO_PROVEDOR: Record<ProvedorCobranca, string> = {
  pinbank: "Pinbank",
  inter: "Banco Inter",
  itau: "Itaú",
};

/**
 * Os bancos que a EMPRESA conecta com a credencial dela (Integrações). A
 * Pinbank fica de fora: quem liga a conta Pinbank é a plataforma. A mesma
 * lista mora no CHECK de `cobranca_banco_conexoes.provedor`.
 */
export type BancoConectavel = Exclude<ProvedorCobranca, "pinbank">;
export const BANCOS_CONECTAVEIS: readonly BancoConectavel[] = ["inter", "itau"];

/**
 * Os que JÁ emitem: conectar e cobrar só abre para estes. Um banco entra aqui
 * na mesma PR que traz a porta de rede dele — antes disso, aceitá-lo deixaria
 * guardar uma credencial que nada sabe usar.
 */
export const BANCOS_QUE_EMITEM: readonly BancoConectavel[] = ["inter"];

export function lerBancoConectavel(v: unknown): BancoConectavel | null {
  return typeof v === "string" && (BANCOS_CONECTAVEIS as readonly string[]).includes(v) ? (v as BancoConectavel) : null;
}

export function bancoEmite(b: BancoConectavel): boolean {
  return BANCOS_QUE_EMITEM.includes(b);
}

/** O que se cobra. `boleto_pix` é o boleto com o QR do Pix impresso (o "bolepix"). */
export type TipoCobrancaBanco = "pix" | "boleto" | "boleto_pix";

export type { DevedorCobranca };

/** O pedido neutro: tudo o que um banco precisa, lido do título pela reserva. */
export interface PedidoCobrancaBanco {
  tipo: TipoCobrancaBanco;
  /**
   * O NOSSO número da cobrança (até 15 caracteres, só letras e dígitos). É o
   * que permite achar no banco uma cobrança cujo pedido ficou sem resposta.
   */
  seuNumero: string;
  /** Em reais, com centavos. */
  valor: number;
  /** AAAA-MM-DD. */
  vencimento: string;
  descricao: string | null;
  devedor: DevedorCobranca | null;
}

export type ResultadoCobrancaBanco =
  | {
      situacao: "emitida";
      idProvedor: string;
      linhaDigitavel: string | null;
      codigoBarras: string | null;
      pixCopiaECola: string | null;
      txid: string | null;
    }
  | { situacao: "processando"; idProvedor: string }
  | {
      situacao: "paga";
      idProvedor: string;
      valorRecebido: number;
      origem: "boleto" | "pix" | "desconhecida";
      /** O banco marcou como recebido por fora (a pessoa baixou no app do banco): o dinheiro pode não ter passado pela cobrança. */
      marcadaManualmente: boolean;
      dataHora: string | null;
    }
  | { situacao: "cancelada"; idProvedor: string; motivo: string }
  | { situacao: "falhou" | "incerta"; motivo: string };

const SEU_NUMERO = /^[A-Za-z0-9]{1,15}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * O que impede emitir este pedido, em frase. Vazio = pode emitir.
 * O boleto (com ou sem Pix) pede o endereço do pagador; o Pix sozinho, não.
 */
export function problemasDoPedido(p: PedidoCobrancaBanco): string[] {
  const out: string[] = [];
  if (!SEU_NUMERO.test(p.seuNumero)) out.push("O número da cobrança tem de ter de 1 a 15 letras ou dígitos.");
  if (!(Number.isFinite(p.valor) && p.valor >= 2.5)) out.push("O valor mínimo de uma cobrança é R$ 2,50.");
  if (!DATA.test(p.vencimento)) out.push("O vencimento do título não é uma data legível.");
  out.push(...problemasDoDevedor(p.tipo === "pix" ? "pix" : "boleto", p.devedor));
  return out;
}

/**
 * O nosso número a partir do id da reserva: 15 caracteres, só hexadecimais.
 * Determinístico — a MESMA reserva gera o MESMO número, que é o que deixa
 * procurar no banco a cobrança de um pedido que ficou sem resposta.
 */
export function seuNumeroDaReserva(idReserva: string): string {
  const hex = idReserva.toLowerCase().replace(/[^0-9a-f]/g, "");
  if (hex.length < 15) throw new Error("Id de reserva curto demais para o número da cobrança.");
  return hex.slice(0, 15);
}

/** Pode mostrar ao cliente? Só a emitida tem o que pagar. */
export function temOQuePagar(r: ResultadoCobrancaBanco): boolean {
  return r.situacao === "emitida" && !!(r.linhaDigitavel || r.pixCopiaECola);
}

/** Pode pedir uma NOVA cobrança para o mesmo título? Só depois de recusa clara ou cancelamento. */
export function podeEmitirDeNovo(r: ResultadoCobrancaBanco): boolean {
  return r.situacao === "falhou" || r.situacao === "cancelada";
}

export const FRASE_DA_SITUACAO_BANCO: Record<ResultadoCobrancaBanco["situacao"], string> = {
  emitida: "Pronta para enviar ao cliente.",
  processando: "O banco aceitou e está montando a cobrança.",
  paga: "Paga.",
  cancelada: "Cancelada.",
  falhou: "O banco recusou; corrija e gere de novo.",
  incerta: "O banco não confirmou. Ela pode existir, então nada novo é gerado até a conferência.",
};
