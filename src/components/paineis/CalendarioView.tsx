"use client";

/**
 * Calendário financeiro — os valores de cada dia na grade do mês.
 *
 * Duas leituras, alternadas pelo botão "Colorir por": **Fluxo diário** (o
 * resultado do dia, isolado) e **Saldo total** (a posição acumulada). São
 * perguntas diferentes — um dia pode ser péssimo com o caixa ainda cheio, ou
 * ótimo com o caixa já no vermelho.
 *
 * A intensidade da cor é proporcional ao MAIOR valor do mês, então a escala
 * fala do mês que está na tela, não de uma faixa fixa que não quer dizer nada.
 */
import * as React from "react";
import { Card, Skeleton, BRL, Icon } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { painelCalendario, rotuloMesAno, type DiaCalendario, type FiltroPainel } from "@/core/paineis";
import { Subtitulo, MesPicker, FiltrosPainel, TituloCard, mesCorrente } from "./shared";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const brl0 = (n: number) => (n < 0 ? "−" : "") + "R$ " + Math.abs(Math.round(n)).toLocaleString("pt-BR");

export function CalendarioView() {
  const [mes, setMes] = React.useState(mesCorrente);
  const [modo, setModo] = React.useState<"fluxo" | "saldo">("fluxo");
  const [filtro, setFiltro] = React.useState<FiltroPainel>({});
  const [aberto, setAberto] = React.useState<DiaCalendario | null>(null);
  const { data: input, isLoading } = useRiscoInput();

  const p = React.useMemo(() => (input ? painelCalendario(input, mes, filtro) : null), [input, mes, filtro]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <Subtitulo>Os valores totais de contas a pagar, a receber e transferências em cada dia.</Subtitulo>
        <MesPicker mes={mes} onChange={setMes} />
      </div>

      <FiltrosPainel filtro={filtro} onChange={setFiltro} />

      {isLoading || !p ? (
        <Card><Skeleton className="h-[420px]" /></Card>
      ) : (
        <Card>
          <TituloCard
            direita={
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span className="text-caption text-muted">Colorir por</span>
                <div className="flex items-center gap-1">
                  {(["saldo", "fluxo"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setModo(m)}
                      className={`rounded-pill px-3 py-[5px] text-caption transition-colors ${
                        modo === m ? "bg-lime text-on-lime font-medium" : "text-muted hover:text-ink"
                      }`}
                    >
                      {m === "saldo" ? "Saldo total" : "Fluxo diário"}
                    </button>
                  ))}
                </div>
              </div>
            }
            info={{
              oQue: "Onde estão os dias que apertam o caixa e os que aliviam.",
              comoCalcula: "Cada dia soma o que foi liquidado nele (pela data de pagamento) e o que está previsto (pelo vencimento). O saldo acumula esse fluxo a partir do saldo ao fim do mês anterior — por isso a última célula fecha no saldo do mês.",
            }}
          >
            {rotuloMesAno(mes)}
          </TituloCard>

          {/* escala */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-caption text-faint">Mais negativo</span>
            <span className="h-[8px] w-[160px] rounded-pill"
              style={{ background: "linear-gradient(90deg, var(--color-negative), var(--color-surface-2), var(--color-positive))" }} />
            <span className="text-caption text-faint">Mais positivo</span>
            <span className="text-caption text-muted ml-auto tabular-nums">
              Entradas {brl0(p.totalEntradas)} · Saídas {brl0(p.totalSaidas)}
            </span>
          </div>

          <div className="grid grid-cols-7 gap-[6px]">
            {DIAS.map((d) => (
              <div key={d} className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint pb-1">{d}</div>
            ))}
            {p.dias.map((d) => (
              <Celula
                key={d.data}
                d={d}
                modo={modo}
                min={modo === "fluxo" ? p.minFluxo : p.minSaldo}
                max={modo === "fluxo" ? p.maxFluxo : p.maxSaldo}
                onClick={() => d.movimentos > 0 && setAberto(d)}
              />
            ))}
          </div>
        </Card>
      )}

      {aberto && <DetalheDia d={aberto} onFechar={() => setAberto(null)} />}
    </div>
  );
}

/**
 * A cor sai de um único matiz por sinal, com a opacidade proporcional ao maior
 * valor do mês. Zero é NEUTRO — pintar um dia sem movimento de verde claro
 * sugeriria que algo bom aconteceu nele.
 */
function fundoDe(valor: number, min: number, max: number): string | undefined {
  if (valor === 0) return undefined;
  const escala = valor > 0 ? max : Math.abs(min);
  if (escala <= 0) return undefined;
  const forca = Math.min(1, Math.abs(valor) / escala);
  const cor = valor > 0 ? "var(--color-positive)" : "var(--color-negative)";
  // color-mix: cor de status é sinal, nunca preenchimento chapado.
  return `color-mix(in srgb, ${cor} ${Math.round(8 + forca * 26)}%, transparent)`;
}

function Celula({
  d, modo, min, max, onClick,
}: { d: DiaCalendario; modo: "fluxo" | "saldo"; min: number; max: number; onClick: () => void }) {
  const valor = modo === "fluxo" ? d.fluxo : d.saldo;
  const clicavel = d.movimentos > 0 && !d.foraDoMes;
  return (
    <button
      onClick={onClick}
      disabled={!clicavel}
      className={`text-left rounded-md p-2 min-h-[92px] flex flex-col transition-colors ${
        d.foraDoMes ? "opacity-35" : ""
      } ${clicavel ? "hover:ring-1 hover:ring-border cursor-pointer" : "cursor-default"} ${
        d.hoje ? "ring-1 ring-ink" : ""
      }`}
      style={{ background: d.foraDoMes ? undefined : fundoDe(valor, min, max) ?? "var(--color-surface-2)" }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={`text-caption tabular-nums ${d.hoje ? "text-ink font-semibold" : "text-muted"}`}>{d.dia}</span>
        {d.hoje && (
          <span className="rounded-pill bg-ink text-white text-[10px] font-medium px-[6px] py-[1px] uppercase tracking-[0.06em]">
            hoje
          </span>
        )}
      </div>
      {d.movimentos === 0 ? (
        <span className="mt-auto text-caption text-faint">Sem movimentação</span>
      ) : (
        <div className="mt-auto flex flex-col gap-[1px]">
          {d.entradas > 0 && <span className="text-caption text-positive tabular-nums">+{brl0(d.entradas)}</span>}
          {d.saidas > 0 && <span className="text-caption text-negative tabular-nums">−{brl0(d.saidas)}</span>}
          <span className="text-caption text-faint tabular-nums">
            {modo === "fluxo" ? `fluxo ${brl0(d.fluxo)}` : `saldo ${brl0(d.saldo)}`}
          </span>
        </div>
      )}
    </button>
  );
}

function DetalheDia({ d, onFechar }: { d: DiaCalendario; onFechar: () => void }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-h3 font-semibold text-ink">
            {d.data.slice(8, 10)}/{d.data.slice(5, 7)}/{d.data.slice(0, 4)}
          </div>
          <div className="text-caption text-faint">
            {d.movimentos} {d.movimentos === 1 ? "movimento" : "movimentos"}
          </div>
        </div>
        <button onClick={onFechar} aria-label="Fechar"
          className="p-1 rounded-md text-muted hover:text-ink hover:bg-surface-2">
          <Icon name="x" size={16} color="currentColor" />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
        <Linha label="Entradas" valor={d.entradas} cor="text-positive" />
        <Linha label="Saídas" valor={d.saidas} cor="text-negative" />
        <Linha label="Fluxo do dia" valor={d.fluxo} cor={d.fluxo >= 0 ? "text-positive" : "text-negative"} />
        <Linha label="Saldo ao fim do dia" valor={d.saldo} cor="text-ink" />
      </div>
    </Card>
  );
}

function Linha({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{label}</div>
      <div className={`mt-1 text-label font-medium tabular-nums ${cor}`}><BRL value={valor} /></div>
    </div>
  );
}
