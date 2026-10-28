import type { PedidoCobrancaBanco, ResultadoCobrancaBanco } from "@/core/cobranca-banco";

/**
 * O BANCO INTER — as regras puras da API de Cobrança v3 (`inter-cobranca/1.0.0`).
 * Monta o pedido, lê as respostas e o aviso do webhook. Nada aqui fala com a rede.
 *
 * A API v3 emite o BOLETO COM O PIX numa chamada só: o mesmo título sai com a
 * linha digitável E o copia-e-cola, e o cliente paga pelo que preferir. O
 * dinheiro cai na conta Inter da empresa.
 *
 * ⚠️ **A emissão é ASSÍNCRONA.** O `POST /cobranca/v3/cobrancas` devolve só o
 * `codigoSolicitacao`; a linha digitável e o Pix aparecem na consulta, segundos
 * depois (`EM_PROCESSAMENTO` → `A_RECEBER`). Com o código na mão a cobrança
 * EXISTE: a resposta é `processando`, nunca `falhou`.
 *
 * ⚠️ **O aviso do webhook não é prova de pagamento.** O Inter chama a nossa
 * rota por mTLS, sem assinatura no corpo. Qualquer um que descubra o endereço
 * poderia mandar "RECEBIDO". Por isso `lerAvisoInter` devolve SÓ os códigos, e
 * a situação é lida de novo na API, com a nossa credencial.
 */

export const VERSAO_INTER = "inter-cobranca/1.0.0";

export type AmbienteInter = "sandbox" | "producao";

/** As bases do Inter — nunca uma URL livre vinda de variável. */
export const BASES_INTER: Record<AmbienteInter, string> = {
  sandbox: "https://cdpj-sandbox.partners.uatinter.co",
  producao: "https://cdpj.partners.bancointer.com.br",
};

/** Só ler e escrever cobrança: o token não ganha escopo de pagamento nem de extrato. */
export const ESCOPOS_INTER = "boleto-cobranca.read boleto-cobranca.write";

/**
 * Os ÚNICOS caminhos que o cliente chama. Tudo cria, lê ou cancela cobrança
 * para RECEBER; nada paga, transfere ou faz Pix de saída (guarda com teto zero).
 */
export const CAMINHOS_INTER: readonly RegExp[] = [
  /^\/oauth\/v2\/token$/,
  /^\/cobranca\/v3\/cobrancas$/,
  /^\/cobranca\/v3\/cobrancas\?[A-Za-z0-9=&%._-]+$/,
  /^\/cobranca\/v3\/cobrancas\/[0-9a-f-]{36}$/,
  /^\/cobranca\/v3\/cobrancas\/[0-9a-f-]{36}\/cancelar$/,
];

export function caminhoPermitidoInter(caminho: string): boolean {
  return CAMINHOS_INTER.some((r) => r.test(caminho));
}

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const texto = (v: unknown, max = 500): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const digitos = (v: string | null | undefined): string => (v ?? "").replace(/\D/g, "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const corta = (s: string | null | undefined, n: number) => (s ?? "").trim().slice(0, n);

/** O corpo do token (form-urlencoded). O segredo só existe aqui e na rede. */
export function corpoTokenInter(clientId: string, clientSecret: string): string {
  return new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: ESCOPOS_INTER,
  }).toString();
}

/** Lê a resposta do token. Sem `access_token`, lança — não se chama a API sem ele. */
export function lerTokenInter(v: unknown): { token: string; expiraEmSegundos: number } {
  if (!obj(v) || typeof v.access_token !== "string" || !v.access_token) throw new Error("O Inter não devolveu o token.");
  const exp = typeof v.expires_in === "number" && v.expires_in > 0 ? v.expires_in : 3600;
  return { token: v.access_token, expiraEmSegundos: exp };
}

/**
 * O pedido de cobrança (boleto com Pix). Quem chama já conferiu
 * `problemasDoPedido`: aqui só se traduz.
 */
export function pedidoCobrancaInter(p: PedidoCobrancaBanco): Record<string, unknown> {
  const d = p.devedor;
  const doc = digitos(d?.documento);
  const tel = digitos(d?.telefone);
  return {
    seuNumero: p.seuNumero,
    valorNominal: Math.round(p.valor * 100) / 100,
    dataVencimento: p.vencimento,
    // Pago até 60 dias depois do vencimento ainda é pago: recusar empurraria o
    // cliente para outro meio e o título continuaria em aberto.
    numDiasAgenda: 60,
    pagador: {
      cpfCnpj: doc,
      tipoPessoa: doc.length === 14 ? "JURIDICA" : "FISICA",
      nome: corta(d?.nome, 100),
      endereco: corta(d?.logradouro, 100),
      ...(d?.numero ? { numero: corta(d.numero, 10) } : {}),
      ...(d?.complemento ? { complemento: corta(d.complemento, 30) } : {}),
      bairro: corta(d?.bairro, 60),
      cidade: corta(d?.cidade, 60),
      uf: corta(d?.uf, 2).toUpperCase(),
      cep: digitos(d?.cep),
      ...(d?.email ? { email: corta(d.email, 50) } : {}),
      ...(tel.length === 10 || tel.length === 11 ? { ddd: tel.slice(0, 2), telefone: tel.slice(2) } : {}),
    },
    ...(p.descricao ? { mensagem: { linha1: corta(p.descricao, 78) } } : {}),
  };
}

/** A recusa do Inter em frase: `title`/`detail` e as `violacoes` (campo + razão). */
export function motivoDaRecusaInter(status: number, corpo: unknown): string {
  const c = obj(corpo) ? corpo : {};
  const viol = (Array.isArray(c.violacoes) ? c.violacoes : [])
    .filter(obj)
    .slice(0, 10)
    .map((v) => [texto(v.propriedade, 60), texto(v.razao, 200)].filter(Boolean).join(": "))
    .filter(Boolean);
  const msg = texto(c.detail, 200) ?? texto(c.title, 200);
  return `O Inter recusou a cobrança (${status})${msg ? `: ${msg}` : ""}${viol.length ? ` (${viol.join("; ")})` : ""}.`.slice(0, 500);
}

/**
 * Lê a resposta da CRIAÇÃO.
 *
 * ⚠️ 4xx é recusa clara (`falhou`). 2xx com o `codigoSolicitacao` é
 * `processando` — a cobrança existe. 2xx sem o código, 5xx ou corpo ilegível
 * é `incerta`: pode existir, e só a busca pelo nosso número diz.
 */
export function lerCriacaoInter(status: number, corpo: unknown): ResultadoCobrancaBanco {
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return { situacao: "falhou", motivo: motivoDaRecusaInter(status, corpo) };
  }
  if (status >= 200 && status < 300 && obj(corpo) && typeof corpo.codigoSolicitacao === "string" && UUID.test(corpo.codigoSolicitacao)) {
    return { situacao: "processando", idProvedor: corpo.codigoSolicitacao.toLowerCase() };
  }
  return { situacao: "incerta", motivo: `O Inter não confirmou a cobrança (${status}).` };
}

/**
 * Lê a CONSULTA (`GET /cobranca/v3/cobrancas/{codigo}`), que é a fonte da
 * verdade — inclusive depois de um aviso do webhook.
 */
export function lerConsultaInter(corpo: unknown): ResultadoCobrancaBanco {
  const c = obj(corpo) ? corpo : {};
  const cob = obj(c.cobranca) ? c.cobranca : {};
  const id = typeof cob.codigoSolicitacao === "string" && UUID.test(cob.codigoSolicitacao) ? cob.codigoSolicitacao.toLowerCase() : null;
  if (!id) return { situacao: "incerta", motivo: "O Inter respondeu sem o código da cobrança." };
  const situacao = texto(cob.situacao, 40);
  switch (situacao) {
    case "EM_PROCESSAMENTO":
      return { situacao: "processando", idProvedor: id };
    case "A_RECEBER":
    case "ATRASADO": {
      const bol = obj(c.boleto) ? c.boleto : {};
      const pix = obj(c.pix) ? c.pix : {};
      const linha = digitos(texto(bol.linhaDigitavel, 80));
      const barras = digitos(texto(bol.codigoBarras, 80));
      const copia = texto(pix.pixCopiaECola, 1000);
      const linhaOk = /^\d{47}$/.test(linha) ? linha : null;
      // Emitida sem nada para o cliente pagar não é emitida: o boleto ainda vem.
      if (!linhaOk && !copia) return { situacao: "processando", idProvedor: id };
      return {
        situacao: "emitida",
        idProvedor: id,
        linhaDigitavel: linhaOk,
        codigoBarras: /^\d{44}$/.test(barras) ? barras : null,
        pixCopiaECola: copia,
        txid: texto(pix.txid, 60),
      };
    }
    case "RECEBIDO":
    case "MARCADO_RECEBIDO": {
      const v = typeof cob.valorTotalRecebido === "number" ? cob.valorTotalRecebido : Number(cob.valorTotalRecebido);
      const origem = cob.origemRecebimento === "BOLETO" ? "boleto" : cob.origemRecebimento === "PIX" ? "pix" : "desconhecida";
      return {
        situacao: "paga",
        idProvedor: id,
        valorRecebido: Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0,
        origem,
        marcadaManualmente: situacao === "MARCADO_RECEBIDO",
        dataHora: texto(cob.dataSituacao, 40) ?? texto(cob.dataHoraSituacao, 40),
      };
    }
    case "CANCELADO":
      return { situacao: "cancelada", idProvedor: id, motivo: texto(cob.motivoCancelamento, 200) ?? "Cancelada no Inter." };
    case "EXPIRADO":
      return { situacao: "cancelada", idProvedor: id, motivo: "Venceu o prazo de pagamento depois do vencimento." };
    case "FALHA_EMISSAO":
      return { situacao: "falhou", motivo: "O Inter não conseguiu emitir esta cobrança." };
    default:
      return { situacao: "incerta", motivo: `Situação desconhecida no Inter: ${situacao ?? "vazia"}.` };
  }
}

/** A busca pelo nosso número (para resolver a `incerta`): uma janela larga em volta do vencimento. */
export function caminhoBuscaPorSeuNumero(seuNumero: string, vencimento: string): string {
  if (!/^[A-Za-z0-9]{1,15}$/.test(seuNumero) || !/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) {
    throw new Error("Busca inválida.");
  }
  const d = new Date(`${vencimento}T12:00:00Z`);
  const de = new Date(d.getTime() - 400 * 86400000).toISOString().slice(0, 10);
  const ate = new Date(d.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const q = new URLSearchParams({ dataInicial: de, dataFinal: ate, filtrarDataPor: "VENCIMENTO", seuNumero });
  return `/cobranca/v3/cobrancas?${q.toString()}`;
}

/** Da lista da busca, o código da cobrança com o NOSSO número — só se for UMA. */
export function codigoDaBuscaInter(corpo: unknown, seuNumero: string): string | null {
  const c = obj(corpo) ? corpo : {};
  const lista = (Array.isArray(c.cobrancas) ? c.cobrancas : []).filter(obj);
  const achadas = lista
    .map((x) => (obj(x.cobranca) ? x.cobranca : x))
    .filter((x) => x.seuNumero === seuNumero && typeof x.codigoSolicitacao === "string" && UUID.test(x.codigoSolicitacao));
  return achadas.length === 1 ? String(achadas[0].codigoSolicitacao).toLowerCase() : null;
}

/** O corpo do cancelamento. */
export function corpoCancelamentoInter(motivo: string): Record<string, unknown> {
  return { motivoCancelamento: corta(motivo, 50) || "Título alterado" };
}

/**
 * O aviso do webhook: só os CÓDIGOS das cobranças citadas (até 100, sem
 * repetir). A situação no corpo é ignorada de propósito — ver o topo.
 */
export function lerAvisoInter(corpo: unknown): string[] {
  const lista = Array.isArray(corpo) ? corpo : obj(corpo) ? [corpo] : [];
  const out = new Set<string>();
  for (const x of lista) {
    if (!obj(x)) continue;
    const id = typeof x.codigoSolicitacao === "string" ? x.codigoSolicitacao.toLowerCase() : "";
    if (UUID.test(id)) out.add(id);
    if (out.size >= 100) break;
  }
  return Array.from(out);
}
