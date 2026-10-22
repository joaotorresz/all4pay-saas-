"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAINEL DE VENDAS — o painel de contas a receber e os títulos numa tela só.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido do dono (20/10/2026), nesta ordem:
 *  1. o filtro de período do painel de contas a receber ("Esse mês", "Essa
 *     semana", "Personalizado");
 *  2. o calendário de vendas e a distribuição por status, lado a lado;
 *  3. os quatro cards dos títulos a receber, com o TOTAL primeiro e o desenho
 *     dos cards do painel; escolher um card abre o filtro e a tabela.
 *
 * ⚠️ Nada é recalculado aqui. O calendário e o status saem de
 * `montarPainelContasReceber`; os cards e a tabela são a MESMA `TitulosView`
 * da tela de títulos, recebendo o período e os filtros de cima. As duas telas
 * antigas continuam no ar até o dono decidir aposentá-las.
 *
 * ⚠️ Os dois blocos olham datas diferentes, e a tela diz isso: o calendário e o
 * status contam o RECEBIDO pela data do recebimento e o aberto pelo
 * vencimento; os cards e a tabela recortam os títulos pelo VENCIMENTO.
 */
import * as React from "react";
import { Card, Skeleton } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { dataBR } from "@/lib/format";
import {
  montarPainelContasReceber, opcoesDeFiltroReceber, passaNosFiltros,
  periodoMes, periodoSemana, periodoPersonalizado, periodoInvalido,
  ROTULO_SITUACAO_RECEBER, TOKEN_SITUACAO_RECEBER,
  type Periodo, type TipoPeriodo, type SituacaoReceber, type PainelContasReceber,
} from "@/core/contas-receber";
import { FiltrosPeriodo, DistribuicaoDonut, FaixaDeDias, type ItemDoDia } from "@/components/titulos/kit";
import { TitulosView, type RecorteDoPainel } from "@/components/movimentacoes/TitulosView";
import type { RiskMovement } from "@/core/risk-engine/types";

const ROTULOS_PERIODO: Record<TipoPeriodo, string> = {
  mes: "Esse mês",
  semana: "Essa semana",
  personalizado: "Personalizado",
};

export function PainelVendas() {
  const { data: input, isLoading } = useRiscoInput();
  const hoje = input?.hoje?.slice(0, 10) ?? "";

  const [tipo, setTipo] = React.useState<TipoPeriodo>("mes");
  const [custom, setCustom] = React.useState<{ de: string; ate: string }>({ de: "", ate: "" });
  const [projeto, setProjeto] = React.useState("");
  const [centro, setCentro] = React.useState("");
  const [cliente, setCliente] = React.useState("");

  React.useEffect(() => {
    if (!hoje || custom.de) return;
    const m = periodoMes(hoje);
    setCustom({ de: m.de, ate: m.ate });
  }, [hoje, custom.de]);

  const periodo: Periodo | null = React.useMemo(() => {
    if (!hoje) return null;
    if (tipo === "mes") return periodoMes(hoje);
    if (tipo === "semana") return periodoSemana(hoje);
    if (!custom.de || !custom.ate) return null;
    return periodoPersonalizado(custom.de, custom.ate);
  }, [tipo, custom, hoje]);

  const invalido = !!periodo && periodoInvalido(periodo);

  const opcoes = React.useMemo(
    () => (input ? opcoesDeFiltroReceber(input) : { projetos: [], centros: [], clientes: [] }),
    [input],
  );

  const filtro = React.useMemo(
    () => (periodo && !invalido
      ? { de: periodo.de, ate: periodo.ate, projeto: projeto || null, centro: centro || null, cliente: cliente || null }
      : null),
    [periodo, invalido, projeto, centro, cliente],
  );

  const painel: PainelContasReceber | null = React.useMemo(
    () => (input && filtro ? montarPainelContasReceber(input, filtro) : null),
    [input, filtro],
  );

  // O recorte que desce para os cards e a tabela: mesmo período, mesmos
  // filtros, pela MESMA regra do motor de receber.
  const recorte: RecorteDoPainel | null = React.useMemo(() => {
    if (!filtro || !periodo) return null;
    const nomes = input?.partyNames;
    const temFiltro = !!(filtro.projeto || filtro.centro || filtro.cliente);
    return {
      de: filtro.de, ate: filtro.ate, rotulo: periodo.rotulo,
      incluir: temFiltro ? (m: RiskMovement) => passaNosFiltros(m, filtro, nomes) : undefined,
    };
  }, [filtro, periodo, input]);

  const itensDoDia = React.useCallback((data: string): ItemDoDia[] => {
    if (!painel) return [];
    const todos: ItemDoDia[] = [
      ...painel.recebidoNoPeriodo.titulos.map((t) => ({ ...t, contraparte: t.cliente, situacao: ROTULO_SITUACAO_RECEBER.recebido })),
      ...painel.aVencer.titulos.map((t) => ({ ...t, contraparte: t.cliente, situacao: ROTULO_SITUACAO_RECEBER.a_vencer })),
      ...painel.vencidas.titulos.map((t) => ({ ...t, contraparte: t.cliente, situacao: ROTULO_SITUACAO_RECEBER.vencido })),
    ];
    return todos.filter((t) => t.data === data).sort((a, b) => b.valor - a.valor);
  }, [painel]);

  return (
    <div className="flex flex-col gap-6">
      <FiltrosPeriodo
        titulo="Período do painel de vendas"
        tipo={tipo} onTipo={setTipo}
        custom={custom} onCustom={setCustom}
        periodo={periodo} invalido={invalido}
        rotulos={ROTULOS_PERIODO}
        filtros={[
          { label: "Cliente", valor: cliente, onChange: setCliente, opcoes: opcoes.clientes,
            todos: "Todos os clientes", vazio: "Nenhum cliente nos títulos" },
          { label: "Projeto", valor: projeto, onChange: setProjeto, opcoes: opcoes.projetos,
            todos: "Todos os projetos", vazio: "Nenhum projeto nos títulos" },
          { label: "Centro de custo", valor: centro, onChange: setCentro, opcoes: opcoes.centros,
            todos: "Todos os centros de custo", vazio: "Nenhum centro nos títulos" },
        ]}
      />

      {invalido && (
        <Card>
          <p className="m-0 text-body text-ink">
            A data inicial é posterior à final. Corrija o intervalo — nenhum
            período existe entre {dataBR(periodo!.de)} e {dataBR(periodo!.ate)}.
          </p>
        </Card>
      )}

      {isLoading || (!painel && !invalido) ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1].map((k) => <Skeleton key={k} className="h-[220px]" />)}
        </div>
      ) : painel ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 items-start">
          <FaixaDeDias
            titulo="Calendário de vendas"
            rotuloPeriodo={periodo!.rotulo}
            hoje={hoje}
            vazioTexto="Nenhuma venda a receber no período selecionado."
            icone="arrow-up"
            truncado={painel.diasTruncados}
            dias={painel.dias.map((d) => ({
              data: d.data, quantidade: d.quantidade, ehHoje: d.ehHoje,
              cor: d.situacao ? TOKEN_SITUACAO_RECEBER[d.situacao] : null,
            }))}
            itensDoDia={itensDoDia}
            info={{
              titulo: "Calendário de vendas",
              oQue: "Em que dia cada recebimento de venda do período cai.",
              comoCalcula:
                "Cada dia soma o que VENCE nele (em aberto) e o que foi RECEBIDO nele. A cor do dia é a situação mais urgente que ele contém — um dia com nove recebidas e uma vencida aparece como vencida.",
            }}
          />
          <DistribuicaoDonut
            variante="aneis"
            titulo="Status"
            vazioTexto="Nenhuma conta a receber no período selecionado."
            fatias={painel.distribuicao.map((d) => ({
              chave: d.situacao, rotulo: d.rotulo, valor: d.valor,
              quantidade: d.quantidade, fracao: d.fracao,
              cor: TOKEN_SITUACAO_RECEBER[d.situacao as SituacaoReceber],
            }))}
            info={{
              titulo: "Status",
              oQue: "A proporção entre o que já foi recebido, o que ainda vai vencer e o que está vencido no período.",
              comoCalcula:
                "Cada fatia é a parte do total das três situações somadas. O recebido conta pela data do recebimento; o aberto e o vencido, pelo vencimento.",
            }}
          />
        </div>
      ) : null}

      {recorte && <TitulosView direcao="receber" painel={recorte} />}
    </div>
  );
}
