"use client";

/**
 * Consolidado multi-empresa — posição agregada das organizações em que o usuário
 * é membro (saldo, receita, despesa, resultado), por entidade e no total.
 *
 * ⚠️ CAMP-B · ANTES E DEPOIS DAS ELIMINAÇÕES. A tela dizia "sem eliminações
 * intercompany" enquanto o motor que elimina (`eliminacoesIntercompany`, ONDA
 * 13) já existia — e a receita do grupo carregava a fatura que uma empresa
 * manda à outra, dinheiro que nunca entrou no grupo. Agora a posição sai dos
 * LANÇAMENTOS de cada organização (`getRiscoInputPorOrg`) e
 * `montarPosicaoConsolidada` devolve a soma das partes, o consolidado depois
 * das eliminações e a lista de cada par eliminado (quem, quanto, competência).
 *
 * Sem a fonte por organização (migration 0020 pendente), a tela cai nos totais
 * da RPC `org_consolidado` e DIZ que não eliminou — nunca soma calada.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, BRL, DatePicker, Skeleton, Icon, InfoHint, type InfoConteudo } from "@/components/ui";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { getConsolidado, getRiscoInputPorOrg } from "@/lib/consolidado";
import { montarPosicaoConsolidada, CRITERIO_ELIMINACAO, type Totais } from "@/core/relatorios/posicao-consolidada";
import { ListaEliminacoes } from "./ListaEliminacoes";

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

interface LinhaEmpresa { id: string; nome: string; saldo: number; receita: number; despesa: number; resultado: number }

export function ConsolidadoView() {
  const [de, setDe] = React.useState(() => `${new Date().getFullYear()}-01-01`);
  const [ate, setAte] = React.useState(isoDia(new Date()));
  const totaisRpc = useQuery({ queryKey: ["consolidado", de, ate], queryFn: () => getConsolidado(de, ate) });
  const porOrg = useQuery({ queryKey: ["consolidado-por-org", de, ate], queryFn: () => getRiscoInputPorOrg(de, ate) });

  const posicao = React.useMemo(() => {
    const lista = porOrg.data;
    if (!lista || lista.length < 2) return null;
    return montarPosicaoConsolidada(lista.map((e) => ({ id: e.orgId, nome: e.nome, input: e.input })), de, ate);
  }, [porOrg.data, de, ate]);

  const carregando = totaisRpc.isLoading || porOrg.isLoading;
  const c = totaisRpc.data;
  const empresas: LinhaEmpresa[] = posicao
    ? posicao.empresas
    : (c?.entidades ?? []).map((e) => ({ id: e.orgId, nome: e.nome, saldo: e.saldo, receita: e.receita, despesa: e.despesa, resultado: e.resultado }));
  const antes: Totais | null = posicao ? posicao.antes : c ? { saldo: c.saldo, receita: c.receita, despesa: c.despesa, resultado: c.resultado } : null;
  const depois: Totais | null = posicao ? posicao.depois : antes;
  const eliminou = !!posicao && posicao.eliminacoes.length > 0;

  return (
    <AppShell title="Consolidado · multi-empresa" crumb="Relatórios" actions={isDemo ? <DemoBadge /> : null}>
      <div className="flex flex-col gap-5 pb-4">
        <Card className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <InfoHint align="left" titulo="Período do consolidado" oQue="Define a janela de datas usada para somar receita, despesa e resultado de todas as suas empresas." comoCalcula="Soma os lançamentos não cancelados de cada organização com vencimento entre De e Até; o saldo é a posição atual, independente do período." />
          <DatePicker label="De" value={de} onChange={setDe} max={ate} containerClassName="min-w-[150px]" />
          <DatePicker label="Até" value={ate} onChange={setAte} min={de} containerClassName="min-w-[150px]" />
          <span className="text-caption text-faint self-center ml-auto">
            {posicao ? "Agrega as organizações em que você é membro · com eliminações intercompany" : "Agrega as organizações em que você é membro"}
          </span>
        </Card>

        {carregando || !antes || !depois ? (
          <Card><Skeleton className="h-40 w-full" /></Card>
        ) : empresas.length === 0 ? (
          <Card className="flex flex-col items-start gap-2">
            <span className="text-h3 font-medium text-ink">Uma organização</span>
            <span className="text-caption text-muted">Você participa de uma única organização — não há o que consolidar. Adicione/participe de outras empresas (Configurações → Governança) para ver o consolidado.</span>
          </Card>
        ) : (
          <>
            {!posicao && (
              <Card>
                <p className="m-0 text-caption text-warning" role="status">
                  Os lançamentos por organização não estão disponíveis neste ambiente (migration 0020 pendente) — os totais
                  abaixo são a soma das partes, SEM eliminar as operações entre as empresas do grupo.
                </p>
              </Card>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" data-consolidado-cards>
              <Mini label="Saldo consolidado" v={depois.saldo} info={{ titulo: "Saldo consolidado", oQue: "O caixa disponível somado de todas as suas empresas.", comoCalcula: "Soma do saldo atual das contas de cada organização; não depende do período. Não sofre eliminação: o dinheiro que andou entre as empresas já saiu de uma conta e entrou na outra." }} />
              <Mini label="Receita (período)" v={depois.receita} antes={eliminou ? antes.receita : undefined} info={{ titulo: "Receita do período", oQue: "Tudo que as empresas faturaram de FORA do grupo na janela escolhida.", comoCalcula: "Soma das entradas de todas as organizações entre De e Até, menos as receitas cobradas de outra empresa do grupo (eliminações)." }} />
              <Mini label="Despesa (período)" v={depois.despesa} antes={eliminou ? antes.despesa : undefined} info={{ titulo: "Despesa do período", oQue: "Tudo que as empresas gastaram com FORA do grupo na janela escolhida.", comoCalcula: "Soma das saídas de todas as organizações entre De e Até, menos as despesas pagas a outra empresa do grupo (eliminações)." }} />
              <Mini label="Resultado" v={depois.resultado} info={{ titulo: "Resultado do período", oQue: "Quanto sobrou ou faltou no conjunto das empresas no período.", comoCalcula: "Receita menos despesa. A eliminação tira o mesmo valor dos dois lados, então o resultado é igual antes e depois dela." }} />
            </div>

            <Card padded={false} info={{ titulo: "Posição por empresa", oQue: "Mostra saldo, receita, despesa e resultado de cada organização, a soma das partes e o consolidado depois das eliminações.", comoCalcula: "Uma linha por empresa em que você é membro; 'Soma das partes' soma as colunas; 'Eliminações' tira os pares intercompany listados abaixo." }}>
              <div className="hidden sm:grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-3 px-5 py-2 text-[11px] font-medium tracking-[0.08em] text-faint border-b border-border-soft">
                <span>Empresa</span><span className="text-right">Saldo</span><span className="text-right">Receita</span><span className="text-right">Despesa</span><span className="text-right">Resultado</span>
              </div>
              {empresas.map((e, i) => (
                <div key={e.id} className={`grid grid-cols-2 sm:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-3 items-center px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                  <span className="text-[15px] font-medium text-ink truncate inline-flex items-center gap-2"><Icon name="building" size={14} color="var(--color-text-tertiary)" />{e.nome}</span>
                  <span className="text-caption tabular-nums sm:text-right text-ink"><BRL value={e.saldo} /></span>
                  <span className="text-caption tabular-nums sm:text-right text-muted"><BRL value={e.receita} /></span>
                  <span className="text-caption tabular-nums sm:text-right text-muted"><BRL value={e.despesa} /></span>
                  <span className="text-caption tabular-nums sm:text-right font-medium text-ink"><BRL value={e.resultado} /></span>
                </div>
              ))}
              {posicao && (
                <>
                  <LinhaTotal rotulo={`Soma das partes (${empresas.length})`} t={posicao.antes} fraca data="antes" />
                  <div className="grid grid-cols-2 sm:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-3 items-center px-5 py-2 border-t border-border-soft" data-linha-eliminacoes>
                    <span className="text-caption text-muted">(−) Eliminações intercompany ({posicao.eliminacoes.length})</span>
                    <span className="text-caption tabular-nums sm:text-right text-faint">—</span>
                    <span className="text-caption tabular-nums sm:text-right text-ink">{posicao.eliminadoReceita ? "−" : ""}<BRL value={posicao.eliminadoReceita} /></span>
                    <span className="text-caption tabular-nums sm:text-right text-ink">{posicao.eliminadoDespesa ? "−" : ""}<BRL value={posicao.eliminadoDespesa} /></span>
                    <span className="text-caption tabular-nums sm:text-right text-faint">—</span>
                  </div>
                </>
              )}
              <LinhaTotal rotulo={posicao ? "Consolidado" : `Consolidado (${empresas.length})`} t={depois} data="depois" />
            </Card>

            {posicao && (
              <Card className="flex flex-col gap-3" info={{ titulo: "Eliminações entre empresas", oQue: "As operações de uma empresa do grupo com outra, que somadas apareceriam como receita e despesa do grupo sem terem existido para ele.", comoCalcula: CRITERIO_ELIMINACAO }}>
                <span className="text-h3 font-medium text-ink">Eliminações entre empresas</span>
                <ListaEliminacoes eliminacoes={posicao.eliminacoes} />
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function LinhaTotal({ rotulo, t, fraca, data }: { rotulo: string; t: Totais; fraca?: boolean; data: string }) {
  const peso = fraca ? "font-medium" : "font-semibold";
  return (
    <div data-linha-total={data} className={`grid grid-cols-2 sm:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-3 items-center px-5 py-3 ${fraca ? "border-t border-border" : "border-t-2 border-border bg-surface-1/40"}`}>
      <span className={`text-[15px] ${peso} text-ink`}>{rotulo}</span>
      <span className={`text-caption tabular-nums sm:text-right ${peso} text-ink`}><BRL value={t.saldo} /></span>
      <span className={`text-caption tabular-nums sm:text-right ${peso} text-ink`}><BRL value={t.receita} /></span>
      <span className={`text-caption tabular-nums sm:text-right ${peso} text-ink`}><BRL value={t.despesa} /></span>
      <span className={`text-caption tabular-nums sm:text-right ${peso} text-ink`}><BRL value={t.resultado} /></span>
    </div>
  );
}

// Número não tem cor por sinal (decisão de 30/09/2026): o sinal escrito diz a
// direção — o `BRL` já escreve o "−" no resultado negativo.
function Mini({ label, v, antes, info }: { label: string; v: number; antes?: number; info?: InfoConteudo }) {
  return (
    <Card className="flex flex-col gap-1" info={info}>
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[18px] font-semibold tabular-nums text-ink"><BRL value={v} /></span>
      {antes !== undefined && (
        <span className="text-caption text-muted tabular-nums">antes das eliminações: <BRL value={antes} /></span>
      )}
    </Card>
  );
}
