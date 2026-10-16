/**
 * Os fluxos de automação que a empresa monta (`core/automacoes/fluxo`).
 *
 * Moram em `org_state` (chave `a4p_automacao_fluxos`) pela `store-org`: a
 * leitura é síncrona para a tela e o servidor recebe cada gravação — é dele
 * que o disparo agendado vai ler. A regra do que é um fluxo válido NÃO mora
 * aqui: quem decide é `validarFluxo`, e a tela só grava o que ele aceita como
 * ativo.
 */
import * as React from "react";
import { ler, gravar, inscrever, CHAVES_ORG } from "@/lib/store-org";
import { validarFluxo, type Fluxo, type VendaMaquininha } from "@/core/automacoes/fluxo";

const CHAVE = CHAVES_ORG.automacaoFluxos;

export function listarFluxos(): Fluxo[] {
  const v = ler<Fluxo[]>(CHAVE, []);
  return Array.isArray(v) ? v : [];
}

/**
 * Salva (insere ou substitui pelo id). ⚠️ Um fluxo com problema nunca fica
 * ATIVO: ligar algo que não tem para quem mandar (ou manda para um número
 * errado) é falhar todo dia, em silêncio, no horário marcado.
 */
export function salvarFluxo(f: Fluxo): Fluxo {
  const pronto = validarFluxo(f).length > 0 ? { ...f, ativo: false } : f;
  const lista = listarFluxos();
  const i = lista.findIndex((x) => x.id === f.id);
  const nova = i >= 0 ? lista.map((x) => (x.id === f.id ? pronto : x)) : [...lista, pronto];
  gravar(CHAVE, nova);
  return pronto;
}

/** Remove e devolve o restaurador (a ação destrutiva oferece desfazer). */
export function removerFluxo(id: string): () => void {
  const antes = listarFluxos();
  gravar(CHAVE, antes.filter((f) => f.id !== id));
  return () => gravar(CHAVE, antes);
}

export function novoIdFluxo(): string {
  const r = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `fluxo-${r}`;
}

/** A lista reativa: re-renderiza quando o servidor hidrata ou outra aba grava. */
export function useFluxos(): Fluxo[] {
  const [lista, setLista] = React.useState<Fluxo[]>([]);
  React.useEffect(() => {
    setLista(listarFluxos());
    return inscrever(CHAVE, () => setLista(listarFluxos()));
  }, []);
  return lista;
}

/**
 * ⚠️ VENDAS DE EXEMPLO, só para a PRÉVIA da mensagem da maquininha. A tela as
 * anuncia como exemplo: no envio de verdade entram as vendas do dia. Um
 * número de exemplo sem o rótulo seria lido como faturamento.
 */
export function vendasDeExemplo(dia: string): VendaMaquininha[] {
  const em = (h: string) => `${dia}T${h}:00-03:00`;
  return [
    { nsu: 1, status: "Aprovada", valor: 89.9, forma: "debito", parcelas: 1, bandeira: "Visa", ocorridoEm: em("09:12"), liquido: 87.21 },
    { nsu: 2, status: "Aprovada", valor: 240, forma: "credito_vista", parcelas: 1, bandeira: "Mastercard", ocorridoEm: em("11:40"), liquido: 230.4 },
    { nsu: 3, status: "Aprovada", valor: 600, forma: "parcelado", parcelas: 3, bandeira: "Elo", ocorridoEm: em("15:05"), liquido: 562.8 },
    { nsu: 4, status: "Aprovada", valor: 45.5, forma: "debito", parcelas: 1, bandeira: "Mastercard", ocorridoEm: em("17:30"), liquido: 44.13 },
    { nsu: 5, status: "Negada", valor: 120, forma: "credito_vista", parcelas: 1, bandeira: "Visa", ocorridoEm: em("18:02"), liquido: null },
  ];
}
