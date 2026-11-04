"use client";

/**
 * O avatar de cada agente (e o da Quattro AI): um círculo na cor do agente,
 * token do DS (`--color-agente-*`), com o ícone dele em branco.
 */
import { Icon } from "@/components/ui";
import { PERFIS } from "@/core/agentes/conversa";
import type { IdAgente } from "@/core/agentes";

export function AvatarAgente({ agente, tamanho = 40 }: { agente: IdAgente | "quattro-ai"; tamanho?: number }) {
  const ia = agente === "quattro-ai";
  return (
    <span
      aria-hidden
      data-avatar={agente}
      className="shrink-0 rounded-pill inline-flex items-center justify-center"
      style={{
        width: tamanho, height: tamanho,
        background: ia ? "var(--color-ink)" : PERFIS[agente].cor,
        color: ia ? "var(--color-lime)" : "var(--color-white)",
      }}
    >
      <Icon name={ia ? "sparkles" : PERFIS[agente].icone} size={Math.round(tamanho * 0.45)} color="currentColor" />
    </span>
  );
}
