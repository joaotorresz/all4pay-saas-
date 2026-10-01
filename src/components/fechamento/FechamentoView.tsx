"use client";

/**
 * Fechamento contábil — o CHECKLIST do mês, com responsável, prazo e revisor
 * por tarefa, as verificações automáticas, as provisões sugeridas e a TRAVA.
 *
 * ⚠️ A tela não decide nada: a regra mora em `core/close/checklist` (a mesma
 * do gatilho do banco) e a gravação em `lib/fechamento-tarefas`. A tela
 * PERGUNTA à regra antes do clique ("se eu revisar, o que acontece?") para o
 * botão explicar o que o banco recusaria depois dele — e, quando o banco recusa
 * mesmo assim, mostra a mensagem dele, inteira.
 */
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, BRL, StatusBadge, Button, Icon, Skeleton, InfoHint, Select, DateField, Textarea } from "@/components/ui";
import { getRiscoInput } from "@/lib/data";
import { montarFechamento, mesLabel, postarProvisaoComEstorno } from "@/core/close";
import {
  ROTULO_STATUS, MOTIVO_MINIMO, atrasada, avaliarRevisao, prontidao as prontidaoDe, podeTravar,
  type TarefaFechamento, type MembroFechamento,
} from "@/core/close/checklist";
import { isPeriodLocked, hydrateClose } from "@/lib/close";
import { postarLancamento } from "@/lib/ledger";
import {
  tarefasDoMes, membrosDoFechamento, atorAtual, aplicarAcao, travarMes, type Acao,
} from "@/lib/fechamento-tarefas";
import { dataBR } from "@/lib/format";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { AppShell } from "@/components/app/AppShell";

const statusTone = (s: "ok" | "pendente" | "atencao") => (s === "ok" ? "positive" : s === "atencao" ? "warning" : "neutral");
const statusLabel = (s: "ok" | "pendente" | "atencao") => (s === "ok" ? "OK" : s === "atencao" ? "Atenção" : "Pendente");
const toneTarefa = (s: TarefaFechamento["status"]) => (s === "done" ? "positive" : s === "review" ? "warning" : "neutral");

/** Lista de meses para o seletor: mês corrente de `hoje` + 5 anteriores. */
function mesesDisponiveis(hoje: string): string[] {
  const [y, m] = hoje.slice(0, 7).split("-").map(Number);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

export function FechamentoView() {
  const q = useQuery({ queryKey: ["risco-input"], queryFn: getRiscoInput });
  const [mes, setMes] = React.useState<string | null>(null);
  const [travado, setTravado] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  const [provMsg, setProvMsg] = React.useState<string | null>(null);

  const [tarefas, setTarefas] = React.useState<TarefaFechamento[] | null>(null);
  const [membros, setMembros] = React.useState<MembroFechamento[]>([]);
  const [ator, setAtor] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [motivo, setMotivo] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);

  // Hidrata as travas do banco (live) → cross-device; demo é no-op.
  React.useEffect(() => { hydrateClose().catch((e) => setErro((e as Error).message)).finally(() => setHydrated(true)); }, []);
  React.useEffect(() => {
    membrosDoFechamento().then(setMembros).catch((e) => setErro((e as Error).message));
    atorAtual().then(setAtor).catch((e) => setErro((e as Error).message));
  }, []);

  const meses = q.data ? mesesDisponiveis(q.data.hoje) : [];
  const mesAtivo = mes ?? meses[0] ?? null;
  const hoje = q.data?.hoje?.slice(0, 10) ?? "";

  React.useEffect(() => {
    // ⚠️ Só depois de hidratar as travas: antes disso todo mês parece aberto, e
    // a geração do checklist tentaria criar tarefas num mês já travado.
    if (!mesAtivo || !hydrated) return;
    setTravado(isPeriodLocked(mesAtivo));
    setTarefas(null); setErro(null); setAviso(null); setMotivo("");
    tarefasDoMes(mesAtivo).then(setTarefas).catch((e) => { setTarefas([]); setErro((e as Error).message); });
  }, [mesAtivo, hydrated]);

  const report = React.useMemo(() => {
    if (!q.data || !mesAtivo) return undefined;
    return montarFechamento(q.data, mesAtivo, { travado });
  }, [q.data, mesAtivo, travado]);

  const pront = React.useMemo(() => (tarefas && hoje ? prontidaoDe(tarefas, hoje) : null), [tarefas, hoje]);
  const nomeDe = (id: string | null) => (id ? membros.find((m) => m.id === id)?.nome ?? "membro removido" : null);

  const agir = async (t: TarefaFechamento, acao: Acao) => {
    if (!ator) return;
    setErro(null); setAviso(null); setOcupado(true);
    try {
      const nova = await aplicarAcao(t, acao, ator, membros);
      setTarefas((ts) => (ts ?? []).map((x) => (x.id === nova.id ? nova : x)));
      if (acao.tipo === "revisar" && nova.autorrevisao) {
        setAviso(`"${nova.titulo}" foi revisada por quem a concluiu. Ficou registrado como autorrevisão: ${nova.autorrevisaoMotivo}.`);
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally { setOcupado(false); }
  };

  const travar = async () => {
    if (!mesAtivo || !tarefas) return;
    setErro(null); setAviso(null); setOcupado(true);
    try {
      await travarMes(mesAtivo, !travado, motivo.trim() || null, tarefas);
      setTravado(!travado);
      setMotivo("");
      setAviso(travado ? `${mesLabel(mesAtivo)} foi reaberto. O motivo ficou na trilha.` : `${mesLabel(mesAtivo)} está travado.`);
    } catch (e) {
      setErro((e as Error).message);
    } finally { setOcupado(false); }
  };

  const lancarProvisao = async (categoria: string, valor: number) => {
    if (!mesAtivo || valor <= 0) return;
    try {
      // A provisão e o seu estorno nascem juntos, pelo MESMO gesto das duas
      // portas: `postarProvisaoComEstorno` diz o que o razão fez com cada
      // metade e nomeia o estorno que não entrou.
      setProvMsg(await postarProvisaoComEstorno(postarLancamento, mesAtivo, categoria, valor));
    } catch (e) { setProvMsg(`Falha: ${(e as Error).message}`); }
  };

  const trava = tarefas ? podeTravar(tarefas, motivo) : null;
  const opcoesMembros = [{ value: "", label: "Ninguém" }, ...membros.map((m) => ({ value: m.id, label: m.nome }))];

  return (
    <AppShell title="Fechamento contábil" crumb="Relatórios" actions={isDemo ? <DemoBadge /> : null}>
      {q.isLoading || !report ? (
        <div className="flex flex-col gap-3">
          <Card><Skeleton className="h-16 w-full" /></Card>
          <Card><Skeleton className="h-40 w-full" /></Card>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Seletor de mês */}
          <div className="flex items-center gap-1 flex-wrap">
            {meses.map((m) => (
              <button key={m} onClick={() => setMes(m)}
                className={`text-caption font-medium rounded-pill px-3 py-1 inline-flex items-center gap-1 ${m === mesAtivo ? "bg-surface-3 text-ink font-semibold" : "bg-surface-2 text-muted hover:text-ink"}`}>
                {mesLabel(m)}
                {isPeriodLocked(m) && <Icon name="shield-check" size={12} color="var(--color-text-tertiary)" />}
              </button>
            ))}
          </div>

          {/* Cabeçalho: prontidão + métricas + travar */}
          <Card className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-label font-medium text-muted inline-flex items-center gap-1">{report.mesLabel}<InfoHint align="left" titulo="Prontidão do fechamento" oQue="Quanto do checklist do mês já foi concluído E revisado." comoCalcula="Tarefas revisadas sobre o total de tarefas do checklist do mês. Concluída sem revisão ainda não conta: o fechamento só termina quando alguém conferiu." /></div>
                <div className="text-[28px] leading-none font-semibold text-ink mt-1 tabular-nums">
                  {pront?.fracao == null ? "—" : `${Math.round(pront.fracao * 100)}% revisado`}
                </div>
                {pront && pront.total > 0 && (
                  <div className="text-caption text-muted mt-1 tabular-nums">
                    {pront.revisadas} de {pront.total} revisadas · {pront.aguardandoRevisao} aguardando revisão · {pront.aFazer} a fazer
                    {pront.atrasadas > 0 && <> · {pront.atrasadas} atrasada{pront.atrasadas > 1 ? "s" : ""}</>}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {travado && <StatusBadge tone="positive">Período travado</StatusBadge>}
              </div>
            </div>
            <div className="h-[6px] rounded-pill bg-surface-2 overflow-hidden">
              <div className="h-full rounded-pill bg-ink" style={{ width: `${Math.round((pront?.fracao ?? 0) * 100)}%` }} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
              <Metrica label="Receita" valor={report.metricas.receita} />
              <Metrica label="Despesa" valor={report.metricas.despesa} />
              <Metrica label="Resultado" valor={report.metricas.resultado} />
              <Metrica label="Lançamentos" valor={report.metricas.lancamentos} contagem />
            </div>

            {/* A TRAVA — com tudo revisado, ou com motivo escrito */}
            <div className="flex flex-col gap-2 pt-3 border-t border-border-soft">
              {!travado && trava && !trava.pode && (
                <p className="m-0 text-caption text-muted">
                  Há {tarefas?.filter((t) => t.status !== "done").length} tarefa(s) sem revisão. Dá para travar assim mesmo, com o motivo escrito — ele fica guardado junto com a trava.
                </p>
              )}
              {(travado || (trava && !trava.pode) || motivo) && (
                <Textarea
                  label={travado ? "Motivo da reabertura" : `Motivo da trava (ao menos ${MOTIVO_MINIMO} caracteres)`}
                  id="motivo-trava"
                  rows={2}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder={travado ? "Por que o mês precisa ser reaberto" : "Por que o mês trava com tarefa aberta"}
                />
              )}
              <div>
                <Button size="sm" variant={travado ? "secondary" : "primary"} onClick={travar}
                  disabled={ocupado || !tarefas || (travado ? !motivo.trim() : !!trava && !trava.pode)}
                  leftIcon={<Icon name="shield-check" size={14} color={travado ? "var(--color-ink)" : "var(--color-on-lime)"} />}>
                  {travado ? "Reabrir período" : "Travar período"}
                </Button>
              </div>
            </div>
          </Card>

          {erro && (
            <Card className="border border-negative/40" role="alert">
              <p className="m-0 text-body text-negative">{erro}</p>
            </Card>
          )}
          {aviso && (
            <Card role="status"><p className="m-0 text-body text-ink">{aviso}</p></Card>
          )}

          {/* O CHECKLIST — dono, prazo e revisor */}
          <Card padded={false} info={{ titulo: "Checklist de fechamento", oQue: "As tarefas que todo mês tem, cada uma com quem faz, até quando e quem confere.", comoCalcula: "Nascem de um modelo de cinco tarefas e se repetem todo mês, com o responsável e o revisor do mês anterior. O prazo é um dia do mês seguinte. Atrasada = passou do prazo sem revisão. Quem concluiu não revisa a própria tarefa quando existe outro membro com o papel de fechamento; sem outro, a autorrevisão é permitida e fica registrada." }}>
            <div className="px-5 py-3 border-b border-border-soft flex items-center justify-between gap-3 flex-wrap">
              <span className="text-label font-medium text-muted">Checklist de fechamento</span>
              {isDemo && membros.length > 0 && (
                // ⚠️ Só na demonstração: sem banco não há sessão para dizer quem
                // está agindo, e a segregação só se mostra com duas pessoas.
                <div className="w-[240px]">
                  <Select aria-label="Agindo como" value={ator ?? ""} onChange={setAtor}
                    options={membros.map((m) => ({ value: m.id, label: `Agindo como: ${m.nome}` }))} />
                </div>
              )}
            </div>
            {!tarefas ? (
              <div className="p-5"><Skeleton className="h-24 w-full" /></div>
            ) : tarefas.length === 0 ? (
              <p className="m-0 p-5 text-body text-muted">Nenhuma tarefa neste mês.</p>
            ) : tarefas.map((t, i) => {
              const late = atrasada(t, hoje);
              const rev = ator ? avaliarRevisao(t, ator, membros) : null;
              const bloqueado = travado || ocupado;
              return (
                <div key={t.id} data-tarefa={t.chave} className={`flex flex-col gap-3 px-3 sm:px-5 py-4 ${i ? "border-t border-border-soft" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {late && (
                          <span className="inline-block w-2 h-2 rounded-pill bg-warning shrink-0" aria-hidden />
                        )}
                        <span className="text-[16px] font-medium text-ink">{t.titulo}</span>
                      </div>
                      <div className="text-caption text-faint">{t.descricao}</div>
                      {late && t.prazo && (
                        <div className="text-caption text-muted">Atrasada · o prazo era {dataBR(t.prazo)}</div>
                      )}
                      {(t.concluidaPor || t.revisadaPor) && (
                        <div className="text-caption text-muted mt-1">
                          {t.concluidaPor && <>Concluída por {nomeDe(t.concluidaPor)}{t.concluidaEm ? ` em ${dataBR(t.concluidaEm.slice(0, 10))}` : ""}</>}
                          {t.revisadaPor && <> · revisada por {nomeDe(t.revisadaPor)}{t.revisadaEm ? ` em ${dataBR(t.revisadaEm.slice(0, 10))}` : ""}</>}
                        </div>
                      )}
                      {t.autorrevisao && (
                        <div className="text-caption text-ink mt-1 inline-flex items-center gap-1">
                          <span className="inline-block w-2 h-2 rounded-pill bg-warning" aria-hidden />
                          Autorrevisão — {t.autorrevisaoMotivo}
                        </div>
                      )}
                    </div>
                    {t.href && (
                      <Link href={t.href} className="text-caption text-muted hover:text-ink px-2 py-1 rounded-sm hover:bg-surface-2 shrink-0">Abrir</Link>
                    )}
                    <StatusBadge tone={toneTarefa(t.status)}>{ROTULO_STATUS[t.status]}</StatusBadge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Select label="Responsável" aria-label={`Responsável por ${t.titulo}`} value={t.responsavelId ?? ""}
                      disabled={bloqueado} options={opcoesMembros}
                      onChange={(v) => agir(t, { tipo: "atribuir", responsavelId: v || null })} />
                    <Select label="Revisor" aria-label={`Revisor de ${t.titulo}`} value={t.revisorId ?? ""}
                      disabled={bloqueado} options={opcoesMembros}
                      onChange={(v) => agir(t, { tipo: "atribuir", revisorId: v || null })} />
                    <DateField label="Prazo" aria-label={`Prazo de ${t.titulo}`} value={t.prazo ?? ""}
                      disabled={bloqueado}
                      onChange={(v) => agir(t, { tipo: "atribuir", prazo: v || null })} />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {t.status === "pending" && (
                      <Button size="sm" variant="secondary" disabled={bloqueado} onClick={() => agir(t, { tipo: "concluir" })}>Concluir</Button>
                    )}
                    {t.status === "review" && (
                      <>
                        <Button size="sm" variant="secondary" disabled={bloqueado || !rev?.pode} onClick={() => agir(t, { tipo: "revisar" })}>
                          {rev?.pode && rev.autorrevisao ? "Revisar (autorrevisão)" : "Revisar"}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={bloqueado} onClick={() => agir(t, { tipo: "reabrir" })}>Reabrir</Button>
                        {rev && !rev.pode && <span className="text-caption text-muted">{rev.erro}</span>}
                      </>
                    )}
                    {t.status === "done" && (
                      <Button size="sm" variant="ghost" disabled={bloqueado} onClick={() => agir(t, { tipo: "desfazer" })}>Desfazer revisão</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>

          {/* Verificações automáticas */}
          <Card padded={false} info={{ titulo: "Verificações automáticas", oQue: "O que o sistema confere sozinho no mês: recorrentes que sumiram, lançamentos em aberto e provisões sugeridas.", comoCalcula: "Derivadas dos lançamentos do mês; cada uma marca OK, Atenção ou Pendente. Elas não travam o mês — quem trava é o checklist acima." }}>
            <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted">Verificações automáticas</div>
            {report.tarefas.map((t, i) => (
              <div key={t.id} className={`flex items-center gap-3 px-3 sm:px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                <span className="inline-flex items-center justify-center w-[20px] h-[20px] rounded-sm bg-lime-tint shrink-0" title="Verificação automática">
                  <Icon name="sparkles" size={12} color="var(--color-ink)" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] font-medium text-ink truncate">{t.titulo}</div>
                  <div className="text-caption text-faint truncate">{t.detalhe ?? t.descricao}</div>
                </div>
                {t.href && (
                  <Link href={t.href} className="text-caption text-muted hover:text-ink px-2 py-1 rounded-sm hover:bg-surface-2 shrink-0">Abrir</Link>
                )}
                <StatusBadge tone={statusTone(t.status)}>{statusLabel(t.status)}</StatusBadge>
              </div>
            ))}
          </Card>

          {/* Provisões sugeridas (accruals) */}
          {report.sugestoes.length > 0 && (
            <Card className="flex flex-col gap-3" info={{ titulo: "Provisões sugeridas", oQue: "Despesas que provavelmente ocorreram no mês mas ainda não foram lançadas, sugeridas para você provisionar (accrual).", comoCalcula: "A IA estima pela média histórica de cada categoria recorrente; Lançar cria a entrada no razão (despesa contra provisões a pagar) no último dia do mês e o estorno no dia 1º do mês seguinte." }}>
              <span className="text-label font-medium text-muted inline-flex items-center gap-2">
                <Icon name="sparkles" size={15} color="var(--color-ink)" /> Provisões sugeridas (accruals)
              </span>
              {report.sugestoes.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-2 border-t border-border-soft first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium text-ink truncate">{s.categoria}</div>
                    <div className="text-caption text-faint truncate">{s.motivo}</div>
                  </div>
                  <span className="tabular-nums text-ink shrink-0"><BRL value={s.valorSugerido} /></span>
                  <button onClick={() => lancarProvisao(s.categoria, s.valorSugerido)} className="text-caption text-muted hover:text-ink px-2 py-1 rounded-sm hover:bg-surface-2 shrink-0">Lançar</button>
                </div>
              ))}
              {provMsg && <span className="text-caption text-ink">{provMsg}</span>}
              <span className="text-caption text-faint">Provisões são sugestões da IA pela média histórica — “Lançar” cria o lançamento no razão (despesa × provisões a pagar) no último dia do mês e o estorno no dia 1º do mês seguinte, para a despesa não ser contada duas vezes quando a conta real chegar.</span>
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}

function Metrica({ label, valor, contagem }: { label: string; valor: number; contagem?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[18px] font-medium text-ink tabular-nums">
        {contagem ? valor.toLocaleString("pt-BR") : <BRL value={valor} />}
      </span>
    </div>
  );
}

