"use client";

/**
 * "Transações recentes na maquininha" — o primeiro card da Home, à esquerda
 * (pedido do dono, 16/10/2026). As vendas chegam da Pinbank pelo webhook e o
 * card só lê o que o banco já tem (`lerVendasMaquininha`); a conta da lista e
 * do total de hoje é de `core/pinbank/recentes`.
 *
 * Três estados além da lista: sem maquininha ligada (leva às Integrações),
 * maquininha ligada sem venda ainda, e a falha de leitura (dita, nunca um
 * card vazio que parece "nenhuma venda").
 */
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BRL, Icon } from "@/components/ui";
import { diaEHora, montarPainelMaquininha } from "@/core/pinbank/recentes";
import { lerVendasMaquininha } from "@/lib/pinbank/cliente";

const LINK_INTEGRACAO = "/dashboard/administration/integrations?cartao=maquininha-pinbank";
const cartao = { background: "var(--color-white)", borderRadius: "var(--a4p-box-radius)" } as const;

function rotuloDoDia(dia: string, hoje: string): string {
  if (dia === hoje) return "";
  const ontem = diaEHora(new Date(new Date(`${hoje}T12:00:00-03:00`).getTime() - 86_400_000).toISOString()).dia;
  if (dia === ontem) return "Ontem, ";
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}, `;
}

export function MaquininhaRecentes() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["home", "maquininha-recentes"],
    queryFn: () => lerVendasMaquininha(),
    // A venda chega pelo webhook a qualquer momento: o card relê sozinho.
    refetchInterval: 60_000,
  });
  const hoje = diaEHora(new Date().toISOString()).dia;
  const painel = React.useMemo(() => (data ? montarPainelMaquininha(data.linhas, hoje) : null), [data, hoje]);

  return (
    <Link
      href={LINK_INTEGRACAO}
      draggable={false}
      className="relative h-full min-w-0 flex flex-col gap-4 min-h-[380px] px-8 pt-[30px] pb-6"
      style={cartao}
      data-card-maquininha
    >
      <span className="text-[15px] text-ink pr-8">Transações recentes na maquininha</span>

      {isLoading ? (
        <div className="flex-1 animate-pulse rounded-[12px]" style={{ background: "var(--color-surface-1)" }} />
      ) : error ? (
        <p className="text-[14px] text-muted">Não foi possível ler as vendas da maquininha agora. Tente de novo em instantes.</p>
      ) : !data?.temMaquininha ? (
        <div className="flex-1 flex flex-col items-start justify-center gap-3">
          <span className="w-10 h-10 rounded-pill flex items-center justify-center" style={{ background: "var(--color-surface-1)" }}>
            <Icon name="smartphone" size={18} strokeWidth={1.75} />
          </span>
          <p className="text-[14px] text-ink m-0">Sua maquininha ainda não está ligada.</p>
          <span className="text-[13px] text-muted inline-flex items-center gap-1">Ligar em Integrações <Icon name="arrow-up-right" size={14} strokeWidth={1.75} /></span>
        </div>
      ) : painel && (
        <>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="a4p-heroi" style={{ fontSize: 36, lineHeight: 1 }}><BRL value={painel.hoje.total} /></span>
            <span className="text-[13px] text-muted tabular-nums">
              {painel.hoje.quantidade === 1 ? "1 venda aprovada hoje" : `${painel.hoje.quantidade} vendas aprovadas hoje`}
            </span>
          </div>
          {painel.vendas.length === 0 ? (
            <p className="flex-1 text-[14px] text-muted m-0">Nenhuma venda ainda. Assim que a maquininha passar a primeira, ela aparece aqui.</p>
          ) : (
            <ul className="flex-1 flex flex-col m-0 p-0 list-none">
              {painel.vendas.map((v) => (
                <li key={v.nsu} className="flex items-center justify-between gap-3 py-[10px] border-t" style={{ borderColor: "var(--erp-menu-borda)" }}>
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="text-[13px] text-muted tabular-nums flex-none w-[72px]">{rotuloDoDia(v.dia, hoje)}{v.hora}</span>
                    <span className="text-[14px] text-ink truncate">{v.descricao}</span>
                    {!v.aprovada && (
                      <span className="flex-none text-[11px] font-medium px-[10px] py-[3px] rounded-pill text-muted" style={{ background: "var(--color-surface-1)" }}>
                        {v.status}
                      </span>
                    )}
                  </span>
                  <span className={`flex-none text-[14px] tabular-nums ${v.aprovada ? "text-ink" : "text-muted line-through"}`}><BRL value={v.valor} /></span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[12px] text-muted pt-3 border-t" style={{ borderColor: "var(--erp-menu-borda)" }}>
            <span>{data.exemplo ? "Vendas de exemplo (demonstração)" : "Pinbank · atualiza a cada minuto"}</span>
            <span className="inline-flex items-center gap-1">Ver a maquininha <Icon name="arrow-up-right" size={13} strokeWidth={1.75} /></span>
          </div>
        </>
      )}
    </Link>
  );
}
