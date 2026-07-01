"use client";

import * as React from "react";
import { Card, Icon, BRL, Button, Textarea, InfoHint } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { usePagaveis, usePartiesPag } from "@/components/pagamentos/hooks";
import {
  listSolicitacoes, criarSolicitacao, decidir, papelDoPassoAtual, requerAlcada, hydrateAprovacoes,
  type Solicitacao, type StatusSolic, type AcaoDecisao,
} from "@/lib/aprovacoes";
import type { Movement, Party } from "@/lib/types";

type Aba = "fila" | "minhas" | "rejeitadas" | "todas";
const ABAS: { id: Aba; label: string }[] = [
  { id: "fila", label: "Aguardando minha aprovação" },
  { id: "minhas", label: "Minhas solicitações" },
  { id: "rejeitadas", label: "Rejeitadas" },
  { id: "todas", label: "Todas" },
];
const contaAba = (lista: Solicitacao[], id: Aba) =>
  lista.filter((s) => id === "fila" ? s.statusFinal === "em_analise" : id === "rejeitadas" ? s.statusFinal === "rejeitada" : true).length;
const STATUS: Record<StatusSolic, { label: string; cor: string }> = {
  em_analise: { label: "Em análise", cor: "var(--color-warning)" },
  aprovada: { label: "Aprovada", cor: "var(--color-positive)" },
  rejeitada: { label: "Rejeitada", cor: "var(--color-negative)" },
  devolvida: { label: "Devolvida", cor: "var(--color-muted)" },
};

export function AprovacoesView() {
  const { show, node } = useToast();
  const movs = usePagaveis();
  const parties = usePartiesPag();
  const [lista, setLista] = React.useState<Solicitacao[]>([]);
  const [aba, setAba] = React.useState<Aba>("fila");
  const [selId, setSelId] = React.useState<string>("");
  const [coment, setComent] = React.useState("");

  const nomeDe = React.useCallback((m: Movement) => {
    const p = m.party_id ? (parties.data ?? []).find((x: Party) => x.id === m.party_id) : undefined;
    return p?.name || m.description || m.category || "Sem contraparte";
  }, [parties.data]);

  // Hidrata a fila (demo: localStorage; live: Supabase) e semeia solicitações
  // dos títulos a pagar acima da alçada automática.
  React.useEffect(() => {
    let cancel = false;
    (async () => {
      await hydrateAprovacoes();
      if (movs.data) {
        for (const m of movs.data) {
          if (requerAlcada(m.amount)) await criarSolicitacao({ objetoRef: m.id, tipo: "pagamento", beneficiario: nomeDe(m), valor: m.amount, categoria: m.category ?? undefined });
        }
      }
      if (!cancel) setLista(listSolicitacoes());
    })();
    return () => { cancel = true; };
  }, [movs.data, nomeDe]);

  const refresh = () => setLista(listSolicitacoes());
  const sel = lista.find((s) => s.id === selId) ?? null;

  const filtradas = lista.filter((s) =>
    aba === "fila" ? s.statusFinal === "em_analise"
      : aba === "rejeitadas" ? s.statusFinal === "rejeitada"
        : aba === "minhas" ? true // demo: 1 solicitante
          : true);

  const agir = async (acao: AcaoDecisao) => {
    if (!sel) return;
    const r = await decidir(sel.id, acao, coment.trim() || undefined);
    setComent("");
    refresh();
    if (r) show(acao === "aprovar"
      ? (r.statusFinal === "aprovada" ? "Aprovada — liberada para execução na Central de Pagamentos" : "Nível aprovado — segue para o próximo aprovador")
      : acao === "rejeitar" ? "Solicitação rejeitada" : "Devolvida ao solicitante para ajuste");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* Fila */}
      <Card padded={false} className="lg:col-span-2">
        <div className="flex items-center gap-1 px-5 pt-[14px] border-b border-border-soft">
          {ABAS.map((a) => {
            const n = contaAba(lista, a.id);
            const on = aba === a.id;
            return (
              <button key={a.id} onClick={() => setAba(a.id)} className={`relative inline-flex items-center gap-2 px-3 py-2 text-caption ${on ? "text-ink font-medium" : "text-muted hover:text-ink"}`}>
                {a.label}<span className="text-[12px] tabular-nums text-faint bg-surface-2 rounded-pill px-[6px]">{n}</span>
                {on && <span className="absolute left-0 -bottom-px w-full h-[2px] bg-ink rounded-pill" />}
              </button>
            );
          })}
          <span className="ml-auto"><InfoHint align="left" titulo="Fila de aprovações" oQue="Reúne as solicitações de pagamento e reembolso que precisam passar pela alçada antes de executar." comoCalcula="Títulos a pagar acima do limite da alçada viram solicitações automáticas; as abas filtram por status." /></span>
        </div>
        <div className="flex flex-col max-h-[560px] overflow-y-auto">
          {filtradas.length === 0 ? (
            <p className="text-caption text-faint text-center py-8">Nada nesta aba.</p>
          ) : filtradas.map((s) => {
            const on = s.id === selId;
            const passo = papelDoPassoAtual(s);
            return (
              <button key={s.id} onClick={() => setSelId(s.id)} className={`flex items-start gap-3 px-5 py-3 text-left border-t border-border-soft first:border-t-0 ${on ? "bg-surface-2" : "hover:bg-surface-1"}`}>
                <span className="w-2 h-2 rounded-pill mt-[6px] shrink-0" style={{ background: STATUS[s.statusFinal].cor }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] text-ink truncate">{s.beneficiario}</div>
                  <div className="text-caption text-faint truncate">{s.tipo === "reembolso" ? "Reembolso" : "Pagamento"} · {s.regra} · {passo ? `nível: ${passo.rotulo}` : STATUS[s.statusFinal].label}</div>
                </div>
                <span className="text-caption text-ink tabular-nums shrink-0"><BRL value={s.valor} /></span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Painel de decisão */}
      <Card className="lg:col-span-1 flex flex-col gap-3">
        {!sel ? (
          <span className="text-caption text-faint">Selecione uma solicitação para decidir.</span>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center text-h3 font-medium text-ink"><BRL value={sel.valor} /><InfoHint align="left" titulo="Painel de decisão" oQue="Onde você aprova, rejeita ou devolve a solicitação selecionada, com a sugestão de risco da IA e a trilha." comoCalcula="O nível de alçada vem do valor; aprovar no último nível libera a execução na Central de Pagamentos." /></span>
              <span className="text-caption font-medium" style={{ color: STATUS[sel.statusFinal].cor }}>{STATUS[sel.statusFinal].label}</span>
            </div>
            <div className="flex flex-col gap-[6px] text-caption">
              <Linha k="Beneficiário" v={sel.beneficiario} />
              <Linha k="Solicitante" v={sel.solicitante} />
              {sel.categoria && <Linha k="Categoria" v={sel.categoria} />}
              <Linha k="Alçada acionada" v={sel.regra} />
              <Linha k="Nível" v={papelDoPassoAtual(sel)?.rotulo ?? "—"} />
            </div>
            <div className="rounded-md p-3" style={{ background: "var(--color-surface-2)" }}>
              <span className="inline-flex items-center gap-1 text-caption font-medium" style={{ color: sel.req.sugestaoIA.risco === "alto" ? "var(--color-negative)" : sel.req.sugestaoIA.risco === "medio" ? "var(--color-warning)" : "var(--color-positive)" }}>
                <Icon name="sparkles" size={13} color="currentColor" /> IA · risco {sel.req.sugestaoIA.risco}
              </span>
              <p className="m-0 mt-1 text-caption text-muted leading-[1.5]">{sel.req.sugestaoIA.texto}</p>
            </div>

            {sel.statusFinal === "em_analise" && (
              <>
                <Textarea value={coment} onChange={(e) => setComent(e.target.value)} placeholder="Comentário (opcional)" rows={2} />
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="primary" size="sm" onClick={() => agir("aprovar")}>Aprovar</Button>
                  <button onClick={() => agir("devolver")} className="text-caption font-medium text-muted hover:text-ink bg-surface-2 rounded-pill px-3 py-[7px]">Devolver</button>
                  <button onClick={() => agir("rejeitar")} className="text-caption font-medium text-negative hover:opacity-80 bg-surface-2 rounded-pill px-3 py-[7px]">Rejeitar</button>
                </div>
                <span className="text-caption text-faint">Segregação: quem solicita não aprova a própria. Aprovado no último nível libera a execução na Central.</span>
              </>
            )}

            {/* Trilha (audit) */}
            <div className="flex flex-col gap-1 border-t border-border-soft pt-2">
              <span className="text-caption font-medium text-faint tracking-wide">Trilha</span>
              {sel.historico.map((h, i) => (
                <div key={i} className="flex items-start gap-2 text-caption">
                  <Icon name="check" size={12} color="var(--color-text-tertiary)" className="mt-[3px]" />
                  <span className="text-muted leading-[1.4]"><b className="text-ink font-medium">{h.quem}</b> · {h.acao}{h.comentario ? ` — "${h.comentario}"` : ""}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
      {node}
    </div>
  );
}

function Linha({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><span className="text-faint">{k}</span><span className="text-ink text-right truncate">{v}</span></div>;
}
