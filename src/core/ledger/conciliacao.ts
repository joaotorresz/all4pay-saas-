/**
 * CAIXA DO RAZÃO × EXTRATO — a conta que o cartão do Razão mostra.
 *
 * ⚠️ **O número rotulado "razão" tem de ser o do RAZÃO.** O cartão mostrava
 * "Somando todos os lançamentos" = liquidados + PREVISTOS (o `derivado` de
 * `reconciliarSaldo`, que descreve o que o razão fazia ANTES de deixar de
 * postar previsto). Medido na demonstração: o cartão dizia R$ 3.160.408,53 e a
 * linha "1.1.01 · Caixa e equivalentes" do balancete, logo abaixo, dizia
 * R$ 3.108.835,26 — a diferença era exatamente o total dos títulos em aberto,
 * apresentado como parcela de uma diferença da qual ele não faz parte.
 * Pior: um lançamento manual que debita o caixa mudava o balancete e NÃO
 * mudava o cartão, então a conciliação nunca o enxergava.
 *
 * Agora: o caixa do razão é o saldo da conta caixa do balancete, e a diferença
 * para o extrato se decompõe em parcelas que SOMAM a diferença:
 *
 *   extrato − caixa do razão = abertura + liquidados sem data
 *                              − lançamentos próprios no caixa + resíduo
 *
 * O resíduo só pode ser diferente de zero quando a abertura veio de fonte
 * independente; sem ela a parcela de abertura fecha a conta por construção, e
 * a tela tem de dizer NÃO CONFERIDO (a lição do A4P-073).
 */
import { reconciliarSaldo } from "@/core/indicadores";
import { CAIXA } from "./chart";
import type { RiskInput } from "@/core/risk-engine/types";

export interface LinhaRazaoMin { conta: string; debito: number; credito: number }
export interface LancamentoRazaoMin { externalKey?: string; linhas: LinhaRazaoMin[] }

export interface ParcelaCaixa { id: "abertura" | "sem_data" | "proprios" | "residuo"; rotulo: string; valor: number; explicacao: string }

export interface ConciliacaoCaixaRazao {
  extrato: number;
  /** Saldo da conta caixa (1.1.01) do balancete — o MESMO número da tabela. */
  caixaRazao: number;
  /** Parte do caixa do razão que veio da projeção dos movimentos. */
  doMovimento: number;
  /** Parte do caixa do razão que veio de lançamentos próprios (manual, estorno, provisão…). */
  proprios: number;
  diferenca: number;
  parcelas: ParcelaCaixa[];
  /** O que sobra depois das parcelas — só mede algo com abertura verificada. */
  residuo: number;
  aberturaVerificada: boolean;
  aberturaOrigem?: string;
  /** Títulos em aberto: NÃO entram nem no razão nem no extrato — informativo. */
  previstosForaDoRazao: number;
  fecha: boolean;
}

const c2 = (n: number) => Math.round(n * 100) / 100;
const semMenosZero = (n: number) => (Object.is(c2(n), -0) ? 0 : c2(n));

export function conciliarCaixaDoRazao(entries: readonly LancamentoRazaoMin[], input: RiskInput): ConciliacaoCaixaRazao {
  let doMovimento = 0;
  let proprios = 0;
  for (const e of entries) {
    for (const l of e.linhas) {
      if (l.conta !== CAIXA) continue;
      const v = (l.debito || 0) - (l.credito || 0);
      if ((e.externalKey ?? "").startsWith("mov:")) doMovimento += v;
      else proprios += v;
    }
  }
  const rec = reconciliarSaldo(input);
  const semData = rec.parcelas.find((p) => p.id === "sem_data")?.valor ?? 0;
  const abertura = rec.parcelas.find((p) => p.id === "abertura")?.valor ?? 0;
  const previstos = rec.parcelas.find((p) => p.id === "previstos")?.valor ?? 0;
  const caixaRazao = c2(doMovimento + proprios);
  const extrato = c2(rec.extrato);
  const diferenca = c2(extrato - caixaRazao);
  // O resíduo é o que as três parcelas nomeadas NÃO explicam.
  const residuo = c2(diferenca - (abertura + semData - proprios));
  return {
    extrato, caixaRazao, doMovimento: c2(doMovimento), proprios: c2(proprios), diferenca,
    parcelas: [
      {
        id: "abertura",
        rotulo: rec.aberturaVerificada ? `Saldo anterior ao histórico (${rec.aberturaOrigem})` : "Saldo anterior ao histórico — NÃO VERIFICADO",
        valor: semMenosZero(abertura),
        explicacao: rec.aberturaVerificada
          ? "O que havia em conta antes do primeiro lançamento conhecido, vindo de fonte independente."
          : "Nenhuma fonte independente informou o saldo de abertura: este valor é o que SOBRA da conta e fecha por construção. Informe o saldo de abertura para a diferença ser medida.",
      },
      {
        id: "sem_data", rotulo: "Liquidados sem data",
        valor: semMenosZero(semData),
        explicacao: "Pagos sem data de pagamento nem de vencimento: estão no extrato e ficam fora do razão, que não tem em que dia postá-los.",
      },
      {
        id: "proprios", rotulo: "Lançamentos próprios do razão no caixa",
        valor: semMenosZero(-proprios),
        explicacao: "Lançamentos manuais, estornos e provisões que movem a conta caixa sem movimento bancário correspondente. Mudam o razão e não mudam o extrato.",
      },
      {
        id: "residuo", rotulo: "Resíduo sem explicação",
        valor: semMenosZero(residuo),
        explicacao: rec.aberturaVerificada
          ? "O que nenhuma das parcelas acima explica. Diferente de zero, há lançamento faltando ou sobrando."
          : "Sem saldo de abertura verificado o resíduo é zero por construção — não confere nada.",
      },
    ],
    residuo: semMenosZero(residuo),
    aberturaVerificada: rec.aberturaVerificada,
    aberturaOrigem: rec.aberturaOrigem,
    previstosForaDoRazao: semMenosZero(previstos),
    fecha: rec.aberturaVerificada && Math.abs(residuo) < 0.005,
  };
}
