/**
 * Conclusão da venda do Simulador POS → os títulos da venda, pelo ESCRITOR
 * ÚNICO (`criarTitulos`), em demonstração e em produção.
 *
 * ⚠️ **EM PRODUÇÃO ESTA VENDA NUNCA FOI GRAVADA.** O insert mandava
 * `status: "pendente"`, e `movements.status` é coluna GERADA de `situacao`
 * desde 25/08 — o Postgres recusa (`cannot insert a non-DEFAULT value into
 * column "status"`, medido num banco com as migrations aplicadas). A tela
 * engolia a exceção e mostrava "Aprovado" do mesmo jeito: a maquininha
 * "vendia" e o contas a receber não recebia nada. Agora o título sai por
 * `criarTitulos`, que grava `situacao`, `origem` e `especie`, e a recusa do
 * banco sobe para a tela.
 *
 * ⚠️ E não se cria mais uma "Conta consolidada" às escondidas quando a empresa
 * não tem conta: uma conta bancária inventada por um botão de venda aparece no
 * saldo e no seletor sem ninguém a ter cadastrado. Sem conta, a venda é
 * recusada com o motivo.
 *
 * A composição dos títulos (bruto a receber + taxa a pagar no repasse) mora em
 * `core/vendas/pos` — ver o motivo lá.
 */
import { isDemo } from "@/lib/demo";
import { proximoNumeroVenda, salvarVendaComTitulos } from "@/lib/vendas";
import { vendaDaMaquininha } from "@/core/vendas/documento";
import { isoDay } from "@/lib/aggregations";
import { titulosDaVendaPos, type VendaPos } from "@/core/vendas/pos";

export type { VendaPos };

async function contaPadrao(): Promise<string> {
  if (isDemo) return ""; // o dataset resolve para a conta real da demonstração
  const { createClient } = await import("@/lib/supabase/client");
  const { primeiraContaAtiva } = await import("@/lib/conta-padrao");
  // Só conta ATIVA (o banco recusa lançamento em conta inativa — CAD).
  const id = await primeiraContaAtiva(createClient());
  if (!id) throw new Error("Cadastre uma conta bancária antes de vender na maquininha — é nela que o repasse cai.");
  return id;
}

/** Grava a venda. LANÇA quando o banco recusa — quem chama mostra o motivo. */
export async function concluirVendaPos(v: VendaPos): Promise<number> {
  const titulos = titulosDaVendaPos(v, isoDay(new Date()));
  if (titulos.length === 0) return 0;
  const conta = await contaPadrao();
  // ⚠️ A venda da maquininha é uma VENDA: nasce o documento (lista de vendas,
  // nota a emitir, base do imposto) e os títulos levam a chave dele. Antes só
  // os títulos existiam (Rodada 4).
  const hoje = isoDay(new Date());
  const venda = vendaDaMaquininha(v, crypto.randomUUID(), await proximoNumeroVenda(), conta, hoje);
  await salvarVendaComTitulos(venda, titulos.map((t) => ({ ...t, account_id: conta })));
  return titulos.length;
}
