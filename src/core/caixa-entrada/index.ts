/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAIXA DE ENTRADA DE CONTAS A PAGAR — o que CHEGOU e ainda não virou conta
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Três portas trazem cobrança para dentro da empresa, e cada uma tinha a sua
 * lista: o documento lido por OCR (o wizard de upload), o boleto capturado pelo
 * DDA e a nota fiscal que a SEFAZ entregou. Nenhuma das três dizia QUANTOS
 * papéis estavam esperando decisão — e papel que ninguém conta é papel que
 * vence na gaveta.
 *
 * Este motor NÃO guarda documento nenhum: ele junta as três fontes que já
 * existem (cada uma continua sendo a morada do seu documento) e sobrepõe a
 * DECISÃO tomada sobre cada um — virou conta, ou foi descartado com motivo.
 *
 * ⚠️ **DESCARTAR EXIGE MOTIVO, e o motivo fica.** Um descarte sem razão é
 * indistinguível de um clique errado, e a pergunta que aparece três semanas
 * depois ("por que este boleto não foi pago?") não tem resposta. O descartado
 * não some: fica num filtro próprio, com quem, quando e por quê.
 *
 * ⚠️ **A CHAVE É A IDENTIDADE DO DOCUMENTO, não o id da linha.** O boleto é o
 * código de barras; a nota é a chave de acesso. Sem isso, o mesmo boleto
 * capturado de novo pelo DDA voltaria para a fila como se fosse novo, e a
 * decisão já tomada sobre ele seria ignorada.
 *
 * A QUARTA porta é o e-mail (`./email.ts`): as mensagens que chegam no
 * endereço da empresa entram na mesma fila, com a mesma decisão — e, como as
 * outras três, não escrevem conta nenhuma.
 *
 * Puro, tipado, sem relógio (o "quando" entra por parâmetro). `caixa-entrada/1.0.0`.
 */
import type { BoletoRecebido, NFRecebida } from "@/core/compras";
import { documentoDoEmail, type MensagemEmail } from "./email";

export const CAIXA_ENTRADA_VERSION = "caixa-entrada/1.0.0";

/** De onde o documento chegou. */
export type OrigemEntrada = "ocr" | "dda" | "sefaz" | "email";

export const ROTULO_ORIGEM: Record<OrigemEntrada, string> = {
  ocr: "Documento lido",
  dda: "Boleto (DDA)",
  sefaz: "Nota fiscal (SEFAZ)",
  email: "E-mail recebido",
};

/** Um documento que chegou — a forma comum às três fontes. */
export interface DocumentoEntrada {
  /** Identidade do documento (ver o topo do arquivo). */
  chave: string;
  origem: OrigemEntrada;
  /** Id do registro na fonte (boleto, nota ou documento lido). */
  refId: string;
  fornecedor: string;
  /** CNPJ/CPF, quando a fonte traz. */
  documento: string | null;
  valor: number;
  vencimento: string | null;
  emissao: string | null;
  /** Número do documento (NF, nosso número…), quando há. */
  numero: string | null;
  descricao: string;
  categoria: string | null;
  recebidoEm: string;
  /** Só na fonte e-mail: o que a tela mostra para a pessoa reconhecer a mensagem. */
  assunto?: string | null;
  remetente?: string | null;
  /** Quantos anexos a mensagem trouxe (os arquivos moram no Storage). */
  anexos?: number;
}

/** Um documento lido por OCR que a pessoa deixou para decidir depois. */
export type DocumentoOCR = Omit<DocumentoEntrada, "chave" | "origem"> & { origem?: "ocr" };

export type AcaoEntrada = "convertido" | "descartado";

export interface DecisaoEntrada {
  chave: string;
  acao: AcaoEntrada;
  /** Obrigatório no descarte; nulo na conversão. */
  motivo: string | null;
  /** Referência da conta criada (número do documento ou id), quando se sabe. */
  referencia: string | null;
  quando: string;
  quem: string | null;
  /** Retrato do documento no momento da decisão — o descartado continua legível. */
  documento: DocumentoEntrada;
}

export interface EstadoCaixaEntrada {
  ocr: DocumentoOCR[];
  decisoes: DecisaoEntrada[];
}

export const ESTADO_VAZIO: EstadoCaixaEntrada = { ocr: [], decisoes: [] };

/**
 * O piso do motivo. Dez caracteres barram o vazio E a sigla de fachada ("ok",
 * "dup") — sem transformar a regra num formulário. É o mesmo raciocínio do
 * motivo de revisão administrativa: o banco cobra 20; aqui é uma decisão
 * operacional, e 10 bastam para uma frase ("já pago em 12/09").
 */
export const MOTIVO_MINIMO = 10;

const soDig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export const chaveBoleto = (b: BoletoRecebido): string =>
  `dda:${soDig(b.leitura.codigoBarras) || b.id}`;
export const chaveNF = (n: NFRecebida): string =>
  n.chave?.chave ? `nfe:${soDig(n.chave.chave)}` : `nf:${n.id}`;
export const chaveOCR = (refId: string): string => `ocr:${refId}`;

/**
 * As três fontes na forma comum — SÓ o que ainda pode virar conta.
 *
 * ⚠️ O que fica de fora, e por quê:
 *  - boleto PAGO: não há o que agendar, o dinheiro já saiu;
 *  - boleto já LANÇADO (`movimentoId`): já é conta — a decisão foi tomada pela
 *    porta antiga, e contá-lo aqui faria o mesmo boleto virar duas contas;
 *  - nota CANCELADA, DUPLICADA ou com ERRO de chave: não é cobrança válida;
 *  - nota RECUSADA na avaliação: alguém já disse que não é da empresa.
 */
export function documentosDasFontes(f: {
  boletos: readonly BoletoRecebido[];
  nfs: readonly NFRecebida[];
  ocr: readonly DocumentoOCR[];
  /**
   * As mensagens que chegaram no endereço de e-mail da empresa
   * (`caixa_email_mensagens`). Opcional: quem não liga a porta do e-mail não
   * tem o que passar, e as outras três fontes seguem iguais.
   */
  emails?: readonly MensagemEmail[];
}): DocumentoEntrada[] {
  const out: DocumentoEntrada[] = [];
  const vistas = new Set<string>();
  const add = (d: DocumentoEntrada) => {
    if (vistas.has(d.chave)) return;
    vistas.add(d.chave);
    out.push(d);
  };
  for (const b of f.boletos) {
    if (b.pago || b.movimentoId) continue;
    add({
      chave: chaveBoleto(b), origem: "dda", refId: b.id,
      fornecedor: b.beneficiario, documento: null,
      valor: b.leitura.valor, vencimento: b.leitura.vencimento ?? null,
      emissao: null, numero: null,
      descricao: `Boleto ${b.beneficiario}`, categoria: null,
      recebidoEm: b.recebidoEm,
    });
  }
  for (const n of f.nfs) {
    if (n.status === "cancelada" || n.status === "duplicada" || n.status === "erro") continue;
    if (n.avaliacao === "recusada") continue;
    add({
      chave: chaveNF(n), origem: "sefaz", refId: n.id,
      fornecedor: n.fornecedor, documento: soDig(n.cnpj) || null,
      valor: n.valor, vencimento: null,
      emissao: n.emissao ?? null, numero: n.numero || null,
      descricao: `NF ${n.numero} · ${n.fornecedor}`, categoria: n.categoria || null,
      recebidoEm: n.emissao,
    });
  }
  for (const o of f.ocr) add({ ...o, origem: "ocr", chave: chaveOCR(o.refId) });
  // ⚠️ A chave é `email:<id da mensagem>`: o reenvio do provedor já foi
  // barrado no banco (índice único pelo Message-ID), então o id É a identidade
  // do documento — a decisão tomada sobre ele não se perde.
  for (const m of f.emails ?? []) add(documentoDoEmail(m));
  return out;
}

export type FiltroCaixa = "pendentes" | "descartados" | "convertidos";

export interface ItemCaixa {
  documento: DocumentoEntrada;
  decisao: DecisaoEntrada | null;
}

export interface CaixaEntrada {
  itens: ItemCaixa[];
  contagem: Record<FiltroCaixa, number>;
  /** Soma do que espera decisão — o número que acompanha o contador. */
  valorPendente: number;
}

/**
 * A fila, recortada pelo filtro.
 *
 * ⚠️ O DESCARTADO e o CONVERTIDO continuam listáveis mesmo quando a fonte
 * deixou de trazê-los (o boleto foi pago, a nota cancelada): a decisão carrega
 * o retrato do documento. Sem isso, o filtro "descartados" perderia exatamente
 * a linha que alguém vai procurar para entender por que um pagamento não saiu.
 */
export function montarCaixaEntrada(
  docs: readonly DocumentoEntrada[],
  decisoes: readonly DecisaoEntrada[],
  filtro: FiltroCaixa = "pendentes",
): CaixaEntrada {
  const ultima = new Map<string, DecisaoEntrada>();
  for (const d of decisoes) ultima.set(d.chave, d);
  const pendentes: ItemCaixa[] = [];
  for (const doc of docs) if (!ultima.has(doc.chave)) pendentes.push({ documento: doc, decisao: null });
  const decididos = Array.from(ultima.values());
  const por = (a: AcaoEntrada) => decididos
    .filter((d) => d.acao === a)
    .sort((x, y) => y.quando.localeCompare(x.quando))
    .map((d) => ({ documento: d.documento, decisao: d }));
  pendentes.sort((a, b) =>
    (a.documento.vencimento ?? "9999").localeCompare(b.documento.vencimento ?? "9999"));
  const listas: Record<FiltroCaixa, ItemCaixa[]> = {
    pendentes, descartados: por("descartado"), convertidos: por("convertido"),
  };
  const valorPendente = Math.round(pendentes.reduce((s, i) => s + i.documento.valor, 0) * 100) / 100;
  return {
    itens: listas[filtro],
    contagem: {
      pendentes: pendentes.length,
      descartados: listas.descartados.length,
      convertidos: listas.convertidos.length,
    },
    valorPendente,
  };
}

export type Resultado<T> = { ok: true; estado: T } | { ok: false; erro: string };

/**
 * Descarta com MOTIVO. Recusa — não corrige — o motivo curto: completar com
 * "descartado" por conta própria fabricaria justamente a razão de fachada que
 * a regra existe para impedir.
 */
export function descartarEntrada(
  estado: EstadoCaixaEntrada,
  doc: DocumentoEntrada,
  motivo: string,
  quando: string,
  quem: string | null = null,
): Resultado<EstadoCaixaEntrada> {
  const m = (motivo ?? "").trim();
  if (m.length < MOTIVO_MINIMO) {
    return {
      ok: false,
      erro: `Diga por que este documento não vira conta (mínimo de ${MOTIVO_MINIMO} caracteres). O motivo fica guardado e aparece no filtro "descartados".`,
    };
  }
  if (estado.decisoes.some((d) => d.chave === doc.chave)) {
    return { ok: false, erro: "Este documento já tem uma decisão registrada." };
  }
  return {
    ok: true,
    estado: {
      ...estado,
      decisoes: [...estado.decisoes, { chave: doc.chave, acao: "descartado", motivo: m, referencia: null, quando, quem, documento: doc }],
    },
  };
}

/** Marca como convertido em conta a pagar — chamado DEPOIS que a conta foi gravada. */
export function converterEntrada(
  estado: EstadoCaixaEntrada,
  doc: DocumentoEntrada,
  referencia: string | null,
  quando: string,
  quem: string | null = null,
): EstadoCaixaEntrada {
  if (estado.decisoes.some((d) => d.chave === doc.chave)) return estado;
  return {
    ...estado,
    decisoes: [...estado.decisoes, { chave: doc.chave, acao: "convertido", motivo: null, referencia, quando, quem, documento: doc }],
  };
}

/**
 * Os campos que o formulário de conta a pagar recebe já preenchidos.
 *
 * ⚠️ Sem vencimento (a nota fiscal não traz), o formulário abre no vencimento
 * VAZIO — e não na data de emissão. Preencher com a emissão faria toda nota
 * nascer vencida no dia em que chegou, e o preenchimento automático viraria um
 * erro que a pessoa tem de lembrar de corrigir.
 */
export function camposDoFormulario(doc: DocumentoEntrada): Record<string, string> {
  const q: Record<string, string> = {
    entrada: doc.chave,
    fornecedor: doc.fornecedor,
    descricao: doc.descricao,
  };
  // ⚠️ Valor desconhecido (o e-mail sem linha digitável que confira) abre o
  // campo VAZIO, não com "0": um zero preenchido passa como valor informado.
  if (doc.valor > 0) q.valor = String(doc.valor);
  if (doc.documento) q.doc = doc.documento;
  if (doc.vencimento) q.vencimento = doc.vencimento;
  if (doc.emissao) q.competencia = doc.emissao.slice(0, 10);
  if (doc.numero) q.numero = doc.numero;
  return q;
}

export {
  tokenDoDestinatario, anexosAceitos, documentoDoEmail, chaveEmail, boletoNoTexto,
  type MensagemEmail,
} from "./email";
