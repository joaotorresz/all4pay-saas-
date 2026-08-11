"use client";

/**
 * A EXECUÇÃO DA CORREÇÃO EM MASSA.
 *
 * ⚠️ **Só os achados MECÂNICOS têm execução aqui.** Corrigir em lote o que
 * exige julgamento — "este fornecedor é mesmo cliente?" — é oferecer o erro em
 * lote, com a autoridade de um botão. Os que ficam de fora não perdem nada: a
 * tela continua listando cada item com a sugestão, e a correção é feita uma a
 * uma por quem sabe.
 *
 * ⚠️ **Toda correção devolve o DESFAZER**, como manda a regra de
 * `AcaoDestrutiva` desde a ONDA 7. As duas metades resolvem coisas diferentes:
 * a confirmação impede o acidente, e o desfazer protege quem clicou por
 * reflexo — que é exatamente quem erra. Reclassificar 190 títulos sem volta é a
 * operação mais cara desta tela.
 *
 * ⚠️ **E ela relata o que NÃO conseguiu.** Um "pronto" mudo depois de 190
 * tentativas esconde as 12 que o banco recusou, e o contador da tela não cairia
 * até o número prometido — ensinando que a correção não funciona. O relatório
 * diz quantos entraram, quantos ficaram e por quê.
 */
import { traduzirCategoria } from "@/core/dominio";
import { contraparteSuspeita } from "@/core/dominio/contraparte";
import type { Achado, CodigoAchado } from "@/core/qualidade";
import { updateImportedMovement, importedMovements } from "@/lib/imported";
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { TETO_LINHAS } from "@/lib/supabase/consulta";

export interface ResultadoCorrecao {
  /** Quantos registros foram efetivamente corrigidos. */
  corrigidos: number;
  /** Quantos ficaram, e a razão de cada grupo. */
  recusados: { motivo: string; quantos: number }[];
  /** Devolve o estado anterior. Vazio quando não há o que desfazer. */
  desfazer: () => Promise<void>;
}

const nada = (): ResultadoCorrecao => ({
  corrigidos: 0, recusados: [], desfazer: async () => {},
});

/* ========================================================================== */
/* As correções mecânicas                                                      */
/* ========================================================================== */

/**
 * Marca os lançamentos como **lançamento de extrato**.
 *
 * ⚠️ É a correção de maior alcance da tela, e a mais segura: ela não muda
 * valor, data nem contraparte — só declara o que o registro sempre foi. Um
 * título que veio de extrato deixa de aparecer na lista de cobrança sem que
 * nenhum número do caixa mude, porque o dinheiro já tinha se movido.
 */
async function marcarComoExtrato(ids: string[]): Promise<ResultadoCorrecao> {
  if (ids.length === 0) return nada();

  if (isDemo) {
    const antes = new Map<string, { origem?: string | null; especie?: string | null }>();
    for (const m of importedMovements() ?? []) {
      if (!ids.includes(m.id)) continue;
      const linha = m as unknown as { origem?: string | null; especie?: string | null };
      antes.set(m.id, { origem: linha.origem ?? null, especie: linha.especie ?? null });
    }
    for (const id of ids) {
      updateImportedMovement(id, { origem: "extrato", especie: "extrato" } as never);
    }
    return {
      corrigidos: ids.length,
      recusados: [],
      desfazer: async () => {
        for (const [id, v] of Array.from(antes)) updateImportedMovement(id, v as never);
      },
    };
  }

  const s = createClient();
  // ⚠️ O estado anterior é lido ANTES de escrever. Sem isso o desfazer seria
  // uma promessa sem lastro — e é justamente numa correção de 190 linhas que
  // alguém vai precisar dele.
  const { data: antes } = await s
    .from("movements").select("id,origem,especie").in("id", ids).limit(TETO_LINHAS);

  const { data: feitas, error } = await s
    .from("movements")
    .update({ origem: "extrato", especie: "extrato" })
    .in("id", ids)
    .select("id")
    .limit(TETO_LINHAS);

  if (error) {
    return { corrigidos: 0, recusados: [{ motivo: error.message, quantos: ids.length }], desfazer: async () => {} };
  }
  const corrigidos = (feitas ?? []).length;
  return {
    corrigidos,
    recusados: corrigidos < ids.length
      ? [{ motivo: "o banco recusou (mês fechado ou permissão)", quantos: ids.length - corrigidos }]
      : [],
    desfazer: async () => {
      for (const linha of (antes ?? []) as { id: string; origem: string | null; especie: string | null }[]) {
        await s.from("movements").update({ origem: linha.origem, especie: linha.especie }).eq("id", linha.id);
      }
    },
  };
}

/**
 * Traduz as categorias que têm tradução CONHECIDA.
 *
 * ⚠️ As sem tradução ficam, e são RELATADAS. Um palpite de tradução numa
 * categoria contábil move dinheiro de linha no DRE — e o palpite errado seria
 * aplicado a todos os lançamentos daquela categoria de uma vez.
 */
async function traduzirCategorias(achado: Achado): Promise<ResultadoCorrecao> {
  const traduziveis = achado.itens
    .map((i) => ({ item: i, para: traduzirCategoria(i.rotulo) }))
    .filter((x): x is { item: typeof x.item; para: string } => !!x.para);

  const semTraducao = achado.itens.length - traduziveis.length;
  const recusados = semTraducao > 0
    ? [{ motivo: "sem tradução conhecida — renomeie à mão para não mover a linha errada do DRE", quantos: semTraducao }]
    : [];
  if (traduziveis.length === 0) return { corrigidos: 0, recusados, desfazer: async () => {} };

  // A categoria vive no PRÓPRIO lançamento (campo texto), então a tradução é
  // uma troca de valor nos movimentos que a usam.
  const de = traduziveis.map((t) => t.item.rotulo);
  const paraDe = new Map(traduziveis.map((t) => [t.item.rotulo, t.para]));

  if (isDemo) {
    const alvos = (importedMovements() ?? []).filter((m) => m.category && paraDe.has(m.category));
    const antes = alvos.map((m) => ({ id: m.id, category: m.category }));
    for (const m of alvos) updateImportedMovement(m.id, { category: paraDe.get(m.category!)! });
    return {
      corrigidos: alvos.length, recusados,
      desfazer: async () => { for (const a of antes) updateImportedMovement(a.id, { category: a.category }); },
    };
  }

  const s = createClient();
  let corrigidos = 0;
  for (const original of de) {
    const { data: feitas } = await s
      .from("movements").update({ category: paraDe.get(original)! })
      .eq("category", original).select("id").limit(TETO_LINHAS);
    corrigidos += (feitas ?? []).length;
  }
  return {
    corrigidos, recusados,
    desfazer: async () => {
      for (const original of de) {
        await s.from("movements").update({ category: original }).eq("category", paraDe.get(original)!);
      }
    },
  };
}

/**
 * Reclassifica a categoria dos lançamentos cuja contraparte é, na verdade,
 * tarifa / imposto / transferência / estorno.
 *
 * ⚠️ Ela NÃO apaga o cadastro da contraparte. Apagar levaria junto o vínculo
 * de todo lançamento histórico que aponta para ele, e um extrato antigo que
 * perde a contraparte é pior que um cadastro feio — a origem do dado some.
 */
async function reclassificarSuspeitas(achado: Achado): Promise<ResultadoCorrecao> {
  const destino = new Map<string, string>();
  for (const i of achado.itens) {
    const s = contraparteSuspeita(i.rotulo);
    if (s) destino.set(i.id, s.categoriaSugerida);
  }
  if (destino.size === 0) return nada();

  if (isDemo) {
    const alvos = (importedMovements() ?? []).filter((m) => m.party_id && destino.has(m.party_id));
    const antes = alvos.map((m) => ({ id: m.id, category: m.category }));
    for (const m of alvos) updateImportedMovement(m.id, { category: destino.get(m.party_id!)! });
    return {
      corrigidos: alvos.length, recusados: [],
      desfazer: async () => { for (const a of antes) updateImportedMovement(a.id, { category: a.category }); },
    };
  }

  const s = createClient();
  let corrigidos = 0;
  const reverter: { id: string; category: string | null }[] = [];
  for (const [partyId, categoria] of Array.from(destino)) {
    const { data: antes } = await s
      .from("movements").select("id,category").eq("party_id", partyId).limit(TETO_LINHAS);
    reverter.push(...((antes ?? []) as { id: string; category: string | null }[]));
    const { data: feitas } = await s
      .from("movements").update({ category: categoria }).eq("party_id", partyId)
      .select("id").limit(TETO_LINHAS);
    corrigidos += (feitas ?? []).length;
  }
  return {
    corrigidos, recusados: [],
    desfazer: async () => {
      for (const r of reverter) await s.from("movements").update({ category: r.category }).eq("id", r.id);
    },
  };
}

/* ========================================================================== */
/* O despachante                                                               */
/* ========================================================================== */

/**
 * ⚠️ A lista é EXPLÍCITA, e o que não está nela não ganha botão. Um `default`
 * que tentasse "algo razoável" para um achado novo aplicaria uma correção que
 * ninguém desenhou, em lote, sobre dado de produção.
 */
const EXECUTAVEIS: Partial<Record<CodigoAchado, (a: Achado) => Promise<ResultadoCorrecao>>> = {
  titulo_sem_origem: (a) => marcarComoExtrato(a.itens.map((i) => i.id)),
  titulo_com_cnpj_proprio: (a) => marcarComoExtrato(a.itens.map((i) => i.id)),
  categoria_em_ingles: traduzirCategorias,
  contraparte_suspeita: reclassificarSuspeitas,
};

export const temExecucao = (c: CodigoAchado): boolean => c in EXECUTAVEIS;

export async function corrigirEmMassa(a: Achado): Promise<ResultadoCorrecao> {
  const fn = EXECUTAVEIS[a.codigo];
  if (!fn) return nada();
  return fn(a);
}

/** A frase do resultado, para quem acabou de clicar. */
export function fraseDoResultado(r: ResultadoCorrecao): string {
  if (r.corrigidos === 0 && r.recusados.length === 0) return "Nada a corrigir.";
  const partes = [
    r.corrigidos === 1 ? "1 registro corrigido" : `${r.corrigidos} registros corrigidos`,
  ];
  for (const x of r.recusados) partes.push(`${x.quantos} ficaram: ${x.motivo}`);
  return partes.join(" · ");
}
