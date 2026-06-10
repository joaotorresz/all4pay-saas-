import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

/**
 * Brand face is Roc Grotesk (Sharp Type, commercial). It is substituted
 * with Hanken Grotesk — the nearest free geometric-humanist grotesque
 * with the right weights and numerals. See CLAUDE.md / DS readme.
 */
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  // 400/500 are the working weights; 600 is reserved for page titles
  // (matches the reference design's header). See CLAUDE.md.
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
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
    <html lang="pt-BR" className={hanken.variable}>
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
