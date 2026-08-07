"use client";

import * as React from "react";
import { carregarPlano } from "@/lib/plano";

/**
 * Modo Simples × Pro — a camada de exposição da tese de reconstrução.
 * Simples (padrão): 5 destinos, Início enxuto, Fluxo com 3 blocos — responde
 * "tenho caixa? o que vence? o que fazer hoje?". Pro: revela os motores, a
 * Plataforma e os 13 blocos.
 *
 * ⚠️ **O interruptor é CONSEQUÊNCIA do plano, não causa dele.** Ele guardava
 * `a4p_modo` no navegador e ligava o Pro sozinho: o servidor barrava as rotas
 * pagas (ONDA 2), mas o menu inteiro do Pro aparecia para quem não assinou, e a
 * pessoa passeava por uma lista de destinos que devolviam a tela de planos. Um
 * menu que oferece o que não abre não é vitrine — é uma sequência de portas
 * trancadas com o nome do produto na frente.
 *
 * Agora: sem plano Pro, o interruptor NÃO liga — quem chama recebe `false` e
 * leva a pessoa para a tela que explica o que o Pro inclui. A preferência local
 * continua existindo para o caso oposto, que é legítimo: **quem TEM Pro pode
 * querer simplificar a própria tela.**
 */
export type Modo = "simples" | "pro";
const KEY = "a4p_modo";
const listeners = new Set<() => void>();

/** O que o servidor respondeu sobre o plano. `null` = ainda não respondeu. */
let temDireitoAoPro: boolean | null = null;

function preferencia(): Modo {
  if (typeof window === "undefined") return "simples";
  try { return (localStorage.getItem(KEY) as Modo) === "pro" ? "pro" : "simples"; } catch { return "simples"; }
}

/**
 * O modo efetivo: a preferência, LIMITADA pelo direito.
 *
 * ⚠️ Enquanto o servidor não responde, vale "simples". Mostrar o menu Pro e
 * recolhê-lo meio segundo depois pisca a interface inteira e ainda abre a
 * janela em que um clique cai numa rota que o servidor vai recusar.
 */
function get(): Modo {
  return temDireitoAoPro && preferencia() === "pro" ? "pro" : "simples";
}

/**
 * Guarda a preferência. Ligar o Pro sem direito **não** liga — devolve `false`
 * para a tela oferecer o caminho da assinatura em vez de fingir que mudou algo.
 */
export function setModo(m: Modo): boolean {
  const permitido = m === "simples" || !!temDireitoAoPro;
  if (permitido) {
    try { localStorage.setItem(KEY, m); } catch { /* preferência é descartável */ }
  }
  listeners.forEach((l) => l());
  return permitido;
}

/** Consulta o plano uma vez por sessão e avisa quem estiver ouvindo. */
function resolverDireito(): void {
  if (temDireitoAoPro !== null) return;
  void carregarPlano().then((p) => {
    temDireitoAoPro = p.aberto || p.plano === "pro";
    listeners.forEach((l) => l());
  });
}

export function useModo(): {
  modo: Modo; pro: boolean; set: (m: Modo) => boolean;
  /** A empresa tem direito ao Pro? `false` enquanto o servidor não respondeu. */
  temDireito: boolean;
  /** Pediu Pro e o plano não cobre — a tela explica em vez de calar. */
  bloqueadoPeloPlano: boolean;
} {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    resolverDireito();
    l();
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) l(); };
    window.addEventListener("storage", onStorage);
    return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
  }, []);

  const modo = get();
  return {
    modo,
    pro: modo === "pro",
    set: setModo,
    temDireito: !!temDireitoAoPro,
    bloqueadoPeloPlano: preferencia() === "pro" && temDireitoAoPro === false,
  };
}
