/**
 * A CONFERÊNCIA EXTRATO × SISTEMA da maquininha Pinbank — puro, tipado, sem
 * I/O e sem relógio (`hoje` entra pela porta da frente).
 *
 * Para UMA empresa, UM estabelecimento (EC) e UM período de até 31 dias, casa
 * cada parcela do extrato consolidado da Pinbank (`ExtratoPos`) com o título
 * que o sistema lançou pelo webhook (`pinbank:<nsu>:<parcela>:r`), pelo NSU e
 * pela parcela, e diz o que cada par mostra. NÃO grava nada: é leitura.
 *
 * ⚠️ **O QUE SE COMPARA, E O QUE NÃO.** Por parcela: a data do repasse (o sinal
 * mais valioso: o título nasceu com a data ESTIMADA pelo contrato), o valor
 * BRUTO da parcela e o cancelamento — esses três decidem o STATUS. E, num eixo
 * SEPARADO, a TAXA: o `ValorTaxaAdm` é o MDR em PERCENTUAL (a Pinbank confirmou
 * em 13/10/2026), e o motor o compara, em pontos-base inteiros (2,65% = 265),
 * com a taxa que a empresa CONTRATOU para aquele tipo de venda no vínculo
 * (`TaxasPinbank`, a mesma escolha por forma do planejador: `taxaDaForma`).
 * Diferente por 1 ponto-base ou mais (contra a taxa contratada EXATA, sem
 * arredondar) é sinal de divergência e entra na vista de
 * divergências e no resumo — sem mudar o status da parcela, para que uma
 * leitura não esconda a outra (data certa com taxa errada aparece como as
 * duas coisas). Nenhum valor em reais é derivado do percentual.
 *
 * ⚠️ **A ANTECIPAÇÃO E O LÍQUIDO** (14/10/2026, extrato de produção). O
 * `ValorTaxaMes` é a antecipação AO MÊS (1,55% no crédito antecipado, zero no
 * débito) e vira um TERCEIRO eixo, do mesmo jeito que a taxa: comparada com a
 * antecipação contratada no vínculo, sem mudar o status. E o líquido do extrato
 * é o que a Pinbank DEPOSITA: somado por VENDA, ele é comparado com o que o
 * sistema lançou (receita − taxa − tarifa fixa − antecipação), só quando a
 * venda inteira está nos dois lados — a Pinbank calcula o líquido da venda e o
 * reparte (R$ 8,56 do 2x virou 428 + 428), então a parcela não fecha sozinha. O
 * bruto da parcela e o split do extrato seguem "aguardando definição" (D7):
 * no extrato de produção os dois vieram SEM a tarifa fixa (899 de uma venda de
 * 999), mas nenhum deles decide nada.
 *
 * ⚠️ **O BRUTO DA PARCELA É ESTIMADO PELA MESMA REGRA DO SISTEMA.** O extrato
 * traz o bruto da VENDA; a parcela sai de `dividir` (`core/vendas/pos`), a
 * única regra de divisão que o planejador usa ao lançar. Uma segunda conta
 * divergiria do título no centavo da última parcela e acusaria uma diferença
 * que é só de arredondamento.
 *
 * ⚠️ **NENHUMA DIVERGÊNCIA É AFIRMADA SOBRE O QUE NÃO SE SABE.** Sem nenhum NSU
 * em comum entre os dois lados, a numeração pode não ser a mesma (pergunta em
 * aberto com a Pinbank): tudo vira "sem conclusão" — inclusive a taxa. Com o
 * extrato sem nenhuma parcela deste EC e vendas no sistema, também. Venda do
 * primeiro ou do último dia, venda de hoje ou de ontem, venda por Pix, venda
 * com estorno parcial, venda de uma maquininha excluída, linha cancelada sem
 * título, a parcela sem par de uma venda que os dois lados dividem em números
 * de parcelas DIFERENTES — nenhuma é dada como ausente ou divergente. Um "só no
 * sistema" falso manda a empresa cobrar da Pinbank um dinheiro que já está a
 * caminho. (Nessa venda, o que É divergência é o TOTAL bruto diferente nos
 * dois lados: ele leva todas as parcelas dela à vista de divergências, sem
 * afirmar a ausência de nenhuma — `itemComDivergencia`.)
 *
 * ⚠️ **O AUSENTE É AUSENTE, NUNCA ZERO.** Um item só do extrato tem `sistema`
 * nulo, e a soma do resumo é `null` quando nenhum item tem aquele lado. "R$ 0,00
 * no sistema" afirmaria um título de valor zero que não existe.
 *
 * ⚠️ Os status são EXCLUSIVOS: cada item cai em um só, então as contagens e os
 * centavos do resumo particionam a lista exatamente — o cartão e a tabela não
 * têm como discordar (a guarda cobra).
 */
import type { LinhaExtratoPos } from "@/core/pinbank/extrato-pos";
import { somaDias, taxaDaForma, baseDosCustos, antecipacaoDoContrato, type TaxasPinbank } from "@/core/pinbank/plano";
import { dividir, dividirCusto } from "@/core/vendas/pos";
import { ehDiaUtil, postergarParaDiaUtil } from "@/core/folha/calendario";
import { formatBRL } from "@/lib/format";

export const CONFERENCIA_PINBANK_VERSION = "pinbank-conferencia/1.7.0";

/**
 * A permissão que a conferência pede, na empresa do vínculo (decisão D1 do
 * dono, em aberto): `administrar` — a mesma de configurar e reprocessar.
 * Trocar por `fechar` daria a conferência também ao fechador e ao CONTADOR
 * EXTERNO, um terceiro disparando chamadas com a credencial da plataforma. A
 * guarda fixa o valor, para a troca ser deliberada.
 */
export const ACAO_CONFERENCIA = "administrar" as const;

/* ─────────────────────────────── entrada ─────────────────────────────── */

/** As colunas de `movements` exatamente como são lidas (valores em REAIS, como o PostgREST devolve). */
export interface LinhaMovimentoPinbank {
  id: string;
  chave: string | null;
  nsu: string | null;
  type: string;
  amount: number | string;
  due_date: string | null;
  competence_date: string | null;
  situacao: string | null;
}

export interface EventoPinbankSistema {
  nsu: number | string | null;
  vinculo_id: string | null;
  situacao: string;
  event_type: string;
  ocorrido_em: string | null;
  /** `payload->>codAutorizAdquirente` — só para achar o par provável; nunca sai no relatório. */
  autorizacao: string | null;
}

export interface TransacaoPinbankSistema {
  nsu: number | string;
  status: string;
  valor: number | string | null;
  valor_original: number | string | null;
}

export interface EntradaConferencia {
  /** AAAA-MM-DD, o período pedido (inclusive). */
  de: string;
  ate: string;
  /** AAAA-MM-DD em São Paulo. */
  hoje: string;
  /**
   * O vínculo conferido: o código do extrato (EC) e as taxas que a empresa
   * CONTRATOU (frações, como o planejador as usa). `taxas: null` = nenhuma
   * cadastrada — a taxa do extrato fica "sem contrato", nunca divergente.
   */
  vinculo: {
    id: string; codigoCliente: number; taxas: TaxasPinbank | null;
    /**
     * O repasse é ANTECIPADO no vínculo. Sem ele (`undefined`/`null`/`false`)
     * a antecipação do extrato não é comparada — o que o `ValorTaxaMes`
     * mostra numa venda não antecipada ainda não foi medido.
     */
    antecipado?: boolean | null;
  };
  /** Os vínculos vivos da empresa com o MESMO código de extrato (inclui este). */
  vinculosDoEstabelecimento: string[];
  /**
   * Os ids dos vínculos VIVOS da empresa (a leitura não vê os excluídos). É a
   * lista, não a contagem: um aviso que aponta para um vínculo fora dela é de
   * uma maquininha EXCLUÍDA (trocada), que pode ter tido o mesmo EC — nem
   * "outra maquininha" nem "esta".
   */
  vinculosDaEmpresa: string[];
  /** As linhas do extrato, já pela leitura por lista de permitidos. */
  extrato: LinhaExtratoPos[];
  /** Os títulos da janela ∪ os lidos pelo NSU — pode repetir id. */
  titulos: LinhaMovimentoPinbank[];
  eventos: EventoPinbankSistema[];
  transacoes: TransacaoPinbankSistema[];
}

/* ─────────────────────────────── saída ─────────────────────────────── */

/** A ordem da tabela — é também a ordem dentro de cada grupo. */
export const ORDEM_STATUS = [
  "casada",
  "casada_dia_util",
  "cancelada_nos_dois",
  "data_diferente",
  "valor_diferente",
  "data_e_valor_diferentes",
  "cancelada_no_extrato",
  "cancelada_so_no_sistema",
  "so_no_extrato",
  "so_no_sistema",
  "par_provavel",
  "inconclusivo",
  "linha_ilegivel",
  "duplicada_no_extrato",
] as const;
export type StatusConferencia = (typeof ORDEM_STATUS)[number];

export type GrupoConferencia = "conferidas" | "divergencias" | "semConclusao";

export const GRUPO_DO_STATUS: Record<StatusConferencia, GrupoConferencia> = {
  casada: "conferidas",
  casada_dia_util: "conferidas",
  cancelada_nos_dois: "conferidas",
  data_diferente: "divergencias",
  valor_diferente: "divergencias",
  data_e_valor_diferentes: "divergencias",
  cancelada_no_extrato: "divergencias",
  cancelada_so_no_sistema: "divergencias",
  so_no_extrato: "divergencias",
  so_no_sistema: "divergencias",
  par_provavel: "semConclusao",
  inconclusivo: "semConclusao",
  linha_ilegivel: "semConclusao",
  duplicada_no_extrato: "semConclusao",
};

export const ROTULO_STATUS: Record<StatusConferencia, string> = {
  casada: "Conferida",
  casada_dia_util: "Conferida · dia útil seguinte",
  cancelada_nos_dois: "Cancelada nos dois",
  data_diferente: "Data do repasse diferente",
  valor_diferente: "Valor diferente",
  data_e_valor_diferentes: "Data e valor diferentes",
  cancelada_no_extrato: "Cancelada só no extrato",
  cancelada_so_no_sistema: "Cancelada só no sistema",
  so_no_extrato: "Só no extrato",
  so_no_sistema: "Só no sistema",
  par_provavel: "Par provável",
  inconclusivo: "Sem conclusão",
  linha_ilegivel: "Linha ilegível",
  duplicada_no_extrato: "Repetida no extrato",
};

/** O tom do selo: conferido é sinal positivo; divergência é atenção; sem conclusão é neutro. */
export const TOM_DO_STATUS: Record<StatusConferencia, "positive" | "warning" | "neutral"> = {
  casada: "positive",
  casada_dia_util: "positive",
  cancelada_nos_dois: "positive",
  data_diferente: "warning",
  valor_diferente: "warning",
  data_e_valor_diferentes: "warning",
  cancelada_no_extrato: "warning",
  cancelada_so_no_sistema: "warning",
  so_no_extrato: "warning",
  so_no_sistema: "warning",
  par_provavel: "neutral",
  inconclusivo: "neutral",
  linha_ilegivel: "neutral",
  duplicada_no_extrato: "neutral",
};

export type MotivoConferencia =
  // conferida sem título: cancelada no extrato, desfeita no sistema antes de virar título
  | "desfeita_sem_titulo"
  // só no extrato
  | "nenhum_evento"
  | "evento_aguardando_ativacao"
  | "evento_bloqueado"
  | "evento_com_erro"
  | "evento_recebido_nao_processado"
  | "evento_sem_lancamento"
  | "evento_de_outra_maquininha"
  | "parcela_ausente_no_sistema"
  // só no sistema
  | "venda_ausente_do_extrato"
  | "parcela_ausente_no_extrato"
  // sem conclusão
  | "chave_nao_confirmada"
  | "borda_do_periodo"
  | "venda_recente"
  | "pix_sem_extrato"
  | "reembolso_parcial"
  | "cancelada_ausente_do_extrato"
  | "maquininha_desconhecida"
  | "sem_data_no_extrato"
  | "sem_valor_no_extrato"
  | "linha_duplicada_no_extrato"
  | "linha_ilegivel_no_extrato"
  // o extrato traz uma linha SEM o código do estabelecimento que pode ser esta venda
  | "linha_sem_estabelecimento"
  | "periodo_do_extrato_incerto"
  | "chave_repetida_no_sistema"
  | "bruto_inconsistente_no_extrato"
  | "extrato_sem_vendas"
  | "cancelada_no_extrato_sem_titulo"
  | "venda_cancelada_no_extrato"
  | "maquininha_excluida"
  // a venda está nos dois lados, dividida em números de parcelas DIFERENTES: a parcela sem par não é dada como ausente
  | "parcelas_diferentes_no_extrato"
  // par provável
  | "via_autorizacao"
  | "via_nsu_loja";

export type SinalConferencia =
  | "dia_util"
  | "parcelas_diferentes"
  | "reembolso_parcial"
  | "valor_nao_comparado"
  | "dia_da_venda_diferente"
  | "recebido_no_sistema"
  // o extrato cobrou MDR, a taxa está cadastrada, a regra do sistema lançaria uma taxa nesta parcela e não há o título dela
  | "taxa_sem_titulo_no_sistema"
  // com números de parcelas diferentes, o total bruto da VENDA (os dois lados inteiros) confere / não confere
  | "total_da_venda_igual"
  | "total_da_venda_diferente"
  // a venda inteira nos dois lados: o líquido que a Pinbank deposita × o que o sistema lançou (receita − taxa − tarifa − antecipação)
  | "liquido_da_venda_igual"
  | "liquido_da_venda_diferente";

export type AvisoConferencia =
  | "chave_nao_confirmada"
  | "extrato_sem_vendas"
  | "periodo_do_extrato_incerto"
  | "linhas_de_outro_estabelecimento"
  | "linhas_sem_estabelecimento";

/* ─────────────────────────────── a taxa (MDR) ─────────────────────────────── */

/** O tipo de venda do extrato que tem taxa contratada no vínculo. */
export type TipoTaxaExtrato = "debito" | "credito_vista" | "parcelado";

/**
 * O resultado da comparação da TAXA de uma parcela do extrato com a contratada:
 *   · `igual` — diferença MENOR que `TOLERANCIA_TAXA_BP` contra a taxa
 *     contratada EXATA (sem arredondar);
 *   · `diferente` — o extrato cobrou outra taxa: DIVERGÊNCIA;
 *   · `sem_extrato` — a linha não traz o MDR (ou traz algo que não é percentual);
 *   · `tipo_desconhecido` — o tipo da compra não se mapeia com segurança;
 *   · `sem_contrato` — a empresa não cadastrou a taxa daquele tipo (não é divergência);
 *   · `sem_conclusao` — a numeração (NSU) não foi confirmada: sem nenhuma venda
 *     em comum, não se sabe se o extrato é desta maquininha (um EC trocado dá
 *     exatamente isso), e a taxa também não é afirmada;
 *   · `outra_maquininha` — o estabelecimento tem OUTRA maquininha viva da
 *     empresa, cada uma com as SUAS taxas, e nenhum aviso diz que esta venda
 *     veio desta: comparar com a taxa desta acusaria a venda da irmã de "taxa
 *     diferente" (e esconderia a taxa errada cadastrada na irmã);
 *   · `venda_cancelada` — a linha do extrato traz a data de cancelamento: venda
 *     cancelada não tem taxa a conferir (e o MDR zerado na linha cancelada é
 *     convenção plausível da adquirente — compará-lo acusaria toda venda
 *     cancelada de "taxa diferente");
 *   · `estorno_parcial` — a linha traz a data de cancelamento, mas o sistema
 *     registrou um estorno PARCIAL: a venda segue valendo pelo resto. "Venda
 *     cancelada" ao lado de "estorno parcial" se contradiria, e o MDR da linha
 *     com cancelamento pode vir zerado — então a taxa não é comparada, e a tela
 *     DIZ isso com um nome próprio.
 * A ordem das perguntas é esta: o que falta no extrato, depois o tipo, depois o contrato.
 */
export const ORDEM_RESULTADO_TAXA = ["diferente", "igual", "sem_contrato", "sem_extrato", "tipo_desconhecido", "sem_conclusao", "outra_maquininha", "venda_cancelada", "estorno_parcial"] as const;
export type ResultadoTaxa = (typeof ORDEM_RESULTADO_TAXA)[number];

export const ROTULO_RESULTADO_TAXA: Record<ResultadoTaxa, string> = {
  diferente: "Taxa diferente da contratada",
  igual: "Taxa igual à contratada",
  sem_contrato: "Taxa não cadastrada na maquininha",
  sem_extrato: "Taxa não informada no extrato",
  tipo_desconhecido: "Tipo de venda não identificado",
  sem_conclusao: "Taxa sem conclusão (numeração não confirmada)",
  outra_maquininha: "Taxa não comparada (a venda pode ser de outra maquininha do mesmo estabelecimento)",
  venda_cancelada: "Venda cancelada: taxa não comparada",
  estorno_parcial: "Venda com estorno parcial: taxa não comparada",
};

/**
 * MENOS de 1 ponto-base (0,01 ponto percentual) de diferença é igual — e a
 * comparação é contra a taxa contratada EXATA, nunca arredondada. A folga
 * existe porque a taxa contratada pode ter mais casas que o extrato (1,995%
 * contra 1,99% ou 2,00% é igual); ela NÃO cobre 0,01 ponto percentual cobrado a
 * mais num contrato de duas casas, que é o que a tela de cadastro recolhe
 * (1,99% contratado e 2,00% no extrato é diferente). Arredondar o contrato e
 * aceitar ATÉ 1 ponto-base escondia exatamente essa cobrança.
 */
export const TOLERANCIA_TAXA_BP = 1;

export interface TaxaDoItem {
  resultado: ResultadoTaxa;
  tipo: TipoTaxaExtrato | null;
  /** O MDR que o extrato cobrou, em pontos-base (2,65% = 265). */
  extratoBp: number | null;
  /** A taxa contratada para o tipo, em pontos-base INTEIROS — para exibir; a comparação usa a exata. */
  contratoBp: number | null;
  /**
   * Extrato − contrato exibido, em pontos-base — SÓ quando a taxa é
   * `diferente`. Na `igual` ela não sai: contra um contrato de mais casas
   * (1,995%, só pela RPC direta — o formulário arredonda a duas), o exibido
   * (2,00%) e o extrato (1,99%) dariam "−0,01 ponto percentual" ao lado de
   * "taxa igual", e a comparação é contra o EXATO.
   */
  diferencaBp: number | null;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * O tipo da compra do extrato, com CAUTELA: só o que se reconhece sem dúvida.
 * "DEBITO" → débito; "A VISTA" → crédito à vista; "PARCEL…" → parcelado
 * QUANDO tem mais de uma parcela. O resto (voucher, Pix, um nome novo) não é
 * adivinhado: comparar com a taxa do tipo errado acusaria uma divergência que
 * não existe.
 *
 * ⚠️ "PARCELADO" em 1x é CRÉDITO À VISTA — a mesma escolha do planejador
 * (`formaDaTransacao`, `core/pinbank/evento`), que lança a taxa de crédito à
 * vista nessa venda. Comparar com a de parcelado acusaria uma taxa diferente
 * onde o extrato e o sistema concordam. Sem o número de parcelas, não se sabe:
 * tipo desconhecido.
 */
export function tipoDaCompraNoExtrato(tipoCompra: string | null, totalParcelas: number | null): TipoTaxaExtrato | null {
  const t = semAcento(tipoCompra ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (t === "DEBITO") return "debito";
  if (t === "A VISTA" || t === "AVISTA") return "credito_vista";
  if (/\bPARCEL/.test(t)) return totalParcelas == null ? null : totalParcelas > 1 ? "parcelado" : "credito_vista";
  return null;
}

/**
 * Fração contratada → pontos-base EXATOS (0,0199 → 199; 0,01995 → 199,5), sem
 * a dízima do ponto flutuante (0,0163 × 10000 dá 162,99999999999997, que numa
 * comparação estrita contra 162 passaria por "menos de 1 ponto-base").
 */
export function pontosBaseExatosDaFracao(f: number | null | undefined): number | null {
  if (typeof f !== "number" || !Number.isFinite(f) || f < 0 || f >= 1) return null;
  return Number((f * 10_000).toFixed(6));
}

/** Fração contratada (0,0199) → pontos-base INTEIROS (199) — só para EXIBIR; a comparação usa os exatos. */
export function pontosBaseDaFracao(f: number | null | undefined): number | null {
  const x = pontosBaseExatosDaFracao(f);
  return x == null ? null : Math.round(x);
}

/** Compara o MDR de UMA linha do extrato com a taxa contratada no vínculo. Pura. */
export function compararTaxa(l: Pick<LinhaExtratoPos, "tipoCompra" | "mdrBp" | "totalParcelas">, taxas: TaxasPinbank | null): TaxaDoItem {
  const tipo = tipoDaCompraNoExtrato(l.tipoCompra, l.totalParcelas);
  const extratoBp = l.mdrBp;
  const contratoExato = tipo && taxas ? pontosBaseExatosDaFracao(taxaDaForma(tipo, taxas)) : null;
  const contratoBp = contratoExato == null ? null : Math.round(contratoExato);
  const resultado: ResultadoTaxa =
    extratoBp == null ? "sem_extrato"
    : tipo == null ? "tipo_desconhecido"
    : contratoExato == null ? "sem_contrato"
    : Math.abs(extratoBp - contratoExato) < TOLERANCIA_TAXA_BP ? "igual"
    : "diferente";
  return {
    resultado, tipo, extratoBp, contratoBp,
    diferencaBp: resultado === "diferente" && extratoBp != null && contratoBp != null ? extratoBp - contratoBp : null,
  };
}

/* ─────────────────────────────── a antecipação ─────────────────────────────── */

/**
 * O resultado da comparação da ANTECIPAÇÃO de uma parcela do extrato (o
 * `ValorTaxaMes`, percentual AO MÊS) com a contratada — o mesmo desenho da taxa:
 *   · `igual` / `diferente` — contra a esperada EXATA: no crédito (à vista e
 *     parcelado), a antecipação ao mês cadastrada; no débito, ZERO (ele cai em
 *     D+1 de qualquer jeito, e o extrato de 14/10/2026 o trouxe com zero);
 *   · `sem_contrato` — repasse antecipado e a antecipação não cadastrada;
 *   · `nao_antecipado` — o vínculo não recebe antecipado: o que o extrato
 *     mostra numa venda sem antecipação ainda não foi medido, então não se
 *     afirma nada (a venda antecipada sem o vínculo dizer isso aparece pela
 *     DATA do repasse, que diverge);
 *   · `venda_nao_antecipada` — no crédito, a Pinbank NÃO cobrou antecipação
 *     (zero no extrato) e o sistema também não lançou nenhuma para a venda:
 *     os dois lados concordam que ela não foi antecipada. Comparar com a
 *     antecipação cadastrada HOJE acusaria toda venda de antes de a empresa
 *     ligar o repasse antecipado (achado da revisão adversarial);
 *   · os demais, como na taxa: `sem_extrato`, `tipo_desconhecido`,
 *     `sem_conclusao`, `outra_maquininha`, `venda_cancelada`, `estorno_parcial`.
 */
export const ORDEM_RESULTADO_ANTECIPACAO = [
  "diferente", "igual", "sem_contrato", "nao_antecipado", "venda_nao_antecipada", "sem_extrato", "tipo_desconhecido",
  "sem_conclusao", "outra_maquininha", "venda_cancelada", "estorno_parcial",
] as const;
export type ResultadoAntecipacao = (typeof ORDEM_RESULTADO_ANTECIPACAO)[number];

export const ROTULO_RESULTADO_ANTECIPACAO: Record<ResultadoAntecipacao, string> = {
  diferente: "Antecipação diferente da contratada",
  igual: "Antecipação igual à contratada",
  sem_contrato: "Antecipação não cadastrada na maquininha",
  nao_antecipado: "Repasse não antecipado na maquininha: antecipação não comparada",
  venda_nao_antecipada: "Venda não antecipada: nem a Pinbank cobrou nem o sistema lançou antecipação",
  sem_extrato: "Antecipação não informada no extrato",
  tipo_desconhecido: "Tipo de venda não identificado",
  sem_conclusao: "Antecipação sem conclusão (numeração não confirmada)",
  outra_maquininha: "Antecipação não comparada (a venda pode ser de outra maquininha do mesmo estabelecimento)",
  venda_cancelada: "Venda cancelada: antecipação não comparada",
  estorno_parcial: "Venda com estorno parcial: antecipação não comparada",
};

/**
 * De onde vem a antecipação ESPERADA — o que a tela escreve no lugar dela
 * quando não há número: o tipo da venda não foi identificado, o vínculo não
 * recebe antecipado, ou a antecipação não está cadastrada. Sem isto a tela
 * dizia "não cadastrada" também para a venda de tipo desconhecido com a taxa
 * cadastrada (achado da revisão adversarial).
 */
export type EsperadaDaAntecipacao = "contrato" | "zero_no_debito" | "tipo_desconhecido" | "repasse_nao_antecipado" | "nao_cadastrada";

export interface AntecipacaoDoItem {
  resultado: ResultadoAntecipacao;
  tipo: TipoTaxaExtrato | null;
  /** A base do esperado — ver `EsperadaDaAntecipacao`. */
  esperada: EsperadaDaAntecipacao;
  /** A antecipação ao mês que o extrato informou (`ValorTaxaMes`), em pontos-base (1,55% = 155). */
  extratoBp: number | null;
  /** A esperada pelo contrato, em pontos-base INTEIROS (para exibir): a cadastrada no crédito, zero no débito. */
  contratoBp: number | null;
  /** Extrato − esperada exibida, em pontos-base — SÓ quando `diferente`. */
  diferencaBp: number | null;
}

/**
 * Compara a antecipação de UMA linha do extrato com a contratada. Pura. A
 * esperada é exata, sem arredondar, com a MESMA folga da taxa
 * (`TOLERANCIA_TAXA_BP`).
 */
export function compararAntecipacao(
  l: Pick<LinhaExtratoPos, "tipoCompra" | "taxaMesBp" | "totalParcelas">,
  taxas: TaxasPinbank | null,
  antecipado: boolean | null | undefined,
  /** O sistema lançou antecipação (`:a`) para a venda; `null` quando a venda não está no sistema. */
  sistemaAntecipou: boolean | null = null,
): AntecipacaoDoItem {
  const tipo = tipoDaCompraNoExtrato(l.tipoCompra, l.totalParcelas);
  const extratoBp = l.taxaMesBp;
  const esperadaExata = antecipado !== true || tipo == null ? null
    : tipo === "debito" ? 0
    : pontosBaseExatosDaFracao(antecipacaoDoContrato(taxas ?? {}));
  const contratoBp = esperadaExata == null ? null : Math.round(esperadaExata);
  const esperada: EsperadaDaAntecipacao =
    tipo == null ? "tipo_desconhecido"
    : antecipado !== true ? "repasse_nao_antecipado"
    : tipo === "debito" ? "zero_no_debito"
    : esperadaExata == null ? "nao_cadastrada"
    : "contrato";
  const resultado: ResultadoAntecipacao =
    extratoBp == null ? "sem_extrato"
    : tipo == null ? "tipo_desconhecido"
    : antecipado !== true ? "nao_antecipado"
    : esperadaExata == null ? "sem_contrato"
    // Os dois lados dizem que a venda NÃO antecipou: só no crédito com antecipação
    // cadastrada (o débito espera zero e confere como `igual`).
    : esperadaExata > 0 && extratoBp === 0 && sistemaAntecipou === false ? "venda_nao_antecipada"
    : Math.abs(extratoBp - esperadaExata) < TOLERANCIA_TAXA_BP ? "igual"
    : "diferente";
  return {
    resultado, tipo, esperada, extratoBp, contratoBp,
    diferencaBp: resultado === "diferente" && extratoBp != null && contratoBp != null ? extratoBp - contratoBp : null,
  };
}

/**
 * O líquido de UMA venda nos dois lados, em centavos: o que a Pinbank deposita
 * (Σ do líquido das parcelas do extrato) e o que o sistema lançou (Σ receita −
 * taxa − tarifa fixa − antecipação dos títulos vivos).
 */
export interface LiquidoDaVenda {
  extratoCentavos: number;
  sistemaCentavos: number;
  /** As parcelas da venda — a folga cresce com elas (`toleranciaDoLiquido`). */
  parcelas: number;
}

/**
 * A folga da comparação do líquido: 1 centavo POR PARCELA da venda. O sistema
 * arredonda a taxa, a tarifa e a antecipação da venda (cada uma ao centavo) e
 * as reparte; a Pinbank, no 2x antecipado medido em 14/10/2026, repartiu o
 * líquido da VENDA (428 + 428) — mas como ela arredonda o parcelado SEM
 * antecipação não foi medido, e se for parcela a parcela cada uma pode
 * desviar meio centavo. Uma folga fixa de 1 centavo acusaria todo 12x por
 * arredondamento (achado da revisão adversarial); a que cresce com as parcelas
 * ainda acusa o que importa — a tarifa de R$ 1,00 que falta, a taxa errada.
 */
export const TOLERANCIA_LIQUIDO_CENTAVOS_POR_PARCELA = 1;
export function toleranciaDoLiquido(parcelas: number): number {
  return TOLERANCIA_LIQUIDO_CENTAVOS_POR_PARCELA * Math.max(1, Math.floor(parcelas || 1));
}
/** O líquido dos dois lados confere, dentro da folga da venda. */
export function liquidoConfere(l: LiquidoDaVenda): boolean {
  return Math.abs(l.extratoCentavos - l.sistemaCentavos) <= toleranciaDoLiquido(l.parcelas);
}

export interface ExtratoDoItem {
  /** AAAA-MM-DD. */
  dataVenda: string | null;
  dataRepasse: string | null;
  dataCancelamento: string | null;
  brutoVendaCentavos: number | null;
  /** O bruto da VENDA dividido pela regra do sistema — é o que se compara com o título. */
  brutoParcelaEstimadoCentavos: number | null;
  bandeira: string | null;
  tipoCompra: string | null;
  status: string | null;
  statusPagamento: string | null;
  /** A taxa (MDR) desta parcela × a contratada — eixo SEPARADO do status. */
  taxa: TaxaDoItem;
  /** A antecipação desta parcela (`ValorTaxaMes`) × a contratada — outro eixo separado. */
  antecipacao: AntecipacaoDoItem;
  /** O líquido desta parcela no extrato: o que a Pinbank DEPOSITA (comparado por VENDA, nunca por parcela). */
  liquidoCentavos: number | null;
  /**
   * O que a Pinbank informa e ainda não tem sentido confirmado (D7). NUNCA
   * entra em status nenhum. No extrato de produção de 14/10/2026 os dois
   * vieram sem a tarifa fixa (899 de uma venda de 999).
   */
  aguardandoDefinicao: {
    brutoParcelaCentavos: number | null;
    splitCentavos: number | null;
  };
}

export interface SistemaDoItem {
  tituloId: string;
  vencimento: string | null;
  competencia: string | null;
  situacao: string;
  valorCentavos: number;
  vendaCentavos: number;
  /** A taxa que o SISTEMA lançou (pelo contrato) nesta parcela; `null` = nenhum título de taxa vivo. */
  taxaCentavos: number | null;
  /**
   * Os títulos de taxa vivos desta parcela. Dois títulos de receita da MESMA
   * parcela (a chave repetida) apontam para o MESMO título de taxa: o resumo
   * soma cada título de taxa UMA vez, por estes ids.
   */
  taxaTituloIds: string[];
  /** A tarifa fixa que o sistema lançou nesta parcela; `null` = nenhum título de tarifa vivo. */
  tarifaCentavos: number | null;
  /** A antecipação que o sistema lançou nesta parcela; `null` = nenhum título de antecipação vivo. */
  antecipacaoCentavos: number | null;
  /** Os títulos de antecipação vivos desta parcela — o resumo soma cada um UMA vez. */
  antecipacaoTituloIds: string[];
  /** Os estornos da venda, só no item da menor parcela (senão a soma contaria o estorno N vezes). */
  estornoDaVendaCentavos: number | null;
}

export interface ItemConferencia {
  /** Derivado do CONTEÚDO, nunca de contador: `p:<nsu>:<k>` · `e:<nsu>:<k>:<n>` · `t:<tituloId>`. */
  id: string;
  status: StatusConferencia;
  motivo: MotivoConferencia | null;
  sinais: SinalConferencia[];
  frase: string;
  nsu: string | null;
  parcela: number | null;
  totalParcelasExtrato: number | null;
  totalParcelasSistema: number | null;
  extrato: ExtratoDoItem | null;
  sistema: SistemaDoItem | null;
  /** Repasse do extrato − repasse do sistema, em dias. */
  diferencaDias: number | null;
  /** Bruto estimado da parcela no extrato − bruto da parcela no sistema, em centavos. */
  diferencaCentavos: number | null;
  /**
   * Só no par provável: por qual caminho o par foi achado, e o NSU do lado do
   * SISTEMA (é o NSU do próprio aviso, que a empresa já vê na lista de
   * eventos). O VALOR do código de autorização e do NSU da loja lidos do
   * extrato nunca saem.
   */
  provavel?: { via: "autorizacao" | "nsu_loja"; nsuNoSistema: string };
  /** Só nas parcelas de uma venda cujo líquido foi comparado (a venda inteira nos dois lados). */
  liquidoDaVenda?: LiquidoDaVenda;
}

export interface LinhaResumo {
  quantidade: number;
  /** Σ do bruto estimado das parcelas do extrato; `null` quando nenhum item tem o lado do extrato. */
  centavosExtrato: number | null;
  /** Σ do bruto dos títulos; `null` quando nenhum item tem o lado do sistema. */
  centavosSistema: number | null;
}

export interface RelatorioConferencia {
  versao: typeof CONFERENCIA_PINBANK_VERSION;
  /**
   * `chave_nao_confirmada`: os dois lados têm vendas e nenhum NSU em comum.
   * `extrato_vazio`: o extrato não trouxe nenhuma parcela DESTE estabelecimento
   * e o sistema tem vendas no período. Nos dois, nenhuma venda é dada como
   * ausente nem divergente.
   */
  estado: "conferido" | "chave_nao_confirmada" | "extrato_vazio";
  /** Nenhuma parcela no extrato e nenhuma venda da maquininha no período, no sistema. */
  vazio: boolean;
  periodo: { de: string; ate: string };
  hoje: string;
  avisos: { codigo: AvisoConferencia; frase: string }[];
  resumo: {
    porStatus: Record<StatusConferencia, LinhaResumo>;
    /** CONTAGENS por grupo — nunca uma soma de dinheiro: os grupos misturam lados. */
    grupos: { conferidas: number; divergencias: number; semConclusao: number };
    /**
     * Quantos itens vão para a VISTA de divergências: os do grupo de
     * divergências MAIS, com outro status, os de taxa diferente (ou cobrada no
     * extrato sem o título de taxa no sistema) e os da venda com o total bruto
     * diferente nos dois lados (`itemComDivergencia`). Não é soma de grupos —
     * um item conta uma vez.
     */
    itensComDivergencia: number;
    nsusExtrato: number;
    nsusSistema: number;
    nsusEmComum: number;
    /**
     * Dos NSUs em comum, quantos têm um AVISO da Pinbank vindo de uma
     * maquininha deste estabelecimento NO DIA DA VENDA da linha do extrato
     * (`avisoNoDiaDaVenda`: a até 1 dia). O aviso (`pinbank_eventos`) só é
     * gravado pela plataforma; o título (`movements`) a empresa também grava.
     * É este número — não o de cima — que prova que o extrato é desta empresa
     * (`relatorioParaEmpresa`): um título forjado com o NSU de uma venda alheia
     * entra em `nsusEmComum`, nunca aqui. E o dia conta: anos de avisos de
     * qualquer data multiplicariam a chance de uma numeração repetida entre
     * lojas abrir o extrato de outra — com o dia, é preciso o MESMO NSU no
     * MESMO dia da venda.
     */
    nsusEmComumAtestados: number;
    /**
     * Quantos NSUs do extrato têm, no dia da venda, o aviso de uma maquininha
     * que NÃO está mais viva na empresa (a trocada). Um lado só — as linhas do
     * extrato contra os avisos, que só a plataforma grava; nenhum título entra.
     * É o que explica "só as quantidades" num período anterior à troca
     * (`relatorioParaEmpresa` troca a frase; o EC pode estar certo).
     */
    nsusDoExtratoDeMaquininhaExcluida: number;
    /**
     * As contagens de cada LADO, sem cruzar um com o outro: o que o extrato
     * trouxe deste EC e o que o sistema lançou da maquininha no período.
     * Nenhuma depende de comparar o extrato com o que a empresa pode gravar —
     * é o que sai quando o extrato não está provado como desta empresa.
     */
    lados: {
      /** `linhas`: TODAS as linhas deste EC (inclusive as de fora do período e as ilegíveis); `vendas`: NSUs distintos das linhas legíveis. */
      extrato: { linhas: number; vendas: number };
      /**
       * Só as parcelas VÁLIDAS: títulos de receita da maquininha com
       * competência no período, VIVOS (nem cancelados nem estornados) e de
       * vendas que o sistema não desfez (transação cancelada, desfeita, negada
       * ou reembolsada por inteiro, ou estorno total) — as vendas e a soma
       * delas (`null` sem parcela). Somar a venda cancelada diria "R$ 350 no
       * sistema" de uma loja que vendeu R$ 50.
       */
      sistema: { parcelas: number; vendas: number; centavos: number | null };
    };
    foraDaConferencia: { outroEstabelecimento: number; semEstabelecimento: number; outraMaquininha: number };
    taxa: {
      /** Por resultado da comparação, quantas PARCELAS do extrato (itens com o lado do extrato). */
      porResultado: Record<ResultadoTaxa, number>;
      /** Linhas mantidas (deste EC) que trazem o MDR. */
      parcelasComTaxaInformada: number;
      titulosDeTaxaNoSistema: number;
      centavosTaxaNoSistema: number;
    };
    antecipacao: {
      /** Por resultado da comparação, quantas PARCELAS do extrato (itens com o lado do extrato). */
      porResultado: Record<ResultadoAntecipacao, number>;
      /** Linhas mantidas (deste EC) que trazem a antecipação. */
      parcelasComAntecipacaoInformada: number;
      titulosDeAntecipacaoNoSistema: number;
      centavosAntecipacaoNoSistema: number;
    };
    /**
     * O líquido POR VENDA, só das vendas inteiras nos dois lados. As somas são
     * das vendas comparadas, `null` sem nenhuma (o ausente é ausente).
     */
    liquido: {
      vendasComparadas: number;
      vendasIguais: number;
      vendasDiferentes: number;
      centavosExtrato: number | null;
      centavosSistema: number | null;
    };
  };
  itens: ItemConferencia[];
}

/**
 * O item entra na VISTA de divergências: o status diverge (data, valor,
 * cancelamento, ausência) OU a taxa cobrada no extrato difere da contratada OU
 * o extrato cobrou a taxa e o sistema não lançou o título dela (dinheiro que
 * falta no resultado) OU a venda, dividida em números de parcelas diferentes
 * nos dois lados, tem o TOTAL bruto diferente. A taxa e o total não mudam o
 * status — e por isso a vista precisa olhar os quatro.
 *
 * ⚠️ O TOTAL DIFERENTE É A DIVERGÊNCIA DA VENDA, e vai em TODA parcela dela.
 * A parcela sem par não é dada como ausente (o valor dela pode estar nas
 * parcelas do outro lado), e as parcelas COM par podem bater uma a uma — o
 * título da última parcela que sumiu do sistema (3x de R$ 300 no extrato, só
 * p1 e p2 de R$ 100 no sistema) parece exatamente "o sistema dividiu em 2". O
 * que denuncia os R$ 100 que faltam é o total, e sem esta linha eles não
 * chegavam a divergência nenhuma — nem a frase nenhuma.
 */
export function itemComDivergencia(i: Pick<ItemConferencia, "status" | "extrato" | "sinais">): boolean {
  return GRUPO_DO_STATUS[i.status] === "divergencias" || i.extrato?.taxa.resultado === "diferente"
    || i.extrato?.antecipacao.resultado === "diferente"
    || i.sinais.includes("taxa_sem_titulo_no_sistema")
    || i.sinais.includes("total_da_venda_diferente")
    || i.sinais.includes("liquido_da_venda_diferente");
}

/* ─────────────────────── frases fora do relatório ─────────────────────── */

export type MotivoConferenciaIndisponivel = "desligada" | "ambiente_teste" | "sem_configuracao";

export const FRASE_INDISPONIVEL: Record<MotivoConferenciaIndisponivel, string> = {
  desligada:
    "A conferência com o extrato da Pinbank ainda não foi liberada. A Quattro a libera depois de confirmar o extrato com uma venda real.",
  ambiente_teste:
    "A ligação com o extrato da Pinbank está em modo de teste. A conferência só roda com a ligação de produção, para não comparar suas vendas com vendas de teste.",
  sem_configuracao: "A ligação com o extrato da Pinbank não está configurada. Fale com o suporte da Quattro.",
};

export const FRASE_FALHA_PINBANK =
  "A Pinbank não respondeu à consulta do extrato. Nada foi alterado. Tente de novo em alguns minutos; se continuar, fale com o suporte da Quattro.";

export const FRASE_EXTRATO_RECUSADO =
  "A Pinbank recusou a consulta ou respondeu sem a lista de vendas do período, e uma conferência assim deixaria todas as vendas sem par. Nada foi alterado. Fale com o suporte da Quattro.";

export const FRASE_VOLUME_ALTO =
  "O período tem vendas demais para conferir de uma vez. Nada foi alterado. Escolha um período menor e confira em partes.";

export const FRASE_CONFERENCIA_DEMOROU =
  "A conferência demorou demais ou falhou. Nada foi alterado. Tente de novo em alguns minutos, ou com um período menor.";

export const FRASE_CONFERENCIA_SEM_RESPOSTA =
  "A conferência não respondeu como esperado. Nada foi alterado. Tente de novo; se continuar, fale com o suporte da Quattro.";

/**
 * A falha que chega SEM a frase da rota — o corpo não é o JSON dela (o 504 da
 * plataforma quando a função passa de `maxDuration`, uma página de erro no
 * caminho) ou nem chegou (`status: null`, o tempo de espera da tela acabou).
 *
 * ⚠️ O NÚMERO DO STATUS fica no CÓDIGO (`http_504`), para quem investiga, e
 * nunca na frase: "A conferência respondeu 504" é detalhe de implementação com
 * que quem opera não tem o que fazer. 5xx e falta de resposta são, na prática,
 * a conferência longa demais — daí o conselho de um período menor.
 */
export function falhaDaConferenciaSemCorpo(status: number | null): { codigo: string; motivo: string } {
  if (status == null) return { codigo: "tempo_esgotado", motivo: FRASE_CONFERENCIA_DEMOROU };
  return { codigo: `http_${status}`, motivo: status >= 500 ? FRASE_CONFERENCIA_DEMOROU : FRASE_CONFERENCIA_SEM_RESPOSTA };
}

/* ─────────────────────────────── utilitários ─────────────────────────────── */

const CHAVE_PARCELA = /^pinbank:(\d{1,19}):(\d{1,3}):(r|t|f|a)$/;
const CHAVE_ESTORNO = /^pinbank:(\d{1,19}):estorno:(total|\d+)$/;

/** O papel do título da parcela: receita, taxa (MDR), tarifa fixa e antecipação. */
export type PapelDoTitulo = "r" | "t" | "f" | "a";

export type ChaveTitulo =
  | { nsu: string; tipo: "parcela"; parcela: number; papel: PapelDoTitulo }
  | { nsu: string; tipo: "estorno"; alvo: "total" | number };

/** Lê a chave do título da maquininha; o que não é chave da Pinbank devolve `null`. */
export function chaveDoTitulo(chave: string | null): ChaveTitulo | null {
  if (!chave) return null;
  const p = CHAVE_PARCELA.exec(chave);
  if (p) {
    const nsu = nsuCanonico(p[1]);
    const parcela = Number(p[2]);
    return nsu && parcela >= 1 ? { nsu, tipo: "parcela", parcela, papel: p[3] as PapelDoTitulo } : null;
  }
  const e = CHAVE_ESTORNO.exec(chave);
  if (e) {
    const nsu = nsuCanonico(e[1]);
    return nsu ? { nsu, tipo: "estorno", alvo: e[2] === "total" ? "total" : Number(e[2]) } : null;
  }
  return null;
}

/** O NSU como texto de dígitos, sem zeros à esquerda ("0" fica). Não sendo só dígitos: `null`. */
export function nsuCanonico(v: unknown): string | null {
  const s = typeof v === "number"
    ? (Number.isSafeInteger(v) && v >= 0 ? String(v) : "")
    : typeof v === "string" ? v.trim() : "";
  if (!/^\d{1,19}$/.test(s)) return null;
  return s.replace(/^0+(?=\d)/, "");
}

/** Reais (número ou texto do PostgREST) → centavos INTEIROS. `null` quando não é número. */
export function centavosDeReais(v: number | string | null | undefined): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** `ate` − `de` em dias, com sinal, sobre datas AAAA-MM-DD (aritmética em UTC). */
export function diasEntreDatas(de: string, ate: string): number {
  const ms = (s: string) => {
    const [a, m, d] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((ms(ate) - ms(de)) / 86_400_000);
}

const dia = (s: string | null | undefined): string | null => {
  const d = (s ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};
const dataBr = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
const diasComSinal = (n: number) =>
  `${n < 0 ? "−" : "+"}${Math.abs(n)} ${Math.abs(n) === 1 ? "dia" : "dias"}`;
const ordemNsu = (a: string | null, b: string | null) => {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.length - b.length || (a < b ? -1 : 1);
};

/**
 * O aviso é do DIA DA VENDA? O `ocorrido_em` do aviso (um instante, que o
 * PostgREST devolve em UTC) e o dia da venda na linha do extrato (dia local),
 * comparados por DIA, fatiando a string, a até 1 dia de distância — a folga
 * cobre a venda das 21h às 24h de São Paulo, que já é o dia seguinte em UTC.
 * É a regra ÚNICA do DIA: o motor a usa para atestar a venda em comum (com o
 * aviso de uma maquininha DESTE estabelecimento), e a leitura para decidir de
 * que NSU do extrato lê os títulos (`nsusDoExtratoComAviso`, com o aviso de
 * QUALQUER maquininha da empresa — também a trocada).
 */
export function avisoNoDiaDaVenda(ocorridoEm: string | null | undefined, dataVenda: string | null | undefined): boolean {
  const a = dia(ocorridoEm);
  const v = dia(dataVenda);
  return a != null && v != null && Math.abs(diasEntreDatas(v, a)) <= 1;
}

/**
 * As NSUs a detalhar, SEPARADAS por lado — cada lado tem o seu teto na
 * leitura, nunca o da união (o tamanho da união dependeria de quantas NSUs do
 * extrato coincidem com as que a empresa gravou: um oráculo).
 */
export interface NsusParaDetalhar {
  /** As NSUs dos títulos da janela: o lado do sistema, que não depende do extrato. */
  janela: string[];
  /** As NSUs das linhas deste EC, cada uma com os dias da venda (AAAA-MM-DD) das linhas dela. */
  extrato: { nsu: string; dias: string[] }[];
}

/** As NSUs a detalhar (avisos, transações e títulos fora da janela): as dos títulos e as do extrato deste EC, cada lado à parte. */
export function nsusParaDetalhar(titulos: LinhaMovimentoPinbank[], linhas: LinhaExtratoPos[], codigoCliente: number): NsusParaDetalhar {
  const janela = new Set<string>();
  for (const t of titulos) {
    const c = chaveDoTitulo(t.chave);
    if (c) janela.add(c.nsu);
  }
  const extrato = new Map<string, Set<string>>();
  for (const l of linhas) {
    if (l.codigoCliente !== codigoCliente) continue;
    const n = nsuCanonico(l.nsu);
    if (!n) continue;
    const dias = extrato.get(n) ?? new Set<string>();
    extrato.set(n, dias);
    const d = dia(l.dataTransacao);
    if (d) dias.add(d);
  }
  return {
    janela: Array.from(janela).sort(ordemNsu),
    extrato: Array.from(extrato.keys()).sort(ordemNsu).map((nsu) => ({ nsu, dias: Array.from(extrato.get(nsu)!).sort() })),
  };
}

/**
 * Das NSUs do extrato, as que têm um aviso DESTA empresa no dia da venda
 * (`avisoNoDiaDaVenda`). O aviso só a plataforma grava: é por ele — nunca pelo
 * título, que a empresa também grava — que a leitura decide de que NSU do
 * extrato lê os títulos de fora da janela. Uma venda real desta empresa sempre
 * tem o aviso do dia dela; um título forjado com o NSU de uma linha alheia, não.
 */
export function nsusDoExtratoComAviso(extrato: NsusParaDetalhar["extrato"], eventos: Pick<EventoPinbankSistema, "nsu" | "ocorrido_em">[]): string[] {
  const avisos = new Map<string, (string | null)[]>();
  for (const ev of eventos) {
    const n = nsuCanonico(ev.nsu);
    if (n) avisos.set(n, [...(avisos.get(n) ?? []), ev.ocorrido_em]);
  }
  return extrato
    .filter((x) => (avisos.get(x.nsu) ?? []).some((oc) => x.dias.some((d) => avisoNoDiaDaVenda(oc, d))))
    .map((x) => x.nsu);
}

/* ─────────────────────────────── as frases ─────────────────────────────── */

const SO_NO_EXTRATO = "Está no extrato e não chegou ao sistema";

const FRASE_MOTIVO: Partial<Record<MotivoConferencia, string>> = {
  nenhum_evento: `${SO_NO_EXTRATO}: nenhum aviso desta venda chegou à empresa.`,
  evento_aguardando_ativacao: `${SO_NO_EXTRATO}: o aviso chegou, mas a maquininha ainda não estava ativada. Ative e reprocesse os eventos.`,
  evento_bloqueado: `${SO_NO_EXTRATO}: o aviso chegou com a assinatura da empresa vencida e ficou guardado. Regularize e reprocesse os eventos.`,
  evento_com_erro: `${SO_NO_EXTRATO}: o aviso chegou e deu erro ao lançar. Veja o motivo nos últimos eventos e reprocesse.`,
  evento_recebido_nao_processado: `${SO_NO_EXTRATO}: o aviso chegou e ainda não foi processado. Reprocesse os eventos.`,
  evento_sem_lancamento: `${SO_NO_EXTRATO}: o aviso chegou e foi processado sem lançar a venda.`,
  evento_de_outra_maquininha: `${SO_NO_EXTRATO}: o aviso desta venda chegou por outra maquininha da empresa.`,
  parcela_ausente_no_sistema: "A venda está no sistema, mas sem esta parcela.",
  venda_ausente_do_extrato: "Lançada no sistema e ausente do extrato da Pinbank no período.",
  parcela_ausente_no_extrato: "A venda está no extrato da Pinbank, mas sem esta parcela.",
  chave_nao_confirmada: "Sem conclusão: a numeração das vendas (NSU) ainda não foi confirmada entre o extrato e o sistema.",
  borda_do_periodo: "Venda do primeiro ou do último dia do período: pode ter caído no dia vizinho do outro lado. Confira um período que inclua o dia ao lado.",
  venda_recente: "Venda de hoje ou de ontem: ela pode ainda não constar no extrato da Pinbank.",
  pix_sem_extrato: "Venda por Pix: ainda não se sabe se o extrato da maquininha traz Pix.",
  reembolso_parcial: "Venda com estorno parcial: o valor bruto não é comparado.",
  cancelada_ausente_do_extrato: "Cancelada no sistema e ausente do extrato: venda cancelada pode não aparecer no extrato.",
  maquininha_desconhecida: "A empresa tem mais de uma maquininha e nenhum aviso desta venda diz de qual ela veio.",
  maquininha_excluida: "O aviso desta venda veio de uma maquininha que não está mais vinculada à empresa; ela pode ter tido outro código no extrato.",
  sem_data_no_extrato: "O extrato não traz a data do repasse desta parcela.",
  sem_valor_no_extrato: "O extrato não traz o valor bruto da venda; o valor não é comparado.",
  linha_duplicada_no_extrato: "Esta parcela aparece repetida no extrato: não dá para saber qual linha corresponde ao título.",
  linha_ilegivel_no_extrato: "A venda aparece no extrato numa linha sem parcela ou sem número; a ausência não é afirmada.",
  linha_sem_estabelecimento: "O extrato traz uma linha sem o código do estabelecimento que pode ser esta venda; a ausência não é afirmada.",
  periodo_do_extrato_incerto: "O extrato trouxe vendas de fora do período pedido: a ausência desta venda não é afirmada.",
  chave_repetida_no_sistema: "Há mais de um título no sistema para a mesma parcela.",
  bruto_inconsistente_no_extrato: "As parcelas desta venda trazem valores brutos diferentes no extrato; o valor não é comparado.",
  extrato_sem_vendas: "O extrato da Pinbank veio sem nenhuma venda desta maquininha que dê para conferir no período: a ausência desta venda não é afirmada.",
  cancelada_no_extrato_sem_titulo: "Cancelada no extrato e sem título no sistema: não há valor a conferir, e o sistema não registrou o cancelamento desta venda.",
  venda_cancelada_no_extrato: "A Pinbank cancelou esta venda (em outra parcela do extrato); esta parcela não aparece — confira o cancelamento no sistema.",
  via_autorizacao: "Provável par pelo código de autorização, no mesmo dia e com o mesmo valor — o NSU é diferente nos dois lados.",
  via_nsu_loja: "Provável par pelo número da venda na loja — o NSU é diferente nos dois lados.",
};

const qtdParcelas = (n: number) => `${n} ${n === 1 ? "parcela" : "parcelas"}`;

/**
 * A frase do item. ⚠️ A frase das PARCELAS (e, quando os dois lados o dizem
 * sem dúvida, a do TOTAL da venda) vai em TODA situação em que o sinal está —
 * inclusive "conferida" e "sem conclusão": a parcela que bate uma a uma numa
 * venda cujo total não bate é exatamente o caso em que a frase da situação,
 * sozinha, diria que está tudo certo.
 *
 * `nExtrato` é o número de parcelas da VENDA no extrato, `null` quando as
 * linhas dela não concordam — nunca o `n` de uma linha só (com uma linha 2/2 e
 * outra 2/3, "o extrato divide em 3 e o sistema em 3" se contradiria).
 */
function fraseDoItem(
  status: StatusConferencia, motivo: MotivoConferencia | null, sinais: SinalConferencia[],
  dS: string | null, dE: string | null, diferencaDias: number | null,
  nExtrato: number | null = null, nSistema: number | null = null,
): string {
  const datas = dS && dE && diferencaDias != null
    ? `O sistema espera o repasse em ${dataBr(dS)}; o extrato diz ${dataBr(dE)} (${diasComSinal(diferencaDias)}).`
    : "";
  const total = sinais.includes("total_da_venda_igual") ? " O total bruto da venda é o mesmo nos dois lados."
    : sinais.includes("total_da_venda_diferente") ? " O total bruto da venda também é diferente nos dois lados."
    : "";
  if (motivo === "parcelas_diferentes_no_extrato") {
    return (nExtrato != null && nSistema != null
      ? `O extrato divide esta venda em ${qtdParcelas(nExtrato)} e o sistema em ${qtdParcelas(nSistema)}; o valor desta parcela pode estar nas parcelas do outro lado — a ausência não é afirmada.`
      : "As linhas do extrato desta venda não concordam no número de parcelas; a ausência desta parcela não é afirmada.") + total;
  }
  // O total diferente SEM o número de parcelas diferente: só a parcela que falta nos DOIS lados o produz.
  const parcelas = sinais.includes("parcelas_diferentes") ? ` O extrato e o sistema dividem a venda em números de parcelas diferentes.${total}`
    : sinais.includes("total_da_venda_diferente") ? " Uma parcela desta venda não está nem no extrato nem no sistema, e o total bruto da venda é diferente nos dois lados."
    : "";
  return fraseDaSituacao(status, motivo, sinais, dS, dE, datas) + parcelas;
}

/** A frase só da SITUAÇÃO (sem a das parcelas, que `fraseDoItem` soma a todas). */
function fraseDaSituacao(
  status: StatusConferencia, motivo: MotivoConferencia | null, sinais: SinalConferencia[],
  dS: string | null, dE: string | null, datas: string,
): string {
  switch (status) {
    case "casada":
      return `Mesma data de repasse (${dataBr(dS)}) e mesmo valor bruto nos dois lados.`;
    case "casada_dia_util":
      return `O repasse estimado caiu em fim de semana ou feriado (${dataBr(dS)}); a Pinbank paga no dia útil seguinte (${dataBr(dE)}).`;
    case "cancelada_nos_dois":
      return motivo === "desfeita_sem_titulo"
        ? "Cancelada no extrato; no sistema a venda foi desfeita antes de virar título."
        : "Cancelada no extrato e no sistema.";
    case "data_diferente":
      return `${datas}${sinais.includes("valor_nao_comparado") ? " O valor bruto não é comparado nesta parcela." : ""}`;
    case "valor_diferente":
      return `O valor bruto desta parcela é diferente nos dois lados.${sinais.includes("dia_util") ? " A data confere (dia útil seguinte)." : ""}`;
    case "data_e_valor_diferentes":
      return `O valor bruto desta parcela é diferente nos dois lados. ${datas}`;
    case "cancelada_no_extrato":
      return "Cancelada no extrato; no sistema o título continua valendo — o aviso de cancelamento não chegou.";
    case "cancelada_so_no_sistema":
      return motivo === "desfeita_sem_titulo"
        ? "Desfeita no sistema antes de virar título; no extrato da Pinbank a venda continua valendo."
        : "Cancelada no sistema; no extrato da Pinbank a venda continua valendo.";
    case "linha_ilegivel":
      return "Linha do extrato sem número da venda ou sem parcela: não dá para conferir.";
    case "duplicada_no_extrato":
      return "A mesma parcela aparece mais de uma vez no extrato.";
    default:
      return (motivo && FRASE_MOTIVO[motivo]) ?? "Sem conclusão.";
  }
}

const NOME_TIPO_TAXA: Record<TipoTaxaExtrato, string> = {
  debito: "débito",
  credito_vista: "crédito à vista",
  parcelado: "crédito parcelado",
};
/** Pontos-base → "2,65%" (fatiado do inteiro, sem ponto flutuante). */
const pctDeBp = (bp: number) => `${Math.floor(bp / 100)},${String(bp % 100).padStart(2, "0")}%`;

/** A frase da TAXA, que se SOMA à do status — só quando ela diverge, ou quando o sistema não lançou o título dela. */
function fraseDaTaxa(t: TaxaDoItem | undefined, sinais: SinalConferencia[] = []): string {
  const semTitulo = sinais.includes("taxa_sem_titulo_no_sistema") ? " O sistema não lançou a taxa desta parcela." : "";
  if (!t || t.resultado !== "diferente" || t.extratoBp == null || t.contratoBp == null || !t.tipo) return semTitulo;
  return ` Taxa: o extrato cobrou ${pctDeBp(t.extratoBp)} e a taxa cadastrada para ${NOME_TIPO_TAXA[t.tipo]} é ${pctDeBp(t.contratoBp)}.${semTitulo}`;
}

/** A frase da ANTECIPAÇÃO, que se soma às outras — só quando ela diverge. */
function fraseDaAntecipacao(a: AntecipacaoDoItem | undefined): string {
  if (!a || a.resultado !== "diferente" || a.extratoBp == null || a.contratoBp == null || !a.tipo) return "";
  return a.tipo === "debito"
    ? ` Antecipação: o extrato informa ${pctDeBp(a.extratoBp)} ao mês numa venda no débito, que não tem antecipação.`
    : ` Antecipação: o extrato informa ${pctDeBp(a.extratoBp)} ao mês e a cadastrada na maquininha é ${pctDeBp(a.contratoBp)}.`;
}

/** A frase do LÍQUIDO da venda — só quando ele diverge, com os dois valores. */
function fraseDoLiquido(sinais: SinalConferencia[], l: LiquidoDaVenda | undefined): string {
  if (!l || !sinais.includes("liquido_da_venda_diferente")) return "";
  return ` O líquido da venda é diferente nos dois lados: a Pinbank deposita ${formatBRL(l.extratoCentavos / 100)} e o sistema lançou ${formatBRL(l.sistemaCentavos / 100)} — confira a taxa, a tarifa fixa e a antecipação cadastradas na maquininha.`;
}

const FRASE_AVISO = (c: AvisoConferencia, n: number): string => {
  switch (c) {
    case "chave_nao_confirmada":
      return "Nenhuma venda do extrato tem o mesmo número (NSU) de uma venda lançada no sistema. Até a numeração ser confirmada com a Pinbank, nenhuma divergência é afirmada.";
    case "extrato_sem_vendas":
      return "A Pinbank devolveu o extrato do período sem nenhuma venda desta maquininha que dê para conferir, e o sistema tem vendas lançadas nele. Por isso nenhuma venda é dada como ausente do extrato: confira com o suporte da Quattro o código do estabelecimento.";
    case "periodo_do_extrato_incerto":
      return "O extrato trouxe vendas de fora do período pedido; por isso nenhuma venda do sistema é dada como ausente do extrato.";
    case "linhas_de_outro_estabelecimento":
      return `O extrato trouxe ${n} parcela(s) de outro estabelecimento; elas ficaram fora da conferência.`;
    case "linhas_sem_estabelecimento":
      return `${n} parcela(s) do extrato vieram sem o código do estabelecimento e ficaram fora da conferência.`;
  }
};

/* ─────────────────────────────── o motor ─────────────────────────────── */

interface VendaNoSistema {
  nsu: string;
  r: Map<number, LinhaMovimentoPinbank[]>;
  t: Map<number, LinhaMovimentoPinbank[]>;
  /** Tarifa fixa (`:f`) e antecipação (`:a`), por parcela — fora do bruto e da taxa. */
  f: Map<number, LinhaMovimentoPinbank[]>;
  a: Map<number, LinhaMovimentoPinbank[]>;
  estornos: { alvo: "total" | number; linha: LinhaMovimentoPinbank }[];
  vendaCentavos: number;
}

interface LinhaLegivel {
  l: LinhaExtratoPos;
  nsu: string;
  k: number;
  n: number;
}

const vivo = (situacao: string | null) => situacao !== "cancelado" && situacao !== "estornado";
/** Reais ao centavo — a MESMA conta de `core/vendas/pos` e do planejador (`agendaDaTransacao`). */
const r2 = (n: number) => Math.round(n * 100) / 100;
const maiorParcela = (m: Map<number, unknown>) => (m.size ? Math.max(...Array.from(m.keys())) : null);
const normAut = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function conferirExtratoPinbank(e: EntradaConferencia): RelatorioConferencia {
  const { de, ate, hoje } = e;
  const ec = e.vinculo.codigoCliente;
  const doEstabelecimento = new Set([e.vinculo.id, ...e.vinculosDoEstabelecimento]);
  const vivos = new Set([e.vinculo.id, ...e.vinculosDaEmpresa]);
  // Há outra maquininha VIVA na empresa (de outro EC): só então a venda sem aviso fica sem dono.
  const variasMaquininhas = Array.from(vivos).some((id) => !doEstabelecimento.has(id));
  const noPeriodo = (d: string | null) => !!d && d >= de && d <= ate;

  /* ── 1. o lado do sistema ─────────────────────────────────────────────── */
  const vistos = new Set<string>();
  const titulos: LinhaMovimentoPinbank[] = [];
  for (const t of e.titulos) {
    if (vistos.has(t.id)) continue;
    vistos.add(t.id);
    titulos.push(t);
  }

  const eventosPorNsu = new Map<string, EventoPinbankSistema[]>();
  for (const ev of e.eventos) {
    const n = nsuCanonico(ev.nsu);
    if (!n) continue;
    eventosPorNsu.set(n, [...(eventosPorNsu.get(n) ?? []), ev]);
  }
  const transacaoPorNsu = new Map<string, TransacaoPinbankSistema>();
  for (const tr of e.transacoes) {
    const n = nsuCanonico(tr.nsu);
    if (n) transacaoPorNsu.set(n, tr);
  }

  const sistema = new Map<string, VendaNoSistema>();
  for (const t of titulos) {
    const c = chaveDoTitulo(t.chave);
    if (!c) continue;
    const v: VendaNoSistema = sistema.get(c.nsu) ?? { nsu: c.nsu, r: new Map(), t: new Map(), f: new Map(), a: new Map(), estornos: [], vendaCentavos: 0 };
    sistema.set(c.nsu, v);
    if (c.tipo === "estorno") {
      v.estornos.push({ alvo: c.alvo, linha: t });
    } else {
      // Cada papel na SUA lista: a tarifa e a antecipação nunca se misturam à taxa (MDR) nem ao bruto.
      const m = v[c.papel];
      m.set(c.parcela, [...(m.get(c.parcela) ?? []), t]);
    }
  }
  for (const v of Array.from(sistema.values())) {
    v.vendaCentavos = Array.from(v.r.values()).flat().reduce((s, t) => s + (centavosDeReais(t.amount) ?? 0), 0);
  }

  /* ── 2. o lado do extrato ─────────────────────────────────────────────── */
  const fora = { outroEstabelecimento: 0, semEstabelecimento: 0, outraMaquininha: 0 };
  const mantidas: LinhaExtratoPos[] = [];
  for (const l of e.extrato) {
    if (l.codigoCliente == null) { fora.semEstabelecimento++; continue; }
    if (l.codigoCliente !== ec) { fora.outroEstabelecimento++; continue; }
    mantidas.push(l);
  }

  const ilegiveis: LinhaExtratoPos[] = [];
  const legiveis: LinhaLegivel[] = [];
  for (const l of mantidas) {
    const nsu = nsuCanonico(l.nsu);
    if (nsu == null || l.parcela == null || l.parcela < 1 || l.totalParcelas == null || l.totalParcelas < l.parcela) {
      ilegiveis.push(l);
      continue;
    }
    legiveis.push({ l, nsu, k: l.parcela, n: l.totalParcelas });
  }
  const nsusComLinhaIlegivel = new Set(ilegiveis.map((l) => nsuCanonico(l.nsu)).filter((n): n is string => !!n));
  /**
   * A linha que PODE ser a venda do título: a do mesmo número, ou — SEM o
   * número — qualquer venda do mesmo dia OU do vizinho (o dia da venda pode
   * diferir em 1 entre os dois lados: o aviso é aceito a até 1 dia, e o dia
   * diferente é sinal, não ausência). Um título que ela pode ser nunca é dado
   * como ausente do extrato.
   */
  const podeSerDe = (linhas: LinhaExtratoPos[]) => {
    const nsus = new Set(linhas.map((l) => nsuCanonico(l.nsu)).filter((n): n is string => !!n));
    const dias = new Set(linhas.filter((l) => nsuCanonico(l.nsu) == null).map((l) => dia(l.dataTransacao)).filter((d): d is string => !!d));
    return (nsu: string, comp: string | null) =>
      nsus.has(nsu) || (comp != null && [somaDias(comp, -1), comp, somaDias(comp, 1)].some((d) => dias.has(d)));
  };
  const linhaIlegivelPode = podeSerDe(ilegiveis);
  // A linha SEM o código do estabelecimento: os valores dela nunca entram num
  // item (pode ser de outra loja), mas ela PROTEGE — o dinheiro pode estar
  // nela, e o título não é dado como ausente.
  const linhaSemEstabelecimentoPode = podeSerDe(e.extrato.filter((l) => l.codigoCliente == null));

  // A venda, pelo extrato: o bruto é o da VENDA (o mesmo em todas as parcelas).
  const vendaExtrato = new Map<string, { brutos: Set<number> }>();
  for (const x of legiveis) {
    const v = vendaExtrato.get(x.nsu) ?? { brutos: new Set<number>() };
    vendaExtrato.set(x.nsu, v);
    if (x.l.brutoCentavos != null) v.brutos.add(x.l.brutoCentavos);
  }
  const brutoInconsistente = (nsu: string) => (vendaExtrato.get(nsu)?.brutos.size ?? 0) > 1;
  const brutoDaVenda = (nsu: string): number | null => {
    const b = vendaExtrato.get(nsu)?.brutos;
    return b && b.size === 1 ? Array.from(b)[0] : null;
  };
  const estimativa = (x: LinhaLegivel): number | null => {
    const bruto = brutoDaVenda(x.nsu);
    if (bruto == null) return null;
    return centavosDeReais(dividir(bruto / 100, x.n)[x.k - 1]);
  };

  const porChave = new Map<string, LinhaLegivel[]>();
  for (const x of legiveis) {
    const c = `${x.nsu}:${x.k}`;
    porChave.set(c, [...(porChave.get(c) ?? []), x]);
  }

  // O número de parcelas da venda NO EXTRATO: o das linhas legíveis dela,
  // quando TODAS concordam (`null` quando discordam — não se sabe).
  const totaisDaVenda = new Map<string, Set<number>>();
  // Os dias da venda nas linhas legíveis — o dia em que o aviso tem de ter chegado.
  const diasDaVenda = new Map<string, Set<string>>();
  for (const x of legiveis) {
    totaisDaVenda.set(x.nsu, (totaisDaVenda.get(x.nsu) ?? new Set<number>()).add(x.n));
    const d = dia(x.l.dataTransacao);
    if (d) diasDaVenda.set(x.nsu, (diasDaVenda.get(x.nsu) ?? new Set<string>()).add(d));
  }
  const parcelasNoExtrato = (nsu: string): number | null => {
    const ns = totaisDaVenda.get(nsu);
    return ns && ns.size === 1 ? Array.from(ns)[0] : null;
  };
  const avisoDoDiaDaVenda = (nsu: string, ev: EventoPinbankSistema) =>
    Array.from(diasDaVenda.get(nsu) ?? []).some((d) => avisoNoDiaDaVenda(ev.ocorrido_em, d));

  /* ── 3. o escopo: só as vendas DESTA maquininha ───────────────────────── */
  // Para TODA venda, haja uma maquininha viva ou várias: o aviso diz de qual
  // vínculo ela veio. Deste estabelecimento → entra. De outro vínculo VIVO →
  // é de outra maquininha, fica fora. De um vínculo que não está mais vivo
  // (a maquininha trocada, excluída) → sem conclusão: ela pode ter tido o
  // mesmo EC, e contá-la como "só no sistema" acusaria a troca de máquina.
  const nsusExtrato = new Set(legiveis.map((x) => x.nsu));
  const maquininhaDesconhecida = new Set<string>();
  const maquininhaExcluida = new Set<string>();
  for (const nsu of Array.from(sistema.keys())) {
    const evs = eventosPorNsu.get(nsu) ?? [];
    if (evs.some((ev) => ev.vinculo_id != null && doEstabelecimento.has(ev.vinculo_id))) continue;
    if (evs.some((ev) => ev.vinculo_id != null && vivos.has(ev.vinculo_id))) { sistema.delete(nsu); fora.outraMaquininha++; continue; }
    if (nsusExtrato.has(nsu)) continue;
    // O aviso aponta para um vínculo que não está mais vivo (a maquininha
    // trocada) — motivo próprio: a empresa pode ter UMA maquininha só, e o
    // aviso DIZ de onde a venda veio. "Mais de uma maquininha e nenhum aviso"
    // é outro caso, e a frase de um seria falsa no outro.
    if (evs.some((ev) => ev.vinculo_id != null)) maquininhaExcluida.add(nsu);
    else if (variasMaquininhas) maquininhaDesconhecida.add(nsu);
  }

  /* ── 4/5. a janela e a confirmação da chave ───────────────────────────── */
  const temReceita = (nsu: string) => (sistema.get(nsu)?.r.size ?? 0) > 0;
  const nsusSistemaNoPeriodo = new Set(
    Array.from(sistema.values())
      .filter((v) => Array.from(v.r.values()).flat().some((t) => noPeriodo(dia(t.competence_date))))
      .map((v) => v.nsu),
  );
  const emComum = Array.from(nsusExtrato).filter(temReceita);
  // Em comum E com o aviso de uma maquininha deste estabelecimento NO DIA DA
  // VENDA da linha do extrato: o aviso só a plataforma grava, o título a
  // empresa também. Só este prova que o extrato é desta empresa (o portão das
  // contagens, `relatorioParaEmpresa`). O dia é a metade que estreita o
  // resíduo: sem ele, anos de avisos (inclusive negados ou com erro) contavam,
  // e qualquer numeração repetida entre lojas abria o extrato de outra.
  // ⚠️ A situação do aviso NÃO conta (negado ou com erro também atesta): ela
  // fala do processamento no sistema, e o que se prova aqui é a ORIGEM — que
  // ESTA maquininha produziu este número neste dia.
  const atestado = (nsu: string) => (eventosPorNsu.get(nsu) ?? []).some((ev) => ev.vinculo_id != null && doEstabelecimento.has(ev.vinculo_id) && avisoDoDiaDaVenda(nsu, ev));
  const emComumAtestado = emComum.filter(atestado);
  // Um lado só — as linhas do extrato contra os avisos (só a plataforma grava;
  // nenhum título entra): o NSU do extrato que, no dia da venda, chegou pelo
  // aviso de uma maquininha que NÃO está mais viva. É a maquininha trocada, e o
  // período anterior à troca: o EC pode estar certo.
  const nsusDeMaquininhaExcluida = Array.from(nsusExtrato).filter((nsu) => (eventosPorNsu.get(nsu) ?? [])
    .some((ev) => ev.vinculo_id != null && !vivos.has(ev.vinculo_id) && avisoDoDiaDaVenda(nsu, ev)));
  const chaveNaoConfirmada = nsusExtrato.size > 0 && nsusSistemaNoPeriodo.size > 0 && emComum.length === 0;
  // Extrato sem NENHUMA parcela legível deste EC (vazio, só de outro
  // estabelecimento, ou só linhas sem número/parcela) e o sistema com vendas no
  // período: é a resposta mais ambígua da Pinbank (EC errado, credencial sem o
  // extrato, recusa sem lista, formato novo). Como a chave não confirmada, nada
  // é afirmado — nem uma venda "só no sistema".
  const extratoVazio = legiveis.length === 0 && nsusSistemaNoPeriodo.size > 0;
  const periodoIncerto = mantidas.some((l) => {
    const d = dia(l.dataTransacao);
    return !!d && !noPeriodo(d);
  });

  /* ── blocos de item ───────────────────────────────────────────────────── */
  const transacaoDe = (nsu: string) => transacaoPorNsu.get(nsu) ?? null;
  const tituloCancelado = (r: LinhaMovimentoPinbank, v: VendaNoSistema): boolean => {
    const tr = transacaoDe(v.nsu);
    return !vivo(r.situacao)
      || v.estornos.some((x) => x.alvo === "total" && vivo(x.linha.situacao))
      || tr?.status === "Cancelada" || tr?.status === "Desfeita"
      || (tr?.status === "Reembolsada" && centavosDeReais(tr.valor) === 0);
  };
  const reembolsoParcial = (v: VendaNoSistema): boolean => {
    const tr = transacaoDe(v.nsu);
    const valor = centavosDeReais(tr?.valor);
    const original = centavosDeReais(tr?.valor_original);
    return v.estornos.some((x) => x.alvo !== "total" && vivo(x.linha.situacao))
      || (tr?.status === "Reembolsada" && valor != null && original != null && valor > 0 && valor < original);
  };
  const titulosDeTaxa = (v: VendaNoSistema, k: number) => (v.t.get(k) ?? []).filter((t) => vivo(t.situacao));
  const somaCentavos = (ts: LinhaMovimentoPinbank[]): number | null =>
    ts.length ? ts.reduce((s, t) => s + (centavosDeReais(t.amount) ?? 0), 0) : null;
  const taxaDe = (v: VendaNoSistema, k: number): number | null => somaCentavos(titulosDeTaxa(v, k));
  const titulosVivos = (m: Map<number, LinhaMovimentoPinbank[]>, k: number) => (m.get(k) ?? []).filter((t) => vivo(t.situacao));
  // Sem NSU em comum, não se sabe se a linha é desta maquininha: a taxa também fica sem conclusão.
  // Venda cancelada no extrato não tem taxa a conferir (o MDR da linha cancelada pode vir zerado).
  // O estabelecimento com OUTRA maquininha viva da empresa: cada uma tem as
  // suas taxas, e só a venda cujo aviso veio DESTA é comparada com as desta.
  const temIrma = Array.from(doEstabelecimento).some((id) => id !== e.vinculo.id);
  const avisoDesta = (l: LinhaExtratoPos) => {
    const nsu = nsuCanonico(l.nsu);
    return nsu != null && (eventosPorNsu.get(nsu) ?? []).some((ev) => ev.vinculo_id === e.vinculo.id);
  };
  const taxaDaLinha = (l: LinhaExtratoPos): TaxaDoItem => {
    const t = compararTaxa(l, e.vinculo.taxas);
    if (chaveNaoConfirmada) return { ...t, resultado: "sem_conclusao" };
    if (temIrma && !avisoDesta(l)) return { ...t, resultado: "outra_maquininha", diferencaBp: null };
    // Mantém o cobrado e o cadastrado para o detalhe; a diferença não — não houve comparação.
    if (l.dataCancelamento != null) return { ...t, resultado: "venda_cancelada", diferencaBp: null };
    return t;
  };
  // A antecipação passa pelas MESMAS portas da taxa — e a diferença sai em toda porta que não compara.
  const antecipacaoDaLinha = (l: LinhaExtratoPos, nsu: string | null): AntecipacaoDoItem => {
    const v = nsu ? sistema.get(nsu) : undefined;
    // A INTENÇÃO do sistema conta, não a situação: título de antecipação desfeito também diz que a venda foi planejada antecipada.
    const a = compararAntecipacao(l, e.vinculo.taxas, e.vinculo.antecipado, v ? v.a.size > 0 : null);
    if (chaveNaoConfirmada) return { ...a, resultado: "sem_conclusao", diferencaBp: null };
    if (temIrma && !avisoDesta(l)) return { ...a, resultado: "outra_maquininha", diferencaBp: null };
    if (l.dataCancelamento != null) return { ...a, resultado: "venda_cancelada", diferencaBp: null };
    return a;
  };
  /**
   * A taxa (em REAIS) que a regra do SISTEMA lança nesta parcela pelo
   * CONTRATO — a mesma conta de `agendaDaTransacao`: o total da venda × a taxa
   * da forma, arredondado ao centavo, repartido pelas parcelas por
   * `dividirCusto` (centavos inteiros, o resto na última, nunca negativa). O
   * planejador só grava o título de taxa quando esta parte é POSITIVA (a taxa
   * de R$ 0,30 a 1,63% arredonda para zero; numa taxa de poucos centavos em
   * 12x, as primeiras parcelas ficam em zero). Nenhum real sai do percentual
   * do EXTRATO: a conta é a do contrato, a que o sistema já faz ao lançar.
   */
  const taxaPeloContrato = (v: VendaNoSistema, k: number, tipo: TipoTaxaExtrato): number => {
    const f = e.vinculo.taxas ? taxaDaForma(tipo, e.vinculo.taxas) : null;
    if (f == null) return 0;
    // A taxa é cobrada sobre a venda SEM a tarifa fixa — a base de `custosDaVenda`.
    return dividirCusto(r2(baseDosCustos(v.vendaCentavos / 100, tipo, e.vinculo.taxas) * f), maiorParcela(v.r) ?? 1)[k - 1] ?? 0;
  };
  /**
   * O extrato cobrou MDR, a taxa daquele tipo está cadastrada (a comparação é
   * conclusiva), a regra do sistema lançaria uma taxa POSITIVA nesta parcela e
   * o sistema NÃO tem título de taxa vivo nela: o MDR falta no resultado (o
   * EBITDA sai maior do que é). Sem taxa cadastrada, o "taxa não cadastrada"
   * já diz por que não há título — e venda sem custo é estado declarado, não
   * divergência. Sem taxa positiva pela regra, não haveria título a lançar.
   */
  const faltaTituloDeTaxa = (l: LinhaExtratoPos, taxa: TaxaDoItem, v: VendaNoSistema, k: number) =>
    l.dataCancelamento == null && l.mdrBp != null && l.mdrBp > 0
    && (taxa.resultado === "igual" || taxa.resultado === "diferente")
    && taxa.tipo != null && taxaPeloContrato(v, k, taxa.tipo) > 0
    && taxaDe(v, k) == null;
  /**
   * O total bruto da VENDA nos dois lados, quando o extrato e o sistema a
   * dividem em números de parcelas DIFERENTES — só quando cada lado o diz sem
   * dúvida: no extrato, o bruto da venda único, nenhuma linha ilegível dela e
   * as linhas concordando no número de parcelas; no sistema, nenhum estorno
   * parcial e CADA parcela que ele tem com um título só, vivo e legível (a
   * chave repetida e a parcela cancelada têm situação própria). Sem isso,
   * `null`: não se compara.
   *
   * ⚠️ A PARCELA QUE FALTA NO SISTEMA CONTA ZERO, não anula a comparação: o
   * título que sumiu (excluído, ou nunca lançado) é dinheiro que o sistema NÃO
   * tem. O número de parcelas do sistema é deduzido da maior chave, então a
   * última parcela que some parece "o sistema dividiu em menos" — e uma lacuna
   * no começo ou no meio (só a p2 de uma venda de 3x) faz o mesmo. Exigir a
   * numeração inteira de 1 a N deixava justamente o título perdido sem
   * divergência nenhuma; o total diferente é o que a denuncia.
   */
  const totalDaVenda = (nsu: string, v: VendaNoSistema): "igual" | "diferente" | null => {
    const ext = brutoDaVenda(nsu);
    if (ext == null || nsusComLinhaIlegivel.has(nsu) || parcelasNoExtrato(nsu) == null || v.r.size === 0 || reembolsoParcial(v)) return null;
    for (const rs of Array.from(v.r.values())) {
      if (rs.length !== 1 || !vivo(rs[0].situacao) || centavosDeReais(rs[0].amount) == null) return null;
    }
    return ext === v.vendaCentavos ? "igual" : "diferente";
  };
  /** Alguma parcela de 1 a N (o número do extrato) sem título no sistema E sem linha legível no extrato. */
  const lacunaNosDois = (nsu: string, v: VendaNoSistema): boolean => {
    const n = parcelasNoExtrato(nsu);
    if (n == null) return false;
    for (let k = 1; k <= n; k++) if (!v.r.has(k) && !porChave.has(`${nsu}:${k}`)) return true;
    return false;
  };
  /** Os sinais da venda dividida em números de parcelas diferentes: o próprio, e o total da venda quando os dois lados estão inteiros. */
  const sinaisDeParcelas = (nsu: string, v: VendaNoSistema): SinalConferencia[] => {
    const t = totalDaVenda(nsu, v);
    return t == null ? ["parcelas_diferentes"] : ["parcelas_diferentes", t === "igual" ? "total_da_venda_igual" : "total_da_venda_diferente"];
  };
  /**
   * O líquido da VENDA nos dois lados — só quando cada lado a tem INTEIRA e sem
   * dúvida. No extrato: nenhuma linha ilegível dela, as linhas concordando no
   * número de parcelas, UMA linha por parcela de 1 a N, todas com o líquido e
   * nenhuma cancelada. No sistema: o MESMO N, UM título de receita vivo por
   * parcela e nenhum estorno (total ou parcial). Sem isso,
   * `null`: não se compara — a parcela solta não fecha (a Pinbank reparte o
   * líquido da venda), e comparar meia venda acusaria a metade que falta.
   */
  const liquidoMemo = new Map<string, LiquidoDaVenda | null>();
  const liquidoDaVenda = (nsu: string, v: VendaNoSistema): LiquidoDaVenda | null => {
    if (liquidoMemo.has(nsu)) return liquidoMemo.get(nsu)!;
    const calc = (): LiquidoDaVenda | null => {
      const n = parcelasNoExtrato(nsu);
      if (n == null || nsusComLinhaIlegivel.has(nsu) || maiorParcela(v.r) !== n || v.r.size !== n) return null;
      if (v.estornos.length > 0 || reembolsoParcial(v)) return null;
      let extratoCentavos = 0;
      let sistemaCentavos = 0;
      for (let k = 1; k <= n; k++) {
        const ls = porChave.get(`${nsu}:${k}`) ?? [];
        if (ls.length !== 1 || ls[0].l.liquidoRepasseCentavos == null || ls[0].l.dataCancelamento != null) return null;
        extratoCentavos += ls[0].l.liquidoRepasseCentavos;
        const rs = v.r.get(k) ?? [];
        // A venda desfeita inteira (transação cancelada, estorno total) nem chega aqui: o par dela sai
        // antes, como cancelado. O que sobra é a parcela cancelada sozinha — e ela tira a venda da comparação.
        const bruto = rs.length === 1 && vivo(rs[0].situacao) ? centavosDeReais(rs[0].amount) : null;
        if (bruto == null) return null;
        sistemaCentavos += bruto - [v.t, v.f, v.a].reduce((s, m) => s + (somaCentavos(titulosVivos(m, k)) ?? 0), 0);
      }
      return { extratoCentavos, sistemaCentavos, parcelas: n };
    };
    const r = calc();
    liquidoMemo.set(nsu, r);
    return r;
  };
  const blocoExtrato = (x: { l: LinhaExtratoPos; nsu: string | null }, est: number | null): ExtratoDoItem => ({
    dataVenda: dia(x.l.dataTransacao),
    dataRepasse: dia(x.l.dataFuturaPagamento),
    dataCancelamento: dia(x.l.dataCancelamento),
    brutoVendaCentavos: x.nsu ? brutoDaVenda(x.nsu) : x.l.brutoCentavos,
    brutoParcelaEstimadoCentavos: est,
    bandeira: x.l.bandeira,
    tipoCompra: x.l.tipoCompra,
    status: x.l.status,
    statusPagamento: x.l.statusPagamento,
    taxa: taxaDaLinha(x.l),
    antecipacao: antecipacaoDaLinha(x.l, x.nsu),
    liquidoCentavos: x.l.liquidoRepasseCentavos,
    aguardandoDefinicao: {
      brutoParcelaCentavos: x.l.brutoParcelaCentavos,
      splitCentavos: x.l.splitCentavos,
    },
  });
  const blocoSistema = (r: LinhaMovimentoPinbank, v: VendaNoSistema, k: number): SistemaDoItem => ({
    tituloId: r.id,
    vencimento: dia(r.due_date),
    competencia: dia(r.competence_date),
    situacao: r.situacao ?? "—",
    valorCentavos: centavosDeReais(r.amount) ?? 0,
    vendaCentavos: v.vendaCentavos,
    taxaCentavos: taxaDe(v, k),
    taxaTituloIds: titulosDeTaxa(v, k).map((t) => t.id),
    tarifaCentavos: somaCentavos(titulosVivos(v.f, k)),
    antecipacaoCentavos: somaCentavos(titulosVivos(v.a, k)),
    antecipacaoTituloIds: titulosVivos(v.a, k).map((t) => t.id),
    estornoDaVendaCentavos: null,
  });

  const itens: ItemConferencia[] = [];
  const ocorrencia = new Map<string, number>();
  const idDeLinha = (nsu: string | null, k: number | null) => {
    const base = `${nsu ?? "?"}:${k ?? "?"}`;
    const n = (ocorrencia.get(base) ?? 0) + 1;
    ocorrencia.set(base, n);
    return `e:${base}:${n}`;
  };
  /**
   * `nExtratoDaVenda`: o número de parcelas da VENDA no extrato para a frase
   * (`parcelasNoExtrato`, `null` quando as linhas discordam). O item da linha
   * guarda em `totalParcelasExtrato` o `n` DELA (a tela mostra "2/3"), que não
   * é o da venda quando as linhas discordam.
   */
  const novoItem = (p: Omit<ItemConferencia, "frase">, dS: string | null = null, dE: string | null = null,
    nExtratoDaVenda: number | null = p.totalParcelasExtrato): ItemConferencia => ({
    ...p,
    frase: fraseDoItem(p.status, p.motivo, p.sinais, dS, dE, p.diferencaDias, nExtratoDaVenda, p.totalParcelasSistema)
      + fraseDaTaxa(p.extrato?.taxa, p.sinais) + fraseDaAntecipacao(p.extrato?.antecipacao)
      + fraseDoLiquido(p.sinais, p.liquidoDaVenda),
  });
  /** O que muda num item de um lado só quando a venda está nos dois lados com números de parcelas diferentes. */
  type ExtraDoItem = { sinais?: SinalConferencia[]; totalParcelasExtrato?: number | null; totalParcelasSistema?: number | null };
  const itemDeLinha = (x: LinhaLegivel, status: StatusConferencia, motivo: MotivoConferencia | null, est: number | null, extra: ExtraDoItem = {}): ItemConferencia =>
    novoItem({
      id: idDeLinha(x.nsu, x.k), status, motivo, sinais: extra.sinais ?? [], nsu: x.nsu, parcela: x.k,
      totalParcelasExtrato: x.n, totalParcelasSistema: extra.totalParcelasSistema ?? null,
      extrato: blocoExtrato(x, est), sistema: null, diferencaDias: null, diferencaCentavos: null,
    }, null, null, motivo === "parcelas_diferentes_no_extrato" ? parcelasNoExtrato(x.nsu) : x.n);
  const itemDeTitulo = (r: LinhaMovimentoPinbank, v: VendaNoSistema, k: number, status: StatusConferencia, motivo: MotivoConferencia | null, extra: ExtraDoItem = {}): ItemConferencia =>
    novoItem({
      id: `t:${r.id}`, status, motivo, sinais: extra.sinais ?? [], nsu: v.nsu, parcela: k,
      totalParcelasExtrato: extra.totalParcelasExtrato ?? null, totalParcelasSistema: maiorParcela(v.r),
      extrato: null, sistema: blocoSistema(r, v, k), diferencaDias: null, diferencaCentavos: null,
    });

  /* ── 6. o pareamento por (NSU, parcela) ───────────────────────────────── */
  const consumidos = new Set<string>();
  const linhasSobra: LinhaLegivel[] = [];

  const avaliarPar = (x: LinhaLegivel, r: LinhaMovimentoPinbank, v: VendaNoSistema): ItemConferencia => {
    const l = x.l;
    const sinais: SinalConferencia[] = [];
    if (r.situacao === "baixado" || r.situacao === "conciliado") sinais.push("recebido_no_sistema");
    const dV = dia(l.dataTransacao);
    const dC = dia(r.competence_date);
    if (dV && dC && dV !== dC) sinais.push("dia_da_venda_diferente");
    const est = estimativa(x);
    const sisCent = centavosDeReais(r.amount);
    const nSis = maiorParcela(v.r);
    const dS = dia(r.due_date);
    const base = {
      id: `p:${x.nsu}:${x.k}`, nsu: x.nsu, parcela: x.k, totalParcelasExtrato: x.n, totalParcelasSistema: nSis,
      extrato: blocoExtrato(x, est), sistema: blocoSistema(r, v, x.k),
    };

    // a. o cancelamento vem PRIMEIRO: venda cancelada não tem data nem valor a conferir.
    const canceladaSistema = tituloCancelado(r, v);
    const canceladaExtrato = l.dataCancelamento != null;
    // Estorno PARCIAL registrado no sistema e a linha com data de cancelamento:
    // o aviso do estorno CHEGOU e foi lançado — "cancelada só no extrato"
    // diria o contrário. Sem conclusão, como todo estorno parcial — e a TAXA
    // também: a venda segue valendo pelo resto, então "venda cancelada" ao lado
    // de "estorno parcial" se contradiria; o MDR da linha com cancelamento pode
    // vir zerado, então ela não é comparada, com um resultado de nome próprio.
    if (canceladaExtrato && !canceladaSistema && reembolsoParcial(v)) {
      sinais.push("reembolso_parcial", "valor_nao_comparado");
      const taxa: TaxaDoItem = { ...base.extrato.taxa, resultado: "estorno_parcial", diferencaBp: null };
      const antecipacao: AntecipacaoDoItem = { ...base.extrato.antecipacao, resultado: "estorno_parcial", diferencaBp: null };
      return novoItem({ ...base, extrato: { ...base.extrato, taxa, antecipacao }, status: "inconclusivo", motivo: "reembolso_parcial", sinais, diferencaDias: null, diferencaCentavos: null });
    }
    if (canceladaSistema || canceladaExtrato) {
      const status: StatusConferencia = canceladaSistema && canceladaExtrato
        ? "cancelada_nos_dois" : canceladaExtrato ? "cancelada_no_extrato" : "cancelada_so_no_sistema";
      return novoItem({ ...base, status, motivo: null, sinais, diferencaDias: null, diferencaCentavos: null });
    }
    // O MDR cobrado no extrato sem o título de taxa no sistema — não muda o status.
    if (faltaTituloDeTaxa(l, base.extrato.taxa, v, x.k)) sinais.push("taxa_sem_titulo_no_sistema");
    // O líquido da venda inteira: o que a Pinbank deposita × o que o sistema lançou — não muda o status.
    const liq = liquidoDaVenda(x.nsu, v);
    if (liq) sinais.push(liquidoConfere(liq) ? "liquido_da_venda_igual" : "liquido_da_venda_diferente");
    const comLiquido = liq ? { liquidoDaVenda: liq } : {};

    // b. a data do repasse, comparada por DIA (a hora da Pinbank não é a do título).
    const dE = l.dataFuturaPagamento?.slice(0, 10) ?? null;
    let data: "mesmo" | "dia_util" | "diferente" | "sem_data";
    if (!dE || !dS) data = "sem_data";
    else if (dE === dS) data = "mesmo";
    else if (!ehDiaUtil(dS) && dE === postergarParaDiaUtil(dS)) data = "dia_util";
    else data = "diferente";
    if (data === "dia_util") sinais.push("dia_util");
    const diferencaDias = dS && dE ? diasEntreDatas(dS, dE) : null;

    // c. o valor bruto da parcela — a TAXA nunca entra aqui.
    let naoComparado: MotivoConferencia | null = null;
    if (reembolsoParcial(v)) {
      sinais.push("reembolso_parcial", "valor_nao_comparado");
      naoComparado = "reembolso_parcial";
    } else if (brutoInconsistente(x.nsu)) {
      sinais.push("valor_nao_comparado");
      naoComparado = "bruto_inconsistente_no_extrato";
    } else if (est == null || sisCent == null) {
      sinais.push("valor_nao_comparado");
      naoComparado = "sem_valor_no_extrato";
    }
    const valorOk = naoComparado == null && sisCent === est;
    const diferencaCentavos = naoComparado == null && est != null && sisCent != null ? est - sisCent : null;
    // Números de parcelas diferentes: a divergência fica afirmada NESTA parcela
    // (o par existe), e o total bruto da venda é comparado quando os dois lados estão inteiros.
    if (nSis !== x.n) sinais.push(...sinaisDeParcelas(x.nsu, v));
    // O MESMO número de parcelas, e uma parcela que falta NOS DOIS lados (o
    // título perdido e a linha ausente): as que têm par conferem e o dinheiro
    // dela some de tudo. Faltando a ÚLTIMA, o número do sistema cai e o total
    // é comparado acima; faltando a primeira ou a do meio, só aqui.
    else if (lacunaNosDois(x.nsu, v) && totalDaVenda(x.nsu, v) === "diferente") sinais.push("total_da_venda_diferente");

    // d. a combinação.
    let status: StatusConferencia;
    let motivo: MotivoConferencia | null = null;
    if (data === "sem_data") {
      if (naoComparado == null && !valorOk) status = "valor_diferente";
      else { status = "inconclusivo"; motivo = "sem_data_no_extrato"; }
    } else if (data === "diferente") {
      status = naoComparado != null || valorOk ? "data_diferente" : "data_e_valor_diferentes";
    } else if (naoComparado != null) {
      status = "inconclusivo";
      motivo = naoComparado;
    } else if (valorOk) {
      status = data === "mesmo" ? "casada" : "casada_dia_util";
    } else {
      status = "valor_diferente";
    }
    return novoItem({ ...base, ...comLiquido, status, motivo, sinais, diferencaDias, diferencaCentavos }, dS, dE);
  };

  for (const linhas of Array.from(porChave.values())) {
    const x = linhas[0];
    const v = sistema.get(x.nsu);
    const rs = v?.r.get(x.k) ?? [];
    if (linhas.length > 1) {
      // Parcela repetida no extrato: nenhuma cópia é pareada — escolher a
      // primeira seria afirmar uma correspondência que o extrato não dá.
      for (const y of linhas) itens.push(itemDeLinha(y, "duplicada_no_extrato", null, estimativa(y)));
      for (const r of rs) { consumidos.add(r.id); itens.push(itemDeTitulo(r, v!, x.k, "inconclusivo", "linha_duplicada_no_extrato")); }
      continue;
    }
    if (!v || rs.length === 0) { linhasSobra.push(x); continue; }
    if (rs.length > 1) {
      rs.forEach((r, i) => {
        consumidos.add(r.id);
        const it = itemDeTitulo(r, v, x.k, "inconclusivo", "chave_repetida_no_sistema");
        if (i !== 0) { itens.push(it); return; }
        const extrato = blocoExtrato(x, estimativa(x));
        itens.push({ ...it, extrato, totalParcelasExtrato: x.n, frase: it.frase + fraseDaTaxa(extrato.taxa) + fraseDaAntecipacao(extrato.antecipacao) });
      });
      continue;
    }
    consumidos.add(rs[0].id);
    itens.push(avaliarPar(x, rs[0], v));
  }

  for (const l of ilegiveis) {
    const nsu = nsuCanonico(l.nsu);
    itens.push(novoItem({
      id: idDeLinha(nsu, l.parcela), status: "linha_ilegivel", motivo: null, sinais: [], nsu, parcela: l.parcela,
      totalParcelasExtrato: l.totalParcelas, totalParcelasSistema: null,
      extrato: blocoExtrato({ l, nsu: null }, null), sistema: null, diferencaDias: null, diferencaCentavos: null,
    }));
  }

  const titulosSobra: { r: LinhaMovimentoPinbank; v: VendaNoSistema; k: number }[] = [];
  for (const v of Array.from(sistema.values())) {
    for (const [k, rs] of Array.from(v.r.entries())) for (const r of rs) if (!consumidos.has(r.id)) titulosSobra.push({ r, v, k });
  }

  /* ── 9. o par provável (só entre as sobras) ───────────────────────────── */
  const linhasCandidatas = linhasSobra.filter((x) => !temReceita(x.nsu));
  const titulosCandidatos = titulosSobra.filter((t) => !nsusExtrato.has(t.v.nsu));
  const linhasPorNsu = new Map<string, LinhaLegivel[]>();
  for (const x of linhasCandidatas) linhasPorNsu.set(x.nsu, [...(linhasPorNsu.get(x.nsu) ?? []), x]);
  const titulosPorNsu = new Map<string, typeof titulosCandidatos>();
  for (const t of titulosCandidatos) titulosPorNsu.set(t.v.nsu, [...(titulosPorNsu.get(t.v.nsu) ?? []), t]);
  const autorizacoesDoSistema = (nsu: string) =>
    new Set((eventosPorNsu.get(nsu) ?? []).map((ev) => normAut(ev.autorizacao)).filter(Boolean));

  const relacao = new Map<string, Map<string, "autorizacao" | "nsu_loja">>(); // NSU do extrato → NSU do sistema
  const ligar = (nE: string, nS: string, via: "autorizacao" | "nsu_loja") => {
    const m = relacao.get(nE) ?? new Map();
    relacao.set(nE, m);
    if (!m.has(nS)) m.set(nS, via);
  };
  for (const [nE, ls] of Array.from(linhasPorNsu.entries())) {
    for (const x of ls) {
      const n = nsuCanonico(x.l.nsuLoja);
      if (n && titulosPorNsu.has(n)) ligar(nE, n, "nsu_loja");
    }
    if (relacao.has(nE)) continue;
    const bruto = brutoDaVenda(nE);
    for (const x of ls) {
      const aut = normAut(x.l.codAutorizacao);
      const dV = dia(x.l.dataTransacao);
      if (!aut || !dV || bruto == null) continue;
      for (const [nS, ts] of Array.from(titulosPorNsu.entries())) {
        if (!autorizacoesDoSistema(nS).has(aut)) continue;
        if (!ts.some((t) => dia(t.r.competence_date) === dV)) continue;
        if (sistema.get(nS)?.vendaCentavos !== bruto) continue;
        ligar(nE, nS, "autorizacao");
      }
    }
  }
  const parceirosDoSistema = new Map<string, number>();
  for (const m of Array.from(relacao.values())) for (const nS of Array.from(m.keys())) parceirosDoSistema.set(nS, (parceirosDoSistema.get(nS) ?? 0) + 1);

  const linhasEmPar = new Set<LinhaLegivel>();
  const titulosEmPar = new Set<string>();
  for (const [nE, m] of Array.from(relacao.entries())) {
    if (m.size !== 1) continue; // casa com mais de um: não se escolhe
    const [[nS, via]] = Array.from(m.entries());
    if (parceirosDoSistema.get(nS) !== 1) continue;
    for (const x of linhasPorNsu.get(nE) ?? []) {
      const ts = (titulosPorNsu.get(nS) ?? []).filter((t) => t.k === x.k && !titulosEmPar.has(t.r.id));
      if (ts.length !== 1) continue;
      const { r, v } = ts[0];
      linhasEmPar.add(x);
      titulosEmPar.add(r.id);
      const dS = dia(r.due_date);
      const dE = dia(x.l.dataFuturaPagamento);
      const est = estimativa(x);
      const sisCent = centavosDeReais(r.amount);
      const extrato = blocoExtrato(x, est);
      itens.push(novoItem({
        id: `p:${x.nsu}:${x.k}`,
        status: "par_provavel" as const,
        motivo: via === "nsu_loja" ? "via_nsu_loja" : "via_autorizacao",
        sinais: faltaTituloDeTaxa(x.l, extrato.taxa, v, x.k) ? ["taxa_sem_titulo_no_sistema"] : [],
        nsu: x.nsu, parcela: x.k, totalParcelasExtrato: x.n, totalParcelasSistema: maiorParcela(v.r),
        extrato, sistema: blocoSistema(r, v, x.k),
        diferencaDias: dS && dE ? diasEntreDatas(dS, dE) : null,
        diferencaCentavos: est != null && sisCent != null ? est - sisCent : null,
        provavel: { via, nsuNoSistema: nS },
      }, dS, dE));
    }
  }

  /* ── 7. as linhas do extrato sem título ───────────────────────────────── */
  const motivoDoEvento = (nsu: string): MotivoConferencia => {
    const evs = [...(eventosPorNsu.get(nsu) ?? [])].sort((a, b) => (b.ocorrido_em ?? "").localeCompare(a.ocorrido_em ?? ""));
    const ev = evs[0];
    if (!ev) return "nenhum_evento";
    if (ev.vinculo_id != null && !doEstabelecimento.has(ev.vinculo_id)) return "evento_de_outra_maquininha";
    switch (ev.situacao) {
      case "aguardando_ativacao": return "evento_aguardando_ativacao";
      case "bloqueado": return "evento_bloqueado";
      case "erro": return "evento_com_erro";
      case "recebido": return "evento_recebido_nao_processado";
      default: return "evento_sem_lancamento";
    }
  };
  // A venda desfeita no sistema: a transação foi cancelada, desfeita, negada
  // ou reembolsada por inteiro — ou todo título da venda está cancelado.
  const vendaDesfeitaNoSistema = (nsu: string): boolean => {
    const tr = transacaoDe(nsu);
    if (tr && (tr.status === "Cancelada" || tr.status === "Desfeita" || tr.status === "Negada"
      || (tr.status === "Reembolsada" && centavosDeReais(tr.valor) === 0))) return true;
    const v = sistema.get(nsu);
    const rs = v ? Array.from(v.r.values()).flat() : [];
    return !!v && rs.length > 0 && rs.every((r) => tituloCancelado(r, v));
  };
  for (const x of linhasSobra) {
    if (linhasEmPar.has(x)) continue;
    if (chaveNaoConfirmada) itens.push(itemDeLinha(x, "inconclusivo", "chave_nao_confirmada", estimativa(x)));
    else if (x.l.dataCancelamento != null) {
      // Cancelada no extrato e sem título: venda desfeita na maquininha é
      // comum, e o certo no sistema é exatamente NÃO ter título. Nunca "só no
      // extrato" — isso somaria em "Bruto estimado no extrato" um dinheiro que não existiu.
      if (vendaDesfeitaNoSistema(x.nsu)) {
        itens.push(itemDeLinha(x, "cancelada_nos_dois", temReceita(x.nsu) ? null : "desfeita_sem_titulo", estimativa(x)));
      } else {
        itens.push(itemDeLinha(x, "inconclusivo", "cancelada_no_extrato_sem_titulo", estimativa(x)));
      }
    }
    // Viva no extrato e desfeita no sistema (transação cancelada, desfeita,
    // negada ou reembolsada por inteiro, ou todo título cancelado): o sistema
    // REGISTROU o desfazimento, e é ele que não chegou à Pinbank. "Só no
    // extrato · o aviso chegou sem lançar a venda" mandaria depurar o webhook.
    else if (vendaDesfeitaNoSistema(x.nsu)) {
      itens.push(itemDeLinha(x, "cancelada_so_no_sistema", temReceita(x.nsu) ? null : "desfeita_sem_titulo", estimativa(x)));
    }
    else if (temReceita(x.nsu)) {
      // A venda está no sistema dividida em OUTRO número de parcelas: o valor
      // desta parcela do extrato pode estar nas parcelas do sistema. Afirmar
      // "só no extrato" somaria nele um dinheiro que o sistema já tem.
      const vs = sistema.get(x.nsu)!;
      const nSis = maiorParcela(vs.r);
      if (nSis !== parcelasNoExtrato(x.nsu)) {
        itens.push(itemDeLinha(x, "inconclusivo", "parcelas_diferentes_no_extrato", estimativa(x),
          { sinais: sinaisDeParcelas(x.nsu, vs), totalParcelasSistema: nSis }));
      } else {
        itens.push(itemDeLinha(x, "so_no_extrato", "parcela_ausente_no_sistema", estimativa(x)));
      }
    }
    else itens.push(itemDeLinha(x, "so_no_extrato", motivoDoEvento(x.nsu), estimativa(x)));
  }

  /* ── 8. os títulos sem linha no extrato ───────────────────────────────── */
  const ehPix = (nsu: string) => (eventosPorNsu.get(nsu) ?? []).some((ev) => ev.event_type.startsWith("Compra.Pix"));
  // A Pinbank cancelou a venda numa parcela que o extrato traz: as parcelas que
  // ele NÃO traz são da mesma venda cancelada — nunca "só no sistema".
  const canceladaNoExtrato = (nsu: string) => legiveis.some((y) => y.nsu === nsu && y.l.dataCancelamento != null);
  const recenteDesde = somaDias(hoje, -1);
  for (const { r, v, k } of titulosSobra) {
    if (titulosEmPar.has(r.id)) continue;
    const comp = dia(r.competence_date);
    if (chaveNaoConfirmada || extratoVazio) {
      if (noPeriodo(comp)) itens.push(itemDeTitulo(r, v, k, "inconclusivo", chaveNaoConfirmada ? "chave_nao_confirmada" : "extrato_sem_vendas"));
      continue;
    }
    if (nsusExtrato.has(v.nsu)) {
      // A venda ESTÁ no extrato e esta parcela não: afirmado mesmo na borda —
      // MENOS quando o extrato traz uma linha ilegível que pode ser ela (da
      // mesma venda, ou sem número no mesmo dia), quando o extrato traz a venda
      // CANCELADA (noutra parcela) ou quando a venda está cancelada no sistema
      // (venda cancelada pode sair do extrato pela metade).
      if (linhaIlegivelPode(v.nsu, comp)) { itens.push(itemDeTitulo(r, v, k, "inconclusivo", "linha_ilegivel_no_extrato")); continue; }
      if (linhaSemEstabelecimentoPode(v.nsu, comp)) { itens.push(itemDeTitulo(r, v, k, "inconclusivo", "linha_sem_estabelecimento")); continue; }
      if (canceladaNoExtrato(v.nsu)) {
        // Cancelada nos dois lados: a venda. Só no extrato: a Pinbank cancelou e o sistema não sabe — sem conclusão
        // nesta parcela (a divergência já é afirmada na parcela que o extrato traz).
        itens.push(tituloCancelado(r, v)
          ? itemDeTitulo(r, v, k, "cancelada_nos_dois", null)
          : itemDeTitulo(r, v, k, "inconclusivo", "venda_cancelada_no_extrato"));
        continue;
      }
      const motivo: MotivoConferencia = tituloCancelado(r, v) ? "cancelada_ausente_do_extrato" : "parcela_ausente_no_extrato";
      // O extrato divide a venda em OUTRO número de parcelas (ou suas linhas
      // não concordam): o valor desta parcela pode estar nas do extrato — 1x de
      // R$ 300 no extrato e 3x de R$ 100 no sistema não deixam R$ 200 "só no
      // sistema". A divergência fica afirmada nas parcelas que têm par.
      const nExt = parcelasNoExtrato(v.nsu);
      if (motivo === "parcela_ausente_no_extrato" && nExt !== maiorParcela(v.r)) {
        itens.push(itemDeTitulo(r, v, k, "inconclusivo", "parcelas_diferentes_no_extrato", { sinais: sinaisDeParcelas(v.nsu, v), totalParcelasExtrato: nExt }));
        continue;
      }
      itens.push(itemDeTitulo(r, v, k, motivo === "parcela_ausente_no_extrato" ? "so_no_sistema" : "inconclusivo", motivo));
      continue;
    }
    if (!noPeriodo(comp)) continue;
    let motivo: MotivoConferencia;
    if (linhaIlegivelPode(v.nsu, comp)) motivo = "linha_ilegivel_no_extrato";
    else if (linhaSemEstabelecimentoPode(v.nsu, comp)) motivo = "linha_sem_estabelecimento";
    else if (maquininhaExcluida.has(v.nsu)) motivo = "maquininha_excluida";
    else if (maquininhaDesconhecida.has(v.nsu)) motivo = "maquininha_desconhecida";
    else if (tituloCancelado(r, v)) motivo = "cancelada_ausente_do_extrato";
    else if (ehPix(v.nsu)) motivo = "pix_sem_extrato";
    else if (comp! >= recenteDesde) motivo = "venda_recente";
    else if (comp === de || comp === ate) motivo = "borda_do_periodo";
    else if (periodoIncerto) motivo = "periodo_do_extrato_incerto";
    else motivo = "venda_ausente_do_extrato";
    itens.push(itemDeTitulo(r, v, k, motivo === "venda_ausente_do_extrato" ? "so_no_sistema" : "inconclusivo", motivo));
  }

  /* ── 10. o relatório ──────────────────────────────────────────────────── */
  // O estorno da venda vai só no item da MENOR parcela — senão somaria N vezes.
  const menorPorNsu = new Map<string, ItemConferencia>();
  for (const i of itens) {
    if (!i.sistema || !i.nsu) continue;
    const nsuSis = i.provavel?.nsuNoSistema ?? i.nsu;
    const atual = menorPorNsu.get(nsuSis);
    if (!atual || (i.parcela ?? 0) < (atual.parcela ?? 0)) menorPorNsu.set(nsuSis, i);
  }
  for (const [nsu, i] of Array.from(menorPorNsu.entries())) {
    const est = (sistema.get(nsu)?.estornos ?? []).filter((x) => vivo(x.linha.situacao));
    if (est.length && i.sistema) i.sistema.estornoDaVendaCentavos = est.reduce((s, x) => s + (centavosDeReais(x.linha.amount) ?? 0), 0);
  }

  const ORDEM_GRUPO: Record<GrupoConferencia, number> = { divergencias: 0, semConclusao: 1, conferidas: 2 };
  itens.sort((a, b) =>
    ORDEM_GRUPO[GRUPO_DO_STATUS[a.status]] - ORDEM_GRUPO[GRUPO_DO_STATUS[b.status]]
    || ORDEM_STATUS.indexOf(a.status) - ORDEM_STATUS.indexOf(b.status)
    || ordemNsu(a.nsu, b.nsu)
    || (a.parcela ?? 0) - (b.parcela ?? 0)
    || a.id.localeCompare(b.id));

  const porStatus = Object.fromEntries(
    ORDEM_STATUS.map((s) => [s, { quantidade: 0, centavosExtrato: null, centavosSistema: null }]),
  ) as Record<StatusConferencia, LinhaResumo>;
  const grupos = { conferidas: 0, divergencias: 0, semConclusao: 0 };
  const porResultado = Object.fromEntries(ORDEM_RESULTADO_TAXA.map((r) => [r, 0])) as Record<ResultadoTaxa, number>;
  const porResultadoAntecipacao = Object.fromEntries(ORDEM_RESULTADO_ANTECIPACAO.map((r) => [r, 0])) as Record<ResultadoAntecipacao, number>;
  const antecipacoesContadas = new Set<string>();
  let centavosAntecipacao = 0;
  // O líquido conta uma vez por VENDA (todas as parcelas dela levam o mesmo par de valores).
  const liquidoPorNsu = new Map<string, LiquidoDaVenda>();
  let itensComDivergencia = 0;
  // Cada título de taxa conta UMA vez: dois títulos de receita da mesma parcela
  // (a chave repetida) trazem o MESMO título de taxa no bloco do sistema.
  const taxasContadas = new Set<string>();
  let centavosTaxa = 0;
  for (const it of itens) {
    const linha = porStatus[it.status];
    linha.quantidade++;
    grupos[GRUPO_DO_STATUS[it.status]]++;
    if (it.extrato) porResultado[it.extrato.taxa.resultado]++;
    if (it.extrato) porResultadoAntecipacao[it.extrato.antecipacao.resultado]++;
    if (it.liquidoDaVenda && it.nsu) liquidoPorNsu.set(it.nsu, it.liquidoDaVenda);
    if (it.sistema?.antecipacaoCentavos != null && it.sistema.antecipacaoTituloIds.some((id) => !antecipacoesContadas.has(id))) {
      for (const id of it.sistema.antecipacaoTituloIds) antecipacoesContadas.add(id);
      centavosAntecipacao += it.sistema.antecipacaoCentavos;
    }
    if (itemComDivergencia(it)) itensComDivergencia++;
    const ext = it.extrato?.brutoParcelaEstimadoCentavos ?? null;
    if (ext != null) linha.centavosExtrato = (linha.centavosExtrato ?? 0) + ext;
    const sis = it.sistema?.valorCentavos ?? null;
    if (sis != null) linha.centavosSistema = (linha.centavosSistema ?? 0) + sis;
    if (it.sistema?.taxaCentavos != null && it.sistema.taxaTituloIds.some((id) => !taxasContadas.has(id))) {
      for (const id of it.sistema.taxaTituloIds) taxasContadas.add(id);
      centavosTaxa += it.sistema.taxaCentavos;
    }
  }
  // As contagens de cada lado, SEM cruzar: o que o extrato trouxe deste EC e o
  // que o sistema lançou da maquininha no período (já sem a outra maquininha)
  // — só as parcelas VÁLIDAS: vivas, de vendas que o sistema não desfez. É o
  // dado da própria empresa: nenhum oráculo se abre.
  const parcelasValidasNoPeriodo = Array.from(sistema.values())
    .filter((v) => !vendaDesfeitaNoSistema(v.nsu))
    .flatMap((v) => Array.from(v.r.values()).flat().map((t) => ({ t, nsu: v.nsu })))
    .filter((x) => vivo(x.t.situacao))
    .filter((x) => noPeriodo(dia(x.t.competence_date)));

  const avisos: RelatorioConferencia["avisos"] = [];
  const avisar = (c: AvisoConferencia, n = 0) => avisos.push({ codigo: c, frase: FRASE_AVISO(c, n) });
  if (chaveNaoConfirmada) avisar("chave_nao_confirmada");
  if (extratoVazio) avisar("extrato_sem_vendas");
  if (periodoIncerto) avisar("periodo_do_extrato_incerto");
  if (fora.outroEstabelecimento > 0) avisar("linhas_de_outro_estabelecimento", fora.outroEstabelecimento);
  if (fora.semEstabelecimento > 0) avisar("linhas_sem_estabelecimento", fora.semEstabelecimento);

  return {
    versao: CONFERENCIA_PINBANK_VERSION,
    estado: chaveNaoConfirmada ? "chave_nao_confirmada" : extratoVazio ? "extrato_vazio" : "conferido",
    vazio: mantidas.length === 0 && nsusSistemaNoPeriodo.size === 0,
    periodo: { de, ate },
    hoje,
    avisos,
    resumo: {
      porStatus,
      grupos,
      itensComDivergencia,
      nsusExtrato: nsusExtrato.size,
      nsusSistema: new Set(Array.from(nsusSistemaNoPeriodo).concat(emComum)).size,
      nsusEmComum: emComum.length,
      nsusEmComumAtestados: emComumAtestado.length,
      nsusDoExtratoDeMaquininhaExcluida: nsusDeMaquininhaExcluida.length,
      lados: {
        extrato: { linhas: mantidas.length, vendas: nsusExtrato.size },
        sistema: {
          parcelas: parcelasValidasNoPeriodo.length,
          vendas: new Set(parcelasValidasNoPeriodo.map((x) => x.nsu)).size,
          centavos: parcelasValidasNoPeriodo.length ? parcelasValidasNoPeriodo.reduce((s, x) => s + (centavosDeReais(x.t.amount) ?? 0), 0) : null,
        },
      },
      foraDaConferencia: fora,
      taxa: {
        porResultado,
        parcelasComTaxaInformada: mantidas.filter((l) => l.mdrBp != null).length,
        titulosDeTaxaNoSistema: taxasContadas.size,
        centavosTaxaNoSistema: centavosTaxa,
      },
      antecipacao: {
        porResultado: porResultadoAntecipacao,
        parcelasComAntecipacaoInformada: mantidas.filter((l) => l.taxaMesBp != null).length,
        titulosDeAntecipacaoNoSistema: antecipacoesContadas.size,
        centavosAntecipacaoNoSistema: centavosAntecipacao,
      },
      liquido: (() => {
        const vs = Array.from(liquidoPorNsu.values());
        const diferentes = vs.filter((x) => !liquidoConfere(x)).length;
        return {
          vendasComparadas: vs.length,
          vendasIguais: vs.length - diferentes,
          vendasDiferentes: diferentes,
          centavosExtrato: vs.length ? vs.reduce((s, x) => s + x.extratoCentavos, 0) : null,
          centavosSistema: vs.length ? vs.reduce((s, x) => s + x.sistemaCentavos, 0) : null,
        };
      })(),
    },
    itens,
  };
}
