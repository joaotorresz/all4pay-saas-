"use client";

/**
 * "Saldo total em contas" — o card PRINCIPAL da Home (pedido do dono,
 * 27/10/2026). O total é a soma do saldo de todas as contas; embaixo, um
 * círculo na cor de cada banco, com a logo branca, um embaixo do outro, e o saldo dele hoje. A conta é de
 * `core/home/contas` (puro); o card só lê e desenha.
 *
 * Sem conta cadastrada o card não mostra "R$ 0,00" (que afirmaria saldo zero):
 * diz que falta conta e leva ao cadastro.
 */
import * as React from "react";
import Link from "next/link";
import { BRL, BancoLogo, Icon } from "@/components/ui";
import { pct } from "@/lib/format";
import { saldoEmContas } from "@/core/home/contas";
import { useAccounts } from "./hooks";

export const LINK_CONTAS = "/dashboard/registrations/bank-accounts";
const cartao = { background: "var(--color-white)", borderRadius: "var(--a4p-box-radius)" } as const;

export function SaldoEmContasCard({ carimbo }: { carimbo: string }) {
  const { data, isLoading, isError } = useAccounts();
  const resumo = React.useMemo(() => (data ? saldoEmContas(data.accounts) : null), [data]);

  if (isLoading) return <div className="min-h-[240px] animate-pulse" style={cartao} />;

  return (
    <div className="relative h-full min-w-0 flex flex-col gap-6 px-6 md:px-8 pt-[30px] pb-6" style={cartao}>
      <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1 pr-10">
        <span className="text-[15px] text-ink">Saldo total em contas</span>
        {resumo && resumo.contas > 0 && (
          <span className="text-[13px] text-muted whitespace-nowrap">
            {resumo.bancos.length} {resumo.bancos.length === 1 ? "banco" : "bancos"} · {resumo.contas} {resumo.contas === 1 ? "conta" : "contas"}
          </span>
        )}
      </div>

      {isError || !resumo ? (
        <p className="m-0 text-[14px] text-muted">Não foi possível ler as contas agora. Recarregue a página para tentar de novo.</p>
      ) : resumo.contas === 0 ? (
        <div className="flex flex-col gap-3 items-start">
          <p className="m-0 text-[14px] text-muted">Nenhuma conta bancária cadastrada ainda: o saldo aparece aqui assim que a primeira entrar.</p>
          <Link href={LINK_CONTAS} className="inline-flex items-center gap-2 h-9 px-4 rounded-pill text-[13px] a4p-pilula">
            <Icon name="plus" size={15} strokeWidth={1.5} />
            Cadastrar conta
          </Link>
        </div>
      ) : (
        <>
          <Link href={LINK_CONTAS} draggable={false} className="self-start a4p-heroi" style={{ fontSize: "clamp(34px, 9vw, 52px)", lineHeight: 1 }} aria-label="Ver as contas bancárias">
            <BRL value={resumo.total} />
          </Link>
          <ul className="m-0 p-0 list-none flex flex-col" aria-label="Saldo por banco">
            {resumo.bancos.map((b, i) => (
              <li
                key={b.banco}
                className="a4p-entra flex items-center gap-3 min-w-0 py-3 border-t first:border-t-0 first:pt-0"
                style={{ ["--a4p-atraso" as string]: `${i * 60}ms`, borderColor: "var(--erp-menu-borda)" }}
                title={b.contas > 1 ? `${b.contas} contas neste banco` : b.nome}
              >
                <BancoLogo banco={b.banco} nome={b.nome} circulo size={40} />
                <span className="flex-1 min-w-0 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="text-[14px] text-ink truncate min-w-0">
                    {b.nome}{b.contas > 1 ? <span className="text-muted"> · {b.contas} contas</span> : null}
                  </span>
                  <span className="flex items-baseline gap-2 shrink-0 sm:flex-row-reverse">
                    <span className="text-[17px] text-ink"><BRL value={b.saldo} /></span>
                    {b.parte != null && <span className="text-[12px] text-muted tabular-nums">{pct(b.parte)}</span>}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[12px] text-muted pt-3 border-t mt-auto" style={{ borderColor: "var(--erp-menu-borda)" }}>
        <span>{carimbo}</span>
        <Link href={LINK_CONTAS} className="text-[13px] text-ink">Ver contas ↗</Link>
      </div>
    </div>
  );
}
