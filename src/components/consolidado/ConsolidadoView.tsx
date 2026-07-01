"use client";

/**
 * Consolidado multi-empresa — posição agregada das organizações em que o usuário
 * é membro (saldo, receita, despesa, resultado), por entidade e no total. Live:
 * RPC `org_consolidado`; demo: entidades sintéticas. Sem eliminações intercompany.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, BRL, DatePicker, Skeleton, Icon, InfoHint, type InfoConteudo } from "@/components/ui";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { getConsolidado } from "@/lib/consolidado";

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function ConsolidadoView() {
  const [de, setDe] = React.useState(() => `${new Date().getFullYear()}-01-01`);
  const [ate, setAte] = React.useState(isoDia(new Date()));
  const q = useQuery({ queryKey: ["consolidado", de, ate], queryFn: () => getConsolidado(de, ate) });
  const c = q.data;

  return (
    <AppShell title="Consolidado · multi-empresa" crumb="Relatórios" actions={isDemo ? <DemoBadge /> : null}>
      <div className="flex flex-col gap-5 pb-4">
        <Card className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <InfoHint align="left" titulo="Período do consolidado" oQue="Define a janela de datas usada para somar receita, despesa e resultado de todas as suas empresas." comoCalcula="Filtra os movimentos de cada organização entre as datas De e Até; o saldo é a posição atual, independente do período." />
          <DatePicker label="De" value={de} onChange={setDe} max={ate} containerClassName="min-w-[150px]" />
          <DatePicker label="Até" value={ate} onChange={setAte} min={de} containerClassName="min-w-[150px]" />
          <span className="text-caption text-faint self-center ml-auto">Agrega as organizações em que você é membro · sem eliminações intercompany</span>
        </Card>

        {q.isLoading || !c ? (
          <Card><Skeleton className="h-40 w-full" /></Card>
        ) : c.entidades.length === 0 ? (
          <Card className="flex flex-col items-start gap-2">
            <span className="text-h3 font-medium text-ink">Uma organização</span>
            <span className="text-caption text-muted">Você participa de uma única organização — não há o que consolidar. Adicione/participe de outras empresas (Configurações → Governança) para ver o consolidado.</span>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Mini label="Saldo consolidado" v={c.saldo} info={{ titulo: "Saldo consolidado", oQue: "O caixa disponível somado de todas as suas empresas.", comoCalcula: "Soma do saldo atual das contas de cada organização; não depende do período." }} />
              <Mini label="Receita (período)" v={c.receita} info={{ titulo: "Receita do período", oQue: "Tudo que as empresas receberam na janela escolhida.", comoCalcula: "Soma das entradas de todas as organizações entre De e Até." }} />
              <Mini label="Despesa (período)" v={c.despesa} info={{ titulo: "Despesa do período", oQue: "Tudo que as empresas gastaram na janela escolhida.", comoCalcula: "Soma das saídas de todas as organizações entre De e Até." }} />
              <Mini label="Resultado" v={c.resultado} tone={c.resultado >= 0 ? "var(--color-positive)" : "var(--color-negative)"} info={{ titulo: "Resultado do período", oQue: "Quanto sobrou ou faltou no conjunto das empresas no período.", comoCalcula: "Receita do período menos despesa do período, somando todas as organizações." }} />
            </div>

            <Card padded={false} info={{ titulo: "Posição por empresa", oQue: "Mostra saldo, receita, despesa e resultado de cada organização e a soma consolidada.", comoCalcula: "Uma linha por empresa em que você é membro; a última linha soma as colunas, sem eliminações intercompany." }}>
              <div className="hidden sm:grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-3 px-5 py-2 text-caption font-medium text-muted border-b border-border-soft">
                <span>Empresa</span><span className="text-right">Saldo</span><span className="text-right">Receita</span><span className="text-right">Despesa</span><span className="text-right">Resultado</span>
              </div>
              {c.entidades.map((e, i) => (
                <div key={e.orgId} className={`grid grid-cols-2 sm:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-3 items-center px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                  <span className="text-[15px] font-medium text-ink truncate inline-flex items-center gap-2"><Icon name="building" size={14} color="var(--color-text-tertiary)" />{e.nome}</span>
                  <span className="text-caption tabular-nums sm:text-right text-ink"><BRL value={e.saldo} /></span>
                  <span className="text-caption tabular-nums sm:text-right text-muted"><BRL value={e.receita} /></span>
                  <span className="text-caption tabular-nums sm:text-right text-muted"><BRL value={e.despesa} /></span>
                  <span className="text-caption tabular-nums sm:text-right font-medium" style={{ color: e.resultado >= 0 ? "var(--color-positive)" : "var(--color-negative)" }}><BRL value={e.resultado} /></span>
                </div>
              ))}
              <div className="grid grid-cols-2 sm:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-3 items-center px-5 py-3 border-t-2 border-border bg-surface-1/40">
                <span className="text-[15px] font-semibold text-ink">Consolidado ({c.entidades.length})</span>
                <span className="text-caption tabular-nums sm:text-right font-semibold text-ink"><BRL value={c.saldo} /></span>
                <span className="text-caption tabular-nums sm:text-right font-semibold text-ink"><BRL value={c.receita} /></span>
                <span className="text-caption tabular-nums sm:text-right font-semibold text-ink"><BRL value={c.despesa} /></span>
                <span className="text-caption tabular-nums sm:text-right font-semibold" style={{ color: c.resultado >= 0 ? "var(--color-positive)" : "var(--color-negative)" }}><BRL value={c.resultado} /></span>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Mini({ label, v, tone = "var(--color-ink)", info }: { label: string; v: number; tone?: string; info?: InfoConteudo }) {
  return (
    <Card className="flex flex-col gap-1" info={info}>
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[18px] font-semibold tabular-nums" style={{ color: tone }}><BRL value={v} /></span>
    </Card>
  );
}
