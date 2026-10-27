/**
 * Grava as RECORRÊNCIAS que a pessoa marcou no assistente da importação.
 *
 * Os lançamentos e os cadastros vão por `aplicarOnboarding` (o escritor único
 * da importação); aqui só nascem as regras que repetem, depois que ele gravou.
 *
 *  • Receita recorrente → contrato em Assinaturas, como RASCUNHO pelo escritor
 *    de sempre (`criarRecorrencia`). Ativar é o ato que projeta faturas no
 *    fluxo de caixa, e esse ato fica com a pessoa, na tela de Assinaturas.
 *  • Despesa recorrente → conta recorrente (`criarRecorrenciaSaida`), o mesmo
 *    caminho do "repete o pagamento" da fila de confirmação.
 *
 * ⚠️ Cada falha é contada e DEVOLVIDA com a mensagem do banco: a importação já
 * gravou, e uma recorrência recusada em silêncio deixaria a pessoa achando que
 * o aluguel do mês que vem já está no fluxo.
 */
import { isDemo } from "@/lib/demo";
import { criarRecorrencia } from "@/lib/recorrencias";
import { criarRecorrenciaSaida, findOrCreateParty } from "@/lib/confirmacao";
import type { RecorrenciaAPlanejar } from "@/core/fdip/assistente";

export interface ResultadoRecorrencias {
  contratos: number;
  contasRecorrentes: number;
  falhas: string[];
  simulado: boolean;
}

export async function criarRecorrenciasDaImportacao(lista: RecorrenciaAPlanejar[]): Promise<ResultadoRecorrencias> {
  const out: ResultadoRecorrencias = { contratos: 0, contasRecorrentes: 0, falhas: [], simulado: isDemo };
  for (const r of lista) {
    try {
      if (r.tipo === "entrada") {
        const party = await findOrCreateParty({ name: r.nome, type: "pj", isCustomer: true, isSupplier: false });
        await criarRecorrencia({
          titulo: `${r.nome} · ${r.categoria}`,
          clienteId: party.id, clienteNome: party.name,
          itens: [{ nome: r.categoria, valor: r.valor, qtd: 1, categoria: r.categoria }],
          ciclo: "mensal", diaFaturamento: r.dia, classificacao: r.categoria,
        });
        out.contratos += 1;
      } else {
        const party = isDemo ? null : await findOrCreateParty({ name: r.nome, type: "pj", isCustomer: false, isSupplier: true });
        await criarRecorrenciaSaida({
          partyId: party?.id ?? null, amount: r.valor,
          description: `${r.nome} · ${r.categoria}`, freq: "mensal", vencimentoISO: r.inicio,
        });
        out.contasRecorrentes += 1;
      }
    } catch (e) {
      out.falhas.push(`${r.nome}: ${e instanceof Error ? e.message : "recusada"}`);
    }
  }
  return out;
}
