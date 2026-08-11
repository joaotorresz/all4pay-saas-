"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAINEL DE CONTAS A RECEBER — o ciclo do dinheiro e a saúde da carteira.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A tela é irmã do painel de contas a pagar e usa o MESMO chrome
 * (`components/titulos/kit`). O que ela acrescenta são as três leituras que só
 * existem deste lado:
 *
 *  1. **A ponte venda × recebimento** — faturei, recebi e vou receber olham
 *     datas diferentes do mesmo negócio e NÃO se somam. É a parte que a fusão
 *     com o menu "Vender" trouxe, e a mais fácil de ler errado.
 *  2. **O envelhecimento** — de tudo que está atrasado, quanto é atraso velho.
 *  3. **A concentração** — quanto do que se tem a receber depende de um cliente
 *     só.
 *
 * ⚠️ **Duas escalas de tempo convivem nesta tela, e ela DIZ qual é qual.** Os
 * três cards e o calendário são o PERÍODO escolhido; o envelhecimento e a
 * exposição são a CARTEIRA inteira, sem recorte de tempo — um título vencido
 * desde junho continua sendo dívida em agosto, e uma tela de cobrança que o
 * esconde por causa do filtro esconde justamente o dinheiro que se está
 * perdendo. Sem o rótulo, os dois blocos pareceriam discordar.
 *
 * ⚠️ A tela não soma nada: tudo vem de `montarPainelContasReceber` e
 * `ponteVendaRecebimento` (regra de teto ZERO da ONDA 10).
 */
import * as React from "react";
import { Card, BRL, Icon, Skeleton } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { dataBR, pct, formatBRL } from "@/lib/format";
import {
  montarPainelContasReceber, ponteVendaRecebimento, opcoesDeFiltroReceber,
  periodoMes, periodoSemana, periodoPersonalizado, periodoInvalido,
  ROTULO_SITUACAO_RECEBER, TOKEN_SITUACAO_RECEBER,
  type Periodo, type TipoPeriodo, type CardContasReceber, type SituacaoReceber,
  type PainelContasReceber, type PonteVendaRecebimento,
} from "@/core/contas-receber";
import {
  FiltrosPeriodo, CardExpansivel, DistribuicaoDonut, FaixaDeDias,
  type CardDeTitulos, type ItemDoDia,
} from "@/components/titulos/kit";

/** O card do motor na forma neutra do kit. */
const paraKit = (c: CardContasReceber): CardDeTitulos => ({
  total: c.total,
  quantidade: c.quantidade,
  linhas: c.titulos.map((t) => ({ ...t, contraparte: t.cliente })),
});

export function DashboardContasReceber() {
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
  const ponte: PonteVendaRecebimento | null = React.useMemo(
    () => (input && filtro ? ponteVendaRecebimento(input, filtro) : null),
    [input, filtro],
  );

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
        titulo="Período das contas a receber"
        tipo={tipo} onTipo={setTipo}
        custom={custom} onCustom={setCustom}
        periodo={periodo} invalido={invalido}
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
      ) : painel && ponte ? (
        <>
          {ponte && <Ponte ponte={ponte} />}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <CardExpansivel
              titulo="Total recebido no período"
              dado={paraKit(painel.recebidoNoPeriodo)}
              cor={TOKEN_SITUACAO_RECEBER.recebido}
              rotuloData="Recebido em"
              info={{
                oQue: "O que já entrou na conta dentro do período escolhido.",
                comoCalcula:
                  "Soma das entradas de faturamento com situação 'pago' cuja DATA DE RECEBIMENTO cai no período. Transferência entre contas próprias, resgate e empréstimo não entram — ninguém os deve à empresa.",
              }}
            />
            <CardExpansivel
              titulo="Contas a vencer"
              dado={paraKit(painel.aVencer)}
              cor={TOKEN_SITUACAO_RECEBER.a_vencer}
              rotuloData="Vence em"
              info={{
                oQue: "O que ainda vai entrar: títulos em aberto com vencimento no período, de hoje em diante.",
                comoCalcula:
                  "Soma dos recebíveis em aberto com VENCIMENTO dentro do período e maior ou igual a hoje. O que vence hoje conta aqui, não em vencidas.",
              }}
            />
            <CardExpansivel
              titulo="Contas vencidas"
              dado={paraKit(painel.vencidas)}
              cor={TOKEN_SITUACAO_RECEBER.vencido}
              rotuloData="Venceu em"
              info={{
                oQue: "O que venceu dentro do período escolhido e o cliente ainda não pagou.",
                comoCalcula:
                  "Soma dos recebíveis em aberto com VENCIMENTO dentro do período e anterior a hoje. Para ver a dívida antiga inteira, o bloco de envelhecimento olha a carteira toda, sem recorte de tempo.",
              }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 items-start">
            <DistribuicaoDonut
              titulo="Distribuição por status"
              vazioTexto="Nenhuma conta a receber no período selecionado."
              fatias={painel.distribuicao.map((d) => ({
                chave: d.situacao, rotulo: d.rotulo, valor: d.valor,
                quantidade: d.quantidade, fracao: d.fracao,
                cor: TOKEN_SITUACAO_RECEBER[d.situacao as SituacaoReceber],
              }))}
              info={{
                titulo: "Distribuição por situação",
                oQue: "A proporção entre o que já foi recebido, o que ainda vai vencer e o que está vencido no período.",
                comoCalcula:
                  "Cada fatia é a parte do total das três situações somadas. É a única leitura em que somá-las faz sentido, porque a pergunta aqui é de proporção — os três cards acima nunca devem ser somados num total.",
              }}
            />
            <FaixaDeDias
              titulo="Calendário de contas a receber"
              rotuloPeriodo={periodo!.rotulo}
              hoje={hoje}
              vazioTexto="Nenhuma conta a receber no período selecionado."
              icone="arrow-up"
              truncado={painel.diasTruncados}
              dias={painel.dias.map((d) => ({
                data: d.data, quantidade: d.quantidade, ehHoje: d.ehHoje,
                cor: d.situacao ? TOKEN_SITUACAO_RECEBER[d.situacao] : null,
              }))}
              itensDoDia={itensDoDia}
              info={{
                titulo: "Calendário de contas a receber",
                oQue: "Em que dia cada recebimento do período cai.",
                comoCalcula:
                  "Cada dia soma o que VENCE nele (em aberto) e o que foi RECEBIDO nele. A cor do dia é a situação mais urgente que ele contém — um dia com nove recebidas e uma vencida aparece como vencida.",
              }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <Envelhecimento painel={painel} />
            <Exposicao painel={painel} />
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ========================================================================== */
/* A ponte: faturar não é receber                                              */
/* ========================================================================== */

function Ponte({ ponte }: { ponte: PonteVendaRecebimento }) {
  return (
    <Card
      className="flex flex-col gap-4"
      info={{
        titulo: "Faturado, recebido e a receber",
        oQue: "As três leituras do mesmo negócio, cada uma olhando uma data diferente.",
        comoCalcula:
          "Faturado usa a competência (o mês em que a venda aconteceu). Recebido usa a data do pagamento. A receber usa o vencimento dos títulos em aberto. Os três NÃO se somam: uma venda parcelada fatura uma vez e entra várias.",
      }}
    >
      <span className="text-h3 text-ink pr-8">Do que vendi ao que entrou</span>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Numero rotulo="Faturado no período" valor={ponte.faturado}
          detalhe="pela competência — quando a venda aconteceu" />
        <Numero rotulo="Recebido no período" valor={ponte.recebido}
          detalhe="pela data do pagamento — o caixa que entrou" />
        <Numero rotulo="A receber no período" valor={ponte.aReceber}
          detalhe="pelo vencimento — o que ainda vai entrar" />
      </div>

      <div className="rounded-card bg-surface-2 p-4 flex items-start gap-3">
        <Icon name="info" size={16} color="var(--color-muted)" />
        <div className="min-w-0">
          {/**
           * ⚠️ A conversão é AUSENTE quando não houve faturamento, não 0%.
           * "0% do que faturei já entrou" é uma frase sobre cobrança; "não
           * faturei" é uma frase sobre vendas, e as duas mandam fazer coisas
           * opostas. É a regra da ONDA 4 — o zero da ausência e o zero do
           * desastre não podem ser o mesmo pixel.
           */}
          <p className="m-0 text-caption text-ink">
            {ponte.conversaoEmCaixa === null ? (
              <>Nada foi faturado neste período — não há conversão a medir.</>
            ) : (
              <>
                <b>{pct(ponte.conversaoEmCaixa)}</b> do que foi faturado no período já virou caixa.
              </>
            )}
          </p>
          <p className="m-0 mt-1 text-caption text-muted">{ponte.explicacao}</p>
        </div>
      </div>
    </Card>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: number; detalhe: string }) {
  return (
    <div className="rounded-card bg-surface-2 p-4">
      <span className="block text-caption text-muted">{rotulo}</span>
      <span className="a4p-num block text-[22px] leading-none mt-2 text-ink">
        <BRL value={valor} showDecimals={false} />
      </span>
      <span className="block text-caption text-faint mt-2">{detalhe}</span>
    </div>
  );
}

/* ========================================================================== */
/* O envelhecimento                                                            */
/* ========================================================================== */

function Envelhecimento({ painel }: { painel: PainelContasReceber }) {
  const total = painel.carteira.vencido;
  return (
    <Card
      className="flex flex-col gap-3"
      info={{
        titulo: "Idade do atraso",
        oQue: "De tudo que está vencido, quanto é atraso recente e quanto é atraso velho.",
        comoCalcula:
          "Cada título vencido entra na faixa correspondente aos dias entre o vencimento e hoje. As faixas somam o VENCIDO da carteira inteira, sem recorte de período — um título de junho continua vencido em agosto.",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 pr-8">
        <span className="text-h3 text-ink">Idade do atraso</span>
        {/* ⚠️ O rótulo de escopo não é decoração: sem ele, este bloco e o card
            "Contas vencidas" acima parecem discordar, porque um é do período e
            o outro é da carteira. */}
        <span className="text-caption text-faint">carteira inteira</span>
      </div>

      {total === 0 ? (
        <p className="m-0 py-10 text-center text-body text-muted">
          Nada vencido. Toda a carteira está em dia.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="a4p-num text-[28px] leading-none text-negative">
              <BRL value={total} />
            </span>
            <span className="text-caption text-muted">vencido e não recebido</span>
          </div>

          <div className="mt-2 flex flex-col gap-3">
            {painel.envelhecimento.map((f) => (
              <div key={f.faixa} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-caption">
                  <span className="text-muted">
                    {f.rotulo}
                    <span className="text-faint"> · {f.quantidade}</span>
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="a4p-num text-faint tabular-nums">{pct(f.fracao)}</span>
                    <span className="a4p-num text-ink"><BRL value={f.valor} /></span>
                  </span>
                </div>
                {/* A barra usa a MESMA cor semântica em intensidades diferentes:
                    a paleta tem um acento só, e faixas de atraso são graus da
                    mesma coisa, não categorias distintas. */}
                <div className="h-2 rounded-pill bg-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-pill"
                    style={{
                      width: `${Math.max(f.fracao * 100, f.valor > 0 ? 2 : 0)}%`,
                      background: `color-mix(in srgb, var(--color-negative) ${40 + 20 * ORDEM_PESO[f.faixa]}%, var(--color-surface-3))`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/** Quanto mais velho o atraso, mais forte a barra. */
const ORDEM_PESO: Record<string, number> = {
  ate_30: 0, de_31_a_60: 1, de_61_a_90: 2, acima_90: 3,
};

/* ========================================================================== */
/* A concentração por cliente                                                  */
/* ========================================================================== */

function Exposicao({ painel }: { painel: PainelContasReceber }) {
  const { carteira, exposicao, concentracaoMaiorCliente } = painel;
  return (
    <Card
      className="flex flex-col gap-3"
      info={{
        titulo: "De quem é o que se tem a receber",
        oQue: "Quanto cada cliente deve, e quanto do total depende do maior deles.",
        comoCalcula:
          "Soma dos títulos em aberto (a vencer + vencidos) por cliente, sobre a carteira inteira. A concentração é a fatia do maior cliente sobre esse total.",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 pr-8">
        <span className="text-h3 text-ink">Exposição por cliente</span>
        <span className="text-caption text-faint">carteira inteira</span>
      </div>

      {carteira.emAberto === 0 ? (
        <p className="m-0 py-10 text-center text-body text-muted">
          Nenhum título em aberto.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div className="flex flex-col gap-1">
              <span className="a4p-num text-[28px] leading-none text-ink">
                <BRL value={carteira.emAberto} />
              </span>
              <span className="text-caption text-muted">
                em aberto · {carteira.titulos === 1 ? "1 título" : `${carteira.titulos} títulos`}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="a4p-num text-[22px] leading-none text-ink">
                {pct(concentracaoMaiorCliente)}
              </span>
              {/* ⚠️ A concentração é dita como RISCO, não como curiosidade:
                  R$ 100 mil de vinte clientes e de um só são o mesmo número e
                  situações diferentes — no segundo, um calote quebra o mês. */}
              <span className="text-caption text-muted">depende do maior cliente</span>
            </div>
          </div>

          <div className="mt-2 flex flex-col">
            {exposicao.map((e) => (
              <div key={e.cliente}
                className="flex items-center gap-3 py-2 border-b border-border-soft last:border-b-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-label text-ink truncate">{e.cliente}</span>
                  <span className="block text-caption text-faint">
                    {e.quantidade === 1 ? "1 título" : `${e.quantidade} títulos`}
                    {e.vencido > 0 && (
                      <> · <span className="text-negative">{formatBRL(e.vencido)} vencido</span></>
                    )}
                  </span>
                </span>
                <span className="a4p-num text-caption text-faint tabular-nums shrink-0">
                  {pct(e.fracao)}
                </span>
                <span className="a4p-num text-label text-ink shrink-0">
                  <BRL value={e.emAberto} />
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
