"use client";

/**
 * TopNav — a navegação do ERP, agora HORIZONTAL (o menu vertical saiu).
 *
 * · Desktop (lg+): um gatilho por grupo do dia a dia direto na barra lima +
 *   um "Mais" que abre um painel em colunas com a profundidade do Modo Pro e
 *   as Configurações. Os dados vêm de `dashboard/nav-data` — a MESMA árvore que
 *   a barra lateral usava, sem rota removida.
 * · Mobile (< lg): o hambúrguer da TopBar abre um drawer com tudo (evento
 *   global `a4p:toggle-nav`, o mesmo de antes).
 *
 * Contraste: o fundo da barra é LIMA, então texto/ícone entram em `on-lime`
 * (#11190C) — nunca texto claro sobre lima. Dentro dos painéis (fundo branco)
 * vale a paleta normal do DS.
 */
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, Icon } from "@/components/ui";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { useModo } from "@/components/app/useModo";
import { leafAtivo, useNavSections, type Item, type Section } from "@/components/dashboard/nav-data";
import { isDemo } from "@/lib/demo";
import { cn } from "@/lib/utils";

const SUPA_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/** Fecha um painel ao clicar fora ou apertar Esc. */
function useFechar(aberto: boolean, fechar: () => void) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!aberto) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) fechar(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [aberto, fechar]);
  return ref;
}

const secaoAtiva = (s: Section, pathname: string) => s.items.some((i) => leafAtivo(i.href, pathname));

/* ============================ item de painel ============================ */
function PanelItem({ item, pathname, onNavigate }: { item: Item; pathname: string; onNavigate: () => void }) {
  if (item.event && !item.href) {
    return (
      <button
        onClick={() => { window.dispatchEvent(new Event(item.event!)); onNavigate(); }}
        className="flex items-center gap-[10px] rounded-[10px] px-[10px] py-2 text-left hover:bg-surface-2"
      >
        <Icon name={item.icon} size={17} color="var(--color-lime)" />
        <span className="text-[14px] font-medium text-ink truncate">{item.label}</span>
      </button>
    );
  }
  if (item.soon || !item.href) {
    return (
      <span aria-disabled="true" className="flex items-center gap-[10px] rounded-[10px] px-[10px] py-2 opacity-45 cursor-not-allowed select-none">
        <Icon name={item.icon} size={17} color="var(--color-text-secondary)" />
        <span className="text-[14px] text-muted truncate flex-1">{item.label}</span>
        <span className="text-[11px] text-faint bg-surface-2 rounded-pill px-[6px] py-[1px] shrink-0">Em breve</span>
      </span>
    );
  }
  const on = leafAtivo(item.href, pathname);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={on ? "page" : undefined}
      className={cn("relative flex items-center gap-[10px] rounded-[10px] px-[10px] py-2", on ? "bg-surface-2" : "hover:bg-surface-2")}
    >
      {on && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[15px] w-[3px] rounded-pill bg-lime" aria-hidden />}
      <Icon name={item.icon} size={17} color={on ? "var(--color-ink)" : "var(--color-text-secondary)"} />
      <span className={cn("text-[14px] truncate", on ? "text-ink font-semibold" : "text-muted font-medium")}>{item.label}</span>
    </Link>
  );
}

/* ============================ gatilho da barra ============================ */
function Trigger({ label, aberto, ativo, onClick }: { label: string; aberto: boolean; ativo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={aberto}
      data-navtrigger=""
      className={cn(
        "inline-flex items-center gap-1 h-9 px-3 rounded-pill text-[14px] font-medium whitespace-nowrap transition-colors",
        ativo || aberto ? "bg-white text-on-lime" : "text-on-lime hover:bg-black/5",
      )}
    >
      {label}
      <Icon name="chevron-down" size={14} color="var(--color-on-lime)" />
    </button>
  );
}

/* ============================ nav do desktop ============================ */
export function TopNav() {
  const pathname = usePathname();
  const { principais, extras, config } = useNavSections();
  const [aberto, setAberto] = React.useState<string | null>(null);
  const fechar = React.useCallback(() => setAberto(null), []);
  const ref = useFechar(aberto !== null, fechar);

  React.useEffect(() => { setAberto(null); }, [pathname]);

  const colunasMais = [...extras, config];

  return (
    <nav ref={ref} className="a4p-topnav relative hidden lg:flex items-center gap-1 min-w-0">
      {principais.map((s) => (
        <div key={s.id} className="relative">
          <Trigger label={s.label} aberto={aberto === s.id} ativo={secaoAtiva(s, pathname)} onClick={() => setAberto((a) => (a === s.id ? null : s.id))} />
          {aberto === s.id && (
            <div className="absolute left-0 top-full mt-2 z-50 min-w-[264px] bg-white rounded-card p-2 flex flex-col gap-[2px] shadow-popover">
              {s.items.map((it, i) => <PanelItem key={it.href ?? it.label + i} item={it} pathname={pathname} onNavigate={fechar} />)}
            </div>
          )}
        </div>
      ))}

      {colunasMais.length > 0 && (
        <div className="relative">
          <Trigger label="Mais" aberto={aberto === "mais"} ativo={colunasMais.some((s) => secaoAtiva(s, pathname))} onClick={() => setAberto((a) => (a === "mais" ? null : "mais"))} />
          {aberto === "mais" && (
            <div className="absolute left-0 top-full mt-2 z-50 bg-white rounded-card p-4 shadow-popover max-w-[min(92vw,880px)] max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4">
                {colunasMais.map((s) => (
                  <div key={s.id} className="flex flex-col gap-[2px] min-w-[220px]">
                    <span data-navlabel="" className="px-[10px] pb-1 text-[12px] font-semibold text-faint truncate">{s.label}</span>
                    {s.items.map((it, i) => <PanelItem key={it.href ?? it.label + i} item={it} pathname={pathname} onNavigate={fechar} />)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

/* ============================ menu da conta ============================ */
export function AccountMenu({ nome, email }: { nome: string; email: string }) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const fechar = React.useCallback(() => setAberto(false), []);
  const ref = useFechar(aberto, fechar);
  const { pro, set: setPro } = useModo();
  const { pessoal } = useNavSections();

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((o) => !o)}
        aria-expanded={aberto}
        className={cn("flex items-center gap-2 rounded-pill pl-1 pr-2 py-1 transition-colors", aberto ? "bg-white" : "hover:bg-black/5")}
        title={isDemo ? "Modo demonstração" : (email || "Minha conta")}
      >
        <Avatar name={nome} size={30} />
        <span className="hidden md:inline text-[14px] font-medium text-on-lime truncate max-w-[140px]">{nome}</span>
      </button>

      {aberto && (
        <div className="absolute right-0 top-full mt-2 z-50 w-[260px] bg-white rounded-card p-2 flex flex-col gap-[2px] shadow-popover">
          <div className="px-[10px] py-2">
            <div className="text-[14px] font-medium text-ink truncate">{nome}</div>
            <div className="text-[12px] text-faint truncate">{isDemo ? "modo demonstração" : email}</div>
          </div>
          <div className="h-px bg-border-soft my-1" />

          {!pessoal && (
            <button
              onClick={() => setPro(pro ? "simples" : "pro")}
              title={pro ? "Modo Pro ativo — some para o essencial (Simples)" : "Modo Pro — desbloqueia Fiscal, Contabilidade, Inteligência e Plataforma"}
              className="flex items-center gap-[10px] rounded-[10px] px-[10px] py-2 hover:bg-surface-2"
            >
              <Icon name="sparkles" size={17} color={pro ? "var(--color-ink)" : "var(--color-text-secondary)"} />
              <span className={cn("text-[14px] font-medium", pro ? "text-ink" : "text-muted")}>Modo Pro</span>
              <span className={cn("ml-auto w-[34px] h-[20px] rounded-pill p-[2px] transition-colors", pro ? "bg-lime" : "bg-surface-3")}>
                <span className={cn("block w-[16px] h-[16px] rounded-pill bg-white transition-transform", pro && "translate-x-[14px]")} />
              </span>
            </button>
          )}
          <ThemeToggle />

          {SUPA_CONFIGURED && (
            <button
              onClick={async () => {
                const { createClient } = await import("@/lib/supabase/client");
                await createClient().auth.signOut();
                fechar();
                router.push("/login");
                router.refresh();
              }}
              className="flex items-center gap-[10px] rounded-[10px] px-[10px] py-2 hover:bg-surface-2"
            >
              <Icon name="arrow-up-right" size={17} color="var(--color-text-secondary)" />
              <span className="text-[14px] font-medium text-muted">Sair</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================ drawer do mobile ============================ */
export function NavDrawer() {
  const pathname = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const { principais, extras, config, pessoal } = useNavSections();
  const { pro, set: setPro } = useModo();

  React.useEffect(() => {
    const toggle = () => setAberto((o) => !o);
    window.addEventListener("a4p:toggle-nav", toggle);
    return () => window.removeEventListener("a4p:toggle-nav", toggle);
  }, []);
  React.useEffect(() => { setAberto(false); }, [pathname]);

  const secoes = [...principais, ...extras, config];

  return (
    <>
      {aberto && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setAberto(false)} aria-hidden="true" />}
      <aside
        className={cn(
          "a4p-navdrawer lg:hidden fixed inset-y-0 left-0 w-sidebar max-w-[86vw] z-50 bg-white border-r border-border",
          "flex flex-col py-4 px-3 transition-transform duration-200 ease-out",
          aberto ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!aberto}
      >
        <div className="flex items-center pb-3">
          <span className="text-[13px] font-semibold text-faint px-2">Navegação</span>
          <button
            onClick={() => setAberto(false)}
            aria-label="Fechar menu"
            className="ml-auto inline-flex items-center justify-center rounded-md hover:bg-surface-2 p-[6px]"
          >
            <Icon name="x" size={18} color="var(--color-text-secondary)" />
          </button>
        </div>

        <nav className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mr-1 pr-1">
          {secoes.map((s, si) => (
            <div key={s.id} className={cn("flex flex-col gap-[2px] mt-3 first:mt-0", si === secoes.length - 1 ? "pt-2 mt-3 border-t border-border-soft" : "")}>
              <span data-navlabel="" className="px-[10px] pt-[2px] pb-[3px] text-[12px] font-semibold text-faint truncate">{s.label}</span>
              {s.items.map((it, i) => <PanelItem key={it.href ?? it.label + i} item={it} pathname={pathname} onNavigate={() => setAberto(false)} />)}
            </div>
          ))}
        </nav>

        <div className="shrink-0 flex flex-col gap-[2px] pt-[10px] mt-[10px] border-t border-border-soft">
          {!pessoal && (
            <button
              onClick={() => setPro(pro ? "simples" : "pro")}
              className="flex items-center gap-[10px] rounded-[10px] px-[10px] py-2 hover:bg-surface-2"
            >
              <Icon name="sparkles" size={17} color={pro ? "var(--color-ink)" : "var(--color-text-secondary)"} />
              <span className={cn("text-[14px] font-medium", pro ? "text-ink" : "text-muted")}>Modo Pro</span>
              <span className={cn("ml-auto w-[34px] h-[20px] rounded-pill p-[2px] transition-colors", pro ? "bg-lime" : "bg-surface-3")}>
                <span className={cn("block w-[16px] h-[16px] rounded-pill bg-white transition-transform", pro && "translate-x-[14px]")} />
              </span>
            </button>
          )}
          <ThemeToggle />
          {SUPA_CONFIGURED && (
            <button
              onClick={async () => {
                const { createClient } = await import("@/lib/supabase/client");
                await createClient().auth.signOut();
                setAberto(false);
                router.push("/login");
                router.refresh();
              }}
              className="flex items-center gap-[10px] rounded-[10px] px-[10px] py-2 hover:bg-surface-2"
            >
              <Icon name="arrow-up-right" size={17} color="var(--color-text-secondary)" />
              <span className="text-[14px] font-medium text-muted">Sair</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
