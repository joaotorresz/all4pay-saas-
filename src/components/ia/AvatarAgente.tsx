"use client";

/**
 * O avatar de cada agente (e o da Quattro AI): um boneco de pelúcia animado
 * do pacote `bot-avatars` (pedido do dono, 06/11/2026), um formato por
 * agente. Ele substituiu os bonecos de tricô em PNG de 04/11.
 *
 * O boneco mostra o estado REAL do agente:
 * - `working` (pula e gira): enquanto ele faz uma tarefa — digita no chat,
 *   salva a configuração, executa uma proposta aprovada, ou a Quattro AI
 *   pensa numa resposta (`estado-agente`, um lugar só);
 * - `sleeping` (cabeça baixa, olhos fechados): agente desligado ou em
 *   construção;
 * - `default` (olha em volta): ligado e esperando.
 *
 * ⚠️ A cor do corpo é a do DS (`--color-agente-*`; a Quattro AI usa a tinta
 * `--color-ink`), lida da folha na montagem: o boneco desenha num canvas e
 * não entende `var(...)`. Hex solto aqui reprova na guarda `paleta`.
 *
 * ⚠️ O tema é sempre o claro, e o pacote já respeita
 * `prefers-reduced-motion` (pose parada) e pausa fora da tela.
 */
import * as React from "react";
import { BotAvatar, type BotAvatarState, type BotAvatarType } from "bot-avatars";
import { descricaoDe } from "@/core/agentes";
import { useEstaTrabalhando, type IdAvatar } from "./estado-agente";
import { useAgentesDoHub } from "./useAgentesDoHub";

export type EstadoAvatar = BotAvatarState;

/** Um formato por agente; a cor sai do DS. */
export const FORMA_AGENTE: Record<IdAvatar, { tipo: BotAvatarType; cor: string; brilho?: number }> = {
  // Quatro folhas: a Quattro. A tinta do DS clareada um pouco, para o rosto aparecer.
  "quattro-ai": { tipo: "clover", cor: "--color-ink", brilho: 1.3 },
  cobranca: { tipo: "flower", cor: "--color-agente-cobranca" },
  conciliacao: { tipo: "hexagon", cor: "--color-agente-conciliacao" },
  contas_pagar: { tipo: "square", cor: "--color-agente-contas-pagar" },
  caixa: { tipo: "drop", cor: "--color-agente-caixa" },
  fechamento: { tipo: "cloud", cor: "--color-agente-fechamento" },
};

/** O estado de repouso de cada um: dorme quando está desligado ou em construção. */
function useEstadoDeRepouso(agente: IdAvatar): EstadoAvatar {
  const { configDe } = useAgentesDoHub();
  if (agente === "quattro-ai") return "default";
  if (!descricaoDe(agente).pronto) return "sleeping";
  return configDe(agente)?.ativo ? "default" : "sleeping";
}

function useCorDoDS(variavel: string): string | null {
  const [cor, setCor] = React.useState<string | null>(null);
  React.useEffect(() => {
    setCor(getComputedStyle(document.documentElement).getPropertyValue(variavel).trim() || null);
  }, [variavel]);
  return cor;
}

export function AvatarAgente({ agente, tamanho = 40, estado }: {
  agente: IdAvatar;
  tamanho?: number;
  /** Força um estado; sem ele, o boneco segue o estado real do agente. */
  estado?: EstadoAvatar;
}) {
  const forma = FORMA_AGENTE[agente];
  const cor = useCorDoDS(forma.cor);
  const trabalhando = useEstaTrabalhando(agente);
  const repouso = useEstadoDeRepouso(agente);
  const final: EstadoAvatar = estado ?? (trabalhando ? "working" : repouso);
  return (
    <span aria-hidden data-avatar={agente} data-estado={final}
      className="shrink-0 inline-flex select-none" style={{ width: tamanho, height: tamanho }}>
      {cor && (
        // Saturação 1: os tons terrosos do DS como estão (o pacote puxa para o
        // vívido por padrão). O salto é mais baixo que o do pacote, para o
        // boneco não sair do cartão do menu.
        <BotAvatar type={forma.tipo} color={cor} state={final} size={tamanho}
          saturation={1} brightness={forma.brilho ?? 1} jumpHeight={14}
          theme="light" interactive={tamanho >= 36} aria-hidden />
      )}
    </span>
  );
}
