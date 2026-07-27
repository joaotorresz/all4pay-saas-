"use client";

/**
 * TopBar — faixa horizontal no topo do ERP (referência: barra da Betano).
 *
 * Com a saída do MENU VERTICAL, esta barra passou a carregar a navegação
 * inteira: marca (canto superior esquerdo, o lugar de sempre) · grupos do menu
 * (`TopNav`, com painel por grupo e um "Mais" para a profundidade do Modo Pro)
 * · busca global · conta (`AccountMenu`, com Modo Pro, tema e sair). No mobile o
 * hambúrguer abre o `NavDrawer` — o mesmo evento `a4p:toggle-nav` de antes.
 *
 * Contraste: o fundo é LIMA, então texto/ícone entram em `on-lime` (#11190C).
 * Nunca texto claro sobre lima — é a regra de ouro do DS. A logo é a arte
 * escura invertida por filtro (não existe PNG branco).
 */
import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { AccountMenu, NavDrawer, TopNav } from "@/components/app/TopNav";
import { isDemo } from "@/lib/demo";

const SUPA_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export function TopBar() {
  const [usuario, setUsuario] = React.useState<{ nome: string; email: string } | null>(null);

  React.useEffect(() => {
    if (isDemo || !SUPA_CONFIGURED) return;
    let vivo = true;
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const { data } = await createClient().auth.getUser();
        if (!vivo || !data.user) return;
        const meta = (data.user.user_metadata ?? {}) as { name?: string; full_name?: string };
        setUsuario({
          nome: meta.name ?? meta.full_name ?? data.user.email?.split("@")[0] ?? "Conta",
          email: data.user.email ?? "",
        });
      } catch { /* silencioso: a barra não pode quebrar por causa do perfil */ }
    })();
    return () => { vivo = false; };
  }, []);

  const nome = isDemo ? "Demonstração" : (usuario?.nome ?? "Conta");
  const abrirBusca = () => window.dispatchEvent(new Event("a4p:open-search"));

  return (
    <header
      className="a4p-topbar shrink-0 h-[56px] flex items-center gap-2 sm:gap-3 px-3 sm:px-4"
      style={{
        // Gradiente horizontal da marca (claro → saturado, esq → dir).
        background: "linear-gradient(90deg,#c7f400 0%,#d8ff00 25%,#e1ff00 50%,#e8ff00 75%,#f5ff00 100%)",
        color: "var(--color-on-lime)",
      }}
    >
      {/* marca — canto superior esquerdo, onde ela sempre esteve (antes no topo
          do menu lateral). Logo BRANCA por filtro sobre a arte escura. */}
      <Link href="/" className="flex items-center shrink-0 rounded-md px-1 py-1 hover:bg-black/5" aria-label="all4pay — Início">
        <Image
          src="/all4pay-dark.png"
          alt="all4pay"
          width={104}
          height={24}
          priority
          className="h-[22px] w-auto"
          style={{ filter: "brightness(0) invert(1)" }}
        />
      </Link>

      {/* hambúrguer (mobile) — abre o drawer de navegação */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("a4p:toggle-nav"))}
        aria-label="Abrir menu"
        className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-black/10 shrink-0"
      >
        <Icon name="menu" size={20} color="var(--color-on-lime)" />
      </button>

      {/* navegação (desktop) */}
      <TopNav />

      {/* busca — abre a command palette (⌘K), o mesmo motor de sempre */}
      <button
        type="button"
        onClick={abrirBusca}
        className="ml-auto flex items-center gap-2 h-9 min-w-0 flex-1 max-w-[280px] rounded-pill bg-white hover:bg-white px-3 text-left transition-colors"
        aria-label="Buscar no sistema"
      >
        <Icon name="search" size={16} color="var(--color-on-lime)" />
        <span className="text-[14px] text-on-lime/70 truncate">Buscar…</span>
        <kbd className="ml-auto hidden sm:inline text-[11px] font-medium text-on-lime/60 tabular-nums">⌘K</kbd>
      </button>

      {/* conta */}
      <AccountMenu nome={nome} email={usuario?.email ?? ""} />

      {/* drawer de navegação do mobile (fica aqui para viver acima do conteúdo) */}
      <NavDrawer />
    </header>
  );
}
