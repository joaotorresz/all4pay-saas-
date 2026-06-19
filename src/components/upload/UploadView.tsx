"use client";

/**
 * Upload de dados — importação (lote ou individual) → leitura inteligente →
 * confirmação no estilo do Open Finance. Aceita extratos CSV/OFX/TXT, texto
 * colado e documentos (boleto/comprovante/nota via OCR). Tudo é normalizado e
 * passa pelo FDIP, que classifica, resolve fornecedores/clientes e detecta
 * pagamentos recorrentes/mensais — depois é só revisar e confirmar.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Button, Icon } from "@/components/ui";
import { analisarImportacao, amostraExtrato, aprender, type FDIPReport } from "@/core/fdip";
import type { FinancialRecord } from "@/core/fdip/types";
import { aplicarOnboarding, clearImported, type ResultadoOnboarding } from "@/lib/fdip";
import { hasImported } from "@/lib/imported";
import { lerDocumento } from "@/lib/ocr-ingest";
import { autoCategorizar, iaCategorizadorAtivo } from "@/lib/puzzlebot";
import { RevisaoImportacao } from "./RevisaoImportacao";

const isText = (f: File) => /\.(csv|ofx|txt)$/i.test(f.name) || /text\//.test(f.type);
const hoje = () => new Date().toISOString().slice(0, 10);

/** Documento (boleto/nota/comprovante) → 1 linha de extrato para o FDIP. */
function docParaLinha(f: { vencimento: string | null; beneficiario: string | null; acao: string | null; valor: number | null; acaoTipo: string | null }): string | null {
  if (f.valor == null) return null;
  const saida = /pag/i.test(f.acaoTipo ?? "");
  const desc = (f.beneficiario || f.acao || "Documento").replace(/;/g, " ");
  return `${f.vencimento || hoje()};${desc};${saida ? "-" : ""}${f.valor}`;
}

export function UploadView() {
  const qc = useQueryClient();
  const [texto, setTexto] = React.useState("");
  const [report, setReport] = React.useState<FDIPReport | null>(null);
  const [aplicando, setAplicando] = React.useState(false);
  const [resultado, setResultado] = React.useState<ResultadoOnboarding | null>(null);
  const [importado, setImportado] = React.useState(false);
  const [lendo, setLendo] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [drag, setDrag] = React.useState(false);
  const [iaCat, setIaCat] = React.useState(false);
  const [catBusy, setCatBusy] = React.useState(false);
  const [catMsg, setCatMsg] = React.useState<string | null>(null);
  const autoRef = React.useRef<string>(""); // texto já auto-categorizado (anti-loop)

  React.useEffect(() => { setImportado(hasImported()); }, []);
  React.useEffect(() => { iaCategorizadorAtivo().then(setIaCat).catch(() => setIaCat(false)); }, []);

  const analisar = (t: string): FDIPReport | null => {
    setResultado(null);
    const rep = t.trim() ? analisarImportacao(t) : null;
    setReport(rep);
    return rep;
  };

  // Puzzlebot: a IA recategoriza os lançamentos de baixa confiança e MEMORIZA;
  // re-analisar reflete o aprendizado (a confiança sobe).
  const rodarAuto = async (rep: FDIPReport, t: string) => {
    setCatBusy(true); setCatMsg(null);
    try {
      const r = await autoCategorizar(rep);
      if (r.aplicados > 0) setReport(analisarImportacao(t)); // reflete o aprendizado
      setCatMsg(r.aplicados > 0 ? `IA recategorizou ${r.aplicados} de ${r.revisados} lançamento(s) de baixa confiança.` : null);
    } catch (e) { setCatMsg(`Falha na categorização por IA: ${(e as Error).message}`); }
    finally { setCatBusy(false); }
  };
  const autoCat = () => { if (report) void rodarAuto(report, texto); }; // re-disparo manual

  const temBaixaConfianca = (rep: FDIPReport) =>
    rep.classificacoes.some((c) => c.categoria !== "Transferência" && c.confianca < 0.9);

  // Analisa e, com chave, dispara o Puzzlebot UMA vez por texto (automático).
  const analisarEAuto = (t: string) => {
    const rep = analisar(t);
    if (rep && iaCat && autoRef.current !== t && temBaixaConfianca(rep)) {
      autoRef.current = t;
      void rodarAuto(rep, t);
    }
  };

  const carregarAmostra = () => { const a = amostraExtrato(); setTexto(a); analisarEAuto(a); };

  /** Lê N arquivos (lote ou individual): texto vai direto; documento passa por OCR. */
  const lerArquivos = async (files: FileList | File[]) => {
    setErro(null); setLendo(true);
    try {
      const linhas: string[] = texto.trim() ? [texto.trim()] : [];
      for (const f of Array.from(files)) {
        if (isText(f)) {
          linhas.push((await f.text()).trim());
        } else {
          const r = await lerDocumento(f, true); // imagem/PDF → OCR (IA ou local)
          if (r.kind === "doc") {
            const l = docParaLinha(r.fields);
            if (l) linhas.push(l); else setErro("Não consegui ler o valor de um documento.");
          } else if (r.kind === "erro") {
            setErro(r.motivo);
          }
        }
      }
      const combinado = linhas.filter(Boolean).join("\n");
      setTexto(combinado);
      analisarEAuto(combinado);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
    } finally {
      setLendo(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.length) lerArquivos(e.target.files); };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) lerArquivos(e.dataTransfer.files); };

  const corrigir = (r: FinancialRecord, novaCat: string) => { aprender(r.contraparteNorm, novaCat); analisar(texto); };

  const confirmar = async () => {
    if (!report) return;
    setAplicando(true);
    try {
      const res = await aplicarOnboarding(report);
      setResultado(res);
      setImportado(true);
      await qc.invalidateQueries();
    } finally {
      setAplicando(false);
    }
  };
  const limpar = async () => { clearImported(); setImportado(false); setResultado(null); setReport(null); setTexto(""); await qc.invalidateQueries(); };

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Importar (lote ou individual) */}
      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="upload" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">Importar — extrato em lote (CSV/OFX) ou documento individual</span>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={`rounded-md border border-dashed p-6 text-center transition-colors ${drag ? "border-lime bg-lime-tint" : "border-border bg-surface-1"}`}
        >
          <Icon name="upload" size={22} color="var(--color-text-secondary)" />
          <div className="text-label font-medium text-ink mt-2">Arraste arquivos aqui</div>
          <div className="text-caption text-faint">CSV · OFX · TXT (extrato em lote) ou PNG · JPG · PDF (boleto, comprovante, nota — lidos por OCR)</div>
          <label className="inline-block mt-3 text-label font-medium text-ink border border-border rounded-md px-3 py-2 cursor-pointer hover:bg-surface-2 bg-white">
            {lendo ? "Lendo…" : "Escolher arquivos"}
            <input type="file" multiple accept=".csv,.ofx,.txt,text/*,image/*,application/pdf" onChange={onFile} className="hidden" />
          </label>
        </div>

        <details className="text-caption">
          <summary className="text-muted cursor-pointer">ou colar um extrato / usar amostra</summary>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Cole um extrato (CSV/OFX) — ex.: data;descrição;valor"
            className="w-full h-24 mt-2 rounded-md border border-border bg-white p-3 text-caption text-ink font-mono outline-none focus:border-faint resize-y"
          />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Button variant="primary" onClick={() => analisarEAuto(texto)} disabled={!texto.trim()}>Analisar</Button>
            <Button variant="secondary" onClick={carregarAmostra}>Carregar amostra (12 meses)</Button>
            <a href="/exemplos/extrato-exemplo-all4pay.csv" download className="text-label font-medium text-muted hover:text-ink underline ml-auto">Baixar CSV de exemplo</a>
          </div>
        </details>
        {erro && <span className="text-caption text-negative">{erro}</span>}
      </Card>

      {importado && !report && (
        <Card className="flex items-center gap-3 border-l-4" style={{ borderLeftColor: "var(--color-lime)" }}>
          <Icon name="check" size={16} color="var(--color-positive)" />
          <span className="text-caption text-ink flex-1">Dados importados ativos — alimentando dashboard, DRE, risco, inteligência e todo o ERP.</span>
          <button onClick={limpar} className="text-caption font-medium text-muted hover:text-ink underline">Limpar dados importados</button>
        </Card>
      )}

      {/* Confirmação (estilo Open Finance) */}
      {report && (
        <RevisaoImportacao
          report={report} onCorrigir={corrigir} onConfirmar={confirmar} aplicando={aplicando} resultado={resultado}
          onAuto={iaCat ? autoCat : undefined} autoBusy={catBusy} catMsg={catMsg}
        />
      )}
      {report && (resultado || importado) && (
        <button onClick={limpar} className="text-caption font-medium text-muted hover:text-ink underline self-start">Limpar e recomeçar</button>
      )}
    </div>
  );
}
