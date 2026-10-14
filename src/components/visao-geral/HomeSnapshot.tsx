"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BRL, Icon, SemDados } from "@/components/ui";
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
import { INTERESSES, recomendarSugestoes, sinaisDaHome, type SugestaoEscolhida } from "@/core/home/sugestoes";
import { lerPreferencia, gravarPreferencia } from "@/lib/store-org";
import { loadCompany } from "@/lib/company";
import { useTipoConta } from "@/components/app/useTipoConta";

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
  { nome: "Fluxo de caixa", href: "/dashboard/reports/cash-flow" },
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

const KEY_INTERESSES = "a4p_home_interesses";
const KEY_CLIQUES = "a4p_home_cliques";

/**
 * As prioridades do dia a dia e os cliques nas sugestões. `interesses === null`
 * é o PRIMEIRO ACESSO (a pergunta nunca foi respondida); `[]` é "pulei".
 */
function usePreferenciasIA(tipo: "empresa" | "pessoal") {
  const [interesses, setInteresses] = React.useState<string[] | null | undefined>(undefined);
  const [cliques, setCliques] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    setInteresses(lerPreferencia<string[] | null>(KEY_INTERESSES, null));
    setCliques(lerPreferencia<Record<string, number>>(KEY_CLIQUES, {}));
  }, []);
  const salvarInteresses = (ids: string[]) => { setInteresses(ids); gravarPreferencia(KEY_INTERESSES, ids); };
  const clicou = (id: string) => {
    const novo = { ...cliques, [id]: (cliques[id] ?? 0) + 1 };
    setCliques(novo);
    gravarPreferencia(KEY_CLIQUES, novo);
  };
  const opcoes = INTERESSES.filter((i) => i.publico === tipo);
  return { interesses, cliques, salvarInteresses, clicou, opcoes };
}

type PreferenciasIA = ReturnType<typeof usePreferenciasIA>;

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
              className="px-3 py-[6px] rounded-pill text-[13px] border"
              style={on
                ? { background: "var(--color-ink)", color: "var(--color-surface-1)", borderColor: "var(--color-ink)" }
                : { background: "var(--color-white)", color: "var(--color-ink)", borderColor: "var(--color-border)" }}
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

function CaixaIA({ sugestoes, prefs }: { sugestoes: SugestaoEscolhida[] | null; prefs: PreferenciasIA }) {
  const router = useRouter();
  const [texto, setTexto] = React.useState("");
  const [ajustando, setAjustando] = React.useState(false);
  const primeiroAcesso = prefs.interesses === null;
  const perguntando = primeiroAcesso || ajustando;
  // No primeiro acesso só as duas básicas aparecem; o resto vem da resposta.
  const visiveis = (sugestoes ?? []).slice(0, perguntando ? 2 : undefined);
  const perguntar = (q: string) => {
    const t = q.trim();
    router.push(t ? `/quattro-ai?q=${encodeURIComponent(t)}` : "/quattro-ai");
  };
  return (
    <section className="a4p-ondas-ia flex flex-col items-center gap-[14px] rounded-[32px] px-6 py-11">
      <form
        onSubmit={(e) => { e.preventDefault(); perguntar(texto); }}
        className="w-full max-w-[720px] h-14 flex items-center gap-3 px-[10px] rounded-[28px]"
        style={{ background: "var(--color-surface-1)" }}
      >
        <Link
          href="/quattro-ai"
          aria-label="Abrir a Quattro AI"
          className="w-9 h-9 flex-none rounded-pill flex items-center justify-center"
          style={{ background: "var(--color-white)", color: "var(--color-ink)" }}
        >
          <Icon name="plus" size={18} strokeWidth={1.5} />
        </Link>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Pergunte à Quattro AI ou crie um fluxo"
          aria-label="Pergunte à Quattro AI"
          className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-ink placeholder:text-muted"
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
          contexto da empresa. O motivo vai no `title` — a Home não explica
          cada chip, mas quem quiser saber por que ele está ali consegue. */}
      <div className="flex flex-wrap justify-center gap-[10px] max-w-[900px] min-h-[36px]">
        {visiveis.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { prefs.clicou(c.id); perguntar(c.texto); }}
            title={`Sugerida porque ${c.motivo}`}
            data-sugestao={c.id}
            className="px-4 py-2 rounded-pill text-[13px] text-ink"
            style={{ background: "var(--color-surface-1)" }}
          >
            {c.texto}
          </button>
        ))}
      </div>
      {perguntando ? (
        <PerguntaPrioridades prefs={prefs} aoFechar={() => setAjustando(false)} />
      ) : prefs.interesses !== undefined && (
        <button type="button" onClick={() => setAjustando(true)} className="text-[12px] text-ink opacity-70 hover:opacity-100">
          Ajustar prioridades
        </button>
      )}
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

function Alca() {
  return (
    <span
      title="Arraste para mudar a posição"
      aria-hidden
      className="absolute right-4 top-4 w-5 h-8 flex items-center justify-center text-muted cursor-grab"
    >
      <Icon name="grip-vertical" size={18} strokeWidth={1.5} />
    </span>
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

function CardGrande({ n, curva, carimbo }: { n: NumeroHome; curva: CurvaHome; carimbo: string }) {
  return (
    <Link
      href={n.href}
      className="relative flex flex-col gap-4 min-h-[380px] px-8 pt-[30px] pb-6 border"
      style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)", borderRadius: "var(--a4p-box-radius)" }}
    >
      <Alca />
      <span className="text-[15px] text-ink">{n.rotulo}</span>
      <div className="flex items-center gap-[13.8px] flex-wrap">
        <span className="a4p-heroi" style={{ fontSize: 36, lineHeight: 1 }}><Valor n={n} /></span>
        <Pilula v={n.variacao} />
      </div>
      <Curva id={n.id} curva={curva} />
      <div className="flex justify-between text-[12px] text-muted pt-3 border-t" style={{ borderColor: "var(--erp-menu-borda)" }}>
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
      className="relative flex flex-col gap-3 px-7 py-[22px]"
      style={{ background: "var(--color-white)", borderRadius: "var(--a4p-box-radius)" }}
    >
      <Alca />
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

const COLUNA = "flex flex-col p-6";
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
    { nome: "Notas a emitir", qtd: p.notas, href: "/dashboard/sales-invoices" },
    { nome: "Compras a aprovar", qtd: p.compras, href: "/dashboard/purchases" },
    { nome: "Lançamentos aguardando aprovação", qtd: p.aprovacoes, href: "/aprovacoes" },
    { nome: "Boletos a pagar", qtd: p.boletos, href: "/dashboard/purchases/received-boletos" },
  ];
  return (
    <div className={`${COLUNA} gap-[6px]`} style={colunaStyle}>
      <span className="text-[15px] text-muted">Precisa de ação</span>
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
      <span className="text-[15px] text-muted">Fechamento de {MESES_LONGOS[Number(mes.slice(5, 7)) - 1]}</span>
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
          <span className="flex-none text-[10px] font-medium tracking-[.06em] uppercase px-[10px] py-1 rounded-pill text-muted" style={{ background: "var(--color-surface-1)" }}>
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
      <span className="text-[15px] text-muted">Relatórios fixados</span>
      {RELATORIOS.map((r) => (
        <Link key={r.nome} href={r.href} className="flex justify-between items-center py-[11px] border-t text-ink" style={{ borderColor: "var(--color-border)" }}>
          <span>{r.nome}</span>
          <span className="w-[30px] h-[30px] flex-none rounded-pill flex items-center justify-center" style={{ background: "var(--color-surface-1)" }}>
            <Icon name="arrow-up-right" size={16} strokeWidth={1.5} />
          </span>
        </Link>
      ))}
      <Link href="/dashboard/reports" className="pt-3 border-t text-[14px] text-muted" style={{ borderColor: "var(--color-border)" }}>
        + Adicionar relatório
      </Link>
    </div>
  );
}

/* ------------------------------ a tela ------------------------------ */

export function HomeSnapshot() {
  const { data: input, isLoading } = useRiscoInput();
  const carimbo = useCarimbo();
  const snap = React.useMemo(() => (input ? montarHomeSnapshot(input) : null), [input]);
  const hoje = snap?.hoje ?? input?.hoje ?? isoLocal(new Date());
  const mes = hoje.slice(0, 7);
  const pendencias = usePendencias();
  const tarefas = useTarefasDoMes(mes);
  const { tipo } = useTipoConta();
  const prefs = usePreferenciasIA(tipo);
  const [perfil, setPerfil] = React.useState<ReturnType<typeof loadCompany> | undefined>(undefined);
  React.useEffect(() => { setPerfil(loadCompany()); }, []);

  const sugestoes = React.useMemo(() => {
    if (!snap || !input || perfil === undefined) return null;
    const fechamento = tarefas && tarefas.length > 0 ? tarefas.filter((t) => t.status === "done").length / tarefas.length : null;
    return recomendarSugestoes(sinaisDaHome({
      snap, input, tipoConta: tipo, perfil: perfil?.perfil ?? null, pendencias, fechamento,
      interesses: prefs.interesses ?? [], cliques: prefs.cliques,
    }));
  }, [snap, input, perfil, tipo, pendencias, tarefas, prefs.interesses, prefs.cliques]);

  return (
    <div className="a4p-home flex flex-col gap-8 pt-7">
      <CaixaIA sugestoes={sugestoes} prefs={prefs} />

      <section className="flex flex-col gap-4 mt-7">
        <h2 className="m-0 text-[22px] font-medium text-ink" style={{ fontFamily: "var(--font-sans)", textTransform: "none" }}>Seu painel</h2>
        {isLoading || !snap ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0, 1].map((i) => <div key={i} className="min-h-[380px] animate-pulse" style={{ background: "var(--color-white)", borderRadius: "var(--a4p-box-radius)" }} />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CardGrande n={snap.caixa} curva={snap.caixa.curva} carimbo={carimbo} />
              <CardGrande n={snap.arr} curva={snap.arr.curva} carimbo={carimbo} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {snap.pequenos.map((n) => <CardPequeno key={n.id} n={n} carimbo={carimbo} />)}
            </div>
          </>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PrecisaDeAcao p={pendencias} />
        <Fechamento mes={mes} tarefas={tarefas} />
        <RelatoriosFixados />
      </section>
    </div>
  );
}
