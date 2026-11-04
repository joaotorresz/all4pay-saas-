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
 * O MATERIAL é o mesmo do sistema (DS Quattro, 04/11/2026): fundo claro
 * (`.a4p-canvas`), menu lateral escuro do topo ao pé com o logo dentro, item
 * ativo em relevo, área de trabalho clara e título de tela em Quattro
 * Agrandir 34/700. O que muda é o conteúdo: seis seções (`SECOES_ADMIN`) e a
 * etiqueta "Administração" ao lado da marca, para nunca restar dúvida de onde
 * se está.
 */
import * as React from "react";
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

  // O mesmo desenho do menu do sistema (`dashboard/Sidebar.tsx`): item em
  // Agrandir 15/600 com 46px, o ativo em relevo (`a4p-menu-relevo`), o resto
  // na tinta clara do menu (`a4p-menu-item`). Antes o menu do admin herdava o
  // fundo escuro de `.a4p-sidebar` com o texto na tinta escura (`text-ink`) e
  // os itens ficavam ilegíveis (dono, 04/11/2026).
  const item = (on: boolean) =>
    `flex items-center gap-[14px] min-h-[46px] rounded-[14px] px-4 text-[15px] font-semibold whitespace-nowrap transition-colors ${on ? "a4p-menu-relevo" : "a4p-menu-item"}`;
  const itemPe = "a4p-menu-item flex items-center gap-[12px] min-h-[40px] rounded-[12px] px-3 text-[14px] font-medium transition-colors text-left disabled:opacity-60";

  return (
    <div className="a4p-canvas fixed inset-0 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 gap-3 p-3">
        <aside className="a4p-sidebar shrink-0 flex flex-col rounded-[24px] lg:rounded-[28px] p-3 lg:p-4 lg:w-[260px] min-h-0">
          <div className="flex items-center gap-3 lg:mb-5 lg:mt-1 pl-2">
            <Link href="/admin" className="flex flex-col gap-1 min-w-0 flex-1" aria-label="Administração da plataforma">
              <span
                role="img"
                aria-label="Quattro"
                className="block w-[112px] h-[28px]"
                style={{
                  background: "var(--erp-menu-texto)",
                  WebkitMask: "url(/quattro-logo.webp) left center / contain no-repeat",
                  mask: "url(/quattro-logo.webp) left center / contain no-repeat",
                }}
              />
              <span className="a4p-menu-meta text-[13px] whitespace-nowrap">Administração</span>
            </Link>
            {/* No telefone o pé do menu some: segurança e sair ficam aqui. */}
            <div className="flex items-center gap-2 lg:hidden">
              <Link href={ROTA_SEGURANCA_CONTA} title="Segurança da conta" aria-label="Segurança da conta"
                className="a4p-menu-quadrado w-10 h-10 rounded-[12px] inline-flex items-center justify-center transition-colors">
                <Icon name="shield-check" size={18} color="currentColor" />
              </Link>
              {SUPA_CONFIGURED && (
                <button type="button" onClick={sair} disabled={saindo} title="Sair" aria-label="Sair"
                  className="a4p-menu-quadrado w-10 h-10 rounded-[12px] inline-flex items-center justify-center transition-colors disabled:opacity-60">
                  <Icon name="log-out" size={18} color="currentColor" />
                </button>
              )}
            </div>
          </div>

          <nav
            aria-label="Seções da administração"
            className="flex lg:flex-col gap-1 mt-3 lg:mt-0 overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto lg:flex-1 min-h-0 -mx-1 px-1"
          >
            {SECOES_ADMIN.map((s) => {
              const on = s.id === ativa.id;
              return (
                <Link key={s.id} href={s.href} title={s.resumo} aria-current={on ? "page" : undefined} className={item(on)}>
                  <Icon name={s.icone} size={19} color="currentColor" className="shrink-0" />
                  <span className="a4p-menu-grupo">{s.rotulo}</span>
                </Link>
              );
            })}
          </nav>

          <div className="hidden lg:flex flex-col gap-1.5 mt-3 pt-3 shrink-0">
            <span aria-hidden className="a4p-menu-divisor" />
            {erroSair && <span className="text-caption text-negative px-3">{erroSair}</span>}
            <Link href={ROTA_SEGURANCA_CONTA} className={itemPe}>
              <Icon name="shield-check" size={17} color="currentColor" className="shrink-0" />
              <span className="flex-1">Segurança da conta</span>
            </Link>
            {SUPA_CONFIGURED && (
              <button type="button" onClick={sair} disabled={saindo} className={itemPe}>
                <Icon name="log-out" size={17} color="currentColor" className="shrink-0" />
                <span className="flex-1">{saindo ? "Saindo…" : "Sair"}</span>
              </button>
            )}
          </div>
        </aside>

        <main className="a4p-app-card ds-visor flex-1 flex flex-col min-w-0 min-h-0" style={{ background: "var(--a4p-app-bg)" }}>
          <header className="flex items-end justify-between gap-3 flex-wrap px-4 sm:px-6 lg:px-8 pt-5 lg:pt-[26px] pb-[18px]">
            <div className="min-w-0">
              {/* Título de tela igual ao do sistema (AppShell): Agrandir 34/700. */}
              <h1
                className="m-0 text-[34px] text-ink truncate"
                style={{ fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, paddingBlock: "0.2em", marginBlock: "-0.2em" }}
              >
                {ativa.rotulo}
              </h1>
            </div>
            {actions && <div className="flex items-center gap-[10px] flex-wrap justify-end">{actions}</div>}
          </header>
          {erroSair && <p className="lg:hidden text-caption text-negative px-4 m-0">{erroSair}</p>}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-10">{children}</div>
        </main>
      </div>
      <TituloDaAba titulo={`${ativa.rotulo} · Administração`} />
    </div>
  );
}
