"use client";

/**
 * O avatar de cada agente (e o da Quattro AI): um círculo na cor do agente,
 * token do DS (`--color-agente-*`), com o ícone dele em branco.
 */
import { Icon } from "@/components/ui";
import { PERFIS } from "@/core/agentes/conversa";
import type { IdAgente } from "@/core/agentes";

export function AvatarAgente({ agente, tamanho = 40, noMenu = false }: { agente: IdAgente | "quattro-ai"; tamanho?: number; noMenu?: boolean }) {
  const ia = agente === "quattro-ai";
  // No menu escuro o círculo da Quattro AI ganha o fio do menu, para não
  // sumir no fundo verde quase preto.
  return (
    <span
      aria-hidden
      data-avatar={agente}
      className="shrink-0 rounded-pill inline-flex items-center justify-center"
      style={{
        width: tamanho, height: tamanho,
        background: ia ? "var(--color-ink)" : PERFIS[agente].cor,
        color: ia ? "var(--color-lime)" : "var(--color-white)",
        border: ia && noMenu ? "1px solid var(--erp-menu-fio)" : undefined,
      }}
    >
      <Icon name={ia ? "sparkles" : PERFIS[agente].icone} size={Math.round(tamanho * 0.45)} color="currentColor" />
    </span>
  );
}
