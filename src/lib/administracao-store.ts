"use client";

/**
 * Estado das telas de administração (localStorage, demo-safe, síncrono).
 *
 * Usuários vêm de `lib/governance` (RLS de verdade em live) e o perfil da
 * empresa de `lib/company` — o que vive aqui é só o que não tem casa: assinatura,
 * o estado das integrações e a fila de exportações.
 *
 * ⚠️ Segredo de integração NUNCA é guardado inteiro. O que se persiste é a
 * máscara (`mascararSegredo`) — o suficiente para reconhecer QUAL credencial
 * está ali, insuficiente para usá-la. O segredo real vive no servidor quando a
 * integração passar a existir de verdade.
 */
import {
  mascararSegredo, precisaFila,
  type Exportacao, type FormatoExport, type RegistroLog,
} from "@/core/administracao";

const K_ASSIN = "a4p_assinatura";
const K_INTEG = "a4p_integracoes";
const K_EXPORTS = "a4p_exportacoes";
const K_LOGS = "a4p_logs_admin";

function ler<T>(k: string, padrao: T): T {
  if (typeof window === "undefined") return padrao;
  try {
    const s = localStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : padrao;
  } catch { return padrao; }
}
function gravar(k: string, v: unknown): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cota cheia */ }
}

export const novoIdAdmin = (p: string): string =>
  `${p}_${Date.now().toString(36)}_${Math.floor(Math.abs(performance.now()) % 1000)}`;

/* ------------------------------- assinatura ------------------------------- */

export interface AssinaturaLocal {
  plano: string;
  empresaId: string;
  planoContratado: string | null;
  expiracao: string | null;
}

export const lerAssinatura = (): AssinaturaLocal =>
  ler<AssinaturaLocal>(K_ASSIN, {
    plano: "all4pay",
    empresaId: "",
    planoContratado: null,
    expiracao: null,
  });

export const salvarAssinatura = (a: AssinaturaLocal): AssinaturaLocal => {
  gravar(K_ASSIN, a);
  return a;
};

/* ------------------------------ integrações ------------------------------ */

export interface EstadoIntegracao {
  id: string;
  ativa: boolean;
  /** Só a MÁSCARA — ver o aviso no topo do arquivo. */
  credencialMascarada: string | null;
  /** Validade do certificado A1, quando a integração usa um. */
  certificadoValidade: string | null;
  /** Data em que o consentimento de Open Finance foi concedido. */
  consentimentoEm: string | null;
  /** Conectores/plataformas ligados dentro do cartão. */
  conectados: string[];
  /** Sub-interruptores (Domínio tem dois independentes). */
  chaves: Record<string, boolean>;
  atualizadoEm: string | null;
}

const vazia = (id: string): EstadoIntegracao => ({
  id, ativa: false, credencialMascarada: null, certificadoValidade: null,
  consentimentoEm: null, conectados: [], chaves: {}, atualizadoEm: null,
});

export const lerIntegracoes = (): Record<string, EstadoIntegracao> =>
  ler<Record<string, EstadoIntegracao>>(K_INTEG, {});

export const lerIntegracao = (id: string): EstadoIntegracao =>
  lerIntegracoes()[id] ?? vazia(id);

export function salvarIntegracao(e: EstadoIntegracao): Record<string, EstadoIntegracao> {
  const todas = { ...lerIntegracoes(), [e.id]: e };
  gravar(K_INTEG, todas);
  return todas;
}

/** Guarda a credencial já mascarada — o valor cru não sai desta função. */
export function guardarCredencial(id: string, segredo: string, hojeISO: string): EstadoIntegracao {
  const atual = lerIntegracao(id);
  const novo: EstadoIntegracao = {
    ...atual,
    credencialMascarada: mascararSegredo(segredo),
    ativa: true,
    atualizadoEm: hojeISO,
  };
  salvarIntegracao(novo);
  return novo;
}

/* ---------------------------- exportações ---------------------------- */

export const listarExportacoes = (): Exportacao[] => ler<Exportacao[]>(K_EXPORTS, []);

export function registrarExportacao(e: Exportacao): Exportacao[] {
  const out = [e, ...listarExportacoes()].slice(0, 200);
  gravar(K_EXPORTS, out);
  return out;
}

export function removerExportacao(id: string): Exportacao[] {
  const out = listarExportacoes().filter((e) => e.id !== id);
  gravar(K_EXPORTS, out);
  return out;
}

/**
 * O que a tela de origem chama ao exportar.
 *
 * Devolve `true` quando a exportação foi para a FILA (e portanto aparece em
 * Relatórios exportados); `false` quando baixa na hora e não é registrada.
 */
export function enfileirarSeGrande(
  relatorio: string,
  formato: FormatoExport,
  linhas: number,
  hojeISO: string,
): boolean {
  if (!precisaFila(formato, linhas)) return false;
  registrarExportacao({
    id: novoIdAdmin("exp"),
    relatorio,
    nomeArquivo: `${relatorio.toLowerCase().replace(/\s+/g, "-")}-${hojeISO}.${formato}`,
    formato,
    linhas,
    exportadoEm: hojeISO,
    status: "processando",
  });
  return true;
}

/* --------------------------------- logs --------------------------------- */

export const listarLogsAdmin = (): RegistroLog[] => ler<RegistroLog[]>(K_LOGS, []);

export function registrarLog(l: RegistroLog): RegistroLog[] {
  const out = [l, ...listarLogsAdmin()].slice(0, 500);
  gravar(K_LOGS, out);
  return out;
}
