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
