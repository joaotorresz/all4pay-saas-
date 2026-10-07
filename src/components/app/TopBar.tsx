"use client";

/**
 * Barra superior do app — a MOLDURA ESCURA (referência Sphere UI).
 *
 * Marca à esquerda · busca ao centro · ações e conta à direita, tudo sobre o
 * fundo near-black do `.a4p-canvas`. O app fica num cartão claro arredondado
 * por baixo desta barra.
 *
 * ⚠️ As cores NÃO saem dos tokens de tema (`ink`/`muted`): elas vêm de
 * `--a4p-chrome-*`, que valem igual no claro e no escuro. A barra é escura nos
 * dois temas, então `text-ink` aqui daria texto quase preto sobre fundo quase
 * preto no tema claro.
 *
 * ⚠️ A busca voltou para a barra, revertendo a decisão anterior de deixar só o
 * ⌘K. Ela é o elemento que mais define a referência — mas continua sendo UMA
 * busca só: o campo aqui é um BOTÃO que abre a mesma command palette. Um
 * segundo campo de busca de verdade divergiria do primeiro no dia em que
 * alguém mexesse num dos dois.
 *
 * O resto das ações globais (tema, perfil, sair) segue dentro do ⋮.
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
  // Mesma função que a barra horizontal e a lateral usam — as três não podem
  // discordar sobre em que grupo você está.
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
    <header className="shrink-0 flex items-center gap-3 h-[60px] px-5 mx-3 mt-3 a4p-topbar bg-white border border-border rounded-[20px]">
      {/* ⚠️ Só existe quando HÁ gaveta. O grupo ativo pode não ter itens (o
          Início é folha) e aí a lateral não é renderizada — um hambúrguer ali
          seria um botão que abre o nada, que é pior que botão nenhum. */}
      {(
        <button
          onClick={() => window.dispatchEvent(new Event("a4p:toggle-nav"))}
          aria-label="Abrir menu"
          data-topbar="hamburguer"
          className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-md shrink-0"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <Icon name="menu" size={19} color="currentColor" />
        </button>
      )}

      <Link href="/" aria-label="Início" data-topbar="marca" className="flex items-center gap-3 shrink-0">
        {/* Sempre a marca LIMA: o fundo aqui é escuro nos dois temas, e a
            versão escura sumiria no claro — o inverso do que fazia antes. */}
        <Image src="/quattro-logo.webp" alt="Quattro" width={120} height={33} className="h-[24px] w-auto" priority />
        {isDemo && (
          <span className="hidden sm:block text-[11px] leading-none" style={{ color: "var(--color-text-secondary)" }}>
            Demonstração
          </span>
        )}
      </Link>

      {/* Busca: campo por fora, BOTÃO por dentro — abre a command palette. */}
      <button
        onClick={() => window.dispatchEvent(new Event("a4p:open-search"))}
        data-topbar="busca"
        aria-label="Buscar (⌘K)"
        className="hidden md:flex flex-1 max-w-[620px] mx-auto items-center gap-3 h-11 px-4 rounded-pill transition-colors text-left"
        style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-3)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-surface-2)"; }}
      >
        <Icon name="search" size={18} color="currentColor" />
        <span className="flex-1 text-label">Buscar…</span>
        <kbd className="text-[11px] font-medium tabular-nums">⌘K</kbd>
      </button>

      <div className="flex-1 md:hidden" />

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
        {/* Bloco da conta: avatar + nome + chevron, no molde da referência. Em
            telas estreitas sobra só o avatar — nome e e-mail seriam os
            primeiros a virar reticências. */}
        <button
          onClick={() => setMenu((m) => !m)}
          data-topbar="conta"
          aria-label="Conta e mais opções"
          aria-expanded={menu}
          className="flex items-center gap-2.5 h-11 pl-1.5 pr-2 sm:pr-3 rounded-pill transition-colors"
          style={{ background: menu ? "var(--color-surface-3)" : "var(--color-surface-2)" }}
        >
          <Avatar name={nome} size={32} />
          <span className="hidden sm:flex flex-col items-start min-w-0 max-w-[150px]">
            <span className="text-[13px] font-medium leading-tight truncate w-full" style={{ color: "var(--color-ink)" }}>{nome}</span>
            <span className="text-[11px] leading-tight truncate w-full" style={{ color: "var(--color-text-secondary)" }}>{email}</span>
          </span>
          <span style={{ color: "var(--color-text-secondary)" }} className="shrink-0">
            <Icon name="chevron-down" size={16} color="currentColor" />
          </span>
        </button>

        {menu && (
          <div data-topbar="menu" className="absolute right-0 mt-2 z-[60] w-[248px] rounded-card bg-white border border-border-soft overflow-hidden">
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
      // ⚠️ Marcação estável para o Laboratório. Sem ela o único seletor
      // possível seria `.a4p-topbar button`, que pega junto o hambúrguer do
      // telefone — e editar "os ícones da direita" mexeria num botão que nem
      // está na tela em desktop. Mesmo padrão do `data-ia` do chat.
      data-topbar="acao"
      className={cn(
        "relative inline-flex items-center justify-center w-11 h-11 rounded-pill transition-colors shrink-0",
      )}
      style={{
        background: ativo ? "var(--color-surface-3)" : "var(--color-surface-2)",
        color: "var(--color-ink)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-3)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = ativo ? "var(--color-surface-3)" : "var(--color-surface-2)"; }}
    >
      <Icon name={icone} size={19} color="currentColor" />
      {ponto && (
        <span
          className="absolute top-[9px] right-[10px] w-[7px] h-[7px] rounded-pill"
          // O anel agora é da MOLDURA, não do canvas claro: o ponto vive sobre
          // o chip escuro, e um anel claro em volta dele viraria um alvo.
          style={{ background: "var(--color-warning)", boxShadow: "0 0 0 2px var(--color-surface-2)" }}
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
