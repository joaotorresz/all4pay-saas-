"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAINEL DE CONTAS A PAGAR — os filtros, os três cards, a distribuição e o
 * calendário.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **A tela não soma nada.** Todo número sai de `montarPainelContasPagar`
 * (`core/contas-pagar`) — regra de teto ZERO da ONDA 10. O componente escolhe
 * o recorte e desenha; a aritmética mora no motor, junto com as convenções de
 * sinal, de liquidação e de data que o resto do sistema já usa.
 *
 * ⚠️ **Os três cards NÃO somam entre si**, e é por isso que não existe um
 * "total geral" acima deles: pago olha a data de pagamento (caixa que saiu), a
 * vencer e vencidas olham a data de vencimento (caixa que vai sair). O gráfico
 * de distribuição existe para dar a PROPORÇÃO sem sugerir a soma.
 *
 * ⚠️ **O chrome vem de `components/titulos/kit`**, compartilhado com o painel
 * de contas a RECEBER. As quatro peças eram daqui e foram extraídas quando o
 * outro lado nasceu — copiá-las faria as duas telas divergirem no primeiro
 * ajuste, e quando isso acontece com um calendário quem opera precisa
 * reaprender a leitura ao trocar de lado.
 */
import * as React from "react";
import { Card, Skeleton } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { dataBR } from "@/lib/format";
import {
  montarPainelContasPagar, opcoesDeFiltro,
  periodoMes, periodoSemana, periodoPersonalizado, periodoInvalido,
  ROTULO_SITUACAO, TOKEN_SITUACAO,
  type Periodo, type TipoPeriodo, type CardContasPagar, type Situacao,
  type PainelContasPagar,
} from "@/core/contas-pagar";
import {
  FiltrosPeriodo, CardExpansivel, DistribuicaoDonut, FaixaDeDias,
  type CardDeTitulos, type ItemDoDia,
} from "@/components/titulos/kit";

/** O card do motor na forma neutra do kit. */
const paraKit = (c: CardContasPagar): CardDeTitulos => ({
  total: c.total, quantidade: c.quantidade, linhas: c.contas,
});

export function DashboardContasPagar() {
  const { data: input, isLoading } = useRiscoInput();

  /**
   * ⚠️ O "hoje" vem do `RiskInput`, nunca de `new Date()` dentro do componente.
   * O motor inteiro é sem relógio de propósito (ONDA 1) — ler a data aqui faria
   * a tela e o motor discordarem sobre o que está vencido no exato minuto da
   * virada do dia, e é o servidor que decide qual é o dia.
   */
  const hoje = input?.hoje?.slice(0, 10) ?? "";

  const [tipo, setTipo] = React.useState<TipoPeriodo>("mes");
  const [custom, setCustom] = React.useState<{ de: string; ate: string }>({ de: "", ate: "" });
  const [projeto, setProjeto] = React.useState("");
  const [centro, setCentro] = React.useState("");

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
    () => (input ? opcoesDeFiltro(input) : { projetos: [], centros: [] }),
    [input],
  );

  const painel: PainelContasPagar | null = React.useMemo(() => {
    if (!input || !periodo || invalido) return null;
    return montarPainelContasPagar(input, {
      de: periodo.de, ate: periodo.ate,
      projeto: projeto || null, centro: centro || null,
    });
  }, [input, periodo, invalido, projeto, centro]);

  const itensDoDia = React.useCallback((data: string): ItemDoDia[] => {
    if (!painel) return [];
    const todas: ItemDoDia[] = [
      ...painel.pagoNoPeriodo.contas.map((c) => ({ ...c, situacao: ROTULO_SITUACAO.pago })),
      ...painel.aVencer.contas.map((c) => ({ ...c, situacao: ROTULO_SITUACAO.a_vencer })),
      ...painel.atrasadas.contas.map((c) => ({ ...c, situacao: ROTULO_SITUACAO.atrasado })),
    ];
    return todas.filter((c) => c.data === data).sort((a, b) => b.valor - a.valor);
  }, [painel]);

  return (
    <div className="flex flex-col gap-6">
      <FiltrosPeriodo
        titulo="Período das contas a pagar"
        tipo={tipo} onTipo={setTipo}
        custom={custom} onCustom={setCustom}
        periodo={periodo} invalido={invalido}
        filtros={[
          { label: "Projeto", valor: projeto, onChange: setProjeto, opcoes: opcoes.projetos,
            todos: "Todos os projetos", vazio: "Nenhum projeto nos títulos" },
          { label: "Centro de custo", valor: centro, onChange: setCentro, opcoes: opcoes.centros,
            todos: "Todos os centros de custo", vazio: "Nenhum centro nos títulos" },
        ]}
      />

      {/* ⚠️ **O PAINEL DIZ O QUE CONTA**, pela mesma razão da tela de títulos:
          ele soma títulos que EXISTEM. A projeção de contas recorrentes soma o
          compromisso da REGRA, inclusive onde ainda não há título — e enquanto
          a materialização não roda, os dois números do mesmo mês ficam bem
          distantes. Uma frase evita a pergunta "qual dos dois está certo". */}
      <p className="m-0 -mt-1 text-caption text-muted max-w-[70ch]">
        Soma os títulos <b className="text-ink">já lançados</b> no período. O que ainda
        vai vencer por contrato, e ainda não virou título, aparece em Contas recorrentes.
      </p>

      {invalido && (
        <Card className="border border-warning/40">
          <p className="m-0 text-body text-ink">
            A data inicial é posterior à final. Corrija o intervalo — nenhum
            período existe entre {dataBR(periodo!.de)} e {dataBR(periodo!.ate)}.
          </p>
        </Card>
      )}

      {isLoading || (!painel && !invalido) ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((k) => <Skeleton key={k} className="h-[136px]" />)}
        </div>
      ) : painel ? (
        <>
          {/* ⚠️ `items-start`: sem isso, abrir a relação de UM card estica os
              outros dois até a mesma altura e a tela ganha dois retângulos
              brancos vazios do tamanho da lista aberta. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <CardExpansivel
              titulo="Total geral pago no período"
              dado={paraKit(painel.pagoNoPeriodo)}
              cor={TOKEN_SITUACAO.pago}
              rotuloData="Pago em"
              info={{
                oQue: "O que já saiu da conta dentro do período escolhido.",
                comoCalcula:
                  "Soma das saídas com situação 'pago' cuja DATA DE PAGAMENTO cai no período. Canceladas ficam de fora.",
              }}
            />
            <CardExpansivel
              titulo="Contas a vencer"
              dado={paraKit(painel.aVencer)}
              cor={TOKEN_SITUACAO.a_vencer}
              rotuloData="Vence em"
              info={{
                oQue: "O que ainda vai sair: títulos em aberto com vencimento no período, de hoje em diante.",
                comoCalcula:
                  "Soma das saídas em aberto com VENCIMENTO dentro do período e maior ou igual a hoje. O que vence hoje conta aqui, não em vencidas.",
              }}
            />
            <CardExpansivel
              titulo="Contas atrasadas"
              dado={paraKit(painel.atrasadas)}
              cor={TOKEN_SITUACAO.atrasado}
              rotuloData="Venceu em"
              info={{
                oQue: "O que já venceu e continua em aberto dentro do período escolhido.",
                comoCalcula:
                  "Soma das saídas em aberto com VENCIMENTO dentro do período e anterior a hoje.",
              }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 items-start">
            <DistribuicaoDonut
              titulo="Distribuição por status"
              vazioTexto="Nenhuma conta a pagar no período selecionado."
              fatias={painel.distribuicao.map((d) => ({
                chave: d.situacao, rotulo: d.rotulo, valor: d.valor,
                quantidade: d.quantidade, fracao: d.fracao,
                cor: TOKEN_SITUACAO[d.situacao as Situacao],
              }))}
              info={{
                titulo: "Distribuição por situação",
                oQue: "A proporção entre o que já foi pago, o que ainda vai vencer e o que está vencido no período.",
                comoCalcula:
                  "Cada fatia é a parte do total das três situações somadas. É a única leitura em que somá-las faz sentido, porque a pergunta aqui é de proporção — os três cards acima nunca devem ser somados num total.",
              }}
            />
            <FaixaDeDias
              titulo="Calendário de contas a pagar"
              rotuloPeriodo={periodo!.rotulo}
              hoje={hoje}
              vazioTexto="Nenhuma conta a pagar no período selecionado."
              icone="arrow-down"
              truncado={painel.diasTruncados}
              dias={painel.dias.map((d) => ({
                data: d.data, quantidade: d.quantidade, ehHoje: d.ehHoje,
                cor: d.situacao ? TOKEN_SITUACAO[d.situacao] : null,
              }))}
              itensDoDia={itensDoDia}
              info={{
                titulo: "Calendário de contas a pagar",
                oQue: "Em que dia cada obrigação do período cai.",
                comoCalcula:
                  "Cada dia soma o que VENCE nele (em aberto) e o que foi PAGO nele. A cor do dia é a situação mais urgente que ele contém — um dia com nove pagas e uma vencida aparece como vencida.",
              }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
