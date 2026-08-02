"use client";

/**
 * DRE e DFC Multiempresas — a consolidação de até 20 empresas.
 *
 * Duas coisas mudam em relação à tela de uma empresa só: a seleção de
 * empresas (com o teto de 20) e o filtro de contas (só ativas × todas). O
 * relatório em si sai do MESMO motor — consolidar somando os relatórios
 * prontos dobraria a lógica e as duas somas divergiriam na primeira regra nova.
 *
 * ⚠️ Permissão: no ERP de referência este recurso é gateado por permissão
 * específica ("Você não possui permissão de DRE Multiempresas em nenhuma
 * empresa"). Aqui a lista sai das organizações em que o usuário É MEMBRO —
 * quem tem uma organização só vê uma, e a tela diz isso em vez de fingir.
 */
import * as React from "react";
import { Card, Button, Select, Icon, Skeleton, Checkbox } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { getConsolidado, type EntidadeConsolidada } from "@/lib/consolidado";
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
  const [entidades, setEntidades] = React.useState<EntidadeConsolidada[] | null>(null);
  const [selecionadas, setSelecionadas] = React.useState<string[]>([]);
  const [contasFiltro, setContasFiltro] = React.useState<"ativas" | "todas">("ativas");
  const [rascunho, setRascunho] = React.useState<FiltrosRelatorioValor>(filtroPadrao);
  const [aplicados, setAplicados] = React.useState<FiltrosRelatorioValor | null>(null);
  const [layout, setLayout] = React.useState<LayoutTabela>(LAYOUT_PADRAO);
  const [celula, setCelula] = React.useState<CelulaClicada | null>(null);

  React.useEffect(() => {
    let vivo = true;
    // A lista de empresas sai do MESMO consolidado de `/consolidado` — uma
    // segunda fonte de "quais empresas existem" divergiria da primeira.
    const ano = new Date().getFullYear();
    getConsolidado(`${ano}-01-01`, `${ano}-12-31`)
      .then((c) => { if (vivo) { setEntidades(c.entidades); setSelecionadas(c.entidades.map((x) => x.orgId)); } })
      .catch(() => { if (vivo) setEntidades([]); });
    return () => { vivo = false; };
  }, []);

  /**
   * Cada entidade precisa de um `RiskInput` próprio para o motor rodar. O
   * `/consolidado` já resolve a agregação por organização via RPC; enquanto
   * essa fonte por-organização não expõe os lançamentos, a consolidação roda
   * sobre a organização ATIVA e as demais entram como coluna informativa — e a
   * tela diz isso, em vez de somar número inventado.
   */
  const consolidado: RelatorioConsolidado | null = React.useMemo(() => {
    if (!input || !aplicados) return null;
    const escolhidas = (entidades ?? []).filter((e) => selecionadas.includes(e.orgId)).slice(0, MAX_EMPRESAS);
    const lista = escolhidas.length > 0
      ? escolhidas.map((e, k) => ({ id: e.orgId, nome: e.nome, input: k === 0 ? input : vazio(input) }))
      : [{ id: "atual", nome: "Empresa atual", input }];
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
                  Você não participa de nenhuma outra organização — o relatório sai da empresa atual.
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
          {consolidado.empresas.length > 1 && (
            <Card>
              <span className="text-h3 font-semibold text-ink">Empresas no consolidado</span>
              <p className="m-0 mt-2 text-caption text-muted">
                A consolidação roda sobre os lançamentos da organização ativa. As demais entram na lista quando a
                fonte por organização expuser os lançamentos — até lá, somar zeros seria pior que dizer isto.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {consolidado.empresas.map((e) => (
                  <span key={e.id} className="rounded-pill bg-surface-2 px-3 py-1 text-caption text-muted">{e.nome}</span>
                ))}
              </div>
            </Card>
          )}
          <TabelaRelatorio relatorio={consolidado.consolidado} layout={layout} onCelula={setCelula} />
        </>
      )}

      {celula && <GavetaTransacoes celula={celula} onFechar={() => setCelula(null)} />}
    </div>
  );
}

/** Uma entidade sem lançamentos — a coluna existe, o número não é inventado. */
const vazio = (base: RiskInput): RiskInput => ({
  hoje: base.hoje, saldoAtual: 0, movements: [], partyNames: {}, horizonDias: 60,
});
