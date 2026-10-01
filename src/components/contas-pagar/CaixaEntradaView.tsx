"use client";

/**
 * CAIXA DE ENTRADA DE CONTAS A PAGAR — a aba de "Títulos a pagar" onde os
 * documentos que chegaram (lidos por OCR, boletos do DDA, notas da SEFAZ)
 * esperam virar conta ou ser descartados com motivo.
 *
 * ⚠️ "Criar conta a pagar" NÃO grava nada aqui: abre o MESMO formulário de
 * conta a pagar, já preenchido, e é ele que grava pelo escritor de lançamentos
 * de sempre. O documento só sai da fila DEPOIS que o formulário salvou — um
 * segundo caminho de criação divergiria do primeiro no dia em que um campo
 * mudasse (a regra do painel Criar).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Icon, BRL, Textarea } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { dataBR } from "@/lib/format";
import { caixaAtual, descartar, ouvirCaixa } from "@/lib/caixa-entrada";
import {
  camposDoFormulario, ROTULO_ORIGEM, MOTIVO_MINIMO,
  type FiltroCaixa, type CaixaEntrada, type DocumentoEntrada,
} from "@/core/caixa-entrada";

const FILTROS: { id: FiltroCaixa; label: string }[] = [
  { id: "pendentes", label: "Esperando decisão" },
  { id: "descartados", label: "Descartados" },
  { id: "convertidos", label: "Viraram conta" },
];

/** O contador da aba — lido no cliente, porque a fonte mora no navegador/servidor. */
export function useContadorCaixa(): number {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const ler = () => setN(caixaAtual().contagem.pendentes);
    ler();
    return ouvirCaixa(ler);
  }, []);
  return n;
}

export function CaixaEntradaView() {
  const router = useRouter();
  const { show, node } = useToast();
  const [filtro, setFiltro] = React.useState<FiltroCaixa>("pendentes");
  const [caixa, setCaixa] = React.useState<CaixaEntrada | null>(null);
  const [descartando, setDescartando] = React.useState<DocumentoEntrada | null>(null);
  const [motivo, setMotivo] = React.useState("");
  const [erro, setErro] = React.useState("");

  const recarregar = React.useCallback(() => setCaixa(caixaAtual(filtro)), [filtro]);
  React.useEffect(() => { recarregar(); return ouvirCaixa(recarregar); }, [recarregar]);

  const criar = (d: DocumentoEntrada) => {
    const q = new URLSearchParams(camposDoFormulario(d));
    router.push(`/dashboard/financial/payables/new?${q.toString()}`);
  };

  const confirmarDescarte = () => {
    if (!descartando) return;
    const e = descartar(descartando, motivo);
    if (e) { setErro(e); return; }
    setDescartando(null); setMotivo(""); setErro("");
    recarregar();
    show("Documento descartado — o motivo fica em “Descartados”.");
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      <p className="m-0 text-label text-muted max-w-[70ch]">
        O que <b className="text-ink">chegou</b> e ainda não virou conta: documentos lidos no upload, boletos do DDA e notas
        fiscais recebidas. Cada um vira conta a pagar (pelo formulário de sempre, já preenchido) ou é descartado com o motivo escrito.
      </p>

      <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label="Filtro da caixa de entrada">
        {FILTROS.map((f) => {
          const on = filtro === f.id;
          return (
            <button
              key={f.id} type="button" role="tab" aria-selected={on}
              onClick={() => setFiltro(f.id)}
              className={`rounded-pill px-4 py-2 text-label transition-colors ${on ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"}`}
            >
              {f.label} <span className="tabular-nums">({caixa?.contagem[f.id] ?? 0})</span>
            </button>
          );
        })}
        {filtro === "pendentes" && caixa && caixa.contagem.pendentes > 0 && (
          <span className="ml-auto text-caption text-muted tabular-nums">
            Soma do que espera decisão: <b className="text-ink"><BRL value={caixa.valorPendente} /></b>
          </span>
        )}
      </div>

      <Card padded={false}>
        {!caixa ? (
          <div className="p-6 text-caption text-muted">Carregando…</div>
        ) : caixa.itens.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center px-6">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-surface-2">
              <Icon name="inbox" size={20} color="var(--color-text-tertiary)" />
            </span>
            <p className="m-0 text-label text-muted max-w-[52ch]">
              {filtro === "pendentes"
                ? "Nada esperando decisão. Boletos do DDA, notas recebidas e documentos que você deixar para depois no upload aparecem aqui."
                : filtro === "descartados" ? "Nenhum documento descartado." : "Nenhum documento virou conta por aqui ainda."}
            </p>
            {filtro === "pendentes" && (
              <div className="flex gap-2 flex-wrap justify-center">
                <Button variant="outline" onClick={() => window.dispatchEvent(new Event("a4p:open-upload"))}>Enviar documento</Button>
                <Button variant="outline" onClick={() => router.push("/dashboard/purchases/received-boletos")}>Boletos recebidos</Button>
              </div>
            )}
          </div>
        ) : (
          <ul className="m-0 p-0 list-none" data-caixa-lista={filtro}>
            {caixa.itens.map(({ documento: d, decisao }) => (
              <li key={d.chave} data-caixa-item={d.chave} className="flex items-start gap-4 px-6 py-4 border-b border-border-soft last:border-0 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-label text-ink truncate">{d.fornecedor}</div>
                  <div className="text-caption text-muted tabular-nums">
                    {ROTULO_ORIGEM[d.origem]}
                    {d.numero ? ` · nº ${d.numero}` : ""}
                    {" · "}{d.vencimento ? `vence ${dataBR(d.vencimento)}` : "sem vencimento no documento"}
                    {" · "}chegou {dataBR(d.recebidoEm.slice(0, 10))}
                  </div>
                  {decisao && (
                    <div className="text-caption text-muted mt-1">
                      {decisao.acao === "descartado"
                        ? <>Descartado em {dataBR(decisao.quando.slice(0, 10))} · <span className="text-ink">motivo: {decisao.motivo}</span></>
                        : <>Virou conta em {dataBR(decisao.quando.slice(0, 10))}{decisao.referencia ? ` · ref. ${decisao.referencia}` : ""}</>}
                    </div>
                  )}
                </div>
                <div className="text-label text-ink tabular-nums shrink-0"><BRL value={d.valor} /></div>
                {!decisao && (
                  <div className="flex gap-2 shrink-0">
                    <Button variant="primary" onClick={() => criar(d)}>Criar conta a pagar</Button>
                    <Button variant="ghost" onClick={() => { setDescartando(d); setMotivo(""); setErro(""); }}>Descartar</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {descartando && (
        <div className="fixed inset-0 z-[80] bg-black/30 flex items-center justify-center p-4" onClick={() => setDescartando(null)}>
          <div role="dialog" aria-label="Descartar documento" className="w-full max-w-[460px] bg-white rounded-modal p-6 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <span className="text-h3 font-medium text-ink">Descartar documento</span>
            <p className="m-0 text-caption text-muted">
              {descartando.fornecedor} · <BRL value={descartando.valor} />. O documento não vira conta; o motivo fica guardado e aparece em “Descartados”.
            </p>
            <Textarea
              label="Motivo" aria-label="Motivo do descarte"
              value={motivo} onChange={(e) => { setMotivo(e.target.value); setErro(""); }}
              placeholder={`Ex.: já pago pelo cartão em 12/09 (mínimo de ${MOTIVO_MINIMO} caracteres)`}
            />
            {erro && <p role="alert" className="m-0 text-caption text-negative">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDescartando(null)}>Cancelar</Button>
              <Button variant="primary" onClick={confirmarDescarte}>Descartar</Button>
            </div>
          </div>
        </div>
      )}
      {node}
    </div>
  );
}
