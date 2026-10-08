/**
 * O EXTRATO CONSOLIDADO DE VENDAS da Pinbank (`ExtratoPos`) — puro, sem I/O.
 *
 * É a fonte que falta à integração da maquininha: o webhook `Compra.*` diz QUE
 * a venda aconteceu, mas não traz a data futura do repasse nem a taxa cobrada —
 * até aqui as duas saem do contrato (estimadas). O ExtratoPos traz, por
 * parcela, `DataFuturaPagamento`, `ValorLiquidoRepasse` e `ValorTaxaAdm`.
 *
 * Este arquivo só monta o pedido e LÊ a resposta. Quem cifra, autentica e
 * chama é `lib/pinbank/api.ts`, pela porta única `lib/pinbank/saida.ts`.
 *
 * ⚠️ **A LEITURA É POR LISTA DE PERMITIDOS, não de proibidos.** A linha da
 * Pinbank traz o CPF/CNPJ do cliente e do comprador, o nome do comprador, o
 * número do cartão, o sub-estabelecimento e o agente comercial. Nada disso é
 * preciso para conferir data e taxa. Copiar só os campos nomeados aqui faz com
 * que um campo NOVO da Pinbank (a doc avisa que eles podem chegar sem mudar a
 * versão) fique de fora por padrão — uma lista de proibidos o deixaria passar.
 */

export type StatusExtratoPos = "Todos" | "Pago" | "Pendente";
export type MeioCapturaExtratoPos = "Todos" | "Ecommerce" | "Terminal";

export interface FiltroExtratoPos {
  codigoCanal: number;
  codigoCliente: number;
  /** AAAA-MM-DD, dia inteiro no horário de Brasília. */
  de: string;
  /** AAAA-MM-DD, inclusive. */
  ate: string;
  status: StatusExtratoPos;
  meio: MeioCapturaExtratoPos;
  idTerminalPos?: string;
  /** 0 = todas (o padrão da Pinbank). */
  limite?: number;
}

/**
 * Teto do intervalo. A doc recomenda "o mais específico possível" para não
 * estourar o tempo; um mês cobre a conferência mensal, que é o uso pensado.
 */
export const MAX_DIAS_EXTRATO_POS = 31;

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const diaValido = (s: string) => {
  if (!DIA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
const inteiroPositivo = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 2_147_483_647;

/** Os problemas do filtro, em português, ANTES de qualquer chamada. Vazio = ok. */
export function problemasDoFiltroExtratoPos(f: FiltroExtratoPos): string[] {
  const p: string[] = [];
  if (!inteiroPositivo(f.codigoCanal)) p.push("Código do canal inválido (inteiro positivo).");
  if (!inteiroPositivo(f.codigoCliente)) p.push("Código do cliente inválido (inteiro positivo).");
  if (!diaValido(f.de)) p.push("Data inicial inválida (AAAA-MM-DD).");
  if (!diaValido(f.ate)) p.push("Data final inválida (AAAA-MM-DD).");
  if (diaValido(f.de) && diaValido(f.ate)) {
    const n = diasEntre(f.de, f.ate);
    if (n < 0) p.push("A data inicial é depois da final.");
    else if (n + 1 > MAX_DIAS_EXTRATO_POS) p.push(`O intervalo passa de ${MAX_DIAS_EXTRATO_POS} dias; peça um mês por vez.`);
  }
  if (!["Todos", "Pago", "Pendente"].includes(f.status)) p.push("Status deve ser Todos, Pago ou Pendente.");
  if (!["Todos", "Ecommerce", "Terminal"].includes(f.meio)) p.push("Meio de captura deve ser Todos, Ecommerce ou Terminal.");
  if (f.idTerminalPos != null && !/^[A-Za-z0-9_-]{1,40}$/.test(f.idTerminalPos)) p.push("Terminal inválido.");
  if (f.limite != null && !(Number.isInteger(f.limite) && f.limite >= 0 && f.limite <= 10_000)) p.push("Limite de linhas inválido (0 a 10000).");
  return p;
}

/**
 * O `Data` do pedido, ABERTO (quem cifra é a API). As datas levam o fuso de
 * Brasília (`-03:00`, sem horário de verão desde 2019): "o dia 08/10" é o dia
 * de quem vende, e um instante sem fuso ficaria à mercê do relógio do servidor
 * da Pinbank.
 */
export function pedidoExtratoPos(f: FiltroExtratoPos): Record<string, unknown> {
  return {
    CodigoCanal: f.codigoCanal,
    CodigoCliente: f.codigoCliente,
    DataInicial: `${f.de}T00:00:00-03:00`,
    DataFinal: `${f.ate}T23:59:59-03:00`,
    Status: f.status,
    MeioCaptura: f.meio,
    ...(f.idTerminalPos ? { IdTerminalPos: f.idTerminalPos } : {}),
    QuantidadeLinhasRetorno: f.limite ?? 0,
  };
}

/** Uma parcela do extrato, SEM dado pessoal. Valores em CENTAVOS. */
export interface LinhaExtratoPos {
  nsu: number | null;
  codigoCliente: number | null;
  terminal: string | null;
  bandeira: string | null;
  tipoCompra: string | null;
  parcela: number | null;
  totalParcelas: number | null;
  dataTransacao: string | null;
  dataFuturaPagamento: string | null;
  dataCancelamento: string | null;
  brutoCentavos: number | null;
  brutoParcelaCentavos: number | null;
  liquidoRepasseCentavos: number | null;
  splitCentavos: number | null;
  taxaAdmCentavos: number | null;
  taxaMesCentavos: number | null;
  status: string | null;
  statusPagamento: string | null;
}

/**
 * Os campos da Pinbank que NÃO entram (documentação + guarda). A leitura já os
 * deixa de fora por não estarem na lista de permitidos; esta lista existe para
 * a guarda provar que nenhum deles escapou.
 */
export const CAMPOS_PESSOAIS_EXTRATO_POS = [
  "CpfCnpj",
  "CpfCnpjComprador",
  "NomeRazaoSocialComprador",
  "NumeroCartao",
  "Submerchant",
  "CpfAgComercial",
  "NomeAgComercial",
  "DadosExtra",
  "SerialNumber",
] as const;

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const texto = (v: unknown, max = 60): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : null;
const inteiro = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) ? n : null;
};
/** Reais (decimal da Pinbank) → centavos inteiros, sem a dízima do ponto flutuante. */
const centavos = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) : null;
};
const dataHora = (v: unknown): string | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  // O "0001-01-01" do .NET é a data VAZIA, não uma data.
  if (/^0001-01-01/.test(s)) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 25) : null;
};

export function linhaDoExtratoPos(l: Record<string, unknown>): LinhaExtratoPos {
  return {
    nsu: inteiro(l.NsuOperacao),
    codigoCliente: inteiro(l.CodigoCliente),
    terminal: texto(l.IdTerminal, 40),
    bandeira: texto(l.Bandeira, 30),
    tipoCompra: texto(l.TipoCompra, 40),
    parcela: inteiro(l.NumeroParcela),
    totalParcelas: inteiro(l.NumeroTotalParcelas),
    dataTransacao: dataHora(l.DataTransacao),
    dataFuturaPagamento: dataHora(l.DataFuturaPagamento),
    dataCancelamento: dataHora(l.DataCancelamento),
    brutoCentavos: centavos(l.ValorBruto),
    brutoParcelaCentavos: centavos(l.ValorBrutoParcela),
    liquidoRepasseCentavos: centavos(l.ValorLiquidoRepasse),
    splitCentavos: centavos(l.ValorSplit),
    taxaAdmCentavos: centavos(l.ValorTaxaAdm),
    taxaMesCentavos: centavos(l.ValorTaxaMes),
    status: texto(l.DescricaoStatus),
    statusPagamento: texto(l.DescricaoStatusPagamento),
  };
}

export interface RespostaExtratoPos {
  /** `ResultCode` da Pinbank, como veio (o significado de cada código não está na doc). */
  codigo: number | null;
  mensagem: string | null;
  /** `ValidationData.Errors` — campo e motivo, para o pedido mal formado. */
  erros: { campo: string | null; mensagem: string | null }[];
  linhas: LinhaExtratoPos[];
}

/**
 * Lê o envelope JÁ ABERTO (`{ Data: [...], ResultCode, Message, ValidationData }`).
 * Aceita também a lista solta — a doc não diz se a resposta cifrada traz o
 * envelope inteiro ou só o `Data`, e o teste em dev é que vai dizer.
 */
export function lerRespostaExtratoPos(aberto: unknown): RespostaExtratoPos {
  const env = Array.isArray(aberto) ? { Data: aberto } : obj(aberto) ? aberto : {};
  const val = obj(env.ValidationData) ? env.ValidationData : {};
  const erros = (Array.isArray(val.Errors) ? val.Errors : [])
    .filter(obj)
    .slice(0, 20)
    .map((e) => ({ campo: texto(e.FieldName, 80), mensagem: texto(e.ErrorMessage, 300) }));
  const lista = Array.isArray(env.Data) ? env.Data : [];
  return {
    codigo: inteiro(env.ResultCode) ?? inteiro(val.ResultCode),
    mensagem: texto(env.Message, 300) ?? texto(val.Message, 300),
    erros,
    linhas: lista.filter(obj).map(linhaDoExtratoPos),
  };
}

export interface ResumoExtratoPos {
  linhas: number;
  brutoParcelasCentavos: number;
  liquidoRepasseCentavos: number;
  taxaAdmCentavos: number;
  /** Quantas parcelas trazem a data futura do repasse e a taxa — o que o ERP vai conferir. */
  comDataDoRepasse: number;
  comTaxa: number;
  porStatus: Record<string, number>;
  primeiroRepasse: string | null;
  ultimoRepasse: string | null;
}

export function resumirExtratoPos(linhas: LinhaExtratoPos[]): ResumoExtratoPos {
  const soma = (f: (l: LinhaExtratoPos) => number | null) => linhas.reduce((s, l) => s + (f(l) ?? 0), 0);
  const datas = linhas.map((l) => l.dataFuturaPagamento?.slice(0, 10)).filter((d): d is string => !!d).sort();
  const porStatus: Record<string, number> = {};
  for (const l of linhas) porStatus[l.status ?? "(sem status)"] = (porStatus[l.status ?? "(sem status)"] ?? 0) + 1;
  return {
    linhas: linhas.length,
    brutoParcelasCentavos: soma((l) => l.brutoParcelaCentavos),
    liquidoRepasseCentavos: soma((l) => l.liquidoRepasseCentavos),
    taxaAdmCentavos: soma((l) => l.taxaAdmCentavos),
    comDataDoRepasse: linhas.filter((l) => !!l.dataFuturaPagamento).length,
    comTaxa: linhas.filter((l) => l.taxaAdmCentavos != null).length,
    porStatus,
    primeiroRepasse: datas[0] ?? null,
    ultimoRepasse: datas[datas.length - 1] ?? null,
  };
}
