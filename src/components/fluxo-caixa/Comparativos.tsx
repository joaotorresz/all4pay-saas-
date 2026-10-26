"use client";

/**
 * Cards comparativos do Fluxo de Caixa — Resultado líquido · Gastos · Receitas
 * — e o Sankey "Para onde foi", no modelo da referência enviada.
 *
 * Os três primeiros cards seguem os modelos que o dono escolheu nas pranchetas
 * de TROCAS do canvas "Quattro ERP · Gráficos e tabelas" (15/10/2026), sobre a
 * moldura `CartaoBiblioteca`: Resultado líquido → "Análises 3", Gastos →
 * "Entradas", Receitas → "Receita 2". O Sankey não foi trocado.
 *
 * Cor: o NÚMERO não tem cor por sinal (30/09/2026). Entradas e saídas nos
 * gráficos levam a cor da SÉRIE (`--erp-graf-entrada`/`--erp-graf-saida`),
 * porque o dono ligou "Positivo e negativo" nesses modelos; o Sankey segue em
 * tons do mesmo matiz.
 */
import * as React from "react";
import { Icon, BRL, Skeleton, CartaoBiblioteca, BarrasEntradaSaida, LinhaEntradaSaida, BarrasDestaque, ListaProgresso, type PontoEntradaSaida } from "@/components/ui";
import { rotuloData, type SerieComparada, type ComparativoFluxo, type SankeyDados } from "@/core/cashflow/comparativo";
import { pctDeInteiro } from "@/lib/format";

/* ============================ pílula de variação ============================ */
/** A direção vem do "+"/"−" e da seta, nunca da cor: a pílula é neutra. */
function PilulaVariacao({ s }: { s: SerieComparada }) {
  if (s.variacao === null) {
    return (
      <span className="text-[13px] text-faint">
        sem período anterior para comparar
      </span>
    );
  }
  const sobe = s.variacao >= 0;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className="inline-flex items-center gap-[5px] rounded-md px-2 py-[3px] text-[13px] font-semibold tabular-nums"
        style={{ background: "var(--color-surface-2)", color: "var(--color-ink)" }}
      >
        <span className="inline-flex" style={sobe ? undefined : { transform: "scaleY(-1)" }}>
          <Icon name="trending-up" size={13} color="currentColor" />
        </span>
        {sobe ? "+" : "−"}{pctDeInteiro(Math.abs(s.variacao * 100))}
      </span>
      <span className="text-[13px] text-faint">
        vs <BRL value={s.totalAnterior} />
      </span>
    </div>
  );
}

/* ===================== janela + pílula (subtítulo comum) ===================== */
function Subtitulo({ c, s }: { c: ComparativoFluxo; s: SerieComparada }) {
  return (
    <span className="flex items-center gap-2 flex-wrap">
      <span>{rotuloData(c.janela.de)} – {rotuloData(c.janela.ate)}</span>
      <PilulaVariacao s={s} />
    </span>
  );
}

/** Entradas × saídas do mesmo balde, lado a lado (as duas séries já vêm alinhadas). */
function entradasSaidas(c: ComparativoFluxo): PontoEntradaSaida[] {
  return c.receitas.pontos.map((p, i) => ({ label: p.label, entrada: p.valor, saida: c.gastos.pontos[i]?.valor ?? 0 }));
}

/* ======================== 1) Resultado líquido ======================== */
/** Troca do canvas (15/10/2026): "Análises 3" — entradas em linha reta com área, saídas tracejadas. */
export function ResultadoLiquidoCard({ c }: { c: ComparativoFluxo }) {
  const s = c.resultado;
  return (
    <CartaoBiblioteca
      titulo="Resultado líquido"
      href="/dashboard/reports/dre"
      valor={<>{s.total < 0 ? "−" : ""}<BRL value={Math.abs(s.total)} /></>}
      subtitulo={<Subtitulo c={c} s={s} />}
      info={{
        oQue: "O que sobrou (ou faltou) no período: tudo que entrou menos tudo que saiu, comparado com o período anterior de mesmo tamanho.",
        comoCalcula: "O valor é entradas − saídas da janela. No gráfico, as entradas de cada balde em linha e as saídas tracejadas; a dica mostra a margem do balde, (entradas − saídas) ÷ entradas. A variação compara o total com a janela anterior.",
      }}
    >
      <LinhaEntradaSaida id="resultado" dados={entradasSaidas(c)} altura={240} ariaLabel="Entradas e saídas de cada balde do período" />
    </CartaoBiblioteca>
  );
}

/* ============================== 2) Gastos ============================== */
/** Troca do canvas (15/10/2026): "Entradas" — entradas para cima, saídas para baixo. */
export function GastosCard({ c }: { c: ComparativoFluxo }) {
  const s = c.gastos;
  return (
    <CartaoBiblioteca
      titulo="Gastos"
      href="/contas-a-pagar/titulos"
      valor={<BRL value={s.total} />}
      pesoValor={600}
      subtitulo={<Subtitulo c={c} s={s} />}
      info={{
        oQue: "Tudo que saiu no período, contra o que entrou no mesmo balde, e a variação contra o período anterior.",
        comoCalcula: "O valor soma as saídas da janela. No gráfico, as entradas de cada balde sobem e as saídas descem; a variação compara o total de saídas com a janela anterior de mesmo tamanho.",
      }}
    >
      <BarrasEntradaSaida dados={entradasSaidas(c)} altura={240} ariaLabel="Entradas e saídas de cada balde do período" />
    </CartaoBiblioteca>
  );
}

/* ============================= 3) Receitas ============================= */
/** Troca do canvas (15/10/2026): "Receita 2" — barras com o balde atual em destaque. */
export function ReceitasCard({ c }: { c: ComparativoFluxo }) {
  const s = c.receitas;
  return (
    <CartaoBiblioteca
      titulo="Receitas"
      href="/contas-a-receber/painel-de-vendas"
      valor={<BRL value={s.total} />}
      subtitulo={<Subtitulo c={c} s={s} />}
      info={{
        oQue: "Tudo que entrou no período, balde a balde, contra o período anterior de mesmo tamanho.",
        comoCalcula: "Soma as entradas de cada balde da janela; a barra escura é o balde mais recente. A variação compara o total com a janela anterior.",
      }}
    >
      <BarrasDestaque dados={s.pontos.map((p) => ({ label: p.label, valor: p.valor }))} altura={240} rotuloSerie="Receitas" ariaLabel="Receitas de cada balde do período" />
    </CartaoBiblioteca>
  );
}

/* ========================= 4) Sankey "Para onde foi" ========================= */
/**
 * "Para onde foi" no modelo "Média de despesas" da Biblioteca: as categorias
 * de saída do período, cada uma com a fração do total e o valor, na barra
 * fina. Era um Sankey; a pergunta é a mesma (para onde foi o dinheiro) e a
 * lista se lê de cima para baixo, da maior para a menor.
 */
export function ParaOndeFoiCard({ s, total }: { s: SankeyDados; total: number }) {
  const cats = s.nodes.filter((n) => n.nivel === 2).sort((x, y) => y.valor - x.valor);
  const soma = cats.reduce((t, n) => t + n.valor, 0);
  return (
    <CartaoBiblioteca
      titulo="Para onde foi"
      info={{ oQue: "As categorias que mais levaram dinheiro no período.", comoCalcula: "Soma das saídas do período por categoria; a barra é a fração de cada uma no total de saídas. Mostra até 8 categorias." }}
      valor={cats.length ? <BRL value={total} /> : undefined}
      subtitulo={cats.length ? "saídas do período" : "Sem saídas no período selecionado."}
    >
      {cats.length > 0 && (
        <ListaProgresso ariaLabel="Saídas do período por categoria"
          itens={cats.map((n, i) => ({ chave: n.name + i, nome: n.name, valor: n.valor, fracao: soma > 0 ? n.valor / soma : 0 }))} />
      )}
    </CartaoBiblioteca>
  );
}

/* ============================ bloco montado ============================ */
export function Comparativos({ c, isLoading }: { c: ComparativoFluxo | undefined; isLoading: boolean }) {
  if (isLoading || !c) return <Skeleton className="h-[320px]" />;
  return (
    <div className="flex flex-col gap-5">
      <ResultadoLiquidoCard c={c} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <GastosCard c={c} />
        <ReceitasCard c={c} />
      </div>
      <ParaOndeFoiCard s={c.sankey} total={c.sankey.total} />
    </div>
  );
}
