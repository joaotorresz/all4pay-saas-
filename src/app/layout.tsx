import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";
import "./globals.css";

/**
 * Brand face: Roc Grotesk Regular (Sharp Type, commercial) — arquivo licenciado
 * carregado localmente. Único peso usado em todo o sistema: 400.
 */
const roc = localFont({
  src: "./fonts/RocGrotesk-Regular.otf",
  weight: "400",
  style: "normal",
  variable: "--font-roc",
  display: "swap",
});

/**
 * Onest (test DS) — carregada para o teste do novo design system na Home.
 * Título: SemiBold (600) · subtítulos/corpo: Regular (400).
 */
const onest = localFont({
  src: [
    { path: "./fonts/Onest-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Onest-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Onest-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-onest",
  display: "swap",
});

export const metadata: Metadata = {
  title: "all4pay — Tesouraria",
  description: "ERP + gestão financeira. Construído sobre o Design System all4pay.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${roc.variable} ${onest.variable}`}>
      <head>
        {/* Anti-flash: aplica o tema salvo antes da pintura. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('a4p_theme');if(t==='dark'||(t===null&&window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
        {/* DM Sans — fonte do DS "Visor" em teste (escopo .ds-visor na Home). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Carregada no root layout (global, não por página) — regra não se aplica. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..700&display=swap"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
