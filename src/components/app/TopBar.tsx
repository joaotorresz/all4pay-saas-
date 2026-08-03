"use client";

/**
 * Barra superior do app — no modelo da referência.
 *
 * Marca à esquerda e, à direita, TRÊS ícones limpos: configurações, sino e o
 * "mais" (⋮). Nada mais.
 *
 * ⚠️ O resto das ações globais (busca, tema, perfil, sair) mora dentro do ⋮.
 * Uma barra com sete controles disputa atenção com o conteúdo — e o conteúdo é
 * a razão da tela existir. Aqui em cima ficam só os três destinos que se usa
 * de qualquer lugar; o quarto clique é aceitável para o que se usa uma vez por
 * semana.
 *
 * A marca subiu da Sidebar porque, presa no cartão do menu, ela encolhia junto
 * e sumia ao recolher.
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
    // Mesma superfície e mesmo raio do cartão do menu: as duas peças de chrome
    // do app leem como o MESMO material, e não como duas ilhas de estilos
    // diferentes em volta do conteúdo.
    <header className="shrink-0 flex items-center gap-2 h-[56px] mx-3 mt-3 px-3 lg:px-4 rounded-[20px] bg-white border border-border-soft a4p-topbar">
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

      <AcaoTopo icone="settings" rotulo="Configurações" onClick={() => router.push("/dashboard/administration")} />
      <AcaoTopo
        icone="bell"
        rotulo={naoLidos > 0 ? `Anúncios (${naoLidos} não lidos)` : "Anúncios"}
        // ⚠️ Um PONTO, não um número. O sino diz "tem coisa nova"; a contagem
        // exata é da tela de anúncios, e um badge numérico aqui vira um número
        // que ninguém consegue zerar sem sair do que estava fazendo.
        ponto={naoLidos > 0}
        onClick={() => router.push("/dashboard/help?aba=anuncios")}
      />

      <div ref={ref} className="relative">
        <AcaoTopo
          icone="more-vertical"
          rotulo="Mais"
          onClick={() => setMenu((m) => !m)}
          ativo={menu}
        />

        {menu && (
          <div className="absolute right-0 mt-2 z-[60] w-[248px] rounded-card bg-white border border-border-soft overflow-hidden">
            <div className="px-4 py-3 border-b border-border-soft flex items-center gap-3">
              <Avatar name={nome} size={30} />
              <div className="min-w-0">
                <div className="text-label font-medium text-ink truncate">{nome}</div>
                <div className="text-caption text-faint truncate">{email}</div>
              </div>
            </div>
            <ItemMenu
              icone="search" rotulo="Buscar" atalho="⌘K"
              onClick={() => { setMenu(false); window.dispatchEvent(new Event("a4p:open-search")); }}
            />
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
  icone, rotulo, onClick, ponto, ativo,
}: { icone: string; rotulo: string; onClick: () => void; ponto?: boolean; ativo?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        "relative inline-flex items-center justify-center w-9 h-9 rounded-pill transition-colors",
        ativo ? "bg-surface-2 text-ink" : "text-ink/70 hover:text-ink hover:bg-surface-2",
      )}
    >
      <Icon name={icone} size={19} color="currentColor" />
      {ponto && (
        <span
          className="absolute top-[7px] right-[8px] w-[7px] h-[7px] rounded-pill"
          style={{ background: "var(--color-warning)", boxShadow: "0 0 0 2px var(--color-surface-1)" }}
        />
      )}
    </button>
  );
}

function ItemMenu({
  icone, rotulo, atalho, onClick, perigo,
}: { icone: string; rotulo: string; atalho?: string; onClick: () => void; perigo?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-[10px] text-left transition-colors hover:bg-surface-2",
        perigo ? "text-negative" : "text-ink",
      )}
    >
      <Icon name={icone} size={15} color="currentColor" />
      <span className="text-label flex-1">{rotulo}</span>
      {atalho && <kbd className="text-[11px] font-medium text-faint tabular-nums">{atalho}</kbd>}
    </button>
  );
}
