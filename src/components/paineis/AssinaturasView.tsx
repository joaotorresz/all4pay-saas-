"use client";

/**
 * Dashboard de Assinaturas — MRR · ARR · Assinantes · Churn · Produtos.
 *
 * A fonte é o cadastro de recorrências (`lib/recorrencias`) — o mesmo que
 * projeta as faturas para o fluxo de caixa. Assim o MRR daqui e a receita
 * contratada que aparece em `/recebimentos` falam do mesmo contrato.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer, ComposedChart, Line, Area, LineChart, XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import { Card, Skeleton, BRL, Pill, Button, Icon } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { chartAnim } from "@/lib/chart-anim";
import { listRecorrencias, hydrateRecorrencias, CICLOS, totalFatura, type Recorrencia } from "@/lib/recorrencias";
import { painelAssinaturas, rotuloMesAno, type AssinaturaBase } from "@/core/paineis";
import { Subtitulo, MesPicker, TituloCard, VazioPainel, mesCorrente, tooltipPainel } from "./shared";

const brl0 = (n: number) => (n < 0 ? "−" : "") + "R$ " + Math.abs(Math.round(n)).toLocaleString("pt-BR");
const mesesDoCiclo = (c: Recorrencia["ciclo"]) => CICLOS.find((x) => x.id === c)?.meses ?? 1;

/** Recorrência do store → a forma mínima que o motor puro consome. */
const paraBase = (r: Recorrencia): AssinaturaBase => ({
  id: r.id,
  clienteId: r.clienteId || r.clienteNome,
  clienteNome: r.clienteNome,
  status: r.status,
  valorFatura: totalFatura(r),
  mesesCiclo: mesesDoCiclo(r.ciclo),
  criadoEm: r.criadoEm,
  itens: r.itens.map((it) => ({ nome: it.nome, valor: it.valor, qtd: it.qtd })),
});

export function AssinaturasView() {
  const [mes, setMes] = React.useState(mesCorrente);
  const [assinaturas, setAssinaturas] = React.useState<AssinaturaBase[] | null>(null);
  const [aba, setAba] = React.useState<"assinaturas" | "clientes">("assinaturas");
  const router = useRouter();
  const { data: input } = useRiscoInput();

  React.useEffect(() => {
    let vivo = true;
    hydrateRecorrencias().finally(() => { if (vivo) setAssinaturas(listRecorrencias().map(paraBase)); });
    return () => { vivo = false; };
  }, []);

  const p = React.useMemo(
    () => (assinaturas && input ? painelAssinaturas(assinaturas, mes, input.hoje) : null),
    [assinaturas, input, mes],
  );
  const rotulo = rotuloMesAno(mes);

  if (!p) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1].map((k) => <Card key={k}><Skeleton className="h-[220px]" /></Card>)}
        </div>
      </div>
    );
  }

  const semNada = p.assinaturas === 0 && p.serieMRR.every((s) => s.valor === 0);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <Subtitulo>MRR · ARR · Assinantes · Churn · Produtos.</Subtitulo>
        <MesPicker mes={mes} onChange={setMes} />
      </div>

      {semNada ? (
        <Card>
          <VazioPainel
            texto="Nenhuma assinatura cadastrada ainda. As recorrências que você ativar aparecem aqui — e as faturas delas entram no fluxo de caixa."
            acao={
              <Button variant="primary" onClick={() => router.push("/recebimentos?aba=recorrencias")}>
                <Icon name="plus" size={15} color="currentColor" />
                Criar recorrência
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ------------------------------ MRR ------------------------------ */}
            <Card>
              <TituloCard
                direita={<Variacao pct={p.mrrVariacao} />}
                info={{
                  oQue: "Receita recorrente mensal — o que entra todo mês sem precisar vender de novo.",
                  comoCalcula: "Soma das assinaturas vigentes no mês, cada uma normalizada para o mês: a fatura dividida pelos meses do ciclo (uma anual de R$ 1.200 conta R$ 100 de MRR). ARR é o MRR × 12.",
                }}
              >
                MRR
              </TituloCard>
              <div className="text-[32px] leading-none font-semibold text-ink tabular-nums">
                <BRL value={p.mrr} />
              </div>
              <div className="mt-1 text-caption text-faint">
                vs mês anterior · ARR {brl0(p.arr)}
              </div>
              <div className="h-[200px] mt-4 -ml-2" role="img" aria-label="Evolução do MRR em 12 meses">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={p.serieMRR} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
                    <defs>
                      <linearGradient id="grad-mrr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-lime)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-lime)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd"
                      tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
                    <YAxis tickLine={false} axisLine={false} width={54}
                      tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
                      tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} />
                    <Tooltip formatter={(v: number) => brl0(v)} contentStyle={tooltipPainel} />
                    <Area type="monotone" dataKey="valor" stroke="none" fill="url(#grad-mrr)" {...chartAnim()} />
                    <Line type="monotone" dataKey="valor" stroke="var(--color-lime)" strokeWidth={1.4} dot={false}
                      activeDot={{ r: 4 }} {...chartAnim(120)} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* ------------------- quantidade de assinaturas ------------------- */}
            <Card>
              <TituloCard
                info={{
                  oQue: "Quantos contratos e quantos clientes estão vigentes — a diferença entre os dois mostra quem assina mais de uma coisa.",
                  comoCalcula: "Assinaturas vigentes no mês (criadas até o mês e ainda não canceladas) e os clientes distintos por trás delas.",
                }}
              >
                Quantidade de assinaturas e clientes
              </TituloCard>
              <div className="grid grid-cols-2 gap-4">
                <Contador label="Quantidade de assinaturas" valor={p.assinaturas} pct={p.assinaturasVariacao} />
                <Contador label="Quantidade de clientes" valor={p.clientes} pct={p.clientesVariacao} />
              </div>
              <p className="m-0 mt-3 text-caption text-muted">
                {p.clientes > 0
                  ? `Os ${p.clientes} ${p.clientes === 1 ? "cliente possui" : "clientes possuem"} ${razao(p.assinaturas, p.clientes)} ${p.assinaturas === p.clientes ? "assinatura cada" : "assinaturas em média"}.`
                  : "Nenhum cliente com assinatura vigente neste mês."}
              </p>
              <div className="h-[180px] mt-3 -ml-2" role="img" aria-label="Assinaturas e clientes em 12 meses">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={p.serieAssinaturas} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd"
                      tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
                    <YAxis tickLine={false} axisLine={false} width={34} allowDecimals={false}
                      tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
                    <Tooltip contentStyle={tooltipPainel} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="assinaturas" name="Assinaturas" stroke="var(--color-ink)"
                      strokeWidth={1.4} dot={false} activeDot={{ r: 4 }} {...chartAnim()} />
                    <Line type="monotone" dataKey="clientes" name="Clientes" stroke="var(--color-lime)"
                      strokeWidth={1.4} dot={false} activeDot={{ r: 4 }} {...chartAnim(120)} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* --------------------------- produtos --------------------------- */}
            <Card>
              <TituloCard
                sub={rotulo}
                info={{
                  oQue: "Quais produtos ou serviços sustentam a receita recorrente.",
                  comoCalcula: "Cada item das assinaturas vigentes, com o MRR do contrato rateado pelo peso do item na fatura.",
                }}
              >
                Lista de produtos
              </TituloCard>
              {p.produtos.length === 0 ? (
                <VazioPainel texto="Nenhuma assinatura vigente no mês selecionado." />
              ) : (
                <div className="flex flex-col">
                  <div className="flex items-baseline justify-between gap-3 pb-2 border-b border-border-soft">
                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Produto</span>
                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">MRR</span>
                  </div>
                  {p.produtos.map((pr) => (
                    <div key={pr.nome} className="flex items-baseline justify-between gap-3 py-2 border-b border-border-soft last:border-0">
                      <span className="text-label text-ink truncate">
                        {pr.nome}
                        <span className="text-caption text-faint"> · {pr.assinaturas} {pr.assinaturas === 1 ? "assinatura" : "assinaturas"}</span>
                      </span>
                      <span className="text-label text-ink tabular-nums shrink-0"><BRL value={pr.mrr} /></span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* --------------------------- variação --------------------------- */}
            <Card>
              <TituloCard
                direita={
                  <div className="flex items-center gap-1">
                    {(["assinaturas", "clientes"] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => setAba(a)}
                        className={`rounded-pill px-3 py-[5px] text-caption transition-colors ${
                          aba === a ? "bg-lime text-on-lime font-medium" : "text-muted hover:text-ink"
                        }`}
                      >
                        {a === "assinaturas" ? "Assinaturas" : "Clientes"}
                      </button>
                    ))}
                  </div>
                }
                info={{
                  oQue: "Se a base está crescendo ou encolhendo ao longo do ano.",
                  comoCalcula: "Contagem de assinaturas (ou de clientes distintos) vigentes em cada um dos últimos 12 meses.",
                }}
              >
                Variação de assinantes (12 meses)
              </TituloCard>
              <div className="h-[220px] -ml-2" role="img" aria-label="Variação de assinantes em 12 meses">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={p.serieAssinaturas} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
                    <defs>
                      <linearGradient id="grad-assin" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-lime)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-lime)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd"
                      tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
                    <YAxis tickLine={false} axisLine={false} width={34} allowDecimals={false}
                      tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
                    <Tooltip contentStyle={tooltipPainel} />
                    <Area type="monotone" dataKey={aba} stroke="none" fill="url(#grad-assin)" {...chartAnim()} />
                    <Line type="monotone" dataKey={aba} name={aba === "assinaturas" ? "Assinaturas" : "Clientes"}
                      stroke="var(--color-lime)" strokeWidth={1.4} dot={false} activeDot={{ r: 4 }} {...chartAnim(120)} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-caption text-muted">Churn no mês</span>
                <span className={`text-label font-medium tabular-nums ${p.churn > 0 ? "text-negative" : "text-ink"}`}>
                  {p.churn.toFixed(1)}%
                </span>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const razao = (a: number, b: number) => (b > 0 ? (a / b).toFixed(a % b === 0 ? 0 : 1) : "0");

function Variacao({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-caption text-faint tabular-nums">0,00%</span>;
  return (
    <Pill variant={pct > 0 ? "yield" : "muted"}>
      <span className="tabular-nums">{pct > 0 ? "+" : ""}{pct.toFixed(2)}%</span>
    </Pill>
  );
}

function Contador({ label, valor, pct }: { label: string; valor: number; pct: number }) {
  return (
    <div className="rounded-card bg-surface-2 p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{label}</div>
      <div className="flex items-baseline justify-between gap-2 mt-2">
        <span className="text-[26px] leading-none font-semibold text-ink tabular-nums">{valor}</span>
        <span className={`text-caption tabular-nums ${pct > 0 ? "text-positive" : pct < 0 ? "text-negative" : "text-faint"}`}>
          {pct > 0 ? "+" : ""}{pct.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}
