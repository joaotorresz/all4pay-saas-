/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O AGENTE DE CONTAS A PAGAR (Etapa 6 do plano "AI first", 04/11/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O agente NÃO tem fila própria: ele lê a MESMA caixa de entrada de contas
 * (`core/caixa-entrada`: boleto DDA, nota da SEFAZ, documento lido, e-mail) e
 * transforma cada documento pendente numa PROPOSTA ("Agendar boleto · ACME").
 *
 * ⚠️ O "Aprovar" NÃO grava a conta (decisão do dono, 04/11/2026): ele abre o
 * cadastro de conta a pagar JÁ PREENCHIDO, pela porta única de criação, e a
 * pessoa confere e salva. Quem grava é o escritor de sempre (`TituloForm`), que
 * tira o documento da caixa (`converterPorChave`). A proposta só vira
 * "executada" quando o BANCO vê o documento convertido na caixa
 * (`agente_contas_pagar_concluir`). Nenhum segundo escritor de conta a pagar.
 *
 * ⚠️ Nunca faz sozinho: o nível máximo é 1 (o banco recusa mais que isso) e o
 * planejamento abaixo nunca devolve "executar", mesmo com um nível 3 gravado.
 *
 * ⚠️ A chave é o documento (`doc:<chave da caixa>`): o documento recusado não
 * volta a ser proposto, e o mesmo boleto nunca tem duas propostas.
 *
 * Puro: nada de banco, relógio ou provedor.
 */
import { camposDoFormulario, ROTULO_ORIGEM, type DocumentoEntrada, type DecisaoEntrada } from "@/core/caixa-entrada";
import { rotear, type ConfigAgente, type Destino } from "./index";

export interface PropostaDeContaPagar {
  chave: string;
  titulo: string;
  porque: string;
  /** Nulo quando o documento não traz valor (o e-mail sem linha digitável). */
  valor: number | null;
  dados: { entrada: string; origem: DocumentoEntrada["origem"]; campos: Record<string, string> };
}

export const chaveDoDocumento = (entrada: string) => `doc:${entrada}`;

const dataBR = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
};

const NOME_CURTO: Record<DocumentoEntrada["origem"], string> = {
  dda: "boleto", sefaz: "nota", ocr: "documento", email: "conta do e-mail",
};

/** Uma conta a pagar que já existe (para o aviso de duplicidade). */
export interface ContaAberta { valor: number; vencimento: string | null }

/**
 * Já existe conta com o MESMO valor (ao centavo) e o mesmo vencimento? É o
 * aviso, não a recusa: dois boletos iguais do mesmo fornecedor existem, e quem
 * decide é a pessoa.
 */
export function pareceDuplicada(d: DocumentoEntrada, contas: readonly ContaAberta[]): boolean {
  if (!(d.valor > 0) || !d.vencimento) return false;
  const centavos = Math.round(d.valor * 100);
  return contas.some((c) => Math.round(c.valor * 100) === centavos && c.vencimento?.slice(0, 10) === d.vencimento!.slice(0, 10));
}

/** A frase do porquê: de onde veio, quanto, quando vence, e o que falta conferir. */
function porqueDe(d: DocumentoEntrada, hoje: string, duplicada: boolean): string {
  const partes = [`${ROTULO_ORIGEM[d.origem]} de ${d.fornecedor}`];
  if (d.numero) partes[0] += `, número ${d.numero}`;
  // "Energia Sul S.A." já termina a frase: sem o ponto dobrado.
  if (!partes[0].endsWith(".")) partes[0] += ".";
  if (d.vencimento) {
    partes.push(d.vencimento < hoje ? `Venceu em ${dataBR(d.vencimento)}: confira se já não foi pago.` : `Vence em ${dataBR(d.vencimento)}.`);
  } else {
    partes.push("Não traz vencimento: confira no cadastro antes de salvar.");
  }
  if (!(d.valor > 0)) partes.push("Não traz valor: preencha no cadastro.");
  if (duplicada) partes.push("Atenção: já existe uma conta a pagar com o mesmo valor e o mesmo vencimento.");
  partes.push("Ao aprovar, o cadastro abre preenchido para você conferir e salvar.");
  return partes.join(" ").slice(0, 1000);
}

/**
 * As propostas: uma por documento pendente da caixa, sem repetir o que já tem
 * proposta (esperando, ou que já terminou: recusada não volta).
 */
export function propostasDeContasPagar(
  pendentes: readonly DocumentoEntrada[], jaPropostas: ReadonlySet<string>, hoje: string, contas: readonly ContaAberta[] = [],
): PropostaDeContaPagar[] {
  const out: PropostaDeContaPagar[] = [];
  for (const d of pendentes) {
    const chave = chaveDoDocumento(d.chave);
    if (jaPropostas.has(chave)) continue;
    out.push({
      chave,
      titulo: `Agendar ${NOME_CURTO[d.origem]} · ${d.fornecedor}`.slice(0, 200),
      porque: porqueDe(d, hoje, pareceDuplicada(d, contas)),
      valor: d.valor > 0 ? Math.round(d.valor * 100) / 100 : null,
      dados: { entrada: d.chave, origem: d.origem, campos: camposDoFormulario(d) },
    });
  }
  return out;
}

/**
 * Para onde vai cada proposta nova. ⚠️ Contas a pagar NUNCA executa sozinho:
 * o máximo é pedir a aprovação (o `rotear` já corta pelo nível máximo do
 * catálogo, e aqui o "executar" vira "aprovar" de novo, por garantia).
 */
export function planejarContasPagar(propostas: readonly PropostaDeContaPagar[], config: ConfigAgente): { chave: string; destino: Destino }[] {
  return propostas.map((p) => {
    const destino = rotear({ config, valor: p.valor, feitasHoje: 0 });
    return { chave: p.chave, destino: destino === "executar" ? "aprovar" : destino };
  });
}

/**
 * O que aconteceu com o documento de uma proposta aberta, pela caixa:
 *  - "convertido": virou conta (por esta proposta ou pela tela);
 *  - "descartado": alguém disse por que não vira conta;
 *  - "sumiu": a fonte não traz mais (boleto pago, lançado, nota cancelada);
 *  - "pendente": continua esperando.
 */
export type DesfechoDocumento = "convertido" | "descartado" | "sumiu" | "pendente";

export function desfechoDoDocumento(entrada: string, pendentes: ReadonlySet<string>, decisoes: readonly DecisaoEntrada[]): DesfechoDocumento {
  let ultima: DecisaoEntrada | undefined;
  for (const d of decisoes) if (d.chave === entrada) ultima = d;
  if (ultima) return ultima.acao === "convertido" ? "convertido" : "descartado";
  return pendentes.has(entrada) ? "pendente" : "sumiu";
}

export const MOTIVO_DOCUMENTO: Record<Exclude<DesfechoDocumento, "pendente">, string> = {
  convertido: "O documento já virou conta a pagar pela caixa de entrada.",
  descartado: "O documento foi descartado na caixa de entrada.",
  sumiu: "O documento saiu da caixa de entrada (pago, já lançado ou cancelado).",
};
