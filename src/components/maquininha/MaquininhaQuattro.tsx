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
 */
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  BarrasDestaque, BRL, Button, Card, CartaoBiblioteca, Icon, InfoHint, ListaProgresso, MapaCalorGrade, PizzaFatias, RoscaFatias,
  type CelulaCalor,
} from "@/components/ui";
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

const LINK_INTEGRACAO = "/dashboard/administration/integrations?cartao=maquininha-pinbank";
const LISTA_INICIAL = 12;

const NOME_PERIODO: Record<PeriodoMaquininha, string> = { dia: "hoje", semana: "nesta semana", mes: "neste mês" };

/** "+12,4% sobre ontem" · "−3,0% sobre …" · "sem base de comparação". */
function fraseVariacao(r: RelatorioMaquininha): string {
  const v = r.resumo.variacao;
  if (v == null) return `sem vendas ${r.janela.anterior.rotulo === "ontem" ? "ontem" : `em ${r.janela.anterior.rotulo}`} para comparar`;
  return `${v > 0 ? "+" : ""}${pct(v)} sobre ${r.janela.anterior.rotulo}`;
}

function Numero({ titulo, info, valor, detalhe }: {
  titulo: string; info: { oQue: string; comoCalcula?: string }; valor: React.ReactNode; detalhe: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-2 min-w-0">
      <span className="inline-flex items-center gap-2">
        <span className="text-[13.5px] font-medium" style={{ color: "var(--color-text-secondary)" }}>{titulo}</span>
        <InfoHint align="left" titulo={titulo} oQue={info.oQue} comoCalcula={info.comoCalcula} />
      </span>
      <span className="text-[26px] leading-none tabular-nums text-ink" style={{ fontWeight: 600 }}>{valor}</span>
      <span className="text-[12px] tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>{detalhe}</span>
    </Card>
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
    return (
      <Card className="flex flex-col items-start gap-3">
        <span className="w-10 h-10 rounded-pill flex items-center justify-center" style={{ background: "var(--color-surface-1)" }}>
          <Icon name="smartphone" size={18} strokeWidth={1.75} />
        </span>
        <p className="text-[15px] text-ink m-0">Sua maquininha ainda não está ligada.</p>
        <p className="text-[13px] text-muted m-0">Assim que ela estiver ativa em Integrações, as vendas, as taxas e os recebíveis aparecem aqui.</p>
        <Link href={LINK_INTEGRACAO} className="text-[13px] text-ink inline-flex items-center gap-1 hover:underline">
          Ligar em Integrações <Icon name="arrow-up-right" size={14} strokeWidth={1.75} />
        </Link>
      </Card>
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
