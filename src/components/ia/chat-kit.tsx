"use client";

/**
 * Kit do chat da Quattro AI — as peças do chat em tela cheia
 * (`ChatTelaCheia`, aberto de qualquer tela pelo `ChatGlobal`).
 *
 * Tipos, marca, etapas de análise, bolha de resposta e gráfico moram aqui; a
 * superfície só decide o LAYOUT em volta. (Até 14/10/2026 havia também o
 * painel flutuante e a aba Conversa de `/quattro-ai`, que usavam estas mesmas
 * peças.)
 */
import * as React from "react";
import Link from "next/link";
import { valorDoTexto, type NumeroResposta } from "@/core/assistant/numero";
import { GavetaTransacoes, type CelulaClicada } from "@/components/relatorios/kit";
import { Icon, AreaComparada, BarrasHorizontais } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import type { GraficoResposta } from "@/core/assistant/engine";
import type { AcaoIA } from "@/core/assistant/acoes";
import type { PropostaChat } from "@/lib/ia-registro";
import { DigitandoIA, atrasoDaPalavra, duracaoRevelar } from "./conversa";

/**
 * Copia um texto e diz se COPIOU.
 *
 * ⚠️ O botão dizia "Copiado" sempre: `navigator.clipboard?.writeText(txt)` não
 * era aguardado, então a promessa recusada (permissão negada, página fora de
 * contexto seguro) escapava do `try` — e com `navigator.clipboard` ausente o
 * `?.` não fazia nada e o rótulo mentia do mesmo jeito. Agora a confirmação só
 * aparece quando o texto chegou à área de transferência; senão, a tela diz que
 * não copiou.
 */
export async function copiarTexto(txt: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(txt);
      return true;
    }
  } catch { /* cai no caminho antigo abaixo */ }
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** O resultado da última cópia pedida num turno. */
export type EstadoCopia = "ok" | "falhou";

/** Um turno da conversa: a pergunta e o que a IA respondeu. */
export interface Turno {
  id: number;
  q: string;
  resposta?: string;
  numeros?: NumeroResposta[];
  fontes?: string[];
  acao?: string | null;
  fonte: "kb" | "ia" | "motor" | "carregando";
  feedback?: "up" | "down";
  rota?: string;
  rotaLabel?: string;
  contatoId?: string;
  grafico?: GraficoResposta;
  /** O número veio do motor e o texto foi reescrito pela IA, com os mesmos números. */
  redigida?: boolean;
  /** Botões de ação da resposta (lançar no período, enviar extrato…). */
  acoes?: AcaoIA[];
  /**
   * A pergunta que o motor DE FATO respondeu, quando ela herdou o assunto da
   * anterior ("e só a última semana?" → "fluxo de caixa última semana"). O
   * próximo seguimento parte dela, não da frase curta.
   */
  consulta?: string;
  /**
   * Um lançamento proposto pela conversa (frase dita ou foto lida), com o que
   * a pessoa ajustou e o desfecho do "Confirmar" (`lib/ia-registro`).
   */
  proposta?: PropostaChat;
}

/* A marca da IA mora em `./marca` (sem Recharts: a abertura de conta também a usa). */
export { PATH_4, GRAD_MARCA, GRAD_ONDA, Marca4, MarcaIA } from "./marca";

/* ============================= GRÁFICO ============================= */

/**
 * O gráfico da resposta. O motor devolve só os dados (`GraficoResposta`); a
 * escolha visual mora aqui, com as peças da Biblioteca do canvas: série no
 * tempo → "Estatística de saldo 1" (`AreaComparada`); ranking por categoria →
 * "Receita 3" (`BarrasHorizontais`). Número não tem cor por sinal (decisão de
 * 30/09/2026): as barras ficam na tinta, qualquer que seja o lado.
 */
export function GraficoDaResposta({ g }: { g: GraficoResposta }) {
  const id = React.useId().replace(/:/g, "");
  const resumo = g.dados.map((d) => `${d.nome}: ${formatBRL(d.valor)}`).join(", ");
  return (
    <figure className="m-0 flex flex-col gap-2 pt-1" aria-label={`${g.titulo}. ${resumo}`}>
      <figcaption className="text-[11px] text-faint">{g.titulo}</figcaption>
      {g.tipo === "linha" ? (
        <AreaComparada id={`ia-${id}`} altura={120} ariaLabel={`${g.titulo}. ${resumo}`}
          dados={g.dados.map((d) => ({ label: d.nome, valor: d.valor }))} />
      ) : (
        <BarrasHorizontais ariaLabel={`${g.titulo}. ${resumo}`}
          itens={g.dados.map((d, i) => ({ chave: d.nome + i, nome: d.nome, valor: d.valor }))} />
      )}
    </figure>
  );
}

/* ========================= ETAPAS DA ANÁLISE ========================= */

/**
 * As etapas visíveis da análise. Nenhuma resposta é instantânea — mesmo as que
 * o motor nativo calcula em microssegundos passam por aqui, porque ver o
 * trabalho acontecendo é o que faz a resposta parecer (e ser) apurada.
 */
export const ETAPAS = [
  "Lendo seus lançamentos",
  "Cruzando com o histórico",
  "Conferindo os números",
  "Redigindo a resposta",
];
/** Ritmo de cada etapa (ms). Soma ~2,1s — o tempo de uma consulta real. */
export const RITMO = [560, 640, 540, 400];

export const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * O "digitando" da IA: a marca respira, três pontos pulam e o nome da etapa
 * corrente passa com um brilho (`DigitandoIA`, a MESMA peça de toda conversa
 * da Quattro AI). A lista de etapas com barra saiu em 15/10/2026; o ritmo de
 * `RITMO` continua valendo.
 */
export function EtapasAnalise({ etapa, className = "" }: { etapa: number; className?: string }) {
  return <DigitandoIA rotulo={ETAPAS[etapa] ?? "Analisando"} className={className} />;
}

/* =========================== BOLHA DE RESPOSTA =========================== */

/**
 * A resposta da IA: texto, gráfico (quando o motor devolve), números, ação
 * sugerida, atalhos (rota / ficha do contato); sem rodapé de
 * fontes, cópia ou feedback (saiu a pedido do dono, 21/10/2026).
 * `onNavegar` deixa o painel flutuante fechar ao navegar; a página inteira não
 * precisa fazer nada.
 */
export function BolhaResposta({
  t, onNavegar, variante = "bolha", animar = false,
}: {
  t: Turno;
  /**
   * Verdadeiro só na resposta que ACABOU de chegar: o texto surge palavra por
   * palavra e o resto (gráfico, números, atalhos) entra depois dele. Uma
   * conversa reaberta do histórico aparece inteira.
   */
  animar?: boolean;
  /**
   * "bolha" = o balão do painel e da página; "aberta" = o chat em tela cheia
   * da Home: texto solto na coluna e o gráfico e os números em CARTÕES, como
   * no modelo que o dono escolheu. O conteúdo é o mesmo nos dois.
   */
  variante?: "bolha" | "aberta";
  onNavegar?: () => void;
}) {
  const aberta = variante === "aberta";
  return (
    <div data-ia="resposta" className={aberta
      ? "self-stretch flex flex-col gap-4"
      : "self-start max-w-[92%] rounded-card rounded-bl-sm bg-surface-1 px-3 py-[10px] flex flex-col gap-2"}>
      <TextoDaResposta texto={t.resposta ?? ""} animar={animar} className={aberta ? "text-[16px] leading-[1.55]" : "text-[15px] leading-[1.5]"} />
      <div
        className={`flex flex-col ${aberta ? "gap-4" : "gap-2"} ${animar ? "a4p-entra" : ""}`}
        style={animar ? ({ "--a4p-atraso": `${duracaoRevelar(t.resposta ?? "") - 200}ms` } as React.CSSProperties) : undefined}
      >
      {(t.grafico || (t.numeros && t.numeros.length > 0)) && (aberta ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {t.grafico && <div data-ia="cartao" className="rounded-[20px] p-6 md:col-span-2" style={{ background: "var(--color-white)" }}><GraficoDaResposta g={t.grafico} /></div>}
          {t.numeros && t.numeros.length > 0 && <div data-ia="cartao" className="rounded-[20px] p-6 md:col-span-2" style={{ background: "var(--color-white)" }}><NumerosDaResposta numeros={t.numeros} onNavegar={onNavegar} /></div>}
        </div>
      ) : (
        <>
          {t.grafico && <GraficoDaResposta g={t.grafico} />}
          {t.numeros && t.numeros.length > 0 && <NumerosDaResposta numeros={t.numeros} onNavegar={onNavegar} />}
        </>
      ))}
      {/* ⚠️ A IA SUGERE, NÃO EXECUTA (Rodada 9). O rótulo era "Ação:", e quem
          lê "Ação: antecipar o recebível da Alpha" conclui que algo foi feito.
          Nada foi: o chat não tem caminho de escrita nenhum (a guarda
          `ia-executa` cobra isso). A sugestão diz que é sugestão e onde agir. */}
      {t.acao && (
        <div data-ia="sugestao" className="flex items-start gap-2 rounded-md bg-white border border-border-soft p-2">
          <Icon name="sparkles" size={13} color="var(--color-lime)" />
          <span className="text-caption text-ink">
            <b className="font-medium">Sugestão</b> {t.acao}
            <span className="block text-faint">A IA não executa nada: quem decide e age é você, na tela correspondente.</span>
          </span>
        </div>
      )}
      {t.rota && (
        <Link href={t.rota} onClick={onNavegar} className="inline-flex items-center gap-1 self-start text-caption font-medium text-ink bg-surface-2 hover:bg-surface-3 rounded-pill px-3 py-[6px] transition-colors">
          Abrir {t.rotaLabel || "no sistema"}
          <Icon name="arrow-up-right" size={13} color="currentColor" />
        </Link>
      )}
      {/* As ações abrem a TELA que faz (o formulário já com a data do período,
          a entrada de dados); o chat continua sem caminho de escrita. */}
      {t.acoes && t.acoes.length > 0 && (
        <div data-ia="acoes" className="flex flex-wrap gap-2">
          {t.acoes.map((a, i) => (
            <Link key={a.rota} href={a.rota} onClick={onNavegar}
              className={`inline-flex items-center gap-1 text-caption font-medium rounded-pill px-3 py-[6px] transition-colors ${i === 0 ? "bg-ink text-white hover:bg-ink-soft" : "text-ink bg-surface-2 hover:bg-surface-3"}`}>
              <Icon name={a.icone} size={13} color="currentColor" />
              {a.label}
            </Link>
          ))}
        </div>
      )}
      {t.contatoId && (
        <button onClick={() => { window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: t.contatoId } })); onNavegar?.(); }}
          className="inline-flex items-center gap-1 self-start text-caption font-medium text-ink bg-surface-2 hover:bg-surface-3 rounded-pill px-3 py-[6px] transition-colors">
          Abrir ficha do contato
          <Icon name="arrow-up-right" size={13} color="currentColor" />
        </button>
      )}
      </div>
    </div>
  );
}

/* ======================== TEXTO DA RESPOSTA ======================== */

/** "**trecho**" vira negrito; sem nenhum, os valores em R$ e % ganham negrito sozinhos. */
function emLinha(linha: string, auto: boolean, passo?: { n: number }): React.ReactNode[] {
  const marcado = auto ? linha.replace(/(-?R\$\s?[\d.]+(?:,\d+)?|\d+(?:,\d+)?\s?%)/g, "**$1**") : linha;
  // Animando, cada palavra surge na vez dela (a mesma conta de `TextoRevelado`),
  // e o negrito surge inteiro, como uma palavra só.
  const surge = (no: React.ReactNode, k: string) => {
    if (!passo) return no;
    const atraso = atrasoDaPalavra(passo.n++);
    return <span key={k} className="a4p-palavra" style={{ "--a4p-atraso": `${atraso}ms` } as React.CSSProperties}>{no}</span>;
  };
  return marcado.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).flatMap((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return [surge(<strong key={i} className="font-semibold text-ink tabular-nums">{p.slice(2, -2)}</strong>, `b${i}`)];
    }
    if (!passo) return [<React.Fragment key={i}>{p}</React.Fragment>];
    return p.split(/(\s+)/).map((w, j) => (!w || /^\s+$/.test(w) ? w : surge(w, `${i}-${j}`)));
  });
}

/**
 * O texto da resposta com o mínimo de formatação que a IA usa: parágrafos,
 * tópicos ("- ") e negrito. Nada de HTML vindo de fora: o texto só vira
 * elementos React, então um "<script>" na resposta aparece como texto.
 */
export function TextoDaResposta({ texto, className = "", animar = false }: { texto: string; className?: string; animar?: boolean }) {
  const auto = !texto.includes("**");
  const passo = animar ? { n: 0 } : undefined;
  const blocos: React.ReactNode[] = [];
  let itens: string[] = [];
  const fecharLista = () => {
    if (!itens.length) return;
    blocos.push(
      <ul key={`l${blocos.length}`} className="m-0 pl-5 list-disc flex flex-col gap-1 marker:text-faint">
        {itens.map((it, i) => <li key={i}>{emLinha(it, auto, passo)}</li>)}
      </ul>);
    itens = [];
  };
  for (const bruta of texto.split("\n")) {
    const linha = bruta.trim();
    const item = linha.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (item) { itens.push(item[1]); continue; }
    fecharLista();
    if (linha) blocos.push(<p key={`p${blocos.length}`} className="m-0">{emLinha(linha, auto, passo)}</p>);
  }
  fecharLista();
  return <div data-ia="texto" className={`text-ink flex flex-col gap-2 ${className}`}>{blocos}</div>;
}

/* ======================== NÚMEROS DA RESPOSTA ======================== */

/**
 * Os números da resposta, cada um com o caminho até a sua origem (Rodada 9):
 *
 *  · soma de lançamentos → abre a GAVETA com as linhas, e o total dela é o
 *    próprio número (o mesmo `GavetaTransacoes` do drill-down do DRE);
 *  · base de cálculo (média, razão, contagem) → abre a gaveta com a base, e o
 *    total que aparece é o DELA, não o do número;
 *  · número de tela (índice, linha "=" do DRE) → leva à tela;
 *  · simulação → marcada, sem link: o número nasceu da pergunta.
 */
function NumerosDaResposta({ numeros, onNavegar }: { numeros: NumeroResposta[]; onNavegar?: () => void }) {
  const [aberto, setAberto] = React.useState<{ celula: CelulaClicada; tela: { rota: string; nome: string } } | null>(null);
  return (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
        {numeros.map((n, i) => {
          const corpo = (
            <>
              <div className="text-[11px] text-faint">{n.label}</div>
              <div className="text-[16px] font-semibold tabular-nums text-ink">{n.valor}</div>
            </>
          );
          const o = n.origem;
          if (o?.movimentos) {
            const abrir = () => setAberto({
              celula: {
                linha: n.label,
                coluna: o.soma ? `${n.valor} · ${o.tela}` : `base de cálculo de ${n.valor} · ${o.tela}`,
                movimentos: o.movimentos!,
                // Soma: o total da gaveta É o número. Base: a gaveta soma as
                // próprias linhas — o número ao lado é uma média ou uma razão.
                valor: o.soma ? (valorDoTexto(n.valor) ?? undefined) : undefined,
              },
              tela: { rota: o.rota, nome: o.tela },
            });
            return (
              <button key={i} type="button" onClick={abrir} data-ia-numero={o.soma ? "soma" : "base"}
                title={o.soma ? "Ver os lançamentos que somam este número" : "Ver os lançamentos usados no cálculo"}
                className="block text-left rounded-sm hover:bg-surface-2 -mx-1 px-1 transition-colors">
                {corpo}
              </button>
            );
          }
          if (o) {
            return (
              <Link key={i} href={o.rota} onClick={onNavegar} data-ia-numero="tela"
                title={`Ver em ${o.tela}`} className="block rounded-sm hover:bg-surface-2 -mx-1 px-1 transition-colors">
                {corpo}
              </Link>
            );
          }
          return (
            <div key={i} data-ia-numero={n.simulacao ? "simulacao" : "sem-origem"}>
              {corpo}
              {n.simulacao && <div className="text-[11px] text-faint">simulação</div>}
            </div>
          );
        })}
      </div>
      {aberto && (
        <GavetaTransacoes celula={aberto.celula} tela={aberto.tela} onNavegar={onNavegar} onFechar={() => setAberto(null)} />
      )}
    </>
  );
}

/** Perguntas curadas — o ponto de partida quando não há aprendizado ainda. */
export const CURADAS = [
  "Me dá um resumo do dia",
  "Quanto gastei esse mês?",
  "Onde posso economizar?",
  "Quanto vai sobrar esse mês?",
  "Quem está me devendo?",
  "Posso gastar R$ 5.000?",
  "Quais meus maiores fornecedores?",
  "Qual minha margem esse mês?",
  "Estou crescendo?",
  "Qual meu ponto de equilíbrio?",
  "Meus clientes pagam em dia?",
  "Quando vou ficar sem dinheiro?",
  "Qual foi meu melhor mês?",
  "O que é margem de contribuição?",
  "Quanto pago de Simples faturando 500 mil por ano?",
  "Quanto cobrar de um boleto de 1.000 vencido há 30 dias?",
];
