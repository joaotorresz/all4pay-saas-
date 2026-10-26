/**
 * As AÇÕES que acompanham uma resposta da Quattro AI: botões que levam a
 * pessoa a fazer algo a partir do que acabou de ler.
 *
 * ⚠️ A IA SUGERE, NÃO EXECUTA (Rodada 9). Cada ação é um ENDEREÇO de uma tela
 * que já existe e já grava — o formulário de conta a pagar, a entrada de
 * dados. O chat continua sem caminho de escrita; o botão só abre a porta
 * certa, já preenchida com o período da pergunta.
 *
 * O caso que fez isto existir: "Não há lançamentos nesta semana" era o fim da
 * conversa. A pessoa lia, fechava o chat e ia procurar sozinha onde lançar.
 */
import type { Janela } from "./engine";

export interface AcaoIA {
  /** O que o botão diz, com verbo: "Lançar despesa neste período". */
  label: string;
  /** Chave de `Icon`. */
  icone: string;
  /** A tela que abre — sempre um endereço de verdade, nunca código solto. */
  rota: string;
}

/** Uma resposta do motor que não achou nada: frase de ausência e nenhum número. */
export function respostaVazia(r: { resposta: string; numeros: readonly unknown[] }): boolean {
  return r.numeros.length === 0 && /^(n[ãa]o (h[áa]|houve)|nenhum)/i.test(r.resposta.trim());
}

/**
 * A data que o formulário abre preenchida: o último dia do período que ainda
 * não passou de hoje (lançar "na semana passada" abre no domingo dela, e
 * "neste mês" abre hoje), ou o primeiro dia de um período todo no futuro.
 */
export function dataDoPeriodo(w: Pick<Janela, "from" | "to">, hoje: string): string {
  if (w.from > hoje) return w.from;
  return w.to < hoje ? w.to : hoje;
}

const LADO_DESPESA = /gast|despes|pag|fornecedor|custo|sa[íi]|torr|queim|tribut|imposto/;
const LADO_RECEITA = /receb|receit|fatur|vend|entr|cliente/;

/**
 * As ações de uma resposta VAZIA, no máximo três. O lado (despesa ou receita)
 * sai da pergunta; sem lado claro, oferece os dois lançamentos.
 */
export function acoesParaVazio(pergunta: string, w: Pick<Janela, "from" | "to">, hoje: string): AcaoIA[] {
  const p = pergunta.toLowerCase();
  const data = dataDoPeriodo(w, hoje);
  const despesa: AcaoIA = { label: "Lançar despesa neste período", icone: "arrow-up-right", rota: `/dashboard/financial/payables/new?vencimento=${data}` };
  const receita: AcaoIA = { label: "Lançar receita neste período", icone: "arrow-left-right", rota: `/dashboard/financial/receivables/new?vencimento=${data}` };
  const enviar: AcaoIA = { label: "Enviar extrato ou comprovante", icone: "upload", rota: "/upload?aba=enviar" };
  const conectar: AcaoIA = { label: "Conectar banco", icone: "building", rota: "/upload?aba=conectar" };

  if (/centro de custo/.test(p)) {
    return [{ label: "Cadastrar centros de custo", icone: "network", rota: "/dashboard/registrations/cost-centers?novo=1" }, despesa, enviar];
  }
  const ehDespesa = LADO_DESPESA.test(p), ehReceita = LADO_RECEITA.test(p);
  if (ehDespesa && !ehReceita) return [despesa, enviar, conectar];
  if (ehReceita && !ehDespesa) return [receita, enviar, conectar];
  return [despesa, receita, enviar];
}

/**
 * AS TELAS QUE A IA CONHECE: o mapa do sistema que ela usa para dizer "onde
 * fazer isso". Uma lista só para o motor nativo (`acoesDeSeguimento`) e para
 * o Claude (que recebe a lista no prompt e devolve ids), validada no cliente
 * por `acoesDasTelas` — id inventado não vira botão.
 */
export const TELAS_DA_IA = {
  fluxo: { label: "Abrir fluxo de caixa", icone: "trending-up", rota: "/fluxo-caixa", serve: "saldo, entradas e saídas, projeção, runway e burn" },
  dre: { label: "Abrir DRE", icone: "file-text", rota: "/dashboard/reports/dre", serve: "receita, custos, margem, EBITDA e lucro por mês" },
  receber: { label: "Abrir contas a receber", icone: "arrow-down", rota: "/contas-a-receber/painel-de-vendas", serve: "o que clientes devem, por vencimento e situação" },
  pagar: { label: "Abrir contas a pagar", icone: "arrow-up", rota: "/contas-a-pagar", serve: "o que vence para pagar, fornecedores e contas atrasadas" },
  cobrar: { label: "Cobrar vencidos", icone: "bell", rota: "/dashboard/financial/overdue", serve: "inadimplência e régua de cobrança dos títulos vencidos" },
  recorrentes: { label: "Ver contas recorrentes", icone: "repeat", rota: "/contas-a-pagar/recorrentes", serve: "custo fixo e contas que se repetem todo mês" },
  folha: { label: "Abrir folha", icone: "users", rota: "/contas-a-pagar/folha", serve: "salários, encargos, férias e rescisão" },
  simular: { label: "Simular a decisão", icone: "target", rota: "/simuladores", serve: "posso comprar, financiar ou contratar?" },
  orcamento: { label: "Abrir orçamento", icone: "gauge", rota: "/orcamento", serve: "planejado × realizado por categoria" },
  enviar: { label: "Enviar extrato ou comprovante", icone: "upload", rota: "/upload?aba=enviar", serve: "importar extrato, boleto, nota ou comprovante" },
  conectar: { label: "Conectar banco", icone: "building", rota: "/upload?aba=conectar", serve: "Open Finance: o extrato entra sozinho" },
} as const satisfies Record<string, AcaoIA & { serve: string }>;

export type TelaIA = keyof typeof TELAS_DA_IA;

/** Ids vindos de fora (o Claude) → botões. Id desconhecido ou repetido sai; no máximo dois. */
export function acoesDasTelas(ids: unknown): AcaoIA[] {
  if (!Array.isArray(ids)) return [];
  const vistos = new Set<string>();
  const out: AcaoIA[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || vistos.has(id) || !(id in TELAS_DA_IA)) continue;
    vistos.add(id);
    const { label, icone, rota } = TELAS_DA_IA[id as TelaIA];
    out.push({ label, icone, rota });
    if (out.length === 2) break;
  }
  return out;
}

/** A frase do prompt que apresenta as telas ao Claude. */
export function telasParaPrompt(): string {
  return Object.entries(TELAS_DA_IA).map(([id, t]) => `"${id}" (${t.serve})`).join(", ");
}

/**
 * O PRÓXIMO PASSO de uma resposta com número: a tela onde a pessoa age sobre
 * o que acabou de ler. Sai do assunto (pergunta + fontes do motor); a
 * calculadora não leva a tela nenhuma além do simulador. No máximo dois.
 */
export function acoesDeSeguimento(pergunta: string, fontes: readonly string[]): AcaoIA[] {
  const t = `${pergunta} ${fontes.join(" ")}`.toLowerCase();
  const ids: TelaIA[] = [];
  const quer = (cond: boolean, id: TelaIA) => { if (cond && !ids.includes(id)) ids.push(id); };
  if (/simulador|financiamento|parcela|precifica|payback|valor futuro|poupan|convers[ãa]o de taxa|simples nacional|juros de mora|desconto|antecipa/.test(t)) {
    quer(/posso|consigo|vale a pena|comprar|financ/.test(t), "simular");
    return acoesDasTelas(ids);
  }
  quer(/vencid|inadimpl|atras/.test(t) && /receb|client|inadimpl/.test(t), "cobrar");
  quer(/folha|sal[áa]ri|encargo|f[ée]rias/.test(t), "folha");
  quer(/recorrent|custo fixo|mensalidade|assinatura/.test(t), "recorrentes");
  quer(/\bdre\b|margem|ebitda|lucro|receita l[íi]quida|carga tribut|resultado|ponto de equil/.test(t), "dre");
  quer(/fluxo|saldo|runway|burn|caixa|previs|proje/.test(t), "fluxo");
  quer(/or[çc]amento|planejado/.test(t), "orcamento");
  quer(/receb|client|receita|fatur|venda/.test(t), "receber");
  quer(/gast|despes|pag|fornecedor|vencimento|custo/.test(t), "pagar");
  return acoesDasTelas(ids);
}
