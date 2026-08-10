"use client";

/**
 * Três telas que leem a mesma coisa por ângulos diferentes:
 *  • **Fluxo de Caixa** — o mês inteiro, com transferências em colunas próprias;
 *  • **Extrato** — uma conta, linha a linha, com saldo corrente;
 *  • **Fatura do Cartão** — as despesas do cartão agrupadas por CICLO.
 *
 * Todas dependem de conta bancária cadastrada, e dizem isso quando não há —
 * mostrar zeros sem explicação faria parecer que a empresa não movimenta.
 */
import * as React from "react";
import { Card, Button, Icon, Select, DateField, Switch, BRL, Skeleton } from "@/components/ui";
import { useAccounts, useRiscoInput } from "@/components/visao-geral/hooks";
import { baixarXLSX } from "@/lib/xlsx";
import { listarTransferencias } from "@/lib/movimentacoes";
import { listContasBancarias } from "@/lib/registros";
import {
  fluxoCaixaMensal, extratoDaConta, faturasDoCartao,
  type Transferencia, type StatusFatura,
} from "@/core/movimentacoes";

const hoje = () => new Date();
const mesCorrente = () => `${hoje().getFullYear()}-${String(hoje().getMonth() + 1).padStart(2, "0")}`;
const fmtDia = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");
const MES_LONGO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const rotuloMes = (m: string) => `${MES_LONGO[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const deslocar = (m: string, n: number) => {
  const [a, mm] = m.split("-").map(Number);
  const d = new Date(a, mm - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/* ============================== fluxo de caixa ============================== */

export function FluxoCaixaMensalView() {
  const { data: contas, isLoading } = useAccounts();
  const { data: input } = useRiscoInput();
  const [mes, setMes] = React.useState(mesCorrente);
  const [escolhidas, setEscolhidas] = React.useState<string[]>([]);
  const [mostrarInativas, setMostrarInativas] = React.useState(false);
  const [transferencias, setTransferencias] = React.useState<Transferencia[]>([]);

  React.useEffect(() => { setTransferencias(listarTransferencias()); }, []);

  // "Inativa" vive no cadastro estendido (lib/registros), não em
  // `financial_accounts` — por isso a checagem é por lá.
  const inativas = React.useMemo(() => {
    const m = new Map(listContasBancarias().map((c) => [c.nome, c.ativo]));
    return (id: string, nome: string) => m.get(nome) === false;
  }, []);

  const disponiveis = React.useMemo(
    () => (contas?.accounts ?? []).filter((c) => mostrarInativas || !inativas(c.id, c.name)),
    [contas, mostrarInativas, inativas],
  );

  const saldo = disponiveis
    .filter((c) => escolhidas.length === 0 || escolhidas.includes(c.id))
    .reduce((s, c) => s + c.balance, 0);

  const fluxo = React.useMemo(
    () => (input ? fluxoCaixaMensal(input, mes, escolhidas, transferencias, saldo) : null),
    [input, mes, escolhidas, transferencias, saldo],
  );

  const linhasXLSX = React.useMemo(() => {
    if (!fluxo) return [];
    return [
      ["Data", "Descrição", "Tipo", "Valor", "Saldo"],
      ...fluxo.linhas.map((l) => [l.data, l.descricao, l.tipo === "entrada" ? "Entrada" : "Saída", l.valor, l.saldo]),
    ];
  }, [fluxo]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted">
          O fluxo de caixa de todas as contas bancárias e as suas movimentações, conforme os filtros.
        </p>
        <Button
          variant="ghost" disabled={!fluxo || fluxo.linhas.length === 0}
          onClick={() => baixarXLSX(`fluxo-de-caixa-${mes}`, [{ nome: "Fluxo de caixa", linhas: linhasXLSX }])}
        >
          <Icon name="arrow-down-to-line" size={15} color="currentColor" />
          Exportar XLSX
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-4 items-start">
        <Card>
          <span className="text-h3 font-semibold text-ink">Filtros</span>
          <div className="flex items-center gap-1 mt-3">
            <Seta label="Mês anterior" icone="chevron-left" onClick={() => setMes(deslocar(mes, -1))} />
            <Select
              value={mes} onChange={setMes}
              options={Array.from({ length: 24 }, (_, k) => {
                const m = deslocar(mesCorrente(), -k);
                return { value: m, label: rotuloMes(m) };
              })}
              containerClassName="flex-1"
            />
            <Seta label="Próximo mês" icone="chevron-right" onClick={() => setMes(deslocar(mes, 1))} />
          </div>

          <div className="flex items-center justify-between gap-3 mt-4">
            <label className="text-caption font-medium text-muted">Contas bancárias</label>
            <Switch checked={mostrarInativas} onChange={setMostrarInativas} label="Inativas" />
          </div>

          {disponiveis.length === 0 ? (
            <p className="m-0 mt-2 text-caption text-faint">Nenhuma conta cadastrada.</p>
          ) : (
            <>
              <div className="rounded-md bg-surface-2 p-3 mt-2 max-h-[180px] overflow-y-auto flex flex-col gap-2">
                {disponiveis.map((c) => (
                  <label key={c.id} className="inline-flex items-center gap-2 text-caption text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={escolhidas.length === 0 || escolhidas.includes(c.id)}
                      onChange={() => setEscolhidas((s) =>
                        s.includes(c.id) ? s.filter((x) => x !== c.id)
                          : s.length === 0 ? disponiveis.filter((d) => d.id !== c.id).map((d) => d.id)
                          : [...s, c.id])}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Button variant="ghost" onClick={() => setEscolhidas([])}>Selecionar todas</Button>
                <Button variant="ghost" onClick={() => setEscolhidas(["__nenhuma__"])}>Limpar</Button>
              </div>
            </>
          )}
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Kpi label="Saldo inicial" valor={fluxo?.saldoInicial ?? 0} />
          <Kpi label="Entradas" valor={fluxo?.entradas ?? 0} cor="var(--color-positive)" />
          <Kpi label="Saídas" valor={fluxo?.saidas ?? 0} cor="var(--color-negative)" />
          <Kpi label="Transferência entrada" valor={fluxo?.transferenciaEntrada ?? 0} />
          <Kpi label="Transferência saída" valor={fluxo?.transferenciaSaida ?? 0} />
          <Kpi label="Saldo final" valor={fluxo?.saldoFinal ?? 0} forte />
        </div>
      </div>

      {isLoading ? (
        <Card><Skeleton className="h-[220px]" /></Card>
      ) : (contas?.accounts ?? []).length === 0 ? (
        <Card>
          <div className="flex items-center gap-3 py-6 px-2">
            <Icon name="triangle-alert" size={18} color="var(--color-warning)" />
            <p className="m-0 text-label text-muted">
              Cadastre ao menos uma conta bancária ativa para gerar o fluxo de caixa.
            </p>
          </div>
        </Card>
      ) : !fluxo || fluxo.linhas.length === 0 ? (
        <Card><p className="m-0 py-12 text-center text-label text-muted">Nenhuma movimentação no período.</p></Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  {["Data", "Descrição", "Valor", "Saldo"].map((h, i) => (
                    <th key={h} className={`px-6 py-3 text-[11px] font-medium tracking-[0.08em] text-faint ${i > 1 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fluxo.linhas.map((l, k) => (
                  <tr key={k} className="border-b border-border-soft last:border-0">
                    <td className="px-6 py-2 text-label text-ink tabular-nums">{fmtDia(l.data)}</td>
                    <td className="px-6 py-2 text-label text-muted">{l.descricao}</td>
                    <td className={`px-6 py-2 text-right text-label tabular-nums ${l.tipo === "entrada" ? "text-positive" : "text-negative"}`}>
                      {l.tipo === "entrada" ? "+" : "−"}<BRL value={l.valor} />
                    </td>
                    <td className="px-6 py-2 text-right text-label text-ink tabular-nums"><BRL value={l.saldo} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ================================= extrato ================================= */

export function ExtratoView() {
  const { data: contas, isLoading } = useAccounts();
  const { data: input } = useRiscoInput();
  const [conta, setConta] = React.useState("");
  const [de, setDe] = React.useState(() => `${mesCorrente()}-01`);
  const [ate, setAte] = React.useState(() => new Date().toISOString().slice(0, 10));

  React.useEffect(() => {
    if (!conta && (contas?.accounts ?? []).length) setConta(contas!.accounts[0].id);
  }, [contas, conta]);

  const saldoConta = (contas?.accounts ?? []).find((c) => c.id === conta)?.balance ?? 0;
  const ext = React.useMemo(
    () => (input && conta ? extratoDaConta(input, conta, de, ate, saldoConta) : null),
    [input, conta, de, ate, saldoConta],
  );

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted">Extrato da conta bancária no período selecionado.</p>
        <Button
          variant="ghost" disabled={!ext || ext.linhas.length === 0}
          onClick={() => ext && baixarXLSX(`extrato-${de}-${ate}`, [{
            nome: "Extrato",
            linhas: [["Data", "Descrição", "Categoria", "Tipo", "Valor", "Saldo"],
              ...ext.linhas.map((l) => [l.data, l.descricao, l.categoria ?? "", l.tipo === "entrada" ? "Entrada" : "Saída", l.valor, l.saldo])],
          }])}
        >
          <Icon name="arrow-down-to-line" size={15} color="currentColor" />
          Exportar XLSX
        </Button>
      </div>

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Campo label="Conta bancária">
            <Select
              value={conta} onChange={setConta}
              placeholder="Selecione a conta"
              options={(contas?.accounts ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
          </Campo>
          <Campo label="De"><DateField aria-label="Data inicial" value={de} onChange={setDe} /></Campo>
          <Campo label="Até"><DateField aria-label="Data final" value={ate} onChange={setAte} /></Campo>
        </div>
      </Card>

      {isLoading ? (
        <Card><Skeleton className="h-[240px]" /></Card>
      ) : (contas?.accounts ?? []).length === 0 ? (
        <Card><p className="m-0 py-12 text-center text-label text-muted">Cadastre uma conta bancária para ver o extrato.</p></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Kpi label="Saldo de abertura" valor={ext?.abertura ?? 0} />
            <Kpi label="Entradas" valor={ext?.entradas ?? 0} cor="var(--color-positive)" />
            <Kpi label="Saídas" valor={ext?.saidas ?? 0} cor="var(--color-negative)" />
            <Kpi label="Saldo de fechamento" valor={ext?.fechamento ?? 0} forte />
          </div>

          <Card padded={false} className="overflow-hidden">
            {!ext || ext.linhas.length === 0 ? (
              <p className="m-0 py-12 text-center text-label text-muted">Nenhum lançamento liquidado no período.</p>
            ) : (
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border-soft">
                      {["Data", "Descrição", "Categoria", "Valor", "Saldo"].map((h, i) => (
                        <th key={h} className={`px-6 py-3 text-[11px] font-medium tracking-[0.08em] text-faint ${i > 2 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ext.linhas.map((l) => (
                      <tr key={l.id} className="border-b border-border-soft last:border-0">
                        <td className="px-6 py-2 text-label text-ink tabular-nums">{fmtDia(l.data)}</td>
                        <td className="px-6 py-2 text-label text-muted truncate max-w-[34ch]">{l.descricao}</td>
                        <td className="px-6 py-2 text-label text-muted">{l.categoria ?? "—"}</td>
                        <td className={`px-6 py-2 text-right text-label tabular-nums ${l.tipo === "entrada" ? "text-positive" : "text-negative"}`}>
                          {l.tipo === "entrada" ? "+" : "−"}<BRL value={l.valor} />
                        </td>
                        <td className="px-6 py-2 text-right text-label text-ink tabular-nums"><BRL value={l.saldo} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* ============================= fatura do cartão ============================= */

const ROTULO_FATURA: Record<StatusFatura, string> = {
  aberta: "Aberta", fechada: "Fechada", paga: "Paga", parcial: "Parcialmente paga",
};
const COR_FATURA: Record<StatusFatura, string> = {
  aberta: "var(--color-warning)", fechada: "var(--color-ink)",
  paga: "var(--color-positive)", parcial: "var(--color-warning)",
};

export function FaturaCartaoView() {
  const { data: input, isLoading } = useRiscoInput();
  const { data: contas } = useAccounts();
  const [de, setDe] = React.useState(() => `${mesCorrente()}-01`);
  const [ate, setAte] = React.useState(() => {
    const [a, m] = mesCorrente().split("-").map(Number);
    return `${mesCorrente()}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
  });
  const [cartaoFiltro, setCartaoFiltro] = React.useState("");
  const [statusFiltro, setStatusFiltro] = React.useState("");

  /**
   * Os cartões saem do cadastro estendido, porque é lá que vivem os dias de
   * fechamento e vencimento — sem os dois não existe ciclo, e sem ciclo não
   * existe fatura.
   */
  const cartoes = React.useMemo(() => {
    const nomes = new Map((contas?.accounts ?? []).map((c) => [c.name, c.id]));
    return listContasBancarias()
      .filter((c) => c.tipo === "cartao" && c.diaFechamento && c.diaVencimento)
      .map((c) => ({
        id: nomes.get(c.nome) ?? c.id,
        nome: c.nome,
        diaFechamento: c.diaFechamento!,
        diaVencimento: c.diaVencimento!,
      }));
  }, [contas]);

  const faturas = React.useMemo(() => {
    if (!input) return [];
    return cartoes
      .filter((c) => !cartaoFiltro || c.id === cartaoFiltro)
      .flatMap((c) => faturasDoCartao(input, c, de, ate))
      .filter((f) => !statusFiltro || f.status === statusFiltro);
  }, [input, cartoes, de, ate, cartaoFiltro, statusFiltro]);

  const emAberto = faturas.filter((f) => f.status !== "paga").reduce((s, f) => s + (f.total - f.pago), 0);
  const pago = faturas.reduce((s, f) => s + f.pago, 0);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <p className="m-0 text-label text-muted">Faturas dos cartões de crédito agrupadas por ciclo.</p>

      {cartoes.length === 0 && (
        <Card>
          <div className="flex items-center gap-3 py-2">
            <Icon name="credit-card" size={18} color="var(--color-text-tertiary)" />
            <p className="m-0 text-label text-muted">
              Cadastre uma conta do tipo <b className="text-ink">Cartão de crédito</b> (com os dias de fechamento e
              vencimento) em Cadastros › Contas bancárias para ver faturas aqui.
            </p>
          </div>
        </Card>
      )}

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Campo label="De"><DateField aria-label="Data inicial" value={de} onChange={setDe} /></Campo>
          <Campo label="Até"><DateField aria-label="Data final" value={ate} onChange={setAte} /></Campo>
          <Campo label="Cartões">
            <Select
              value={cartaoFiltro} onChange={setCartaoFiltro}
              options={[{ value: "", label: "Todos os cartões" }, ...cartoes.map((c) => ({ value: c.id, label: c.nome }))]}
              disabled={cartoes.length === 0}
            />
          </Campo>
          <Campo label="Status">
            <Select
              value={statusFiltro} onChange={setStatusFiltro}
              options={[{ value: "", label: "Todos" },
                ...(Object.keys(ROTULO_FATURA) as StatusFatura[]).map((s) => ({ value: s, label: ROTULO_FATURA[s] }))]}
            />
          </Campo>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <span className="text-[11px] font-medium tracking-[0.08em] text-faint">Faturas no período</span>
          <span className="block mt-2 text-[24px] leading-none font-semibold text-ink tabular-nums">{faturas.length}</span>
        </Card>
        <Kpi label="Total em aberto" valor={emAberto} cor={emAberto > 0 ? "var(--color-warning)" : undefined} />
        <Kpi label="Total pago" valor={pago} cor="var(--color-positive)" />
      </div>

      {isLoading ? (
        <Card><Skeleton className="h-[200px]" /></Card>
      ) : faturas.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-surface-2">
              <Icon name="inbox" size={20} color="var(--color-text-tertiary)" />
            </span>
            <p className="m-0 text-label text-muted">Nenhuma fatura no período selecionado.</p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {faturas.map((f) => (
            <Card key={f.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-label font-medium text-ink">{f.cartao}</span>
                    <span
                      className="rounded-pill px-2 py-[1px] text-caption"
                      style={{ background: "var(--color-surface-2)", color: COR_FATURA[f.status] }}
                    >
                      {ROTULO_FATURA[f.status]}
                    </span>
                  </div>
                  <div className="text-caption text-faint tabular-nums">
                    fecha {fmtDia(f.fechamento)} · vence {fmtDia(f.vencimento)} · {f.lancamentos.length} lançamentos
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[20px] leading-none font-semibold text-ink tabular-nums"><BRL value={f.total} /></div>
                  {f.pago > 0 && f.pago < f.total && (
                    <div className="text-caption text-positive tabular-nums mt-1">pago <BRL value={f.pago} /></div>
                  )}
                </div>
              </div>
              {f.total > 0 && (
                <div className="h-[4px] rounded-pill bg-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-pill"
                    style={{ width: `${Math.min(100, (f.pago / f.total) * 100)}%`, background: "var(--color-positive)" }}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

function Kpi({ label, valor, cor, forte }: { label: string; valor: number; cor?: string; forte?: boolean }) {
  return (
    <Card>
      <span className="text-[11px] font-medium tracking-[0.08em] text-faint">{label}</span>
      <span
        className={`block mt-2 text-[${forte ? 24 : 22}px] leading-none font-semibold tabular-nums`}
        style={{ color: cor ?? "var(--color-ink)", fontSize: forte ? 24 : 22 }}
      >
        <BRL value={valor} />
      </span>
    </Card>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-caption font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

function Seta({ label, icone, onClick }: { label: string; icone: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick} aria-label={label}
      className="inline-flex items-center justify-center w-9 h-9 rounded-md text-muted hover:text-ink hover:bg-surface-2 transition-colors shrink-0"
    >
      <Icon name={icone} size={15} color="currentColor" />
    </button>
  );
}
