"use client";

/**
 * Fechamento Mensal — o relatório de análise financeira do mês.
 *
 * O que o torna útil não é a DRE (essa já existe em `/dashboard/reports/dre`):
 * é a NARRATIVA assinada. A máquina redige o que os números dizem — resumo,
 * destaques, recomendações e pontos de atenção derivados da própria cascata — e
 * quem assina EDITA antes de exportar. Pedir o texto em branco faria o
 * relatório nascer vazio todo mês; gerar sem deixar editar tiraria a assinatura
 * de quem responde por ele.
 *
 * Exporta em DOCX porque é onde o texto é revisado (Word/Docs), e o histórico
 * fica salvo para comparar meses.
 */
import * as React from "react";
import { Card, Button, Select, Input, Textarea, Icon, BRL } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { baixarDOCX, type BlocoDocx } from "@/lib/docx";
import { montarFechamento, rotuloColuna, type Fechamento } from "@/core/relatorios";
import { listarFechamentos, salvarFechamento, removerFechamento } from "@/lib/fechamentos";
import { loadCompany } from "@/lib/company";
import { pctDeInteiro } from "@/lib/format";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const ANOS = [2024, 2025, 2026, 2027];
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function FechamentoView() {
  const { data: input } = useRiscoInput();
  const [lista, setLista] = React.useState<Fechamento[]>([]);
  const [modo, setModo] = React.useState<"lista" | "novo">("lista");
  const [aberto, setAberto] = React.useState<Fechamento | null>(null);
  const { show, node } = useToast();

  React.useEffect(() => { setLista(listarFechamentos()); }, []);

  if (aberto) {
    return (
      <Relatorio
        f={aberto}
        onVoltar={() => setAberto(null)}
        onSalvar={(f) => { setLista(salvarFechamento(f)); setAberto(f); show("Fechamento salvo."); }}
      />
    );
  }

  if (modo === "novo") {
    return (
      <Formulario
        podeGerar={!!input}
        onCancelar={() => setModo("lista")}
        onGerar={(cfg) => {
          if (!input) return;
          const f = montarFechamento(input, cfg);
          setLista(salvarFechamento(f));
          setModo("lista");
          setAberto(f);
          show("Fechamento gerado.");
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted max-w-[80ch]">
          Relatório de análise financeira mensal — DRE em cascata, KPIs e pontos de atenção.
          Edite os textos, exporte em DOCX e mantenha o histórico de fechamentos.
        </p>
        <Button variant="primary" onClick={() => setModo("novo")}>
          <Icon name="plus" size={15} color="currentColor" />
          Novo fechamento
        </Button>
      </div>

      {lista.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-surface-2">
              <Icon name="file-text" size={20} color="var(--color-text-tertiary)" />
            </span>
            <p className="m-0 text-label text-muted">
              Nenhum fechamento gerado ainda. Clique em <b className="text-ink">Novo fechamento</b> para começar.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lista.map((f) => {
            const liquido = f.kpis.find((k) => k.id === "resultado_liquido")?.valor ?? 0;
            return (
              <Card key={f.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-label font-medium text-ink">
                      {MESES[Number(f.mes) - 1]} / {f.ano}
                    </div>
                    <div className="text-caption text-faint">
                      {f.comparativo} meses · emitido em {f.criadoEm.split("-").reverse().join("/")}
                    </div>
                  </div>
                  <button
                    onClick={() => { setLista(removerFechamento(f.id)); show("Fechamento removido."); }}
                    aria-label="Excluir" className="p-1 rounded-md text-muted hover:text-negative hover:bg-surface-2"
                  >
                    <Icon name="trash-2" size={15} color="currentColor" />
                  </button>
                </div>
                <div className={`text-[22px] leading-none font-semibold tabular-nums ${liquido < 0 ? "text-negative" : "text-ink"}`}>
                  <BRL value={liquido} />
                </div>
                <div className="text-caption text-faint">Resultado líquido do mês</div>
                <div className="flex items-center gap-2 mt-1">
                  <Button variant="ghost" onClick={() => setAberto(f)}>Abrir</Button>
                  <span className="ml-auto text-caption text-faint">{f.emitidoPor}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {node}
    </div>
  );
}

/* ------------------------------- formulário ------------------------------- */

function Formulario({
  podeGerar, onCancelar, onGerar,
}: {
  podeGerar: boolean;
  onCancelar: () => void;
  onGerar: (cfg: { mes: string; ano: number; comparativo: 3 | 6 | 12; emitidoPor: string; cargo: string }) => void;
}) {
  const agora = new Date();
  // O mês de referência padrão é o ANTERIOR: fecha-se o mês que terminou, não
  // o que está correndo.
  const anterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const [mes, setMes] = React.useState(String(anterior.getMonth() + 1));
  const [ano, setAno] = React.useState(anterior.getFullYear());
  const [comparativo, setComparativo] = React.useState<3 | 6 | 12>(3);
  const [emitidoPor, setEmitidoPor] = React.useState("");
  const [cargo, setCargo] = React.useState("");

  React.useEffect(() => {
    const c = loadCompany();
    setEmitidoPor(String(c?.db?.representanteNome || c?.pessoal?.nome || ""));
  }, []);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <p className="m-0 text-label text-muted max-w-[80ch]">
        Selecione o mês de referência e o período comparativo. Depois de gerar, você revisa e edita os
        textos do relatório antes de exportar.
      </p>
      <Card className="max-w-[640px] self-center w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-[6px]">
            <label className="text-caption font-medium text-muted">Mês de referência</label>
            <Select value={mes} onChange={setMes}
              options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))} />
          </div>
          <div className="flex flex-col gap-[6px]">
            <label className="text-caption font-medium text-muted">Ano</label>
            <Select value={String(ano)} onChange={(v) => setAno(Number(v))}
              options={ANOS.map((a) => ({ value: String(a), label: String(a) }))} />
          </div>
        </div>
        <div className="flex flex-col gap-[6px] mt-4">
          <label className="text-caption font-medium text-muted">Período comparativo</label>
          <Select
            value={String(comparativo)}
            onChange={(v) => setComparativo(Number(v) as 3 | 6 | 12)}
            options={[
              { value: "3", label: "Últimos 3 meses (trimestre)" },
              { value: "6", label: "Últimos 6 meses (semestre)" },
              { value: "12", label: "Últimos 12 meses (ano)" },
            ]}
          />
          <span className="text-caption text-faint">Define quantos meses aparecem na DRE comparativa do relatório.</span>
        </div>
        <div className="flex flex-col gap-[6px] mt-4">
          <label className="text-caption font-medium text-muted">Emitido por</label>
          <Input value={emitidoPor} onChange={(e) => setEmitidoPor(e.target.value)} placeholder="Nome de quem assina" />
        </div>
        <div className="flex flex-col gap-[6px] mt-4">
          <label className="text-caption font-medium text-muted">Cargo</label>
          <Input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex.: Consultoria financeira" />
        </div>
        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-border-soft">
          <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!podeGerar}
            onClick={() => onGerar({ mes, ano, comparativo, emitidoPor, cargo })}
          >
            Gerar fechamento
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------- relatório -------------------------------- */

function Relatorio({
  f, onVoltar, onSalvar,
}: { f: Fechamento; onVoltar: () => void; onSalvar: (f: Fechamento) => void }) {
  const [textos, setTextos] = React.useState(f.textos);
  const alterado = JSON.stringify(textos) !== JSON.stringify(f.textos);

  const exportar = () => {
    const r = f.relatorio;
    const blocos: BlocoDocx[] = [
      { tipo: "titulo", texto: `Fechamento mensal — ${MESES[Number(f.mes) - 1]}/${f.ano}`, nivel: 1 },
      { tipo: "paragrafo", texto: `Emitido por ${f.emitidoPor || "—"}${f.cargo ? ` · ${f.cargo}` : ""}`, negrito: true },
      { tipo: "titulo", texto: "Resumo do período", nivel: 2 },
      { tipo: "paragrafo", texto: textos.resumo },
      { tipo: "titulo", texto: "Indicadores", nivel: 2 },
      {
        tipo: "tabela",
        cabecalho: ["Indicador", "Valor", "Variação"],
        linhas: f.kpis.map((k) => [
          k.label,
          k.formato === "pct" ? `${pctDeInteiro(k.valor)}` : brl(k.valor),
          k.variacao == null ? "—" : `${k.variacao > 0 ? "+" : ""}${pctDeInteiro(k.variacao)}`,
        ]),
      },
      { tipo: "titulo", texto: "DRE comparativa", nivel: 2 },
      {
        tipo: "tabela",
        cabecalho: ["Linha", ...r.colunas.map(rotuloColuna)],
        linhas: r.linhas.map((l) => [`${l.sinal} ${l.label}`, ...l.celulas.map((c) => brl(c.valor))]),
      },
      { tipo: "titulo", texto: "Destaques", nivel: 2 },
      { tipo: "paragrafo", texto: textos.destaques },
      { tipo: "titulo", texto: "Pontos de atenção", nivel: 2 },
      { tipo: "lista", itens: f.pontos.map((p) => `${p.titulo} — ${p.texto}`) },
      { tipo: "titulo", texto: "Recomendações", nivel: 2 },
      { tipo: "paragrafo", texto: textos.recomendacoes },
    ];
    baixarDOCX(`fechamento-${f.ano}-${String(f.mes).padStart(2, "0")}`, blocos);
  };

  const COR_SEV = { alta: "var(--color-negative)", media: "var(--color-warning)", baixa: "var(--color-positive)" };

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-h3 font-semibold text-ink">
            {MESES[Number(f.mes) - 1]} / {f.ano}
          </div>
          <div className="text-caption text-faint">
            {f.emitidoPor || "—"}{f.cargo ? ` · ${f.cargo}` : ""} · comparativo de {f.comparativo} meses
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onVoltar}>Voltar</Button>
          <Button variant="ghost" disabled={!alterado} onClick={() => onSalvar({ ...f, textos })}>
            <Icon name="check" size={15} color="currentColor" />
            Salvar textos
          </Button>
          <Button variant="primary" onClick={exportar}>
            <Icon name="arrow-down-to-line" size={15} color="currentColor" />
            Exportar DOCX
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {f.kpis.map((k) => (
          <Card key={k.id}>
            <span className="text-[11px] font-medium tracking-[0.08em] text-faint">{k.label}</span>
            <span className={`block mt-2 text-[24px] leading-none font-semibold tabular-nums ${k.valor < 0 ? "text-negative" : "text-ink"}`}>
              {k.formato === "pct" ? `${pctDeInteiro(k.valor)}` : <BRL value={k.valor} />}
            </span>
            {k.variacao != null && (
              <span className={`block mt-2 text-caption tabular-nums ${k.variacao >= 0 ? "text-positive" : "text-negative"}`}>
                {k.variacao > 0 ? "+" : ""}{pctDeInteiro(k.variacao)} vs mês anterior
              </span>
            )}
          </Card>
        ))}
      </div>

      <Card>
        <span className="text-h3 font-semibold text-ink">Pontos de atenção</span>
        <div className="flex flex-col mt-3">
          {f.pontos.map((p) => (
            <div key={p.id} className="flex items-start gap-3 py-3 border-b border-border-soft last:border-0">
              <span className="w-[7px] h-[7px] rounded-pill mt-[7px] shrink-0" style={{ background: COR_SEV[p.severidade] }} />
              <div className="min-w-0">
                <div className="text-label font-medium text-ink">{p.titulo}</div>
                <p className="m-0 text-caption text-muted">{p.texto}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <span className="text-h3 font-semibold text-ink">Textos do relatório</span>
        <p className="m-0 mt-1 text-caption text-faint">
          Redigidos a partir dos números do período. Ajuste antes de exportar — quem assina é você.
        </p>
        <div className="flex flex-col gap-4 mt-4">
          <CampoTexto label="Resumo do período" value={textos.resumo} onChange={(v) => setTextos((s) => ({ ...s, resumo: v }))} />
          <CampoTexto label="Destaques" value={textos.destaques} onChange={(v) => setTextos((s) => ({ ...s, destaques: v }))} />
          <CampoTexto label="Recomendações" value={textos.recomendacoes} onChange={(v) => setTextos((s) => ({ ...s, recomendacoes: v }))} rows={5} />
        </div>
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border-soft">
          <span className="text-h3 font-semibold text-ink">DRE comparativa</span>
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
          <table className="w-full border-collapse text-label">
            <thead>
              <tr className="border-b border-border-soft">
                <th className="px-6 py-3 text-left text-[11px] font-medium tracking-[0.08em] text-faint">Linha</th>
                {f.relatorio.colunas.map((c) => (
                  <th key={c} className="px-4 py-3 text-right text-[11px] font-medium tracking-[0.08em] text-faint">
                    {rotuloColuna(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {f.relatorio.linhas.map((l) => (
                <tr key={l.id} className={`border-b border-border-soft last:border-0 ${l.tipo === "total" ? "bg-surface-2/60" : ""}`}>
                  <td className={`px-6 py-2 ${l.tipo === "total" ? "font-semibold text-ink" : "text-muted"}`}>
                    <span className="text-faint text-caption mr-2">{l.sinal}</span>{l.label}
                  </td>
                  {l.celulas.map((c, k) => (
                    <td key={k} className={`px-4 py-2 text-right tabular-nums ${l.tipo === "total" ? "font-semibold text-ink" : "text-ink"}`}>
                      <BRL value={c.valor} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CampoTexto({
  label, value, onChange, rows = 3,
}: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-caption font-medium text-muted">{label}</label>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} />
    </div>
  );
}
