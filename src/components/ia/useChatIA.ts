"use client";

/**
 * O cérebro do chat da Quattro AI, num hook — o chat em tela cheia o usa, e
 * qualquer superfície futura usa o MESMO (nada de duas implementações
 * divergindo).
 *
 * Encadeia as três camadas de sempre: base de conhecimento → motor nativo →
 * Claude ancorado (com o `copilotoFinanceiro` determinístico de fallback), e
 * passa TUDO pelas etapas visíveis de análise — nenhuma resposta é instantânea.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { copilotoFinanceiro, centroInteligencia } from "@/core/executive";
import type { RespostaCopiloto } from "@/core/executive/types";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { responderLocal, graficoDoCatalogo } from "@/core/assistant/engine";
import { numerosInventados } from "@/core/assistant/redacao";
import { completarPorRotulo, numerosDeFora } from "@/core/assistant/numero";
import { buscarKB } from "@/lib/assistant-kb";
import { perguntaComAssuntoNovo, perguntaComPeriodoNovo } from "@/core/assistant/seguimento";
import { acoesDasTelas, acoesDeSeguimento, type AcaoIA } from "@/core/assistant/acoes";
import { ehPedidoDeAutomacao } from "@/core/automacoes/pedido";
import { interpretarLancamento } from "@/core/assistant/lancamento-falado";
import { fraseDaProposta, gravarProposta, lerArquivoNoChat, propostaDaFala, type PropostaChat } from "@/lib/ia-registro";
import { formatBRL } from "@/lib/format";
import { registrarPergunta, registrarFeedback, sugestoes as mesclarSugestoes, hidratarAprendizado } from "@/lib/assistant-memory";
import { logAcaoIA } from "@/lib/ai-copilot";
import { ETAPAS, RITMO, espera, CURADAS, copiarTexto, type Turno, type EstadoCopia } from "./chat-kit";

type Ctx = Parameters<typeof copilotoFinanceiro>[1];

const acoesOuNada = (a: AcaoIA[]) => (a.length ? a : undefined);

/**
 * Pede ao Claude só a REDAÇÃO de uma resposta que o motor já calculou. Sem
 * chave, sem rede ou demorando mais de 9 s, devolve `null` e a resposta do
 * motor segue como está — a conversa nunca espera pela reescrita.
 */
async function redigir(pergunta: string, resposta: string, numeros: { label: string; valor: string }[]): Promise<{ ok?: boolean; resposta?: string } | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch("/api/ai/copiloto", {
      method: "POST", headers: { "content-type": "application/json" }, signal: ctl.signal,
      body: JSON.stringify({ pergunta, base: { resposta, numeros: numeros.map(({ label, valor }) => ({ label, valor })) } }),
    });
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}

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

  const qc = useQueryClient();
  const [texto, setTexto] = React.useState("");
  const [turnos, setTurnos] = React.useState<Turno[]>(inicial);
  const [pensando, setPensando] = React.useState(false);
  const [etapa, setEtapa] = React.useState(0);
  /** A pergunta em voo — aparece na conversa antes da resposta existir. */
  const [pergunta, setPergunta] = React.useState<string | null>(null);
  /** A última cópia pedida: de qual turno, e se deu certo. */
  const [copia, setCopia] = React.useState<{ id: number; estado: EstadoCopia } | null>(null);

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

  const copiar = React.useCallback(async (t: Turno) => {
    const txt = [t.resposta, ...(t.numeros?.map((n) => `${n.label}: ${n.valor}`) ?? [])].filter(Boolean).join("\n");
    const ok = await copiarTexto(txt);
    setCopia({ id: t.id, estado: ok ? "ok" : "falhou" });
    // A confirmação some sozinha; a FALHA fica até a próxima tentativa — quem
    // não conseguiu copiar precisa ler o aviso, não vê-lo piscar.
    if (ok) setTimeout(() => setCopia((c) => (c?.id === t.id && c.estado === "ok" ? null : c)), 1500);
  }, []);

  /**
   * ⚠️ O feedback agora ENTRA na conversa salva (`onMudou`) e não conta duas
   * vezes. Antes ele só mudava o estado da tela: ao retomar a conversa pelo
   * histórico a marca sumia, e clicar de novo somava outro voto ao aprendizado.
   */
  const darFeedback = React.useCallback((t: Turno, dir: "up" | "down") => {
    if (t.feedback === dir) return;
    registrarFeedback(t.q, dir, t.feedback);
    setTurnos((arr) => {
      const novo = arr.map((x) => (x.id === t.id ? { ...x, feedback: dir } : x));
      mudouRef.current?.(novo);
      return novo;
    });
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

    // 0) Pedido de AUTOMAÇÃO ("toda segunda às 8h me manda…") → a tela de
    // Automações monta o fluxo com o mesmo pedido. A conversa geral não grava
    // fluxo: um caminho de criação só, o da tela que o edita.
    if (ehPedidoDeAutomacao(q)) {
      const resposta = "Isso é uma automação. Em Automações eu monto o fluxo com este pedido, em cards ligados, e ele nasce desligado para você revisar a mensagem antes de ligar.";
      const turno: Turno = { id, q, resposta, fontes: ["Automações"], fonte: "kb", rota: `/automacoes?pedido=${encodeURIComponent(q.slice(0, 500))}`, rotaLabel: "Automações" };
      await analisar(null);
      setPergunta(null);
      registrar(turno);
      void logAcaoIA({ kind: "chat", titulo: q, detalhe: resposta, status: "lida" });
      force();
      return;
    }

    // 0b) Um LANÇAMENTO dito ("gastei 100 de gasolina", falado ou digitado):
    // a conversa propõe tipo, data e categoria, e só grava no "Confirmar".
    const fala = interpretarLancamento(q, input?.hoje ?? new Date().toISOString().slice(0, 10));
    if (fala) {
      const proposta = propostaDaFala(fala);
      const resposta = fraseDaProposta(proposta, false);
      await analisar(null);
      setPergunta(null);
      registrar({ id, q, resposta, fontes: ["Lançamento pela conversa"], fonte: "motor", proposta });
      void logAcaoIA({ kind: "chat", titulo: q, detalhe: resposta, status: "lida" });
      return;
    }

    // Recorte de seguimento ("e só a última semana?"): herda o assunto da
    // última pergunta que o motor respondeu. Vale antes da base de
    // conhecimento, que leria "semana" como conceito.
    const anterior = [...turnos].reverse().find((t) => t.fonte === "motor");
    const consulta = perguntaComPeriodoNovo(anterior?.consulta ?? anterior?.q, q) ?? perguntaComAssuntoNovo(anterior?.consulta ?? anterior?.q, q);

    // 1) Conceitual → base de conhecimento (sem chave)
    const kb = consulta ? null : buscarKB(q);
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

    // 2) Sobre os NÚMEROS → motor NATIVO (resposta factual, offline).
    // "e só a última semana?" logo depois de uma pergunta respondida herda o
    // assunto dela: o motor responde a pergunta inteira com o período novo.
    const viaConsulta = consulta ? responderLocal(consulta, input, ctx) : null;
    const local = viaConsulta ?? responderLocal(q, input, ctx);
    if (local) {
      // O número é do motor; o TOM é da IA. Se a reescrita não chegar, ou
      // trouxer um número que o motor não calculou, fica o texto do motor.
      const j = await analisar(redigir(viaConsulta && consulta ? consulta : q, local.resposta, local.numeros));
      const fiel = j?.ok && typeof j.resposta === "string" && j.resposta.trim()
        && numerosInventados(j.resposta, [local.resposta, ...local.numeros.map((n) => `${n.label} ${n.valor}`)]).length === 0;
      setPergunta(null);
      registrar({ id, q, resposta: fiel ? j.resposta : local.resposta, redigida: !!fiel, numeros: local.numeros, fontes: local.fontes, fonte: "motor", contatoId: local.contatoId, grafico: local.grafico, acoes: local.acoes, ...(viaConsulta && consulta ? { consulta } : {}) });
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
        turno = { id, q, resposta: j.resposta ?? "(sem resposta)", numeros: numerosDeFora(j.numeros), fontes: Array.isArray(j.fontes) ? j.fontes : [], acao: j.acao ?? null, fonte: "ia", grafico: graficoDoCatalogo(j.grafico, input), acoes: acoesOuNada(acoesDasTelas(j.telas)) };
      } else if (ctx) {
        const exec: RespostaCopiloto = copilotoFinanceiro(q, ctx);
        turno = { id, q, resposta: exec.resposta, numeros: completarPorRotulo(exec.numeros), fontes: exec.fontes, fonte: "motor", acoes: acoesOuNada(acoesDeSeguimento(q, exec.fontes)) };
      } else {
        // Sem dado nenhum para responder: o caminho para ter dado, nunca só "reformule".
        turno = { id, q, resposta: "Ainda não há lançamentos suficientes para responder. Envie um extrato ou conecte o banco e a resposta sai dos seus números.", fonte: "motor", acoes: acoesDasTelas(["enviar", "conectar"]) };
      }
      registrar(turno);
      void logAcaoIA({ kind: "chat", titulo: q, detalhe: turno.resposta ?? "", status: "lida" });
      force();
    } catch {
      setPergunta(null);
      if (ctx) { const exec = copilotoFinanceiro(q, ctx); registrar({ id, q, resposta: exec.resposta, numeros: completarPorRotulo(exec.numeros), fontes: exec.fontes, fonte: "motor" }); }
      else { registrar({ id, q, resposta: "Não foi possível processar a consulta. Tente novamente.", fonte: "motor" }); }
    } finally { setPensando(false); setPergunta(null); }
  }, [pensando, input, ctx, anomalias, insights, turnos, analisar, registrar]);

  /** Muda um turno e salva a conversa (o desfecho da proposta entra no histórico). */
  const mudarTurno = React.useCallback((id: number, f: (t: Turno) => Turno) => {
    setTurnos((arr) => { const novo = arr.map((x) => (x.id === id ? f(x) : x)); mudouRef.current?.(novo); return novo; });
  }, []);

  /** A foto ou o PDF enviado na conversa: lê e propõe, como a frase dita. */
  const enviarArquivo = React.useCallback(async (file: File) => {
    if (pensando) return;
    const id = ++idRef.current;
    const q = `Arquivo enviado: ${file.name}`;
    setPergunta(q);
    const leitura = await analisar(lerArquivoNoChat(file).catch((e) => ({ kind: "erro" as const, motivo: e instanceof Error ? e.message : "falha na leitura" })));
    setPergunta(null);
    if (leitura.kind === "doc") {
      registrar({ id, q, resposta: fraseDaProposta(leitura.proposta, true), fontes: ["Leitura do documento"], fonte: "motor", proposta: leitura.proposta });
    } else if (leitura.kind === "lote") {
      registrar({ id, q, resposta: `É um extrato com **${leitura.linhas}** lançamentos. A conferência linha a linha fica na entrada de dados, antes de gravar.`, fonte: "motor", acoes: acoesDasTelas(["enviar"]) });
    } else {
      registrar({ id, q, resposta: `Não consegui ler este arquivo (${leitura.motivo}). Tente uma foto mais nítida, com o documento inteiro no quadro, ou envie o PDF.`, fonte: "motor", acoes: acoesDasTelas(["enviar"]) });
    }
  }, [pensando, analisar, registrar]);

  const ajustarProposta = React.useCallback((id: number, patch: Partial<PropostaChat>) => {
    mudarTurno(id, (t) => (t.proposta && (t.proposta.estado === "aberta" || t.proposta.estado === "falhou") ? { ...t, proposta: { ...t.proposta, ...patch } } : t));
  }, [mudarTurno]);

  const cancelarProposta = React.useCallback((id: number) => {
    mudarTurno(id, (t) => (t.proposta ? { ...t, proposta: { ...t.proposta, estado: "cancelada", desfecho: "Cancelado: nada foi lançado." } } : t));
  }, [mudarTurno]);

  const confirmarProposta = React.useCallback(async (t: Turno) => {
    const pc = t.proposta;
    if (!pc || (pc.estado !== "aberta" && pc.estado !== "falhou")) return;
    if (!(pc.valor > 0)) { mudarTurno(t.id, (x) => ({ ...x, proposta: { ...pc, desfecho: "Informe o valor antes de confirmar." } })); return; }
    mudarTurno(t.id, (x) => ({ ...x, proposta: { ...pc, estado: "gravando", desfecho: undefined } }));
    try {
      const r = await gravarProposta(pc);
      const ok = r.movimento || r.baixa;
      const desfecho = ok
        ? r.baixa
          ? `Feito: baixa dada na conta agendada${pc.arquivo ? ", com o comprovante anexado" : ""}.`
          : `Feito: ${formatBRL(pc.valor)} lançado em ${pc.categoria}${pc.arquivo ? ", com o arquivo anexado" : ""}${r.contatoCriado ? ", e o contato cadastrado" : ""}.`
        : `Não foi possível gravar${r.erro ? `: ${r.erro}` : "."}`;
      mudarTurno(t.id, (x) => ({ ...x, proposta: { ...pc, estado: ok ? "gravada" : "falhou", desfecho } }));
      if (ok) await qc.invalidateQueries();
    } catch (e) {
      mudarTurno(t.id, (x) => ({ ...x, proposta: { ...pc, estado: "falhou", desfecho: `Não foi possível gravar: ${e instanceof Error ? e.message : "erro desconhecido"}` } }));
    }
  }, [mudarTurno, qc]);

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
    copia, copiar, darFeedback,
    responder, carregar,
    enviarArquivo, ajustarProposta, confirmarProposta, cancelarProposta,
    sugeridas: mesclarSugestoes(CURADAS, 4),
    pronto: !!input,
  };
}
