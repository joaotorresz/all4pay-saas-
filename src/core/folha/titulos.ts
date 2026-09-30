/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS TÍTULOS QUE A FOLHA JÁ AGENDOU — e o que acontece com eles depois.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O cadastro de um colaborador agenda até doze competências de uma vez
 * (salário, FGTS e DARF de cada mês, mais o 13º). Esses títulos passam a morar
 * no contas a pagar por conta própria. Dois eventos da vida do contrato mudam
 * o que eles significam:
 *
 *  - **a RESCISÃO** encerra o contrato: os salários dos meses seguintes deixam
 *    de existir, e o salário do mês do desligamento e o 13º do ano viram verba
 *    da própria rescisão (saldo de salário, 13º proporcional). Sem retirá-los, o
 *    caixa carregava até doze salários de quem já saiu — e pagava o 13º duas
 *    vezes, uma no dia 30/11 e outra dentro da rescisão.
 *  - **as FÉRIAS com adiantamento do 13º**: a 1ª parcela sai junto com as
 *    férias, e a parcela de 30/11 já agendada passa a ser o mesmo dinheiro.
 *
 * ⚠️ **O título é reconhecido pela DESCRIÇÃO que o próprio motor escreve** —
 * `Salário 09/2026 · Ana Souza`. É uma chave de texto, e isso é uma limitação
 * DECLARADA: o escritor único (`criarTitulos`) ainda não grava
 * `reference_code`, e sem ele o título que o banco batizou com um uuid só é
 * encontrável pelo que está escrito nele. Por isso a regra é estreita — casa o
 * formato EXATO do motor, o nome EXATO do colaborador e só título PREVISTO —, e
 * a tela mostra a lista ANTES de confirmar. Título digitado à mão, pago ou de
 * outro colaborador nunca entra.
 *
 * Puro, sem I/O e sem relógio.
 */
import type { Colaborador, TituloFolha, TipoTituloFolha } from "./index";
import type { CalculoRescisao, EntradaRescisao } from "./rescisao";
import type { CalculoFerias } from "./ferias";
import { vencimentoDARF } from "./calendario";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** O que a descrição de um título da folha diz sobre ele. */
export interface TituloLido {
  tipo: TipoTituloFolha;
  colaborador: string;
  /** "YYYY-MM" — o mês de trabalho a que o título se refere. */
  competencia: string;
  /** Título do 13º (parcela ou encargo) — pertence ao ANO, não ao mês. */
  doDecimo: boolean;
  /** Só na 1ª parcela do 13º. */
  primeiraParcela: boolean;
}

const mesAnterior = (iso: string): string => {
  const [a, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const MENSAIS: [RegExp, TipoTituloFolha][] = [
  [/^Salário/, "salario"],
  [/^FGTS/, "fgts"],
  [/^INSS e IRRF/, "darf"],
  [/^Nota/, "nota"],
  [/^Pensão alimentícia/, "pensao"],
  [/^Retenções da nota/, "retencao"],
];

/**
 * Lê a descrição de um título da folha, nos DOIS formatos:
 *  - o atual, com a competência escrita (`Salário 09/2026 · Ana`);
 *  - o anterior, sem ela (`Salário · Ana`) — a competência é deduzida do
 *    vencimento, que o motor sempre pôs no mês SEGUINTE ao do trabalho.
 *
 * Devolve `null` para qualquer texto que não seja exatamente o do motor.
 */
export function lerTituloDaFolha(descricao: string, vencimento: string): TituloLido | null {
  const d = (descricao ?? "").trim();
  const partes = d.split(" · ");
  if (partes.length < 2) return null;
  const colaborador = partes[partes.length - 1].trim();
  if (!colaborador) return null;
  const cabeca = partes[0];

  // ---- o 13º: parcelas e encargos, do ano ----
  const dec = /^(FGTS do |INSS do |IRRF do )?13º(?: (\d{4}))?(?: \(\d{1,2}\/12\))?$/.exec(cabeca);
  if (dec) {
    const ano = dec[2] ?? (vencimento ?? "").slice(0, 4);
    if (!/^\d{4}$/.test(ano)) return null;
    const parcela = partes.length === 3 ? partes[1] : "";
    if (partes.length === 3 && !/^[12]ª parcela$/.test(parcela)) return null;
    if (!dec[1] && !parcela) return null;
    const tipo: TipoTituloFolha = !dec[1] ? "decimo" : dec[1] === "FGTS do " ? "fgts" : "darf";
    return { tipo, colaborador, competencia: `${ano}-12`, doDecimo: true, primeiraParcela: !dec[1] && parcela === "1ª parcela" };
  }
  if (partes.length !== 2) return null;

  // ---- os mensais ----
  for (const [re, tipo] of MENSAIS) {
    if (!re.test(cabeca)) continue;
    const resto = cabeca.replace(re, "").trim();
    if (resto === "") {
      // Formato anterior: sem competência. O motor pôs o vencimento no mês
      // seguinte ao do trabalho (retenção: dois meses depois — não existia).
      if (!/^\d{4}-\d{2}/.test(vencimento ?? "")) return null;
      return { tipo, colaborador, competencia: mesAnterior(vencimento.slice(0, 7)), doDecimo: false, primeiraParcela: false };
    }
    const m = /^(\d{2})\/(\d{4})$/.exec(resto);
    if (!m) return null;
    return { tipo, colaborador, competencia: `${m[2]}-${m[1]}`, doDecimo: false, primeiraParcela: false };
  }
  return null;
}

/** O mínimo de um lançamento que a busca precisa — casa com `RiskMovement`. */
export interface LancamentoDaFolha {
  id: string;
  type: string;
  status: string;
  amount: number;
  due_date: string;
  descricao?: string | null;
  accountId?: string | null;
}

/**
 * A conta de onde a folha deste colaborador já sai — a do título de salário
 * (ou nota) mais recente. É a conta natural para agendar a rescisão e as
 * férias; sem ela a tela caía na PRIMEIRA conta da lista, que pode ser outra.
 */
export function contaDoColaborador(lancamentos: readonly LancamentoDaFolha[], colaborador: string): string | null {
  let melhor: { due: string; conta: string } | null = null;
  for (const m of lancamentos) {
    if (m.type !== "saida" || !m.accountId) continue;
    const t = lerTituloDaFolha(m.descricao ?? "", m.due_date);
    if (!t || t.colaborador !== colaborador || (t.tipo !== "salario" && t.tipo !== "nota")) continue;
    if (!melhor || m.due_date > melhor.due) melhor = { due: m.due_date, conta: m.accountId };
  }
  return melhor?.conta ?? null;
}

/**
 * Os salários PREVISTOS que cobrem os dias das férias — o que a tela avisa.
 *
 * ⚠️ Não são retirados sozinhos: as férias pagam ADIANTADO os dias de descanso,
 * e o salário do mês continua devido pelos dias trabalhados. Quanto dele sai
 * depende de quantos dias caem em cada mês, e a tela mostra os títulos para a
 * pessoa ajustá-los — adivinhar o valor seria pior que dizer onde olhar.
 */
export function salariosDoPeriodoDeFerias(
  lancamentos: readonly LancamentoDaFolha[], colaborador: string, inicio: string, retorno: string,
): LancamentoDaFolha[] {
  if (!inicio || !retorno) return [];
  const de = inicio.slice(0, 7);
  // O retorno é o dia de VOLTA: o último dia de descanso é a véspera.
  const [a, m, d] = retorno.split("-").map(Number);
  const vespera = new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 7);
  return lancamentos.filter((x) => {
    if (x.type !== "saida" || x.status !== "pendente") return false;
    const t = lerTituloDaFolha(x.descricao ?? "", x.due_date);
    return !!t && t.colaborador === colaborador && t.tipo === "salario"
      && t.competencia >= de && t.competencia <= vespera;
  });
}

/**
 * Os títulos PREVISTOS que a rescisão substitui.
 *
 * ⚠️ A partir do MÊS DO DESLIGAMENTO, inclusive: o salário desse mês vira
 * "saldo de salário" dentro da rescisão, e o FGTS/DARF dele vira o FGTS e o
 * DARF das verbas rescisórias. E o 13º do ano vira "13º proporcional". Tudo o
 * que já foi PAGO fica — dinheiro que saiu não se desfaz retirando o título.
 */
export function titulosSubstituidosNaRescisao(
  lancamentos: readonly LancamentoDaFolha[], colaborador: string, desligamento: string,
): LancamentoDaFolha[] {
  const mes = desligamento.slice(0, 7);
  const ano = desligamento.slice(0, 4);
  return lancamentos.filter((m) => {
    if (m.type !== "saida" || m.status !== "pendente") return false;
    const t = lerTituloDaFolha(m.descricao ?? "", m.due_date);
    if (!t || t.colaborador !== colaborador) return false;
    return t.doDecimo ? t.competencia.slice(0, 4) === ano : t.competencia >= mes;
  });
}

/**
 * A 1ª parcela do 13º que as férias com adiantamento substituem — a do ano do
 * pagamento das férias, ainda prevista.
 */
export function primeiraParcelaSubstituida(
  lancamentos: readonly LancamentoDaFolha[], colaborador: string, pagamentoDasFerias: string,
): LancamentoDaFolha[] {
  const ano = pagamentoDasFerias.slice(0, 4);
  return lancamentos.filter((m) => {
    if (m.type !== "saida" || m.status !== "pendente") return false;
    const t = lerTituloDaFolha(m.descricao ?? "", m.due_date);
    return !!t && t.colaborador === colaborador && t.primeiraParcela && t.competencia.slice(0, 4) === ano;
  });
}

/**
 * Os títulos da RESCISÃO — o líquido ao funcionário E o que a empresa recolhe.
 *
 * ⚠️ A tela mostrava "Custo total da rescisão" com FGTS e patronal dentro, e
 * agendava só o líquido e a multa. O FGTS sobre as verbas (recolhido junto com
 * a rescisão, no mesmo prazo de dez dias) e o DARF do INSS/IRRF retidos e do
 * patronal (dia 20 do mês seguinte) não apareciam em lugar nenhum do caixa.
 */
export function titulosDaRescisao(
  c: Colaborador, e: EntradaRescisao, calc: CalculoRescisao, rotuloModalidade: string,
): TituloFolha[] {
  if (!e.desligamento || calc.problemas.length > 0) return [];
  const competencia = e.desligamento.slice(0, 7);
  const base = { colaboradorId: c.id, colaborador: c.nome, competencia };
  const titulos: TituloFolha[] = [];
  if (calc.liquido > 0) {
    titulos.push({
      ...base, tipo: "rescisao",
      descricao: `Rescisão · ${c.nome} · ${rotuloModalidade}`,
      valor: calc.liquido, vencimento: calc.vencimento, categoria: "Folha de pagamento",
    });
  }
  // ⚠️ A MULTA É UM TÍTULO SEPARADO: ela é depositada na conta vinculada do
  // FGTS, não paga ao funcionário — somá-la ao líquido pagaria ao empregado
  // dinheiro que é do fundo.
  if (calc.multaFGTS > 0) {
    titulos.push({
      ...base, tipo: "multa_fgts",
      descricao: `Multa do FGTS · ${c.nome}`,
      valor: calc.multaFGTS, vencimento: calc.vencimento, categoria: "Encargos sobre a folha",
    });
  }
  if (calc.fgtsSobreVerbas > 0) {
    titulos.push({
      ...base, tipo: "fgts",
      descricao: `FGTS da rescisão · ${c.nome}`,
      valor: calc.fgtsSobreVerbas, vencimento: calc.vencimento, categoria: "Encargos sobre a folha",
    });
  }
  const darf = round2(calc.inss + calc.irrf + calc.patronal);
  if (darf > 0) {
    titulos.push({
      ...base, tipo: "darf",
      descricao: `INSS e IRRF da rescisão · ${c.nome}`,
      valor: darf, vencimento: vencimentoDARF(competencia), categoria: "Encargos sobre a folha",
    });
  }
  return titulos;
}

/** O título das FÉRIAS — o líquido, dois dias antes do início. */
export function titulosDasFerias(c: Colaborador, inicio: string, diasGozados: number, calc: CalculoFerias): TituloFolha[] {
  if (!inicio || calc.problemas.length > 0 || !(calc.liquido > 0)) return [];
  return [{
    colaboradorId: c.id, colaborador: c.nome, competencia: inicio.slice(0, 7), tipo: "ferias",
    descricao: `Férias · ${c.nome} · ${diasGozados} dias`,
    valor: calc.liquido, vencimento: calc.vencimento, categoria: "Folha de pagamento",
  }];
}

/**
 * A DATA DE COMPETÊNCIA de um título da folha: o ÚLTIMO dia do mês de trabalho.
 *
 * ⚠️ Não é o vencimento. O salário de setembro vence em outubro, e gravá-lo com
 * competência de outubro põe a despesa de pessoal de setembro no DRE de
 * outubro — setembro fica sem folha e outubro com duas. O 13º é de dezembro, a
 * rescisão é do mês do desligamento, as férias do mês em que começam.
 */
export function competenciaDoTitulo(t: Pick<TituloFolha, "competencia">): string {
  const [a, m] = t.competencia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${t.competencia}-${String(ultimo).padStart(2, "0")}`;
}
