import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { MarcaNumeros } from "@/components/app/MarcaNumeros";
// ⚠️ TIPOGRAFIA (27/10/2026): Quattro Agrandir nos títulos e no valor-herói,
// Inter Display no texto — o design system do site (paguequattro.com/teste2).
// As duas são self-hosted em `public/fonts/` e declaradas em `@font-face` no
// topo do `globals.css`; nada entra por pacote aqui.

import "./globals.css";

export const metadata: Metadata = {
  // ⚠️ Só o FALLBACK. O título real de cada tela é aplicado pelo `AppShell`
  // (`TituloDaAba`), porque as telas são componentes de cliente e não podem
  // exportar `metadata`. Era isto que fazia o sistema inteiro anunciar
  // "Quattro — Tesouraria" em toda aba.
  title: "Quattro",
  description: "ERP + gestão financeira. Construído sobre o Design System Quattro.",
};

// O teclado do celular ENCOLHE a tela (Android): a barra de digitar fica
// colada nele em vez de ser coberta, e os `100dvh` acompanham.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
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
        <MarcaNumeros />
      </body>
    </html>
  );
}
