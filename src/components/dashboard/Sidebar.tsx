"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Avatar, Button, Icon } from "@/components/ui";
import { useModo } from "@/components/app/useModo";
import { SeletorOrganizacao } from "@/components/app/SeletorOrganizacao";
import { grupoDaRota, indiceItemAtivo, useNavSections, type Item } from "@/components/dashboard/nav-data";
import { isDemo } from "@/lib/demo";
import { cn } from "@/lib/utils";

const SUPA_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const STORAGE_KEY = "a4p_sidebar_collapsed";
const LARGURA_KEY = "a4p_sidebar_width";

/**
 * Largura padrão, e os limites do arrasto.
 *
 * ⚠️ Subiu de 240 para 288 quando a linha ganhou tile + título + subtítulo +
 * chevron: em 240 sobravam ~138px para o texto e "Impostos sobre vendas" já
 * saía como "Impostos sobre …". Reticência no TÍTULO apaga o nome do destino,
 * que é a única coisa que a linha precisa entregar.
 */
const LARGURA_PADRAO = 288;
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
  // A aba faz parte de ONDE VOCÊ ESTÁ: três itens deste menu diferem só nela.
  const busca = useSearchParams().toString();
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
  const itens = React.useMemo(() => grupo?.items ?? [], [grupo]);
  const iAtivo = React.useMemo(() => indiceItemAtivo(itens, pathname, busca), [itens, pathname, busca]);

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
          // ⚠️ SEM BORDA. O que separa a lateral do canvas é o CONTRASTE entre
          // as duas superfícies (branco sobre cinza), a mesma relação que já
          // vale para os cards — um fio aqui vira uma terceira linha
          // competindo com o recorte que o próprio contraste desenha.
          "a4p-sidebar relative bg-white flex flex-col py-3 z-50 rounded-[20px]",
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
        {/* ⚠️ O botão "Criar" SAIU da lateral. Ele não foi apagado: a porta
            passou para a paleta (⌘K → "Criar novo registro", o mesmo evento
            `a4p:criar`) — remover o único acesso deixaria o painel de criação,
            com dezesseis ações, sem caminho nenhum, que é como uma tela vira
            código morto sem ninguém notar. */}
        {/* ⚠️ **A AÇÃO E O RECOLHER DIVIDEM A MESMA LINHA.** Empilhados, os dois
            custavam uma faixa de altura inteira no topo do cartão para nada —
            e a mesma decisão já valia para o antigo "Criar" (está no guia).
            Recolhida (68px), eles voltam a empilhar: lado a lado não cabem. */}
        <div className={cn("flex items-center gap-2 mb-2", col ? "flex-col" : "justify-end")}>
          {grupo?.acao && (
            <Button
              variant="primary"
              onClick={() => router.push(grupo.acao!.href)}
              // Recolhida, sobra o ícone — e o rótulo vive no `aria-label`,
              // senão o botão fica mudo para leitor de tela.
              aria-label={grupo.acao.label}
              title={grupo.acao.label}
              // `h-10` para casar EXATAMENTE com o botão de recolher (40px):
              // dois controles na mesma linha com alturas diferentes leem como
              // desalinhamento, não como hierarquia.
              className={cn("h-10 py-0", col ? "w-full px-0 order-2" : "flex-1 min-w-0")}
            >
              <Icon name={grupo.acao.icon} size={15} color="currentColor" />
              {!col && <span className="truncate">{grupo.acao.label}</span>}
            </Button>
          )}
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

        {/* O grupo em que você está — a barra horizontal marca o mesmo.
            ⚠️ Era um micro-rótulo de 11px em cinza-claro, que lia como legenda
            do canto e não como o título da coluna. Agora é TÍTULO: o mesmo
            corpo dos títulos de card, em ink. */}
        {/* ⚠️ O título QUEBRA, não corta. "Contabilidade e impostos" não cabe
            numa linha de 240px, e a reticência num TÍTULO apaga justamente a
            palavra que diz de que grupo se trata. Duas linhas custam uma faixa
            de altura; meio título custa a informação. */}
        {!col && (
          <div className="px-[10px] pb-3 pt-1 shrink-0">
            <h2 className="m-0 text-ink text-[20px] leading-[1.15]">{grupo?.label}</h2>
          </div>
        )}

        {/* Nav — os ITENS do grupo ativo, lista plana. O acordeão saiu junto
            com os grupos, que agora vivem na barra horizontal.
            O fio entre as linhas é o divisor do sistema (cinza): com ícone,
            título e subtítulo, duas linhas coladas viram um bloco só. */}
        <nav className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mr-1 pr-1">
          {itens.map((it, i) => (
            <React.Fragment key={it.href ?? it.label + i}>
              {i > 0 && !col && <span aria-hidden className="h-px bg-border-soft mx-[10px] shrink-0" />}
              <SubItem item={it} ativo={i === iAtivo} collapsed={col} />
            </React.Fragment>
          ))}
        </nav>
      </aside>
    </>
  );
}

/**
 * ⚠️ O TILE DO ÍCONE É QUEM CARREGA O ESTADO — não o fundo da linha.
 *
 * Antes o item selecionado era pintado por inteiro (`bg-surface-1`). Com uma
 * linha de duas alturas (título + subtítulo), um retângulo cheio vira o
 * elemento mais pesado da coluna e disputa com o conteúdo da página ao lado.
 * Concentrando o estado num quadrado de 38px, o marcador fica pequeno,
 * inequívoco e sempre no mesmo lugar — inclusive recolhida, onde o rótulo some
 * e o tile é a única coisa que resta.
 *
 * Selecionado leva o DEGRADÊ DA MARCA; o resto, cinza do sistema. O glifo é
 * ink nos dois: o degradê é claro, e trocar o glifo para branco o apagaria.
 * É um uso sancionado do lima (ícone de destaque, um por vez) — a regra dos
 * ~5% continua valendo justamente porque só há um selecionado.
 */
function TileIcone({ icone, ativo }: { icone: string; ativo: boolean }) {
  return (
    <span
      aria-hidden
      className="w-[38px] h-[38px] rounded-[12px] inline-flex items-center justify-center shrink-0"
      style={ativo ? { background: "var(--gradient-marca)" } : { background: "var(--color-surface-2)" }}
    >
      <Icon name={icone} size={19} color="var(--color-ink)" />
    </span>
  );
}

/** Título + subtítulo. O subtítulo vem da fonte única (`Item.desc`). */
function Rotulos({ item, ativo }: { item: Item; ativo: boolean }) {
  return (
    <span className="flex flex-col min-w-0 flex-1">
      {/* O título QUEBRA; o subtítulo corta. A hierarquia decide: sem o nome
          inteiro a linha não diz para onde leva, e um subtítulo pela metade
          ainda dá a pista. */}
      <span className={cn("text-[15px] leading-[1.25]", ativo ? "text-ink font-semibold" : "text-ink")}>
        {item.label}
      </span>
      {item.desc && <span className="text-[12px] text-muted truncate">{item.desc}</span>}
    </span>
  );
}

/**
 * A linha de uma tela: tile do ícone · título e subtítulo · chevron.
 *
 * O chevron não é decoração — ele diz que a linha LEVA a algum lugar, que é o
 * que a diferença entre esta lista e uma lista de rótulos.
 */
function SubItem({ item, ativo, collapsed }: { item: Item; ativo: boolean; collapsed?: boolean }) {
  const linha = collapsed ? "justify-center px-0" : "gap-3 px-[10px]";

  if (item.event && !item.href) {
    return (
      <button
        onClick={() => window.dispatchEvent(new Event(item.event!))}
        title={item.label}
        className={cn("flex items-center rounded-[14px] py-[10px] text-left hover:bg-surface-2/60 transition-colors", linha)}
      >
        <TileIcone icone={item.icon} ativo={false} />
        {!collapsed && <Rotulos item={item} ativo={false} />}
      </button>
    );
  }
  if (item.soon || !item.href) {
    return (
      <span
        aria-disabled="true"
        title={item.label}
        className={cn("flex items-center rounded-[14px] py-[10px] opacity-45 cursor-not-allowed select-none", linha)}
      >
        <TileIcone icone={item.icon} ativo={false} />
        {!collapsed && (
          <>
            <Rotulos item={item} ativo={false} />
            <span className="text-[11px] text-faint bg-surface-2 rounded-pill px-[6px] py-[1px] shrink-0">Em breve</span>
          </>
        )}
      </span>
    );
  }
  const on = ativo;
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={on ? "page" : undefined}
      className={cn(
        "relative flex items-center rounded-[14px] py-[10px] transition-colors",
        linha,
        on ? "" : "hover:bg-surface-2/60",
      )}
    >
      <TileIcone icone={item.icon} ativo={on} />
      {!collapsed && (
        <>
          <Rotulos item={item} ativo={on} />
          <Icon name="chevron-right" size={16} color="var(--color-text-secondary)" className="shrink-0" />
        </>
      )}
    </Link>
  );
}
