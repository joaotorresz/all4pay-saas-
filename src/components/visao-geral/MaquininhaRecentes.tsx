"use client";

/**
 * "Transações recentes na maquininha" — o primeiro card da Home, à esquerda
 * (pedido do dono, 16/10/2026). As vendas chegam da Pinbank pelo webhook e o
 * card só lê o que o banco já tem (`lerVendasMaquininha`); a conta do total e
 * da lista é de `core/pinbank/relatorio`, a MESMA da página Maquininha Quattro.
 *
 * Hoje · Semana · Mês (19/10/2026): o total soma as vendas aprovadas do
 * período e cada venda mostra o dia da semana. Abre na SEMANA, que foi o
 * pedido; a escolha vale para a sessão.
 *
 * Três estados além da lista: sem maquininha ligada (leva às Integrações),
 * maquininha ligada sem venda no período, e a falha de leitura (dita, nunca um
 * card vazio que parece "nenhuma venda").
 */
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BRL, Icon } from "@/components/ui";
import { diaEHora } from "@/core/pinbank/recentes";
import { janelaMaquininha, montarRelatorioMaquininha, PERIODOS_MAQUININHA, type PeriodoMaquininha } from "@/core/pinbank/relatorio";
import { lerVendasMaquininha } from "@/lib/pinbank/cliente";

const LINK_INTEGRACAO = "/dashboard/administration/integrations?cartao=maquininha-pinbank";
export const LINK_MAQUININHA = "/contas-a-receber/maquininha";
const cartao = { background: "var(--color-white)", borderRadius: "var(--a4p-box-radius)" } as const;
const LIMITE_LISTA = 6;

const QUANTIDADE: Record<PeriodoMaquininha, [string, string]> = {
  dia: ["venda aprovada hoje", "vendas aprovadas hoje"],
  semana: ["venda aprovada nesta semana", "vendas aprovadas nesta semana"],
  mes: ["venda aprovada neste mês", "vendas aprovadas neste mês"],
};

/** "Seg 14:32" na semana, "Seg 03/10 14:32" fora dela. */
function quando(dia: string, semana: string, hora: string, hoje: string): string {
  if (dia === hoje) return `Hoje ${hora}`;
  const seteDias = diaEHora(new Date(new Date(`${hoje}T12:00:00-03:00`).getTime() - 6 * 86_400_000).toISOString()).dia;
  return dia >= seteDias ? `${semana} ${hora}` : `${semana} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

export function SeletorPeriodoMaquininha({ valor, onChange }: { valor: PeriodoMaquininha; onChange: (p: PeriodoMaquininha) => void }) {
  return (
    <div role="radiogroup" aria-label="Período" className="inline-flex gap-1 rounded-pill p-[3px]" style={{ background: "var(--color-surface-1)" }}>
      {PERIODOS_MAQUININHA.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={valor === p.id}
          onClick={() => onChange(p.id)}
          className={`text-[12px] px-3 py-[5px] rounded-pill transition-colors ${valor === p.id ? "text-ink" : "text-muted hover:text-ink"}`}
          style={valor === p.id ? { background: "var(--color-white)" } : undefined}
        >
          {p.rotulo}
        </button>
      ))}
    </div>
  );
}

export function MaquininhaRecentes() {
  const [periodo, setPeriodo] = React.useState<PeriodoMaquininha>("semana");
  const hoje = diaEHora(new Date().toISOString()).dia;
  // Desde o começo do mês anterior: cobre os três períodos e a comparação.
  const desde = janelaMaquininha("mes", hoje).anterior.de;
  const { data, isLoading, error } = useQuery({
    queryKey: ["home", "maquininha-recentes", desde],
    queryFn: () => lerVendasMaquininha(5000, desde),
    // A venda chega pelo webhook a qualquer momento: o card relê sozinho.
    refetchInterval: 60_000,
  });
  const rel = React.useMemo(
    () => (data ? montarRelatorioMaquininha(data.linhas, [], hoje, periodo) : null),
    [data, hoje, periodo],
  );

  return (
    <div
      className="relative h-full min-w-0 flex flex-col gap-4 min-h-[380px] px-8 pt-[30px] pb-6"
      style={cartao}
      data-card-maquininha
    >
      <div className="flex items-center justify-between gap-3 flex-wrap pr-8">
        <Link href={LINK_MAQUININHA} className="text-[15px] text-ink hover:underline">Transações recentes na maquininha</Link>
        {data?.temMaquininha && <SeletorPeriodoMaquininha valor={periodo} onChange={setPeriodo} />}
      </div>

      {isLoading ? (
        <div className="flex-1 animate-pulse rounded-[12px]" style={{ background: "var(--color-surface-1)" }} />
      ) : error ? (
        <p className="text-[14px] text-muted">Não foi possível ler as vendas da maquininha agora. Tente de novo em instantes.</p>
      ) : !data?.temMaquininha ? (
        <Link href={LINK_INTEGRACAO} className="flex-1 flex flex-col items-start justify-center gap-3">
          <span className="w-10 h-10 rounded-pill flex items-center justify-center" style={{ background: "var(--color-surface-1)" }}>
            <Icon name="smartphone" size={18} strokeWidth={1.75} />
          </span>
          <p className="text-[14px] text-ink m-0">Sua maquininha ainda não está ligada.</p>
          <span className="text-[13px] text-muted inline-flex items-center gap-1">Ligar em Integrações <Icon name="arrow-up-right" size={14} strokeWidth={1.75} /></span>
        </Link>
      ) : rel && (
        <>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="a4p-heroi" style={{ fontSize: 36, lineHeight: 1 }}><BRL value={rel.resumo.vendido} /></span>
            <span className="text-[13px] text-muted tabular-nums">
              {rel.resumo.quantidade} {QUANTIDADE[periodo][rel.resumo.quantidade === 1 ? 0 : 1]}
            </span>
          </div>
          {rel.vendas.length === 0 ? (
            <p className="flex-1 text-[14px] text-muted m-0">Nenhuma venda {periodo === "dia" ? "hoje" : periodo === "semana" ? "nesta semana" : "neste mês"}. Assim que a maquininha passar uma, ela aparece aqui.</p>
          ) : (
            <ul className="flex-1 flex flex-col m-0 p-0 list-none">
              {rel.vendas.slice(0, LIMITE_LISTA).map((v) => (
                <li key={v.nsu} className="flex items-center justify-between gap-3 py-[10px] border-t" style={{ borderColor: "var(--erp-menu-borda)" }}>
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="text-[13px] text-muted tabular-nums flex-none w-[96px]">{quando(v.dia, v.semana, v.hora, hoje)}</span>
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
            <Link href={LINK_MAQUININHA} className="inline-flex items-center gap-1 hover:text-ink">Ver a Maquininha Quattro <Icon name="arrow-up-right" size={13} strokeWidth={1.75} /></Link>
          </div>
        </>
      )}
    </div>
  );
}
