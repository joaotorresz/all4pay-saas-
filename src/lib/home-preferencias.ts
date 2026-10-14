"use client";

/**
 * As preferências de cada pessoa nas sugestões da Quattro AI, no SERVIDOR
 * (etapa 4 da Home adaptativa). Antes moravam só no navegador: trocar de
 * computador fazia a pergunta do primeiro acesso voltar e zerava os cliques.
 *
 * Moram em `org_state` (`a4p_home_preferencias`), num mapa `usuário →
 * preferências` — a mesma forma do histórico da IA: a empresa vem da RLS, a
 * pessoa vem da chave dentro do valor. As regras puras (normalizar, mesclar,
 * quando pode enviar) estão em `core/home/preferencias`.
 *
 * A cópia do DISPOSITIVO (`a4p_home_interesses`/`a4p_home_cliques`) continua
 * sendo gravada: é a reserva de quem não pode escrever no estado da empresa
 * (leitor, contador — `org_state` exige o papel de lançar) e o rastro que a
 * primeira sincronização sobe.
 *
 * ⚠️ Os cliques sobem ADIADOS (no máximo um envio a cada 30 s, e na saída da
 * página): cada gravação em `org_state` vira um evento na trilha de auditoria,
 * e um evento por clique encheria a trilha de ruído.
 */
import {
  ler as lerOrg, gravar as gravarOrg, lerPreferencia, gravarPreferencia, hidratarComStatus, inscrever, CHAVES_ORG,
} from "@/lib/store-org";
import { isDemo } from "@/lib/demo";
import {
  comPreferencias, mesclarComDispositivo, mesmasPreferencias, normalizarPreferencias, podeEnviarPreferencias,
  preferenciasDoUsuario, type PreferenciasHome,
} from "@/core/home/preferencias";

const KEY = CHAVES_ORG.homePreferencias;
const LOCAL_INTERESSES = "a4p_home_interesses";
const LOCAL_CLIQUES = "a4p_home_cliques";
const ADIAR_MS = 30_000;

/** O servidor respondeu nesta sessão? Em demonstração não há servidor: o "mapa" é só o cache local. */
let conferido = isDemo;
let usuario: string | null = isDemo ? "demonstracao" : null;
/** O que esta aba gravou nesta sessão — vence as duas fontes até ser enviado. */
let daSessao: PreferenciasHome | null = null;
let adiado: ReturnType<typeof setTimeout> | null = null;

function doDispositivo(): PreferenciasHome | null {
  const interesses = lerPreferencia<unknown>(LOCAL_INTERESSES, null);
  const cliques = lerPreferencia<unknown>(LOCAL_CLIQUES, null);
  if (interesses === null && cliques === null) return null;
  return normalizarPreferencias({ interesses, cliques });
}

/** As preferências de quem está usando: a da sessão, senão servidor + dispositivo. */
export function lerPreferenciasHome(): PreferenciasHome {
  if (daSessao) return daSessao;
  const servidor = preferenciasDoUsuario(lerOrg<unknown>(KEY, {}), usuario);
  return mesclarComDispositivo(servidor, doDispositivo()) ?? { interesses: null, cliques: {} };
}

function enviar(): void {
  adiado = null;
  if (!podeEnviarPreferencias(conferido, usuario)) return;
  const atual = lerPreferenciasHome();
  const mapa = lerOrg<unknown>(KEY, {});
  if (mesmasPreferencias(preferenciasDoUsuario(mapa, usuario), atual)) return;
  gravarOrg(KEY, comPreferencias(mapa, usuario!, atual, new Date().toISOString()));
}

/** Grava no dispositivo na hora e no servidor agora (prioridades) ou adiado (cliques). */
export function gravarPreferenciasHome(p: PreferenciasHome, opcoes: { adiar?: boolean } = {}): void {
  daSessao = p;
  gravarPreferencia(LOCAL_INTERESSES, p.interesses);
  gravarPreferencia(LOCAL_CLIQUES, p.cliques);
  if (opcoes.adiar) {
    if (!adiado) adiado = setTimeout(enviar, ADIAR_MS);
    return;
  }
  if (adiado) clearTimeout(adiado);
  enviar();
}

/**
 * Confere o mapa no servidor (uma vez por sessão) e sobe a cópia do dispositivo
 * se o servidor não a tem. Depois disto `lerPreferenciasHome` já devolve o que
 * a pessoa escolheu em outro computador.
 */
let conferindo: Promise<void> | null = null;
export function sincronizarPreferenciasHome(): Promise<void> {
  if (isDemo) return Promise.resolve();
  conferindo ??= (async () => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { data } = await createClient().auth.getUser();
      usuario = data.user?.id ?? null;
    } catch {
      usuario = null; // sem saber quem é, nada sobe — nunca para o balde de outro
    }
    conferido = (await hidratarComStatus([KEY])).ok;
    // O que veio do servidor vence a sessão daqui em diante, exceto o que esta
    // aba gravou antes da resposta (isso sobe agora, no `enviar`).
    enviar();
  })();
  return conferindo;
}

export const inscreverPreferenciasHome = (ouvinte: () => void): (() => void) => inscrever(KEY, ouvinte);

// Na saída da página, os cliques adiados sobem (o adiamento é para a trilha,
// não para perder o clique).
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { if (adiado) { clearTimeout(adiado); enviar(); } });
}
