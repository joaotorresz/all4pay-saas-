"use client";

/**
 * A PÁGINA PÚBLICA DE METODOLOGIA — sem login, e por isso mesmo sem folga.
 *
 * ⚠️ **NADA aqui é texto escrito à mão sobre o cálculo.** As linhas da cascata
 * vêm de `ESTRUTURA_DRE` (a MESMA que monta o relatório), a explicação de cada
 * uma vem do campo `entra` da própria linha, os indicadores vêm de
 * `METODOLOGIAS` e os limites de `LIMITES`. Texto à mão envelhece na primeira
 * mudança de fórmula e passa a descrever um cálculo que não existe — numa
 * página pública isso deixa de ser dívida interna e vira afirmação errada para
 * quem ainda não é cliente. Há guarda exigindo o consumo.
 */

import * as React from "react";
import { ESTRUTURA_DRE, ESTRUTURA_DFC } from "@/core/relatorios";
import { METODOLOGIAS } from "@/core/metodologia";
import { LIMITES } from "@/core/metodologia/limites";

const SINAL: Record<string, string> = { "+": "+", "-": "−", "=": "=", "+/-": "+/−" };

function Cascata({ linhas, titulo, nota }: { linhas: typeof ESTRUTURA_DRE; titulo: string; nota: string }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h2 m-0">{titulo}</h2>
      <p className="m-0 text-body text-muted max-w-[70ch]">{nota}</p>
      <div className="flex flex-col">
        {linhas.map((l) => (
          <div key={l.id} className="flex gap-3 py-4 border-t border-border-soft">
            <span
              className="text-label font-medium tabular-nums w-[28px] shrink-0 text-center"
              style={{ color: l.tipo === "total" ? "var(--color-ink)" : "var(--color-text-tertiary)" }}
              aria-hidden
            >
              {SINAL[l.sinal] ?? l.sinal}
            </span>
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              <span className={l.tipo === "total" ? "text-body font-semibold text-ink" : "text-body text-ink"}>
                {l.label}
              </span>
              {l.entra && <p className="m-0 text-caption text-muted max-w-[70ch]">{l.entra}</p>}
              {l.tipo === "total" && l.formula && l.formula.length > 0 && (
                <p className="m-0 text-caption text-faint">
                  {/* ⚠️ A linha "=" sai de FÓRMULA sobre as outras, nunca de soma
                      direta de lançamento — é isso que impede um valor de ser
                      contado duas vezes. Publicar a fórmula é publicar a prova. */}
                  Calculada:{" "}
                  {l.formula
                    .map((f, i) => `${i === 0 ? "" : f.sinal === 1 ? "+ " : "− "}${rotulo(f.id, linhas)}`)
                    .join(" ")}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const rotulo = (id: string, linhas: typeof ESTRUTURA_DRE) =>
  linhas.find((x) => x.id === id)?.label ?? id;

export function MetodologiaView() {
  return (
    <main className="mx-auto max-w-[880px] px-6 py-12 flex flex-col gap-14">
      <header className="flex flex-col gap-3">
        <span className="a4p-label text-muted">Metodologia</span>
        <h1 className="text-h1 m-0 max-w-[24ch]">Como os números desta plataforma são calculados</h1>
        <p className="m-0 text-body text-muted max-w-[70ch]">
          Esta página é pública e não exige conta. Ela descreve a estrutura do resultado, o que
          entra em cada linha, como os indicadores são formados — e, no fim, o que o sistema não
          faz. A última parte é a que decide se as anteriores merecem confiança.
        </p>
      </header>

      <Cascata
        linhas={ESTRUTURA_DRE}
        titulo="A demonstração de resultado, linha a linha"
        nota="Apurada por COMPETÊNCIA: cada lançamento entra no mês em que o fato aconteceu, tenha o dinheiro entrado ou não. As linhas em negrito não somam lançamento nenhum — saem de fórmula sobre as linhas acima, e é isso que impede um valor de ser contado duas vezes."
      />

      <Cascata
        linhas={ESTRUTURA_DFC}
        titulo="O fluxo de caixa, linha a linha"
        nota="Apurado por CAIXA: cada lançamento entra na data em que o dinheiro se moveu. É a diferença inteira entre os dois relatórios — uma conta lançada e não paga existe no resultado e não existe aqui, e nenhum dos dois está errado."
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 m-0">Os indicadores, e o que cada um pesa</h2>
        <p className="m-0 text-body text-muted max-w-[70ch]">
          Cada indicador declara o motor que o produz, a janela que enxerga, os componentes com
          seu peso e — no mesmo lugar, com o mesmo destaque — o que ele não enxerga.
        </p>
        {METODOLOGIAS.map((m) => (
          <article key={m.id} className="flex flex-col gap-2 py-5 border-t border-border-soft">
            <h3 className="text-h3 m-0">{m.indicador}</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-x-4 gap-y-1 m-0">
              <dt className="a4p-label text-faint">Fórmula</dt>
              <dd className="m-0 text-caption text-ink">{m.formula}</dd>
              <dt className="a4p-label text-faint">Janela</dt>
              <dd className="m-0 text-caption text-ink">{m.janela}</dd>
              <dt className="a4p-label text-faint">Escala</dt>
              <dd className="m-0 text-caption text-ink">{m.escala}</dd>
              <dt className="a4p-label text-faint">Motor</dt>
              <dd className="m-0 text-caption text-muted tabular-nums">{m.motor}</dd>
            </dl>
            <ul className="m-0 mt-1 pl-0 list-none flex flex-col gap-1">
              {m.componentes.map((c) => (
                <li key={c.label} className="text-caption text-muted">
                  <span className="text-ink">{c.label}</span>{" "}
                  <span className="tabular-nums">({Math.round(c.peso * 100)}%)</span> — {c.comoMede}
                </li>
              ))}
            </ul>
            {m.saturacao && (
              <p className="m-0 text-caption text-muted">
                {/* ⚠️ Um teto que não se declara vira medida — foi assim que "97%"
                    passou a ser lido como probabilidade em vez de saturação. */}
                O valor é limitado entre {m.saturacao.piso} e {m.saturacao.teto}. {m.saturacao.oQueOTetoSignifica}
              </p>
            )}
            <div className="mt-1">
              <span className="a4p-label text-faint">O que este número não enxerga</span>
              <ul className="m-0 mt-1 pl-4 flex flex-col gap-1">
                {m.limitacoes.map((l, i) => (
                  <li key={i} className="text-caption text-muted">{l}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 m-0">O que o sistema não faz</h2>
        <p className="m-0 text-body text-muted max-w-[70ch]">
          Fronteiras declaradas, não defeitos escondidos. Cada uma diz o que o sistema faz de
          fato, por que a fronteira existe, e o que fazer no lugar.
        </p>
        {LIMITES.map((l) => (
          <article key={l.titulo} className="flex flex-col gap-2 py-5 border-t border-border-soft">
            <h3 className="text-h3 m-0">{l.titulo}</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-x-4 gap-y-2 m-0">
              <dt className="a4p-label text-faint">O que ele faz</dt>
              <dd className="m-0 text-caption text-ink max-w-[62ch]">{l.oQueFaz}</dd>
              <dt className="a4p-label text-faint">Por quê</dt>
              <dd className="m-0 text-caption text-muted max-w-[62ch]">{l.porque}</dd>
              <dt className="a4p-label text-faint">Em vez disso</dt>
              <dd className="m-0 text-caption text-muted max-w-[62ch]">{l.emVezDisso}</dd>
            </dl>
          </article>
        ))}
      </section>

      <footer className="border-t border-border-soft pt-6">
        <p className="m-0 text-caption text-faint max-w-[70ch]">
          Esta página é gerada a partir das mesmas definições que o produto executa: as linhas
          vêm da estrutura que monta o relatório, e os pesos vêm do motor que calcula o
          indicador. Quando o cálculo muda, esta página muda junto.
        </p>
      </footer>
    </main>
  );
}
