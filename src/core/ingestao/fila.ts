/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A FILA UM-A-UM — uma decisão por vez, no teclado
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Por que não uma tabela densa.** A revisão de importação mostrava tudo de
 * uma vez, e uma tabela de 500 linhas não é uma tela de decisão: é uma tela de
 * desistência. Quem opera não confere 500 linhas numa grade — rola até o fim,
 * clica em "confirmar tudo" e descobre a classificação errada no fechamento.
 * Uma decisão por vez cabe na cabeça; 500 de uma vez, não.
 *
 * Puro e tipado: aqui só se decide QUAL é o próximo, QUEM cabe no lote e QUANTO
 * falta. Quem desenha é `components/upload/FilaUmAUm`; quem grava é `lib`.
 */
import type { MovimentoIngerido, PlanoIngestao } from "./index";

export const FILA_VERSION = "ingestao-fila/1.0.0";

/**
 * ⚠️ O limiar da confiança ALTA. Abaixo dele nada entra em ação de massa —
 * é a diferença entre "o sistema tem certeza" e "o sistema chutou e acertou o
 * formato". A classificação desconhecida cai em 0.4 por decisão da taxonomia.
 */
export const CONFIANCA_ALTA = 0.9;

export type Decisao = "pendente" | "confirmada" | "ignorada";

export type EstadoFila = {
  /** Decisão por chave de idempotência — sobrevive ao abandono. */
  decisoes: Record<string, Decisao>;
  /** Categoria corrigida à mão, por chave. */
  correcoes: Record<string, string>;
  /** Onde a pessoa parou. */
  indice: number;
  /** Marcas de tempo das decisões, para estimar o que falta pelo ritmo REAL. */
  marcas: number[];
};

export const estadoVazio = (): EstadoFila => ({ decisoes: {}, correcoes: {}, indice: 0, marcas: [] });

/**
 * As linhas que PRECISAM de decisão.
 *
 * ⚠️ Duplicata de base fica FORA: ela não entra na importação, e pedir decisão
 * sobre o que já existe é gastar a atenção da pessoa no que não muda nada. O
 * que entra é o que vai virar lançamento.
 */
export function montarFila(plano: PlanoIngestao): MovimentoIngerido[] {
  return plano.linhas.filter((l) => l.situacao !== "duplicata_base" && l.situacao !== "duplicata_arquivo");
}

/** A categoria em vigor: a corrigida à mão vence a sugerida. */
export function categoriaDe(item: MovimentoIngerido, estado: EstadoFila): string {
  return estado.correcoes[item.chave] ?? item.classificacao.categoria;
}

/** Foi corrigida à mão? Uma correção humana vale confiança total. */
export function confiancaDe(item: MovimentoIngerido, estado: EstadoFila): number {
  return estado.correcoes[item.chave] !== undefined ? 1 : item.classificacao.confianca;
}

export type Progresso = {
  total: number;
  feitas: number;
  restantes: number;
  /** 0..1 */
  fracao: number;
  /**
   * Estimativa em ms. `null` quando ainda não há ritmo medido — ⚠️ um número
   * inventado no primeiro item ("faltam 4 horas") faz a pessoa fechar a aba.
   * Ausência é ausência (ONDA 4).
   */
  restanteMs: number | null;
  /** Mediana do tempo por decisão, em ms. `null` sem base. */
  ritmoMs: number | null;
};

/**
 * ⚠️ A estimativa sai do ritmo REAL da pessoa, não de uma constante. Duas
 * pessoas revisam em velocidades diferentes, e a mesma pessoa acelera depois
 * das primeiras. Mediana, não média: uma pausa para o cafézinho no meio
 * multiplicaria a média e a barra passaria a mentir para o resto do lote.
 */
export function progresso(fila: MovimentoIngerido[], estado: EstadoFila): Progresso {
  const total = fila.length;
  let feitas = 0;
  for (const it of fila) if ((estado.decisoes[it.chave] ?? "pendente") !== "pendente") feitas++;
  const restantes = total - feitas;

  const intervalos: number[] = [];
  for (let i = 1; i < estado.marcas.length; i++) {
    const d = estado.marcas[i] - estado.marcas[i - 1];
    // ⚠️ Descarta o intervalo absurdo: quem sai para o almoço no meio do lote
    // não decidiu em 40 minutos — aquele intervalo não é ritmo, é ausência.
    if (d > 0 && d < 60_000) intervalos.push(d);
  }
  let ritmoMs: number | null = null;
  if (intervalos.length >= 3) {
    const ord = [...intervalos].sort((a, b) => a - b);
    ritmoMs = ord[Math.floor(ord.length / 2)];
  }

  return {
    total, feitas, restantes,
    fracao: total === 0 ? 1 : feitas / total,
    restanteMs: ritmoMs === null ? null : ritmoMs * restantes,
    ritmoMs,
  };
}

export type Lote = {
  chaves: string[];
  categoria: string;
  contraparte: string | null;
  /** Por que NÃO há lote — a tela diz, em vez de sumir com o botão. */
  motivo: string | null;
};

/**
 * Quem cabe na ação de massa, tomando o item ATUAL como âncora.
 *
 * ⚠️ **TRÊS condições, e a da categoria é inegociável.** Confiança alta, MESMA
 * categoria e MESMA contraparte. Massa com categoria divergente é o defeito que
 * a fila existe para impedir: um clique reclassifica dezenas de lançamentos
 * para a linha errada do DRE, e ninguém percebe porque o total continua batendo.
 *
 * ⚠️ E a ÂNCORA também precisa de confiança alta. Sem isso, uma linha duvidosa
 * arrastaria as outras para a categoria de que o próprio sistema não tem
 * certeza — é a dúvida se propagando com cara de decisão.
 */
export function loteDe(fila: MovimentoIngerido[], atual: MovimentoIngerido, estado: EstadoFila): Lote {
  const categoria = categoriaDe(atual, estado);
  const contraparte = atual.contraparte;
  const base: Lote = { chaves: [], categoria, contraparte, motivo: null };

  if (confiancaDe(atual, estado) < CONFIANCA_ALTA) {
    return { ...base, motivo: "A confiança desta linha é baixa — confirme uma a uma." };
  }
  if (!contraparte) {
    return { ...base, motivo: "Sem contraparte identificada, não dá para agrupar com segurança." };
  }

  const chaves = fila
    .filter((l) => (estado.decisoes[l.chave] ?? "pendente") === "pendente")
    .filter((l) => l.contraparte === contraparte)
    .filter((l) => categoriaDe(l, estado) === categoria)
    .filter((l) => confiancaDe(l, estado) >= CONFIANCA_ALTA)
    .map((l) => l.chave);

  if (chaves.length <= 1) {
    return { ...base, chaves, motivo: "Não há outras linhas iguais pendentes." };
  }
  return { ...base, chaves, motivo: null };
}

/** Aplica a decisão e anda. Puro: devolve estado novo. */
export function decidir(
  estado: EstadoFila, chave: string, decisao: Decisao, agora: number,
): EstadoFila {
  return {
    ...estado,
    decisoes: { ...estado.decisoes, [chave]: decisao },
    marcas: [...estado.marcas, agora],
  };
}

export function corrigir(estado: EstadoFila, chave: string, categoria: string): EstadoFila {
  return { ...estado, correcoes: { ...estado.correcoes, [chave]: categoria } };
}

/**
 * A correção alcança as PENDENTES da mesma contraparte no PRÓPRIO lote.
 *
 * ⚠️ **Medido:** sem isto, 500 linhas custavam 10,3 min e **71 delas eram
 * correções repetidas** — a mesma pessoa classificando "POSTO IPIRANGA" sete
 * vezes no mesmo arquivo, porque a confiança baixa impede o agrupamento e cada
 * uma pedia o gesto inteiro. As linhas de confiança baixa de um extrato real
 * não são aleatórias: são as MESMAS contrapartes que o classificador não
 * reconheceu.
 *
 * ⚠️ Alcança só o que está PENDENTE e só a MESMA contraparte — nunca o que já
 * foi decidido (mudaria uma decisão que a pessoa já tomou) e nunca outra
 * contraparte (é a regra da categoria, que não se atravessa). Sem contraparte,
 * corrige só a linha: agrupar por descritivo bruto juntaria coisas diferentes.
 */
export function corrigirIguais(
  estado: EstadoFila, fila: MovimentoIngerido[], atual: MovimentoIngerido, categoria: string,
): EstadoFila {
  const correcoes = { ...estado.correcoes, [atual.chave]: categoria };
  if (atual.contraparte) {
    for (const l of fila) {
      if (l.chave === atual.chave) continue;
      if ((estado.decisoes[l.chave] ?? "pendente") !== "pendente") continue;
      if (l.contraparte !== atual.contraparte) continue;
      correcoes[l.chave] = categoria;
    }
  }
  return { ...estado, correcoes };
}

export function aplicarLote(estado: EstadoFila, lote: Lote, agora: number): EstadoFila {
  const decisoes = { ...estado.decisoes };
  for (const c of lote.chaves) decisoes[c] = "confirmada";
  return { ...estado, decisoes, marcas: [...estado.marcas, agora] };
}

/**
 * O próximo item PENDENTE a partir de um índice.
 *
 * ⚠️ Devolve `-1` quando acabou, e a tela mostra o fecho do lote. Voltar ao
 * índice 0 daria a impressão de trabalho infinito.
 */
export function proximoPendente(fila: MovimentoIngerido[], estado: EstadoFila, de: number): number {
  for (let i = de; i < fila.length; i++) {
    if ((estado.decisoes[fila[i].chave] ?? "pendente") === "pendente") return i;
  }
  // Pode haver pendente ANTES do índice (a pessoa voltou e pulou).
  for (let i = 0; i < Math.min(de, fila.length); i++) {
    if ((estado.decisoes[fila[i].chave] ?? "pendente") === "pendente") return i;
  }
  return -1;
}

/** O anterior, para a seta esquerda. Nunca passa de 0. */
export const anterior = (indice: number): number => Math.max(0, indice - 1);

/** O que será gravado: só o confirmado, e sempre em `previsto`. */
export function paraGravar(fila: MovimentoIngerido[], estado: EstadoFila): MovimentoIngerido[] {
  return fila
    .filter((l) => estado.decisoes[l.chave] === "confirmada")
    .map((l) => {
      const cat = estado.correcoes[l.chave];
      return cat === undefined ? l : { ...l, classificacao: { ...l.classificacao, categoria: cat, confianca: 1 } };
    });
}
