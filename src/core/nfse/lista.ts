/**
 * A LISTA DAS NOTAS FISCAIS — uma fonte só (04/11/2026).
 *
 * ⚠️ A tela "Notas fiscais" listava o STATUS DA NOTA gravado no documento da
 * venda (`sales_docs`), não as notas. A primeira NFS-e real (nº 62, avulsa,
 * 04/11/2026) foi autorizada e cancelada sem nunca aparecer lá: a nota avulsa
 * e a de assinatura não têm venda, e a tela mostrava "0 emitidas" com uma nota
 * autorizada na prefeitura. Duas fontes para um fato. Agora a lista e o resumo
 * saem da tabela das notas (`nfse`), a mesma do emissor; a venda é só a
 * referência da linha, quando existe.
 *
 * Puro, sem rede.
 */

export type StatusNota = "rascunho" | "processando" | "autorizada" | "rejeitada" | "enviada" | "cancelada";

export interface NotaDaLista {
  id: string;
  numero?: string;
  tomadorNome: string;
  valorServico: number;
  competencia: string;
  criadoEm: string;
  status: StatusNota;
  ambiente?: "homologacao" | "producao";
  urlPdf?: string;
  urlXml?: string;
}

export interface LinhaNota extends NotaDaLista {
  /** Número da venda de origem; vazio para a nota avulsa ou de assinatura. */
  venda: string;
  rotuloStatus: string;
}

export interface CardNota { id: string; label: string; valor: number; quantidade: number; percentual: number }

export const ROTULO_STATUS_NOTA: Record<StatusNota, string> = {
  rascunho: "Rascunho",
  processando: "Processando",
  autorizada: "Emitida",
  enviada: "Emitida",
  rejeitada: "Negada",
  cancelada: "Cancelada",
};

/** Emitida é a autorizada pela prefeitura, enviada ou não ao cliente. */
export const notaEmitida = (s: StatusNota) => s === "autorizada" || s === "enviada";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** As notas da tabela → as linhas da tela, mais novas primeiro; o rascunho não é nota ainda. */
export function linhasDasNotas(notas: NotaDaLista[], vendaDaNota: ReadonlyMap<string, string>): LinhaNota[] {
  return notas
    .filter((n) => n.status !== "rascunho")
    .map((n) => ({ ...n, venda: vendaDaNota.get(n.id) ?? "", rotuloStatus: ROTULO_STATUS_NOTA[n.status] }))
    .sort((a, b) => (b.criadoEm < a.criadoEm ? -1 : b.criadoEm > a.criadoEm ? 1 : 0));
}

/** O resumo (emitidas · processando · canceladas · negadas · total), das MESMAS linhas da lista. */
export function painelDasNotas(linhas: LinhaNota[]): CardNota[] {
  const grupos: { id: string; label: string; casa: (s: StatusNota) => boolean }[] = [
    { id: "emitida", label: "NF emitidas", casa: notaEmitida },
    { id: "processando", label: "NF processando", casa: (s) => s === "processando" },
    { id: "cancelada", label: "NF canceladas", casa: (s) => s === "cancelada" },
    { id: "negada", label: "NF negadas", casa: (s) => s === "rejeitada" },
  ];
  const total = round2(linhas.reduce((s, l) => s + l.valorServico, 0));
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0);
  const cards = grupos.map((g) => {
    const l = linhas.filter((x) => g.casa(x.status));
    const valor = round2(l.reduce((s, x) => s + x.valorServico, 0));
    return { id: g.id, label: g.label, valor, quantidade: l.length, percentual: pct(valor) };
  });
  return [...cards, { id: "total", label: "Total de NFs", valor: total, quantidade: linhas.length, percentual: total > 0 ? 100 : 0 }];
}
