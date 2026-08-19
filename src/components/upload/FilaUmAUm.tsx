"use client";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A FILA UM-A-UM — uma decisão por tela, no teclado
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ A revisão mostrava tudo numa tabela. Uma grade de 500 linhas não é tela de
 * decisão, é tela de desistência: rola-se até o fim, clica-se em "confirmar
 * tudo", e a classificação errada aparece no fechamento. Aqui cabe uma
 * decisão de cada vez.
 *
 * ⚠️ **O teclado é o caminho principal, não um atalho.** Quem revisa 500 linhas
 * não tira a mão do teclado: Enter confirma e avança, C corrige, I ignora,
 * ← volta. O mouse funciona, mas quem usa de verdade não o alcança.
 */
import * as React from "react";
import { Card, Button, Badge, Select, BRL, Icon } from "@/components/ui";
import { ler, gravar, CHAVES_ORG } from "@/lib/store-org";
import {
  montarFila, estadoVazio, loteDe, decidir, corrigirIguais, aplicarLote,
  progresso, proximoPendente, anterior, paraGravar, categoriaDe, confiancaDe,
  CONFIANCA_ALTA, type EstadoFila,
} from "@/core/ingestao/fila";
import type { PlanoIngestao, MovimentoIngerido } from "@/core/ingestao";
import { CATEGORIAS_TODAS } from "@/core/ingestao/taxonomia";
import { sugerirRegra } from "@/core/regras";
import { adicionarRegra } from "@/lib/regras";
import { dataBR } from "@/lib/format";

/** Tempo restante em palavra de gente — "2 min", não "126000ms". */
function tempoHumano(ms: number | null): string {
  if (ms === null) return "calculando…";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}min`;
}

export function FilaUmAUm({
  plano, onConcluir, onCancelar,
}: {
  plano: PlanoIngestao;
  onConcluir: (linhas: MovimentoIngerido[]) => void;
  onCancelar: () => void;
}) {
  const fila = React.useMemo(() => montarFila(plano), [plano]);
  // ⚠️ **Abandonar no meio não perde nada.** O estado é lido do disco na
  // montagem: quem fechou a aba volta de onde parou, e o lote continua aberto.
  const [estado, setEstado] = React.useState<EstadoFila>(() =>
    ler<EstadoFila>(CHAVES_ORG.filaImportacao, estadoVazio()));
  const [corrigindo, setCorrigindo] = React.useState(false);
  const [regraDe, setRegraDe] = React.useState<{ item: MovimentoIngerido; categoria: string } | null>(null);

  React.useEffect(() => { gravar(CHAVES_ORG.filaImportacao, estado); }, [estado]);

  const idx = Math.min(estado.indice, Math.max(0, fila.length - 1));
  const item = fila[idx];
  const prog = progresso(fila, estado);
  const lote = item ? loteDe(fila, item, estado) : null;
  const acabou = proximoPendente(fila, estado, 0) === -1;

  const irPara = React.useCallback((i: number) => setEstado((e) => ({ ...e, indice: i })), []);

  const decidirEAvancar = React.useCallback((d: "confirmada" | "ignorada") => {
    if (!item) return;
    setEstado((e) => {
      const novo = decidir(e, item.chave, d, Date.now());
      const prox = proximoPendente(fila, novo, idx + 1);
      return { ...novo, indice: prox === -1 ? idx : prox };
    });
    setCorrigindo(false);
  }, [item, fila, idx]);

  const aplicarCorrecao = React.useCallback((categoria: string) => {
    if (!item) return;
    // ⚠️ A correção alcança as PENDENTES da mesma contraparte no próprio lote.
    // Medido: sem isso, 500 linhas custavam 10,3 min, e 71 delas eram a mesma
    // correção repetida (as de confiança baixa são as MESMAS contrapartes).
    // Com isso, 3,6 min.
    setEstado((e) => corrigirIguais(e, fila, item, categoria));
    setCorrigindo(false);
    // ⚠️ **A pergunta que transforma uma correção em conhecimento.** Sem ela, a
    // pessoa corrige o mesmo posto de gasolina trinta vezes no mesmo lote.
    setRegraDe({ item, categoria });
  }, [item, fila]);

  // ── O TECLADO ─────────────────────────────────────────────────────────────
  React.useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      // ⚠️ Não sequestra o teclado de quem está digitando num campo — senão
      // escrever "Combustível" na correção dispararia C, I e Enter no meio.
      const alvo = ev.target as HTMLElement | null;
      if (alvo && /^(INPUT|SELECT|TEXTAREA)$/.test(alvo.tagName)) return;
      if (regraDe) return;
      if (ev.key === "Enter") { ev.preventDefault(); decidirEAvancar("confirmada"); }
      else if (ev.key === "i" || ev.key === "I") { ev.preventDefault(); decidirEAvancar("ignorada"); }
      else if (ev.key === "c" || ev.key === "C") { ev.preventDefault(); setCorrigindo(true); }
      else if (ev.key === "ArrowLeft") { ev.preventDefault(); irPara(anterior(idx)); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [decidirEAvancar, irPara, idx, regraDe]);

  if (fila.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <p className="m-0 text-body text-ink">Nada para revisar neste arquivo.</p>
        <p className="m-0 text-caption text-muted">
          Todas as linhas já existiam na base — nenhum lançamento novo seria criado.
        </p>
        <Button onClick={onCancelar}>Voltar</Button>
      </Card>
    );
  }

  if (acabou) {
    const vaiGravar = paraGravar(fila, estado);
    return (
      <Card className="flex flex-col items-start gap-4">
        <h2 className="text-h2 m-0">Revisão concluída</h2>
        <p className="m-0 text-body text-muted">
          {vaiGravar.length} de {fila.length} confirmados. Eles entram como{" "}
          <strong className="text-ink">previstos</strong> e vão para a fila da Central,
          onde alguém confirma antes de virar baixa.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => { gravar(CHAVES_ORG.filaImportacao, estadoVazio()); onConcluir(vaiGravar); }}>
            Importar {vaiGravar.length} lançamento{vaiGravar.length === 1 ? "" : "s"}
          </Button>
          {/* ⚠️ O lote é reversível POR INTEIRO até aqui: descartar joga fora a
              revisão toda, não linha a linha — meio lote importado é o estado
              que ninguém sabe consertar depois. */}
          <Button variant="ghost" onClick={() => { gravar(CHAVES_ORG.filaImportacao, estadoVazio()); onCancelar(); }}>
            Descartar o lote inteiro
          </Button>
        </div>
      </Card>
    );
  }

  if (!item) return null;
  const cat = categoriaDe(item, estado);
  const conf = confiancaDe(item, estado);
  const alta = conf >= CONFIANCA_ALTA;

  return (
    <div className="flex flex-col gap-4">
      {/* ── progresso ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-label text-muted">
            {prog.feitas} de {prog.total} · faltam {prog.restantes}
          </span>
          <span className="text-caption text-faint tabular-nums">
            {tempoHumano(prog.restanteMs)} restante{prog.restanteMs === null ? "" : "s"}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-pill bg-surface-2 overflow-hidden">
          <div className="h-full bg-ink transition-[width] duration-300"
               style={{ width: `${Math.round(prog.fracao * 100)}%` }}
               role="progressbar" aria-valuenow={Math.round(prog.fracao * 100)}
               aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da revisão" />
        </div>
      </div>

      {/* ── a linha, ocupando a tela ──────────────────────────────────────── */}
      <Card className="flex flex-col gap-5 py-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-label text-muted">{dataBR(item.data)}</span>
          <Badge variant={alta ? "neutral" : "count"}>
            {alta ? "Confiança alta" : "Precisa conferir"} · {Math.round(conf * 100)}%
          </Badge>
        </div>

        {/* ⚠️ O descritivo ORIGINAL do banco, não o normalizado: é ele que a
            pessoa reconhece no extrato, e é a evidência de origem. */}
        <p className="m-0 text-h3 text-ink break-words">{item.descritivoBruto}</p>

        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="text-label text-muted">
              {item.tipo === "entrada" ? "Entrada" : "Saída"}
            </span>
            <span className="text-value-lg leading-none">
              <BRL value={item.tipo === "saida" ? -item.valor : item.valor} />
            </span>
          </div>
          {item.contraparte && (
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-label text-muted">Contraparte</span>
              <span className="text-body text-ink truncate">{item.contraparte}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-label text-muted">Categoria sugerida</span>
          {corrigindo ? (
            <Select autoFocus value={cat} onChange={aplicarCorrecao}
              aria-label="Corrigir categoria"
              options={CATEGORIAS_TODAS.map((c) => ({ value: c.id, label: c.id }))} />
          ) : (
            <span className="text-body text-ink">{cat}</span>
          )}
        </div>
      </Card>

      {/* ── ações ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => decidirEAvancar("confirmada")}>Confirmar <Atalho>Enter</Atalho></Button>
        <Button variant="secondary" onClick={() => setCorrigindo(true)}>Corrigir <Atalho>C</Atalho></Button>
        <Button variant="ghost" onClick={() => decidirEAvancar("ignorada")}>Ignorar <Atalho>I</Atalho></Button>
        <Button variant="ghost" onClick={() => irPara(anterior(idx))} aria-label="Voltar">
          <Icon name="arrow-left" /> <Atalho>←</Atalho>
        </Button>
      </div>

      {/* ── ação em massa, só quando é seguro ─────────────────────────────── */}
      {lote && (
        <Card className="flex items-center justify-between gap-3 flex-wrap">
          {lote.motivo ? (
            // ⚠️ Diz POR QUE não há lote em vez de sumir com o botão: um botão
            // que aparece e some sem explicação lê como defeito da tela.
            <p className="m-0 text-caption text-muted">{lote.motivo}</p>
          ) : (
            <>
              <p className="m-0 text-caption text-muted">
                Há <strong className="text-ink">{lote.chaves.length}</strong> linhas de{" "}
                <strong className="text-ink">{lote.contraparte}</strong> em{" "}
                <strong className="text-ink">{lote.categoria}</strong>, todas com confiança alta.
              </p>
              <Button variant="secondary" onClick={() => setEstado((e) => {
                const novo = aplicarLote(e, lote, Date.now());
                const prox = proximoPendente(fila, novo, 0);
                return { ...novo, indice: prox === -1 ? idx : prox };
              })}>
                Confirmar as {lote.chaves.length}
              </Button>
            </>
          )}
        </Card>
      )}

      {/* ── a pergunta que vira regra da organização ──────────────────────── */}
      {regraDe && (
        <Card className="flex flex-col gap-3">
          <p className="m-0 text-body text-ink">
            Aplicar <strong>{regraDe.categoria}</strong> a todas as próximas de{" "}
            <strong>{regraDe.item.contraparte ?? "esta contraparte"}</strong>?
          </p>
          <p className="m-0 text-caption text-muted">
            Vira uma regra da empresa e passa a valer nas próximas importações.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => {
              const r = sugerirRegra(
                {
                  id: regraDe.item.chave,
                  valor: regraDe.item.valor,
                  contraparte: regraDe.item.contraparte ?? undefined,
                  descricao: regraDe.item.descritivoBruto,
                  tipo: regraDe.item.tipo,
                },
                regraDe.categoria,
              );
              if (r) adicionarRegra(r);
              setRegraDe(null);
            }}>Sim, criar regra</Button>
            <Button variant="ghost" onClick={() => setRegraDe(null)}>Só desta vez</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

const Atalho = ({ children }: { children: React.ReactNode }) => (
  <kbd className="ml-1.5 text-caption text-faint font-mono">{children}</kbd>
);
