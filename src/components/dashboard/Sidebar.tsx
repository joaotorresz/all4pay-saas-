"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, Icon } from "@/components/ui";
import { useModo } from "@/components/app/useModo";
import { leafAtivo, useNavSections, type Item, type Section } from "@/components/dashboard/nav-data";
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

  const { pro, set: setPro } = useModo();
  const { sections: allSections, pessoal } = useNavSections();

  // Configurações fica no rodapé, separada — é o último grupo da lista.
  const config = allSections[allSections.length - 1];
  const principais = allSections.slice(0, -1);

  /** O grupo que contém a rota atual — abre sozinho e não fecha. */
  const grupoDaRota = React.useMemo(
    () => [...principais, config].find(
      (s) => (s.href && leafAtivo(s.href, pathname)) || s.items.some((i) => leafAtivo(i.href, pathname)),
    )?.id ?? null,
    [principais, config, pathname],
  );

  const [aberto, setAberto] = React.useState<string | null>(null);
  React.useEffect(() => { setAberto(grupoDaRota); }, [grupoDaRota]);

  function alternar(id: string) {
    if (col) {
      // Recolhida: clicar num grupo expande a barra e já abre o grupo.
      setCollapsed(false);
      try { localStorage.setItem(STORAGE_KEY, "0"); } catch { /* ignore */ }
      setAberto(id);
      return;
    }
    setAberto((a) => (a === id ? null : id));
  }

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
          "lg:static lg:translate-x-0 lg:shrink-0 lg:my-0 lg:ml-3 lg:mb-3 lg:h-[calc(100%-12px)]",
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

        {/* Nav — acordeão */}
        <nav className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mr-1 pr-1 gap-[2px]">
          {principais.map((s) => (
            <Grupo
              key={s.id} secao={s} pathname={pathname} collapsed={col}
              aberto={aberto === s.id} onAlternar={() => alternar(s.id)}
            />
          ))}
        </nav>

        {/* Rodapé do cartão: Configurações · Modo Pro · conta (a referência
            mantém o usuário DENTRO do menu; busca, tema e sair subiram). */}
        <div className="shrink-0 flex flex-col gap-[2px] pt-[10px] mt-[10px] border-t border-border-soft">
          <Grupo
            secao={config} pathname={pathname} collapsed={col}
            aberto={aberto === config.id} onAlternar={() => alternar(config.id)}
          />
          {!pessoal && (
            /*
             * ⚠️ É um SWITCH, não um botão. Antes vinha sem `role`, sem
             * `aria-checked` e sem `type`: um leitor de tela anunciava
             * "Modo Pro, botão" e NENHUM estado. Quem depende dele apertava,
             * nada era anunciado, e a conclusão correta a tirar era que o
             * controle não funcionava — foi o que aconteceu na auditoria.
             *
             * `role="switch"` + `aria-checked` fazem o estado ser anunciado a
             * cada mudança; o texto "Ativado/Desativado" dá o mesmo retorno a
             * quem enxerga. `type="button"` evita submit acidental.
             */
            <button
              type="button"
              role="switch"
              aria-checked={pro}
              aria-label={`Modo Pro: ${pro ? "ativado" : "desativado"}`}
              onClick={() => setPro(pro ? "simples" : "pro")}
              title={pro ? "Modo Pro ativo — some para o essencial (Simples)" : "Modo Pro — desbloqueia Inteligência e Governança"}
              className={cn(
                "relative flex items-center rounded-md py-2 w-full text-left transition-colors hover:bg-surface-1",
                col ? "justify-center px-0" : "gap-[10px] px-[10px]",
              )}
            >
              <Icon name="sparkles" size={18} color={pro ? "var(--color-ink)" : "var(--color-text-secondary)"} />
              {!col && (
                <>
                  <span className={cn("text-[15px] font-medium", pro ? "text-ink" : "text-muted")}>Modo Pro</span>
                  {/* Retorno visível do estado, ao lado do interruptor: a
                      pastilha sozinha é sutil demais para responder "mudou?". */}
                  <span className="ml-auto text-[11px] uppercase tracking-[0.06em] text-faint">
                    {pro ? "on" : "off"}
                  </span>
                  <span className={cn("w-[34px] h-[20px] rounded-pill p-[2px] shrink-0 transition-colors", pro ? "bg-lime" : "bg-surface-3")} aria-hidden>
                    <span className={cn("block w-[16px] h-[16px] rounded-pill bg-white transition-transform", pro && "translate-x-[14px]")} />
                  </span>
                </>
              )}
            </button>
          )}
          <div className={cn("flex items-center pt-2 pb-1 mt-1", col ? "justify-center" : "gap-[9px] px-2")}>
            <Avatar name={isDemo ? "Demonstração" : (usuario?.nome ?? "all4pay")} size={30} />
            {!col && (
              <>
                <div className="min-w-0">
                  <div className="text-label font-medium text-ink truncate">{isDemo ? "Demonstração" : (usuario?.nome ?? "Conta")}</div>
                  <div className="text-[13px] text-faint truncate">{isDemo ? "modo demonstração" : (usuario?.email ?? "")}</div>
                </div>
                {SUPA_CONFIGURED ? (
                  <button
                    onClick={async () => {
                      const { createClient } = await import("@/lib/supabase/client");
                      await createClient().auth.signOut();
                      router.push("/login");
                      router.refresh();
                    }}
                    aria-label="Sair"
                    className="ml-auto inline-flex p-1 rounded-md hover:bg-surface-2"
                    title="Sair"
                  >
                    <Icon name="arrow-up-right" size={15} color="var(--color-text-tertiary)" />
                  </button>
                ) : (
                  <Icon name="chevrons-up-down" size={15} color="var(--color-text-tertiary)" className="ml-auto" />
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

/* --------------------------------- grupo --------------------------------- */

function Grupo({
  secao, pathname, collapsed, aberto, onAlternar,
}: {
  secao: Section; pathname: string; collapsed: boolean;
  aberto: boolean; onAlternar: () => void;
}) {
  const folha = !!secao.href;
  const ativoFolha = folha && leafAtivo(secao.href, pathname);
  const temFilhoAtivo = secao.items.some((i) => leafAtivo(i.href, pathname));
  const destacado = ativoFolha || temFilhoAtivo;

  const chrome = cn(
    "relative flex items-center rounded-[12px] py-[9px] w-full transition-colors",
    collapsed ? "justify-center px-0" : "gap-[10px] px-[10px]",
    // Selecionado = a cor do FUNDO DA PÁGINA (surface-1). O item ativo vira um
    // recorte do canvas dentro do cartão branco do menu — a mesma relação que o
    // conteúdo tem com os boxes da Home.
    destacado ? "bg-surface-1" : "hover:bg-surface-2/60",
  );

  const conteudo = (
    <>
      {/* O marcador lima fica à DIREITA: à esquerda ele competiria com o fio
          vertical dos filhos, e os dois juntos viram ruído. */}
      {destacado && (
        <span className="absolute right-0 top-1/2 -translate-y-1/2 h-[18px] w-[3px] rounded-pill bg-lime" aria-hidden />
      )}
      <Icon name={secao.icon ?? "layers"} size={18} color={destacado ? "var(--color-ink)" : "var(--color-text-secondary)"} />
      {!collapsed && (
        <>
          <span className={cn("text-[15px] truncate flex-1 text-left", destacado ? "text-ink font-semibold" : "text-muted font-medium")}>
            {secao.label}
          </span>
          {!folha && (
            <Icon
              name={aberto ? "chevron-down" : "chevron-right"}
              size={14}
              color="var(--color-text-tertiary)"
              className="shrink-0"
            />
          )}
        </>
      )}
    </>
  );

  return (
    <div className="flex flex-col">
      {folha ? (
        <Link href={secao.href!} title={secao.label} aria-current={ativoFolha ? "page" : undefined} className={chrome}>
          {conteudo}
        </Link>
      ) : (
        <button
          onClick={onAlternar}
          title={secao.label}
          aria-expanded={aberto}
          className={chrome}
        >
          {conteudo}
        </button>
      )}

      {!folha && aberto && !collapsed && (
        // O fio vertical amarra os filhos ao pai — sem ele a indentação sozinha
        // não diz de quem eles são quando a lista rola.
        <div className="ml-[19px] pl-[13px] border-l border-border-soft flex flex-col gap-[1px] py-1">
          {secao.items.map((it, i) => (
            <SubItem key={it.href ?? it.label + i} item={it} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubItem({ item, pathname }: { item: Item; pathname: string }) {
  if (item.event && !item.href) {
    return (
      <button
        onClick={() => window.dispatchEvent(new Event(item.event!))}
        title={item.label}
        className="flex items-center rounded-md py-[7px] px-[10px] text-left hover:bg-surface-2 transition-colors"
      >
        <span className="text-[14px] text-muted truncate">{item.label}</span>
      </button>
    );
  }
  if (item.soon || !item.href) {
    return (
      <span aria-disabled="true" className="flex items-center gap-2 rounded-md py-[7px] px-[10px] opacity-45 cursor-not-allowed select-none">
        <span className="text-[14px] text-muted truncate flex-1">{item.label}</span>
        <span className="text-[11px] text-faint bg-surface-2 rounded-pill px-[6px] py-[1px] shrink-0">Em breve</span>
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
        "relative flex items-center rounded-md py-[7px] px-[10px] transition-colors",
        on ? "bg-surface-1" : "hover:bg-surface-2/60",
      )}
    >
      <span className={cn("text-[14px] truncate", on ? "text-ink font-semibold" : "text-muted")}>{item.label}</span>
    </Link>
  );
}
