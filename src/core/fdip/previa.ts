/**
 * As linhas da PRÉVIA da importação, montadas a partir do que o FDIP leu.
 *
 * ⚠️ Uma função só para a tela (`UploadView`) e para a guarda (`engine-audit`):
 * a guarda que montava a prévia "como a tela monta" numa cópia própria não
 * passava a memória nem as regras, e por isso não via a prévia divergindo da
 * gravação. Medindo pela mesma função, ela mede a tela.
 *
 * Puro, sem I/O.
 */
import type { LinhaBruta } from "@/core/ingestao";
import type { FDIPReport } from "./types";

export function linhasParaPrevia(report: FDIPReport, contaId = "acc-import"): LinhaBruta[] {
  const cls = new Map(report.classificacoes.map((c) => [c.recordId, c]));
  return report.records.map((r) => {
    const c = cls.get(r.id);
    return {
      idOrigem: r.id,
      contaId,
      data: r.data,
      valor: r.valor,
      tipo: r.tipo === "entrada" ? "entrada" : "saida",
      descritivo: r.descricao || r.contraparte || "",
      contraparte: r.contraparte || null,
      origem: "extrato",
      // O que o dono já decidiu (memória ou regra) — a gravação vai usar; a
      // prévia tem de mostrar o mesmo.
      categoriaConfirmada: c?.aprendido && c.categoria ? c.categoria : null,
    };
  });
}
