/**
 * QUEM ASSINA O E-MAIL DE COBRANÇA — no modelo da Asaas (decisão do dono,
 * 28/10/2026): o nome que aparece na caixa de entrada é o da EMPRESA que
 * cobra, o endereço é da plataforma (`cobrancas+<empresa>@<domínio>`) e a
 * resposta do cliente vai para o e-mail do cadastro da empresa.
 *
 * ⚠️ O domínio é da plataforma e precisa estar VERIFICADO no provedor de
 * e-mail (`COBRANCA_EMAIL_DOMINIO`). Sem ele, a cobrança sai pelo remetente
 * de sempre — nunca por um domínio que o provedor recusaria.
 *
 * ⚠️ O nome vem do cadastro da empresa, que é texto livre: `<`, `>`, aspas,
 * vírgula e `@` saem, senão um nome como `Loja <x@y>` viraria OUTRO endereço
 * no cabeçalho `From`.
 */
import type { Credor } from "@/core/cobranca";

export interface Remetente {
  /** O nome que o cliente lê na caixa de entrada. */
  nome: string;
  /** O identificador da empresa no endereço (`cobrancas+<tag>@…`). */
  tag: string;
  /** Para onde vai a resposta do cliente: o e-mail do cadastro da empresa. */
  responderPara: string | null;
}

const TETO_NOME = 60;

export function nomeDoRemetente(s: string | null | undefined): string {
  const limpo = String(s ?? "")
    .replace(/[\u0000-\u001f\u007f<>"'`,;:@\\()[\]]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, TETO_NOME).trim();
  return limpo || "Cobrança";
}

/** Os 8 primeiros hexadecimais do id da empresa — curto, estável e sem nada do cadastro. */
export function tagDaEmpresa(orgId: string | null | undefined): string {
  const h = String(orgId ?? "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 8);
  return h.length === 8 ? h : "empresa";
}

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]{2,}$/;
const DOMINIO = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function remetenteDaCobranca(orgId: string, credor: Credor | null | undefined): Remetente {
  const e = String(credor?.email ?? "").trim();
  return {
    nome: nomeDoRemetente(credor?.nome || credor?.razaoSocial),
    tag: tagDaEmpresa(orgId),
    responderPara: EMAIL.test(e) ? e : null,
  };
}

/**
 * O `From` e o `Reply-To` prontos, ou `null` quando o domínio não está
 * configurado (ou não parece um domínio) — e aí vale o remetente de sempre.
 */
export function enderecoDoRemetente(r: Remetente | null | undefined, dominio: string | null | undefined): { from: string; replyTo: string | null } | null {
  const d = String(dominio ?? "").trim().toLowerCase();
  if (!r || !DOMINIO.test(d)) return null;
  return { from: `"${nomeDoRemetente(r.nome)}" <cobrancas+${tagDaEmpresa(r.tag)}@${d}>`, replyTo: r.responderPara && EMAIL.test(r.responderPara) ? r.responderPara : null };
}
