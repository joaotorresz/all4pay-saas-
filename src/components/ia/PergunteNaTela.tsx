"use client";

/**
 * "Pergunte à Quattro AI" no RODAPÉ de toda tela (pedido do dono, 19/10/2026):
 * a mesma barra da caixa da Home, em miniatura, fixa e centralizada embaixo.
 * O clique faz a VARREDURA da tela (uma linha de luz desce pela área de
 * trabalho enquanto a IA conta o que há nela) e abre o chat já no assunto da
 * tela — "O que você quer saber sobre o seu fluxo de caixa?" — com os
 * caminhos dela (`core/ia/contexto-tela`).
 *
 * ⚠️ A leitura é do que está NA TELA (títulos e cartões da área de trabalho),
 * só para a saudação dizer o que viu; os números da resposta continuam saindo
 * do motor da IA, nunca do texto da página.
 *
 * Não aparece na Home (a caixa já está lá), na própria IA nem fora do app.
 */
import * as React from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { MARCA_IA } from "@/core/marca";
import { botaoNaTela, contextoDaTela } from "@/core/ia/contexto-tela";
import { abrirChat } from "./ChatGlobal";

/** Quanto dura a varredura (tem de bater com `.a4p-varredura` no CSS). */
const VARREDURA_MS = 1400;

/** O que a área de trabalho mostra: títulos de seção e quantos cartões e tabelas. */
function lerTela(): { titulos: string[]; cartoes: number; tabelas: number; graficos: number } {
  const area = document.querySelector<HTMLElement>("[data-area-rola]");
  if (!area) return { titulos: [], cartoes: 0, tabelas: 0, graficos: 0 };
  // Só os cartões que a pessoa conta ao olhar: os de FORA (não um dentro de
  // outro) e com largura de cartão — os dias do calendário também são
  // cartões, e "Li 45 cartões" no fluxo de caixa era a contagem dos dias.
  const cartoes = Array.from(area.querySelectorAll<HTMLElement>('[data-card="1"]'))
    .filter((c) => !c.parentElement?.closest('[data-card="1"]') && c.getBoundingClientRect().width >= 240)
    // Cartão de FILTRO (período, conta, layout) não é conteúdo: conta o que
    // mostra valor, percentual, gráfico ou tabela.
    .filter((c) => /R\$|%/.test(c.innerText) || !!c.querySelector("table, .recharts-wrapper, svg[role='img']"));
  // O nome de cada cartão é a primeira linha dele ("Resultado líquido",
  // "Gastos"…); linha com valor ou número não é nome.
  const nomes = cartoes.map((c) => (c.innerText.split("\n")[0] ?? "").trim());
  const titulos = [...nomes, ...Array.from(area.querySelectorAll<HTMLElement>("h2, h3")).map((h) => h.innerText.trim())]
    // Linha com tabulação é cabeçalho de tabela, não nome de cartão.
    .filter((t) => !t.includes("\t"))
    .map((t) => t.replace(/\s+/g, " "))
    .filter((t, i, a) => t.length > 2 && t.length < 40 && /^[A-Za-zÀ-ú]/.test(t) && !/R\$|\d{2}/.test(t) && a.indexOf(t) === i)
    .slice(0, 5);
  return {
    titulos,
    cartoes: cartoes.length,
    tabelas: area.querySelectorAll("table").length,
    graficos: area.querySelectorAll(".recharts-wrapper, svg[role='img']").length,
  };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "Li 6 cartões, 2 gráficos e 1 tabela: Resultado líquido, Gastos…" */
function fraseDaLeitura(l: ReturnType<typeof lerTela>): string | undefined {
  const partes = [
    l.cartoes ? plural(l.cartoes, "cartão", "cartões") : "",
    l.graficos ? plural(l.graficos, "gráfico", "gráficos") : "",
    l.tabelas ? plural(l.tabelas, "tabela", "tabelas") : "",
  ].filter(Boolean);
  if (!partes.length && !l.titulos.length) return undefined;
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}` : partes[0];
  const vi = lista ? `Li ${lista} nesta tela` : "Li esta tela";
  return l.titulos.length ? `${vi}: ${l.titulos.join(" · ")}.` : `${vi}.`;
}

export function PergunteNaTela({ nomeTela }: { nomeTela?: string | null }) {
  const pathname = usePathname() ?? "";
  const [lendo, setLendo] = React.useState<{ topo: number; esq: number; larg: number; alt: number } | null>(null);
  const timer = React.useRef<number | null>(null);
  React.useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  if (!botaoNaTela(pathname)) return null;
  const ctx = contextoDaTela(pathname, nomeTela ?? undefined);

  const abrir = () => {
    if (lendo) return;
    const leitura = fraseDaLeitura(lerTela());
    const ir = () => {
      setLendo(null);
      abrirChat({ tela: { nome: ctx.nome, abertura: ctx.abertura, leitura, caminhos: ctx.caminhos } });
    };
    const area = document.querySelector<HTMLElement>("[data-area-rola]");
    const semMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!area || semMovimento) { ir(); return; }
    const r = area.getBoundingClientRect();
    setLendo({ topo: r.top, esq: r.left, larg: r.width, alt: r.height });
    timer.current = window.setTimeout(ir, VARREDURA_MS);
  };

  return (
    <>
      {lendo && (
        <div
          aria-hidden
          data-ia="varredura"
          className="a4p-varredura fixed z-[60] pointer-events-none overflow-hidden rounded-[20px]"
          style={{ top: lendo.topo, left: lendo.esq, width: lendo.larg, height: lendo.alt }}
        >
          <div className="a4p-varredura-feixe" />
        </div>
      )}
      <div className="fixed bottom-[calc(20px+var(--a4p-barra-baixo,0px))] left-1/2 -translate-x-1/2 z-[45] w-[min(440px,calc(100%-32px))]">
        <button
          type="button"
          onClick={abrir}
          aria-label={`Pergunte à ${MARCA_IA} sobre ${ctx.nome}`}
          aria-busy={!!lendo}
          data-ia="pergunte-tela"
          className="a4p-ondas-ia a4p-pergunte-tela w-full p-[3px] rounded-pill text-left"
        >
          <span
            className="h-12 flex items-center gap-3 pl-4 pr-[6px] rounded-pill"
            style={{ background: "var(--a4p-pilula-fundo)" }}
          >
            <Icon name={lendo ? "scan-line" : "sparkles"} size={18} strokeWidth={1.5} className="flex-none text-ink" />
            <span className="flex-1 min-w-0 truncate text-[15px] text-muted" aria-live="polite">
              {lendo ? `Lendo ${ctx.nome}…` : `Pergunte à ${MARCA_IA}`}
            </span>
            <span
              aria-hidden
              className="w-9 h-9 flex-none rounded-pill flex items-center justify-center"
              style={{ background: "var(--erp-num-cor)", color: "var(--color-surface-1)" }}
            >
              <Icon name="arrow-up" size={18} strokeWidth={1.5} />
            </span>
          </span>
        </button>
      </div>
    </>
  );
}
