"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { grupoDaRota, useNavSections, type Section } from "@/components/dashboard/nav-data";
import { cn } from "@/lib/utils";

/**
 * A BARRA DE BAIXO DO CELULAR (28/10/2026, pedido do João: "a navegação mobile
 * ainda está bem ruim").
 *
 * No telefone o menu inteiro mora na gaveta do hambúrguer, e trocar entre as
 * áreas do dia a dia custava três toques (abrir, achar o grupo, achar a tela).
 * Esta barra põe as quatro áreas que mais se abrem a UM toque, como app de
 * banco, e o Criar no centro, ao alcance do polegar.
 *
 * ⚠️ As áreas saem da MESMA fonte do menu (`useNavSections`): os quatro
 * primeiros grupos, que na empresa são Visão geral · Central de vendas ·
 * Central de despesas · Caixa e bancos, e na pessoa física os do modo dela.
 * Uma lista própria divergiria do menu no primeiro grupo renomeado.
 *
 * ⚠️ Só existe abaixo de `lg` — a mesma fronteira em que a lateral vira
 * gaveta. A altura que ela ocupa é o token `--a4p-barra-baixo` (globals.css),
 * que empurra para cima tudo o que é fixo embaixo (a barra da Quattro AI, o
 * Guia, os avisos): sem ele, cada peça teria um número próprio e a próxima
 * nasceria por baixo da barra.
 */

const ROTULO_CURTO: Record<string, string> = {
  inicio: "Início",
  "contas-a-receber": "Vendas",
  "contas-a-pagar": "Despesas",
  caixa: "Caixa",
};

function destino(s: Section): string {
  return s.href ?? s.items.find((i) => i.href)?.href ?? "/";
}

export function NavegacaoCelular() {
  const pathname = usePathname();
  const { sections } = useNavSections();
  const ativo = React.useMemo(() => grupoDaRota(sections, pathname), [sections, pathname]);
  const areas = sections.slice(0, 4);
  if (areas.length < 2) return null;

  const item = (s: Section) => {
    const on = ativo?.id === s.id;
    return (
      <Link
        key={s.id}
        href={destino(s)}
        aria-current={on ? "page" : undefined}
        data-nav-celular="area"
        className={cn(
          "flex-1 min-w-0 flex flex-col items-center justify-center gap-1 h-full text-[11px] leading-none",
          on ? "text-ink font-medium" : "text-muted",
        )}
      >
        <span className={cn("inline-flex items-center justify-center w-12 h-7 rounded-pill transition-colors", on && "bg-surface-2")}>
          <Icon name={s.icon ?? "layers"} size={19} color="currentColor" />
        </span>
        <span className="truncate max-w-full">{ROTULO_CURTO[s.id] ?? s.label.split(" ")[0]}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navegação principal"
      data-nav-celular="barra"
      className="lg:hidden fixed inset-x-0 bottom-0 z-[35] bg-white a4p-nav-celular"
    >
      <div className="flex items-stretch h-[64px] px-2">
        {areas.slice(0, 2).map(item)}
        <div className="flex-1 flex items-center justify-center">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("a4p:criar"))}
            aria-label="Criar novo registro"
            data-nav-celular="criar"
            className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-lime text-on-lime"
          >
            <Icon name="plus" size={22} color="currentColor" />
          </button>
        </div>
        {areas.slice(2, 4).map(item)}
      </div>
    </nav>
  );
}
