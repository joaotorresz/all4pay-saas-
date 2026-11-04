/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O AGENTE DE CONCILIAÇÃO (Etapa 4 do plano "AI first", 04/11/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O agente NÃO tem casador próprio: ele lê os MESMOS pares da aba Conciliar
 * (`core/conciliacao/pares`) e transforma cada par numa PROPOSTA
 * ("Conciliar NF 1042 · ACME Ltda"). Quem concilia, depois do "Aprovar" ou
 * dentro do limite, é o banco (`agente_conciliar`), pela MESMA regra do botão
 * da tela (`conciliar_na_empresa`).
 *
 * ⚠️ "Só pergunta o que não fechou": o par de confiança média ou baixa SEMPRE
 * espera a aprovação, em qualquer nível. Sozinho, só o par de confiança alta.
 *
 * ⚠️ A chave é o par (`par:<título>:<extrato>`): o par recusado não volta a ser
 * proposto, e o mesmo título nunca é proposto duas vezes enquanto espera.
 *
 * Puro: nada de banco, relógio ou provedor.
 */
import { CONFIANCA_ALTA, type ParConciliacao } from "@/core/conciliacao/pares";
import { rotear, type ConfigAgente, type Destino } from "./index";

export interface PropostaDeConciliacao {
  chave: string;
  titulo: string;
  porque: string;
  valor: number;
  confianca: number;
  dados: { previsto: string; extrato: string; confianca: number; tipo: "entrada" | "saida" };
}

export const chaveDoPar = (previsto: string, extrato: string) => `par:${previsto}:${extrato}`;

const dataBR = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
};

function fraseDosCriterios(p: ParConciliacao): string {
  const c = p.criterios;
  const valor = c.valorExato ? "Mesmo valor" : "Valor com diferença de até 2%";
  const data = c.dias === 0 ? "mesma data" : `${c.dias} ${c.dias === 1 ? "dia" : "dias"} de diferença na data`;
  return `${valor}, ${data}${c.mesmoContato ? ", mesmo contato" : ""}`;
}

/** As propostas: uma por par, sem repetir título nem linha do extrato que já têm proposta aberta. */
export function propostasDeConciliacao(pares: ParConciliacao[], ocupados: { previstos: Set<string>; extratos: Set<string> }): PropostaDeConciliacao[] {
  const out: PropostaDeConciliacao[] = [];
  for (const p of pares) {
    if (ocupados.previstos.has(p.pendId) || ocupados.extratos.has(p.ofId)) continue;
    const lado = p.tipo === "entrada" ? "Entrada" : "Saída";
    out.push({
      chave: chaveDoPar(p.pendId, p.ofId),
      titulo: `Conciliar ${p.pendDesc}`.slice(0, 200),
      porque: `${lado} do banco de ${dataBR(p.ofData)} (${p.ofDesc}) com o título de ${dataBR(p.dueDate)}. ${fraseDosCriterios(p)}. Confiança ${p.confianca}%.`.slice(0, 1000),
      valor: Math.round(p.amount * 100) / 100,
      confianca: p.confianca,
      dados: { previsto: p.pendId, extrato: p.ofId, confianca: p.confianca, tipo: p.tipo },
    });
  }
  return out;
}

/**
 * Para onde vai cada proposta nova. O limite por dia conta as que o agente já
 * fez sozinho hoje E as desta leva; o par que não é de confiança alta nunca
 * sai sozinho.
 */
export function planejarConciliacao(propostas: PropostaDeConciliacao[], config: ConfigAgente, feitasHoje: number): { chave: string; destino: Destino }[] {
  let feitas = feitasHoje;
  return propostas.map((p) => {
    let destino = rotear({ config, valor: p.valor, feitasHoje: feitas });
    if (destino === "executar" && p.confianca < CONFIANCA_ALTA) destino = "aprovar";
    if (destino === "executar") feitas++;
    return { chave: p.chave, destino };
  });
}

export const MOTIVO_PAR_DESFEITO = "O título ou a linha do extrato já foi conciliado por outra porta, ou mudou.";
