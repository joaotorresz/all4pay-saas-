"use client";

/**
 * Registro dos envios da régua de cobrança — agora o MESMO registro das
 * automações (`automacao_envios`, via `lib/automacoes`).
 *
 * ⚠️ Guarda só o QUE FOI ENVIADO (título, etapa, quando, canal), nunca a fila:
 * a fila é derivada dos títulos a cada leitura (`core/cobranca`), e uma fila
 * persistida cobraria amanhã o cliente que pagou hoje por outra porta.
 *
 * ⚠️ Era `org_state.a4p_regua_envios`, uma segunda morada que o envio
 * automático e o copiloto não viam. A migration 20260930190000 copiou o que
 * havia lá (como `manual`: o registro antigo não dizia se foi a Twilio ou uma
 * pessoa) e a chave ficou congelada.
 */
import type { EnvioRegistrado } from "@/core/cobranca";
import { enviosDaReguaRegistrados, registrarAvisoManual } from "@/lib/automacoes";

/** Os envios que CONTAM como avisado (enviado pelo provedor ou declarado à mão). Simulado não conta. */
export const listarEnvios = (): Promise<EnvioRegistrado[]> => enviosDaReguaRegistrados();

/** Grava o aviso manual; devolve `false` quando a mesma etapa já tinha sido avisada ao título. */
export const marcarEnviado = (novo: Pick<EnvioRegistrado, "movimentoId" | "etapaId" | "canal">): Promise<boolean> =>
  registrarAvisoManual(novo);
