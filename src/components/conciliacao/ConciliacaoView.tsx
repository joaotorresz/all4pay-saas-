"use client";

/**
 * Conciliação (aba Conciliar da Entrada de dados) — casa transações do banco
 * (Open Finance) com os títulos previstos e dá BAIXA, sem contar o dinheiro 2x.
 * Revisão & confirmação no MESMO padrão do Open Finance / revisão do upload:
 * cards de resumo no topo, lista por par com chips e StatusBadge de confiança
 * (alta/média/baixa) e ação por linha. Em demo, mostra uma amostra.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Icon, BRL, Button, StatusBadge, Skeleton, InfoHint } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { isDemo } from "@/lib/demo";
import { getConciliacaoOF, conciliar, avaliarComIA, iaConciliacaoAtiva, type MatchConc, type AvaliacaoIA } from "@/lib/conciliacao-of";
import { EmptyState } from "@/components/visao-geral/shared";

const fmtDia = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };
const AUTO = 85;
const confTone = (c: number) => (c >= AUTO ? "positive" : c >= 60 ? "warning" : "neutral");
const confLabel = (c: number) => (c >= AUTO ? "alta" : c >= 60 ? "média" : "baixa");

export function ConciliacaoView() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const conc = useQuery({ queryKey: ["conciliacao-of"], queryFn: getConciliacaoOF });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [feitos, setFeitos] = React.useState<Set<string>>(new Set()); // baixa imediata (otimista)
  const [iaConc, setIaConc] = React.useState(false);
  const [iaBusy, setIaBusy] = React.useState(false);
  const [aval, setAval] = React.useState<Map<string, AvaliacaoIA>>(new Map());

  React.useEffect(() => { iaConciliacaoAtiva().then(setIaConc).catch(() => setIaConc(false)); }, []);

  const marcarFeito = (ids: string[]) => setFeitos((s) => { const n = new Set(s); ids.forEach((id) => n.add(id)); return n; });

  const analisarIA = async (matches: MatchConc[]) => {
    const ambiguos = matches.filter((m) => m.confianca < AUTO);
    if (!ambiguos.length) { show("Nenhum par ambíguo — os pares de confiança alta já conciliam direto."); return; }
    setIaBusy(true);
    try {
      const r = await avaliarComIA(ambiguos);
      setAval(r);
      show(r.size > 0 ? `IA avaliou ${r.size} par(es) ambíguo(s).` : "Não foi possível avaliar com IA agora.");
    } finally { setIaBusy(false); }
  };
  const RECO_TONE: Record<AvaliacaoIA["recomendacao"], "positive" | "warning" | "neutral"> = { conciliar: "positive", revisar: "warning", rejeitar: "neutral" };

  const aplicar = async (m: MatchConc) => {
    setBusy(m.ofId);
    try {
      await conciliar(m.pendId, m.ofId);
      marcarFeito([m.ofId]);
      show("Conciliado — baixa no título previsto");
      if (!isDemo) await qc.invalidateQueries();
    } catch { show("Não foi possível conciliar"); }
    finally { setBusy(null); }
  };
  const aplicarAuto = async (matches: MatchConc[]) => {
    const auto = matches.filter((m) => m.confianca >= AUTO && !feitos.has(m.ofId));
    if (!auto.length) return;
    setBusy("auto");
    try {
      for (const m of auto) await conciliar(m.pendId, m.ofId);
      marcarFeito(auto.map((m) => m.ofId));
      show(`${auto.length} conciliação(ões) automática(s) aplicada(s)`);
      if (!isDemo) await qc.invalidateQueries();
    } catch { show("Falha na conciliação automática"); }
    finally { setBusy(null); }
  };

  if (conc.isLoading) return <Skeleton className="h-[260px] w-full" rounded="md" />;
  if (conc.isError || !conc.data) return <Card><EmptyState title="Não foi possível carregar a conciliação" /></Card>;

  const { pendentesSemMatch, ofSemMatch } = conc.data;
  const matches = conc.data.matches.filter((m) => !feitos.has(m.ofId));
  const autos = matches.filter((m) => m.confianca >= AUTO).length;
  const totalEntrada = matches.filter((m) => m.tipo === "entrada").reduce((s, m) => s + m.amount, 0);
  const totalSaida = matches.filter((m) => m.tipo === "saida").reduce((s, m) => s + m.amount, 0);

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Resumo (mesmo padrão da revisão do upload / Open Finance) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Resumo label="Pares encontrados" valor={matches.length} contagem info={{ titulo: "Pares encontrados", oQue: "Transações do banco que casaram com algum título previsto e podem receber baixa.", comoCalcula: "Cruza as transações do Open Finance com os títulos pendentes por valor, data e descrição." }} />
        <Resumo label="Conciliável agora" valor={autos} contagem tone="var(--color-positive)" info={{ titulo: "Conciliável agora", oQue: "Pares com confiança alta que podem ser conciliados direto, sem revisar.", comoCalcula: "Conta os pares com confiança de 85 por cento ou mais." }} />
        <Resumo label="A receber" valor={totalEntrada} info={{ titulo: "A receber", oQue: "Total das entradas entre os pares prontos para conciliar.", comoCalcula: "Soma o valor dos pares do tipo entrada." }} />
        <Resumo label="A pagar" valor={totalSaida} info={{ titulo: "A pagar", oQue: "Total das saídas entre os pares prontos para conciliar.", comoCalcula: "Soma o valor dos pares do tipo saída." }} />
        <Resumo label="Sem par" valor={pendentesSemMatch + ofSemMatch} contagem info={{ titulo: "Sem par", oQue: "Itens que ainda não casaram, de um lado ou do outro, e precisam de atenção.", comoCalcula: "Soma os títulos pendentes sem par com as transações do banco sem par." }} />
      </div>

      {isDemo && (
        <span className="text-caption text-faint inline-flex items-center gap-2">
          <Icon name="sparkles" size={14} color="var(--color-lime)" /> Amostra de demonstração — em live, os pares vêm das transações reais do Open Finance.
        </span>
      )}

      {matches.length === 0 ? (
        <Card><EmptyState icon="check" title="Nada a conciliar" hint="Sem transações do Open Finance casando com títulos pendentes no momento." /></Card>
      ) : (
        <Card padded={false}>
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border-soft flex-wrap">
            <span className="text-label font-medium text-muted inline-flex items-center gap-1">Pares para conciliar — revise a confiança e confirme<InfoHint align="left" titulo="Pares para conciliar" oQue="Cada par mostra um título previsto e a transação do banco que casou, com o nível de confiança para você confirmar a baixa." comoCalcula="A confiança vem do quanto valor, data e descrição batem; alta concilia direto, média ou baixa pede revisão." /></span>
            <div className="flex items-center gap-2">
              {iaConc && matches.some((m) => m.confianca < AUTO) && (
                <Button size="sm" variant="secondary" disabled={iaBusy} onClick={() => analisarIA(matches)} leftIcon={<Icon name="sparkles" size={14} color="var(--color-lime)" />}>
                  {iaBusy ? "Analisando…" : "Analisar ambíguos (IA)"}
                </Button>
              )}
              {autos > 0 && (
                <Button size="sm" variant="primary" disabled={busy === "auto"} onClick={() => aplicarAuto(conc.data!.matches)} leftIcon={<Icon name="check" size={14} />}>
                  {busy === "auto" ? "Conciliando…" : `Conciliar ${autos} de confiança alta`}
                </Button>
              )}
            </div>
          </div>
          {matches.map((m, i) => {
            const a = aval.get(m.ofId);
            return (
            <div key={m.ofId} className={i ? "border-t border-border-soft" : ""}>
            <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1.4fr_auto_auto_auto] gap-3 md:items-center px-3 sm:px-5 py-3">
              {/* Título previsto */}
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-md bg-surface-2 shrink-0">
                  <Icon name="receipt" size={16} color="var(--color-text-secondary)" />
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-ink truncate">{m.pendDesc}</div>
                  <div className="text-caption text-faint">previsto · vence {fmtDia(m.dueDate)}</div>
                </div>
              </div>
              {/* Transação no banco */}
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-md bg-surface-2 shrink-0">
                  <Icon name="building" size={16} color="var(--color-text-secondary)" />
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] text-ink truncate">{m.ofDesc}</div>
                  <div className="text-caption text-faint">{m.tipo === "entrada" ? "recebido" : "pago"} {fmtDia(m.ofData)}</div>
                </div>
              </div>
              <StatusBadge tone={confTone(m.confianca)}>{confLabel(m.confianca)} · {m.confianca}%</StatusBadge>
              <span className={`tabular-nums shrink-0 md:w-[110px] md:text-right ${m.tipo === "saida" ? "text-negative" : "text-ink"}`}>
                {m.tipo === "saida" ? "−" : ""}<BRL value={m.amount} />
              </span>
              <span className="md:text-right">
                <Button size="sm" variant="secondary" disabled={busy === m.ofId} onClick={() => aplicar(m)} leftIcon={<Icon name="check" size={14} />}>
                  {busy === m.ofId ? "…" : "Conciliar"}
                </Button>
              </span>
            </div>
            {a && (
              <div className="px-3 sm:px-5 pb-3 -mt-1 flex items-start gap-2">
                <Icon name="sparkles" size={13} color="var(--color-lime)" />
                <StatusBadge tone={RECO_TONE[a.recomendacao]}>IA: {a.recomendacao}{a.confiancaIA ? ` · ${Math.round(a.confiancaIA * 100)}%` : ""}</StatusBadge>
                <span className="text-caption text-muted">{a.motivo}</span>
              </div>
            )}
            </div>
            );
          })}
        </Card>
      )}

      <span className="text-caption text-faint">
        Ao conciliar, o título previsto recebe baixa (vai para a Lixeira, recuperável) e a transação do banco assume a classificação dele — o dinheiro conta uma vez só.
      </span>
      {node}
    </div>
  );
}

function Resumo({ label, valor, contagem, tone = "var(--color-ink)", info }: { label: string; valor: number; contagem?: boolean; tone?: string; info?: React.ComponentProps<typeof Card>["info"] }) {
  return (
    <Card className="flex flex-col gap-1" info={info}>
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[18px] font-semibold tabular-nums" style={{ color: tone }}>
        {contagem ? valor.toLocaleString("pt-BR") : <BRL value={valor} />}
      </span>
    </Card>
  );
}
