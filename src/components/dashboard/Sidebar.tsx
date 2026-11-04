"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui";
import { useModo } from "@/components/app/useModo";
import { SeletorOrganizacao } from "@/components/app/SeletorOrganizacao";
import { useUsuario, sairDaConta, SAIR_DISPONIVEL } from "@/components/app/useUsuario";
import { useTheme } from "@/components/app/ThemeToggle";
import { listarAnuncios } from "@/lib/ajuda-store";
import { ROTA_SEGURANCA_CONTA } from "@/core/segundo-fator";
import { abrirChat } from "@/components/ia/ChatGlobal";
import { grupoDaRota, indiceItemAtivo, useNavSections, type Item, type Section } from "@/components/dashboard/nav-data";
import { apagarConversa, inscreverConversas, listarConversas, type Conversa } from "@/lib/ia-conversas";
import { cn } from "@/lib/utils";
import { AvatarAgente } from "@/components/ia/AvatarAgente";
import { hrefDoHub, useAgentesDoHub, type SelecaoHub } from "@/components/ia/useAgentesDoHub";
import { descricaoDe } from "@/core/agentes";

/**
 * O MENU LATERAL ESCURO (03/11/2026, referência do dono).
 *
 * Fundo verde quase preto, nos dois temas. De cima para baixo: o logo e o
 * botão de recolher · "Criar" em relevo · os grupos em acordeão · um fio curto
 * · as CONVERSAS com a Quattro AI (nova, busca e as recentes) · Modo Pro,
 * empresa e o cartão "Sua conta", com "Sair da conta" embaixo. O elemento 3D
 * da referência ficou de fora, a pedido do dono.
 *
 * ⚠️ Isto INVERTE o "menu sempre recolhido" de 27/10/2026: a referência é o
 * menu ABERTO, com as conversas à vista. Recolher continua a um clique (o
 * botão ao lado do logo) e a escolha fica guardada neste navegador.
 *
 * ⚠️ UM grupo aberto por vez. Com todos abertos o menu volta a ser a lista
 * de sessenta itens que o agrupamento existe para evitar. O grupo da rota
 * atual abre sozinho — o menu tem de dizer onde você está.
 *
 * ⚠️ Recolhido, vira trilho de ícones; clicar num ícone EXPANDE e abre o
 * grupo — recolher não pode custar o acesso.
 */
const RECOLHIDO_KEY = "a4p_sidebar_recolhido";
const LARGURA_KEY = "a4p_sidebar_width";
const LARGURA_PADRAO = 272;
const LARGURA_MIN = 220;
const LARGURA_MAX = 420;
const LIMIAR_RECOLHER = 160;
const LIMIAR_EXPANDIR = 120;
const CONVERSAS_VISIVEIS = 6;

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
  const usuario = useUsuario();

  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(true);
  const [largura, setLargura] = React.useState(LARGURA_PADRAO);
  const [arrastando, setArrastando] = React.useState(false);
  const [revela, setRevela] = React.useState(false);

  const ativo = React.useMemo(() => grupoDaRota(sections, pathname), [sections, pathname]);
  const [aberto, setAberto] = React.useState<string | null>(ativo?.id ?? null);
  React.useEffect(() => { setAberto(ativo?.id ?? null); }, [ativo?.id]);

  React.useEffect(() => {
    try {
      const salva = Number(localStorage.getItem(LARGURA_KEY));
      if (Number.isFinite(salva) && salva >= LARGURA_MIN && salva <= LARGURA_MAX) setLargura(salva);
      setCollapsed(localStorage.getItem(RECOLHIDO_KEY) === "1");
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

  // A cortina da entrada encolheu até aqui: os itens surgem um a um.
  React.useEffect(() => {
    let t = 0;
    const fim = () => {
      setRevela(true);
      t = window.setTimeout(() => setRevela(false), 1600);
    };
    window.addEventListener("a4p:entrada-fim", fim);
    return () => { window.removeEventListener("a4p:entrada-fim", fim); window.clearTimeout(t); };
  }, []);

  React.useEffect(() => { setMobileOpen(false); }, [pathname]);

  const definirRecolhida = React.useCallback((v: boolean) => {
    setCollapsed(v);
    try { localStorage.setItem(RECOLHIDO_KEY, v ? "1" : "0"); } catch { /* ignore */ }
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

  // Ordem de entrada de cada bloco na animação.
  let ordem = 0;
  const entra = () => ({ "data-revela": "", style: { ["--a4p-i" as string]: ordem++ } as React.CSSProperties });

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}
      <aside
        style={isDesktop && !col ? { width: largura } : undefined}
        className={cn(
          "a4p-sidebar relative flex flex-col p-4 z-50 rounded-[28px]",
          "fixed inset-y-3 left-3 w-sidebar transition-transform duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-[110%]",
          "lg:static lg:translate-x-0 lg:shrink-0 lg:self-stretch",
          arrastando ? "" : "lg:transition-[width] lg:duration-300",
          col && "lg:w-[76px] lg:px-3",
          revela && "a4p-menu-revela",
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
            "hidden lg:block absolute inset-y-6 -right-[3px] w-[6px] z-10 cursor-col-resize",
            "after:absolute after:inset-y-0 after:left-[2px] after:w-[2px] after:rounded-pill after:transition-colors",
            arrastando ? "after:bg-lime" : "hover:after:bg-[var(--erp-menu-fio)]",
          )}
        />

        {/* Logo + recolher (na referência, o quadrado ao lado da marca). */}
        <div {...entra()} className={cn("flex items-center gap-2 mb-5 mt-1", col ? "flex-col" : "justify-between pl-2")}>
          {!col && (
            <Link href="/" aria-label="Início" data-topbar="marca" className="shrink-0">
              <span role="img" aria-label="Quattro" className="a4p-logo-mono a4p-logo-menu w-[125px] h-[24px]" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => (isDesktop ? definirRecolhida(!collapsed) : setMobileOpen(false))}
            aria-label={!isDesktop ? "Fechar menu" : col ? "Expandir menu" : "Recolher menu"}
            title={!isDesktop ? "Fechar menu" : col ? "Expandir menu" : "Recolher menu"}
            className="a4p-menu-quadrado w-10 h-10 shrink-0 rounded-[12px] inline-flex items-center justify-center transition-colors"
          >
            <Icon name={!isDesktop ? "x" : col ? "chevron-right" : "chevron-left"} size={18} color="currentColor" />
          </button>
        </div>

        {/* Adicionar (era "Criar", trocado pelo dono em 03/11/2026), em relevo — o mesmo painel do evento `a4p:criar`. */}
        <button
          {...entra()}
          type="button"
          onClick={() => window.dispatchEvent(new Event("a4p:criar"))}
          aria-label="Adicionar novo registro"
          title="Adicionar novo registro"
          className={cn(
            "a4p-menu-relevo h-[52px] rounded-[16px] text-[16px] font-semibold inline-flex items-center gap-[14px] mb-3 shrink-0",
            col ? "w-[52px] justify-center self-center" : "w-full px-4",
          )}
        >
          <Icon name="plus" size={19} color="currentColor" className="shrink-0" />
          {!col && <span className="flex-1 text-left">Adicionar</span>}
          {!col && <span aria-hidden className="a4p-menu-ponto w-[6px] h-[6px] rounded-pill shrink-0" />}
        </button>

        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mr-2 pr-2">
          <nav aria-label="Seções do sistema" className="flex flex-col gap-1">
            {sections.map((s) => {
              const marcado = ativo?.id === s.id;
              const abertoAqui = !col && aberto === s.id && s.items.length > 0;
              const href = destinoDoGrupo(s);
              const conteudo = (
                <>
                  <Icon name={s.icon ?? "layers"} size={19} color="currentColor" className="shrink-0" />
                  {!col && <span className="a4p-menu-grupo flex-1 min-w-0 text-left truncate">{s.label}</span>}
                  {!col && s.items.length > 0 && (
                    <Icon name="chevron-right" size={14} color="var(--erp-menu-texto-2)"
                      className={cn("shrink-0 transition-transform", abertoAqui && "rotate-90")} />
                  )}
                </>
              );
              const classe = cn(
                "flex items-center gap-[14px] min-h-[46px] rounded-[14px] text-[15px] font-semibold transition-colors",
                col ? "justify-center px-0" : "px-4",
                marcado ? "a4p-menu-relevo" : "a4p-menu-item",
              );
              return (
                <div key={s.id} {...entra()} className="flex flex-col">
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

          {!col && <ConversasDoMenu entra={entra} />}
        </div>

        <div {...entra()} className={cn("mt-3 pt-3 flex flex-col gap-1.5 shrink-0", col && "items-center")}>
          {!pessoal && (
            <button
              type="button"
              role="switch"
              aria-checked={pro}
              aria-label={`Modo Pro: ${pro ? "ativado" : "desativado"}${temDireito ? "" : " — não incluso no plano"}`}
              onClick={() => { if (!setPro(pro ? "simples" : "pro")) router.push("/planos?de=modo-pro"); }}
              title={!temDireito ? "Modo Pro — não incluso no plano desta empresa. Ver planos." : pro ? "Modo Pro ativo" : "Modo Pro"}
              className={cn("a4p-menu-item flex items-center gap-[12px] min-h-[40px] rounded-[12px] text-[14px] font-medium transition-colors", col ? "justify-center px-0 w-11" : "px-3")}
            >
              <Icon name="sparkles" size={17} color="currentColor" className="shrink-0" />
              {!col && (
                <>
                  <span className="flex-1 text-left">Modo Pro</span>
                  <span className="a4p-menu-meta text-[12px]">{!temDireito ? "plano" : pro ? "on" : "off"}</span>
                </>
              )}
            </button>
          )}
          <SeletorOrganizacao collapsed={col} variante="menu" />

          {/* Sua conta: o cartão em relevo da referência. Abre, para CIMA, o
              que morava na barra de cima (03/11/2026, dono: "tire os itens
              também, vamos ganhar esse espaço"): empresa, perfil, segurança,
              anúncios, ajuda, tema e sair. */}
          <MenuDaConta col={col} nome={usuario.nome} email={usuario.email} />
        </div>
      </aside>
    </>
  );
}

/**
 * As conversas com a Quattro AI, como os "Contextos" da referência: nova
 * conversa, busca e as recentes. Clicar abre o chat em tela cheia JÁ na
 * conversa; o "···" oferece abrir e apagar (com confirmação).
 */
function ConversasDoMenu({ entra }: { entra: () => { "data-revela": string; style: React.CSSProperties } }) {
  const [conversas, setConversas] = React.useState<Conversa[]>([]);
  const [termo, setTermo] = React.useState("");
  const [opcoes, setOpcoes] = React.useState<string | null>(null);
  const [confirmar, setConfirmar] = React.useState<string | null>(null);
  const caixa = React.useRef<HTMLDivElement>(null);

  const recarregar = React.useCallback(() => setConversas(listarConversas()), []);
  // Ouve o histórico: cada resposta do chat grava e avisa, e a hidratação do
  // servidor chega depois da montagem.
  React.useEffect(() => { recarregar(); return inscreverConversas(recarregar); }, [recarregar]);

  React.useEffect(() => {
    if (!opcoes) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) { setOpcoes(null); setConfirmar(null); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpcoes(null); setConfirmar(null); } };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [opcoes]);

  const q = termo.trim().toLowerCase();
  const visiveis = (q ? conversas.filter((c) => c.titulo.toLowerCase().includes(q)) : conversas).slice(0, CONVERSAS_VISIVEIS);

  return (
    <div ref={caixa} className="flex flex-col">
      <span {...entra()} aria-hidden className="a4p-menu-divisor" />
      {/* As conversas e os agentes num cartão BRANCO dentro do menu escuro
          (pedido do dono, 04/11/2026). */}
      <div className="mt-2 rounded-[20px] bg-white text-ink p-2 flex flex-col" data-menu-conversas>
      <div {...entra()} className="flex items-center justify-between pl-3 mt-1 mb-2">
        <span className="a4p-menu-grupo text-[15px]">Conversas</span>
        <button
          type="button"
          onClick={() => abrirChat()}
          aria-label="Nova conversa com a Quattro AI"
          title="Nova conversa"
          className="bg-surface-1 text-ink hover:bg-surface-2 w-10 h-10 rounded-[12px] inline-flex items-center justify-center transition-colors"
        >
          <Icon name="plus" size={18} color="currentColor" />
        </button>
      </div>
      <AgentesDoMenu entra={entra} />
      <label {...entra()} className="relative block mb-2">
        <span className="sr-only">Buscar conversa</span>
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
          <Icon name="search" size={16} color="currentColor" />
        </span>
        <input
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar conversa"
          className="bg-surface-1 text-ink placeholder:text-placeholder outline-none a4p-menu-narrow w-full h-11 rounded-[14px] pl-11 pr-3 text-[14px]"
        />
      </label>
      {visiveis.length === 0 ? (
        <p {...entra()} className="a4p-menu-narrow text-muted m-0 px-4 py-2 text-[13px]">
          {q ? "Nenhuma conversa com esse nome." : "Suas conversas com a Quattro AI aparecem aqui."}
        </p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-0.5">
          {visiveis.map((c) => {
            const marcada = opcoes === c.id;
            return (
              <li key={c.id} {...entra()} className="relative">
                <div className={cn("group flex items-center rounded-[14px] transition-colors", marcada ? "bg-surface-1 text-ink" : "text-ink hover:bg-surface-1")}>
                  <button
                    type="button"
                    onClick={() => abrirChat({ conversa: c.id })}
                    title={c.titulo}
                    className="a4p-menu-narrow flex-1 min-w-0 flex items-center gap-3 min-h-[44px] pl-4 text-left text-[14px]"
                  >
                    <Icon name="layers" size={16} color="var(--color-text-tertiary)" className="shrink-0" />
                    <span className="truncate">{c.titulo}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOpcoes(marcada ? null : c.id); setConfirmar(null); }}
                    aria-label={`Mais opções de ${c.titulo}`}
                    aria-expanded={marcada}
                    className="w-10 h-10 shrink-0 inline-flex items-center justify-center text-muted rounded-[10px]"
                  >
                    <Icon name="more-horizontal" size={16} color="currentColor" />
                  </button>
                </div>
                {marcada && (
                  <div role="menu" className="absolute right-0 top-full mt-1 z-[60] w-[200px] rounded-[14px] p-1 bg-white shadow-popover">
                    {confirmar === c.id ? (
                      <div className="p-2 flex flex-col gap-2">
                        <span className="text-[13px] text-ink">Apagar esta conversa?</span>
                        <div className="flex gap-2">
                          <button type="button" autoFocus onClick={() => { setConfirmar(null); setOpcoes(null); }}
                            className="flex-1 h-8 rounded-pill bg-surface-2 text-[13px] text-ink">Cancelar</button>
                          <button type="button" onClick={() => { apagarConversa(c.id); setOpcoes(null); setConfirmar(null); recarregar(); }}
                            className="flex-1 h-8 rounded-pill text-[13px] text-white" style={{ background: "var(--color-negative)" }}>Apagar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button type="button" role="menuitem" onClick={() => { setOpcoes(null); abrirChat({ conversa: c.id }); }}
                          className="w-full flex items-center gap-2 px-3 h-9 rounded-[10px] text-[14px] text-ink hover:bg-surface-1 text-left">
                          <Icon name="arrow-up-right" size={15} color="currentColor" /> Abrir conversa
                        </button>
                        <button type="button" role="menuitem" onClick={() => setConfirmar(c.id)}
                          className="w-full flex items-center gap-2 px-3 h-9 rounded-[10px] text-[14px] hover:bg-surface-1 text-left" style={{ color: "var(--color-negative)" }}>
                          <Icon name="trash-2" size={15} color="currentColor" /> Apagar
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </div>
  );
}

/**
 * A Quattro AI e os agentes, cada um com o próprio chat (pedido do dono,
 * 04/11/2026: "no local do menu onde estão as conversas"). Cada item abre o
 * chat dele em /quattro-ai; os números vêm de `useAgentesDoHub`, os mesmos
 * da tela.
 */
function AgentesDoMenu({ entra }: { entra: () => { "data-revela": string; style: React.CSSProperties } }) {
  const pathname = usePathname();
  const pedida = useSearchParams().get("agente");
  const { ids, porAgente, estadoDe, resumoIA, pendentes } = useAgentesDoHub();
  const naTela = pathname === "/quattro-ai";
  const ativa: SelecaoHub | null = naTela ? ((pedida as SelecaoHub | null) ?? "quattro-ai") : null;
  const itens: { id: SelecaoHub; nome: string; sub: string; n: number }[] = [
    { id: "quattro-ai", nome: "Quattro AI", sub: resumoIA, n: pendentes.length },
    ...ids.map((id) => ({ id, nome: descricaoDe(id).nome, sub: estadoDe(id), n: porAgente(id) })),
  ];
  return (
    <ul className="m-0 mb-3 p-0 list-none flex flex-col gap-0.5" aria-label="Quattro AI e agentes" data-menu-agentes>
      {itens.map((it) => {
        const on = ativa === it.id;
        return (
          <li key={it.id} {...entra()}>
            <Link href={hrefDoHub(it.id)} aria-current={on ? "page" : undefined} title={it.nome} data-item={it.id}
              className={cn("flex items-center gap-3 min-h-[48px] rounded-[14px] px-3 transition-colors", on ? "bg-surface-1 text-ink" : "text-ink hover:bg-surface-1")}>
              <AvatarAgente agente={it.id} tamanho={30} />
              <span className="flex-1 min-w-0">
                <span className="a4p-menu-grupo block truncate text-[14px]">{it.nome}</span>
                <span className="a4p-menu-narrow block truncate text-[12px] text-muted">{it.sub}</span>
              </span>
              {it.n > 0 && (
                <span className="shrink-0 min-w-[20px] h-[20px] px-[6px] rounded-pill bg-ink text-white text-[12px] flex items-center justify-center tabular-nums"
                  aria-label={`${it.n} para aprovar`}>{it.n}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ItensDoGrupo({ itens, pathname, busca }: { itens: Item[]; pathname: string; busca: string }) {
  const iAtivo = indiceItemAtivo(itens, pathname, busca);
  return (
    <div className="a4p-menu-fio-vertical flex flex-col ml-[26px] pl-3 border-l my-1.5 gap-0.5">
      {itens.map((it, i) => {
        const on = i === iAtivo;
        const classe = cn(
          "a4p-menu-sub flex items-center gap-2 min-h-[36px] px-3 rounded-[10px] text-[14px] transition-colors",
          on && "a4p-menu-afundado",
        );
        const rotulo = (
          <>
            <span className="flex-1 min-w-0 truncate">{it.label}</span>
            {on && <span aria-hidden className="a4p-menu-ponto w-[6px] h-[6px] rounded-pill shrink-0" />}
          </>
        );
        if (it.event && !it.href) {
          return <button key={it.label} type="button" title={it.desc ?? it.label} onClick={() => window.dispatchEvent(new Event(it.event!))} className={cn(classe, "text-left")}>{rotulo}</button>;
        }
        if (it.soon || !it.href) {
          return <span key={it.label} aria-disabled="true" className={cn(classe, "opacity-45 cursor-not-allowed")}>{rotulo}</span>;
        }
        // Com evento E endereço (a Quattro AI): o clique simples abre por cima da
        // tela atual; Ctrl/⌘/Shift/meio seguem o endereço numa aba nova.
        const porEvento = it.event
          ? (e: React.MouseEvent) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              window.dispatchEvent(new Event(it.event!));
            }
          : undefined;
        return <Link key={it.href} href={it.href} onClick={porEvento} title={it.desc ?? it.label} aria-current={on ? "page" : undefined} className={classe}>{rotulo}</Link>;
      })}
    </div>
  );
}

/**
 * O cartão "Sua conta" e o menu dele. ⚠️ Mesmo material do popover das
 * conversas (branco sólido, sombra de popover) e abre para CIMA, porque o
 * cartão mora no pé do menu. Fecha por Esc e por clique fora.
 */
function MenuDaConta({ col, nome, email }: { col: boolean; nome: string; email: string }) {
  const router = useRouter();
  const { dark, toggle } = useTheme();
  const [aberto, setAberto] = React.useState(false);
  const [naoLidos, setNaoLidos] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // localStorage só depois de montar (hidratação).
    try { setNaoLidos(listarAnuncios().filter((a) => !a.lido).length); } catch { /* sem anúncios */ }
  }, []);

  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); window.removeEventListener("keydown", esc); };
  }, [aberto]);

  const ir = (href: string) => { setAberto(false); router.push(href); };
  const itens: { icone: string; rotulo: string; acao: () => void; ponto?: boolean; perigo?: boolean }[] = [
    { icone: "building", rotulo: "Configurações da empresa", acao: () => ir("/dashboard/administration/company-data") },
    { icone: "user", rotulo: "Meu perfil", acao: () => ir("/configuracoes") },
    { icone: "shield-check", rotulo: "Segurança da conta", acao: () => ir(ROTA_SEGURANCA_CONTA) },
    { icone: "bell", rotulo: naoLidos > 0 ? `Anúncios (${naoLidos} não lidos)` : "Anúncios", acao: () => ir("/dashboard/help?aba=anuncios"), ponto: naoLidos > 0 },
    { icone: "help-circle", rotulo: "Central de ajuda", acao: () => ir("/dashboard/help") },
    { icone: dark ? "sun" : "moon", rotulo: dark ? "Tema claro" : "Tema escuro", acao: () => { setAberto(false); toggle(); } },
  ];
  if (SAIR_DISPONIVEL) itens.push({ icone: "log-out", rotulo: "Sair da conta", acao: () => { setAberto(false); void sairDaConta(router); }, perigo: true });

  return (
    <div ref={ref} className="relative mt-1.5">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        title="Sua conta"
        aria-label={naoLidos > 0 ? "Sua conta (há anúncios não lidos)" : "Sua conta"}
        aria-expanded={aberto}
        data-menu="conta"
        className={cn(
          "a4p-menu-relevo flex items-center gap-3 rounded-[18px] w-full text-left",
          col ? "w-[52px] h-[52px] justify-center" : "px-3 py-3",
        )}
      >
        <span className="relative a4p-menu-quadrado w-10 h-10 rounded-[12px] inline-flex items-center justify-center shrink-0">
          <Icon name="user" size={18} color="currentColor" />
          {naoLidos > 0 && <span aria-hidden className="a4p-menu-ponto absolute top-1.5 right-1.5 w-2 h-2 rounded-full" />}
        </span>
        {!col && (
          <>
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-[15px] font-semibold leading-tight truncate">Sua conta</span>
              <span className="a4p-menu-meta text-[13px] leading-tight truncate">{nome}</span>
            </span>
            <Icon name={aberto ? "chevron-down" : "chevron-up"} size={16} color="currentColor" className="shrink-0" />
          </>
        )}
      </button>

      {aberto && (
        <div
          role="menu"
          className={cn(
            "absolute bottom-full mb-2 z-[70] w-[248px] rounded-card bg-white shadow-popover overflow-hidden text-ink",
            col ? "left-0" : "left-0 right-0 w-auto",
          )}
        >
          <div className="px-4 py-3 border-b border-border-soft min-w-0">
            <div className="text-label font-medium truncate">{nome}</div>
            {email && <div className="text-caption text-faint truncate">{email}</div>}
          </div>
          {itens.map((it) => (
            <button
              key={it.rotulo}
              role="menuitem"
              type="button"
              onClick={it.acao}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-left hover:bg-surface-2 transition-colors"
              style={it.perigo ? { color: "var(--color-negative)" } : undefined}
            >
              <span className="relative inline-flex shrink-0">
                <Icon name={it.icone} size={16} color="currentColor" />
                {it.ponto && <span aria-hidden className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-warning)" }} />}
              </span>
              <span className="truncate">{it.rotulo}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
