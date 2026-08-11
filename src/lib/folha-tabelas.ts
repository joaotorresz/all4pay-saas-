"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS TABELAS LEGAIS DA EMPRESA — as do produto, mais as que o contador entrou.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **ESTA PONTE EXISTE PORQUE EU NÃO POSSO SABER A TABELA DE JANEIRO.**
 *
 * As faixas do INSS saem de uma portaria interministerial publicada em janeiro,
 * reajustadas pelo INPC do ano anterior. Não dá para deduzi-las, e chutá-las é
 * o defeito exato que `core/folha/tabelas` foi escrito para impedir: um número
 * com duas casas decimais e ar de exatidão, que ninguém desconfia, e que só
 * aparece numa autuação.
 *
 * A saída não é adivinhar melhor — é deixar de adivinhar. O contador recebe a
 * portaria antes de qualquer software; o que o sistema garante é a ARITMÉTICA
 * (progressividade por faixa, teto, os dois critérios do IRRF, o redutor) e a
 * VIGÊNCIA, não a alíquota. É a mesma decisão já registrada na tela de impostos
 * sobre vendas, onde o ISS varia por município e o ICMS por estado.
 *
 * ⚠️ **A tabela do produto NUNCA é apagada.** O que a empresa entra ENTRA POR
 * CIMA, por competência de vigência: uma vigência digitada com a mesma data
 * substitui a de fábrica, e todas as outras continuam valendo. Substituir a
 * lista inteira faria um recálculo de 2024 sair com a tabela de 2026 — e a
 * folha de um mês fechado mudaria de valor depois de fechada.
 */
import { ler, gravar, CHAVES_ORG } from "@/lib/store-org";
import {
  TABELAS_INSS, TABELAS_IRRF, type TabelaINSS, type TabelaIRRF, type TabelasLegais,
} from "@/core/folha/tabelas";

/** O que a empresa digitou — só as vigências próprias, nunca as de fábrica. */
export interface TabelasDaEmpresa {
  inss: TabelaINSS[];
  irrf: TabelaIRRF[];
}

const VAZIO: TabelasDaEmpresa = { inss: [], irrf: [] };

export function tabelasDigitadas(): TabelasDaEmpresa {
  const t = ler<TabelasDaEmpresa>(CHAVES_ORG.folhaTabelas, VAZIO);
  return { inss: t?.inss ?? [], irrf: t?.irrf ?? [] };
}

/**
 * Junta as duas fontes: a de fábrica por baixo, a digitada por cima.
 *
 * ⚠️ O desempate é por `desde`, não por ordem de inserção — duas vigências com
 * a mesma data são a MESMA tabela, e ficar com as duas faria `escolher` devolver
 * uma ou outra conforme a ordenação, calado.
 */
function juntar<T extends { desde: string }>(fabrica: T[], digitadas: T[]): T[] {
  const por = new Map<string, T>();
  for (const t of fabrica) por.set(t.desde, t);
  for (const t of digitadas) por.set(t.desde, t);
  return Array.from(por.values()).sort((a, b) => a.desde.localeCompare(b.desde));
}

/** As tabelas a passar para os motores de `core/folha`. */
export function tabelasDaEmpresa(): TabelasLegais {
  const d = tabelasDigitadas();
  return {
    inss: juntar(TABELAS_INSS, d.inss),
    irrf: juntar(TABELAS_IRRF, d.irrf),
  };
}

export function salvarTabelaINSS(t: TabelaINSS): void {
  const d = tabelasDigitadas();
  gravar(CHAVES_ORG.folhaTabelas, {
    ...d,
    inss: [...d.inss.filter((x) => x.desde !== t.desde), t].sort((a, b) => a.desde.localeCompare(b.desde)),
  });
}

export function salvarTabelaIRRF(t: TabelaIRRF): void {
  const d = tabelasDigitadas();
  gravar(CHAVES_ORG.folhaTabelas, {
    ...d,
    irrf: [...d.irrf.filter((x) => x.desde !== t.desde), t].sort((a, b) => a.desde.localeCompare(b.desde)),
  });
}

/**
 * Remove uma vigência DIGITADA.
 *
 * ⚠️ Só alcança o que a empresa entrou. Pedir a remoção de uma vigência de
 * fábrica não faz nada de propósito: o produto precisa continuar sabendo
 * calcular 2024 e 2025 depois que alguém "limpou" a lista.
 */
export function removerVigencia(tipo: "inss" | "irrf", desde: string): void {
  const d = tabelasDigitadas();
  gravar(CHAVES_ORG.folhaTabelas, tipo === "inss"
    ? { ...d, inss: d.inss.filter((x) => x.desde !== desde) }
    : { ...d, irrf: d.irrf.filter((x) => x.desde !== desde) });
}

/**
 * As recusas de uma tabela de INSS antes de ela virar cálculo.
 *
 * ⚠️ Uma tabela com faixas fora de ordem não dá erro: ela dá um DESCONTO
 * ERRADO. `inssEmpregado` consome as faixas em sequência e para quando a faixa
 * não cabe — com os tetos embaralhados, a segunda faixa fica negativa e a
 * contribuição sai menor que a devida, todo mês, para todo mundo.
 */
export function problemasINSS(t: TabelaINSS): string[] {
  const p: string[] = [];
  if (!/^\d{4}-\d{2}$/.test(t.desde)) p.push("A vigência precisa ser um mês (AAAA-MM).");
  if (!t.fonte.trim()) p.push("Diga de onde saiu a tabela — sem a fonte, ninguém confere depois.");
  if (t.salarioMinimo <= 0) p.push("Informe o salário mínimo da vigência.");
  if (t.faixas.length < 2) p.push("Uma tabela de INSS tem ao menos duas faixas.");
  t.faixas.forEach((f, i) => {
    if (f.ate <= 0) p.push(`A faixa ${i + 1} precisa de um teto maior que zero.`);
    if (f.aliquota <= 0 || f.aliquota >= 1) p.push(`A alíquota da faixa ${i + 1} vai entre 0 e 1 (0,075 = 7,5%).`);
    if (i > 0 && f.ate <= t.faixas[i - 1].ate) p.push(`O teto da faixa ${i + 1} precisa ser maior que o da anterior.`);
    if (i > 0 && f.aliquota <= t.faixas[i - 1].aliquota) p.push(`A alíquota da faixa ${i + 1} precisa ser maior que a da anterior.`);
  });
  return p;
}

export function problemasIRRF(t: TabelaIRRF): string[] {
  const p: string[] = [];
  if (!/^\d{4}-\d{2}$/.test(t.desde)) p.push("A vigência precisa ser um mês (AAAA-MM).");
  if (!t.fonte.trim()) p.push("Diga de onde saiu a tabela — sem a fonte, ninguém confere depois.");
  if (t.porDependente < 0) p.push("A dedução por dependente não pode ser negativa.");
  if (t.descontoSimplificado < 0) p.push("O desconto simplificado não pode ser negativo.");
  if (t.faixas.length < 2) p.push("Uma tabela de IRRF tem ao menos duas faixas.");
  // ⚠️ A última faixa é aberta (`Infinity`): sem ela, um salário acima do
  // último teto não casaria com faixa nenhuma.
  if (t.faixas.length && Number.isFinite(t.faixas[t.faixas.length - 1].ate)) {
    p.push("A última faixa precisa ser aberta (sem teto).");
  }
  t.faixas.forEach((f, i) => {
    if (i > 0 && f.ate <= t.faixas[i - 1].ate) p.push(`O teto da faixa ${i + 1} precisa ser maior que o da anterior.`);
    if (f.aliquota < 0 || f.aliquota >= 1) p.push(`A alíquota da faixa ${i + 1} vai entre 0 e 1 (0,075 = 7,5%).`);
    if (f.deduzir < 0) p.push(`A parcela a deduzir da faixa ${i + 1} não pode ser negativa.`);
  });
  return p;
}
