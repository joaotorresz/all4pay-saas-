"use client";

/**
 * A PREVISÃO DO MÊS EM TRÊS CAMADAS — realizado · agendado · estimado.
 *
 * ⚠️ A tela não soma nada: tudo sai de `montarPrevisaoDoMes`
 * (`core/previsao-mes`). Ela desenha as três camadas com marcas DIFERENTES —
 * o realizado é cheio; o agendado e o estimado são projetados, com opacidade
 * reduzida E contorno tracejado. Duas marcas porque só a opacidade some em tela
 * fraca e na impressão, que é onde alguém leva o número para uma reunião.
 *
 * Número não tem cor por sinal (30/09/2026): o resultado fica em tinta com o
 * sinal escrito; entradas em tinta, saídas em areia.
 */
import * as React from "react";
import { Card, BRL, Skeleton, MarcaProcedencia } from "@/components/ui";
import { useRiscoInput, useRegrasRecorrentes } from "@/components/visao-geral/hooks";
import {
  montarPrevisaoDoMes, ROTULO_CAMADA, type Camada, type PrevisaoDoMes as Previsao,
} from "@/core/previsao-mes";
import { janelaDoMesDe } from "@/core/indicadores";
import { dataBR } from "@/lib/format";

const CAMADAS: Camada[] = ["realizado", "agendado", "estimado"];

/** O desenho de cada camada. Realizado cheio; as duas projetadas, esmaecidas e tracejadas. */
const MARCA: Record<Camada, { opacidade: number; tracejado: boolean }> = {
  realizado: { opacidade: 1, tracejado: false },
  agendado: { opacidade: 0.5, tracejado: true },
  estimado: { opacidade: 0.25, tracejado: true },
};

function Assinado({ v }: { v: number }) {
  // ⚠️ O sinal é ESCRITO (− U+2212), e a cor é a do texto.
  return <span className="tabular-nums">{v < 0 ? "−" : v > 0 ? "+" : ""}<BRL value={Math.abs(v)} /></span>;
}

function Barra({ p, lado }: { p: Previsao; lado: "entradas" | "saidas" }) {
  const max = Math.max(p.previsto.entradas, p.previsto.saidas, 1);
  const cor = lado === "entradas" ? "var(--color-ink)" : "var(--color-areia)";
  return (
    <div className="flex h-3 w-full rounded-pill bg-surface-2 overflow-hidden" aria-hidden>
      {CAMADAS.map((c) => {
        const v = p.camadas[c][lado];
        if (v <= 0) return null;
        const m = MARCA[c];
        return (
          <div key={c} style={{
            width: `${(v / max) * 100}%`,
            background: `color-mix(in srgb, ${cor} ${Math.round(m.opacidade * 100)}%, transparent)`,
            outline: m.tracejado ? `1px dashed ${cor}` : undefined,
            outlineOffset: m.tracejado ? "-1px" : undefined,
          }} />
        );
      })}
    </div>
  );
}

export function PrevisaoDoMes() {
  const { data: input, isLoading } = useRiscoInput();
  const regras = useRegrasRecorrentes();
  const [abrir, setAbrir] = React.useState(false);

  const p = React.useMemo(
    () => (input && regras.data ? montarPrevisaoDoMes({ input, regras: regras.data }) : null),
    [input, regras.data],
  );

  if (isLoading || regras.isLoading || !p) return <Skeleton className="h-[200px]" />;
  const nomeMes = janelaDoMesDe(p.hoje).label;

  return (
    <Card
      className="flex flex-col gap-5"
      data-previsao-mes={p.mes}
      info={{
        titulo: "Previsão do mês",
        oQue: "Como o mês corrente deve fechar, separado no que já aconteceu, no que está marcado e no que costuma acontecer.",
        comoCalcula:
          "Realizado: entradas e saídas liquidadas do dia 1º até hoje (fato). Agendado: títulos em aberto que vencem até o fim do mês, mais o vencido não pago, esperado a partir de hoje (projeção). Estimado: regras de recorrência que ainda não viraram título neste mês, e compromissos que se repetem nos lançamentos (média dos últimos meses) e ainda não apareceram neste mês (estimativa). Nada é contado duas vezes: onde já existe título, não há estimativa. O resultado previsto é a soma das três.",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 pr-8 flex-wrap">
        <span className="text-h3 text-ink">Previsão de {nomeMes}</span>
        <span className="text-caption text-faint">até {dataBR(p.fimDoMes)} · hoje {dataBR(p.hoje)}</span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-caption text-muted">Resultado previsto do mês</span>
        <span className="a4p-num text-[30px] leading-none text-ink" data-previsao="resultado"><Assinado v={p.previsto.resultado} /></span>
        <span className="text-caption text-faint tabular-nums">
          entradas <BRL value={p.previsto.entradas} /> · saídas <BRL value={p.previsto.saidas} />
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="w-[64px] text-caption text-muted">Entradas</span>
          <Barra p={p} lado="entradas" />
        </div>
        <div className="flex items-center gap-3">
          <span className="w-[64px] text-caption text-muted">Saídas</span>
          <Barra p={p} lado="saidas" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {CAMADAS.map((c) => {
          const k = p.camadas[c];
          const m = MARCA[c];
          return (
            <div key={c} data-camada={c} className="flex flex-col gap-1 rounded-card p-4"
              style={{ border: `1px ${m.tracejado ? "dashed" : "solid"} var(--color-border)` }}>
              <span className="text-caption text-muted inline-flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-sm" aria-hidden style={{
                  background: `color-mix(in srgb, var(--color-ink) ${Math.round(m.opacidade * 100)}%, transparent)`,
                  outline: m.tracejado ? "1px dashed var(--color-ink)" : undefined,
                }} />
                {ROTULO_CAMADA[c]}
                <MarcaProcedencia procedencia={k.procedencia} />
              </span>
              <span className="a4p-num text-[20px] leading-tight text-ink" data-camada-resultado={c}><Assinado v={k.resultado} /></span>
              <span className="text-caption text-faint tabular-nums">
                + <BRL value={k.entradas} /> · − <BRL value={k.saidas} />
              </span>
              <span className="text-caption text-faint">{k.itens === 1 ? "1 item" : `${k.itens} itens`}</span>
            </div>
          );
        })}
      </div>

      {(p.vencidoNoAgendado.entradas > 0 || p.vencidoNoAgendado.saidas > 0) && (
        <p className="m-0 text-caption text-muted">
          O agendado inclui o vencido de meses anteriores que ainda não se moveu: entradas <BRL value={p.vencidoNoAgendado.entradas} /> · saídas <BRL value={p.vencidoNoAgendado.saidas} />.
        </p>
      )}

      {p.estimados.length > 0 ? (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => setAbrir((a) => !a)} aria-expanded={abrir}
            className="self-start text-caption text-muted hover:text-ink">
            {abrir ? "Ocultar" : "Ver"} o que foi estimado ({p.estimados.length})
          </button>
          {abrir && (
            <div className="flex flex-col">
              {p.estimados.map((e) => (
                <div key={e.chave} data-estimado={e.chave} className="flex items-center gap-3 py-2 border-b border-border-soft last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className="block text-label text-ink truncate">{e.descricao}</span>
                    <span className="block text-caption text-faint">
                      {e.origem === "regra" ? "Regra de recorrência sem título neste mês" : "Costuma se repetir e ainda não apareceu neste mês"}
                      {e.data ? ` · previsto para ${dataBR(e.data)}` : ""}{e.categoria ? ` · ${e.categoria}` : ""}
                    </span>
                  </span>
                  <span className="a4p-num text-label text-ink shrink-0">{e.tipo === "entrada" ? "+" : "−"}<BRL value={e.valor} /></span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="m-0 text-caption text-faint">
          Nada estimado: todo compromisso que costuma se repetir já tem título neste mês{p.regras === 0 ? ", e não há regra de recorrência cadastrada" : ""}.
        </p>
      )}
    </Card>
  );
}
