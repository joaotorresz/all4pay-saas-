/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A4P-078 — SIMPLES E IRPJ/CSLL NO MESMO MÊS: alerta, nunca provisão
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * No **Simples Nacional o IRPJ e a CSLL estão DENTRO do DAS** — a guia é
 * unificada. No **Anexo IV** a exceção é a **CPP patronal**, recolhida por
 * fora; o imposto sobre o LUCRO continua dentro. Então uma organização do
 * Simples que tem lançamento na linha "Impostos sobre o Lucro" está, muito
 * provavelmente, contando o mesmo tributo duas vezes: uma no DAS e outra no
 * DARF.
 *
 * Medido em produção (17/08), org `joaov.yoshimi`, 9 meses (10/2025 a 06/2026):
 * `Simples Nacional` R$5.200,00/mês (R$46.800,00) convivendo com `IRPJ / CSLL`
 * (R$75.982,66). Os dois na mesma competência, mês a mês, sem falha.
 *
 * ⚠️ **ESTE MÓDULO NÃO CORRIGE O DADO, E ISSO É A DECISÃO.** Reclassificar
 * lançamento de imposto é decisão do dono com o contador — o sistema não sabe
 * qual das duas pernas é a indevida (pode ser o DAS, se a empresa não é do
 * Simples; pode ser o DARF, se é). Escolher sozinho seria apagar dinheiro
 * registrado com base num palpite.
 *
 * ⚠️ **E NUNCA SOMA PROVISÃO ESTIMADA ONDE JÁ EXISTE LANÇAMENTO REAL.** A
 * primeira versão deste item pedia "provisão parametrizada por regime" na linha
 * de imposto sobre o lucro. Medida a base, a linha **não** estava zerada: tinha
 * R$75.982,66 de lançamento real. Provisionar por cima teria contado o imposto
 * uma terceira vez — o conserto criando o defeito que ia consertar.
 */
import type { RegimeTributario } from "@/core/administracao";

export const TAX_DUPLICIDADE_VERSION = "tax-duplicidade/1.0.0";

/**
 * Os anexos do Simples. ⚠️ **`IV` entra aqui e NÃO em `core/tax`**: aquele
 * módulo calcula o DAS por faixa e só tem tabela de I, II, III e V. Oferecer o
 * IV no cadastro é dizer a verdade sobre a empresa; inventar a tabela dele para
 * "completar" seria fabricar alíquota, que é exatamente o que este item proíbe.
 */
export type AnexoSimplesCadastro = "I" | "II" | "III" | "IV" | "V";

export const ANEXOS_SIMPLES: { id: AnexoSimplesCadastro; label: string }[] = [
  { id: "I", label: "Anexo I — Comércio" },
  { id: "II", label: "Anexo II — Indústria" },
  { id: "III", label: "Anexo III — Serviços em geral" },
  { id: "IV", label: "Anexo IV — Construção, limpeza, vigilância (CPP por fora)" },
  { id: "V", label: "Anexo V — Serviços intelectuais/técnicos" },
];

/**
 * O regime como ele é no cadastro: **pode não estar configurado**.
 *
 * ⚠️ `null` é um valor de primeira classe aqui, e é o ponto. `regimeDaEmpresa`
 * assume `presumido` quando não há nada gravado — o que é razoável para
 * PROJETAR uma carga, e é mentira para DECIDIR se há duplicidade: uma empresa
 * sem regime configurado seria tratada como Presumido e o alerta do Simples
 * nunca apareceria, justamente para quem não configurou nada.
 */
export interface RegimeConfigurado {
  regime: RegimeTributario | null;
  anexo: AnexoSimplesCadastro | null;
}

/** Lê o regime do cadastro SEM inventar padrão. Vazio é vazio. */
export function regimeConfigurado(db: Record<string, unknown> | null | undefined): RegimeConfigurado {
  const bruto = String(db?.regimeTributario ?? db?.regime ?? "").toLowerCase().trim();
  const anexoBruto = String(db?.anexoSimples ?? "").toUpperCase().trim();
  const anexo = (["I", "II", "III", "IV", "V"] as const).find((a) => a === anexoBruto) ?? null;
  if (!bruto) return { regime: null, anexo };
  const regime: RegimeTributario | null =
    bruto.includes("simples") ? "simples"
    : bruto.includes("mei") ? "mei"
    : bruto.includes("real") ? "real"
    : bruto.includes("presumido") ? "presumido"
    : null;
  return { regime, anexo: regime === "simples" ? anexo : null };
}

/** Um lançamento que caiu na linha de imposto sobre o lucro. */
export interface LancamentoImpostoLucro {
  id: string;
  competencia: string;
  valor: number;
}

export interface AlertaDuplicidade {
  /** `true` quando o regime é Simples E há lançamento na linha do lucro. */
  duplicidade: boolean;
  /** Quanto está lançado na linha de imposto sobre o lucro, no período. */
  total: number;
  /** Quantos lançamentos — a tela lista, o dono leva ao contador. */
  quantidade: number;
  /** A frase da tela. Vazia quando não há o que dizer. */
  aviso: string;
  /**
   * ⚠️ SEMPRE `0`. Existe para tornar a regra legível no ponto de uso e para a
   * guarda poder cobrá-la: este motor NUNCA devolve provisão estimada. O campo
   * é a promessa escrita de que nada será somado à linha.
   */
  provisaoEstimada: 0;
}

/**
 * **Alerta de duplicidade — o consumidor do regime configurado.**
 *
 * Só dispara com as DUAS condições: regime `simples` declarado no cadastro E
 * ao menos um lançamento na linha de imposto sobre o lucro. Sem regime
 * configurado não há alerta (não se acusa duplicidade de quem não declarou
 * nada); sem lançamento não há o que duplicar.
 */
export function alertaDuplicidadeImpostoLucro(
  cfg: RegimeConfigurado,
  lancamentos: LancamentoImpostoLucro[],
): AlertaDuplicidade {
  const total = Math.round(lancamentos.reduce((s, l) => s + l.valor, 0) * 100) / 100;
  const duplicidade = cfg.regime === "simples" && lancamentos.length > 0;
  const anexo = cfg.anexo ? ` (Anexo ${cfg.anexo})` : "";
  return {
    duplicidade,
    total,
    quantidade: lancamentos.length,
    provisaoEstimada: 0,
    aviso: duplicidade
      ? `Possível duplicidade: esta empresa está cadastrada no Simples Nacional${anexo}, `
        + "e no Simples o IRPJ e a CSLL já estão dentro do DAS. Há "
        + `${lancamentos.length} lançamento(s) na linha de imposto sobre o lucro. `
        + "Confira com a contabilidade qual das duas cobranças é a devida — o sistema "
        + "não reclassifica sozinho."
      : "",
  };
}
