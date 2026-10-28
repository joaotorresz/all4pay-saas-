/**
 * A OFERTA DA MAQUININHA QUATTRO — as contas da página que convida quem ainda
 * não tem maquininha a pedir uma (pedido do dono, 26/10/2026), e os
 * simuladores da página de quem já tem.
 *
 * Puro, tipado, sem I/O e sem relógio (`hoje` vem de fora). As TAXAS não moram
 * aqui: chegam por `TaxaDe`, montada pela tela a partir da tabela de referência
 * do simulador da maquininha (`lib/pos-taxas`) — uma segunda tabela divergiria
 * da primeira no primeiro ajuste de spread.
 *
 * ⚠️ São taxas de REFERÊNCIA do segmento, não o contrato: a proposta final sai
 * na análise do pedido. A tela diz isso ao lado de todo número que sai daqui.
 *
 * ⚠️ A antecipação segue a regra ÚNICA de `core/vendas/pos`
 * (`fracaoDeAntecipacao`), a mesma que lança o custo da venda da Pinbank.
 */
import { dividir, fracaoDeAntecipacao } from "@/core/vendas/pos";

export const OFERTA_VERSION = "maquininha-oferta/1.5.0";

export type FormaOferta = "pix" | "debito" | "credito" | "parcelado";

/** A taxa (fração do valor) da forma, para o número de parcelas; `null` = a tabela não tem. */
export type TaxaDe = (forma: FormaOferta, parcelas: number, antecipado: boolean) => number | null;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** `iso` + `n` dias, fatiando a string (nunca o fuso local). */
export function somaDias(iso: string, n: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Quantas parcelas a forma usa de fato: Pix e débito 0, crédito à vista 1, parcelado 2 a 21. */
export function parcelasDaForma(forma: FormaOferta, parcelas: number): number {
  if (forma === "pix" || forma === "debito") return 0;
  if (forma === "credito") return 1;
  return Math.max(2, Math.min(21, Math.floor(parcelas || 2)));
}

/* ------------------------------ uma venda ------------------------------ */

export interface EntradaVenda {
  valor: number;
  forma: FormaOferta;
  parcelas: number;
  /** Receber tudo no dia seguinte (crédito e parcelado). Pix e débito ignoram. */
  antecipar: boolean;
}

export interface RecebimentoSimulado { data: string; valor: number; rotulo: string }

export interface VendaSimulada {
  valor: number;
  /** Fração cobrada (MDR + antecipação, quando houver). `null` = sem taxa na tabela. */
  taxa: number | null;
  custo: number;
  liquido: number;
  /** Quando o dinheiro cai, já descontado. */
  recebimentos: RecebimentoSimulado[];
  /** "no mesmo dia" · "no dia seguinte" · "em 3 parcelas, a cada 30 dias". */
  prazo: string;
  antecipado: boolean;
}

/**
 * Simula UMA venda: quanto a maquininha cobra, quanto sobra e quando cai.
 * Pix cai no mesmo dia e débito no dia seguinte; crédito sem antecipar cai em
 * 30 dias por parcela; antecipado, tudo no dia seguinte.
 */
export function simularVenda(e: EntradaVenda, taxaDe: TaxaDe, hoje: string): VendaSimulada {
  const valor = Math.max(0, r2(e.valor || 0));
  const n = parcelasDaForma(e.forma, e.parcelas);
  const antecipado = n > 0 && e.antecipar;
  const taxa = taxaDe(e.forma, n, antecipado);
  const custo = taxa == null ? 0 : r2(valor * taxa);
  const liquido = r2(valor - custo);
  let recebimentos: RecebimentoSimulado[];
  let prazo: string;
  if (e.forma === "pix") {
    recebimentos = [{ data: hoje, valor: liquido, rotulo: "no mesmo dia" }];
    prazo = "no mesmo dia";
  } else if (e.forma === "debito" || antecipado) {
    recebimentos = [{ data: somaDias(hoje, 1), valor: liquido, rotulo: "no dia seguinte" }];
    prazo = "no dia seguinte";
  } else {
    recebimentos = dividir(liquido, n).map((v, i) => ({ data: somaDias(hoje, 30 * (i + 1)), valor: v, rotulo: `parcela ${i + 1} de ${n}` }));
    prazo = n === 1 ? "em 30 dias" : `em ${n} parcelas, a cada 30 dias`;
  }
  return { valor, taxa, custo, liquido, recebimentos, prazo, antecipado };
}

/* ------------------------------ a comparação ------------------------------ */

/** Como as vendas do mês se dividem (frações; o que faltar para 1 vira crédito à vista). */
export interface MixVendas { pix: number; debito: number; credito: number; parcelado: number }

/** A taxa de cada forma (fração). `null`/ausente = quem simula não sabe. */
export type TaxasPorForma = Partial<Record<FormaOferta, number | null>>;

export interface EntradaComparacao {
  /** Quanto passa na maquininha por mês. */
  volumeMensal: number;
  mix: MixVendas;
  /** Parcelas médias do parcelado. */
  parcelasMedias: number;
  /**
   * O que a empresa paga hoje, POR FORMA (já completadas por
   * `completarTaxasAtuais`). ⚠️ Uma taxa média única saiu (pedido do dono,
   * 28/10/2026): ninguém sabe a própria "média", e débito a 1,5% com crédito
   * a 4% não vira um número só sem saber o mix.
   */
  taxasAtuais: TaxasPorForma;
  /**
   * A maquininha de hoje já paga tudo no dia seguinte? Então a taxa dela
   * inclui a antecipação, e a Quattro é comparada ANTECIPADA também —
   * comparar a taxa antecipada de lá com a de prazo normal daqui seria vender
   * uma economia que não existe.
   */
  antecipado?: boolean;
}

export type OrigemTaxa = "informada" | "estimada";

export interface TaxaAtualCompleta { taxa: number; origem: OrigemTaxa }

/**
 * Completa as taxas que a pessoa NÃO sabe com uma estimativa de mercado
 * (pedido do dono, 28/10/2026: "caso o cliente não saiba, sugira uma taxa
 * baseada no mercado, com as taxas que ele inseriu"). A estimativa parte da
 * referência de mercado e é ajustada pela razão média entre o que a pessoa
 * DIGITOU e o mercado: quem paga débito abaixo do mercado provavelmente paga
 * crédito abaixo também. Sem nada digitado, vale o mercado puro. A razão fica
 * entre 0,5 e 2 — um débito digitado errado não pode fazer o crédito
 * estimado sair absurdo.
 */
export function completarTaxasAtuais(informadas: TaxasPorForma, mercado: Record<FormaOferta, number>): Record<FormaOferta, TaxaAtualCompleta> {
  const formas: FormaOferta[] = ["pix", "debito", "credito", "parcelado"];
  const ok = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 1;
  const razoes = formas.filter((f) => ok(informadas[f]) && mercado[f] > 0).map((f) => (informadas[f] as number) / mercado[f]);
  const razao = razoes.length ? Math.max(0.5, Math.min(2, razoes.reduce((a, b) => a + b, 0) / razoes.length)) : 1;
  const out = {} as Record<FormaOferta, TaxaAtualCompleta>;
  for (const f of formas) {
    const v = informadas[f];
    out[f] = ok(v) ? { taxa: v, origem: "informada" } : { taxa: Math.round(mercado[f] * razao * 10_000) / 10_000, origem: "estimada" };
  }
  return out;
}

export type VereditoComparacao = "sem_volume" | "quattro_mais_barata" | "atual_mais_barata" | "empate";

export interface Comparacao {
  /** Taxa média ponderada da Quattro sobre o mix (sem antecipação). */
  taxaQuattro: number;
  custoQuattro: number;
  custoAtual: number;
  /** custoAtual − custoQuattro, no mês. Positivo = a Quattro sai mais barata. */
  diferencaMensal: number;
  diferencaAnual: number;
  /** A frase que a tela mostra no lugar de pintar o número. */
  frase: string;
  /** Quem sai mais barato — decide se a tela oferece a economia ou o consultor. */
  veredito: VereditoComparacao;
  /** Cada forma com a taxa e o custo dela no mês, nas duas maquininhas. */
  porForma: { forma: FormaOferta; nome: string; fracao: number; taxa: number | null; custo: number; taxaAtual: number; custoAtual: number }[];
}

export const NOME_FORMA: Record<FormaOferta, string> = {
  pix: "Pix", debito: "Débito", credito: "Crédito à vista", parcelado: "Parcelado",
};

/** O mix com as frações limitadas a [0,1] e somando 1 (a sobra vai para o crédito à vista). */
export function normalizarMix(mix: MixVendas): MixVendas {
  const c = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
  let pix = c(mix.pix), debito = c(mix.debito), parcelado = c(mix.parcelado);
  const soma = pix + debito + parcelado;
  if (soma > 1) { pix /= soma; debito /= soma; parcelado /= soma; }
  const credito = Math.max(0, 1 - pix - debito - parcelado);
  return { pix, debito, credito, parcelado };
}

/* ------------------------- a margem por faixa ------------------------- */

/** Uma faixa de faturamento mensal e a margem da Quattro sobre ele. `ate: null` = sem teto. */
export interface FaixaDeMargem { ate: number | null; margem: number }

/**
 * A margem da faixa em que o faturamento cai. Fronteira FECHADA em cima:
 * R$ 10.000,00 ainda é a primeira faixa. Faturamento ausente, zero ou
 * inválido fica na PRIMEIRA (quem não disse quanto vende é tratado como o
 * menor), e faixas fora de ordem são ordenadas antes.
 */
export function margemDaFaixa(volumeMensal: number, faixas: readonly FaixaDeMargem[]): number {
  if (!faixas.length) return 0;
  const ord = [...faixas].sort((a, b) => (a.ate ?? Infinity) - (b.ate ?? Infinity));
  const v = Number.isFinite(volumeMensal) && volumeMensal > 0 ? volumeMensal : 0;
  return (ord.find((f) => f.ate == null || v <= f.ate) ?? ord[ord.length - 1]).margem;
}

/**
 * Quanto cada forma sobe sobre o custo para a MÉDIA do mix render a margem
 * (decisão do dono, 28/10/2026: "margem média sobre o mix", cheia).
 *
 * Pix e débito ficam no custo; crédito e parcelado carregam a margem, o
 * mesmo acréscimo nos dois. ⚠️ Com pouco crédito no mix o acréscimo
 * explodiria (10% de crédito × 1,5% = 15 pontos), então ele para em `teto`
 * e o que faltar se reparte igual entre Pix e débito — a média continua
 * sendo a margem. Sem crédito nem parcelado, a margem vai inteira em Pix e
 * débito. Invariante: Σ mix × acréscimo = margem.
 */
export function acrescimosDaMargem(margem: number, mix: MixVendas, teto: number): Record<FormaOferta, number> {
  const m = Number.isFinite(margem) && margem > 0 ? margem : 0;
  const x = normalizarMix(mix);
  const cartao = x.credito + x.parcelado;
  const avista = x.pix + x.debito;
  const a = cartao > 0 ? (avista > 0 ? Math.min(m / cartao, Math.max(0, teto)) : m / cartao) : 0;
  const b = avista > 0 ? (m - a * cartao) / avista : 0;
  return { pix: b, debito: b, credito: a, parcelado: a };
}

/**
 * Quanto a maquininha Quattro custaria por mês contra o que a empresa paga
 * hoje, sobre o MESMO volume e o mesmo mix. ⚠️ A diferença sai com SINAL e a
 * frase diz a direção: quando a taxa atual é menor, a página diz isso — vender
 * a maquininha escondendo a conta é o tipo de número que o cliente confere
 * depois e não perdoa.
 */
export function compararTaxas(e: EntradaComparacao, taxaDe: TaxaDe): Comparacao {
  const volume = Math.max(0, e.volumeMensal || 0);
  const mix = normalizarMix(e.mix);
  const formas: FormaOferta[] = ["pix", "debito", "credito", "parcelado"];
  const porForma = formas.map((forma) => {
    const n = parcelasDaForma(forma, e.parcelasMedias);
    const taxa = taxaDe(forma, n, !!e.antecipado && n > 0);
    const fracao = mix[forma];
    const taxaAtual = Math.max(0, e.taxasAtuais[forma] ?? 0);
    return {
      forma, nome: NOME_FORMA[forma], fracao, taxa, custo: r2(volume * fracao * (taxa ?? 0)),
      taxaAtual, custoAtual: r2(volume * fracao * taxaAtual),
    };
  });
  const custoQuattro = r2(porForma.reduce((s, f) => s + f.custo, 0));
  const taxaQuattro = volume > 0 ? custoQuattro / volume : porForma.reduce((s, f) => s + f.fracao * (f.taxa ?? 0), 0);
  const custoAtual = r2(porForma.reduce((s, f) => s + f.custoAtual, 0));
  const diferencaMensal = r2(custoAtual - custoQuattro);
  const diferencaAnual = r2(diferencaMensal * 12);
  const veredito: VereditoComparacao = volume === 0
    ? "sem_volume"
    : Math.abs(diferencaMensal) < 0.005 ? "empate" : diferencaMensal > 0 ? "quattro_mais_barata" : "atual_mais_barata";
  const frase = {
    sem_volume: "Informe quanto passa na maquininha por mês para comparar.",
    empate: "Com este volume e este mix, o custo é o mesmo nas duas.",
    quattro_mais_barata: "A Quattro sai mais barata com este volume e este mix.",
    atual_mais_barata: "As suas taxas de hoje são menores com este volume e este mix. Um consultor da Quattro pode analisar o seu faturamento e montar uma proposta.",
  }[veredito];
  return { taxaQuattro, custoQuattro, custoAtual, diferencaMensal, diferencaAnual, frase, veredito, porForma };
}

/* --------------------- quem paga a taxa: você ou o cliente --------------------- */

export interface VendaComRepasse {
  /** O preço do produto: o que o estabelecimento quer receber. */
  valorDesejado: number;
  /** O que o cliente paga no total, com a taxa repassada. */
  total: number;
  /** Em quantas vezes o cliente paga (1 no Pix, no débito e no crédito à vista). */
  vezes: number;
  /** Cada parcela do cliente. A última leva o resto dos centavos. */
  parcelas: number[];
  /** O que o cliente paga a mais (total − preço). */
  juros: number;
  /** Os juros sobre o preço (fração). */
  jurosFracao: number;
  /** A venda do lado do estabelecimento, sobre o total cobrado. */
  venda: VendaSimulada;
}

/**
 * A venda com a TAXA REPASSADA AO CLIENTE (pedido do dono, 28/10/2026 — a
 * modalidade em que o cliente paga os juros): cobra-se o valor que, depois da
 * taxa (e da antecipação, quando ligada), deixa ao estabelecimento EXATAMENTE
 * o preço do produto. A conta é a de `precoParaReceber` (arredonda para cima:
 * o estabelecimento nunca recebe um centavo a menos), e a venda do lado dele
 * passa pelo MESMO `simularVenda` — duas contas de taxa divergiriam.
 * `null` quando a forma não tem taxa na tabela.
 */
export function simularRepasse(e: EntradaVenda, taxaDe: TaxaDe, hoje: string): VendaComRepasse | null {
  const valorDesejado = Math.max(0, r2(e.valor || 0));
  const n = parcelasDaForma(e.forma, e.parcelas);
  const taxa = taxaDe(e.forma, n, n > 0 && e.antecipar);
  if (taxa == null) return null;
  const total = precoParaReceber(valorDesejado, taxa);
  if (total == null) return null;
  const venda = simularVenda({ ...e, valor: total }, taxaDe, hoje);
  const vezes = Math.max(1, n);
  const juros = r2(total - valorDesejado);
  return {
    valorDesejado, total, vezes, parcelas: dividir(total, vezes), juros,
    jurosFracao: valorDesejado > 0 ? juros / valorDesejado : 0, venda,
  };
}

/* ------------------------------ quem já tem ------------------------------ */

/**
 * Quanto cobrar para receber `liquido` livre de taxa: o valor que, descontada a
 * taxa, sobra exatamente o que a pessoa quer receber. `null` quando a taxa é
 * 100% ou mais (nenhum preço resolve).
 */
export function precoParaReceber(liquido: number, taxa: number): number | null {
  if (!(taxa >= 0) || taxa >= 1) return null;
  const alvo = Math.max(0, liquido || 0);
  // Arredonda para CIMA no centavo: arredondar para baixo deixaria a pessoa
  // receber um centavo a menos do que pediu.
  return Math.ceil((alvo / (1 - taxa)) * 100 - 1e-6) / 100;
}

export interface RepasseFuturo { dia: string; valor: number }

export interface AntecipacaoSimulada {
  /** Repasses incluídos (até `ateDias` dias à frente). */
  quantidade: number;
  bruto: number;
  custo: number;
  liquidoHoje: number;
  /** O custo como fração do bruto. `null` sem nada a antecipar. */
  fracao: number | null;
}

/**
 * Antecipar os repasses que vencem até `ateDias` dias: quanto cai amanhã e
 * quanto custa. O custo de cada repasse é a taxa diária equivalente (composta)
 * da taxa AO MÊS vezes os dias que faltam — a mesma base de
 * `fracaoDeAntecipacao` para o parcelado. Repasse de hoje ou vencido não paga
 * antecipação (já é dinheiro do dia).
 */
export function simularAntecipacao(repasses: RepasseFuturo[], hoje: string, taxaMensal: number, ateDias: number): AntecipacaoSimulada {
  const limite = somaDias(hoje, Math.max(0, Math.floor(ateDias)));
  const diario = Math.pow(1 + Math.max(0, taxaMensal || 0), 1 / 30) - 1;
  let bruto = 0, custo = 0, quantidade = 0;
  for (const r of repasses) {
    if (!(r.valor > 0) || r.dia > limite) continue;
    const dias = Math.max(0, Math.round((Date.parse(`${r.dia}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000));
    bruto += r.valor;
    custo += r.valor * diario * dias;
    quantidade += 1;
  }
  bruto = r2(bruto); custo = r2(custo);
  return { quantidade, bruto, custo, liquidoHoje: r2(bruto - custo), fracao: bruto > 0 ? custo / bruto : null };
}

/** Reexportada para a tela mostrar a regra no "i" sem duplicá-la. */
export { fracaoDeAntecipacao };

/* ------------------------------ o pedido ------------------------------ */

export type TipoPedido = "pedir" | "vincular";

export interface PedidoMaquininha {
  tipo: TipoPedido;
  quantidade: number;
  segmento: string;
  faturamentoMensal: number | null;
  /** Só no "vincular": o número do estabelecimento (EC) da maquininha. */
  codigoEstabelecimento: string;
  contatoNome: string;
  contatoTelefone: string;
  contatoEmail: string;
  endereco: string;
  observacao: string;
  /**
   * A simulação que levou ao pedido, quando ele veio do pop-up da comparação.
   * Vai ESTRUTURADA para o CRM da plataforma (pedido do dono, 28/10/2026):
   * texto solto na observação não se ordena por economia nem se filtra.
   */
  simulacao?: SimulacaoDoPedido | null;
  /** De onde o pedido veio (formulário, pop-up de economia ou convite ao consultor). */
  origem?: OrigemPedido;
}

export const PEDIDO_VAZIO: PedidoMaquininha = {
  tipo: "pedir", quantidade: 1, segmento: "", faturamentoMensal: null, codigoEstabelecimento: "",
  contatoNome: "", contatoTelefone: "", contatoEmail: "", endereco: "", observacao: "", simulacao: null, origem: "formulario",
};

/* ----------------------- a simulação que vai ao CRM ----------------------- */

/**
 * De onde o pedido veio: do formulário direto, do pop-up de ECONOMIA (Quattro
 * mais barata) ou do convite ao CONSULTOR (taxas de hoje menores ou iguais).
 * O comercial trata os dois últimos de jeitos opostos: o primeiro já está
 * convencido, o segundo espera uma proposta.
 */
export type OrigemPedido = "formulario" | "economia" | "consultor";

export interface SimulacaoDoPedido {
  versao: string;
  volumeMensal: number;
  /** Frações do mix, somando 1. */
  mix: MixVendas;
  antecipado: boolean;
  /** O que a empresa paga hoje, forma a forma, e se ela DIGITOU ou foi estimado. */
  taxasAtuais: Record<FormaOferta, TaxaAtualCompleta>;
  /** A taxa da Quattro que entrou na conta, forma a forma (null = não se aplica). */
  taxasQuattro: Record<FormaOferta, number | null>;
  custoAtualMes: number;
  custoQuattroMes: number;
  /** Positivo = a Quattro sai mais barata. */
  economiaMes: number;
  veredito: VereditoComparacao;
}

const FORMAS_SIM: FormaOferta[] = ["pix", "debito", "credito", "parcelado"];
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

/** Monta a simulação a partir da MESMA comparação que a tela mostrou. */
export function simulacaoDoPedido(
  e: EntradaComparacao, completas: Record<FormaOferta, TaxaAtualCompleta>, c: Comparacao,
): SimulacaoDoPedido {
  const quattro = {} as Record<FormaOferta, number | null>;
  for (const f of FORMAS_SIM) {
    const t = c.porForma.find((x) => x.forma === f)?.taxa;
    quattro[f] = t == null ? null : r4(t);
  }
  const atuais = {} as Record<FormaOferta, TaxaAtualCompleta>;
  for (const f of FORMAS_SIM) atuais[f] = { taxa: r4(completas[f].taxa), origem: completas[f].origem };
  return {
    versao: OFERTA_VERSION,
    volumeMensal: r2(e.volumeMensal),
    mix: { pix: r4(e.mix.pix), debito: r4(e.mix.debito), credito: r4(e.mix.credito), parcelado: r4(e.mix.parcelado) },
    antecipado: !!e.antecipado,
    taxasAtuais: atuais,
    taxasQuattro: quattro,
    custoAtualMes: r2(c.custoAtual),
    custoQuattroMes: r2(c.custoQuattro),
    economiaMes: r2(c.diferencaMensal),
    veredito: c.veredito,
  };
}

/** A origem que o pop-up dá ao pedido: economia só quando a Quattro sai mais barata. */
export function origemDoPedido(veredito: VereditoComparacao | null | undefined): OrigemPedido {
  if (!veredito) return "formulario";
  return veredito === "quattro_mais_barata" ? "economia" : "consultor";
}

/**
 * Confere uma simulação vinda de FORA (o jsonb lido do banco, ou o que o
 * navegador mandou). ⚠️ O cliente monta a simulação, então ela é DADO DE
 * FORA: número fora de faixa, forma inventada ou veredito que não existe
 * descartam a simulação inteira (null) em vez de entrar meio certa no funil
 * — uma economia de R$ 10 milhões por mês ordenaria o CRM inteiro errado.
 */
export function lerSimulacao(x: unknown): SimulacaoDoPedido | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const fracao = (v: unknown) => num(v, 0, 1);
  const TETO = 1_000_000_000;
  if (!num(o.volumeMensal, 0, TETO) || !num(o.custoAtualMes, 0, TETO) || !num(o.custoQuattroMes, 0, TETO) || !num(o.economiaMes, -TETO, TETO)) return null;
  if (typeof o.antecipado !== "boolean") return null;
  if (!["sem_volume", "quattro_mais_barata", "atual_mais_barata", "empate"].includes(o.veredito as string)) return null;
  const mix = o.mix as Record<string, unknown> | null;
  const atuais = o.taxasAtuais as Record<string, unknown> | null;
  const quattro = o.taxasQuattro as Record<string, unknown> | null;
  if (!mix || !atuais || !quattro || typeof mix !== "object" || typeof atuais !== "object" || typeof quattro !== "object") return null;
  for (const f of FORMAS_SIM) {
    if (!fracao(mix[f])) return null;
    const a = atuais[f] as Record<string, unknown> | null;
    if (!a || typeof a !== "object" || !num(a.taxa, 0, 0.99) || (a.origem !== "informada" && a.origem !== "estimada")) return null;
    if (quattro[f] !== null && !num(quattro[f], 0, 0.99)) return null;
  }
  const soma = FORMAS_SIM.reduce((s, f) => s + (mix[f] as number), 0);
  if (Math.abs(soma - 1) > 0.01) return null;
  return {
    versao: typeof o.versao === "string" ? o.versao.slice(0, 40) : "desconhecida",
    volumeMensal: o.volumeMensal as number,
    mix: { pix: mix.pix as number, debito: mix.debito as number, credito: mix.credito as number, parcelado: mix.parcelado as number },
    antecipado: o.antecipado,
    taxasAtuais: Object.fromEntries(FORMAS_SIM.map((f) => {
      const a = atuais[f] as { taxa: number; origem: OrigemTaxa };
      return [f, { taxa: a.taxa, origem: a.origem }];
    })) as Record<FormaOferta, TaxaAtualCompleta>,
    taxasQuattro: Object.fromEntries(FORMAS_SIM.map((f) => [f, quattro[f] as number | null])) as Record<FormaOferta, number | null>,
    custoAtualMes: o.custoAtualMes as number,
    custoQuattroMes: o.custoQuattroMes as number,
    economiaMes: o.economiaMes as number,
    veredito: o.veredito as VereditoComparacao,
  };
}

export const TETO_MAQUININHAS = 20;

/**
 * Os erros do pedido, por campo, em português. O banco confere de novo (é ele
 * quem recebe), mas dizer na tela custa menos que a ida e volta.
 */
export function validarPedido(p: PedidoMaquininha): Record<string, string> {
  const e: Record<string, string> = {};
  if (p.contatoNome.trim().length < 2) e.contatoNome = "Informe o nome de quem vamos procurar.";
  const digitos = p.contatoTelefone.replace(/\D/g, "");
  const email = p.contatoEmail.trim();
  if (digitos.length < 10 && !email) e.contatoTelefone = "Informe um telefone com DDD ou um e-mail.";
  if (digitos.length > 0 && digitos.length < 10) e.contatoTelefone = "O telefone precisa do DDD (10 ou 11 números).";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.contatoEmail = "Este e-mail não parece completo.";
  if (p.tipo === "pedir") {
    if (!(p.quantidade >= 1 && p.quantidade <= TETO_MAQUININHAS)) e.quantidade = `Peça de 1 a ${TETO_MAQUININHAS} maquininhas.`;
    if (p.endereco.trim().length < 8) e.endereco = "Informe o endereço de entrega.";
  } else if (!/^\d{3,15}$/.test(p.codigoEstabelecimento.trim())) {
    e.codigoEstabelecimento = "O número do estabelecimento tem só números (o que aparece no comprovante da maquininha).";
  }
  if (p.observacao.length > 500) e.observacao = "Use até 500 letras.";
  return e;
}

export type SituacaoPedido = "recebido" | "em_analise" | "proposta" | "aprovado" | "enviado" | "concluido" | "cancelado";

export const NOME_SITUACAO: Record<SituacaoPedido, string> = {
  recebido: "Recebido", em_analise: "Em análise", proposta: "Proposta enviada", aprovado: "Aprovado",
  enviado: "A caminho", concluido: "Concluído", cancelado: "Cancelado",
};

/** As etapas do pedido, em ordem, para a linha do tempo da tela. */
export const ETAPAS_PEDIDO: SituacaoPedido[] = ["recebido", "em_analise", "proposta", "aprovado", "enviado", "concluido"];

/* --------------------------- o funil comercial ---------------------------- */

/**
 * O funil da Administração › Comercial. ⚠️ Cada coluna É uma situação do
 * pedido, com o nome que o comercial usa: mover o card muda a MESMA situação
 * que a empresa acompanha na página dela. Uma segunda "etapa comercial" ao
 * lado da situação seriam dois campos para o mesmo fato, com escritores
 * independentes — a divergência só esperaria o primeiro card movido.
 */
export const FUNIL_COMERCIAL: readonly { situacao: SituacaoPedido; nome: string }[] = [
  { situacao: "recebido", nome: "Novo" },
  { situacao: "em_analise", nome: "Em contato" },
  { situacao: "proposta", nome: "Proposta" },
  { situacao: "aprovado", nome: "Aprovado" },
  { situacao: "enviado", nome: "A caminho" },
  { situacao: "concluido", nome: "Instalado" },
  { situacao: "cancelado", nome: "Perdido" },
];

/** O mínimo que o funil lê de um pedido. */
export interface PedidoNoFunil {
  situacao: SituacaoPedido;
  faturamento_mensal: number | null;
  simulacao: SimulacaoDoPedido | null;
  criado_em: string;
}

export interface ColunaDoFunil<T extends PedidoNoFunil> {
  situacao: SituacaoPedido;
  nome: string;
  pedidos: T[];
  /**
   * A economia por mês que a Quattro mostrou a esses clientes. ⚠️ Só a
   * POSITIVA soma: quem hoje paga menos que a Quattro tem economia negativa,
   * e somá-la apagaria a economia dos outros da mesma coluna.
   */
  economiaMes: number;
  /** O faturamento por mês declarado (ou o volume simulado, quando não declarou). */
  faturamentoMes: number;
}

/** Faturamento do pedido: o declarado no formulário, senão o volume da simulação. */
export function faturamentoDoPedido(p: PedidoNoFunil): number | null {
  return p.faturamento_mensal ?? p.simulacao?.volumeMensal ?? null;
}

/**
 * Agrupa os pedidos nas colunas do funil. Dentro da coluna, quem mostra mais
 * economia vem primeiro (é a conversa mais fácil), e o empate fica com o mais
 * recente. Situação desconhecida não some: cai em "Novo", para ser vista.
 */
export function montarFunil<T extends PedidoNoFunil>(pedidos: readonly T[]): ColunaDoFunil<T>[] {
  const colunas = FUNIL_COMERCIAL.map((c) => ({ ...c, pedidos: [] as T[], economiaMes: 0, faturamentoMes: 0 }));
  for (const p of pedidos) {
    const col = colunas.find((c) => c.situacao === p.situacao) ?? colunas[0];
    col.pedidos.push(p);
    col.economiaMes = r2(col.economiaMes + Math.max(0, p.simulacao?.economiaMes ?? 0));
    col.faturamentoMes = r2(col.faturamentoMes + (faturamentoDoPedido(p) ?? 0));
  }
  for (const c of colunas) {
    c.pedidos.sort((a, b) =>
      Math.max(0, b.simulacao?.economiaMes ?? 0) - Math.max(0, a.simulacao?.economiaMes ?? 0)
      || b.criado_em.localeCompare(a.criado_em));
  }
  return colunas;
}

/** Os números do topo do funil: o que está em aberto e o que já foi instalado. */
export function resumoDoFunil<T extends PedidoNoFunil>(colunas: readonly ColunaDoFunil<T>[]) {
  const abertas = colunas.filter((c) => c.situacao !== "concluido" && c.situacao !== "cancelado");
  const ganhos = colunas.find((c) => c.situacao === "concluido")?.pedidos.length ?? 0;
  const perdidos = colunas.find((c) => c.situacao === "cancelado")?.pedidos.length ?? 0;
  return {
    emAberto: abertas.reduce((a, c) => a + c.pedidos.length, 0),
    economiaEmAberto: r2(abertas.reduce((a, c) => a + c.economiaMes, 0)),
    faturamentoEmAberto: r2(abertas.reduce((a, c) => a + c.faturamentoMes, 0)),
    ganhos,
    perdidos,
    /** Instalados ÷ fechados (instalados + perdidos). `null` sem nenhum fechado: 0% diria "perdemos todos". */
    conversao: ganhos + perdidos > 0 ? ganhos / (ganhos + perdidos) : null,
  };
}

/* ------------------------- a ficha do lead (CRM, etapa 3) ------------------------- */

export type MotivoPerda = "preco" | "concorrente" | "sem_resposta" | "sem_interesse" | "credito" | "outro";

/** Os motivos de perda que o banco aceita (a mesma lista da restrição da tabela). */
export const NOME_MOTIVO_PERDA: Record<MotivoPerda, string> = {
  preco: "Preço",
  concorrente: "Fechou com outra",
  sem_resposta: "Sem resposta",
  sem_interesse: "Sem interesse",
  credito: "Crédito recusado",
  outro: "Outro",
};

/** Teto da taxa proposta: acima disso é dígito trocado ("3,5" no lugar de "0,035"). O banco confere o mesmo. */
export const TETO_TAXA_PROPOSTA = 0.2;

const FORMAS_LEAD: FormaOferta[] = ["pix", "debito", "credito", "parcelado"];

/**
 * Lê as taxas propostas vindas de FORA (o jsonb do banco ou o formulário).
 * Forma inventada e taxa fora de [0, 20%] são descartadas uma a uma; sem
 * nenhuma válida, `null` — "nenhuma proposta" não é "proposta de 0%".
 */
export function lerTaxasPropostas(x: unknown): TaxasPorForma | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const out: TaxasPorForma = {};
  for (const f of FORMAS_LEAD) {
    const v = o[f];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= TETO_TAXA_PROPOSTA) out[f] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * A conta da PROPOSTA: o mesmo volume, o mesmo mix e as mesmas taxas de hoje
 * da simulação que o cliente fez, com as taxas que o consultor propôs no
 * lugar das da tabela. ⚠️ A forma sem taxa proposta segue com a taxa da
 * Quattro que a simulação usou — a proposta muda o que o consultor digitou,
 * não zera o resto. É a MESMA `compararTaxas` da página do cliente: uma
 * segunda conta discordaria dela no primeiro centavo.
 */
export function comparacaoDaProposta(sim: SimulacaoDoPedido, taxas: TaxasPorForma | null): Comparacao | null {
  if (!taxas || !FORMAS_LEAD.some((f) => typeof taxas[f] === "number")) return null;
  const atuais: TaxasPorForma = {};
  for (const f of FORMAS_LEAD) atuais[f] = sim.taxasAtuais[f].taxa;
  return compararTaxas(
    { volumeMensal: sim.volumeMensal, mix: sim.mix, parcelasMedias: 1, taxasAtuais: atuais, antecipado: sim.antecipado },
    (forma) => taxas[forma] ?? sim.taxasQuattro[forma],
  );
}

export type SituacaoDoContato = "atrasado" | "hoje" | "agendado";

/** O próximo contato contra hoje (datas ISO, comparadas como texto — sem fuso). */
export function situacaoDoContato(proximo: string | null | undefined, hoje: string): SituacaoDoContato | null {
  if (!proximo) return null;
  const d = proximo.slice(0, 10);
  return d < hoje ? "atrasado" : d === hoje ? "hoje" : "agendado";
}

/* ------------------------------ a meta do mês ------------------------------ */

export interface RitmoDaMeta {
  /** Quanto da meta já foi vendido (0 a 1). `null` sem meta. */
  fracao: number | null;
  falta: number;
  /** No ritmo do mês até hoje, quanto o mês fecha. `null` no primeiro dia sem venda. */
  projecao: number | null;
  /** Dias do mês depois de hoje. */
  diasRestantes: number;
  /** Quanto vender por dia, a partir de amanhã, para bater a meta. `null` quando já bateu ou o mês acabou. */
  porDia: number | null;
  frase: string;
}

/**
 * O ritmo contra a meta de vendas do mês: o que falta, quanto o mês fecha no
 * ritmo de agora e quanto vender por dia para chegar lá. Hoje conta como dia
 * já vivido (as vendas de hoje já estão no vendido).
 */
export function ritmoDaMeta(vendidoNoMes: number, meta: number, hoje: string): RitmoDaMeta {
  const [a, m, d] = hoje.slice(0, 10).split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const vendido = Math.max(0, vendidoNoMes || 0);
  const alvo = Math.max(0, meta || 0);
  const diasRestantes = Math.max(0, diasNoMes - d);
  const projecao = vendido > 0 ? r2((vendido / d) * diasNoMes) : null;
  if (alvo === 0) {
    return { fracao: null, falta: 0, projecao, diasRestantes, porDia: null, frase: "Defina uma meta para acompanhar o ritmo do mês." };
  }
  const falta = r2(Math.max(0, alvo - vendido));
  const porDia = falta > 0 && diasRestantes > 0 ? r2(falta / diasRestantes) : null;
  const frase = falta === 0
    ? "Meta do mês batida."
    : projecao != null && projecao >= alvo
      ? "No ritmo de agora, o mês passa da meta."
      : diasRestantes === 0
        ? "O mês termina hoje e a meta não foi alcançada."
        : "No ritmo de agora, o mês fecha abaixo da meta.";
  return { fracao: Math.min(1, vendido / alvo), falta, projecao, diasRestantes, porDia, frase };
}
