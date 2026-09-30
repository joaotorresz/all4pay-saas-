"use client";

/**
 * Balanço patrimonial COMPARATIVO — ativo, passivo e patrimônio líquido em duas
 * datas, com a variação de cada conta.
 *
 * ⚠️ O balanço já era calculado (`balancoDoRazao`), mas vivia como um cartão no
 * meio da aba "Relatórios" do hub de Contabilidade — sem entrada no menu, sem
 * comparação, e quem o procurava em Relatórios não o achava. Ganhou tela própria
 * e a coluna que dá sentido a um balanço: o que mudou desde a data-base.
 *
 * Nenhum número é somado aqui: os dois balanços e as variações saem de
 * `balancoComparativo`, sobre o razão de dupla entrada — a mesma fonte do
 * Razão e da aba Relatórios.
 */
import * as React from "react";
import Link from "next/link";
import { Card, BRL, StatusBadge, DatePicker, Skeleton, InfoHint } from "@/components/ui";
import { getLedgerEntries, balancoComparativo, type RazaoLancamento, type LinhaComparativa } from "@/lib/ledger";

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Último dia do mês anterior ao da data `YYYY-MM-DD` (fatiando a string). */
function fimDoMesAnterior(iso: string): string {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  const d = new Date(y, m - 1, 0);
  return isoDia(d);
}
const br = (iso: string) => iso.split("-").reverse().join("/");

export function BalancoPatrimonialView() {
  const [entries, setEntries] = React.useState<RazaoLancamento[] | null>(null);
  const [ate, setAte] = React.useState(() => isoDia(new Date()));
  const [base, setBase] = React.useState(() => fimDoMesAnterior(isoDia(new Date())));

  React.useEffect(() => { getLedgerEntries().then(setEntries).catch(() => setEntries([])); }, []);

  const cmp = React.useMemo(() => (entries ? balancoComparativo(entries, ate, base) : null), [entries, ate, base]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <Card className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <DatePicker label="Posição em" value={ate} onChange={setAte} containerClassName="min-w-[150px]" />
        <DatePicker label="Comparar com" value={base} onChange={setBase} max={ate} containerClassName="min-w-[150px]" />
        <span className="text-caption text-faint self-center ml-auto">Fonte: razão de dupla entrada</span>
      </Card>

      {entries === null || !cmp ? (
        <Card><Skeleton className="h-40 w-full" /></Card>
      ) : entries.length === 0 ? (
        <Card className="flex flex-col items-start gap-2">
          <span className="text-h3 font-medium text-ink">O razão ainda está vazio</span>
          <span className="text-caption text-muted">O balanço é montado a partir dos lançamentos. Importe um extrato ou lance um movimento e ele aparece aqui.</span>
          <Link href="/upload" className="text-label font-medium text-ink underline">Enviar extrato →</Link>
        </Card>
      ) : (
        <>
          <Card className="flex items-center justify-between gap-3 flex-wrap"
            info={{ titulo: "Equação do balanço", oQue: "Confere se o que a empresa tem é igual ao que ela deve mais o que pertence aos sócios.", comoCalcula: "Ativo comparado com passivo + patrimônio líquido (incluindo o resultado acumulado), nas duas datas." }}>
            <div className="flex flex-col gap-1">
              <span className="text-label font-medium text-muted">Ativo em {br(ate)}</span>
              <span className="a4p-heroi tabular-nums"><BRL value={cmp.atual.ativo} /></span>
              <span className="text-caption text-faint tabular-nums">em {br(base)}: <BRL value={cmp.anterior.ativo} /></span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge tone={cmp.atual.fecha ? "positive" : "warning"}>{cmp.atual.fecha ? "Ativo = Passivo + PL" : "Não fecha"}</StatusBadge>
            </div>
          </Card>

          {cmp.atual.grupos.map((g) => {
            const ga = cmp.anterior.grupos.find((x) => x.titulo === g.titulo);
            const linhas = cmp.linhas.filter((l) => l.grupo === g.titulo);
            return <GrupoComparativo key={g.titulo} titulo={g.titulo} total={g.total} totalAnterior={ga?.total ?? 0} linhas={linhas} ate={ate} base={base} />;
          })}
        </>
      )}
    </div>
  );
}

function GrupoComparativo({ titulo, total, totalAnterior, linhas, ate, base }: {
  titulo: string; total: number; totalAnterior: number; linhas: LinhaComparativa[]; ate: string; base: string;
}) {
  return (
    <Card padded={false}>
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border-soft">
        <span className="flex-1 text-label font-medium text-ink inline-flex items-center gap-1">
          {titulo}
          <InfoHint align="left" titulo={titulo} oQue={`As contas de ${titulo.toLowerCase()} nas duas datas e quanto cada uma mudou.`} comoCalcula="Saldo acumulado de cada conta patrimonial do razão até a data; a variação é a posição atual menos a da data de comparação." />
        </span>
        <span className="hidden sm:block w-[130px] text-right a4p-label text-faint">{br(base)}</span>
        <span className="w-[130px] text-right a4p-label text-faint">{br(ate)}</span>
        <span className="hidden sm:block w-[120px] text-right a4p-label text-faint">Variação</span>
      </div>
      {linhas.length === 0 ? (
        <div className="px-5 py-3 text-caption text-faint">Nenhuma conta com saldo neste grupo.</div>
      ) : linhas.map((l, i) => (
        <div key={`${l.conta}-${l.nome}`} className={`flex items-center gap-3 px-5 py-2 text-caption ${i ? "border-t border-border-soft" : ""}`}>
          <span className="flex-1 min-w-0 truncate text-ink">{l.conta !== "—" ? `${l.conta} · ` : ""}{l.nome}</span>
          <span className="hidden sm:block w-[130px] text-right tabular-nums text-muted"><BRL value={l.anterior} /></span>
          <span className="w-[130px] text-right tabular-nums text-ink"><BRL value={l.atual} /></span>
          <span className={`hidden sm:block w-[120px] text-right tabular-nums ${Math.abs(l.variacao) < 0.005 ? "text-faint" : l.variacao > 0 ? "text-ink" : "text-negative"}`}><BRL value={l.variacao} /></span>
        </div>
      ))}
      <div className="flex items-center gap-3 px-5 py-3 border-t border-border-soft text-label font-medium">
        <span className="flex-1 text-ink">Total</span>
        <span className="hidden sm:block w-[130px] text-right tabular-nums text-muted"><BRL value={totalAnterior} /></span>
        <span className="w-[130px] text-right tabular-nums text-ink"><BRL value={total} /></span>
        <span className="hidden sm:block w-[120px] text-right tabular-nums text-ink"><BRL value={total - totalAnterior} /></span>
      </div>
    </Card>
  );
}
