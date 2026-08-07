"use client";

/**
 * DRE e DFC Multiempresas — a consolidação de até 20 empresas.
 *
 * Duas coisas mudam em relação à tela de uma empresa só: a seleção de
 * empresas (com o teto de 20) e o filtro de contas (só ativas × todas). O
 * relatório em si sai do MESMO motor — consolidar somando os relatórios
 * prontos dobraria a lógica e as duas somas divergiriam na primeira regra nova.
 *
 * A fonte é `getRiscoInputPorOrg` (RPC `org_movements`, migration 0020), que
 * devolve os LANÇAMENTOS de cada organização em que o usuário é membro. Totais
 * agregados não bastariam: a cascata classifica lançamento a lançamento.
 *
 * ⚠️ Permissão: no ERP de referência este recurso é gateado por permissão
 * específica ("Você não possui permissão de DRE Multiempresas em nenhuma
 * empresa"). Aqui o escopo é o mesmo do resto do sistema — as organizações em
 * que o usuário É MEMBRO, garantido dentro da própria RPC.
 */
import * as React from "react";
import { Card, Select, Icon, Skeleton, Checkbox, BRL } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { getRiscoInputPorOrg } from "@/lib/consolidado";
import {
  montarConsolidado, ESTRUTURA_DRE, ESTRUTURA_DFC, MAX_EMPRESAS,
  type RelatorioConsolidado,
} from "@/core/relatorios";
import {
  FiltrosRelatorio, PainelLayout, TabelaRelatorio, GavetaTransacoes, BotoesExportar,
  filtroPadrao, LAYOUT_PADRAO,
  type FiltrosRelatorioValor, type LayoutTabela, type CelulaClicada,
} from "./kit";
import type { RiskInput } from "@/core/risk-engine/types";

export function MultiempresaView({ tipo }: { tipo: "dre" | "dfc" }) {
  const { data: input, isLoading } = useRiscoInput();
  const [entidades, setEntidades] = React.useState<{ orgId: string; nome: string; input: RiskInput }[] | null>(null);
  /** null = ainda carregando · false = a RPC não existe (migration pendente). */
  const [fontePorOrg, setFontePorOrg] = React.useState<boolean | null>(null);
  const [selecionadas, setSelecionadas] = React.useState<string[]>([]);
  const [contasFiltro, setContasFiltro] = React.useState<"ativas" | "todas">("ativas");
  const [rascunho, setRascunho] = React.useState<FiltrosRelatorioValor>(filtroPadrao);
  const [aplicados, setAplicados] = React.useState<FiltrosRelatorioValor | null>(null);
  const [layout, setLayout] = React.useState<LayoutTabela>(LAYOUT_PADRAO);
  const [celula, setCelula] = React.useState<CelulaClicada | null>(null);

  // Os lançamentos por organização são buscados para a JANELA aplicada: puxar
  // o histórico inteiro de N empresas para mostrar um trimestre seria desperdício.
  const janela = aplicados?.intervalo ?? rascunho.intervalo;
  React.useEffect(() => {
    let vivo = true;
    getRiscoInputPorOrg(janela.de, janela.ate)
      .then((r) => {
        if (!vivo) return;
        setFontePorOrg(r !== null);
        const lista = r ?? (input ? [{ orgId: "atual", nome: "Empresa atual", input }] : []);
        setEntidades(lista);
        setSelecionadas((s) => (s.length ? s.filter((x) => lista.some((e) => e.orgId === x)) : lista.map((e) => e.orgId)));
      })
      .catch(() => { if (vivo) { setFontePorOrg(false); setEntidades([]); } });
    return () => { vivo = false; };
  }, [janela.de, janela.ate, input]);

  /**
   * Cada entidade precisa de um `RiskInput` próprio para o motor rodar. O
   * `/consolidado` já resolve a agregação por organização via RPC; enquanto
   * essa fonte por-organização não expõe os lançamentos, a consolidação roda
   * sobre a organização ATIVA e as demais entram como coluna informativa — e a
   * tela diz isso, em vez de somar número inventado.
   */
  const consolidado: RelatorioConsolidado | null = React.useMemo(() => {
    if (!aplicados) return null;
    const escolhidas = (entidades ?? []).filter((e) => selecionadas.includes(e.orgId)).slice(0, MAX_EMPRESAS);
    const lista = escolhidas.length > 0
      ? escolhidas.map((e) => ({ id: e.orgId, nome: e.nome, input: e.input }))
      : input ? [{ id: "atual", nome: "Empresa atual", input }] : [];
    if (lista.length === 0) return null;
    return montarConsolidado(lista, tipo === "dre" ? ESTRUTURA_DRE : ESTRUTURA_DFC, {
      intervalo: aplicados.intervalo, tipo: aplicados.tipo,
      conta: aplicados.conta, projeto: aplicados.projeto, centro: aplicados.centro,
      regime: tipo === "dre" ? "competencia" : "caixa",
    });
  }, [input, aplicados, entidades, selecionadas, tipo]);

  const titulo = tipo === "dre" ? "DRE Multiempresas" : "DFC Multiempresas";
  const nEmpresas = entidades?.length ?? 0;
  const podeGerar = selecionadas.length > 0 && selecionadas.length <= MAX_EMPRESAS;

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted">
          {tipo === "dre" ? "Demonstrativo consolidado de resultado." : "Demonstrativo consolidado de fluxo de caixa."}{" "}
          Selecione até {MAX_EMPRESAS} empresas para gerar o relatório.
        </p>
        {consolidado && <BotoesExportar nome={`${tipo}-multiempresas`} relatorio={consolidado.consolidado} layout={layout} />}
      </div>

      <FiltrosRelatorio
        valor={rascunho}
        onChange={setRascunho}
        onAtualizar={() => podeGerar && setAplicados(rascunho)}
        extra={
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div className="flex flex-col gap-[6px]">
              <label className="text-caption font-medium text-muted">
                Empresas<span className="text-negative"> *</span>
              </label>
              {entidades === null ? (
                <Skeleton className="h-[42px]" />
              ) : nEmpresas === 0 ? (
                <div className="rounded-md bg-surface-2 px-3 py-[10px] text-caption text-muted">
                  Nenhuma organização com lançamentos no período — o relatório sai da empresa atual.
                </div>
              ) : (
                <div className="rounded-md bg-surface-2 p-3 max-h-[160px] overflow-y-auto flex flex-col gap-2">
                  {entidades.map((e) => (
                    <Checkbox
                      key={e.orgId}
                      checked={selecionadas.includes(e.orgId)}
                      onChange={() => setSelecionadas((s) =>
                        s.includes(e.orgId) ? s.filter((x) => x !== e.orgId)
                          // O teto de 20 é do formato do relatório: além disso a
                          // tabela deixa de ser legível.
                          : s.length >= MAX_EMPRESAS ? s : [...s, e.orgId])}
                      label={e.nome}
                    />
                  ))}
                </div>
              )}
              <span className="text-caption text-faint tabular-nums">
                Empresas ({selecionadas.length}/{nEmpresas} · máx. {MAX_EMPRESAS})
              </span>
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="text-caption font-medium text-muted">Filtrar contas</label>
              <Select
                value={contasFiltro}
                onChange={(v) => setContasFiltro(v as "ativas" | "todas")}
                options={[
                  { value: "ativas", label: "Apenas contas ativas" },
                  { value: "todas", label: "Todas as contas" },
                ]}
              />
            </div>
          </div>
        }
      />

      <PainelLayout layout={layout} onChange={setLayout} />

      {isLoading ? (
        <Card><Skeleton className="h-[300px]" /></Card>
      ) : !consolidado ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <Icon name="layers" size={20} color="var(--color-text-tertiary)" />
            <p className="m-0 text-label text-muted max-w-[46ch]">
              Escolha o período e as empresas e clique em <b className="text-ink">Atualizar</b> para gerar o relatório consolidado.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <span className="text-h3 font-semibold text-ink">Empresas no consolidado</span>
            {fontePorOrg === false && (
              <p className="m-0 mt-2 text-caption text-warning">
                A fonte por organização ainda não está disponível neste ambiente (migration 0020 pendente) —
                o relatório sai da empresa atual.
              </p>
            )}
            <div className="flex flex-col mt-3">
              {consolidado.empresas.map((e) => {
                const linha = e.relatorio.linhas.find((l) => l.id === (tipo === "dre" ? "receita_bruta" : "entradas_operacionais"));
                return (
                  <div key={e.id} className="flex items-baseline justify-between gap-3 py-2 border-b border-border-soft last:border-0">
                    <span className="text-label text-ink truncate">{e.nome}</span>
                    <span className="text-label text-ink tabular-nums shrink-0">
                      <BRL value={linha?.total.valor ?? 0} />
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="m-0 mt-3 text-caption text-faint">
              {tipo === "dre" ? "Receita bruta" : "Entradas"} de cada empresa no período. Sem eliminações intercompany (v1).
            </p>
          </Card>
          <TabelaRelatorio relatorio={consolidado.consolidado} layout={layout} onCelula={setCelula} />
        </>
      )}

      {celula && <GavetaTransacoes celula={celula} onFechar={() => setCelula(null)} />}
    </div>
  );
}


