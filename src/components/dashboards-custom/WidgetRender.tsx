"use client";

/**
 * Renderizadores dos widgets do dashboard customizado.
 *
 * Cada widget lê o MESMO `RiskInput` do resto do sistema através das fontes
 * puras de `core/dashboards` — por isso um KPI montado à mão aqui nunca
 * diverge do número que aparece no DRE ou no fluxo de caixa.
 */
import * as React from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip,
} from "recharts";
import { Card, BRL, Icon, Skeleton } from "@/components/ui";
import { useRiscoInput, useAccounts } from "@/components/visao-geral/hooks";
import { chartAnim } from "@/lib/chart-anim";
import {
  fonteMetrica, fonteSerie, fonteCategoria, type Widget, type EntradaFontes,
} from "@/core/dashboards";

/** A rampa categórica do sistema (mesma do donut da Home). Vem dos tokens
 *  (`--a4p-cat-*`, feitos com `color-mix` sobre o acento e os neutros), não de
 *  oito hexes copiados — era assim, e quando um arquivo mudava o outro não. */
const PALETA = ["var(--a4p-cat-1)", "var(--a4p-cat-2)", "var(--a4p-cat-3)", "var(--a4p-cat-4)", "var(--a4p-cat-5)", "var(--a4p-cat-6)", "var(--a4p-cat-7)", "var(--a4p-cat-8)"];
const brl0 = (n: number) => (n < 0 ? "−" : "") + "R$" + Math.abs(Math.round(n)).toLocaleString("pt-BR");

export function WidgetRender({ w }: { w: Widget }) {
  const { data: input, isLoading } = useRiscoInput();

  if (isLoading) return <Card><Skeleton className="h-[120px]" /></Card>;
  // Sem `input` e sem `isLoading` a busca FALHOU. Continuar pulsando seria
  // mentir — o widget diz o que houve, e o resto da página segue de pé.
  if (!input) return <Card className="h-full"><Vazio texto="Não foi possível carregar os dados." /></Card>;
  const fontes: EntradaFontes = {
    hoje: input.hoje,
    saldoAtual: input.saldoAtual,
    movements: input.movements,
  };

  switch (w.tipo) {
    case "kpi": return <KPI w={w} i={fontes} />;
    case "texto": return <Texto w={w} />;
    case "serie": return <Serie w={w} i={fontes} />;
    case "pizza": return <Pizza w={w} i={fontes} />;
    case "saldos": return <Saldos titulo={w.titulo} />;
    default: return <Semana w={w} i={fontes} />;
  }
}

/* ---------------------------------- KPI ---------------------------------- */

function KPI({ w, i }: { w: Extract<Widget, { tipo: "kpi" }>; i: EntradaFontes }) {
  const f = fonteMetrica(w.fonte);
  const v = f.calcular(i);
  return (
    <Card className="h-full flex flex-col justify-between">
      <span className="text-caption font-medium text-muted">{w.titulo || f.label}</span>
      <span className="mt-2 text-[28px] leading-none font-semibold text-ink tabular-nums">
        {f.unidade === "moeda" ? <BRL value={v} />
          : f.unidade === "meses" ? <>{v.toLocaleString("pt-BR")} <span className="text-label text-muted">meses</span></>
          : v.toLocaleString("pt-BR")}
      </span>
      <span className="mt-2 text-caption text-faint">{f.label}</span>
    </Card>
  );
}

/* --------------------------------- texto --------------------------------- */

function Texto({ w }: { w: Extract<Widget, { tipo: "texto" }> }) {
  return (
    <Card className="h-full">
      <span className="text-caption font-medium text-muted">{w.titulo}</span>
      <p className="m-0 mt-2 text-label text-ink whitespace-pre-wrap">
        {w.texto || <span className="text-faint">Sem conteúdo — edite este widget para escrever.</span>}
      </p>
    </Card>
  );
}

/* --------------------------------- série --------------------------------- */

function Serie({ w, i }: { w: Extract<Widget, { tipo: "serie" }>; i: EntradaFontes }) {
  const f = fonteSerie(w.fonte);
  const dados = f.calcular(i, 12);
  const vazio = dados.every((p) => p.valor === 0);
  return (
    <Card className="h-full">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <span className="text-caption font-medium text-muted">{w.titulo || f.label}</span>
        <span className="text-caption text-faint">{f.label}</span>
      </div>
      {vazio ? (
        <Vazio texto="Sem dados no período." />
      ) : (
        <div className="h-[200px] -ml-2" role="img" aria-label={f.label}>
          <ResponsiveContainer width="100%" height="100%">
            {w.formato === "linha" ? (
              <LineChart data={dados} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd"
                  tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
                <YAxis tickLine={false} axisLine={false} width={54}
                  tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
                  tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} />
                <Tooltip formatter={(v: number) => brl0(v)} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="valor" stroke="var(--color-lime)" strokeWidth={2} dot={false}
                  activeDot={{ r: 4 }} {...chartAnim()} />
              </LineChart>
            ) : (
              <BarChart data={dados} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd"
                  tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
                <YAxis tickLine={false} axisLine={false} width={54}
                  tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
                  tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} />
                <Tooltip formatter={(v: number) => brl0(v)} cursor={{ fill: "var(--color-surface-2)" }} contentStyle={tooltipStyle} />
                <Bar dataKey="valor" radius={[4, 4, 0, 0]} {...chartAnim()}>
                  {dados.map((p, k) => (
                    // Resultado negativo é sinal semântico, não paleta.
                    <Cell key={k} fill={p.valor < 0 ? "var(--color-negative)" : "var(--color-lime)"} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/* --------------------------------- pizza --------------------------------- */

function Pizza({ w, i }: { w: Extract<Widget, { tipo: "pizza" }>; i: EntradaFontes }) {
  const f = fonteCategoria(w.fonte);
  const todas = f.calcular(i);
  // Mais de 7 fatias vira confete: o resto some em "Outros".
  const top = todas.slice(0, 7);
  const resto = todas.slice(7).reduce((s, x) => s + x.valor, 0);
  const dados = resto > 0 ? [...top, { nome: "Outros", valor: resto }] : top;
  const total = dados.reduce((s, x) => s + x.valor, 0);

  return (
    <Card className="h-full">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="text-caption font-medium text-muted">{w.titulo || f.label}</span>
        <span className="text-caption text-faint tabular-nums">
          {f.unidade === "moeda" ? brl0(total) : `${total} títulos`}
        </span>
      </div>
      {dados.length === 0 ? (
        <Vazio texto="Sem dados no período." />
      ) : (
        <>
          <div className="h-[170px]" role="img" aria-label={f.label}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius="58%" outerRadius="86%"
                  stroke="none" {...chartAnim()}>
                  {dados.map((_, k) => <Cell key={k} fill={PALETA[k % PALETA.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => (f.unidade === "moeda" ? brl0(v) : String(v))}
                  contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-1 mt-2">
            {dados.slice(0, 5).map((d, k) => (
              <div key={d.nome} className="flex items-center gap-2 text-caption">
                <span className="w-[9px] h-[9px] rounded-sm shrink-0" style={{ background: PALETA[k % PALETA.length] }} />
                <span className="text-muted truncate flex-1">{d.nome}</span>
                <span className="text-ink tabular-nums shrink-0">
                  {f.unidade === "moeda" ? brl0(d.valor) : d.valor}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/* -------------------------------- saldos -------------------------------- */

function Saldos({ titulo }: { titulo: string }) {
  const { data, isLoading } = useAccounts();
  if (isLoading) return <Card><Skeleton className="h-[140px]" /></Card>;
  if (!data) return <Card className="h-full"><Vazio texto="Não foi possível carregar as contas." /></Card>;
  const contas = data?.accounts ?? [];
  // Usa o total do acessor (é o mesmo que o resto do app mostra).
  const total = data?.total ?? 0;
  return (
    <Card className="h-full">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <span className="text-caption font-medium text-muted">{titulo || "Saldos das contas"}</span>
        <span className="text-label font-semibold text-ink tabular-nums"><BRL value={total} /></span>
      </div>
      {contas.length === 0 ? (
        <Vazio texto="Nenhuma conta cadastrada." />
      ) : (
        <div className="flex flex-col">
          {contas.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-2 border-b border-border-soft last:border-0">
              <span className="text-label text-ink truncate">{c.name}</span>
              <span className="text-label text-muted tabular-nums shrink-0"><BRL value={c.balance ?? 0} /></span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* -------------------------------- semana -------------------------------- */

function Semana({ w, i }: { w: Extract<Widget, { tipo: "semana" }>; i: EntradaFontes }) {
  const hoje = new Date(i.hoje + "T00:00:00");
  const fim = new Date(hoje.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const daSemana = i.movements.filter((m) => {
    if (m.status === "cancelado" || m.status === "pago") return false;
    const d = (m.due_date || "").slice(0, 10);
    if (!d || d > fim) return false;
    if (w.direcao === "pagar") return m.type === "saida";
    if (w.direcao === "receber") return m.type === "entrada";
    return true;
  });

  const vencidos = daSemana.filter((m) => (m.due_date || "").slice(0, 10) < i.hoje);
  const aVencer = daSemana.filter((m) => (m.due_date || "").slice(0, 10) >= i.hoje);

  return (
    <Card className="h-full">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <span className="text-caption font-medium text-muted">{w.titulo || "Lista da semana"}</span>
        <span className="text-caption text-faint">
          {w.direcao === "pagar" ? "a pagar" : w.direcao === "receber" ? "a receber" : "a pagar e a receber"}
        </span>
      </div>
      {daSemana.length === 0 ? (
        <Vazio texto="Nada vencendo nos próximos 7 dias." />
      ) : (
        <div className="flex flex-col gap-4">
          <Grupo titulo="Vencido" itens={vencidos} alerta />
          <Grupo titulo="A vencer nos próximos 7 dias" itens={aVencer} />
        </div>
      )}
    </Card>
  );
}

function Grupo({
  titulo, itens, alerta,
}: { titulo: string; itens: { type: string; amount: number; due_date: string; category?: string | null }[]; alerta?: boolean }) {
  if (itens.length === 0) return null;
  // Entradas e saídas somadas num total só não querem dizer nada — cada lado
  // tem o seu, e só aparece quando existe.
  const soma = (t: string) =>
    itens.filter((m) => m.type === t).reduce((s, m) => s + Math.abs(m.amount), 0);
  const entra = soma("entrada");
  const sai = soma("saida");
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-caption font-medium ${alerta ? "text-negative" : "text-muted"}`}>
          {titulo} · {itens.length}
        </span>
        <span className="text-caption tabular-nums shrink-0">
          {entra > 0 && <span className="text-positive">+{brl0(entra)}</span>}
          {entra > 0 && sai > 0 && <span className="text-faint"> · </span>}
          {sai > 0 && <span className="text-ink">−{brl0(sai)}</span>}
        </span>
      </div>
      <div className="flex flex-col mt-1">
        {itens.slice(0, 6).map((m, k) => (
          <div key={k} className="flex items-center justify-between gap-3 py-[6px] border-b border-border-soft last:border-0">
            <span className="text-caption text-muted truncate">
              {(m.due_date || "").slice(8, 10)}/{(m.due_date || "").slice(5, 7)} · {m.category || "Sem categoria"}
            </span>
            <span className={`text-caption tabular-nums shrink-0 ${m.type === "entrada" ? "text-positive" : "text-ink"}`}>
              {m.type === "entrada" ? "+" : "−"}{brl0(Math.abs(m.amount)).replace("−", "")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- comuns -------------------------------- */

const tooltipStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-white)",
  fontSize: 13,
};

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <Icon name="file-text" size={18} color="var(--color-text-tertiary)" />
      <p className="m-0 text-caption text-faint">{texto}</p>
    </div>
  );
}
