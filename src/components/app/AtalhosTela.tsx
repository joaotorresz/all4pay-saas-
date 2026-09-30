"use client";

import Link from "next/link";
import { Icon } from "@/components/ui";

/**
 * A barra de atalhos de uma tela — as telas VIZINHAS que saíram do menu.
 *
 * ⚠️ Existe por causa do enxugamento do MVP (30/09/2026). Tirar uma linha do
 * menu só é simplificar quando a tela continua a um clique do lugar onde a
 * pessoa a procura; sem porta nenhuma, ela passa a existir só para quem sabe o
 * endereço — e tela sem porta é tela que alguém reconstrói, que foi como as
 * duplicatas nasceram. Cada atalho é um `<Link>` de verdade (nova aba,
 * Ctrl+clique, endereço para mandar a um colega), nunca um botão com
 * navegação por código.
 */
export interface Atalho { label: string; href: string; icon: string }

export function AtalhosTela({ atalhos, rotulo = "Também aqui" }: { atalhos: Atalho[]; rotulo?: string }) {
  return (
    <nav aria-label={rotulo} className="flex items-center gap-2 flex-wrap -mt-1">
      <span className="a4p-label text-faint mr-1">{rotulo}</span>
      {atalhos.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="inline-flex items-center gap-1.5 rounded-pill border border-border px-3 py-1.5 text-caption text-muted hover:text-ink hover:bg-surface-2 transition-colors"
        >
          <Icon name={a.icon} size={13} color="currentColor" />
          {a.label}
        </Link>
      ))}
    </nav>
  );
}
