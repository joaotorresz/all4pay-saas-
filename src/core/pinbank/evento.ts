/**
 * O que a Pinbank manda — lido, saneado e consolidado. Puro, tipado, sem I/O.
 *
 * Toda entrega do webhook é um ENVELOPE (`EventType`, `EventId`, `EntityId`,
 * `OccurredAt`, `Data`). Os eventos `Compra.*` são as vendas e transações da
 * maquininha; todos compartilham a MESMA estrutura de `Data` e usam o NSU da
 * operação como `EntityId` — é por ele que os eventos de uma mesma venda se
 * encontram (Pendente → Aprovada → Cancelada…).
 *
 * ⚠️ **O VALOR CHEGA EM CENTAVOS.** `Data.valor = 500` é R$ 5,00. Ler como reais
 * multiplicaria toda venda da maquininha por cem no faturamento, no fluxo e no
 * DRE — e o número seria plausível o bastante para ninguém estranhar.
 *
 * ⚠️ **A ENTREGA É "AO MENOS UMA VEZ", E FORA DE ORDEM.** A Pinbank reentrega por
 * até 24h, com backoff. Uma `Aprovada` retentada pode chegar DEPOIS da
 * `Cancelada` da mesma venda. `consolidarStatus` faz o ciclo só andar para a
 * frente: um evento atrasado nunca ressuscita uma venda cancelada.
 */

export type StatusPinbank = "Pendente" | "Aprovada" | "Negada" | "Cancelada" | "Desfeita" | "Reembolsada";

const STATUS: readonly StatusPinbank[] = ["Pendente", "Aprovada", "Negada", "Cancelada", "Desfeita", "Reembolsada"];

/** Os eventos de venda/transação da maquininha que a integração consome. */
export const EVENTOS_COMPRA = [
  "Compra.TransacaoPendente",
  "Compra.TransacaoRealizada",
  "Compra.TransacaoNegada",
  "Compra.TransacaoCancelada",
  "Compra.TransacaoDesfeita",
  "Compra.TransacaoReembolsada",
  "Compra.PixCobrancaPendente",
  "Compra.PixTransferenciaRealizada",
  "Compra.PixTransferenciaNegada",
  "Compra.PixCobrancaInvalidada",
] as const;

/** O status que cada evento publica — quando `Data.status` não vier. */
const STATUS_DO_EVENTO: Record<(typeof EVENTOS_COMPRA)[number], StatusPinbank> = {
  "Compra.TransacaoPendente": "Pendente",
  "Compra.TransacaoRealizada": "Aprovada",
  "Compra.TransacaoNegada": "Negada",
  "Compra.TransacaoCancelada": "Cancelada",
  "Compra.TransacaoDesfeita": "Desfeita",
  "Compra.TransacaoReembolsada": "Reembolsada",
  "Compra.PixCobrancaPendente": "Pendente",
  "Compra.PixTransferenciaRealizada": "Aprovada",
  "Compra.PixTransferenciaNegada": "Negada",
  // ⚠️ "Desfeita" aqui é COBRANÇA ABANDONADA (QR Code que expirou antes de ser
  // pago), não dinheiro devolvido. Nunca houve venda, então não há o que desfazer.
  "Compra.PixCobrancaInvalidada": "Desfeita",
};

export const ehEventoDeCompra = (t: string): t is (typeof EVENTOS_COMPRA)[number] =>
  (EVENTOS_COMPRA as readonly string[]).includes(t);

export interface EnvelopePinbank {
  eventType: string;
  eventVersion: string;
  eventId: string;
  entityId: string;
  ocorridoEm: string;
  data: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);
const numero = (x: unknown): number | null => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
};

export type Leitura<T> = { ok: true; valor: T } | { ok: false; motivo: string };

/** O envelope, conferido campo a campo. Nada aqui confia no tipo declarado. */
export function lerEnvelope(corpo: unknown): Leitura<EnvelopePinbank> {
  if (!obj(corpo)) return { ok: false, motivo: "O corpo não é um objeto JSON." };
  const eventType = texto(corpo.EventType);
  const eventId = texto(corpo.EventId);
  const ocorridoEm = texto(corpo.OccurredAt);
  if (!eventType) return { ok: false, motivo: "Falta EventType no envelope." };
  // ⚠️ O EventId é a chave da idempotência. Sem um identificador confiável, o
  // reenvio da mesma entrega viraria uma segunda venda.
  if (!eventId || !UUID.test(eventId)) return { ok: false, motivo: "EventId ausente ou fora do formato UUID." };
  if (!ocorridoEm || Number.isNaN(Date.parse(ocorridoEm))) return { ok: false, motivo: "OccurredAt ausente ou ilegível." };
  if (!obj(corpo.Data)) return { ok: false, motivo: "Falta o bloco Data no envelope." };
  return {
    ok: true,
    valor: {
      eventType,
      eventVersion: texto(corpo.EventVersion) ?? "v1",
      eventId: eventId.toLowerCase(),
      entityId: texto(corpo.EntityId) ?? (typeof corpo.EntityId === "number" ? String(corpo.EntityId) : ""),
      ocorridoEm: new Date(ocorridoEm).toISOString(),
      data: corpo.Data,
    },
  };
}

/**
 * ⚠️ **DADO SENSÍVEL NÃO ENTRA NO BANCO.** A própria documentação marca como
 * sensíveis o BIN e o PAN (já mascarado) do cartão, a assinatura eletrônica do
 * portador, os dados do responsável pelo sub-estabelecimento e o documento da
 * subcredenciadora. O ERP não precisa de nenhum deles para lançar a venda, e
 * guardar o que não se usa é só aumentar o que pode vazar. Saem ANTES de o
 * evento ser gravado — o que fica é o suficiente para conferir a venda.
 */
export const CAMPOS_SENSIVEIS: readonly (readonly string[])[] = [
  ["cartao", "bin"],
  ["cartao", "pan"],
  ["assinaturaEletronica"],
  ["estabelecimento", "responsavel"],
  ["subCredenciadora", "cpfCnpj"],
];

export function semDadoSensivel(data: Record<string, unknown>): Record<string, unknown> {
  const copia = JSON.parse(JSON.stringify(data ?? {})) as Record<string, unknown>;
  for (const caminho of CAMPOS_SENSIVEIS) {
    let alvo: unknown = copia;
    for (let i = 0; i < caminho.length - 1; i++) alvo = obj(alvo) ? alvo[caminho[i]] : undefined;
    if (obj(alvo)) delete alvo[caminho[caminho.length - 1]];
  }
  return copia;
}

/** Como a venda foi paga — decide a taxa e o prazo do repasse. */
export type FormaPinbank = "debito" | "credito_vista" | "parcelado" | "voucher" | "pix" | "desconhecida";

export function formaDaTransacao(formaPagamento: string | null, ehPix: boolean, parcelas: number): FormaPinbank {
  if (ehPix) return "pix";
  const f = (formaPagamento ?? "").toUpperCase();
  if (f === "DEBITO") return "debito";
  if (f === "VOUCHER") return "voucher";
  if (f.startsWith("PARCELADO")) return parcelas > 1 ? "parcelado" : "credito_vista";
  if (f === "AVISTA") return "credito_vista";
  return "desconhecida";
}

export interface EstabelecimentoPinbank {
  /** `estabelecimento.id` — o id interno da loja na Pinbank. */
  id: number | null;
  /** `estabelecimento.chaveGateway` — a chave da loja no gateway. */
  chaveGateway: string | null;
  nome: string | null;
  /** O CNPJ/CPF chega MASCARADO (`915***46`) e por isso nunca serve de vínculo. */
  documentoMascarado: string | null;
}

export interface TransacaoPinbank {
  nsu: number;
  status: StatusPinbank;
  /** Em REAIS (o envelope manda centavos). Depois de estornos parciais. */
  valor: number;
  /** Em REAIS — o valor da venda antes de qualquer estorno parcial. */
  valorOriginal: number;
  forma: FormaPinbank;
  formaBruta: string | null;
  parcelas: number;
  bandeira: string | null;
  /** `POS`, `Online`, `TEF` ou `Não mapeada`. */
  tipoTransacao: string | null;
  /** `SWITCH_POS`, `ECOMMERCE`, `LINK_PAGAMENTO`… */
  origemCanal: string | null;
  /** Data da venda (AAAA-MM-DD), fatiada da string — nunca `new Date` (fuso). */
  dataVenda: string;
  ocorridoEm: string;
  estabelecimento: EstabelecimentoPinbank;
  autorizacao: string | null;
  nsuAdquirente: string | null;
  ehPix: boolean;
}

const centavosParaReais = (c: number) => Math.round(c) / 100;

/** A transação de um evento `Compra.*`. Recusa — com motivo — o que não fecha. */
export function transacaoDoEvento(env: EnvelopePinbank): Leitura<TransacaoPinbank> {
  if (!ehEventoDeCompra(env.eventType)) {
    return { ok: false, motivo: `O evento ${env.eventType} não é de venda da maquininha.` };
  }
  const d = env.data;
  const nsu = numero(d.nsu) ?? numero(env.entityId);
  if (nsu == null || nsu <= 0 || !Number.isInteger(nsu)) return { ok: false, motivo: "A transação chegou sem NSU." };
  // ⚠️ O NSU de `Data` e o `EntityId` do envelope são o MESMO valor pela
  // documentação. Divergindo, não há como saber de que venda o evento fala — e
  // escolher um dos dois em silêncio é como uma venda vira a outra.
  const nsuEnvelope = numero(env.entityId);
  if (nsuEnvelope != null && nsuEnvelope !== nsu) {
    return { ok: false, motivo: `NSU do evento (${nsu}) diferente do EntityId do envelope (${nsuEnvelope}).` };
  }
  const statusBruto = texto(d.status);
  const status = (STATUS as readonly string[]).includes(statusBruto ?? "")
    ? (statusBruto as StatusPinbank)
    : STATUS_DO_EVENTO[env.eventType];
  const valorCent = numero(d.valor);
  if (valorCent == null || valorCent < 0) return { ok: false, motivo: "A transação chegou sem valor." };
  const valorOriginalCent = numero(d.valorOriginal);
  const ehPix = env.eventType.startsWith("Compra.Pix");
  const parcelas = Math.max(1, Math.floor(numero(d.numeroParcelas) ?? 1));
  const formaBruta = texto(d.formaPagamento);
  const est = obj(d.estabelecimento) ? d.estabelecimento : {};
  const cartao = obj(d.cartao) ? d.cartao : {};
  const dataBruta = texto(d.data) ?? texto(d.dataCriacao) ?? env.ocorridoEm;
  return {
    ok: true,
    valor: {
      nsu,
      status,
      valor: centavosParaReais(valorCent),
      valorOriginal: centavosParaReais(valorOriginalCent != null && valorOriginalCent > 0 ? valorOriginalCent : valorCent),
      forma: formaDaTransacao(formaBruta, ehPix, parcelas),
      formaBruta,
      parcelas,
      bandeira: texto(cartao.bandeira),
      tipoTransacao: texto(d.tipoTransacao),
      origemCanal: texto(d.origem),
      dataVenda: /^\d{4}-\d{2}-\d{2}/.test(dataBruta) ? dataBruta.slice(0, 10) : env.ocorridoEm.slice(0, 10),
      ocorridoEm: env.ocorridoEm,
      estabelecimento: {
        id: numero(est.id),
        chaveGateway: texto(est.chaveGateway),
        nome: texto(est.nome) ?? texto(est.nomeRazaoSocial),
        documentoMascarado: texto(est.documento),
      },
      autorizacao: texto(d.codAutorizAdquirente),
      nsuAdquirente: texto(d.nsuAdquirente),
      ehPix,
    },
  };
}

/* ─────────────────────────── o ciclo da transação ─────────────────────────── */

/**
 * A ordem do ciclo. Uma venda nasce `Pendente`, vira `Aprovada` ou `Negada`, e
 * depois pode ser `Cancelada`/`Desfeita`; `Reembolsada` vem por último.
 */
const ETAPA: Record<StatusPinbank, number> = {
  Pendente: 0,
  Aprovada: 1,
  Negada: 2,
  Cancelada: 2,
  Desfeita: 2,
  Reembolsada: 3,
};

export interface EstadoStatus {
  status: StatusPinbank;
  ocorridoEm: string;
}

/**
 * O status que vale depois deste evento.
 *
 *   · etapa MAIOR vence — o ciclo só anda para a frente;
 *   · MESMA etapa: vence o mais recente (`OccurredAt`) — um segundo reembolso
 *     parcial atualiza o valor;
 *   · etapa MENOR nunca vence — é o evento atrasado de uma retentativa.
 *
 * ⚠️ É a regra que impede a `Aprovada` retentada de recriar a venda que a
 * `Cancelada` já desfez: na ordem de chegada ela é a última, mas no ciclo ela é
 * anterior, e é o ciclo que manda.
 */
export function consolidarStatus(atual: EstadoStatus | null, novo: EstadoStatus): EstadoStatus & { mudou: boolean } {
  if (!atual) return { ...novo, mudou: true };
  const a = ETAPA[atual.status];
  const n = ETAPA[novo.status];
  if (n > a) return { ...novo, mudou: true };
  if (n === a && novo.status !== atual.status) {
    return Date.parse(novo.ocorridoEm) > Date.parse(atual.ocorridoEm) ? { ...novo, mudou: true } : { ...atual, mudou: false };
  }
  if (n === a && Date.parse(novo.ocorridoEm) > Date.parse(atual.ocorridoEm)) return { ...novo, mudou: true };
  return { ...atual, mudou: false };
}
