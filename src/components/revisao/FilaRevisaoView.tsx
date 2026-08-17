"use client";

/**
 * A fila de revisão, como TELA.
 *
 * ⚠️ Ela mostra as TRÊS fontes lado a lado — descrição, texto de categoria e o
 * que a chave diz — porque é a discordância entre elas que exige gente. Uma
 * lista que mostrasse só "categoria: —" devolveria a mesma pergunta sem a
 * informação que a responde.
 *
 * ⚠️ E não há botão que classifique em lote. A ação "Confirmar" existe por
 * item, depois de a pessoa ler a descrição ao lado do nome da categoria: foi a
 * propagação automática que arquivaria R$ 140.000 de folha dentro de
 * "Assinaturas / software".
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Icon, BRL, Button, Skeleton, AcaoDestrutiva } from "@/components/ui";
import { getFilaRevisao, cancelarItemRevisao, confirmarClassificacao } from "@/lib/revisao";
import { ROTULO_MOTIVO, type AchadoRevisao } from "@/core/revisao";
import { dataBR } from "@/lib/format";
import { useToast } from "@/components/listas/ListChrome";

export function FilaRevisaoView() {
  const qc = useQueryClient();
  const { show: aviso, node: toastNode } = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["revisao", "fila"], queryFn: getFilaRevisao });

  if (isLoading) return <Card><Skeleton className="h-[320px]" /></Card>;

  const fila = data ?? { achados: [], total: 0, porMotivo: {} };
  if (fila.achados.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <Icon name="check" size={20} color="var(--color-positive)" />
          <p className="m-0 text-label text-muted max-w-[46ch]">
            Nada na fila. Todo lançamento tem classificação, descrição legível e valor.
          </p>
        </div>
      </Card>
    );
  }

  const recarregar = () => qc.invalidateQueries({ queryKey: ["revisao"] });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-start gap-3">
          <Icon name="triangle-alert" size={16} color="var(--color-warning)" />
          <div className="flex flex-col gap-1">
            <span className="text-h3 font-medium text-ink">
              {fila.achados.length} {fila.achados.length === 1 ? "item precisa" : "itens precisam"} de conferência
            </span>
            {/* ⚠️ "Soma das magnitudes", não "total": estes valores não formam
                um saldo — há entrada e saída no mesmo balde. É o tamanho da
                dúvida, e chamá-lo de total convidaria a somá-lo a outra coisa. */}
            <span className="text-caption text-muted">
              Soma das magnitudes envolvidas: <b className="text-ink tabular-nums"><BRL value={fila.total} /></b>.
              O sistema não classifica nada aqui — ele separa o que discorda e diz o que discorda.
            </span>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {Object.entries(fila.porMotivo).map(([m, v]) => (
                <span key={m} className="text-caption text-faint tabular-nums">
                  {ROTULO_MOTIVO[m as keyof typeof ROTULO_MOTIVO] ?? m}: <b className="text-ink">{v.n}</b>
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {toastNode}
      {fila.achados.map((a) => (
        <ItemFila key={`${a.origem}-${a.id}`} a={a} onFeito={recarregar} aviso={aviso} />
      ))}
    </div>
  );
}

function ItemFila({
  a, onFeito, aviso,
}: { a: AchadoRevisao; onFeito: () => void; aviso: (s: string) => void }) {
  const [ocupado, setOcupado] = React.useState(false);

  const rodar = async (f: () => Promise<void>, ok: string) => {
    setOcupado(true);
    try { await f(); aviso(ok); onFeito(); }
    catch (e) { aviso(e instanceof Error ? e.message : "Não foi possível concluir."); }
    finally { setOcupado(false); }
  };

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1 min-w-[240px] flex-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
              {ROTULO_MOTIVO[a.motivo]} · {a.origem === "recorrencia" ? "regra recorrente" : "lançamento"}
            </span>
            <span className="text-h3 font-medium text-ink">{a.descricao || "(sem descrição)"}</span>
            <span className="text-caption text-muted">{a.explicacao}</span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-h3 font-medium tabular-nums"
                  style={{ color: a.tipo === "entrada" ? "var(--color-positive)" : "var(--color-ink)" }}>
              {a.tipo === "entrada" ? "+" : "−"}<BRL value={Math.abs(a.valor)} />
            </span>
            <span className="text-caption text-faint tabular-nums">{dataBR(a.data)}</span>
          </div>
        </div>

        {/* As três fontes, lado a lado — é a discordância entre elas que exige gente. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-md bg-surface-2 p-3">
          <Fonte rotulo="Descrição" valor={a.descricao} />
          <Fonte rotulo="Categoria (o que o relatório lê)" valor={a.categoriaTexto} />
          <Fonte rotulo="Categoria (o que a chave diz)" valor={a.categoriaChave} />
        </div>
        {a.contraparte && (
          <span className="text-caption text-faint">Contraparte: <b className="text-ink">{a.contraparte}</b></span>
        )}

        <p className="m-0 text-label text-ink">{a.pergunta}</p>

        <div className="flex items-center gap-2 flex-wrap">
          {a.categoriaChave && a.origem === "lancamento" && (
            <Button
              variant="secondary"
              disabled={ocupado}
              onClick={() => rodar(
                () => confirmarClassificacao(a.id, a.categoriaChave!),
                `Classificação confirmada: ${a.categoriaChave}`,
              )}
            >
              Confirmar “{a.categoriaChave}”
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={ocupado}
            onClick={() => window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: a.id } }))}
          >
            Corrigir
          </Button>
          <AcaoDestrutiva
            rotulo={a.origem === "recorrencia" ? "Desativar a regra" : "Cancelar o lançamento"}
            titulo={a.origem === "recorrencia" ? "Desativar esta regra recorrente" : "Cancelar este lançamento"}
            descricao={
              a.origem === "recorrencia"
                ? "A regra para de gerar títulos novos. Os títulos já criados continuam — cancele cada um pela fila se também não valerem."
                : "O lançamento sai dos relatórios e da projeção de caixa. O registro fica, marcado como cancelado."
            }
            confirmarRotulo={a.origem === "recorrencia" ? "Desativar" : "Cancelar lançamento"}
            onConfirmar={async () => {
              await rodar(() => cancelarItemRevisao(a.id, a.origem), "Feito.");
            }}
          />
        </div>
      </div>
    </Card>
  );
}

function Fonte({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{rotulo}</span>
      <span className={valor ? "text-label text-ink" : "text-label text-placeholder"}>
        {valor || "— vazio"}
      </span>
    </div>
  );
}
