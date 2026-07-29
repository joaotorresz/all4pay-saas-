"use client";

/**
 * O cérebro do chat da All 4 Pay AI, num hook — para o painel flutuante e a
 * página inteira rodarem exatamente a MESMA IA (nada de duas implementações
 * divergindo).
 *
 * Encadeia as três camadas de sempre: base de conhecimento → motor nativo →
 * Claude ancorado (com o `copilotoFinanceiro` determinístico de fallback), e
 * passa TUDO pelas etapas visíveis de análise — nenhuma resposta é instantânea.
 */
import * as React from "react";
import { copilotoFinanceiro, centroInteligencia } from "@/core/executive";
import type { RespostaCopiloto } from "@/core/executive/types";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { responderLocal } from "@/core/assistant/engine";
import { buscarKB } from "@/lib/assistant-kb";
import { registrarPergunta, registrarFeedback, sugestoes as mesclarSugestoes, hidratarAprendizado } from "@/lib/assistant-memory";
import { logAcaoIA } from "@/lib/ai-copilot";
import { ETAPAS, RITMO, espera, CURADAS, type Turno } from "./chat-kit";

type Ctx = Parameters<typeof copilotoFinanceiro>[1];

export function useChatIA({ inicial = [], onMudou }: {
  /** Turnos de uma conversa retomada do histórico. */
  inicial?: Turno[];
  /** Chamado a cada resposta — a página usa para salvar a conversa. */
  onMudou?: (turnos: Turno[]) => void;
} = {}) {
  const { data: input } = useRiscoInput();
  // memoizado pelo input (estável no cache do RQ) — não recomputa a cada tecla.
  const intel = React.useMemo(() => (input ? centroInteligencia(input) : undefined), [input]);
  const ctx = intel?.context as Ctx | undefined;
  const anomalias = intel?.anomalias;
  const insights = intel?.insights;

  const [texto, setTexto] = React.useState("");
  const [turnos, setTurnos] = React.useState<Turno[]>(inicial);
  const [pensando, setPensando] = React.useState(false);
  const [etapa, setEtapa] = React.useState(0);
  /** A pergunta em voo — aparece na conversa antes da resposta existir. */
  const [pergunta, setPergunta] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<number | null>(null);

  const idRef = React.useRef(inicial.reduce((m, t) => Math.max(m, t.id), 0));
  const [, force] = React.useReducer((x) => x + 1, 0); // re-render p/ sugestões aprendidas
  React.useEffect(() => { void hidratarAprendizado().then(() => force()); }, []); // aprendizado da org (best-effort)

  const mudouRef = React.useRef(onMudou);
  mudouRef.current = onMudou;
  const registrar = React.useCallback((t: Turno) => {
    setTurnos((arr) => { const novo = [...arr, t]; mudouRef.current?.(novo); return novo; });
  }, []);

  /**
   * Encena a análise enquanto o trabalho roda: avança as etapas no ritmo de
   * `RITMO` e só entrega quando AMBOS terminam. Para o motor nativo (resposta
   * em microssegundos) manda o ritmo; para o Claude, quem manda é a rede.
   */
  const analisar = React.useCallback(async <T,>(trabalho: Promise<T> | T): Promise<T> => {
    setPensando(true);
    setEtapa(0);
    const cena = (async () => {
      for (let i = 1; i < ETAPAS.length; i++) { await espera(RITMO[i - 1]); setEtapa(i); }
      await espera(RITMO[RITMO.length - 1]);
    })();
    try {
      const [r] = await Promise.all([Promise.resolve(trabalho), cena]);
      return r;
    } finally { setPensando(false); }
  }, []);

  const copiar = React.useCallback((t: Turno) => {
    const txt = [t.resposta, ...(t.numeros?.map((n) => `${n.label}: ${n.valor}`) ?? [])].filter(Boolean).join("\n");
    try { navigator.clipboard?.writeText(txt); setCopiedId(t.id); setTimeout(() => setCopiedId((c) => (c === t.id ? null : c)), 1500); } catch { /* ignore */ }
  }, []);

  const darFeedback = React.useCallback((t: Turno, dir: "up" | "down") => {
    registrarFeedback(t.q, dir);
    setTurnos((arr) => arr.map((x) => (x.id === t.id ? { ...x, feedback: dir } : x)));
    force();
  }, []);

  const responder = React.useCallback(async (qRaw: string) => {
    const q = qRaw.trim();
    if (!q || pensando) return;
    setTexto("");
    registrarPergunta(q);
    const id = ++idRef.current;

    // A pergunta entra na conversa na hora; a resposta vem depois das etapas.
    setPergunta(q);

    // 1) Conceitual → base de conhecimento (sem chave)
    const kb = buscarKB(q);
    if (kb) {
      const turno: Turno = { id, q, resposta: kb.texto, fontes: [`Base: ${kb.titulo}`], fonte: "kb", rota: kb.rota, rotaLabel: kb.titulo };
      await analisar(null);
      setPergunta(null);
      registrar(turno);
      void logAcaoIA({ kind: "chat", titulo: q, detalhe: kb.texto, status: "lida" });
      force();
      return;
    }

    if (!input) {
      setPergunta(null);
      registrar({ id, q, resposta: "Os dados financeiros ainda estão carregando. Repita a pergunta em instantes.", fonte: "carregando" });
      return;
    }

    // 2) Sobre os NÚMEROS → motor NATIVO (resposta factual, offline)
    const local = responderLocal(q, input, ctx);
    if (local) {
      await analisar(null);
      setPergunta(null);
      registrar({ id, q, resposta: local.resposta, numeros: local.numeros, fontes: local.fontes, fonte: "motor", contatoId: local.contatoId, grafico: local.grafico });
      void logAcaoIA({ kind: "chat", titulo: q, detalhe: local.resposta, status: "lida" });
      force();
      return;
    }

    // 3) Consultivo/aberto → Claude ancorado (com chave) e fallback determinístico.
    // Os últimos turnos vão junto (memória de conversa → follow-ups funcionam).
    const historico = turnos
      .filter((t) => t.resposta && t.fonte !== "carregando")
      .slice(-4)
      .map((t) => ({ q: t.q, a: t.resposta as string }));
    try {
      const j = await analisar(
        fetch("/api/ai/copiloto", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ pergunta: q, contexto: ctx, anomalias, insights, historico }),
        }).then((r) => r.json()).catch(() => null),
      );
      setPergunta(null);

      let turno: Turno;
      if (j?.ok) {
        turno = { id, q, resposta: j.resposta ?? "(sem resposta)", numeros: Array.isArray(j.numeros) ? j.numeros : [], fontes: Array.isArray(j.fontes) ? j.fontes : [], acao: j.acao ?? null, fonte: "ia" };
      } else if (ctx) {
        const exec: RespostaCopiloto = copilotoFinanceiro(q, ctx);
        turno = { id, q, resposta: exec.resposta, numeros: exec.numeros, fontes: exec.fontes, fonte: "motor" };
      } else {
        turno = { id, q, resposta: "Esta consulta cobre saldo, gastos, receita, contas a receber e a pagar, vencimentos, inadimplência, clientes, runway e saúde financeira. Reformule a pergunta nesses termos.", fonte: "motor" };
      }
      registrar(turno);
      void logAcaoIA({ kind: "chat", titulo: q, detalhe: turno.resposta ?? "", status: "lida" });
      force();
    } catch {
      setPergunta(null);
      if (ctx) { const exec = copilotoFinanceiro(q, ctx); registrar({ id, q, resposta: exec.resposta, numeros: exec.numeros, fontes: exec.fontes, fonte: "motor" }); }
      else { registrar({ id, q, resposta: "Não foi possível processar a consulta. Tente novamente.", fonte: "motor" }); }
    } finally { setPensando(false); setPergunta(null); }
  }, [pensando, input, ctx, anomalias, insights, turnos, analisar, registrar]);

  /** Troca a conversa aberta (retomar do histórico / começar do zero). */
  const carregar = React.useCallback((ts: Turno[]) => {
    setTurnos(ts);
    idRef.current = ts.reduce((m, t) => Math.max(m, t.id), 0);
    setPergunta(null);
    setTexto("");
  }, []);

  return {
    texto, setTexto,
    turnos, pensando, etapa, pergunta,
    copiedId, copiar, darFeedback,
    responder, carregar,
    sugeridas: mesclarSugestoes(CURADAS, 4),
    pronto: !!input,
  };
}
