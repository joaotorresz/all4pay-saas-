"use client";

/**
 * ANÁLISE DE VARIAÇÃO — o que mudou no resultado do mês, e por quê.
 *
 * A tela não soma nada (teto ZERO da ONDA 10): escolhe o mês e os limiares, e
 * desenha o que `analisarVariacao` devolve. Cada linha material abre as
 * categorias que a moveram, e cada categoria abre os lançamentos exatos — a
 * mesma gaveta do DRE, com os mesmos ids.
 *
 * O comentário do mês nasce redigido e é EDITÁVEL: gerar sem deixar editar
 * tiraria a assinatura de quem responde pelo número; pedir em branco faria o
 * texto nascer vazio todo mês.
 */
import * as React from "react";
import Link from "next/link";
import { Card, BRL, StatusBadge, Skeleton, Select, Textarea, Button, Icon, InfoHint, CurrencyInput } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { analisarVariacao, LIMIARES_PADRAO, type LinhaVariacao } from "@/core/variacao";
import { deslocarMes, rotuloColuna } from "@/core/relatorios";
import { linhasDeclaradasDasCategorias } from "@/lib/data";
import { pctDeInteiro } from "@/lib/format";
import { GavetaTransacoes, type CelulaClicada } from "@/components/relatorios/kit";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

const TOM: Record<LinhaVariacao["leitura"], "positive" | "warning" | "neutral"> = {
  melhorou: "positive", piorou: "warning", neutro: "neutral",
};
const ROTULO: Record<LinhaVariacao["leitura"], string> = {
  melhorou: "Melhora o resultado", piorou: "Piora o resultado", neutro: "Sem efeito",
};

export function VariacaoView() {
  const { data: input, isLoading } = useRiscoInput();
  const [linhaPorCategoria, setLinhaPorCategoria] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    // A MESMA leitura do DRE — senão a variação classificaria diferente do
    // relatório que ela explica.
    let vivo = true;
    linhasDeclaradasDasCategorias().then((m) => { if (vivo) setLinhaPorCategoria(m); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  const mesAtual = input?.hoje.slice(0, 7) ?? null;
  const meses = React.useMemo(() => (mesAtual ? Array.from({ length: 12 }, (_, i) => deslocarMes(mesAtual, -i)) : []), [mesAtual]);
  const [mes, setMes] = React.useState<string | null>(null);
  const mesAtivo = mes ?? meses[1] ?? mesAtual; // padrão: o último mês FECHADO
  const [valorMin, setValorMin] = React.useState(LIMIARES_PADRAO.valor);
  const [pctMin, setPctMin] = React.useState(String(LIMIARES_PADRAO.pct));
  const [celula, setCelula] = React.useState<CelulaClicada | null>(null);

  const analise = React.useMemo(() => {
    if (!input || !mesAtivo) return null;
    return analisarVariacao(input, mesAtivo, { valor: valorMin, pct: Number(pctMin) || 0 }, linhaPorCategoria);
  }, [input, mesAtivo, valorMin, pctMin, linhaPorCategoria]);

  const [texto, setTexto] = React.useState("");
  React.useEffect(() => { if (analise) setTexto(analise.resumo); }, [analise]);
  const [copiado, setCopiado] = React.useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* sem permissão de área de transferência */ }
  };

  if (isLoading || !analise) {
    return <div className="flex flex-col gap-3"><Card><Skeleton className="h-16 w-full" /></Card><Card><Skeleton className="h-40 w-full" /></Card></div>;
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <Card className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <Select label="Mês analisado" value={mesAtivo ?? ""} onChange={setMes}
          options={meses.map((m) => ({ value: m, label: rotuloColuna(m) }))} containerClassName="min-w-[160px]" />
        <CurrencyInput label="Variação mínima (R$)" value={valorMin} onValueChange={(v) => setValorMin(v)} containerClassName="min-w-[170px]" />
        <Select label="Variação mínima (%)" value={pctMin} onChange={setPctMin}
          options={["5", "10", "15", "20", "30"].map((p) => ({ value: p, label: `${p}%` }))} containerClassName="min-w-[140px]" />
        <span className="text-caption text-faint self-center ml-auto">Comparado com {analise.rotuloAnterior} e com a média dos 3 meses anteriores</span>
        {isDemo && <DemoBadge />}
      </Card>

      {analise.indisponivel ? (
        <Card className="flex flex-col gap-2">
          <span className="text-h3 font-medium text-ink">Sem base de comparação</span>
          <span className="text-caption text-muted">{analise.indisponivel.motivo}</span>
          <Link href="/upload" className="text-label font-medium text-ink underline">Enviar extrato de meses anteriores →</Link>
        </Card>
      ) : (
        <>
          <Card className="flex items-start justify-between gap-4 flex-wrap"
            info={{ titulo: "Resultado do mês", oQue: "O resultado líquido do mês analisado contra o mês anterior.", comoCalcula: "Sai da mesma cascata do DRE, por competência, com a linha declarada de cada categoria do plano de contas." }}>
            <div className="flex flex-col gap-1">
              <span className="text-label font-medium text-muted">Resultado de {analise.rotuloMes}</span>
              <span className="a4p-heroi tabular-nums"><BRL value={analise.resultado.atual} /></span>
              <span className="text-caption text-faint tabular-nums">{analise.rotuloAnterior}: <BRL value={analise.resultado.anterior} /> · diferença <BRL value={analise.resultado.delta} /></span>
            </div>
            <StatusBadge tone={analise.materiais.length ? "warning" : "positive"}>
              {analise.materiais.length === 0 ? "Nenhuma variação relevante" : `${analise.materiais.length} ${analise.materiais.length === 1 ? "linha para explicar" : "linhas para explicar"}`}
            </StatusBadge>
          </Card>

          <Card className="flex flex-col gap-3"
            info={{ titulo: "Comentário do mês", oQue: "Um texto pronto para enviar ao sócio, ao conselho ou ao contador, explicando o que mudou.", comoCalcula: "Redigido a partir das linhas materiais e das categorias que mais pesaram em cada uma. Pode ser editado antes de copiar." }}>
            <span className="text-label font-medium text-muted">Comentário do mês</span>
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={Math.min(14, 3 + texto.split("\n").length * 2)} />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={copiar} leftIcon={<Icon name={copiado ? "check" : "file-text"} size={14} color="currentColor" />}>
                {copiado ? "Copiado" : "Copiar comentário"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTexto(analise.resumo)}>Restaurar texto gerado</Button>
            </div>
          </Card>

          <Card padded={false}>
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border-soft">
              <span className="flex-1 text-label font-medium text-ink inline-flex items-center gap-1">
                Linha a linha
                <InfoHint align="left" titulo="Linha a linha" oQue="Todas as linhas do DRE do mês analisado, com a variação contra o mês anterior." comoCalcula={`Uma linha é relevante quando varia pelo menos o valor mínimo E o percentual mínimo escolhidos — ou quando surge do zero com tamanho. Hoje: ${pctDeInteiro(Number(pctMin) || 0, 0)}.`} />
              </span>
              <span className="hidden md:block w-[120px] text-right a4p-label text-faint">{analise.rotuloAnterior}</span>
              <span className="w-[120px] text-right a4p-label text-faint">{analise.rotuloMes}</span>
              <span className="hidden sm:block w-[120px] text-right a4p-label text-faint">Variação</span>
            </div>
            {analise.linhas.map((l, i) => (
              <LinhaCard key={l.id} l={l} primeira={i === 0} rotuloMes={analise.rotuloMes} rotuloAnterior={analise.rotuloAnterior} onCelula={setCelula} />
            ))}
          </Card>
        </>
      )}

      {celula && <GavetaTransacoes celula={celula} onFechar={() => setCelula(null)} />}
    </div>
  );
}

function LinhaCard({ l, primeira, rotuloMes, rotuloAnterior, onCelula }: {
  l: LinhaVariacao; primeira: boolean; rotuloMes: string; rotuloAnterior: string; onCelula: (c: CelulaClicada) => void;
}) {
  const [aberta, setAberta] = React.useState(false);
  const total = l.tipo === "total";
  return (
    <div className={primeira ? "" : "border-t border-border-soft"}>
      <button
        onClick={() => l.material && setAberta((a) => !a)}
        aria-expanded={l.material ? aberta : undefined}
        className={`w-full flex items-center gap-3 px-5 py-2 text-left ${l.material ? "hover:bg-surface-1" : "cursor-default"} ${total ? "font-medium" : ""}`}
      >
        <span className="flex-1 min-w-0 flex items-center gap-2">
          {l.material ? <Icon name={aberta ? "chevron-down" : "chevron-right"} size={14} color="var(--color-text-secondary)" /> : <span className="w-[14px]" />}
          <span className={`truncate ${total ? "text-ink" : "text-muted"}`}>{l.label}</span>
          {l.material && <StatusBadge tone={TOM[l.leitura]}>{ROTULO[l.leitura]}</StatusBadge>}
        </span>
        <span className="hidden md:block w-[120px] text-right tabular-nums text-muted"><BRL value={l.anterior} /></span>
        <span className="w-[120px] text-right tabular-nums text-ink"><BRL value={l.atual} /></span>
        {/* Número não tem cor por sinal (decisão de 30/09/2026): o delta sai em
            tinta neutra com o sinal escrito; "melhora/piora o resultado" é dito
            pelo selo da linha, não pela cor do número. */}
        <span className={`hidden sm:block w-[120px] text-right tabular-nums ${Math.abs(l.delta) < 0.005 ? "text-faint" : "text-ink"}`}>
          {l.delta >= 0.005 ? "+" : ""}<BRL value={l.delta} />
          {l.deltaPct != null && <span className="block text-[11px] text-faint">{l.deltaPct > 0 ? "+" : "−"}{pctDeInteiro(Math.abs(l.deltaPct))}</span>}
        </span>
      </button>
      {aberta && (
        <div className="px-5 pb-4 pl-12 flex flex-col gap-2">
          <p className="m-0 text-caption text-muted max-w-[80ch]">{l.comentario}</p>
          {l.motivos.slice(0, 6).map((m) => (
            <div key={m.categoria} className="flex items-center gap-3 text-caption">
              <span className="flex-1 min-w-0 truncate text-ink">{m.categoria}{m.principalContraparte ? <span className="text-faint"> · {m.principalContraparte}</span> : null}</span>
              <span className="tabular-nums text-muted w-[110px] text-right"><BRL value={m.delta} /></span>
              {/* Os DOIS lados da diferença: o valor vai junto, para o total da
                  gaveta ser o da célula (e não uma soma assinada que, numa
                  linha de despesa, sairia com o sinal trocado). */}
              {m.movimentosAnterior.length > 0 && (
                <button onClick={() => onCelula({ linha: `${l.label} · ${m.categoria}`, coluna: rotuloAnterior, movimentos: m.movimentosAnterior, valor: m.anterior })}
                  className="text-caption text-muted hover:text-ink px-2 py-1 rounded-sm hover:bg-surface-2">
                  Ver {m.movimentosAnterior.length} de {rotuloAnterior}
                </button>
              )}
              {m.movimentos.length > 0 && (
                <button onClick={() => onCelula({ linha: `${l.label} · ${m.categoria}`, coluna: rotuloMes, movimentos: m.movimentos, valor: m.atual })}
                  className="text-caption text-muted hover:text-ink px-2 py-1 rounded-sm hover:bg-surface-2">
                  Ver {m.movimentos.length} de {rotuloMes}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
