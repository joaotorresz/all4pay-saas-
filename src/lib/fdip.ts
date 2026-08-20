/**
 * Auto company setup — aplica a importação (FDIP) ao SISTEMA INTEIRO.
 * Converte os lançamentos lidos em movimentos e:
 *  • demo: grava no store importado (passa a alimentar dashboard/DRE/risco…);
 *  • live: cria clientes/fornecedores, categorias, centros de custo E os
 *    movimentos no Supabase (org_id pelo DEFAULT/RLS).
 * Em ambos os casos a informação passa a se correlacionar em todas as páginas.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { isoDay } from "@/lib/aggregations";
import { chaveIdempotencia, planejarLimpeza, type LinhaExistente } from "@/core/ingestao";
import { setImported, clearImported } from "@/lib/imported";
import type { Movement, FinancialAccount, Party } from "@/lib/types";
import type { FDIPReport } from "@/core/fdip/types";
import { TETO_LINHAS } from "@/lib/supabase/consulta";
import { aberturaDoExtrato, type AberturaVerificada } from "@/core/indicadores/abertura";

export { clearImported } from "@/lib/imported";

export interface ResultadoOnboarding {
  clientes: number;
  fornecedores: number;
  categorias: number;
  centrosCusto: number;
  movimentos: number;
  simulado: boolean;
  /**
   * ⚠️ **A METADE QUE FALTAVA, e ela custou a importação inteira.** O laço de
   * gravação fazia `if (!error) out.movimentos += …` — quando o banco recusava,
   * o contador simplesmente não subia e NINGUÉM ficava sabendo. A tela anunciava
   * "411 lançamentos serão aplicados", criava os 38 contatos, e o DRE abria
   * vazio. Medido em produção: 38 contatos, 23 categorias, 1 conta, **zero
   * lançamentos**.
   *
   * Um importador que engole a recusa é indistinguível de um que funciona — até
   * alguém abrir o relatório. Agora a falha volta com a mensagem do banco e a
   * tela tem o que dizer.
   */
  falha?: { mensagem: string; naoGravados: number };
}

const RECEITA = /venda|servic|juros|receita/i;
const ACC_ID = "acc-import";

/** Converte o relatório FDIP em um dataset (movimentos + contas + entidades). */
export function montarDataset(report: FDIPReport): {
  movements: Movement[];
  accounts: FinancialAccount[];
  parties: Party[];
  abertura: AberturaVerificada | null;
} {
  const hoje = isoDay(new Date());
  const cls = new Map(report.classificacoes.map((c) => [c.recordId, c]));

  const movements: Movement[] = report.records
    .filter((r) => cls.get(r.id)?.destino !== "Transferência")
    .map((r) => {
      const pago = r.data <= hoje;
      const tipo: Movement["type"] = r.tipo === "entrada" ? "entrada" : "saida";
      // ⚠️ O descritivo BRUTO vai para campo próprio e a CHAVE de idempotência
      // é calculada a partir dele. Sem a chave, reimportar o mesmo extrato
      // duplicava a base inteira — cada linha entrava de novo com id novo.
      const descritivoBruto = r.descricao || r.contraparte || "";
      return {
        id: r.id,
        account_id: ACC_ID,
        type: tipo,
        status: pago ? "pago" : "pendente",
        category: cls.get(r.id)?.categoria ?? r.descricao,
        amount: r.valor,
        party_id: r.contraparteNorm,
        due_date: r.data,
        paid_date: pago ? r.data : null,
        reconciled: pago,
        description: r.contraparte,
        descritivo_bruto: descritivoBruto,
        origem: "extrato",
        chave: chaveIdempotencia({
          contaId: ACC_ID, data: r.data, valor: r.valor, tipo, descritivo: descritivoBruto,
        }),
      } as Movement;
    });

  // O movimento líquido já liquidado (entradas − saídas) — o que a conta ANDOU.
  const netLiquidado = movements
    .filter((m) => m.status === "pago")
    .reduce((s, m) => s + (m.type === "entrada" ? m.amount : -m.amount), 0);

  // ⚠️ **Se o banco DECLAROU o saldo (`<LEDGERBAL>`), ele manda.** O saldo da
  // conta passa a ser o do banco — número independente —, e a ABERTURA é
  // reconstruída dele: fechamento − movimento líquido. Sem declaração, o saldo
  // continua derivado dos lançamentos (abertura implícita zero) e a conta fica
  // NÃO CONFERIDA na tela — que é a verdade, não um zero fingido.
  const declarado = report.saldoDeclarado;
  const saldoConta = declarado ? declarado.valor : Math.round(netLiquidado * 100) / 100;
  const abertura: AberturaVerificada | null = declarado
    ? { ...aberturaDoExtrato(declarado.valor, netLiquidado, declarado.data), origem: "extrato_bancario" }
    : null;

  const accounts: FinancialAccount[] = [
    { id: ACC_ID, name: "Conta consolidada (importada)", bank: "inter", balance: Math.round(saldoConta * 100) / 100 },
  ];

  // ⚠️ Só quem é PESSOA vira cadastro. Um CPF solto, uma descrição de cobrança
  // ("ANUIDADE DIFERENCIADA") e um termo genérico entravam como cliente, e todo
  // relatório por cliente nascia contaminado a partir daí. Os movimentos deles
  // continuam existindo — o que não existe é o cadastro falso.
  const parties: Party[] = report.entidades
    .filter((e) => e.ehPessoa !== false)
    .map((e) => ({
      id: e.id,
      type: e.documento && e.documento.length === 11 ? "pf" : "pj",
      name: e.nome,
      doc: e.documento ?? undefined,
      is_customer: e.tipo === "cliente",
      is_supplier: e.tipo === "fornecedor",
    })) as Party[];

  return { movements, accounts, parties, abertura };
}

export async function aplicarOnboarding(report: FDIPReport): Promise<ResultadoOnboarding> {
  const dataset = montarDataset(report);
  const clientes = dataset.parties.filter((p) => p.is_customer).length;
  const fornecedores = dataset.parties.filter((p) => p.is_supplier).length;
  const categorias = report.plano.categorias;
  const centros = report.plano.centrosCusto;

  if (isDemo) {
    setImported({ ...dataset, criadoEm: new Date().toISOString() });
    await new Promise((r) => setTimeout(r, 500));
    return { clientes, fornecedores, categorias: categorias.length, centrosCusto: centros.length, movimentos: dataset.movements.length, simulado: true };
  }

  const supabase = createClient();
  const out: ResultadoOnboarding = { clientes: 0, fornecedores: 0, categorias: 0, centrosCusto: 0, movimentos: 0, simulado: false };

  // 1) Clientes/fornecedores — captura os IDs gerados para LIGAR aos movimentos.
  // dataset.parties[].id === contraparteNorm (entidade.id); o movimento traz
  // party_id = contraparteNorm. Mapeamos contraparteNorm → nome → UUID criado.
  const normParaNome = new Map<string, string>(dataset.parties.map((p) => [p.id, p.name]));
  const nomeParaId = new Map<string, string>();
  const parties = dataset.parties.map((p) => ({ type: "pj", name: p.name, is_customer: p.is_customer, is_supplier: p.is_supplier }));
  if (parties.length) {
    /**
     * ⚠️ **REIMPORTAR O MESMO EXTRATO TRIPLICAVA A LISTA DE CONTATOS.** Medido:
     * três importações do mesmo arquivo levaram `parties` de 38 para 114, com
     * os lançamentos parados em 408 — ou seja, a idempotência existia para o
     * dinheiro e não para o cadastro. E é o cadastro que a pessoa abre para
     * cobrar: uma lista com o mesmo cliente três vezes destrói a confiança na
     * tela mais rápido que um número errado, porque o erro é auto-evidente.
     *
     * Mesma técnica da gravação de lançamentos: consultar quem JÁ existe e
     * inserir só o resto. O nome é comparado sem diferenciar maiúsculas — o
     * normalizador do extrato às vezes devolve "ATLAS CLOUD LTDA" e às vezes
     * "Atlas Cloud Ltda" para a mesma contraparte.
     */
    const { data: existentes } = await supabase
      .from("parties").select("id,name").limit(TETO_LINHAS);
    const porNome = new Map<string, string>();
    for (const r of (existentes as { id: string; name: string }[] | null) ?? []) {
      porNome.set(r.name.trim().toLowerCase(), r.id);
      nomeParaId.set(r.name, r.id);
    }
    const novos = parties.filter((p) => !porNome.has(p.name.trim().toLowerCase()));
    if (novos.length) {
      const { data: criadas, error } = await supabase.from("parties").insert(novos).select("id,name").limit(TETO_LINHAS);
      if (!error) for (const row of (criadas ?? []) as { id: string; name: string }[]) nomeParaId.set(row.name, row.id);
    }
    // ⚠️ O contador reporta o que a IMPORTAÇÃO trouxe, não quantas linhas foram
    // inseridas agora: na segunda importação nada é criado e "0 clientes"
    // faria a tela parecer que o arquivo veio vazio.
    out.clientes = clientes;
    out.fornecedores = fornecedores;
  }

  // 2) Categorias + centros de custo
  /**
   * ⚠️ **Mesma doença das outras duas tabelas, e ela veio da mesma medição.**
   * Reimportar o mesmo extrato levou `categories` de 23 para 67 — o plano de
   * contas nasce com "Folha", "Folha" e "Folha", e o drill-down do DRE por
   * categoria passa a listar a mesma linha três vezes. As três gravações do
   * import (lançamento, contato, categoria) apostavam em não repetir; só a dos
   * lançamentos tinha chave, e nem essa funcionava.
   *
   * A regra que fica: **toda gravação de importação consulta o que já existe
   * antes de inserir.** Importar é um ato que a pessoa repete — por engano, por
   * teimosia, ou porque o arquivo do mês seguinte contém o mês anterior.
   */
  const jaTem = async (tabela: string) => {
    const { data } = await supabase.from(tabela).select("name").limit(TETO_LINHAS);
    return new Set(((data as { name: string }[] | null) ?? []).map((r) => r.name.trim().toLowerCase()));
  };
  if (categorias.length) {
    const existentes = await jaTem("categories");
    const novas = categorias.filter((n) => !existentes.has(n.trim().toLowerCase()));
    if (novas.length) {
      await supabase.from("categories").insert(novas.map((name) => ({ kind: RECEITA.test(name) ? "receita" : "despesa", name })));
    }
    out.categorias = categorias.length;
  }
  if (centros.length) {
    const existentes = await jaTem("cost_centers");
    const novos = centros.filter((n) => !existentes.has(n.trim().toLowerCase()));
    if (novos.length) await supabase.from("cost_centers").insert(novos.map((name) => ({ name })));
    out.centrosCusto = centros.length;
  }

  // 3) Movimentos (precisa de uma conta) — é o que correlaciona com dashboard/DRE
  let accId: string | undefined;
  const { data: accs } = await supabase.from("financial_accounts").select("id").limit(1);
  accId = (accs as { id: string }[] | null)?.[0]?.id;
  if (!accId) {
    const { data: created } = await supabase
      .from("financial_accounts")
      .insert({ name: "Conta consolidada", bank: "inter", balance: 0 })
      .select("id")
      .single();
    accId = (created as { id: string } | null)?.id;
  }
  if (accId) {
    const rows = dataset.movements.map((m) => {
      // m.party_id é o contraparteNorm; resolve para o UUID do cliente criado,
      // ligando o movimento ao cadastro (alimenta segmentação/cobrança/DRE).
      const nome = m.party_id ? normParaNome.get(m.party_id) : undefined;
      const partyId = nome ? nomeParaId.get(nome) : undefined;
      return {
        account_id: accId,
        type: m.type,
        status: m.status,
        category: m.category,
        amount: m.amount,
        due_date: m.due_date,
        paid_date: m.paid_date,
        reconciled: false,
        description: m.description,
        party_id: partyId ?? null,
        review_status: "pendente", // import: novo lançamento entra na fila de confirmação
        // ⚠️ A chave é RECALCULADA com a conta REAL do banco. A do
        // `montarDataset` usa a conta sintética do dataset local; gravar aquela
        // faria a mesma linha ter chaves diferentes em demo e em live, e a
        // idempotência valeria só num dos dois.
        chave: chaveIdempotencia({
          contaId: accId, data: m.paid_date || m.due_date, valor: m.amount,
          tipo: m.type, descritivo: m.descritivo_bruto ?? m.description,
        }),
        descritivo_bruto: m.descritivo_bruto ?? m.description,
        origem: "extrato",
        // ⚠️ ONDA 5 — A LINHA QUE FAZ A SEPARAÇÃO EXISTIR. Estas linhas vêm de
        // um EXTRATO: dinheiro que já passou pela conta. Marcá-las como
        // `especie: "extrato"` é o que impede cada uma de aparecer como título
        // a receber ou a pagar — é daqui que saíram "DISNEY PLUS" e "APPLE COM
        // BILL" na lista de cobrança.
        //
        // E é obrigatório em outro sentido: o gatilho `movements_origem`
        // RECUSA `origem = 'extrato'` sem esta marca, justamente para que a
        // importação não possa continuar produzindo títulos por omissão.
        especie: "extrato",
      };
    });
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * ⚠️ **A GRAVAÇÃO NÃO USA `on_conflict` — e a razão é medida.**
     * ═══════════════════════════════════════════════════════════════════════
     *
     * A versão anterior fazia `upsert(lote, { onConflict: "org_id,chave" })`,
     * apostando no índice único para ignorar a linha repetida. O índice existe,
     * mas é **PARCIAL**:
     *
     *   create unique index movements_org_chave_unique
     *     on movements (org_id, chave) where (chave is not null)
     *
     * e o PostgREST não tem como mirar um índice parcial — a cláusula `ON
     * CONFLICT` precisaria repetir o mesmo predicado `WHERE`, e não há como
     * expressá-lo pela API. O banco responde, sempre:
     *
     *   42P10 — there is no unique or exclusion constraint matching the
     *           ON CONFLICT specification
     *
     * Reproduzido contra produção com sessão real. Com o erro engolido pelo
     * `if (!error)`, TODA importação gravava zero lançamentos em silêncio.
     *
     * ⚠️ **A idempotência não foi abandonada — ela mudou de lugar.** Antes de
     * gravar, as chaves que JÁ existem na organização são consultadas e as
     * linhas correspondentes saem do lote. O índice parcial continua no banco
     * como a última trava; o que deixou de existir é a dependência de um
     * recurso que a API não alcança.
     */
    const chaves = rows.map((r) => r.chave).filter(Boolean) as string[];
    const jaExistem = new Set<string>();
    for (let i = 0; i < chaves.length; i += 200) {
      const { data } = await supabase
        .from("movements")
        .select("chave")
        .in("chave", chaves.slice(i, i + 200))
        .limit(TETO_LINHAS);
      for (const r of (data as { chave: string | null }[] | null) ?? []) if (r.chave) jaExistem.add(r.chave);
    }
    // ⚠️ E dentro do PRÓPRIO lote também: um extrato pode repetir a mesma linha
    // (mesmo dia, mesmo valor, mesmo histórico), e aí as duas colidiriam entre
    // si — o `in` acima só enxerga o que já está gravado.
    const vistas = new Set<string>();
    const novas = rows.filter((r) => {
      const k = r.chave as string;
      if (!k || jaExistem.has(k) || vistas.has(k)) return false;
      vistas.add(k); return true;
    });

    let ultimaFalha = "";
    let naoGravados = 0;
    for (let i = 0; i < novas.length; i += 500) {
      const lote = novas.slice(i, i + 500);
      const { data: inseridas, error } = await supabase
        .from("movements").insert(lote).select("id").limit(TETO_LINHAS);
      if (!error) { out.movimentos += (inseridas as unknown[] | null)?.length ?? 0; continue; }
      /**
       * ⚠️ **UMA LINHA RUIM NÃO PODE LEVAR AS OUTRAS 499.** Era esse o motivo
       * original de usar `upsert`, e ele continua válido — a saída é reprocessar
       * o lote linha a linha em vez de desistir dele. Custa uma rodada a mais
       * só no lote que falhou, e é a diferença entre importar 410 de 411 e
       * importar zero.
       */
      for (const linha of lote) {
        const { error: e1 } = await supabase.from("movements").insert(linha);
        if (e1) { naoGravados++; ultimaFalha = e1.message; } else out.movimentos++;
      }
    }
    if (naoGravados > 0) out.falha = { mensagem: ultimaFalha, naoGravados };
  }

  return out;
}
