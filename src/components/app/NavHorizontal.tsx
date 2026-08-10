"use client";

/**
 * NAVEGAÇÃO HORIZONTAL — a segunda linha da moldura escura (referência Sphere UI).
 *
 * Os GRUPOS viram abas aqui em cima; a Sidebar passou a listar só os ITENS do
 * grupo ativo. As duas superfícies são os dois níveis da MESMA árvore, não duas
 * cópias dela.
 *
 * ⚠️ Isto é a parte que decide se a mudança presta. Uma barra horizontal com os
 * seis grupos ao lado de uma lateral que também lista os seis grupos e os itens
 * seria navegação DUPLICADA — o defeito que este repositório passou ondas
 * inteiras removendo (duas telas de "a receber", três de assinaturas, seis
 * portas para a mesma IA). Dois caminhos para o mesmo destino divergem no dia em
 * que alguém mexe num deles, e ninguém descobre até um cliente reclamar.
 *
 * ⚠️ O grupo ativo sai de `grupoDaRota()`, a MESMA função que a Sidebar usa.
 * Cada uma derivando por conta própria produziria a barra marcando "Relatórios"
 * enquanto a lateral lista Cadastros, sem como saber qual está certa.
 *
 * `nav-data` NÃO mudou: os mesmos `SECTIONS` alimentam as duas superfícies, e as
 * guardas de navegação (teto do menu, rota duplicada, menu == tela) continuam
 * valendo sobre os mesmos dados.
 */
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { useModo } from "@/components/app/useModo";
import { SeletorOrganizacao } from "@/components/app/SeletorOrganizacao";
import { grupoDaRota, useNavSections, type Section } from "@/components/dashboard/nav-data";
import { cn } from "@/lib/utils";

/** Para onde a aba leva: o destino do grupo, ou a primeira tela dele. */
export function destinoDoGrupo(s: Section): string | undefined {
  return s.href ?? s.items.find((i) => i.href)?.href;
}

export function NavHorizontal() {
  const pathname = usePathname();
  const router = useRouter();
  const { sections, pessoal } = useNavSections();
  const { pro, set: setPro, temDireito } = useModo();

  const ativo = grupoDaRota(sections, pathname);

  /**
   * ⚠️ Traz a aba ativa para dentro da faixa visível.
   *
   * Sem isto, num telefone só cabem três abas e "Cadastros" — a sexta — fica
   * fora da tela: a barra deixa de responder "onde estou", que é a primeira
   * coisa que ela existe para dizer. `block: "nearest"` porque `center` rolaria
   * a PÁGINA na vertical junto, tirando o conteúdo do lugar a cada navegação.
   */
  const faixa = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const alvo = faixa.current?.querySelector<HTMLElement>('[aria-current="page"]');
    alvo?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [ativo?.id]);

  return (
    <nav
      aria-label="Seções do sistema"
      className="a4p-nav-h shrink-0 flex items-center gap-4 h-[52px] px-4 lg:px-6"
    >
      {/*
        O filtro que a pílula de vidro consome (`.a4p-glass-pill`). Fica aqui
        porque `backdrop-filter: url(#id)` resolve o id no DOCUMENTO, e esta
        barra é montada uma vez só pelo AppShell.

        ⚠️ DIVERGI da referência de propósito. Ela usa `feImage` + um mapa de
        deslocamento embutido como data-URI, desenhado para curvar as BORDAS de
        um retângulo específico. Isso é preciso para o card dela e frágil aqui:
        o mapa é do tamanho do elemento, e as abas mudam de largura conforme o
        rótulo — "Início" e "Contabilidade e impostos" precisariam de mapas
        diferentes. `feTurbulence` gera a distorção proceduralmente e serve
        qualquer largura, que é o que uma barra de navegação exige.

        `seed` fixo: sem ele o ruído muda a cada repaint e a pílula "ferve".
      */}
      <svg width="0" height="0" aria-hidden focusable="false" className="absolute pointer-events-none">
        <defs>
          <filter id="a4p-liquid-glass" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves={2} seed={7} result="ruido" />
            <feGaussianBlur in="ruido" stdDeviation="1.6" result="suave" />
            <feDisplacementMap in="SourceGraphic" in2="suave" scale={14} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {/* ⚠️ Rola na horizontal em vez de quebrar em duas linhas: uma segunda
          linha de abas empurra o cartão do app para baixo e come altura de
          conteúdo em telas que já têm pouca. */}
      <div
        ref={faixa}
        className="flex-1 min-w-0 flex items-stretch gap-1 overflow-x-auto a4p-nav-scroll"
        tabIndex={0}
        role="region"
        aria-label="Seções (rolável)"
      >
        {sections.map((s) => {
          const href = destinoDoGrupo(s);
          if (!href) return null;
          const marcado = ativo?.id === s.id;
          return (
            <Link
              key={s.id}
              href={href}
              data-nav-h={s.id}
              aria-current={marcado ? "page" : undefined}
              // ⚠️ Sem ícone: a aba é só o rótulo. Com a pílula de vidro, o
              // glifo competia com o fundo translúcido em vez de ajudar a ler.
              // O marcador do ativo passou a ser a PRÓPRIA pílula acesa — o
              // sublinhado lima saiu junto, senão haveria dois marcadores
              // dizendo a mesma coisa.
              // ⚠️ O VIDRO SAIU. A pílula translúcida dependia de
              // `backdrop-filter`, que só o Chromium desenha por inteiro — e
              // um controle que muda de forma conforme o navegador não é do
              // design system, é um efeito. As abas passaram às superfícies
              // que o sistema já tem: branco quando em repouso, cinza
              // (`surface-2`) quando selecionada, sem borda.
              className={cn(
                "inline-flex items-center px-4 py-[7px] rounded-pill border-0",
                "whitespace-nowrap text-[14px] transition-colors duration-150",
                marcado ? "bg-surface-2 text-ink" : "bg-white text-ink hover:bg-surface-2",
              )}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      {/* Direita: os dois controles que moravam no rodapé da lateral. Com a
          lateral sumindo no Início (grupo sem itens), eles ficariam
          inalcançáveis justamente na tela de entrada. */}
      <div className="hidden lg:flex items-center gap-2 shrink-0">
        {!pessoal && (
          /*
           * ⚠️ Segue sendo um SWITCH, com `role` e `aria-checked` — a guarda de
           * controles da ONDA 7 cobra isso, e o motivo original continua: sem
           * eles o leitor de tela anuncia "Modo Pro, botão" e nenhum estado, e
           * a conclusão correta a tirar é que o controle não funciona.
           */
          <button
            type="button"
            role="switch"
            aria-checked={pro}
            aria-label={`Modo Pro: ${pro ? "ativado" : "desativado"}${temDireito ? "" : " — não incluso no plano"}`}
            onClick={() => {
              if (!setPro(pro ? "simples" : "pro")) router.push("/planos?de=modo-pro");
            }}
            title={
              !temDireito ? "Modo Pro — não incluso no plano desta empresa. Ver planos."
              : pro ? "Modo Pro ativo — some para o essencial (Simples)"
              : "Modo Pro — revela o que o plano já inclui"
            }
            className="inline-flex items-center gap-2 h-8 px-3 rounded-pill transition-colors"
            style={{ background: "var(--a4p-chrome-field)", color: pro ? "var(--a4p-chrome-ink)" : "var(--a4p-chrome-mut)" }}
          >
            <Icon name="sparkles" size={15} color="currentColor" />
            <span className="text-[13px] font-medium">Modo Pro</span>
            <span className="text-[10px] tracking-[0.06em]">
              {!temDireito ? "plano" : pro ? "on" : "off"}
            </span>
            <span
              className={cn("w-[30px] h-[18px] rounded-pill p-[2px] shrink-0 transition-colors", pro ? "bg-lime" : "")}
              style={pro ? undefined : { background: "var(--a4p-chrome-field-hover)" }}
              aria-hidden
            >
              <span className={cn("block w-[14px] h-[14px] rounded-pill bg-white transition-transform", pro && "translate-x-[12px]")} />
            </span>
          </button>
        )}
        <SeletorOrganizacao variante="chrome" />
      </div>
    </nav>
  );
}
