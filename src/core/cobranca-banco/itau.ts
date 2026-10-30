import type { PedidoCobrancaBanco, ResultadoCobrancaBanco } from "@/core/cobranca-banco";

/**
 * O ITAÚ — as regras puras do boleto com Pix (o "bolecode") (`itau-cobranca/1.0.0`).
 * Monta o pedido, lê as respostas e o aviso. Nada aqui fala com a rede.
 *
 * Etapa 2 de `docs/rodada-11/cobranca-itau.md`. O desenho é o do Inter, com as
 * diferenças do Itaú:
 *
 * ⚠️ **A emissão do Itaú é SÍNCRONA.** O `POST /boletos_pix` já devolve a
 * linha digitável e o copia-e-cola. Uma resposta 2xx sem eles NÃO é
 * "processando" (no Inter era): é `incerta`, porque o título pode ter sido
 * registrado e só a consulta pelo nosso número diz.
 *
 * ⚠️ **O NOSSO NÚMERO É DA EMPRESA, não do banco.** Na carteira do Itaú são 8
 * dígitos que a empresa escolhe e que não podem repetir. Este módulo não
 * inventa número: ele o RECEBE de quem reserva (etapa 4) e recusa o que não
 * tiver 8 dígitos. Derivar do texto do título repetiria número entre títulos.
 *
 * ⚠️ **O valor vai como TEXTO de 17 dígitos em centavos** (R$ 150,46 →
 * "00000000000015046"). Mandar número, ou reais com vírgula, é recusa do
 * banco; mandar reais sem multiplicar por 100 cobra cem vezes menos.
 *
 * ⚠️ **O aviso do Itaú não é prova de pagamento**, pelo mesmo motivo do Inter:
 * `lerAvisoItau` devolve SÓ os identificadores, e a situação é lida de novo
 * na consulta, com a nossa credencial.
 *
 * ⚠️ Os NOMES dos campos seguem a documentação pública da API de cobrança do
 * Itaú (cash management v2 e boletos_pix). Eles são conferidos contra o
 * sandbox do Itaú na etapa 3, antes de qualquer chamada de verdade; se algum
 * mudar, muda aqui e na guarda, num lugar só.
 */

export const VERSAO_ITAU = "itau-cobranca/1.0.0";

export type AmbienteItau = "sandbox" | "producao";

/** As bases do Itaú — nunca uma URL livre vinda de variável. */
export const BASES_ITAU: Record<AmbienteItau, { token: string; api: string }> = {
  sandbox: { token: "https://sandbox.devportal.itau.com.br", api: "https://sandbox.devportal.itau.com.br" },
  producao: { token: "https://sts.itau.com.br", api: "https://secure.api.itau" },
};

/**
 * Os ÚNICOS caminhos que o cliente chama. Tudo emite, lê ou baixa cobrança
 * para RECEBER; nada paga, transfere ou faz Pix de saída (guarda com teto zero).
 */
export const CAMINHOS_ITAU: readonly RegExp[] = [
  /^\/api\/oauth\/token$/,
  /^\/api\/oauth\/jwt$/,
  /^\/pix_recebimentos_conciliacoes\/v2\/boletos_pix$/,
  /^\/boletoscash\/v2\/boletos\?[A-Za-z0-9=&%._-]+$/,
  /^\/boletoscash\/v2\/boletos\/\d{20,30}\/baixa$/,
];

/**
 * O caminho do token POR AMBIENTE. Produção é o STS (`/api/oauth/token`); o
 * sandbox do portal é `/api/oauth/jwt` — medido em 30/10/2026: `/token` deu
 * 403 e o "gerar token" do portal faz POST em `/jwt` e recebe 200 com as
 * mesmas credenciais.
 */
export const TOKEN_ITAU: Record<AmbienteItau, string> = { sandbox: "/api/oauth/jwt", producao: "/api/oauth/token" };

/**
 * O que o Itaú disse ao recusar, para a tela de teste: `error_description`,
 * `error`, `message`/`mensagem` do JSON ou o começo do corpo cru (página de
 * bloqueio). Curto, uma linha. Nunca leva o que NÓS enviamos.
 */
export function motivoDoItau(corpo: unknown, bruto: string | null | undefined): string | null {
  if (obj(corpo)) {
    for (const k of ["error_description", "error", "message", "mensagem", "detail", "title"]) {
      const t = texto(corpo[k], 200);
      if (t) return t.replace(/\s+/g, " ");
    }
  }
  const b = (bruto ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return b ? b.slice(0, 200) : null;
}

export function caminhoPermitidoItau(caminho: string): boolean {
  return CAMINHOS_ITAU.some((r) => r.test(caminho));
}

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const texto = (v: unknown, max = 500): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const digitos = (v: string | null | undefined): string => (v ?? "").replace(/\D/g, "");
const corta = (s: string | null | undefined, n: number) => (s ?? "").trim().slice(0, n);
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(obj) : []);

/** O corpo do token (form-urlencoded). O segredo só existe aqui e na rede. */
export function corpoTokenItau(clientId: string, clientSecret: string): string {
  return new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  }).toString();
}

/** Lê a resposta do token. Sem `access_token`, lança — não se chama a API sem ele. */
export function lerTokenItau(v: unknown): { token: string; expiraEmSegundos: number } {
  if (!obj(v) || typeof v.access_token !== "string" || !v.access_token) throw new Error("O Itaú não devolveu o token.");
  const exp = typeof v.expires_in === "number" && v.expires_in > 0 ? v.expires_in : 300;
  return { token: v.access_token, expiraEmSegundos: exp };
}

/** O que o Itaú pede da conta que recebe: vem da conexão, nunca do pedido. */
export interface ContaItau {
  /** 4 dígitos. */
  agencia: string;
  /** 7 dígitos, sem o DAC. */
  conta: string;
  /** O dígito da conta (DAC), 1 dígito. */
  dac: string;
  /** A carteira de cobrança contratada (3 dígitos, ex.: 109). */
  carteira: string;
  /** A chave Pix da conta, que entra no QR do boleto. */
  chavePix: string;
}

/** Os problemas da conta, em frase. Vazio = pode emitir. */
export function problemasDaContaItau(c: ContaItau): string[] {
  const p: string[] = [];
  if (!/^\d{4}$/.test(digitos(c.agencia))) p.push("A agência do Itaú tem 4 dígitos.");
  if (!/^\d{1,7}$/.test(digitos(c.conta))) p.push("A conta do Itaú tem até 7 dígitos, sem o dígito.");
  if (!/^\d$/.test(digitos(c.dac))) p.push("Falta o dígito da conta.");
  if (!/^\d{3}$/.test(digitos(c.carteira))) p.push("A carteira de cobrança tem 3 dígitos.");
  if (!corta(c.chavePix, 77)) p.push("Falta a chave Pix da conta, que vai no QR do boleto.");
  return p;
}

/** O beneficiário do Itaú: agência (4) + conta (7) + DAC (1), 12 dígitos. */
export function idBeneficiarioItau(c: ContaItau): string {
  return `${digitos(c.agencia).padStart(4, "0")}${digitos(c.conta).padStart(7, "0")}${digitos(c.dac)}`;
}

/** Reais → 17 dígitos em centavos. Lança fora de faixa: o banco cobraria outro valor. */
export function valorItau(reais: number): string {
  const centavos = Math.round(reais * 100);
  if (!Number.isFinite(centavos) || centavos <= 0 || centavos > 999_999_999_99) throw new Error("Valor inválido para o Itaú.");
  return String(centavos).padStart(17, "0");
}

/** O nosso número do Itaú: exatamente 8 dígitos, dados por quem reserva. */
export function nossoNumeroValido(n: string): boolean {
  return /^\d{8}$/.test(n);
}

/**
 * O pedido do boleto com Pix. Quem chama já conferiu `problemasDoPedido` e
 * `problemasDaContaItau`: aqui só se traduz. `hoje` vem de fora (sem relógio).
 */
export function pedidoCobrancaItau(
  p: PedidoCobrancaBanco,
  conta: ContaItau,
  nossoNumero: string,
  hoje: string,
): Record<string, unknown> {
  if (!nossoNumeroValido(nossoNumero)) throw new Error("O nosso número do Itaú tem 8 dígitos.");
  const d = p.devedor;
  const doc = digitos(d?.documento);
  const pj = doc.length === 14;
  const valor = valorItau(p.valor);
  return {
    etapa_processo_boleto: "efetivacao",
    beneficiario: { id_beneficiario: idBeneficiarioItau(conta) },
    dado_boleto: {
      descricao_instrumento_cobranca: "boleto_pix",
      tipo_boleto: "a vista",
      codigo_carteira: digitos(conta.carteira),
      valor_total_titulo: valor,
      codigo_especie: "01",
      data_emissao: hoje,
      pagador: {
        pessoa: {
          nome_pessoa: corta(d?.nome, 50),
          tipo_pessoa: pj
            ? { codigo_tipo_pessoa: "J", numero_cadastro_nacional_pessoa_juridica: doc }
            : { codigo_tipo_pessoa: "F", numero_cadastro_pessoa_fisica: doc },
        },
        endereco: {
          nome_logradouro: corta([d?.logradouro, d?.numero].filter(Boolean).join(", "), 45),
          nome_bairro: corta(d?.bairro, 15),
          nome_cidade: corta(d?.cidade, 20),
          sigla_UF: corta(d?.uf, 2).toUpperCase(),
          numero_CEP: digitos(d?.cep),
        },
      },
      dados_individuais_boleto: [
        {
          numero_nosso_numero: nossoNumero,
          data_vencimento: p.vencimento,
          valor_titulo: valor,
          texto_seu_numero: p.seuNumero,
          // Pago até 60 dias depois do vencimento ainda é pago, como no Inter.
          data_limite_pagamento: somaDias(p.vencimento, 60),
        },
      ],
      ...(p.descricao ? { lista_mensagem_cobranca: [{ mensagem: corta(p.descricao, 80) }] } : {}),
    },
    dados_qrcode: { chave: corta(conta.chavePix, 77), tipo_cobranca: "cob" },
  };
}

function somaDias(data: string, n: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  return new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10);
}

/** A recusa do Itaú em frase: `mensagem` e os `campos` (campo + mensagem). */
export function motivoDaRecusaItau(status: number, corpo: unknown): string {
  const c = obj(corpo) ? corpo : {};
  const campos = lista(c.campos)
    .slice(0, 10)
    .map((v) => [texto(v.campo, 60), texto(v.mensagem, 200)].filter(Boolean).join(": "))
    .filter(Boolean);
  const msg = texto(c.mensagem, 200) ?? texto(c.message, 200);
  return `O Itaú recusou a cobrança (${status})${msg ? `: ${msg}` : ""}${campos.length ? ` (${campos.join("; ")})` : ""}.`.slice(0, 500);
}

/** O identificador do título no Itaú: beneficiário (12) + carteira (3) + nosso número (8). */
export function idProvedorItau(c: ContaItau, nossoNumero: string): string {
  return `${idBeneficiarioItau(c)}${digitos(c.carteira)}${nossoNumero}`;
}

/** Linha, código de barras e Pix de um corpo do Itaú (criação e consulta usam o mesmo bloco). */
function oQuePagar(c: Record<string, unknown>) {
  const dado = obj(c.dado_boleto) ? c.dado_boleto : {};
  const ind = lista(dado.dados_individuais_boleto)[0] ?? {};
  const qr = obj(c.dados_qrcode) ? c.dados_qrcode : {};
  const linha = digitos(texto(ind.numero_linha_digitavel, 80));
  const barras = digitos(texto(ind.codigo_barras, 80));
  return {
    nossoNumero: digitos(texto(ind.numero_nosso_numero, 20)),
    linhaDigitavel: /^\d{47}$/.test(linha) ? linha : null,
    codigoBarras: /^\d{44}$/.test(barras) ? barras : null,
    pixCopiaECola: texto(qr.emv, 1000),
    txid: texto(qr.txid, 60),
  };
}

/**
 * Lê a resposta da EMISSÃO.
 *
 * ⚠️ 4xx é recusa clara (`falhou`). 2xx com a linha ou o Pix e o NOSSO
 * número de volta é `emitida`. 2xx sem nada para pagar, com outro nosso
 * número, 5xx ou corpo ilegível é `incerta`: o título pode estar registrado.
 */
export function lerCriacaoItau(status: number, corpo: unknown, conta: ContaItau, nossoNumero: string): ResultadoCobrancaBanco {
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return { situacao: "falhou", motivo: motivoDaRecusaItau(status, corpo) };
  }
  if (status >= 200 && status < 300 && obj(corpo)) {
    const c = obj(corpo.data) ? corpo.data : corpo;
    const q = oQuePagar(c);
    if (q.nossoNumero === nossoNumero && (q.linhaDigitavel || q.pixCopiaECola)) {
      return {
        situacao: "emitida",
        idProvedor: idProvedorItau(conta, nossoNumero),
        linhaDigitavel: q.linhaDigitavel,
        codigoBarras: q.codigoBarras,
        pixCopiaECola: q.pixCopiaECola,
        txid: q.txid,
      };
    }
  }
  return { situacao: "incerta", motivo: `O Itaú não confirmou a cobrança (${status}).` };
}

/** A consulta pelo nosso número (resolve a `incerta` e confere o aviso). */
export function caminhoConsultaItau(conta: ContaItau, nossoNumero: string): string {
  if (!nossoNumeroValido(nossoNumero)) throw new Error("Consulta inválida.");
  const q = new URLSearchParams({
    id_beneficiario: idBeneficiarioItau(conta),
    codigo_carteira: digitos(conta.carteira),
    nosso_numero: nossoNumero,
  });
  return `/boletoscash/v2/boletos?${q.toString()}`;
}

/**
 * Lê a CONSULTA, que é a fonte da verdade. Só aceita UM título com o NOSSO
 * número: outro número, ou mais de um, é `incerta`.
 */
export function lerConsultaItau(corpo: unknown, conta: ContaItau, nossoNumero: string): ResultadoCobrancaBanco {
  const c = obj(corpo) ? corpo : {};
  const achados = lista(c.data).filter((x) => oQuePagar(x).nossoNumero === nossoNumero);
  if (achados.length !== 1) {
    return { situacao: "incerta", motivo: achados.length ? "O Itaú devolveu mais de um título com o mesmo número." : "O Itaú não achou o título." };
  }
  const t = achados[0];
  const id = idProvedorItau(conta, nossoNumero);
  const dado = obj(t.dado_boleto) ? t.dado_boleto : {};
  const ind = lista(dado.dados_individuais_boleto)[0] ?? {};
  const situacao = (texto(ind.situacao_geral_boleto, 40) ?? "").toLowerCase();
  switch (situacao) {
    case "em aberto":
    case "vencido": {
      const q = oQuePagar(t);
      if (!q.linhaDigitavel && !q.pixCopiaECola) return { situacao: "processando", idProvedor: id };
      return { situacao: "emitida", idProvedor: id, linhaDigitavel: q.linhaDigitavel, codigoBarras: q.codigoBarras, pixCopiaECola: q.pixCopiaECola, txid: q.txid };
    }
    case "paga": {
      const pg = lista(dado.pagamentos_cobranca)[0] ?? {};
      const v = Number(digitos(texto(pg.valor_pago_total_cobranca, 20)) || NaN) / 100;
      return {
        situacao: "paga",
        idProvedor: id,
        valorRecebido: Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0,
        // A consulta do boleto não diz por onde entrou (boleto ou Pix): não se adivinha.
        origem: "desconhecida",
        // O Itaú não diz se a baixa foi feita à mão: nunca se afirma que não foi.
        marcadaManualmente: false,
        dataHora: texto(pg.data_inclusao_pagamento, 40),
      };
    }
    case "baixada":
      return { situacao: "cancelada", idProvedor: id, motivo: texto(ind.motivo_baixa, 200) ?? "Baixada no Itaú." };
    default:
      return { situacao: "incerta", motivo: `Situação desconhecida no Itaú: ${situacao || "vazia"}.` };
  }
}

/** O corpo da baixa (cancelar o título no Itaú). */
export function corpoBaixaItau(): Record<string, unknown> {
  return { codigo_baixa: "OUTROS" };
}

/**
 * O aviso do Itaú: só os NOSSOS NÚMEROS citados (8 dígitos, até 100, sem
 * repetir). A situação no corpo é ignorada de propósito — ver o topo.
 */
export function lerAvisoItau(corpo: unknown): string[] {
  const itens = Array.isArray(corpo) ? corpo : obj(corpo) ? (Array.isArray(corpo.data) ? corpo.data : [corpo]) : [];
  const out = new Set<string>();
  for (const x of itens) {
    if (!obj(x)) continue;
    const n = digitos(texto(x.numero_nosso_numero, 20) ?? texto(x.nosso_numero, 20));
    if (nossoNumeroValido(n)) out.add(n);
    if (out.size >= 100) break;
  }
  return Array.from(out);
}
