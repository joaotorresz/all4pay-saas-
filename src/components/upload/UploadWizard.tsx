"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Button, Icon, BRL, Select, CurrencyInput, DateField } from "@/components/ui";
import { listParties } from "@/lib/cadastros";
import { getOpenMovements, getRiscoInput } from "@/lib/data";
import { aplicarOnboarding } from "@/lib/fdip";
import { lerDocumento, ocrConfigurado, type LeituraDocumento } from "@/lib/ocr-ingest";
import { analisarDocumento, confirmarDocumento, ACAO_MAP, type AnaliseDocumento, type AcaoFinal } from "@/lib/upload-doc";
import type { Party, Movement } from "@/lib/types";
import type { FDIPReport } from "@/core/fdip/types";

const CATEGORIAS = [
  "Vendas", "Serviços", "Fornecedores / insumos", "Folha de pagamento", "Aluguel",
  "Utilidades", "Marketing", "Combustível", "Assinaturas / software", "Impostos",
  "Tarifas bancárias", "Outras despesas",
];

type Etapa = 1 | 2 | 3 | 4; // 4 = concluído

/**
 * Wizard de upload da home (não navega — abre aqui). 3 etapas:
 *  1) arrastar/escolher o documento;
 *  2) leitura inteligente (OCR → ação, valor, vencimento, cross-check do
 *     beneficiário contra os Contatos, baixa de agendados, ideias);
 *  3) confirmação dos campos → grava no sistema (reflete em todo o dashboard).
 * Abre pelo evento `a4p:open-upload`.
 */
export function UploadWizard() {
  const qc = useQueryClient();
  const [aberto, setAberto] = React.useState(false);
  const [etapa, setEtapa] = React.useState<Etapa>(1);
  const [drag, setDrag] = React.useState(false);
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [lendo, setLendo] = React.useState(false);
  const [leitura, setLeitura] = React.useState<LeituraDocumento | null>(null);
  const [analise, setAnalise] = React.useState<AnaliseDocumento | null>(null);
  const [ocrOn, setOcrOn] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Edições da confirmação
  const [criarContato, setCriarContato] = React.useState(true);
  const [categoria, setCategoria] = React.useState("");
  const [valor, setValor] = React.useState(0);
  const [venc, setVenc] = React.useState("");
  const [acao, setAcao] = React.useState<AcaoFinal>("Vou pagar");
  const [gravando, setGravando] = React.useState(false);
  const [resultado, setResultado] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onOpen = () => { reset(); setAberto(true); ocrConfigurado().then(setOcrOn); };
    window.addEventListener("a4p:open-upload", onOpen);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("a4p:open-upload", onOpen); window.removeEventListener("keydown", onKey); };
  }, []);

  const reset = () => {
    setEtapa(1); setArquivo(null); setLeitura(null); setAnalise(null);
    setCriarContato(true); setCategoria(""); setValor(0); setVenc(""); setResultado(null);
  };

  const ingerir = async (file: File) => {
    setArquivo(file); setEtapa(2); setLendo(true); setLeitura(null); setAnalise(null);
    try {
      const res = await lerDocumento(file, ocrOn);
      setLeitura(res);
      if (res.kind === "doc") {
        const [parties, aPagar, aReceber, risco] = await Promise.all([
          listParties().catch(() => [] as Party[]),
          getOpenMovements("saida").catch(() => [] as Movement[]),
          getOpenMovements("entrada").catch(() => [] as Movement[]),
          getRiscoInput().catch(() => null),
        ]);
        const an = analisarDocumento(res.fields, parties, [...aPagar, ...aReceber], risco?.movements ?? []);
        setAnalise(an);
        setCategoria(an.fields.categoria ?? "");
        setValor(an.fields.valor ?? 0);
        setVenc(an.fields.vencimento ?? an.fields.data ?? "");
        setCriarContato(an.sugerirCadastro);
        setAcao(an.acaoFinal === "Transferência" ? "Vou pagar" : an.acaoFinal);
      }
    } finally {
      setLendo(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) ingerir(f);
  };

  const confirmarDoc = async () => {
    if (!analise) return;
    setGravando(true);
    try {
      const r = await confirmarDocumento({ analise, criarContato, categoria, valor, vencimento: venc, acaoOverride: acao });
      await qc.invalidateQueries();
      const tipo = ACAO_MAP[acao as Exclude<AcaoFinal, "Transferência">]?.tipoMov ?? analise.tipoMov;
      const partes: string[] = [];
      if (r.baixa) partes.push("baixa no agendamento");
      else if (r.movimento) partes.push(tipo === "entrada" ? "lançamento a receber" : "lançamento a pagar");
      if (r.contatoCriado) partes.push("contato cadastrado");
      setResultado(partes.length ? `Pronto — ${partes.join(" · ")}. Refletido em todo o sistema.` : "Pronto — refletido em todo o sistema.");
      setEtapa(4);
    } finally {
      setGravando(false);
    }
  };

  const confirmarLote = async (report: FDIPReport) => {
    setGravando(true);
    try {
      const res = await aplicarOnboarding(report);
      await qc.invalidateQueries();
      setResultado(`Pronto — ${res.movimentos} lançamentos, ${res.clientes} clientes, ${res.fornecedores} fornecedores. Refletido em todo o sistema.`);
      setEtapa(4);
    } finally {
      setGravando(false);
    }
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-start justify-center z-[80] p-6 overflow-y-auto" onClick={() => setAberto(false)}>
      <div className="w-[620px] max-w-full my-auto" onClick={(e) => e.stopPropagation()}>
        <Card padded={false} className="flex flex-col max-h-[90vh]">
          {/* Header + passos */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-soft">
            <div className="flex items-center gap-2">
              <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
                <Icon name="upload" size={14} color="var(--color-on-lime)" />
              </span>
              <span className="text-h3 font-medium text-ink">Upload de dados</span>
            </div>
            <button className="inline-flex p-[2px]" onClick={() => setAberto(false)} aria-label="Fechar">
              <Icon name="x" size={18} color="var(--color-text-secondary)" />
            </button>
          </div>
          <Passos etapa={etapa} />

          <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
            {/* ETAPA 1 — arrastar */}
            {etapa === 1 && (
              <>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={onDrop}
                  onClick={() => inputRef.current?.click()}
                  className={`rounded-card border border-dashed p-8 text-center cursor-pointer transition-colors ${drag ? "border-lime bg-lime-tint" : "border-border hover:border-ink/30"}`}
                >
                  <Icon name="upload" size={26} color="var(--color-text-secondary)" />
                  <p className="m-0 mt-3 text-body text-ink">Arraste o documento aqui ou clique para enviar</p>
                  <p className="m-0 mt-1 text-caption text-faint leading-[1.5]">
                    Boletos, comprovantes, notas, faturas (PNG · JPG · PDF) — a IA lê valor, vencimento,
                    beneficiário e a ação. Extratos OFX/CSV entram em lote.
                  </p>
                  <input ref={inputRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.pdf,.ofx,.csv,.txt,image/*" onChange={(e) => e.target.files?.[0] && ingerir(e.target.files[0])} />
                </div>
                <div className="flex items-start gap-2 rounded-md p-3" style={{ background: "var(--color-surface-2)" }}>
                  <Icon name="sparkles" size={15} color="var(--color-text-secondary)" className="mt-[2px]" />
                  <span className="text-caption text-muted leading-[1.5]">
                    Leitura inteligente: agenda o pagamento pela data de vencimento, dá baixa quando o comprovante
                    casa com algo já agendado e sugere cadastrar o beneficiário novo. {ocrOn ? "OCR por IA (Claude) ativo." : "OCR local (sem chave) ativo."}
                  </span>
                </div>
              </>
            )}

            {/* ETAPA 2 — leitura inteligente */}
            {etapa === 2 && (
              <>
                {lendo && (
                  <div className="flex flex-col items-center gap-2 py-10">
                    <Icon name="sparkles" size={22} color="var(--color-text-secondary)" />
                    <span className="text-body text-ink">Lendo o documento…</span>
                    <span className="text-caption text-faint">{arquivo?.name}</span>
                  </div>
                )}
                {!lendo && leitura?.kind === "erro" && (
                  <div className="flex flex-col gap-2 py-6 text-center">
                    <span className="text-body text-ink">Não consegui ler automaticamente</span>
                    <span className="text-caption text-faint">{leitura.motivo}</span>
                  </div>
                )}
                {!lendo && leitura?.kind === "bulk" && (
                  <BulkResumo report={leitura.report} />
                )}
                {!lendo && analise && <LeituraInteligente a={analise} modo={leitura?.kind === "doc" ? leitura.modo : "local"} />}
              </>
            )}

            {/* ETAPA 3 — confirmação */}
            {etapa === 3 && analise && (
              <Confirmacao
                a={analise}
                acao={acao} setAcao={setAcao}
                categoria={categoria} setCategoria={setCategoria}
                valor={valor} setValor={setValor}
                venc={venc} setVenc={setVenc}
                criarContato={criarContato} setCriarContato={setCriarContato}
              />
            )}

            {/* ETAPA 4 — concluído */}
            {etapa === 4 && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="w-12 h-12 rounded-pill bg-lime inline-flex items-center justify-center">
                  <Icon name="check" size={22} color="var(--color-on-lime)" />
                </span>
                <span className="text-h3 font-medium text-ink">Dados inseridos no sistema</span>
                <span className="text-caption text-muted max-w-[48ch] leading-[1.5]">{resultado}</span>
              </div>
            )}
          </div>

          {/* Footer dinâmico por etapa */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border-soft">
            {etapa === 1 && <span className="text-caption text-faint">Etapa 1 de 3 · enviar documento</span>}
            {etapa === 2 && (
              <>
                <Button variant="ghost" onClick={reset}>Trocar documento</Button>
                {leitura?.kind === "doc" && analise ? (
                  <Button variant="primary" onClick={() => setEtapa(3)} disabled={lendo}>Confirmar dados</Button>
                ) : leitura?.kind === "bulk" ? (
                  <Button variant="primary" onClick={() => confirmarLote(leitura.report)} disabled={gravando}>
                    {gravando ? "Inserindo…" : "Inserir lançamentos"}
                  </Button>
                ) : <span />}
              </>
            )}
            {etapa === 3 && (
              <>
                <Button variant="ghost" onClick={() => setEtapa(2)}>Voltar</Button>
                <Button variant="primary" onClick={confirmarDoc} disabled={gravando || valor <= 0}>
                  {gravando ? "Inserindo…" : "Confirmar e inserir"}
                </Button>
              </>
            )}
            {etapa === 4 && (
              <>
                <Button variant="ghost" onClick={() => { reset(); }}>Enviar outro</Button>
                <Button variant="primary" onClick={() => setAberto(false)}>Fechar</Button>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Passos({ etapa }: { etapa: Etapa }) {
  const labels = ["Enviar", "Leitura inteligente", "Confirmar"];
  const atual = Math.min(etapa, 3);
  return (
    <div className="flex items-center gap-2 px-6 py-3 border-b border-border-soft">
      {labels.map((l, i) => {
        const n = i + 1;
        const feito = atual > n;
        const ativo = atual === n;
        return (
          <React.Fragment key={l}>
            <div className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-pill inline-flex items-center justify-center text-[12px] tabular-nums ${ativo ? "bg-lime text-on-lime" : feito ? "bg-surface-3 text-ink font-semibold" : "bg-surface-2 text-faint"}`}>
                {feito ? "✓" : n}
              </span>
              <span className={`text-caption ${ativo ? "text-ink font-medium" : "text-faint"}`}>{l}</span>
            </div>
            {n < labels.length && <span className="flex-1 h-px bg-border-soft" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

const ACAO_COR: Record<string, string> = {
  "Vou pagar": "var(--color-warning)",
  "Vou receber": "var(--color-positive)",
  "Paguei": "var(--color-muted)",
  "Recebi": "var(--color-positive)",
  "Transferência": "var(--color-muted)",
};

function LeituraInteligente({ a, modo }: { a: AnaliseDocumento; modo: "ia" | "local" }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-label font-medium" style={{ color: "var(--color-on-lime)", background: ACAO_COR[a.acaoFinal] }}>
          {a.acaoFinal}
        </span>
        <span className="text-caption text-faint">
          {a.fields.tipo} · lido por {modo === "ia" ? "IA (Claude)" : "OCR local"} · confiança {Math.round(a.confianca * 100)}%
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
        <Campo label="Valor" node={a.fields.valor ? <BRL value={a.fields.valor} /> : <span className="text-faint">—</span>} />
        <Campo label={a.pago ? "Data" : "Vencimento"} node={<span className="text-ink">{a.fields.vencimento || a.fields.data || "—"}</span>} />
        <Campo label="Beneficiário" node={<span className="text-ink">{a.contraparte || "—"}</span>} />
        {a.fields.categoria && <Campo label="Categoria" node={<span className="text-ink">{a.fields.categoria}</span>} />}
        {(a.fields.cnpj || a.fields.cpf) && <Campo label={a.fields.cnpj ? "CNPJ" : "CPF"} node={<span className="text-ink">{a.fields.cnpj || a.fields.cpf}</span>} />}
      </div>

      {/* Cross-check */}
      <div className="rounded-md p-3 flex flex-col gap-2" style={{ background: "var(--color-surface-2)" }}>
        <span className="inline-flex items-center gap-2 text-caption font-medium text-muted">
          <Icon name="sparkles" size={14} color="var(--color-text-secondary)" /> Cross-check de dados
        </span>
        {a.crossCheck.length ? a.crossCheck.map((c, i) => (
          <span key={i} className="flex items-start gap-[6px] text-caption text-muted leading-[1.5]">
            <span className="w-[6px] h-[6px] rounded-pill bg-positive mt-[6px] shrink-0" />{c}
          </span>
        )) : <span className="text-caption text-faint">Sem correspondências — revise os campos.</span>}
      </div>

      {/* Beneficiário novo */}
      {a.sugerirCadastro && (
        <div className="flex items-center gap-2 rounded-md p-3 border border-dashed border-border">
          <Icon name="plus" size={15} color="var(--color-text-secondary)" />
          <span className="text-caption text-muted flex-1"><b className="text-ink font-medium">{a.contraparte}</b> ainda não está em Contatos. Você poderá cadastrar na próxima etapa.</span>
        </div>
      )}

      {/* Ideias */}
      {a.ideias.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-caption font-medium text-faint tracking-wide">Ideias</span>
          {a.ideias.map((i, k) => (
            <span key={k} className="flex items-start gap-[6px] text-caption text-muted leading-[1.5]">
              <Icon name="sparkles" size={12} color="var(--color-text-tertiary)" className="mt-[3px]" />{i}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Confirmacao({
  a, acao, setAcao, categoria, setCategoria, valor, setValor, venc, setVenc, criarContato, setCriarContato,
}: {
  a: AnaliseDocumento;
  acao: AcaoFinal; setAcao: (v: AcaoFinal) => void;
  categoria: string; setCategoria: (v: string) => void;
  valor: number; setValor: (v: number) => void;
  venc: string; setVenc: (v: string) => void;
  criarContato: boolean; setCriarContato: (v: boolean) => void;
}) {
  const sel = ACAO_MAP[acao as Exclude<AcaoFinal, "Transferência">] ?? { tipoMov: "saida", pago: false };
  const corrigido = acao !== a.acaoFinal;
  const baixaValida = !!a.baixaDe && sel.pago && sel.tipoMov === a.tipoMov && a.pago;
  return (
    <div className="flex flex-col gap-4">
      <span className="text-label font-medium text-muted">Confirme os dados extraídos</span>

      {/* Ação — corrija se a leitura veio errada */}
      <div className="flex flex-col gap-[6px]">
        <span className="text-label font-medium text-muted">Ação {corrigido && <span className="text-caption text-warning">· corrigido</span>}</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(["Vou pagar", "Vou receber", "Paguei", "Recebi"] as AcaoFinal[]).map((op) => {
            const on = acao === op;
            return (
              <button
                key={op}
                onClick={() => setAcao(op)}
                className={`rounded-md border px-3 py-2 text-left text-caption transition-colors ${on ? "border-ink bg-surface-2 text-ink font-medium" : "border-border text-muted hover:border-ink/30"}`}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-pill" style={{ background: ACAO_COR[op] }} />
                  {op}
                </span>
              </button>
            );
          })}
        </div>
        <span className="text-caption text-faint">
          {sel.pago ? "Já realizado — entra como pago/baixado." : "Ainda vai acontecer — entra como pendente, agendado pelo vencimento."}
        </span>
      </div>

      <CurrencyInput label="Valor" value={valor} onValueChange={setValor} />
      <DateField label={sel.pago ? "Data" : "Vencimento"} value={venc} onChange={setVenc} />
      <Select
        label="Categoria"
        value={CATEGORIAS.includes(categoria) ? categoria : ""}
        onChange={setCategoria}
        options={[{ value: "", label: "Selecione…" }, ...CATEGORIAS.map((c) => ({ value: c, label: c }))]}
      />

      <div className="rounded-md p-3 flex flex-col gap-2" style={{ background: "var(--color-surface-2)" }}>
        <span className="text-caption text-muted">Beneficiário</span>
        <span className="text-body text-ink">{a.contraparte || "—"}</span>
        {a.contato ? (
          <span className="inline-flex items-center gap-1 text-caption text-positive"><Icon name="check" size={12} color="var(--color-positive)" /> já cadastrado em Contatos</span>
        ) : a.sugerirCadastro ? (
          <label className="inline-flex items-center gap-2 cursor-pointer mt-1">
            <input type="checkbox" checked={criarContato} onChange={(e) => setCriarContato(e.target.checked)} className="accent-lime" />
            <span className="text-caption text-ink">Cadastrar <b className="font-medium">{a.contraparte}</b> como {sel.tipoMov === "entrada" ? "cliente" : "fornecedor"}</span>
          </label>
        ) : null}
      </div>

      {baixaValida && (
        <div className="flex items-start gap-2 rounded-md p-3 border-l-4" style={{ borderLeftColor: "var(--color-positive)", background: "var(--color-surface-2)" }}>
          <Icon name="check" size={15} color="var(--color-positive)" className="mt-[2px]" />
          <span className="text-caption text-muted">Em vez de criar um novo lançamento, vamos <b className="text-ink font-medium">dar baixa</b> no agendamento correspondente (evita duplicar).</span>
        </div>
      )}

      <span className="text-caption text-faint leading-[1.5]">
        Ao confirmar, o lançamento entra no sistema e passa a aparecer no dashboard, no fluxo de caixa, na DRE,
        no risco e na página Upload de dados — com o cross-check já feito.
      </span>
    </div>
  );
}

function BulkResumo({ report }: { report: FDIPReport }) {
  const { plano, confidence: cc } = report;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon name="sparkles" size={15} color="var(--color-text-secondary)" />
        <span className="text-label font-medium text-muted">Extrato lido · {cc.lidos} de {cc.total} lançamentos</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
        <Mini n={plano.clientes} label="clientes" />
        <Mini n={plano.fornecedores} label="fornecedores" />
        <Mini n={plano.categorias.length} label="categorias" />
        <Mini n={plano.centrosCusto.length} label="centros" />
      </div>
      <span className="text-caption text-faint leading-[1.5]">
        Inserir cria clientes/fornecedores, categorias e os lançamentos — alimentando todo o sistema.
        Para revisar lançamento a lançamento, use a página Upload de dados.
      </span>
    </div>
  );
}

function Campo({ label, node }: { label: string; node: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[15px] tabular-nums">{node}</span>
    </div>
  );
}
function Mini({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-h3 font-medium tabular-nums text-ink leading-none">{n}</span>
      <span className="text-caption text-faint mt-[2px]">{label}</span>
    </div>
  );
}
