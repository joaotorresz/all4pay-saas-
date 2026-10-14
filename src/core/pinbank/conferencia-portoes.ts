/**
 * OS PORTÕES DA CONFERÊNCIA extrato × sistema — puro, sem I/O e sem relógio
 * (o "agora" entra pela porta da frente). A leitura e a rota os aplicam; a
 * guarda (`npm run pinbank-conferencia`) os dirige com defeitos plantados.
 *
 *   · `pedirAte` / `passouDoTeto` — o teto das leituras do banco;
 *   · `reservarConferencia` — a espera por EMPRESA entre duas chamadas à Pinbank;
 *   · `relatorioParaEmpresa` — sem nenhuma venda em comum ATESTADA pelo aviso
 *     da Pinbank, só as contagens de cada lado (nada que cruze os dois).
 */
import type { AvisoConferencia, RelatorioConferencia } from "@/core/pinbank/conferencia";

/* ─────────────────────────────── o teto das leituras ─────────────────────────────── */

/**
 * Quantas linhas PEDIR a uma leitura que tem teto: UMA a mais do que pode
 * existir. É a linha a mais que prova que o teto foi passado.
 */
export function pedirAte(teto: number): number {
  return teto + 1;
}

/**
 * A leitura passou do teto? Só quando veio MAIS do que ele (a linha a mais
 * pedida por `pedirAte`) — ou quando o servidor contou mais linhas do que
 * entregou (`total`, o `count: "exact"`: o PostgREST cortou pelo `max_rows`).
 *
 * ⚠️ `>=` acusaria o lote CHEIO e legítimo. `pinbank_transacoes` é única por
 * (empresa, NSU): um lote de 100 NSUs em que toda venda chegou devolve EXATAMENTE
 * 100 linhas — e toda loja com cerca de 100 vendas no período levaria "vendas
 * demais". Truncar continua proibido: passou do teto, a conferência pede um
 * período menor, nunca confere o pedaço.
 */
export function passouDoTeto(recebidas: number, teto: number, total?: number | null): boolean {
  return recebidas > teto || (total != null && total > recebidas);
}

/* ─────────────────────────────── a espera por empresa ─────────────────────────────── */

/** Entre duas conferências da MESMA empresa: 60 segundos. */
export const ESPERA_CONFERENCIA_MS = 60_000;

export type ReservaConferencia = { ok: true } | { ok: false; restanteMs: number };

/**
 * A espera por EMPRESA entre duas chamadas à Pinbank, conferida E carimbada no
 * mesmo passo (sem `await` no meio, nada passa entre ler e escrever o mapa).
 *
 * ⚠️ A recusa NÃO carimba: quem insiste antes do prazo não empurra o prazo — ele
 * conta da última chamada que SAIU. E a chamada que falha conta: ela também
 * chegou à Pinbank com a credencial da plataforma.
 *
 * ⚠️ O mapa é de UMA instância do servidor (a rota o guarda no módulo): outra
 * instância não o vê. É o freio do clique repetido, não o limite durável (D4 em
 * `docs/rodada-10/conferencia.md`) — o interruptor da conferência fica
 * desligado até existir um limite que o banco guarde.
 */
export function reservarConferencia(
  mapa: Map<string, number>,
  org: string,
  agoraMs: number,
  esperaMs: number = ESPERA_CONFERENCIA_MS,
): ReservaConferencia {
  const ultima = mapa.get(org);
  if (ultima != null && agoraMs - ultima < esperaMs) {
    // Relógio que andou para trás não vira espera maior que a regra.
    return { ok: false, restanteMs: Math.min(esperaMs, Math.max(1, esperaMs - (agoraMs - ultima))) };
  }
  // As reservas vencidas saem: o mapa não cresce sem fim numa instância longa.
  for (const [k, t] of Array.from(mapa.entries())) {
    if (agoraMs - t >= esperaMs) mapa.delete(k);
  }
  mapa.set(org, agoraMs);
  return { ok: true };
}

/** A frase da recusa, com os segundos que faltam (arredondados para cima, nunca zero). */
export function fraseDeEspera(restanteMs: number): string {
  const s = Math.max(1, Math.ceil(restanteMs / 1000));
  return `Esta empresa acabou de conferir com o extrato da Pinbank. Nada foi alterado. Espere ${s} ${s === 1 ? "segundo" : "segundos"} para conferir de novo.`;
}

/* ─────────────────────────────── só as contagens ─────────────────────────────── */

/**
 * Por que só as quantidades — as DUAS causas e o que fazer. A causa legítima
 * mais comum não é o EC errado: é nenhuma venda do período ter chegado pelo
 * aviso da Pinbank (o aviso desligado, a maquininha nova). Conferir um EC
 * certo nunca abriria os detalhes, então a frase não manda só "conferir o EC".
 */
export const FRASE_DETALHES_OCULTOS =
  "Nenhuma venda do extrato tem o mesmo número (NSU), no mesmo dia, de uma venda que chegou a esta maquininha pelo aviso da Pinbank. Se o código do estabelecimento (EC) estiver certo, os detalhes aparecem quando houver no período uma venda que chegou pelo aviso da Pinbank; se não estiver, fale com o suporte da Quattro.";

/**
 * A maquininha TROCADA: vendas do extrato chegaram, no dia delas, pelo aviso
 * de uma maquininha que não está mais vinculada (o período é anterior à troca).
 * O EC provavelmente está certo; a frase não manda conferi-lo.
 */
export const FRASE_DETALHES_MAQUININHA_EXCLUIDA =
  "Vendas deste extrato chegaram, no dia delas, pelo aviso de uma maquininha que não está mais vinculada à empresa: o período é provavelmente anterior à troca de maquininha. A conferência mostra só as quantidades até a Quattro confirmar o código do estabelecimento (EC) da maquininha antiga; fale com o suporte da Quattro.";

/**
 * O relatório SÓ COM AS CONTAGENS de cada lado — nada que saia de cruzar o
 * extrato com o sistema. Sem `estado`, sem `resumo`, sem `itens`: não há como
 * ler deste objeto um número que dependa de comparar uma linha do extrato com
 * um título, uma data, um valor ou a taxa cadastrada.
 */
export interface RelatorioSoContagens {
  versao: RelatorioConferencia["versao"];
  vazio: false;
  periodo: RelatorioConferencia["periodo"];
  hoje: string;
  /** Só os avisos de um lado só (`AVISOS_SEM_CRUZAMENTO`). */
  avisos: RelatorioConferencia["avisos"];
  contagens: RelatorioConferencia["resumo"]["lados"] & {
    foraDaConferencia: RelatorioConferencia["resumo"]["foraDaConferencia"];
  };
  /**
   * `sem_venda_em_comum`: nenhuma venda em comum atestada (o EC pode estar
   * errado, ou nenhuma venda chegou pelo aviso). `maquininha_excluida`: as
   * vendas do extrato vieram, no dia delas, pelo aviso de uma maquininha que
   * não está mais vinculada — um lado só (linhas × avisos), nenhum título.
   */
  detalhes: { visiveis: false; codigo: "sem_venda_em_comum" | "maquininha_excluida"; frase: string };
}

/** O relatório do motor, inteiro: o extrato está provado como desta empresa (ou não há nada dos dois lados). */
export type RelatorioCompleto = RelatorioConferencia & { detalhes: { visiveis: true } };

/** O relatório como sai para a EMPRESA: o do motor, inteiro, OU só as contagens. */
export type RelatorioParaEmpresa = RelatorioCompleto | RelatorioSoContagens;

export type DetalhesDaConferencia = RelatorioParaEmpresa["detalhes"];

/** O relatório só com as contagens? (O tipo da tela se estreita por aqui.) */
export function soContagens(r: RelatorioParaEmpresa): r is RelatorioSoContagens {
  return !r.detalhes.visiveis;
}

/**
 * Os avisos que olham UM lado só (o extrato, ou o próprio sistema). O de
 * "numeração não confirmada" fica de fora: ele aparece ou some conforme um NSU
 * do extrato tenha título no sistema — e título a empresa grava.
 */
export const AVISOS_SEM_CRUZAMENTO: ReadonlySet<AvisoConferencia> = new Set<AvisoConferencia>([
  "extrato_sem_vendas",
  "periodo_do_extrato_incerto",
  "linhas_de_outro_estabelecimento",
  "linhas_sem_estabelecimento",
]);

/**
 * Sem NENHUMA venda em comum ATESTADA pelo aviso da Pinbank, nada prova que o
 * extrato é desta empresa: o código do estabelecimento (EC) é digitado pela
 * plataforma, e um dígito trocado aponta para o extrato de OUTRA loja — de
 * outro cliente da Quattro ou de qualquer lojista da Pinbank no mesmo canal.
 *
 * ⚠️ **A PROVA É O AVISO, NÃO O TÍTULO.** O título (`movements`) a empresa
 * também grava, com a chave `pinbank:<nsu>:<k>:r` que quiser: um título forjado
 * com o NSU de uma linha alheia entraria "em comum" e abriria o extrato da
 * outra loja inteiro. O aviso (`pinbank_eventos`) só a plataforma grava, com a
 * maquininha de onde a venda veio — `nsusEmComumAtestados` conta só o NSU em
 * comum que tem o aviso de uma maquininha deste estabelecimento NO DIA DA
 * VENDA da linha do extrato (o mesmo número em outro dia não prova nada).
 *
 * ⚠️ **E AS CONTAGENS NÃO CRUZAM OS LADOS.** Quantas parcelas "conferem", têm
 * "valor diferente" ou "taxa igual" depende do que a empresa grava (o valor e a
 * data do título forjado, a taxa cadastrada na maquininha): variar um e ler a
 * contagem é um oráculo sobre a linha alheia. Então só saem as contagens de
 * cada lado, separadas (`resumo.lados`), os avisos de um lado só e o que ficou
 * fora da conferência. Nem a soma do extrato, nem a situação, nem a taxa.
 *
 * ⚠️ A condição é a falta de venda em comum ATESTADA, não o estado "chave não
 * confirmada": com o sistema sem venda no período, o motor devolve "conferido"
 * e TODAS as linhas do extrato errado como "só no extrato". É o caso do EC
 * errado. A correção durável (mostrar e auditar o EC no `/admin`, recusar o EC
 * repetido entre empresas) pede migration — decisão D10, em aberto.
 *
 * ⚠️ A MAQUININHA TROCADA (D12): o período anterior à troca só tem avisos da
 * maquininha antiga, que não atestam (não é deste estabelecimento vivo). A
 * resposta continua só com as contagens — mas com o código e a frase próprios,
 * para o suporte não ir conferir um EC que está certo. O sinal é de um lado só
 * (as linhas do extrato contra os avisos, que só a plataforma grava): nada que
 * a empresa grave o muda.
 */
export function relatorioParaEmpresa(r: RelatorioConferencia): RelatorioParaEmpresa {
  if (r.vazio || r.resumo.nsusEmComumAtestados > 0) return { ...r, detalhes: { visiveis: true } };
  const excluida = r.resumo.nsusDoExtratoDeMaquininhaExcluida > 0;
  return {
    versao: r.versao,
    vazio: false,
    periodo: r.periodo,
    hoje: r.hoje,
    avisos: r.avisos.filter((a) => AVISOS_SEM_CRUZAMENTO.has(a.codigo)),
    contagens: {
      extrato: { ...r.resumo.lados.extrato },
      sistema: { ...r.resumo.lados.sistema },
      foraDaConferencia: { ...r.resumo.foraDaConferencia },
    },
    detalhes: excluida
      ? { visiveis: false, codigo: "maquininha_excluida", frase: FRASE_DETALHES_MAQUININHA_EXCLUIDA }
      : { visiveis: false, codigo: "sem_venda_em_comum", frase: FRASE_DETALHES_OCULTOS },
  };
}
