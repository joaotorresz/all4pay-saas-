/**
 * O REGISTRO PELA CONVERSA: o que a Quattro AI precisa para transformar uma
 * frase ("gastei 100 de gasolina") ou uma foto (boleto, comprovante, nota)
 * numa proposta de lançamento — e, quando a pessoa confirma, gravá-la.
 *
 * ⚠️ UM ESCRITOR SÓ: a confirmação passa por `confirmarDocumento`, o mesmo do
 * "Upload de dados". A conversa não ganhou caminho de escrita próprio, ganhou
 * uma porta nova para o caminho que já existe — e a porta só abre no clique
 * em "Confirmar" (decisão do dono, 19/10/2026: a IA propõe, a pessoa confirma).
 */
import { listParties } from "@/lib/cadastros";
import type { Party, Movement } from "@/lib/types";
import { getOpenMovements, getRiscoInput } from "@/lib/data";
import { lerDocumento, ocrConfigurado } from "@/lib/ocr-ingest";
import { analisarDocumento, confirmarDocumento, ACAO_MAP, type AcaoFinal, type AnaliseDocumento, type ResultadoConfirmacao } from "@/lib/upload-doc";
import { anexarComprovante } from "@/lib/pagamentos";
import { formatBRL } from "@/lib/format";
import type { PropostaFalada } from "@/core/assistant/lancamento-falado";

/** O que a conversa guarda da proposta: a análise e o que a pessoa ajustou. */
export interface PropostaChat {
  analise: AnaliseDocumento;
  acao: AcaoFinal;
  categoria: string;
  /** ISO: vencimento (a pagar/receber) ou o dia em que aconteceu. */
  data: string;
  valor: number;
  descricao: string;
  origem: "manual" | "importacao";
  /** Nome do arquivo da foto, anexado ao lançamento como comprovante. */
  arquivo?: string;
  criarContato: boolean;
  estado: "aberta" | "gravando" | "gravada" | "cancelada" | "falhou";
  /** O que aconteceu, dito na conversa depois do clique. */
  desfecho?: string;
}

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** A frase dita vira a mesma análise que um documento lido produziria. */
export function propostaDaFala(p: PropostaFalada): PropostaChat {
  const acao: AcaoFinal = p.pago ? (p.tipo === "saida" ? "Paguei" : "Recebi") : (p.tipo === "saida" ? "Vou pagar" : "Vou receber");
  const analise: AnaliseDocumento = {
    fields: {
      tipo: p.descricao, beneficiario: null, pagador: null, valor: p.valor,
      data: p.pago ? p.data : null, vencimento: p.data, cnpj: null, cpf: null,
      acaoTipo: p.pago ? (p.tipo === "saida" ? "baixa" : "entrada") : (p.tipo === "saida" ? "a_pagar" : "a_receber"),
      acao: null, categoria: p.categoria, confianca: p.confianca,
    },
    contraparte: null, acaoFinal: acao, tipoMov: p.tipo, pago: p.pago, jaVencido: false,
    // ⚠️ Sem baixa automática: "paguei 100 de gasolina" não pode dar baixa num
    // título pendente qualquer de R$ 100 só porque o valor bate.
    contato: null, sugerirCadastro: false, baixaDe: null, custoRecorrente: null,
    crossCheck: [], ideias: [], confianca: p.confianca,
  };
  return { analise, acao, categoria: p.categoria, data: p.data, valor: p.valor, descricao: p.descricao, origem: "manual", criarContato: false, estado: "aberta" };
}

/** A frase da IA que apresenta a proposta e pergunta. */
export function fraseDaProposta(pc: PropostaChat, deFoto: boolean): string {
  const v = formatBRL(pc.valor);
  const quem = pc.analise.contraparte ? ` de **${pc.analise.contraparte}**` : "";
  const tipoDoc = deFoto ? `Li um(a) **${pc.analise.fields.tipo.toLowerCase()}**${quem} no valor de **${v}**. ` : "";
  const confere = pc.analise.confianca < 0.6 ? " Não reconheci bem a categoria: confira antes de confirmar." : "";
  switch (pc.acao) {
    case "Vou pagar":
      return `${tipoDoc}${deFoto ? "" : `Entendi: uma conta de **${v}** (${pc.descricao}). `}Sugiro agendar o pagamento para **${dataBR(pc.data)}** na categoria **${pc.categoria}**. Confirma?${confere}`;
    case "Vou receber":
      return `${tipoDoc}${deFoto ? "" : `Entendi: **${v}** a receber (${pc.descricao}). `}Sugiro lançar para **${dataBR(pc.data)}** na categoria **${pc.categoria}**. Confirma?${confere}`;
    case "Recebi":
      return `${tipoDoc}${deFoto ? "" : `Entendi: você recebeu **${v}** (${pc.descricao}) em ${dataBR(pc.data)}. `}Sugiro a categoria **${pc.categoria}**. Confirma?${confere}`;
    default:
      return pc.analise.baixaDe
        ? `${tipoDoc}Ele casa com uma conta que já estava agendada (${pc.analise.baixaDe.description ?? pc.analise.baixaDe.category}). Sugiro dar baixa nela em vez de lançar de novo. Confirma?`
        : `${tipoDoc}${deFoto ? "" : `Entendi: um gasto de **${v}** (${pc.descricao}) em ${dataBR(pc.data)}. `}Sugiro a categoria **${pc.categoria}**. Confirma?${confere}`;
  }
}

export type LeituraNoChat =
  | { kind: "doc"; proposta: PropostaChat }
  | { kind: "lote"; linhas: number }
  | { kind: "erro"; motivo: string };

/** A foto ou o PDF enviado na conversa: lê, cruza com o cadastro e propõe. */
export async function lerArquivoNoChat(file: File): Promise<LeituraNoChat> {
  if (file.size > 10 * 1024 * 1024) return { kind: "erro", motivo: "O arquivo passa de 10 MB. Envie uma foto menor ou o PDF original." };
  const res = await lerDocumento(file, await ocrConfigurado());
  if (res.kind === "erro") return { kind: "erro", motivo: res.motivo };
  // Extrato (muitas linhas) tem a tela de revisão própria, linha a linha.
  if (res.kind === "bulk") return { kind: "lote", linhas: res.report.records.length };
  const [parties, aPagar, aReceber, risco] = await Promise.all([
    listParties().catch(() => [] as Party[]),
    getOpenMovements("saida").catch(() => [] as Movement[]),
    getOpenMovements("entrada").catch(() => [] as Movement[]),
    getRiscoInput().catch(() => null),
  ]);
  const an = analisarDocumento(res.fields, parties, [...aPagar, ...aReceber], risco?.movements ?? []);
  const hoje = new Date().toISOString().slice(0, 10);
  const data = (an.pago ? an.fields.data : an.fields.vencimento) ?? an.fields.vencimento ?? an.fields.data ?? hoje;
  return {
    kind: "doc",
    proposta: {
      analise: an, acao: an.acaoFinal,
      categoria: an.fields.categoria ?? (an.tipoMov === "entrada" ? "Outras receitas" : "Outras despesas"),
      data: /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : hoje,
      valor: an.fields.valor ?? 0,
      descricao: an.contraparte ?? an.fields.tipo,
      origem: "importacao", arquivo: file.name, criarContato: an.sugerirCadastro, estado: "aberta",
    },
  };
}

/** Grava a proposta confirmada e anexa a foto, quando houver. */
export async function gravarProposta(pc: PropostaChat): Promise<ResultadoConfirmacao> {
  const pago = ACAO_MAP[pc.acao as Exclude<AcaoFinal, "Transferência">]?.pago ?? pc.analise.pago;
  const r = await confirmarDocumento({
    analise: pago ? { ...pc.analise, fields: { ...pc.analise.fields, data: pc.data } } : pc.analise,
    criarContato: pc.criarContato,
    categoria: pc.categoria,
    valor: pc.valor,
    vencimento: pc.data,
    acaoOverride: pc.acao,
    origem: pc.origem,
    descricao: pc.descricao,
  });
  if (pc.arquivo && r.id) anexarComprovante(r.id, pc.arquivo);
  return r;
}
