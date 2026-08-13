"use client";

/**
 * DRE e DFC — a MESMA tela em dois regimes.
 *
 * A DRE é competência (quando o fato aconteceu) e a DFC é caixa (quando o
 * dinheiro andou), começando pelo Saldo Inicial. Fora isso, filtros, layout,
 * drill-down e exportação são idênticos — então é um componente só com
 * `tipo`. Duplicar daria duas telas que divergem na primeira regra nova.
 */
import * as React from "react";
import { formatBRL } from "@/lib/format";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Cell,
} from "recharts";
import { Card, Skeleton, Select, Icon, ValorIndicador, type FormatoValor } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { chartAnim } from "@/lib/chart-anim";
import {
  montarDRE, montarDFC, rotuloColuna, compararOrcamento,
  ESTRUTURA_DRE, ESTRUTURA_DFC, type Relatorio,
} from "@/core/relatorios";
import { orcadoPorLinha, cobertura, resumoOrcamento, type Orcamento } from "@/core/orcamento";
import { listarOrcamentos } from "@/lib/orcamentos";
import { linhasDeCategoria } from "@/lib/registros";
import { dreGerencial, movimentosNoPeriodo } from "@/core/dre/engine";
import { runwayMeses, saldo } from "@/core/indicadores";
import { cascataDRE } from "@/core/relatorios/cascata";
import type { RiskInput } from "@/core/risk-engine/types";
import {
  FiltrosRelatorio, PainelLayout, TabelaRelatorio, GavetaTransacoes, BotoesExportar,
  filtroPadrao, LAYOUT_PADRAO, temaPorId,
  type FiltrosRelatorioValor, type LayoutTabela, type CelulaClicada,
} from "./kit";

/**
 * ⚠️ **UM FORMATADOR SÓ, COM CENTAVOS.** Este arredondava para INTEIRO, e por
 * isso a Visão geral escrevia "R$2" onde o extrato e o DRE escreviam "R$1,54".
 * O cartão "Custo fixo R$2, −64,2%" só fecha com o valor real: a variação é
 * calculada sobre 1,54 e exibida ao lado de um 2 — duas grandezas na mesma
 * frase, uma delas arredondada, e quem confere conclui que a conta está errada.
 *
 * Abreviação (k, mi) continua permitida SÓ em eixo de gráfico, onde o rótulo
 * não cabe — e o tooltip mostra o valor cheio.
 */
const brl0 = (n: number) => formatBRL(n);
const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function DemonstrativoView({ tipo }: { tipo: "dre" | "dfc" }) {
  const { data: input, isLoading } = useRiscoInput();
  const [rascunho, setRascunho] = React.useState<FiltrosRelatorioValor>(filtroPadrao);
  // Os filtros só valem depois de "Atualizar" — o print tem o botão, e um
  // relatório que se recalcula a cada tecla pisca sem parar.
  const [aplicados, setAplicados] = React.useState<FiltrosRelatorioValor>(filtroPadrao);
  const [layout, setLayout] = React.useState<LayoutTabela>(LAYOUT_PADRAO);
  const [celula, setCelula] = React.useState<CelulaClicada | null>(null);
  const [orcamentoId, setOrcamentoId] = React.useState("");
  // A lista vem do localStorage → só depois de montar (hidratação).
  const [orcamentos, setOrcamentos] = React.useState<Orcamento[]>([]);
  React.useEffect(() => { setOrcamentos(listarOrcamentos()); }, []);
  // ⚠️ A linha declarada de cada categoria — sai do plano de contas da empresa
  // e VENCE a classificação por palavra-chave dentro do motor. Lido no efeito
  // (não no render) porque a fonte é o cache local, e ler no render quebra a
  // hidratação.
  const [linhaPorCategoria, setLinhaPorCategoria] = React.useState<Record<string, string>>({});
  React.useEffect(() => { setLinhaPorCategoria(linhasDeCategoria()); }, []);

  const relatorio: Relatorio | null = React.useMemo(() => {
    if (!input) return null;
    const f = {
      intervalo: aplicados.intervalo, tipo: aplicados.tipo,
      conta: aplicados.conta, projeto: aplicados.projeto, centro: aplicados.centro,
      linhaPorCategoria,
    };
    return tipo === "dre" ? montarDRE(input, f) : montarDFC(input, f);
  }, [input, aplicados, tipo, linhaPorCategoria]);

  const nomeArquivo = tipo === "dre" ? "dre" : "dfc";

  /**
   * Só orçamentos do MESMO regime aparecem: comparar um orçamento de caixa com
   * a DRE (competência) confrontaria coisas diferentes e o desvio não diria
   * nada. É a mesma razão pela qual o cadastro pede o regime.
   */
  const regimeAlvo = tipo === "dre" ? "competencia" : "caixa";
  const elegiveis = React.useMemo(
    () => orcamentos.filter((o) => o.regime === regimeAlvo),
    [orcamentos, regimeAlvo],
  );
  const escolhido = elegiveis.find((o) => o.id === orcamentoId) ?? null;

  const comparacao = React.useMemo(() => {
    if (!relatorio || !escolhido) return undefined;
    const estrutura = tipo === "dre" ? ESTRUTURA_DRE : ESTRUTURA_DFC;
    return compararOrcamento(relatorio, orcadoPorLinha(escolhido, estrutura, relatorio.colunas));
  }, [relatorio, escolhido, tipo]);

  const cob = relatorio && escolhido ? cobertura(escolhido, relatorio.colunas) : null;

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted">
          {tipo === "dre"
            ? "Demonstração do Resultado do Exercício. Clique em qualquer célula para ver as transações."
            : "Demonstração do Fluxo de Caixa. Clique em qualquer célula para ver as transações."}
        </p>
        {relatorio && <BotoesExportar nome={nomeArquivo} relatorio={relatorio} layout={layout} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 items-start">
        <FiltrosRelatorio
          valor={rascunho}
          onChange={setRascunho}
          onAtualizar={() => setAplicados(rascunho)}
        />
        <Card>
          <span className="text-h3 font-semibold text-ink">Comparar com orçamento</span>
          <p className="m-0 mt-2 text-caption text-muted">
            Selecione um orçamento para comparar previsto vs realizado. Novas colunas
            (Orçado / Diferença / %) aparecem ao lado de cada período.
          </p>
          <div className="flex flex-col gap-[6px] mt-4">
            {/* O rótulo estava na tela e NÃO no campo: `label` sem `htmlFor` é
                texto solto para quem usa leitor de tela. Passar pelo componente
                associa os dois. */}
            <Select
              label="Orçamento"
              value={orcamentoId}
              onChange={setOrcamentoId}
              options={[
                { value: "", label: elegiveis.length ? "Nenhum (só realizado)" : "Nenhum orçamento de " + (tipo === "dre" ? "competência" : "caixa") },
                ...elegiveis.map((o) => ({ value: o.id, label: `${o.nome} · ${o.periodo.de.slice(0, 4)}` })),
              ]}
              disabled={elegiveis.length === 0}
            />
            {elegiveis.length === 0 ? (
              <span className="text-caption text-faint">
                Cadastre um orçamento de {tipo === "dre" ? "competência" : "caixa"} em Cadastros › Orçamento.
              </span>
            ) : escolhido ? (
              <div className="flex flex-col gap-1 mt-1">
                <span className="text-caption text-muted tabular-nums">
                  Receita prevista {fmtBRL(resumoOrcamento(escolhido).receita)} · Despesa {fmtBRL(resumoOrcamento(escolhido).despesa)}
                </span>
                {/* Um orçamento que não cobre a janela toda produziria "realizado
                    sem previsto" sem o usuário entender por quê. */}
                {cob && cob.cobertos < cob.total && (
                  <span className="text-caption text-warning">
                    O orçamento cobre {cob.cobertos} de {cob.total} meses do período — os demais aparecem sem previsto.
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      {/* ⚠️ PORTE do `/dre` (mapa de consolidação, item 3): os cartões
          executivos. São a leitura de dez segundos — sem eles, responder "a
          empresa deu lucro?" exige ler a cascata inteira. Os números saem dos
          MESMOS motores (`dreGerencial` + `core/indicadores`), não de uma conta
          paralela. */}
      {tipo === "dre" && input && <CartoesExecutivos input={input} intervalo={aplicados.intervalo} />}

      <PainelLayout layout={layout} onChange={setLayout} />

      {isLoading || !relatorio ? (
        <Card><Skeleton className="h-[380px]" /></Card>
      ) : relatorio.colunas.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <Icon name="triangle-alert" size={20} color="var(--color-warning)" />
            <p className="m-0 text-label text-muted max-w-[46ch]">
              O período selecionado não cobre nenhum mês. Verifique se a data final é posterior à inicial.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {layout.mostrarGrafico && <GraficoResultado relatorio={relatorio} tipo={tipo} tema={layout.tema} />}
          <TabelaRelatorio relatorio={relatorio} layout={layout} onCelula={setCelula} orcamento={comparacao} />
        </>
      )}

      {celula && <GavetaTransacoes celula={celula} onFechar={() => setCelula(null)} />}
    </div>
  );
}

/* -------------------------------- gráfico -------------------------------- */

/** A leitura visual da cascata: a linha do resultado sobre as barras do mês. */
function GraficoResultado({
  relatorio, tipo, tema,
}: { relatorio: Relatorio; tipo: "dre" | "dfc"; tema: string }) {
  const t = temaPorId(tema);
  const idBarra = tipo === "dre" ? "receita_bruta" : "entradas_operacionais";
  const idLinha = tipo === "dre" ? "resultado_liquido" : "saldo_final";
  const barra = relatorio.linhas.find((l) => l.id === idBarra);
  const linha = relatorio.linhas.find((l) => l.id === idLinha);

  const dados = relatorio.colunas.map((c, k) => ({
    label: rotuloColuna(c),
    base: barra?.celulas[k]?.valor ?? 0,
    resultado: linha?.celulas[k]?.valor ?? 0,
  }));

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <span className="text-h3 font-semibold text-ink">
          {tipo === "dre" ? "Receita bruta e resultado líquido" : "Entradas e saldo final"}
        </span>
        <span className="text-caption text-faint">{relatorio.colunas.length} meses</span>
      </div>
      <div className="h-[260px] -ml-2" role="img" aria-label="Evolução do resultado no período">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dados} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd"
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
            <YAxis tickLine={false} axisLine={false} width={58}
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
              tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} />
            <Tooltip formatter={(v: number) => brl0(v)} cursor={{ fill: "var(--color-surface-2)" }}
              contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", background: "var(--color-white)", fontSize: 13 }} />
            <Bar dataKey="base" name={tipo === "dre" ? "Receita bruta" : "Entradas"} radius={[4, 4, 0, 0]} {...chartAnim()}>
              {dados.map((_, k) => <Cell key={k} fill={`color-mix(in srgb, ${t.base} 55%, transparent)`} />)}
            </Bar>
            {/* Resultado negativo é informação, não erro: a linha muda de cor
                pelo sinal do último ponto para a leitura ser imediata. */}
            <Line
              type="monotone" dataKey="resultado" name={tipo === "dre" ? "Resultado líquido" : "Saldo final"}
              stroke={(dados.at(-1)?.resultado ?? 0) < 0 ? "var(--color-negative)" : "var(--color-lime)"}
              strokeWidth={1.6} dot={false} activeDot={{ r: 4 }} {...chartAnim(120)}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** Reexporta para as telas multiempresa, que reaproveitam a comparação. */
export { compararOrcamento };

/**
 * Os cartões de dez segundos: EBITDA, margem, lucro líquido, runway e caixa.
 *
 * ⚠️ Portados do `/dre` (mapa, item 3). Todos saem dos motores canônicos —
 * `dreGerencial` para a cascata e `core/indicadores` para runway e saldo —, e
 * não de uma conta própria: um cartão que discorda da tabela logo abaixo é
 * pior que cartão nenhum.
 */
function CartoesExecutivos({ input, intervalo }: { input: RiskInput; intervalo: { de: string; ate: string } }) {
  // ⚠️ Os seis chegam INTEIROS, como `Indicador`: `number` não sabe dizer que
  // não sabe — não porque a aritmética mudasse (ela é conferida par a par
  // na matriz de consistência), mas porque `number` não sabe dizer que não
  // sabe. "EBITDA de R$ 0" e "não houve lançamento no período" saíam idênticos
  // de um `number`, num cartão executivo, que é onde a leitura de relance vira
  // decisão.
  /**
   * ⚠️ **OS CARTÕES LEEM A MESMA CASCATA QUE A TABELA.** Eles saíam de
   * `painelResultado`, uma segunda agregação — e as duas discordavam: a base
   * dos cartões somava TODA entrada em `receita`, inclusive a financeira, e
   * Receita Líquida e EBITDA vinham inflados pelo valor exato dos juros do
   * período. Medido injetando R$ 500.000 de juros numa base real: divergência
   * de R$ 500.000,00 nos dois cartões.
   *
   * Agora não há duas contas: `cascataDRE` roda `montarRelatorio` sobre
   * `ESTRUTURA_DRE` — a MESMA chamada que desenha a tabela logo abaixo — e os
   * cartões leem as linhas dela. Divergir deixou de ser possível, em vez de
   * deixar de acontecer.
   */
  const m = React.useMemo(() => {
    const c = cascataDRE(input, { intervalo });
    return {
      receitaLiquida: c.linhas.receita_liquida,
      ebitda: c.linhas.ebitda,
      margem: c.margemEbitda,
      lucro: c.linhas.resultado_liquido,
      runway: runwayMeses(input),
      caixa: saldo(input),
    };
  }, [input, intervalo]);

  /**
   * A cor do prejuízo.
   *
   * ⚠️ **Todo cartão de valor recebe `tomDe`**, não só alguns. Receita líquida e
   * Margem EBITDA ficavam de fora: uma margem de −285% saía em tinta neutra, do
   * mesmo tom de uma margem saudável, e quem passa o olho lê "está tudo bem".
   * O sinal sozinho não resolve — o `−` tem dois caracteres de largura numa
   * tela que a pessoa varre em um segundo.
   *
   * ⚠️ O positivo NÃO fica verde por padrão (`bom = false`): pintar todo número
   * positivo de verde gasta a cor e faz o vermelho perder força justamente onde
   * ele precisa ter. Verde só onde "positivo" é a notícia — o lucro.
   */
  const tomDe = (i: { valor: number; indisponivel?: unknown }, bom = false) =>
    i.indisponivel ? undefined
      : i.valor < 0 ? "var(--color-negative)"
      : bom ? "var(--color-positive)" : undefined;

  const cartoes: {
    label: string; indicador: typeof m.ebitda; formato: FormatoValor; tom?: string;
  }[] = [
    { label: "Receita líquida", indicador: m.receitaLiquida, formato: "moeda", tom: tomDe(m.receitaLiquida) },
    { label: "EBITDA", indicador: m.ebitda, formato: "moeda", tom: tomDe(m.ebitda) },
    // ⚠️ A margem é o cartão mais perigoso da tela: "0%" lê como "vendeu e não
    // sobrou nada" quando a verdade pode ser "não vendeu", e as duas leituras
    // mandam cortar custo × vender. O indicador declara a ausência de base.
    { label: "Margem EBITDA", indicador: m.margem, formato: "percentual", tom: tomDe(m.margem) },
    { label: "Lucro líquido", indicador: m.lucro, formato: "moeda", tom: tomDe(m.lucro, true) },
    { label: "Runway", indicador: m.runway, formato: "meses" },
    { label: "Caixa", indicador: m.caixa, formato: "moeda", tom: tomDe(m.caixa) },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
      {cartoes.map((c) => (
        <Card key={c.label} className="flex flex-col gap-1">
          <span className="text-caption text-faint">{c.label}</span>
          {/* A origem a um clique: fórmula, período, regime e os lançamentos
              que compõem o número — no próprio número. */}
          <span className="text-[20px] font-semibold tabular-nums" style={{ color: c.tom ?? "var(--color-ink)" }}>
            <ValorIndicador indicador={c.indicador} titulo={c.label} formato={c.formato} />
          </span>
        </Card>
      ))}
    </div>
  );
}
