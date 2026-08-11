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

export { clearImported } from "@/lib/imported";

export interface ResultadoOnboarding {
  clientes: number;
  fornecedores: number;
  categorias: number;
  centrosCusto: number;
  movimentos: number;
  simulado: boolean;
}

const RECEITA = /venda|servic|juros|receita/i;
const ACC_ID = "acc-import";

/** Converte o relatório FDIP em um dataset (movimentos + contas + entidades). */
export function montarDataset(report: FDIPReport): { movements: Movement[]; accounts: FinancialAccount[]; parties: Party[] } {
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

  const saldo = movements
    .filter((m) => m.status === "pago")
    .reduce((s, m) => s + (m.type === "entrada" ? m.amount : -m.amount), 0);
  const accounts: FinancialAccount[] = [
    { id: ACC_ID, name: "Conta consolidada (importada)", bank: "inter", balance: Math.round(saldo * 100) / 100 },
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

  return { movements, accounts, parties };
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
    const { data: criadas, error } = await supabase.from("parties").insert(parties).select("id,name").limit(TETO_LINHAS);
    if (!error) {
      out.clientes = clientes;
      out.fornecedores = fornecedores;
      for (const row of (criadas ?? []) as { id: string; name: string }[]) nomeParaId.set(row.name, row.id);
    }
  }

  // 2) Categorias + centros de custo
  if (categorias.length) {
    const { error } = await supabase.from("categories").insert(categorias.map((name) => ({ kind: RECEITA.test(name) ? "receita" : "despesa", name })));
    if (!error) out.categorias = categorias.length;
  }
  if (centros.length) {
    const { error } = await supabase.from("cost_centers").insert(centros.map((name) => ({ name })));
    if (!error) out.centrosCusto = centros.length;
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
    // Insere em lotes para extratos grandes.
    //
    // ⚠️ `upsert` com `ignoreDuplicates` sobre o índice único (org_id, chave):
    // a linha que já existe é IGNORADA em vez de derrubar o lote inteiro. Um
    // `insert` puro devolveria erro de violação de unicidade e as 499 linhas
    // boas do lote se perderiam junto com a repetida.
    for (let i = 0; i < rows.length; i += 500) {
      const lote = rows.slice(i, i + 500);
      const { data: inseridas, error } = await supabase
        .from("movements")
        .upsert(lote, { onConflict: "org_id,chave", ignoreDuplicates: true })
        .select("id").limit(TETO_LINHAS);
      if (!error) out.movimentos += (inseridas as unknown[] | null)?.length ?? 0;
    }
  }

  return out;
}
