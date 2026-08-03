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
import { Card, Button, Icon, InfoHint } from "@/components/ui";
import { analisarImportacao, amostraExtrato, aprender, type FDIPReport } from "@/core/fdip";
import { enriquecerPorCNPJ } from "@/lib/cnae-enrich";
import { listarRegras } from "@/lib/regras";
import { aplicarRegrasNoRelatorio } from "@/lib/regras-aplicar";
import { adicionarRegra } from "@/lib/regras";
import { sugerirRegra, type RegraCategorizacao } from "@/core/regras";
import type { FinancialRecord } from "@/core/fdip/types";
import { aplicarOnboarding, clearImported, type ResultadoOnboarding } from "@/lib/fdip";
import { AcaoDestrutiva } from "@/components/ui/AcaoDestrutiva";
import { hasImported } from "@/lib/imported";
import { lerDocumento } from "@/lib/ocr-ingest";
import { autoCategorizar, iaCategorizadorAtivo } from "@/lib/puzzlebot";
import { RevisaoImportacao } from "./RevisaoImportacao";
import { PrevisaoImportacao } from "./PrevisaoImportacao";
import { prepararIngestao, type LinhaBruta, type LinhaExistente } from "@/core/ingestao";
import { importedMovements } from "@/lib/imported";

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
  const [cnaeBusy, setCnaeBusy] = React.useState(false);
  const [cnaeMsg, setCnaeMsg] = React.useState<string | null>(null);
  const [regraMsg, setRegraMsg] = React.useState<string | null>(null);
  /** Regra proposta a partir da última correção — o ciclo que faz o sistema aprender de verdade. */
  const [sugestao, setSugestao] = React.useState<RegraCategorizacao | null>(null);
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

  /**
   * O PLANO de ingestão — o que a pré-visualização mostra.
   *
   * ⚠️ Ele é derivado do report e do que JÁ ESTÁ na base, e não grava nada.
   * Antes, "Confirmar importação" ia direto para a escrita: não havia como
   * saber, antes de gravar, que metade do arquivo já estava lá.
   */
  const plano = React.useMemo(() => {
    if (!report) return null;
    const cls = new Map(report.classificacoes.map((c) => [c.recordId, c]));
    const linhas: LinhaBruta[] = report.records.map((r) => ({
      idOrigem: r.id,
      contaId: "acc-import",
      data: r.data,
      valor: r.valor,
      tipo: r.tipo === "entrada" ? "entrada" : "saida",
      descritivo: r.descricao || r.contraparte || "",
      contraparte: r.contraparte || null,
      origem: "extrato",
    }));
    const existentes: LinhaExistente[] = (importedMovements() ?? []).map((m) => ({
      id: m.id, chave: m.chave ?? null, account_id: m.account_id,
      paid_date: m.paid_date, due_date: m.due_date, amount: m.amount, type: m.type,
      description: m.description, descritivo_bruto: m.descritivo_bruto, category: m.category,
    }));
    // O aprendizado do FDIP já resolveu parte da classificação — passar adiante
    // evita que a pré-visualização "reaprenda" errado o que o dono confirmou.
    const aprendizado: Record<string, string> = {};
    for (const r of report.records) {
      const c = cls.get(r.id);
      if (c?.aprendido && c.categoria) aprendizado[r.contraparteNorm ?? ""] = c.categoria;
    }
    return prepararIngestao(linhas, existentes, aprendizado, report.entidades.map((e) => e.nome));
  }, [report]);

  const temBaixaConfianca = (rep: FDIPReport) =>
    rep.classificacoes.some((c) => c.categoria !== "Transferência" && c.confianca < 0.9);

  /**
   * CNPJ → CNAE: para os lançamentos que trazem um CNPJ (Pix/TED para empresa),
   * consulta a atividade econômica e pré-categoriza. Roda ANTES da IA porque é
   * determinístico e gratuito — o que ele resolve, a IA não precisa adivinhar.
   * Best-effort: sem rede, o relatório segue como está.
   */
  const rodarCNAE = async (rep: FDIPReport) => {
    setCnaeBusy(true); setCnaeMsg(null);
    try {
      const r = await enriquecerPorCNPJ(rep.records, rep.classificacoes);
      if (r.recategorizados > 0) {
        setReport({ ...rep, classificacoes: r.classificacoes });
        setCnaeMsg(`${r.recategorizados} lançamento(s) categorizados pela atividade (CNAE) de ${r.empresasResolvidas} CNPJ(s).`);
      }
      return r.classificacoes;
    } catch { return rep.classificacoes; }
    finally { setCnaeBusy(false); }
  };

  /**
   * Cascata de classificação, do mais explícito ao mais especulativo:
   *   REGRA do dono → CNPJ/CNAE → Puzzlebot (IA).
   * Cada etapa só recebe o que a anterior não resolveu.
   */
  const analisarEAuto = (t: string) => {
    const rep = analisar(t);
    if (!rep || autoRef.current === t) return;
    autoRef.current = t;
    void (async () => {
      // 1) regras do dono — síncrono, vence tudo
      const regras = listarRegras();
      const rr = aplicarRegrasNoRelatorio(rep.records, rep.classificacoes, regras);
      let atual: FDIPReport = rep;
      if (rr.aplicados > 0) {
        atual = { ...rep, classificacoes: rr.classificacoes };
        setReport(atual);
        setRegraMsg(`${rr.aplicados} lançamento(s) categorizados pelas suas regras (${rr.nomes.slice(0, 3).join(", ")}${rr.nomes.length > 3 ? "…" : ""}).`);
      } else {
        setRegraMsg(null);
      }
      // 2) CNPJ → CNAE
      const cls = await rodarCNAE(atual);
      const pos: FDIPReport = { ...atual, classificacoes: cls };
      // 3) IA, só no que sobrou em dúvida
      if (iaCat && temBaixaConfianca(pos)) await rodarAuto(pos, t);
    })();
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

  /**
   * Corrigir uma categoria faz duas coisas: memoriza a contraparte EXATA
   * (comportamento antigo) e PROPÕE a regra por padrão, que é o que pega as
   * próximas variações do mesmo fornecedor. A regra só entra se o dono aceitar.
   */
  const corrigir = (r: FinancialRecord, novaCat: string) => {
    aprender(r.contraparteNorm, novaCat);
    const s = sugerirRegra(
      { id: r.id, tipo: r.tipo === "entrada" ? "entrada" : "saida", valor: r.valor, descricao: r.descricao, contraparte: r.contraparte || r.contraparteNorm },
      novaCat,
    );
    setSugestao(s);
    analisar(texto);
  };

  const aceitarSugestao = () => {
    if (!sugestao) return;
    adicionarRegra(sugestao);
    setSugestao(null);
    setRegraMsg(`Regra criada: ${sugestao.nome}. Vale para os próximos extratos.`);
    analisarEAuto(texto); // reaplica já com a regra nova
  };

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
  /**
   * ⚠️ Devolve o DESFAZER. Apagar o dataset é a ação mais destrutiva da tela —
   * são meses de importação — e ela ficava a um clique, sem pergunta e sem
   * volta. Ver `AcaoDestrutiva`.
   */
  const limpar = async () => {
    const desfazer = clearImported();
    setImportado(false); setResultado(null); setReport(null); setTexto("");
    await qc.invalidateQueries();
    return async () => {
      desfazer();
      setImportado(true);
      await qc.invalidateQueries();
    };
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Importar (lote ou individual) */}
      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="upload" size={16} color="var(--color-text-secondary)" />
          <span className="text-label font-medium text-muted">Importar — extrato em lote (CSV/OFX) ou documento individual</span>
          <InfoHint
            align="left"
            titulo="Importar dados"
            oQue="Traz seus lançamentos para o sistema a partir de um extrato ou de um documento, sem digitar tudo à mão."
            comoCalcula="Extratos CSV/OFX e documentos (via OCR) passam pelo FDIP, que classifica cada linha, resolve clientes/fornecedores e detecta recorrências para você revisar."
          />
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
          <AcaoDestrutiva
            rotulo="Limpar dados importados"
            titulo="Limpar dados importados"
            descricao="Todos os lançamentos, contas e contatos que vieram das importações serão removidos, e o sistema volta a mostrar os dados de demonstração."
            confirmarRotulo="Limpar tudo"
            onConfirmar={limpar}
          />
        </Card>
      )}

      {/* Correção → regra: fecha o ciclo de aprendizado (o motor já sugeriu). */}
      {sugestao && (
        <Card className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <Icon name="workflow" size={18} color="var(--color-text-secondary)" className="mt-[2px] shrink-0" />
            <p className="m-0 text-label text-ink">
              Quer que isso valha sempre? Toda {sugestao.quando.tipo === "entrada" ? "entrada" : "saída"} com{" "}
              <b>{sugestao.quando.contraparte?.valor}</b> vira <b>{sugestao.entao.categoria}</b>.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="primary" onClick={aceitarSugestao}>Criar regra</Button>
            <Button variant="ghost" onClick={() => setSugestao(null)}>Agora não</Button>
          </div>
        </Card>
      )}

      {/* PRÉ-VISUALIZAÇÃO — o que vai entrar, antes de entrar. */}
      {report && plano && !resultado && (
        <PrevisaoImportacao plano={plano} onConfirmar={confirmar} aplicando={aplicando} />
      )}

      {/* Revisão detalhada (entidades, padrões, custos recorrentes) */}
      {report && (
        <RevisaoImportacao
          report={report} onCorrigir={corrigir} onConfirmar={confirmar} aplicando={aplicando} resultado={resultado}
          onAuto={iaCat ? autoCat : undefined} autoBusy={catBusy || cnaeBusy}
          catMsg={[regraMsg, cnaeBusy ? "Consultando a atividade (CNAE) dos CNPJs…" : cnaeMsg, catMsg].filter(Boolean).join(" ") || null}
        />
      )}
      {report && (resultado || importado) && (
        <button onClick={limpar} className="text-caption font-medium text-muted hover:text-ink underline self-start">Limpar e recomeçar</button>
      )}
    </div>
  );
}
