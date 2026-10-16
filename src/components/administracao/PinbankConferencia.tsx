"use client";

/**
 * Conferência com o extrato da Pinbank — o bloco do cartão da maquininha, em
 * Integrações. Só quem ADMINISTRA a empresa o vê (a rota confere de novo).
 *
 * Pede à rota a conferência de UM período (até 31 dias) e desenha o relatório
 * que o motor puro devolveu (`core/pinbank/conferencia`). A tela NÃO soma nada:
 * o resumo vem pronto do motor, que o calcula na mesma passada que monta a
 * lista — o cartão e a tabela não têm como discordar.
 *
 * ⚠️ A TAXA da Pinbank é o MDR em PERCENTUAL (confirmado pela Pinbank em
 * 13/10/2026): aparece como percentual, nunca como dinheiro, e o motor a
 * compara com a taxa cadastrada na maquininha. A ANTECIPAÇÃO (o `ValorTaxaMes`,
 * percentual ao mês) também é percentual, e é comparada com a contratada. O
 * LÍQUIDO é o que a Pinbank deposita (extrato de produção, 14/10/2026): esse é
 * dinheiro, e a conferência o compara por VENDA com o que o sistema lançou.
 * Bruto da parcela e split seguem "aguardando definição": nenhum deles passa
 * pelo tratamento de dinheiro (`BRL`).
 *
 * ⚠️ A taxa sai com DUAS casas, e não com a uma casa da regra geral de
 * percentual: a taxa contratada tem duas casas (2,65%) e o motor acusa como
 * diferente 0,01 ponto percentual a mais — 1,99% contratado e 2,00% no extrato
 * é "taxa diferente", e com uma casa os dois sairiam "2,0%" ao lado dela. O
 * formatador é o mesmo (`pctDeInteiro`).
 *
 * ⚠️ SEM NENHUMA VENDA EM COMUM ATESTADA pelo aviso da Pinbank a rota devolve
 * só as CONTAGENS de cada lado (`soContagens`): o código do estabelecimento é
 * digitado pela plataforma, e um código errado é o extrato de outra loja. Nesse
 * caso a resposta nem traz situação, soma do extrato ou taxa (nada que cruze os
 * dois lados — a empresa grava títulos e a taxa cadastrada, e cruzar seria um
 * oráculo sobre a loja alheia): a tela mostra a frase da rota, a explicação da
 * numeração e do código do estabelecimento, quantas linhas há no extrato e
 * quantas parcelas válidas no sistema — com o "i" do que cada lado conta — e
 * nenhuma linha.
 *
 * ⚠️ POR ISSO O RELATÓRIO INTEIRO É SEMPRE "conferido". Ele só chega com uma
 * venda em comum atestada (ou com nada dos dois lados), e isso exclui a
 * "numeração não confirmada" e o "extrato sem vendas desta maquininha": esses
 * dois estados chegam à empresa como "Só as quantidades". A tela não desenha
 * selo para um estado que não chega — o aviso do motor, se um dia vier, sai na
 * lista de avisos como qualquer outro.
 *
 * ⚠️ O motivo no lugar de um valor ausente é o VERDADEIRO: o lado que não existe
 * ("ausente do extrato") não é o valor que a Pinbank não mandou ("não informado
 * pela Pinbank"). "Não se aplica" para tudo diria a mesma coisa de casos que
 * mandam a pessoa fazer coisas diferentes.
 *
 * ⚠️ Nada aqui grava. O rodapé diz isso a cada conferência.
 */
import * as React from "react";
import { Button, DateField, InfoHint, StatusBadge, BRL, SemDados } from "@/components/ui";
import { conferirComExtrato, type ResultadoConferencia, type VinculoTela } from "@/lib/pinbank/cliente";
import {
  ESPERA_CONFERENCIA_MS,
  GRUPO_DO_STATUS,
  ORDEM_RESULTADO_ANTECIPACAO,
  ORDEM_RESULTADO_TAXA,
  ORDEM_STATUS,
  ROTULO_RESULTADO_ANTECIPACAO,
  ROTULO_RESULTADO_TAXA,
  ROTULO_STATUS,
  TOLERANCIA_TAXA_BP,
  TOM_DO_STATUS,
  esperaDoBotao,
  itemComDivergencia,
  problemasDoPeriodoExtratoPos,
  somaDias,
  soContagens,
  type GrupoConferencia,
  type ItemConferencia,
  type RelatorioCompleto,
  type RelatorioConferencia,
  type RelatorioParaEmpresa,
  type RelatorioSoContagens,
  type ResultadoAntecipacao,
  type ResultadoTaxa,
  type SinalConferencia,
} from "@/core/pinbank";
import { somaMeses } from "@/core/vendas/pos";
import { comSinal, dataBR, decimalBR, pctDeInteiro } from "@/lib/format";

const POR_PAGINA = 50;
/** Os códigos que tornam a conferência indisponível nesta sessão (a liberação é da plataforma). */
const INDISPONIVEL = new Set(["desligada", "ambiente_teste", "sem_configuracao"]);

/** Indisponível vale para a SESSÃO: o cartão remonta ao salvar a maquininha, e o motivo não muda com isso. */
let indisponivelNaSessao: string | null = null;

const hojeEmSaoPaulo = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const mesPassado = (hoje: string) => {
  const primeiro = `${hoje.slice(0, 7)}-01`;
  return { de: somaMeses(primeiro, -1), ate: somaDias(primeiro, -1) };
};
const ultimos30 = (hoje: string) => ({ de: somaDias(hoje, -30), ate: somaDias(hoje, -1) });

// `consultadoEm` é um INSTANTE: aqui o `Date` é o certo, no fuso de quem opera.
const FMT_INSTANTE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

const GRUPOS_RESUMO: { id: GrupoConferencia; rotulo: string }[] = [
  { id: "conferidas", rotulo: "Conferidas" },
  { id: "divergencias", rotulo: "Divergências" },
  { id: "semConclusao", rotulo: "Sem conclusão" },
];
const ABAS: { id: GrupoConferencia; rotulo: string }[] = [
  { id: "divergencias", rotulo: "Divergências" },
  { id: "semConclusao", rotulo: "Sem conclusão" },
  { id: "conferidas", rotulo: "Conferidas" },
];

const ROTULO_SINAL: Record<SinalConferencia, string> = {
  dia_util: "Repasse no dia útil seguinte",
  parcelas_diferentes: "Número de parcelas diferente nos dois lados",
  reembolso_parcial: "Venda com estorno parcial",
  valor_nao_comparado: "Valor bruto não comparado",
  dia_da_venda_diferente: "Dia da venda diferente nos dois lados",
  recebido_no_sistema: "O sistema já deu o repasse como recebido",
  taxa_sem_titulo_no_sistema: "O extrato cobrou a taxa e o sistema não lançou o título dela",
  total_da_venda_igual: "Total bruto da venda igual nos dois lados",
  total_da_venda_diferente: "Total bruto da venda diferente nos dois lados",
  liquido_da_venda_igual: "Líquido da venda igual nos dois lados",
  liquido_da_venda_diferente: "Líquido da venda diferente nos dois lados",
};

/** O selo da taxa: diferente pede atenção; igual confere; o resto é neutro (não é divergência). */
const TOM_DA_TAXA: Record<ResultadoTaxa, "positive" | "warning" | "neutral"> = {
  diferente: "warning",
  igual: "positive",
  sem_contrato: "neutral",
  sem_extrato: "neutral",
  tipo_desconhecido: "neutral",
  sem_conclusao: "neutral",
  outra_maquininha: "neutral",
  venda_cancelada: "neutral",
  estorno_parcial: "neutral",
};

/**
 * O que a tela escreve na "antecipação esperada": o número quando há, e
 * senão o MOTIVO de não haver — o tipo da venda desconhecido, o repasse não
 * antecipado ou a antecipação não cadastrada. Escrever "não cadastrada" para
 * os três dizia que faltava cadastro a quem tinha a taxa cadastrada.
 */
const ESPERADA_DA_ANTECIPACAO = (an: NonNullable<ItemConferencia["extrato"]>["antecipacao"]): string =>
  an.contratoBp != null
    ? `${taxaPct(an.contratoBp)} ao mês${an.esperada === "zero_no_debito" ? " (o débito não antecipa)" : ""}`
    : an.esperada === "tipo_desconhecido" ? "tipo de venda não identificado"
    : an.esperada === "repasse_nao_antecipado" ? "repasse não antecipado na maquininha"
    : "não cadastrada";

/** O selo da antecipação: o mesmo critério do da taxa. */
const TOM_DA_ANTECIPACAO: Record<ResultadoAntecipacao, "positive" | "warning" | "neutral"> = {
  diferente: "warning",
  igual: "positive",
  sem_contrato: "neutral",
  nao_antecipado: "neutral",
  venda_nao_antecipada: "neutral",
  sem_extrato: "neutral",
  tipo_desconhecido: "neutral",
  sem_conclusao: "neutral",
  outra_maquininha: "neutral",
  venda_cancelada: "neutral",
  estorno_parcial: "neutral",
};

const TH = "py-2 pr-4 text-[11px] font-medium text-faint";

/** "+2 dias", "−1 dia" (o menos tipográfico), "mesmo dia" — sempre na tinta do texto. */
const diferencaEmDias = (n: number | null) => {
  if (n == null) return "—";
  if (n === 0) return "mesmo dia";
  const texto = `${Math.abs(n)} ${Math.abs(n) === 1 ? "dia" : "dias"}`;
  return n > 0 ? `+${texto}` : comSinal(n, texto);
};

/** Um número que a Pinbank informa e cujo sentido está em aberto: decimal puro, nunca R$. */
const informado = (c: number | null) => (c == null ? "—" : comSinal(c, decimalBR(Math.abs(c) / 100, 2)));
/** Uma taxa em pontos-base (265) como percentual ("2,65%"), nunca R$ — duas casas (ver o cabeçalho). */
const taxaPct = (bp: number) => pctDeInteiro(bp / 100, 2);
/** A diferença de taxa, com o sinal escrito: "+0,15 ponto percentual", "−0,34 ponto percentual". */
const pontosPercentuais = (bp: number) => {
  // Abaixo de 2 o substantivo fica no singular ("0,15 ponto percentual", "1,50 ponto percentual").
  const texto = `${decimalBR(Math.abs(bp) / 100, 2)} ${Math.abs(bp) < 200 ? "ponto percentual" : "pontos percentuais"}`;
  return bp > 0 ? `+${texto}` : comSinal(bp, texto);
};

/** A tolerância do motor, escrita a partir da constante dele (o texto não envelhece sozinho). */
const TOLERANCIA_TEXTO = `${decimalBR(TOLERANCIA_TAXA_BP / 100, 2)} ponto percentual`;

const COMO_CALCULA_RESUMO =
  "Cada parcela do extrato forma par com o título do sistema pelo número da venda (NSU) e pelo número da parcela. "
  + "A data do repasse é comparada por dia; quando o sistema estimou um fim de semana ou feriado e a Pinbank paga no dia útil seguinte, a parcela é conferida. "
  + "O bruto estimado no extrato é o bruto da venda dividido pelo número de parcelas, pela mesma divisão que o sistema usa ao lançar a venda — a diferença de centavos fica na última parcela. "
  + "Quando o extrato e o sistema dividem a mesma venda em números de parcelas diferentes, a parcela sem par fica sem conclusão (o valor dela pode estar nas parcelas do outro lado), e o total bruto da venda é comparado — uma parcela que falta no sistema conta zero. O total diferente leva todas as parcelas da venda também à aba de divergências, mesmo as que conferem uma a uma. "
  + `A taxa (MDR) do extrato é comparada com a taxa cadastrada na maquininha para o tipo de venda (débito, crédito à vista ou parcelado — parcelado em 1x é crédito à vista, como ao lançar), sem arredondar a cadastrada: uma diferença menor que ${TOLERANCIA_TEXTO} conta como igual; `
  + "a da venda cancelada e a da venda com estorno parcial não são comparadas. A taxa não muda a situação da parcela, mas a taxa diferente — ou cobrada no extrato sem o título dela no sistema, quando pelo contrato ela existe — leva a parcela também à aba de divergências. "
  + "A antecipação ao mês do extrato é comparada do mesmo jeito: no crédito, com a antecipação cadastrada na maquininha; no débito, com zero; sem o repasse antecipado na maquininha, ela não é comparada. "
  + "E o líquido, o que a Pinbank deposita, é comparado por venda inteira com o que o sistema lançou (receita menos taxa, tarifa fixa e antecipação), com folga de 1 centavo pelos arredondamentos; a venda pela metade em algum dos lados não é comparada. A antecipação e o líquido diferentes também levam a parcela à aba de divergências, sem mudar a situação dela.";

const OQUE_CONTAGENS =
  "Sem nenhuma venda do extrato com o mesmo número (NSU), no mesmo dia, de uma venda que chegou a esta maquininha pelo aviso da Pinbank, nada prova que o extrato é desta maquininha. "
  + "Por isso a conferência não cruza o extrato com o sistema: mostra só o que cada lado tem, sem comparar um com o outro.";
const COMO_CALCULA_CONTAGENS =
  "Linhas do extrato: todas as que a Pinbank devolveu com o código do estabelecimento desta maquininha — inclusive as de fora do período e as sem número ou parcela —, e quantas vendas com número (NSU) elas têm. "
  + "Parcelas válidas no sistema: as parcelas que o sistema lançou desta maquininha com a venda dentro do período, sem as canceladas e sem as vendas desfeitas, quantas vendas elas formam e a soma do valor bruto delas. "
  + "Nenhum número aqui sai de comparar uma linha do extrato com uma parcela do sistema.";

const Valor = ({ centavos, semValor }: { centavos: number | null; semValor: string }) =>
  centavos == null ? <SemDados motivo={semValor} /> : <span className="text-ink"><BRL value={centavos / 100} /></span>;

/** Por que a parcela não tem o bruto estimado do extrato — o motivo VERDADEIRO de cada caso. */
const semBrutoDoExtrato = (i: ItemConferencia) =>
  i.extrato == null ? "ausente do extrato"
  : i.status === "linha_ilegivel" ? "linha ilegível"
  : i.motivo === "bruto_inconsistente_no_extrato" ? "diferente entre as parcelas"
  : "não informado pela Pinbank";

const comNadaAlterado = (m: string) => (/nada foi alterado/i.test(m) ? m : `${m} Nada foi alterado.`);

export function PinbankConferencia({ vinculo }: { vinculo: VinculoTela }) {
  const hoje = React.useMemo(hojeEmSaoPaulo, []);
  const padrao = React.useMemo(() => mesPassado(hoje), [hoje]);
  const [de, setDe] = React.useState(padrao.de);
  const [ate, setAte] = React.useState(padrao.ate);
  const [consultando, setConsultando] = React.useState(false);
  const [resultado, setResultado] = React.useState<ResultadoConferencia | null>(null);
  const [esperaAte, setEsperaAte] = React.useState(0);
  const [agora, setAgora] = React.useState(() => Date.now());
  const [indisponivel, setIndisponivel] = React.useState<string | null>(indisponivelNaSessao);

  React.useEffect(() => {
    if (esperaAte <= Date.now()) return;
    const t = window.setInterval(() => {
      const n = Date.now();
      setAgora(n);
      if (n >= esperaAte) window.clearInterval(t);
    }, 1000);
    return () => window.clearInterval(t);
  }, [esperaAte]);

  const problemas = problemasDoPeriodoExtratoPos(de, ate);
  const restante = Math.max(0, Math.ceil((esperaAte - agora) / 1000));
  const preCondicao = !vinculo.ativo
    ? "Ative a maquininha para conferir."
    : vinculo.codigo_cliente == null
      ? "O código desta maquininha no extrato ainda não foi cadastrado pela Quattro."
      : null;
  const desabilitado = !!preCondicao || !!indisponivel || problemas.length > 0 || consultando || restante > 0;

  const mp = mesPassado(hoje);
  const u30 = ultimos30(hoje);
  const atalhos = [
    { rotulo: "Mês passado", ...mp },
    { rotulo: "Últimos 30 dias (até ontem)", ...u30 },
  ];

  async function conferir() {
    setConsultando(true);
    // A espera do botão é a regra inteira (ESPERA_CONFERENCIA_MS) — ou, no 429, o que o BANCO disse que
    // falta: com a espera no banco, outra aba ou outra pessoa da empresa pode ter conferido há 37 s, e a
    // frase da rota diz "Espere 23 segundos"; o botão não pode dizer 60 ao lado dela.
    let espera = ESPERA_CONFERENCIA_MS;
    try {
      const r = await conferirComExtrato({ vinculoId: vinculo.id, de, ate });
      setResultado(r);
      espera = esperaDoBotao(r);
      if (!r.ok && (r.codigo === "desligada" || r.codigo === "ambiente_teste")) {
        indisponivelNaSessao = r.motivo;
        setIndisponivel(r.motivo);
      }
    } finally {
      setConsultando(false);
      setEsperaAte(Date.now() + espera);
      setAgora(Date.now());
    }
  }

  return (
    <section className="flex flex-col gap-4 border-t border-border-soft pt-5" aria-label="Conferência com o extrato da Pinbank">
      <span className="a4p-label text-muted">Conferência com o extrato da Pinbank</span>

      <div className="flex flex-wrap items-end gap-3">
        <DateField label="Início" value={de} onChange={setDe} invalid={problemas.length > 0} />
        <DateField label="Fim" value={ate} onChange={setAte} invalid={problemas.length > 0} />
        <div className="inline-flex items-center gap-1 p-1 rounded-pill bg-surface-2" role="group" aria-label="Períodos prontos">
          {atalhos.map((a) => {
            const ativo = de === a.de && ate === a.ate;
            return (
              <button key={a.rotulo} type="button" aria-pressed={ativo}
                onClick={() => { setDe(a.de); setAte(a.ate); }}
                className={`inline-flex items-center h-9 px-4 rounded-pill text-label transition-colors ${
                  ativo ? "bg-white text-ink font-medium shadow-pill" : "bg-transparent text-muted hover:text-ink"}`}>
                {a.rotulo}
              </button>
            );
          })}
        </div>
        <Button variant="secondary" disabled={desabilitado} aria-busy={consultando} onClick={conferir}>
          {consultando ? "Consultando a Pinbank…" : restante > 0 ? `Conferir de novo em ${restante} s` : "Conferir com o extrato"}
        </Button>
      </div>

      {preCondicao && <span className="text-caption text-muted">{preCondicao}</span>}
      {!preCondicao && problemas.length > 0 && (
        <span className="text-caption text-negative" role="alert">{problemas.join(" ")}</span>
      )}
      {!preCondicao && indisponivel && !resultado && <SemDados motivo={indisponivel} />}

      <div aria-live="polite" className="flex flex-col gap-4">
        {resultado && !resultado.ok && (
          INDISPONIVEL.has(resultado.codigo)
            ? <SemDados motivo={resultado.motivo} />
            : <p className="m-0 text-label text-ink max-w-[80ch]">{comNadaAlterado(resultado.motivo)}</p>
        )}
        {/* A chave remonta o relatório a cada conferência: a aba, a página e as linhas abertas são do relatório anterior. */}
        {resultado?.ok && <Relatorio key={resultado.consultadoEm} r={resultado.relatorio} consultadoEm={resultado.consultadoEm} />}
      </div>
    </section>
  );
}

function Relatorio({ r, consultadoEm }: { r: RelatorioParaEmpresa; consultadoEm: string }) {
  const rodape = (
    <span className="text-caption text-muted">
      Consultado em {FMT_INSTANTE.format(new Date(consultadoEm)).replace(",", "")} · Somente leitura: nada foi alterado no sistema.
    </span>
  );
  // Sem venda em comum atestada, a resposta nem traz o cruzamento: só as contagens de cada lado.
  if (soContagens(r)) return <SoContagens r={r} rodape={rodape} />;

  const ps = r.resumo.porStatus;

  if (r.vazio) {
    return (
      <>
        <p className="m-0 text-label text-ink">
          Nenhuma venda da maquininha neste período — nem no extrato da Pinbank, nem no sistema.
        </p>
        <Avisos avisos={r.avisos} />
        {rodape}
      </>
    );
  }

  return (
    <>
      <span className="text-caption text-muted">Período de {dataBR(r.periodo.de)} a {dataBR(r.periodo.ate)}.</span>

      <Avisos avisos={r.avisos} />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-h3 font-semibold text-ink">Resumo por situação</span>
          <InfoHint
            align="left"
            oQue="Cada parcela do extrato e cada título da maquininha no sistema cai em uma situação só. Por isso as quantidades somam todas as parcelas conferidas, e o valor de cada situação é a soma das parcelas dela."
            comoCalcula={COMO_CALCULA_RESUMO}
          />
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Resumo por situação">
          <table className="w-full text-label tabular-nums">
            <thead>
              <tr className="text-left">
                {["Situação", "Parcelas", "Bruto estimado no extrato", "Bruto no sistema"].map((h) => <th key={h} className={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {GRUPOS_RESUMO.map((g) => {
                const n = r.resumo.grupos[g.id];
                const linhas = ORDEM_STATUS.filter((s) => GRUPO_DO_STATUS[s] === g.id && ps[s].quantidade > 0);
                return (
                  <React.Fragment key={g.id}>
                    <tr className="border-t border-border-soft">
                      <th scope="colgroup" colSpan={4} className="py-2 pr-4 text-left text-label font-medium text-ink">
                        {g.rotulo} · {n === 0 ? "Nenhuma" : n}
                      </th>
                    </tr>
                    {linhas.map((s) => (
                      <tr key={s} className="border-t border-border-soft">
                        <td className="py-2 pr-4"><StatusBadge tone={TOM_DO_STATUS[s]}>{ROTULO_STATUS[s]}</StatusBadge></td>
                        <td className="py-2 pr-4">{ps[s].quantidade}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          <Valor centavos={ps[s].centavosExtrato} semValor="nenhuma parcela com valor deste lado" />
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          <Valor centavos={ps[s].centavosSistema} semValor="nenhuma parcela com valor deste lado" />
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <TaxaDaMaquininha r={r} />

      <AntecipacaoDaMaquininha r={r} />

      <LiquidoDasVendas r={r} />

      <ForaDaConferencia f={r.resumo.foraDaConferencia} />

      {r.detalhes.visiveis && <Itens r={r} />}

      {rodape}
    </>
  );
}

/**
 * Por que só as quantidades, POR CAUSA. "O código pode ser o de outra loja" só
 * cabe na falta de venda em comum: na maquininha trocada a frase acima diz que
 * o código provavelmente está certo — e a legenda logo abaixo não pode
 * desdizê-la.
 */
const POR_QUE_SO_CONTAGENS: Record<RelatorioSoContagens["detalhes"]["codigo"], string> = {
  sem_venda_em_comum:
    "Os detalhes só aparecem quando a numeração das vendas confere: ao menos uma venda do extrato com o mesmo número (NSU), no mesmo dia, de uma venda que chegou a esta maquininha pelo aviso da Pinbank. Sem isso, o código do estabelecimento (EC) pode ser o de outra loja — e a conferência não mostra as linhas do extrato, a soma dele, a situação de cada parcela nem a taxa cobrada.",
  maquininha_excluida:
    "Os detalhes só aparecem quando a numeração das vendas confere: ao menos uma venda do extrato com o mesmo número (NSU), no mesmo dia, de uma venda que chegou a esta maquininha pelo aviso da Pinbank. O aviso da maquininha antiga não serve de prova enquanto o código do estabelecimento (EC) dela não for confirmado — e, até lá, a conferência não mostra as linhas do extrato, a soma dele, a situação de cada parcela nem a taxa cobrada.",
};

/**
 * Só as contagens de cada LADO: o extrato não está provado como desta empresa.
 * Nenhuma situação, soma do extrato, taxa ou linha — a resposta nem as traz.
 */
function SoContagens({ r, rodape }: { r: RelatorioSoContagens; rodape: React.ReactNode }) {
  const c = r.contagens;
  return (
    <>
      <span className="text-caption text-muted">Período de {dataBR(r.periodo.de)} a {dataBR(r.periodo.ate)}.</span>
      <div className="flex flex-col gap-1 max-w-[80ch]">
        <div className="flex items-center gap-2">
          <StatusBadge tone="neutral">Só as quantidades</StatusBadge>
          <InfoHint align="left" oQue={OQUE_CONTAGENS} comoCalcula={COMO_CALCULA_CONTAGENS} />
        </div>
        <p className="m-0 text-label text-ink">{r.detalhes.frase}</p>
        <span className="text-caption text-muted">{POR_QUE_SO_CONTAGENS[r.detalhes.codigo]}</span>
      </div>
      <Avisos avisos={r.avisos} />
      <dl className="m-0 flex flex-col gap-1 text-label">
        <Par t="No extrato da Pinbank, com este código de estabelecimento"
          v={`${c.extrato.linhas} linha(s) do extrato · ${c.extrato.vendas} venda(s) com número`} />
        <Par t="No sistema, desta maquininha no período"
          v={<>{c.sistema.parcelas} parcela(s) válida(s) lançada(s) · {c.sistema.vendas} venda(s) · <Valor centavos={c.sistema.centavos} semValor="nenhuma parcela válida lançada" /></>} />
      </dl>
      <ForaDaConferencia f={c.foraDaConferencia} />
      {rodape}
    </>
  );
}

function TaxaDaMaquininha({ r }: { r: RelatorioCompleto }) {
  const t = r.resumo.taxa;
  const resultados = ORDEM_RESULTADO_TAXA.filter((x) => t.porResultado[x] > 0);
  return (
    <div className="flex flex-col gap-1 max-w-[80ch]">
      <span className="text-label font-medium text-ink">Taxa da maquininha (MDR)</span>
      <span className="text-caption text-muted">
        O extrato informa a taxa de cada parcela em percentual. Ela é comparada com a taxa cadastrada na maquininha para o mesmo tipo de venda, sem arredondar a cadastrada; uma diferença menor que {TOLERANCIA_TEXTO} conta como igual.
      </span>
      {resultados.length === 0 ? (
        <span className="text-label text-muted">Nenhuma parcela do extrato para comparar.</span>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-1">
          {resultados.map((x) => (
            <li key={x} className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={TOM_DA_TAXA[x]}>{ROTULO_RESULTADO_TAXA[x]}</StatusBadge>
              <span className="text-label text-ink tabular-nums">{t.porResultado[x]} parcela(s)</span>
            </li>
          ))}
        </ul>
      )}
      <span className="text-label text-ink tabular-nums">
        Parcelas com taxa informada no extrato: {t.parcelasComTaxaInformada}
      </span>
      <span className="text-label text-ink">
        Taxa lançada pelo sistema (pelo contrato):{" "}
        {t.titulosDeTaxaNoSistema > 0
          ? <BRL value={t.centavosTaxaNoSistema / 100} />
          : <SemDados motivo="nenhum título de taxa nestas parcelas" />}
      </span>
    </div>
  );
}

function AntecipacaoDaMaquininha({ r }: { r: RelatorioCompleto }) {
  const a = r.resumo.antecipacao;
  const resultados = ORDEM_RESULTADO_ANTECIPACAO.filter((x) => a.porResultado[x] > 0);
  return (
    <div className="flex flex-col gap-1 max-w-[80ch]">
      <span className="text-label font-medium text-ink">Antecipação</span>
      <span className="text-caption text-muted">
        O extrato informa a antecipação ao mês de cada parcela. No crédito ela é comparada com a cadastrada na maquininha, e no débito com zero, sem arredondar a cadastrada; uma diferença menor que {TOLERANCIA_TEXTO} conta como igual.
      </span>
      {resultados.length === 0 ? (
        <span className="text-label text-muted">Nenhuma parcela do extrato para comparar.</span>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-1">
          {resultados.map((x) => (
            <li key={x} className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={TOM_DA_ANTECIPACAO[x]}>{ROTULO_RESULTADO_ANTECIPACAO[x]}</StatusBadge>
              <span className="text-label text-ink tabular-nums">{a.porResultado[x]} parcela(s)</span>
            </li>
          ))}
        </ul>
      )}
      <span className="text-label text-ink tabular-nums">
        Parcelas com antecipação informada no extrato: {a.parcelasComAntecipacaoInformada}
      </span>
      <span className="text-label text-ink">
        Antecipação lançada pelo sistema (pelo contrato):{" "}
        {a.titulosDeAntecipacaoNoSistema > 0
          ? <BRL value={a.centavosAntecipacaoNoSistema / 100} />
          : <SemDados motivo="nenhum título de antecipação nestas parcelas" />}
      </span>
    </div>
  );
}

/** O líquido por VENDA: o que a Pinbank deposita × o que o sistema lançou — as somas vêm prontas do motor. */
function LiquidoDasVendas({ r }: { r: RelatorioCompleto }) {
  const l = r.resumo.liquido;
  return (
    <div className="flex flex-col gap-1 max-w-[80ch]">
      <span className="text-label font-medium text-ink">Líquido das vendas</span>
      <span className="text-caption text-muted">
        O que a Pinbank deposita, somado por venda, comparado com o que o sistema lançou: a receita menos a taxa, a tarifa fixa e a antecipação. Só a venda inteira nos dois lados é comparada, com folga de 1 centavo pelos arredondamentos.
      </span>
      {l.vendasComparadas === 0 ? (
        <span className="text-label text-muted">Nenhuma venda inteira nos dois lados para comparar.</span>
      ) : (
        <>
          <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {l.vendasIguais > 0 && (
              <li className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="positive">Líquido igual</StatusBadge>
                <span className="text-label text-ink tabular-nums">{l.vendasIguais} venda(s)</span>
              </li>
            )}
            {l.vendasDiferentes > 0 && (
              <li className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="warning">Líquido diferente</StatusBadge>
                <span className="text-label text-ink tabular-nums">{l.vendasDiferentes} venda(s)</span>
              </li>
            )}
          </ul>
          <span className="text-label text-ink">
            Depositado pela Pinbank: <Valor centavos={l.centavosExtrato} semValor="nenhuma venda comparada" />
            {" · "}Lançado no sistema: <Valor centavos={l.centavosSistema} semValor="nenhuma venda comparada" />
          </span>
        </>
      )}
    </div>
  );
}

function Avisos({ avisos }: { avisos: RelatorioConferencia["avisos"] }) {
  const lista = avisos;
  if (!lista.length) return null;
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-2">
      {lista.map((a) => (
        <li key={a.codigo} className="flex flex-col gap-1 max-w-[80ch]">
          <StatusBadge tone="warning">Atenção</StatusBadge>
          <span className="text-label text-ink">{a.frase}</span>
        </li>
      ))}
    </ul>
  );
}

function ForaDaConferencia({ f }: { f: RelatorioConferencia["resumo"]["foraDaConferencia"] }) {
  const partes = [
    f.outroEstabelecimento > 0 ? `${f.outroEstabelecimento} parcela(s) de outro estabelecimento` : null,
    f.semEstabelecimento > 0 ? `${f.semEstabelecimento} parcela(s) sem estabelecimento` : null,
    f.outraMaquininha > 0 ? `${f.outraMaquininha} venda(s) de outra maquininha da empresa` : null,
  ].filter((x): x is string => !!x);
  if (!partes.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label font-medium text-ink">Fora desta conferência</span>
      <span className="text-caption text-muted tabular-nums">{partes.join(" · ")}.</span>
    </div>
  );
}

/**
 * A aba de DIVERGÊNCIAS é a VISTA do motor (`itemComDivergencia`): o status
 * divergente OU a taxa diferente da cadastrada (ou cobrada sem o título dela)
 * OU o total bruto da venda diferente nos dois lados. A taxa e o total não
 * mudam o status — uma parcela conferida com a taxa errada, ou de uma venda
 * cujo total não bate, aparece aqui E em "Conferidas". A contagem da aba é a
 * do motor (`itensComDivergencia`), nunca refeita aqui.
 */
const naAba = (i: ItemConferencia, aba: GrupoConferencia) =>
  aba === "divergencias" ? itemComDivergencia(i) : GRUPO_DO_STATUS[i.status] === aba;
const contagemDaAba = (r: RelatorioCompleto, aba: GrupoConferencia) =>
  aba === "divergencias" ? r.resumo.itensComDivergencia : r.resumo.grupos[aba];

function Itens({ r }: { r: RelatorioCompleto }) {
  const primeiraComItens = ABAS.find((a) => contagemDaAba(r, a.id) > 0)?.id ?? "divergencias";
  const [aba, setAba] = React.useState<GrupoConferencia>(primeiraComItens);
  const [limite, setLimite] = React.useState(POR_PAGINA);
  const [abertos, setAbertos] = React.useState<Set<string>>(() => new Set());
  const daAba = r.itens.filter((i) => naAba(i, aba));
  const visiveis = daAba.slice(0, limite);
  const alternar = (id: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex items-center gap-1 p-1 rounded-pill bg-surface-2 self-start" role="group" aria-label="Itens por grupo">
        {ABAS.map((a) => (
          <button key={a.id} type="button" aria-pressed={aba === a.id}
            onClick={() => { setAba(a.id); setLimite(POR_PAGINA); }}
            className={`inline-flex items-center h-9 px-4 rounded-pill text-label transition-colors ${
              aba === a.id ? "bg-white text-ink font-medium shadow-pill" : "bg-transparent text-muted hover:text-ink"}`}>
            {a.rotulo} · {contagemDaAba(r, a.id)}
          </button>
        ))}
      </div>

      {daAba.length === 0 ? (
        <span className="text-label text-muted">Nenhuma parcela neste grupo.</span>
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Itens da conferência">
          <table className="w-full text-label tabular-nums">
            <thead>
              <tr className="text-left">
                {["NSU", "Parcela", "Venda", "Repasse no sistema", "Repasse no extrato", "Diferença", "Bruto no sistema", "Bruto estimado no extrato", "Taxa e antecipação no extrato", "Situação", ""].map((h, i) => (
                  <th key={`${h}-${i}`} className={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((i) => (
                <Linha key={i.id} i={i} aberto={abertos.has(i.id)} onAlternar={() => alternar(i.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {daAba.length > limite && (
        <Button variant="ghost" className="self-start" onClick={() => setLimite((n) => n + POR_PAGINA)}>
          Mostrar mais ({daAba.length - limite} restantes)
        </Button>
      )}
    </div>
  );
}

/** A antecipação da parcela: só quando houve comparação (igual, diferente ou sem a cadastrada) — em percentual ao mês. */
function AntecipacaoDaParcela({ i }: { i: ItemConferencia }) {
  const a = i.extrato?.antecipacao;
  if (!a || a.extratoBp == null || !(a.resultado === "igual" || a.resultado === "diferente" || a.resultado === "sem_contrato")) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-ink">
        {taxaPct(a.extratoBp)} ao mês
        {a.contratoBp != null && <span className="text-muted"> · esperada {taxaPct(a.contratoBp)}</span>}
      </span>
      <StatusBadge tone={TOM_DA_ANTECIPACAO[a.resultado]}>{ROTULO_RESULTADO_ANTECIPACAO[a.resultado]}</StatusBadge>
    </div>
  );
}

/** A taxa da parcela: o que o extrato cobrou × o cadastrado, e o resultado da comparação — em percentual. */
function TaxaDaParcela({ i }: { i: ItemConferencia }) {
  const t = i.extrato?.taxa;
  if (!i.extrato || !t) return <SemDados motivo="ausente do extrato" />;
  if (t.extratoBp == null) return <SemDados motivo="não informada pela Pinbank" />;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-ink">
        {taxaPct(t.extratoBp)}
        {t.contratoBp != null && <span className="text-muted"> · cadastrada {taxaPct(t.contratoBp)}</span>}
      </span>
      <StatusBadge tone={TOM_DA_TAXA[t.resultado]}>{ROTULO_RESULTADO_TAXA[t.resultado]}</StatusBadge>
    </div>
  );
}

function Linha({ i, aberto, onAlternar }: { i: ItemConferencia; aberto: boolean; onAlternar: () => void }) {
  // O total de parcelas do LADO que o item tem: a parcela só do sistema é "3/3" do sistema, nunca "3/1" do extrato.
  const n = i.extrato ? (i.totalParcelasExtrato ?? i.totalParcelasSistema) : (i.totalParcelasSistema ?? i.totalParcelasExtrato);
  const ad = i.extrato?.aguardandoDefinicao;
  const tx = i.extrato?.taxa;
  const an = i.extrato?.antecipacao;
  return (
    <>
      <tr className="border-t border-border-soft align-top">
        <td className="py-2 pr-4 whitespace-nowrap">{i.nsu ?? "—"}</td>
        <td className="py-2 pr-4 whitespace-nowrap">{i.parcela == null ? "—" : `${i.parcela}/${n ?? "—"}`}</td>
        <td className="py-2 pr-4 whitespace-nowrap">{dataBR(i.extrato?.dataVenda ?? i.sistema?.competencia)}</td>
        <td className="py-2 pr-4 whitespace-nowrap">{dataBR(i.sistema?.vencimento)}</td>
        <td className="py-2 pr-4 whitespace-nowrap">{dataBR(i.extrato?.dataRepasse)}</td>
        <td className="py-2 pr-4 whitespace-nowrap">{diferencaEmDias(i.diferencaDias)}</td>
        <td className="py-2 pr-4 whitespace-nowrap">
          <Valor centavos={i.sistema?.valorCentavos ?? null} semValor="ausente do sistema" />
        </td>
        <td className="py-2 pr-4 whitespace-nowrap">
          <Valor centavos={i.extrato?.brutoParcelaEstimadoCentavos ?? null} semValor={semBrutoDoExtrato(i)} />
        </td>
        <td className="py-2 pr-4 whitespace-nowrap">
          <div className="flex flex-col gap-2">
            <TaxaDaParcela i={i} />
            <AntecipacaoDaParcela i={i} />
          </div>
        </td>
        <td className="py-2 pr-4 min-w-[260px]">
          <div className="flex flex-col gap-1">
            <StatusBadge tone={TOM_DO_STATUS[i.status]}>{ROTULO_STATUS[i.status]}</StatusBadge>
            <span className="text-caption text-muted">{i.frase}</span>
          </div>
        </td>
        <td className="py-2 pr-4">
          <Button variant="ghost" size="sm" aria-expanded={aberto} onClick={onAlternar}>
            {aberto ? "Fechar" : "Detalhes"}
          </Button>
        </td>
      </tr>
      {aberto && (
        <tr className="border-t border-border-soft">
          <td colSpan={11} className="py-3 pr-4">
            <dl className="m-0 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-caption">
              {i.provavel && <Par t="NSU no sistema" v={i.provavel.nsuNoSistema} />}
              {i.extrato && <Par t="Bandeira e forma" v={[i.extrato.bandeira, i.extrato.tipoCompra].filter(Boolean).join(" · ") || "—"} />}
              {i.extrato && <Par t="Situação no extrato" v={[i.extrato.status, i.extrato.statusPagamento].filter(Boolean).join(" · ") || "—"} />}
              {i.extrato?.dataCancelamento && <Par t="Cancelada no extrato em" v={dataBR(i.extrato.dataCancelamento)} />}
              {i.sistema && <Par t="Situação no sistema" v={i.sistema.situacao} />}
              {i.sistema && (
                <>
                  <Par t="Taxa lançada pelo sistema (pelo contrato)"
                    v={i.sistema.taxaCentavos == null ? "nenhum título de taxa" : <BRL value={i.sistema.taxaCentavos / 100} />} />
                  <Par t="Tarifa fixa lançada pelo sistema"
                    v={i.sistema.tarifaCentavos == null ? "nenhum título de tarifa" : <BRL value={i.sistema.tarifaCentavos / 100} />} />
                  <Par t="Antecipação lançada pelo sistema"
                    v={i.sistema.antecipacaoCentavos == null ? "nenhum título de antecipação" : <BRL value={i.sistema.antecipacaoCentavos / 100} />} />
                </>
              )}
              {i.sistema?.estornoDaVendaCentavos != null && (
                <Par t="Estornos da venda no sistema" v={<BRL value={i.sistema.estornoDaVendaCentavos / 100} />} />
              )}
              {i.sinais.length > 0 && <Par t="Observações" v={i.sinais.map((s) => ROTULO_SINAL[s]).join(" · ")} />}
              {i.sinais.includes("parcelas_diferentes") && (
                <>
                  {/* Com a linha do extrato, o número é o DELA — que não é o da venda quando as linhas discordam (a frase diz isso). */}
                  <Par t={i.extrato ? "Parcelas nesta linha do extrato e no sistema" : "Parcelas no extrato e no sistema"}
                    v={`${i.totalParcelasExtrato ?? "—"} · ${i.totalParcelasSistema ?? "—"}`} />
                  {i.extrato && <Par t="Bruto da venda no extrato" v={<Valor centavos={i.extrato.brutoVendaCentavos} semValor="não informado pela Pinbank" />} />}
                  {i.sistema && <Par t="Bruto da venda no sistema" v={<BRL value={i.sistema.vendaCentavos / 100} />} />}
                </>
              )}
              {tx && (
                <>
                  <Par t="Taxa cobrada no extrato" v={tx.extratoBp == null ? "não informada pela Pinbank" : taxaPct(tx.extratoBp)} />
                  <Par t="Taxa cadastrada para o tipo de venda"
                    v={tx.contratoBp != null ? taxaPct(tx.contratoBp)
                      : tx.tipo == null ? "tipo de venda não identificado" : "não cadastrada"} />
                  {tx.diferencaBp != null && <Par t="Diferença da taxa" v={pontosPercentuais(tx.diferencaBp)} />}
                  <Par t="Comparação da taxa" v={ROTULO_RESULTADO_TAXA[tx.resultado]} />
                </>
              )}
              {an && (
                <>
                  <Par t="Antecipação informada no extrato" v={an.extratoBp == null ? "não informada pela Pinbank" : `${taxaPct(an.extratoBp)} ao mês`} />
                  <Par t="Antecipação esperada pelo contrato" v={ESPERADA_DA_ANTECIPACAO(an)} />
                  {an.diferencaBp != null && <Par t="Diferença da antecipação" v={pontosPercentuais(an.diferencaBp)} />}
                  <Par t="Comparação da antecipação" v={ROTULO_RESULTADO_ANTECIPACAO[an.resultado]} />
                </>
              )}
              {i.extrato && (
                <Par t="Líquido desta parcela no extrato (o que a Pinbank deposita)"
                  v={<Valor centavos={i.extrato.liquidoCentavos} semValor="não informado pela Pinbank" />} />
              )}
              {i.liquidoDaVenda && (
                <>
                  <Par t="Líquido da venda depositado pela Pinbank" v={<BRL value={i.liquidoDaVenda.extratoCentavos / 100} />} />
                  <Par t="Líquido da venda lançado no sistema" v={<BRL value={i.liquidoDaVenda.sistemaCentavos / 100} />} />
                </>
              )}
              {ad && (
                <>
                  <Par t="Bruto da parcela informado" v={`${informado(ad.brutoParcelaCentavos)} (aguardando definição)`} />
                  <Par t="Split informado" v={`${informado(ad.splitCentavos)} (aguardando definição)`} />
                </>
              )}
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

function Par({ t, v }: { t: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-muted">{t}:</dt>
      <dd className="m-0 text-ink tabular-nums">{v}</dd>
    </div>
  );
}
