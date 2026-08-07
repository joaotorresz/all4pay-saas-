"use client";

/**
 * PRÉ-VISUALIZAÇÃO DA IMPORTAÇÃO — o que vai entrar, antes de entrar.
 *
 * ⚠️ Importar era um botão que escrevia na base. Agora é um PLANO que se
 * confere: quantas linhas são novas, quantas já existem, quantas o sistema não
 * soube classificar e quais levantam suspeita de repetição. Só depois disso
 * existe um "Confirmar".
 *
 * A diferença não é de conforto. Sem esta tela, a única forma de descobrir que
 * um extrato entrou duas vezes é notar, semanas depois, que o faturamento do
 * mês dobrou — e aí já não se sabe quais linhas remover.
 *
 * O motor é `core/ingestao.prepararIngestao` (puro, coberto pela matriz de
 * consistência). Esta tela só o desenha.
 */
import * as React from "react";
import { Card, Button, Icon, BRL, StatusBadge, InfoHint } from "@/components/ui";
import {
  linhasAGravar, type PlanoIngestao, type MovimentoIngerido, type SituacaoLinha,
} from "@/core/ingestao";

const fmtDia = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const SITUACAO: Record<SituacaoLinha, { rotulo: string; cor: string; entra: boolean }> = {
  nova: { rotulo: "Nova", cor: "var(--color-positive)", entra: true },
  revisar: { rotulo: "Conferir categoria", cor: "var(--color-warning)", entra: true },
  possivel_duplicata: { rotulo: "Possível repetição", cor: "var(--color-warning)", entra: true },
  duplicata_base: { rotulo: "Já existe", cor: "var(--color-text-tertiary)", entra: false },
  duplicata_arquivo: { rotulo: "Repetida no arquivo", cor: "var(--color-text-tertiary)", entra: false },
};

export function PrevisaoImportacao({
  plano, onConfirmar, aplicando,
}: {
  plano: PlanoIngestao;
  onConfirmar: () => void;
  aplicando?: boolean;
}) {
  const [filtro, setFiltro] = React.useState<SituacaoLinha | "todas">("todas");
  const [verTodas, setVerTodas] = React.useState(false);
  const r = plano.resumo;
  const aGravar = linhasAGravar(plano);

  const visiveis = React.useMemo(() => {
    const base = filtro === "todas" ? plano.linhas : plano.linhas.filter((l) => l.situacao === filtro);
    return verTodas ? base : base.slice(0, 25);
  }, [plano.linhas, filtro, verTodas]);

  const chip = (id: SituacaoLinha | "todas", rotulo: string, n: number) => (
    <button
      key={id}
      onClick={() => { setFiltro(id); setVerTodas(false); }}
      className={`inline-flex items-center gap-[6px] rounded-pill px-3 py-[6px] text-caption transition-colors ${
        filtro === id ? "bg-surface-3 text-ink font-semibold" : "bg-surface-2 text-muted hover:text-ink"
      }`}
    >
      {rotulo}
      <span className="tabular-nums">{n}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------------- resumo ------------------------------- */}
      <Card className="flex flex-col gap-4"
        info={{
          titulo: "O que vai entrar",
          oQue: "A conferência do arquivo antes de gravar: o que é novo, o que já existe e o que precisa de atenção.",
          comoCalcula:
            "Cada linha ganha uma chave determinística de conta + data + valor + sinal + descritivo normalizado. Chave igual a uma que já está na base = já existe, e não entra. Conta, data, valor e sinal iguais com descritivo diferente = possível repetição, que ENTRA marcada, porque descartá-la sozinha apagaria lançamentos legítimos.",
        }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-label font-medium text-muted">
            {r.lidas.toLocaleString("pt-BR")} linhas lidas
            {r.de && r.ate && <span className="text-faint"> · {fmtDia(r.de)} a {fmtDia(r.ate)}</span>}
          </span>
          <StatusBadge tone={aGravar.length > 0 ? "positive" : "neutral"}>
            {aGravar.length.toLocaleString("pt-BR")} serão gravadas
          </StatusBadge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Numero label="Novas" v={r.novas} tom="var(--color-positive)" />
          <Numero label="Conferir categoria" v={r.revisar} tom="var(--color-warning)" />
          <Numero
            label="Possível repetição" v={r.possiveisDuplicatas} tom="var(--color-warning)"
            dica="Mesma conta, data, valor e sentido de algo que já existe, com descritivo diferente. Entram marcadas — descartar sozinho apagaria vendas legítimas de mesmo valor no mesmo dia."
          />
          <Numero
            label="Já existiam" v={r.duplicatasBase + r.duplicatasArquivo} tom="var(--color-text-tertiary)"
            dica="Chave idêntica a um lançamento já gravado (ou repetida dentro do próprio arquivo). Não entram — é o que impede o mesmo extrato de duplicar a base."
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 pt-1 border-t border-border-soft">
          <Valor label="Entradas" v={r.entradas} />
          <Valor label="Saídas" v={r.saidas} />
          <Valor label="Resultado" v={r.resultado} destaque />
        </div>
      </Card>

      {/* ---------------------------- por categoria ---------------------------- */}
      {plano.porCategoria.length > 0 && (
        <Card padded={false}>
          <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted">
            Classificação sugerida
          </div>
          {plano.porCategoria.slice(0, 12).map((c, i) => (
            <div key={c.categoria} className={`flex items-center gap-3 px-5 py-2 ${i ? "border-t border-border-soft" : ""}`}>
              <span className="flex-1 min-w-0 truncate text-[15px] text-ink">{c.categoria}</span>
              <span className="text-caption text-faint tabular-nums shrink-0">{c.quantidade}</span>
              <span className="w-[120px] text-right tabular-nums text-ink shrink-0"><BRL value={c.total} /></span>
            </div>
          ))}
        </Card>
      )}

      {/* ------------------------------- linhas ------------------------------- */}
      <Card padded={false}>
        <div className="flex items-center gap-2 flex-wrap px-5 py-3 border-b border-border-soft">
          {chip("todas", "Todas", plano.linhas.length)}
          {r.novas > 0 && chip("nova", "Novas", r.novas)}
          {r.revisar > 0 && chip("revisar", "Conferir", r.revisar)}
          {r.possiveisDuplicatas > 0 && chip("possivel_duplicata", "Possível repetição", r.possiveisDuplicatas)}
          {r.duplicatasBase > 0 && chip("duplicata_base", "Já existem", r.duplicatasBase)}
          {r.duplicatasArquivo > 0 && chip("duplicata_arquivo", "Repetidas no arquivo", r.duplicatasArquivo)}
        </div>

        {visiveis.map((l, i) => <Linha key={`${l.chave}-${i}`} l={l} primeira={i === 0} />)}

        {!verTodas && (filtro === "todas" ? plano.linhas.length : visiveis.length) > 25 && (
          <button onClick={() => setVerTodas(true)} className="w-full px-5 py-3 text-caption text-muted hover:text-ink border-t border-border-soft">
            Ver todas
          </button>
        )}
      </Card>

      {/* ------------------------------ confirmar ------------------------------ */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="primary" onClick={onConfirmar}
          disabled={aplicando || aGravar.length === 0}
          leftIcon={<Icon name="check" size={15} />}
        >
          {aplicando ? "Gravando…" : `Confirmar e gravar ${aGravar.length.toLocaleString("pt-BR")} lançamentos`}
        </Button>
        <span className="text-caption text-faint max-w-[52ch]">
          {r.duplicatasBase + r.duplicatasArquivo > 0
            ? `${(r.duplicatasBase + r.duplicatasArquivo).toLocaleString("pt-BR")} linhas ficam de fora por já existirem. Nada é sobrescrito.`
            : "Nada será sobrescrito — só entram lançamentos que ainda não existem."}
        </span>
      </div>
    </div>
  );
}

function Linha({ l, primeira }: { l: MovimentoIngerido; primeira: boolean }) {
  const s = SITUACAO[l.situacao];
  return (
    <div className={`flex items-center gap-3 px-5 py-[10px] ${primeira ? "" : "border-t border-border-soft"} ${s.entra ? "" : "opacity-55"}`}>
      <span className="w-[7px] h-[7px] rounded-pill shrink-0" style={{ background: s.cor }} title={s.rotulo} />
      <span className="w-[74px] shrink-0 text-caption text-faint tabular-nums">{fmtDia(l.data)}</span>
      <div className="flex-1 min-w-0">
        {/* ⚠️ O descritivo BRUTO é o que se mostra — é ele que a pessoa
            reconhece do extrato do banco. O normalizado serve à máquina. */}
        <div className="truncate text-[15px] text-ink">{l.descritivoBruto || "—"}</div>
        <div className="truncate text-caption text-faint">
          {l.classificacao.categoria}
          <span className="text-placeholder"> · {l.classificacao.motivo}</span>
        </div>
      </div>
      <span className="shrink-0 text-caption" style={{ color: s.cor }}>{s.rotulo}</span>
      <span className="w-[110px] text-right tabular-nums shrink-0 text-ink">
        {l.tipo === "saida" && <span aria-hidden>−</span>}<BRL value={l.valor} />
      </span>
    </div>
  );
}

function Numero({ label, v, tom, dica }: { label: string; v: number; tom: string; dica?: string }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-caption text-faint inline-flex items-center gap-1">
        {label}
        {dica && <InfoHint align="left" titulo={label} oQue={dica} />}
      </span>
      <span className="text-[22px] font-semibold tabular-nums" style={{ color: v > 0 ? tom : "var(--color-text-tertiary)" }}>
        {v.toLocaleString("pt-BR")}
      </span>
    </div>
  );
}

function Valor({ label, v, destaque }: { label: string; v: number; destaque?: boolean }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-caption text-faint">{label}</span>
      <span
        className={`text-[18px] tabular-nums ${destaque ? "font-semibold" : ""}`}
        style={{ color: destaque && v < 0 ? "var(--color-negative)" : "var(--color-ink)" }}
      >
        {v < 0 && <span aria-hidden>−</span>}<BRL value={Math.abs(v)} />
      </span>
    </div>
  );
}
