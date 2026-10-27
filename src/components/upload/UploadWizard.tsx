"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Icon, BRL, Select, CurrencyInput, DateField } from "@/components/ui";
import { listParties } from "@/lib/cadastros";
import { getOpenMovements, getRiscoInput } from "@/lib/data";
import { aplicarOnboarding } from "@/lib/fdip";
import { lerDocumento, ocrConfigurado, type EtapaLeitura, type LeituraDocumento, type LeituraIA } from "@/lib/ocr-ingest";
import { estacionarOCR } from "@/lib/caixa-entrada";
import { analisarDocumento, confirmarDocumento, ACAO_MAP, type AnaliseDocumento, type AcaoFinal } from "@/lib/upload-doc";
import type { Party, Movement } from "@/lib/types";
import type { FDIPReport } from "@/core/fdip/types";
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA } from "@/core/fdip/assistente";

type Etapa = 1 | 2 | 3 | 4; // 4 = concluído

const PASSOS = ["Enviar", "Leitura", "Confirmar"] as const;

const TITULOS: Record<Etapa, string> = {
  1: "Envie um documento",
  2: "O que eu li",
  3: "Confira antes de gravar",
  4: "Pronto",
};

const LE = ["Boleto", "Nota fiscal", "Comprovante", "Extrato em PDF", "Fatura do cartão", "OFX e CSV"];

/** CNPJ e CPF como se leem no papel; o que não tiver 11 ou 14 dígitos fica como veio. */
const documentoFormatado = (d: string) => {
  const n = d.replace(/\D/g, "");
  if (n.length === 14) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
  if (n.length === 11) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
  return d;
};

const dataCurta = (iso?: string | null) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

/**
 * Leitura de um documento (não navega — abre por cima da tela). 3 etapas:
 *  1) arrastar/escolher o documento;
 *  2) leitura inteligente (OCR → ação, valor, vencimento, cross-check do
 *     beneficiário contra os Contatos, baixa de agendados, ideias) — ou, num
 *     extrato/fatura, a leitura em lote, com a IA lendo página a página;
 *  3) confirmação dos campos → grava no sistema (reflete em todo o dashboard).
 * Abre pelo evento `a4p:open-upload`.
 *
 * ⚠️ Portal no `<body>` com a raiz `ds-visor`: fora dela os papéis do DS
 * (título em Agrandir, valor-herói) não alcançam a janela, e dentro de um
 * `Card` o `position: fixed` ficaria preso ao card.
 */
export function UploadWizard() {
  const qc = useQueryClient();
  const [aberto, setAberto] = React.useState(false);
  const [etapa, setEtapa] = React.useState<Etapa>(1);
  const [drag, setDrag] = React.useState(false);
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [lendo, setLendo] = React.useState(false);
  const [progresso, setProgresso] = React.useState<EtapaLeitura | null>(null);
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
    setEtapa(1); setArquivo(null); setLeitura(null); setAnalise(null); setProgresso(null);
    setCriarContato(true); setCategoria(""); setValor(0); setVenc(""); setResultado(null);
  };

  const ingerir = async (file: File) => {
    setArquivo(file); setEtapa(2); setLendo(true); setLeitura(null); setAnalise(null); setProgresso({ fase: "arquivo" });
    try {
      const res = await lerDocumento(file, ocrOn, setProgresso);
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
      setResultado(partes.length ? `Feito: ${partes.join(" · ")}. Já aparece no fluxo de caixa, no DRE e nos relatórios.` : "Feito. Já aparece no fluxo de caixa, no DRE e nos relatórios.");
      setEtapa(4);
    } finally {
      setGravando(false);
    }
  };

  /*
   * ⚠️ CAMP-B — "decidir depois". Um boleto lido no celular na hora do almoço
   * nem sempre tem categoria e conta decididas; forçar a confirmação agora
   * produz conta com categoria chutada, e recusar deixa o papel na mão. O
   * documento vai para a CAIXA DE ENTRADA de contas a pagar, com o contador à
   * vista, e vira conta pelo formulário de sempre quando alguém decidir.
   */
  const deixarNaCaixa = () => {
    if (!analise) return;
    const hoje = new Date();
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    estacionarOCR({
      refId: `ocr_${Date.now().toString(36)}`,
      fornecedor: analise.contraparte || analise.fields.beneficiario || "Fornecedor não identificado",
      documento: (analise.fields.cnpj || analise.fields.cpf || "").replace(/\D/g, "") || null,
      valor,
      vencimento: venc || null,
      emissao: analise.fields.data ?? null,
      numero: null,
      descricao: arquivo ? `Documento ${arquivo.name}` : "Documento lido no upload",
      categoria: categoria || null,
      recebidoEm: iso,
    });
    setResultado("Guardado na caixa de entrada de contas a pagar. Vira conta quando alguém decidir, em Títulos a pagar → Caixa de entrada.");
    setEtapa(4);
  };

  const confirmarLote = async (report: FDIPReport) => {
    setGravando(true);
    try {
      const res = await aplicarOnboarding(report);
      await qc.invalidateQueries();
      setResultado(`Feito: ${res.movimentos} lançamentos, ${res.clientes} clientes e ${res.fornecedores} fornecedores. Já aparecem no fluxo de caixa, no DRE e nos relatórios.`);
      setEtapa(4);
    } finally {
      setGravando(false);
    }
  };

  if (!aberto || typeof document === "undefined") return null;

  const fechar = () => { if (!gravando) setAberto(false); };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[90] p-4"
      role="dialog" aria-modal="true" aria-label="Ler documento"
      onClick={fechar}
    >
      <div
        className="a4p-entra w-full max-w-[640px] max-h-[90vh] bg-white rounded-card flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* a raiz do DS mora DENTRO do cartão: `.ds-visor` zera o fundo, e no
            cartão ele apagaria o branco da janela */}
        <div className="ds-visor flex flex-col flex-1 min-h-0">
        {/* cabeçalho + passos */}
        <div className="px-6 pt-5 pb-4 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-caption text-muted inline-flex items-center gap-2">
                <span className="w-[6px] h-[6px] rounded-pill bg-lime" aria-hidden />
                Leitura inteligente
              </span>
              <h2 className="m-0 text-h2 text-ink">{TITULOS[etapa]}</h2>
            </div>
            <button
              type="button" onClick={fechar} disabled={gravando}
              className="shrink-0 w-9 h-9 rounded-pill bg-surface-1 hover:bg-surface-2 inline-flex items-center justify-center"
              aria-label="Fechar"
            >
              <Icon name="x" size={16} color="currentColor" />
            </button>
          </div>
          {etapa < 4 && <Passos etapa={etapa} />}
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-4" tabIndex={0} role="region" aria-label={TITULOS[etapa]}>
          {/* ETAPA 1 — enviar */}
          {etapa === 1 && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
                role="button" tabIndex={0} aria-label="Escolher o documento"
                className={`rounded-card border border-dashed px-6 py-10 flex flex-col items-center gap-3 text-center cursor-pointer transition-colors ${drag ? "bg-lime-tint border-ink" : "bg-surface-1 border-border hover:bg-surface-2"}`}
              >
                <span className="w-12 h-12 rounded-pill bg-white inline-flex items-center justify-center">
                  <Icon name="upload" size={20} color="var(--color-ink)" />
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-label font-medium text-ink">Arraste o arquivo aqui ou clique para escolher</span>
                  <span className="text-caption text-muted">PNG, JPG, PDF, OFX ou CSV. Um arquivo por vez.</span>
                </div>
                <div className="flex flex-wrap justify-center gap-[6px] mt-1">
                  {LE.map((t) => (
                    <span key={t} className="text-caption text-ink bg-white rounded-pill px-3 py-[3px]">{t}</span>
                  ))}
                </div>
                <input ref={inputRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.pdf,.ofx,.csv,.txt,image/*" onChange={(e) => e.target.files?.[0] && ingerir(e.target.files[0])} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Dica icone="calendar" titulo="Agenda" texto="Conta a pagar entra pelo vencimento." />
                <Dica icone="check" titulo="Dá baixa" texto="Comprovante que casa com algo agendado baixa o título." />
                <Dica icone="users" titulo="Cadastra" texto="Beneficiário novo vira contato, se você quiser." />
              </div>

              <p className="m-0 text-caption text-muted inline-flex items-start gap-2">
                <Icon name="sparkles" size={14} color="currentColor" className="mt-[2px] shrink-0" />
                {ocrOn
                  ? "Leitura pela IA. Extrato e fatura escaneados são lidos página a página."
                  : "Leitura local, no seu navegador. Com a IA ligada no servidor, extratos escaneados também são lidos."}
              </p>
            </>
          )}

          {/* ETAPA 2 — leitura */}
          {etapa === 2 && (
            <>
              {lendo && <Lendo arquivo={arquivo} progresso={progresso} />}
              {!lendo && leitura?.kind === "erro" && (
                <div className="rounded-card bg-surface-1 px-6 py-10 flex flex-col items-center gap-2 text-center">
                  <Icon name="triangle-alert" size={20} color="var(--color-warning)" />
                  <span className="text-label font-medium text-ink">Não consegui ler este arquivo</span>
                  <span className="text-caption text-muted max-w-[48ch]">{leitura.motivo}</span>
                </div>
              )}
              {!lendo && leitura?.kind === "bulk" && <BulkResumo report={leitura.report} ia={leitura.ia} />}
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
            <div className="rounded-card bg-surface-1 px-6 py-10 flex flex-col items-center gap-3 text-center">
              <span className="w-12 h-12 rounded-pill bg-lime inline-flex items-center justify-center">
                <Icon name="check" size={22} color="var(--color-on-lime)" />
              </span>
              <span className="text-label font-medium text-ink">Dados inseridos no sistema</span>
              <span className="text-caption text-muted max-w-[48ch]">{resultado}</span>
            </div>
          )}
        </div>

        {/* rodapé */}
        <div className="px-6 py-4 flex items-center justify-between gap-3 bg-surface-1">
          {etapa === 1 && (
            <>
              <span className="text-caption text-muted">Nada é gravado antes de você confirmar.</span>
              <Button variant="primary" onClick={() => inputRef.current?.click()}>Escolher arquivo</Button>
            </>
          )}
          {etapa === 2 && (
            <>
              <Button variant="ghost" onClick={reset} disabled={lendo || gravando}>Trocar arquivo</Button>
              {!lendo && leitura?.kind === "doc" && analise ? (
                <Button variant="primary" onClick={() => setEtapa(3)}>Conferir os dados</Button>
              ) : !lendo && leitura?.kind === "bulk" ? (
                <Button variant="primary" onClick={() => confirmarLote(leitura.report)} disabled={gravando || !leitura.report.records.length}>
                  {gravando ? "Inserindo…" : `Inserir ${leitura.report.records.length} lançamentos`}
                </Button>
              ) : <span />}
            </>
          )}
          {etapa === 3 && (
            <>
              <Button variant="ghost" onClick={() => setEtapa(2)} disabled={gravando}>Voltar</Button>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {acao === "Vou pagar" && (
                  <Button variant="secondary" onClick={deixarNaCaixa} disabled={gravando || valor <= 0}>
                    Decidir depois
                  </Button>
                )}
                <Button variant="primary" onClick={confirmarDoc} disabled={gravando || valor <= 0}>
                  {gravando ? "Inserindo…" : "Confirmar e inserir"}
                </Button>
              </div>
            </>
          )}
          {etapa === 4 && (
            <>
              <Button variant="ghost" onClick={reset}>Enviar outro</Button>
              <Button variant="primary" onClick={() => setAberto(false)}>Fechar</Button>
            </>
          )}
        </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ───────────────────────── peças ───────────────────────── */

function Passos({ etapa }: { etapa: Etapa }) {
  const atual = Math.min(etapa, 3) - 1;
  return (
    <ol className="m-0 p-0 list-none grid grid-cols-3 gap-2" aria-label="Passos">
      {PASSOS.map((p, i) => (
        <li key={p} className="flex flex-col gap-2" aria-current={i === atual ? "step" : undefined}>
          <span className={`h-1 rounded-pill transition-colors ${i <= atual ? "bg-ink" : "bg-surface-2"}`} />
          <span className={`text-caption ${i === atual ? "text-ink font-medium" : "text-muted"}`}>{i + 1}. {p}</span>
        </li>
      ))}
    </ol>
  );
}

function Dica({ icone, titulo, texto }: { icone: "calendar" | "check" | "users"; titulo: string; texto: string }) {
  return (
    <div className="rounded-md bg-surface-1 p-4 flex flex-col gap-1">
      <span className="text-caption font-medium text-ink inline-flex items-center gap-2">
        <Icon name={icone} size={14} color="currentColor" /> {titulo}
      </span>
      <span className="text-caption text-muted">{texto}</span>
    </div>
  );
}

/** Enquanto lê: o arquivo e, no extrato escaneado, a página em que a IA está. */
function Lendo({ arquivo, progresso }: { arquivo: File | null; progresso: EtapaLeitura | null }) {
  const pagina = progresso?.fase === "pagina" ? progresso : null;
  const pct = pagina ? Math.round((pagina.pagina / Math.max(1, pagina.total)) * 100) : null;
  return (
    <div className="rounded-card bg-surface-1 px-6 py-10 flex flex-col items-center gap-4 text-center" aria-live="polite">
      <span className="w-12 h-12 rounded-pill bg-white inline-flex items-center justify-center">
        <Icon name="scan-line" size={20} color="var(--color-ink)" />
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-label font-medium text-ink">
          {pagina ? `Lendo a página ${pagina.pagina} de ${pagina.total}` : "Lendo o documento"}
        </span>
        <span className="text-caption text-muted truncate max-w-[40ch]">{arquivo?.name}</span>
      </div>
      <div className="w-full max-w-[320px] h-1 rounded-pill bg-white overflow-hidden">
        {pct == null
          ? <span className="block h-full w-full rounded-pill bg-ink opacity-40 animate-pulse" />
          : <span className="block h-full rounded-pill bg-ink transition-[width] duration-300" style={{ width: `${pct}%` }} />}
      </div>
      {pagina && (
        <span className="text-caption text-muted max-w-[44ch]">
          A IA transcreve cada página; a categoria sai das suas regras, do CNPJ e do código da loja (MCC).
        </span>
      )}
    </div>
  );
}

function LeituraInteligente({ a, modo }: { a: AnaliseDocumento; modo: "ia" | "local" }) {
  const conf = Math.round(a.confianca * 100);
  return (
    <div className="flex flex-col gap-4">
      {/* o número primeiro: é ele que a pessoa confere contra o papel */}
      <div className="rounded-card bg-surface-1 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="inline-flex items-center gap-2 rounded-pill bg-white px-3 py-[5px] text-caption font-medium text-ink">
            <span className="w-[6px] h-[6px] rounded-pill bg-lime" aria-hidden />
            {a.acaoFinal}
          </span>
          <span className="text-caption text-muted">
            {a.fields.tipo} · {modo === "ia" ? "lido pela IA" : "lido no navegador"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-caption text-muted">Valor</span>
          <span className="a4p-heroi text-h1 text-ink leading-none">
            {a.fields.valor ? <BRL value={a.fields.valor} /> : "—"}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
          <Campo label={a.pago ? "Data" : "Vencimento"} valor={dataCurta(a.fields.vencimento || a.fields.data)} />
          <Campo label="Beneficiário" valor={a.contraparte || "—"} />
          {a.fields.categoria && <Campo label="Categoria" valor={a.fields.categoria} />}
          {(a.fields.cnpj || a.fields.cpf) && <Campo label={a.fields.cnpj ? "CNPJ" : "CPF"} valor={documentoFormatado((a.fields.cnpj || a.fields.cpf)!)} />}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-caption text-muted shrink-0">Confiança da leitura</span>
          <span className="flex-1 h-1 rounded-pill bg-white overflow-hidden">
            <span className="block h-full rounded-pill bg-ink" style={{ width: `${conf}%` }} />
          </span>
          <span className="text-caption text-ink tabular-nums shrink-0">{conf}%</span>
        </div>
      </div>

      {/* o que foi conferido contra o sistema */}
      <div className="flex flex-col gap-2">
        <span className="text-caption font-medium text-muted">Conferido com o seu sistema</span>
        {a.crossCheck.length ? a.crossCheck.map((c, i) => (
          <span key={i} className="flex items-start gap-2 text-caption text-ink">
            <Icon name="check" size={14} color="var(--color-ink)" className="mt-[2px] shrink-0" />{c}
          </span>
        )) : <span className="text-caption text-muted">Nada no sistema casou com este documento. Confira os campos no próximo passo.</span>}
      </div>

      {a.sugerirCadastro && (
        <div className="rounded-md bg-surface-1 p-3 flex items-center gap-2">
          <Icon name="plus" size={15} color="currentColor" />
          <span className="text-caption text-muted flex-1"><b className="text-ink font-medium">{a.contraparte}</b> ainda não está em Contatos. Dá para cadastrar no próximo passo.</span>
        </div>
      )}

      {a.ideias.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-muted">Sugestões</span>
          {a.ideias.map((i, k) => (
            <span key={k} className="flex items-start gap-2 text-caption text-muted">
              <Icon name="sparkles" size={13} color="currentColor" className="mt-[2px] shrink-0" />{i}
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
  // a lista de categorias acompanha o lado: receita não se classifica como despesa
  const opcoes = (sel.tipoMov === "entrada" ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA) as readonly string[];
  const lista = categoria && !opcoes.includes(categoria) ? [categoria, ...opcoes] : opcoes;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-caption font-medium text-muted">
          O que é este documento {corrigido && <span className="text-ink">· você corrigiu a leitura</span>}
        </span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Ação">
          {(["Vou pagar", "Vou receber", "Paguei", "Recebi"] as AcaoFinal[]).map((op) => {
            const on = acao === op;
            const m = ACAO_MAP[op as Exclude<AcaoFinal, "Transferência">];
            return (
              <button
                key={op} type="button" role="radio" aria-checked={on}
                onClick={() => setAcao(op)}
                className={`rounded-md px-4 py-3 text-left transition-colors ${on ? "bg-ink text-white" : "bg-surface-1 text-ink hover:bg-surface-2"}`}
              >
                <span className="block text-label font-medium">{op}</span>
                <span className={`block text-caption ${on ? "opacity-80" : "text-muted"}`}>
                  {m?.pago ? "já aconteceu, entra baixado" : "vai acontecer, entra pendente"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CurrencyInput label="Valor" value={valor} onValueChange={setValor} />
        <DateField label={sel.pago ? "Data" : "Vencimento"} value={venc} onChange={setVenc} />
      </div>
      <Select
        label="Categoria"
        value={lista.includes(categoria) ? categoria : ""}
        onChange={setCategoria}
        options={[{ value: "", label: "Selecione…" }, ...lista.map((c) => ({ value: c, label: c }))]}
      />

      <div className="rounded-md bg-surface-1 p-4 flex flex-col gap-1">
        <span className="text-caption text-muted">{sel.tipoMov === "entrada" ? "Quem paga" : "Beneficiário"}</span>
        <span className="text-label font-medium text-ink">{a.contraparte || "—"}</span>
        {a.contato ? (
          <span className="inline-flex items-center gap-1 text-caption text-muted"><Icon name="check" size={12} color="currentColor" /> já cadastrado em Contatos</span>
        ) : a.sugerirCadastro ? (
          <label className="inline-flex items-center gap-2 cursor-pointer mt-1">
            <input type="checkbox" checked={criarContato} onChange={(e) => setCriarContato(e.target.checked)} className="accent-lime" />
            <span className="text-caption text-ink">Cadastrar como {sel.tipoMov === "entrada" ? "cliente" : "fornecedor"}</span>
          </label>
        ) : null}
      </div>

      {baixaValida && (
        <div className="rounded-md bg-surface-1 p-4 flex items-start gap-2">
          <Icon name="check" size={15} color="currentColor" className="mt-[2px]" />
          <span className="text-caption text-muted">Em vez de criar um lançamento novo, este comprovante <b className="text-ink font-medium">dá baixa</b> no que já estava agendado.</span>
        </div>
      )}
    </div>
  );
}

function BulkResumo({ report, ia }: { report: FDIPReport; ia?: LeituraIA }) {
  const { plano, confidence: cc } = report;
  const entradas = report.records.filter((r) => r.tipo === "entrada").reduce((s, r) => s + r.valor, 0);
  const saidas = report.records.filter((r) => r.tipo === "saida").reduce((s, r) => s + r.valor, 0);
  const datas = report.records.map((r) => r.data).filter(Boolean).sort();
  const comMcc = report.records.filter((r) => r.mcc).length;
  const foraDoTeto = ia ? ia.paginas - ia.lidas : 0;
  const nome = ia?.tipo === "fatura" ? "Fatura lida" : "Extrato lido";
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card bg-surface-1 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="inline-flex items-center gap-2 rounded-pill bg-white px-3 py-[5px] text-caption font-medium text-ink">
            <span className="w-[6px] h-[6px] rounded-pill bg-lime" aria-hidden />
            {nome}
          </span>
          <span className="text-caption text-muted">
            {datas.length ? `${dataCurta(datas[0])} a ${dataCurta(datas[datas.length - 1])}` : "sem datas"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-caption text-muted">Lançamentos</span>
          <span className="a4p-heroi text-h1 text-ink leading-none tabular-nums">{cc.lidos}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Campo label="Entradas" valor={<BRL value={entradas} />} />
          <Campo label="Saídas" valor={<BRL value={saidas} />} />
        </div>
      </div>

      {ia && (
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-muted">Como a IA leu</span>
          <span className="flex items-start gap-2 text-caption text-ink">
            <Icon name="check" size={14} color="currentColor" className="mt-[2px] shrink-0" />
            {ia.lidas - ia.falhas.length} de {ia.paginas} {ia.paginas === 1 ? "página lida" : "páginas lidas"}
          </span>
          {comMcc > 0 && (
            <span className="flex items-start gap-2 text-caption text-ink">
              <Icon name="check" size={14} color="currentColor" className="mt-[2px] shrink-0" />
              {comMcc} {comMcc === 1 ? "compra categorizada" : "compras categorizadas"} pelo código da loja (MCC)
            </span>
          )}
          {ia.recusadas > 0 && (
            <span className="flex items-start gap-2 text-caption text-muted">
              <Icon name="minus" size={14} color="currentColor" className="mt-[2px] shrink-0" />
              {ia.recusadas} {ia.recusadas === 1 ? "linha ficou" : "linhas ficaram"} de fora: saldo, total ou ilegível
            </span>
          )}
          {(ia.falhas.length > 0 || foraDoTeto > 0) && (
            <span className="flex items-start gap-2 text-caption text-ink rounded-md bg-surface-1 p-3">
              <Icon name="triangle-alert" size={14} color="var(--color-warning)" className="mt-[2px] shrink-0" />
              <span>
                {ia.falhas.length > 0 && <>Não consegui ler {ia.falhas.length === 1 ? "a página" : "as páginas"} {ia.falhas.join(", ")}. </>}
                {foraDoTeto > 0 && <>O arquivo tem {ia.paginas} páginas e eu leio até {ia.lidas} por vez. </>}
                Confira o total com o banco antes de inserir, ou envie as páginas que faltam em outro arquivo.
              </span>
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini n={plano.clientes} label="clientes" />
        <Mini n={plano.fornecedores} label="fornecedores" />
        <Mini n={plano.categorias.length} label="categorias" />
        <Mini n={plano.centrosCusto.length} label="centros de custo" />
      </div>
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[2px] min-w-0">
      <span className="text-caption text-muted">{label}</span>
      <span className="text-label font-medium text-ink truncate">{valor}</span>
    </div>
  );
}

function Mini({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-md bg-surface-1 p-3 flex flex-col gap-1">
      <span className="text-h3 text-ink tabular-nums leading-none">{n}</span>
      <span className="text-caption text-muted">{label}</span>
    </div>
  );
}
