"use client";

/**
 * Registro dos envios da régua de cobrança — por organização, no servidor
 * (`org_state`), com o cache local como espelho síncrono.
 *
 * ⚠️ Guarda só o QUE FOI ENVIADO (título, etapa, quando, canal), nunca a fila:
 * a fila é derivada dos títulos a cada leitura (`core/cobranca`), e uma fila
 * persistida cobraria amanhã o cliente que pagou hoje por outra porta.
 */
import { ler, gravar, CHAVES_ORG } from "@/lib/store-org";
import { registrarEnvio, type EnvioRegistrado } from "@/core/cobranca";

const CHAVE = CHAVES_ORG.reguaEnvios;

export const listarEnvios = (): EnvioRegistrado[] => ler<EnvioRegistrado[]>(CHAVE, []);

/** Grava o envio; devolve `false` quando a mesma etapa já tinha sido enviada ao título. */
export function marcarEnviado(novo: EnvioRegistrado): boolean {
  const { envios, repetido } = registrarEnvio(listarEnvios(), novo);
  if (!repetido) gravar(CHAVE, envios);
  return !repetido;
}
