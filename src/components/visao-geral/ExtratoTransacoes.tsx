"use client";

/**
 * Extrato de transações — o painel do topo de **Receber** e **Pagar**, no
 * modelo da referência enviada:
 *
 *  1. **Carrossel de períodos** — um card por MÊS (ou por SEMANA, pelo botão
 *     Mês/Semana) com o resultado líquido daquele período, verde ou vermelho,
 *     e uma linha ligando os pontos por cima dos cards. Clicar seleciona o
 *     período; as setas rolam a faixa.
 *  2. **Barra de resumo** do período selecionado — contagem, entradas, saídas
 *     e resultado.
 *  3. **Lista agrupada por dia** ("Hoje" · "Ontem" · "dom, jul 26"), com a
 *     conta, a descrição, o chip de categoria e o valor.
 *
 * `direction` decide o que a LISTA mostra (entradas na página Receber, saídas
 * na Pagar); o carrossel e o resumo continuam mostrando os dois lados, porque
 * o resultado do período só faz sentido com entradas e saídas juntas.
 *
 * Puro sobre o `RiskInput` — roda igual em demo e em live.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Icon, Input, InfoHint, Button, Select } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useToast } from "@/components/listas/ListChrome";
import { useRiscoInput, useAccounts } from "@/components/visao-geral/hooks";
import { pagarLote, anexarComprovante, comprovanteDe, type MetodoPagamento } from "@/lib/pagamentos";
import { receberLote } from "@/lib/recebimentos";
import { listProjetos } from "@/lib/iuli-cadastros";
import { vincularProjeto, projetoDoMovimento } from "@/lib/projeto-vinculo";
import type { RiskMovement } from "@/core/risk-engine/types";
import { ModalBaixa } from "@/components/movimentacoes/ModalBaixa";
import {
  CarrosselSazonalidade, FaixaPeriodos, periodosComValores,
  type Granularidade as Gran, type PeriodoSazonal as Periodo,
} from "@/components/movimentacoes/CarrosselSazonalidade";

const POSITIVE = "var(--color-positive)";
const NEGATIVE = "var(--color-negative)";
const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIA_ABBR = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Paleta dos chips de categoria — tons do próprio DS, não matizes avulsos. */
const CHIP = ["var(--a4p-cat-1)", "var(--a4p-cat-2)", "var(--a4p-cat-3)", "var(--a4p-cat-4)", "var(--a4p-cat-5)", "var(--a4p-cat-6)", "var(--a4p-cat-7)", "var(--a4p-cat-8)"];
const corDaCategoria = (nome: string) => {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return CHIP[h % CHIP.length];
};


/** Data de caixa do movimento (pago → pagamento; pendente → vencimento). */
const dataDe = (m: RiskMovement) => (m.status === "pago" ? m.paid_date || m.due_date : m.due_date).slice(0, 10);

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Parser seguro de data-só: `new Date("2026-07-28")` é meia-noite UTC. */
const parse = (s: string) => new Date(s.slice(0, 10) + "T00:00:00");


/** Cabeçalho de dia: "Hoje" · "Ontem" · "dom, jul 26". */
function rotuloDia(diaISO: string, hojeISO: string): string {
  if (diaISO === hojeISO) return "Hoje";
  const h = parse(hojeISO); h.setDate(h.getDate() - 1);
  if (diaISO === iso(h)) return "Ontem";
  const d = parse(diaISO);
  return `${DIA_ABBR[d.getDay()]}, ${MES_ABBR[d.getMonth()]} ${d.getDate()}`;
}

export function ExtratoTransacoes({ direction }: { direction: "entrada" | "saida" }) {
  const { data: inp, isLoading } = useRiscoInput();
  const contas = useAccounts();
  const [gran, setGran] = React.useState<Gran>("mes");
  const [selKey, setSelKey] = React.useState<string | null>(null);
  const [busca, setBusca] = React.useState("");
  // Baixa direto na linha: o movimento clicado abre o modal de confirmação.
  const qc = useQueryClient();
  const { show, node: toast } = useToast();
  const [baixa, setBaixa] = React.useState<RiskMovement | null>(null);
  const [conta, setConta] = React.useState("");
  const [metodo, setMetodo] = React.useState<MetodoPagamento>("pix");
  const [comprovante, setComprovante] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  // Projetos vêm do cadastro local — só depois de montar (hidratação).
  const [projetos, setProjetos] = React.useState<{ id: string; nome: string }[]>([]);
  const [projeto, setProjeto] = React.useState("");
  React.useEffect(() => { setProjetos(listProjetos()); }, []);
  React.useEffect(() => { setProjeto(baixa ? (projetoDoMovimento(baixa.id) ?? "") : ""); }, [baixa]);

  const hoje = inp?.hoje?.slice(0, 10) ?? iso(new Date());

  // Períodos do carrossel — a MESMA função que a tela canônica usa.
  const periodos = React.useMemo(() => periodosComValores(inp, hoje, gran), [inp, hoje, gran]);

  // Trocar de granularidade invalida a seleção antiga (as chaves mudam) e
  // recoloca a faixa no período ATUAL — ela é montada do mais antigo para o
  // mais novo, então sem isso o carrossel abre 12 meses atrás.
  React.useEffect(() => { setSelKey(null); }, [gran]);
  const sel = periodos.find((p) => p.key === selKey) ?? periodos[periodos.length - 1];

  // Lançamentos do período selecionado, no lado da página, agrupados por dia.
  const grupos = React.useMemo(() => {
    if (!inp || !sel) return [] as { dia: string; rotulo: string; itens: RiskMovement[] }[];
    const termo = busca.trim().toLowerCase();
    const nome = (m: RiskMovement) => (m.party_id && inp.partyNames?.[m.party_id]) || m.category || (m.type === "entrada" ? "Recebimento" : "Pagamento");
    const lista = inp.movements
      .filter((m) => m.status !== "cancelado" && m.type === direction)
      .filter((m) => { const d = dataDe(m); return d >= sel.de && d <= sel.ate; })
      .filter((m) => !termo || nome(m).toLowerCase().includes(termo) || (m.category ?? "").toLowerCase().includes(termo))
      .sort((a, b) => dataDe(b).localeCompare(dataDe(a)));
    const map = new Map<string, RiskMovement[]>();
    for (const m of lista) {
      const d = dataDe(m);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(m);
    }
    return Array.from(map.entries()).map(([dia, itens]) => ({ dia, rotulo: rotuloDia(dia, hoje), itens }));
  }, [inp, sel, direction, busca, hoje]);

  const totalItens = grupos.reduce((s, g) => s + g.itens.length, 0);
  const nomeConta = React.useCallback((id?: string | null) => {
    const c = contas.data?.accounts.find((x) => x.id === id);
    return c?.name ?? "—";
  }, [contas.data]);

  // Conta padrão do modal: a primeira da lista (o usuário troca se quiser).
  React.useEffect(() => {
    if (!conta && contas.data?.accounts.length) setConta(contas.data.accounts[0].id);
  }, [contas.data, conta]);

  const executarBaixa = async () => {
    if (!baixa || !conta) return;
    setEnviando(true);
    try {
      const nome = (baixa.party_id && inp?.partyNames?.[baixa.party_id]) || baixa.category || "Lançamento";
      const item = { id: baixa.id, amount: baixa.amount, due_date: baixa.due_date, category: baixa.category };
      const r = direction === "saida"
        ? await pagarLote([{ ...item, beneficiario: nome }], conta, metodo)
        : await receberLote([{ ...item, pagador: nome }], conta);
      if (comprovante) anexarComprovante(baixa.id, comprovante);
      await qc.invalidateQueries();
      const ok = direction === "saida" ? (r as { liquidados: number }).liquidados : (r as { recebidos: number }).recebidos;
      show(ok
        ? `${direction === "saida" ? "Pago" : "Recebido"}: ${formatBRL(baixa.amount)} — saldo da conta atualizado.`
        : `Este título já estava ${direction === "saida" ? "pago" : "recebido"}.`);
      setBaixa(null); setComprovante(null);
    } finally {
      setEnviando(false);
    }
  };

  if (isLoading || !inp) {
    return <Card><span className="text-caption text-faint">Carregando transações…</span></Card>;
  }

  return (
    <Card className="flex flex-col gap-0" padded={false} info={{
      titulo: "Transações",
      oQue: "O extrato do período: o resultado de cada mês (ou semana) na faixa de cima e, abaixo, os lançamentos dia a dia.",
      comoCalcula: "Cada período soma entradas e saídas pela data de caixa (pagamento quando liquidado, vencimento quando pendente). O resultado é entradas − saídas; a lista mostra só o lado da página.",
    }}>
      {/* Busca + carrossel — o carrossel é a MESMA peça que a tela canônica de
          títulos usa (`CarrosselSazonalidade`), não uma cópia. */}
      <div className="flex items-center justify-end gap-2 px-5 pt-5 -mb-3 flex-wrap">
        <div className="w-[240px]">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar transações…" aria-label="Buscar transações" />
        </div>
      </div>
      <CarrosselSazonalidade periodos={periodos} gran={gran} onGran={setGran} recarregarEm={isLoading}>
        <FaixaPeriodos periodos={periodos} selKey={sel?.key} onSelect={setSelKey} />
      </CarrosselSazonalidade>

      {/* Resumo do período selecionado */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-b border-border-soft flex-wrap">
        <span className="inline-flex items-center gap-2 text-[15px] font-medium text-ink">
          <Icon name="trending-up" size={16} color="var(--color-text-secondary)" />
          {direction === "saida" ? "Gastos por categoria" : "Entradas por categoria"}
          <InfoHint align="left"
            oQue="As categorias que mais pesam no período selecionado."
            comoCalcula="Soma dos lançamentos do período por categoria, no lado desta página." />
        </span>
        <div className="flex items-center gap-4 flex-wrap text-[14px] tabular-nums">
          <span className="inline-flex items-center gap-[6px] text-muted bg-surface-2 rounded-pill px-3 py-[3px]">
            <Icon name="calendar" size={13} color="currentColor" />{sel?.label}
          </span>
          <span className="text-muted">{totalItens} lançamento{totalItens === 1 ? "" : "s"}</span>
          <span className="inline-flex items-center gap-[5px]" style={{ color: POSITIVE }}>
            <Icon name="arrow-down-to-line" size={13} color="currentColor" />{formatBRL(sel?.entradas ?? 0)}
          </span>
          <span className="inline-flex items-center gap-[5px]" style={{ color: NEGATIVE }}>
            <Icon name="arrow-up-right" size={13} color="currentColor" />{formatBRL(sel?.saidas ?? 0)}
          </span>
          <span className="font-medium" style={{ color: (sel?.resultado ?? 0) < 0 ? NEGATIVE : POSITIVE }}>
            {(sel?.resultado ?? 0) < 0 ? "−" : ""}{formatBRL(Math.abs(sel?.resultado ?? 0))}
          </span>
        </div>
      </div>

      {/* Lista agrupada por dia */}
      {grupos.length === 0 ? (
        <div className="px-5 py-8 text-center text-caption text-faint">
          Nenhum lançamento no período selecionado.
        </div>
      ) : (
        <div className="flex flex-col">
          {grupos.map((g) => (
            <div key={g.dia} className="flex flex-col">
              <div className="px-5 pt-5 pb-2 text-[12px] font-medium tracking-[0.08em] text-faint">{g.rotulo}</div>
              {g.itens.map((m) => {
                const nome = (m.party_id && inp.partyNames?.[m.party_id]) || m.category || (m.type === "entrada" ? "Recebimento" : "Pagamento");
                const cat = m.category || "Outros";
                const pago = m.status === "pago";
                return (
                  <button
                    key={m.id} type="button"
                    onClick={() => { setComprovante(comprovanteDe(m.id)); setBaixa(m); }}
                    className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 items-center px-5 py-[10px] border-t border-border-soft text-left hover:bg-surface-1 transition-colors cursor-pointer"
                  >
                    <span className="text-[12px] font-semibold text-muted bg-surface-2 rounded-sm px-[6px] py-[2px] shrink-0">
                      {nomeConta(m.accountId).slice(0, 6)}
                    </span>
                    <span className="text-[15px] text-ink truncate">{nome}</span>
                    <span className="inline-flex items-center gap-[6px] text-[13px] text-muted bg-surface-2 rounded-pill px-[10px] py-[3px] shrink-0">
                      <span className="w-2 h-2 rounded-pill" style={{ background: corDaCategoria(cat) }} />
                      {cat}
                    </span>
                    {/* Estado da baixa: quem já foi liquidado mostra o selo. */}
                    <span className="text-[12px] shrink-0 w-[74px] text-right" style={{ color: pago ? POSITIVE : "var(--color-text-tertiary)" }}>
                      {pago ? (direction === "saida" ? "pago" : "recebido") : "pendente"}
                    </span>
                    <span className="text-[15px] tabular-nums text-ink shrink-0 whitespace-nowrap w-[120px] text-right">
                      {formatBRL(m.amount)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {/* Modal de baixa — a mesma lógica que existia na Central de Pagamentos,
          agora na própria linha e valendo para os dois lados.
          Vai por PORTAL no <body>: o Card do DS tem `transform` (a micro-
          elevação), e um ancestral transformado vira o bloco de contenção do
          `position: fixed` — dentro do Card o overlay nascia do tamanho do card
          e o modal caía centrado ~1000px abaixo da dobra. */}
      {baixa && (
        <ModalBaixa
          baixa={baixa}
          ehSaida={direction === "saida"}
          partyNames={inp.partyNames}
          contas={contas.data?.accounts ?? []}
          projetos={projetos}
          projeto={projeto}
          onProjeto={setProjeto}
          onProjetoMudou={() => qc.invalidateQueries({ queryKey: ["risco-input"] })}
          conta={conta} setConta={setConta}
          metodo={metodo} setMetodo={setMetodo}
          comprovante={comprovante} setComprovante={setComprovante}
          enviando={enviando}
          onConfirmar={executarBaixa}
          onFechar={() => setBaixa(null)}
          show={show}
        />
      )}
      {toast}
    </Card>
  );
}

function Linha({ label, value, forte }: { label: string; value: string; forte?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 text-caption">
      <span className="text-muted">{label}</span>
      <span className={forte ? "text-ink font-medium tabular-nums" : "text-ink tabular-nums"}>{value}</span>
    </div>
  );
}

/**
 * A faixa de períodos: uma coluna por período e, POR CIMA, a linha que liga os
 * resultados. A linha vive num SVG absoluto do tamanho da faixa — em vez de um
 * gráfico separado, para os pontos caírem exatamente sobre cada card.
 */
