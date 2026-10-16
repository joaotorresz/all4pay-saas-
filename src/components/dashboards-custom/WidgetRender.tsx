"use client";

/**
 * Renderizadores dos widgets do dashboard customizado.
 *
 * Cada widget lê o MESMO `RiskInput` do resto do sistema através das fontes
 * puras de `core/dashboards` — por isso um KPI montado à mão aqui nunca
 * diverge do número que aparece no DRE ou no fluxo de caixa.
 */
import * as React from "react";
import { Card, BRL, Icon, Skeleton, LinhaPontos, BarrasDestaque, RoscaCentro, BlocosProporcao } from "@/components/ui";
import { useRiscoInput, useAccounts } from "@/components/visao-geral/hooks";
import {
  fonteMetrica, fonteSerie, fonteCategoria, type Widget, type EntradaFontes,
} from "@/core/dashboards";

export function WidgetRender({ w }: { w: Widget }) {
  const { data: input, isLoading } = useRiscoInput();

  if (isLoading) return <Card><Skeleton className="h-[120px]" /></Card>;
  // Sem `input` e sem `isLoading` a busca FALHOU. Continuar pulsando seria
  // mentir — o widget diz o que houve, e o resto da página segue de pé.
  if (!input) return <Card className="h-full"><Vazio texto="Não foi possível carregar os dados." /></Card>;
  const fontes: EntradaFontes = input;

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
  const r = f.calcular(i);
  const v = r.valor;
  // ⚠️ Indisponível: o número NÃO aparece (nem cinza, nem pequeno). O motivo
  // ocupa o lugar dele — um "0 meses" de runway para quem não queima caixa lê
  // como "o caixa acaba agora".
  if (r.indisponivel) {
    return (
      <Card className="h-full flex flex-col justify-between">
        <span className="text-caption font-medium text-muted">{w.titulo || f.label}</span>
        <span className="mt-2 text-label text-muted">Sem dado: {r.indisponivel.motivo}</span>
        <span className="mt-2 text-caption text-faint">{f.label}</span>
      </Card>
    );
  }
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
        w.formato === "linha" ? (
          <LinhaPontos id={`w-${w.id}`} dados={dados} altura={200} ariaLabel={f.label} />
        ) : (
          <BarrasDestaque dados={dados} altura={200} ariaLabel={f.label} rotuloSerie={f.label} />
        )
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
  const fatias = dados.map((d) => ({ chave: d.nome, nome: d.nome, valor: d.valor }));

  return (
    <Card className="h-full">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="text-caption font-medium text-muted">{w.titulo || f.label}</span>
        <span className="text-caption text-faint tabular-nums">
          {f.unidade === "moeda" ? <BRL value={total} /> : `${total} títulos`}
        </span>
      </div>
      {dados.length === 0 ? (
        <Vazio texto="Sem dados no período." />
      ) : (
        <>
          {f.unidade === "moeda" ? (
            <RoscaCentro fatias={fatias} tamanho={160} ariaLabel={f.label} />
          ) : (
            // Contagem não é dinheiro: os blocos falam só a proporção.
            <BlocosProporcao fatias={fatias} altura={180} ariaLabel={f.label} />
          )}
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
  // tem o seu, e só aparece quando existe. Sem cor por sinal (30/09/2026): o
  // "+"/"−" escrito diz a direção.
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
          {entra > 0 && <span className="text-ink">+<BRL value={entra} /></span>}
          {entra > 0 && sai > 0 && <span className="text-faint"> · </span>}
          {sai > 0 && <span className="text-ink">−<BRL value={sai} /></span>}
        </span>
      </div>
      <div className="flex flex-col mt-1">
        {itens.slice(0, 6).map((m, k) => (
          <div key={k} className="flex items-center justify-between gap-3 py-[6px] border-b border-border-soft last:border-0">
            <span className="text-caption text-muted truncate">
              {(m.due_date || "").slice(8, 10)}/{(m.due_date || "").slice(5, 7)} · {m.category || "Sem categoria"}
            </span>
            <span className="text-caption tabular-nums shrink-0 text-ink">
              {m.type === "entrada" ? "+" : "−"}<BRL value={Math.abs(m.amount)} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- comuns -------------------------------- */

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <Icon name="file-text" size={18} color="var(--color-text-tertiary)" />
      <p className="m-0 text-caption text-faint">{texto}</p>
    </div>
  );
}
