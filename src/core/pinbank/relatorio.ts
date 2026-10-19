/**
 * O RELATÓRIO DA MAQUININHA — a página "Maquininha Quattro" (Vender e
 * receber) e o filtro de período do card da Home (pedido do dono, 19/10/2026).
 *
 * Duas fontes, as duas já gravadas pelo sistema, nenhuma chamada à Pinbank:
 *   · a VENDA, como o aviso da Pinbank a deixou (`pinbank_transacoes` + forma,
 *     parcelas e bandeira do último evento) — é dela que saem o vendido, as
 *     formas, as bandeiras, a evolução, o mapa de calor e a aprovação;
 *   · os TÍTULOS que a venda gerou (`movements`, chave
 *     `pinbank:<nsu>:<parcela>:r|t|f|a`) — é deles que saem o custo da
 *     maquininha (taxa, tarifa fixa e antecipação), o líquido e a agenda de
 *     recebíveis. A data do repasse é a do CONTRATO, a mesma que o fluxo de
 *     caixa já usa.
 *
 * ⚠️ O vendido soma só as vendas APROVADAS. Negada, cancelada, desfeita e
 * reembolsada entram na taxa de aprovação e na lista, nunca no dinheiro.
 *
 * ⚠️ A comparação com o período anterior é "até o mesmo ponto": na quarta-feira,
 * a semana atual (seg a qua) é comparada com seg a qua da semana passada, não
 * com a semana passada inteira — senão toda semana começaria "caindo 80%".
 *
 * ⚠️ Sem título no sistema, o custo e o líquido ficam AUSENTES, nunca zero:
 * "a maquininha não custou nada" é uma afirmação que ninguém fez.
 *
 * Datas como `YYYY-MM-DD` (dia de São Paulo, de `diaEHora`); a aritmética de
 * calendário é em UTC sobre a string, nunca no fuso da máquina.
 *
 * Puro, tipado, demo-safe.
 */
import { formaDaTransacao, type FormaPinbank } from "./evento";
import { diaEHora, descreverVenda, type VendaMaquininhaBruta } from "./recentes";

export const RELATORIO_MAQUININHA_VERSION = "pinbank-relatorio/1.0.0";

export type PeriodoMaquininha = "dia" | "semana" | "mes";

export const PERIODOS_MAQUININHA: { id: PeriodoMaquininha; rotulo: string }[] = [
  { id: "dia", rotulo: "Hoje" },
  { id: "semana", rotulo: "Semana" },
  { id: "mes", rotulo: "Mês" },
];

/* ------------------------------ calendário ------------------------------ */

const utc = (dia: string) => new Date(`${dia}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function somaDiasISO(dia: string, n: number): string {
  const d = utc(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** 0 = domingo … 6 = sábado. */
const diaDaSemanaN = (dia: string) => utc(dia).getUTCDay();

const NOMES_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const NOMES_SEMANA_LONGO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "Seg", "Ter"… do dia `YYYY-MM-DD`. */
export const diaDaSemana = (dia: string): string => (dia ? NOMES_SEMANA[diaDaSemanaN(dia)] : "");

/** Segunda-feira da semana do dia (a semana vai de segunda a domingo). */
export function segundaDaSemana(dia: string): string {
  const n = diaDaSemanaN(dia);
  return somaDiasISO(dia, n === 0 ? -6 : 1 - n);
}

const diasNoMes = (ano: number, mes1: number) => new Date(Date.UTC(ano, mes1, 0)).getUTCDate();
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const diasEntre = (de: string, ate: string) => Math.round((utc(ate).getTime() - utc(de).getTime()) / 86_400_000);

export interface JanelaMaquininha {
  periodo: PeriodoMaquininha;
  /** Primeiro dia do período. */
  de: string;
  /** Último dia que JÁ aconteceu (hoje), nunca no futuro. */
  ate: string;
  /** Último dia do período inteiro (domingo, fim do mês) — para desenhar o eixo. */
  fim: string;
  /** "Hoje", "Semana de 13/10 a 19/10", "Outubro de 2026". */
  rotulo: string;
  /** O mesmo trecho do período anterior ("até o mesmo ponto"). */
  anterior: { de: string; ate: string; rotulo: string };
}

export function janelaMaquininha(periodo: PeriodoMaquininha, hoje: string): JanelaMaquininha {
  if (periodo === "dia") {
    const ontem = somaDiasISO(hoje, -1);
    return { periodo, de: hoje, ate: hoje, fim: hoje, rotulo: "Hoje", anterior: { de: ontem, ate: ontem, rotulo: "ontem" } };
  }
  if (periodo === "semana") {
    const de = segundaDaSemana(hoje);
    const fim = somaDiasISO(de, 6);
    const passados = diasEntre(de, hoje);
    const deAnt = somaDiasISO(de, -7);
    return {
      periodo, de, ate: hoje, fim, rotulo: `Semana de ${ddmm(de)} a ${ddmm(fim)}`,
      anterior: { de: deAnt, ate: somaDiasISO(deAnt, passados), rotulo: `a semana passada até ${NOMES_SEMANA_LONGO[diaDaSemanaN(hoje)]}` },
    };
  }
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const de = `${hoje.slice(0, 8)}01`;
  const fim = `${hoje.slice(0, 8)}${String(diasNoMes(ano, mes)).padStart(2, "0")}`;
  const anoAnt = mes === 1 ? ano - 1 : ano;
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const deAnt = `${anoAnt}-${String(mesAnt).padStart(2, "0")}-01`;
  // Dia 31 contra um mês de 30: o anterior para no último dia dele.
  const diaAnt = Math.min(Number(hoje.slice(8, 10)), diasNoMes(anoAnt, mesAnt));
  return {
    periodo, de, ate: hoje, fim, rotulo: `${MESES[mes - 1].charAt(0).toUpperCase()}${MESES[mes - 1].slice(1)} de ${ano}`,
    anterior: { de: deAnt, ate: `${deAnt.slice(0, 8)}${String(diaAnt).padStart(2, "0")}`, rotulo: `${MESES[mesAnt - 1]} até o dia ${diaAnt}` },
  };
}

/* -------------------------------- vendas -------------------------------- */

/** A venda bruta com a maquininha que a passou (vínculo). */
export interface VendaRelatorioBruta extends VendaMaquininhaBruta {
  vinculoId?: string | null;
}

export interface VendaRelatorio {
  nsu: number;
  status: string;
  aprovada: boolean;
  valor: number;
  ocorridoEm: string;
  dia: string;
  hora: string;
  /** "Seg", "Ter"… */
  semana: string;
  forma: FormaPinbank;
  parcelas: number;
  bandeira: string | null;
  descricao: string;
  vinculoId: string | null;
}

export function normalizarVendas(linhas: VendaRelatorioBruta[]): VendaRelatorio[] {
  return linhas
    .filter((l) => Number.isFinite(l.valor) && l.valor >= 0 && !!l.ocorridoEm)
    .map<VendaRelatorio>((l) => {
      const pb = Number(l.numeroParcelas ?? 1);
      const parcelas = Number.isFinite(pb) && pb >= 1 ? Math.floor(pb) : 1;
      const forma = formaDaTransacao(l.formaPagamento ?? null, !!l.ehPix, parcelas);
      const { dia, hora } = diaEHora(l.ocorridoEm);
      const b = (l.bandeira ?? "").trim();
      return {
        nsu: l.nsu, status: l.status, aprovada: l.status === "Aprovada", valor: l.valor, ocorridoEm: l.ocorridoEm,
        dia, hora, semana: diaDaSemana(dia), forma, parcelas,
        bandeira: forma === "pix" || !b ? null : b.charAt(0).toUpperCase() + b.slice(1).toLowerCase(),
        descricao: descreverVenda(forma, parcelas, l.bandeira), vinculoId: l.vinculoId ?? null,
      };
    })
    .filter((v) => !!v.dia)
    .sort((a, b) => (a.ocorridoEm < b.ocorridoEm ? 1 : a.ocorridoEm > b.ocorridoEm ? -1 : b.nsu - a.nsu));
}

const centavos = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;
const somar = (vs: number[]) => reais(vs.reduce((s, v) => s + centavos(v), 0));
const dentro = (dia: string, de: string, ate: string) => dia >= de && dia <= ate;

/* -------------------------------- títulos ------------------------------- */

/** Um título que a venda da maquininha gerou (linha de `movements`). */
export interface TituloMaquininhaBruto {
  chave: string | null;
  type: "entrada" | "saida";
  amount: number;
  due_date: string;
  /** `previsto`, `confirmado`, `baixado`, `conciliado`, `cancelado`, `estornado`. */
  situacao?: string | null;
  status?: string | null;
}

export type PapelTitulo = "receita" | "taxa" | "tarifa" | "antecipacao" | "estorno";

/** Lê a chave `pinbank:<nsu>:<parcela>:<r|t|f|a>` (ou `pinbank:<nsu>:estorno:…`). */
export function lerChaveTitulo(chave: string | null | undefined): { nsu: number; papel: PapelTitulo } | null {
  const m = /^pinbank:(\d+):(?:(\d+):([rtfa])|estorno(?::.*)?)$/.exec(chave ?? "");
  if (!m) return null;
  const nsu = Number(m[1]);
  if (!m[3]) return { nsu, papel: "estorno" };
  const papel = ({ r: "receita", t: "taxa", f: "tarifa", a: "antecipacao" } as const)[m[3] as "r" | "t" | "f" | "a"];
  return { nsu, papel };
}

const MORTO = new Set(["cancelado", "estornado"]);
const LIQUIDADO = new Set(["baixado", "conciliado"]);
const vivo = (t: TituloMaquininhaBruto) => !MORTO.has(t.situacao ?? "") && t.status !== "cancelado";
const pendente = (t: TituloMaquininhaBruto) => vivo(t) && !LIQUIDADO.has(t.situacao ?? "") && t.status !== "pago";

/* ------------------------------- o relatório ----------------------------- */

export const NOME_FORMA_MAQUININHA: Record<FormaPinbank, string> = {
  pix: "Pix", debito: "Débito", credito_vista: "Crédito à vista", parcelado: "Parcelado", voucher: "Voucher", desconhecida: "Outros",
};
const ORDEM_FORMA: FormaPinbank[] = ["pix", "debito", "credito_vista", "parcelado", "voucher", "desconhecida"];

export interface FatiaMaquininha { chave: string; nome: string; valor: number; quantidade: number; fracao: number }
export interface PontoEvolucao { chave: string; label: string; valor: number; quantidade: number; futuro: boolean }
export interface CustoPorForma { forma: FormaPinbank; nome: string; vendido: number; custo: number; percentual: number | null }
export interface DiaAgenda { dia: string; rotulo: string; valor: number; parcelas: number }

export interface RelatorioMaquininha {
  versao: string;
  janela: JanelaMaquininha;
  resumo: {
    vendido: number;
    quantidade: number;
    ticketMedio: number | null;
    vendidoAnterior: number;
    /** Fração; `null` sem base (o anterior não vendeu). */
    variacao: number | null;
    /** Aprovadas ÷ todas as tentativas do período; `null` sem tentativa. */
    aprovacao: number | null;
    tentativas: number;
    recusadas: { status: string; quantidade: number; valor: number }[];
  };
  /** As vendas do período, mais recentes primeiro (todas as situações). */
  vendas: VendaRelatorio[];
  porForma: FatiaMaquininha[];
  porBandeira: FatiaMaquininha[];
  evolucao: PontoEvolucao[];
  /** Mapa de calor: SEMPRE as últimas 4 semanas (um dia sozinho não mostra padrão). */
  calor: { de: string; ate: string; linhas: string[]; colunas: string[]; valores: number[][]; maximo: number };
  porMaquininha: { vinculoId: string; valor: number; quantidade: number; fracao: number }[];
  /** `null` quando nenhuma venda do período tem título no sistema. */
  custos: {
    taxa: number; tarifa: number; antecipacao: number; estornos: number; total: number;
    /** Custo ÷ vendido das vendas com título. */
    percentual: number | null;
    liquido: number;
    vendasComTitulo: number;
    porForma: CustoPorForma[];
  } | null;
  agenda: { dias: DiaAgenda[]; total: number; proximo: DiaAgenda | null; atrasado: number };
}

/** As faixas do mapa de calor (horário comercial e as pontas). */
export const FAIXAS_HORA: { rotulo: string; de: number; ate: number }[] = [
  { rotulo: "0–8h", de: 0, ate: 8 }, { rotulo: "8–10h", de: 8, ate: 10 }, { rotulo: "10–12h", de: 10, ate: 12 },
  { rotulo: "12–14h", de: 12, ate: 14 }, { rotulo: "14–16h", de: 14, ate: 16 }, { rotulo: "16–18h", de: 16, ate: 18 },
  { rotulo: "18–20h", de: 18, ate: 20 }, { rotulo: "20–24h", de: 20, ate: 24 },
];
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

function fatias(grupos: Map<string, { nome: string; valor: number; quantidade: number }>): FatiaMaquininha[] {
  const total = Array.from(grupos.values()).reduce((s, g) => s + centavos(g.valor), 0);
  return Array.from(grupos.entries())
    .map(([chave, g]) => ({ chave, nome: g.nome, valor: g.valor, quantidade: g.quantidade, fracao: total > 0 ? centavos(g.valor) / total : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

function acumular(m: Map<string, { nome: string; valor: number; quantidade: number }>, chave: string, nome: string, valor: number) {
  const g = m.get(chave) ?? { nome, valor: 0, quantidade: 0 };
  g.valor = reais(centavos(g.valor) + centavos(valor));
  g.quantidade += 1;
  m.set(chave, g);
}

export function montarRelatorioMaquininha(
  linhas: VendaRelatorioBruta[],
  titulos: TituloMaquininhaBruto[],
  hoje: string,
  periodo: PeriodoMaquininha,
): RelatorioMaquininha {
  const janela = janelaMaquininha(periodo, hoje);
  const todas = normalizarVendas(linhas);
  const doPeriodo = todas.filter((v) => dentro(v.dia, janela.de, janela.ate));
  const aprovadas = doPeriodo.filter((v) => v.aprovada);
  const vendido = somar(aprovadas.map((v) => v.valor));
  const vendidoAnterior = somar(todas.filter((v) => v.aprovada && dentro(v.dia, janela.anterior.de, janela.anterior.ate)).map((v) => v.valor));

  const recusadasM = new Map<string, { quantidade: number; valor: number }>();
  for (const v of doPeriodo) {
    // A pendente ainda não foi recusada: não entra em "sem aprovação".
    if (v.aprovada || v.status === "Pendente") continue;
    const r = recusadasM.get(v.status) ?? { quantidade: 0, valor: 0 };
    r.quantidade += 1;
    r.valor = reais(centavos(r.valor) + centavos(v.valor));
    recusadasM.set(v.status, r);
  }
  // "Pendente" ainda não é tentativa decidida: fica fora da taxa de aprovação.
  const decididas = doPeriodo.filter((v) => v.status !== "Pendente");

  // Formas e bandeiras.
  const formasM = new Map<string, { nome: string; valor: number; quantidade: number }>();
  const bandM = new Map<string, { nome: string; valor: number; quantidade: number }>();
  const maqM = new Map<string, { nome: string; valor: number; quantidade: number }>();
  for (const v of aprovadas) {
    acumular(formasM, v.forma, NOME_FORMA_MAQUININHA[v.forma], v.valor);
    const b = v.forma === "pix" ? "Pix" : v.bandeira ?? "Não informada";
    acumular(bandM, b.toLowerCase(), b, v.valor);
    acumular(maqM, v.vinculoId ?? "", "", v.valor);
  }
  const porForma = fatias(formasM).sort((a, b) => ORDEM_FORMA.indexOf(a.chave as FormaPinbank) - ORDEM_FORMA.indexOf(b.chave as FormaPinbank));

  // Evolução: por faixa de hora no dia; por dia na semana e no mês (o período INTEIRO, dias futuros vazios).
  const evolucao: PontoEvolucao[] = [];
  if (periodo === "dia") {
    for (let h = 0; h < 24; h += 2) {
      const vs = aprovadas.filter((v) => { const x = Number(v.hora.slice(0, 2)); return x >= h && x < h + 2; });
      evolucao.push({ chave: String(h), label: `${String(h).padStart(2, "0")}h`, valor: somar(vs.map((v) => v.valor)), quantidade: vs.length, futuro: false });
    }
  } else {
    for (let d = janela.de; d <= janela.fim; d = somaDiasISO(d, 1)) {
      const vs = aprovadas.filter((v) => v.dia === d);
      evolucao.push({
        chave: d, label: periodo === "semana" ? `${diaDaSemana(d)} ${d.slice(8, 10)}` : d.slice(8, 10),
        valor: somar(vs.map((v) => v.valor)), quantidade: vs.length, futuro: d > hoje,
      });
    }
  }

  // Mapa de calor: últimas 4 semanas, dia da semana × faixa de hora.
  const calorDe = somaDiasISO(hoje, -27);
  const valores = ORDEM_SEMANA.map(() => FAIXAS_HORA.map(() => 0));
  for (const v of todas) {
    if (!v.aprovada || !dentro(v.dia, calorDe, hoje)) continue;
    const linha = ORDEM_SEMANA.indexOf(diaDaSemanaN(v.dia));
    const h = Number(v.hora.slice(0, 2));
    const col = FAIXAS_HORA.findIndex((f) => h >= f.de && h < f.ate);
    if (linha >= 0 && col >= 0) valores[linha][col] = reais(centavos(valores[linha][col]) + centavos(v.valor));
  }
  const maximo = Math.max(0, ...valores.flat());

  // Títulos: custo e líquido das vendas do período; agenda dos pendentes daqui para a frente.
  const nsusPeriodo = new Map(aprovadas.map((v) => [v.nsu, v]));
  const custoC = { taxa: 0, tarifa: 0, antecipacao: 0, estornos: 0, receita: 0 };
  const comTitulo = new Set<number>();
  const custoForma = new Map<FormaPinbank, number>();
  const agendaM = new Map<string, { valor: number; parcelas: Set<string> }>();
  let atrasadoC = 0;
  for (const t of titulos) {
    const k = lerChaveTitulo(t.chave);
    if (!k || !vivo(t) || !Number.isFinite(t.amount)) continue;
    const c = centavos(Math.abs(t.amount));
    const sinal = t.type === "entrada" ? 1 : -1;
    const venda = nsusPeriodo.get(k.nsu);
    if (venda) {
      comTitulo.add(k.nsu);
      if (k.papel === "receita") custoC.receita += c;
      else {
        const campo = k.papel === "estorno" ? "estornos" : k.papel;
        custoC[campo] += c;
        if (k.papel !== "estorno") custoForma.set(venda.forma, (custoForma.get(venda.forma) ?? 0) + c);
      }
    }
    if (pendente(t) && t.due_date) {
      if (t.due_date < hoje) { atrasadoC += sinal * c; continue; }
      const a = agendaM.get(t.due_date) ?? { valor: 0, parcelas: new Set<string>() };
      a.valor += sinal * c;
      if (k.papel === "receita") a.parcelas.add(t.chave ?? "");
      agendaM.set(t.due_date, a);
    }
  }
  const vendidoComTitulo = somar(aprovadas.filter((v) => comTitulo.has(v.nsu)).map((v) => v.valor));
  const totalCustoC = custoC.taxa + custoC.tarifa + custoC.antecipacao;
  const custos = comTitulo.size === 0 ? null : {
    taxa: reais(custoC.taxa), tarifa: reais(custoC.tarifa), antecipacao: reais(custoC.antecipacao), estornos: reais(custoC.estornos),
    total: reais(totalCustoC),
    percentual: vendidoComTitulo > 0 ? totalCustoC / centavos(vendidoComTitulo) : null,
    liquido: reais(custoC.receita - totalCustoC - custoC.estornos),
    vendasComTitulo: comTitulo.size,
    porForma: ORDEM_FORMA
      .map((f) => {
        const vend = somar(aprovadas.filter((v) => v.forma === f && comTitulo.has(v.nsu)).map((v) => v.valor));
        const custo = custoForma.get(f) ?? 0;
        return { forma: f, nome: NOME_FORMA_MAQUININHA[f], vendido: vend, custo: reais(custo), percentual: vend > 0 ? custo / centavos(vend) : null };
      })
      .filter((x) => x.vendido > 0 || x.custo > 0),
  };

  const dias = Array.from(agendaM.entries())
    .filter(([, a]) => a.valor !== 0)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dia, a]) => ({
      dia, valor: reais(a.valor), parcelas: a.parcelas.size,
      rotulo: dia === hoje ? "Hoje" : dia === somaDiasISO(hoje, 1) ? "Amanhã" : `${diaDaSemana(dia)}, ${ddmm(dia)}`,
    }));

  return {
    versao: RELATORIO_MAQUININHA_VERSION,
    janela,
    resumo: {
      vendido, quantidade: aprovadas.length,
      ticketMedio: aprovadas.length > 0 ? reais(Math.round(centavos(vendido) / aprovadas.length)) : null,
      vendidoAnterior,
      variacao: vendidoAnterior > 0 ? (vendido - vendidoAnterior) / vendidoAnterior : null,
      aprovacao: decididas.length > 0 ? aprovadas.length / decididas.length : null,
      tentativas: decididas.length,
      recusadas: Array.from(recusadasM.entries()).map(([status, r]) => ({ status, ...r })).sort((a, b) => b.quantidade - a.quantidade),
    },
    vendas: doPeriodo,
    porForma,
    porBandeira: fatias(bandM),
    evolucao,
    calor: {
      de: calorDe, ate: hoje,
      linhas: ORDEM_SEMANA.map((n) => NOMES_SEMANA[n]),
      colunas: FAIXAS_HORA.map((f) => f.rotulo),
      valores, maximo,
    },
    porMaquininha: fatias(maqM).map((f) => ({ vinculoId: f.chave, valor: f.valor, quantidade: f.quantidade, fracao: f.fracao })),
    custos,
    agenda: {
      dias: dias.slice(0, 30),
      total: somar(dias.map((d) => d.valor)),
      proximo: dias[0] ?? null,
      atrasado: reais(atrasadoC),
    },
  };
}

/** O nome do arquivo da planilha: o período em ISO (barra é ilegal em nome de arquivo, e o ISO ordena na pasta). */
export function nomeArquivoMaquininha(r: RelatorioMaquininha): string {
  const j = r.janela;
  return j.de === j.ate ? `maquininha-${j.de}` : ["maquininha", j.de, "a", j.ate].join("-");
}

/** As linhas da planilha do período (uma venda por linha, todas as situações). */
export function linhasPlanilhaMaquininha(r: RelatorioMaquininha, nomeMaquininha: (id: string | null) => string): (string | number)[][] {
  return [
    ["Data", "Dia da semana", "Hora", "NSU", "Forma", "Parcelas", "Bandeira", "Situação", "Valor (R$)", "Maquininha"],
    ...[...r.vendas].reverse().map((v) => [
      `${v.dia.slice(8, 10)}/${v.dia.slice(5, 7)}/${v.dia.slice(0, 4)}`, v.semana, v.hora, v.nsu, NOME_FORMA_MAQUININHA[v.forma], v.parcelas,
      v.bandeira ?? (v.forma === "pix" ? "Pix" : ""), v.status, v.valor, nomeMaquininha(v.vinculoId),
    ]),
  ];
}

/* ---------------------------- demonstração ---------------------------- */

/**
 * Os títulos que as vendas de EXEMPLO gerariam, com um contrato típico
 * (Pix D0 0,99% · débito D+1 1,49% + R$ 1 · crédito D+30 2,99% + R$ 1 ·
 * parcelado 3,99% + R$ 1, uma parcela por mês). Só a demonstração usa:
 * em produção os títulos vêm do banco, gravados pelo `pinbank_aplicar`.
 * Antes de hoje é "baixado"; de hoje em diante, "previsto".
 */
export function planejarTitulosDemo(linhas: VendaRelatorioBruta[], hoje?: string): TituloMaquininhaBruto[] {
  const contrato: Record<FormaPinbank, { taxa: number; tarifa: number; prazo: number }> = {
    pix: { taxa: 0.0099, tarifa: 0, prazo: 0 },
    debito: { taxa: 0.0149, tarifa: 1, prazo: 1 },
    credito_vista: { taxa: 0.0299, tarifa: 1, prazo: 30 },
    parcelado: { taxa: 0.0399, tarifa: 1, prazo: 30 },
    voucher: { taxa: 0.0399, tarifa: 0, prazo: 30 },
    desconhecida: { taxa: 0.0299, tarifa: 0, prazo: 30 },
  };
  const out: TituloMaquininhaBruto[] = [];
  for (const v of normalizarVendas(linhas)) {
    if (!v.aprovada) continue;
    const c = contrato[v.forma];
    const n = v.forma === "parcelado" ? v.parcelas : 1;
    const totalC = centavos(v.valor);
    const parteC = Math.floor(totalC / n);
    for (let k = 1; k <= n; k++) {
      const brutoC = k === n ? totalC - parteC * (n - 1) : parteC;
      const vence = somaDiasISO(v.dia, c.prazo + 30 * (k - 1));
      const situacao = hoje && vence < hoje ? "baixado" : "previsto";
      const base = { due_date: vence, situacao };
      out.push({ ...base, chave: `pinbank:${v.nsu}:${k}:r`, type: "entrada", amount: reais(brutoC) });
      out.push({ ...base, chave: `pinbank:${v.nsu}:${k}:t`, type: "saida", amount: reais(Math.round(brutoC * c.taxa)) });
      if (c.tarifa && k === 1) out.push({ ...base, chave: `pinbank:${v.nsu}:${k}:f`, type: "saida", amount: c.tarifa });
    }
  }
  return out;
}
