"use client";

/**
 * Destinatários do envio de NFs e o histórico de execuções
 * (localStorage, demo-safe, síncrono).
 *
 * O envio real (SMTP + o pacote de XMLs) roda no servidor; o que vive aqui é a
 * lista de quem recebe, o estado da confirmação e a data em que o arquivamento
 * começou — o dado que a tela precisa ter na hora.
 */
import {
  statusEnvio, type DestinatarioContador,
} from "@/core/contabilidade";

const K_DEST = "a4p_contador_destinatarios";
const K_EXEC = "a4p_contador_execucoes";

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

export const novoIdDest = (): string =>
  `dest_${Date.now().toString(36)}_${Math.floor(Math.abs(performance.now()) % 1000)}`;

export const listarDestinatarios = (): DestinatarioContador[] =>
  ler<DestinatarioContador[]>(K_DEST, []);

export function salvarDestinatario(d: DestinatarioContador): DestinatarioContador[] {
  const out = [...listarDestinatarios().filter((x) => x.id !== d.id), d];
  gravar(K_DEST, out);
  return out;
}

export function removerDestinatario(id: string): DestinatarioContador[] {
  const out = listarDestinatarios().filter((d) => d.id !== id);
  gravar(K_DEST, out);
  return out;
}

/** Aceitar a confirmação — em produção quem chama isto é o link do e-mail. */
export function verificarDestinatario(id: string, quandoISO: string): DestinatarioContador[] {
  const alvo = listarDestinatarios().find((d) => d.id === id);
  if (!alvo) return listarDestinatarios();
  return salvarDestinatario({ ...alvo, verificado: true, verificadoEm: quandoISO });
}

/**
 * Quando o arquivamento começou.
 *
 * É a data de verificação do PRIMEIRO destinatário — antes dela o sistema não
 * retinha XML nenhum, e contar notas antigas como "arquivadas" prometeria um
 * pacote que não existe.
 */
export function arquivamentoDesde(): string | null {
  const verificados = listarDestinatarios()
    .filter((d) => d.verificado && d.verificadoEm)
    .map((d) => d.verificadoEm!)
    .sort();
  return verificados[0] ?? null;
}

export interface ExecucaoEnvio {
  quando: string;
  destinatarios: number;
  entrada: number;
  saida: number;
}

export const listarExecucoes = (): ExecucaoEnvio[] => ler<ExecucaoEnvio[]>(K_EXEC, []);

export function registrarExecucao(e: ExecucaoEnvio): ExecucaoEnvio[] {
  const out = [e, ...listarExecucoes()].slice(0, 24);
  gravar(K_EXEC, out);
  return out;
}

export const ultimaExecucao = (): ExecucaoEnvio | null => listarExecucoes()[0] ?? null;

export const envioAtivo = (): boolean => statusEnvio(listarDestinatarios()) === "ativo";
