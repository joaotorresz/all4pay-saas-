"use client";

/**
 * Razão (General Ledger) — Fase 1. Mostra o balancete (trial balance), os
 * lançamentos de dupla entrada e permite Backfill (derivar do histórico de
 * movimentos) + postar um lançamento manual balanceado. Demo e live.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, BRL, Button, Icon, Select, CurrencyInput, DatePicker, Input, Skeleton, StatusBadge, InfoHint, ValorIndicador } from "@/components/ui";
import { getLedgerEntries, balancete, postarLancamento, estornarLancamento, clearRazao, ingerirOpenFinanceRazao, PLANO, type RazaoLancamento } from "@/lib/ledger";
import { CAIXA } from "@/core/ledger/chart";
import { totais, r4 } from "@/core/ledger";
import { conciliarCaixaDoRazao } from "@/core/ledger/conciliacao";
import { formatBRL } from "@/lib/format";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { ErroWidget } from "@/components/visao-geral/shared";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { saldo } from "@/core/indicadores";
import { AppShell } from "@/components/app/AppShell";
import { baixarXLSX } from "@/lib/xlsx";
import { imprimirRelatorio } from "@/lib/imprimir";
import { CabecalhoImpressao } from "@/components/relatorios/CabecalhoImpressao";
import { hojeLocal } from "@/lib/aggregations";

const fmtDia = (iso: string) => { const [y, m, d] = (iso || "").split("-"); return d ? `${d}/${m}/${y.slice(2)}` : iso; };
const hojeISO = () => hojeLocal();

/**
 * ⚠️ **O TETO É DECLARADO E DITO NA TELA.** A lista mostrava os 200 primeiros
 * lançamentos e mais nada — sem reticências, sem contagem, sem aviso. Um razão
 * a que faltam linhas não parece quebrado: parece um razão. É a mesma família
 * do `conferirTeto` das consultas ("truncar em silêncio é pior que travar"), e
 * dói mais aqui, porque é o documento que o contador confere linha a linha.
 * A tela continua limitada — 200 lançamentos abertos são milhares de nós —, mas
 * agora ela DIZ, e a exportação leva TODOS.
 */
const TETO_TELA = 200;

interface LinhaForm { conta: string; lado: "D" | "C"; valor: number }
const linhasIniciais = (): LinhaForm[] => [
  { conta: CAIXA, lado: "D", valor: 0 },
  { conta: "3.1.01", lado: "C", valor: 0 },
];
function totaisForm(ls: LinhaForm[]) {
  const t = totais(ls.map((l) => (l.lado === "D" ? { accountId: l.conta, debit: l.valor } : { accountId: l.conta, credit: l.valor })));
  return { ...t, balanceado: t.debito > 0 && t.debito === t.credito };
}

export function RazaoView() {
  const qc = useQueryClient();
  const [entries, setEntries] = React.useState<RazaoLancamento[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState<Record<string, boolean>>({});
  const [form, setForm] = React.useState(false);
  /*
   * ⚠️ **LINHAS, não um par fixo.** O formulário tinha UM débito e UM crédito
   * com o MESMO campo de valor — impossível desbalancear, e também impossível
   * fazer o lançamento composto mais comum de um razão (uma despesa paga em
   * parte no caixa e em parte provisionada). Agora são N linhas, cada uma com
   * débito OU crédito, e a diferença D − C fica à vista: só posta com zero.
   */
  const [linhasForm, setLinhasForm] = React.useState<LinhaForm[]>(linhasIniciais);
  const [data, setData] = React.useState(hojeISO());
  const [estornando, setEstornando] = React.useState<RazaoLancamento | null>(null);
  const [motivo, setMotivo] = React.useState("");
  const [desc, setDesc] = React.useState("");

  const [erro, setErro] = React.useState<string | null>(null);
  const recarregar = React.useCallback(async () => {
    // ⚠️ `catch { setEntries([]) }` transformava uma consulta que FALHOU num
    // razão VAZIO — e um balancete vazio fecha em zero, então a tela dizia
    // "balanceado" sobre dados que ninguém conseguiu ler. Falha é falha.
    setErro(null);
    try { setEntries(await getLedgerEntries()); }
    catch (e) { setEntries(null); setErro((e as Error).message || "Falha ao carregar o razão."); }
  }, []);
  React.useEffect(() => { recarregar(); }, [recarregar]);

  const bal = React.useMemo(() => (entries ? balancete(entries) : []), [entries]);

  /*
   * ⚠️ **AS LINHAS DE DÉBITO E CRÉDITO SÓ EXISTEM NO DOM QUANDO ABERTAS**, e é
   * exatamente ELAS que fazem do razão um razão. Imprimir com tudo fechado
   * produz uma lista de descrições e um valor — um extrato, não a partida
   * dobrada que o contador vem conferir. Nenhuma regra de `@media print`
   * resolve isso: CSS não revela o que não foi renderizado. Então o gesto de
   * imprimir ABRE tudo antes.
   */
  React.useEffect(() => {
    const abrirTudo = () => {
      if (!entries) return;
      setAberto(Object.fromEntries(entries.slice(0, TETO_TELA).map((e) => [e.id, true])));
    };
    window.addEventListener("beforeprint", abrirTudo);
    return () => window.removeEventListener("beforeprint", abrirTudo);
  }, [entries]);

  /*
   * ⚠️ **A PLANILHA LEVA TODOS, não os 200 da tela.** O teto existe porque
   * milhares de nós abertos travam o navegador; ele não é uma opinião sobre
   * quantos lançamentos o contador precisa. Exportar o recorte da tela
   * entregaria um razão incompleto com cara de completo — o mesmo defeito que
   * o A4P-082 achou na impressão do DRE.
   *
   * Uma linha por LINHA de lançamento (não por lançamento): é assim que o razão
   * se lê e é o que permite somar débito e crédito na própria planilha.
   */
  const linhasPlanilha = React.useMemo(() => {
    const fora: (string | number)[][] = [["Data", "Lançamento", "Origem", "Conta", "Nome da conta", "Débito", "Crédito"]];
    for (const e of entries ?? [])
      for (const l of e.linhas)
        fora.push([e.data, e.descricao, e.origem, l.conta, l.nome, l.debito || 0, l.credito || 0]);
    return fora;
  }, [entries]);

  const totDeb = bal.reduce((s, c) => s + c.debito, 0);
  const totCred = bal.reduce((s, c) => s + c.credito, 0);
  const balanceado = Math.round((totDeb - totCred) * 100) === 0;

  const limpar = async () => { clearRazao(); await recarregar(); setMsg("Lançamentos próprios (demo) limpos."); };

  const importarOF = async () => {
    setBusy("of"); setMsg(null);
    try {
      const r = await ingerirOpenFinanceRazao();
      await recarregar();
      setMsg(r.lidas === 0 && isDemo
        ? "Open Finance disponível só em live (conecte um banco em Contas)."
        : `Open Finance: ${r.lidas} lida(s) · ${r.jaNoRazao} já estão no razão pelo movimento · ${r.postadas} postada(s) agora`
          + (r.falhas ? ` · ${r.falhas} recusada(s): ${r.primeiraFalha}` : "") + ".");
    } catch (e) { setMsg(`Falha na importação Open Finance: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  const tf = totaisForm(linhasForm);
  const postar = async () => {
    const lines = linhasForm
      .filter((l) => l.valor > 0)
      .map((l) => (l.lado === "D" ? { accountId: l.conta, debit: l.valor } : { accountId: l.conta, credit: l.valor }));
    if (lines.length < 2) { setMsg("Um lançamento de dupla entrada tem ao menos uma linha de débito e uma de crédito com valor."); return; }
    setBusy("post"); setMsg(null);
    try {
      // A recusa do desbalanceado mora em `postarLancamento` (os dois caminhos),
      // não neste botão: a IA e o fechamento postam pela mesma função.
      await postarLancamento({ entryDate: data, description: desc || "Lançamento manual", source: "manual", lines });
      await recarregar();
      setForm(false); setLinhasForm(linhasIniciais()); setDesc("");
      setMsg(`Lançamento postado: ${formatBRL(tf.debito)} a débito e a crédito.`);
      await qc.invalidateQueries();
    } catch (e) { setMsg(`Lançamento recusado: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  const confirmarEstorno = async () => {
    if (!estornando || !entries) return;
    setBusy("estorno"); setMsg(null);
    try {
      await estornarLancamento(estornando, motivo, entries);
      await recarregar();
      setMsg(`Estorno postado: "${estornando.descricao}" foi revertido por partida invertida, com data de hoje.`);
      setEstornando(null); setMotivo("");
      await qc.invalidateQueries();
    } catch (e) { setMsg(`Estorno recusado: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };
  const estornados = React.useMemo(() => new Set((entries ?? []).map((e) => e.estornoDe).filter(Boolean) as string[]), [entries]);

  const opcoes = PLANO.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }));

  return (
    <AppShell title="Razão" crumb="Contabilidade" actions={isDemo ? <DemoBadge /> : null}>
      <div className="flex flex-col gap-5 pb-4">
        {/* ⚠️ Só no papel: o razão que sai daqui vai para o contador, e uma
            folha de partidas sem dizer de que empresa e de quando é não se
            confere. Sem período porque o razão não tem recorte: ele é o
            histórico inteiro — e é isso que a data de geração carimba. */}
        <CabecalhoImpressao
          titulo="Razão"
          de={entries?.[0]?.data ?? hojeISO()}
          ate={entries?.[entries.length - 1]?.data ?? hojeISO()}
          regime="competencia"
          recorte="Todos os lançamentos"
        />
        <div className="flex items-center gap-2 flex-wrap" data-nao-imprime>
          <Button variant="secondary" onClick={() => setForm((f) => !f)} leftIcon={<Icon name="plus" size={15} />}>Novo lançamento</Button>
          <Button variant="secondary" onClick={importarOF} disabled={busy !== null || isDemo} title={isDemo ? "Disponível em live (Open Finance)" : "Importar transações do Open Finance para o razão"} leftIcon={<Icon name="building" size={15} />}>
            {busy === "of" ? "Importando…" : "Importar Open Finance"}
          </Button>
          {/* ⚠️ O razão não tinha exportação NENHUMA — nem planilha, nem papel —
              e é o documento que o contador pede primeiro. */}
          <Button
            variant="outline"
            disabled={!entries || entries.length === 0}
            onClick={imprimirRelatorio}
            leftIcon={<Icon name="file-text" size={15} />}
          >
            Exportar PDF
          </Button>
          <Button
            variant="outline"
            disabled={!entries || entries.length === 0}
            onClick={() => baixarXLSX("razao", [{ nome: "Razão", linhas: linhasPlanilha }])}
            leftIcon={<Icon name="arrow-down-to-line" size={15} />}
          >
            Exportar XLSX
          </Button>
          {isDemo && (
            <button onClick={limpar} className="text-caption text-muted hover:text-ink underline ml-auto">Limpar lançamentos próprios (demo)</button>
          )}
        </div>
        <span className="text-caption text-faint">O razão é uma <b className="text-muted font-medium">projeção dos movimentos</b> (sempre em sincronia) + os lançamentos próprios do GL (manual, cronogramas, provisões, receita).</span>
        {msg && <span className="text-caption text-muted">{msg}</span>}

        {form && (
          <Card className="flex flex-col gap-4">
            <span className="text-label font-medium text-muted">Novo lançamento (dupla entrada)</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DatePicker label="Data" value={data} onChange={setData} />
              <Input label="Descrição" value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              {linhasForm.map((l, k) => (
                <div key={k} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_140px_180px_auto] gap-3 items-end" data-linha-lancamento>
                  <Select label={`Conta da linha ${k + 1}`} value={l.conta} onChange={(v) => setLinhasForm((ls) => ls.map((x, i) => (i === k ? { ...x, conta: v } : x)))} options={opcoes} />
                  <Select label={`Lado da linha ${k + 1}`} value={l.lado} onChange={(v) => setLinhasForm((ls) => ls.map((x, i) => (i === k ? { ...x, lado: v as "D" | "C" } : x)))}
                    options={[{ value: "D", label: "Débito" }, { value: "C", label: "Crédito" }]} />
                  <CurrencyInput label={`Valor da linha ${k + 1}`} value={l.valor} onValueChange={(v) => setLinhasForm((ls) => ls.map((x, i) => (i === k ? { ...x, valor: v } : x)))} />
                  <Button size="sm" variant="ghost" disabled={linhasForm.length <= 2}
                    onClick={() => setLinhasForm((ls) => ls.filter((_, i) => i !== k))}>Remover</Button>
                </div>
              ))}
              <div>
                <Button size="sm" variant="secondary" onClick={() => setLinhasForm((ls) => [...ls, { conta: "4.1.09", lado: "D", valor: 0 }])}
                  leftIcon={<Icon name="plus" size={14} />}>Adicionar linha</Button>
              </div>
            </div>
            <div className="flex items-center gap-6 flex-wrap text-caption tabular-nums" data-totais-lancamento>
              <span className="text-muted">Débitos <b className="text-ink"><BRL value={tf.debito} /></b></span>
              <span className="text-muted">Créditos <b className="text-ink"><BRL value={tf.credito} /></b></span>
              <span className="text-muted">Diferença <b className="text-ink"><BRL value={r4(tf.debito - tf.credito)} /></b></span>
              {!tf.balanceado && <StatusBadge tone="warning">Desbalanceado — débitos e créditos têm de ser iguais</StatusBadge>}
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setForm(false)}>Cancelar</Button>
              <Button size="sm" onClick={postar} disabled={busy === "post"}>{busy === "post" ? "Postando…" : "Postar (D=C)"}</Button>
            </div>
          </Card>
        )}

        {estornando && (
          <Card className="flex flex-col gap-3" data-estorno>
            <span className="text-label font-medium text-ink">Estornar “{estornando.descricao}” ({fmtDia(estornando.data)})</span>
            <span className="text-caption text-muted max-w-[80ch]">
              O original fica como está. Entra um lançamento NOVO, com débito e crédito trocados e data de hoje — o par soma zero no balancete.
            </span>
            <Input label="Motivo do estorno" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <div className="flex items-center gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setEstornando(null); setMotivo(""); }}>Cancelar</Button>
              <Button size="sm" onClick={confirmarEstorno} disabled={busy === "estorno"}>{busy === "estorno" ? "Estornando…" : "Confirmar estorno"}</Button>
            </div>
          </Card>
        )}

        {erro ? (
          <Card>
            <ErroWidget titulo="Não foi possível carregar o razão" erro={erro} onTentarNovamente={() => { recarregar(); }} />
          </Card>
        ) : entries === null ? (
          <Card><Skeleton className="h-40 w-full" /></Card>
        ) : entries.length === 0 ? (
          <Card className="flex flex-col items-start gap-2">
            <span className="text-h3 font-medium text-ink">Razão vazio</span>
            <span className="text-caption text-muted">Lance um movimento (Nova transação) ou importe dados — o razão projeta tudo automaticamente. Você também pode postar um lançamento manual aqui.</span>
          </Card>
        ) : (
          <>
            <ConciliacaoCaixa entries={entries} />

            {/* Balancete (trial balance) */}
            <Card padded={false}>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border-soft">
                <span className="text-label font-medium text-muted inline-flex items-center gap-1">Balancete<InfoHint align="left" titulo="Balancete" oQue="Resumo por conta de quanto entrou no débito e no crédito, com o saldo de cada uma." comoCalcula="Soma os débitos e créditos de cada conta nos lançamentos; o razão fecha quando o total de débito é igual ao de crédito." /></span>
                <StatusBadge tone={balanceado ? "positive" : "warning"}>{balanceado ? "Razão balanceado ✓" : "Desbalanceado"}</StatusBadge>
              </div>
              <div className="hidden sm:flex items-center gap-3 px-5 py-2 text-[11px] font-medium tracking-[0.08em] text-faint border-b border-border-soft">
                <span className="flex-1">Conta</span>
                <span className="w-[120px] text-right">Débito</span>
                <span className="w-[120px] text-right">Crédito</span>
                <span className="w-[120px] text-right">Saldo</span>
              </div>
              {bal.map((c, i) => (
                <div key={c.conta} data-conta={c.conta} className={`flex items-center gap-3 px-3 sm:px-5 py-2 ${i ? "border-t border-border-soft" : ""}`}>
                  <span className="flex-1 min-w-0 truncate text-[15px] text-ink">{c.conta} · {c.nome}</span>
                  <span className="hidden sm:block w-[120px] text-right tabular-nums text-muted"><BRL value={c.debito} /></span>
                  <span className="hidden sm:block w-[120px] text-right tabular-nums text-muted"><BRL value={c.credito} /></span>
                  <span className="w-[120px] text-right tabular-nums text-ink font-medium" data-saldo><BRL value={c.saldo} /></span>
                </div>
              ))}
              <div className="flex items-center gap-3 px-5 py-2 border-t border-border-soft text-caption font-medium">
                <span className="flex-1 text-muted">Totais</span>
                <span className="hidden sm:block w-[120px] text-right tabular-nums text-ink" data-total="debito"><BRL value={totDeb} /></span>
                <span className="hidden sm:block w-[120px] text-right tabular-nums text-ink" data-total="credito"><BRL value={totCred} /></span>
                <span className="w-[120px] text-right tabular-nums text-faint">{balanceado ? "0" : <BRL value={totDeb - totCred} />}</span>
              </div>
            </Card>

            {/* Lançamentos */}
            <Card padded={false}
              info={{ titulo: "Lançamentos", oQue: "Cada registro de dupla entrada do razão, com suas linhas de débito e crédito ao abrir.", comoCalcula: "Reúne os lançamentos projetados dos movimentos mais os manuais, cronogramas e provisões." }}>
              <div className="px-5 py-3 border-b border-border-soft flex items-baseline justify-between gap-3 flex-wrap">
                <span className="text-label font-medium text-muted" data-n-lancamentos={entries.length}>Lançamentos · {entries.length}</span>
                {/* ⚠️ O corte é DITO. Antes a lista parava no 200 sem nada
                    indicando, e um razão a que faltam linhas não parece
                    quebrado: parece um razão. */}
                {entries.length > TETO_TELA && (
                  <span className="text-caption text-faint">
                    mostrando os {TETO_TELA} primeiros nesta tela · a exportação leva todos os {entries.length}
                  </span>
                )}
              </div>
              {entries.slice(0, TETO_TELA).map((e, i) => {
                const on = aberto[e.id];
                const t = totais(e.linhas.map((l) => ({ accountId: l.conta, debit: l.debito, credit: l.credito })));
                return (
                  <div key={e.id} className={i ? "border-t border-border-soft" : ""}>
                    <button onClick={() => setAberto((a) => ({ ...a, [e.id]: !a[e.id] }))} className="w-full flex items-center gap-3 px-3 sm:px-5 py-3 text-left hover:bg-surface-1">
                      <Icon name={on ? "chevron-down" : "chevron-right"} size={15} color="var(--color-text-tertiary)" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-medium text-ink truncate">{e.descricao}</div>
                        <div className="text-caption text-faint">{fmtDia(e.data)} · {e.origem}</div>
                      </div>
                      <span className="tabular-nums text-ink shrink-0"><BRL value={t.debito} /></span>
                    </button>
                    {on && (
                      <div className="px-3 sm:px-12 pb-3 pt-1 bg-surface-1/40 flex flex-col gap-1">
                        {!(e.externalKey ?? "").startsWith("mov:") && (
                          <div className="flex items-center justify-end gap-2 pb-1" data-nao-imprime>
                            {e.estornoDe ? (
                              <span className="text-caption text-faint">Estorno de outro lançamento</span>
                            ) : estornados.has(e.id) ? (
                              <span className="text-caption text-faint">Estornado</span>
                            ) : (
                              <Button size="sm" variant="secondary" onClick={() => { setEstornando(e); setMotivo(""); }}>Estornar</Button>
                            )}
                          </div>
                        )}
                        {e.linhas.map((l, k) => (
                          <div key={k} className="flex items-center justify-between gap-3 text-caption py-1">
                            <span className="text-muted truncate">{l.conta} · {l.nome}</span>
                            <span className="flex items-center gap-4 tabular-nums shrink-0">
                              <span className="w-[100px] text-right text-ink">{l.debito ? <BRL value={l.debito} /> : "—"}</span>
                              <span className="w-[100px] text-right text-ink">{l.credito ? <BRL value={l.credito} /> : "—"}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

/**
 * CONCILIAÇÃO CAIXA × EXTRATO — a conta que faltava.
 *
 * ⚠️ Esta é a resposta para "por que o Razão diz um número e o extrato diz
 * outro". A pergunta parecia misteriosa e não era: a diferença tem parcelas
 * conhecidas, e enquanto elas não apareciam na tela, cada lado defendia o seu
 * total sem ninguém conseguir apontar onde os dois se separavam.
 *
 * O motor é `reconciliarSaldo` (`core/indicadores`), coberto pela matriz de
 * consistência: derivado + previstos + abertura tem de fechar no extrato.
 */
function ConciliacaoCaixa({ entries }: { entries: RazaoLancamento[] }) {
  const { data: inp } = useRiscoInput();
  const rec = React.useMemo(() => (inp ? conciliarCaixaDoRazao(entries, inp) : null), [inp, entries]);
  const saldoCanonico = React.useMemo(() => (inp ? saldo(inp) : null), [inp]);
  if (!rec || !saldoCanonico) return null;
  return (
    <Card
      info={{
        titulo: "Caixa do razão × extrato",
        oQue: "Por que o saldo da conta caixa no razão pode não ser o saldo que está nas contas bancárias.",
        comoCalcula:
          "O extrato (saldo das contas) é a autoridade sobre quanto existe. O caixa do razão é o saldo da conta 1.1.01 do balancete abaixo. A diferença se decompõe em: saldo que já existia antes do primeiro lançamento, liquidados sem data (fora do razão), lançamentos próprios do razão no caixa, e o resíduo que nada explica.",
      }}
    >
      <div className="flex flex-col gap-3" data-conciliacao-caixa>
        <span className="text-label font-medium text-muted">Caixa do razão × extrato</span>
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <div className="flex flex-col">
            <span className="text-caption text-faint">Saldo das contas (extrato)</span>
            <span className="text-h3 tabular-nums text-ink" data-valor="extrato">
              <ValorIndicador indicador={saldoCanonico} titulo="Saldo no extrato" />
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-caption text-faint">Caixa no razão (1.1.01)</span>
            <span className="text-h3 tabular-nums text-ink" data-valor="caixa-razao"><BRL value={rec.caixaRazao} /></span>
          </div>
          <div className="flex flex-col">
            <span className="text-caption text-faint">Diferença</span>
            <span className="text-h3 tabular-nums text-ink" data-valor="diferenca"><BRL value={rec.diferenca} /></span>
          </div>
        </div>
        <div className="flex flex-col gap-2 pt-1 border-t border-border-soft">
          {rec.parcelas.map((p) => (
            <div key={p.id} className="flex flex-col gap-[2px]" data-parcela={p.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] text-ink">{p.rotulo}</span>
                <span className="tabular-nums text-ink shrink-0"><BRL value={p.valor} /></span>
              </div>
              <span className="text-caption text-faint max-w-[70ch]">{p.explicacao}</span>
            </div>
          ))}
          <span className="text-caption text-faint max-w-[70ch]">
            Fora da conta: <span className="tabular-nums"><BRL value={rec.previstosForaDoRazao} /></span> em títulos ainda em aberto não estão nem no razão nem no extrato — existem no resultado por competência.
          </span>
        </div>
        {/* A palavra "conciliado" só aparece quando a conta fecha contra uma
            abertura de fonte independente (A4P-073): sem ela a parcela de
            abertura fecha por construção e não confere nada. */}
        <StatusBadge tone={rec.fecha ? "positive" : "warning"}>
          {!rec.aberturaVerificada
            ? `NÃO CONFERIDO — ${formatBRL(Math.abs(rec.parcelas[0].valor))} absorvidos em saldo anterior não verificado`
            : rec.fecha
              ? `Conferido: fecha contra o saldo de abertura (${rec.aberturaOrigem})`
              : `Sobram ${formatBRL(Math.abs(rec.residuo))} sem explicação, mesmo com o saldo de abertura (${rec.aberturaOrigem})`}
        </StatusBadge>
      </div>
    </Card>
  );
}
