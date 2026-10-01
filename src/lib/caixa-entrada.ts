"use client";

/**
 * Persistência da CAIXA DE ENTRADA DE CONTAS (`core/caixa-entrada`).
 *
 * Mora em `store-org` (`a4p_caixa_entrada`): o documento lido por OCR que a
 * pessoa deixou para depois, e a DECISÃO sobre cada documento. Os boletos e as
 * notas continuam morando nas suas próprias chaves (`compras-store`) — esta
 * chave guarda só o que é da caixa, nunca uma segunda cópia deles.
 */
import { ler, gravar, CHAVES_ORG, inscrever } from "@/lib/store-org";
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { listarBoletos, listarNFs } from "@/lib/compras-store";
import {
  ESTADO_VAZIO, documentosDasFontes, montarCaixaEntrada, descartarEntrada, converterEntrada,
  type EstadoCaixaEntrada, type DocumentoEntrada, type DocumentoOCR, type FiltroCaixa, type CaixaEntrada,
} from "@/core/caixa-entrada";

const K = CHAVES_ORG.caixaEntrada;

export const lerEstadoCaixa = (): EstadoCaixaEntrada => {
  const e = ler<EstadoCaixaEntrada>(K, ESTADO_VAZIO);
  return { ocr: e.ocr ?? [], decisoes: e.decisoes ?? [] };
};

export const documentosDaCaixa = (): DocumentoEntrada[] =>
  documentosDasFontes({ boletos: listarBoletos(), nfs: listarNFs(), ocr: lerEstadoCaixa().ocr });

export const caixaAtual = (filtro: FiltroCaixa = "pendentes"): CaixaEntrada =>
  montarCaixaEntrada(documentosDaCaixa(), lerEstadoCaixa().decisoes, filtro);

/** Deixa um documento lido por OCR esperando decisão. */
export function estacionarOCR(doc: DocumentoOCR): void {
  const e = lerEstadoCaixa();
  gravar(K, { ...e, ocr: [doc, ...e.ocr.filter((o) => o.refId !== doc.refId)] });
}

/*
 * ⚠️ REVISÃO CAMP-B — QUEM decidiu entra na decisão. A primeira versão gravava
 * `quem: null` em todo descarte e toda conversão, e a tela prometia "quem,
 * quando e por quê". Um descarte sem autor responde "por que este boleto não
 * foi pago?" pela metade — e é a metade que a pergunta procura. O autor é a
 * conta logada (o e-mail, que é o que a trilha de Logs também mostra); em
 * demonstração não há conta, e o rótulo diz isso em vez de inventar alguém.
 */
async function autor(): Promise<string> {
  if (isDemo) return "você (demonstração)";
  try {
    const { data } = await createClient().auth.getUser();
    return data.user?.email ?? "usuário sem e-mail";
  } catch {
    // Sem sessão legível a decisão continua sendo gravada — mas DIZ que o autor
    // não foi identificado, em vez de sair com o campo vazio.
    return "autor não identificado";
  }
}

/** Descarta com motivo — devolve a mensagem da recusa, ou `null` quando gravou. */
export async function descartar(doc: DocumentoEntrada, motivo: string): Promise<string | null> {
  const r = descartarEntrada(lerEstadoCaixa(), doc, motivo, new Date().toISOString(), await autor());
  if (!r.ok) return r.erro;
  gravar(K, r.estado);
  return null;
}

/** Tira da fila DEPOIS que a conta foi gravada. Sem o documento, não faz nada. */
export async function converterPorChave(chave: string, referencia: string | null): Promise<boolean> {
  const doc = documentosDaCaixa().find((d) => d.chave === chave);
  if (!doc) return false;
  gravar(K, converterEntrada(lerEstadoCaixa(), doc, referencia, new Date().toISOString(), await autor()));
  return true;
}

export const documentoPorChave = (chave: string): DocumentoEntrada | null =>
  documentosDaCaixa().find((d) => d.chave === chave) ?? null;

export const ouvirCaixa = (fn: () => void): (() => void) => inscrever(K, fn);
