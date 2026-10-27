"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAINEL DE DESPESAS — o espelho do Painel de vendas, do lado de pagar.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido do dono (27/10/2026): quem aprendeu a Central de vendas tem de saber
 * usar a Central de despesas sem reaprender nada. Por isso a tela tem a MESMA
 * ordem do Painel de vendas — período e filtros, calendário (ou faixa mensal
 * com três meses ou mais) ao lado do status, os cards e a tabela dos títulos,
 * e a lista de documentos com as ações no fim (aqui, as COMPRAS, que são para
 * a despesa o que a venda é para a receita).
 *
 * ⚠️ Nada é recalculado aqui. Calendário e status saem de
 * `montarPainelContasPagar`; cards e tabela são a MESMA `TitulosView` com
 * `direcao="pagar"`; a lista é a MESMA `ComprasView`. O recorte dos filtros é
 * UMA regra (`passaNosFiltros` de `core/contas-pagar`), que desce pronta.
 *
 * ⚠️ Os blocos olham datas diferentes, como no de vendas: calendário e status
 * contam o PAGO pela data do pagamento e o aberto pelo vencimento; os cards e
 * a tabela recortam os títulos pelo VENCIMENTO.
 */
import * as React from "react";
import { Card, Skeleton } from "@/components/ui";
import {
  CarrosselSazonalidade, FaixaPeriodos, type Granularidade,
} from "@/components/movimentacoes/CarrosselSazonalidade";
import { periodosNoIntervalo, intervaloDeTresMeses } from "@/core/movimentacoes/periodos";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { dataBR } from "@/lib/format";
import {
  montarPainelContasPagar, opcoesDeFiltro, passaNosFiltros,
  periodoMes, periodoSemana, periodoPersonalizado, periodoInvalido,
  ROTULO_SITUACAO, TOKEN_SITUACAO,
  type Periodo, type TipoPeriodo, type Situacao, type PainelContasPagar, type FiltroContasPagar,
} from "@/core/contas-pagar";
import { FiltrosPeriodo, DistribuicaoDonut, FaixaDeDias, type ItemDoDia } from "@/components/titulos/kit";
import { TitulosView, type RecorteDoPainel } from "@/components/movimentacoes/TitulosView";
import { ComprasView } from "@/components/compras/ComprasView";
import type { RiskMovement } from "@/core/risk-engine/types";

const ROTULOS_PERIODO: Record<TipoPeriodo, string> = {
  mes: "Esse mês",
  semana: "Essa semana",
  personalizado: "Personalizado",
};

export function PainelDespesas() {
  const { data: input, isLoading } = useRiscoInput();
  const hoje = input?.hoje?.slice(0, 10) ?? "";

  const [tipo, setTipo] = React.useState<TipoPeriodo>("mes");
  const [custom, setCustom] = React.useState<{ de: string; ate: string }>({ de: "", ate: "" });
  const [projeto, setProjeto] = React.useState("");
  const [centro, setCentro] = React.useState("");
  const [fornecedor, setFornecedor] = React.useState("");

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
    () => (input ? opcoesDeFiltro(input) : { projetos: [], centros: [], fornecedores: [] }),
    [input],
  );

  const filtro: FiltroContasPagar | null = React.useMemo(
    () => (periodo && !invalido
      ? { de: periodo.de, ate: periodo.ate, projeto: projeto || null, centro: centro || null, fornecedor: fornecedor || null }
      : null),
    [periodo, invalido, projeto, centro, fornecedor],
  );

  const painel: PainelContasPagar | null = React.useMemo(
    () => (input && filtro ? montarPainelContasPagar(input, filtro) : null),
    [input, filtro],
  );

  // O recorte que desce para os cards e a tabela: mesmo período, mesmos
  // filtros, pela MESMA regra do motor de pagar.
  const recorte: RecorteDoPainel | null = React.useMemo(() => {
    if (!filtro || !periodo) return null;
    const nomes = input?.partyNames;
    const temFiltro = !!(filtro.projeto || filtro.centro || filtro.fornecedor);
    return {
      de: filtro.de, ate: filtro.ate, rotulo: periodo.rotulo,
      incluir: temFiltro ? (m: RiskMovement) => passaNosFiltros(m, filtro, nomes) : undefined,
    };
  }, [filtro, periodo, input]);

  // A faixa mensal: só com três meses ou mais no filtro (mesma regra de vendas).
  const mensal = !!filtro && intervaloDeTresMeses(filtro.de, filtro.ate);
  const [gran, setGran] = React.useState<Granularidade>("mes");
  const [selPeriodo, setSelPeriodo] = React.useState<string | null>(null);
  const periodos = React.useMemo(
    () => (mensal && filtro ? periodosNoIntervalo(input, filtro.de, filtro.ate, gran, "pagar", recorte?.incluir) : []),
    [mensal, filtro, input, gran, recorte],
  );
  React.useEffect(() => { setSelPeriodo(null); }, [filtro, gran]);

  const recorteDosCards: RecorteDoPainel | null = React.useMemo(() => {
    const p = selPeriodo ? periodos.find((x) => x.key === selPeriodo) : null;
    if (!recorte || !p) return recorte;
    return { ...recorte, de: p.de, ate: p.ate, rotulo: p.label };
  }, [recorte, periodos, selPeriodo]);

  const itensDoDia = React.useCallback((data: string): ItemDoDia[] => {
    if (!painel) return [];
    const todos: ItemDoDia[] = [
      ...painel.pagoNoPeriodo.contas.map((t) => ({ ...t, situacao: ROTULO_SITUACAO.pago })),
      ...painel.aVencer.contas.map((t) => ({ ...t, situacao: ROTULO_SITUACAO.a_vencer })),
      ...painel.atrasadas.contas.map((t) => ({ ...t, situacao: ROTULO_SITUACAO.atrasado })),
    ];
    return todos.filter((t) => t.data === data).sort((a, b) => b.valor - a.valor);
  }, [painel]);

  return (
    <div className="flex flex-col gap-6">
      <FiltrosPeriodo
        titulo="Período do painel de despesas"
        tipo={tipo} onTipo={setTipo}
        custom={custom} onCustom={setCustom}
        periodo={periodo} invalido={invalido}
        rotulos={ROTULOS_PERIODO}
        filtros={[
          { label: "Fornecedor", valor: fornecedor, onChange: setFornecedor, opcoes: opcoes.fornecedores,
            todos: "Todos os fornecedores", vazio: "Nenhum fornecedor nos títulos" },
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
          {mensal ? (
            <Card padded={false} info={{
              titulo: "Total a pagar por período",
              oQue: "O total a pagar de cada mês (ou semana) do período filtrado, para comparar os meses sem arrastar o calendário dia a dia.",
              comoCalcula: "Cada período soma os títulos a pagar com VENCIMENTO dentro dele, cortado nas datas e nos filtros de cima — o mesmo recorte dos cards abaixo. Cancelados ficam de fora. Escolher um período recorta os cards nele; escolher de novo desfaz.",
            }}>
              <CarrosselSazonalidade
                periodos={periodos} gran={gran} onGran={setGran} recarregarEm={filtro}
                titulo="Total a pagar por período"
              >
                <FaixaPeriodos
                  modo="total"
                  periodos={periodos} selKey={selPeriodo ?? undefined}
                  onSelect={(k) => setSelPeriodo((atual) => (atual === k ? null : k))}
                />
              </CarrosselSazonalidade>
            </Card>
          ) : (
            <FaixaDeDias
              titulo="Calendário de despesas"
              rotuloPeriodo={periodo!.rotulo}
              hoje={hoje}
              vazioTexto="Nenhuma despesa a pagar no período selecionado."
              icone="arrow-down"
              truncado={painel.diasTruncados}
              dias={painel.dias.map((d) => ({
                data: d.data, quantidade: d.quantidade, ehHoje: d.ehHoje,
                cor: d.situacao ? TOKEN_SITUACAO[d.situacao] : null,
              }))}
              itensDoDia={itensDoDia}
              info={{
                titulo: "Calendário de despesas",
                oQue: "Em que dia cada pagamento do período cai.",
                comoCalcula:
                  "Cada dia soma o que VENCE nele (em aberto) e o que foi PAGO nele. A cor do dia é a situação mais urgente que ele contém — um dia com nove pagas e uma vencida aparece como vencida.",
              }}
            />
          )}
          <DistribuicaoDonut
            variante="aneis"
            titulo="Status"
            vazioTexto="Nenhuma conta a pagar no período selecionado."
            fatias={painel.distribuicao.map((d) => ({
              chave: d.situacao, rotulo: d.rotulo, valor: d.valor,
              quantidade: d.quantidade, fracao: d.fracao,
              cor: TOKEN_SITUACAO[d.situacao as Situacao],
            }))}
            info={{
              titulo: "Status",
              oQue: "A proporção entre o que já foi pago, o que ainda vai vencer e o que está vencido no período.",
              comoCalcula:
                "Cada fatia é a parte do total das três situações somadas. O pago conta pela data do pagamento; o aberto e o vencido, pelo vencimento.",
            }}
          />
        </div>
      ) : null}

      {recorteDosCards && <TitulosView direcao="pagar" painel={recorteDosCards} />}

      {/* ⚠️ A LISTA DE COMPRAS mora aqui (27/10/2026), no lugar em que o Painel
          de vendas tem a lista de vendas: o pedido de compra é o documento que
          origina a despesa. É o MESMO componente da tela Compras, que responde
          308 para cá — Nova compra, aprovar, reprovar, exportar e excluir vieram
          inteiros. */}
      <section className="flex flex-col gap-3" aria-label="Compras">
        <h2 className="text-h2 m-0">Compras</h2>
        <ComprasView />
      </section>
    </div>
  );
}
