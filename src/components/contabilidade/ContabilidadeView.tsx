"use client";

/**
 * Contabilidade (modelo IULI, §Contabilidade / Fig.35-36) — exportação para o
 * escritório contábil. Dois recursos:
 *  • Gerar TXT Contábil — exporta o extrato no formato Domínio (Partidas
 *    Simples): DATA;DÉBITO;CRÉDITO;VALOR;HISTÓRICO, um lançamento por linha.
 *  • Envio das NFs — envio mensal automático de XMLs (entrada+saída) ao contador.
 * Reusa getRiscoInput (demo/live idêntico). Download client-side (Blob).
 */
import * as React from "react";
import { AppShell } from "@/components/app/AppShell";
import { Card, Button, Icon, Skeleton } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { formatBRL } from "@/lib/format";

const fmtData = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const fmtValor = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Códigos contábeis padrão (Domínio) — caixa, receitas e despesas.
const CTA_CAIXA = "1.1.1", CTA_RECEITA = "3.1.1", CTA_DESPESA = "4.1.1";

export function ContabilidadeView() {
  const { data, isLoading } = useRiscoInput();

  const linhas = React.useMemo(() => {
    if (!data) return [] as { data: string; debito: string; credito: string; valor: number; historico: string }[];
    return data.movements
      .filter((m) => m.status !== "cancelado")
      .map((m) => {
        const efet = m.paid_date || m.due_date;
        const hist = `${m.type === "entrada" ? "Receita" : "Despesa"}${m.category ? " - " + m.category : ""}`;
        // Partidas simples: entrada → débito Caixa / crédito Receita; saída inverso.
        return m.type === "entrada"
          ? { data: efet, debito: CTA_CAIXA, credito: CTA_RECEITA, valor: Math.abs(m.amount), historico: hist }
          : { data: efet, debito: CTA_DESPESA, credito: CTA_CAIXA, valor: Math.abs(m.amount), historico: hist };
      })
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [data]);

  const totalDeb = linhas.reduce((s, l) => s + l.valor, 0);

  const baixarTxt = () => {
    const cab = "# Dominio - Partidas Simples - extrato all4pay\n# layout: DATA;DEBITO;CREDITO;VALOR;HISTORICO\n";
    const corpo = linhas.map((l) => `${fmtData(l.data)};${l.debito};${l.credito};${fmtValor(l.valor)};${l.historico}`).join("\n");
    const blob = new Blob([cab + corpo + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "extrato-dominio-partidas-simples.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell title="Contabilidade">
      <div className="flex flex-col gap-5 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Envio das NFs */}
          <Card className="flex flex-col gap-2"
            info={{ titulo: "Envio das NFs ao contador", oQue: "Manda os XMLs das notas fiscais para o escritório contábil todo mês, sem você precisar lembrar.", comoCalcula: "Empacota os XMLs de NF de entrada e de saída por competência e envia no dia configurado." }}>
            <div className="flex items-center gap-2"><Icon name="mail" size={18} color="var(--color-text-secondary)" /><span className="text-[16px] font-semibold text-ink">Envio das NFs ao contador</span></div>
            <p className="m-0 text-caption text-muted">Envio mensal automático dos XMLs (entrada + saída) ao escritório contábil. Configure o e-mail do contador e o dia do envio nas configurações da empresa.</p>
            <div className="mt-1"><span className="text-caption text-faint inline-flex items-center gap-2"><Icon name="check" size={14} color="var(--color-positive)" />XMLs de NF de saída e entrada são empacotados por competência.</span></div>
          </Card>

          {/* Gerar TXT */}
          <Card className="flex flex-col gap-3"
            info={{ titulo: "TXT Contábil (Domínio)", oQue: "Gera o arquivo do extrato pronto para importar no sistema do contador (Domínio).", comoCalcula: "Vira cada movimento numa linha de partidas simples (data, débito, crédito, valor, histórico): entrada debita Caixa e credita Receita; saída faz o inverso." }}>
            <div className="flex items-center gap-2"><Icon name="file-text" size={18} color="var(--color-text-secondary)" /><span className="text-[16px] font-semibold text-ink">Gerar TXT Contábil (Domínio)</span></div>
            <p className="m-0 text-caption text-muted">Exporta o extrato no formato <b className="text-ink font-medium">Domínio · Partidas Simples</b> para importação no sistema do contador.</p>
            {isLoading ? <Skeleton className="h-9 w-40" /> : (
              <>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-caption">
                  <span className="text-muted">Lançamentos: <b className="text-ink">{linhas.length}</b></span>
                  <span className="text-muted">Total: <b className="text-ink tabular-nums">{formatBRL(totalDeb)}</b></span>
                </div>
                <Button variant="primary" leftIcon={<Icon name="arrow-down-to-line" size={15} />} onClick={baixarTxt} disabled={!linhas.length} className="self-start">Baixar TXT</Button>
              </>
            )}
          </Card>
        </div>

        {/* Preview */}
        <Card padded={false}
          info={{ titulo: "Prévia", oQue: "Mostra como ficam os lançamentos no arquivo antes de baixar, em partidas simples.", comoCalcula: "Lista os movimentos ordenados por data com débito, crédito, valor e histórico." }}>
          <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted">Prévia · partidas simples (DATA · Débito · Crédito · Valor · Histórico)</div>
          {isLoading ? <div className="p-5"><Skeleton className="h-24 w-full" /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead><tr className="text-caption text-muted">
                  <th className="text-left font-medium px-5 py-2">Data</th><th className="text-left font-medium px-3 py-2">Débito</th><th className="text-left font-medium px-3 py-2">Crédito</th><th className="text-right font-medium px-3 py-2">Valor</th><th className="text-left font-medium px-5 py-2">Histórico</th>
                </tr></thead>
                <tbody>
                  {linhas.slice(0, 40).map((l, i) => (
                    <tr key={i} className={i ? "border-t border-border-soft" : ""}>
                      <td className="px-5 py-2 text-ink tabular-nums">{fmtData(l.data)}</td>
                      <td className="px-3 py-2 text-muted tabular-nums">{l.debito}</td>
                      <td className="px-3 py-2 text-muted tabular-nums">{l.credito}</td>
                      <td className="px-3 py-2 text-right text-ink tabular-nums">{fmtValor(l.valor)}</td>
                      <td className="px-5 py-2 text-muted truncate">{l.historico}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {linhas.length > 40 && <div className="px-5 py-2 text-caption text-faint">+ {linhas.length - 40} lançamentos no arquivo completo.</div>}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
