"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, Icon } from "@/components/ui";
import { useModo } from "@/components/app/useModo";
import { SeletorOrganizacao } from "@/components/app/SeletorOrganizacao";
import { grupoDaRota, leafAtivo, useNavSections, type Item } from "@/components/dashboard/nav-data";
import { isDemo } from "@/lib/demo";
import { cn } from "@/lib/utils";

const SUPA_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const STORAGE_KEY = "a4p_sidebar_collapsed";
const LARGURA_KEY = "a4p_sidebar_width";

/** Largura padrão (o token `w-sidebar`), e os limites do arrasto. */
const LARGURA_PADRAO = 240;
const LARGURA_MIN = 200;
const LARGURA_MAX = 420;
/** Abaixo disto o arrasto RECOLHE em vez de espremer o rótulo. */
const LIMIAR_RECOLHER = 160;
/** Arrastando o trilho recolhido para além disto, ele volta a abrir. */
const LIMIAR_EXPANDIR = 120;

/**
 * Sidebar em ACORDEÃO — CARTÃO flutuante, no modelo da referência.
 *
 * A barra não encosta mais nas bordas: é um cartão com raio e respiro, sobre o
 * canvas. A marca subiu para a `TopBar` — presa aqui dentro, ela encolhia junto
 * com o cartão e sumia ao recolher.
 *
 * Cada grupo é uma linha com ícone, rótulo e chevron; abrir revela as telas
 * dele, indentadas sob um fio vertical. Grupos sem filhos (Início, Orçamento,
 * Ajuda) são folhas e navegam direto, no mesmo nível visual.
 *
 * ⚠️ **Um grupo aberto por vez.** Com treze grupos, deixar todos abertos
 * devolveria a lista de 60 itens que o agrupamento existe para evitar — o menu
 * viraria uma rolagem em vez de um índice. O grupo da tela atual abre sozinho e
 * não fecha: o menu tem de dizer onde você está mesmo depois de você clicar em
 * outro grupo para explorar.
 *
 * Recolhida vira um trilho de ícones; clicar num ícone expande e já abre o
 * grupo — recolher não pode custar o acesso.
 *
 * **A borda direita arrasta.** Largura entre 200 e 420px, guardada por usuário.
 * Arrastar até quase fechar RECOLHE (em vez de espremer o rótulo até virar
 * reticências), e arrastar o trilho recolhido para a direita o reabre.
 */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(true);
  const [usuario, setUsuario] = React.useState<{ nome: string; email: string } | null>(null);

  const [largura, setLargura] = React.useState(LARGURA_PADRAO);
  const [arrastando, setArrastando] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    const salva = Number(localStorage.getItem(LARGURA_KEY));
    if (Number.isFinite(salva) && salva >= LARGURA_MIN && salva <= LARGURA_MAX) setLargura(salva);
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

  React.useEffect(() => {
    if (isDemo || !SUPA_CONFIGURED) return;
    let ativo = true;
    import("@/lib/supabase/client").then(async ({ createClient }) => {
      const { data } = await createClient().auth.getUser();
      if (!ativo || !data.user) return;
      const email = data.user.email ?? "";
      const meta = data.user.user_metadata as { name?: string; full_name?: string } | undefined;
      const nome = meta?.name || meta?.full_name || (email ? email.split("@")[0] : "Usuário");
      setUsuario({ nome, email });
    });
    return () => { ativo = false; };
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const col = collapsed && isDesktop;

  const aplicarLargura = React.useCallback((px: number) => {
    setLargura(px);
    try { localStorage.setItem(LARGURA_KEY, String(px)); } catch { /* ignore */ }
  }, []);

  const definirRecolhida = React.useCallback((v: boolean) => {
    setCollapsed(v);
    try { localStorage.setItem(STORAGE_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  }, []);

  /**
   * Arrasto da borda.
   *
   * A largura vem do X do ponteiro — a barra começa em 0, então o X já É a
   * largura. Os listeners ficam no `document` (não na alça) para o arrasto
   * sobreviver quando o ponteiro sai da barra, que é o caso normal ao alargar.
   */
  const iniciarArrasto = React.useCallback((e: React.PointerEvent) => {
    if (!isDesktop) return;
    e.preventDefault();
    setArrastando(true);
    const mover = (ev: PointerEvent) => {
      const x = ev.clientX;
      if (collapsed) {
        if (x > LIMIAR_EXPANDIR) {
          definirRecolhida(false);
          aplicarLargura(Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, x)));
        }
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
    // Sem isto o arrasto seleciona o texto do menu inteiro no caminho.
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerup", soltar);
  }, [isDesktop, collapsed, aplicarLargura, definirRecolhida]);

  const { sections } = useNavSections();

  /**
   * ⚠️ A Sidebar deixou de listar os GRUPOS: eles subiram para a barra
   * horizontal (`NavHorizontal`). Aqui ficam só os ITENS do grupo em que você
   * está — os dois níveis da mesma árvore, cada um na sua superfície.
   *
   * Manter o acordeão dos seis grupos aqui embaixo com os mesmos seis lá em
   * cima seria navegação duplicada: dois caminhos para cada destino, que
   * divergem no dia em que alguém mexe num deles. É o defeito que este
   * repositório passou ondas removendo.
   *
   * O grupo sai de `grupoDaRota()` — a MESMA função da barra, para as duas não
   * discordarem sobre onde você está.
   */
  const grupo = React.useMemo(() => grupoDaRota(sections, pathname), [sections, pathname]);
  const itens = grupo?.items ?? [];

  /**
   * ⚠️ Sem itens (o Início é folha), a barra não é renderizada — e o conteúdo
   * fica com a largura toda. Uma coluna vazia ao lado do painel seria pior que
   * ausência: ela ocupa espaço prometendo algo que não existe.
   *
   * O drawer do telefone acompanha: o hambúrguer da TopBar some junto, senão
   * seria um botão que abre o nada.
   */
  if (itens.length === 0) return null;

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}
      <aside
        style={isDesktop && !col ? { width: largura } : undefined}
        className={cn(
          // Borda: o hairline dos cartões da Home, herdado do CSS
          // (`.a4p-sidebar, .a4p-topbar`) — por isso `border` sem cor aqui.
          "a4p-sidebar relative bg-white flex flex-col py-3 z-50 rounded-[20px] border",
          "fixed inset-y-0 left-0 w-sidebar px-3 transition-transform duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // Dentro do cartão do app (`.a4p-app-card`, raio 28 + overflow
          // hidden): sem a margem no TOPO o canto arredondado do cartão
          // recortava o canto do menu, e o cartão parecia mal desenhado.
          "lg:static lg:translate-x-0 lg:shrink-0 lg:mt-3 lg:ml-3 lg:mb-3 lg:h-[calc(100%-24px)]",
          // A transição de largura sai durante o arrasto: com ela, a barra
          // persegue o ponteiro com atraso e o gesto parece travado.
          arrastando ? "" : "lg:transition-[width]",
          col ? "lg:w-[68px] lg:px-2" : "lg:px-3",
        )}
      >
        {/* Alça de redimensionar — a borda direita inteira. */}
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
        {/* Criar + recolher na MESMA linha: são os dois controles do topo do
            cartão, e empilhá-los custava uma faixa de altura para nada.
            Recolhida, a barra tem 68px — não cabem lado a lado, então ali eles
            voltam a empilhar. */}
        <div className={cn("flex items-center gap-2 mb-2", col ? "flex-col" : "")}>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("a4p:criar"))}
            aria-label="Criar novo registro"
            title="Criar novo registro"
            className={cn(
              "flex items-center justify-center h-10 rounded-pill bg-lime text-on-lime font-semibold transition-opacity hover:opacity-90",
              col ? "w-10 px-0 order-2" : "flex-1 gap-2 px-4",
            )}
          >
            <Icon name="plus" size={16} color="var(--color-on-lime)" />
            {!col && <span className="text-[15px]">Criar</span>}
          </button>

          <button
            onClick={toggleCollapsed}
            aria-label={col ? "Expandir menu" : "Recolher menu"}
            title={col ? "Expandir menu" : "Recolher menu"}
            // Fundo cinza do DS: sem ele o botão só existia no hover, e um
            // controle que aparece ao passar o mouse é um controle que metade
            // das pessoas nunca encontra.
            className={cn(
              "hidden lg:inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-pill bg-surface-2 hover:bg-surface-3 transition-colors",
              col ? "order-1" : "",
            )}
          >
            <Icon name={col ? "chevron-right" : "chevron-left"} size={17} color="var(--color-text-secondary)" />
          </button>

          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-pill bg-surface-2 hover:bg-surface-3 transition-colors"
          >
            <Icon name="x" size={18} color="var(--color-text-secondary)" />
          </button>
        </div>

        {/* O grupo em que você está — a barra horizontal marca o mesmo. */}
        {!col && (
          <div className="px-[10px] pb-[6px] shrink-0">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint truncate block">
              {grupo?.label}
            </span>
          </div>
        )}

        {/* Nav — os ITENS do grupo ativo, lista plana. O acordeão saiu junto
            com os grupos, que agora vivem na barra horizontal. */}
        <nav className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mr-1 pr-1 gap-[1px]">
          {itens.map((it, i) => (
            <SubItem key={it.href ?? it.label + i} item={it} pathname={pathname} collapsed={col} />
          ))}
        </nav>
      </aside>
    </>
  );
}

/**
 * A linha de uma tela. Deixou de ser "sub-item" na prática — com os grupos na
 * barra horizontal, ela é o item principal da lateral —, e por isso ganhou o
 * ÍCONE: recolhida a 68px o rótulo some, e sem ícone a barra vira uma coluna de
 * retângulos vazios.
 */
function SubItem({ item, pathname, collapsed }: { item: Item; pathname: string; collapsed?: boolean }) {
  const linha = collapsed ? "justify-center px-0" : "gap-[10px] px-[10px]";

  if (item.event && !item.href) {
    return (
      <button
        onClick={() => window.dispatchEvent(new Event(item.event!))}
        title={item.label}
        className={cn("flex items-center rounded-md py-[8px] text-left hover:bg-surface-2 transition-colors", linha)}
      >
        <Icon name={item.icon} size={17} color="var(--color-text-secondary)" className="shrink-0" />
        {!collapsed && <span className="text-[14px] text-muted truncate">{item.label}</span>}
      </button>
    );
  }
  if (item.soon || !item.href) {
    return (
      <span
        aria-disabled="true"
        title={item.label}
        className={cn("flex items-center rounded-md py-[8px] opacity-45 cursor-not-allowed select-none", linha)}
      >
        <Icon name={item.icon} size={17} color="var(--color-text-secondary)" className="shrink-0" />
        {!collapsed && (
          <>
            <span className="text-[14px] text-muted truncate flex-1">{item.label}</span>
            <span className="text-[11px] text-faint bg-surface-2 rounded-pill px-[6px] py-[1px] shrink-0">Em breve</span>
          </>
        )}
      </span>
    );
  }
  const on = leafAtivo(item.href, pathname);
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={on ? "page" : undefined}
      className={cn(
        "relative flex items-center rounded-md py-[8px] transition-colors",
        linha,
        on ? "bg-surface-1" : "hover:bg-surface-2/60",
      )}
    >
      <Icon
        name={item.icon}
        size={17}
        color={on ? "var(--color-ink)" : "var(--color-text-secondary)"}
        className="shrink-0"
      />
      {!collapsed && (
        <span className={cn("text-[14px] truncate", on ? "text-ink font-semibold" : "text-muted")}>{item.label}</span>
      )}
    </Link>
  );
}
