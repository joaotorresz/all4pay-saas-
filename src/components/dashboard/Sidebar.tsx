"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui";
import { useModo } from "@/components/app/useModo";
import { SeletorOrganizacao } from "@/components/app/SeletorOrganizacao";
import { grupoDaRota, indiceItemAtivo, useNavSections, type Item, type Section } from "@/components/dashboard/nav-data";
import { cn } from "@/lib/utils";

/**
 * O MENU LATERAL DA PROPOSTA (canvas "Quattro · Home", out/2026).
 *
 * Um cartão branco com TODOS os grupos em acordeão — a barra de pílulas
 * horizontal (`NavHorizontal`) saiu da moldura. No topo, "Criar" (o mesmo
 * painel do evento `a4p:criar`) e o botão de recolher, na mesma linha; no pé,
 * o Modo Pro e o seletor de empresa, que moravam na barra de pílulas.
 *
 * ⚠️ UM grupo aberto por vez. Com todos abertos o menu volta a ser a lista
 * de sessenta itens que o agrupamento existe para evitar. O grupo da rota
 * atual abre sozinho — o menu tem de dizer onde você está.
 *
 * ⚠️ Recolhido, vira trilho de ícones; clicar num ícone EXPANDE e abre o
 * grupo — recolher não pode custar o acesso.
 */

const STORAGE_KEY = "a4p_sidebar_collapsed";
const LARGURA_KEY = "a4p_sidebar_width";
const LARGURA_PADRAO = 260;
const LARGURA_MIN = 200;
const LARGURA_MAX = 420;
const LIMIAR_RECOLHER = 160;
const LIMIAR_EXPANDIR = 120;

/** O destino de um grupo-folha (sem itens) ou o primeiro item dele. */
function destinoDoGrupo(s: Section): string | undefined {
  return s.href ?? s.items.find((i) => i.href)?.href;
}

export function Sidebar() {
  const pathname = usePathname();
  const busca = useSearchParams().toString();
  const router = useRouter();
  const { sections, pessoal } = useNavSections();
  const { pro, set: setPro, temDireito } = useModo();

  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(true);
  const [largura, setLargura] = React.useState(LARGURA_PADRAO);
  const [arrastando, setArrastando] = React.useState(false);

  const ativo = React.useMemo(() => grupoDaRota(sections, pathname), [sections, pathname]);
  const [aberto, setAberto] = React.useState<string | null>(ativo?.id ?? null);
  React.useEffect(() => { setAberto(ativo?.id ?? null); }, [ativo?.id]);

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
      const salva = Number(localStorage.getItem(LARGURA_KEY));
      if (Number.isFinite(salva) && salva >= LARGURA_MIN && salva <= LARGURA_MAX) setLargura(salva);
    } catch { /* preferência local: sem ela, vale o padrão */ }
  }, []);

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  React.useEffect(() => {
    const toggle = () => setMobileOpen((o) => !o);
    window.addEventListener("a4p:toggle-nav", toggle);
    return () => window.removeEventListener("a4p:toggle-nav", toggle);
  }, []);

  React.useEffect(() => { setMobileOpen(false); }, [pathname]);

  const definirRecolhida = React.useCallback((v: boolean) => {
    setCollapsed(v);
    try { localStorage.setItem(STORAGE_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  }, []);
  const aplicarLargura = React.useCallback((px: number) => {
    setLargura(px);
    try { localStorage.setItem(LARGURA_KEY, String(px)); } catch { /* ignore */ }
  }, []);

  const col = collapsed && isDesktop;

  // Arrastar a borda: os ouvintes ficam no DOCUMENTO (o ponteiro sai da alça
  // assim que a barra alarga) e a transição de largura é desligada no gesto.
  const iniciarArrasto = React.useCallback((e: React.PointerEvent) => {
    if (!isDesktop) return;
    e.preventDefault();
    setArrastando(true);
    const mover = (ev: PointerEvent) => {
      const x = ev.clientX;
      if (collapsed) {
        if (x > LIMIAR_EXPANDIR) { definirRecolhida(false); aplicarLargura(Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, x))); }
        return;
      }
      if (x < LIMIAR_RECOLHER) { definirRecolhida(true); return; }
      aplicarLargura(Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, x)));
    };
    const soltar = () => {
      setArrastando(false);
      document.removeEventListener("pointermove", mover);
      document.removeEventListener("pointerup", soltar);
      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("cursor");
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerup", soltar);
  }, [isDesktop, collapsed, aplicarLargura, definirRecolhida]);

  const clicarGrupo = (s: Section) => {
    if (col) definirRecolhida(false);
    if (s.items.length === 0) return; // folha: o Link navega
    setAberto((a) => (a === s.id && !col ? null : s.id));
  };

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}
      <aside
        style={isDesktop && !col ? { width: largura } : undefined}
        className={cn(
          "a4p-sidebar relative bg-white border border-border flex flex-col p-4 z-50 rounded-[20px]",
          "fixed inset-y-3 left-3 w-sidebar transition-transform duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-[110%]",
          "lg:static lg:translate-x-0 lg:shrink-0 lg:self-start lg:max-h-full",
          arrastando ? "" : "lg:transition-[width]",
          col && "lg:w-[76px] lg:px-3",
        )}
      >
        <div
          onPointerDown={iniciarArrasto}
          onDoubleClick={() => { definirRecolhida(false); aplicarLargura(LARGURA_PADRAO); }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar menu (duplo clique restaura a largura padrão)"
          title="Arraste para redimensionar · duplo clique restaura"
          className={cn(
            "hidden lg:block absolute inset-y-0 -right-[3px] w-[6px] z-10 cursor-col-resize",
            "after:absolute after:inset-y-0 after:left-[2px] after:w-[2px] after:transition-colors",
            arrastando ? "after:bg-lime" : "hover:after:bg-border",
          )}
        />

        {/* Criar + recolher na MESMA linha; recolhida, empilham. */}
        <div className={cn("flex gap-2 mb-3", col ? "flex-col items-center" : "items-center")}>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("a4p:criar"))}
            aria-label="Criar novo registro"
            title="Criar novo registro"
            className={cn(
              "h-11 rounded-pill bg-lime text-on-lime text-[14px] font-medium inline-flex items-center justify-center gap-2",
              col ? "w-11" : "flex-1 min-w-0",
            )}
          >
            <Icon name="plus" size={16} color="currentColor" />
            {!col && <span>Criar</span>}
          </button>
          <button
            type="button"
            onClick={() => definirRecolhida(!collapsed)}
            aria-label={col ? "Expandir menu" : "Recolher menu"}
            title={col ? "Expandir menu" : "Recolher menu"}
            className="hidden lg:inline-flex w-11 h-11 shrink-0 rounded-pill bg-surface-2 items-center justify-center text-ink"
          >
            <Icon name={col ? "chevron-right" : "chevron-left"} size={17} color="currentColor" />
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            className="lg:hidden inline-flex w-11 h-11 shrink-0 rounded-pill bg-surface-2 items-center justify-center text-ink"
          >
            <Icon name="x" size={18} color="currentColor" />
          </button>
        </div>

        <nav aria-label="Seções do sistema" className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mr-1 pr-1">
          {sections.map((s) => {
            const marcado = ativo?.id === s.id;
            const abertoAqui = !col && aberto === s.id && s.items.length > 0;
            const href = destinoDoGrupo(s);
            const conteudo = (
              <>
                <Icon name={s.icon ?? "layers"} size={18} color="currentColor" className="shrink-0" />
                {!col && <span className="flex-1 min-w-0 text-left truncate">{s.label}</span>}
                {!col && marcado && s.items.length === 0 && (
                  <span aria-hidden className="w-[6px] h-[6px] rounded-pill bg-ink shrink-0" />
                )}
                {!col && s.items.length > 0 && (
                  <Icon name="chevron-right" size={14} color="var(--color-text-secondary)"
                    className={cn("shrink-0 transition-transform", abertoAqui && "rotate-90")} />
                )}
              </>
            );
            const classe = cn(
              "flex items-center gap-[10px] min-h-[44px] rounded-[12px] text-[14px] text-ink transition-colors",
              col ? "justify-center px-0" : "px-3",
              marcado ? "bg-surface-1 font-medium" : "hover:bg-surface-2/60",
            );
            return (
              <div key={s.id} className="flex flex-col">
                {s.items.length === 0 && href ? (
                  <Link href={href} title={s.label} aria-current={marcado ? "page" : undefined} className={classe}>{conteudo}</Link>
                ) : (
                  <button type="button" title={s.label} aria-expanded={abertoAqui} onClick={() => clicarGrupo(s)} className={classe}>
                    {conteudo}
                  </button>
                )}
                {abertoAqui && <ItensDoGrupo itens={s.items} pathname={pathname} busca={busca} />}
              </div>
            );
          })}
        </nav>

        <div className={cn("mt-3 pt-3 border-t border-border flex flex-col gap-2", col && "items-center")}>
          {!pessoal && (
            <button
              type="button"
              role="switch"
              aria-checked={pro}
              aria-label={`Modo Pro: ${pro ? "ativado" : "desativado"}${temDireito ? "" : " — não incluso no plano"}`}
              onClick={() => { if (!setPro(pro ? "simples" : "pro")) router.push("/planos?de=modo-pro"); }}
              title={!temDireito ? "Modo Pro — não incluso no plano desta empresa. Ver planos." : pro ? "Modo Pro ativo" : "Modo Pro"}
              className={cn("flex items-center gap-[10px] min-h-[44px] rounded-[12px] text-[14px] text-ink hover:bg-surface-2/60", col ? "justify-center px-0" : "px-3")}
            >
              <Icon name="sparkles" size={18} color="currentColor" className="shrink-0" />
              {!col && (
                <>
                  <span className="flex-1 text-left">Modo Pro</span>
                  <span className="text-[11px] text-muted">{!temDireito ? "plano" : pro ? "on" : "off"}</span>
                </>
              )}
            </button>
          )}
          <SeletorOrganizacao collapsed={col} />
        </div>
      </aside>
    </>
  );
}

function ItensDoGrupo({ itens, pathname, busca }: { itens: Item[]; pathname: string; busca: string }) {
  const iAtivo = indiceItemAtivo(itens, pathname, busca);
  return (
    <div className="flex flex-col ml-[21px] pl-3 border-l border-border my-1">
      {itens.map((it, i) => {
        const on = i === iAtivo;
        const classe = cn(
          "flex items-center gap-2 min-h-[36px] px-2 rounded-[10px] text-[13px] text-ink transition-colors",
          on ? "font-medium bg-surface-1" : "hover:bg-surface-2/60",
        );
        const rotulo = (
          <>
            <span className="flex-1 min-w-0 truncate">{it.label}</span>
            {on && <span aria-hidden className="w-[6px] h-[6px] rounded-pill bg-ink shrink-0" />}
          </>
        );
        if (it.event && !it.href) {
          return <button key={it.label} type="button" title={it.desc ?? it.label} onClick={() => window.dispatchEvent(new Event(it.event!))} className={cn(classe, "text-left")}>{rotulo}</button>;
        }
        if (it.soon || !it.href) {
          return <span key={it.label} aria-disabled="true" className={cn(classe, "opacity-45 cursor-not-allowed")}>{rotulo}</span>;
        }
        return <Link key={it.href} href={it.href} title={it.desc ?? it.label} aria-current={on ? "page" : undefined} className={classe}>{rotulo}</Link>;
      })}
    </div>
  );
}
