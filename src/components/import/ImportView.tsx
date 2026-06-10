"use client";

import * as React from "react";
import { Card, Icon, Button, Select } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { analisarImportacao, amostraExtrato, aprender, planoDeOnboarding } from "@/core/fdip";
import { aplicarOnboarding, type ResultadoOnboarding } from "@/lib/fdip";
import type { FDIPReport, Classificacao, FinancialRecord } from "@/core/fdip/types";

const CATEGORIAS = [
  "Vendas", "Fornecedores / insumos", "Folha de pagamento", "Aluguel", "Utilidades",
  "Marketing", "Combustível", "Assinaturas / software", "Impostos", "Tarifas bancárias", "Outras despesas",
];
const FONTES_ATIVAS = ["CSV", "OFX", "Extrato colado", "Excel (CSV)", "TXT"];
const FONTES_ROADMAP = ["Open Finance", "API bancária", "PIX API", "Conta Azul/Omie/Bling", "OCR PDF/NF", "Comprovante (imagem)", "E-mail/WhatsApp"];

const pct = (n: number) => `${Math.round(n * 100)}%`;
const confCor = (c: number) => (c >= 0.9 ? "var(--color-positive)" : c >= 0.7 ? "var(--color-warning)" : "var(--color-negative)");

export function ImportView() {
  const [texto, setTexto] = React.useState("");
  const [report, setReport] = React.useState<FDIPReport | null>(null);
  const [aplicando, setAplicando] = React.useState(false);
  const [resultado, setResultado] = React.useState<ResultadoOnboarding | null>(null);

  const analisar = (t: string) => {
    setResultado(null);
    setReport(t.trim() ? analisarImportacao(t) : null);
  };
  const carregarAmostra = () => {
    const a = amostraExtrato();
    setTexto(a);
    analisar(a);
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const t = await f.text();
    setTexto(t);
    analisar(t);
  };
  const corrigir = (r: FinancialRecord, novaCat: string) => {
    aprender(r.contraparteNorm, novaCat); // self-learning
    analisar(texto); // reprocessa com a confirmação
  };
  const criarEmpresa = async () => {
    if (!report) return;
    setAplicando(true);
    try {
      setResultado(await aplicarOnboarding(planoDeOnboarding(report)));
    } finally {
      setAplicando(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Ingestão */}
      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="upload" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">Ingestão de dados financeiros</span>
        </div>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Cole um extrato (CSV/OFX) — ex.: data;descrição;valor — ou carregue um arquivo / a amostra."
          className="w-full h-28 rounded-md border border-border bg-white p-3 text-caption text-ink font-mono outline-none focus:border-faint resize-y"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => analisar(texto)} disabled={!texto.trim()}>Analisar</Button>
          <Button variant="secondary" onClick={carregarAmostra}>Carregar amostra (12 meses)</Button>
          <label className="text-label font-medium text-ink border border-border rounded-md px-3 py-2 cursor-pointer hover:bg-surface-2">
            Carregar arquivo
            <input type="file" accept=".csv,.ofx,.txt,text/*" onChange={onFile} className="hidden" />
          </label>
          <a
            href="/exemplos/extrato-exemplo-all4pay.csv"
            download
            className="text-label font-medium text-muted hover:text-ink underline ml-auto"
          >
            Baixar CSV de exemplo (12 meses)
          </a>
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          {FONTES_ATIVAS.map((f) => (
            <span key={f} className="text-caption text-positive bg-surface-2 rounded-pill px-2 py-[2px]">{f}</span>
          ))}
          {FONTES_ROADMAP.map((f) => (
            <span key={f} className="text-caption text-faint bg-surface-1 rounded-pill px-2 py-[2px]">{f} (conector)</span>
          ))}
        </div>
      </Card>

      {report && <Resultado report={report} texto={texto} corrigir={corrigir} criarEmpresa={criarEmpresa} aplicando={aplicando} resultado={resultado} />}
    </div>
  );
}

function Resultado({
  report, corrigir, criarEmpresa, aplicando, resultado,
}: {
  report: FDIPReport; texto: string; corrigir: (r: FinancialRecord, c: string) => void;
  criarEmpresa: () => void; aplicando: boolean; resultado: ResultadoOnboarding | null;
}) {
  const { confidence: cc, plano, padroes, entidades, grafo, records, classificacoes } = report;
  const clsMap = new Map(classificacoes.map((c) => [c.recordId, c]));
  const amostra = records.slice(0, 14);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
      {/* Central de confiança */}
      <Card className="lg:col-span-1 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">AI Data Confidence Center</span>
        <div className="flex gap-6">
          <div><div className="text-caption text-faint">Registros</div><div className="text-h2 font-medium tabular-nums text-ink leading-none">{cc.total}</div></div>
          <div><div className="text-caption text-faint">Lidos</div><div className="text-h2 font-medium tabular-nums text-ink leading-none">{cc.lidos}</div></div>
        </div>
        <div className="flex flex-col gap-1">
          <Barra label="Confiança alta" v={cc.alta} total={cc.lidos} cor="var(--color-positive)" />
          <Barra label="Média" v={cc.media} total={cc.lidos} cor="var(--color-warning)" />
          <Barra label="Baixa" v={cc.baixa} total={cc.lidos} cor="var(--color-negative)" />
        </div>
        {cc.pendencias.length > 0 && (
          <div className="flex flex-col gap-1 pt-1 border-t border-border-soft">
            <span className="text-caption font-medium text-faint uppercase tracking-wide">Pendências</span>
            {cc.pendencias.map((p) => (
              <div key={p.tipo} className="flex justify-between text-caption">
                <span className="text-muted">{p.tipo}</span>
                <span className="tabular-nums text-ink">{p.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Descobrimos */}
      <Card className="lg:col-span-2 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
            <Icon name="sparkles" size={14} color="var(--color-ink)" />
          </span>
          <span className="text-label font-medium text-muted">Análise concluída · descobrimos</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
          <Achado n={plano.clientes} label="clientes" />
          <Achado n={plano.fornecedores} label="fornecedores" />
          <Achado n={padroes.recorrencias.length} label="recorrências" />
          <Achado n={padroes.assinaturas.length} label="assinaturas" />
          <Achado n={plano.categorias.length} label="categorias" />
          <Achado n={plano.centrosCusto.length} label="centros de custo" />
          <Achado n={report.periodoMeses} label="meses de histórico" />
          <Achado n={Math.round((cc.alta / Math.max(1, cc.lidos)) * 100)} label="% classificado (alta)" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3 pt-2 border-t border-border-soft">
          <Achado money n={plano.estimativas.receitaMensal} label="receita/mês (est.)" />
          <Achado money n={plano.estimativas.ebitda} label="EBITDA/mês (est.)" tone={plano.estimativas.ebitda < 0 ? "var(--color-negative)" : "var(--color-ink)"} />
          <Achado n={Math.round(plano.estimativas.margemEbitda * 100)} label="margem EBITDA %" />
          <Achado n={Math.round(plano.estimativas.receitaRecorrentePct * 100)} label="receita recorrente %" />
        </div>
        {(plano.oportunidades.length > 0 || plano.riscos.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 pt-1">
            <div>{plano.oportunidades.map((o, i) => <span key={i} className="flex items-start gap-[6px] text-caption text-muted"><span className="w-[6px] h-[6px] rounded-pill bg-positive mt-[6px]" />{o}</span>)}</div>
            <div>{plano.riscos.map((rk, i) => <span key={i} className="flex items-start gap-[6px] text-caption text-muted"><span className="w-[6px] h-[6px] rounded-pill bg-negative mt-[6px]" />{rk}</span>)}</div>
          </div>
        )}
      </Card>

      {/* Smart destination engine */}
      <Card className="lg:col-span-2 flex flex-col gap-2">
        <span className="text-label font-medium text-muted">Destino inteligente · confirme ou corrija</span>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-caption">
            <thead>
              <tr className="text-faint">
                <th className="text-left font-medium py-2 px-2">Lançamento</th>
                <th className="text-right font-medium py-2 px-2">Valor</th>
                <th className="text-left font-medium py-2 px-2">Destino</th>
                <th className="text-left font-medium py-2 px-2 w-[180px]">Categoria</th>
                <th className="text-right font-medium py-2 px-2 w-[70px]">Conf.</th>
              </tr>
            </thead>
            <tbody>
              {amostra.map((r) => {
                const c = clsMap.get(r.id) as Classificacao;
                return (
                  <tr key={r.id} className="border-t border-border-soft">
                    <td className="py-2 px-2"><span className="text-ink truncate block max-w-[220px]">{r.contraparte}</span></td>
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: r.tipo === "entrada" ? "var(--color-positive)" : "var(--color-ink)" }}>
                      {r.tipo === "saida" ? "−" : ""}{formatBRL(r.valor)}
                    </td>
                    <td className="py-2 px-2 text-muted">{c.destino}</td>
                    <td className="py-2 px-2">
                      <Select
                        value={CATEGORIAS.includes(c.categoria) ? c.categoria : "Outras despesas"}
                        onChange={(v) => corrigir(r, v)}
                        options={CATEGORIAS.map((x) => ({ value: x, label: x }))}
                        containerClassName="!gap-0"
                        className="!h-8 !text-caption"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span className="inline-flex items-center gap-1 tabular-nums font-medium" style={{ color: confCor(c.confianca) }}>
                        {c.aprendido && <Icon name="check" size={11} color="var(--color-positive)" />}
                        {pct(c.confianca)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <span className="text-caption text-faint">Ao corrigir uma categoria, o sistema aprende (self-learning): a próxima importação da mesma contraparte sobe para ~99%.</span>
      </Card>

      {/* Padrões + grafo */}
      <Card className="lg:col-span-1 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Padrões descobertos</span>
        <div className="flex flex-col gap-1">
          <span className="text-caption font-medium text-faint uppercase tracking-wide">Recorrências</span>
          {padroes.recorrencias.slice(0, 6).map((rc, i) => (
            <div key={i} className="flex justify-between text-caption">
              <span className="text-ink truncate max-w-[150px]">{rc.contraparte}</span>
              <span className="text-muted tabular-nums">{rc.periodicidade} · {formatBRL(rc.valorMedio)}</span>
            </div>
          ))}
        </div>
        {grafo.topCliente && (
          <div className="pt-1 border-t border-border-soft text-caption text-muted">
            Grafo: {grafo.clientes} clientes · {grafo.fornecedores} fornecedores · topo {grafo.topCliente.nome} ({pct(grafo.topCliente.share)}).
          </div>
        )}
      </Card>

      {/* Auto company setup */}
      <Card className="lg:col-span-3 flex flex-col gap-3">
        <span className="text-label font-medium text-muted">Auto company setup · montar a empresa</span>
        <p className="m-0 text-caption text-muted">
          A partir da análise, o sistema provisiona: {plano.clientes} clientes, {plano.fornecedores} fornecedores,
          {" "}{plano.categorias.length} categorias e {plano.centrosCusto.length} centros de custo ({plano.centrosCusto.join(", ")}),
          {" "}{plano.recorrencias} recorrências, além de DRE/fluxo/KPIs alimentados pelos mesmos dados.
        </p>
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={criarEmpresa} disabled={aplicando}>
            {aplicando ? "Criando…" : "Criar empresa automaticamente"}
          </Button>
          {resultado && (
            <span className="text-caption text-positive">
              {resultado.simulado ? "Pré-visualização (demo): " : "Criado: "}
              {resultado.clientes} clientes · {resultado.fornecedores} fornecedores · {resultado.categorias} categorias · {resultado.centrosCusto} centros.
            </span>
          )}
        </div>
        <span className="text-caption text-faint">
          Em demonstração isto é simulado. Em produção (logado), cria de verdade clientes/fornecedores, categorias e centros de custo na sua organização.
        </span>
      </Card>
    </div>
  );
}

function Barra({ label, v, total, cor }: { label: string; v: number; total: number; cor: string }) {
  const w = total > 0 ? (v / total) * 100 : 0;
  return (
    <div className="flex flex-col gap-[2px]">
      <div className="flex justify-between text-caption"><span className="text-muted">{label}</span><span className="tabular-nums text-ink">{v} ({Math.round(w)}%)</span></div>
      <div className="h-[6px] rounded-pill bg-surface-2 overflow-hidden"><div className="h-full rounded-pill" style={{ width: `${w}%`, background: cor }} /></div>
    </div>
  );
}

function Achado({ n, label, money, tone = "var(--color-ink)" }: { n: number; label: string; money?: boolean; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-h3 font-medium tabular-nums leading-none" style={{ color: tone }}>{money ? formatBRL(n) : n}</span>
      <span className="text-caption text-faint mt-[2px]">{label}</span>
    </div>
  );
}
