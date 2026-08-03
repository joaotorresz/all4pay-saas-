import type { Metadata } from "next";
import { Providers } from "./providers";
// DS "Ledger" — tipografia self-hosted (Fontsource, sem fetch externo):
// Schibsted Grotesk (neo-grotesca; UI/títulos/corpo) + Geist Mono (TODOS os
// números: dinheiro, tabelas, eixos de gráfico — precisão de terminal).
import "@fontsource-variable/hanken-grotesk";
import "@fontsource-variable/schibsted-grotesk";
import "@fontsource-variable/geist-mono";
import "@fontsource/boldonse"; // fonte de display p/ testes no Laboratório de Design
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
