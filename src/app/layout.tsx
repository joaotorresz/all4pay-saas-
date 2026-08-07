import type { Metadata } from "next";
import { Providers } from "./providers";
// ⚠️ TIPOGRAFIA: ROOBERT TRIAL EM TUDO.
//
// Os pacotes Fontsource de Hanken Grotesk, Schibsted Grotesk e Geist Mono
// saíram: nenhuma regra do sistema os pedia mais, e importá-los continuaria
// baixando três famílias que ninguém renderiza — peso de bundle por engano.
//
// A Roobert NÃO entra por aqui: ela é self-hosted em `public/fonts/` e
// declarada em `@font-face` no topo do `globals.css`. Os cortes cobrem a
// escala inteira (Light · Regular · Medium · SemiBold) e os valores usam
// Roobert Mono, que é da mesma família e monoespaçada — as colunas continuam
// alinhando.
//
// `boldonse` fica: é fonte de DISPLAY exclusiva do Laboratório de Design, que
// só injeta CSS quando há estado salvo. Não pinta nada por padrão.
import "@fontsource/boldonse";
import "./globals.css";

export const metadata: Metadata = {
  // ⚠️ Só o FALLBACK. O título real de cada tela é aplicado pelo `AppShell`
  // (`TituloDaAba`), porque as telas são componentes de cliente e não podem
  // exportar `metadata`. Era isto que fazia o sistema inteiro anunciar
  // "all4pay — Tesouraria" em toda aba.
  title: "all4pay",
  description: "ERP + gestão financeira. Construído sobre o Design System all4pay.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Anti-flash: aplica o tema salvo antes da pintura. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('a4p_theme');if(t==='dark'||(t===null&&window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
