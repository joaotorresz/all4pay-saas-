import * as React from "react";
import { ShellGate } from "@/components/app/shell-nesting";
import { PageGuide } from "@/components/app/PageGuide";
import { CommandPalette } from "@/components/app/CommandPalette";
import { AssistantWidget } from "@/components/app/AssistantWidget";
import { ContatoDrawer } from "@/components/app/ContatoDrawer";
import { NovaTransacao } from "@/components/lancamentos/NovaTransacao";
import { TituloDaAba } from "@/components/app/TituloDaAba";
import { SincronizacaoOrg } from "@/components/app/SincronizacaoOrg";
import { BannerAmostra } from "@/components/app/BannerAmostra";
import { BannerAssinatura } from "@/components/app/BannerAssinatura";
import { RouteTracker } from "@/components/app/RouteTracker";
import { DesignLab, DesignLabStyle } from "@/components/app/DesignLab";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/app/TopBar";
import { NavHorizontal } from "@/components/app/NavHorizontal";
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
              Laboratório injete — inclusive uma mais alta que a Roobert. */}
          <h1
            className="m-0 text-[29px] text-ink truncate"
            style={{
              fontFamily: '"Roobert Variable", "Roobert", sans-serif',
              fontWeight: 500,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              textTransform: "none",
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
      <TopBar />
      {/* Segunda linha da moldura: os GRUPOS. A lateral, abaixo, lista os itens
          do grupo ativo — os dois níveis da mesma árvore, um por superfície. */}
      <NavHorizontal />
      {/* Margens do cartão == padding da TopBar (`px-4 lg:px-6`): a marca e a
          borda esquerda do cartão caem na MESMA vertical. Com 12 aqui e 16 lá
          a moldura ficava com dois alinhamentos, que é o tipo de desencontro
          que se sente sem saber nomear. */}
      <div className="a4p-app-card flex-1 flex min-h-0 mx-4 mb-4 lg:mx-6 lg:mb-6">
      {/* A lateral lê o `?tab=` para saber QUAL item está na tela (três deles
          apontam para o mesmo caminho). `useSearchParams` exige a fronteira de
          Suspense — a mesma que o `PageGuide` já usa logo abaixo. */}
      <React.Suspense fallback={null}><Sidebar /></React.Suspense>
      <main className={`flex-1 flex flex-col min-w-0 min-h-0${scopeClassName ? ` ${scopeClassName}` : ""}`}>
        {/* ⚠️ ACIMA do cabeçalho e FORA da área que rola: o aviso de dado de
            demonstração precisa valer para toda tela e não pode sair de vista
            quando a pessoa rola o DRE — que é exatamente onde a contaminação
            aparece. Não fecha e não tem "x": some quando a amostra for
            removida, e só então. */}
        <BannerAmostra />
        {/* ⚠️ Abaixo do de amostra e acima do cabeçalho, fora da área que rola:
            os dois falam do ESTADO da conta, não do conteúdo da tela. */}
        <BannerAssinatura />
        {stickyHeader && header}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-10">
          {/* Header rola junto com o conteúdo quando stickyHeader=false. */}
          {!stickyHeader && <div className="-mx-4 sm:-mx-6 lg:-mx-8">{header}</div>}
          {children}
        </div>
      </main>
      </div>
      <TituloDaAba titulo={tituloAba ?? (typeof title === "string" ? title : null)} />
      <RouteTracker />
      <SincronizacaoOrg />
      {/* ⚠️ O LABORATÓRIO SAIU DE PRODUÇÃO. Ele é um sandbox que repinta o app
          com valores que ninguém do outro lado escolheu, e o botão flutuante
          aparecia para TODO usuário em TODA tela — ruído sobre a interface do
          cliente. Não foi apagado: continua inteiro em `npm run dev`, que é
          onde o design é feito.
          `DesignLabStyle` sai JUNTO, e de propósito: ele injeta o CSS salvo no
          navegador. Deixá-lo montado manteria a repintura de quem já salvou
          algo, sem existir mais a ferramenta para desfazer. */}
      {process.env.NODE_ENV !== "production" && (
        <>
          <DesignLabStyle />
          <DesignLab />
        </>
      )}
      <React.Suspense fallback={null}><PageGuide /></React.Suspense>
      <CommandPalette />
      <AssistantWidget />
      <ContatoDrawer />
      <NovaTransacao />
      <CriarNovo />
    </div>
  );

  // Dentro de um hub, a tela-aba já está sob um AppShell: o gate corta o
  // chrome duplicado e deixa só o conteúdo (ver `shell-nesting.tsx`).
  return <ShellGate chrome={chrome} actions={actions}>{children}</ShellGate>;
}
