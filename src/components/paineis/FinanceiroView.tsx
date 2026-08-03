"use client";

/**
 * Dashboard Financeiro — Saldo · Geração de Caixa · Entradas · Saídas.
 *
 * A pergunta da tela: "no mês X, quanto eu tinha, quanto o negócio gerou, e de
 * onde veio / para onde foi?". Tudo sai do mesmo `RiskInput` do DRE e do fluxo.
 */
import * as React from "react";
import { Card, Skeleton } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { painelFinanceiro, rotuloMesAno, type FiltroPainel } from "@/core/paineis";
import {
  Subtitulo, MesPicker, FiltrosPainel, KpiSimples, TituloCard, ListaFatias, VazioPainel, mesCorrente,
} from "./shared";
import { BaseDoSaldo } from "@/components/movimentacoes/BaseDoSaldo";
import { janelaDoMesDe } from "@/core/indicadores";

export function FinanceiroView() {
  const [mes, setMes] = React.useState(mesCorrente);
  const [filtro, setFiltro] = React.useState<FiltroPainel>({});
  const { data: input, isLoading } = useRiscoInput();

  const p = React.useMemo(() => (input ? painelFinanceiro(input, mes, filtro) : null), [input, mes, filtro]);
  const rotulo = rotuloMesAno(mes);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <Subtitulo>Saldo · Geração de caixa · Entradas · Saídas.</Subtitulo>
        <MesPicker mes={mes} onChange={setMes} />
      </div>

      {/* ⚠️ Item 4 do mapa de consolidação: este painel mostra a POSIÇÃO —
          o saldo consolidado das contas hoje, que não muda ao trocar o mês.
          As outras duas telas mostram projeção e variação; declarar isso é o
          que impede os três números de parecerem contradição. */}
      <BaseDoSaldo base="posicao_hoje" janela={janelaDoMesDe(`${mes}-01`)} />

      <FiltrosPainel filtro={filtro} onChange={setFiltro} />

      {isLoading || !p ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((k) => <Card key={k}><Skeleton className="h-[80px]" /></Card>)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiSimples
              label={`Saldo em ${rotulo}`}
              valor={p.saldoNoMes}
              info={{
                oQue: "Quanto havia em conta ao fim do mês escolhido, somando todas as contas.",
                comoCalcula: "O saldo de um mês passado não fica guardado: parte-se do saldo de hoje e desfaz-se tudo que foi liquidado depois do último dia daquele mês. No mês corrente, é o próprio saldo atual.",
              }}
            />
            <KpiSimples
              label="Geração de caixa (mês)"
              valor={p.geracaoMes}
              tom={p.geracaoMes >= 0 ? "positivo" : "negativo"}
              rodape={`Entradas − saídas liquidadas em ${rotulo}`}
              info={{
                oQue: "Se o mês, sozinho, colocou ou tirou dinheiro do caixa.",
                comoCalcula: "Entradas liquidadas no mês menos saídas liquidadas no mês, pela data de pagamento. Só o realizado entra — previsto não é caixa.",
              }}
            />
            <KpiSimples
              label="Geração de caixa (acumulado)"
              valor={p.geracaoAcumulada}
              tom={p.geracaoAcumulada >= 0 ? "positivo" : "negativo"}
              rodape={`Do primeiro lançamento até ${rotulo}`}
              info={{
                oQue: "Quanto o negócio gerou de caixa desde o começo, até o fim do mês escolhido.",
                comoCalcula: "Soma de todas as entradas liquidadas menos todas as saídas liquidadas até o último dia do mês.",
              }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <TituloCard
                sub={`Total: ${fmt(p.totalEntradas)}`}
                info={{
                  oQue: "De onde veio o dinheiro que entrou no mês.",
                  comoCalcula: "Entradas liquidadas no mês, agrupadas pela categoria do lançamento, da maior para a menor.",
                }}
              >
                Entradas por categoria — {rotulo}
              </TituloCard>
              {p.entradas.length === 0
                ? <VazioPainel texto="Sem entradas neste mês." />
                : <ListaFatias fatias={p.entradas} total={p.totalEntradas} />}
            </Card>

            <Card>
              <TituloCard
                sub={`Total: ${fmt(p.totalSaidas)}`}
                info={{
                  oQue: "Para onde foi o dinheiro que saiu no mês.",
                  comoCalcula: "Saídas liquidadas no mês, agrupadas pela categoria do lançamento, da maior para a menor.",
                }}
              >
                Saídas por categoria — {rotulo}
              </TituloCard>
              {p.saidas.length === 0
                ? <VazioPainel texto="Sem saídas neste mês." />
                : <ListaFatias fatias={p.saidas} total={p.totalSaidas} />}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
