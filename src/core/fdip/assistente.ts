/**
 * O ASSISTENTE DA IMPORTAÇÃO — o que a pessoa confirma ANTES de qualquer coisa
 * entrar no sistema (pedido do dono, 27/10/2026).
 *
 * Sobe o extrato (PDF, OFX, CSV, XLSX), e antes de gravar abre uma janela em
 * quatro passos: o resumo do período · as receitas por pagador (cadastrar como
 * cliente, marcar como receita recorrente) · as despesas por favorecido (o
 * custo fixo estimado, cadastrar fornecedor, conta recorrente "todo dia D") ·
 * a confirmação com tudo o que será criado.
 *
 * ⚠️ Nada aqui grava. `montarAssistente` LÊ o relatório do FDIP e agrupa;
 * `aplicarDecisoes` devolve um relatório NOVO com o que a pessoa decidiu; quem
 * grava continua sendo `aplicarOnboarding` — um escritor só.
 *
 * ⚠️ Recorrência aqui é PRESENÇA EM MESES, não contagem. Três PIX do mesmo
 * cliente na mesma semana não são receita recorrente; um por mês em três meses
 * é. E "fixo" é recorrente COM valor estável (variação ≤ 15%): a conta de luz
 * repete e varia, o aluguel repete e não varia — só o segundo é custo fixo.
 *
 * Puro, tipado, sem I/O e sem relógio.
 */
import type { Classificacao, FDIPReport, FinancialRecord } from "./types";
import { CATEGORIA_TAXA_POS } from "@/core/vendas/pos";

export const VERSAO_ASSISTENTE = "fdip-assistente/1.0.0";

/** Variação máxima (coeficiente de variação dos totais mensais) para ser FIXO. */
export const CV_FIXO = 0.15;

/** As categorias que o assistente oferece — os MESMOS nomes que o FDIP grava. */
export const CATEGORIAS_RECEITA = [
  "Vendas", "Receita de serviços", "Rendimento de aplicação", "Outras receitas",
] as const;
export const CATEGORIAS_DESPESA = [
  "Aluguel", "Folha de pagamento", "Fornecedores / insumos", "Marketing",
  "Assinaturas / software", "Utilidades", "Combustível", "Impostos",
  "Tarifas bancárias", CATEGORIA_TAXA_POS, "Serviços profissionais",
  // as que o CNPJ (CNAE) e o cartão (MCC) produzem — sem elas no seletor, a
  // categoria sugerida aparecia sozinha no topo, sem as irmãs ao lado
  "Alimentação", "Frete e logística", "Viagens", "Manutenção", "Saúde", "Seguros",
  "Educação", "Lazer", "Obras e instalações",
  "Outras despesas",
] as const;

export interface MesResumo { mes: string; entradas: number; saidas: number }

export interface GrupoImportacao {
  /** contraparte normalizada (ou o descritivo, quando não há contraparte) */
  chave: string;
  nome: string;
  lado: "entrada" | "saida";
  total: number;
  ocorrencias: number;
  /** meses distintos em que apareceu */
  meses: number;
  valorMedio: number;
  /** total ÷ meses em que apareceu */
  mediaMensal: number;
  /** dia do mês mais provável (mediana dos dias), 1–31 */
  diaTipico: number;
  /** a categoria mais frequente que a leitura deu */
  categoria: string;
  /** a menor confiança da leitura no grupo */
  confianca: number;
  recorrente: boolean;
  /** recorrente com valor estável — entra no custo fixo */
  fixo: boolean;
  /** é nome de alguém (pode virar cadastro) */
  ehPessoa: boolean;
  recordIds: string[];
  /** última data em que apareceu (ISO) */
  ultima: string;
}

export interface ResumoImportacao {
  de: string;
  ate: string;
  /** meses de calendário cobertos pelo arquivo */
  mesesNoPeriodo: number;
  porMes: MesResumo[];
  entradas: number;
  saidas: number;
  resultado: number;
  lancamentos: number;
  /** transferências entre contas: ficam FORA de receita e despesa */
  transferencias: number;
  valorTransferencias: number;
  /** soma da média mensal das despesas FIXAS */
  custoFixoMensal: number;
  /** soma da média mensal das despesas recorrentes que VARIAM */
  custoVariavelRecorrente: number;
  receitaRecorrenteMensal: number;
}

export interface Assistente {
  versao: string;
  resumo: ResumoImportacao;
  receitas: GrupoImportacao[];
  despesas: GrupoImportacao[];
}

const ehTransferencia = (r: FinancialRecord, c?: Classificacao) =>
  r.tipo === "transferencia" || c?.destino === "Transferência";

const mesDe = (iso: string) => iso.slice(0, 7);
const diaDe = (iso: string) => Number(iso.slice(8, 10)) || 1;

function mediana(ns: number[]): number {
  if (!ns.length) return 0;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function moda(xs: string[]): string {
  const cont = new Map<string, number>();
  for (const x of xs) cont.set(x, (cont.get(x) ?? 0) + 1);
  let melhor = xs[0] ?? "";
  let n = 0;
  for (const [k, v] of Array.from(cont)) if (v > n) { melhor = k; n = v; }
  return melhor;
}

/** Quantos meses de calendário vão de `de` a `ate` (inclusive). */
export function mesesEntre(de: string, ate: string): number {
  if (!de || !ate) return 0;
  const a = Number(de.slice(0, 4)) * 12 + Number(de.slice(5, 7));
  const b = Number(ate.slice(0, 4)) * 12 + Number(ate.slice(5, 7));
  return Math.max(0, b - a) + 1;
}

/** Coeficiente de variação; zero quando há um valor só. */
function coefVar(ns: number[]): number {
  if (ns.length < 2) return 0;
  const m = ns.reduce((s, x) => s + x, 0) / ns.length;
  if (m === 0) return 0;
  const v = ns.reduce((s, x) => s + (x - m) ** 2, 0) / ns.length;
  return Math.sqrt(v) / m;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * ⚠️ A regra da recorrência: o arquivo precisa cobrir pelo menos 2 meses (com
 * um mês só não existe padrão), o grupo precisa aparecer em `min(3, meses do
 * arquivo)` meses distintos, e no máximo duas vezes por mês em média — dez
 * vendas no mês para o mesmo cliente são volume, não contrato.
 */
export function ehRecorrente(mesesDoGrupo: number, ocorrencias: number, mesesNoPeriodo: number): boolean {
  if (mesesNoPeriodo < 2) return false;
  if (mesesDoGrupo < Math.min(3, mesesNoPeriodo)) return false;
  return ocorrencias <= mesesDoGrupo * 2;
}

export function montarAssistente(report: FDIPReport): Assistente {
  const cls = new Map(report.classificacoes.map((c) => [c.recordId, c]));
  const pessoa = new Map(report.entidades.map((e) => [e.id, e.ehPessoa !== false]));
  const nomeDe = new Map(report.entidades.map((e) => [e.id, e.nome]));

  const datas = report.records.map((r) => r.data).filter(Boolean).sort();
  const de = datas[0] ?? "";
  const ate = datas[datas.length - 1] ?? "";
  const mesesNoPeriodo = mesesEntre(de, ate);

  const porMes = new Map<string, MesResumo>();
  // todos os meses do período, inclusive os vazios — mês sem movimento é zero, não buraco
  if (de && ate) {
    let y = Number(de.slice(0, 4)), m = Number(de.slice(5, 7));
    for (let i = 0; i < mesesNoPeriodo; i++) {
      const k = `${y}-${String(m).padStart(2, "0")}`;
      porMes.set(k, { mes: k, entradas: 0, saidas: 0 });
      m += 1; if (m > 12) { m = 1; y += 1; }
    }
  }

  let entradas = 0, saidas = 0, transferencias = 0, valorTransferencias = 0;
  const grupos = new Map<string, FinancialRecord[]>();
  for (const r of report.records) {
    const c = cls.get(r.id);
    if (ehTransferencia(r, c)) { transferencias += 1; valorTransferencias += r.valor; continue; }
    const pm = porMes.get(mesDe(r.data));
    if (r.tipo === "entrada") { entradas += r.valor; if (pm) pm.entradas += r.valor; }
    else { saidas += r.valor; if (pm) pm.saidas += r.valor; }
    const base = r.contraparteNorm || (r.descricao || "").toLowerCase().trim() || "sem identificação";
    const chave = `${r.tipo === "entrada" ? "e" : "s"}:${base}`;
    (grupos.get(chave) ?? grupos.set(chave, []).get(chave)!).push(r);
  }

  const lista: GrupoImportacao[] = [];
  for (const [chave, recs] of Array.from(grupos)) {
    const lado = recs[0].tipo === "entrada" ? "entrada" : "saida";
    const norm = recs[0].contraparteNorm;
    const total = recs.reduce((s, r) => s + r.valor, 0);
    const porMesGrupo = new Map<string, number>();
    for (const r of recs) porMesGrupo.set(mesDe(r.data), (porMesGrupo.get(mesDe(r.data)) ?? 0) + r.valor);
    const meses = porMesGrupo.size;
    const recorrente = ehRecorrente(meses, recs.length, mesesNoPeriodo);
    const fixo = recorrente && coefVar(Array.from(porMesGrupo.values())) <= CV_FIXO;
    const categorias = recs.map((r) => cls.get(r.id)?.categoria ?? (lado === "entrada" ? "Vendas" : "Outras despesas"));
    lista.push({
      chave,
      nome: (norm && nomeDe.get(norm)) || recs[0].contraparte || recs[0].descricao || "Sem identificação",
      lado,
      total: centavos(total),
      ocorrencias: recs.length,
      meses,
      valorMedio: centavos(total / recs.length),
      mediaMensal: centavos(meses ? total / meses : 0),
      diaTipico: mediana(recs.map((r) => diaDe(r.data))),
      categoria: moda(categorias),
      confianca: Math.min(...recs.map((r) => cls.get(r.id)?.confianca ?? 0)),
      recorrente,
      fixo,
      ehPessoa: !!norm && (pessoa.get(norm) ?? true),
      recordIds: recs.map((r) => r.id),
      ultima: recs.map((r) => r.data).sort().pop() ?? "",
    });
  }
  // recorrentes primeiro, depois o maior valor — o que mais pesa no mês
  const ordem = (a: GrupoImportacao, b: GrupoImportacao) =>
    Number(b.recorrente) - Number(a.recorrente) || b.total - a.total;
  const receitas = lista.filter((g) => g.lado === "entrada").sort(ordem);
  const despesas = lista.filter((g) => g.lado === "saida").sort(ordem);

  const soma = (gs: GrupoImportacao[]) => centavos(gs.reduce((s, g) => s + g.mediaMensal, 0));
  return {
    versao: VERSAO_ASSISTENTE,
    resumo: {
      de, ate, mesesNoPeriodo,
      porMes: Array.from(porMes.values()).map((p) => ({ ...p, entradas: centavos(p.entradas), saidas: centavos(p.saidas) })),
      entradas: centavos(entradas),
      saidas: centavos(saidas),
      resultado: centavos(entradas - saidas),
      lancamentos: report.records.length,
      transferencias,
      valorTransferencias: centavos(valorTransferencias),
      custoFixoMensal: soma(despesas.filter((g) => g.fixo)),
      custoVariavelRecorrente: soma(despesas.filter((g) => g.recorrente && !g.fixo)),
      receitaRecorrenteMensal: soma(receitas.filter((g) => g.recorrente)),
    },
    receitas,
    despesas,
  };
}

/** O que a pessoa decidiu para um grupo. */
export interface DecisaoGrupo {
  categoria: string;
  /** cadastrar como cliente (receita) ou fornecedor (despesa) */
  cadastrar: boolean;
  /** criar a regra recorrente (contrato a receber / conta a pagar) */
  recorrente: boolean;
  /** dia do mês do vencimento da recorrência, 1–31 */
  dia: number;
}

export function decisaoPadrao(g: GrupoImportacao): DecisaoGrupo {
  return {
    categoria: g.categoria,
    cadastrar: g.ehPessoa,
    // receita recorrente e despesa FIXA vêm marcadas; a variável a pessoa decide
    recorrente: g.lado === "entrada" ? g.recorrente : g.fixo,
    dia: Math.min(31, Math.max(1, g.diaTipico || 1)),
  };
}

export interface RecorrenciaAPlanejar {
  nome: string;
  tipo: "entrada" | "saida";
  categoria: string;
  valor: number;
  dia: number;
  /** primeira data DEPOIS do último lançamento do arquivo */
  inicio: string;
  /** a contraparte normalizada (para ligar ao cadastro) */
  chave: string;
}

/**
 * A próxima data com o dia pedido depois de `ultimaISO`. ⚠️ Dia 31 num mês de
 * 30 vira o último dia do mês, nunca o 1º do seguinte (adiantaria a cobrança).
 */
export function proximaData(ultimaISO: string, dia: number): string {
  let y = Number(ultimaISO.slice(0, 4));
  let m = Number(ultimaISO.slice(5, 7));
  const d0 = Number(ultimaISO.slice(8, 10));
  const fim = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (Math.min(dia, fim(y, m)) <= d0) { m += 1; if (m > 12) { m = 1; y += 1; } }
  const dd = Math.min(dia, fim(y, m));
  return `${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function destinoDa(lado: "entrada" | "saida", categoria: string): Classificacao["destino"] {
  if (lado === "entrada") return "Receita";
  if (/imposto/i.test(categoria)) return "Imposto";
  if (/^tarifas banc/i.test(categoria)) return "Tarifa bancária";
  return "Despesa";
}

/**
 * Aplica as decisões ao relatório. Devolve o relatório a gravar e as
 * recorrências a criar — nada é escrito aqui.
 *
 * ⚠️ A categoria escolhida vale para TODOS os lançamentos do grupo e sai como
 * confirmada (0,99): foi a pessoa quem disse. E desmarcar "cadastrar" tira o
 * contato da lista de cadastros, mas NÃO tira o lançamento — o dinheiro entrou
 * ou saiu do mesmo jeito; só não vira cliente ou fornecedor.
 */
export function aplicarDecisoes(
  report: FDIPReport,
  grupos: GrupoImportacao[],
  decisoes: Record<string, DecisaoGrupo>,
): { report: FDIPReport; recorrencias: RecorrenciaAPlanejar[] } {
  const porRecord = new Map<string, { g: GrupoImportacao; d: DecisaoGrupo }>();
  for (const g of grupos) {
    const d = decisoes[g.chave];
    if (!d) continue;
    for (const id of g.recordIds) porRecord.set(id, { g, d });
  }

  const classificacoes = report.classificacoes.map((c) => {
    const hit = porRecord.get(c.recordId);
    if (!hit || !hit.d.categoria) return c;
    return {
      ...c,
      categoria: hit.d.categoria,
      destino: destinoDa(hit.g.lado, hit.d.categoria),
      confianca: Math.max(c.confianca, 0.99),
      motivo: hit.d.categoria === c.categoria ? c.motivo : "confirmado na importação",
      aprendido: hit.d.categoria === c.categoria ? c.aprendido : true,
    };
  });

  // contrapartes que a pessoa NÃO quer cadastrar (por chave normalizada)
  const naoCadastrar = new Set<string>();
  const cadastrar = new Map<string, "cliente" | "fornecedor">();
  for (const g of grupos) {
    const d = decisoes[g.chave];
    const norm = g.chave.slice(2);
    if (!d) continue;
    if (d.cadastrar) cadastrar.set(norm, g.lado === "entrada" ? "cliente" : "fornecedor");
    else naoCadastrar.add(norm);
  }
  const entidades = report.entidades
    .filter((e) => cadastrar.has(e.id) || !naoCadastrar.has(e.id))
    .map((e) => (cadastrar.has(e.id) ? { ...e, ehPessoa: true, tipo: cadastrar.get(e.id)! } : e));

  const recorrencias: RecorrenciaAPlanejar[] = grupos
    .filter((g) => decisoes[g.chave]?.recorrente && g.ultima)
    .map((g) => {
      const d = decisoes[g.chave];
      return {
        nome: g.nome,
        tipo: g.lado,
        categoria: d.categoria || g.categoria,
        // o valor de UMA ocorrência por mês: a média mensal do que apareceu
        valor: g.mediaMensal,
        dia: d.dia,
        inicio: proximaData(g.ultima, d.dia),
        chave: g.chave.slice(2),
      };
    });

  return { report: { ...report, classificacoes, entidades }, recorrencias };
}
