"use client";

/**
 * MAQUININHA QUATTRO — a página de relatórios da maquininha Pinbank, em Vender
 * e receber (pedido do dono, 19/10/2026). Só LEITURA: nada aqui chama a
 * Pinbank nem grava; lê as vendas que o webhook já trouxe e os títulos que
 * elas geraram (`lerRelatorioMaquininha`). Toda conta é de
 * `core/pinbank/relatorio` — a mesma do card da Home.
 *
 * Blocos: período (Hoje · Semana · Mês) · os quatro números (vendido, líquido,
 * ticket médio, aprovação) · evolução · formas e bandeiras · as transações do
 * período · custo das taxas e agenda de recebíveis · mapa de calor, vendas por
 * maquininha e recusadas · a conferência com o extrato (só quem administra).
 *
 * ⚠️ A variação contra o período anterior é TEXTO com sinal, na tinta: número
 * não tem cor por sinal (as pílulas coloridas são exceções declaradas de
 * outras telas, e esta não é uma delas).
 *
 * DESENHO DA HOME (26/10/2026, pedido do dono): os números nos cards da Home,
 * a caixa da Quattro AI com perguntas sobre a maquininha, e quatro cards de
 * mexer — meta do mês, antecipar a agenda, quanto cobrar e pedir mais uma
 * maquininha. Sem maquininha, a página é a OFERTA (`OfertaMaquininha`): pedir
 * uma, simular taxas ou pedir o vínculo da que a empresa já tem.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarrasDestaque, BRL, Button, Card, CartaoBiblioteca, CurrencyInput, Icon, InfoHint, ListaProgresso, MapaCalorGrade, MetaCirculo, PizzaFatias, RoscaFatias,
  type CelulaCalor,
} from "@/components/ui";
import { MaquininhaMockup } from "@/components/maquininha/MaquininhaMockup";
import { OfertaMaquininha } from "@/components/maquininha/OfertaMaquininha";
import { precoParaReceber, ritmoDaMeta, simularAntecipacao } from "@/core/maquininha/oferta";
import { SEGMENTO_PADRAO, taxaDaOferta } from "@/lib/maquininha-oferta";
import { POS_DEFAULT } from "@/lib/pos-taxas";
import { gravarPreferencia, lerPreferencia } from "@/lib/store-org";
import { usePermissoes } from "@/components/app/usePermissoes";
import { PinbankConferencia } from "@/components/administracao/PinbankConferencia";
import { SeletorPeriodoMaquininha } from "@/components/visao-geral/MaquininhaRecentes";
import { diaEHora } from "@/core/pinbank/recentes";
import {
  janelaMaquininha, linhasPlanilhaMaquininha, nomeArquivoMaquininha, montarRelatorioMaquininha, somaDiasISO,
  type PeriodoMaquininha, type RelatorioMaquininha,
} from "@/core/pinbank/relatorio";
import { lerPinbank, lerRelatorioMaquininha } from "@/lib/pinbank/cliente";
import { isDemo } from "@/lib/demo";
import { formatBRL, pct } from "@/lib/format";
import { baixarXLSX } from "@/lib/xlsx";

const LISTA_INICIAL = 12;

const NOME_PERIODO: Record<PeriodoMaquininha, string> = { dia: "hoje", semana: "nesta semana", mes: "neste mês" };

/** "+12,4% sobre ontem" · "−3,0% sobre …" · "sem base de comparação". */
function fraseVariacao(r: RelatorioMaquininha): string {
  const v = r.resumo.variacao;
  if (v == null) return `sem vendas ${r.janela.anterior.rotulo === "ontem" ? "ontem" : `em ${r.janela.anterior.rotulo}`} para comparar`;
  return `${v > 0 ? "+" : ""}${pct(v)} sobre ${r.janela.anterior.rotulo}`;
}

const cartao = { background: "var(--color-white)", borderRadius: "var(--a4p-box-radius)" } as const;

/** O card pequeno da Home: rótulo, número grande e a linha de baixo. */
function Numero({ titulo, info, valor, detalhe }: {
  titulo: string; info: { oQue: string; comoCalcula?: string }; valor: React.ReactNode; detalhe: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-7 py-[22px] min-w-0" style={cartao}>
      <span className="inline-flex items-center gap-2">
        <span className="text-[15px] text-muted">{titulo}</span>
        <InfoHint align="left" titulo={titulo} oQue={info.oQue} comoCalcula={info.comoCalcula} />
      </span>
      <span className="tabular-nums text-ink" style={{ fontSize: 30, lineHeight: 1, fontWeight: 600 }}>{valor}</span>
      <span className="text-[12px] text-muted tabular-nums">{detalhe}</span>
    </div>
  );
}

const CHAVE_META = "a4p_maquininha_meta";

/** Meta de vendas do mês: o círculo enche com o vendido e a frase diz o ritmo. */
function CardMeta({ vendidoNoMes, hoje }: { vendidoNoMes: number; hoje: string }) {
  const [meta, setMeta] = React.useState(0);
  React.useEffect(() => setMeta(lerPreferencia<number>(CHAVE_META, 0)), []);
  const mudar = (v: number) => { setMeta(v); gravarPreferencia(CHAVE_META, v); };
  const r = ritmoDaMeta(vendidoNoMes, meta, hoje);
  return (
    <section className="flex flex-col gap-4 p-6 min-w-0" style={cartao}>
      <span className="inline-flex items-center gap-2">
        <span className="text-[15px] text-ink">Meta do mês</span>
        <InfoHint align="left" oQue="Um alvo de vendas para o mês, para acompanhar o ritmo. Fica só neste navegador." comoCalcula="Vendido no mês ÷ meta. A projeção é o vendido ÷ dias passados × dias do mês; o por dia é o que falta ÷ os dias que restam." />
      </span>
      <CurrencyInput label="Quanto quer vender no mês" value={meta} onValueChange={mudar} />
      {r.fracao != null ? (
        <MetaCirculo atual={vendidoNoMes} meta={meta} tamanho={96} ariaLabel={`Vendido ${formatBRL(vendidoNoMes)} de ${formatBRL(meta)}`} rotuloAtual="Vendido" rotuloResto="Falta" />
      ) : null}
      <p className="text-[13px] text-ink m-0">{r.frase}</p>
      <span className="text-[12px] text-muted tabular-nums">
        {r.projecao != null ? `No ritmo de agora: ${formatBRL(r.projecao)} no mês.` : "Sem vendas no mês ainda."}
        {r.porDia != null ? ` Para bater: ${formatBRL(r.porDia)} por dia.` : ""}
      </span>
    </section>
  );
}

/** Antecipar a agenda: escolhe até quando, vê quanto cai amanhã e quanto custa. */
function CardAntecipar({ dias, hoje }: { dias: { dia: string; valor: number }[]; hoje: string }) {
  const futuros = dias.filter((d) => d.dia > hoje && d.valor > 0);
  const ultimo = futuros.length
    ? Math.max(1, Math.round((Date.parse(`${futuros[futuros.length - 1].dia}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000))
    : 0;
  const [ate, setAte] = React.useState(30);
  const limite = Math.min(Math.max(1, ate), Math.max(1, ultimo));
  const a = simularAntecipacao(futuros, hoje, POS_DEFAULT.taxaAntecipMensal, limite);
  return (
    <section className="flex flex-col gap-4 p-6 min-w-0" style={cartao}>
      <span className="inline-flex items-center gap-2">
        <span className="text-[15px] text-ink">Antecipar recebíveis</span>
        <InfoHint align="left" oQue="Quanto cairia amanhã se você antecipasse os repasses da agenda, e quanto custaria." comoCalcula={`Cada repasse paga ${pct(POS_DEFAULT.taxaAntecipMensal)} ao mês, proporcional aos dias que faltam (taxa de referência; vale a do seu contrato).`} />
      </span>
      {ultimo === 0 ? <SemDado>Nenhum repasse futuro para antecipar.</SemDado> : (
        <>
          <label className="flex flex-col gap-2">
            <span className="text-[13px] text-muted">Repasses dos próximos <span className="text-ink tabular-nums">{limite} {limite === 1 ? "dia" : "dias"}</span></span>
            <input type="range" min={1} max={ultimo} value={limite} onChange={(e) => setAte(Number(e.target.value))} className="w-full accent-ink" aria-label="Antecipar repasses até quantos dias" />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-muted">Cairia amanhã</span>
            <span className="tabular-nums text-ink" style={{ fontSize: 30, lineHeight: 1, fontWeight: 600 }}><BRL value={a.liquidoHoje} /></span>
            <span className="text-[12px] text-muted tabular-nums">
              {a.quantidade} {a.quantidade === 1 ? "repasse" : "repasses"} · {formatBRL(a.bruto)} na agenda · custo de {formatBRL(a.custo)}{a.fracao != null ? ` (${pct(a.fracao, 2)})` : ""}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

/** Quanto cobrar para receber um valor livre de taxa. */
function CardQuantoCobrar({ observadas }: { observadas: { chave: string; nome: string; taxa: number }[] }) {
  const opcoes = React.useMemo(() => {
    if (observadas.length) return observadas;
    const t = taxaDaOferta(SEGMENTO_PADRAO);
    const ref: { chave: string; nome: string; taxa: number | null }[] = [
      { chave: "pix", nome: "Pix", taxa: t("pix", 0, false) },
      { chave: "debito", nome: "Débito", taxa: t("debito", 0, false) },
      { chave: "credito", nome: "Crédito à vista", taxa: t("credito", 1, false) },
      { chave: "parcelado", nome: "Parcelado em 6x", taxa: t("parcelado", 6, false) },
    ];
    return ref.filter((x): x is { chave: string; nome: string; taxa: number } => x.taxa != null);
  }, [observadas]);
  const [liquido, setLiquido] = React.useState(100);
  const [forma, setForma] = React.useState<string>("");
  const escolhida = opcoes.find((o) => o.chave === forma) ?? opcoes[0];
  const preco = escolhida ? precoParaReceber(liquido, escolhida.taxa) : null;
  return (
    <section className="flex flex-col gap-4 p-6 min-w-0" style={cartao}>
      <span className="inline-flex items-center gap-2">
        <span className="text-[15px] text-ink">Quanto cobrar</span>
        <InfoHint align="left" oQue="O preço que deixa você receber o valor que quer, já descontada a taxa da maquininha." comoCalcula={observadas.length ? "Valor desejado ÷ (1 − taxa). A taxa de cada forma é a que a maquininha cobrou no período (custo ÷ vendido)." : "Valor desejado ÷ (1 − taxa). Sem vendas com título no período, usa a taxa de referência."} />
      </span>
      <CurrencyInput label="Quero receber" value={liquido} onValueChange={setLiquido} />
      <div role="radiogroup" aria-label="Forma de pagamento" className="flex flex-wrap gap-2">
        {opcoes.map((o) => {
          const ativo = o.chave === escolhida?.chave;
          return (
            <button key={o.chave} type="button" role="radio" aria-checked={ativo} onClick={() => setForma(o.chave)} className="h-9 px-3 rounded-pill text-[13px]"
              style={ativo ? { background: "var(--erp-num-cor)", color: "var(--color-surface-1)" } : { background: "var(--color-surface-1)", color: "var(--color-ink)" }}>
              {o.nome}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-muted">Cobre</span>
        <span className="tabular-nums text-ink" style={{ fontSize: 30, lineHeight: 1, fontWeight: 600 }}>{preco == null ? "—" : <BRL value={preco} />}</span>
        <span className="text-[12px] text-muted tabular-nums">{escolhida ? `taxa de ${pct(escolhida.taxa, 2)} no ${escolhida.nome.toLowerCase()}` : "sem taxa para calcular"}</span>
      </div>
    </section>
  );
}

function SemDado({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-muted m-0 py-6">{children}</p>;
}

function nivelDe(valor: number, maximo: number): CelulaCalor["nivel"] {
  if (valor <= 0 || maximo <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((valor / maximo) * 4))) as CelulaCalor["nivel"];
}

export function MaquininhaQuattro() {
  const [periodo, setPeriodo] = React.useState<PeriodoMaquininha>("semana");
  const [todas, setTodas] = React.useState(false);
  // `?ver=oferta` abre a oferta mesmo com maquininha (pedir mais uma, ou ver a
  // página que a empresa sem maquininha vê — útil na demonstração).
  const [verOferta, setVerOferta] = React.useState(false);
  React.useEffect(() => {
    setVerOferta(new URLSearchParams(window.location.search).get("ver") === "oferta");
  }, []);
  const hoje = diaEHora(new Date().toISOString()).dia;
  // Desde o começo do mês anterior (ou 4 semanas, o que vier antes): cobre os
  // três períodos, a comparação e o mapa de calor.
  const desde = React.useMemo(() => {
    const a = janelaMaquininha("mes", hoje).anterior.de;
    const b = somaDiasISO(hoje, -27);
    return a < b ? a : b;
  }, [hoje]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["maquininha", "relatorio", desde],
    queryFn: () => lerRelatorioMaquininha(desde),
    refetchInterval: 60_000,
  });
  const permissoes = usePermissoes();
  const administra = !isDemo && permissoes.pode("administrar");
  const pinbank = useQuery({ queryKey: ["pinbank", "estado"], queryFn: lerPinbank, enabled: administra });
  const vinculoConferencia = pinbank.data?.vinculos.find((v) => v.ativo) ?? null;

  const r = React.useMemo(
    () => (data ? montarRelatorioMaquininha(data.linhas, data.titulos, hoje, periodo) : null),
    [data, hoje, periodo],
  );
  React.useEffect(() => setTodas(false), [periodo]);
  // A meta é do MÊS, qualquer que seja o período escolhido.
  const vendidoNoMes = React.useMemo(
    () => (data ? montarRelatorioMaquininha(data.linhas, data.titulos, hoje, "mes").resumo.vendido : 0),
    [data, hoje],
  );

  const nomeMaquininha = React.useCallback(
    (id: string | null) => data?.maquininhas.find((m) => m.id === id)?.nome ?? "Maquininha",
    [data],
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[120px] animate-pulse" style={{ background: "var(--color-white)", borderRadius: "var(--a4p-box-radius)" }} />)}
      </div>
    );
  }
  if (error) {
    return <Card><SemDado>Não foi possível ler as vendas da maquininha agora. Tente de novo em instantes.</SemDado></Card>;
  }
  if (!data?.temMaquininha || !r) {
    // Vínculo feito pela plataforma e ainda não ativado pela empresa: a oferta
    // abre com o aviso de ativar em Integrações.
    return <OfertaMaquininha vinculosPendentes={data?.maquininhas.length ?? 0} />;
  }
  if (verOferta) {
    return (
      <div className="flex flex-col gap-4">
        <button type="button" onClick={() => setVerOferta(false)} className="self-start text-[13px] text-muted hover:text-ink inline-flex items-center gap-1">
          <Icon name="arrow-left" size={14} strokeWidth={1.75} /> Voltar aos relatórios da maquininha
        </button>
        <OfertaMaquininha />
      </div>
    );
  }

  const { resumo, custos, agenda } = r;
  const formas = r.porForma.map((f) => ({ chave: f.chave, nome: f.nome, valor: f.valor }));
  const bandeiras = r.porBandeira.map((f) => ({ chave: f.chave, nome: f.nome, valor: f.valor }));
  const lista = todas ? r.vendas : r.vendas.slice(0, LISTA_INICIAL);
  const celulas: CelulaCalor[][] = r.calor.valores.map((linha, i) => linha.map((v, j) => ({
    chave: `${i}-${j}`, nivel: nivelDe(v, r.calor.maximo),
    titulo: `${r.calor.linhas[i]}, ${r.calor.colunas[j]}: ${formatBRL(v)}`,
  })));

  const taxasObservadas = (custos?.porForma ?? [])
    .filter((f) => f.percentual != null && f.percentual >= 0 && f.percentual < 1)
    .map((f) => ({ chave: f.forma, nome: f.nome, taxa: f.percentual as number }));

  const exportar = () => {
    baixarXLSX(nomeArquivoMaquininha(r), [{ nome: "Vendas", linhas: linhasPlanilhaMaquininha(r, nomeMaquininha) }]);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Período */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <SeletorPeriodoMaquininha valor={periodo} onChange={setPeriodo} />
          <span className="text-[13px] text-muted">{r.janela.rotulo}</span>
          {data.exemplo && <span className="text-[12px] text-muted">· vendas de exemplo (demonstração)</span>}
        </div>
        <Button variant="secondary" onClick={exportar} disabled={r.vendas.length === 0}>Exportar planilha</Button>
      </div>

      {/* Os quatro números */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Numero
          titulo="Vendido"
          info={{ oQue: "Quanto a maquininha vendeu no período, só as vendas aprovadas.", comoCalcula: "Soma das vendas aprovadas avisadas pela Pinbank. A comparação é com o mesmo trecho do período anterior (na quarta, segunda a quarta da semana passada)." }}
          valor={<BRL value={resumo.vendido} />}
          detalhe={fraseVariacao(r)}
        />
        <Numero
          titulo="Líquido a receber"
          info={{ oQue: "O que sobra das vendas do período depois da taxa, da tarifa por venda e da antecipação.", comoCalcula: "Receita lançada − taxa (MDR) − tarifa fixa − antecipação − estornos, pelos títulos que cada venda gerou no sistema." }}
          valor={custos ? <BRL value={custos.liquido} /> : "—"}
          detalhe={custos ? `custo de ${custos.percentual == null ? "—" : pct(custos.percentual, 2)} das vendas` : "as vendas do período ainda não geraram títulos"}
        />
        <Numero
          titulo="Ticket médio"
          info={{ oQue: "O valor médio de cada venda aprovada no período.", comoCalcula: "Vendido ÷ número de vendas aprovadas." }}
          valor={resumo.ticketMedio == null ? "—" : <BRL value={resumo.ticketMedio} />}
          detalhe={`${resumo.quantidade} ${resumo.quantidade === 1 ? "venda aprovada" : "vendas aprovadas"} ${NOME_PERIODO[periodo]}`}
        />
        <Numero
          titulo="Taxa de aprovação"
          info={{ oQue: "De cada 100 tentativas na maquininha, quantas foram aprovadas.", comoCalcula: "Aprovadas ÷ (aprovadas + negadas + canceladas + desfeitas + reembolsadas). Pendentes ficam de fora até a Pinbank decidir." }}
          valor={resumo.aprovacao == null ? "—" : pct(resumo.aprovacao)}
          detalhe={resumo.tentativas === 0 ? "nenhuma tentativa no período" : `${resumo.tentativas - resumo.quantidade} de ${resumo.tentativas} sem aprovação`}
        />
      </div>

      {/* Os cards de mexer */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <CardMeta vendidoNoMes={vendidoNoMes} hoje={hoje} />
        <CardAntecipar dias={agenda.dias} hoje={hoje} />
        <CardQuantoCobrar observadas={taxasObservadas} />
        <section className="flex flex-col gap-4 p-6 min-w-0" style={cartao}>
          <span className="text-[15px] text-ink">Mais um ponto de venda?</span>
          <div className="flex items-start gap-4 flex-1">
            <p className="text-[13px] text-muted m-0 flex-1">
              Peça outra maquininha para o balcão, o delivery ou uma nova loja. As vendas de todas aparecem juntas aqui, separadas por maquininha.
            </p>
            <MaquininhaMockup altura={96} decorativa />
          </div>
          <Button variant="secondary" onClick={() => setVerOferta(true)}>Pedir outra maquininha</Button>
        </section>
      </div>

      {/* Evolução */}
      <CartaoBiblioteca
        titulo="Evolução das vendas"
        info={{ oQue: "Quanto a maquininha vendeu em cada trecho do período.", comoCalcula: periodo === "dia" ? "Vendas aprovadas de hoje, a cada 2 horas." : "Vendas aprovadas por dia. Os dias que ainda não chegaram aparecem vazios." }}
        valor={<BRL value={resumo.vendido} />}
        subtitulo={r.janela.rotulo}
      >
        {resumo.vendido === 0 ? <SemDado>Nenhuma venda aprovada {NOME_PERIODO[periodo]}.</SemDado> : (
          <BarrasDestaque
            dados={r.evolucao.map((p) => ({ label: p.label, valor: p.valor, futuro: p.futuro }))}
            ariaLabel={`Vendas da maquininha ${NOME_PERIODO[periodo]}, total de ${formatBRL(resumo.vendido)}`}
            formatar={(v) => <BRL value={v} />}
          />
        )}
      </CartaoBiblioteca>

      {/* Formas e bandeiras */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CartaoBiblioteca
          titulo="Vendas por forma de pagamento"
          info={{ oQue: "Como os clientes pagaram: Pix, débito, crédito à vista ou parcelado.", comoCalcula: "Soma das vendas aprovadas do período por forma, como a Pinbank avisou." }}
        >
          {formas.length === 0 ? <SemDado>Sem vendas aprovadas no período.</SemDado> : (
            <PizzaFatias fatias={formas} ariaLabel={`Vendas por forma: ${r.porForma.map((f) => `${f.nome} ${pct(f.fracao)}`).join(", ")}`} />
          )}
        </CartaoBiblioteca>
        <CartaoBiblioteca
          titulo="Vendas por bandeira"
          info={{ oQue: "Em que bandeira de cartão as vendas passaram (o Pix aparece à parte).", comoCalcula: "Soma das vendas aprovadas do período pela bandeira que a Pinbank informou." }}
        >
          {bandeiras.length === 0 ? <SemDado>Sem vendas aprovadas no período.</SemDado> : (
            <RoscaFatias fatias={bandeiras} ariaLabel={`Vendas por bandeira: ${r.porBandeira.map((f) => `${f.nome} ${pct(f.fracao)}`).join(", ")}`} />
          )}
        </CartaoBiblioteca>
      </div>

      {/* Transações do período */}
      <Card className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13.5px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Transações {NOME_PERIODO[periodo]}</span>
          <span className="text-[12px] text-muted tabular-nums">{r.vendas.length} {r.vendas.length === 1 ? "transação" : "transações"}</span>
        </div>
        {r.vendas.length === 0 ? <SemDado>Nenhuma transação {NOME_PERIODO[periodo]}.</SemDado> : (
          <>
            <ul className="flex flex-col m-0 p-0 list-none">
              {lista.map((v) => (
                <li key={v.nsu} className="flex items-center justify-between gap-3 py-[10px] border-t" style={{ borderColor: "var(--erp-menu-borda)" }}>
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="text-[13px] text-muted tabular-nums flex-none w-[110px]">{v.semana} {v.dia.slice(8, 10)}/{v.dia.slice(5, 7)} {v.hora}</span>
                    <span className="text-[14px] text-ink truncate">{v.descricao}</span>
                    {(data.maquininhas.length > 1) && <span className="text-[12px] text-muted truncate hidden md:inline">{nomeMaquininha(v.vinculoId)}</span>}
                    {!v.aprovada && (
                      <span className="flex-none text-[11px] font-medium px-[10px] py-[3px] rounded-pill text-muted" style={{ background: "var(--color-surface-1)" }}>{v.status}</span>
                    )}
                  </span>
                  <span className={`flex-none text-[14px] tabular-nums ${v.aprovada ? "text-ink" : "text-muted line-through"}`}><BRL value={v.valor} /></span>
                </li>
              ))}
            </ul>
            {r.vendas.length > LISTA_INICIAL && (
              <button type="button" onClick={() => setTodas((x) => !x)} className="self-start text-[13px] text-muted hover:text-ink pt-2">
                {todas ? "Mostrar menos" : `Mostrar todas as ${r.vendas.length}`}
              </button>
            )}
          </>
        )}
      </Card>

      {/* Custo das taxas e agenda de recebíveis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CartaoBiblioteca
          titulo="Quanto a maquininha custou"
          info={{ oQue: "O que a Pinbank cobrou das vendas do período: a taxa (MDR), a tarifa fixa por venda e a antecipação.", comoCalcula: "Soma dos títulos de taxa, tarifa e antecipação que cada venda do período gerou, com as taxas do seu contrato." }}
          valor={custos ? <BRL value={custos.total} /> : "—"}
          subtitulo={custos ? `${custos.percentual == null ? "—" : pct(custos.percentual, 2)} do vendido · taxa ${formatBRL(custos.taxa)} · tarifa ${formatBRL(custos.tarifa)} · antecipação ${formatBRL(custos.antecipacao)}` : undefined}
        >
          {!custos ? <SemDado>As vendas do período ainda não geraram títulos de taxa. Confira as taxas do contrato em Integrações.</SemDado> : (
            <div className="flex flex-col gap-3">
              <ListaProgresso
                ariaLabel="Custo da maquininha por forma de pagamento"
                itens={custos.porForma.map((f) => ({ chave: f.forma, nome: `${f.nome} · ${f.percentual == null ? "—" : pct(f.percentual, 2)} do vendido`, valor: f.custo, fracao: custos.total > 0 ? f.custo / custos.total : 0 }))}
              />
              {custos.estornos > 0 && <span className="text-[12px] text-muted">Estornos no período: <BRL value={custos.estornos} /></span>}
            </div>
          )}
        </CartaoBiblioteca>
        <CartaoBiblioteca
          titulo="Agenda de recebíveis"
          info={{ oQue: "Quando o dinheiro das vendas cai na conta, já descontadas as taxas.", comoCalcula: "Os títulos da maquininha ainda não baixados, por data de repasse do contrato (receita − taxa − tarifa − antecipação)." }}
          valor={<BRL value={agenda.total} />}
          subtitulo={agenda.proximo ? `próximo repasse: ${agenda.proximo.rotulo}` : "nenhum repasse previsto"}
        >
          {agenda.dias.length === 0 ? <SemDado>Nenhum repasse da maquininha previsto.</SemDado> : (
            <ul className="flex flex-col m-0 p-0 list-none max-h-[280px] overflow-y-auto" tabIndex={0} aria-label="Repasses previstos">
              {agenda.dias.map((d) => (
                <li key={d.dia} className="flex items-center justify-between gap-3 py-[8px] border-t" style={{ borderColor: "var(--erp-menu-borda)" }}>
                  <span className="text-[13px] text-ink">{d.rotulo}</span>
                  <span className="flex items-center gap-3">
                    {d.parcelas > 0 && <span className="text-[12px] text-muted tabular-nums">{d.parcelas} {d.parcelas === 1 ? "parcela" : "parcelas"}</span>}
                    <span className="text-[14px] text-ink tabular-nums"><BRL value={d.valor} /></span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {agenda.atrasado !== 0 && (
            <p className="text-[12px] text-muted m-0 pt-2">Repasses vencidos ainda não baixados: <BRL value={agenda.atrasado} />. Confira a conciliação.</p>
          )}
        </CartaoBiblioteca>
      </div>

      {/* Mapa de calor, por maquininha e recusadas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CartaoBiblioteca
          className="lg:col-span-2"
          titulo="Quando você mais vende"
          info={{ oQue: "Os dias e horários de maior movimento nas últimas 4 semanas, para planejar equipe e estoque.", comoCalcula: "Soma das vendas aprovadas dos últimos 28 dias por dia da semana e faixa de horário. Quanto mais escuro, mais vendido." }}
          subtitulo="Últimas 4 semanas"
        >
          {r.calor.maximo === 0 ? <SemDado>Sem vendas nas últimas 4 semanas.</SemDado> : (
            <MapaCalorGrade colunas={r.calor.colunas} linhas={r.calor.linhas} celulas={celulas} ariaLabel="Vendas por dia da semana e horário nas últimas 4 semanas" />
          )}
        </CartaoBiblioteca>
        <div className="flex flex-col gap-4">
          <CartaoBiblioteca
            titulo="Vendas por maquininha"
            info={{ oQue: "Quanto cada maquininha da empresa vendeu no período.", comoCalcula: "Soma das vendas aprovadas pelo vínculo que recebeu o aviso da Pinbank." }}
          >
            {r.porMaquininha.length === 0 ? <SemDado>Sem vendas aprovadas no período.</SemDado> : (
              <ListaProgresso
                ariaLabel="Vendas por maquininha"
                itens={r.porMaquininha.map((m) => ({ chave: m.vinculoId || "sem", nome: `${nomeMaquininha(m.vinculoId || null)} · ${m.quantidade} ${m.quantidade === 1 ? "venda" : "vendas"}`, valor: m.valor, fracao: m.fracao }))}
              />
            )}
          </CartaoBiblioteca>
          <CartaoBiblioteca
            titulo="Sem aprovação"
            info={{ oQue: "Tentativas que não viraram venda: negadas pelo emissor, canceladas, desfeitas ou reembolsadas.", comoCalcula: "Contagem e soma por situação, no período." }}
          >
            {resumo.recusadas.length === 0 ? <SemDado>Todas as tentativas do período foram aprovadas.</SemDado> : (
              <ul className="flex flex-col m-0 p-0 list-none">
                {resumo.recusadas.map((x) => (
                  <li key={x.status} className="flex items-center justify-between gap-3 py-[8px] border-t" style={{ borderColor: "var(--erp-menu-borda)" }}>
                    <span className="text-[13px] text-ink">{x.status} <span className="text-muted tabular-nums">· {x.quantidade}</span></span>
                    <span className="text-[13px] text-muted tabular-nums"><BRL value={x.valor} /></span>
                  </li>
                ))}
              </ul>
            )}
          </CartaoBiblioteca>
        </div>
      </div>

      {/* Conferência com o extrato da Pinbank (só quem administra, em produção) */}
      {administra && vinculoConferencia && (
        <Card className="flex flex-col gap-2">
          <span className="text-[13.5px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Conferir com o extrato da Pinbank</span>
          <PinbankConferencia vinculo={vinculoConferencia} />
        </Card>
      )}

      <p className="text-[12px] text-muted m-0">
        {data.exemplo ? "Vendas de exemplo (demonstração)." : "Dados da Pinbank, avisados pela maquininha · atualiza a cada minuto."}
      </p>
    </div>
  );
}
