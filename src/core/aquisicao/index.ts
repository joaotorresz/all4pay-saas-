/**
 * Simulador de DECISÃO DE AQUISIÇÃO — "posso comprar?" (puro, tipado, demo-safe).
 *
 * A pergunta que o dono (PF ou PJ) faz antes de assumir um compromisso:
 * "tenho R$ X de caixa e R$ Y por mês entrando; se eu comprar isso — entrada +
 * N parcelas — o que acontece com o meu caixa daqui pra frente?"
 *
 * O motor não devolve só "sim/não": devolve a PROJEÇÃO mês a mês (com e sem a
 * compra), o mês em que o caixa aperta, o comprometimento da renda, e as
 * ALTERNATIVAS (mais entrada, mais prazo, esperar) com o número de cada uma.
 * Toda conclusão carrega os fatores que a produziram (explicabilidade).
 *
 * Compõe `core/financing` (Price/SAC) — não reimplementa amortização.
 * Versão aquisicao/1.0.0.
 */
import { simularFinanciamento, type SistemaAmortizacao } from "@/core/financing";

export const AQUISICAO_VERSION = "aquisicao/1.0.0";

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Frações (0..1) precisam de mais casas: round2 faria 0,445 (44,5%) virar 45%. */
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
/** Protege contra NaN/Infinity vindos de divisões por zero. */
const safe = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);

/** Tipos de decisão com valores típicos pré-preenchidos (facilita o uso). */
export type TipoDecisao =
  | "veiculo" | "imovel" | "reforma" | "viagem" | "educacao"   // mais PF
  | "equipamento" | "unidade" | "software" | "estoque" | "contratacao" // mais PJ
  | "outro";

export interface PresetDecisao {
  id: TipoDecisao;
  label: string;
  /** Só aparece para este tipo de conta (undefined = ambos). */
  perfil?: "pessoal" | "empresa";
  parcelasPadrao: number;
  taxaMensalPadrao: number;
  /** Entrada sugerida como % do valor. */
  entradaPct: number;
  /** Custo mensal de manter o bem, como % do valor ao ANO (IPVA, seguro, etc.). */
  custoAnualPct: number;
  /** O ativo gera receita? (PJ) — % do valor por mês, só como sugestão inicial. */
  receitaMensalPct?: number;
  dica: string;
}

/**
 * Valores típicos de mercado (BR) — são SUGESTÕES editáveis, nunca travas.
 * custoAnualPct cobre o custo de posse: veículo ~10%/ano (IPVA+seguro+manutenção),
 * imóvel ~1,5%/ano (IPTU+condomínio fora), equipamento ~5%/ano (manutenção).
 */
export const PRESETS: PresetDecisao[] = [
  { id: "veiculo", label: "Veículo", parcelasPadrao: 48, taxaMensalPadrao: 0.018, entradaPct: 0.2, custoAnualPct: 0.10, dica: "Some IPVA, seguro, combustível e manutenção — o custo de ter o carro costuma superar a parcela." },
  { id: "imovel", label: "Imóvel", parcelasPadrao: 360, taxaMensalPadrao: 0.009, entradaPct: 0.2, custoAnualPct: 0.015, dica: "Financiamento longo: o total pago pode passar do dobro do valor. Entrada maior derruba muito o juro total." },
  { id: "reforma", label: "Reforma", parcelasPadrao: 24, taxaMensalPadrao: 0.022, entradaPct: 0.3, custoAnualPct: 0, dica: "Reforma quase sempre estoura o orçado — simule com 20% a mais do que o previsto." },
  { id: "viagem", label: "Viagem", perfil: "pessoal", parcelasPadrao: 12, taxaMensalPadrao: 0, entradaPct: 0.3, custoAnualPct: 0, dica: "Parcelado sem juros no cartão ainda ocupa o seu limite e a sua sobra mensal." },
  { id: "educacao", label: "Curso / educação", perfil: "pessoal", parcelasPadrao: 24, taxaMensalPadrao: 0.012, entradaPct: 0.1, custoAnualPct: 0, dica: "Considere o retorno: quanto a mais você espera ganhar depois de concluir?" },
  { id: "equipamento", label: "Equipamento / máquina", perfil: "empresa", parcelasPadrao: 36, taxaMensalPadrao: 0.016, entradaPct: 0.2, custoAnualPct: 0.05, receitaMensalPct: 0.03, dica: "Se o equipamento gera receita, preencha o campo de receita extra — o payback aparece na simulação." },
  { id: "unidade", label: "Nova unidade / ponto", perfil: "empresa", parcelasPadrao: 24, taxaMensalPadrao: 0.019, entradaPct: 0.3, custoAnualPct: 0.18, receitaMensalPct: 0.05, dica: "Inclua aluguel, folha e contas no custo mensal — a unidade demora a se pagar." },
  { id: "software", label: "Software / sistema", perfil: "empresa", parcelasPadrao: 12, taxaMensalPadrao: 0, entradaPct: 0, custoAnualPct: 0, dica: "Assinatura é custo recorrente, não investimento: entra direto no custo mensal." },
  { id: "estoque", label: "Compra de estoque", perfil: "empresa", parcelasPadrao: 3, taxaMensalPadrao: 0, entradaPct: 0.3, custoAnualPct: 0, receitaMensalPct: 0.35, dica: "Estoque vira caixa quando vende — preencha a receita extra com a venda esperada por mês." },
  { id: "contratacao", label: "Contratação", perfil: "empresa", parcelasPadrao: 0, taxaMensalPadrao: 0, entradaPct: 0, custoAnualPct: 0, dica: "Sem parcela: o peso é o custo mensal (salário + encargos ≈ 1,8× o salário)." },
  { id: "outro", label: "Outro", parcelasPadrao: 12, taxaMensalPadrao: 0.015, entradaPct: 0.2, custoAnualPct: 0, dica: "" },
];

export const presetPor = (id: TipoDecisao): PresetDecisao =>
  PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1];

/** A situação atual, derivada dos dados reais (nunca digitada à mão). */
export interface SituacaoAtual {
  caixaAtual: number;
  /** Entrada média por mês (recorrente + média das variáveis). */
  receitaMensal: number;
  /** Saída média por mês (custo de vida / custo fixo da empresa). */
  despesaMensal: number;
}

export interface EntradaSimulacao {
  tipo: TipoDecisao;
  /** Preço total do bem/projeto. Em "contratacao", pode ser 0. */
  valor: number;
  /** Pago à vista hoje (sai do caixa na hora). */
  entrada: number;
  /** Nº de parcelas do saldo. 0 = à vista (sem financiamento). */
  parcelas: number;
  /** Juros ao mês em fração (0.018 = 1,8% a.m.). */
  taxaMensal: number;
  sistema?: SistemaAmortizacao;
  /**
   * Parcela informada pelo usuário ("o vendedor disse 3.200"). Quando vem,
   * MANDA sobre o cálculo por taxa — e a taxa implícita é derivada dela.
   */
  parcelaInformada?: number;
  /** Custo mensal de manter (seguro, IPVA, manutenção, aluguel…). */
  custoMensalExtra?: number;
  /** Receita mensal que a compra gera (PJ: equipamento, unidade, estoque). */
  receitaExtraMensal?: number;
  /** Economia mensal que a compra traz (ex.: deixa de pagar aluguel/Uber). */
  economiaMensal?: number;
  /** Meses projetados. Default: parcelas + 12 (mín. 24, máx. 120). */
  horizonteMeses?: number;
}

export interface PontoProjecao {
  mes: number;          // 0 = hoje
  label: string;        // "Hoje", "Mês 1", …
  semCompra: number;    // caixa projetado sem a decisão
  comCompra: number;    // caixa projetado com a decisão
  parcela: number;      // parcela paga naquele mês (0 depois de quitar)
}

export type Veredito = "confortavel" | "aperta" | "arriscado" | "inviavel";

export interface Alternativa {
  id: string;
  titulo: string;
  detalhe: string;
  /** Veredito que ESTA alternativa produziria. */
  veredito: Veredito;
  parcela: number;
  entrada: number;
  parcelas: number;
}

export interface Fator {
  label: string;
  valor: string;
  /** Como este fator pesou no veredito. */
  sinal: "bom" | "atencao" | "ruim";
}

export interface ResultadoSimulacao {
  versao: string;
  // --- o compromisso ---
  parcela: number;
  parcelas: number;
  totalPago: number;       // entrada + todas as parcelas
  juros: number;
  taxaMensalEfetiva: number;
  // --- o impacto ---
  caixaDepoisEntrada: number;
  sobraAntes: number;      // receita − despesa (hoje)
  sobraDepois: number;     // já com parcela, custo extra, receita extra e economia
  pesoMensal: number;      // parcela + custo extra − receita extra − economia
  comprometimentoRenda: number; // pesoMensal ÷ receita (fração)
  mesesDeReserva: number;  // caixa após entrada ÷ despesa mensal
  runwayAntes: number;
  runwayDepois: number;
  // --- a projeção ---
  projecao: PontoProjecao[];
  caixaMinimo: number;
  mesAperto: number | null;   // 1º mês com caixa < 0 (null = nunca)
  caixaFinal: number;
  paybackMeses: number | null; // só quando há receita extra/economia
  // --- a leitura ---
  veredito: Veredito;
  resumo: string;
  fatores: Fator[];
  alternativas: Alternativa[];
}

/** Reserva de emergência recomendada, em meses de despesa. */
const RESERVA_IDEAL = 3;
/** Teto clássico de comprometimento da renda com parcelas. */
const COMPROMETIMENTO_TETO = 0.3;

/** Calcula a parcela — respeitando a parcela informada quando existir. */
function calcularParcela(e: EntradaSimulacao) {
  const financiado = Math.max(0, e.valor - e.entrada);
  const n = Math.max(0, Math.floor(e.parcelas));
  if (n === 0 || financiado <= 0) {
    return { parcela: 0, totalParcelas: 0, juros: 0, taxaEfetiva: 0, n: 0 };
  }
  if (e.parcelaInformada && e.parcelaInformada > 0) {
    const parcela = e.parcelaInformada;
    const totalParcelas = round2(parcela * n);
    return {
      parcela: round2(parcela),
      totalParcelas,
      juros: round2(Math.max(0, totalParcelas - financiado)),
      taxaEfetiva: taxaImplicita(financiado, parcela, n),
      n,
    };
  }
  const fin = simularFinanciamento(financiado, e.taxaMensal, n, e.sistema ?? "price");
  return {
    parcela: round2(fin.parcela),
    totalParcelas: round2(fin.totalPago),
    juros: round2(fin.jurosTotal),
    taxaEfetiva: e.taxaMensal,
    n,
  };
}

/**
 * Taxa mensal implícita de um parcelamento (PMT conhecido) — bissecção sobre a
 * fórmula da Price. É assim que se descobre o juro real de um "3.200 em 48x".
 */
export function taxaImplicita(principal: number, parcela: number, n: number): number {
  if (principal <= 0 || parcela <= 0 || n <= 0) return 0;
  if (parcela * n <= principal) return 0; // sem juros (ou desconto)
  const pv = (i: number) => (i === 0 ? parcela * n : (parcela * (1 - Math.pow(1 + i, -n))) / i);
  let lo = 0, hi = 1; // 0% a 100% a.m.
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > principal) lo = mid; else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 1e6) / 1e6;
}

/** Roda a simulação e devolve tudo — projeção, veredito, fatores e alternativas. */
export function simularAquisicao(sit: SituacaoAtual, e: EntradaSimulacao): ResultadoSimulacao {
  const receita = Math.max(0, sit.receitaMensal);
  const despesa = Math.max(0, sit.despesaMensal);
  const caixa = sit.caixaAtual;
  const entrada = clamp(e.entrada, 0, Math.max(0, e.valor));

  const { parcela, totalParcelas, juros, taxaEfetiva, n } = calcularParcela({ ...e, entrada });
  const custoExtra = Math.max(0, e.custoMensalExtra ?? 0);
  const receitaExtra = Math.max(0, e.receitaExtraMensal ?? 0);
  const economia = Math.max(0, e.economiaMensal ?? 0);

  const sobraAntes = round2(receita - despesa);
  // Peso mensal enquanto as parcelas correm.
  const pesoMensal = round2(parcela + custoExtra - receitaExtra - economia);
  const sobraDepois = round2(sobraAntes - pesoMensal);

  const caixaDepoisEntrada = round2(caixa - entrada);
  const horizonte = clamp(e.horizonteMeses ?? Math.max(24, n + 12), 6, 120);

  // Projeção mês a mês: sem a compra (baseline) × com a compra.
  const projecao: PontoProjecao[] = [];
  let acumSem = caixa;
  let acumCom = caixaDepoisEntrada;
  let caixaMinimo = caixaDepoisEntrada;
  let mesAperto: number | null = caixaDepoisEntrada < 0 ? 0 : null;
  projecao.push({ mes: 0, label: "Hoje", semCompra: round2(acumSem), comCompra: round2(acumCom), parcela: 0 });

  for (let m = 1; m <= horizonte; m++) {
    acumSem = round2(acumSem + sobraAntes);
    const parcelaMes = m <= n ? parcela : 0;
    // Depois de quitar, o custo de posse e o ganho continuam.
    const fluxoCom = sobraAntes - parcelaMes - custoExtra + receitaExtra + economia;
    acumCom = round2(acumCom + fluxoCom);
    if (acumCom < caixaMinimo) caixaMinimo = acumCom;
    if (acumCom < 0 && mesAperto === null) mesAperto = m;
    projecao.push({ mes: m, label: `Mês ${m}`, semCompra: acumSem, comCompra: acumCom, parcela: round2(parcelaMes) });
  }

  const mesesDeReserva = despesa > 0 ? round2(safe(caixaDepoisEntrada / despesa)) : caixaDepoisEntrada > 0 ? 99 : 0;
  const runwayAntes = despesa > 0 && sobraAntes < 0 ? round2(safe(caixa / Math.abs(sobraAntes))) : 99;
  const runwayDepois = sobraDepois < 0 ? round2(safe(caixaDepoisEntrada / Math.abs(sobraDepois))) : 99;
  const comprometimentoRenda = receita > 0 ? round4(safe(pesoMensal / receita)) : pesoMensal > 0 ? 1 : 0;

  // Payback: em quantos meses o ganho líquido devolve o desembolso total.
  const ganhoLiquidoMes = receitaExtra + economia - custoExtra;
  const desembolso = entrada + totalParcelas;
  const paybackMeses = ganhoLiquidoMes > 0 ? Math.ceil(safe(desembolso / ganhoLiquidoMes, 0)) : null;

  // ---------------- veredito (explicável) ----------------
  const fatores: Fator[] = [];
  let veredito: Veredito = "confortavel";
  const piora = (v: Veredito) => {
    const ordem: Veredito[] = ["confortavel", "aperta", "arriscado", "inviavel"];
    if (ordem.indexOf(v) > ordem.indexOf(veredito)) veredito = v;
  };

  if (sobraDepois < 0) {
    piora("inviavel");
    fatores.push({ label: "Sobra mensal", valor: `${fmtSinal(sobraDepois)} por mês`, sinal: "ruim" });
  } else if (sobraDepois < sobraAntes * 0.2) {
    piora("aperta");
    fatores.push({ label: "Sobra mensal", valor: `cai para ${fmtSinal(sobraDepois)}`, sinal: "atencao" });
  } else {
    fatores.push({ label: "Sobra mensal", valor: `segue em ${fmtSinal(sobraDepois)}`, sinal: "bom" });
  }

  if (entrada > caixa) {
    piora("inviavel");
    fatores.push({ label: "Entrada", valor: "maior que o seu caixa", sinal: "ruim" });
  }

  if (mesAperto !== null) {
    piora(mesAperto <= 6 ? "inviavel" : "arriscado");
    fatores.push({ label: "Caixa negativo", valor: `no mês ${mesAperto}`, sinal: "ruim" });
  }

  if (comprometimentoRenda > COMPROMETIMENTO_TETO) {
    piora(comprometimentoRenda > 0.5 ? "arriscado" : "aperta");
    fatores.push({ label: "Comprometimento da renda", valor: `${pct(comprometimentoRenda)} (acima dos 30% recomendados)`, sinal: comprometimentoRenda > 0.5 ? "ruim" : "atencao" });
  } else if (pesoMensal > 0) {
    fatores.push({ label: "Comprometimento da renda", valor: `${pct(comprometimentoRenda)} da sua entrada mensal`, sinal: "bom" });
  }

  if (mesesDeReserva < RESERVA_IDEAL) {
    piora(mesesDeReserva < 1 ? "arriscado" : "aperta");
    fatores.push({ label: "Reserva após a entrada", valor: `${mesesDeReserva.toFixed(1)} meses de despesa (o ideal é ${RESERVA_IDEAL})`, sinal: mesesDeReserva < 1 ? "ruim" : "atencao" });
  } else {
    fatores.push({ label: "Reserva após a entrada", valor: `${Math.min(99, mesesDeReserva).toFixed(1)} meses de despesa`, sinal: "bom" });
  }

  if (juros > 0) {
    const jurosPct = e.valor > 0 ? juros / e.valor : 0;
    fatores.push({
      label: "Juros do parcelamento",
      valor: `${brl(juros)} (${pct(jurosPct)} do valor · ${pct(taxaEfetiva)} a.m.)`,
      sinal: jurosPct > 0.4 ? "ruim" : jurosPct > 0.2 ? "atencao" : "bom",
    });
    if (jurosPct > 0.5) piora("aperta");
  }

  if (paybackMeses !== null) {
    fatores.push({
      label: "Payback",
      valor: `${paybackMeses} meses para se pagar`,
      sinal: paybackMeses <= n || paybackMeses <= 24 ? "bom" : "atencao",
    });
  }

  const resumo = montarResumo(veredito, { parcela, pesoMensal, sobraDepois, mesAperto, mesesDeReserva, paybackMeses, entradaCabe: entrada <= caixa, faltaEntrada: round2(Math.max(0, entrada - caixa)) });
  const alternativas = montarAlternativas(sit, { ...e, entrada }, veredito);

  return {
    versao: AQUISICAO_VERSION,
    parcela, parcelas: n,
    totalPago: round2(entrada + totalParcelas),
    juros, taxaMensalEfetiva: taxaEfetiva,
    caixaDepoisEntrada, sobraAntes, sobraDepois, pesoMensal,
    comprometimentoRenda, mesesDeReserva, runwayAntes, runwayDepois,
    projecao, caixaMinimo: round2(caixaMinimo), mesAperto,
    caixaFinal: round2(acumCom), paybackMeses,
    veredito, resumo, fatores, alternativas,
  };
}

/** Alternativas concretas quando o cenário não é confortável. */
function montarAlternativas(sit: SituacaoAtual, entradaOrig: EntradaSimulacao, atual: Veredito): Alternativa[] {
  const out: Alternativa[] = [];
  // Uma parcela INFORMADA vale só para o cenário digitado. Para simular
  // alternativas (outra entrada, outro prazo) é preciso soltar a parcela e
  // usar a TAXA IMPLÍCITA nela — senão toda alternativa repetiria a mesma
  // parcela e o comparativo não diria nada.
  const e: EntradaSimulacao = entradaOrig.parcelaInformada
    ? {
        ...entradaOrig,
        taxaMensal: taxaImplicita(
          Math.max(0, entradaOrig.valor - entradaOrig.entrada),
          entradaOrig.parcelaInformada,
          entradaOrig.parcelas,
        ),
        parcelaInformada: undefined,
      }
    : entradaOrig;

  const testar = (id: string, titulo: string, detalhe: string, mod: Partial<EntradaSimulacao>): void => {
    const alt = { ...e, ...mod };
    const { parcela } = calcularParcela(alt);
    const r = vereditoRapido(sit, alt);
    out.push({ id, titulo, detalhe, veredito: r, parcela, entrada: alt.entrada, parcelas: alt.parcelas });
  };

  if (atual === "confortavel") {
    // Mesmo confortável, mostrar o caminho que economiza juros.
    if (e.parcelas > 12) {
      const menos = Math.max(6, Math.round(e.parcelas / 2));
      testar("prazo-curto", `Em ${menos}x em vez de ${e.parcelas}x`, "Parcela maior, bem menos juros no total.", { parcelas: menos });
    }
    return out;
  }

  // Mais entrada (usa até 70% do caixa, preservando reserva).
  const entradaMax = Math.max(e.entrada, Math.min(e.valor, sit.caixaAtual * 0.7));
  if (entradaMax > e.entrada + 1) {
    testar("mais-entrada", `Dar ${brl(entradaMax)} de entrada`, "Menos financiado → parcela e juros menores.", { entrada: entradaMax });
  }
  // Mais prazo (dilui a parcela, custa mais juros).
  if (e.parcelas > 0 && e.parcelas < 96) {
    const mais = Math.min(96, e.parcelas + Math.max(12, Math.round(e.parcelas * 0.5)));
    testar("mais-prazo", `Alongar para ${mais}x`, "Parcela menor no mês, juros maiores no total.", { parcelas: mais });
  }
  // Bem mais barato (o que caberia de fato).
  const sobra = sit.receitaMensal - sit.despesaMensal;
  if (sobra > 0 && e.parcelas > 0) {
    const parcelaCabe = sobra * COMPROMETIMENTO_TETO * (sit.receitaMensal > 0 ? sit.receitaMensal / Math.max(1, sobra) : 1);
    const tetoParcela = Math.max(0, Math.min(sobra * 0.8, sit.receitaMensal * COMPROMETIMENTO_TETO));
    if (tetoParcela > 0 && parcelaCabe >= 0) {
      const valorCabe = round2(tetoParcela * e.parcelas * 0.92 + e.entrada);
      if (valorCabe > 0 && valorCabe < e.valor) {
        out.push({
          id: "valor-cabe",
          titulo: `Caberia até ${brl(valorCabe)}`,
          detalhe: `Com a mesma entrada e prazo, mantendo a parcela dentro de ${brl(tetoParcela)}/mês.`,
          veredito: "confortavel",
          parcela: round2(tetoParcela), entrada: e.entrada, parcelas: e.parcelas,
        });
      }
    }
  }
  return out;
}

/** Veredito enxuto (sem projeção completa) — usado nas alternativas. */
function vereditoRapido(sit: SituacaoAtual, e: EntradaSimulacao): Veredito {
  const { parcela } = calcularParcela(e);
  const peso = parcela + (e.custoMensalExtra ?? 0) - (e.receitaExtraMensal ?? 0) - (e.economiaMensal ?? 0);
  const sobra = sit.receitaMensal - sit.despesaMensal - peso;
  const caixaPos = sit.caixaAtual - e.entrada;
  const reserva = sit.despesaMensal > 0 ? caixaPos / sit.despesaMensal : 99;
  const compr = sit.receitaMensal > 0 ? peso / sit.receitaMensal : 0;
  if (sobra < 0 || caixaPos < 0) return "inviavel";
  if (reserva < 1 || compr > 0.5) return "arriscado";
  if (compr > COMPROMETIMENTO_TETO || reserva < RESERVA_IDEAL) return "aperta";
  return "confortavel";
}

function montarResumo(
  v: Veredito,
  d: { parcela: number; pesoMensal: number; sobraDepois: number; mesAperto: number | null; mesesDeReserva: number; paybackMeses: number | null; entradaCabe: boolean; faltaEntrada: number },
): string {
  // "pesa …" em minúscula no meio da frase — sem tocar no "R$" do valor.
  const pesaFrase = d.pesoMensal > 0 ? `pesa ${brl(d.pesoMensal)} por mês no seu caixa` : "não pesa no seu caixa mensal";
  const Peso = pesaFrase.charAt(0).toUpperCase() + pesaFrase.slice(1);
  switch (v) {
    case "confortavel":
      return `Cabe no seu caixa. ${Peso} e ainda sobram ${fmtSinal(d.sobraDepois)} por mês.${d.paybackMeses ? ` Se paga em ${d.paybackMeses} meses.` : ""}`;
    case "aperta":
      return `Cabe, mas aperta. ${Peso} e a sobra cai para ${fmtSinal(d.sobraDepois)} por mês — sem folga para imprevisto.`;
    case "arriscado":
      return d.mesAperto !== null
        ? `Arriscado: o caixa fica negativo no mês ${d.mesAperto}. ${Peso}.`
        : `Arriscado: ${pesaFrase} e a reserva cai para ${d.mesesDeReserva.toFixed(1)} meses de despesa.`;
    default:
      if (d.sobraDepois < 0) return `Não fecha: ${pesaFrase} e o mês passa a fechar em ${fmtSinal(d.sobraDepois)}.`;
      // A parcela até caberia — o que não cabe é a ENTRADA. Dizer isso importa:
      // muda a ação (juntar mais caixa) em vez de desistir da compra.
      if (!d.entradaCabe) return `A entrada não cabe no seu caixa — faltam ${brl(d.faltaEntrada)}. O restante caberia: ${pesaFrase}.`;
      return `Não é viável com o caixa de hoje: ${pesaFrase}.`;
  }
}

/* ------------------------------ formatação ------------------------------ */
const brl = (n: number) =>
  "R$" + Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSinal = (n: number) => (n < 0 ? "−" : "") + brl(n);
const pct = (f: number) => `${(f * 100).toFixed(f * 100 < 10 ? 1 : 0)}%`;

export const VEREDITO_LABEL: Record<Veredito, string> = {
  confortavel: "Cabe no seu caixa",
  aperta: "Cabe, mas aperta",
  arriscado: "Arriscado",
  inviavel: "Não cabe hoje",
};

/* ------------------------- situação a partir dos dados -------------------------
 * A simulação nunca parte de número digitado: caixa, entrada e saída mensais
 * saem dos MESMOS lançamentos que alimentam o resto do sistema. */

interface MovimentoBase {
  type: "entrada" | "saida";
  amount: number;
  status?: string;
  due_date: string;
  paid_date?: string | null;
}

/**
 * Deriva a situação atual (caixa · receita/mês · despesa/mês) dos lançamentos.
 * Usa a média dos últimos `meses` (default 6) sobre o que foi REALIZADO —
 * projeção de compromisso futuro não entra na média, senão dobra a conta.
 */
export function situacaoDe(
  input: { hoje: string; saldoAtual: number; movements: MovimentoBase[] },
  meses = 6,
): SituacaoAtual {
  const hoje = new Date(input.hoje + "T00:00:00");
  const ini = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1);
  let entradas = 0, saidas = 0;
  const mesesVistos = new Set<string>();

  for (const mv of input.movements) {
    if (mv.status === "cancelado") continue;
    // Realizado: usa a data de caixa; sem ela, o vencimento já passado.
    const ds = (mv.paid_date || mv.due_date || "").slice(0, 10);
    if (!ds) continue;
    const d = new Date(ds + "T00:00:00");
    if (d < ini || d > hoje) continue;
    mesesVistos.add(ds.slice(0, 7));
    const v = Math.abs(mv.amount);
    if (mv.type === "entrada") entradas += v; else saidas += v;
  }

  const n = Math.max(1, mesesVistos.size);
  return {
    caixaAtual: round2(input.saldoAtual),
    receitaMensal: round2(entradas / n),
    despesaMensal: round2(saidas / n),
  };
}
