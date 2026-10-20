import * as React from "react";
import { ShellGate } from "@/components/app/shell-nesting";
import { PageGuide } from "@/components/app/PageGuide";
import { CommandPalette } from "@/components/app/CommandPalette";
import { ChatGlobal } from "@/components/ia/ChatGlobal";
import { PergunteNaTela } from "@/components/ia/PergunteNaTela";
import { ContatoDrawer } from "@/components/app/ContatoDrawer";
import { NovaTransacao } from "@/components/lancamentos/NovaTransacao";
import { TituloDaAba } from "@/components/app/TituloDaAba";
import { SincronizacaoOrg } from "@/components/app/SincronizacaoOrg";
import { BannerAmostra } from "@/components/app/BannerAmostra";
import { BannerAssinatura } from "@/components/app/BannerAssinatura";
import { RouteTracker } from "@/components/app/RouteTracker";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/app/TopBar";
import { CriarNovo } from "@/components/app/CriarNovo";

/**
 * Standard app frame: route-aware sidebar + scrollable main column with a
 * page header (breadcrumb, title, optional actions). Reused by the
 * financial screens. Responsivo: a Sidebar vira drawer em < lg (hambúrguer no
 * header), e padding/título encolhem no mobile.
 */
export function AppShell({
  title,
  tituloAba,
  actions,
  children,
  scopeClassName = "ds-visor",
  stickyHeader = true,
  semCabecalho = false,
}: {
  title: React.ReactNode;
  /**
   * Título da ABA do navegador. Só é preciso quando `title` é um nó (a Home usa
   * `<InicioTitle />`) — de resto ele sai do próprio `title`.
   */
  tituloAba?: string;
  /** Aceito por compatibilidade, mas não exibido (breadcrumb removido do header). */
  crumb?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Classe de escopo aplicada SÓ ao <main> (ex.: teste de DS na Home). */
  scopeClassName?: string;
  /** Header fixo no topo (padrão). `false` → rola junto com o conteúdo. */
  stickyHeader?: boolean;
  /**
   * Sem o cabeçalho da tela (título e ações). A Home do canvas abre direto na
   * caixa da Quattro AI; o título continua indo para a ABA do navegador.
   */
  semCabecalho?: boolean;
}) {
  const header = (
    <header className="flex items-end justify-between gap-3 flex-wrap px-4 sm:px-6 lg:px-8 pt-5 lg:pt-[26px] pb-[18px]">
      {/* ⚠️ O `MobileNavButton` saiu daqui. Com a moldura escura, o hambúrguer
          da TopBar e este ficavam um embaixo do outro no telefone, a ~50px de
          distância, abrindo a MESMA gaveta — dois controles idênticos empilhados
          fazem a pessoa duvidar de que são o mesmo. A barra é quem oferece o
          menu agora, e ela está sempre visível. */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          {/* Título da página (Laboratório): Roobert Variable 29/500, tracking
              −0.02em, entrelinha 110%, sem caixa-alta. Vale para TODAS as telas —
              é o mesmo componente; o Lab só conseguia selecionar o da Home.

              ⚠️ `truncate` traz `overflow: hidden`, e com entrelinha de 110% a
              caixa de linha fica MENOR que a altura real dos glifos: as
              ascendentes e os acentos eram cortados no topo ("Bem-vindo, João!"
              aparecia decapitado). O respiro vertical devolve a altura à caixa
              e a margem negativa desfaz o deslocamento, então a entrelinha
              documentada e o ritmo do cabeçalho continuam os mesmos. Fica no
              `style` porque precisa sobreviver a qualquer fonte que o
              Laboratório injete — inclusive uma mais alta que a Roobert.

              ⚠️ No celular o título QUEBRA linha em vez de cortar: com o texto
              20% maior (20/10/2026), "Painel de contas a receber" virava
              "Painel de contas a ...". O corte com reticências fica do `sm` em diante. */}
          <h1
            className="m-0 text-[30px] text-ink break-words sm:truncate"
            style={{
              // Título de tela em Roobert 500, caixa de frase ("Aa"),
              // espaçamento 0, 30px (design system de 16/10/2026).
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              letterSpacing: 0,
              lineHeight: 1.1,
              paddingBlock: "0.2em",
              marginBlock: "-0.2em",
            }}
          >
            {title}
          </h1>
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-[10px] flex-wrap justify-end">{actions}</div>
      )}
    </header>
  );
  const chrome = (
    // A raiz é a MOLDURA escura (`.a4p-canvas`); o app inteiro mora no cartão
    // claro arredondado logo abaixo da barra. `bg-surface-1` saiu daqui: o
    // fundo agora vem do token da moldura, e a utility venceria a regra do CSS.
    <div className="a4p-canvas fixed inset-0 flex flex-col overflow-hidden">
      {/* ⚠️ A BARRA DE CIMA FLUTUA (dono, 15/10/2026). Ela era a primeira linha
          da coluna, e o conteúdo parava num retângulo branco logo abaixo dela:
          ao rolar, a barra cinza parecia colada num bloco bruto. Agora ela fica
          POR CIMA da área de trabalho, que sobe até o topo dela e rola por
          baixo. O invólucro não recebe clique (só a barra), senão a faixa das
          margens viraria uma parede invisível sobre o conteúdo. */}
      <div className="absolute inset-x-0 top-0 z-30 pointer-events-none [&>*]:pointer-events-auto">
        <TopBar />
      </div>
      {/* PROPOSTA "Quattro · Home" (out/2026): abaixo da barra, DOIS cartões
          lado a lado sobre a moldura — o menu lateral (todos os grupos, em
          acordeão) e a área de trabalho. A barra de pílulas saiu: os grupos
          moram no menu. */}
      {/* `pt-[84px]` = a barra (12 + 60) + o respiro de 12: o menu lateral
          começa onde começava. */}
      <div className="flex-1 flex min-h-0 gap-3 p-3 pt-[84px]">
      {/* A lateral lê o `?tab=` para saber QUAL item está na tela (três deles
          apontam para o mesmo caminho). `useSearchParams` exige a fronteira de
          Suspense — a mesma que o `PageGuide` já usa logo abaixo. */}
      <React.Suspense fallback={null}><Sidebar /></React.Suspense>
      <main className={`a4p-app-card -mt-[72px] flex-1 flex flex-col min-w-0 min-h-0${scopeClassName ? ` ${scopeClassName}` : ""}`} style={{ background: "var(--a4p-app-bg)" }}>
        {/*
          ⚠️ **A FOLGA DE BAIXO É O TAMANHO DO FAB, e era menor que ele.**

          O botão da Quattro AI é `fixed bottom-5` (20px) e mede ~40px de
          altura: ele ocupa os ~60px de baixo da janela. Este contêiner
          reservava `pb-10` = 40px. Faltavam ~20px, e a ÚLTIMA LINHA de
          qualquer tabela longa ficava por baixo da pílula — some justamente
          o registro que a rolagem foi buscar.

          `pb-24` (96px) deixa a última linha respirando acima do botão em vez
          de encostar nele. A folga vive AQUI, no contêiner que rola, e não num
          espaçador dentro de cada tela: com 82 rotas, a próxima tela nasceria
          sem ele.
        */}
        {/* ⚠️ O cartão sobe 72px (`-mt-[72px]`) para ficar POR BAIXO da barra
            flutuante, e a área que rola devolve esses 72px num ESPAÇADOR: o
            conteúdo abre no mesmo lugar e, ao rolar, passa sob a barra.
            Espaçador, não `padding-top`: o Chrome mede o `top` do sticky a
            partir da caixa de conteúdo da área que rola, e com o padding o
            título grudava 72px mais baixo, por cima do primeiro cartão
            (medido no navegador). */}
        <div data-area-rola className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-24">
          <div data-folga-barra aria-hidden className="h-[72px]" />
          {/* O bloco que GRUDA logo abaixo da barra: avisos da conta e o título
              da tela. ⚠️ Sem retângulo branco (dono, 15/10/2026): o fundo é um
              DEGRADÊ da cor da área para transparente — o título continua
              legível sobre o que passa por baixo, e o conteúdo some suavemente
              em vez de bater numa borda reta. */}
          <div className="a4p-topo-tela sticky top-[60px] z-20 -mx-4 sm:-mx-6 lg:-mx-8">
            {/* ⚠️ ACIMA do cabeçalho e GRUDADO no topo: o aviso de dado de
                demonstração precisa valer para toda tela e não pode sair de vista
                quando a pessoa rola o DRE — que é exatamente onde a contaminação
                aparece. Não fecha e não tem "x": some quando a amostra for
                removida, e só então. */}
            <BannerAmostra />
            {/* ⚠️ Abaixo do de amostra e acima do cabeçalho, também grudado:
                os dois falam do ESTADO da conta, não do conteúdo da tela. */}
            <BannerAssinatura />
            {stickyHeader && !semCabecalho && header}
          </div>
          {/* Header rola junto com o conteúdo quando stickyHeader=false. */}
          {!stickyHeader && !semCabecalho && <div className="-mx-4 sm:-mx-6 lg:-mx-8">{header}</div>}
          {children}
        </div>
      </main>
      </div>
      <TituloDaAba titulo={tituloAba ?? (typeof title === "string" ? title : null)} />
      <RouteTracker />
      <SincronizacaoOrg />
      {/* ⚠️ O Laboratório de Design e o Editor Visual SAÍRAM (16/10/2026). O
          design system se edita em Administração › Design system, que salva
          num PR por `src/design/tokens.json` — a mesma fonte das guardas. */}
      <React.Suspense fallback={null}><PageGuide /></React.Suspense>
      <CommandPalette />
      <ChatGlobal />
      {/* "Pergunte à Quattro AI" no rodapé de toda tela (menos a Home, que já
          tem a caixa no alto): varre a tela e abre a conversa no assunto dela. */}
      <PergunteNaTela nomeTela={tituloAba ?? (typeof title === "string" ? title : null)} />
      <ContatoDrawer />
      <NovaTransacao />
      <CriarNovo />
    </div>
  );

  // Dentro de um hub, a tela-aba já está sob um AppShell: o gate corta o
  // chrome duplicado e deixa só o conteúdo (ver `shell-nesting.tsx`).
  return <ShellGate chrome={chrome} actions={actions}>{children}</ShellGate>;
}
