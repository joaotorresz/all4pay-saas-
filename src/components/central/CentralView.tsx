"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CENTRAL FINANCEIRA — a esteira, e quem pode empurrar cada título nela
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **A máquina de estados existia no banco e NENHUMA tela a alcançava.** A
 * versão anterior derivava a fila do `RiskInput` e confirmava em estado local,
 * otimista — uma regra que só o banco conhece e nenhuma tela exercita é uma
 * regra que ninguém usa, e a primeira vez que alguém a encontra é quando ela
 * recusa. Medido antes de escrever esta tela: `central_transicoes` com **ZERO**
 * linhas e nenhum título em `confirmado`. A máquina nunca rodou.
 *
 * ⚠️ **O SERVIDOR É A AUTORIDADE.** Esconder o botão não é controle de acesso:
 * a recusa vem do gatilho mesmo que alguém chame a rota na mão. O que a tela
 * faz é EXPLICAR antes do clique — e as três razões para não poder confirmar
 * (papel, teto, R1) se resolvem de jeitos opostos, então cada uma tem a sua
 * frase.
 *
 * ⚠️ **A situação é mostrada como ESTADO numa esteira, não como texto solto.**
 * "previsto" numa coluna não diz a ninguém em que ponto do caminho a linha
 * está; a esteira diz, e diz também o que vem depois.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, BRL, Icon, Skeleton } from "@/components/ui";
import { isDemo } from "@/lib/demo";
import {
  getFilaCentral, getContextoCentral, getTransicoes, moverTitulo, porQueNaoConfirma,
  type TituloDaFila, type ContextoCentral, type Transicao, type RecusaCentral,
} from "@/lib/central";
import type { Situacao } from "@/core/central";
import { formatBRL } from "@/lib/format";

/** A esteira, na ordem em que o dinheiro anda. */
const ESTEIRA: { estado: Situacao; rotulo: string; oQue: string }[] = [
  { estado: "previsto", rotulo: "Previsto", oQue: "entrou no sistema e ainda não foi autorizado" },
  { estado: "confirmado", rotulo: "Confirmado", oQue: "alguém com alçada autorizou — vira compromisso firme" },
  { estado: "baixado", rotulo: "Baixado", oQue: "o dinheiro se moveu de verdade" },
];

function PassoDaEsteira({ atual }: { atual: Situacao }) {
  const i = ESTEIRA.findIndex((e) => e.estado === atual);
  return (
    <div className="flex items-center gap-1" role="img" aria-label={`Situação: ${ESTEIRA[i]?.rotulo ?? atual}`}>
      {ESTEIRA.map((e, k) => {
        const passou = k <= i;
        return (
          <React.Fragment key={e.estado}>
            {k > 0 && (
              <span aria-hidden className="w-4 h-px" style={{ background: k <= i ? "var(--color-ink)" : "var(--color-border)" }} />
            )}
            <span
              title={`${e.rotulo} — ${e.oQue}`}
              className="text-[11px] font-medium px-2 py-[2px] rounded-pill whitespace-nowrap"
              style={{
                background: passou ? "var(--color-ink)" : "var(--color-surface-2)",
                color: passou ? "var(--color-white)" : "var(--color-faint)",
              }}
            >
              {e.rotulo}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** A trilha do título — quem, quando, de onde para onde, e o carimbo. */
function Trilha({ id }: { id: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["central", "trilha", id], queryFn: () => getTransicoes(id) });
  if (isLoading) return <Skeleton className="h-12 w-full" />;
  const linhas = (data ?? []) as Transicao[];
  if (linhas.length === 0) {
    return <p className="m-0 text-caption text-faint">Sem movimentação registrada — este título ainda não andou na esteira.</p>;
  }
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-2">
      {linhas.map((t) => (
        <li key={t.id} className="text-caption text-muted flex flex-wrap items-baseline gap-x-2">
          <span className="tabular-nums text-faint">{new Date(t.quando).toLocaleString("pt-BR")}</span>
          <span className="text-ink">{t.de} → {t.para}</span>
          {t.autoaprovacao && (
            /* ⚠️ O carimbo é a linha que o auditor lê — nunca escondido. */
            <span
              className="text-[11px] font-medium px-2 py-[1px] rounded-pill"
              style={{ background: "color-mix(in srgb, var(--color-warning) 16%, var(--color-white))", color: "var(--color-warning)" }}
              title={t.motivo ?? undefined}
            >
              autoaprovação · {t.motivo ?? "org com um único membro habilitado a aprovar"}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function CentralView() {
  const qc = useQueryClient();
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [recusa, setRecusa] = React.useState<{ id: string; r: RecusaCentral } | null>(null);
  const [ocupado, setOcupado] = React.useState<string | null>(null);

  const fila = useQuery({ queryKey: ["central", "fila"], queryFn: getFilaCentral });
  const ctxQ = useQuery({ queryKey: ["central", "contexto"], queryFn: getContextoCentral });

  const mover = async (t: TituloDaFila, para: Situacao) => {
    setOcupado(t.id); setRecusa(null);
    try {
      const r = await moverTitulo(t.id, para);
      if (!r.ok) { setRecusa({ id: t.id, r: r.recusa }); return; }
      await qc.invalidateQueries({ queryKey: ["central"] });
    } finally { setOcupado(null); }
  };

  if (fila.isLoading || ctxQ.isLoading) return <Skeleton className="h-64 w-full" />;

  const ctx = (ctxQ.data ?? {
    usuarioId: null, papel: null, teto: 0, podeAprovar: false, podeBaixar: false, temOutroAprovador: false,
  }) as ContextoCentral;
  const itens = (fila.data ?? []) as TituloDaFila[];

  /* ⚠️ Vazio com CONTEXTO: uma tabela vazia sem explicação faz a organização
     nova concluir que o sistema não funciona. O vazio aqui é uma resposta —
     "nada aguardando" — e diz de onde os títulos vêm. */
  if (itens.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <span className="text-h3 text-ink">Nada aguardando confirmação</span>
        <p className="m-0 text-body text-muted max-w-[68ch]">
          A Central é onde um título deixa de ser previsão e vira compromisso: alguém com alçada
          confirma, e só então ele pode ser baixado. Os títulos chegam aqui sozinhos, vindos de
          Contas a pagar, Contas a receber e da entrada de dados.
        </p>
        <p className="m-0 text-caption text-faint max-w-[68ch]">
          {isDemo
            ? "Na demonstração a fila não é ligada ao banco — a máquina de estados roda em produção."
            : "Assim que o primeiro título for lançado, ele aparece aqui como Previsto."}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <p className="m-0 text-caption text-faint max-w-[80ch]">
        Quem autoriza é o servidor: a recusa vem da máquina de estados mesmo que a ação seja
        chamada por fora desta tela. O que está abaixo explica, antes do clique, o que cada
        título permite a <b className="text-muted font-medium">você</b>
        {ctx.papel ? ` (papel ${ctx.papel}${ctx.teto === null ? ", sem teto" : `, teto ${formatBRL(ctx.teto)}`})` : ""}.
      </p>

      <Card padded={false}>
        <ul className="m-0 p-0 list-none">
          {itens.map((t) => {
            const impedimento = t.situacao === "previsto" ? porQueNaoConfirma(t, ctx) : null;
            const podeBaixar = t.situacao === "confirmado" && ctx.podeBaixar;
            const estaAberto = aberto === t.id;
            return (
              <li key={t.id} className="border-b border-border-soft last:border-0">
                <div className="flex items-center gap-3 px-5 py-3 flex-wrap">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-[10px] shrink-0"
                    style={{ background: t.direcao === "entrada" ? "color-mix(in srgb, var(--color-positive) 14%, var(--color-white))" : "color-mix(in srgb, var(--color-negative) 14%, var(--color-white))" }}>
                    <Icon name={t.direcao === "entrada" ? "arrow-down" : "arrow-up"} size={14}
                      color={t.direcao === "entrada" ? "var(--color-positive)" : "var(--color-negative)"} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-caption text-ink truncate">{t.descricao}</div>
                    <div className="text-[11px] text-faint">
                      {t.contraparte ?? "—"} · vence {t.vencimento.split("-").reverse().join("/")}
                      {/* ⚠️ Autor em branco é defeito aparente; origem declarada é fato.
                          `lancado_por` é NULL em todo o acervo importado. */}
                      {" · "}
                      {t.lancadoPor ? "lançado por membro da equipe" : `origem: ${t.origem === "manual" ? "lançamento manual" : "importação"}`}
                    </div>
                  </div>
                  <PassoDaEsteira atual={t.situacao} />
                  <span className="text-caption tabular-nums text-ink shrink-0"><BRL value={t.valor} /></span>

                  {t.situacao === "previsto" && (
                    impedimento
                      /* ⚠️ Não some e não fica cinza sem explicação: diz o motivo. */
                      ? <span className="text-[11px] text-warning max-w-[280px] text-right">{impedimento}</span>
                      : <Button variant="secondary" disabled={ocupado === t.id} onClick={() => mover(t, "confirmado")}>
                          {ocupado === t.id ? "Confirmando…" : "Confirmar"}
                        </Button>
                  )}
                  {t.situacao === "confirmado" && (
                    podeBaixar
                      ? <Button variant="secondary" disabled={ocupado === t.id} onClick={() => mover(t, "baixado")}>
                          {ocupado === t.id ? "Baixando…" : "Dar baixa"}
                        </Button>
                      : <span className="text-[11px] text-warning">O papel {ctx.papel ?? "atual"} não dá baixa.</span>
                  )}

                  <button type="button" onClick={() => setAberto(estaAberto ? null : t.id)}
                    className="text-caption text-muted hover:text-ink underline underline-offset-2 shrink-0">
                    {estaAberto ? "ocultar histórico" : "histórico"}
                  </button>
                </div>

                {recusa?.id === t.id && (
                  /* ⚠️ O erro da máquina vira frase em português com o que fazer —
                     nunca código nem stack. As quatro recusas se resolvem de
                     jeitos diferentes, então cada uma traz a sua saída. */
                  <div role="alert" className="mx-5 mb-3 rounded-md p-3 flex flex-col gap-[2px]"
                    style={{ background: "var(--color-surface-2)", borderLeft: "3px solid var(--color-negative)" }}>
                    <span className="text-caption font-medium text-ink">{recusa.r.motivo}</span>
                    <span className="text-caption text-muted">{recusa.r.comoResolver}</span>
                  </div>
                )}

                {estaAberto && <div className="px-5 pb-4"><Trilha id={t.id} /></div>}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
