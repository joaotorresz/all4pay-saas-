"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A MOLDURA DA ÁREA DA PLATAFORMA — separada da moldura do cliente
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Não usa o `AppShell`.** A moldura do cliente monta o menu das
 * empresas, o ⌘K, o "Criar", a Quattro AI, a ficha de contato e os avisos de
 * assinatura e de amostra — tudo sobre a EMPRESA aberta, nada sobre a
 * plataforma. No endereço da plataforma esses links levariam a 404, e o dono
 * operaria a cobrança de terceiros ao lado do lançamento da própria empresa.
 *
 * O MATERIAL é o mesmo (DS Quattro): moldura verde-base (`.a4p-canvas`),
 * barra e menu em cartões brancos, área de trabalho branca, título em Roobert
 * Black 23px. O que muda é o conteúdo: cinco seções (`SECOES_ADMIN`) e a
 * etiqueta "Administração" ao lado da marca, para nunca restar dúvida de onde
 * se está.
 */
import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { TituloDaAba } from "@/components/app/TituloDaAba";
import { SECOES_ADMIN, secaoAtiva } from "@/core/area-admin";
import { ROTA_SEGURANCA_CONTA } from "@/core/segundo-fator";

const SUPA_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function AdminShell({ actions, children }: { actions?: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const router = useRouter();
  const ativa = secaoAtiva(pathname);
  const [saindo, setSaindo] = React.useState(false);
  const [erroSair, setErroSair] = React.useState<string | null>(null);

  const sair = async () => {
    setSaindo(true); setErroSair(null);
    const { sairDaConta } = await import("@/lib/entrada");
    const r = await sairDaConta();
    if (r.ok) { router.push("/login"); router.refresh(); return; }
    setErroSair("A sessão não foi encerrada. Tente de novo.");
    setSaindo(false);
  };

  return (
    <div className="a4p-canvas fixed inset-0 flex flex-col overflow-hidden">
      <header className="shrink-0 flex items-center gap-3 h-[60px] px-5 mx-3 mt-3 a4p-topbar bg-white border border-border rounded-[20px]">
        <Link href="/admin" className="flex items-center gap-3 min-w-0" aria-label="Administração da plataforma">
          <Image src="/quattro-logo.webp" alt="Quattro" width={120} height={33} className="h-[24px] w-auto" priority />
          <span className="a4p-label text-muted whitespace-nowrap">Administração</span>
        </Link>
        <div className="flex-1" />
        {erroSair && <span className="text-caption text-negative hidden sm:inline">{erroSair}</span>}
        <Link
          href={ROTA_SEGURANCA_CONTA}
          title="Segurança da conta"
          className="inline-flex items-center justify-center w-9 h-9 rounded-pill hover:bg-surface-2 transition-colors"
        >
          <Icon name="shield-check" size={18} color="var(--color-text-secondary)" />
        </Link>
        {SUPA_CONFIGURED && (
          <button
            type="button"
            onClick={sair}
            disabled={saindo}
            className="inline-flex items-center gap-2 rounded-pill border border-border px-4 h-9 text-[14px] text-ink hover:bg-surface-2 transition-colors disabled:opacity-60"
          >
            {saindo ? "Saindo…" : "Sair"}
          </button>
        )}
      </header>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 gap-3 p-3">
        <nav
          aria-label="Seções da administração"
          className="a4p-sidebar shrink-0 bg-white border border-border rounded-[20px] p-2 lg:p-4 lg:w-[232px] flex lg:flex-col gap-1 overflow-x-auto"
        >
          {SECOES_ADMIN.map((s) => {
            const on = s.id === ativa.id;
            return (
              <Link
                key={s.id}
                href={s.href}
                title={s.resumo}
                aria-current={on ? "page" : undefined}
                className={`flex items-center gap-[10px] min-h-[44px] rounded-[12px] px-3 text-[14px] text-ink whitespace-nowrap transition-colors ${on ? "bg-surface-1 font-medium" : "hover:bg-surface-2/60"}`}
              >
                <Icon name={s.icone} size={18} color="var(--color-text-secondary)" />
                <span>{s.rotulo}</span>
              </Link>
            );
          })}
        </nav>

        <main className="a4p-app-card ds-visor flex-1 flex flex-col min-w-0 min-h-0" style={{ background: "var(--color-white)" }}>
          <header className="flex items-end justify-between gap-3 flex-wrap px-4 sm:px-6 lg:px-8 pt-5 lg:pt-[26px] pb-[18px]">
            <div className="min-w-0">
              <h1
                className="m-0 text-[23px] text-ink truncate"
                style={{ fontFamily: '"Roobert", sans-serif', fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.1, paddingBlock: "0.2em", marginBlock: "-0.2em" }}
              >
                {ativa.rotulo}
              </h1>
              <p className="m-0 mt-1 text-caption text-muted">{ativa.resumo}</p>
            </div>
            {actions && <div className="flex items-center gap-[10px] flex-wrap justify-end">{actions}</div>}
          </header>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-10">{children}</div>
        </main>
      </div>
      <TituloDaAba titulo={`${ativa.rotulo} · Administração`} />
    </div>
  );
}
