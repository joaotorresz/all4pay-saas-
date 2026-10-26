"use client";

import * as React from "react";
import Link from "next/link";
import { BRL, Icon, SemDados, BarrasEntradaSaida, AreaComparada } from "@/components/ui";
import { useRiscoInput, useUnreconciled } from "./hooks";
import { montarHomeSnapshot, type CurvaHome, type NumeroHome } from "@/core/home/snapshot";
import { isoLocal, temValor } from "@/core/indicadores";
import { painelStatusNF } from "@/core/vendas";
import { useVendas } from "@/lib/vendas";
import { listarCompras, listarBoletos } from "@/lib/compras-store";
import { hydrateAprovacoes, listSolicitacoes } from "@/lib/aprovacoes";
import { tarefasDoMes } from "@/lib/fechamento-tarefas";
import type { TarefaFechamento } from "@/core/close/checklist";
import { decimalBR, pct } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import {
  BASICAS, INTERESSES, LIMITE_SUGESTOES, candidatasParaIA, contextoParaIA, descricaoParaIA, interessesDaDescricao,
  recomendarSugestoes, sinaisDaHome,
  type CandidataIA, type SinaisHome, type SugestaoEscolhida,
} from "@/core/home/sugestoes";
import { reportar } from "@/lib/erros";
import {
  gravarPreferenciasHome, inscreverPreferenciasHome, lerPreferenciasHome, sincronizarPreferenciasHome,
} from "@/lib/home-preferencias";
import { registrarClique, registrarExibicao, type PreferenciasHome } from "@/core/home/preferencias";
import {
  EXEMPLOS_DE_PEDIDO, LAYOUT_PADRAO, aplicarAcoes, cardsRecusados, definirLargura, descreverMudancas, faixasDoPainel,
  idDoCockpit, interpretarPedido, itemHome, larguraDe, larguraMaisPerto, larguraVizinha, layoutDasOrdensAntigas,
  mesmoLayout, moverItem, normalizarAcoes, ordemDasSecoes, pedeCatalogo, respostaDoAjuste, respostaDoCatalogo, visiveis,
  type AcaoHome, type IdCard, type IdHome, type IdItemHome, type LarguraHome, type LayoutHome,
} from "@/core/home/itens";
import { MaquininhaRecentes } from "./MaquininhaRecentes";
import { CATALOG_BY_ID, useCockpitCtx } from "./cockpit";
import { loadCompany } from "@/lib/company";
import { useTipoConta } from "@/components/app/useTipoConta";
import type { RespostaChatAjuste, SugestaoChat } from "@/components/ia/ChatTelaCheia";
import { abrirChat } from "@/components/ia/ChatGlobal";

/**
 * A HOME "SNAPSHOT" — a prancheta "Home · proposta snapshot" do canvas
 * "Quattro ERP · Protótipo" (14/10/2026), levada ao sistema no ar.
 *
 * De cima para baixo: a caixa da Quattro AI (degradê da marca em onda), "Seu
 * dashboard" com dois cards grandes de curva (caixa e ARR) e quatro pequenos
 * (burn, runway, a pagar, a receber), e as três colunas de operação.
 *
 * ⚠️ Nenhum número nasce aqui: todos saem de `core/home/snapshot`, que só
 * chama a camada canônica. A tela formata e desenha.
 *
 * ⚠️ A pílula de variação é a ÚNICA cor por sinal do sistema, e é exceção
 * DECLARADA (guarda `cor:` em `npm run consistencia`): o dono a desenhou no
 * canvas — verde quando sobe, vermelho quando cai. O número em si continua
 * na tinta.
 */

const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const RELATORIOS = [
  { nome: "DRE", href: "/dashboard/reports/dre" },
  { nome: "Balanço patrimonial", href: "/dashboard/reports/balance-sheet" },
  { nome: "Razão", href: "/contabilidade?aba=razao" },
  { nome: "Fluxo de caixa", href: "/dashboard/reports/dfc?aba=mensal" },
];

/** "Em 14 out 2026, 09:00" — o instante da leitura, no relógio de quem olha. */
function useCarimbo(): string {
  const [txt, setTxt] = React.useState("");
  React.useEffect(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    setTxt(`Em ${d.getDate()} ${MESES_CURTOS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`);
  }, []);
  return txt;
}

/* ------------------------------ Quattro AI ------------------------------ */

/**
 * As prioridades do dia a dia e os cliques nas sugestões. `interesses === null`
 * é o PRIMEIRO ACESSO (a pergunta nunca foi respondida); `[]` é "pulei".
 * Seguem a pessoa entre computadores (`lib/home-preferencias`, etapa 4): o que
 * está no dispositivo aparece na hora e o que veio do servidor entra quando ele
 * responder.
 */
function usePreferenciasIA(tipo: "empresa" | "pessoal", hoje: string) {
  const [prefs, setPrefs] = React.useState<PreferenciasHome | undefined>(undefined);
  // O "hoje" da Home (o mesmo dos sinais), para o clique e a exibição contarem no mesmo calendário.
  const hojeRef = React.useRef(hoje);
  hojeRef.current = hoje;
  React.useEffect(() => {
    const reler = () => setPrefs(lerPreferenciasHome());
    reler();
    const sair = inscreverPreferenciasHome(reler);
    sincronizarPreferenciasHome().then(reler, (e) =>
      reportar("home.preferencias", e, "as prioridades e os cliques ficam só neste computador até a próxima sessão", true));
    return sair;
  }, []);
  const salvarInteresses = (ids: string[]) => {
    const novo = { ...lerPreferenciasHome(), interesses: ids };
    setPrefs(novo);
    gravarPreferenciasHome(novo);
  };
  const clicou = (id: string) => {
    const atual = lerPreferenciasHome();
    const novo = {
      ...atual,
      cliques: { ...atual.cliques, [id]: (atual.cliques[id] ?? 0) + 1 },
      exibidas: registrarClique(atual.exibidas, id, hojeRef.current),
    };
    setPrefs(novo);
    gravarPreferenciasHome(novo, { adiar: true });
  };
  /** A Home mostrou estas sugestões hoje (uma vez por dia conta como um dia sem clique). */
  const exibiu = (ids: string[]) => {
    const atual = lerPreferenciasHome();
    const exibidas = registrarExibicao(atual.exibidas, ids, hojeRef.current);
    if (exibidas === atual.exibidas) return;
    const novo = { ...atual, exibidas };
    setPrefs(novo);
    gravarPreferenciasHome(novo, { adiar: true });
  };
  /** O arranjo da Home (ordem e escondidos) sobe na hora: é um ato da pessoa. */
  const salvarLayout = (layout: LayoutHome) => {
    const novo = { ...lerPreferenciasHome(), layout };
    setPrefs(novo);
    gravarPreferenciasHome(novo);
  };
  /** O pedido do chat muda o arranjo E as prioridades num gesto só (e o desfazer volta os dois). */
  const salvarAjuste = (layout: LayoutHome, interesses: string[] | null) => {
    const novo = { ...lerPreferenciasHome(), layout, interesses };
    setPrefs(novo);
    gravarPreferenciasHome(novo);
  };
  // Quem arrastou os cards antes do arranjo ir para o servidor não perde o que fez.
  const [antigo, setAntigo] = React.useState<LayoutHome | null>(null);
  const antigoRef = React.useRef<LayoutHome | null>(null);
  React.useEffect(() => {
    try {
      antigoRef.current = layoutDasOrdensAntigas(JSON.parse(localStorage.getItem(CHAVE_ORDEM_ANTIGA) ?? "null"));
      setAntigo(antigoRef.current);
    } catch { /* preferência ilegível: arranjo padrão */ }
  }, []);
  /** O arranjo de AGORA, lido na hora (o chat guarda a função desde que abriu). */
  const lerLayout = (): LayoutHome => lerPreferenciasHome().layout ?? antigoRef.current ?? LAYOUT_PADRAO;
  const opcoes = INTERESSES.filter((i) => i.publico === tipo);
  return {
    interesses: prefs === undefined ? undefined : prefs.interesses, cliques: prefs?.cliques ?? {}, exibidas: prefs?.exibidas ?? {},
    layout: prefs?.layout ?? antigo ?? LAYOUT_PADRAO,
    salvarInteresses, clicou, exibiu, salvarLayout, salvarAjuste, lerLayout, opcoes,
  };
}

type PreferenciasIA = ReturnType<typeof usePreferenciasIA>;

/** Quanto a lista precisa ficar parada na tela para contar como vista. */
const EXIBIDA_APOS_MS = 8_000;

/**
 * Etapa 5: registra que as sugestões (sem as básicas, que são fixas) ficaram
 * na tela hoje. Só depois de a lista PARAR por alguns segundos — a ordem das
 * regras é trocada pela da IA logo depois de carregar, e a lista que piscou
 * antes disso ninguém viu. No primeiro acesso não há o que contar.
 */
function useExibicoes(sugestoes: SugestaoEscolhida[] | null, sinais: SinaisHome | null, prefs: PreferenciasIA) {
  const ids = (sugestoes ?? []).filter((x) => !sinais || !BASICAS[sinais.tipoConta].includes(x.id)).map((x) => x.id);
  const chave = ids.join(",");
  const hoje = sinais?.hoje;
  const ligado = Array.isArray(prefs.interesses) && ids.length > 0 && !!hoje;
  const exibiu = React.useRef(prefs.exibiu);
  exibiu.current = prefs.exibiu;
  React.useEffect(() => {
    if (!ligado) return;
    const t = setTimeout(() => exibiu.current(chave.split(",")), EXIBIDA_APOS_MS);
    return () => clearTimeout(t);
  }, [ligado, chave, hoje]);
}

/**
 * A ordem que a Quattro AI propõe para as quatro sugestões depois das básicas
 * (etapa 2). Só pergunta depois do primeiro acesso (antes dele só aparecem as
 * básicas) e uma vez por dia e por conjunto de candidatas — o cache é o do
 * React Query, em memória. Qualquer falha devolve `null` e a Home fica com a
 * ordem das regras; quem valida o que veio é `recomendarSugestoes`.
 */
function useOrdemDaIA(sinais: SinaisHome | null, candidatas: CandidataIA[], ligado: boolean) {
  const { data } = useQuery({
    queryKey: ["home-sugestoes-ia", sinais?.hoje, sinais?.tipoConta, candidatas.map((c) => c.id).join(","), (sinais?.interesses ?? []).join(","), sinais?.perfil?.descricao ?? ""],
    enabled: ligado && !!sinais && candidatas.length > 0,
    staleTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<string[] | null> => {
      try {
        const res = await fetch("/api/ai/sugestoes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contexto: contextoParaIA(sinais!), candidatas }),
        });
        const j = (await res.json().catch(() => null)) as { ok?: boolean; ids?: unknown } | null;
        return j?.ok && Array.isArray(j.ids) ? (j.ids as string[]) : null;
      } catch (e) {
        reportar("home.sugestoes-ia", e, "as sugestões da Home ficam na ordem das regras, sem a escolha da IA", true);
        return null;
      }
    },
  });
  return data ?? null;
}

/** "O que é mais importante no seu dia a dia?" — a pergunta do primeiro acesso. */
function PerguntaPrioridades({ prefs, aoFechar }: { prefs: PreferenciasIA; aoFechar: () => void }) {
  const [marcadas, setMarcadas] = React.useState<string[]>(prefs.interesses ?? []);
  const alternar = (id: string) =>
    setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const concluir = (ids: string[]) => { prefs.salvarInteresses(ids); aoFechar(); };
  return (
    <div className="w-full max-w-[720px] flex flex-col items-center gap-3 px-5 py-4 rounded-[24px]" style={{ background: "var(--color-surface-1)" }}>
      <span className="text-[14px] text-ink">O que é mais importante no seu dia a dia?</span>
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Prioridades do dia a dia">
        {prefs.opcoes.map((o) => {
          const on = marcadas.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => alternar(o.id)}
              className="px-3 py-[6px] rounded-pill text-[13px]"
              style={on
                ? { background: "var(--color-ink)", color: "var(--color-surface-1)" }
                : { background: "var(--color-white)", color: "var(--color-ink)" }}
            >
              {o.rotulo}
            </button>
          );
        })}
      </div>
      <div className="flex gap-4 items-center">
        <button type="button" onClick={() => concluir([])} className="text-[13px] text-muted">Agora não</button>
        <button
          type="button"
          disabled={marcadas.length === 0}
          onClick={() => concluir(marcadas)}
          className="px-4 py-[6px] rounded-pill text-[13px] disabled:opacity-40"
          style={{ background: "var(--erp-num-cor)", color: "var(--color-surface-1)" }}
        >
          Gerar sugestões
        </button>
      </div>
    </div>
  );
}

/** Quantas perguntas o "Veja tudo o que eu faço" do chat mostra. */
const TODAS_NO_CHAT = 12;

function CaixaIA({ sugestoes, extras, prefs }: {
  sugestoes: SugestaoEscolhida[] | null;
  /** As candidatas seguintes, para completar o "Veja tudo o que eu faço". */
  extras: CandidataIA[];
  prefs: PreferenciasIA;
}) {
  const [texto, setTexto] = React.useState("");
  const todas = React.useMemo(() => {
    const out: SugestaoChat[] = [];
    for (const c of [...(sugestoes ?? []), ...extras]) {
      if (out.length >= TODAS_NO_CHAT) break;
      if (!out.some((o) => o.id === c.id)) out.push({ id: c.id, texto: c.texto, curto: c.curto, icone: c.icone, motivo: c.motivo });
    }
    return out;
  }, [sugestoes, extras]);
  const perguntando = prefs.interesses === null;
  // No primeiro acesso só as duas básicas aparecem; o resto vem da resposta.
  const visiveis = (sugestoes ?? []).slice(0, perguntando ? 2 : undefined);
  // O chat em tela cheia (modelo do dono, 14/10/2026) é o MESMO de todo o
  // sistema (`ChatGlobal`): o chip ou o envio abre a conversa já com a
  // pergunta, por cima da Home; o "+" e o envio vazio abrem na saudação.
  const perguntar = (q?: string) => {
    const t = q?.trim();
    setTexto("");
    abrirChat({ pergunta: t || undefined, sugestoes: todas, aoClicarSugestao: prefs.clicou });
  };
  return (
    <section className="a4p-ondas-ia flex flex-col items-center gap-[14px] rounded-[32px] px-6 py-11">
      <form
        onSubmit={(e) => { e.preventDefault(); perguntar(texto); }}
        className="w-full max-w-[720px] h-14 flex items-center gap-3 px-[10px] rounded-[28px]"
        // Barra BRANCA (pedido do dono, 15/10/2026): o mesmo branco da pílula.
        style={{ background: "var(--a4p-pilula-fundo)" }}
      >
        <button
          type="button"
          onClick={() => perguntar()}
          aria-label="Abrir a Quattro AI"
          className="w-9 h-9 flex-none rounded-pill flex items-center justify-center"
          style={{ background: "var(--color-surface-1)", color: "var(--color-ink)" }}
        >
          <Icon name="plus" size={18} strokeWidth={1.5} />
        </button>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          // Duplo clique no campo abre o chat (pedido do dono, 19/10/2026),
          // levando o que já estiver digitado; vazio, abre na saudação.
          onDoubleClick={() => perguntar(texto)}
          placeholder="Pergunte à Quattro AI ou crie um fluxo"
          aria-label="Pergunte à Quattro AI"
          className="a4p-ia-campo flex-1 min-w-0 bg-transparent outline-none text-[15px] text-ink placeholder:text-muted"
        />
        <span aria-hidden className="flex-none text-ink"><MicIcon /></span>
        <button
          type="submit"
          aria-label="Enviar pergunta"
          className="w-9 h-9 flex-none rounded-pill flex items-center justify-center"
          // Botão escuro pedido pelo dono no canvas: o preto do número, com o
          // ícone no branco da superfície.
          style={{ background: "var(--erp-num-cor)", color: "var(--color-surface-1)" }}
        >
          <Icon name="arrow-up" size={18} strokeWidth={1.5} />
        </button>
      </form>
      {/* As sugestões saem de `core/home/sugestoes`: até seis, escolhidas pelo
          contexto da empresa. O chip mostra o rótulo CURTO com ícone; a
          pergunta inteira é o nome acessível e o que vai para a conversa. O
          motivo vai no `title`. */}
      <div className="flex flex-wrap justify-center gap-[10px] max-w-[900px] min-h-[36px]">
        {visiveis.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { prefs.clicou(c.id); perguntar(c.texto); }}
            title={`${c.texto} · sugerida porque ${c.motivo}`}
            aria-label={c.texto}
            data-sugestao={c.id}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-pill text-[14px] a4p-pilula"
          >
            <Icon name={c.icone} size={16} strokeWidth={1.5} />
            {c.curto}
          </button>
        ))}
      </div>
      {perguntando && <PerguntaPrioridades prefs={prefs} aoFechar={() => {}} />}
    </section>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}>
        <path d="M17 7v4a5 5 0 0 1-10 0V7a5 5 0 0 1 10 0" />
        <path d="M20 11a8 8 0 0 1-16 0m8 8v3m-3 0h6" />
      </g>
    </svg>
  );
}

/* ------------------------------ peças dos cards ------------------------------ */

/**
 * Onde a ordem dos cards morava antes de ir para o servidor (preferência do
 * dispositivo, por grupo "grandes"/"pequenos"). Só é LIDA, uma vez, para quem
 * já tinha arrumado não perder o arranjo: o que vale agora é `layout` em
 * `a4p_home_preferencias` (`core/home/itens`).
 */
const CHAVE_ORDEM_ANTIGA = "a4p_home_painel_ordem";

/**
 * O arraste dos itens da Home. Só a ALÇA inicia (o card inteiro é link, e
 * arrastar pelo corpo brigaria com o clique). Durante o gesto a troca é só de
 * tela (`rascunho`); o arranjo é GRAVADO ao soltar — gravar a cada passo do
 * arraste mandaria uma dúzia de eventos à trilha por um movimento só. Pelo
 * teclado, as setas na alça trocam o item com o vizinho e gravam na hora.
 * Cada item só troca de lugar com outro da MESMA seção.
 */
function useArraste(layout: LayoutHome, salvar: (l: LayoutHome) => void) {
  const [rascunho, setRascunho] = React.useState<LayoutHome | null>(null);
  const [arrastando, setArrastando] = React.useState<IdHome | null>(null);
  const [armado, setArmado] = React.useState<IdHome | null>(null);
  // O rascunho da largura também num ref: o "soltar" do arraste da borda foi
  // criado no início do gesto e leria o estado de então.
  const rascunhoRef = React.useRef<LayoutHome | null>(null);
  const atual = rascunho ?? layout;
  const mesmoGrupo = (a: IdHome, b: IdHome) => itemHome(a).grupo === itemHome(b).grupo;
  const soltar = () => {
    if (rascunho) salvar(rascunho);
    setRascunho(null); setArrastando(null); setArmado(null);
  };
  const props = (id: IdHome) => ({
    draggable: armado === id,
    style: { opacity: arrastando === id ? 0.45 : 1 },
    onDragStart: (e: React.DragEvent) => { setArrastando(id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); },
    onDragOver: (e: React.DragEvent) => {
      if (!arrastando || !mesmoGrupo(arrastando, id)) return;
      e.preventDefault();
      if (arrastando !== id) setRascunho((r) => moverItem(r ?? layout, arrastando, id));
    },
    onDrop: (e: React.DragEvent) => e.preventDefault(),
    onDragEnd: soltar,
  });
  // A LARGURA (pedido do dono, 16/10/2026): a borda direita do card arrasta.
  // Durante o gesto só a tela muda; o arranjo é gravado ao soltar.
  const borda = (id: IdHome) => ({
    largura: larguraDe(atual, id),
    aoArrastar: (l: LarguraHome) => {
      const novo = definirLargura(rascunhoRef.current ?? layout, id, l);
      rascunhoRef.current = novo;
      setRascunho(novo);
    },
    aoSoltar: () => {
      const r = rascunhoRef.current;
      rascunhoRef.current = null;
      if (r && !mesmoLayout(r, layout)) salvar(r);
      setRascunho(null);
    },
    aoPasso: (passo: -1 | 1) => salvar(definirLargura(atual, id, larguraVizinha(larguraDe(atual, id), passo))),
  });
  const alca = (id: IdHome) => ({
    onArmar: () => setArmado(id),
    onDesarmar: () => { if (!arrastando) setArmado(null); },
    onMover: (passo: -1 | 1) => {
      const vizinhos = visiveis(atual, itemHome(id).grupo);
      const alvo = vizinhos[vizinhos.indexOf(id) + passo];
      if (alvo) salvar(moverItem(atual, id, alvo));
    },
  });
  return { layout: atual, props, alca, borda };
}

/** A classe de cada largura (o Tailwind só gera classes escritas por inteiro). */
const SPAN: Record<LarguraHome, string> = {
  3: "lg:col-span-3", 4: "lg:col-span-4", 6: "lg:col-span-6", 8: "lg:col-span-8", 9: "lg:col-span-9", 12: "lg:col-span-12",
};
/** A grade de cada seção da Home: doze colunas, o menor card ocupa três (quatro por linha). */
const GRADE = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4";
const NOME_LARGURA: Record<LarguraHome, string> = { 3: "um quarto", 4: "um terço", 6: "metade", 8: "dois terços", 9: "três quartos", 12: "a linha inteira" };

function ItemArrastavel({ id, arraste, children, largura, lugarDaAlca = "right-4 top-4" }: {
  id: IdHome;
  arraste: ReturnType<typeof useArraste>;
  children: React.ReactNode;
  /** A largura na linha; sem ela, a do arranjo. */
  largura?: LarguraHome;
  /** Onde a alça fica: o card da biblioteca já tem o "i" no canto. */
  lugarDaAlca?: string;
}) {
  const borda = arraste.borda(id);
  const l = largura ?? borda.largura;
  return (
    <div
      className={`group/item relative min-w-0 transition-opacity ${l === 12 ? "md:col-span-2" : ""} ${SPAN[l]}`}
      data-item-home={id}
      data-largura={l}
      {...arraste.props(id)}
    >
      {children}
      <Alca {...arraste.alca(id)} lugar={lugarDaAlca} />
      <Borda {...borda} largura={l} nome={itemHome(id).nome} />
    </div>
  );
}

/**
 * A borda direita do card, que arrasta a LARGURA. A largura sai da posição do
 * ponteiro dentro da linha (a grade de doze colunas) e encaixa na mais perto
 * de `LARGURAS_HOME`: um quarto é o mínimo, então cabem no máximo quatro por
 * linha. Pelo teclado, as setas trocam para a largura vizinha.
 */
function Borda({ largura, aoArrastar, aoSoltar, aoPasso, nome }: {
  largura: LarguraHome;
  aoArrastar: (l: LarguraHome) => void;
  aoSoltar: () => void;
  aoPasso: (passo: -1 | 1) => void;
  nome: string;
}) {
  const [ativa, setAtiva] = React.useState(false);
  const iniciar = (e: React.PointerEvent<HTMLDivElement>) => {
    const item = e.currentTarget.parentElement;
    const grade = item?.parentElement;
    if (!item || !grade) return;
    e.preventDefault();
    e.stopPropagation();
    setAtiva(true);
    const linha = grade.getBoundingClientRect();
    const inicio = item.getBoundingClientRect().left;
    const mover = (ev: PointerEvent) => aoArrastar(larguraMaisPerto((ev.clientX - inicio) / linha.width));
    const soltar = () => {
      setAtiva(false);
      aoSoltar();
      document.removeEventListener("pointermove", mover);
      document.removeEventListener("pointerup", soltar);
      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("cursor");
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerup", soltar);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Largura de ${nome}: ${NOME_LARGURA[largura]}. Setas para mudar.`}
      aria-valuemin={3}
      aria-valuemax={12}
      aria-valuenow={largura}
      tabIndex={0}
      title="Arraste para mudar a largura"
      onPointerDown={iniciar}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); aoPasso(-1); }
        if (e.key === "ArrowRight") { e.preventDefault(); aoPasso(1); }
      }}
      className={`hidden lg:flex absolute top-0 bottom-0 -right-[9px] w-[14px] items-center justify-center cursor-col-resize z-10 transition-opacity ${ativa ? "opacity-100" : "opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100"}`}
    >
      <span className="w-[4px] h-12 rounded-pill" style={{ background: "var(--color-text-tertiary)" }} />
    </div>
  );
}

function Alca({ onArmar, onDesarmar, onMover, lugar }: { onArmar: () => void; onDesarmar: () => void; onMover: (passo: -1 | 1) => void; lugar: string }) {
  return (
    <button
      type="button"
      title="Arraste para mudar a posição"
      aria-label="Mover card (setas do teclado)"
      onPointerDown={onArmar}
      onPointerUp={onDesarmar}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); onMover(-1); }
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); onMover(1); }
      }}
      className={`absolute ${lugar} w-6 h-8 flex items-center justify-center text-muted cursor-grab active:cursor-grabbing`}
    >
      <Icon name="grip-vertical" size={18} strokeWidth={1.5} />
    </button>
  );
}

/** A pílula "+2,4% em 30 dias" — exceção declarada de cor por sinal. */
function Pilula({ v }: { v: number | null }) {
  if (v == null) {
    return (
      <span className="rounded-pill px-2 py-[2.4px] text-[10.4px] font-medium whitespace-nowrap text-muted" style={{ background: "var(--color-surface-2)" }}>
        sem base em 30 dias
      </span>
    );
  }
  const cor = v < 0 ? "var(--color-negative)" : "var(--color-positive)";
  const txt = `${v > 0 ? "+" : ""}${pct(v)}`;
  return (
    <span
      className="rounded-pill px-2 py-[2.4px] text-[10.4px] font-medium whitespace-nowrap tabular-nums"
      style={{ color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}
    >
      {txt} em 30 dias
    </span>
  );
}

function Valor({ n, compacto }: { n: NumeroHome; compacto?: boolean }) {
  if (!temValor(n.atual) && n.atual.indisponivel) {
    return <SemDados motivo={n.atual.indisponivel.motivo} codigo={n.atual.indisponivel.codigo} />;
  }
  if (n.unidade === "meses") {
    return (
      <span className="a4p-num inline-flex items-baseline whitespace-nowrap tabular-nums">
        <span>{decimalBR(n.atual.valor, 0)}</span>
        <span className="text-muted" style={{ fontSize: "0.55em", marginLeft: "0.35em" }}>
          {Math.round(n.atual.valor) === 1 ? "mês" : "meses"}
        </span>
      </span>
    );
  }
  return <BRL value={n.atual.valor} compacto={compacto} />;
}

/** Curva suave (cúbica) com área em degradê lime — o desenho da prancheta. */
function Curva({ id, curva }: { id: string; curva: CurvaHome }) {
  const W = 520, H = 160, TOPO = 20, BASE = 140;
  const v = curva.pontos;
  const min = Math.min(...v), max = Math.max(...v);
  const p = v.map((y, i) => [i * W / Math.max(1, v.length - 1), BASE - (y - min) / ((max - min) || 1) * (BASE - TOPO)]);
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1], [x1, y1] = p[i], cx = (x0 + x1) / 2;
    d += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  const gid = `home-curva-${id}`;
  return (
    <div className="flex flex-col gap-2 flex-1">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-40 overflow-visible" role="img" aria-label={`Evolução de ${curva.meses[0]} a ${curva.meses[curva.meses.length - 1]}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-lime)" stopOpacity={0.55} />
            <stop offset="100%" stopColor="var(--color-lime)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {[40, 85, 130].map((y) => (
          <line key={y} x1={0} y1={y} x2={W} y2={y} stroke="var(--color-border)" strokeWidth={1} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#${gid})`} stroke="none" />
        <path d={d} fill="none" stroke="var(--color-ink)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[11px] text-muted tabular-nums">
        {curva.meses.map((m, i) => <span key={`${m}-${i}`}>{m}</span>)}
      </div>
    </div>
  );
}

/**
 * O gráfico de cada card grande, trocado no canvas "Gráficos e tabelas"
 * (pranchetas de TROCAS, 15/10/2026): o caixa consolidado virou o modelo
 * "Entradas" (o que entrou e saiu em cada mês) e o ARR virou "Estatística de
 * saldo 1" (linha + área). Sem a série de entradas/saídas, fica a curva.
 */
function GraficoDoCard({ id, curva }: { id: string; curva: CurvaHome }) {
  const meses = curva.meses;
  if (id === "caixa" && curva.entradas && curva.saidas) {
    const dados = meses.map((m, i) => ({ label: m, entrada: curva.entradas?.[i] ?? 0, saida: curva.saidas?.[i] ?? 0 }));
    return <BarrasEntradaSaida dados={dados} altura={180} ariaLabel={`Entradas e saídas de ${meses[0]} a ${meses[meses.length - 1]}`} />;
  }
  if (id === "arr") {
    const dados = meses.map((m, i) => ({ label: m, valor: curva.pontos[i] ?? 0 }));
    return <AreaComparada id="home-arr" dados={dados} altura={180} ariaLabel={`ARR de ${meses[0]} a ${meses[meses.length - 1]}`} />;
  }
  return <Curva id={id} curva={curva} />;
}

function CardGrande({ n, curva, carimbo }: { n: NumeroHome; curva: CurvaHome; carimbo: string }) {
  return (
    <Link
      href={n.href}
      draggable={false}
      className="relative h-full min-w-0 flex flex-col gap-4 min-h-[380px] px-8 pt-[30px] pb-6"
      style={{ background: "var(--color-white)", borderRadius: "var(--a4p-box-radius)" }}
    >
      <span className="text-[15px] text-ink">{n.rotulo}</span>
      <div className="flex items-center gap-[13.8px] flex-wrap">
        <span className="a4p-heroi" style={{ fontSize: 36, lineHeight: 1 }}><Valor n={n} /></span>
        <Pilula v={n.variacao} />
      </div>
      <GraficoDoCard id={n.id} curva={curva} />
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[12px] text-muted pt-3 border-t" style={{ borderColor: "var(--erp-menu-borda)" }}>
        <span>{carimbo}</span>
        <span className="text-[13px]">vs. o mesmo dia do mês passado</span>
      </div>
    </Link>
  );
}

function CardPequeno({ n, carimbo }: { n: NumeroHome; carimbo: string }) {
  return (
    <Link
      href={n.href}
      draggable={false}
      className="relative h-full min-w-0 flex flex-col gap-3 px-7 py-[22px]"
      style={{ background: "var(--color-white)", borderRadius: "var(--a4p-box-radius)" }}
    >
      <span className="text-[15px] text-muted">{n.rotulo}</span>
      <div className="flex items-center gap-3 flex-wrap">
        <span style={{ fontSize: 30, lineHeight: 1 }}><Valor n={n} compacto /></span>
        <Pilula v={n.variacao} />
      </div>
      <span className="text-[12px] text-muted">{carimbo}</span>
    </Link>
  );
}

/* ------------------------------ três colunas ------------------------------ */

const COLUNA = "h-full flex flex-col p-6";
const colunaStyle = { background: "var(--color-white)", borderRadius: "var(--a4p-box-radius)" } as const;

interface Pendencias {
  conciliar: number | null;
  notas: number | null;
  compras: number | null;
  aprovacoes: number | null;
  boletos: number | null;
}

/** As contagens de "Precisa de ação" — também alimentam as sugestões da IA. */
function usePendencias(): Pendencias {
  const { data: naoConciliadas } = useUnreconciled();
  const { data: vendas } = useVendas();
  const [locais, setLocais] = React.useState<{ compras: number; boletos: number; aprovacoes: number } | null>(null);
  React.useEffect(() => {
    let vivo = true;
    const contar = () => ({
      compras: listarCompras().filter((c) => c.status === "aguardando").length,
      boletos: listarBoletos().filter((b) => !b.pago).length,
      aprovacoes: listSolicitacoes().filter((s) => s.statusFinal === "em_analise").length,
    });
    setLocais(contar());
    hydrateAprovacoes().then(() => { if (vivo) setLocais(contar()); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  const notas = vendas ? painelStatusNF(vendas).find((c) => c.id === "a_emitir")?.quantidade ?? 0 : null;
  const conciliar = naoConciliadas?.length ?? null;
  return React.useMemo(() => ({
    conciliar, notas,
    compras: locais?.compras ?? null,
    aprovacoes: locais?.aprovacoes ?? null,
    boletos: locais?.boletos ?? null,
  }), [conciliar, notas, locais]);
}

function PrecisaDeAcao({ p }: { p: Pendencias }) {
  const itens = [
    { nome: "Transações a conciliar", qtd: p.conciliar, href: "/dashboard/financial/reconciliation" },
    { nome: "Notas a emitir", qtd: p.notas, href: "/contas-a-receber/painel-de-vendas?aba=pedidos" },
    { nome: "Compras a aprovar", qtd: p.compras, href: "/dashboard/purchases" },
    { nome: "Lançamentos aguardando aprovação", qtd: p.aprovacoes, href: "/central?aba=solicitacoes" },
    { nome: "Boletos a pagar", qtd: p.boletos, href: "/contas-a-pagar/titulos?aba=caixa-de-entrada&caixa=boletos" },
  ];
  return (
    <div className={`${COLUNA} gap-[6px]`} style={colunaStyle}>
      <span className="a4p-titulo-secao text-[15px] text-muted">Precisa de ação</span>
      {itens.map((a) => (
        <Link key={a.nome} href={a.href} className="flex justify-between items-center py-[11px] border-t text-ink" style={{ borderColor: "var(--color-border)" }}>
          <span>{a.nome}</span>
          <span className="a4p-num tabular-nums font-medium">{a.qtd ?? "—"}</span>
        </Link>
      ))}
    </div>
  );
}

const ROTULO_STATUS: Record<TarefaFechamento["status"], string> = {
  pending: "Não iniciada", review: "Em revisão", done: "Concluída",
};

function useTarefasDoMes(mes: string): TarefaFechamento[] | null {
  const [tarefas, setTarefas] = React.useState<TarefaFechamento[] | null>(null);
  React.useEffect(() => {
    let vivo = true;
    tarefasDoMes(mes).then((t) => { if (vivo) setTarefas(t); }).catch(() => { if (vivo) setTarefas([]); });
    return () => { vivo = false; };
  }, [mes]);
  return tarefas;
}

function Fechamento({ mes, tarefas }: { mes: string; tarefas: TarefaFechamento[] | null }) {
  const total = tarefas?.length ?? 0;
  const feitas = tarefas?.filter((t) => t.status === "done").length ?? 0;
  const fracao = total > 0 ? feitas / total : 0;
  const abertas = (tarefas ?? []).filter((t) => t.status !== "done").slice(0, 3);
  return (
    <Link href="/dashboard/reports/monthly-closing" className={`${COLUNA} gap-3`} style={colunaStyle}>
      <span className="a4p-titulo-secao text-[15px] text-muted">Fechamento de {MESES_LONGOS[Number(mes.slice(5, 7)) - 1]}</span>
      <div className="flex items-baseline justify-between">
        <span className="a4p-num tabular-nums" style={{ fontSize: 30, lineHeight: 1 }}>{tarefas ? pct(fracao, 0) : "—"}</span>
        <span className="text-[13px] text-muted tabular-nums">{feitas} / {total} concluídas</span>
      </div>
      <div className="h-[6px] rounded-[3px]" style={{ background: "var(--color-border)" }}>
        <div className="h-[6px] rounded-[3px]" style={{ width: `${Math.round(fracao * 100)}%`, background: "var(--color-ink)" }} />
      </div>
      {abertas.map((t) => (
        <div key={t.id} className="flex justify-between items-center gap-2 py-[10px] border-t" style={{ borderColor: "var(--color-border)" }}>
          <span className="text-[14px] text-ink">{t.titulo}</span>
          <span className="flex-none text-[10px] font-medium px-[10px] py-1 rounded-pill text-muted" style={{ background: "var(--color-surface-1)" }}>
            {ROTULO_STATUS[t.status]}
          </span>
        </div>
      ))}
    </Link>
  );
}

function RelatoriosFixados() {
  return (
    <div className={`${COLUNA} gap-[6px]`} style={colunaStyle}>
      <span className="a4p-titulo-secao text-[15px] text-muted">Relatórios fixados</span>
      {RELATORIOS.map((r) => (
        <Link key={r.nome} href={r.href} className="flex justify-between items-center py-[11px] border-t text-ink" style={{ borderColor: "var(--color-border)" }}>
          <span>{r.nome}</span>
          <span className="w-[30px] h-[30px] flex-none rounded-pill flex items-center justify-center" style={{ background: "var(--color-surface-1)" }}>
            <Icon name="arrow-up-right" size={16} strokeWidth={1.5} />
          </span>
        </Link>
      ))}
      <Link href="/dashboard/reports/dre" className="pt-3 border-t text-[14px] text-muted" style={{ borderColor: "var(--color-border)" }}>
        + Adicionar relatório
      </Link>
    </div>
  );
}

/* ------------------------------ ajustar prioridades ------------------------------ */

/** A pergunta com que o chat abre no "Ajustar prioridades" (pedido do dono). */
const PERGUNTA_DO_AJUSTE = "O que você gostaria de ver primeiro quando abre o Quattro?";

/**
 * O pedido digitado vira ações sobre a Home: primeiro a Quattro AI
 * (`/api/ai/home-layout`), e — sem chave, sem sessão, com erro ou sem ação
 * nenhuma — a leitura por regras (`interpretarPedido`). ⚠️ O que a IA devolve é
 * DADO DE FORA e passa de novo por `normalizarAcoes` aqui.
 */
async function acoesDoPedido(texto: string, layout: LayoutHome): Promise<AcaoHome[]> {
  try {
    const res = await fetch("/api/ai/home-layout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pedido: descricaoParaIA(texto), layout }),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; acoes?: unknown } | null;
    const daIA = j?.ok ? normalizarAcoes(j.acoes) : [];
    if (daIA.length > 0) return daIA;
  } catch (e) {
    reportar("home.ajuste-ia", e, "o pedido foi lido pelas regras de texto, sem a Quattro AI", true);
  }
  return interpretarPedido(texto, layout);
}

/**
 * O "Ajustar prioridades" pela conversa (etapas 2 e 3, 14/10/2026): abre o
 * chat da Quattro AI no modo ajuste. A resposta da pessoa arruma a Home (ordem
 * e o que aparece), soma às prioridades o que ela disse (as mesmas palavras da
 * descrição livre) e o chat conta o que mudou, com desfazer.
 */
function useAjusteDaHome(prefs: PreferenciasIA, tipo: "empresa" | "pessoal") {
  return () => abrirChat({
    ajuste: {
      pergunta: PERGUNTA_DO_AJUSTE,
      exemplos: EXEMPLOS_DE_PEDIDO,
      responder: async (texto: string): Promise<RespostaChatAjuste> => {
        const antes = prefs.lerLayout();
        // "O que mais dá para colocar?" é pergunta, não pedido: lista e não mexe na tela.
        const tema = pedeCatalogo(texto);
        if (tema !== undefined) return respostaDoCatalogo(antes, tema);
        const interessesAntes = lerPreferenciasHome().interesses;
        const acoes = await acoesDoPedido(texto, antes);
        const depois = aplicarAcoes(antes, acoes);
        const mudancas = descreverMudancas(antes, depois, acoes);
        const ditos = interessesDaDescricao(texto, tipo);
        const interesses = ditos.length
          ? [...(interessesAntes ?? []), ...ditos.filter((d) => !(interessesAntes ?? []).includes(d))]
          : interessesAntes;
        if (!mesmoLayout(antes, depois) || interesses !== interessesAntes) prefs.salvarAjuste(depois, interesses);
        const r = respostaDoAjuste(acoes, mudancas, cardsRecusados(depois, acoes));
        return { ...r, desfazer: r.mudou ? () => prefs.salvarAjuste(antes, interessesAntes) : undefined };
      },
    },
  });
}

/* ------------------------------ a tela ------------------------------ */

const LARGURA_DOS_BLOCOS: Record<number, LarguraHome> = { 1: 12, 2: 6, 3: 4 };

/**
 * Os cards da BIBLIOTECA que a pessoa pôs na Home pela conversa. O desenho é o
 * do catálogo do cockpit (`CATALOG_BY_ID`), pelo mesmo id: um card da Home e o
 * da tela de origem nunca divergem. ⚠️ Montado SÓ quando há card — os motores
 * que eles leem (`useCockpitCtx`) não rodam para quem não pôs nenhum.
 */
function CardsDaBiblioteca({ ids, arraste, aoTirar }: {
  ids: IdCard[];
  arraste: ReturnType<typeof useArraste>;
  aoTirar: (id: IdCard) => void;
}) {
  const ctx = useCockpitCtx();
  return (
    <div className={GRADE} data-home="cards">
      {ids.map((id) => {
        const w = CATALOG_BY_ID.get(idDoCockpit(id));
        if (!w) return null;
        const nome = itemHome(id).nome;
        return (
          // O "i" do card mora no canto (top-3 right-3): alça e X ficam à esquerda dele.
          <ItemArrastavel key={id} id={id} arraste={arraste} lugarDaAlca="right-9 top-2">
            {w.render(ctx)}
            <button
              type="button"
              onClick={() => aoTirar(id)}
              title={`Tirar ${nome} da Home`}
              aria-label={`Tirar ${nome} da Home`}
              className="absolute right-16 top-2 w-6 h-8 flex items-center justify-center text-muted hover:text-ink"
            >
              <Icon name="x" size={16} strokeWidth={1.5} />
            </button>
          </ItemArrastavel>
        );
      })}
    </div>
  );
}

export function HomeSnapshot() {
  const { data: input, isLoading } = useRiscoInput();
  const carimbo = useCarimbo();
  const snap = React.useMemo(() => (input ? montarHomeSnapshot(input) : null), [input]);
  const hoje = snap?.hoje ?? input?.hoje ?? isoLocal(new Date());
  const mes = hoje.slice(0, 7);
  const pendencias = usePendencias();
  const tarefas = useTarefasDoMes(mes);
  const { tipo } = useTipoConta();
  const prefs = usePreferenciasIA(tipo, hoje);
  const [perfil, setPerfil] = React.useState<ReturnType<typeof loadCompany> | undefined>(undefined);
  React.useEffect(() => { setPerfil(loadCompany()); }, []);

  const sinais = React.useMemo(() => {
    if (!snap || !input || perfil === undefined) return null;
    const fechamento = tarefas && tarefas.length > 0 ? tarefas.filter((t) => t.status === "done").length / tarefas.length : null;
    return sinaisDaHome({
      snap, input, tipoConta: tipo, perfil: perfil?.perfil ?? null, pendencias, fechamento,
      interesses: prefs.interesses ?? [], cliques: prefs.cliques, exibidas: prefs.exibidas,
    });
  }, [snap, input, perfil, tipo, pendencias, tarefas, prefs.interesses, prefs.cliques, prefs.exibidas]);
  const candidatas = React.useMemo(() => (sinais ? candidatasParaIA(sinais) : []), [sinais]);
  // No primeiro acesso (`interesses === null`) só as básicas aparecem: não há o que a IA ordenar.
  const ordemIA = useOrdemDaIA(sinais, candidatas, Array.isArray(prefs.interesses));
  const sugestoes = React.useMemo(
    () => (sinais ? recomendarSugestoes(sinais, LIMITE_SUGESTOES, ordemIA) : null),
    [sinais, ordemIA],
  );
  useExibicoes(sugestoes, sinais, prefs);

  const arraste = useArraste(prefs.layout, prefs.salvarLayout);
  const ajustar = useAjusteDaHome(prefs, tipo);
  const layout = arraste.layout;
  const numero = (id: IdItemHome): (NumeroHome & { curva?: CurvaHome }) | undefined =>
    !snap ? undefined : id === "caixa" ? snap.caixa : id === "arr" ? snap.arr : snap.pequenos.find((n) => n.id === id);
  const bloco = (id: IdItemHome) =>
    id === "acao" ? <PrecisaDeAcao p={pendencias} />
      : id === "fechamento" ? <Fechamento mes={mes} tarefas={tarefas} />
        : <RelatoriosFixados />;

  // Card da biblioteca entra no TOPO de "Seu painel", acima dos números fixos
  // (decisão do dono, 14/10/2026): não existe seção de cards à parte.
  const cardsVisiveis = visiveis(layout, "card") as IdCard[];
  const painel = visiveis(layout, "painel").length === 0 && cardsVisiveis.length === 0 ? null : (
    <section key="painel" className="flex flex-col gap-4">
      {/* "Ajustar prioridades" ao lado do título (pedido do dono, 16/10/2026). */}
      <div className="flex items-center gap-4 flex-wrap">
        <h2 className="m-0 text-[22px] font-medium text-ink" style={{ fontFamily: "var(--font-sans)", textTransform: "none" }}>Seu painel</h2>
        {prefs.interesses !== undefined && prefs.interesses !== null && (
          <button type="button" onClick={ajustar} className="inline-flex items-center gap-2 h-9 px-4 rounded-pill text-[13px] a4p-pilula">
            <Icon name="sliders-horizontal" size={15} strokeWidth={1.5} />
            Ajustar prioridades
          </button>
        )}
      </div>
      {cardsVisiveis.length > 0 && (
        <CardsDaBiblioteca ids={cardsVisiveis} arraste={arraste} aoTirar={(id) => prefs.salvarLayout(aplicarAcoes(layout, [{ tipo: "esconder", id }]))} />
      )}
      {isLoading || !snap ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map((i) => <div key={i} className="min-h-[380px] animate-pulse" style={{ background: "var(--color-white)", borderRadius: "var(--a4p-box-radius)" }} />)}
        </div>
      ) : (
        // Os grandes (com curva) e os pequenos em FAIXAS do mesmo tamanho, na
        // ordem da pessoa: um grande e um pequeno na mesma linha esticariam um ao outro.
        faixasDoPainel(layout).map((f) => (
          <div key={f.ids.join("|")} className={GRADE}>
            {f.ids.map((id, i) => {
              // Três grandes (a maquininha, o caixa e o ARR) dividem a linha em
              // terços: sem isso o terceiro caía sozinho na linha de baixo.
              const tres = f.tamanho === "grande" && f.ids.length === 3 && !layout.larguras?.[id];
              // O último de uma faixa ímpar ocupa a linha inteira: sozinho em
              // meia linha, ele deixava um buraco ao lado (um pequeno subindo
              // sozinho para o topo ficava com meia tela vazia). Só enquanto a
              // pessoa não deu largura a ele: a largura dada vale.
              const sozinho = !tres && f.ids.length % 2 === 1 && i === f.ids.length - 1 && !layout.larguras?.[id];
              const largura: LarguraHome | undefined = tres ? 4 : sozinho ? 12 : undefined;
              if (id === "maquininha") {
                return (
                  <ItemArrastavel key={id} id={id} arraste={arraste} largura={largura}>
                    <MaquininhaRecentes />
                  </ItemArrastavel>
                );
              }
              const n = numero(id);
              if (!n) return null;
              return (
                <ItemArrastavel key={id} id={id} arraste={arraste} largura={largura}>
                  {f.tamanho === "grande" && n.curva ? <CardGrande n={n} curva={n.curva} carimbo={carimbo} /> : <CardPequeno n={n} carimbo={carimbo} />}
                </ItemArrastavel>
              );
            })}
          </div>
        ))
      )}
    </section>
  );
  const blocosVisiveis = visiveis(layout, "bloco");
  const blocos = blocosVisiveis.length === 0 ? null : (
    <section key="bloco" className={GRADE}>
      {blocosVisiveis.map((id) => (
        // Sem largura dada, os blocos dividem a linha por igual (como antes).
        <ItemArrastavel key={id} id={id} arraste={arraste} largura={layout.larguras?.[id] ? undefined : LARGURA_DOS_BLOCOS[blocosVisiveis.length] ?? 4}>
          {bloco(id as IdItemHome)}
        </ItemArrastavel>
      ))}
    </section>
  );

  return (
    <div className="a4p-home flex flex-col gap-8 pt-7">
      <CaixaIA sugestoes={sugestoes} extras={candidatas} prefs={prefs} />
      <div className="flex flex-col gap-8 mt-7">
        {ordemDasSecoes(layout).map((g) => (g === "painel" ? painel : blocos))}
      </div>
    </div>
  );
}
