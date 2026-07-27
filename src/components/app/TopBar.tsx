"use client";

/**
 * TopBar — faixa horizontal no topo do ERP (referência: barra da Betano).
 *
 * Composição: marca all4pay · busca global · conta. O slot do meio fica
 * propositalmente livre para as entradas de navegação que ainda vamos decidir
 * (`children` renderiza entre a marca e a busca).
 *
 * Contraste: o fundo é LIMA, então texto/ícone entram em `on-lime` (#11190C).
 * Nunca texto claro sobre lima — é a regra de ouro do DS. Pelo mesmo motivo a
 * logo usada é a ESCURA (`all4pay-dark.png`) nos dois temas: a lima não inverte.
 */
import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Avatar, Icon } from "@/components/ui";
import { isDemo } from "@/lib/demo";

const SUPA_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export function TopBar({ children }: { children?: React.ReactNode }) {
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
      className="a4p-topbar shrink-0 h-[56px] bg-lime text-on-lime flex items-center gap-3 px-3 sm:px-4"
      style={{ color: "var(--color-on-lime)" }}
    >
      {/* hambúrguer (mobile) — abre a Sidebar */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("a4p:toggle-nav"))}
        aria-label="Abrir menu"
        className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-black/10 shrink-0"
      >
        <Icon name="menu" size={20} color="var(--color-on-lime)" />
      </button>

      {/* marca */}
      <Link href="/" className="flex items-center shrink-0 rounded-md px-1 py-1 hover:bg-black/5" aria-label="all4pay — Início">
        <Image src="/all4pay-dark.png" alt="all4pay" width={104} height={24} priority className="h-[22px] w-auto" />
      </Link>

      {/* slot de navegação — a definir */}
      {children && <nav className="hidden lg:flex items-center gap-1 min-w-0">{children}</nav>}

      {/* busca — abre a command palette (⌘K), o mesmo motor da Sidebar */}
      <button
        type="button"
        onClick={abrirBusca}
        className="ml-auto flex items-center gap-2 h-9 min-w-0 flex-1 max-w-[380px] rounded-pill bg-white/70 hover:bg-white px-3 text-left transition-colors"
        aria-label="Buscar no sistema"
      >
        <Icon name="search" size={16} color="var(--color-on-lime)" />
        <span className="text-[14px] text-on-lime/70 truncate">Buscar…</span>
        <kbd className="ml-auto hidden sm:inline text-[11px] font-medium text-on-lime/60 tabular-nums">⌘K</kbd>
      </button>

      {/* conta */}
      <Link
        href="/configuracoes"
        className="shrink-0 flex items-center gap-2 rounded-pill hover:bg-black/5 pl-1 pr-2 py-1"
        title={isDemo ? "Modo demonstração" : (usuario?.email ?? "Minha conta")}
      >
        <Avatar name={nome} size={30} />
        <span className="hidden md:inline text-[14px] font-medium text-on-lime truncate max-w-[140px]">{nome}</span>
      </Link>
    </header>
  );
}
