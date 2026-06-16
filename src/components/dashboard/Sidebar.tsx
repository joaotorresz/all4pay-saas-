"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, Icon } from "@/components/ui";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { useModo } from "@/components/app/useModo";
import { isDemo } from "@/lib/demo";
import { cn } from "@/lib/utils";

const SUPA_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const STORAGE_KEY = "a4p_sidebar_collapsed";

/**
 * all4pay app sidebar — navegação AGRUPADA (acordeão), route-aware.
 * Reforma só de agrupamento visual: nenhum href de rota mudou. Os 21 itens
 * flat viraram 7 grupos de corpo + Configurações. Itens de roadmap entram como
 * "Em breve" (desabilitados, sem href — nunca <a> morto).
 *
 * Mantém: marca, busca ⌘K, toggle de tema, bloco do usuário, recolher (ícones).
 */
type Leaf = { label: string; href?: string; soon?: boolean };
type Group = { id: string; label: string; icon: string; children: Node[] };
type Node = Leaf | Group;
const isGroup = (n: Node): n is Group => "children" in n;

// Link de topo, fora de grupo.
const INICIO = { label: "Início", icon: "house", href: "/" };

// 7 grupos de corpo (INÍCIO é link solto acima).
const GROUPS: Group[] = [
  {
    id: "pagar", label: "Pagar", icon: "arrow-up-right", children: [
      { label: "Central de pagamentos", href: "/pagamentos" }, // execução em lote (primeiro)
      { label: "A pagar", href: "/pagaveis" },
      { label: "Solicitações & aprovações", href: "/aprovacoes" }, // gate de alçada
      { label: "Reembolsos", href: "/reembolsos" }, // caso especializado
      { label: "Lixeira", href: "/lixeira" }, // cancelados recuperáveis
    ],
  },
  {
    id: "receber", label: "Receber", icon: "arrow-left-right", children: [
      { label: "Central de recebimentos", href: "/recebimentos" }, // execução em lote (primeiro)
      { label: "A receber", href: "/recebiveis" },
      { label: "Inadimplência", href: "/inadimplencia" },
      { label: "Recorrências / Contratos", href: "/recorrencias" },
      { label: "Boleto", href: "/boletos" },
      { label: "Notas fiscais (NFS-e)", href: "/notas-fiscais" },
      { label: "Lixeira", href: "/lixeira" }, // cancelados recuperáveis
    ],
  },
  {
    id: "contas", label: "Upload de dados", icon: "upload", children: [
      { label: "Open finance", href: "/contas" },
      { label: "Importar dados", href: "/upload" },
      { label: "Conciliação", href: "/conciliacao" },
    ],
  },
  {
    id: "cartoes", label: "Cartões", icon: "credit-card", children: [
      { label: "Cartões all4pay", soon: true },
      { label: "Outros cartões", soon: true },
      { label: "Conciliação por IA", soon: true },
    ],
  },
  {
    id: "pos", label: "Central POS", icon: "credit-card", children: [
      { label: "Configuração de taxas all4pay", href: "/pos/taxas" },
    ],
  },
  {
    id: "relatorios", label: "Relatórios", icon: "receipt", children: [
      { label: "DRE", href: "/dre" },
      { label: "Fluxo de Caixa", href: "/fluxo-caixa" },
    ],
  },
  {
    id: "cadastros", label: "Cadastros", icon: "users", children: [
      { label: "Contatos", href: "/contatos" },
      { label: "Produtos", href: "/produtos" },
      { label: "Serviços", href: "/servicos" },
      { label: "Vendas", href: "/vendas" },
    ],
  },
  {
    id: "inteligencia", label: "Inteligência", icon: "sparkles", children: [
      // 3.2: um cérebro, não cinco — Quant/Decisão/Risco/Autônomo/Dados viram
      // abas dentro do Copiloto (deep-link ?aba=). Rotas standalone seguem vivas.
      { label: "Copiloto", href: "/copiloto" },
    ],
  },
];

// Configurações (rodapé navegável) — inclui Cadastros e Plataforma aninhados.
const CONFIG: Group = {
  id: "config", label: "Configurações", icon: "settings", children: [
    { label: "Empresa", href: "/configuracoes" },
    { label: "Governança & Auditoria", href: "/governanca" },
    {
      id: "plataforma", label: "Plataforma (avançado)", icon: "cpu", children: [
        { label: "Orquestração", href: "/orquestracao" },
        { label: "Infraestrutura", href: "/infraestrutura" },
        { label: "Arquitetura", href: "/arquitetura" },
        { label: "Automações", href: "/automacoes" }, // não estava na árvore-alvo; encaixado aqui
      ],
    },
    { label: "Adicionar Empresa", href: "/comecar" },
    { label: "Central de Ajuda", soon: true }, // órfã corrigida: sem rota → "Em breve", não <a> morto
  ],
};

const TOPO: Group[] = [...GROUPS, CONFIG];

function leafAtivo(href: string | undefined, pathname: string): boolean {
  // "/" não marca (Início cuida disso; "Contas financeiras → /" é só atalho).
  if (!href || href === "/") return false;
  return pathname === href || pathname.startsWith(href + "/") || pathname.startsWith(href);
}
function contemAtivo(n: Node, pathname: string): boolean {
  return isGroup(n) ? n.children.some((c) => contemAtivo(c, pathname)) : leafAtivo(n.href, pathname);
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  // Identidade REAL do usuário logado (sem fallback fake). Demo mostra rótulo de demo.
  const [usuario, setUsuario] = React.useState<{ nome: string; email: string } | null>(null);

  React.useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

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
  // Grupo aberto = preferência explícita do usuário, senão "contém a rota ativa".
  const aberto = (g: Group) => open[g.id] ?? contemAtivo(g, pathname);
  const toggleGrupo = (id: string) => setOpen((o) => ({ ...o, [id]: !(o[id] ?? false) }));
  // Ao recolher um grupo no modo ícones, expande o rail e abre aquele grupo.
  const abrirDoIcone = (id: string) => { setCollapsed(false); setOpen((o) => ({ ...o, [id]: true })); };

  const inicioOn = pathname === "/";

  // Modo Simples (padrão) esconde Inteligência (grupo) e Plataforma (subgrupo).
  const { pro, set: setPro } = useModo();
  const gruposVis = pro ? GROUPS : GROUPS.filter((g) => g.id !== "inteligencia");
  const configVis: Group = pro ? CONFIG : { ...CONFIG, children: CONFIG.children.filter((c) => !(isGroup(c) && c.id === "plataforma")) };
  const topoVis: Group[] = [...gruposVis, configVis];

  return (
    <aside
      className={cn(
        "shrink-0 h-full bg-white border-r border-border flex flex-col py-4 transition-[width] duration-200 ease-out",
        collapsed ? "w-[68px] px-2" : "w-sidebar px-3",
      )}
    >
      {/* Brand + toggle */}
      <div className={cn("flex items-center pb-[14px] pt-1", collapsed ? "justify-center" : "gap-[9px] px-2")}>
        {!collapsed && (
          <>
            <Image src="/all4pay-dark.png" alt="all4pay" width={110} height={22} className="h-[22px] w-auto dark:hidden" priority />
            <Image src="/all4pay-lime.png" alt="all4pay" width={110} height={22} className="h-[22px] w-auto hidden dark:block" priority />
          </>
        )}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className={cn("inline-flex items-center justify-center rounded-md hover:bg-surface-2 p-[6px]", collapsed ? "" : "ml-auto")}
        >
          <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={17} color="var(--color-text-secondary)" />
        </button>
      </div>

      {/* Command bar (⌘K) */}
      <button
        onClick={() => window.dispatchEvent(new Event("a4p:open-search"))}
        className={cn(
          "flex items-center bg-lime-tint border border-[#ECF6B8] rounded-md mb-[14px] cursor-pointer",
          collapsed ? "justify-center py-[9px]" : "gap-2 px-[11px] py-[9px]",
        )}
        title="Buscar (⌘K)"
      >
        <Icon name="search" size={15} color="var(--color-text-secondary)" />
        {!collapsed && (
          <>
            <span className="text-label text-muted font-regular">Buscar</span>
            <span className="ml-auto text-[13px] font-medium text-faint bg-black/5 rounded-[5px] px-[5px] py-[2px]">⌘K</span>
          </>
        )}
      </button>

      {/* Nav — rola sozinha quando transborda */}
      <nav className="flex flex-col gap-[2px] flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mr-1 pr-1">
        {collapsed ? (
          <>
            {/* Modo ícones: Início + ícone de cada grupo (abre o rail e o grupo) */}
            <Link href="/" title="Início" aria-current={inicioOn ? "page" : undefined}
              className={cn("relative flex items-center justify-center rounded-md py-2", inicioOn ? "bg-surface-2" : "hover:bg-surface-1")}>
              {inicioOn && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-pill bg-ink" />}
              <Icon name="house" size={17} color={inicioOn ? "var(--color-ink)" : "var(--color-text-secondary)"} />
            </Link>
            {topoVis.map((g) => {
              const on = contemAtivo(g, pathname);
              return (
                <button key={g.id} onClick={() => abrirDoIcone(g.id)} title={g.label}
                  className={cn("relative flex items-center justify-center rounded-md py-2", on ? "bg-surface-2" : "hover:bg-surface-1")}>
                  {on && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-pill bg-ink" />}
                  <Icon name={g.icon} size={17} color={on ? "var(--color-ink)" : "var(--color-text-secondary)"} />
                </button>
              );
            })}
          </>
        ) : (
          <>
            {/* Início (link de topo) */}
            <Link href="/" aria-current={inicioOn ? "page" : undefined}
              className={cn("relative flex items-center gap-[10px] px-[10px] rounded-md py-2", inicioOn ? "bg-surface-2" : "hover:bg-surface-1")}>
              {inicioOn && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-pill bg-ink" />}
              <Icon name="house" size={17} color={inicioOn ? "var(--color-ink)" : "var(--color-text-secondary)"} />
              <span className={cn("text-[17px] font-medium truncate", inicioOn ? "text-ink" : "text-muted")}>{INICIO.label}</span>
            </Link>

            {gruposVis.map((g) => (
              <GrupoNode key={g.id} grupo={g} depth={0} pathname={pathname} aberto={aberto} toggle={toggleGrupo} />
            ))}

            {/* Configurações (rodapé navegável, ainda na área de rolagem) */}
            <div className="mt-2 pt-2 border-t border-border-soft">
              <GrupoNode grupo={configVis} depth={0} pathname={pathname} aberto={aberto} toggle={toggleGrupo} />
            </div>
          </>
        )}
      </nav>

      {/* Rodapé fixo: tema + usuário */}
      <div className="shrink-0 flex flex-col gap-[2px] pt-[10px] mt-[10px] border-t border-border-soft">
        {/* Modo Simples × Pro */}
        <button
          onClick={() => setPro(pro ? "simples" : "pro")}
          title={pro ? "Modo Pro (motores e Plataforma visíveis)" : "Modo Simples (essencial)"}
          className={cn("relative flex items-center rounded-md py-2 hover:bg-surface-1", collapsed ? "justify-center px-0" : "gap-[10px] px-[10px]")}
        >
          <Icon name="sparkles" size={17} color={pro ? "var(--color-ink)" : "var(--color-text-secondary)"} />
          {!collapsed && (
            <>
              <span className={cn("text-[17px] font-medium", pro ? "text-ink" : "text-muted")}>Modo Pro</span>
              <span className={cn("ml-auto w-[34px] h-[20px] rounded-pill p-[2px] transition-colors", pro ? "bg-lime" : "bg-surface-3")}>
                <span className={cn("block w-[16px] h-[16px] rounded-pill bg-white transition-transform", pro && "translate-x-[14px]")} />
              </span>
            </>
          )}
        </button>
        <ThemeToggle collapsed={collapsed} />
        <div className={cn("flex items-center pt-2 pb-1 mt-1", collapsed ? "justify-center" : "gap-[9px] px-2")}>
          <Avatar name={isDemo ? "Demonstração" : (usuario?.nome ?? "all4pay")} size={30} />
          {!collapsed && (
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
  );
}

/** Cabeçalho de grupo (acordeão) + filhos recursivos (expandido). */
function GrupoNode({
  grupo, depth, pathname, aberto, toggle,
}: {
  grupo: Group; depth: number; pathname: string;
  aberto: (g: Group) => boolean; toggle: (id: string) => void;
}) {
  const on = aberto(grupo);
  const temAtivo = contemAtivo(grupo, pathname);
  const padHeader = 10 + depth * 14;
  return (
    <div className="flex flex-col">
      <button
        onClick={() => toggle(grupo.id)}
        aria-expanded={on}
        className={cn("relative flex items-center gap-[10px] rounded-md py-2 text-left hover:bg-surface-1", on && "bg-transparent")}
        style={{ paddingLeft: padHeader, paddingRight: 8 }}
      >
        <Icon name={grupo.icon} size={17} color={temAtivo ? "var(--color-ink)" : "var(--color-text-secondary)"} />
        <span className={cn("text-[17px] font-medium truncate flex-1", temAtivo ? "text-ink" : "text-muted")}>{grupo.label}</span>
        <Icon name={on ? "chevron-down" : "chevron-right"} size={15} color="var(--color-text-tertiary)" />
      </button>
      {on && grupo.children.map((c, i) =>
        isGroup(c)
          ? <GrupoNode key={c.id} grupo={c} depth={depth + 1} pathname={pathname} aberto={aberto} toggle={toggle} />
          : <FolhaNode key={i} folha={c} depth={depth + 1} pathname={pathname} />,
      )}
    </div>
  );
}

/** Item-folha: link real, ou "Em breve" desabilitado (nunca <a> morto). */
function FolhaNode({ folha, depth, pathname }: { folha: Leaf; depth: number; pathname: string }) {
  const pad = 10 + depth * 14;
  if (folha.soon || !folha.href) {
    return (
      <span
        aria-disabled="true"
        className="relative flex items-center gap-[10px] rounded-md py-[7px] text-left opacity-45 cursor-not-allowed select-none"
        style={{ paddingLeft: pad, paddingRight: 8 }}
      >
        <span className="text-[15px] text-muted truncate flex-1">{folha.label}</span>
        <span className="text-[11px] text-faint bg-surface-2 rounded-pill px-[6px] py-[1px] shrink-0">Em breve</span>
      </span>
    );
  }
  const on = leafAtivo(folha.href, pathname);
  return (
    <Link
      href={folha.href}
      aria-current={on ? "page" : undefined}
      className={cn("relative flex items-center rounded-md py-[7px] text-left", on ? "bg-surface-2" : "hover:bg-surface-1")}
      style={{ paddingLeft: pad, paddingRight: 8 }}
    >
      {on && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-pill bg-ink" />}
      <span className={cn("text-[15px] truncate", on ? "text-ink font-medium" : "text-muted")}>{folha.label}</span>
    </Link>
  );
}
