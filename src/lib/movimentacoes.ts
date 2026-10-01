"use client";

/**
 * Persistência das movimentações que ainda não têm tabela própria —
 * transferências e regras de conciliação.
 *
 * A transferência gera DOIS lançamentos (saída na origem, entrada no destino)
 * para que saldo, extrato e fluxo de caixa a enxerguem; o registro guardado
 * aqui é o FATO, que mantém os dois lados amarrados. Sem ele, apagar uma
 * transferência deixaria metade do movimento órfã.
 *
 * ⚠️ **EM PRODUÇÃO ESTA TELA GRAVAVA SÓ NO NAVEGADOR** (achado de 30/09/2026,
 * dirigindo a tela como usuário). Os dois lançamentos nasciam só dentro de
 * `if (isDemo)`: em live o registro ia para o `localStorage` e o saldo das
 * contas nunca se movia — a tela dizia "Transferência registrada" e o dinheiro
 * não saía de lugar nenhum. É o "escritor morto" de novo. Agora o caminho de
 * produção passa pelo escritor único (`createTransferencia`), e o FATO só é
 * guardado DEPOIS de o banco aceitar os lançamentos — ao contrário, uma recusa
 * deixaria um registro sem dinheiro por trás.
 *
 * O registro mora em `org_state` (via `store-org`), não no navegador: é dado
 * de negócio, e dois usuários da mesma empresa têm de ver a mesma lista.
 */
import { appendImported, removerImported } from "@/lib/imported";
import { isDemo } from "@/lib/demo";
import { ler, gravar, CHAVES_ORG } from "@/lib/store-org";
import { CATEGORIA_TRANSFERENCIA } from "@/core/indicadores/convencoes";
import type { Transferencia, RegraConciliacao } from "@/core/movimentacoes";
import type { Movement } from "@/lib/types";

const K_TRANSF = CHAVES_ORG.transferencias;
const K_REGRAS = CHAVES_ORG.regrasConciliacao;

/* ----------------------------- transferências ----------------------------- */

export const listarTransferencias = (): Transferencia[] => ler<Transferencia[]>(K_TRANSF, []);

/** Os ids dos dois lançamentos gerados por uma transferência (demonstração). */
const idsDaTransferencia = (id: string) => [`${id}-out`, `${id}-in`];

export async function criarTransferencia(t: Transferencia): Promise<Transferencia[]> {
  let grupoId: string | null = t.grupoId ?? null;
  if (isDemo) {
    // Dois lançamentos LIQUIDADOS: a transferência já aconteceu, então saldo e
    // extrato têm de refletir na hora.
    const [idSaida, idEntrada] = idsDaTransferencia(t.id);
    appendImported({
      movement: {
        id: idSaida, account_id: t.contaOrigem, type: "saida", status: "pago",
        amount: t.valor, due_date: t.data, paid_date: t.data, reconciled: false,
        category: CATEGORIA_TRANSFERENCIA, description: t.descricao || "Transferência enviada",
      } as Movement,
    });
    appendImported({
      movement: {
        id: idEntrada, account_id: t.contaDestino, type: "entrada", status: "pago",
        amount: t.valor, due_date: t.dataChegada || t.data, paid_date: t.dataChegada || t.data,
        reconciled: false, category: CATEGORIA_TRANSFERENCIA,
        description: t.descricao || "Transferência recebida",
      } as Movement,
    });
  } else {
    // ⚠️ Lança quando o banco recusa — e aí o fato NÃO é guardado.
    const { createTransferencia } = await import("@/lib/cadastros");
    grupoId = await createTransferencia({
      from_account_id: t.contaOrigem, to_account_id: t.contaDestino,
      date: t.data, arrival_date: t.dataChegada, amount: t.valor,
      description: t.descricao || "Transferência entre contas",
    });
  }
  const registro: Transferencia = { ...t, grupoId };
  const lista = [registro, ...listarTransferencias().filter((x) => x.id !== t.id)];
  gravar(K_TRANSF, lista);
  return lista;
}

/**
 * Apagar o fato apaga os DOIS lados — deixar um para trás desequilibraria o
 * saldo entre as contas para sempre.
 *
 * ⚠️ Em produção os lançamentos saem pela exclusão LÓGICA (a única porta: o
 * `DELETE` foi revogado), achados pelo `group_id`. Se algum lado for recusado,
 * o registro FICA e o erro sobe: tirar o fato da lista com um lançamento ainda
 * vivo esconderia justamente o que ficou torto.
 */
export async function removerTransferencia(id: string): Promise<Transferencia[]> {
  const alvo = listarTransferencias().find((t) => t.id === id);
  if (isDemo) {
    removerImported(idsDaTransferencia(id));
  } else if (alvo?.grupoId) {
    const { createClient } = await import("@/lib/supabase/client");
    const { excluirLogico } = await import("@/lib/exclusao");
    const { semAmostra } = await import("@/lib/supabase/consulta");
    const { data, error } = await semAmostra(createClient()
      .from("movements").select("id").eq("group_id", alvo.grupoId).is("excluido_em", null)).limit(10);
    if (error) throw new Error(error.message);
    for (const m of (data ?? []) as { id: string }[]) {
      await excluirLogico("movements", m.id, "transferência entre contas excluída");
    }
  }
  const out = listarTransferencias().filter((t) => t.id !== id);
  gravar(K_TRANSF, out);
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
