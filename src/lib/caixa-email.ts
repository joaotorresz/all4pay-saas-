"use client";

/**
 * A porta do E-MAIL da caixa de entrada de contas a pagar — leitura.
 *
 * As mensagens moram em `caixa_email_mensagens` (uma linha por e-mail, escrita
 * só pelo webhook com a chave de serviço) e o endereço em
 * `caixa_email_enderecos`. Aqui só se LÊ, pela sessão do usuário (a política
 * recorta pela empresa ativa); o único escritor do lado da tela é
 * `gerarEndereco`, que chama a RPC — e ela recusa quem não administra.
 *
 * ⚠️ Este arquivo não grava conta a pagar, nem nada em `movements`. O e-mail é
 * FONTE da fila; quem cria a conta é o formulário de sempre.
 *
 * ⚠️ Em demonstração não há porta de e-mail: a lista é vazia, e a tela diz
 * isso. Inventar mensagens aqui seria mostrar dado que não existe.
 *
 * A leitura é ASSÍNCRONA e a caixa (`lib/caixa-entrada`) é síncrona; a ponte é
 * um cache de sessão com aviso de mudança — o mesmo desenho do `store-org`,
 * sem gravar nada no navegador.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { comTeto, aplicarTeto } from "@/lib/supabase/consulta";
import { reportar, motivoDaRecusa } from "@/lib/erros";
import type { MensagemEmail } from "@/core/caixa-entrada/email";

let cache: MensagemEmail[] = [];
let erroLeitura: string | null = null;
let emVoo: Promise<MensagemEmail[]> | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => { for (const f of Array.from(ouvintes)) { try { f(); } catch (e) { reportar("compras.caixa_email.ouvinte", e, "uma tela não recebeu o aviso de e-mails novos", true); } } };

/** As mensagens já lidas nesta sessão (síncrono — a caixa monta a fila com elas). */
export const emailsEmCache = (): MensagemEmail[] => cache;

/** O motivo da última leitura falha, para a tela dizer em vez de mostrar "nada chegou". */
export const erroDosEmails = (): string | null => erroLeitura;

export function ouvirEmails(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}

/** Lê as mensagens da empresa ativa e avisa quem ouve. Deduplica chamadas em voo. */
export function carregarEmails(): Promise<MensagemEmail[]> {
  if (isDemo) return Promise.resolve(cache);
  emVoo ??= (async () => {
    try {
      const { data, error } = await comTeto(
        createClient()
          .from("caixa_email_mensagens")
          .select("id, recebido_em, remetente, assunto, texto, anexos")
          .order("recebido_em", { ascending: false }),
      );
      if (error) throw error;
      cache = aplicarTeto("caixa_email_mensagens", (data ?? []) as MensagemEmail[]);
      erroLeitura = null;
    } catch (e) {
      // ⚠️ A falha NÃO vira lista vazia calada: "nenhum e-mail" e "não consegui
      // ler os e-mails" mandam fazer coisas diferentes.
      erroLeitura = motivoDaRecusa(e);
      reportar("compras.caixa_email.ler", e, "os e-mails recebidos não aparecem na caixa de entrada", true);
    } finally {
      emVoo = null;
    }
    avisar();
    return cache;
  })();
  return emVoo;
}

/** O token do endereço da empresa ativa, ou `null` quando ainda não foi gerado. */
export async function lerToken(): Promise<string | null> {
  if (isDemo) return null;
  const { data, error } = await createClient()
    .from("caixa_email_enderecos")
    .select("token")
    .maybeSingle();
  if (error) throw new Error(motivoDaRecusa(error));
  return (data as { token?: string } | null)?.token ?? null;
}

/**
 * Gera (ou troca) o endereço. A RPC recusa quem não administra — o botão
 * escondido para os outros é conveniência, não a autorização.
 */
export async function gerarEndereco(): Promise<string> {
  if (isDemo) throw new Error("Na demonstração não há endereço de e-mail: a caixa recebe e-mail só numa empresa de verdade.");
  const { data, error } = await createClient().rpc("gerar_endereco_caixa_email");
  if (error) throw new Error(motivoDaRecusa(error));
  return String(data);
}

/**
 * O domínio configurado para os endereços, ou `null`. Sem ele a tela DIZ que
 * falta configurar — nunca inventa um domínio.
 */
export const dominioDaCaixa = (): string | null =>
  (process.env.NEXT_PUBLIC_CAIXA_EMAIL_DOMINIO ?? "").trim() || null;
