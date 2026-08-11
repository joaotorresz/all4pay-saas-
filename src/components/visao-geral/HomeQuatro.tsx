"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Card, Icon, BRL, ValorIndicador, type IconName } from "@/components/ui";
import { useRiscoInput } from "./hooks";
import { chartAnim } from "@/lib/chart-anim";
import {
  entradas as entradasDe,
  saidas as saidasDe,
  resultado as resultadoDe,
  saldo as saldoDe,
  janelaDoMesDe,
  janelaMes,
} from "@/core/indicadores";
import { montarDicas } from "@/core/dicas";
import { formatBRL } from "@/lib/format";
import { assinado } from "@/core/indicadores/convencoes";
import type { Indicador } from "@/core/indicadores";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

/**
 * A HOME EM QUATRO CARDS.
 *
 * A organização é a da referência: em cima, RESUMO (barras dos três meses +
 * o valor do mês e três leituras ao lado) e CALENDÁRIO DE TRANSAÇÕES (a
 * faixa de dias e a agenda do dia); embaixo, DICAS ALL4PAY num bloco escuro
 * e TRANSAÇÕES RECENTES em tabela.
 *
 * ⚠️ Nenhum número sai daqui. Todos vêm de `core/indicadores` — a mesma
 * camada que o DRE, o fluxo de caixa e a IA consultam. A guarda de teto ZERO
 * ("nenhuma tela soma lançamentos por conta própria") existe porque cada tela
 * somando do seu jeito é como o sistema passou a responder a mesma pergunta
 * com números diferentes conforme a página.
 */

/* ------------------------------- utilidades ------------------------------- */

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Data-só fatiada da string — `new Date("YYYY-MM-DD")` cai no dia anterior em UTC−3. */
function partes(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { ano: a, mes: m, dia: d };
}
const somaDias = (iso: string, n: number) => {
  const { ano, mes, dia } = partes(iso);
  const d = new Date(Date.UTC(ano, mes - 1, dia + n));
  return d.toISOString().slice(0, 10);
};
const diaDaSemana = (iso: string) => {
  const { ano, mes, dia } = partes(iso);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
};

/* --------------------------------- resumo -------------------------------- */

interface Mes { rotulo: string; entradas: number; saidas: number }

function tresMeses(input: RiskInput): Mes[] {
  const { ano, mes } = partes(input.hoje);
  const out: Mes[] = [];
  for (let k = 2; k >= 0; k--) {
    const m = mes - k;
    const a = ano + Math.floor((m - 1) / 12);
    const mm = ((m - 1) % 12 + 12) % 12;
    // ⚠️ `janelaMes` recebe o mês 0-BASED (como `Date.getMonth()`), e está
    // documentado assim — todos os outros chamadores passam `getMonth()`.
    // Com `mm + 1` cada barra mostrava o mês SEGUINTE: agosto caía em
    // setembro, que ainda não aconteceu, e a terceira coluna saía vazia ao
    // lado de um "entradas do mês" de R$607 mil. O gráfico não parecia
    // quebrado — parecia um mês fraco, que é o pior tipo de erro num número.
    const j = janelaMes(a, mm);
    out.push({
      rotulo: MESES[mm],
      entradas: entradasDe(input, j).valor,
      saidas: saidasDe(input, j).valor,
    });
  }
  return out;
}

function Resumo({ input }: { input: RiskInput }) {
  const meses = React.useMemo(() => tresMeses(input), [input]);
  const jMes = janelaDoMesDe(input.hoje);
  const saldoAtual = saldoDe(input).valor;
  // ⚠️ AQUI ESTAVA O DEFEITO da auditoria, e ele não era de cálculo: os quatro
  // números estavam certos. O saldo é POSIÇÃO (−R$ 31.000 hoje) e os outros
  // três são o PERÍODO — e nenhum lançamento foi liquidado em agosto, porque o
  // último pagamento foi 28/07. Lidos lado a lado, "R$ 0 · R$ 0 · R$ 0" ao lado
  // de um saldo negativo faz o saldo parecer errado. Os indicadores agora
  // chegam inteiros e a tela decide o que mostrar.
  const ent = entradasDe(input, jMes);
  const sai = saidasDe(input, jMes);
  const res = resultadoDe(input, jMes);

  const dados = meses.map((m) => ({ nome: m.rotulo, entradas: m.entradas, saidas: m.saidas }));
  const ultimo = meses[meses.length - 1];

  return (
    <Card
      className="flex flex-col lg:flex-row gap-6"
      info={{
        titulo: "Resumo",
        oQue: "O caixa dos três últimos meses e a posição do mês corrente.",
        comoCalcula:
          "Barras: entradas e saídas liquidadas de cada mês, pela data de pagamento. Saldo: o saldo das contas hoje. Tudo pela camada canônica de indicadores.",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h2 m-0">Resumo</h2>
          {/* Mesma tipografia e corpo do título "Resumo", em caixa Aa: os
              dois são o cabeçalho do card, e um deles em micro-caixa-alta
              fazia a dupla parecer de sistemas diferentes. */}
          <span className="text-h2 text-muted bg-surface-2 rounded-pill px-4 py-[6px] shrink-0">
            {meses[0].rotulo} – {ultimo.rotulo}
          </span>
        </div>

        <div className="h-[210px] mt-5" role="img"
          aria-label={`Entradas e saídas dos meses ${meses.map((m) => m.rotulo).join(", ")}.`}>
          <ResponsiveContainer width="100%" height="100%">
            {/* Velas EMPILHADAS: a altura da coluna passa a ser o movimento
                total do mês, e a divisão interna mostra quanto dele foi
                entrada e quanto foi saída. Lado a lado, a comparação era
                entre duas colunas; empilhado, ela é dentro da mesma. */}
            <BarChart data={dados} margin={{ top: 24, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="nome" axisLine={false} tickLine={false} tickMargin={10}
                tick={{ fill: "var(--color-text-secondary)" }} />
              <Tooltip content={<ResumoTooltip />} cursor={{ fill: "var(--color-surface-2)", radius: 12 }} />
              <Bar dataKey="saidas" stackId="mes" maxBarSize={72}
                fill="var(--a4p-cat-3)" shape={<Vela />} {...chartAnim()} />
              <Bar dataKey="entradas" stackId="mes" maxBarSize={72}
                fill="var(--a4p-cat-1)" shape={<Vela />} {...chartAnim(120)} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-5 mt-2">
          <Legenda cor="var(--a4p-cat-1)" nome="Entradas" />
          <Legenda cor="var(--a4p-cat-3)" nome="Saídas" />
        </div>
      </div>

      {/* A coluna de leituras da referência: rótulo com glifo, valor-herói em
          cima e três linhas embaixo, cada uma com a sua variação. */}
      <div className="lg:w-[280px] shrink-0 lg:border-l border-border-soft lg:pl-6">
        <span className="text-h2 text-muted">Saldo atual deste mês</span>
        <div className="a4p-heroi mt-2 tabular-nums leading-none">
          <BRL value={saldoAtual} />
        </div>
        <div className="mt-5 flex flex-col">
          {/* ⚠️ "CONSOLIDADO" NÃO É ENFEITE NO RÓTULO — é o que estes números
              já são. `entradas`/`saidas`/`resultado` rodam no regime de CAIXA,
              e a convenção canônica (`liquidado`) só conta o que tem
              `status === "pago"`. Previsto e vencido ficam de fora, que é
              exatamente a diferença entre "consolidado" e "a receber".
              O rótulo agora DIZ isso; antes, "Entradas do mês" cabia nas duas
              leituras e o número respondia só uma.
              "do mês" saiu por CABER: o rótulo acima já fixa o mês, e a
              alternativa era a reticência comendo a palavra que carrega o
              sentido — "Entradas consoli…" não informa nada. */}
          {/* Entrada sobe, saída desce. `arrow-down-to-line` estava aqui e é
              o glifo de DOWNLOAD (mapeado para `download-01`): ele diz
              "baixar arquivo", não "dinheiro saindo". */}
          <Leitura icone="arrow-up" nome="Entradas consolidadas" indicador={ent} />
          <Leitura icone="arrow-down" nome="Saídas consolidadas" indicador={sai} />
          <Leitura icone="activity" nome="Resultado consolidado" indicador={res} ultimo />
        </div>
      </div>
    </Card>
  );
}

/**
 * Um pedaço da vela: retângulo com os QUATRO cantos arredondados e um
 * respiro na emenda.
 *
 * ⚠️ O Recharts empilha os segmentos encostados e só sabe arredondar a ponta
 * exposta — entrada e saída viravam uma coluna contínua com uma dobra de cor
 * no meio. A separação é o que faz os dois lerem como duas quantidades e não
 * como uma barra bicolor. Como não há gap de pilha na biblioteca, cada
 * segmento desenha a si mesmo encolhido pela metade do respiro em cada ponta.
 *
 * O `Math.max` protege o mês magro: sem ele, um segmento menor que o respiro
 * sairia com altura negativa e o SVG simplesmente não desenharia nada — um
 * valor pequeno viraria um valor ausente.
 */
const RESPIRO = 6;
function Vela(props: { x?: number; y?: number; width?: number; height?: number; fill?: string }) {
  const { x = 0, y = 0, width = 0, height = 0, fill } = props;
  if (height <= 0) return null;
  const h = Math.max(2, height - RESPIRO);
  return (
    <rect x={x} y={y + RESPIRO / 2} width={width} height={h}
      rx={Math.min(12, width / 2, h / 2)} fill={fill} />
  );
}

function ResumoTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const de = (k: string) => payload.find((p) => p.dataKey === k)?.value ?? 0;
  const ent = de("entradas");
  const sai = de("saidas");
  return (
    <div className="rounded-card bg-white shadow-popover px-4 py-3 min-w-[190px]">
      <span className="a4p-label text-muted">{label}</span>
      <div className="mt-2 flex flex-col gap-[6px]">
        <LinhaTip cor="var(--a4p-cat-1)" nome="Entradas" valor={ent} />
        <LinhaTip cor="var(--a4p-cat-3)" nome="Saídas" valor={sai} />
        <span className="border-t border-border-soft pt-[6px] flex items-center justify-between gap-4">
          <span className="text-caption text-muted">Resultado</span>
          <span className="text-caption text-ink tabular-nums"><BRL value={ent - sai} showDecimals={false} /></span>
        </span>
      </div>
    </div>
  );
}

function LinhaTip({ cor, nome, valor }: { cor: string; nome: string; valor: number }) {
  return (
    <span className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-2 text-caption text-muted">
        <span className="w-[7px] h-[7px] rounded-pill shrink-0" style={{ background: cor }} />
        {nome}
      </span>
      <span className="text-caption text-ink tabular-nums"><BRL value={valor} showDecimals={false} /></span>
    </span>
  );
}

function Legenda({ cor, nome }: { cor: string; nome: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-caption text-muted">
      <span className="w-[7px] h-[7px] rounded-pill" style={{ background: cor }} />
      {nome}
    </span>
  );
}

function Leitura({ icone, nome, indicador, ultimo }: {
  icone: IconName; nome: string; indicador: Indicador; ultimo?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 py-[14px] ${ultimo ? "" : "border-b border-border-soft"}`}>
      {/* Disco preto com o glifo em branco — o mesmo tratamento do tile de
          ícone do DS, que é o que dá peso igual às três leituras. */}
      <span className="w-7 h-7 rounded-pill bg-ink inline-flex items-center justify-center shrink-0">
        <Icon name={icone} size={14} color="var(--color-white)" />
      </span>
      {/* Corpo de legenda, não de rótulo: com `text-label` a palavra
          "consolidadas" caía na reticência, e a reticência comia justamente a
          palavra que carrega o sentido da linha. */}
      <span className="text-caption text-ink flex-1 min-w-0 truncate">{nome}</span>
      {/* ⚠️ O valor passou a ser CLICÁVEL: fórmula, período, regime e os
          lançamentos que o compõem, a um toque. Um número sem origem só pode
          ser aceito ou rejeitado — não conferido. */}
      <span className="text-label a4p-valor-texto tabular-nums text-ink shrink-0">
        <ValorIndicador indicador={indicador} titulo={nome} />
      </span>
    </div>
  );
}

/* ---------------------------- calendário do dia --------------------------- */

function Calendario({ input }: { input: RiskInput }) {
  const [sel, setSel] = React.useState(input.hoje.slice(0, 10));
  // A faixa começa no dia de hoje, como na referência: o passado não é agenda.
  const faixa = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => somaDias(input.hoje.slice(0, 10), i)),
    [input.hoje],
  );

  const doDia = React.useMemo(
    () => input.movements.filter((m) => m.due_date?.slice(0, 10) === sel).slice(0, 4),
    [input.movements, sel],
  );

  return (
    <Card
      info={{
        titulo: "Calendário de transações",
        oQue: "O que vence em cada dia dos próximos sete.",
        comoCalcula: "Lançamentos agrupados pela data de VENCIMENTO — a data que responde “o que cai neste dia”.",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h2 m-0">Calendário de transações</h2>
      </div>

      {/* A faixa de dias da referência: número grande, dia da semana embaixo,
          e o selecionado num pill escuro. */}
      <div className="flex items-center justify-between gap-1 mt-5 overflow-x-auto a4p-nav-scroll" role="tablist"
        aria-label="Dias">
        {faixa.map((d, i) => {
          const ativo = d === sel;
          return (
            <React.Fragment key={d}>
              {i > 0 && <span aria-hidden className="w-px h-8 bg-border-soft shrink-0" />}
              {/* ⚠️ A FORMA É UMA CÁPSULA VERTICAL — estreita e alta, com as
                  pontas totalmente redondas. Errei isto duas vezes: primeiro
                  com `rounded-pill` num botão LARGO (`flex-1`), que vira um
                  pill deitado; depois com um raio fixo de 20px, que vira um
                  quadrado de cantos redondos. O que faz a forma é a PROPORÇÃO:
                  largura fixa menor que a altura, e só então o raio total lê
                  como cápsula em pé. */}
              <button role="tab" aria-selected={ativo} onClick={() => setSel(d)}
                className={`w-[56px] h-[92px] shrink-0 rounded-pill flex flex-col items-center justify-center gap-[6px] transition-colors ${
                  ativo ? "bg-ink text-white" : "hover:bg-surface-2"
                }`}>
                {/* O número manda na cápsula, e o papel é `.a4p-dia-num` (o
                    porquê de cada decisão está na regra, em `globals.css`).
                    A cor fica EXPLÍCITA nos dois estados: depender da herança
                    do botão é o que deixava o número refém de uma regra de
                    card — medido, ele saía cinza sobre o preto do selecionado.

                    No SELECIONADO o número entra num disco branco e vira preto:
                    a inversão dentro da inversão é o que separa o dia escolhido
                    dos vizinhos sem precisar de um segundo sinal (fio, ponto,
                    negrito). O disco tem tamanho FIXO — em `w-full` ele viraria
                    um oval acompanhando a caixa, o mesmo erro de proporção que
                    a própria cápsula levou duas rodadas para acertar. */}
                <span
                  className={`w-8 h-8 rounded-pill inline-flex items-center justify-center shrink-0 ${
                    ativo ? "bg-white" : ""
                  }`}
                >
                  {/* Preto nos DOIS estados: no selecionado é o disco branco
                      que segura a leitura, no resto é o próprio fundo do card. */}
                  <span className="a4p-dia-num text-ink">{partes(d).dia}</span>
                </span>
                <span className={`text-caption leading-none ${ativo ? "" : "text-muted"}`}>{DIAS[diaDaSemana(d)]}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {doDia.length === 0 ? (
          <p className="m-0 py-8 text-center text-caption text-muted">Nada agendado para este dia.</p>
        ) : (
          doDia.map((m) => <LinhaAgenda key={m.id} m={m} input={input} />)
        )}
      </div>
    </Card>
  );
}

function LinhaAgenda({ m, input }: { m: RiskMovement; input: RiskInput }) {
  const nome = (m.party_id ? input.partyNames?.[m.party_id] : null) ?? m.category ?? "Lançamento";
  const entrada = m.type === "entrada";
  // A "prioridade" da referência traduzida para o que importa aqui: o estado
  // do título. Vencido é o único que exige ação hoje.
  const vencido = m.status === "pendente" && m.due_date.slice(0, 10) < input.hoje.slice(0, 10);
  const estado = m.status === "pago" ? "Liquidado" : vencido ? "Vencido" : "Previsto";
  return (
    <div className="flex items-center gap-3 rounded-card bg-surface-2 px-4 py-3">
      <span className="w-9 h-9 rounded-pill bg-white inline-flex items-center justify-center shrink-0">
        <Icon name={entrada ? "arrow-up" : "arrow-down"} size={15} color="var(--color-ink)" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-label text-ink truncate">{nome}</span>
        <span className="block text-caption text-muted truncate">{m.category ?? (entrada ? "Entrada" : "Saída")}</span>
      </span>
      {/* O estado tem o MESMO tratamento da categoria logo acima: os dois
          qualificam a transação, e um deles em micro-caixa-alta virava um
          selo com mais peso que o nome de quem cobra. */}
      <span className="text-caption text-muted shrink-0">{estado}</span>
      {/* ⚠️ O SINAL VEM DE `assinado`, não de um `-m.amount` escrito à mão:
          `amount` é MAGNITUDE e a direção vive em `type` — é a convenção da
          camada canônica, e contorná-la aqui é como o sistema passou a somar
          entrada com saída em telas diferentes. O `+` explícito da entrada o
          `BRL` não desenha (ele só nega), então entra ao lado. */}
      <span className="text-label a4p-valor-texto tabular-nums text-ink shrink-0">
        {entrada && "+"}<BRL value={assinado(m)} showDecimals={false} />
      </span>
    </div>
  );
}

/* ------------------------------ dicas all4pay ----------------------------- */

/**
 * DICAS all4pay — o que a movimentação do cliente está dizendo.
 *
 * Duas faces, e a escolha entre elas é do motor (`core/dicas`):
 * com histórico, as LEITURAS (custo fixo contra o mês anterior, categoria que
 * disparou, vencido, fôlego); sem histórico, os PASSOS que faltam.
 *
 * ⚠️ Conta nova não recebe dica, recebe caminho. Sem base, toda comparação
 * vira uma frase confiante sobre nada — "seu custo fixo caiu 100%" quando o
 * que houve foi um mês sem dado. Este card existe para a pessoa confiar no
 * que lê; uma leitura inventada custa mais do que a ausência dela.
 */
function Dicas({ input }: { input: RiskInput }) {
  const router = useRouter();
  const r = React.useMemo(() => montarDicas(input), [input]);
  const [i, setI] = React.useState(0);

  /*
   * A referência tem DUAS caixas: a escura, que carrega o contexto (o
   * assunto da leitura), e a clara por dentro, que carrega a mensagem. É a
   * relação card-sobre-canvas do resto do sistema, invertida — e é o que faz
   * este card ler como uma peça de outra natureza (a IA) e não como mais um
   * card de dado.
   */
  const itens: { contexto: string; mensagem: string; rota?: string }[] =
    r.modo === "onboarding"
      ? r.passos.map((p) => ({
          contexto: p.titulo,
          mensagem: p.feito ? `${p.texto} Feito.` : p.texto,
          rota: p.rota,
        }))
      : r.dicas.map((d) => ({
          contexto: d.titulo,
          mensagem: d.base
            ? `${d.texto} (base: ${d.base.rotulo}, ${formatBRL(d.base.valor)})`
            : d.texto,
          rota: d.rota,
        }));

  const total = itens.length;
  const atual = itens[Math.min(i, Math.max(0, total - 1))];
  const ir = (passo: number) => setI((k) => (k + passo + total) % total);

  return (
    <div
      className="rounded-[40px] p-6 flex flex-col min-h-[340px]"
      data-card="1"
      style={{ background: "var(--color-ink)" }}
    >
      {/* O destino da leitura mora no TOPO DIREITO, como botão redondo.
          Era um "ver ↗" sublinhado no rodapé: preso embaixo, ele competia com
          o par de setas de navegação — duas coisas com cara de controle lado a
          lado, uma que troca a dica e outra que sai da tela. Separando por
          POSIÇÃO, cada gesto fica num canto e nenhum precisa de rótulo. */}
      <div className="flex items-start justify-between gap-3 px-2 pt-1">
        <h2 className="text-h2 m-0" style={{ color: "var(--a4p-chrome-ink)" }}>
          {atual ? atual.contexto : "Dicas all4pay"}
        </h2>
        {atual?.rota && (
          <button
            onClick={() => router.push(atual.rota!)}
            aria-label={`Abrir ${atual.contexto}`}
            title={`Abrir ${atual.contexto}`}
            className="w-9 h-9 rounded-pill inline-flex items-center justify-center shrink-0 transition-opacity hover:opacity-85"
            style={{ background: "var(--color-white)" }}
          >
            <Icon name="arrow-up-right" size={17} color="var(--color-ink)" />
          </button>
        )}
      </div>

      <div
        className="mt-5 flex-1 rounded-[32px] px-6 py-8 flex flex-col items-center justify-center gap-6"
        style={{ background: "var(--color-white)" }}
      >
        <p className="m-0 text-body text-center max-w-[46ch]" style={{ color: "var(--color-ink)" }}>
          {atual
            ? atual.mensagem
            : "Assim que os primeiros lançamentos entrarem, as leituras do seu mês aparecem aqui."}
        </p>

        {total > 1 && (
          <span className="flex items-center gap-3">
            <SetaDica icone="chevron-left" rotulo="Anterior" onClick={() => ir(-1)} />
            <SetaDica icone="chevron-right" rotulo="Próxima" onClick={() => ir(1)} />
          </span>
        )}

      </div>
    </div>
  );
}

/** Seta redonda em lima — o par de navegação da referência. */
function SetaDica({ icone, rotulo, onClick }: { icone: IconName; rotulo: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={rotulo}
      className="w-11 h-11 rounded-pill inline-flex items-center justify-center transition-opacity hover:opacity-85"
      style={{ background: "var(--color-lime)" }}
    >
      <Icon name={icone} size={18} color="var(--color-on-lime)" />
    </button>
  );
}

/* --------------------------- transações recentes -------------------------- */

function Recentes({ input }: { input: RiskInput }) {
  const router = useRouter();
  const [busca, setBusca] = React.useState("");

  const linhas = React.useMemo(() => {
    const nomeDe = (m: RiskMovement) =>
      (m.party_id ? input.partyNames?.[m.party_id] : null) ?? m.category ?? "Lançamento";
    return input.movements
      .filter((m) => m.status !== "cancelado")
      .slice()
      .sort((a, b) => (b.paid_date ?? b.due_date).localeCompare(a.paid_date ?? a.due_date))
      .filter((m) => !busca || nomeDe(m).toLowerCase().includes(busca.toLowerCase()))
      .slice(0, 6)
      .map((m) => ({ m, nome: nomeDe(m) }));
  }, [input.movements, input.partyNames, busca]);

  return (
    <Card
      info={{
        titulo: "Transações recentes",
        oQue: "As últimas movimentações, entradas e saídas juntas.",
        comoCalcula: "Lançamentos não cancelados, ordenados pela data de caixa (pagamento quando liquidado, vencimento quando previsto).",
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-h2 m-0">Transações recentes</h2>
        <label className="inline-flex items-center gap-2 rounded-pill bg-surface-2 px-4 h-9 min-w-[190px]">
          <Icon name="search" size={14} color="var(--color-text-secondary)" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar aqui" aria-label="Buscar transação"
            className="bg-transparent border-0 outline-none text-caption text-ink w-full placeholder:text-placeholder" />
        </label>
      </div>

      <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Transações recentes">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {/* Cabeçalho em TEXTO, caixa Aa. A micro-caixa-alta é o papel de
                  RÓTULO do sistema (tag de estado, unidade) — um cabeçalho de
                  coluna é o nome do que está embaixo, e em caixa alta ele
                  pesava mais que o conteúdo que nomeia. */}
              {["Contraparte", "Tipo", "Categoria", "Data", "Valor", "Situação"].map((c, i) => (
                <th key={c} className={`text-caption text-muted font-medium pb-3 ${i > 3 ? "text-right" : "text-left"}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ m, nome }) => {
              const entrada = m.type === "entrada";
              const data = (m.paid_date ?? m.due_date).slice(0, 10);
              const { dia, mes } = partes(data);
              return (
                <tr key={m.id} onClick={() => m.party_id && window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: m.party_id } }))}
                  className="border-t border-border-soft cursor-pointer hover:bg-surface-2">
                  <td className="py-3">
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-card bg-surface-2 inline-flex items-center justify-center shrink-0">
                        <Icon name={entrada ? "arrow-up" : "arrow-down"} size={15} color="var(--color-ink)" />
                      </span>
                      <span className="text-label text-ink truncate">{nome}</span>
                    </span>
                  </td>
                  <td className="py-3 text-label text-muted">{entrada ? "Entrada" : "Saída"}</td>
                  <td className="py-3 text-label text-muted truncate">{m.category ?? "—"}</td>
                  <td className="py-3 text-label a4p-valor-texto text-muted tabular-nums">{dia} {MESES[mes - 1]}</td>
                  <td className="py-3 text-label a4p-valor-texto text-ink tabular-nums text-right">
                    <BRL value={m.amount} showDecimals={false} />
                  </td>
                  <td className="py-3 text-right">
                    <span className="text-caption text-muted inline-flex items-center gap-[6px] justify-end">
                      <span className="w-[7px] h-[7px] rounded-pill shrink-0"
                        style={{ background: m.status === "pago" ? "var(--color-positive)" : "var(--color-warning)" }} />
                      {m.status === "pago" ? "Liquidado" : "Previsto"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {linhas.length === 0 && (
          <p className="m-0 py-8 text-center text-caption text-muted">Nenhuma transação encontrada.</p>
        )}
      </div>
      <button onClick={() => router.push("/dashboard/financial/statement")}
        className="mt-3 self-start text-caption text-muted hover:text-ink underline">
        ver o extrato ↗
      </button>
    </Card>
  );
}

/* --------------------------------- a Home -------------------------------- */

export function HomeQuatro() {
  const { data: input, isLoading } = useRiscoInput();

  if (isLoading || !input) {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-card bg-white h-[320px] animate-pulse" data-card="1" />
        ))}
      </div>
    );
  }

  // A grade da referência: em cima 3/5 + 2/5; embaixo o bloco da IA menor que
  // a tabela, que é quem precisa de largura.
  /*
   * ⚠️ DUAS GRADES, não uma. As linhas têm proporções DIFERENTES (em cima
   * 60/40, embaixo 30/70) e uma grade CSS só tem um template de colunas para
   * todas as linhas. Forçar tudo numa grade exigiria `grid-column` com spans
   * inventados, que quebra na primeira mudança de proporção.
   */
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr] items-start">
        <Resumo input={input} />
        <Calendario input={input} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[3fr_7fr] items-start">
        <Dicas input={input} />
        <Recentes input={input} />
      </div>
    </div>
  );
}
