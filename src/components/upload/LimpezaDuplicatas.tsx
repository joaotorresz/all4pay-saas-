"use client";

/**
 * LIMPEZA RETROATIVA — as duplicatas que já estão gravadas.
 *
 * A idempotência resolve daqui para a frente. Esta tela resolve o passado: a
 * base já tem cópias que entraram antes de a chave existir, e elas inflam
 * faturamento, despesa e saldo em todo relatório que soma lançamentos.
 *
 * ⚠️ **Nada é apagado sem confirmação, e o impacto aparece ANTES.** Uma limpeza
 * que roda sozinha é indistinguível de perda de dados — e o usuário só
 * descobriria pelo número que mudou sem ele ter feito nada.
 *
 * ⚠️ Mantém sempre o PRIMEIRO de cada grupo, porque é o id que baixas,
 * conciliações, comprovantes e lançamentos do razão já referenciam.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Button, Icon, BRL, StatusBadge, Skeleton } from "@/components/ui";
import { planejarLimpeza, type RelatorioLimpeza, type LinhaExistente } from "@/core/ingestao";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { removerImported } from "@/lib/imported";
import { isDemo } from "@/lib/demo";
import { ErroWidget } from "@/components/visao-geral/shared";

const fmtDia = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export function LimpezaDuplicatas() {
  const qc = useQueryClient();
  const { data: input, isLoading, error, refetch } = useRiscoInput();
  const [aplicando, setAplicando] = React.useState(false);
  const [feito, setFeito] = React.useState<number | null>(null);
  const [falha, setFalha] = React.useState<string | null>(null);

  const rel: RelatorioLimpeza | null = React.useMemo(() => {
    if (!input) return null;
    const linhas: LinhaExistente[] = input.movements.map((m) => ({
      id: m.id, account_id: m.accountId, paid_date: m.paid_date, due_date: m.due_date,
      amount: m.amount, type: m.type, category: m.category,
    }));
    return planejarLimpeza(linhas);
  }, [input]);

  const limpar = async () => {
    if (!rel || rel.remover.length === 0) return;
    setAplicando(true); setFalha(null);
    try {
      if (isDemo) {
        removerImported(rel.remover);
      } else {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        // Em lotes: um `in` com milhares de ids estoura o limite da URL.
        for (let i = 0; i < rel.remover.length; i += 200) {
          const { error: e } = await supabase.from("movements").delete().in("id", rel.remover.slice(i, i + 200));
          if (e) throw e;
        }
      }
      setFeito(rel.remover.length);
      // ⚠️ Recalcula TODOS os derivados: saldo, DRE, fluxo, risco, painéis.
      // Sem isto a tela mostraria a base limpa e os números antigos em cache.
      await qc.invalidateQueries();
    } catch (e) {
      setFalha((e as Error).message || "Falha ao remover as duplicatas.");
    } finally {
      setAplicando(false);
    }
  };

  if (error) return <ErroWidget titulo="Não foi possível analisar a base" erro={error} onTentarNovamente={() => refetch()} />;
  if (isLoading || !rel) return <Card><Skeleton className="h-32 w-full" /></Card>;

  if (rel.remover.length === 0) {
    return (
      <Card className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Icon name="check" size={18} color="var(--color-positive)" />
          <span className="text-h3 text-ink">Nenhuma duplicata na base</span>
        </div>
        <span className="text-caption text-muted">
          {rel.analisados.toLocaleString("pt-BR")} lançamentos analisados pela chave de idempotência
          (conta · data · valor · sinal · descritivo). {feito !== null && `${feito} removidos nesta sessão.`}
        </span>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4"
      info={{
        titulo: "Limpeza retroativa",
        oQue: "As cópias que já estão gravadas na base, e quanto elas inflam os seus números.",
        comoCalcula:
          "Agrupa os lançamentos pela chave de idempotência (conta, data, valor, sinal e descritivo normalizado). Grupos com mais de uma ocorrência são duplicatas; o PRIMEIRO de cada grupo fica, porque é o id que baixas, conciliações e lançamentos do razão já referenciam.",
      }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-h3 text-ink">
          {rel.remover.length.toLocaleString("pt-BR")} duplicatas encontradas
        </span>
        <StatusBadge tone="warning">{rel.grupos.length} grupos</StatusBadge>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <div className="flex flex-col">
          <span className="text-caption text-faint">Entradas contadas a mais</span>
          <span className="text-[18px] tabular-nums text-ink"><BRL value={rel.impactoEntradas} /></span>
        </div>
        <div className="flex flex-col">
          <span className="text-caption text-faint">Saídas contadas a mais</span>
          <span className="text-[18px] tabular-nums text-ink"><BRL value={rel.impactoSaidas} /></span>
        </div>
        <div className="flex flex-col">
          <span className="text-caption text-faint">Efeito no resultado</span>
          <span className="text-[18px] font-semibold tabular-nums" style={{ color: "var(--color-warning)" }}>
            {rel.impactoResultado < 0 && <span aria-hidden>−</span>}
            <BRL value={Math.abs(rel.impactoResultado)} />
          </span>
        </div>
      </div>

      <div className="flex flex-col border-t border-border-soft">
        {rel.grupos.slice(0, 10).map((g) => (
          <div key={g.chave} className="flex items-center gap-3 py-2 border-b border-border-soft last:border-0">
            <span className="w-[74px] shrink-0 text-caption text-faint tabular-nums">{fmtDia(g.data)}</span>
            <span className="flex-1 min-w-0 truncate text-[15px] text-ink">{g.descritivo}</span>
            <span className="shrink-0 text-caption text-faint">{g.remover.length + 1}×</span>
            <span className="w-[110px] text-right tabular-nums shrink-0 text-ink"><BRL value={g.valor} /></span>
          </div>
        ))}
        {rel.grupos.length > 10 && (
          <span className="py-2 text-caption text-faint">e mais {rel.grupos.length - 10} grupos.</span>
        )}
      </div>

      {falha && <ErroWidget titulo="A limpeza não foi aplicada" erro={falha} onTentarNovamente={limpar} />}

      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="primary" onClick={limpar} disabled={aplicando} leftIcon={<Icon name="trash-2" size={15} />}>
          {aplicando ? "Removendo…" : `Remover ${rel.remover.length.toLocaleString("pt-BR")} cópias`}
        </Button>
        <span className="text-caption text-faint max-w-[52ch]">
          O primeiro lançamento de cada grupo é mantido. Depois de remover, todos os
          derivados (saldo, DRE, fluxo, risco, painéis) são recalculados.
        </span>
      </div>
    </Card>
  );
}
