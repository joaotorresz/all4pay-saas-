/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ARQUIVO — a `Exportacao` virando abas de planilha e texto CSV
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ Puro de propósito, e separado do `montarExportacao`: aqui não se decide
 * NADA sobre número. Este arquivo só escolhe ordem de coluna, rótulo e
 * pontuação. Se um dia ele precisar de um valor que não está na `Exportacao`,
 * a resposta é a mesma do módulo ao lado — a cascata ganha o campo, não este
 * arquivo ganha uma conta.
 *
 * ⚠️ **O CSV usa `;` e vírgula decimal.** O Excel em pt-BR abre `,` como
 * separador decimal e `;` como separador de campo; entregar o padrão americano
 * faz a planilha do contador abrir com tudo numa coluna só, ou pior, com
 * `1.234,56` lido como texto. E qualquer `;` dentro de um texto quebraria a
 * linha em duas, deslocando todas as colunas seguintes daquele lançamento —
 * por isso todo campo de texto vai entre aspas, com aspa interna dobrada.
 */
import type { Exportacao, LinhaRazao } from "./index";
import type { PlanilhaXLSX, CelulaXLSX } from "@/lib/xlsx";

/** As colunas do razão, na ordem em que o contador as lê. */
const COLUNAS_RAZAO: { titulo: string; de: (r: LinhaRazao) => CelulaXLSX }[] = [
  { titulo: "Competência", de: (r) => r.competencia },
  { titulo: "Caixa", de: (r) => r.caixa },
  { titulo: "Descrição", de: (r) => r.descricao },
  { titulo: "Contraparte", de: (r) => r.contraparte },
  { titulo: "Categoria", de: (r) => r.categoria },
  { titulo: "Linha do DRE", de: (r) => r.linhaDre },
  { titulo: "Valor", de: (r) => r.valor },
  { titulo: "Valor do lançamento", de: (r) => r.valorLancamento },
  { titulo: "Tipo", de: (r) => (r.tipo === "entrada" ? "Entrada" : "Saída") },
  { titulo: "Origem", de: (r) => r.origem || "—" },
  { titulo: "Situação", de: (r) => r.situacao },
  { titulo: "Lançado por", de: (r) => r.lancadoPor || "—" },
  { titulo: "Projeto", de: (r) => r.projeto },
  { titulo: "Centro de custo", de: (r) => r.centro },
  { titulo: "No DRE", de: (r) => (r.noDre ? "Sim" : "Não") },
  { titulo: "Por que ficou de fora", de: (r) => r.motivoFora },
  { titulo: "Id do lançamento", de: (r) => r.movimentoId },
];

const REGIME: Record<string, string> = {
  competencia: "Competência (o mês em que o fato aconteceu)",
  caixa: "Caixa (o mês em que o dinheiro andou)",
};

/**
 * O cabeçalho que abre os dois arquivos.
 *
 * ⚠️ Ele não é enfeite: sem o REGIME escrito, "agosto" é ambíguo, e o contador
 * não tem como saber por que o número dele difere. O mesmo vale para a visão
 * (com previsto × só confirmado) e para os cancelados.
 */
function cabecalhoLinhas(e: Exportacao): CelulaXLSX[][] {
  const c = e.cabecalho;
  const linhas: CelulaXLSX[][] = [
    ["Empresa", c.empresa],
  ];
  // ⚠️ CNPJ em branco é pior que ausente: parece campo que ninguém preencheu.
  if (c.cnpj) linhas.push(["CNPJ", c.cnpj]);
  if (c.regimeTributario) linhas.push(["Regime tributário declarado", c.regimeTributario]);
  linhas.push(
    ["Regime do relatório", REGIME[c.regime] ?? c.regime],
    ["Período", `${c.periodoDe} a ${c.periodoAte}`],
    ["Gerado em", c.geradoEm],
    ["Títulos previstos", c.visao === "com-previsto" ? "Incluídos" : "Excluídos (só confirmados)"],
    ["Cancelados", c.incluiCancelados ? "Listados (não somam)" : "Não listados"],
    ["Lançamentos", e.resumo.movimentos],
    ["No DRE", e.resumo.movimentosNoDre],
    ["Fora do DRE", e.resumo.movimentosForaDoDre],
    ["Resultado líquido", e.resumo.resultado],
    [],
  );
  return linhas;
}

export function planilhasDaExportacao(e: Exportacao): PlanilhaXLSX[] {
  const razao: CelulaXLSX[][] = [
    ...cabecalhoLinhas(e),
    COLUNAS_RAZAO.map((c) => c.titulo),
    ...e.razao.map((r) => COLUNAS_RAZAO.map((c) => c.de(r))),
  ];

  const dre: CelulaXLSX[][] = [
    ...cabecalhoLinhas(e),
    ["Linha", "Sinal", "Valor", "AV %"],
    // ⚠️ A INDENTAÇÃO É O QUE TORNA A CASCATA LEGÍVEL fora da tela. Sem ela,
    // "Receita Líquida" e "Vendas" viram duas linhas do mesmo peso, e quem lê
    // não distingue o subtotal do item que o compõe.
    ...e.dre.map((l) => [
      `${"    ".repeat(l.nivel - 1)}${l.label}`,
      l.sinal,
      l.valor,
      l.av == null ? "—" : l.av,
    ]),
  ];

  return [{ nome: "Razão", linhas: razao }, { nome: "DRE", linhas: dre }];
}

/* ─────────────────────────────────── CSV ────────────────────────────────── */

const campoCSV = (v: CelulaXLSX): string => {
  if (v == null) return "";
  if (typeof v === "number") {
    // Vírgula decimal, SEM separador de milhar: o ponto de milhar faz o Excel
    // pt-BR ler o número como texto em algumas configurações regionais.
    return `"${v.toFixed(2).replace(".", ",")}"`;
  }
  return `"${String(v).replace(/"/g, '""')}"`;
};

/**
 * ⚠️ **BOM de UTF-8 na frente.** Sem ele o Excel abre o CSV em ANSI e
 * "Manutenção" chega "ManutenÃ§Ã£o" — o mesmo defeito que o TXT do Domínio já
 * registra, pela ponta oposta. Aqui a saída é UTF-8 e o BOM é o que diz isso.
 */
export const BOM = "﻿";

export function csvDaExportacao(e: Exportacao): { razao: string; dre: string } {
  const linhasParaCSV = (linhas: CelulaXLSX[][]) =>
    BOM + linhas.map((l) => l.map(campoCSV).join(";")).join("\r\n") + "\r\n";
  const [razao, dre] = planilhasDaExportacao(e);
  return { razao: linhasParaCSV(razao.linhas), dre: linhasParaCSV(dre.linhas) };
}
