import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * Brand face is Roc Grotesk (Sharp Type, commercial). It is substituted
 * with Hanken Grotesk — the nearest free geometric-humanist grotesque
 * with the right weights and numerals. See CLAUDE.md / DS readme.
 */
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
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
      <body>{children}</body>
    </html>
  );
}
