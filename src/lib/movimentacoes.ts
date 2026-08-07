"use client";

/**
 * Persistência das movimentações que ainda não têm tabela própria —
 * transferências e regras de conciliação (localStorage, demo-safe).
 *
 * A transferência gera DOIS lançamentos no dataset (saída na origem, entrada no
 * destino) para que saldo, extrato e fluxo de caixa a enxerguem; o registro
 * guardado aqui é o FATO, que mantém os dois lados amarrados. Sem ele, apagar
 * uma transferência deixaria metade do movimento órfã.
 */
import { appendImported, removerImported } from "@/lib/imported";
import { isDemo } from "@/lib/demo";
import type { Transferencia, RegraConciliacao } from "@/core/movimentacoes";
import type { Movement } from "@/lib/types";

const K_TRANSF = "a4p_transferencias";
const K_REGRAS = "a4p_regras_conciliacao";

function ler<T>(k: string, padrao: T): T {
  if (typeof window === "undefined") return padrao;
  try {
    const s = localStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : padrao;
  } catch { return padrao; }
}
function gravar(k: string, v: unknown): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cota cheia */ }
}

/* ----------------------------- transferências ----------------------------- */

export const listarTransferencias = (): Transferencia[] => ler<Transferencia[]>(K_TRANSF, []);

/** Os ids dos dois lançamentos gerados por uma transferência. */
const idsDaTransferencia = (id: string) => [`${id}-out`, `${id}-in`];

export async function criarTransferencia(t: Transferencia): Promise<Transferencia[]> {
  const lista = [t, ...listarTransferencias().filter((x) => x.id !== t.id)];
  gravar(K_TRANSF, lista);

  if (isDemo) {
    // Dois lançamentos LIQUIDADOS: a transferência já aconteceu, então saldo e
    // extrato têm de refletir na hora.
    const [idSaida, idEntrada] = idsDaTransferencia(t.id);
    appendImported({
      movement: {
        id: idSaida, account_id: t.contaOrigem, type: "saida", status: "pago",
        amount: t.valor, due_date: t.data, paid_date: t.data, reconciled: false,
        category: "Transferência", description: t.descricao || "Transferência enviada",
      } as Movement,
    });
    appendImported({
      movement: {
        id: idEntrada, account_id: t.contaDestino, type: "entrada", status: "pago",
        amount: t.valor, due_date: t.dataChegada || t.data, paid_date: t.dataChegada || t.data,
        reconciled: false, category: "Transferência",
        description: t.descricao || "Transferência recebida",
      } as Movement,
    });
  }
  return lista;
}

export function removerTransferencia(id: string): Transferencia[] {
  const out = listarTransferencias().filter((t) => t.id !== id);
  gravar(K_TRANSF, out);
  // Apagar o fato apaga os dois lados — deixar um para trás desequilibraria o
  // saldo entre as contas para sempre.
  if (isDemo) removerImported(idsDaTransferencia(id));
  return out;
}

export function marcarConciliacaoTransferencia(
  id: string,
  lado: "origem" | "destino",
  valor: boolean,
): Transferencia[] {
  const out = listarTransferencias().map((t) =>
    t.id === id ? { ...t, [lado === "origem" ? "conciliadaOrigem" : "conciliadaDestino"]: valor } : t);
  gravar(K_TRANSF, out);
  return out;
}

/* ------------------------- regras de conciliação ------------------------- */

export const listarRegrasConciliacao = (): RegraConciliacao[] => ler<RegraConciliacao[]>(K_REGRAS, []);

export function salvarRegraConciliacao(r: RegraConciliacao): RegraConciliacao[] {
  const atual = listarRegrasConciliacao();
  const i = atual.findIndex((x) => x.id === r.id);
  // Regra editada mantém a POSIÇÃO: a ordem é a prioridade, e mexer nela ao
  // salvar mudaria em silêncio qual regra ganha.
  const out = i >= 0 ? atual.map((x, k) => (k === i ? r : x)) : [...atual, r];
  gravar(K_REGRAS, out);
  return out;
}

export function removerRegraConciliacao(id: string): RegraConciliacao[] {
  const out = listarRegrasConciliacao().filter((r) => r.id !== id);
  gravar(K_REGRAS, out);
  return out;
}

/** Sobe ou desce a regra — o desempate visível de prioridade. */
export function moverRegraConciliacao(id: string, dir: -1 | 1): RegraConciliacao[] {
  const l = listarRegrasConciliacao();
  const i = l.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= l.length) return l;
  const out = [...l];
  [out[i], out[j]] = [out[j], out[i]];
  gravar(K_REGRAS, out);
  return out;
}

export const novoIdMov = (p: string): string => `${p}_${Date.now().toString(36)}_${Math.floor(performance.now() % 1000)}`;
