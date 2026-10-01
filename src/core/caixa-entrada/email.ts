/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAIXA DE ENTRADA — A PORTA DO E-MAIL (`caixa-entrada-email/1.0.0`)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O fornecedor manda o boleto por e-mail. Esta é a quarta fonte da caixa de
 * entrada de contas a pagar, ao lado do OCR, do DDA e da SEFAZ — e, como as
 * outras três, ela NÃO escreve conta nenhuma: a mensagem entra na fila e uma
 * pessoa decide (vira conta pelo formulário de sempre, ou é descartada com
 * motivo).
 *
 * Três decisões puras moram aqui, para a rota do webhook e a tela usarem a
 * MESMA regra:
 *
 *  1. `tokenDoDestinatario` — de qual empresa é o envelope. O endereço é
 *     `contas+TOKEN@dominio` (ou `TOKEN@dominio`); o token tem forma fixa, e o
 *     que não tem a forma não é token — devolver "quase token" faria a rota
 *     perguntar ao banco por qualquer palavra que alguém escrevesse no "Para".
 *  2. `anexosAceitos` — o que o arquivo pode ser e quanto pode pesar. ⚠️ Os
 *     recusados VOLTAM com o motivo: anexo descartado em silêncio é boleto que
 *     ninguém sabe que chegou.
 *  3. `documentoDoEmail` — a mensagem na forma comum da fila (chave
 *     `email:<id>`). Valor e vencimento só entram quando o próprio e-mail os
 *     traz numa linha digitável que CONFERE (dígitos verificadores); senão
 *     ficam vazios, e quem preenche é a pessoa. Adivinhar um valor a partir do
 *     texto de um e-mail seria o palpite com cara de dado que este repositório
 *     inteiro existe para impedir.
 *
 * Puro, tipado, sem relógio e sem rede.
 */
import { lerBoleto } from "@/core/compras/boleto";

export const CAIXA_EMAIL_VERSION = "caixa-entrada-email/1.0.0";

/** A forma do token (a mesma do CHECK do banco, sem a caixa: o banco guarda minúsculo). */
export const PADRAO_TOKEN = /^[A-Za-z0-9_-]{16,}$/;

/**
 * O token do endereço de destino, ou `null`.
 *
 * Aceita `Nome <contas+TOKEN@dominio>`, `contas+TOKEN@dominio` e
 * `TOKEN@dominio`; com vários destinatários separados por vírgula, vale o
 * PRIMEIRO que tiver token. O token volta em minúsculas — há provedor que muda
 * a caixa do destinatário no caminho, e o banco guarda minúsculo.
 */
export function tokenDoDestinatario(to: string | null | undefined): string | null {
  if (!to) return null;
  for (const parte of to.split(",")) {
    const entre = parte.match(/<([^>]+)>/);
    const endereco = (entre ? entre[1] : parte).trim();
    const arroba = endereco.lastIndexOf("@");
    if (arroba <= 0) continue;
    const local = endereco.slice(0, arroba);
    const mais = local.indexOf("+");
    const candidato = mais >= 0 ? local.slice(mais + 1) : local;
    if (PADRAO_TOKEN.test(candidato)) return candidato.toLowerCase();
  }
  return null;
}

/** O endereço que a empresa divulga aos fornecedores. */
export const enderecoDaCaixa = (token: string, dominio: string): string =>
  `contas+${token}@${dominio.replace(/^@/, "")}`;

/* ─────────────────────────────── anexos ─────────────────────────────── */

export const ANEXO_MAX_BYTES = 10 * 1024 * 1024;
export const ANEXOS_MAX = 10;
export const EXTENSOES_ACEITAS = ["pdf", "png", "jpg", "jpeg", "xml"] as const;

export interface AnexoRecebido {
  nome: string;
  tipo: string;
  tamanho: number;
}

export interface AnexoRecusado extends AnexoRecebido {
  motivo: string;
}

export interface TriagemAnexos<T extends AnexoRecebido> {
  aceitos: T[];
  recusados: (T & { motivo: string })[];
}

const extensao = (nome: string): string => {
  const p = nome.lastIndexOf(".");
  return p >= 0 ? nome.slice(p + 1).toLowerCase() : "";
};

/**
 * Separa o que entra do que não entra — e diz por quê.
 *
 * A EXTENSÃO decide, não o tipo declarado: o cliente de e-mail declara
 * `application/octet-stream` para metade dos PDFs, e recusar por isso perderia
 * o boleto. O teto de 10 anexos vale pela ORDEM em que chegaram; o 11º em
 * diante volta recusado com o motivo, nunca some.
 */
export function anexosAceitos<T extends AnexoRecebido>(anexos: readonly T[]): TriagemAnexos<T> {
  const aceitos: T[] = [];
  const recusados: (T & { motivo: string })[] = [];
  for (const a of anexos ?? []) {
    const ext = extensao(a.nome ?? "");
    if (!(EXTENSOES_ACEITAS as readonly string[]).includes(ext)) {
      recusados.push({ ...a, motivo: `Tipo de arquivo não aceito (${ext ? `.${ext}` : "sem extensão"}). A caixa aceita PDF, PNG, JPG e XML.` });
    } else if (!Number.isFinite(a.tamanho) || a.tamanho < 0 || a.tamanho > ANEXO_MAX_BYTES) {
      recusados.push({ ...a, motivo: "Arquivo acima de 10 MB." });
    } else if (aceitos.length >= ANEXOS_MAX) {
      recusados.push({ ...a, motivo: `Mais de ${ANEXOS_MAX} anexos na mesma mensagem; os seguintes ficaram de fora.` });
    } else {
      aceitos.push(a);
    }
  }
  return { aceitos, recusados };
}

/* ───────────────────── a mensagem na forma da fila ───────────────────── */

/** A linha de `caixa_email_mensagens` como a tela a recebe. */
export interface MensagemEmail {
  id: string;
  recebido_em: string;
  remetente: string | null;
  assunto: string | null;
  texto: string | null;
  anexos: { nome: string; tipo: string; tamanho: number; caminho: string }[];
}

export const chaveEmail = (id: string): string => `email:${id}`;

/** "Fulano <fulano@x.com>" → "Fulano"; sem nome, o endereço. */
export function nomeDoRemetente(remetente: string | null | undefined): string {
  const r = (remetente ?? "").trim();
  if (!r) return "Remetente não informado";
  const m = r.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return m[1].trim() || m[2].trim();
  return r;
}

/**
 * A linha digitável que o próprio e-mail traz, quando CONFERE.
 *
 * Só a linha de 47 dígitos (boleto bancário), digitada com ou sem pontos e
 * espaços. ⚠️ Exige `valido`: os dígitos verificadores são o que separa uma
 * linha digitável de qualquer outra sequência longa de números (pedido,
 * protocolo, telefone) — sem eles, um número de pedido viraria valor e data.
 */
export function boletoNoTexto(texto: string): { valor: number; vencimento: string | null; linha: string } | null {
  const candidatos = (texto ?? "").match(/\d[\d.\s]{45,70}\d/g) ?? [];
  for (const c of candidatos) {
    const d = c.replace(/\D/g, "");
    if (d.length !== 47) continue;
    const b = lerBoleto(d);
    if (b && b.tipo === "bancario" && b.valido && b.valor > 0) {
      return { valor: b.valor, vencimento: b.vencimento, linha: b.linhaDigitavel };
    }
  }
  return null;
}

/** Forma comum da fila — tipo estrutural para não criar ciclo com `./index`. */
export interface DocumentoDoEmail {
  chave: string;
  origem: "email";
  refId: string;
  fornecedor: string;
  documento: string | null;
  valor: number;
  vencimento: string | null;
  emissao: string | null;
  numero: string | null;
  descricao: string;
  categoria: string | null;
  recebidoEm: string;
  assunto: string | null;
  remetente: string | null;
  anexos: number;
}

/**
 * A mensagem como item da fila. Descrição = assunto (é o que o fornecedor
 * escreveu para dizer do que se trata); fornecedor = o nome do remetente.
 * Valor 0 e vencimento vazio quando o e-mail não traz linha digitável que
 * confira — a tela diz "valor não informado", e o formulário abre sem eles.
 */
export function documentoDoEmail(m: MensagemEmail): DocumentoDoEmail {
  const assunto = (m.assunto ?? "").trim() || null;
  const boleto = boletoNoTexto(`${m.assunto ?? ""}\n${m.texto ?? ""}`);
  return {
    chave: chaveEmail(m.id),
    origem: "email",
    refId: m.id,
    fornecedor: nomeDoRemetente(m.remetente),
    documento: null,
    valor: boleto?.valor ?? 0,
    vencimento: boleto?.vencimento ?? null,
    emissao: null,
    numero: null,
    descricao: assunto ?? `E-mail de ${nomeDoRemetente(m.remetente)}`,
    categoria: null,
    recebidoEm: m.recebido_em,
    assunto,
    remetente: m.remetente,
    anexos: (m.anexos ?? []).length,
  };
}
