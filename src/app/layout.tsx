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
    <html lang="pt-BR" className={roc.variable}>
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
