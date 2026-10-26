/**
 * NFS-e PELA FOCUS NFe — as regras puras da emissão real.
 *
 * O provedor (Focus NFe, decisão do dono em 22/10/2026) fala com a prefeitura;
 * este arquivo traduz a nota do sistema no pedido da API (`POST /v2/nfse`) e a
 * resposta da consulta (`GET /v2/nfse/{ref}`) de volta no estado da nota. Puro,
 * tipado, sem rede, sem relógio, sem variável de ambiente: quem lê o ambiente
 * é `lib/focusnfe`, e passa o que leu para cá.
 *
 * ⚠️ **QUEM EMITE VEM DA PLATAFORMA, NUNCA DA EMPRESA.** A conta da Focus é UMA,
 * a da Quattro, e cada cliente é uma "empresa emitente" dentro dela. O CNPJ do
 * prestador no pedido decide em nome de QUEM a prefeitura emite — se ele saísse
 * do cadastro que a própria empresa edita, qualquer empresa digitaria o CNPJ de
 * outra e emitiria nota em nome dela com o certificado alheio. O emitente sai
 * do vínculo que a PLATAFORMA declarou para a organização (`FOCUS_NFE_EMITENTES`,
 * até a tela de cadastro da etapa 2), e o pedido só traz o id da nota.
 *
 * ⚠️ **A emissão é ASSÍNCRONA.** O `201` diz "recebi", não "autorizei": a nota
 * fica processando até a prefeitura responder, e a resposta chega pela
 * consulta. Ler o `201` como autorização lançaria receita de nota que a
 * prefeitura pode recusar.
 */

export const NFSE_FOCUS_VERSION = "nfse-focus/1.0.0";

export type AmbienteFocus = "homologacao" | "producao";

export const BASE_FOCUS: Record<AmbienteFocus, string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

/** O emitente que a PLATAFORMA vinculou a uma organização. */
export interface EmitenteFocus {
  cnpj: string;
  inscricaoMunicipal: string;
  /** Código IBGE de 7 dígitos do município do prestador (onde a nota é emitida). */
  codigoMunicipio: string;
  optanteSimples: boolean;
  /** "1"–"6" da Focus; ausente quando não há regime especial. */
  regimeEspecial?: string;
  /**
   * O código do serviço NA PREFEITURA. Em São Paulo é o código municipal de 5
   * dígitos, não o item da LC 116 — quando a plataforma o declara, ele vence o
   * da nota.
   */
  itemListaServico?: string;
  codigoTributarioMunicipio?: string;
  codigoCnae?: string;
}

const so = (s: unknown) => (typeof s === "string" ? s.replace(/\D/g, "") : typeof s === "number" ? String(s) : "");
const texto = (s: unknown) => (typeof s === "string" ? s.trim() : "");

/**
 * Lê o mapa `organização → emitente` que a plataforma declarou.
 *
 * Entrada ilegível ou emitente incompleto NÃO entram: um emitente sem
 * inscrição municipal é uma nota que a prefeitura recusa, e um CNPJ com
 * dígitos a menos é o de outra empresa. Devolve também os problemas, para o
 * log do servidor dizer qual linha da configuração está errada.
 */
export function lerEmitentes(bruto: string | undefined | null): { emitentes: Record<string, EmitenteFocus>; problemas: string[] } {
  const emitentes: Record<string, EmitenteFocus> = {};
  const problemas: string[] = [];
  if (!bruto || !bruto.trim()) return { emitentes, problemas };
  let obj: unknown;
  try { obj = JSON.parse(bruto); } catch { return { emitentes, problemas: ["configuração dos emitentes não é JSON"] }; }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { emitentes, problemas: ["configuração dos emitentes não é um objeto"] };
  for (const [org, v] of Object.entries(obj as Record<string, unknown>)) {
    const e = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const cnpj = so(e.cnpj);
    const im = so(e.inscricaoMunicipal);
    const mun = so(e.codigoMunicipio);
    const falta = [
      ...(cnpj.length === 14 ? [] : ["CNPJ"]),
      ...(im ? [] : ["inscrição municipal"]),
      ...(mun.length === 7 ? [] : ["código IBGE do município"]),
    ];
    if (falta.length) { problemas.push(`emitente da organização ${org}: falta ${falta.join(", ")}`); continue; }
    const regime = texto(e.regimeEspecial);
    emitentes[org] = {
      cnpj, inscricaoMunicipal: im, codigoMunicipio: mun,
      optanteSimples: e.optanteSimples === true,
      ...(/^[1-6]$/.test(regime) ? { regimeEspecial: regime } : {}),
      ...(so(e.itemListaServico) ? { itemListaServico: so(e.itemListaServico) } : {}),
      ...(texto(e.codigoTributarioMunicipio) ? { codigoTributarioMunicipio: texto(e.codigoTributarioMunicipio) } : {}),
      ...(so(e.codigoCnae) ? { codigoCnae: so(e.codigoCnae) } : {}),
    };
  }
  return { emitentes, problemas };
}

/** A nota como o banco a guarda (as colunas que a emissão lê). */
export interface NotaParaEmitir {
  id: string;
  descricao: string;
  codigoServico: string;
  valor: number;
  issRetido: boolean;
}

/** O tomador como `parties` o guarda. */
export interface TomadorParaEmitir {
  nome: string;
  documento: string | null;
  email?: string | null;
  telefone?: string | null;
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  uf?: string | null;
}

export interface PedidoFocus {
  data_emissao: string;
  natureza_operacao: "1";
  optante_simples_nacional: boolean;
  regime_especial_tributacao?: string;
  prestador: { cnpj: string; inscricao_municipal: string; codigo_municipio: string };
  tomador: Record<string, unknown>;
  servico: Record<string, unknown>;
}

/**
 * O código do serviço da nota em dígitos: "1.07 — Suporte técnico" → "0107"
 * (o item da LC 116 com o subitem em duas casas, como a Focus pede).
 */
export function itemDaLista(codigo: string): string {
  const m = /^\s*(\d{1,2})\.(\d{1,2})/.exec(codigo ?? "");
  if (m) return `${m[1].padStart(2, "0")}${m[2].padStart(2, "0")}`;
  return so(codigo);
}

/**
 * Monta o pedido de emissão. Devolve os PROBLEMAS em vez de um pedido
 * incompleto: a prefeitura recusaria do mesmo jeito, só que minutos depois e
 * com uma frase que ninguém entende.
 */
export function montarPedido(
  nota: NotaParaEmitir, tomador: TomadorParaEmitir, emitente: EmitenteFocus, agoraISO: string,
): { ok: true; pedido: PedidoFocus } | { ok: false; problemas: string[] } {
  const problemas: string[] = [];
  const doc = so(tomador.documento);
  if (doc.length !== 11 && doc.length !== 14) problemas.push("O cliente da nota não tem CPF ou CNPJ válido no cadastro.");
  if (!texto(tomador.nome)) problemas.push("O cliente da nota está sem nome.");
  if (!(nota.valor > 0)) problemas.push("O valor do serviço tem de ser maior que zero.");
  if (!texto(nota.descricao)) problemas.push("A discriminação do serviço está vazia.");
  const item = emitente.itemListaServico ?? itemDaLista(nota.codigoServico);
  if (!item) problemas.push("A nota está sem código de serviço.");
  if (problemas.length) return { ok: false, problemas };

  const endereco: Record<string, string> = {};
  const add = (k: string, v: unknown, digitos = false) => { const x = digitos ? so(v) : texto(v); if (x) endereco[k] = x; };
  add("logradouro", tomador.rua); add("numero", tomador.numero); add("complemento", tomador.complemento);
  add("bairro", tomador.bairro); add("uf", tomador.uf?.toUpperCase()); add("cep", tomador.cep, true);

  const tomadorPedido: Record<string, unknown> = {
    [doc.length === 14 ? "cnpj" : "cpf"]: doc,
    razao_social: texto(tomador.nome).slice(0, 115),
    ...(texto(tomador.email) ? { email: texto(tomador.email).slice(0, 80) } : {}),
    ...(/^\d{10,11}$/.test(so(tomador.telefone)) ? { telefone: so(tomador.telefone) } : {}),
    ...(Object.keys(endereco).length ? { endereco } : {}),
  };

  return {
    ok: true,
    pedido: {
      data_emissao: agoraISO,
      natureza_operacao: "1",
      optante_simples_nacional: emitente.optanteSimples,
      ...(emitente.regimeEspecial ? { regime_especial_tributacao: emitente.regimeEspecial } : {}),
      prestador: { cnpj: emitente.cnpj, inscricao_municipal: emitente.inscricaoMunicipal, codigo_municipio: emitente.codigoMunicipio },
      tomador: tomadorPedido,
      servico: {
        // ⚠️ Sem alíquota nem valor do ISS: a prefeitura calcula o imposto pelo
        // código do serviço e pelo cadastro do prestador. Mandar a alíquota da
        // tela (um número que a empresa digita) faria a nota divergir do que a
        // prefeitura apura — e em vários municípios ela recusa a divergência.
        valor_servicos: Math.round(nota.valor * 100) / 100,
        iss_retido: nota.issRetido,
        item_lista_servico: item,
        discriminacao: texto(nota.descricao),
        codigo_municipio: emitente.codigoMunicipio,
        ...(emitente.codigoTributarioMunicipio ? { codigo_tributario_municipio: emitente.codigoTributarioMunicipio } : {}),
        ...(emitente.codigoCnae ? { codigo_cnae: emitente.codigoCnae } : {}),
      },
    },
  };
}

/** A referência da nota na Focus: única por TENTATIVA (reenviar uma recusada abre outra). */
export const refDaTentativa = (notaId: string, tentativa: number): string =>
  `quattro-${notaId}-${Math.max(1, Math.floor(tentativa))}`;

/** A tentativa seguinte a partir da referência guardada (sem referência → 1). */
export function proximaTentativa(refAtual: string | null | undefined): number {
  const m = /-(\d+)$/.exec(refAtual ?? "");
  return m ? Number(m[1]) + 1 : 1;
}

export type EstadoNota = "processando" | "autorizada" | "rejeitada" | "cancelada";

export interface Desfecho {
  estado: EstadoNota;
  numero?: string;
  codigoVerificacao?: string;
  urlPdf?: string;
  urlXml?: string;
  urlNota?: string;
  motivo?: string;
}

/** Traduz a resposta da consulta. Status desconhecido é PROCESSANDO, nunca autorizada. */
export function interpretarConsulta(r: unknown, base: string): Desfecho {
  const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
  const status = texto(o.status);
  if (status === "autorizado" || status === "cancelado") {
    const xml = texto(o.caminho_xml_nota_fiscal);
    return {
      estado: status === "autorizado" ? "autorizada" : "cancelada",
      ...(texto(o.numero) || typeof o.numero === "number" ? { numero: String(o.numero) } : {}),
      ...(texto(o.codigo_verificacao) ? { codigoVerificacao: texto(o.codigo_verificacao) } : {}),
      ...(texto(o.url_danfse) ? { urlPdf: texto(o.url_danfse) } : {}),
      ...(xml ? { urlXml: /^https?:\/\//.test(xml) ? xml : `${base}${xml.startsWith("/") ? "" : "/"}${xml}` } : {}),
      ...(texto(o.url) ? { urlNota: texto(o.url) } : {}),
    };
  }
  if (status === "erro_autorizacao") {
    return { estado: "rejeitada", motivo: motivoDosErros(o.erros) ?? "A prefeitura recusou a nota sem dizer o motivo." };
  }
  return { estado: "processando" };
}

/** Junta os erros da prefeitura numa frase: mensagem + correção sugerida. */
export function motivoDosErros(erros: unknown): string | undefined {
  if (!Array.isArray(erros) || !erros.length) return undefined;
  const frases = erros.map((e) => {
    const x = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    const msg = texto(x.mensagem);
    const cor = texto(x.correcao);
    return [msg, cor && cor !== msg ? `(${cor})` : ""].filter(Boolean).join(" ");
  }).filter(Boolean);
  return frases.length ? frases.join(" · ").slice(0, 500) : undefined;
}

/** A frase de um erro síncrono da Focus (400/422): `mensagem`, ou o código. */
export function motivoDaRecusa(corpo: unknown, http: number): string {
  const o = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const msg = texto(o.mensagem) || motivoDosErros(o.erros);
  if (http === 401) return "O provedor de notas recusou a credencial da Quattro. Avise o suporte.";
  return msg ? `O provedor recusou a nota: ${msg}` : `O provedor recusou a nota (código ${http}).`;
}

/** A justificativa do cancelamento: a Focus exige de 15 a 255 letras. */
export function justificativaValida(j: string): string | null {
  const t = texto(j);
  if (t.length < 15) return "Escreva o motivo do cancelamento com pelo menos 15 letras.";
  if (t.length > 255) return "O motivo do cancelamento passa de 255 letras.";
  return null;
}
