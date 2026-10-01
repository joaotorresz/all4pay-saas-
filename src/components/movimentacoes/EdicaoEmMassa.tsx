"use client";

/**
 * EDIÇÃO EM MASSA dos títulos marcados — categoria, centro de custo, projeto
 * ou vencimento de uma vez.
 *
 * ⚠️ A tela mostra o PLANO antes do botão: quantos mudam, quanto somam, o
 * de→para de cada grupo, e — com o mesmo peso — quais ficaram de fora e por
 * quê (mês fechado, já baixado, cancelado). Quem clica em "Aplicar" sabe
 * exatamente o que vai acontecer; ninguém descobre depois que quatro títulos
 * "não pegaram". As regras moram em `core/movimentacoes/edicao-massa`.
 *
 * Vai por `createPortal` pelo mesmo motivo do modal de baixa: o `Card` do DS
 * tem `transform` e prenderia o `position: fixed`.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Button, Icon, Select, DateField, BRL } from "@/components/ui";
import { useCategories, useCostCenters } from "@/components/lancamentos/hooks";
import { useProjetos } from "@/components/registros/hooks";
import { hydrateClose, lockedPeriods } from "@/lib/close";
import { aplicarEdicaoEmMassa, type ResultadoEdicao } from "@/lib/edicao-massa";
import {
  planejarEdicao, ROTULO_CAMPO, type CampoEdicao, type AlteracaoEmMassa,
} from "@/core/movimentacoes/edicao-massa";
import { dataBR } from "@/lib/format";
import type { RiskMovement } from "@/core/risk-engine/types";

const CAMPOS: CampoEdicao[] = ["categoria", "centro", "projeto", "vencimento"];

export function EdicaoEmMassa({
  titulos, direcao, onFechar, onAplicado,
}: {
  titulos: RiskMovement[];
  direcao: "pagar" | "receber";
  onFechar: () => void;
  onAplicado: (r: ResultadoEdicao, recusados: number) => void;
}) {
  const [campo, setCampo] = React.useState<CampoEdicao>("categoria");
  const [para, setPara] = React.useState("");
  const [fechados, setFechados] = React.useState<string[]>(() => lockedPeriods());
  const [gravando, setGravando] = React.useState(false);
  const [falhas, setFalhas] = React.useState<ResultadoEdicao["falhas"]>([]);

  // ⚠️ Os meses fechados vêm do servidor antes do plano ser mostrado: com a
  // lista local desatualizada, a tela prometeria mudar um título que o banco
  // vai recusar.
  React.useEffect(() => {
    let vivo = true;
    void hydrateClose().then(() => { if (vivo) setFechados(lockedPeriods()); }).catch(() => undefined);
    return () => { vivo = false; };
  }, []);

  const { data: cats } = useCategories(direcao === "receber" ? "receita" : "despesa");
  const { data: centros } = useCostCenters();
  // O cadastro do BANCO (CAD): o id do projeto é o que `project_id` aceita.
  const { data: projetosDb } = useProjetos();
  const projetos = React.useMemo(() => projetosDb ?? [], [projetosDb]);

  const opcoes = React.useMemo(() => {
    if (campo === "categoria") return (cats ?? []).map((c) => ({ value: c.id, label: c.name }));
    if (campo === "centro") return (centros ?? []).map((c) => ({ value: c.id, label: c.name }));
    if (campo === "projeto") return projetos.map((p) => ({ value: p.id, label: p.nome }));
    return [];
  }, [campo, cats, centros, projetos]);

  const alteracao: AlteracaoEmMassa | null = React.useMemo(() => {
    if (campo === "vencimento") return para ? { campo, para, paraRotulo: dataBR(para) } : null;
    if (!para) return null;
    return { campo, para, paraRotulo: opcoes.find((o) => o.value === para)?.label ?? para };
  }, [campo, para, opcoes]);

  const plano = React.useMemo(
    () => (alteracao ? planejarEdicao(titulos, alteracao, { mesesFechados: fechados }) : null),
    [titulos, alteracao, fechados],
  );

  const mostrar = (v: string) => (campo === "vencimento" && v ? dataBR(v) : v || "(vazio)");

  const aplicar = async () => {
    if (!plano || plano.quantidade === 0) return;
    setGravando(true);
    try {
      const r = await aplicarEdicaoEmMassa(plano);
      if (r.falhas.length) setFalhas(r.falhas);
      onAplicado(r, plano.recusados.length);
      if (!r.falhas.length) onFechar();
    } finally {
      setGravando(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/30 flex items-center justify-center p-4" onClick={onFechar}>
      <div
        role="dialog" aria-label="Editar títulos em massa"
        className="w-full max-w-[560px] max-h-[88vh] overflow-y-auto bg-white rounded-modal p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") onFechar(); }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-h3 font-medium text-ink">Editar {titulos.length} {titulos.length === 1 ? "título" : "títulos"}</span>
          <button onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-pill inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2">
            <Icon name="x" size={16} color="currentColor" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="O que trocar" aria-label="Campo da edição em massa"
            value={campo}
            onChange={(v) => { setCampo(v as CampoEdicao); setPara(""); setFalhas([]); }}
            options={CAMPOS.map((c) => ({ value: c, label: ROTULO_CAMPO[c] }))}
          />
          {campo === "vencimento" ? (
            <DateField label="Novo vencimento" value={para} onChange={setPara} />
          ) : (
            <Select
              label={`Novo ${ROTULO_CAMPO[campo].toLowerCase()}`} aria-label="Novo valor da edição em massa"
              value={para} onChange={setPara}
              placeholder={opcoes.length ? "Escolha…" : "Nada cadastrado"}
              options={opcoes}
              disabled={opcoes.length === 0}
            />
          )}
        </div>

        {!plano ? (
          <p className="m-0 text-caption text-muted">Escolha o novo valor para ver o que muda antes de aplicar.</p>
        ) : (
          <div className="flex flex-col gap-3" data-plano-edicao>
            <div className="rounded-md bg-surface-1 p-3 flex flex-col gap-1">
              <span className="text-label text-ink">
                Vão mudar <b className="tabular-nums">{plano.quantidade}</b> {plano.quantidade === 1 ? "título" : "títulos"}, somando <b className="tabular-nums"><BRL value={plano.soma} /></b>.
              </span>
              {plano.grupos.map((g) => (
                <span key={g.de} className="text-caption text-muted tabular-nums">
                  {ROTULO_CAMPO[campo]}: {mostrar(g.de)} → <b className="text-ink">{mostrar(g.para)}</b> · {g.quantidade} · <BRL value={g.soma} />
                </span>
              ))}
            </div>
            {plano.recusados.length > 0 && (
              <div className="rounded-md border border-border p-3 flex flex-col gap-1" data-recusados>
                <span className="text-label text-ink">
                  {plano.recusados.length} {plano.recusados.length === 1 ? "fica" : "ficam"} de fora:
                </span>
                {plano.recusados.slice(0, 12).map((r) => (
                  <span key={r.id} className="text-caption text-muted tabular-nums">
                    <span className="text-ink">{r.id.slice(0, 12)}</span> · <BRL value={r.valor} /> — {r.explicacao}
                  </span>
                ))}
                {plano.recusados.length > 12 && (
                  <span className="text-caption text-faint">e mais {plano.recusados.length - 12}.</span>
                )}
              </div>
            )}
          </div>
        )}

        {falhas.length > 0 && (
          <div className="rounded-md border border-border p-3 flex flex-col gap-1" role="alert">
            <span className="text-label text-negative">O banco recusou {falhas.length} {falhas.length === 1 ? "título" : "títulos"}:</span>
            {falhas.slice(0, 8).map((f) => (
              <span key={f.id} className="text-caption text-muted">{f.id.slice(0, 12)} — {f.mensagem}</span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button variant="primary" onClick={aplicar} disabled={!plano || plano.quantidade === 0 || gravando}>
            {gravando ? "Aplicando…" : `Aplicar a ${plano?.quantidade ?? 0} ${plano?.quantidade === 1 ? "título" : "títulos"}`}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
