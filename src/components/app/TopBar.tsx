"use client";

/**
 * Barra superior do app.
 *
 * A marca sai da Sidebar e sobe para cá: com o menu virando um cartão
 * flutuante, o logo preso dentro dele encolhia junto e sumia quando a barra
 * recolhia. No topo ele fica fixo, e a identidade não depende do estado do
 * menu.
 *
 * À direita ficam as ações que valem em QUALQUER tela — busca, tema,
 * configurações, anúncios e a conta. Nada aqui é específico de uma página: o
 * que é da tela mora no header dela.
 */
import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Icon } from "@/components/ui";
import { useTheme } from "@/components/app/ThemeToggle";
import { isDemo } from "@/lib/demo";
import { listarAnuncios } from "@/lib/ajuda-store";
import { cn } from "@/lib/utils";

const SUPA_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export function TopBar() {
  const router = useRouter();
  const { dark, toggle } = useTheme();
  const [naoLidos, setNaoLidos] = React.useState(0);
  const [menu, setMenu] = React.useState(false);
  const [usuario, setUsuario] = React.useState<{ nome: string; email: string } | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // localStorage não existe no servidor — ler depois de montar evita o
    // descasamento de hidratação que já mordeu o painel de integrações.
    try { setNaoLidos(listarAnuncios().filter((a) => !a.lido).length); } catch { /* ignore */ }
  }, []);

  React.useEffect(() => {
    if (isDemo || !SUPA_CONFIGURED) return;
    let ativo = true;
    import("@/lib/supabase/client").then(async ({ createClient }) => {
      const { data } = await createClient().auth.getUser();
      if (!ativo || !data.user) return;
      const email = data.user.email ?? "";
      const meta = data.user.user_metadata as { name?: string; full_name?: string } | undefined;
      setUsuario({ nome: meta?.name || meta?.full_name || (email ? email.split("@")[0] : "Usuário"), email });
    });
    return () => { ativo = false; };
  }, []);

  React.useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", esc); };
  }, [menu]);

  const nome = isDemo ? "Demonstração" : (usuario?.nome ?? "Conta");
  const email = isDemo ? "modo demonstração" : (usuario?.email ?? "");

  return (
    <header className="shrink-0 flex items-center gap-3 h-[60px] px-4 lg:px-5">
      <button
        onClick={() => window.dispatchEvent(new Event("a4p:toggle-nav"))}
        aria-label="Abrir menu"
        className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-md text-muted hover:bg-surface-2"
      >
        <Icon name="menu" size={19} color="currentColor" />
      </button>

      <Link href="/" aria-label="Início" className="inline-flex items-center shrink-0">
        <Image src="/all4pay-dark.png" alt="all4pay" width={110} height={22} className="h-[22px] w-auto dark:hidden" priority />
        <Image src="/all4pay-lime.png" alt="all4pay" width={110} height={22} className="h-[22px] w-auto hidden dark:block" priority />
      </Link>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("a4p:open-search"))}
        aria-label="Buscar no sistema"
        title="Buscar no sistema"
        className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-pill bg-surface-2 hover:bg-surface-3 transition-colors"
      >
        <Icon name="search" size={16} color="var(--color-text-secondary)" />
        <span className="text-[14px] text-muted">Buscar…</span>
        <kbd className="text-[11px] font-medium text-faint tabular-nums">⌘K</kbd>
      </button>

      <AcaoTopo icone="search" rotulo="Buscar" className="sm:hidden" onClick={() => window.dispatchEvent(new Event("a4p:open-search"))} />
      <AcaoTopo icone={dark ? "sun" : "moon"} rotulo={dark ? "Tema claro" : "Tema escuro"} onClick={toggle} />
      <AcaoTopo icone="settings" rotulo="Configurações" onClick={() => router.push("/dashboard/administration")} />
      <AcaoTopo
        icone="mail"
        rotulo="Anúncios"
        badge={naoLidos}
        onClick={() => router.push("/dashboard/help?aba=anuncios")}
      />

      <div ref={ref} className="relative">
        <button
          onClick={() => setMenu((m) => !m)}
          aria-label="Conta"
          aria-expanded={menu}
          className="inline-flex items-center gap-2 pl-1 pr-2 h-9 rounded-pill hover:bg-surface-2 transition-colors"
        >
          <Avatar name={nome} size={28} />
          <span className="hidden lg:block text-label text-ink max-w-[140px] truncate">{nome}</span>
          <Icon name="chevron-down" size={14} color="var(--color-text-tertiary)" className={cn("transition-transform", menu && "rotate-180")} />
        </button>

        {menu && (
          <div className="absolute right-0 mt-2 z-[60] w-[248px] rounded-card bg-white shadow-popover overflow-hidden">
            <div className="px-4 py-3 border-b border-border-soft">
              <div className="text-label font-medium text-ink truncate">{nome}</div>
              <div className="text-caption text-faint truncate">{email}</div>
            </div>
            <ItemMenu icone="settings" rotulo="Meu perfil" onClick={() => { setMenu(false); router.push("/configuracoes"); }} />
            <ItemMenu icone="help-circle" rotulo="Central de ajuda" onClick={() => { setMenu(false); router.push("/dashboard/help"); }} />
            <ItemMenu icone={dark ? "sun" : "moon"} rotulo={dark ? "Tema claro" : "Tema escuro"} onClick={() => { setMenu(false); toggle(); }} />
            {SUPA_CONFIGURED && (
              <ItemMenu
                icone="arrow-up-right"
                rotulo="Sair"
                perigo
                onClick={async () => {
                  setMenu(false);
                  const { createClient } = await import("@/lib/supabase/client");
                  await createClient().auth.signOut();
                  router.push("/login");
                  router.refresh();
                }}
              />
            )}
          </div>
        )}
      </div>
    </header>
  );
}

function AcaoTopo({
  icone, rotulo, onClick, badge, className,
}: { icone: string; rotulo: string; onClick: () => void; badge?: number; className?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className={cn("relative inline-flex items-center justify-center w-9 h-9 rounded-pill text-muted hover:text-ink hover:bg-surface-2 transition-colors", className)}
    >
      <Icon name={icone} size={18} color="currentColor" />
      {!!badge && badge > 0 && (
        <span className="absolute top-[5px] right-[5px] min-w-[15px] h-[15px] px-1 rounded-pill bg-lime text-on-lime text-[10px] font-semibold leading-[15px] tabular-nums">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

function ItemMenu({
  icone, rotulo, onClick, perigo,
}: { icone: string; rotulo: string; onClick: () => void; perigo?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-[10px] text-left transition-colors hover:bg-surface-2",
        perigo ? "text-negative" : "text-ink",
      )}
    >
      <Icon name={icone} size={15} color="currentColor" />
      <span className="text-label">{rotulo}</span>
    </button>
  );
}
