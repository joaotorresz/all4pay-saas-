import { validateCNPJ, validateCPF } from "@/lib/validators";

/**
 * COBRANÇA POR PIX E BOLETO PELA CONTA PINBANK — as regras puras
 * (`pinbank-cobranca/1.0.0`). Monta o pedido, lê a resposta e diz o que cada
 * situação significa. Nada aqui fala com a rede nem com o banco.
 *
 * ⚠️ **Valor, vencimento e o código de quem RECEBE vêm da RESERVA** — que o
 * banco leu do título e do vínculo (`pinbank_cobranca_reservar`). O pedido da
 * tela só diz QUAL título e QUAL tipo; nada do que ela manda vira dinheiro.
 *
 * ⚠️ **O que se sabe, o que não se sabe** (perguntas abertas à Pinbank, em
 * `docs/rodada-10/cobranca.md`): o formato de data do boleto, o sentido de
 * `SegundosExpiracao`, e se o `CodigoCliente` da conta é o do extrato. As
 * escolhas abaixo estão nomeadas para mudar num lugar só.
 */

export const VERSAO_COBRANCA = "pinbank-cobranca/1.0.0";

export type TipoCobranca = "pix" | "boleto";
export const TIPOS_COBRANCA: readonly TipoCobranca[] = ["pix", "boleto"];

export type SituacaoCobranca = "reservada" | "emitida" | "falhou" | "incerta" | "a_cancelar" | "paga" | "cancelada";

/** O pagador, como o cadastro o tem (o banco o devolve na reserva). */
export interface DevedorCobranca {
  nome: string | null;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

/** O que `pinbank_cobranca_reservar` devolve. */
export type ReservaCobranca =
  | { existente: true; id: string }
  | {
      existente: false;
      id: string;
      tipo: TipoCobranca;
      nsuOrigem: number;
      codigoCliente: number;
      /** Em reais, com centavos. */
      valor: number;
      /** AAAA-MM-DD. */
      vencimento: string;
      descricao: string | null;
      devedor: DevedorCobranca | null;
    };

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const texto = (v: unknown, max = 500): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : typeof v === "number" && Number.isFinite(v) ? String(v) : null;
const inteiro = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isSafeInteger(n) ? n : null;
};
const digitos = (v: string | null): string => (v ?? "").replace(/\D/g, "");
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Lê a reserva que o banco devolveu. Forma errada lança: não se monta pedido sobre ela. */
export function lerReservaCobranca(v: unknown): ReservaCobranca {
  if (!obj(v) || typeof v.id !== "string") throw new Error("Reserva de cobrança ilegível.");
  if (v.existente === true) return { existente: true, id: v.id };
  const tipo = v.tipo === "pix" || v.tipo === "boleto" ? v.tipo : null;
  const nsuOrigem = inteiro(v.nsuOrigem);
  const codigoCliente = inteiro(v.codigoCliente);
  const valor = typeof v.valor === "number" ? v.valor : Number(v.valor);
  const vencimento = typeof v.vencimento === "string" && DATA.test(v.vencimento) ? v.vencimento : null;
  if (!tipo || nsuOrigem == null || codigoCliente == null || !(valor > 0) || !vencimento) {
    throw new Error("Reserva de cobrança incompleta.");
  }
  const d = obj(v.devedor) ? v.devedor : null;
  return {
    existente: false,
    id: v.id,
    tipo,
    nsuOrigem,
    codigoCliente,
    valor: Math.round(valor * 100) / 100,
    vencimento,
    descricao: texto(v.descricao, 140),
    devedor: d
      ? {
          nome: texto(d.nome, 100),
          documento: texto(d.documento, 20),
          email: texto(d.email, 120),
          telefone: texto(d.telefone, 30),
          cep: texto(d.cep, 12),
          logradouro: texto(d.logradouro, 120),
          numero: texto(d.numero, 20),
          complemento: texto(d.complemento, 60),
          bairro: texto(d.bairro, 60),
          cidade: texto(d.cidade, 60),
          uf: texto(d.uf, 2),
        }
      : null,
  };
}

function documentoValido(doc: string): boolean {
  return doc.length === 11 ? validateCPF(doc) : doc.length === 14 ? validateCNPJ(doc) : false;
}

/**
 * O que FALTA no cadastro do pagador para emitir. Vazio = pode emitir.
 * Pix pede nome e CPF/CNPJ válido (o QR identifica quem deve); o boleto pede
 * também o endereço, que vai impresso e é exigido no registro.
 */
export function problemasDoDevedor(tipo: TipoCobranca, d: DevedorCobranca | null): string[] {
  if (!d) return ["O título não tem cliente cadastrado."];
  const p: string[] = [];
  if (!d.nome) p.push("o nome do cliente");
  if (!documentoValido(digitos(d.documento))) p.push("um CPF ou CNPJ válido");
  if (tipo === "boleto") {
    if (digitos(d.cep).length !== 8) p.push("o CEP");
    if (!d.logradouro) p.push("o endereço");
    if (!d.bairro) p.push("o bairro");
    if (!d.cidade) p.push("a cidade");
    if (!/^[A-Za-z]{2}$/.test(d.uf ?? "")) p.push("a UF");
  }
  return p.length ? [`Complete no cadastro do cliente: ${p.join(", ")}.`] : [];
}

/**
 * O vencimento como a Pinbank o pede. O Pix documenta ISO com hora; o fim do
 * dia de São Paulo (23:59:59, −03:00) deixa o QR valer o dia inteiro do
 * vencimento. ⚠️ O boleto não documenta o formato: vai `AAAA-MM-DD` (pergunta
 * aberta à Pinbank — trocar aqui).
 */
export function vencimentoPix(dia: string): string {
  return `${dia}T23:59:59.000-03:00`;
}
export function vencimentoBoleto(dia: string): string {
  return dia;
}

type Reservada = Extract<ReservaCobranca, { existente: false }>;

/** O `Data` do `Pix/SolicitarDynamicQrCode`. */
export function pedidoQrCodeDinamico(r: Reservada, canal: number): Record<string, unknown> {
  const d = r.devedor;
  return {
    CodigoCanal: canal,
    CodigoCliente: r.codigoCliente,
    ValorQrCode: r.valor,
    NsuOrigem: r.nsuOrigem,
    DataVencimento: vencimentoPix(r.vencimento),
    // Pago depois do vencimento ainda é pago: recusar só empurraria o cliente
    // para outro meio, e o título continuaria em aberto.
    PermitirPagamentoAposExpiracao: true,
    // O valor é o do título; o pagador não escolhe quanto paga.
    PermitirAlterarValorPagamento: false,
    Devedor: { CpfCnpj: digitos(d?.documento ?? null), Nome: d?.nome ?? "", AceitaApenasTitular: false },
    ...(r.descricao ? { InfoAdicionais: [{ Nome: "Referência", Valor: r.descricao.slice(0, 70) }] } : {}),
  };
}

/** O `Data` do `CashIn/GerarBoleto`. */
export function pedidoBoleto(r: Reservada, canal: number): Record<string, unknown> {
  const d = r.devedor;
  const endereco = [d?.logradouro, d?.numero, d?.complemento].filter(Boolean).join(", ");
  return {
    CodigoCanal: canal,
    CodigoCliente: r.codigoCliente,
    DataVencimento: vencimentoBoleto(r.vencimento),
    Valor: r.valor,
    ...(d?.email ? { Email: d.email } : {}),
    DadosSacado: {
      CpfCnpj: digitos(d?.documento ?? null),
      Nome: d?.nome ?? "",
      Endereco: endereco,
      Bairro: d?.bairro ?? "",
      Cidade: d?.cidade ?? "",
      Cep: Number(digitos(d?.cep ?? null)),
      Uf: (d?.uf ?? "").toUpperCase(),
    },
    // O NSU da reserva identifica a cobrança na volta (o webhook da baixa).
    IdentificadorCliente: String(r.nsuOrigem),
    RetornarBase64: false,
    ...(r.descricao ? { Instrucoes: r.descricao.slice(0, 200) } : {}),
  };
}

/** O que vai para `pinbank_cobranca_registrar` (o banco confere de novo). */
export type ResultadoCobranca =
  | { situacao: "emitida"; pinbankId?: string | null; txid?: string | null; textoQrCode?: string | null;
      qrCodeUrl?: string | null; linhaDigitavel?: string | null; codigoBarras?: string | null }
  | { situacao: "falhou" | "incerta"; motivo: string };

/** O código e a mensagem da Pinbank, e os erros de validação (campo + mensagem). */
function envelopeDaResposta(aberto: unknown) {
  const env = obj(aberto) ? aberto : {};
  const val = obj(env.ValidationData) ? env.ValidationData : {};
  const erros = (Array.isArray(val.Errors) ? val.Errors : [])
    .filter(obj)
    .slice(0, 10)
    .map((e) => [texto(e.FieldName, 60), texto(e.ErrorMessage, 200)].filter(Boolean).join(": "))
    .filter(Boolean);
  const codigo = inteiro(env.ResultCode) ?? inteiro(val.ResultCode);
  const mensagem = texto(env.Message, 200) ?? texto(val.Message, 200);
  const dados = obj(env.Data) ? env.Data : null;
  return { codigo, mensagem, erros, dados };
}

const recusa = (mensagem: string | null, erros: string[]): ResultadoCobranca => ({
  situacao: "falhou",
  motivo: `A Pinbank recusou a cobrança${mensagem ? `: ${mensagem}` : ""}${erros.length ? ` (${erros.join("; ")})` : ""}.`.slice(0, 500),
});

/**
 * Lê a resposta (já aberta) do QR ou do boleto.
 *
 * ⚠️ Recusa CLARA (código ≠ 0 ou erro de validação) é `falhou`: nada foi criado,
 * pode tentar de novo depois de corrigir. Sucesso SEM o dado que se mostra ao
 * cliente (o copia-e-cola, a linha digitável) é `incerta`: a Pinbank pode ter
 * criado a cobrança — tentar de novo arrisca duas.
 */
export function lerRespostaCobranca(tipo: TipoCobranca, aberto: unknown): ResultadoCobranca {
  const { codigo, mensagem, erros, dados } = envelopeDaResposta(aberto);
  if (erros.length || (codigo != null && codigo !== 0)) return recusa(mensagem, erros);
  if (!dados) return { situacao: "incerta", motivo: "A Pinbank respondeu sem os dados da cobrança." };
  if (tipo === "pix") {
    const textoQrCode = texto(dados.TextoQrCode, 1000);
    if (!textoQrCode) return { situacao: "incerta", motivo: "A Pinbank respondeu sem o Pix copia e cola." };
    const url = texto(dados.QrCodeURL, 1000) ?? texto(dados.QrCodePixLink, 1000);
    return {
      situacao: "emitida",
      pinbankId: texto(dados.PinbankQrCodeId, 100),
      txid: texto(dados.TxId, 100),
      textoQrCode,
      qrCodeUrl: url && /^https:\/\//i.test(url) ? url : null,
    };
  }
  const linha = digitos(texto(dados.LinhaDigitavel, 80));
  if (!/^\d{47,48}$/.test(linha)) return { situacao: "incerta", motivo: "A Pinbank respondeu sem uma linha digitável legível." };
  const barras = digitos(texto(dados.CodigoBarras, 80));
  return {
    situacao: "emitida",
    pinbankId: texto(dados.NossoNumero, 100),
    linhaDigitavel: linha,
    codigoBarras: /^\d{44}$/.test(barras) ? barras : null,
  };
}

/** Como a tela fala de cada situação. */
export const FRASE_DA_SITUACAO: Record<SituacaoCobranca, string> = {
  reservada: "Gerando a cobrança…",
  emitida: "Pronta para enviar ao cliente.",
  falhou: "A Pinbank recusou; corrija e gere de novo.",
  incerta: "A Pinbank não confirmou. Ela pode existir, então nada novo é gerado até a conferência.",
  a_cancelar: "O título mudou depois da emissão. Esta cobrança precisa ser cancelada antes de uma nova.",
  paga: "Paga.",
  cancelada: "Cancelada.",
};

/** A linha digitável com os espaços de leitura (5.5 5.6 5.6 1 14). */
export function linhaDigitavelLegivel(l: string): string {
  const d = digitos(l);
  if (d.length !== 47) return d;
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d.slice(32, 33)} ${d.slice(33)}`;
}
